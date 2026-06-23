namespace CmmsHome.Api.Models;

public class Shelf
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public Guid LocationId { get; set; }
    public Location Location { get; set; } = null!;
}
