using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Endpoints;

public static class AssetEndpoints
{
    public static void MapAssetEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/assets").WithTags("Assets");

        group.MapGet("/", async (CmmsDbContext db) =>
            await db.Assets.Include(a => a.Category).Include(a => a.Location).ToListAsync());

        group.MapGet("/{id:guid}", async (Guid id, CmmsDbContext db) =>
            await db.Assets.Include(a => a.Category).Include(a => a.Location).FirstOrDefaultAsync(a => a.Id == id) is Asset asset
                ? Results.Ok(asset)
                : Results.NotFound());

        group.MapPost("/", async (CreateAssetDto dto, CmmsDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(dto.Name))
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["name"] = ["Name is required"] });

            var asset = new Asset
            {
                Id = Guid.NewGuid(),
                Name = dto.Name,
                CategoryId = dto.CategoryId,
                LocationId = dto.LocationId,
                ImageUrl = dto.ImageUrl,
                CreatedAt = DateTime.UtcNow
            };
            db.Assets.Add(asset);
            await db.SaveChangesAsync();
            await db.Entry(asset).Reference(a => a.Category).LoadAsync();
            await db.Entry(asset).Reference(a => a.Location).LoadAsync();
            return Results.Created($"/assets/{asset.Id}", asset);
        });

        group.MapPut("/{id:guid}", async (Guid id, CreateAssetDto dto, CmmsDbContext db) =>
        {
            var asset = await db.Assets.Include(a => a.Location).FirstOrDefaultAsync(a => a.Id == id);
            if (asset is null) return Results.NotFound();

            asset.Name = dto.Name ?? asset.Name;
            asset.CategoryId = dto.CategoryId;
            asset.LocationId = dto.LocationId;
            asset.ImageUrl = dto.ImageUrl;
            await db.SaveChangesAsync();
            await db.Entry(asset).Reference(a => a.Category).LoadAsync();
            await db.Entry(asset).Reference(a => a.Location).LoadAsync();
            return Results.Ok(asset);
        });

        group.MapDelete("/{id:guid}", async (Guid id, CmmsDbContext db) =>
        {
            var asset = await db.Assets.FindAsync(id);
            if (asset is null) return Results.NotFound();
            db.Assets.Remove(asset);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }
}

record CreateAssetDto(string Name, Guid? CategoryId, Guid? LocationId, string? ImageUrl);
