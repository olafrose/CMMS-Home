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
    // For a bearer token this is the token's owner — a service account or a person — so
    // whatever the token does is attributed to that account.
    public User? User { get; init; }
    public Guid? SessionId { get; init; }

    // Set when the caller authenticated with `Authorization: Bearer`. Permissions are then
    // already narrowed to the token's scope.
    public Guid? ApiTokenId { get; init; }

    // A bearer header was sent but named no valid token. Never quietly downgraded to
    // Anonymous: that could succeed on an anonymous-permitted route and hide a broken or
    // revoked key until something more important failed. The middleware answers 401.
    public bool InvalidBearer { get; init; }

    public IReadOnlySet<string> Permissions { get; init; } = new HashSet<string>();

    // Set when the caller arrived by scanning a printed label rather than signing in. The
    // grid says *what* an anonymous subject may do; this says *which* item they may do it
    // to. Both must agree, which is what stops a single label becoming a key to everything.
    // At most one of the two is set: a label names either an item or a place.
    public Guid? ScopedEquipmentId { get; init; }
    public Guid? ScopedStorageLocationId { get; init; }

    // True when no accounts exist yet, so the app is in first-run setup.
    public bool SetupRequired { get; init; }

    public bool IsAuthenticated => User is not null;
    public bool IsApiToken => ApiTokenId is not null;
    public bool IsLabelScoped => ScopedEquipmentId is not null || ScopedStorageLocationId is not null;

    public bool Can(string permission) => Permissions.Contains(permission);

    // A label scan may only ever touch the one item its token was signed for. Signed-in
    // users are unscoped and may touch whatever their permissions allow.
    public bool MayTouchEquipment(Guid equipmentId) =>
        !IsLabelScoped || ScopedEquipmentId == equipmentId;

    // The same, for anything that targets either an item or a place (events, rules). Both
    // halves must match, so an item's label can't reach a place and vice versa — and passing
    // two nulls (an unfiltered list) is refused for a scoped caller.
    public bool MayTouchTarget(Guid? equipmentId, Guid? storageLocationId) =>
        !IsLabelScoped || (equipmentId == ScopedEquipmentId && storageLocationId == ScopedStorageLocationId);

    public static readonly CurrentActor None = new();

    // Permissions this actor's *account* holds, before a token narrowed them. Only set for
    // token callers, so a refusal can say whether the token or the roles were the reason.
    public IReadOnlySet<string>? OwnerPermissions { get; init; }
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

        // A bearer token, when present, is the only credential considered: a script that
        // happens to run in a browser with a session cookie must still be exactly as
        // capable as its token says, no more.
        if (BearerToken(ctx) is { } bearer)
            return _resolved = await ResolveTokenAsync(bearer, setupRequired);

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

        // Not signed in: the Anonymous role, optionally narrowed to one target by a label token.
        var scope = await labels.TryReadLabelSessionAsync(ctx.Request.Cookies[AuthCookies.LabelSession]);
        var anonRoleId = await db.Roles.Where(r => r.IsAnonymous).Select(r => r.Id).SingleOrDefaultAsync();

        return _resolved = new CurrentActor
        {
            Permissions = anonRoleId == Guid.Empty
                ? new HashSet<string>()
                : await PermissionsForRolesAsync([anonRoleId]),
            ScopedEquipmentId = scope is { Kind: LabelTargetKind.Equipment } ? scope.Value.Id : null,
            ScopedStorageLocationId = scope is { Kind: LabelTargetKind.StorageLocation } ? scope.Value.Id : null,
            SetupRequired = setupRequired,
        };
    }

    private async Task<CurrentActor> ResolveTokenAsync(string bearer, bool setupRequired)
    {
        var hash = AuthTokens.Hash(bearer);
        var token = await db.ApiTokens
            .Include(t => t.Permissions)
            .SingleOrDefaultAsync(t => t.TokenHash == hash);

        var user = token is null || token.ExpiresAt is { } at && at <= DateTime.UtcNow
            ? null
            : await db.Users.Include(u => u.Roles).SingleOrDefaultAsync(u => u.Id == token.UserId);

        // Unknown, expired, or owned by a deactivated account: all the same 401. Expired rows
        // are kept rather than deleted here, unlike sessions, so the owner can still see in
        // their list that the token lapsed instead of it silently vanishing.
        if (token is null || user is not { IsActive: true })
            return new CurrentActor { InvalidBearer = true, SetupRequired = setupRequired };

        if (token.LastUsedAt is not { } used || DateTime.UtcNow - used > LastSeenPrecision)
        {
            token.LastUsedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }

        // The owner's roles are the ceiling, read fresh like any session's, so a grid edit
        // binds every token at once. The scope rows only ever narrow that.
        var owner = await PermissionsForRolesAsync(user.Roles.Select(r => r.Id));
        var effective = owner.ToHashSet();
        effective.IntersectWith(token.Permissions.Select(p => p.Permission));

        return new CurrentActor
        {
            User = user,
            ApiTokenId = token.Id,
            Permissions = effective,
            OwnerPermissions = owner,
            SetupRequired = setupRequired,
        };
    }

    // The token from `Authorization: Bearer <token>`, or null when there is no bearer header.
    // Other schemes are ignored rather than rejected: nothing here issues them, and refusing
    // would break a reverse proxy that adds its own Basic auth in front of the app.
    public static string? BearerToken(HttpContext ctx)
    {
        var header = ctx.Request.Headers.Authorization.ToString();
        const string scheme = "Bearer ";
        if (!header.StartsWith(scheme, StringComparison.OrdinalIgnoreCase)) return null;

        var token = header[scheme.Length..].Trim();
        // An empty bearer is still a bearer: answer 401 rather than treating it as absent.
        return token;
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
