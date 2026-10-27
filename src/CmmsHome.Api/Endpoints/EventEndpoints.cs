using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using CmmsHome.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Endpoints;

public static class EventEndpoints
{
    static readonly string[] ValidTypes = ["maintenance", "repair", "cleaning", "replacement"];

    public static void MapEventEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/events").WithTags("Events");

        group.MapGet("/", async (Guid? equipment_id, Guid? storage_location_id, CmmsDbContext db, ActorAccessor accessor) =>
        {
            var actor = await accessor.GetAsync();

            // A label scan must name the item it scanned: unfiltered, this route would turn
            // one printed label into the whole house's maintenance history.
            if (!actor.MayTouchTarget(equipment_id, storage_location_id))
                return LabelScope.Denied();

            var query = db.Events.AsQueryable();
            if (equipment_id.HasValue)
                query = query.Where(e => e.EquipmentId == equipment_id.Value);
            // Literal: events logged on this place, not on what is stored in it.
            if (storage_location_id.HasValue)
                query = query.Where(e => e.StorageLocationId == storage_location_id.Value);
            return Results.Ok(await query.OrderByDescending(e => e.CreatedAt).ToListAsync());
        }).RequirePermission(Permissions.EventsRead).AllowLabelScope();

        group.MapGet("/{id:guid}", async (Guid id, CmmsDbContext db, ActorAccessor accessor) =>
        {
            var evt = await db.Events.FindAsync(id);
            if (evt is null) return Results.NotFound();

            // The scope is on the item, not the event, so the event has to be loaded before
            // it can be judged.
            var actor = await accessor.GetAsync();
            if (!actor.MayTouchTarget(evt.EquipmentId, evt.StorageLocationId)) return LabelScope.Denied();

            return Results.Ok(evt);
        }).RequirePermission(Permissions.EventsRead).AllowLabelScope();

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
        }).RequirePermission(Permissions.EventsEdit);

        group.MapPost("/", async (CreateEventDto dto, CmmsDbContext db, ActorAccessor accessor) =>
        {
            if (!ValidTypes.Contains(dto.Type))
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["type"] = [$"Type must be one of: {string.Join(", ", ValidTypes)}"] });

            // The whole point of the label flow, so also the route most worth pinning down:
            // a scanned label may log against that one item (or place) and nothing else.
            var actor = await accessor.GetAsync();
            if (!actor.MayTouchTarget(dto.EquipmentId, dto.StorageLocationId)) return LabelScope.Denied();

            if (await MaintenanceTarget.ValidateAsync(dto.EquipmentId, dto.StorageLocationId, db) is { } invalid)
                return invalid;

            // Default to now, but allow back-dating a forgotten task to when it was done.
            var occurredAt = DateTime.SpecifyKind(dto.OccurredAt ?? DateTime.UtcNow, DateTimeKind.Utc);
            var evt = new MaintenanceEvent
            {
                Id = Guid.NewGuid(),
                EquipmentId = dto.EquipmentId,
                StorageLocationId = dto.StorageLocationId,
                Type = dto.Type,
                Note = dto.Note,
                PhotoUrl = dto.PhotoUrl,
                CreatedAt = occurredAt,
                // Null for a label scan, which is the honest answer: whoever held the label.
                CreatedByUserId = actor.User?.Id
            };
            db.Events.Add(evt);

            // Advance each interval rule's countdown to when the work was done — but never
            // backwards, so logging an older forgotten event can't regress a schedule
            // that a more recent event already advanced. Due-date schedules are anchored to
            // an explicit next-due date instead, so logging never touches them.
            await db.Rules
                .Where(r => r.EquipmentId == dto.EquipmentId && r.StorageLocationId == dto.StorageLocationId
                            && r.ScheduleType == ScheduleType.Interval)
                .ExecuteUpdateAsync(s => s.SetProperty(
                    r => r.LastDoneAt,
                    r => r.LastDoneAt == null || occurredAt > r.LastDoneAt ? occurredAt : r.LastDoneAt));

            await db.SaveChangesAsync();
            return Results.Created($"/events/{evt.Id}", evt);
        }).RequirePermission(Permissions.EventsCreate).AllowLabelScope();
    }
}

record CreateEventDto(Guid? EquipmentId, Guid? StorageLocationId, string Type, string? Note, string? PhotoUrl, DateTime? OccurredAt);
record UpdateEventDto(string Type, string? Note, DateTime? OccurredAt);
