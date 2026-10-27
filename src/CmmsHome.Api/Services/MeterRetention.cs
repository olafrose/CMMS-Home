using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Services;

// Thins old meter readings so a 15-minute integration push doesn't grow the table forever.
//
// Tiered by age (windows from AppSettings): every reading is kept for MeterFullDetailDays,
// then the last per UTC day, then per ISO week, then per calendar month — forever. A counter
// only climbs, so the last reading in a period is that period's end total, and everything in
// between is approximated by MeterService.ValueAtAsync's interpolation. That is what
// maintenance needs; run-by-run detail is the reporting system's job (Home Assistant's
// long-term statistics), not this app's. See docs/meters.md → Retention.
//
// Safe for schedules: rules store their baseline value, never a reading row.
public static class MeterRetention
{
    // Never thinned: offset/baseline markers (rebase, replaced) — RecordAsync also refuses
    // backfills before the last rebase by finding its row — and values a person typed or
    // that were taken with a service.
    private static readonly string[] Pinned =
        [MeterService.SourceRebase, MeterService.SourceReplaced, MeterService.SourceEvent, "manual"];

    public static async Task<PruneResult> PruneAsync(CmmsDbContext db, AppSettings settings, CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;

        // PUT /app-settings validates these, but thinning is irreversible: clamp anyway, so a
        // row edited by hand (or a 0 from a botched migration) can't wipe recent history.
        var full = Math.Max(settings.MeterFullDetailDays, AppSettings.MinMeterFullDetailDays);
        var dailyDays = Math.Max(settings.MeterDailyDays, full + 1);
        var weeklyDays = Math.Max(settings.MeterWeeklyDays, dailyDays + 1);

        // Coarsest last is not required for correctness, but finest first keeps each
        // statement's partitions small: the weekly pass only sees what the daily one left.
        var daily = await ThinAsync(db, "day", now.AddDays(-full), ct);
        var weekly = await ThinAsync(db, "week", now.AddDays(-dailyDays), ct);
        var monthly = await ThinAsync(db, "month", now.AddDays(-weeklyDays), ct);
        return new PruneResult(daily, weekly, monthly);
    }

    // Keeps the last reading per meter per `unit` bucket among those older than `cutoff`,
    // apart from pinned readings and each meter's first reading. One set-based statement:
    // nothing is loaded into memory, so the first run over years of 15-minute data is cheap
    // on a NAS. Buckets are taken in UTC, so they don't shift with the database's timezone.
    private static Task<int> ThinAsync(CmmsDbContext db, string unit, DateTime cutoff, CancellationToken ct)
    {
        // `unit` is inlined, not bound: it is only ever one of the three literals above, never
        // input, and as a literal the partition expression is fixed in the statement text.
        var sql = $$"""
            DELETE FROM "MeterReadings" d
            USING (
                SELECT r."Id",
                       row_number() OVER (
                           PARTITION BY r."MeterId", date_trunc('{{unit}}', r."ReadAt" AT TIME ZONE 'UTC')
                           ORDER BY r."ReadAt" DESC) AS rn
                FROM "MeterReadings" r
                WHERE r."ReadAt" < {0}
                  AND (r."Source" IS NULL OR NOT (r."Source" = ANY ({1})))
                  AND r."ReadAt" > (SELECT min(f."ReadAt") FROM "MeterReadings" f WHERE f."MeterId" = r."MeterId")
            ) x
            WHERE d."Id" = x."Id" AND x.rn > 1
            """;
        return db.Database.ExecuteSqlRawAsync(sql, [cutoff, Pinned], ct);
    }
}

public record PruneResult(int Daily, int Weekly, int Monthly)
{
    public int Total => Daily + Weekly + Monthly;
}

// Runs the thinning once a day. Shaped like DocumentScanHostedService; reads the windows
// fresh each run, so a Settings change applies on the next one (or at once via POST
// /meters/prune).
public class MeterRetentionHostedService(IServiceScopeFactory scopes, ILogger<MeterRetentionHostedService> logger)
    : BackgroundService
{
    private static readonly TimeSpan FirstRunDelay = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan Interval = TimeSpan.FromHours(24);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(FirstRunDelay, stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<CmmsDbContext>();
                var result = await MeterRetention.PruneAsync(db, await db.GetAppSettingsAsync(), stoppingToken);
                if (result.Total > 0)
                    logger.LogInformation(
                        "Meter retention thinned {Total} readings ({Daily} to daily, {Weekly} to weekly, {Monthly} to monthly).",
                        result.Total, result.Daily, result.Weekly, result.Monthly);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Meter retention failed. Will retry next interval.");
            }

            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }
}
