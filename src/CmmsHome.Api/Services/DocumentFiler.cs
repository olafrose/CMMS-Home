using System.Security.Cryptography;
using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CmmsHome.Api.Services;

public class DocumentFiler(
    IServiceScopeFactory scopeFactory,
    IOptions<DocumentScanOptions> options,
    DocumentIoLock ioLock,
    ILogger<DocumentFiler> logger) : IDocumentFiler
{
    private const string UncategorizedFolder = "Uncategorized";

    public async Task<FileOutcome> FileAsync(Guid documentId, CancellationToken ct = default)
    {
        var opts = options.Value;
        if (!opts.ManagedFoldering || string.IsNullOrWhiteSpace(opts.RootPath))
            return FileOutcome.Skipped;

        // Share the scanner's lock so a move can't race the reconciliation poller.
        await ioLock.Semaphore.WaitAsync(ct);
        try
        {
            return await FileCoreAsync(documentId, opts, ct);
        }
        finally
        {
            ioLock.Semaphore.Release();
        }
    }

    public async Task<FileOutcome> ReturnToInboxAsync(Guid documentId, CancellationToken ct = default)
    {
        var opts = options.Value;
        if (!opts.ManagedFoldering || string.IsNullOrWhiteSpace(opts.RootPath))
            return FileOutcome.Skipped;

        await ioLock.Semaphore.WaitAsync(ct);
        try
        {
            return await ReturnCoreAsync(documentId, opts, ct);
        }
        finally
        {
            ioLock.Semaphore.Release();
        }
    }

    private async Task<FileOutcome> ReturnCoreAsync(Guid documentId, DocumentScanOptions opts, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CmmsDbContext>();

        var doc = await db.Documents.FirstOrDefaultAsync(d => d.Id == documentId, ct);
        if (doc is null) return FileOutcome.Skipped;

        var rootFull = Path.GetFullPath(opts.RootPath!);
        var inbox = NormalizeZone(opts.InboxSubpath);
        var library = NormalizeZone(opts.LibrarySubpath);
        var rel = doc.RelativePath.Replace('\\', '/');

        if (IsUnderZone(rel, inbox)) return FileOutcome.AlreadyFiled; // already in the inbox
        if (!IsUnderZone(rel, library)) return FileOutcome.Skipped;   // user-organized file: leave in place

        var sourceFull = Path.GetFullPath(Path.Combine(rootFull, doc.RelativePath));
        if (!IsInsideRoot(sourceFull, rootFull) || !File.Exists(sourceFull))
            return FileOutcome.Skipped;

        var inboxFull = Path.GetFullPath(Path.Combine(rootFull, inbox));
        var fileName = doc.FileName;
        var targetFull = Path.Combine(inboxFull, fileName);

        try
        {
            Directory.CreateDirectory(inboxFull);

            if (File.Exists(targetFull))
            {
                if (ComputeHash(targetFull) == doc.ContentHash)
                {
                    File.Delete(sourceFull);
                    return await CommitAsync(db, doc, $"{inbox}/{fileName}", fileName, fromPath: null, doc.Status, ct);
                }
                fileName = NextFreeName(inboxFull, fileName);
                targetFull = Path.Combine(inboxFull, fileName);
            }

            var fromPath = doc.RelativePath;
            MoveFile(sourceFull, targetFull, doc.ContentHash);
            // Preserve the caller's status (the endpoint set Unclassified before calling us).
            return await CommitAsync(db, doc, $"{inbox}/{fileName}", fileName, fromPath, doc.Status, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "DocumentFiler: return-to-inbox failed for {DocumentId}.", documentId);
            return FileOutcome.Pending;
        }
    }

    public async Task<int> RetryPendingAsync(CancellationToken ct = default)
    {
        if (!options.Value.ManagedFoldering) return 0;

        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CmmsDbContext>();
        var ids = await db.Documents
            .Where(d => d.Status == DocumentStatus.PendingMove)
            .Select(d => d.Id)
            .ToListAsync(ct);

        int filed = 0;
        foreach (var id in ids)
        {
            if (ct.IsCancellationRequested) break;
            var outcome = await FileAsync(id, ct);
            if (outcome is FileOutcome.Moved or FileOutcome.AlreadyFiled) filed++;
        }
        return filed;
    }

    private async Task<FileOutcome> FileCoreAsync(Guid documentId, DocumentScanOptions opts, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CmmsDbContext>();

        var doc = await db.Documents.Include(d => d.Category).FirstOrDefaultAsync(d => d.Id == documentId, ct);
        if (doc is null) return FileOutcome.Skipped;
        if (doc.Status is not (DocumentStatus.Classified or DocumentStatus.PendingMove))
            return FileOutcome.Skipped;

        var rootFull = Path.GetFullPath(opts.RootPath!);
        var inbox = NormalizeZone(opts.InboxSubpath);
        var library = NormalizeZone(opts.LibrarySubpath);
        var rel = doc.RelativePath.Replace('\\', '/');

        // Only relocate files that already live in an app-owned zone. Files the
        // user organized in their own folders are classified in place.
        if (!IsUnderZone(rel, inbox) && !IsUnderZone(rel, library))
            return FileOutcome.Skipped;

        var sourceFull = Path.GetFullPath(Path.Combine(rootFull, doc.RelativePath));
        if (!IsInsideRoot(sourceFull, rootFull))
            return FileOutcome.Skipped;
        if (!File.Exists(sourceFull))
            return FileOutcome.Skipped; // let the scanner reconcile (Missing / re-link by hash)

        var categoryFolder = doc.Category is not null ? SanitizeFolder(doc.Category.Name) : UncategorizedFolder;
        var targetDirRel = $"{library}/{categoryFolder}";
        var targetDirFull = Path.GetFullPath(Path.Combine(rootFull, targetDirRel));
        if (!IsInsideRoot(targetDirFull, rootFull))
            return FileOutcome.Skipped;

        var fileName = doc.FileName;
        var targetFull = Path.Combine(targetDirFull, fileName);

        if (PathsEqual(sourceFull, targetFull))
            return FileOutcome.AlreadyFiled; // already at its managed destination

        try
        {
            Directory.CreateDirectory(targetDirFull);

            if (File.Exists(targetFull))
            {
                if (ComputeHash(targetFull) == doc.ContentHash)
                {
                    // Same content already filed — dedupe: drop the source, point the row at it.
                    File.Delete(sourceFull);
                    return await CommitAsync(db, doc, $"{targetDirRel}/{fileName}", fileName, fromPath: null, DocumentStatus.Classified, ct);
                }
                // Different file with the same name — pick a free name.
                fileName = NextFreeName(targetDirFull, fileName);
                targetFull = Path.Combine(targetDirFull, fileName);
            }

            var fromPath = doc.RelativePath;
            MoveFile(sourceFull, targetFull, doc.ContentHash);
            return await CommitAsync(db, doc, $"{targetDirRel}/{fileName}", fileName, fromPath, DocumentStatus.Classified, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "DocumentFiler: move failed for {DocumentId}; marking PendingMove.", documentId);
            doc.Status = DocumentStatus.PendingMove;
            try { await db.SaveChangesAsync(ct); } catch { /* best effort */ }
            return FileOutcome.Pending;
        }
    }

    private static async Task<FileOutcome> CommitAsync(
        CmmsDbContext db, Document doc, string targetRel, string fileName, string? fromPath, DocumentStatus status, CancellationToken ct)
    {
        var moved = fromPath is not null;
        if (moved)
        {
            db.DocumentMoves.Add(new DocumentMove
            {
                Id = Guid.NewGuid(),
                DocumentId = doc.Id,
                FromPath = fromPath!,
                ToPath = targetRel,
                MovedAt = DateTime.UtcNow,
            });
        }
        doc.RelativePath = targetRel;
        doc.FileName = fileName;
        doc.Status = status;
        await db.SaveChangesAsync(ct);
        return moved ? FileOutcome.Moved : FileOutcome.AlreadyFiled;
    }

    // Same-filesystem rename is atomic. If that fails as a cross-device move,
    // fall back to copy → verify size+hash → delete source (never delete before
    // the destination is confirmed intact).
    private static void MoveFile(string source, string target, string expectedHash)
    {
        try
        {
            File.Move(source, target);
            return;
        }
        catch (IOException)
        {
            File.Copy(source, target, overwrite: false);
            if (new FileInfo(target).Length != new FileInfo(source).Length || ComputeHash(target) != expectedHash)
            {
                try { File.Delete(target); } catch { /* ignore */ }
                throw;
            }
            File.Delete(source);
        }
    }

    // ── path helpers ────────────────────────────────────────────────────────

    private static string NormalizeZone(string subpath) =>
        subpath.Replace('\\', '/').Trim('/');

    private static bool IsUnderZone(string relForwardSlash, string zone) =>
        relForwardSlash.Equals(zone, StringComparison.Ordinal)
        || relForwardSlash.StartsWith(zone + "/", StringComparison.Ordinal);

    private static bool IsInsideRoot(string fullPath, string rootFull) =>
        fullPath.Equals(rootFull, StringComparison.OrdinalIgnoreCase)
        || fullPath.StartsWith(rootFull + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);

    private static bool PathsEqual(string a, string b) =>
        string.Equals(Path.GetFullPath(a), Path.GetFullPath(b), StringComparison.OrdinalIgnoreCase);

    private static string SanitizeFolder(string name)
    {
        var cleaned = new string(name
            .Where(c => !Path.GetInvalidFileNameChars().Contains(c) && c != '/' && c != '\\')
            .ToArray())
            .Trim()
            .Trim('.');
        return string.IsNullOrWhiteSpace(cleaned) ? UncategorizedFolder : cleaned;
    }

    private static string NextFreeName(string dirFull, string fileName)
    {
        var stem = Path.GetFileNameWithoutExtension(fileName);
        var ext = Path.GetExtension(fileName);
        for (int i = 2; i < 1000; i++)
        {
            var candidate = $"{stem} ({i}){ext}";
            if (!File.Exists(Path.Combine(dirFull, candidate))) return candidate;
        }
        // Extremely unlikely fallback.
        return $"{stem}-{Guid.NewGuid():N}{ext}";
    }

    private static string ComputeHash(string filePath)
    {
        using var stream = File.OpenRead(filePath);
        return Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
    }
}
