using CmmsHome.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Endpoints;

// Events and rules target exactly one Equipment or one StorageLocation. Shared by both
// create routes so they refuse the same way; the DB check constraint is the backstop.
static class MaintenanceTarget
{
    // Null when the target is valid; otherwise the response to return.
    public static async Task<IResult?> ValidateAsync(Guid? equipmentId, Guid? storageLocationId, CmmsDbContext db)
    {
        // Counted rather than compared pairwise, as in DocumentEndpoints, so a third target
        // would be one more entry rather than a rewrite.
        var targets = new[] { equipmentId, storageLocationId }.Count(t => t.HasValue);
        if (targets != 1)
            return Results.ValidationProblem(new Dictionary<string, string[]>
                { ["target"] = ["Set exactly one of EquipmentId or StorageLocationId."] });

        var exists = equipmentId is Guid e
            ? await db.Equipment.AnyAsync(x => x.Id == e)
            : await db.StorageLocations.AnyAsync(x => x.Id == storageLocationId);
        return exists ? null : Results.NotFound();
    }
}
