namespace NflTracker.Api;

/// <summary>Keeps betting lines current: books post them a week or two ahead and adjust them until kickoff.</summary>
public class OddsRefresher(IServiceScopeFactory scopes, ILogger<OddsRefresher> log) : BackgroundService
{
    private static readonly TimeSpan Every = TimeSpan.FromHours(3);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Give a first-run import (if any) time to finish before the first refresh.
        await Task.Delay(TimeSpan.FromSeconds(60), stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                var importer = scope.ServiceProvider.GetRequiredService<EspnImporter>();
                var n = await importer.RefreshOddsAsync(AppConfig.Season, stoppingToken);
                log.LogInformation("Odds refresh checked {Count} games", n);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                log.LogWarning(ex, "Odds refresh failed; will retry in {Hours}h", Every.TotalHours);
            }
            await Task.Delay(Every, stoppingToken);
        }
    }
}
