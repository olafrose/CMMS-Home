namespace CmmsHome.Api.Models;

// A user-entered web link (manual, spec sheet, repair video, reorder page) attached to
// one Equipment or one Part. Replaces pasting bare URLs into Notes, which render as
// unclickable text.
//
// Named ExternalLink rather than EquipmentLink because "Link" already means "association
// row" in this model (see DocumentLink, and the EquipmentLoan/EquipmentUsedOn join
// tables) — this is a URL, not a join.
//
// Targets follow the DocumentLink pattern: nullable FKs with no navigation properties,
// exactly one of which is set.
public class ExternalLink
{
    public Guid Id { get; set; }
    public required string Url { get; set; }
    public required string Label { get; set; }
    public Guid? EquipmentId { get; set; }
    public Guid? PartId { get; set; }
    public DateTime CreatedAt { get; set; }
}
