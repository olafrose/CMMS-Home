namespace CmmsHome.Api.Models;

// First-class, user-managed document category (like Category / PartCategory).
// `Sensitive` hides documents of this category from anyone without the
// documents.read_sensitive permission — they are filtered out of lists and 404 on fetch,
// rather than 403, since a 403 would confirm the document exists.
public class DocumentCategory
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public bool Sensitive { get; set; }
    public string? Color { get; set; } // optional hex (e.g. "#3b82f6") for the badge
}
