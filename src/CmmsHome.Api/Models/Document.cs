namespace CmmsHome.Api.Models;

public class Document
{
    public Guid Id { get; set; }
    public required string RelativePath { get; set; }
    public required string FileName { get; set; }
    public required string ContentType { get; set; }
    public long SizeBytes { get; set; }
    public required string ContentHash { get; set; }
    public DateTime LastModifiedUtc { get; set; }
    public DateTime DiscoveredAt { get; set; }
    public DocumentStatus Status { get; set; }
    public Guid? CategoryId { get; set; }
    public DocumentCategory? Category { get; set; }
    public string? Title { get; set; }
    public DateTime CreatedAt { get; set; }

    public List<DocumentLink> Links { get; set; } = [];
}

// PendingMove MUST stay last: the value is persisted as an int, so appending
// keeps existing rows' values stable (Unclassified=0 … Missing=3, PendingMove=4).
public enum DocumentStatus { Unclassified, Classified, Ignored, Missing, PendingMove }
