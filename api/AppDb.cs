using Microsoft.EntityFrameworkCore;

namespace NflTracker.Api;

public class AppDb(DbContextOptions<AppDb> options) : DbContext(options)
{
    public DbSet<Team> Teams => Set<Team>();
    public DbSet<Game> Games => Set<Game>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Team>().Property(t => t.Id).ValueGeneratedNever();
        b.Entity<Game>().Property(g => g.Id).ValueGeneratedNever();
        b.Entity<Game>().HasIndex(g => new { g.Season, g.SeasonType, g.Week });
    }
}
