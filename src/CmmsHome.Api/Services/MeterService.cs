using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Services;

// Recording meter readings and keeping each Meter's denormalised current value and usage
// rate in step with them. Shared by the single and batch reading routes, rebase/replace, and
// event logging (which reads a meter's value at the time of the work), so the rules about
// what a valid reading is live in one place — the same arrangement as ApiTokenService.
public class MeterService(CmmsDbContext db)
{
    // How far back the usage rate looks. Long enough to smooth out a weekend, short enough
    // that a boiler's summer idle doesn't still drag the forecast down in December.
    public static readonly TimeSpan RateWindow = TimeSpan.FromDays(30);

    // A device clock running a little fast shouldn't bounce its readings.
    private static readonly TimeSpan ClockSlack = TimeSpan.FromMinutes(5);

    public async Task<RecordResult> RecordAsync(
        Meter meter, decimal rawValue, DateTime? readAt, string? source, Guid? userId)
    {
        var at = DateTime.SpecifyKind(readAt ?? DateTime.UtcNow, DateTimeKind.Utc);
        if (at > DateTime.UtcNow + ClockSlack)
            return RecordResult.Refused(400, "readAt is in the future.");
        if (at < meter.BaselineAt)
            return RecordResult.Refused(400,
                "That is before this meter's device was replaced; readings from the old device are history only.");

        // A rebase changed the offset at a moment; a backfilled value from before it would be
        // given the new offset and land at the wrong total.
        var lastRebase = await db.MeterReadings
            .Where(r => r.MeterId == meter.Id && r.Source == SourceRebase && r.ReadAt >= meter.BaselineAt)
            .MaxAsync(r => (DateTime?)r.ReadAt);
        if (lastRebase is DateTime rebased && at < rebased)
            return RecordResult.Refused(400, "That is before the counter was last reset; it can no longer be placed.");

        var total = rawValue + meter.Offset;

        // Same instant again: a retry. Harmless when it says the same thing.
        var same = await db.MeterReadings.SingleOrDefaultAsync(r => r.MeterId == meter.Id && r.ReadAt == at);
        if (same is not null)
            return same.Value == total
                ? RecordResult.Ok(same, RecordOutcome.Duplicate)
                : RecordResult.Refused(409, $"A different value ({same.Value}) is already recorded for that time.");

        var before = await InBaseline(meter)
            .Where(r => r.ReadAt < at).OrderByDescending(r => r.ReadAt).FirstOrDefaultAsync();
        var after = await InBaseline(meter)
            .Where(r => r.ReadAt > at).OrderBy(r => r.ReadAt).FirstOrDefaultAsync();

        // A cumulative counter only climbs. Lower than what came before means the device was
        // reset or replaced, which is a human decision (rebase or replace), not something to
        // guess at — guessing wrong would silently shift every schedule on the meter.
        if (before is not null && total < before.Value)
            return RecordResult.Refused(409,
                $"The counter went backwards ({total} after {before.Value}). If the device's counter was reset, "
                + "rebase the meter; if the device was replaced, mark it replaced.");
        if (after is not null && total > after.Value)
            return RecordResult.Refused(409,
                $"Higher than the later reading at {after.ReadAt:u} ({after.Value}); readings must not decrease over time.");

        // Newest and unchanged: the device is idle. Only confirm the value is current, so a
        // 15-minute push doesn't write tens of thousands of identical rows a year.
        if (after is null && before is not null && total == before.Value)
        {
            if (meter.CurrentReadAt is null || at > meter.CurrentReadAt) meter.CurrentReadAt = at;
            await RecomputeRateAsync(meter);
            await db.SaveChangesAsync();
            return RecordResult.Ok(before, RecordOutcome.Unchanged);
        }

        var reading = new MeterReading
        {
            Id = Guid.NewGuid(),
            MeterId = meter.Id,
            RawValue = rawValue,
            Value = total,
            ReadAt = at,
            RecordedAt = DateTime.UtcNow,
            Source = Trim(source),
            CreatedByUserId = userId,
        };
        db.MeterReadings.Add(reading);
        await db.SaveChangesAsync();

        await RecomputeAsync(meter);
        await db.SaveChangesAsync();
        return RecordResult.Ok(reading, RecordOutcome.Created);
    }

    // The counter was reset on the same machine: carry the total on from where it was.
    public async Task<RecordResult> RebaseAsync(Meter meter, decimal newRawValue, Guid? userId)
    {
        if (meter.CurrentValue is not decimal current)
            return RecordResult.Refused(400, "This meter has no readings yet, so there is nothing to carry over.");

        var at = DateTime.UtcNow;
        meter.Offset = current - newRawValue;

        var reading = new MeterReading
        {
            Id = Guid.NewGuid(), MeterId = meter.Id, RawValue = newRawValue, Value = current,
            ReadAt = at, RecordedAt = at, Source = SourceRebase, CreatedByUserId = userId,
        };
        db.MeterReadings.Add(reading);
        meter.CurrentReadAt = at;
        await db.SaveChangesAsync();
        return RecordResult.Ok(reading, RecordOutcome.Created);
    }

