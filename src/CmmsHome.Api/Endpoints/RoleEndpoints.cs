using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using CmmsHome.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Endpoints;

// Roles and the rights grid.
//
// The grid is served and saved whole rather than cell by cell: a permission matrix
// half-applied is a worse state than either the old or the new one, and an admin tightening
// access should not be able to leave it mid-edit by closing a phone.
public static class RoleEndpoints
{
    public static void MapRoleEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/roles").WithTags("Roles");

        // Everything the grid needs in one request: the catalogue (with its grouping and
        // help text), the roles, and the grants.
        group.MapGet("/", async (CmmsDbContext db) =>
        {
            var roles = await db.Roles.OrderBy(r => r.SortOrder).ThenBy(r => r.Name).ToListAsync();

            var grants = await db.RolePermissions
                .GroupBy(p => p.RoleId)
                .Select(g => new { RoleId = g.Key, Permissions = g.Select(p => p.Permission).ToList() })
                .ToListAsync();

            var memberCounts = await db.UserRoles
                .GroupBy(r => r.RoleId)
                .Select(g => new { RoleId = g.Key, Count = g.Count() })
                .ToListAsync();

            return Results.Ok(new
            {
                permissions = Permissions.All.Select(p => new
                {
                    key = p.Key,
                    group = p.Group,
                    label = p.Label,
                    description = p.Description,
                    allowedForAnonymous = p.AllowedForAnonymous,
                    alwaysOnForAdmin = p.AlwaysOnForAdmin,
                }),
                roles = roles.Select(r => new
                {
                    r.Id,
                    r.Name,
                    r.IsSystem,
                    r.IsAnonymous,
                    r.IsDefaultForNewUsers,
                    r.SortOrder,
                    memberCount = memberCounts.FirstOrDefault(m => m.RoleId == r.Id)?.Count ?? 0,
                    granted = grants.FirstOrDefault(g => g.RoleId == r.Id)?.Permissions ?? [],
                }),
            });
        }).RequirePermission(Permissions.RolesManage);

        group.MapPost("/", async (SaveRoleDto dto, CmmsDbContext db) =>
        {
            if (Validate(dto) is { } errors) return Results.ValidationProblem(errors);

            var name = dto.Name!.Trim();
            if (await db.Roles.AnyAsync(r => r.Name.ToLower() == name.ToLower()))
                return Results.ValidationProblem(
                    new Dictionary<string, string[]> { ["name"] = ["A role with that name already exists"] });

            var role = new Role
            {
                Id = Guid.NewGuid(),
                Name = name,
                IsDefaultForNewUsers = dto.IsDefaultForNewUsers,
                SortOrder = await db.Roles.MaxAsync(r => (int?)r.SortOrder) + 1 ?? 1,
            };

            db.Roles.Add(role);
            if (dto.IsDefaultForNewUsers) await ClearOtherDefaultsAsync(db, role.Id);
            await db.SaveChangesAsync();

            return Results.Created($"/roles/{role.Id}", new { role.Id, role.Name, role.SortOrder });
        }).RequirePermission(Permissions.RolesManage);

        group.MapPut("/{id:guid}", async (Guid id, SaveRoleDto dto, CmmsDbContext db) =>
        {
            var role = await db.Roles.SingleOrDefaultAsync(r => r.Id == id);
            if (role is null) return Results.NotFound();

            if (Validate(dto) is { } errors) return Results.ValidationProblem(errors);

            var name = dto.Name!.Trim();
            if (await db.Roles.AnyAsync(r => r.Id != id && r.Name.ToLower() == name.ToLower()))
                return Results.ValidationProblem(
                    new Dictionary<string, string[]> { ["name"] = ["A role with that name already exists"] });

            // System roles may be renamed — "Admin" and "Anonymous" are only labels — but
            // never turned into a default for new users, which would be meaningless for
            // Anonymous and dangerous for Admin.
            role.Name = name;
            if (!role.IsSystem)
            {
                role.IsDefaultForNewUsers = dto.IsDefaultForNewUsers;
                if (dto.IsDefaultForNewUsers) await ClearOtherDefaultsAsync(db, id);
            }

            await db.SaveChangesAsync();
            return Results.Ok(new { role.Id, role.Name, role.IsDefaultForNewUsers });
        }).RequirePermission(Permissions.RolesManage);

