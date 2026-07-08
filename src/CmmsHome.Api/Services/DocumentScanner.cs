using System.Security.Cryptography;
using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CmmsHome.Api.Services;

public class DocumentScanner(
    IServiceScopeFactory scopeFactory,
    IOptions<DocumentScanOptions> options,
    ILogger<DocumentScanner> logger) : IDocumentScanner
{
    private readonly FileExtensionContentTypeProvider _contentTypeProvider = new();
    private readonly SemaphoreSlim _scanLock = new(1, 1);

    public async Task<ScanResult> ScanAsync(CancellationToken ct = default)
    {
        // Serialize scans so the periodic poller and a manual /scan can't run concurrently
        // (concurrent inserts of the same RelativePath would violate the unique index).
        await _scanLock.WaitAsync(ct);
        try
        {
            return await ScanCoreAsync(ct);
        }
        finally
        {
            _scanLock.Release();
        }
    }

    private async Task<ScanResult> ScanCoreAsync(CancellationToken ct)
    {
        var opts = options.Value;
        var rootPath = opts.RootPath;

        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CmmsDbContext>();

        var existingCount = await db.Documents.CountAsync(ct);

        if (string.IsNullOrWhiteSpace(rootPath) || !Directory.Exists(rootPath))
        {
            logger.LogWarning("DocumentScanner: RootPath is null/empty or does not exist ({RootPath}). Skipping scan.", rootPath);
            return new ScanResult(0, 0, 0, existingCount);
        }

        var allowedExts = opts.AllowedExtensions
            .Select(e => e.ToLowerInvariant())
            .ToHashSet();

        IEnumerable<string> files;
        try
        {
            files = Directory.EnumerateFiles(rootPath, "*", SearchOption.AllDirectories)
                .Where(f => allowedExts.Contains(Path.GetExtension(f).ToLowerInvariant()))
                .ToList();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "DocumentScanner: Error enumerating files under {RootPath}. Aborting scan without changes.", rootPath);
            return new ScanResult(0, 0, 0, existingCount);
        }

        var rootFull = Path.GetFullPath(rootPath);
        var seenRelativePaths = new HashSet<string>();

        int discovered = 0;
        int updated = 0;

        foreach (var filePath in files)
        {
            if (ct.IsCancellationRequested) break;

            try
            {
                var relativePath = Path.GetRelativePath(rootFull, filePath)
                    .Replace('\\', '/');
                seenRelativePaths.Add(relativePath);

                var fileInfo = new FileInfo(filePath);
                var sizeBytes = fileInfo.Length;
                var lastModifiedUtc = fileInfo.LastWriteTimeUtc;
                var fileName = fileInfo.Name;

                var existing = await db.Documents
                    .FirstOrDefaultAsync(d => d.RelativePath == relativePath, ct);

                if (existing is not null
                    && existing.SizeBytes == sizeBytes
                    && existing.LastModifiedUtc == lastModifiedUtc)
                {
                    // unchanged — skip re-hash
                    continue;
                }

                var hash = ComputeHash(filePath);
                var contentType = GetContentType(fileName);

                if (existing is not null)
                {
                    // metadata changed — update
                    existing.FileName = fileName;
                    existing.ContentType = contentType;
                    existing.SizeBytes = sizeBytes;
                    existing.ContentHash = hash;
                    existing.LastModifiedUtc = lastModifiedUtc;
                    if (existing.Status == DocumentStatus.Missing)
                        existing.Status = DocumentStatus.Unclassified;
                    updated++;
                }
                else
                {
                    // new relative path — check for a moved file by content hash
                    var movedFrom = await db.Documents
                        .FirstOrDefaultAsync(d =>
                            d.ContentHash == hash &&
                            (d.Status == DocumentStatus.Missing || !seenRelativePaths.Contains(d.RelativePath)),
                            ct);

                    if (movedFrom is not null && !seenRelativePaths.Contains(movedFrom.RelativePath))
                    {
                        // re-link on move: update the existing row in place
                        movedFrom.RelativePath = relativePath;
                        movedFrom.FileName = fileName;
                        movedFrom.ContentType = contentType;
                        movedFrom.SizeBytes = sizeBytes;
                        movedFrom.LastModifiedUtc = lastModifiedUtc;
                        if (movedFrom.Status == DocumentStatus.Missing)
                            movedFrom.Status = DocumentStatus.Unclassified;
                        updated++;
                    }
                    else
                    {
                        // genuinely new file
                        db.Documents.Add(new Document
                        {
                            Id = Guid.NewGuid(),
                            RelativePath = relativePath,
                            FileName = fileName,
                            ContentType = contentType,
                            SizeBytes = sizeBytes,
                            ContentHash = hash,
                            LastModifiedUtc = lastModifiedUtc,
                            DiscoveredAt = DateTime.UtcNow,
                            Status = DocumentStatus.Unclassified,
                            CreatedAt = DateTime.UtcNow,
                        });
                        discovered++;
                    }
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "DocumentScanner: Error processing file {FilePath}. Skipping.", filePath);
            }
        }

        // Mark any document not seen on disk as Missing (successful full enumeration only)
        if (!ct.IsCancellationRequested)
        {
            var allDocs = await db.Documents.ToListAsync(ct);
            int missing = 0;
            foreach (var doc in allDocs)
            {
                if (!seenRelativePaths.Contains(doc.RelativePath) && doc.Status != DocumentStatus.Missing)
                {
                    doc.Status = DocumentStatus.Missing;
                    missing++;
                }
            }

            await db.SaveChangesAsync(ct);

            var total = await db.Documents.CountAsync(ct);
            logger.LogInformation(
                "DocumentScanner: scan complete — discovered={Discovered}, updated={Updated}, missing={Missing}, total={Total}",
                discovered, updated, missing, total);
            return new ScanResult(discovered, updated, missing, total);
        }

        await db.SaveChangesAsync(ct);
        var finalTotal = await db.Documents.CountAsync(ct);
        return new ScanResult(discovered, updated, 0, finalTotal);
    }

    private static string ComputeHash(string filePath)
    {
        using var stream = File.OpenRead(filePath);
        var hash = SHA256.HashData(stream);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private string GetContentType(string fileName)
    {
        if (_contentTypeProvider.TryGetContentType(fileName, out var contentType))
            return contentType;
        return "application/octet-stream";
    }
}
