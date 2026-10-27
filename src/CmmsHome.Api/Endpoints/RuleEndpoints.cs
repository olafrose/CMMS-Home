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

            // Meter is included for every rule: a Usage rule's status is computed from it.
            var query = db.Rules.Include(r => r.Meter).AsQueryable();
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
                ReminderLeadUnit = dto.ReminderLeadUnit,
                MeterId = dto.MeterId,
                UsageInterval = dto.UsageInterval ?? 0,
                LastDoneValue = dto.LastDoneValue,
                UsageGrace = dto.UsageGrace ?? DefaultShare(dto.UsageInterval),
                UsageReminderLead = dto.UsageReminderLead ?? DefaultShare(dto.UsageInterval),
            };

            if (await ValidateUsageAsync(rule, db) is { } usageInvalid) return usageInvalid;

            db.Rules.Add(rule);
            await db.SaveChangesAsync();
            await db.Entry(rule).Reference(r => r.Meter).LoadAsync();
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
            if (dto.MeterId.HasValue) rule.MeterId = dto.MeterId.Value;
            if (dto.UsageInterval.HasValue) rule.UsageInterval = dto.UsageInterval.Value;
            if (dto.LastDoneValue.HasValue) rule.LastDoneValue = dto.LastDoneValue.Value;
            if (dto.UsageGrace.HasValue) rule.UsageGrace = dto.UsageGrace.Value;
            if (dto.UsageReminderLead.HasValue) rule.UsageReminderLead = dto.UsageReminderLead.Value;

            if (await ValidateUsageAsync(rule, db) is { } usageInvalid) return usageInvalid;

            await db.SaveChangesAsync();
            await db.Entry(rule).Reference(r => r.Meter).LoadAsync();
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

    // Grace and reminder lead default to a tenth of the interval: "service every 500 h"
    // reads Upcoming from 450 h and Overdue past 550 h unless told otherwise.
    private static decimal DefaultShare(decimal? interval) => Math.Round((interval ?? 0) / 10, 2);

    // A Usage rule needs a meter on its own item and a positive interval; any other rule
    // must not carry a meter (the DB check constraint is the backstop). Normalises the
    // rule in place, so switching a rule away from Usage simply drops its meter.
    private static async Task<IResult?> ValidateUsageAsync(MaintenanceRule rule, CmmsDbContext db)
    {
        if (rule.ScheduleType != ScheduleType.Usage)
        {
            rule.MeterId = null;
            return null;
        }

        var errors = new Dictionary<string, string[]>();
        if (rule.EquipmentId is not Guid equipmentId)
            errors["scheduleType"] = ["Usage schedules need an item with a meter; places have no meters."];
        else if (rule.MeterId is not Guid meterId
                 || !await db.Meters.AnyAsync(m => m.Id == meterId && m.EquipmentId == equipmentId))
            errors["meterId"] = ["Choose one of this item's meters."];

        if (rule.UsageInterval <= 0) errors["usageInterval"] = ["Must be greater than zero"];
        if (rule.UsageGrace < 0) errors["usageGrace"] = ["Cannot be negative"];
        if (rule.UsageReminderLead < 0) errors["usageReminderLead"] = ["Cannot be negative"];
        if (rule.IntervalValue < 0) errors["intervalValue"] = ["Cannot be negative"];

        if (errors.Count > 0) return Results.ValidationProblem(errors);

        // A baseline given without a date, on a rule with a calendar ceiling: the ceiling
        // counts from today, rather than reading as "never done" on a rule just set up.
        // Day-granular like every date the forms send.
        if (rule.IntervalValue > 0 && rule.LastDoneValue is not null && rule.LastDoneAt is null)
            rule.LastDoneAt = DateTime.UtcNow.Date;

        return null;
    }
}

record CreateRuleDto(
    Guid? EquipmentId, Guid? StorageLocationId, string? Name, ScheduleType ScheduleType,
    int IntervalValue, IntervalUnit IntervalUnit, DateTime? LastDoneAt,
    DateTime? NextDueAt, int DueWindowValue, IntervalUnit DueWindowUnit,
    int ReminderLeadValue, IntervalUnit ReminderLeadUnit,
    Guid? MeterId = null, decimal? UsageInterval = null, decimal? LastDoneValue = null,
    decimal? UsageGrace = null, decimal? UsageReminderLead = null);
record UpdateRuleDto(
    string? Name, ScheduleType? ScheduleType,
    int? IntervalValue, IntervalUnit? IntervalUnit, DateTime? LastDoneAt,
    DateTime? NextDueAt, int? DueWindowValue, IntervalUnit? DueWindowUnit,
    int? ReminderLeadValue, IntervalUnit? ReminderLeadUnit,
    Guid? MeterId = null, decimal? UsageInterval = null, decimal? LastDoneValue = null,
    decimal? UsageGrace = null, decimal? UsageReminderLead = null);