        group.MapDelete("/{id:guid}", async (Guid id, CmmsDbContext db) =>
        {
            var role = await db.Roles.SingleOrDefaultAsync(r => r.Id == id);
            if (role is null) return Results.NotFound();

            if (role.IsSystem)
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["id"] = [$"\"{role.Name}\" is a built-in role and cannot be deleted."],
                });

            // Refused rather than cascading: silently stripping someone's only role would
            // leave them signed in and mysteriously unable to do anything.
            var members = await db.UserRoles.CountAsync(r => r.RoleId == id);
            if (members > 0)
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["id"] =
                    [
                        members == 1
                            ? "One user still holds this role. Change their roles first."
                            : $"{members} users still hold this role. Change their roles first.",
                    ],
                });

            db.Roles.Remove(role);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequirePermission(Permissions.RolesManage);

        // Saves the whole grid. Sent as role -> granted permissions, which makes the request
        // idempotent and means a concurrent edit loses cleanly rather than interleaving.
        group.MapPut("/permissions", async (SaveGridDto dto, CmmsDbContext db) =>
        {
            var roles = await db.Roles.ToListAsync();
            var errors = new Dictionary<string, string[]>();

            var unknownRole = dto.Grants.Keys.FirstOrDefault(k => roles.All(r => r.Id != k));
            if (unknownRole != default)
                errors["grants"] = ["That role no longer exists. Reload and try again."];

            var unknownPermission = dto.Grants.Values
                .SelectMany(v => v)
                .FirstOrDefault(p => !Permissions.AllKeys.Contains(p));
            if (unknownPermission is not null)
                errors["permissions"] = [$"Unknown permission \"{unknownPermission}\"."];

            foreach (var role in roles)
            {
                if (!dto.Grants.TryGetValue(role.Id, out var requested)) continue;

                // The Admin role keeps the permissions that administer the app, and the
                // Anonymous role can never hold them. Enforced here as well as in the UI:
                // the grid's locked cells are a courtesy, this is the actual rule.
                if (role.IsSystem && !role.IsAnonymous && !Permissions.AdminAlwaysOn.All(requested.Contains))
                    errors[$"grants.{role.Id}"] =
                        ["The Admin role cannot give up managing users and roles — that is the way back in."];

                if (role.IsAnonymous && requested.Any(Permissions.AnonymousForbidden.Contains))
                    errors[$"grants.{role.Id}"] =
                        ["Anonymous cannot be given administrative permissions."];
            }

            if (errors.Count > 0) return Results.ValidationProblem(errors);

            // Replace wholesale inside a transaction: a partial grid is worse than either
            // version of it, and auto-migrate means this runs against a live database.
            await using var tx = await db.Database.BeginTransactionAsync();

            foreach (var (roleId, requested) in dto.Grants)
            {
                await db.RolePermissions.Where(p => p.RoleId == roleId).ExecuteDeleteAsync();

                foreach (var permission in requested.Distinct())
                    db.RolePermissions.Add(new RolePermission { RoleId = roleId, Permission = permission });
            }

            await db.SaveChangesAsync();
            await tx.CommitAsync();

            // No cache to invalidate: permissions are read per request, so this is already
            // in force for everyone, including sessions established before the change.
            return Results.NoContent();
        }).RequirePermission(Permissions.RolesManage);
    }

    private static async Task ClearOtherDefaultsAsync(CmmsDbContext db, Guid keepId) =>
        await db.Roles
            .Where(r => r.Id != keepId && r.IsDefaultForNewUsers)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.IsDefaultForNewUsers, false));

    private static Dictionary<string, string[]>? Validate(SaveRoleDto dto)
    {
        var name = dto.Name?.Trim() ?? "";
        return name.Length is 0 or > 40
            ? new Dictionary<string, string[]> { ["name"] = ["A name of 1 to 40 characters is required"] }
            : null;
    }
}

record SaveRoleDto(string? Name, bool IsDefaultForNewUsers);

record SaveGridDto(Dictionary<Guid, List<string>> Grants);
