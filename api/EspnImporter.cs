using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace NflTracker.Api;

public class EspnImporter(AppDb db, HttpClient http, ILogger<EspnImporter> log)
{
    private const string Base = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

    // Regular season = 18 weeks; postseason = Wild Card, Divisional, Conference, Super Bowl.
    private static readonly (int SeasonType, int Weeks)[] Segments = [(2, 18), (3, 4)];

    public record Result(int Teams, int Added, int Updated);

    public async Task<Result> ImportAsync(int season, CancellationToken ct = default)
    {
        var teams = await ImportTeamsAsync(ct);
        int added = 0, updated = 0;

        foreach (var (seasonType, weeks) in Segments)
        {
            for (var week = 1; week <= weeks; week++)
            {
                var url = $"{Base}/scoreboard?dates={season}&seasontype={seasonType}&week={week}";
                using var doc = await FetchAsync(url, ct);
                foreach (var ev in doc.RootElement.GetProperty("events").EnumerateArray())
                {
                    var (isNew, changed) = await UpsertGameAsync(ev, season, seasonType, week, ct);
                    if (isNew) added++;
                    else if (changed) updated++;
                }
                await db.SaveChangesAsync(ct);
            }
        }

        await BetLogic.SyncAllAsync(db, ct); // ESPN may have marked games with open bets final

        log.LogInformation("ESPN import {Season}: {Teams} teams, {Added} added, {Updated} updated", season, teams, added, updated);
        return new Result(teams, added, updated);
    }

    /// <summary>Updates only the betting lines on games we already have; never touches scores or status.</summary>
    public async Task<int> RefreshOddsAsync(int season, CancellationToken ct = default)
    {
        var count = 0;
        foreach (var (seasonType, weeks) in Segments)
        {
            for (var week = 1; week <= weeks; week++)
            {
                using var doc = await FetchAsync($"{Base}/scoreboard?dates={season}&seasontype={seasonType}&week={week}", ct);
                foreach (var ev in doc.RootElement.GetProperty("events").EnumerateArray())
                {
                    var game = await db.Games.FindAsync([int.Parse(ev.GetProperty("id").GetString()!)], ct);
                    if (game is null) continue;
                    ApplyOdds(game, ev.GetProperty("competitions")[0]);
                    count++;
                }
                await db.SaveChangesAsync(ct);
            }
        }
        return count;
    }

    private async Task<int> ImportTeamsAsync(CancellationToken ct)
    {
        using var doc = await FetchAsync($"{Base}/teams", ct);
        var list = doc.RootElement.GetProperty("sports")[0].GetProperty("leagues")[0].GetProperty("teams");
        var existing = await db.Teams.ToDictionaryAsync(t => t.Id, ct);
        var count = 0;
        foreach (var item in list.EnumerateArray())
        {
            var t = item.GetProperty("team");
            var id = int.Parse(t.GetProperty("id").GetString()!);
            if (!existing.TryGetValue(id, out var team))
            {
                team = new Team { Id = id };
                db.Teams.Add(team);
            }
            team.Abbreviation = t.GetProperty("abbreviation").GetString() ?? "";
            team.Location = t.GetProperty("location").GetString() ?? "";
            team.Name = t.GetProperty("name").GetString() ?? "";
            team.DisplayName = t.GetProperty("displayName").GetString() ?? "";
            team.Color = t.TryGetProperty("color", out var c) ? c.GetString() ?? "333333" : "333333";
            team.LogoUrl = t.TryGetProperty("logos", out var logos) && logos.GetArrayLength() > 0
                ? logos[0].GetProperty("href").GetString() ?? "" : "";
            (team.Conference, team.Division) = Divisions.For(team.Abbreviation);
            count++;
        }
        await db.SaveChangesAsync(ct);
        return count;
    }

