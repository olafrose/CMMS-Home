namespace CmmsHome.Api.Models;

public class MaintenanceRule
{
    public Guid Id { get; set; }
    public Guid AssetId { get; set; }
    public int IntervalDays { get; set; }
    public DateTime? LastDoneAt { get; set; }

    public Asset Asset { get; set; } = null!;

    public MaintenanceStatus Status
    {
        get
        {
            if (LastDoneAt is null) return MaintenanceStatus.Due;
            var due = LastDoneAt.Value.AddDays(IntervalDays);
            if (due < DateTime.UtcNow) return MaintenanceStatus.Overdue;
            if (due <= DateTime.UtcNow.AddDays(30)) return MaintenanceStatus.Upcoming;
            return MaintenanceStatus.Ok;
        }
    }
}

public enum MaintenanceStatus { Ok, Upcoming, Due, Overdue }
