using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Endpoints;

public static class PartUsageEndpoints
{
    public static void MapPartUsageEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/part-usages").WithTags("PartUsages");

        group.MapGet("/", async (Guid? event_id, CmmsDbContext db) =>
        {
            var q = db.PartUsages
                .Include(u => u.Part)
                .AsQueryable();
            if (event_id.HasValue) q = q.Where(u => u.MaintenanceEventId == event_id);
            return await q.ToListAsync();
        });

        group.MapPost("/", async (CreatePartUsageDto dto, CmmsDbContext db) =>
        {
            var part = await db.Parts.FindAsync(dto.PartId);
            if (part is null) return Results.NotFound();

            var usage = new PartUsage
            {
                Id = Guid.NewGuid(),
                MaintenanceEventId = dto.MaintenanceEventId,
                PartId = dto.PartId,
                QuantityUsed = dto.QuantityUsed,
            };
            part.Quantity -= dto.QuantityUsed;
            db.PartUsages.Add(usage);
            await db.SaveChangesAsync();
            await db.Entry(usage).Reference(u => u.Part).LoadAsync();
            return Results.Created($"/part-usages/{usage.Id}", usage);
        });

        group.MapDelete("/{id:guid}", async (Guid id, CmmsDbContext db) =>
        {
            var usage = await db.PartUsages.Include(u => u.Part).FirstOrDefaultAsync(u => u.Id == id);
            if (usage is null) return Results.NotFound();

            usage.Part.Quantity += usage.QuantityUsed;
            db.PartUsages.Remove(usage);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }
}

record CreatePartUsageDto(Guid MaintenanceEventId, Guid PartId, decimal QuantityUsed);
