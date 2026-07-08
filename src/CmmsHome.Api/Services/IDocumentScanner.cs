namespace CmmsHome.Api.Services;

public interface IDocumentScanner
{
    Task<ScanResult> ScanAsync(CancellationToken ct = default);
}

public record ScanResult(int Discovered, int Updated, int Missing, int Total);
