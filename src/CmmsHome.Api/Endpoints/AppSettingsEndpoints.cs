using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using CmmsHome.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Endpoints;

public static class AppSettingsEndpoints
{
    public static void MapAppSettingsEndpoints(this WebApplication app)
    {
        // Singleton resource: no /{id} routes, GET and PUT operate on the one row.
        var group = app.MapGroup("/app-settings").WithTags("AppSettings");

        group.MapGet("/", async (CmmsDbContext db) => Results.Ok(await db.GetAppSettingsAsync()))
            .RequirePermission(Permissions.SettingsRead);

        group.MapPut("/", async (SaveAppSettingsDto dto, CmmsDbContext db) =>
        {
            var errors = new Dictionary<string, string[]>();

            if (dto.StorageMaxDepth < 1 || dto.StorageMaxDepth > AppSettings.AbsoluteStorageMaxDepth)
                errors["storageMaxDepth"] = [$"Must be between 1 and {AppSettings.AbsoluteStorageMaxDepth}"];

            if (dto.PathShorteningSegments < 1)
                errors["pathShorteningSegments"] = ["Must be at least 1"];

            if (errors.Count > 0) return Results.ValidationProblem(errors);

            // Tolerate a missing seed row rather than 500ing.
            var settings = await db.AppSettings.SingleOrDefaultAsync(s => s.Id == 1);
            if (settings is null)
            {
                settings = new AppSettings();
                db.AppSettings.Add(settings);
            }

            // Retention windows are optional in the payload (null = keep), so a client that
            // predates them can still save the rest. Validated as the resulting triple.
            var full = dto.MeterFullDetailDays ?? settings.MeterFullDetailDays;
            var daily = dto.MeterDailyDays ?? settings.MeterDailyDays;
            var weekly = dto.MeterWeeklyDays ?? settings.MeterWeeklyDays;
            var retention = new Dictionary<string, string[]>();
            if (full < AppSettings.MinMeterFullDetailDays)
                retention["meterFullDetailDays"] =
                    [$"At least {AppSettings.MinMeterFullDetailDays} days, so usage forecasts keep a full month of detail"];
            if (daily <= full) retention["meterDailyDays"] = ["Must be longer than the full-detail period"];
            if (weekly <= daily) retention["meterWeeklyDays"] = ["Must be longer than the daily period"];
            if (weekly > 36500) retention["meterWeeklyDays"] = ["At most 36500 days"];
            if (retention.Count > 0) return Results.ValidationProblem(retention);

            settings.StorageMaxDepth = dto.StorageMaxDepth;
            settings.PathShorteningMode = dto.PathShorteningMode;
            settings.PathShorteningSegments = dto.PathShorteningSegments;
            settings.MeterFullDetailDays = full;
            settings.MeterDailyDays = daily;
            settings.MeterWeeklyDays = weekly;
            await db.SaveChangesAsync();

            // Lowering the cap is allowed and grandfathers existing trees — depth is a
            // write-time gate, not a standing invariant (renaming an already-too-deep
            // place has always been fine). Report how many places now sit over the cap
            // so the UI can show a note; it is NOT an error.
            var all = await db.StorageLocations.AsNoTracking().ToListAsync();
            var overCap = all.Count(s => StorageLocationEndpoints.DepthOf(s.Id, all) > settings.StorageMaxDepth);

            return Results.Ok(new { settings, placesOverNewDepthCap = overCap });
        }).RequirePermission(Permissions.SettingsManage);
    }
}

record SaveAppSettingsDto(
    int StorageMaxDepth, PathShorteningMode PathShorteningMode, int PathShorteningSegments,
    int? MeterFullDetailDays = null, int? MeterDailyDays = null, int? MeterWeeklyDays = null);
