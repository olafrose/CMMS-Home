using Microsoft.Extensions.Options;

namespace CmmsHome.Api.Services;

public class DocumentScanHostedService(
    IDocumentScanner scanner,
    IOptions<DocumentScanOptions> options,
    ILogger<DocumentScanHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Brief delay on startup so migrations and other services settle first
        await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await scanner.ScanAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "DocumentScanHostedService: unhandled exception during scan. Will retry next interval.");
            }

            var intervalMinutes = options.Value.ScanIntervalMinutes;
            try
            {
                await Task.Delay(TimeSpan.FromMinutes(intervalMinutes), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}
