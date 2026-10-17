using Microsoft.EntityFrameworkCore;

namespace NflTracker.Api;

public record GameRef(
    int SeasonType, int Week, int OpponentId, string OpponentAbbr, bool Home, GameStatus Status,
    int OwnScore, int OppScore, bool Overtime, DateTime KickoffUtc,
    double? Spread, int? SpreadOdds, double? Total);

public record TeamSummary(
    int TeamId, int Wins, int Losses, int Ties, int PointsFor, int PointsAgainst,
    string HomeRecord, string AwayRecord, string DivisionRecord, int DivisionRank, int GamesPlayed,
    string Streak, GameRef? Last, GameRef? Next);

/// <summary>Everything the hover card and record labels need, for all 32 teams in one pass.</summary>
public static class TeamSummaries
{
    private class Tally
    {
        public int W, L, T, PF, PA;
        public int HW, HL, HT, AW, AL, AT, DW, DL, DT;
        public double Pct => W + L + T == 0 ? 0 : (W + T * 0.5) / (W + L + T);
    }

    public static async Task<List<TeamSummary>> BuildAsync(AppDb db, int season)
    {
        var teams = await db.Teams.ToDictionaryAsync(t => t.Id);
        var games = await db.Games
            .Where(g => g.Season == season && g.HomeTeamId != null && g.AwayTeamId != null)
            .OrderBy(g => g.SeasonType).ThenBy(g => g.Week).ThenBy(g => g.KickoffUtc).ThenBy(g => g.Id)
            .ToListAsync();

        var tally = teams.Keys.ToDictionary(id => id, _ => new Tally());
        var byTeam = teams.Keys.ToDictionary(id => id, _ => new List<Game>());

        foreach (var g in games)
        {
            byTeam[g.HomeTeamId!.Value].Add(g);
            byTeam[g.AwayTeamId!.Value].Add(g);
            if (g.SeasonType != 2 || g.Status != GameStatus.Final) continue; // records are regular season only

            var h = tally[g.HomeTeamId.Value];
            var a = tally[g.AwayTeamId.Value];
            var sameDivision = teams[g.HomeTeamId.Value].Division == teams[g.AwayTeamId.Value].Division;
            h.PF += g.HomeScore; h.PA += g.AwayScore;
            a.PF += g.AwayScore; a.PA += g.HomeScore;
            if (g.HomeScore > g.AwayScore) { h.W++; h.HW++; a.L++; a.AL++; if (sameDivision) { h.DW++; a.DL++; } }
            else if (g.AwayScore > g.HomeScore) { a.W++; a.AW++; h.L++; h.HL++; if (sameDivision) { a.DW++; h.DL++; } }
            else { h.T++; h.HT++; a.T++; a.AT++; if (sameDivision) { h.DT++; a.DT++; } }
        }

        string Rec(int w, int l, int t) => t > 0 ? $"{w}-{l}-{t}" : $"{w}-{l}";

        var rank = teams.Values.GroupBy(t => t.Division)
            .SelectMany(grp => grp
                .OrderByDescending(t => tally[t.Id].Pct)
                .ThenByDescending(t => tally[t.Id].PF - tally[t.Id].PA)
                .ThenBy(t => t.DisplayName)
                .Select((t, i) => (t.Id, Rank: i + 1)))
            .ToDictionary(x => x.Id, x => x.Rank);

        var result = new List<TeamSummary>();
        foreach (var (id, t) in tally)
        {
            var mine = byTeam[id];
            var finals = mine.Where(g => g.Status == GameStatus.Final).ToList();
            var last = finals.LastOrDefault();
            var next = mine.FirstOrDefault(g => g.Status != GameStatus.Final);

            GameRef? Ref(Game? g)
            {
                if (g is null) return null;
                var home = g.HomeTeamId == id;
                var oppId = (home ? g.AwayTeamId : g.HomeTeamId)!.Value;
                return new GameRef(
                    g.SeasonType, g.Week, oppId, teams[oppId].Abbreviation, home, g.Status,
                    home ? g.HomeScore : g.AwayScore, home ? g.AwayScore : g.HomeScore, g.Overtime, g.KickoffUtc,
                    g.HomeSpread is null ? null : home ? g.HomeSpread : -g.HomeSpread,
                    home ? g.HomeSpreadOdds : g.AwaySpreadOdds, g.Total);
            }

            result.Add(new TeamSummary(
                id, t.W, t.L, t.T, t.PF, t.PA,
                Rec(t.HW, t.HL, t.HT), Rec(t.AW, t.AL, t.AT), Rec(t.DW, t.DL, t.DT),
                rank[id], t.W + t.L + t.T, Streak(finals, id), Ref(last), Ref(next)));
        }
        return result;
    }

    /// <summary>"W3" or "L1" from the most recent finished games; empty before any game is played.</summary>
    private static string Streak(List<Game> finals, int teamId)
    {
        char kind = ' ';
        var count = 0;
        for (var i = finals.Count - 1; i >= 0; i--)
        {
            var g = finals[i];
            var home = g.HomeTeamId == teamId;
            var own = home ? g.HomeScore : g.AwayScore;
            var opp = home ? g.AwayScore : g.HomeScore;
            var r = own > opp ? 'W' : own < opp ? 'L' : 'T';
            if (kind == ' ') kind = r;
            if (r != kind) break;
            count++;
        }
        return count == 0 ? "" : $"{kind}{count}";
    }
}
