using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
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
                q = q.Where(p => p.EquipmentId == equipment_id.Value);
            if (location_id.HasValue)
                q = q.Where(p => p.StorageLocationId == location_id.Value);

            return await q.OrderBy(p => p.Name).ToListAsync();
        });

        group.MapGet("/{id:guid}", async (Guid id, CmmsDbContext db) =>
        {
            var part = await db.Parts
                .Include(p => p.StorageLocation)
                .Include(p => p.Equipment)
                .Include(p => p.PartCategory)
                .FirstOrDefaultAsync(p => p.Id == id);
            return part is not null ? Results.Ok(part) : Results.NotFound();
        });

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
                EquipmentId = dto.EquipmentId,
                PartCategoryId = dto.PartCategoryId,
                StorageLocationId = dto.StorageLocationId,
            };
            db.Parts.Add(part);
            await db.SaveChangesAsync();
            await LoadNavProperties(db, part);
            return Results.Created($"/parts/{part.Id}", part);
        });

        group.MapPut("/{id:guid}", async (Guid id, CreatePartDto dto, CmmsDbContext db) =>
        {
            var part = await db.Parts.FindAsync(id);
            if (part is null) return Results.NotFound();

            part.Name = dto.Name.Trim();
            part.Quantity = dto.Quantity;
            part.Unit = dto.Unit.Trim();
            part.MinQuantity = dto.MinQuantity;
            part.EquipmentId = dto.EquipmentId;
            part.PartCategoryId = dto.PartCategoryId;
            part.StorageLocationId = dto.StorageLocationId;
            await db.SaveChangesAsync();
            await LoadNavProperties(db, part);
            return Results.Ok(part);
        });

        group.MapDelete("/{id:guid}", async (Guid id, CmmsDbContext db) =>
        {
            var part = await db.Parts.FindAsync(id);
            if (part is null) return Results.NotFound();
            db.Parts.Remove(part);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    private static async Task LoadNavProperties(CmmsDbContext db, Part part)
    {
        await db.Entry(part).Reference(p => p.StorageLocation).LoadAsync();
        await db.Entry(part).Reference(p => p.Equipment).LoadAsync();
        await db.Entry(part).Reference(p => p.PartCategory).LoadAsync();
    }
}

record CreatePartDto(string Name, decimal Quantity, string Unit, decimal? MinQuantity,
    Guid? EquipmentId, Guid? PartCategoryId, Guid? StorageLocationId);
