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

        group.MapPost("/", async (CreateEventDto dto, CmmsDbContext db, ActorAccessor accessor, MeterService meters) =>
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

            // The event, any meter readings typed into the log form, and the schedules they
            // restart all land together or not at all: a refused reading must not leave an
            // event behind that restarted its schedules from the wrong count.
            await using var tx = await db.Database.BeginTransactionAsync();
            var meterTime = MeterService.MeterTimeFor(occurredAt);

            // Readings taken at the time of the work, from the log form's optional "meter
            // readings" field. Only recorded for a caller who may record readings, and only
            // for this item's meters; otherwise quietly skipped, so a label scan still logs
            // in one tap rather than failing on a field it was never offered.
            if (dto.MeterReadings is { Count: > 0 } typed && dto.EquipmentId is Guid eqId
                && actor.Can(Permissions.MetersRecord))
            {
                var ids = typed.Select(r => r.MeterId).ToList();
                var owned = await db.Meters.Where(m => m.EquipmentId == eqId && ids.Contains(m.Id)).ToListAsync();
                foreach (var meter in owned)
                {
                    var value = typed.First(r => r.MeterId == meter.Id).Value;
                    var result = await meters.RecordAsync(meter, value - meter.Offset, meterTime,
                        MeterService.SourceEvent, actor.User?.Id);
                    if (!result.Succeeded)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]> { [$"meterReadings.{meter.Id}"] = [result.Error!] },
                            statusCode: result.Status);
                }
            }

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

            // Usage rules restart from the meter's count at the time of the work.
            if (dto.EquipmentId is Guid equipmentId)
                await meters.AdvanceUsageRulesAsync(equipmentId, occurredAt, meterTime);

            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Created($"/events/{evt.Id}", evt);
        }).RequirePermission(Permissions.EventsCreate).AllowLabelScope();

        group.MapEventDelete();
    }
}

static class EventDeletion
{
    // Removing a logged event undoes what logging it did, and nothing more. In one
    // transaction: parts it consumed go back into stock (as DELETE /part-usages does), and
    // schedules whose baseline came from it revert to the previous remaining entry on the
    // same target. Document links to it cascade away; the documents survive, unlinked.
    // Meter readings recorded alongside it are kept: they are facts about the counter, not
    // about the service.
    public static void MapEventDelete(this RouteGroupBuilder group) =>
        group.MapDelete("/{id:guid}", async (Guid id, CmmsDbContext db, MeterService meters) =>
        {
            var evt = await db.Events.FindAsync(id);
            if (evt is null) return Results.NotFound();

            await using var tx = await db.Database.BeginTransactionAsync();

            var usages = await db.PartUsages.Include(u => u.Part).Where(u => u.MaintenanceEventId == id).ToListAsync();
            foreach (var usage in usages) usage.Part.Quantity += usage.QuantityUsed;

            // The latest entry that will remain on this target — what schedules fall back to.
            var previousAt = await db.Events
                .Where(e => e.Id != id && e.EquipmentId == evt.EquipmentId && e.StorageLocationId == evt.StorageLocationId)
                .MaxAsync(e => (DateTime?)e.CreatedAt);

            // Interval rules whose countdown this event set. A rule whose LastDoneAt differs
            // was set by hand or by a later event, and is left alone.
            var intervalRules = await db.Rules
                .Where(r => r.EquipmentId == evt.EquipmentId && r.StorageLocationId == evt.StorageLocationId
                            && r.ScheduleType == ScheduleType.Interval && r.LastDoneAt == evt.CreatedAt)
                .ToListAsync();
            foreach (var rule in intervalRules) rule.LastDoneAt = previousAt;

            if (evt.EquipmentId is Guid equipmentId)
                await meters.RollBackUsageRulesAsync(equipmentId, evt.CreatedAt, previousAt);

            db.Events.Remove(evt);
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.NoContent();
        }).RequirePermission(Permissions.EventsDelete);
}

record CreateEventDto(
    Guid? EquipmentId, Guid? StorageLocationId, string Type, string? Note, string? PhotoUrl, DateTime? OccurredAt,
    // Meter *totals* as shown on the log form (the value the user sees), not raw device values.
    List<EventMeterReadingDto>? MeterReadings = null);
record EventMeterReadingDto(Guid MeterId, decimal Value);
record UpdateEventDto(string Type, string? Note, DateTime? OccurredAt);
