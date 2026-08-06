using CmmsHome.Api.Models;
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
}
