namespace CmmsHome.Api.Models;

public class PartUsage
{
    public Guid Id { get; set; }
    public Guid MaintenanceEventId { get; set; }
    public MaintenanceEvent MaintenanceEvent { get; set; } = null!;
    public Guid PartId { get; set; }
    public Part Part { get; set; } = null!;
    public decimal QuantityUsed { get; set; }
}
