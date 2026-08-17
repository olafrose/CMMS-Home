namespace CmmsHome.Api.Models;

public class MaintenanceRule
{
    public Guid Id { get; set; }
    public Guid EquipmentId { get; set; }
    public string? Name { get; set; }
    public ScheduleType ScheduleType { get; set; } = ScheduleType.Interval;

    // Interval mode: due = LastDoneAt + IntervalValue·IntervalUnit
    public int IntervalValue { get; set; }
    public IntervalUnit IntervalUnit { get; set; } = IntervalUnit.Days;
    public DateTime? LastDoneAt { get; set; }

    // DueDate mode: due = NextDueAt, with an optional grace window after it
    public DateTime? NextDueAt { get; set; }
    public int DueWindowValue { get; set; }
    public IntervalUnit DueWindowUnit { get; set; } = IntervalUnit.Days;

    // Reminder lead — how far before "due" it flags as Upcoming (both modes)
    public int ReminderLeadValue { get; set; } = 30;
    public IntervalUnit ReminderLeadUnit { get; set; } = IntervalUnit.Days;

    public Equipment Equipment { get; set; } = null!;

    // DueAt/OverdueAt/Status are computed (getter-only, so EF maps no column for them)
    // and serialize with the rule. They are deliberately part of the API surface: the
    // frontend used to re-derive the due date in TypeScript to render "98 days overdue",
    // which duplicated the schedule semantics below and could disagree with Status —
    // showing an "Overdue" badge next to "Due in 3 days". Schedule arithmetic lives
    // here only; clients format the instants they are given.

    /// When this rule comes due. Null = "never done" / no date set, which reads as Due.
    public DateTime? DueAt => ScheduleType == ScheduleType.DueDate
        ? NextDueAt
        : LastDoneAt is DateTime last ? AddSpan(last, IntervalValue, IntervalUnit) : null;

    /// The instant it becomes Overdue: the start of the day *after* the due date, plus
    /// any grace window (interval rules have no window).
    ///
    /// These are due *dates*, stored at midnight — so a rule is Due for the whole of its
    /// due day and only turns Overdue once that day has fully elapsed. Comparing against
    /// the raw midnight instant instead made a rule due today report Overdue from
    /// 00:00:01, and the dashboard label then read "1 day overdue" on the due date itself.
    public DateTime? OverdueAt => DueAt is DateTime due
        ? (ScheduleType == ScheduleType.DueDate ? AddSpan(due, DueWindowValue, DueWindowUnit) : due)
            .Date.AddDays(1)
        : null;

    public MaintenanceStatus Status
    {
        get
        {
            if (DueAt is not DateTime due) return MaintenanceStatus.Due; // never done
            var now = DateTime.UtcNow;

            if (OverdueAt is DateTime overdueAt && now >= overdueAt) return MaintenanceStatus.Overdue;
            if (now >= due) return MaintenanceStatus.Due;
            if (now >= AddSpan(due, -ReminderLeadValue, ReminderLeadUnit)) return MaintenanceStatus.Upcoming;
            return MaintenanceStatus.Ok;
        }
    }

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
public enum ScheduleType { Interval, DueDate }
