namespace CmmsHome.Api.Models;

public class MaintenanceRule
{
    public Guid Id { get; set; }
    // Exactly one set, as on MaintenanceEvent.
    public Guid? EquipmentId { get; set; }
    public Guid? StorageLocationId { get; set; }
    public string? Name { get; set; }
    public ScheduleType ScheduleType { get; set; } = ScheduleType.Interval;

    // Interval mode: due = LastDoneAt + IntervalValue·IntervalUnit.
    // Usage mode reuses these as its optional calendar ceiling ("or every 12 months,
    // whichever comes first") when IntervalValue > 0.
    public int IntervalValue { get; set; }
    public IntervalUnit IntervalUnit { get; set; } = IntervalUnit.Days;
    public DateTime? LastDoneAt { get; set; }

    // DueDate mode: due = NextDueAt, with an optional grace window after it
    public DateTime? NextDueAt { get; set; }
    public int DueWindowValue { get; set; }
    public IntervalUnit DueWindowUnit { get; set; } = IntervalUnit.Days;

    // Reminder lead — how far before "due" it flags as Upcoming (time-based modes, and
    // Usage's calendar ceiling)
    public int ReminderLeadValue { get; set; } = 30;
    public IntervalUnit ReminderLeadUnit { get; set; } = IntervalUnit.Days;

    // Usage mode: due when the meter reaches LastDoneValue + UsageInterval, overdue past a
    // further UsageGrace, Upcoming within UsageReminderLead of due — all in the meter's own
    // unit. Equipment targets only; the meter must belong to the same equipment.
    public Guid? MeterId { get; set; }
    public decimal UsageInterval { get; set; }
    public decimal? LastDoneValue { get; set; }
    public decimal UsageGrace { get; set; }
    public decimal UsageReminderLead { get; set; }

    // Must be loaded wherever a Usage rule is returned: its status is computed from the
    // meter's current value, and without it the rule would read as "never done".
    public Meter? Meter { get; set; }

    public Equipment? Equipment { get; set; }
    public StorageLocation? StorageLocation { get; set; }

    // DueAt/OverdueAt/Status are computed (getter-only, so EF maps no column for them)
    // and serialize with the rule. They are deliberately part of the API surface: the
    // frontend used to re-derive the due date in TypeScript to render "98 days overdue",
    // which duplicated the schedule semantics below and could disagree with Status —
    // showing an "Overdue" badge next to "Due in 3 days". Schedule arithmetic lives
    // here only; clients format the instants they are given.

    /// When this rule comes due. Null = "never done" / no date set, which reads as Due.
    /// For Usage: the earlier of the forecast and the calendar ceiling; null when neither
    /// can be said (no usage rate yet and no ceiling).
    public DateTime? DueAt => ScheduleType switch
    {
        ScheduleType.DueDate => NextDueAt,
        ScheduleType.Usage => Earliest(ForecastAt(DueValue), CeilingDueAt),
        _ => LastDoneAt is DateTime last ? AddSpan(last, IntervalValue, IntervalUnit) : null,
    };

    /// The instant it becomes Overdue: the start of the day *after* the due date, plus
    /// any grace window (interval rules have no window).
    ///
    /// These are due *dates*, stored at midnight — so a rule is Due for the whole of its
    /// due day and only turns Overdue once that day has fully elapsed. Comparing against
    /// the raw midnight instant instead made a rule due today report Overdue from
    /// 00:00:01, and the dashboard label then read "1 day overdue" on the due date itself.
    public DateTime? OverdueAt => ScheduleType == ScheduleType.Usage
        ? Earliest(ForecastAt(OverdueValue), CeilingDueAt?.Date.AddDays(1))
        : DueAt is DateTime due
            ? (ScheduleType == ScheduleType.DueDate ? AddSpan(due, DueWindowValue, DueWindowUnit) : due)
                .Date.AddDays(1)
            : null;

    public MaintenanceStatus Status => ScheduleType == ScheduleType.Usage
        ? (MaintenanceStatus)Math.Max((int)UsageStatus, (int)(CeilingStatus ?? MaintenanceStatus.Ok))
        : TimeStatus(DueAt, OverdueAt);

    // --- Usage --------------------------------------------------------------------------
    //
    // Counted in the meter's unit, not in time: the "dates" a usage rule serves are
    // forecasts of when the counter will cross a value, so they are instants, not the
    // day-granular dates of the time-based modes (no .Date.AddDays(1) — a counter crosses
    // 1500 h at a moment, not on a day).

