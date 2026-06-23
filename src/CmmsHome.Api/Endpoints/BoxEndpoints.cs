using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Endpoints;

public static class BoxEndpoints
{
    public static void MapBoxEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/boxes").WithTags("Boxes");

        group.MapGet("/", async (Guid? shelf_id, Guid? location_id, CmmsDbContext db) =>
        {
            var q = db.Boxes
                .Include(b => b.Shelf).ThenInclude(s => s!.Location)
                .Include(b => b.Location)
                .AsQueryable();
            if (shelf_id.HasValue) q = q.Where(b => b.ShelfId == shelf_id);
            if (location_id.HasValue) q = q.Where(b => b.LocationId == location_id || b.Shelf!.LocationId == location_id);
            return await q.OrderBy(b => b.Name).ToListAsync();
        });

        group.MapPost("/", async (CreateBoxDto dto, CmmsDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(dto.Name))
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["name"] = ["Name is required"] });

            if (dto.ShelfId is null && dto.LocationId is null)
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["storage"] = ["Either ShelfId or LocationId is required"] });

            var box = new StorageBox
            {
                Id = Guid.NewGuid(),
                Name = dto.Name.Trim(),
                ShelfId = dto.ShelfId,
                LocationId = dto.LocationId,
            };
            db.Boxes.Add(box);
            await db.SaveChangesAsync();
            await db.Entry(box).Reference(b => b.Shelf).LoadAsync();
            if (box.Shelf is not null) await db.Entry(box.Shelf).Reference(s => s.Location).LoadAsync();
            await db.Entry(box).Reference(b => b.Location).LoadAsync();
            return Results.Created($"/boxes/{box.Id}", box);
        });

        group.MapPut("/{id:guid}", async (Guid id, CreateBoxDto dto, CmmsDbContext db) =>
        {
            var box = await db.Boxes.FindAsync(id);
            if (box is null) return Results.NotFound();

            box.Name = dto.Name.Trim();
            box.ShelfId = dto.ShelfId;
            box.LocationId = dto.LocationId;
            await db.SaveChangesAsync();
            await db.Entry(box).Reference(b => b.Shelf).LoadAsync();
            if (box.Shelf is not null) await db.Entry(box.Shelf).Reference(s => s.Location).LoadAsync();
            await db.Entry(box).Reference(b => b.Location).LoadAsync();
            return Results.Ok(box);
        });

        group.MapDelete("/{id:guid}", async (Guid id, CmmsDbContext db) =>
        {
            var box = await db.Boxes.FindAsync(id);
            if (box is null) return Results.NotFound();
            db.Boxes.Remove(box);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }
}

record CreateBoxDto(string Name, Guid? ShelfId, Guid? LocationId);
