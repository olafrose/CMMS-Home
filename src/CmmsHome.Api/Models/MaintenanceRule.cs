namespace CmmsHome.Api.Models;

public class MaintenanceRule
{
    public Guid Id { get; set; }
    public Guid AssetId { get; set; }
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

    public Asset Asset { get; set; } = null!;

    public MaintenanceStatus Status
    {
        get
        {
            DateTime due;
            DateTime overdueAfter;
            if (ScheduleType == ScheduleType.DueDate)
            {
                if (NextDueAt is null) return MaintenanceStatus.Due;
                due = NextDueAt.Value;
                overdueAfter = AddSpan(due, DueWindowValue, DueWindowUnit);
            }
            else
            {
                if (LastDoneAt is null) return MaintenanceStatus.Due;
                due = AddSpan(LastDoneAt.Value, IntervalValue, IntervalUnit);
                overdueAfter = due; // interval rules have no grace window
            }

            var now = DateTime.UtcNow;
            if (now > overdueAfter) return MaintenanceStatus.Overdue;
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
