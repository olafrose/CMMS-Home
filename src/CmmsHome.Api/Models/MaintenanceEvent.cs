namespace CmmsHome.Api.Models;

public class MaintenanceEvent
{
    public Guid Id { get; set; }
    // The target: exactly one of these is set (a DB check constraint enforces it). A place
    // is a target in its own right — a room gets painted, gutters get cleaned — rather than
    // something you fake by inventing an Equipment row stored there.
    public Guid? EquipmentId { get; set; }
    public Guid? StorageLocationId { get; set; }
    public required string Type { get; set; }
    public string? Note { get; set; }
    public string? PhotoUrl { get; set; }
    public DateTime CreatedAt { get; set; }

    // Who logged this. Null for anonymous label scans and for every row that predates
    // authentication, both of which render as "—" rather than being backfilled to a
    // fictional user.
    public Guid? CreatedByUserId { get; set; }

    public Equipment? Equipment { get; set; }
    public StorageLocation? StorageLocation { get; set; }
}
