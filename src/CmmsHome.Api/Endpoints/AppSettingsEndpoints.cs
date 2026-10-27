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

            settings.StorageMaxDepth = dto.StorageMaxDepth;
            settings.PathShorteningMode = dto.PathShorteningMode;
            settings.PathShorteningSegments = dto.PathShorteningSegments;
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

record SaveAppSettingsDto(int StorageMaxDepth, PathShorteningMode PathShorteningMode, int PathShorteningSegments);
