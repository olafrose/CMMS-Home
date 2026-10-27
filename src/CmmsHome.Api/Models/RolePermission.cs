namespace CmmsHome.Api.Models;

// One granted permission for one role. Absence is denial — there are no "deny" rows, so
// there is no precedence puzzle to reason about when a user holds two roles.
//
// Permission is the string key from the Permissions catalogue, not an enum: grants are
// rows, and renaming or reordering an enum member would silently repoint every existing
// grant in the database.
public class RolePermission
{
    public Guid RoleId { get; set; }
    public required string Permission { get; set; }
}
