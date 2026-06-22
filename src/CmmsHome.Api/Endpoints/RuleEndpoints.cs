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
                IntervalDays = dto.IntervalDays,
                LastDoneAt = dto.LastDoneAt
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
            if (dto.IntervalDays.HasValue) rule.IntervalDays = dto.IntervalDays.Value;
            if (dto.LastDoneAt.HasValue) rule.LastDoneAt = dto.LastDoneAt.Value;
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

record CreateRuleDto(Guid AssetId, string? Name, int IntervalDays, DateTime? LastDoneAt);
record UpdateRuleDto(string? Name, int? IntervalDays, DateTime? LastDoneAt);
