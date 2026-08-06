using CmmsHome.Api.Models;

namespace CmmsHome.Api.Services;

// Server-side twin of locationPath()/formatLocationPath() in the frontend's
// lib/storage.ts — same walk, same 16-iteration guard, same "ellipsis then a plain
// space, not the separator" convention. Keep the two in sync.
//
// Nothing in the API renders path text today (the frontend does its own formatting from
// the flat place list). This exists so the deferred reminder/notification feature, which
// has no frontend to borrow from, composes message text identically instead of inventing
// its own breadcrumb format.
public static class LocationPathFormatter
{
    public static string Format(
        Guid? id,
        List<StorageLocation> all,
        AppSettings settings,
        string sep = " › ")
    {
        if (id is null) return "";

        var byId = all.ToDictionary(s => s.Id);
        var parts = new List<string>();
        var cur = byId.GetValueOrDefault(id.Value);
        var guard = 0;
        while (cur is not null && guard++ < 16)
        {
            parts.Insert(0, cur.Name);
            cur = cur.ParentId is Guid pid ? byId.GetValueOrDefault(pid) : null;
        }

        if (settings.PathShorteningMode == PathShorteningMode.LastNSegments
            && settings.PathShorteningSegments > 0
            && parts.Count > settings.PathShorteningSegments)
        {
            var kept = parts.Skip(parts.Count - settings.PathShorteningSegments);
            return $"… {string.Join(sep, kept)}";
        }

        return string.Join(sep, parts);
    }
}
