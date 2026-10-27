using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Services;

// Who is making this request, and what they may do.
//
// "Anonymous" is not a special case in the code — it is a Role like any other, so the
// question "should scanning a printed label work without signing in?" is answered by the
// rights grid rather than by a branch in here.
public class CurrentActor
{
    // Null when nobody is signed in; the request is then evaluated against the Anonymous role.
    public User? User { get; init; }
    public Guid? SessionId { get; init; }

    public IReadOnlySet<string> Permissions { get; init; } = new HashSet<string>();

    // Set when the caller arrived by scanning a printed label rather than signing in. The
    // grid says *what* an anonymous subject may do; this says *which* item they may do it
    // to. Both must agree, which is what stops a single label becoming a key to everything.
    public Guid? ScopedEquipmentId { get; init; }

    // True when no accounts exist yet, so the app is in first-run setup.
    public bool SetupRequired { get; init; }

    public bool IsAuthenticated => User is not null;
    public bool IsLabelScoped => ScopedEquipmentId is not null;

    public bool Can(string permission) => Permissions.Contains(permission);

    // A label scan may only ever touch the one item its token was signed for. Signed-in
    // users are unscoped and may touch whatever their permissions allow.
    public bool MayTouchEquipment(Guid equipmentId) =>
        !IsLabelScoped || ScopedEquipmentId == equipmentId;

    public static readonly CurrentActor None = new();
}

// Resolves the actor for the current request, once.
//
// Permissions are read from the database per request rather than cached or baked into the
// session, following the same reasoning as GetAppSettingsAsync: it is one indexed query, and
// staying uncached means an edit in the rights grid takes effect immediately with no
// invalidation to forget. Editing a role and finding it still unenforced until everyone
// signs out again would be a nasty surprise for an admin locking something down.
public class ActorAccessor(IHttpContextAccessor http, CmmsDbContext db, LabelSigner labels, SetupState setup)
{
    // How stale a session's LastSeenAt is allowed to get. Updating it on every request would
    // mean a database write per API call — pointless churn on a low-powered NAS for a field
    // only ever read by a human looking at their session list.
    private static readonly TimeSpan LastSeenPrecision = TimeSpan.FromMinutes(5);

    private CurrentActor? _resolved;

    public async Task<CurrentActor> GetAsync()
    {
        if (_resolved is not null) return _resolved;

        var ctx = http.HttpContext;
        if (ctx is null) return _resolved = CurrentActor.None;

        // No accounts at all: first run. Reported so the client can send the operator to
        // /setup instead of a login form they cannot satisfy.
        var setupRequired = !await setup.IsCompleteAsync(db);

        var session = await LoadSessionAsync(ctx);
        if (session is not null)
        {
            var user = await db.Users
                .Include(u => u.Roles)
                .SingleOrDefaultAsync(u => u.Id == session.UserId);

            // A deactivated or deleted user's cookie stops working immediately, which is the
            // point of keeping sessions server-side.
            if (user is { IsActive: true })
            {
                if (DateTime.UtcNow - session.LastSeenAt > LastSeenPrecision)
                {
                    session.LastSeenAt = DateTime.UtcNow;
                    await db.SaveChangesAsync();
                }

                return _resolved = new CurrentActor
                {
                    User = user,
                    SessionId = session.Id,
                    Permissions = await PermissionsForRolesAsync(user.Roles.Select(r => r.Id)),
                    SetupRequired = setupRequired,
                };
            }
        }

        // Not signed in: the Anonymous role, optionally narrowed to one item by a label token.
        var anonRoleId = await db.Roles.Where(r => r.IsAnonymous).Select(r => r.Id).SingleOrDefaultAsync();

        return _resolved = new CurrentActor
        {
            Permissions = anonRoleId == Guid.Empty
                ? new HashSet<string>()
                : await PermissionsForRolesAsync([anonRoleId]),
            ScopedEquipmentId = await labels.TryReadLabelSessionAsync(ctx.Request.Cookies[AuthCookies.LabelSession]),
            SetupRequired = setupRequired,
        };
    }

    // Permissions for a specific user, ignoring the current request's actor.
    //
    // Needed immediately after signing in: the actor was resolved before the session cookie
    // existed, and it is memoised, so asking it again would still describe the anonymous
    // caller and hand the freshly-signed-in user an empty UI.
    public async Task<IReadOnlySet<string>> PermissionsForUserAsync(Guid userId)
    {
        var roleIds = await db.UserRoles
            .Where(r => r.UserId == userId)
            .Select(r => r.RoleId)
            .ToListAsync();

        return await PermissionsForRolesAsync(roleIds);
    }

    private async Task<Session?> LoadSessionAsync(HttpContext ctx)
    {
        var raw = ctx.Request.Cookies[AuthCookies.Session];
        if (string.IsNullOrEmpty(raw)) return null;

        var hash = AuthTokens.Hash(raw);
        var session = await db.Sessions.SingleOrDefaultAsync(s => s.TokenHash == hash);
        if (session is null) return null;

        if (session.ExpiresAt <= DateTime.UtcNow)
        {
            db.Sessions.Remove(session);
            await db.SaveChangesAsync();
            return null;
        }

        return session;
    }

    private async Task<IReadOnlySet<string>> PermissionsForRolesAsync(IEnumerable<Guid> roleIds)
    {
        var ids = roleIds.ToList();
        if (ids.Count == 0) return new HashSet<string>();

        var granted = await db.RolePermissions
            .Where(p => ids.Contains(p.RoleId))
            .Select(p => p.Permission)
            .Distinct()
            .ToListAsync();

        var set = granted.ToHashSet();

        // The Admin role cannot lose the permissions that administer the app, whatever the
        // grant rows happen to say. Belt to the braces of the write-side guard and the
        // locked cells in the grid: three ways to fail to lock yourself out of a NAS whose
        // only door is this app.
        if (await db.Roles.AnyAsync(r => ids.Contains(r.Id) && r.IsSystem && !r.IsAnonymous))
            foreach (var p in Permissions.AdminAlwaysOn) set.Add(p);

        // Held permissions are always a subset of the catalogue: a key left behind by a
        // removed feature must not keep granting anything.
        set.IntersectWith(Permissions.AllKeys);
        return set;
    }
}

public static class AuthCookies
{
    public const string Session = "cmms_session";
    public const string LabelSession = "cmms_label";
}
