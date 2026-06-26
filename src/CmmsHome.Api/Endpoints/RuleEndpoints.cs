using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Endpoints;

public static class RuleEndpoints
{
    public static void MapRuleEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/rules").WithTags("Rules");

        group.MapGet("/", async (Guid? asset_id, CmmsDbContext db) =>
        {
            var query = db.Rules.AsQueryable();
            if (asset_id.HasValue)
                query = query.Where(r => r.AssetId == asset_id.Value);
            return await query.ToListAsync();
        });

        group.MapPost("/", async (CreateRuleDto dto, CmmsDbContext db) =>
        {
            if (!await db.Assets.AnyAsync(a => a.Id == dto.AssetId))
                return Results.NotFound();

            var rule = new MaintenanceRule
            {
                Id = Guid.NewGuid(),
                AssetId = dto.AssetId,
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
        });

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
        });

        group.MapDelete("/{id:guid}", async (Guid id, CmmsDbContext db) =>
        {
            var rule = await db.Rules.FindAsync(id);
            if (rule is null) return Results.NotFound();
            db.Rules.Remove(rule);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }
}

record CreateRuleDto(
    Guid AssetId, string? Name, ScheduleType ScheduleType,
    int IntervalValue, IntervalUnit IntervalUnit, DateTime? LastDoneAt,
    DateTime? NextDueAt, int DueWindowValue, IntervalUnit DueWindowUnit,
    int ReminderLeadValue, IntervalUnit ReminderLeadUnit);
record UpdateRuleDto(
    string? Name, ScheduleType? ScheduleType,
    int? IntervalValue, IntervalUnit? IntervalUnit, DateTime? LastDoneAt,
    DateTime? NextDueAt, int? DueWindowValue, IntervalUnit? DueWindowUnit,
    int? ReminderLeadValue, IntervalUnit? ReminderLeadUnit);
