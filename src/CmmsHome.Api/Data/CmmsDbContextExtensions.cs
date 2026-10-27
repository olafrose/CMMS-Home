using CmmsHome.Api.Models;
using CmmsHome.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Data;

public static class CmmsDbContextExtensions
{
    // Read the singleton settings row. Queried per request rather than cached: it's a
    // PK lookup on a one-row table (trivial next to the full-table loads the storage
    // endpoints already do), and staying uncached means a PUT takes effect immediately
    // with no invalidation to forget.
    //
    // Falls back to defaults rather than throwing, so a DB whose seed row is missing
    // still serves requests.
    public static async Task<AppSettings> GetAppSettingsAsync(this CmmsDbContext db) =>
        await db.AppSettings.AsNoTracking().SingleOrDefaultAsync(s => s.Id == 1)
        ?? new AppSettings();

    // Narrows a document query to what this actor is allowed to know exists.
    //
    // Without documents.read_sensitive, documents in a Sensitive category are *invisible*
    // rather than locked: they drop out of lists, and a fetch by id finds nothing and so
    // answers 404. A 403 there would confirm the document exists, which is the one fact the
    // Sensitive flag is meant to withhold — knowing a "Divorce settlement.pdf" is on the NAS
    // is most of the leak.
    //
    // A query filter rather than a per-document check so every read path is covered by
    // construction: a new endpoint that forgets to call this is visible as a missing call,
    // where a forgotten `if` inside a handler is not.
    public static IQueryable<Document> VisibleTo(this IQueryable<Document> documents, CurrentActor actor) =>
        actor.Can(Permissions.DocumentsReadSensitive)
            ? documents
            // Uncategorised documents stay visible: nothing has said they are sensitive, and
            // hiding the whole inbox from most roles would break classification.
            : documents.Where(d => d.Category == null || !d.Category.Sensitive);
}
