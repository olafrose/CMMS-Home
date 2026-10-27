namespace CmmsHome.Api.Models;

// A named bundle of permissions. Admins may add their own roles ("Handyman", "Tenant")
// alongside the four seeded ones; the grid at /settings/access edits which permissions each
// role holds. Roles are independent of how a user signed in — see UserIdentity.
public class Role
{
    public Guid Id { get; set; }
    public required string Name { get; set; }

    // System roles cannot be deleted and carry meaning the code relies on: Admin (which
    // always keeps users.manage/roles.manage, so the last way in cannot be revoked) and
    // Anonymous.
    public bool IsSystem { get; set; }

    // Exactly one role is the not-signed-in subject. It has no members — every request
    // without a session is evaluated against it, which is what makes "should scanning a
    // label work without logging in?" a checkbox rather than a code change.
    public bool IsAnonymous { get; set; }

    // Pre-selected when creating a user, and the role an externally-authenticated user
    // would receive on first sign-in. Without this, the first person to arrive through an
    // identity provider lands with no roles and no way to ask for any.
    public bool IsDefaultForNewUsers { get; set; }

    public int SortOrder { get; set; }
}