    // The device itself was replaced: the meter starts over, and so does every schedule
    // counting against it — a new pump isn't 6000 h overdue for the old one's service.
    public async Task<RecordResult> ReplaceAsync(Meter meter, decimal newRawValue, DateTime? replacedAt, Guid? userId)
    {
        var at = DateTime.SpecifyKind(replacedAt ?? DateTime.UtcNow, DateTimeKind.Utc);
        if (at > DateTime.UtcNow + ClockSlack)
            return RecordResult.Refused(400, "replacedAt is in the future.");

        // Readings after the replacement time would belong to the new device but carry the
        // old one's totals. Refuse rather than reinterpret them.
        var latest = await db.MeterReadings.Where(r => r.MeterId == meter.Id).MaxAsync(r => (DateTime?)r.ReadAt);
        if (latest is DateTime l && at <= l)
            return RecordResult.Refused(400,
                $"There are readings up to {l:u}; the replacement must be later than the last reading.");

        await using var tx = await db.Database.BeginTransactionAsync();

        meter.Offset = 0;
        meter.BaselineAt = at;
        meter.CurrentValue = newRawValue;
        meter.CurrentReadAt = at;
        meter.RatePerDay = null;

        var reading = new MeterReading
        {
            Id = Guid.NewGuid(), MeterId = meter.Id, RawValue = newRawValue, Value = newRawValue,
            ReadAt = at, RecordedAt = DateTime.UtcNow, Source = SourceReplaced, CreatedByUserId = userId,
        };
        db.MeterReadings.Add(reading);

        var rules = await db.Rules.Where(r => r.MeterId == meter.Id).ToListAsync();
        foreach (var rule in rules)
        {
            rule.LastDoneValue = newRawValue;
            rule.LastDoneAt = at;
        }

        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return RecordResult.Ok(reading, RecordOutcome.Created);
    }

    // Logging maintenance on an item restarts its usage schedules from the meter's value at
    // the time of the work — the last reading at or before it, so back-dating a forgotten
    // service lands on the right count. Never backwards, as for Interval rules: an older
    // event logged late can't undo a newer one. The caller saves.
    //
    // `valueAt` is when to read the meter, which can differ from `occurredAt`: see
    // MeterTimeFor.
    public async Task AdvanceUsageRulesAsync(Guid equipmentId, DateTime occurredAt, DateTime valueAt)
    {
        var rules = await db.Rules
            .Include(r => r.Meter)
            .Where(r => r.EquipmentId == equipmentId && r.ScheduleType == ScheduleType.Usage)
            .ToListAsync();

        foreach (var rule in rules)
        {
            // Ordered by when the meter is read, not by the bare date: a service logged for
            // "today" (midnight) must still move a baseline set earlier today.
            if (rule.LastDoneAt is DateTime last && valueAt <= last) continue;

            // The calendar ceiling restarts regardless (never earlier than it already was);
            // the counter baseline only if the meter had said something by then — otherwise
            // "never done" stays honest.
            if (rule.LastDoneAt is not DateTime prev || occurredAt > prev) rule.LastDoneAt = occurredAt;
            if (rule.Meter is not null && await ValueAtAsync(rule.Meter, valueAt) is decimal value)
                rule.LastDoneValue = value;
        }
    }

    // When to read the meters for an event. The log form sends a bare date (midnight), and
    // the meter at midnight is yesterday's count — a service done at 15:00 at 1234 h would
    // baseline on whatever the counter said overnight. So a date-only event reads the meter
    // at the end of that day, or now if that day is today. A real timestamp is taken as is.
    public static DateTime MeterTimeFor(DateTime occurredAt)
    {
        if (occurredAt.TimeOfDay != TimeSpan.Zero) return occurredAt;
        var endOfDay = occurredAt.AddDays(1).AddTicks(-1);
        var now = DateTime.UtcNow;
        return endOfDay < now ? endOfDay : now;
    }

    // Deleting an event undoes its effect on usage schedules: a rule whose baseline came
    // from this event (LastDoneAt is that event's time) goes back to the previous remaining
    // event on the item — or to the replacement that restarted the meter, if that is later,
    // or to "never done". Rules baselined by something else are left alone. The caller saves.
    public async Task RollBackUsageRulesAsync(Guid equipmentId, DateTime deletedAt, DateTime? previousAt)
    {
        var rules = await db.Rules
            .Include(r => r.Meter)
            .Where(r => r.EquipmentId == equipmentId && r.ScheduleType == ScheduleType.Usage && r.LastDoneAt == deletedAt)
            .ToListAsync();

        foreach (var rule in rules)
        {
            var meter = rule.Meter!;
            // A replacement after the previous event is a more recent restart than it.
            var replaced = meter.BaselineAt > Epoch && (previousAt is null || meter.BaselineAt > previousAt);
            if (replaced)
            {
                rule.LastDoneAt = meter.BaselineAt;
                rule.LastDoneValue = await db.MeterReadings
                    .Where(r => r.MeterId == meter.Id && r.ReadAt == meter.BaselineAt)
                    .Select(r => (decimal?)r.Value).FirstOrDefaultAsync();
            }
            else
            {
                rule.LastDoneAt = previousAt;
                rule.LastDoneValue = previousAt is DateTime p ? await ValueAtAsync(meter, MeterTimeFor(p)) : null;
            }
        }
    }

