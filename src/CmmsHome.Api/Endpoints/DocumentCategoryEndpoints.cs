using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using CmmsHome.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Endpoints;

public static class DocumentCategoryEndpoints
{
    public static void MapDocumentCategoryEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/document-categories").WithTags("DocumentCategories");

        group.MapGet("/", async (CmmsDbContext db) =>
            await db.DocumentCategories.OrderBy(c => c.Name).ToListAsync())
            .RequirePermission(Permissions.CategoriesRead);

        group.MapPost("/", async (SaveDocumentCategoryDto dto, CmmsDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(dto.Name))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["name"] = ["Name is required"] });

            var cat = new DocumentCategory
            {
                Id = Guid.NewGuid(),
                Name = dto.Name.Trim(),
                Sensitive = dto.Sensitive,
                Color = string.IsNullOrWhiteSpace(dto.Color) ? null : dto.Color.Trim(),
            };
            db.DocumentCategories.Add(cat);
            await db.SaveChangesAsync();
            return Results.Created($"/document-categories/{cat.Id}", cat);
        }).RequirePermission(Permissions.CategoriesManage);

        group.MapPut("/{id:guid}", async (Guid id, SaveDocumentCategoryDto dto, CmmsDbContext db) =>
        {
            var cat = await db.DocumentCategories.FindAsync(id);
            if (cat is null) return Results.NotFound();

            cat.Name = dto.Name.Trim();
            cat.Sensitive = dto.Sensitive;
            cat.Color = string.IsNullOrWhiteSpace(dto.Color) ? null : dto.Color.Trim();
            await db.SaveChangesAsync();
            return Results.Ok(cat);
        }).RequirePermission(Permissions.CategoriesManage);

        group.MapDelete("/{id:guid}", async (Guid id, CmmsDbContext db) =>
        {
            var cat = await db.DocumentCategories.FindAsync(id);
            if (cat is null) return Results.NotFound();
            db.DocumentCategories.Remove(cat); // documents in this category have CategoryId set null
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequirePermission(Permissions.CategoriesManage);
    }
}

record SaveDocumentCategoryDto(string Name, bool Sensitive, string? Color);
