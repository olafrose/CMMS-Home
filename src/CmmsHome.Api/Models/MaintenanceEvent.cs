namespace CmmsHome.Api.Models;

public class MaintenanceEvent
{
    public Guid Id { get; set; }
    public Guid EquipmentId { get; set; }
    public required string Type { get; set; }
    public string? Note { get; set; }
    public string? PhotoUrl { get; set; }
    public DateTime CreatedAt { get; set; }

    public Equipment Equipment { get; set; } = null!;
}
