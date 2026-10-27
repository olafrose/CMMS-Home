using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using CmmsHome.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Endpoints;

public static class PartEndpoints
{
    public static void MapPartEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/parts").WithTags("Parts");

        group.MapGet("/", async (bool? low_stock, Guid? equipment_id, Guid? location_id, CmmsDbContext db) =>
        {
            var q = db.Parts
                .Include(p => p.StorageLocation)
                .Include(p => p.Equipment)
                .Include(p => p.PartCategory)
                .AsQueryable();

            if (low_stock == true)
                q = q.Where(p => p.MinQuantity != null && p.Quantity <= p.MinQuantity);
            if (equipment_id.HasValue)
                q = q.Where(p => p.Equipment.Any(e => e.Id == equipment_id.Value));
            if (location_id.HasValue)
                q = q.Where(p => p.StorageLocationId == location_id.Value);

            return await q.OrderBy(p => p.Name).ToListAsync();
        }).RequirePermission(Permissions.PartsList);

        group.MapGet("/{id:guid}", async (Guid id, CmmsDbContext db) =>
        {
            var part = await db.Parts
                .Include(p => p.StorageLocation)
                .Include(p => p.Equipment)
                .Include(p => p.PartCategory)
                .FirstOrDefaultAsync(p => p.Id == id);
            return part is not null ? Results.Ok(part) : Results.NotFound();
        }).RequirePermission(Permissions.PartsRead);

        group.MapPost("/", async (CreatePartDto dto, CmmsDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(dto.Name))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["name"] = ["Name is required"] });
            if (string.IsNullOrWhiteSpace(dto.Unit))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["unit"] = ["Unit is required"] });

            var part = new Part
            {
                Id = Guid.NewGuid(),
                Name = dto.Name.Trim(),
                Quantity = dto.Quantity,
                Unit = dto.Unit.Trim(),
                MinQuantity = dto.MinQuantity,
                PartCategoryId = dto.PartCategoryId,
                StorageLocationId = dto.StorageLocationId,
                Equipment = await ResolveEquipment(db, dto.EquipmentIds),
            };
            db.Parts.Add(part);
            await db.SaveChangesAsync();
            await LoadNavProperties(db, part);
            return Results.Created($"/parts/{part.Id}", part);
        }).RequirePermission(Permissions.PartsWrite);

        group.MapPut("/{id:guid}", async (Guid id, CreatePartDto dto, CmmsDbContext db) =>
        {
            var part = await db.Parts
                .Include(p => p.Equipment)
                .FirstOrDefaultAsync(p => p.Id == id);
            if (part is null) return Results.NotFound();

            part.Name = dto.Name.Trim();
            part.Quantity = dto.Quantity;
            part.Unit = dto.Unit.Trim();
            part.MinQuantity = dto.MinQuantity;
            part.PartCategoryId = dto.PartCategoryId;
            part.StorageLocationId = dto.StorageLocationId;

            // Reconcile the asset links to the requested set.
            part.Equipment.Clear();
            part.Equipment.AddRange(await ResolveEquipment(db, dto.EquipmentIds));

            await db.SaveChangesAsync();
            await LoadNavProperties(db, part);
            return Results.Ok(part);
        }).RequirePermission(Permissions.PartsWrite);

        group.MapDelete("/{id:guid}", async (Guid id, CmmsDbContext db) =>
        {
            var part = await db.Parts.FindAsync(id);
            if (part is null) return Results.NotFound();
            db.Parts.Remove(part);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequirePermission(Permissions.PartsDelete);
    }

    private static async Task LoadNavProperties(CmmsDbContext db, Part part)
    {
        await db.Entry(part).Reference(p => p.StorageLocation).LoadAsync();
        await db.Entry(part).Collection(p => p.Equipment).LoadAsync();
        await db.Entry(part).Reference(p => p.PartCategory).LoadAsync();
    }

    // Load the Equipment entities for the given ids (deduped; missing ids ignored).
    private static async Task<List<Equipment>> ResolveEquipment(CmmsDbContext db, List<Guid>? ids)
    {
        if (ids is null || ids.Count == 0) return [];
        var distinct = ids.Distinct().ToList();
        return await db.Equipment.Where(e => distinct.Contains(e.Id)).ToListAsync();
    }
}

record CreatePartDto(string Name, decimal Quantity, string Unit, decimal? MinQuantity,
    List<Guid>? EquipmentIds, Guid? PartCategoryId, Guid? StorageLocationId);
