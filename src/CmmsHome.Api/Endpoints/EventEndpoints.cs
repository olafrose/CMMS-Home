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

        group.MapPut("/{id:guid}", async (Guid id, UpdateEventDto dto, CmmsDbContext db) =>
        {
            if (!ValidTypes.Contains(dto.Type))
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["type"] = [$"Type must be one of: {string.Join(", ", ValidTypes)}"] });

            var evt = await db.Events.FindAsync(id);
            if (evt is null) return Results.NotFound();

            evt.Type = dto.Type;
            evt.Note = dto.Note;
            // Allow correcting when it happened. Maintenance-rule countdowns are NOT
            // recomputed on edit (no per-event history to replay).
            if (dto.OccurredAt.HasValue)
                evt.CreatedAt = DateTime.SpecifyKind(dto.OccurredAt.Value, DateTimeKind.Utc);

            await db.SaveChangesAsync();
            return Results.Ok(evt);
        });

        group.MapPost("/", async (CreateEventDto dto, CmmsDbContext db) =>
        {
            if (!ValidTypes.Contains(dto.Type))
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["type"] = [$"Type must be one of: {string.Join(", ", ValidTypes)}"] });

            if (!await db.Assets.AnyAsync(a => a.Id == dto.AssetId))
                return Results.NotFound();

            // Default to now, but allow back-dating a forgotten task to when it was done.
            var occurredAt = DateTime.SpecifyKind(dto.OccurredAt ?? DateTime.UtcNow, DateTimeKind.Utc);
            var evt = new MaintenanceEvent
            {
                Id = Guid.NewGuid(),
                AssetId = dto.AssetId,
                Type = dto.Type,
                Note = dto.Note,
                PhotoUrl = dto.PhotoUrl,
                CreatedAt = occurredAt
            };
            db.Events.Add(evt);

            // Advance each rule's countdown to when the work was done — but never
            // backwards, so logging an older forgotten event can't regress a schedule
            // that a more recent event already advanced.
            await db.Rules
                .Where(r => r.AssetId == dto.AssetId)
                .ExecuteUpdateAsync(s => s.SetProperty(
                    r => r.LastDoneAt,
                    r => r.LastDoneAt == null || occurredAt > r.LastDoneAt ? occurredAt : r.LastDoneAt));

            await db.SaveChangesAsync();
            return Results.Created($"/events/{evt.Id}", evt);
        });
    }
}

record CreateEventDto(Guid AssetId, string Type, string? Note, string? PhotoUrl, DateTime? OccurredAt);
record UpdateEventDto(string Type, string? Note, DateTime? OccurredAt);
