namespace CmmsHome.Api.Models;

// What one document is filed against. Nullable FKs with no navigation properties, of which
// exactly one is set — a document may hold several of these rows, so one receipt can cover
// several things.
//
// Parts are a target because a consumable's own paperwork (filter spec sheet, oil safety
// data sheet, reorder confirmation) belongs to the part, not to whichever appliance it
// happens to fit. A part link stays literal: it does NOT surface on the equipment that
// PartEquipment says the part is used on, or an equipment's document list would silently
// mix direct and inherited paperwork with no way to tell them apart.
public class DocumentLink
{
    public Guid Id { get; set; }
    public Guid DocumentId { get; set; }
    public Document Document { get; set; } = null!;
    public Guid? EquipmentId { get; set; }
    public Guid? MaintenanceEventId { get; set; }
    public Guid? PartId { get; set; }
    public DateTime LinkedAt { get; set; }
}
