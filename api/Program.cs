using Microsoft.EntityFrameworkCore;
using NflTracker.Api;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDb>(o =>
    o.UseSqlite(builder.Configuration.GetConnectionString("Default") ?? "Data Source=nfl.db"));
builder.Services.AddHttpClient<EspnImporter>(c => c.Timeout = TimeSpan.FromSeconds(30));
builder.Services.AddHostedService<OddsRefresher>();
builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins("http://localhost:5173").AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
app.UseCors();

const int Season = AppConfig.Season;

// Create/upgrade the database and pull the full season the first time the app runs.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    SchemaUpgrade.Apply(db);
    if (!db.Games.Any())
    {
        try { await scope.ServiceProvider.GetRequiredService<EspnImporter>().ImportAsync(Season); }
        catch (Exception ex) { app.Logger.LogError(ex, "Initial ESPN import failed; use POST /api/import to retry"); }
    }
}

app.MapGet("/api/teams", (AppDb db) => db.Teams.OrderBy(t => t.DisplayName).ToListAsync());

app.MapGet("/api/teams/summary", (AppDb db, int season = Season) => TeamSummaries.BuildAsync(db, season));

app.MapGet("/api/teams/{id:int}/schedule", async (AppDb db, int id, int season = Season) =>
{
    var team = await db.Teams.FindAsync(id);
    if (team is null) return Results.NotFound();

    var games = await db.Games
        .Where(g => g.Season == season && (g.HomeTeamId == id || g.AwayTeamId == id))
        .OrderBy(g => g.SeasonType).ThenBy(g => g.Week).ThenBy(g => g.KickoffUtc)
        .ToListAsync();

    int wins = 0, losses = 0, ties = 0, pf = 0, pa = 0;
    foreach (var g in games.Where(g => g.SeasonType == 2 && g.Status == GameStatus.Final))
    {
        var mine = g.HomeTeamId == id ? g.HomeScore : g.AwayScore;
        var theirs = g.HomeTeamId == id ? g.AwayScore : g.HomeScore;
        pf += mine; pa += theirs;
        if (mine > theirs) wins++; else if (mine < theirs) losses++; else ties++;
    }

    var played = games.Where(g => g.SeasonType == 2).Select(g => g.Week).ToHashSet();
    var byeWeeks = Enumerable.Range(1, 18).Where(w => !played.Contains(w)).ToList();

    return Results.Ok(new { team, record = new { wins, losses, ties, pointsFor = pf, pointsAgainst = pa }, games, byeWeeks });
});

app.MapGet("/api/weeks", async (AppDb db, int season = Season) =>
    await db.Games.Where(g => g.Season == season)
        .GroupBy(g => new { g.SeasonType, g.Week })
        .Select(grp => new
        {
            grp.Key.SeasonType,
            grp.Key.Week,
            Label = grp.Max(g => g.Label),
            Total = grp.Count(),
            Final = grp.Count(g => g.Status == GameStatus.Final),
        })
        .OrderBy(w => w.SeasonType).ThenBy(w => w.Week)
        .ToListAsync());

app.MapGet("/api/games", async (AppDb db, int season = Season, int seasonType = 2, int week = 1) =>
    await db.Games.Where(g => g.Season == season && g.SeasonType == seasonType && g.Week == week)
        .OrderBy(g => g.KickoffUtc).ThenBy(g => g.Id).ToListAsync());

app.MapGet("/api/postseason", async (AppDb db, int season = Season) =>
    await db.Games.Where(g => g.Season == season && g.SeasonType == 3)
        .OrderBy(g => g.Week).ThenBy(g => g.KickoffUtc).ThenBy(g => g.Id).ToListAsync());

app.MapGet("/api/games/lookup", async (AppDb db, string ids) =>
{
    var wanted = ids.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .Select(s => int.TryParse(s, out var n) ? n : (int?)null)
        .Where(n => n is not null).Select(n => n!.Value).Take(200).ToList();
    return await db.Games.Where(g => wanted.Contains(g.Id)).ToListAsync();
});

app.MapPut("/api/games/{id:int}", async (AppDb db, int id, GameUpdate u) =>
{
    var g = await db.Games.FindAsync(id);
    if (g is null) return Results.NotFound();
    if (u.HomeScore < 0 || u.AwayScore < 0) return Results.BadRequest("Scores can't be negative.");

    var homeTeam = u.HomeTeamId ?? g.HomeTeamId;
    var awayTeam = u.AwayTeamId ?? g.AwayTeamId;
    if (u.Status != GameStatus.Scheduled && (homeTeam is null || awayTeam is null))
        return Results.BadRequest("Pick both teams before entering a score.");
    if (homeTeam is not null && homeTeam == awayTeam)
        return Results.BadRequest("A team can't play itself.");
    if (u.Status == GameStatus.Final && u.HomeScore == u.AwayScore && g.SeasonType == 3)
        return Results.BadRequest("Playoff games can't end in a tie.");

    g.HomeTeamId = homeTeam;
    g.AwayTeamId = awayTeam;
    g.HomeScore = u.HomeScore;
    g.AwayScore = u.AwayScore;
    g.Status = u.Status;
    g.Overtime = u.Overtime;
    g.ManuallyEdited = true;
    await db.SaveChangesAsync();
    await BetLogic.SyncGameAsync(db, g); // settle (or re-open) any bets on this game
    return Results.Ok(g);
}).RequireAdmin();

