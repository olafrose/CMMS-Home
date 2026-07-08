namespace CmmsHome.Api.Models;

// Audit trail for a managed-foldering move (Phase 2). One row per successful
// file move; enables an "undo" and a record of where a file came from.
public class DocumentMove
{
    public Guid Id { get; set; }
    public Guid DocumentId { get; set; }
    public Document? Document { get; set; }
    public required string FromPath { get; set; }
    public required string ToPath { get; set; }
    public DateTime MovedAt { get; set; }
}
