using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using CmmsHome.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Endpoints;

// Meters (running hours, km, cycles) and their readings. Readings are the integration
// surface — Home Assistant or any script with a token holding meters.record pushes the
// device's cumulative counter here. See docs/meters.md.
public static class MeterEndpoints
{
    private const int DefaultReadingLimit = 50;
    private const int MaxReadingLimit = 1000;
    private const int MaxBatch = 200;

    public static void MapMeterEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/meters").WithTags("Meters");

        group.MapGet("/", async (Guid? equipment_id, CmmsDbContext db) =>
        {
            var query = db.Meters.AsQueryable();
            if (equipment_id.HasValue) query = query.Where(m => m.EquipmentId == equipment_id.Value);
            return Results.Ok(await query.OrderBy(m => m.Name).ToListAsync());
        }).RequirePermission(Permissions.MetersRead);

        group.MapGet("/{id:guid}", async (Guid id, CmmsDbContext db) =>
            await db.Meters.FindAsync(id) is { } meter ? Results.Ok(meter) : Results.NotFound())
            .RequirePermission(Permissions.MetersRead);

        group.MapPost("/", async (SaveMeterDto dto, CmmsDbContext db) =>
        {
            if (Validate(dto) is { } errors) return Results.ValidationProblem(errors);
            if (dto.EquipmentId is not Guid equipmentId || !await db.Equipment.AnyAsync(e => e.Id == equipmentId))
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["equipmentId"] = ["A meter belongs to an existing item"] });

