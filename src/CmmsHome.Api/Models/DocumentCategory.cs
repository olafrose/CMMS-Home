namespace CmmsHome.Api.Models;

// First-class, user-managed document category (like Category / PartCategory).
// `Sensitive` will hide documents of this category from anonymous requests once
// authentication exists; until then it's an inert label.
public class DocumentCategory
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public bool Sensitive { get; set; }
    public string? Color { get; set; } // optional hex (e.g. "#3b82f6") for the badge
}
