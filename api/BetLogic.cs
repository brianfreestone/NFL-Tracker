using Microsoft.EntityFrameworkCore;

namespace NflTracker.Api;

public static class BetLogic
{
    public const int StartingBankrollCents = 100_000; // $1,000 of play money

    public record Offer(double? Line, int? Odds)
    {
        public bool Available(BetType type) => Odds is not null && (type == BetType.Moneyline || Line is not null);
    }

    /// <summary>The line and odds a game currently offers for a given pick.</summary>
    public static Offer OfferFor(Game g, BetType type, BetSide side) => (type, side) switch
    {
        (BetType.Moneyline, BetSide.Home) => new Offer(null, g.HomeMoneyline),
        (BetType.Moneyline, BetSide.Away) => new Offer(null, g.AwayMoneyline),
        (BetType.Spread, BetSide.Home) => new Offer(g.HomeSpread, g.HomeSpreadOdds),
        (BetType.Spread, BetSide.Away) => new Offer(g.HomeSpread is null ? null : -g.HomeSpread, g.AwaySpreadOdds),
        (BetType.Total, BetSide.Over) => new Offer(g.Total, g.OverOdds),
        (BetType.Total, BetSide.Under) => new Offer(g.Total, g.UnderOdds),
        _ => new Offer(null, null),
    };

    public static bool SideMatchesType(BetType type, BetSide side) => type == BetType.Total
        ? side is BetSide.Over or BetSide.Under
        : side is BetSide.Home or BetSide.Away;

    public static int ProfitCents(int stakeCents, int americanOdds) =>
        (int)Math.Round(stakeCents * (americanOdds > 0 ? americanOdds / 100.0 : 100.0 / -americanOdds), MidpointRounding.AwayFromZero);

    /// <summary>Sets the bet's status and net result from the game's current state. Safe to call repeatedly.</summary>
    public static void Settle(Bet b, Game g)
    {
        if (g.Status != GameStatus.Final)
        {
            b.Status = BetStatus.Pending;
            b.NetCents = 0;
            return;
        }

        int h = g.HomeScore, a = g.AwayScore;
        var line = b.Line ?? 0;
        var cmp = (b.Type, b.Side) switch
        {
            (BetType.Moneyline, BetSide.Home) => h.CompareTo(a),
            (BetType.Moneyline, BetSide.Away) => a.CompareTo(h),
            (BetType.Spread, BetSide.Home) => (h + line).CompareTo((double)a),
            (BetType.Spread, BetSide.Away) => (a + line).CompareTo((double)h),
            (BetType.Total, BetSide.Over) => ((double)(h + a)).CompareTo(line),
            (BetType.Total, BetSide.Under) => line.CompareTo((double)(h + a)),
            _ => 0,
        };

        (b.Status, b.NetCents) = cmp switch
        {
            > 0 => (BetStatus.Won, ProfitCents(b.StakeCents, b.AmericanOdds)),
            < 0 => (BetStatus.Lost, -b.StakeCents),
            _ => (BetStatus.Push, 0),
        };
    }

    public static async Task SyncGameAsync(AppDb db, Game g, CancellationToken ct = default)
    {
        foreach (var bet in await db.Bets.Where(b => b.GameId == g.Id).ToListAsync(ct))
            Settle(bet, g);
        await db.SaveChangesAsync(ct);
    }

    public static async Task SyncAllAsync(AppDb db, CancellationToken ct = default)
    {
        var ids = await db.Bets.Select(b => b.GameId).Distinct().ToListAsync(ct);
        var games = await db.Games.Where(g => ids.Contains(g.Id)).ToDictionaryAsync(g => g.Id, ct);
        foreach (var bet in await db.Bets.ToListAsync(ct))
            if (games.TryGetValue(bet.GameId, out var g)) Settle(bet, g);
        await db.SaveChangesAsync(ct);
    }

    public record Bankroll(int StartCents, int BalanceCents, int AtRiskCents, int NetCents, int Wins, int Losses, int Pushes, int Pending, double Roi);

    public static async Task<Bankroll> SummaryAsync(AppDb db)
    {
        var bets = await db.Bets.ToListAsync();
        var settled = bets.Where(b => b.Status != BetStatus.Pending).ToList();
        var atRisk = bets.Where(b => b.Status == BetStatus.Pending).Sum(b => b.StakeCents);
        var net = settled.Sum(b => b.NetCents);
        var staked = settled.Where(b => b.Status != BetStatus.Push).Sum(b => b.StakeCents);
        return new Bankroll(
            StartingBankrollCents, StartingBankrollCents + net - atRisk, atRisk, net,
            settled.Count(b => b.Status == BetStatus.Won), settled.Count(b => b.Status == BetStatus.Lost),
            settled.Count(b => b.Status == BetStatus.Push), bets.Count - settled.Count,
            staked == 0 ? 0 : (double)net / staked);
    }
}
