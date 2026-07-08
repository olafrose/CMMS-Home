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
    public DocumentCategory? Category { get; set; }
    public string? Title { get; set; }
    public DateTime CreatedAt { get; set; }

    public List<DocumentLink> Links { get; set; } = [];
}

public enum DocumentStatus { Unclassified, Classified, Ignored, Missing }
public enum DocumentCategory { Manual, Warranty, Receipt, Invoice, Photo, Other }
