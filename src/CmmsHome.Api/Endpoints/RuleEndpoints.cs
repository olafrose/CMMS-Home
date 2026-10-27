using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using CmmsHome.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Endpoints;

public static class RuleEndpoints
{
    public static void MapRuleEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/rules").WithTags("Rules");

        group.MapGet("/", async (Guid? equipment_id, Guid? storage_location_id, CmmsDbContext db, ActorAccessor accessor) =>
        {
            var actor = await accessor.GetAsync();

            // As on /events: a scanned label sees its own item's schedules, and cannot drop
            // the filter to enumerate everything that is due in the house.
            if (!actor.MayTouchTarget(equipment_id, storage_location_id))
                return LabelScope.Denied();

            var query = db.Rules.AsQueryable();
            if (equipment_id.HasValue)
                query = query.Where(r => r.EquipmentId == equipment_id.Value);
            if (storage_location_id.HasValue)
                query = query.Where(r => r.StorageLocationId == storage_location_id.Value);
            return Results.Ok(await query.ToListAsync());
        }).RequirePermission(Permissions.RulesRead).AllowLabelScope();

        group.MapPost("/", async (CreateRuleDto dto, CmmsDbContext db) =>
        {
            if (await MaintenanceTarget.ValidateAsync(dto.EquipmentId, dto.StorageLocationId, db) is { } invalid)
                return invalid;

            var rule = new MaintenanceRule
            {
                Id = Guid.NewGuid(),
                EquipmentId = dto.EquipmentId,
                StorageLocationId = dto.StorageLocationId,
                Name = dto.Name,
                ScheduleType = dto.ScheduleType,
                IntervalValue = dto.IntervalValue,
                IntervalUnit = dto.IntervalUnit,
                LastDoneAt = dto.LastDoneAt,
                NextDueAt = dto.NextDueAt,
                DueWindowValue = dto.DueWindowValue,
                DueWindowUnit = dto.DueWindowUnit,
                ReminderLeadValue = dto.ReminderLeadValue,
                ReminderLeadUnit = dto.ReminderLeadUnit
            };
            db.Rules.Add(rule);
            await db.SaveChangesAsync();
            return Results.Created($"/rules/{rule.Id}", rule);
        }).RequirePermission(Permissions.RulesWrite);

        group.MapPut("/{id:guid}", async (Guid id, UpdateRuleDto dto, CmmsDbContext db) =>
        {
            var rule = await db.Rules.FindAsync(id);
            if (rule is null) return Results.NotFound();

            if (dto.Name is not null) rule.Name = dto.Name;
            if (dto.ScheduleType.HasValue) rule.ScheduleType = dto.ScheduleType.Value;
            if (dto.IntervalValue.HasValue) rule.IntervalValue = dto.IntervalValue.Value;
            if (dto.IntervalUnit.HasValue) rule.IntervalUnit = dto.IntervalUnit.Value;
            if (dto.LastDoneAt.HasValue) rule.LastDoneAt = dto.LastDoneAt.Value;
            if (dto.NextDueAt.HasValue) rule.NextDueAt = dto.NextDueAt.Value;
            if (dto.DueWindowValue.HasValue) rule.DueWindowValue = dto.DueWindowValue.Value;
            if (dto.DueWindowUnit.HasValue) rule.DueWindowUnit = dto.DueWindowUnit.Value;
            if (dto.ReminderLeadValue.HasValue) rule.ReminderLeadValue = dto.ReminderLeadValue.Value;
            if (dto.ReminderLeadUnit.HasValue) rule.ReminderLeadUnit = dto.ReminderLeadUnit.Value;
            await db.SaveChangesAsync();
            return Results.Ok(rule);
        }).RequirePermission(Permissions.RulesWrite);

        group.MapDelete("/{id:guid}", async (Guid id, CmmsDbContext db) =>
        {
            var rule = await db.Rules.FindAsync(id);
            if (rule is null) return Results.NotFound();
            db.Rules.Remove(rule);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequirePermission(Permissions.RulesDelete);
    }
}

record CreateRuleDto(
    Guid? EquipmentId, Guid? StorageLocationId, string? Name, ScheduleType ScheduleType,
    int IntervalValue, IntervalUnit IntervalUnit, DateTime? LastDoneAt,
    DateTime? NextDueAt, int DueWindowValue, IntervalUnit DueWindowUnit,
    int ReminderLeadValue, IntervalUnit ReminderLeadUnit);
record UpdateRuleDto(
    string? Name, ScheduleType? ScheduleType,
    int? IntervalValue, IntervalUnit? IntervalUnit, DateTime? LastDoneAt,
    DateTime? NextDueAt, int? DueWindowValue, IntervalUnit? DueWindowUnit,
    int? ReminderLeadValue, IntervalUnit? ReminderLeadUnit);
