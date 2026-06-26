using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Endpoints;

public static class PartCategoryEndpoints
{
    public static void MapPartCategoryEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/part-categories").WithTags("PartCategories");

        group.MapGet("/", async (CmmsDbContext db) =>
            await db.PartCategories.OrderBy(c => c.Name).ToListAsync());

        group.MapPost("/", async (CreatePartCategoryDto dto, CmmsDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(dto.Name))
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["name"] = ["Name is required"] });

            var category = new PartCategory { Id = Guid.NewGuid(), Name = dto.Name.Trim() };
            db.PartCategories.Add(category);
            await db.SaveChangesAsync();
            return Results.Created($"/part-categories/{category.Id}", category);
        });

        group.MapPut("/{id:guid}", async (Guid id, CreatePartCategoryDto dto, CmmsDbContext db) =>
        {
            var category = await db.PartCategories.FindAsync(id);
            if (category is null) return Results.NotFound();

            category.Name = dto.Name.Trim();
            await db.SaveChangesAsync();
            return Results.Ok(category);
        });

        group.MapDelete("/{id:guid}", async (Guid id, CmmsDbContext db) =>
        {
            var category = await db.PartCategories.FindAsync(id);
            if (category is null) return Results.NotFound();
            db.PartCategories.Remove(category);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }
}

record CreatePartCategoryDto(string Name);
