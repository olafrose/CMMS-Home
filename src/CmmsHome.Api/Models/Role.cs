namespace CmmsHome.Api.Models;

// A named bundle of permissions. Admins may add their own roles ("Handyman", "Tenant")
// alongside the four seeded ones; the grid at /settings/access edits which permissions each
// role holds. Roles are independent of how a user signed in — see UserIdentity.
public class Role
{
    public Guid Id { get; set; }
    public required string Name { get; set; }

    // System roles cannot be deleted and carry meaning the code relies on: Admin (which
    // always keeps users.manage/roles.manage, so the last way in cannot be revoked),
    // Anonymous and Label scan. Admin is identified by its fixed id (SeededRoles.Admin), never
    // by "system and not anonymous" — that stopped being true when Label scan was added.
    public bool IsSystem { get; set; }

    // Exactly one role is the not-signed-in subject. It has no members — every request
    // without a session is evaluated against it, *everywhere*: what anyone who can reach the
    // app may do. Seeded with nothing.
    public bool IsAnonymous { get; set; }

    // Exactly one role says what holding a scanned label *adds* — on that one item or place
    // only, never anywhere else. No members either; a caller with a valid label cookie gets
    // Anonymous's rights unscoped plus these on the scanned target. This is what makes "can
    // a label log maintenance without an account?" a checkbox, without that checkbox also
    // opening every item to anyone on the network. Seeded with the quick-log rights.
    public bool IsLabelScan { get; set; }

    // Pre-selected when creating a user, and the role an externally-authenticated user
    // would receive on first sign-in. Without this, the first person to arrive through an
    // identity provider lands with no roles and no way to ask for any.
    public bool IsDefaultForNewUsers { get; set; }

    public int SortOrder { get; set; }
}
