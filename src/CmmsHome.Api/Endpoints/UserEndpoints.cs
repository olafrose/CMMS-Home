using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using CmmsHome.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Endpoints;

// Account administration. Every route here needs users.manage, which the Admin role can
// never lose — see Permissions.AdminAlwaysOn.
public static class UserEndpoints
{
    public static void MapUserEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/users").WithTags("Users");

        group.MapGet("/", async (CmmsDbContext db) =>
        {
            // Materialised before projecting: Dto is a plain method, so leaving it inside the
            // query would ask EF to translate it to SQL and fail at runtime.
            var users = await db.Users
                .Include(u => u.Roles)
                .OrderBy(u => u.Username)
                .ToListAsync();

            return Results.Ok(users.Select(Dto));
        }).RequirePermission(Permissions.UsersManage);

        group.MapGet("/{id:guid}", async (Guid id, CmmsDbContext db) =>
        {
            var user = await db.Users.Include(u => u.Roles).SingleOrDefaultAsync(u => u.Id == id);
            return user is null ? Results.NotFound() : Results.Ok(Dto(user));
        }).RequirePermission(Permissions.UsersManage);

        group.MapPost("/", async (SaveUserDto dto, CmmsDbContext db, AccountService accounts) =>
        {
            var kind = dto.Kind ?? UserKind.Person;

            // A service account signs in with nothing but its tokens, so a password here
            // would be a credential nobody can use — and one more to leak.
            if (kind == UserKind.Service && !string.IsNullOrEmpty(dto.Password))
                return ServiceAccountHasNoPassword();

            // Required on create, optional on edit — hence the explicit check here rather
            // than in ValidateCredentials, which cannot tell the two cases apart.
            if (kind == UserKind.Person && string.IsNullOrEmpty(dto.Password))
                return Results.ValidationProblem(
                    new Dictionary<string, string[]> { ["password"] = ["A password is required"] });

            if (AccountService.ValidateCredentials(dto.Username, dto.Password) is { } errors)
                return Results.ValidationProblem(errors);

            if (await accounts.UsernameTakenAsync(dto.Username!))
                return Results.ValidationProblem(
                    new Dictionary<string, string[]> { ["username"] = ["Already taken"] });

            var roleIds = await ValidRoleIdsAsync(db, dto.RoleIds);

            var user = kind == UserKind.Service
                ? await accounts.CreateServiceAccountAsync(dto.Username!, dto.DisplayName, roleIds)
                : await accounts.CreateLocalUserAsync(dto.Username!, dto.Password!, dto.DisplayName, roleIds);

            var created = await db.Users.Include(u => u.Roles).SingleAsync(u => u.Id == user.Id);
            return Results.Created($"/users/{user.Id}", Dto(created));
        }).RequirePermission(Permissions.UsersManage);

