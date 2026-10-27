namespace CmmsHome.Api.Models;

// A single, self-referencing storage hierarchy. A place can contain other places
// (Room > Shelf > Box, or any nesting up to the API-enforced depth cap). Assets,
// tools, and parts each reference exactly one StorageLocation at any depth.
public class StorageLocation
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public string? Icon { get; set; } // optional emoji marker (room/shelf/box/…)
    public Guid? ParentId { get; set; }
    public StorageLocation? Parent { get; set; }
    public List<StorageLocation> Children { get; set; } = [];

    // Maintenance logged against the place itself — literal, not rolled up from what is
    // stored here.
    public List<MaintenanceEvent> Events { get; set; } = [];
    public List<MaintenanceRule> Rules { get; set; } = [];
}
