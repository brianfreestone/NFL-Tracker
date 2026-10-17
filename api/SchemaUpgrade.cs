using Microsoft.EntityFrameworkCore;

namespace NflTracker.Api;

/// <summary>
/// EnsureCreated() only builds a brand-new database, so databases created before the betting
/// feature get their new columns and table added here. Keep in sync with Models.cs.
/// </summary>
public static class SchemaUpgrade
{
    private static readonly (string Name, string Type)[] GameColumns =
    [
        ("OddsProvider", "TEXT"), ("HomeSpread", "REAL"), ("HomeSpreadOdds", "INTEGER"), ("AwaySpreadOdds", "INTEGER"),
        ("Total", "REAL"), ("OverOdds", "INTEGER"), ("UnderOdds", "INTEGER"),
        ("HomeMoneyline", "INTEGER"), ("AwayMoneyline", "INTEGER"),
    ];

    public static void Apply(AppDb db)
    {
        db.Database.EnsureCreated();

        var existing = db.Database.SqlQueryRaw<string>("SELECT name AS Value FROM pragma_table_info('Games')").ToHashSet();
        foreach (var (name, type) in GameColumns)
            if (!existing.Contains(name))
                db.Database.ExecuteSqlRaw($"ALTER TABLE \"Games\" ADD COLUMN \"{name}\" {type} NULL");

        db.Database.ExecuteSqlRaw("""
            CREATE TABLE IF NOT EXISTS "Bets" (
                "Id" INTEGER NOT NULL CONSTRAINT "PK_Bets" PRIMARY KEY AUTOINCREMENT,
                "GameId" INTEGER NOT NULL,
                "PlacedUtc" TEXT NOT NULL,
                "Type" INTEGER NOT NULL,
                "Side" INTEGER NOT NULL,
                "Line" REAL NULL,
                "AmericanOdds" INTEGER NOT NULL,
                "StakeCents" INTEGER NOT NULL,
                "Status" INTEGER NOT NULL,
                "NetCents" INTEGER NOT NULL
            )
            """);
        db.Database.ExecuteSqlRaw("""CREATE INDEX IF NOT EXISTS "IX_Bets_GameId" ON "Bets" ("GameId")""");
    }
}