        group.MapPut("/{id:guid}", async (
            Guid id, SaveUserDto dto, CmmsDbContext db, AccountService accounts, ActorAccessor accessor) =>
        {
            var user = await db.Users.Include(u => u.Roles).SingleOrDefaultAsync(u => u.Id == id);
            if (user is null) return Results.NotFound();

            // Kind is fixed at creation: turning a person into a service account would leave
            // a password identity behind, and the reverse would hand a token-only account a
            // way to sign in. Create a new account instead.
            if (user.Kind == UserKind.Service && !string.IsNullOrEmpty(dto.Password))
                return ServiceAccountHasNoPassword();

            if (AccountService.ValidateCredentials(dto.Username, dto.Password) is { } errors)
                return Results.ValidationProblem(errors);

            if (await accounts.UsernameTakenAsync(dto.Username!, id))
                return Results.ValidationProblem(
                    new Dictionary<string, string[]> { ["username"] = ["Already taken"] });

            var roleIds = (await ValidRoleIdsAsync(db, dto.RoleIds)).ToList();

            // Guard the way back in. Both checks are about the same failure: an admin who
            // edits themselves into a system nobody can administer, on a NAS whose only
            // door is this app.
            if (await WouldStrandAdminAsync(db, user, roleIds, dto.IsActive) is { } stranded)
                return stranded;

            user.Username = AccountService.NormaliseUsername(dto.Username!);
            user.DisplayName = string.IsNullOrWhiteSpace(dto.DisplayName) ? null : dto.DisplayName.Trim();
            user.IsActive = dto.IsActive;

            // Diff the role set through the change tracker, never ExecuteDelete + re-Add. The
            // join rows are already tracked — by the Include above, and by ActorAccessor when an
            // admin edits themselves — so re-adding an unchanged (user, role) pair threw
            // "already being tracked", but only *after* ExecuteDelete had committed on its
            // own. Every save of a user with an unchanged role stripped them of all roles and
            // answered 500; it is how the only admin lost Admin. This way the whole edit lands
            // in one SaveChanges, and a failure changes nothing.
            var current = await db.UserRoles.Where(r => r.UserId == id).ToListAsync();
            db.UserRoles.RemoveRange(current.Where(r => !roleIds.Contains(r.RoleId)));
            foreach (var roleId in roleIds.Except(current.Select(r => r.RoleId)))
                db.UserRoles.Add(new UserRole { UserId = id, RoleId = roleId });

            // A password is optional on edit — omitted means "leave it alone".
            if (!string.IsNullOrEmpty(dto.Password))
                await accounts.SetPasswordAsync(user, dto.Password);

            await db.SaveChangesAsync();

            // Deactivating someone should log them out now, not whenever their cookie
            // happens to expire. Sessions are rows precisely so this is possible. After the
            // save, so a refused edit doesn't sign them out anyway.
            if (!dto.IsActive)
                await db.Sessions.Where(s => s.UserId == id).ExecuteDeleteAsync();

            var saved = await db.Users.Include(u => u.Roles).SingleAsync(u => u.Id == id);
            return Results.Ok(Dto(saved));
        }).RequirePermission(Permissions.UsersManage);

        group.MapDelete("/{id:guid}", async (Guid id, CmmsDbContext db) =>
        {
            var user = await db.Users.SingleOrDefaultAsync(u => u.Id == id);
            if (user is null) return Results.NotFound();

            if (await WouldStrandAdminAsync(db, user, [], isActive: false) is { } stranded)
                return stranded;

            // Their logged events survive with CreatedByUserId nulled by the FK's SetNull:
            // the maintenance history is the point of the app, the account is bookkeeping.
            db.Users.Remove(user);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequirePermission(Permissions.UsersManage);

        // Any account's tokens, personal ones included, so an admin can see what scripts act
        // as whom and revoke one without needing that person's password.
        group.MapGet("/{id:guid}/tokens", async (Guid id, CmmsDbContext db, ApiTokenService tokens) =>
        {
            if (!await db.Users.AnyAsync(u => u.Id == id)) return Results.NotFound();
            return Results.Ok(await tokens.ListAsync(id));
        }).RequirePermission(Permissions.UsersManage);

        group.MapGet("/{id:guid}/grantable-permissions", async (Guid id, CmmsDbContext db, ApiTokenService tokens) =>
        {
            if (!await db.Users.AnyAsync(u => u.Id == id)) return Results.NotFound();
            return Results.Ok(await tokens.GrantableAsync(id));
        }).RequirePermission(Permissions.UsersManage);

        // Minting is service accounts only. An admin minting a token for a *person* would be
        // impersonation with extra steps: everything it did would read as that person's.
        group.MapPost("/{id:guid}/tokens", async (
            Guid id, MintTokenDto dto, CmmsDbContext db, ApiTokenService tokens, ActorAccessor accessor) =>
        {
            var owner = await db.Users.SingleOrDefaultAsync(u => u.Id == id);
            if (owner is null) return Results.NotFound();

            if (owner.Kind != UserKind.Service)
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["kind"] = ["Tokens can only be minted here for service accounts. "
                        + "People create their own personal tokens on their account page."],
                });

            var actor = await accessor.GetAsync();
            var (token, row, errors) = await tokens.MintAsync(owner, dto, actor.User?.Id);
            if (errors is not null) return Results.ValidationProblem(errors);

            return Results.Created($"/users/{id}/tokens/{row!.Id}",
                new { token, apiToken = ApiTokenService.Dto(row) });
        }).RequirePermission(Permissions.UsersManage).SessionOnly();

