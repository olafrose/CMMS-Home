using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Endpoints;

public static class ShelfEndpoints
{
    public static void MapShelfEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/shelves").WithTags("Shelves");

        group.MapGet("/", async (Guid? location_id, CmmsDbContext db) =>
        {
            var q = db.Shelves.Include(s => s.Location).AsQueryable();
            if (location_id.HasValue) q = q.Where(s => s.LocationId == location_id);
            return await q.OrderBy(s => s.Name).ToListAsync();
        });

        group.MapPost("/", async (CreateShelfDto dto, CmmsDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(dto.Name))
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["name"] = ["Name is required"] });

            if (!await db.Locations.AnyAsync(l => l.Id == dto.LocationId))
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["locationId"] = ["Location not found"] });

            var shelf = new Shelf { Id = Guid.NewGuid(), Name = dto.Name.Trim(), LocationId = dto.LocationId };
            db.Shelves.Add(shelf);
            await db.SaveChangesAsync();
            await db.Entry(shelf).Reference(s => s.Location).LoadAsync();
            return Results.Created($"/shelves/{shelf.Id}", shelf);
        });

        group.MapPut("/{id:guid}", async (Guid id, CreateShelfDto dto, CmmsDbContext db) =>
        {
            var shelf = await db.Shelves.FindAsync(id);
            if (shelf is null) return Results.NotFound();

            shelf.Name = dto.Name.Trim();
            shelf.LocationId = dto.LocationId;
            await db.SaveChangesAsync();
            await db.Entry(shelf).Reference(s => s.Location).LoadAsync();
            return Results.Ok(shelf);
        });

        group.MapDelete("/{id:guid}", async (Guid id, CmmsDbContext db) =>
        {
            var shelf = await db.Shelves.FindAsync(id);
            if (shelf is null) return Results.NotFound();
            db.Shelves.Remove(shelf);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }
}

record CreateShelfDto(string Name, Guid LocationId);