    // A meter's BaselineAt before any replacement (see MeterEndpoints' create).
    public static readonly DateTime Epoch = new(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    // The meter's total at an instant: the last reading at or before it, within the current
    // device's life. Null when the meter had no reading by then.
    public async Task<decimal?> ValueAtAsync(Meter meter, DateTime at)
    {
        if (at < meter.BaselineAt) return null;
        if (meter.CurrentReadAt is DateTime current && at >= current) return meter.CurrentValue;

        var before = await InBaseline(meter)
            .Where(r => r.ReadAt <= at).OrderByDescending(r => r.ReadAt).FirstOrDefaultAsync();
        if (before is null) return null;
        if (before.ReadAt == at) return before.Value;

        // Between two kept readings: interpolate linearly by time. Older history is thinned
        // to a reading per day, week or month (MeterRetention), and a stepped "last value
        // before" would put a back-dated service at the start of that whole period. A
        // counter only climbs, so the result always lies between its neighbours and can't
        // break the ordering. With no later reading, the last value is the best there is.
        var after = await InBaseline(meter)
            .Where(r => r.ReadAt > at).OrderBy(r => r.ReadAt).FirstOrDefaultAsync();
        if (after is null) return before.Value;

        var share = (decimal)((at - before.ReadAt).TotalSeconds / (after.ReadAt - before.ReadAt).TotalSeconds);
        return Math.Round(before.Value + (after.Value - before.Value) * share, 4);
    }

    // Rewrites the denormalised current value and rate from the readings. Called after any
    // change to them; the caller saves.
    public async Task RecomputeAsync(Meter meter)
    {
        var latest = await InBaseline(meter).OrderByDescending(r => r.ReadAt).FirstOrDefaultAsync();
        if (latest is null)
        {
            meter.CurrentValue = null;
            meter.CurrentReadAt = null;
            meter.RatePerDay = null;
            return;
        }

        // Keep an idle push's later confirmation when the latest row still says the same.
        var confirmedLater = meter.CurrentValue == latest.Value && meter.CurrentReadAt > latest.ReadAt;
        meter.CurrentValue = latest.Value;
        if (!confirmedLater) meter.CurrentReadAt = latest.ReadAt;

        await RecomputeRateAsync(meter);
    }

    // Use per day over roughly the last RateWindow: from the last reading at or before the
    // window's start (or the first one since the baseline, if the meter is newer than that)
    // to now. Anchoring outside the window, rather than on the first reading inside it, keeps
    // a meter that idled for months and then moved from reading as a huge burst.
    private async Task RecomputeRateAsync(Meter meter)
    {
        if (meter is not { CurrentValue: decimal current, CurrentReadAt: DateTime now })
        {
            meter.RatePerDay = null;
            return;
        }

        var windowStart = now - RateWindow;
        var anchor = await InBaseline(meter)
                         .Where(r => r.ReadAt <= windowStart).OrderByDescending(r => r.ReadAt).FirstOrDefaultAsync()
                     ?? await InBaseline(meter).OrderBy(r => r.ReadAt).FirstOrDefaultAsync();

        var days = anchor is null ? 0 : (now - anchor.ReadAt).TotalDays;
        meter.RatePerDay = days < 1 ? null : (double)(current - anchor!.Value) / days;
    }

    private IQueryable<MeterReading> InBaseline(Meter meter) =>
        db.MeterReadings.Where(r => r.MeterId == meter.Id && r.ReadAt >= meter.BaselineAt);

    private static string? Trim(string? source)
    {
        if (string.IsNullOrWhiteSpace(source)) return null;
        var s = source.Trim();
        return s.Length > 64 ? s[..64] : s;
    }

    public const string SourceRebase = "rebase";
    public const string SourceReplaced = "replaced";
    public const string SourceEvent = "event";
}

public enum RecordOutcome { Created, Duplicate, Unchanged }

// What happened to one reading: kept (with how), or refused (with an HTTP status and why).
public record RecordResult(MeterReading? Reading, RecordOutcome? Outcome, int? Status, string? Error)
{
    public static RecordResult Ok(MeterReading reading, RecordOutcome outcome) => new(reading, outcome, null, null);
    public static RecordResult Refused(int status, string error) => new(null, null, status, error);
    public bool Succeeded => Error is null;
}