        group.MapDelete("/{id:guid}/tokens/{tokenId:guid}", async (Guid id, Guid tokenId, CmmsDbContext db) =>
        {
            var deleted = await db.ApiTokens
                .Where(t => t.Id == tokenId && t.UserId == id)
                .ExecuteDeleteAsync();

            return deleted > 0 ? Results.NoContent() : Results.NotFound();
        }).RequirePermission(Permissions.UsersManage);
    }

    private static IResult ServiceAccountHasNoPassword() =>
        Results.ValidationProblem(new Dictionary<string, string[]>
            { ["password"] = ["Service accounts have no password; they authenticate with API tokens"] });

    // Refuses a change that would leave nobody able to administer the app. Returns null when
    // the change is safe.
    //
    // Only people count. A service account may hold Admin — a provisioning script needs
    // it — but it cannot sign in, so it being "the last admin" would leave nobody at the
    // door. Editing a service account is always safe for the same reason.
    private static async Task<IResult?> WouldStrandAdminAsync(
        CmmsDbContext db, User user, List<Guid> newRoleIds, bool isActive)
    {
        List<Guid> adminRoleIds = [SeededRoles.Admin];

        var keepsAdmin = user.Kind == UserKind.Service || isActive && newRoleIds.Any(adminRoleIds.Contains);
        if (keepsAdmin) return null;

        var otherActiveAdmins = await db.UserRoles
            .Where(ur => adminRoleIds.Contains(ur.RoleId) && ur.UserId != user.Id)
            .Join(db.Users.Where(u => u.IsActive && u.Kind == UserKind.Person),
                ur => ur.UserId, u => u.Id, (ur, u) => u.Id)
            .Distinct()
            .CountAsync();

        if (otherActiveAdmins > 0) return null;

        return Results.ValidationProblem(
            new Dictionary<string, string[]>
            {
                ["roleIds"] =
                [
                    "This is the last active administrator. Give another person the Admin role first, "
                    + "or the app would be left with nobody able to manage it.",
                ],
            });
    }

    // Silently drops unknown role ids rather than erroring: a role deleted between the
    // client loading the form and submitting it should not lose the user's other edits.
    private static async Task<List<Guid>> ValidRoleIdsAsync(CmmsDbContext db, IEnumerable<Guid>? requested)
    {
        var ids = (requested ?? []).Distinct().ToList();
        if (ids.Count == 0) return [];

        return await db.Roles
            .Where(r => ids.Contains(r.Id) && !r.IsAnonymous && !r.IsLabelScan)
            .Select(r => r.Id)
            .ToListAsync();
    }

    // Projected rather than returned raw, so no password hash or provider subject can ride
    // along on a careless serialization.
    private static object Dto(User u) => new
    {
        u.Id,
        u.Username,
        u.DisplayName,
        u.Kind,
        u.IsActive,
        u.CreatedAt,
        u.LastLoginAt,
        roles = u.Roles.OrderBy(r => r.SortOrder).Select(r => new { r.Id, r.Name }),
    };
}

record SaveUserDto(
    string? Username,
    string? Password,
    string? DisplayName,
    bool IsActive,
    List<Guid>? RoleIds,
    // Create only; ignored on edit. Null means Person, so existing clients are unaffected.
    UserKind? Kind = null);
