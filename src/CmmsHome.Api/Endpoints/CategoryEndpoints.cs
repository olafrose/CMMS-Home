using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using CmmsHome.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Endpoints;

public static class CategoryEndpoints
{
    public static void MapCategoryEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/categories").WithTags("Categories");

        group.MapGet("/", async (CmmsDbContext db) =>
            await db.Categories.OrderBy(c => c.Name).ToListAsync())
            .RequirePermission(Permissions.CategoriesRead);

        group.MapPost("/", async (CreateCategoryDto dto, CmmsDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(dto.Name))
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["name"] = ["Name is required"] });

            var category = new Category { Id = Guid.NewGuid(), Name = dto.Name.Trim() };
            db.Categories.Add(category);
            await db.SaveChangesAsync();
            return Results.Created($"/categories/{category.Id}", category);
        }).RequirePermission(Permissions.CategoriesManage);

        group.MapPut("/{id:guid}", async (Guid id, CreateCategoryDto dto, CmmsDbContext db) =>
        {
            var category = await db.Categories.FindAsync(id);
            if (category is null) return Results.NotFound();

            category.Name = dto.Name.Trim();
            await db.SaveChangesAsync();
            return Results.Ok(category);
        }).RequirePermission(Permissions.CategoriesManage);

        group.MapDelete("/{id:guid}", async (Guid id, CmmsDbContext db) =>
        {
            var category = await db.Categories.FindAsync(id);
            if (category is null) return Results.NotFound();
            db.Categories.Remove(category);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequirePermission(Permissions.CategoriesManage);
    }
}

record CreateCategoryDto(string Name);
