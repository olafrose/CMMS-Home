namespace CmmsHome.Api.Models;

public class Part
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public decimal Quantity { get; set; }
    public required string Unit { get; set; }
    public decimal? MinQuantity { get; set; }

    // The equipment this part is used on (many-to-many via PartEquipment).
    public List<Equipment> Equipment { get; set; } = [];

    // Optional: part category (separate from asset categories)
    public Guid? PartCategoryId { get; set; }
    public PartCategory? PartCategory { get; set; }

    // Where it's stored — a single place at any depth of the hierarchy
    public Guid? StorageLocationId { get; set; }
    public StorageLocation? StorageLocation { get; set; }
}
