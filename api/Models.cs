namespace NflTracker.Api;

public class Team
{
    public int Id { get; set; }
    public string Abbreviation { get; set; } = "";
    public string Location { get; set; } = "";
    public string Name { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string Color { get; set; } = "333333";
    public string LogoUrl { get; set; } = "";
    public string Conference { get; set; } = "";
    public string Division { get; set; } = "";
}

public enum GameStatus { Scheduled = 0, InProgress = 1, Final = 2 }

public class Game
{
    public int Id { get; set; }
    public int Season { get; set; }
    /// <summary>2 = regular season, 3 = postseason.</summary>
    public int SeasonType { get; set; }
    public int Week { get; set; }
    /// <summary>Round name for postseason games, e.g. "Wild Card Playoffs".</summary>
    public string? Label { get; set; }
    public DateTime KickoffUtc { get; set; }
    public string? Venue { get; set; }
    public int? HomeTeamId { get; set; }
    public int? AwayTeamId { get; set; }
    public int HomeScore { get; set; }
    public int AwayScore { get; set; }
    public GameStatus Status { get; set; }
    public bool Overtime { get; set; }
    /// <summary>Set when the user edits a game, so a re-import never overwrites it.</summary>
    public bool ManuallyEdited { get; set; }
}
