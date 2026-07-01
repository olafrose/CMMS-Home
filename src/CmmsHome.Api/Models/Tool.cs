namespace CmmsHome.Api.Models;

public class Tool
{
    public Guid Id { get; set; }
    public required string Name { get; set; }

    // Optional free-text notes / condition
    public string? Notes { get; set; }

    // Optional: the asset this tool services
    public Guid? AssetId { get; set; }
    public Asset? Asset { get; set; }

    // Optional: tool category (separate from part/asset categories)
    public Guid? ToolCategoryId { get; set; }
    public ToolCategory? ToolCategory { get; set; }

    // Exactly one storage reference is set
    public Guid? BoxId { get; set; }
    public StorageBox? Box { get; set; }
    public Guid? ShelfId { get; set; }
    public Shelf? Shelf { get; set; }
    public Guid? LocationId { get; set; }
    public Location? Location { get; set; }

    // Loan history; the tool is currently out iff a loan has ReturnedAt == null
    public List<ToolLoan> Loans { get; set; } = [];
}
