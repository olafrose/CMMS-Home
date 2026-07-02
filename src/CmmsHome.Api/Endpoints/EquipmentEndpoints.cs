using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Endpoints;

public static class EquipmentEndpoints
{
    public static void MapEquipmentEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/equipment").WithTags("Equipment");

        group.MapGet("/", async (string? kind, Guid? location_id, bool? on_loan, bool? maintained, CmmsDbContext db) =>
        {
            var q = db.Equipment
                .Include(e => e.Category)
                .Include(e => e.StorageLocation)
                .Include(e => e.UsedOnEquipment)
                .Include(e => e.Loans.Where(l => l.ReturnedAt == null))
                .AsQueryable();

            // 'asset' view = Asset + Both; 'tool' view = Tool + Both.
            if (kind == "asset") q = q.Where(e => e.Kind == EquipmentKind.Asset || e.Kind == EquipmentKind.Both);
            else if (kind == "tool") q = q.Where(e => e.Kind == EquipmentKind.Tool || e.Kind == EquipmentKind.Both);

            if (location_id.HasValue) q = q.Where(e => e.StorageLocationId == location_id.Value);
            if (on_loan == true) q = q.Where(e => e.Loans.Any(l => l.ReturnedAt == null));
            if (maintained == true) q = q.Where(e => e.Rules.Any());

            return await q.OrderBy(e => e.Name).ToListAsync();
        });

        group.MapGet("/{id:guid}", async (Guid id, CmmsDbContext db) =>
        {
            var e = await LoadOne(db, id);
            return e is not null ? Results.Ok(e) : Results.NotFound();
        });

        group.MapPost("/", async (SaveEquipmentDto dto, CmmsDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(dto.Name))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["name"] = ["Name is required"] });

            var e = new Equipment
            {
                Id = Guid.NewGuid(),
                Name = dto.Name.Trim(),
                Kind = dto.Kind,
                CategoryId = dto.CategoryId,
                StorageLocationId = dto.StorageLocationId,
                ImageUrl = dto.ImageUrl,
                Notes = string.IsNullOrWhiteSpace(dto.Notes) ? null : dto.Notes!.Trim(),
                UsedOnEquipmentId = dto.UsedOnEquipmentId,
                CreatedAt = DateTime.UtcNow,
            };
            db.Equipment.Add(e);
            await db.SaveChangesAsync();
            return Results.Created($"/equipment/{e.Id}", await LoadOne(db, e.Id));
        });

        group.MapPut("/{id:guid}", async (Guid id, SaveEquipmentDto dto, CmmsDbContext db) =>
        {
            var e = await db.Equipment.FindAsync(id);
            if (e is null) return Results.NotFound();

            e.Name = dto.Name?.Trim() ?? e.Name;
            e.Kind = dto.Kind;
            e.CategoryId = dto.CategoryId;
            e.StorageLocationId = dto.StorageLocationId;
            e.ImageUrl = dto.ImageUrl;
            e.Notes = string.IsNullOrWhiteSpace(dto.Notes) ? null : dto.Notes!.Trim();
            e.UsedOnEquipmentId = dto.UsedOnEquipmentId == id ? null : dto.UsedOnEquipmentId; // no self-cycle
            await db.SaveChangesAsync();
            return Results.Ok(await LoadOne(db, id));
        });

        group.MapDelete("/{id:guid}", async (Guid id, CmmsDbContext db) =>
        {
            var e = await db.Equipment.FindAsync(id);
            if (e is null) return Results.NotFound();
            db.Equipment.Remove(e);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        group.MapPost("/{id:guid}/checkout", async (Guid id, CheckoutDto dto, CmmsDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(dto.Borrower))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["borrower"] = ["Borrower is required"] });

            var e = await db.Equipment.FindAsync(id);
            if (e is null) return Results.NotFound();
            if (await db.EquipmentLoans.AnyAsync(l => l.EquipmentId == id && l.ReturnedAt == null))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["borrower"] = ["Already on loan"] });

            db.EquipmentLoans.Add(new EquipmentLoan { Id = Guid.NewGuid(), EquipmentId = id, Borrower = dto.Borrower.Trim() });
            await db.SaveChangesAsync();
            return Results.Ok(await LoadOne(db, id));
        });

        group.MapPost("/{id:guid}/return", async (Guid id, CmmsDbContext db) =>
        {
            var e = await db.Equipment.FindAsync(id);
            if (e is null) return Results.NotFound();
            var open = await db.EquipmentLoans.FirstOrDefaultAsync(l => l.EquipmentId == id && l.ReturnedAt == null);
            if (open is null)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["loan"] = ["Not on loan"] });

            open.ReturnedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(await LoadOne(db, id));
        });
    }

    private static Task<Equipment?> LoadOne(CmmsDbContext db, Guid id) =>
        db.Equipment
            .Include(e => e.Category)
            .Include(e => e.StorageLocation)
            .Include(e => e.UsedOnEquipment)
            .Include(e => e.Loans.Where(l => l.ReturnedAt == null))
            .FirstOrDefaultAsync(e => e.Id == id);
}

record SaveEquipmentDto(string Name, EquipmentKind Kind, Guid? CategoryId, Guid? StorageLocationId,
    string? ImageUrl, string? Notes, Guid? UsedOnEquipmentId);

record CheckoutDto(string Borrower);
