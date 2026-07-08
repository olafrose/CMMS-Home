namespace CmmsHome.Api.Services;

// Serializes filesystem reconciliation (the scanner) and managed-foldering moves
// (the filer) so they can never operate on the same files concurrently. Shared
// singleton injected into both services.
public sealed class DocumentIoLock
{
    public SemaphoreSlim Semaphore { get; } = new(1, 1);
}
