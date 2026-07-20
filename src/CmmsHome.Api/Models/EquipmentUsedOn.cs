namespace CmmsHome.Api.Models;

// Join row for the Equipment "used on" self-relation ("this tool is used on
// these assets"). Composite key (EquipmentId, UsedOnEquipmentId); EquipmentId is
// the tool, UsedOnEquipmentId the asset it services.
public class EquipmentUsedOn
{
    public Guid EquipmentId { get; set; }
    public Guid UsedOnEquipmentId { get; set; }
}