// The UI calls this to check a password before unlocking editing.
app.MapPost("/api/login", () => Results.NoContent()).RequireAdmin();

app.MapGet("/api/standings", async (AppDb db, int season = Season) =>
{
    var teams = await db.Teams.ToListAsync();
    var games = await db.Games
        .Where(g => g.Season == season && g.SeasonType == 2 && g.Status == GameStatus.Final
                    && g.HomeTeamId != null && g.AwayTeamId != null)
        .ToListAsync();

    var rows = teams.ToDictionary(t => t.Id, t => new StandingRow(t.Id, t.Abbreviation, t.DisplayName, t.LogoUrl, t.Conference, t.Division));
    foreach (var g in games)
    {
        var h = rows[g.HomeTeamId!.Value];
        var a = rows[g.AwayTeamId!.Value];
        h.PointsFor += g.HomeScore; h.PointsAgainst += g.AwayScore;
        a.PointsFor += g.AwayScore; a.PointsAgainst += g.HomeScore;
        if (g.HomeScore > g.AwayScore) { h.Wins++; a.Losses++; }
        else if (g.AwayScore > g.HomeScore) { a.Wins++; h.Losses++; }
        else { h.Ties++; a.Ties++; }
    }

    return rows.Values
        .GroupBy(r => r.Division)
        .OrderBy(grp => grp.Key)
        .Select(grp => new
        {
            Division = grp.Key,
            Teams = grp.OrderByDescending(r => r.WinPct).ThenByDescending(r => r.PointsFor - r.PointsAgainst).ThenBy(r => r.Name),
        });
});

// ── Simulated betting (play money) ────────────────────────────────────────────

app.MapGet("/api/bankroll", (AppDb db) => BetLogic.SummaryAsync(db));

app.MapGet("/api/bets", async (AppDb db) =>
    await db.Bets.OrderByDescending(b => b.PlacedUtc).ThenByDescending(b => b.Id).ToListAsync());

app.MapPost("/api/bets", async (AppDb db, PlaceBet req) =>
{
    var game = await db.Games.FindAsync(req.GameId);
    if (game is null) return Results.NotFound("Game not found.");
    if (game.Status != GameStatus.Scheduled || game.HomeTeamId is null || game.AwayTeamId is null)
        return Results.BadRequest("Bets can only be placed on scheduled games with both teams set.");
    if (!BetLogic.SideMatchesType(req.Type, req.Side))
        return Results.BadRequest("That pick doesn't match the bet type.");

    // The server uses the game's current line, never numbers sent by the browser.
    var offer = BetLogic.OfferFor(game, req.Type, req.Side);
    if (!offer.Available(req.Type))
        return Results.BadRequest("That line isn't available for this game.");
    if (req.StakeCents < 100)
        return Results.BadRequest("Minimum bet is $1.");

    var bankroll = await BetLogic.SummaryAsync(db);
    if (req.StakeCents > bankroll.BalanceCents)
        return Results.BadRequest("Not enough bankroll for that bet.");

    var bet = new Bet
    {
        GameId = game.Id,
        PlacedUtc = DateTime.UtcNow,
        Type = req.Type,
        Side = req.Side,
        Line = offer.Line,
        AmericanOdds = offer.Odds!.Value,
        StakeCents = req.StakeCents,
        Status = BetStatus.Pending,
    };
    db.Bets.Add(bet);
    await db.SaveChangesAsync();
    return Results.Ok(bet);
}).RequireAdmin();

app.MapDelete("/api/bets/{id:int}", async (AppDb db, int id) =>
{
    var bet = await db.Bets.FindAsync(id);
    if (bet is null) return Results.NotFound();
    if (bet.Status != BetStatus.Pending) return Results.BadRequest("Settled bets can't be cancelled.");
    db.Bets.Remove(bet);
    await db.SaveChangesAsync();
    return Results.NoContent();
}).RequireAdmin();

app.MapPost("/api/bets/reset", async (AppDb db) =>
{
    await db.Bets.ExecuteDeleteAsync();
    return Results.NoContent();
}).RequireAdmin();

app.MapPost("/api/import", async (EspnImporter importer, int season = Season) => await importer.ImportAsync(season)).RequireAdmin();

app.Run();

record GameUpdate(int HomeScore, int AwayScore, GameStatus Status, bool Overtime, int? HomeTeamId, int? AwayTeamId);

record PlaceBet(int GameId, BetType Type, BetSide Side, int StakeCents);

class StandingRow(int teamId, string abbreviation, string name, string logoUrl, string conference, string division)
{
    public int TeamId { get; } = teamId;
    public string Abbreviation { get; } = abbreviation;
    public string Name { get; } = name;
    public string LogoUrl { get; } = logoUrl;
    public string Conference { get; } = conference;
    public string Division { get; } = division;
    public int Wins { get; set; }
    public int Losses { get; set; }
    public int Ties { get; set; }
    public int PointsFor { get; set; }
    public int PointsAgainst { get; set; }
    public double WinPct => Wins + Losses + Ties == 0 ? 0 : (Wins + Ties * 0.5) / (Wins + Losses + Ties);
}
