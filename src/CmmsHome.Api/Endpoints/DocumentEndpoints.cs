using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using CmmsHome.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CmmsHome.Api.Endpoints;

public static class DocumentEndpoints
{
    public static void MapDocumentEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/documents").WithTags("Documents");

        group.MapGet("/", async (string? status, Guid? equipment_id, Guid? event_id, Guid? part_id, CmmsDbContext db, ActorAccessor accessor) =>
        {
            var actor = await accessor.GetAsync();

            // VisibleTo first, so the status/link filters below narrow a set that already
            // excludes what this caller may not know exists.
            var q = db.Documents
                .VisibleTo(actor)
                .Include(d => d.Links)
                .Include(d => d.Category)
                .AsQueryable();

            if (!string.IsNullOrWhiteSpace(status))
            {
                if (!Enum.TryParse<DocumentStatus>(status, ignoreCase: true, out var parsedStatus))
                    return Results.ValidationProblem(new Dictionary<string, string[]>
                        { ["status"] = [$"Unknown status value '{status}'."] });
                q = q.Where(d => d.Status == parsedStatus);
            }

            if (equipment_id.HasValue)
                q = q.Where(d => d.Links.Any(l => l.EquipmentId == equipment_id));

            if (event_id.HasValue)
                q = q.Where(d => d.Links.Any(l => l.MaintenanceEventId == event_id));

            // Direct part links only — a document filed against a part does not surface on
            // the equipment PartEquipment says that part is used on. See DocumentLink.
            if (part_id.HasValue)
                q = q.Where(d => d.Links.Any(l => l.PartId == part_id));

            return Results.Ok(await q.OrderByDescending(d => d.DiscoveredAt).ToListAsync());
        }).RequirePermission(Permissions.DocumentsList);

        group.MapGet("/{id:guid}", async (Guid id, CmmsDbContext db, ActorAccessor accessor) =>
        {
            var actor = await accessor.GetAsync();

            // A sensitive document the caller may not see simply isn't found — see VisibleTo
            // for why this is a 404 and not a 403.
            var doc = await db.Documents
                .VisibleTo(actor)
                .Include(d => d.Links)
                .Include(d => d.Category)
                .FirstOrDefaultAsync(d => d.Id == id);
            return doc is not null ? Results.Ok(doc) : Results.NotFound();
        }).RequirePermission(Permissions.DocumentsRead);

