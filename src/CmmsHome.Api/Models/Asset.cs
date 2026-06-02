namespace CmmsHome.Api.Models;

public class Asset
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public string? Category { get; set; }
    public string? Location { get; set; }
    public string? ImageUrl { get; set; }
    public DateTime CreatedAt { get; set; }

    public List<MaintenanceEvent> Events { get; set; } = [];
    public List<MaintenanceRule> Rules { get; set; } = [];
}
