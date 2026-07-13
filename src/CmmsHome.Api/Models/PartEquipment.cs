namespace CmmsHome.Api.Models;

// Join row for the Part↔Equipment many-to-many ("this consumable is used on
// these assets"). Composite key (PartId, EquipmentId).
public class PartEquipment
{
    public Guid PartId { get; set; }
    public Part Part { get; set; } = null!;
    public Guid EquipmentId { get; set; }
    public Equipment Equipment { get; set; } = null!;
}
