using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Endpoints;

public static class LocationEndpoints
{
    public static void MapLocationEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/locations").WithTags("Locations");

        group.MapGet("/", async (CmmsDbContext db) =>
            await db.Locations.OrderBy(l => l.Name).ToListAsync());

        group.MapPost("/", async (CreateLocationDto dto, CmmsDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(dto.Name))
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["name"] = ["Name is required"] });

            var location = new Location { Id = Guid.NewGuid(), Name = dto.Name.Trim() };
            db.Locations.Add(location);
            await db.SaveChangesAsync();
            return Results.Created($"/locations/{location.Id}", location);
        });

        group.MapPut("/{id:guid}", async (Guid id, CreateLocationDto dto, CmmsDbContext db) =>
        {
            var location = await db.Locations.FindAsync(id);
            if (location is null) return Results.NotFound();

            location.Name = dto.Name.Trim();
            await db.SaveChangesAsync();
            return Results.Ok(location);
        });

        group.MapDelete("/{id:guid}", async (Guid id, CmmsDbContext db) =>
        {
            var location = await db.Locations.FindAsync(id);
            if (location is null) return Results.NotFound();
            db.Locations.Remove(location);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }
}

record CreateLocationDto(string Name);
