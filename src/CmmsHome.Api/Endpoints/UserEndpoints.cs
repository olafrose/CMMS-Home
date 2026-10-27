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
            // Required on create, optional on edit — hence the explicit check here rather
            // than in ValidateCredentials, which cannot tell the two cases apart.
            if (string.IsNullOrEmpty(dto.Password))
                return Results.ValidationProblem(
                    new Dictionary<string, string[]> { ["password"] = ["A password is required"] });

            if (AccountService.ValidateCredentials(dto.Username, dto.Password) is { } errors)
                return Results.ValidationProblem(errors);

            if (await accounts.UsernameTakenAsync(dto.Username!))
                return Results.ValidationProblem(
                    new Dictionary<string, string[]> { ["username"] = ["Already taken"] });

            var roleIds = await ValidRoleIdsAsync(db, dto.RoleIds);

            var user = await accounts.CreateLocalUserAsync(
                dto.Username!, dto.Password!, dto.DisplayName, roleIds);

            var created = await db.Users.Include(u => u.Roles).SingleAsync(u => u.Id == user.Id);
            return Results.Created($"/users/{user.Id}", Dto(created));
        }).RequirePermission(Permissions.UsersManage);

        group.MapPut("/{id:guid}", async (
            Guid id, SaveUserDto dto, CmmsDbContext db, AccountService accounts, ActorAccessor accessor) =>
        {
            var user = await db.Users.Include(u => u.Roles).SingleOrDefaultAsync(u => u.Id == id);
            if (user is null) return Results.NotFound();

            if (AccountService.ValidateCredentials(dto.Username, dto.Password) is { } errors)
                return Results.ValidationProblem(errors);

            if (await accounts.UsernameTakenAsync(dto.Username!, id))
                return Results.ValidationProblem(
                    new Dictionary<string, string[]> { ["username"] = ["Already taken"] });

            var roleIds = (await ValidRoleIdsAsync(db, dto.RoleIds)).ToList();

            // Guard the way back in. Both checks are about the same failure: an admin who
            // edits themselves into a system nobody can administer, on a NAS whose only
            // door is this app.
            if (await WouldStrandAdminAsync(db, id, roleIds, dto.IsActive) is { } stranded)
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

            if (await WouldStrandAdminAsync(db, id, [], isActive: false) is { } stranded)
                return stranded;

            // Their logged events survive with CreatedByUserId nulled by the FK's SetNull:
            // the maintenance history is the point of the app, the account is bookkeeping.
            db.Users.Remove(user);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequirePermission(Permissions.UsersManage);
    }

    // Refuses a change that would leave nobody able to administer the app. Returns null when
    // the change is safe.
    private static async Task<IResult?> WouldStrandAdminAsync(
        CmmsDbContext db, Guid userId, List<Guid> newRoleIds, bool isActive)
    {
        var adminRoleIds = await db.Roles
            .Where(r => r.IsSystem && !r.IsAnonymous)
            .Select(r => r.Id)
            .ToListAsync();

        var keepsAdmin = isActive && newRoleIds.Any(adminRoleIds.Contains);
        if (keepsAdmin) return null;

        var otherActiveAdmins = await db.UserRoles
            .Where(ur => adminRoleIds.Contains(ur.RoleId) && ur.UserId != userId)
            .Join(db.Users.Where(u => u.IsActive), ur => ur.UserId, u => u.Id, (ur, u) => u.Id)
            .Distinct()
            .CountAsync();

        if (otherActiveAdmins > 0) return null;

        return Results.ValidationProblem(
            new Dictionary<string, string[]>
            {
                ["roleIds"] =
                [
                    "This is the last active administrator. Give someone else the Admin role first, "
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
            .Where(r => ids.Contains(r.Id) && !r.IsAnonymous)
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
    List<Guid>? RoleIds);
