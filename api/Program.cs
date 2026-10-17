using Microsoft.EntityFrameworkCore;
using NflTracker.Api;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDb>(o =>
    o.UseSqlite(builder.Configuration.GetConnectionString("Default") ?? "Data Source=nfl.db"));
builder.Services.AddHttpClient<EspnImporter>(c => c.Timeout = TimeSpan.FromSeconds(30));
builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins("http://localhost:5173").AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
app.UseCors();

const int Season = 2026;

// Create the database and pull the full season the first time the app runs.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    db.Database.EnsureCreated();
    if (!db.Games.Any())
    {
        try { await scope.ServiceProvider.GetRequiredService<EspnImporter>().ImportAsync(Season); }
        catch (Exception ex) { app.Logger.LogError(ex, "Initial ESPN import failed; use POST /api/import to retry"); }
    }
}

app.MapGet("/api/teams", (AppDb db) => db.Teams.OrderBy(t => t.DisplayName).ToListAsync());

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

app.MapPost("/api/import", async (EspnImporter importer, int season = Season) => await importer.ImportAsync(season)).RequireAdmin();

app.Run();

record GameUpdate(int HomeScore, int AwayScore, GameStatus Status, bool Overtime, int? HomeTeamId, int? AwayTeamId);

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
