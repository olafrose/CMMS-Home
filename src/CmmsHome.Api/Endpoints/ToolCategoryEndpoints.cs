using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Endpoints;

public static class ToolCategoryEndpoints
{
    public static void MapToolCategoryEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/tool-categories").WithTags("ToolCategories");

        group.MapGet("/", async (CmmsDbContext db) =>
            await db.ToolCategories.OrderBy(c => c.Name).ToListAsync());

        group.MapPost("/", async (CreateToolCategoryDto dto, CmmsDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(dto.Name))
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["name"] = ["Name is required"] });

            var category = new ToolCategory { Id = Guid.NewGuid(), Name = dto.Name.Trim() };
            db.ToolCategories.Add(category);
            await db.SaveChangesAsync();
            return Results.Created($"/tool-categories/{category.Id}", category);
        });

        group.MapPut("/{id:guid}", async (Guid id, CreateToolCategoryDto dto, CmmsDbContext db) =>
        {
            var category = await db.ToolCategories.FindAsync(id);
            if (category is null) return Results.NotFound();

            category.Name = dto.Name.Trim();
            await db.SaveChangesAsync();
            return Results.Ok(category);
        });

        group.MapDelete("/{id:guid}", async (Guid id, CmmsDbContext db) =>
        {
            var category = await db.ToolCategories.FindAsync(id);
            if (category is null) return Results.NotFound();
            db.ToolCategories.Remove(category);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }
}

record CreateToolCategoryDto(string Name);
