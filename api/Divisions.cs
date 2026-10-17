namespace NflTracker.Api;

public static class Divisions
{
    private static readonly Dictionary<string, string[]> Map = new()
    {
        ["AFC East"] = ["BUF", "MIA", "NE", "NYJ"],
        ["AFC North"] = ["BAL", "CIN", "CLE", "PIT"],
        ["AFC South"] = ["HOU", "IND", "JAX", "TEN"],
        ["AFC West"] = ["DEN", "KC", "LV", "LAC"],
        ["NFC East"] = ["DAL", "NYG", "PHI", "WSH"],
        ["NFC North"] = ["CHI", "DET", "GB", "MIN"],
        ["NFC South"] = ["ATL", "CAR", "NO", "TB"],
        ["NFC West"] = ["ARI", "LAR", "SF", "SEA"],
    };

    public static (string Conference, string Division) For(string abbreviation)
    {
        foreach (var (division, teams) in Map)
            if (teams.Contains(abbreviation))
                return (division[..3], division);
        return ("", "");
    }
}
