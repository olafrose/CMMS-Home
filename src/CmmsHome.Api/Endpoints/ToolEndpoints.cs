using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Endpoints;

public static class ToolEndpoints
{
    public static void MapToolEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/tools").WithTags("Tools");

        group.MapGet("/", async (bool? on_loan, Guid? asset_id, Guid? box_id, Guid? shelf_id, CmmsDbContext db) =>
        {
            var q = db.Tools
                .Include(t => t.Box).ThenInclude(b => b!.Shelf).ThenInclude(s => s!.Location)
                .Include(t => t.Box).ThenInclude(b => b!.Location)
                .Include(t => t.Shelf).ThenInclude(s => s!.Location)
                .Include(t => t.Location)
                .Include(t => t.Asset)
                .Include(t => t.ToolCategory)
                .Include(t => t.Loans.Where(l => l.ReturnedAt == null))
                .AsQueryable();

            if (on_loan == true)
                q = q.Where(t => t.Loans.Any(l => l.ReturnedAt == null));

            if (asset_id.HasValue)
                q = q.Where(t => t.AssetId == asset_id.Value);

            if (box_id.HasValue)
                q = q.Where(t => t.BoxId == box_id.Value);

            // A shelf's contents: tools loose on the shelf, plus tools in boxes on that shelf.
            if (shelf_id.HasValue)
                q = q.Where(t => t.ShelfId == shelf_id.Value || t.Box!.ShelfId == shelf_id.Value);

            return await q.OrderBy(t => t.Name).ToListAsync();
        });

        group.MapGet("/{id:guid}", async (Guid id, CmmsDbContext db) =>
        {
            var tool = await db.Tools
                .Include(t => t.Box).ThenInclude(b => b!.Shelf).ThenInclude(s => s!.Location)
                .Include(t => t.Box).ThenInclude(b => b!.Location)
                .Include(t => t.Shelf).ThenInclude(s => s!.Location)
                .Include(t => t.Location)
                .Include(t => t.Asset)
                .Include(t => t.ToolCategory)
                .Include(t => t.Loans.Where(l => l.ReturnedAt == null))
                .FirstOrDefaultAsync(t => t.Id == id);
            return tool is not null ? Results.Ok(tool) : Results.NotFound();
        });

        group.MapPost("/", async (CreateToolDto dto, CmmsDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(dto.Name))
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["name"] = ["Name is required"] });

            var tool = new Tool
            {
                Id = Guid.NewGuid(),
                Name = dto.Name.Trim(),
                Notes = string.IsNullOrWhiteSpace(dto.Notes) ? null : dto.Notes.Trim(),
                AssetId = dto.AssetId,
                ToolCategoryId = dto.ToolCategoryId,
                BoxId = dto.BoxId,
                ShelfId = dto.ShelfId,
                LocationId = dto.LocationId,
            };
            db.Tools.Add(tool);
            await db.SaveChangesAsync();
            await LoadNavProperties(db, tool);
            return Results.Created($"/tools/{tool.Id}", tool);
        });

        group.MapPut("/{id:guid}", async (Guid id, CreateToolDto dto, CmmsDbContext db) =>
        {
            var tool = await db.Tools.FindAsync(id);
            if (tool is null) return Results.NotFound();

            tool.Name = dto.Name.Trim();
            tool.Notes = string.IsNullOrWhiteSpace(dto.Notes) ? null : dto.Notes.Trim();
            tool.AssetId = dto.AssetId;
            tool.ToolCategoryId = dto.ToolCategoryId;
            tool.BoxId = dto.BoxId;
            tool.ShelfId = dto.ShelfId;
            tool.LocationId = dto.LocationId;
            await db.SaveChangesAsync();
            await LoadNavProperties(db, tool);
            return Results.Ok(tool);
        });

        group.MapDelete("/{id:guid}", async (Guid id, CmmsDbContext db) =>
        {
            var tool = await db.Tools.FindAsync(id);
            if (tool is null) return Results.NotFound();
            db.Tools.Remove(tool);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        group.MapPost("/{id:guid}/checkout", async (Guid id, CheckoutDto dto, CmmsDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(dto.Borrower))
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["borrower"] = ["Borrower is required"] });

            var tool = await db.Tools.FindAsync(id);
            if (tool is null) return Results.NotFound();

            var alreadyOut = await db.ToolLoans.AnyAsync(l => l.ToolId == id && l.ReturnedAt == null);
            if (alreadyOut)
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["borrower"] = ["Tool is already on loan"] });

            db.ToolLoans.Add(new ToolLoan
            {
                Id = Guid.NewGuid(),
                ToolId = id,
                Borrower = dto.Borrower.Trim(),
            });
            await db.SaveChangesAsync();
            return await GetToolResult(db, id);
        });

        group.MapPost("/{id:guid}/return", async (Guid id, CmmsDbContext db) =>
        {
            var tool = await db.Tools.FindAsync(id);
            if (tool is null) return Results.NotFound();

            var openLoan = await db.ToolLoans
                .FirstOrDefaultAsync(l => l.ToolId == id && l.ReturnedAt == null);
            if (openLoan is null)
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["loan"] = ["Tool is not on loan"] });

            openLoan.ReturnedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return await GetToolResult(db, id);
        });
    }

    private static async Task<IResult> GetToolResult(CmmsDbContext db, Guid id)
    {
        var tool = await db.Tools
            .Include(t => t.Box).ThenInclude(b => b!.Shelf).ThenInclude(s => s!.Location)
            .Include(t => t.Box).ThenInclude(b => b!.Location)
            .Include(t => t.Shelf).ThenInclude(s => s!.Location)
            .Include(t => t.Location)
            .Include(t => t.Asset)
            .Include(t => t.ToolCategory)
            .Include(t => t.Loans.Where(l => l.ReturnedAt == null))
            .FirstOrDefaultAsync(t => t.Id == id);
        return tool is not null ? Results.Ok(tool) : Results.NotFound();
    }

    private static async Task LoadNavProperties(CmmsDbContext db, Tool tool)
    {
        await db.Entry(tool).Reference(t => t.Box).LoadAsync();
        if (tool.Box is not null)
        {
            await db.Entry(tool.Box).Reference(b => b.Shelf).LoadAsync();
            if (tool.Box.Shelf is not null)
                await db.Entry(tool.Box.Shelf).Reference(s => s.Location).LoadAsync();
            await db.Entry(tool.Box).Reference(b => b.Location).LoadAsync();
        }
        await db.Entry(tool).Reference(t => t.Shelf).LoadAsync();
        if (tool.Shelf is not null)
            await db.Entry(tool.Shelf).Reference(s => s.Location).LoadAsync();
        await db.Entry(tool).Reference(t => t.Location).LoadAsync();
        await db.Entry(tool).Reference(t => t.Asset).LoadAsync();
        await db.Entry(tool).Reference(t => t.ToolCategory).LoadAsync();
        await db.Entry(tool).Collection(t => t.Loans).Query().Where(l => l.ReturnedAt == null).LoadAsync();
    }
}

record CreateToolDto(string Name, string? Notes, Guid? AssetId, Guid? ToolCategoryId,
    Guid? BoxId, Guid? ShelfId, Guid? LocationId);

record CheckoutDto(string Borrower);
