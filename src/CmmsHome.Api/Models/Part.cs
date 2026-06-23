namespace CmmsHome.Api.Models;

public class Part
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public decimal Quantity { get; set; }
    public required string Unit { get; set; }
    public decimal? MinQuantity { get; set; }

    // Exactly one storage reference is set
    public Guid? BoxId { get; set; }
    public StorageBox? Box { get; set; }
    public Guid? ShelfId { get; set; }
    public Shelf? Shelf { get; set; }
    public Guid? LocationId { get; set; }
    public Location? Location { get; set; }
}
