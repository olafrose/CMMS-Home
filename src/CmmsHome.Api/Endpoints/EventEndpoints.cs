using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Endpoints;

public static class EventEndpoints
{
    static readonly string[] ValidTypes = ["maintenance", "repair", "cleaning", "replacement"];

    public static void MapEventEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/events").WithTags("Events");

        group.MapGet("/", async (Guid? asset_id, CmmsDbContext db) =>
        {
            var query = db.Events.AsQueryable();
            if (asset_id.HasValue)
                query = query.Where(e => e.AssetId == asset_id.Value);
            return await query.OrderByDescending(e => e.CreatedAt).ToListAsync();
        });

        group.MapGet("/{id:guid}", async (Guid id, CmmsDbContext db) =>
            await db.Events.FindAsync(id) is MaintenanceEvent evt
                ? Results.Ok(evt)
                : Results.NotFound());

        group.MapPost("/", async (CreateEventDto dto, CmmsDbContext db) =>
        {
            if (!ValidTypes.Contains(dto.Type))
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["type"] = [$"Type must be one of: {string.Join(", ", ValidTypes)}"] });

            if (!await db.Assets.AnyAsync(a => a.Id == dto.AssetId))
                return Results.NotFound();

            var now = DateTime.UtcNow;
            var evt = new MaintenanceEvent
            {
                Id = Guid.NewGuid(),
                AssetId = dto.AssetId,
                Type = dto.Type,
                Note = dto.Note,
                PhotoUrl = dto.PhotoUrl,
                CreatedAt = now
            };
            db.Events.Add(evt);

            // Reset the maintenance countdown for all rules on this asset
            await db.Rules
                .Where(r => r.AssetId == dto.AssetId)
                .ExecuteUpdateAsync(s => s.SetProperty(r => r.LastDoneAt, now));

            await db.SaveChangesAsync();
            return Results.Created($"/events/{evt.Id}", evt);
        });
    }
}

record CreateEventDto(Guid AssetId, string Type, string? Note, string? PhotoUrl);
