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

    // Meter reading retention (Services/MeterRetention.cs). Readings younger than
    // MeterFullDetailDays are all kept; older ones are thinned to the last per day, then
    // (past MeterDailyDays) per week, then (past MeterWeeklyDays) per month, kept forever.
    // CMMS@home keeps what maintenance needs — end-of-period totals, an approximate value
    // at any past time — not run-by-run detail, which stays in the system that reports it
    // (Home Assistant's long-term statistics, typically).
    //
    // MeterFullDetailDays never goes below MinMeterFullDetailDays, so the usage rate's
    // 30-day window (MeterService.RateWindow) always works on unthinned data.
    public const int MinMeterFullDetailDays = 31;
    public int MeterFullDetailDays { get; set; } = 90;
    public int MeterDailyDays { get; set; } = 730;
    public int MeterWeeklyDays { get; set; } = 1825;
}

public enum PathShorteningMode { Full, LastNSegments }
