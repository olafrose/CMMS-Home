namespace CmmsHome.Api.Models;

public class ToolLoan
{
    public Guid Id { get; set; }
    public Guid ToolId { get; set; }
    public Tool? Tool { get; set; }
    public required string Borrower { get; set; }
    public DateTime LoanedAt { get; set; }
    public DateTime? ReturnedAt { get; set; }
}
