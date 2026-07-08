namespace CmmsHome.Api.Models;

public class DocumentLink
{
    public Guid Id { get; set; }
    public Guid DocumentId { get; set; }
    public Document Document { get; set; } = null!;
    public Guid? EquipmentId { get; set; }
    public Guid? MaintenanceEventId { get; set; }
    public DateTime LinkedAt { get; set; }
}