        group.MapGet("/{id:guid}/content", async (Guid id, CmmsDbContext db, ActorAccessor accessor, IOptions<DocumentScanOptions> opts, HttpContext http) =>
        {
            var actor = await accessor.GetAsync();

            var doc = await db.Documents.VisibleTo(actor).FirstOrDefaultAsync(d => d.Id == id);
            if (doc is null || doc.Status == DocumentStatus.Missing)
                return Results.NotFound();

            var rootPath = opts.Value.RootPath;
            if (string.IsNullOrWhiteSpace(rootPath))
                return Results.NotFound();

            var rootFull = Path.GetFullPath(rootPath);
            var fullPath = Path.GetFullPath(Path.Combine(rootFull, doc.RelativePath));

            // Path traversal guard
            if (!fullPath.StartsWith(rootFull + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
                && !fullPath.Equals(rootFull, StringComparison.OrdinalIgnoreCase))
                return Results.NotFound();

            if (!File.Exists(fullPath))
                return Results.NotFound();

            // Serve inline so PDFs/images preview in the browser; keep the filename hint for downloads.
            http.Response.Headers.ContentDisposition =
                new System.Net.Mime.ContentDisposition { FileName = doc.FileName, Inline = true }.ToString();

            var stream = File.OpenRead(fullPath);
            return Results.Stream(stream, doc.ContentType, enableRangeProcessing: true);
        }).RequirePermission(Permissions.DocumentsDownload);

        group.MapPut("/{id:guid}/classify", async (Guid id, ClassifyDocumentDto dto, CmmsDbContext db, IDocumentFiler filer) =>
        {
            var doc = await db.Documents
                .Include(d => d.Links)
                .Include(d => d.Category)
                .FirstOrDefaultAsync(d => d.Id == id);
            if (doc is null) return Results.NotFound();

            if (dto.Links is null || dto.Links.Count == 0)
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["links"] = ["At least one link is required."] });

            if (dto.CategoryId is Guid cid && !await db.DocumentCategories.AnyAsync(c => c.Id == cid))
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["categoryId"] = ["Category not found."] });

            var errors = new Dictionary<string, string[]>();

            for (int i = 0; i < dto.Links.Count; i++)
            {
                var link = dto.Links[i];

                // Counted rather than compared pairwise: with three targets, spelling out
                // "both set / neither set" stops scaling.
                var targets = new[] { link.EquipmentId, link.MaintenanceEventId, link.PartId }
                    .Count(t => t.HasValue);

                if (targets != 1)
                {
                    errors[$"links[{i}]"] = ["Each link must have exactly one of EquipmentId, MaintenanceEventId or PartId set."];
                    continue;
                }

                if (link.EquipmentId.HasValue)
                {
                    var exists = await db.Equipment.AnyAsync(a => a.Id == link.EquipmentId.Value);
                    if (!exists)
                        errors[$"links[{i}].equipmentId"] = [$"Equipment {link.EquipmentId.Value} not found."];
                }
                else if (link.MaintenanceEventId.HasValue)
                {
                    var exists = await db.Events.AnyAsync(e => e.Id == link.MaintenanceEventId.Value);
                    if (!exists)
                        errors[$"links[{i}].maintenanceEventId"] = [$"MaintenanceEvent {link.MaintenanceEventId.Value} not found."];
                }
                else if (link.PartId.HasValue)
                {
                    var exists = await db.Parts.AnyAsync(p => p.Id == link.PartId.Value);
                    if (!exists)
                        errors[$"links[{i}].partId"] = [$"Part {link.PartId.Value} not found."];
                }
            }

            if (errors.Count > 0)
                return Results.ValidationProblem(errors);

            // Replace existing links. AddRange (not reassigning doc.Links) so EF marks the
            // new rows Added — reassigning a collection of entities with client-set Ids makes
            // EF treat them as existing and emit UPDATEs that match no rows.
            db.DocumentLinks.RemoveRange(doc.Links);
            db.DocumentLinks.AddRange(dto.Links.Select(l => new DocumentLink
            {
                Id = Guid.NewGuid(),
                DocumentId = doc.Id,
                EquipmentId = l.EquipmentId,
                MaintenanceEventId = l.MaintenanceEventId,
                PartId = l.PartId,
                LinkedAt = DateTime.UtcNow,
            }));

            doc.CategoryId = dto.CategoryId;
            doc.Title = dto.Title;
            doc.Status = DocumentStatus.Classified;

            await db.SaveChangesAsync();

            // Managed foldering (Phase 2, no-op unless enabled): move the file into
            // library/<Category>/. Runs in its own scope, so reload to surface the
            // new RelativePath/Status in the response.
            await filer.FileAsync(doc.Id);
            await db.Entry(doc).ReloadAsync();
            await db.Entry(doc).Reference(d => d.Category).LoadAsync();
            return Results.Ok(doc);
        }).RequirePermission(Permissions.DocumentsClassify);

        group.MapPost("/{id:guid}/ignore", async (Guid id, CmmsDbContext db) =>
        {
            var doc = await db.Documents
                .Include(d => d.Links)
                .Include(d => d.Category)
                .FirstOrDefaultAsync(d => d.Id == id);
            if (doc is null) return Results.NotFound();

            doc.Status = DocumentStatus.Ignored;
            await db.SaveChangesAsync();
            return Results.Ok(doc);
        }).RequirePermission(Permissions.DocumentsClassify);

        // Undo a classification: clear links + category, return to the inbox queue,
        // and (managed foldering) move the file from library/ back to inbox/.
        group.MapPost("/{id:guid}/unclassify", async (Guid id, CmmsDbContext db, IDocumentFiler filer) =>
        {
            var doc = await db.Documents
                .Include(d => d.Links)
                .Include(d => d.Category)
                .FirstOrDefaultAsync(d => d.Id == id);
            if (doc is null) return Results.NotFound();

            db.DocumentLinks.RemoveRange(doc.Links);
            doc.CategoryId = null;
            doc.Status = DocumentStatus.Unclassified;
            await db.SaveChangesAsync();

            // Move the file back to inbox/ (no-op if foldering off or file isn't in library).
            await filer.ReturnToInboxAsync(doc.Id);
            await db.Entry(doc).ReloadAsync();
            await db.Entry(doc).Reference(d => d.Category).LoadAsync();
            return Results.Ok(doc);
        }).RequirePermission(Permissions.DocumentsClassify);

        group.MapPost("/scan", async (IDocumentScanner scanner) =>
        {
            var result = await scanner.ScanAsync();
            return Results.Ok(result);
        }).RequirePermission(Permissions.DocumentsScan);

        // Upload a file into the app-owned inbox zone, then let the scanner index
        // it as a normal Unclassified document (reusing hash/dedupe). Requires a
        // writable RootPath (Phase 2). Antiforgery off because the session cookie is
        // SameSite=Lax: the browser withholds it from a cross-site POST, so a form on
        // another origin cannot make this request as a signed-in user — which is the
        // attack a token would otherwise be defending against.
        group.MapPost("/upload", async (IFormFile file, IOptions<DocumentScanOptions> opts, IDocumentScanner scanner, CmmsDbContext db, ILoggerFactory loggerFactory) =>
        {
            if (file is null || file.Length == 0)
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["file"] = ["No file was uploaded."] });

            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            var allowed = opts.Value.AllowedExtensions.Select(e => e.ToLowerInvariant()).ToHashSet();
            if (!allowed.Contains(ext))
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["file"] = [$"File type '{ext}' is not allowed."] });

            var rootPath = opts.Value.RootPath;
            if (string.IsNullOrWhiteSpace(rootPath))
                return Results.Problem("Document storage is not configured.", statusCode: StatusCodes.Status503ServiceUnavailable);

            var rootFull = Path.GetFullPath(rootPath);
            var inbox = opts.Value.InboxSubpath.Replace('\\', '/').Trim('/');
            var inboxFull = Path.GetFullPath(Path.Combine(rootFull, inbox));

            // Sanitize to a bare filename, then place inside the inbox with a
            // path-traversal guard (mirrors the /content endpoint's guard).
            var safeName = Path.GetFileName(file.FileName);
            if (string.IsNullOrWhiteSpace(safeName))
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["file"] = ["Invalid file name."] });

            var targetFull = Path.GetFullPath(Path.Combine(inboxFull, safeName));
            if (!targetFull.StartsWith(inboxFull + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["file"] = ["Invalid file name."] });

            try
            {
                Directory.CreateDirectory(inboxFull);

                // Avoid clobbering an existing inbox file of the same name.
                if (File.Exists(targetFull))
                {
                    var stem = Path.GetFileNameWithoutExtension(safeName);
                    for (int i = 2; File.Exists(targetFull); i++)
                    {
                        safeName = $"{stem} ({i}){ext}";
                        targetFull = Path.Combine(inboxFull, safeName);
                    }
                }

                await using (var dest = File.Create(targetFull))
                    await file.CopyToAsync(dest);
            }
            catch (Exception ex)
            {
                loggerFactory.CreateLogger("DocumentUpload").LogError(ex,
                    "Failed to write uploaded file to {Target}. Is the documents folder writable by the container user?", targetFull);
                return Results.Problem("Could not write the uploaded file. Is the documents folder writable?",
                    statusCode: StatusCodes.Status500InternalServerError);
            }

            // Index it right away so the caller gets the created document back.
            await scanner.ScanAsync();

            var relativePath = $"{inbox}/{safeName}";
            var doc = await db.Documents
                .Include(d => d.Category)
                .FirstOrDefaultAsync(d => d.RelativePath == relativePath);

            return doc is not null ? Results.Ok(doc) : Results.Accepted();
        }).DisableAntiforgery().RequirePermission(Permissions.DocumentsUpload);

        // Forget a document record (links cascade). Does not touch the file on disk.
        group.MapDelete("/{id:guid}", async (Guid id, CmmsDbContext db) =>
        {
            var doc = await db.Documents.FindAsync(id);
            if (doc is null) return Results.NotFound();
            db.Documents.Remove(doc);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequirePermission(Permissions.DocumentsDelete);

        // Bulk-forget every document whose file is no longer on disk (Status = Missing).
        group.MapPost("/prune-missing", async (CmmsDbContext db) =>
        {
            var removed = await db.Documents
                .Where(d => d.Status == DocumentStatus.Missing)
                .ExecuteDeleteAsync();
            return Results.Ok(new { removed });
        }).RequirePermission(Permissions.DocumentsDelete);
    }
}

record ClassifyDocumentDto(Guid? CategoryId, string? Title, List<ClassifyLinkDto> Links);
record ClassifyLinkDto(Guid? EquipmentId, Guid? MaintenanceEventId, Guid? PartId);
