namespace CmmsHome.Api.Models;

public class StorageBox
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public Guid? ShelfId { get; set; }
    public Shelf? Shelf { get; set; }
    public Guid? LocationId { get; set; }
    public Location? Location { get; set; }
}
