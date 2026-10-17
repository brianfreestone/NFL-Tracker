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

    // Betting lines from ESPN (DraftKings). All null until a book posts them; kept once the game starts.
    public string? OddsProvider { get; set; }
    /// <summary>Spread from the home team's side, e.g. -2.5 means home favored by 2.5.</summary>
    public double? HomeSpread { get; set; }
    public int? HomeSpreadOdds { get; set; }
    public int? AwaySpreadOdds { get; set; }
    public double? Total { get; set; }
    public int? OverOdds { get; set; }
    public int? UnderOdds { get; set; }
    public int? HomeMoneyline { get; set; }
    public int? AwayMoneyline { get; set; }
}

public enum BetType { Moneyline = 0, Spread = 1, Total = 2 }
public enum BetSide { Home = 0, Away = 1, Over = 2, Under = 3 }
public enum BetStatus { Pending = 0, Won = 1, Lost = 2, Push = 3 }

/// <summary>A simulated (play money) bet. Line and odds are locked in when the bet is placed.</summary>
public class Bet
{
    public int Id { get; set; }
    public int GameId { get; set; }
    public DateTime PlacedUtc { get; set; }
    public BetType Type { get; set; }
    public BetSide Side { get; set; }
    /// <summary>The picked side's spread, or the game total. Null for moneyline.</summary>
    public double? Line { get; set; }
    public int AmericanOdds { get; set; }
    public int StakeCents { get; set; }
    public BetStatus Status { get; set; }
    /// <summary>Profit (+) or loss (-) once settled; 0 while pending or on a push.</summary>
    public int NetCents { get; set; }
}
