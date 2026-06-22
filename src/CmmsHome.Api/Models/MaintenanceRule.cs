namespace CmmsHome.Api.Models;

public class MaintenanceRule
{
    public Guid Id { get; set; }
    public Guid AssetId { get; set; }
    public string? Name { get; set; }
    public int IntervalValue { get; set; }
    public IntervalUnit IntervalUnit { get; set; } = IntervalUnit.Days;
    public DateTime? LastDoneAt { get; set; }

    public Asset Asset { get; set; } = null!;

    public MaintenanceStatus Status
    {
        get
        {
            if (LastDoneAt is null) return MaintenanceStatus.Due;
            var due = IntervalUnit switch
            {
                IntervalUnit.Weeks  => LastDoneAt.Value.AddDays(IntervalValue * 7),
                IntervalUnit.Months => LastDoneAt.Value.AddMonths(IntervalValue),
                IntervalUnit.Years  => LastDoneAt.Value.AddYears(IntervalValue),
                _                   => LastDoneAt.Value.AddDays(IntervalValue),
            };
            if (due < DateTime.UtcNow) return MaintenanceStatus.Overdue;
            if (due <= DateTime.UtcNow.AddDays(30)) return MaintenanceStatus.Upcoming;
            return MaintenanceStatus.Ok;
        }
    }
}

public enum MaintenanceStatus { Ok, Upcoming, Due, Overdue }
public enum IntervalUnit { Days, Weeks, Months, Years }
