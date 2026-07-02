namespace CmmsHome.Api.Models;

// A durable item. 'Asset' vs 'Tool' is a lens for the two list views, not a hard
// type: any equipment can be located, maintained (Rules/Events), and lent (Loans).
// 'Both' shows in both the Assets and Tools views. (Consumable parts stay separate.)
public enum EquipmentKind { Asset, Tool, Both }

public class Equipment
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public EquipmentKind Kind { get; set; } = EquipmentKind.Asset;

    public Guid? CategoryId { get; set; }
    public Category? Category { get; set; }

    public Guid? StorageLocationId { get; set; }
    public StorageLocation? StorageLocation { get; set; }

    public string? ImageUrl { get; set; }
    public string? Notes { get; set; }

    // Optional "used on / services" link to another piece of equipment.
    public Guid? UsedOnEquipmentId { get; set; }
    public Equipment? UsedOnEquipment { get; set; }

    public DateTime CreatedAt { get; set; }

    public List<MaintenanceEvent> Events { get; set; } = [];
    public List<MaintenanceRule> Rules { get; set; } = [];
    public List<EquipmentLoan> Loans { get; set; } = [];
}
