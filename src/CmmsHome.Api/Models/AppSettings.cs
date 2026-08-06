namespace CmmsHome.Api.Models;

// User-editable app configuration, stored server-side so it follows the user across
// devices (and so a future reminder/notification job can read the same policy). This
// is a SINGLE-ROW table: Id is always 1 and the endpoints take no id.
//
// Env-var config (connection string, Documents__*) stays in appsettings/IOptions —
// this table is only for things the user changes from the Settings page.
public class AppSettings
{
    // Hard ceiling on StorageMaxDepth, whatever the user sets. Deliberately equal to
    // the 16-iteration guard in the frontend's locationPath() (lib/storage.ts): that
    // guard silently TRUNCATES rather than erroring, so data must never be allowed
    // deeper than the breadcrumb walk can cover. Change both together.
    public const int AbsoluteStorageMaxDepth = 16;

    public int Id { get; set; } = 1;

    // Deepest a StorageLocation may be nested (root = depth 1), capped at
    // AbsoluteStorageMaxDepth.
    public int StorageMaxDepth { get; set; } = 6;

    // How a location breadcrumb is shortened when shown as a *reference* to a place
    // (lists, dashboard, equipment labels). A place's own label always shows its full
    // lineage regardless of this.
    public PathShorteningMode PathShorteningMode { get; set; } = PathShorteningMode.LastNSegments;
    public int PathShorteningSegments { get; set; } = 2;
}

public enum PathShorteningMode { Full, LastNSegments }
