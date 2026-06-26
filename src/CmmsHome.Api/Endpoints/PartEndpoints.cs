using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Endpoints;

public static class PartEndpoints
{
    public static void MapPartEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/parts").WithTags("Parts");

        group.MapGet("/", async (bool? low_stock, Guid? asset_id, Guid? box_id, Guid? shelf_id, CmmsDbContext db) =>
        {
            var q = db.Parts
                .Include(p => p.Box).ThenInclude(b => b!.Shelf).ThenInclude(s => s!.Location)
                .Include(p => p.Box).ThenInclude(b => b!.Location)
                .Include(p => p.Shelf).ThenInclude(s => s!.Location)
                .Include(p => p.Location)
                .Include(p => p.Asset)
                .Include(p => p.PartCategory)
                .AsQueryable();

            if (low_stock == true)
                q = q.Where(p => p.MinQuantity != null && p.Quantity <= p.MinQuantity);

            if (asset_id.HasValue)
                q = q.Where(p => p.AssetId == asset_id.Value);

            if (box_id.HasValue)
                q = q.Where(p => p.BoxId == box_id.Value);

            // A shelf's contents: parts loose on the shelf, plus parts in boxes on that shelf.
            if (shelf_id.HasValue)
                q = q.Where(p => p.ShelfId == shelf_id.Value || p.Box!.ShelfId == shelf_id.Value);

            return await q.OrderBy(p => p.Name).ToListAsync();
        });

        group.MapGet("/{id:guid}", async (Guid id, CmmsDbContext db) =>
        {
            var part = await db.Parts
                .Include(p => p.Box).ThenInclude(b => b!.Shelf).ThenInclude(s => s!.Location)
                .Include(p => p.Box).ThenInclude(b => b!.Location)
                .Include(p => p.Shelf).ThenInclude(s => s!.Location)
                .Include(p => p.Location)
                .Include(p => p.Asset)
                .Include(p => p.PartCategory)
                .FirstOrDefaultAsync(p => p.Id == id);
            return part is not null ? Results.Ok(part) : Results.NotFound();
        });

        group.MapPost("/", async (CreatePartDto dto, CmmsDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(dto.Name))
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["name"] = ["Name is required"] });
            if (string.IsNullOrWhiteSpace(dto.Unit))
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["unit"] = ["Unit is required"] });

            var part = new Part
            {
                Id = Guid.NewGuid(),
                Name = dto.Name.Trim(),
                Quantity = dto.Quantity,
                Unit = dto.Unit.Trim(),
                MinQuantity = dto.MinQuantity,
                AssetId = dto.AssetId,
                PartCategoryId = dto.PartCategoryId,
                BoxId = dto.BoxId,
                ShelfId = dto.ShelfId,
                LocationId = dto.LocationId,
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
            part.AssetId = dto.AssetId;
            part.PartCategoryId = dto.PartCategoryId;
            part.BoxId = dto.BoxId;
            part.ShelfId = dto.ShelfId;
            part.LocationId = dto.LocationId;
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
        await db.Entry(part).Reference(p => p.Box).LoadAsync();
        if (part.Box is not null)
        {
            await db.Entry(part.Box).Reference(b => b.Shelf).LoadAsync();
            if (part.Box.Shelf is not null)
                await db.Entry(part.Box.Shelf).Reference(s => s.Location).LoadAsync();
            await db.Entry(part.Box).Reference(b => b.Location).LoadAsync();
        }
        await db.Entry(part).Reference(p => p.Shelf).LoadAsync();
        if (part.Shelf is not null)
            await db.Entry(part.Shelf).Reference(s => s.Location).LoadAsync();
        await db.Entry(part).Reference(p => p.Location).LoadAsync();
        await db.Entry(part).Reference(p => p.Asset).LoadAsync();
        await db.Entry(part).Reference(p => p.PartCategory).LoadAsync();
    }
}

record CreatePartDto(string Name, decimal Quantity, string Unit, decimal? MinQuantity,
    Guid? AssetId, Guid? PartCategoryId, Guid? BoxId, Guid? ShelfId, Guid? LocationId);
