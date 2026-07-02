namespace CmmsHome.Api.Models;

public class EquipmentLoan
{
    public Guid Id { get; set; }
    public Guid EquipmentId { get; set; }
    public Equipment? Equipment { get; set; }
    public required string Borrower { get; set; }
    public DateTime LoanedAt { get; set; }
    public DateTime? ReturnedAt { get; set; }
}