            var meter = new Meter
            {
                Id = Guid.NewGuid(),
                EquipmentId = equipmentId,
                Name = dto.Name!.Trim(),
                Unit = dto.Unit!.Trim(),
                CreatedAt = DateTime.UtcNow,
                // Open-ended into the past: the device usually had hours on it before anyone
                // added the meter here, and backfilling that history is welcome. Only marking
                // the device replaced moves this forward.
                BaselineAt = MeterService.Epoch,
            };
            db.Meters.Add(meter);
            await db.SaveChangesAsync();
            return Results.Created($"/meters/{meter.Id}", meter);
        }).RequirePermission(Permissions.MetersWrite);

        // Name and unit only. The equipment is fixed: moving a meter would carry its history
        // and any schedules counting against it to an item they were never about.
        group.MapPut("/{id:guid}", async (Guid id, SaveMeterDto dto, CmmsDbContext db) =>
        {
            var meter = await db.Meters.FindAsync(id);
            if (meter is null) return Results.NotFound();
            if (Validate(dto) is { } errors) return Results.ValidationProblem(errors);

            meter.Name = dto.Name!.Trim();
            meter.Unit = dto.Unit!.Trim();
            await db.SaveChangesAsync();
            return Results.Ok(meter);
        }).RequirePermission(Permissions.MetersWrite);

        group.MapDelete("/{id:guid}", async (Guid id, CmmsDbContext db) =>
        {
            var meter = await db.Meters.FindAsync(id);
            if (meter is null) return Results.NotFound();

            // Refused rather than cascaded, as for places: the schedules would be left
            // counting against nothing. The FK is Restrict as the backstop.
            var rules = await db.Rules.CountAsync(r => r.MeterId == id);
            if (rules > 0)
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["meter"] = [$"{rules} schedule{(rules == 1 ? "" : "s")} count against this meter. "
                        + "Delete or change them first."],
                });

            db.Meters.Remove(meter);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequirePermission(Permissions.MetersWrite);

        group.MapGet("/{id:guid}/readings", async (Guid id, DateTime? from, int? limit, CmmsDbContext db) =>
        {
            if (!await db.Meters.AnyAsync(m => m.Id == id)) return Results.NotFound();

            var query = db.MeterReadings.Where(r => r.MeterId == id);
            if (from is DateTime f) query = query.Where(r => r.ReadAt >= DateTime.SpecifyKind(f, DateTimeKind.Utc));

            var take = Math.Clamp(limit ?? DefaultReadingLimit, 1, MaxReadingLimit);
            return Results.Ok(await query.OrderByDescending(r => r.ReadAt).Take(take).ToListAsync());
        }).RequirePermission(Permissions.MetersRead);

        group.MapPost("/{id:guid}/readings", async (
            Guid id, RecordReadingDto dto, CmmsDbContext db, MeterService meters, ActorAccessor accessor) =>
        {
            var meter = await db.Meters.FindAsync(id);
            if (meter is null) return Results.NotFound();

            var actor = await accessor.GetAsync();
            var result = await meters.RecordAsync(meter, dto.Value, dto.ReadAt, dto.Source, actor.User?.Id);
            return ToResponse(result, meter);
        }).RequirePermission(Permissions.MetersRecord);

        // Every meter in one call, for an integration's polling cycle. Each item is applied
        // on its own and reported on its own, so one stale counter doesn't sink the rest.
        group.MapPost("/readings", async (
            List<BatchReadingDto> items, CmmsDbContext db, MeterService meters, ActorAccessor accessor) =>
        {
            if (items.Count > MaxBatch)
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["items"] = [$"At most {MaxBatch} readings per call"] });

            var actor = await accessor.GetAsync();
            var ids = items.Select(i => i.MeterId).Distinct().ToList();
            var byId = await db.Meters.Where(m => ids.Contains(m.Id)).ToDictionaryAsync(m => m.Id);

            var results = new List<object>(items.Count);
            foreach (var item in items)
            {
                if (!byId.TryGetValue(item.MeterId, out var meter))
                {
                    results.Add(new { item.MeterId, status = 404, error = "No such meter" });
                    continue;
                }

                var r = await meters.RecordAsync(meter, item.Value, item.ReadAt, item.Source, actor.User?.Id);
                results.Add(r.Succeeded
                    ? new { item.MeterId, status = r.Outcome == RecordOutcome.Created ? 201 : 200,
                            outcome = r.Outcome, meter.CurrentValue, meter.CurrentReadAt }
                    : (object)new { item.MeterId, status = r.Status, error = r.Error });
            }

            return Results.Ok(results);
        }).RequirePermission(Permissions.MetersRecord);

        group.MapPost("/{id:guid}/rebase", async (
            Guid id, RebaseMeterDto dto, CmmsDbContext db, MeterService meters, ActorAccessor accessor) =>
        {
            var meter = await db.Meters.FindAsync(id);
            if (meter is null) return Results.NotFound();

            var actor = await accessor.GetAsync();
            return ToResponse(await meters.RebaseAsync(meter, dto.NewRawValue, actor.User?.Id), meter);
        }).RequirePermission(Permissions.MetersWrite);

        group.MapPost("/{id:guid}/replace", async (
            Guid id, ReplaceMeterDto dto, CmmsDbContext db, MeterService meters, ActorAccessor accessor) =>
        {
            var meter = await db.Meters.FindAsync(id);
            if (meter is null) return Results.NotFound();

            var actor = await accessor.GetAsync();
            return ToResponse(
                await meters.ReplaceAsync(meter, dto.NewRawValue ?? 0, dto.ReplacedAt, actor.User?.Id), meter);
        }).RequirePermission(Permissions.MetersWrite);

        // Applies the retention windows now rather than at the next daily run — after
        // changing them in Settings, say. Gated like the windows themselves.
        group.MapPost("/prune", async (CmmsDbContext db) =>
            Results.Ok(await MeterRetention.PruneAsync(db, await db.GetAppSettingsAsync())))
            .RequirePermission(Permissions.SettingsManage);

        // For a mistyped manual reading. The meter's current value and rate are recomputed;
        // schedules keep whatever baseline they already took, as they would for any reading.
        group.MapDelete("/{id:guid}/readings/{readingId:guid}", async (
            Guid id, Guid readingId, CmmsDbContext db, MeterService meters) =>
        {
            var meter = await db.Meters.FindAsync(id);
            if (meter is null) return Results.NotFound();

            var reading = await db.MeterReadings.SingleOrDefaultAsync(r => r.Id == readingId && r.MeterId == id);
            if (reading is null) return Results.NotFound();

            db.MeterReadings.Remove(reading);
            await db.SaveChangesAsync();
            await meters.RecomputeAsync(meter);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequirePermission(Permissions.MetersWrite);
    }

    private static IResult ToResponse(RecordResult result, Meter meter) => result switch
    {
        { Succeeded: false } => Results.Problem(detail: result.Error, statusCode: result.Status,
            title: result.Status == 409 ? "Reading conflicts" : "Reading refused"),
        { Outcome: RecordOutcome.Created } => Results.Created(
            $"/meters/{meter.Id}/readings/{result.Reading!.Id}", new { reading = result.Reading, meter, outcome = result.Outcome }),
        _ => Results.Ok(new { reading = result.Reading, meter, outcome = result.Outcome }),
    };

    private static Dictionary<string, string[]>? Validate(SaveMeterDto dto)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(dto.Name)) errors["name"] = ["A name is required, e.g. \"Operating hours\""];
        else if (dto.Name.Trim().Length > 100) errors["name"] = ["At most 100 characters"];
        if (string.IsNullOrWhiteSpace(dto.Unit)) errors["unit"] = ["A unit is required, e.g. \"h\", \"km\" or \"cycles\""];
        else if (dto.Unit.Trim().Length > 20) errors["unit"] = ["At most 20 characters"];
        return errors.Count > 0 ? errors : null;
    }
}

record SaveMeterDto(Guid? EquipmentId, string? Name, string? Unit);
record RecordReadingDto(decimal Value, DateTime? ReadAt, string? Source);
record BatchReadingDto(Guid MeterId, decimal Value, DateTime? ReadAt, string? Source);
record RebaseMeterDto(decimal NewRawValue);
record ReplaceMeterDto(decimal? NewRawValue, DateTime? ReplacedAt);