    /// The meter value at which this comes due. Null until a baseline exists.
    public decimal? DueValue => ScheduleType == ScheduleType.Usage && LastDoneValue is decimal done
        ? done + UsageInterval
        : null;

    public decimal? OverdueValue => DueValue + UsageGrace;

    /// How much use is left before due; negative once past it. Null without a baseline or
    /// a reading.
    public decimal? RemainingValue => DueValue - Meter?.CurrentValue;

    /// Which limit is driving the status — the counter or the calendar ceiling — so a
    /// client can say "500 h" or "12 months" without re-deriving either. Null for
    /// time-based rules, which have only the one.
    public UsageDueReason? DueReason
    {
        get
        {
            if (ScheduleType != ScheduleType.Usage) return null;
            if (CeilingStatus is not MaintenanceStatus ceiling) return UsageDueReason.Usage;

            var usage = UsageStatus;
            if (ceiling != usage) return ceiling > usage ? UsageDueReason.Time : UsageDueReason.Usage;

            // Same status: whichever comes due first. With no forecast yet (too little usage
            // history), the ceiling is the only dated limit — DueAt is its date, so saying
            // "Usage" would present the calendar date as an hours forecast.
            return ForecastAt(DueValue) is not DateTime f
                ? (CeilingDueAt is null ? UsageDueReason.Usage : UsageDueReason.Time)
                : CeilingDueAt is DateTime c && c < f ? UsageDueReason.Time : UsageDueReason.Usage;
        }
    }

    MaintenanceStatus UsageStatus
    {
        get
        {
            // No baseline, or the meter has never reported: "never done", as for the
            // other modes — the honest answer when nothing says it isn't due.
            if (DueValue is not decimal due || Meter?.CurrentValue is not decimal current)
                return MaintenanceStatus.Due;

            if (current >= due + UsageGrace) return MaintenanceStatus.Overdue;
            if (current >= due) return MaintenanceStatus.Due;
            if (current >= due - UsageReminderLead) return MaintenanceStatus.Upcoming;
            return MaintenanceStatus.Ok;
        }
    }

    // The optional "or every N months" ceiling, computed exactly like Interval mode.
    DateTime? CeilingDueAt => ScheduleType == ScheduleType.Usage && IntervalValue > 0 && LastDoneAt is DateTime last
        ? AddSpan(last, IntervalValue, IntervalUnit)
        : null;

    MaintenanceStatus? CeilingStatus => ScheduleType != ScheduleType.Usage || IntervalValue <= 0
        ? null
        : TimeStatus(CeilingDueAt, CeilingDueAt?.Date.AddDays(1));

    // When the counter is expected to reach `value`, from the recent usage rate. Already
    // there: as of the reading that showed it. No rate yet: unknown.
    DateTime? ForecastAt(decimal? value)
    {
        if (value is not decimal target || Meter is not { CurrentValue: decimal current, CurrentReadAt: DateTime at })
            return null;
        if (current >= target) return at;
        if (Meter.RatePerDay is not double rate || rate <= 0) return null;

        var days = (double)(target - current) / rate;
        // A meter that barely moves would forecast centuries out; cap it rather than
        // overflow DateTime, and so a client doesn't render "due in 3,000 years".
        return days > 36500 ? null : at.AddDays(days);
    }

    // --- Shared -------------------------------------------------------------------------

    MaintenanceStatus TimeStatus(DateTime? dueAt, DateTime? overdueAt)
    {
        if (dueAt is not DateTime due) return MaintenanceStatus.Due; // never done
        var now = DateTime.UtcNow;

        if (overdueAt is DateTime overdue && now >= overdue) return MaintenanceStatus.Overdue;
        if (now >= due) return MaintenanceStatus.Due;
        if (now >= AddSpan(due, -ReminderLeadValue, ReminderLeadUnit)) return MaintenanceStatus.Upcoming;
        return MaintenanceStatus.Ok;
    }

    static DateTime? Earliest(DateTime? a, DateTime? b) =>
        a is DateTime x && b is DateTime y ? (x < y ? x : y) : a ?? b;

    static DateTime AddSpan(DateTime from, int value, IntervalUnit unit) => unit switch
    {
        IntervalUnit.Weeks  => from.AddDays(value * 7),
        IntervalUnit.Months => from.AddMonths(value),
        IntervalUnit.Years  => from.AddYears(value),
        _                   => from.AddDays(value),
    };
}

public enum MaintenanceStatus { Ok, Upcoming, Due, Overdue }
public enum IntervalUnit { Days, Weeks, Months, Years }
public enum ScheduleType { Interval, DueDate, Usage }
public enum UsageDueReason { Usage, Time }
