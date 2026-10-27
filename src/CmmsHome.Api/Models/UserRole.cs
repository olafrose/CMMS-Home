namespace CmmsHome.Api.Models;

// Join row: a user may hold several roles, and holds the union of their permissions.
public class UserRole
{
    public Guid UserId { get; set; }
    public Guid RoleId { get; set; }
}
