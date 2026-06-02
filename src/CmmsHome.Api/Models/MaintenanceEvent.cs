namespace CmmsHome.Api.Models;

public class MaintenanceEvent
{
    public Guid Id { get; set; }
    public Guid AssetId { get; set; }
    public required string Type { get; set; }
    public string? Note { get; set; }
    public string? PhotoUrl { get; set; }
    public DateTime CreatedAt { get; set; }

    public Asset Asset { get; set; } = null!;
}