    private async Task<(bool IsNew, bool Changed)> UpsertGameAsync(JsonElement ev, int season, int seasonType, int week, CancellationToken ct)
    {
        var id = int.Parse(ev.GetProperty("id").GetString()!);
        var game = await db.Games.FindAsync([id], ct);
        var isNew = game is null;
        if (game is null)
        {
            game = new Game { Id = id, Season = season, SeasonType = seasonType, Week = week };
            db.Games.Add(game);
        }

        var comp = ev.GetProperty("competitions")[0];
        var before = (game.KickoffUtc, game.Venue, game.Label, game.HomeTeamId, game.AwayTeamId, game.HomeScore, game.AwayScore, game.Status);

        game.KickoffUtc = DateTime.Parse(ev.GetProperty("date").GetString()!, CultureInfo.InvariantCulture,
            DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal);
        game.Venue = comp.TryGetProperty("venue", out var v) && v.TryGetProperty("fullName", out var vn) ? vn.GetString() : game.Venue;
        if (seasonType == 3 && comp.TryGetProperty("notes", out var notes) && notes.GetArrayLength() > 0)
            game.Label = notes[0].GetProperty("headline").GetString();

        var status = ev.GetProperty("status");
        var espnStatus = status.GetProperty("type").GetProperty("name").GetString() switch
        {
            "STATUS_FINAL" => GameStatus.Final,
            "STATUS_SCHEDULED" or "STATUS_POSTPONED" => GameStatus.Scheduled,
            _ => GameStatus.InProgress,
        };

        int? home = null, away = null;
        int homeScore = 0, awayScore = 0;
        foreach (var c in comp.GetProperty("competitors").EnumerateArray())
        {
            var teamId = int.Parse(c.GetProperty("team").GetProperty("id").GetString()!);
            var score = int.TryParse(c.TryGetProperty("score", out var s) ? s.GetString() : null, out var sc) ? sc : 0;
            if (c.GetProperty("homeAway").GetString() == "home") { home = teamId > 0 ? teamId : null; homeScore = score; }
            else { away = teamId > 0 ? teamId : null; awayScore = score; }
        }

        // ESPN publishes "TBD" for playoff slots until they're decided; keep whatever we already have.
        if (home is not null) game.HomeTeamId = home;
        if (away is not null) game.AwayTeamId = away;

        if (!game.ManuallyEdited)
        {
            game.HomeScore = homeScore;
            game.AwayScore = awayScore;
            game.Status = espnStatus;
            game.Overtime = status.TryGetProperty("period", out var p) && p.GetInt32() > 4;
        }

        ApplyOdds(game, comp);

        var after = (game.KickoffUtc, game.Venue, game.Label, game.HomeTeamId, game.AwayTeamId, game.HomeScore, game.AwayScore, game.Status);
        return (isNew, !before.Equals(after));
    }

    /// <summary>
    /// Copies the first bookmaker's lines onto the game. If ESPN has no odds (not posted yet, or dropped
    /// once the game starts), the lines we already have are left alone.
    /// </summary>
    private static void ApplyOdds(Game game, JsonElement comp)
    {
        if (!comp.TryGetProperty("odds", out var oddsList) || oddsList.ValueKind != JsonValueKind.Array || oddsList.GetArrayLength() == 0)
            return;
        var o = oddsList[0];

        var homeMl = ParseOdds(Dig(o, "moneyline", "home", "close", "odds"));
        var awayMl = ParseOdds(Dig(o, "moneyline", "away", "close", "odds"));
        var homeSpread = ParseLine(Dig(o, "pointSpread", "home", "close", "line"))
                         ?? (o.TryGetProperty("spread", out var sp) && sp.ValueKind == JsonValueKind.Number ? sp.GetDouble() : null);
        var total = ParseLine(Dig(o, "total", "over", "close", "line"))
                    ?? (o.TryGetProperty("overUnder", out var ou) && ou.ValueKind == JsonValueKind.Number ? ou.GetDouble() : null);
        if (homeMl is null && awayMl is null && homeSpread is null && total is null) return;

        game.OddsProvider = o.TryGetProperty("provider", out var p) && p.TryGetProperty("displayName", out var pn) ? pn.GetString() : null;
        game.HomeMoneyline = homeMl;
        game.AwayMoneyline = awayMl;
        game.HomeSpread = homeSpread;
        game.HomeSpreadOdds = homeSpread is null ? null : ParseOdds(Dig(o, "pointSpread", "home", "close", "odds")) ?? -110;
        game.AwaySpreadOdds = homeSpread is null ? null : ParseOdds(Dig(o, "pointSpread", "away", "close", "odds")) ?? -110;
        game.Total = total;
        game.OverOdds = total is null ? null : ParseOdds(Dig(o, "total", "over", "close", "odds")) ?? -110;
        game.UnderOdds = total is null ? null : ParseOdds(Dig(o, "total", "under", "close", "odds")) ?? -110;
    }

    private static string? Dig(JsonElement e, params string[] path)
    {
        foreach (var key in path)
            if (e.ValueKind != JsonValueKind.Object || !e.TryGetProperty(key, out e)) return null;
        return e.ValueKind == JsonValueKind.String ? e.GetString() : e.ValueKind == JsonValueKind.Number ? e.GetRawText() : null;
    }

    /// <summary>"-148", "+124", or "EVEN" to an American odds number.</summary>
    private static int? ParseOdds(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        if (s.Equals("EVEN", StringComparison.OrdinalIgnoreCase)) return 100;
        return int.TryParse(s.Replace("+", ""), NumberStyles.Integer, CultureInfo.InvariantCulture, out var n) ? n : null;
    }

    /// <summary>"-2.5", "+2.5", "o42.5" or "u42.5" to a number.</summary>
    private static double? ParseLine(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        s = s.Trim().TrimStart('o', 'O', 'u', 'U').Replace("+", "");
        return double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var n) ? n : null;
    }

    private async Task<JsonDocument> FetchAsync(string url, CancellationToken ct)
    {
        await using var stream = await http.GetStreamAsync(url, ct);
        return await JsonDocument.ParseAsync(stream, cancellationToken: ct);
    }
}
