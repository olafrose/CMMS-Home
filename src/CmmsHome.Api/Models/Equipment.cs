namespace CmmsHome.Api.Models;

// A durable item. 'Asset' vs 'Tool' is a lens for the two list views, not a hard
// type: any equipment can be located, maintained (Rules/Events), and lent (Loans).
// 'Both' shows in both the Assets and Tools views. (Consumable parts stay separate.)
public enum EquipmentKind { Asset, Tool, Both }

// Deliberately its own vocabulary rather than reusing MaintenanceStatus: a warranty is a
// fact with a deadline, not an obligation — nothing "completes" it, and "Due"/"Overdue"
// would read wrong. Unknown = no purchase date or no warranty recorded.
public enum WarrantyStatus { Unknown, Active, ExpiringSoon, Expired }

public class Equipment
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public EquipmentKind Kind { get; set; } = EquipmentKind.Asset;

    public Guid? CategoryId { get; set; }
    public Category? Category { get; set; }

    public Guid? StorageLocationId { get; set; }
    public StorageLocation? StorageLocation { get; set; }

    public string? ImageUrl { get; set; }
    public string? Notes { get; set; }

    // Ownership facts. PurchasedAt is when the item was BOUGHT — distinct from CreatedAt,
    // which is when the row was added (often years later when back-filling).
    public DateTime? PurchasedAt { get; set; }

    // Warranty as sold ("24 months"), counted from PurchasedAt. WarrantyUntil is an
    // optional absolute override for the cases a duration can't express: cover starting
    // at delivery/installation rather than purchase, or an extension outliving the base
    // warranty. When set it wins outright.
    public int? WarrantyMonths { get; set; }
    public DateTime? WarrantyUntil { get; set; }

    // How early WarrantyStatus starts reporting ExpiringSoon. Fixed rather than a user
    // setting: nothing surfaces warranties outside the detail page yet, so there's no
    // notification lead to tune. Promote it to AppSettings if that changes.
    private const int ExpiringSoonDays = 60;

    /// The day cover ends, or null if unknown. The override wins; otherwise derived.
    public DateTime? WarrantyExpiresAt => WarrantyUntil
        ?? (PurchasedAt is DateTime bought && WarrantyMonths is int months
            ? bought.AddMonths(months)
            : null);

    /// Same day-granularity rule as MaintenanceRule: an expiry *date* covers the whole of
    /// that day, so cover ending today is still Active and only lapses tomorrow.
    public WarrantyStatus WarrantyStatus
    {
        get
        {
            if (WarrantyExpiresAt is not DateTime expires) return WarrantyStatus.Unknown;
            var now = DateTime.UtcNow;
            if (now >= expires.Date.AddDays(1)) return WarrantyStatus.Expired;
            if (now >= expires.Date.AddDays(1).AddDays(-ExpiringSoonDays)) return WarrantyStatus.ExpiringSoon;
            return WarrantyStatus.Active;
        }
    }

    // "Used on / services" links to other equipment (many-to-many via EquipmentUsedOn):
    // e.g. one tool used on several assets. Associative only — not maintenance ownership.
    public List<Equipment> UsedOn { get; set; } = [];

    public DateTime CreatedAt { get; set; }

    public List<MaintenanceEvent> Events { get; set; } = [];
    public List<MaintenanceRule> Rules { get; set; } = [];
    public List<EquipmentLoan> Loans { get; set; } = [];
}
