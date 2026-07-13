namespace CmmsHome.Api.Services;

public enum FileOutcome
{
    Skipped,       // foldering off, doc not in an app zone, or nothing to do
    Moved,         // file relocated into library/<Category>/
    AlreadyFiled,  // already at its managed destination (deduped)
    Pending,       // move failed (share/IO) — left in place, marked PendingMove
}

// Managed foldering (Phase 2): moves a classified document that lives in an
// app-owned write zone into library/<Category>/. Bounded blast radius — writes
// only inside the library zone, deletes only from an app zone, never touches
// files the user organized elsewhere on the share.
public interface IDocumentFiler
{
    Task<FileOutcome> FileAsync(Guid documentId, CancellationToken ct = default);

    // Reverse of FileAsync: move a file from library/ back to inbox/ (used when a
    // document is un-classified). Only moves files that live in the library zone.
    Task<FileOutcome> ReturnToInboxAsync(Guid documentId, CancellationToken ct = default);

    // Retry every document left in PendingMove (called after each scan cycle).
    Task<int> RetryPendingAsync(CancellationToken ct = default);
}
