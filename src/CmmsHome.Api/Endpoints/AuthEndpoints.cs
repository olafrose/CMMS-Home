using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using CmmsHome.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Endpoints;

// Signing in, signing out, and the label-token exchange that keeps the QR quick-log fast.
public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/auth").WithTags("Auth");

        // The client's one call to find out who it is talking to. Public because "nobody"
        // is a valid answer, and because the frontend needs to distinguish "sign in" from
        // "first-run setup" before it can render anything.
        group.MapGet("/me", async (ActorAccessor accessor, CmmsDbContext db) =>
            Results.Ok(await MeAsync(accessor, db)))
            .Public("clients must be able to discover whether anyone is signed in");

        group.MapPost("/login", async (
            LoginDto dto, AccountService accounts, ActorAccessor accessor, CmmsDbContext db, HttpContext http) =>
        {
            var user = await accounts.VerifyPasswordAsync(dto.Username ?? "", dto.Password ?? "");

            // One message for every failure mode, so this cannot be used to enumerate which
            // usernames exist.
            if (user is null)
                return Results.ValidationProblem(
                    new Dictionary<string, string[]> { ["password"] = ["Wrong username or password"] },
                    statusCode: 401);

            var token = await accounts.IssueSessionAsync(user, http.Request.Headers.UserAgent);
            http.Response.Cookies.Append(AuthCookies.Session, token, accounts.SessionCookieOptions());

            return Results.Ok(await MeAsync(accessor, db, user.Id));
        }).Public("signing in cannot itself require permission");

        group.MapPost("/logout", async (CmmsDbContext db, ActorAccessor accessor, HttpContext http) =>
        {
            var actor = await accessor.GetAsync();
            if (actor.SessionId is { } id)
                await db.Sessions.Where(s => s.Id == id).ExecuteDeleteAsync();

            // Both cookies: a label scope outliving a sign-out would be a surprise.
            http.Response.Cookies.Delete(AuthCookies.Session, new CookieOptions { Path = "/" });
            http.Response.Cookies.Delete(AuthCookies.LabelSession, new CookieOptions { Path = "/" });
            return Results.NoContent();
        }).Public("signing out must work even from a session the server no longer recognises");

        // First run only. Creates the first administrator and signs them in; refuses once
        // any account exists, so it cannot be used later to mint an admin.
        group.MapPost("/setup", async (
            SetupDto dto, CmmsDbContext db, AccountService accounts, ActorAccessor accessor,
            SetupState setup, HttpContext http) =>
        {
            if (await db.Users.AnyAsync())
                return Results.Problem(
                    detail: "Setup has already been completed. Sign in instead.",
                    title: "Already set up", statusCode: 409);

            if (AccountService.ValidateCredentials(dto.Username, dto.Password) is { } errors)
                return Results.ValidationProblem(errors);

            var user = await accounts.CreateLocalUserAsync(
                dto.Username!, dto.Password!, dto.DisplayName, [SeededRoles.Admin]);
            setup.MarkComplete();

            var token = await accounts.IssueSessionAsync(user, http.Request.Headers.UserAgent);
            http.Response.Cookies.Append(AuthCookies.Session, token, accounts.SessionCookieOptions());

            return Results.Ok(await MeAsync(accessor, db, user.Id));
        }).Public("there is nobody to authorise the creation of the first account");

        group.MapPost("/password", async (
            ChangePasswordDto dto, AccountService accounts, ActorAccessor accessor, CmmsDbContext db) =>
        {
            var actor = await accessor.GetAsync();
            var user = actor.User!;

            if (await accounts.VerifyPasswordAsync(user.Username, dto.CurrentPassword ?? "") is null)
                return Results.ValidationProblem(
                    new Dictionary<string, string[]> { ["currentPassword"] = ["Wrong password"] });

            // `?? ""`, not the null ValidateCredentials would accept: it skips the length rule
            // for a null password (that is how "leave blank to keep" works on /users), and the
            // hasher would then throw on it.
            var newPassword = dto.NewPassword ?? "";
            if (AccountService.ValidateCredentials(user.Username, newPassword) is { } errors)
                return Results.ValidationProblem(errors);

            await accounts.SetPasswordAsync(user, newPassword);

            // Sign out everywhere else. The usual reason to change a password is suspecting
            // someone else knows it, and a session they already hold would otherwise outlive
            // the change. The caller's own session stays, so the page they're on keeps working.
            await db.Sessions
                .Where(s => s.UserId == user.Id && s.Id != actor.SessionId)
                .ExecuteDeleteAsync();

            // And their personal tokens, for the same reason: whoever knew the old password
            // could have minted one, and it would outlive the change just as a session would.
            await db.ApiTokens.Where(t => t.UserId == user.Id).ExecuteDeleteAsync();

            return Results.NoContent();
        }).RequireAuthenticated();

        // Exchanges a printed label's `?t=` for a short-lived scope naming that one item or place.
        // Public by necessity: proving you hold the label IS the credential — that is
        // exactly the same standing a printed QR code has always had.
        group.MapPost("/label-session", async (
            LabelSessionDto dto, CmmsDbContext db, LabelSigner labels, AccountService accounts, HttpContext http) =>
        {
            LabelTarget? target = (dto.EquipmentId, dto.StorageLocationId) switch
            {
                (Guid e, null) => LabelTarget.Equipment(e),
                (null, Guid l) => LabelTarget.StorageLocation(l),
                _ => null,
            };
            if (target is not LabelTarget t)
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["target"] = ["Set exactly one of EquipmentId or StorageLocationId."] });

            if (!await labels.VerifyLabelTokenAsync(t, dto.Token))
                return Results.Problem(
                    detail: "That label is not valid. It may have been printed before the labels were last revoked.",
                    title: "Invalid label", statusCode: 401);

            var exists = t.Kind == LabelTargetKind.Equipment
                ? await db.Equipment.AnyAsync(e => e.Id == t.Id)
                : await db.StorageLocations.AnyAsync(s => s.Id == t.Id);
            if (!exists) return Results.NotFound();

            var cookie = await labels.IssueLabelSessionAsync(t);
            http.Response.Cookies.Append(AuthCookies.LabelSession, cookie, accounts.LabelCookieOptions());

            return Results.Ok(new
            {
                equipmentId = dto.EquipmentId,
                storageLocationId = dto.StorageLocationId,
                expiresInSeconds = (int)LabelSigner.LabelSessionLifetime.TotalSeconds,
            });
        }).Public("holding the printed label is the credential");

        // The tokens to embed when printing. Gated on browsing the inventory, which is what
        // the labels page needs anyway.
        group.MapGet("/label-tokens", async (CmmsDbContext db, LabelSigner labels, Guid? equipment_id) =>
        {
            var ids = equipment_id is { } one
                ? [one]
                : await db.Equipment.Select(e => e.Id).ToListAsync();

            var tokens = new Dictionary<string, string>(ids.Count);
            foreach (var id in ids)
                tokens[id.ToString()] = await labels.ComputeLabelTokenAsync(LabelTarget.Equipment(id));

            return Results.Ok(tokens);
        }).RequirePermission(Permissions.EquipmentList);

        // The same for place labels. A separate route rather than a second map in the one
        // above so neither response changes shape, and so each is gated on browsing the
        // thing it prints labels for.
        group.MapGet("/location-label-tokens", async (CmmsDbContext db, LabelSigner labels, Guid? storage_location_id) =>
        {
            var ids = storage_location_id is { } one
                ? [one]
                : await db.StorageLocations.Select(s => s.Id).ToListAsync();

            var tokens = new Dictionary<string, string>(ids.Count);
            foreach (var id in ids)
                tokens[id.ToString()] = await labels.ComputeLabelTokenAsync(LabelTarget.StorageLocation(id));

            return Results.Ok(tokens);
        }).RequirePermission(Permissions.StorageRead);

        // Invalidates every label already printed. Deliberately blunt: there is no per-label
        // revocation because tokens are derived rather than stored, and "reprint everything"
        // is an honest, comprehensible remedy for a label having escaped the house.
        group.MapPost("/label-key/rotate", async (LabelSigner labels) =>
        {
            await labels.RotateKeyAsync();
            return Results.Ok(new
            {
                rotated = true,
                message = "Every printed label is now invalid for anonymous logging. Reprint them from Labels.",
            });
        }).RequirePermission(Permissions.SettingsManage);

        // A user's own sessions, so "sign out my other devices" does not need an admin.
        group.MapGet("/sessions", async (CmmsDbContext db, ActorAccessor accessor) =>
        {
            var actor = await accessor.GetAsync();
            var sessions = await db.Sessions
                .Where(s => s.UserId == actor.User!.Id)
                .OrderByDescending(s => s.LastSeenAt)
                .Select(s => new
                {
                    s.Id, s.CreatedAt, s.LastSeenAt, s.ExpiresAt, s.UserAgent,
                    current = s.Id == actor.SessionId,
                })
                .ToListAsync();

            return Results.Ok(sessions);
        }).RequireAuthenticated();

        group.MapDelete("/sessions/{id:guid}", async (Guid id, CmmsDbContext db, ActorAccessor accessor) =>
        {
            var actor = await accessor.GetAsync();
            var deleted = await db.Sessions
                .Where(s => s.Id == id && s.UserId == actor.User!.Id)
                .ExecuteDeleteAsync();

            return deleted > 0 ? Results.NoContent() : Results.NotFound();
        }).RequireAuthenticated();

        // Personal API tokens: the caller's own, acting as them, narrowed to a scope. Listing
        // and revoking need no permission — like sessions, an admin taking away the right to
        // mint must never take away the ability to revoke what was already minted.
        group.MapGet("/tokens", async (ActorAccessor accessor, ApiTokenService tokens) =>
        {
            var actor = await accessor.GetAsync();
            return Results.Ok(await tokens.ListAsync(actor.User!.Id));
        }).RequireAuthenticated();

        group.MapGet("/tokens/grantable-permissions", async (ActorAccessor accessor, ApiTokenService tokens) =>
        {
            var actor = await accessor.GetAsync();
            return Results.Ok(await tokens.GrantableAsync(actor.User!.Id));
        }).RequireAuthenticated();

        group.MapPost("/tokens", async (MintTokenDto dto, ActorAccessor accessor, ApiTokenService tokens) =>
        {
            var actor = await accessor.GetAsync();
            var (token, row, errors) = await tokens.MintAsync(actor.User!, dto, actor.User!.Id);
            if (errors is not null) return Results.ValidationProblem(errors);

            return Results.Created($"/auth/tokens/{row!.Id}", new { token, apiToken = ApiTokenService.Dto(row) });
        }).RequirePermission(Permissions.TokensPersonal).SessionOnly();

        group.MapDelete("/tokens/{id:guid}", async (Guid id, CmmsDbContext db, ActorAccessor accessor) =>
        {
            var actor = await accessor.GetAsync();
            var deleted = await db.ApiTokens
                .Where(t => t.Id == id && t.UserId == actor.User!.Id)
                .ExecuteDeleteAsync();

            return deleted > 0 ? Results.NoContent() : Results.NotFound();
        }).RequireAuthenticated();
    }

    // The single shape describing "who am I and what may I do", used by /me, /login and
    // /setup so the client has one thing to parse.
    //
    // justSignedInId is passed by /login and /setup: the actor for that request was resolved
    // before the session existed and is memoised, so it still describes the anonymous
    // caller. Both the roles and the permissions have to be read deliberately, or a
    // freshly-signed-in admin would be handed an empty UI until they reloaded.
    private static async Task<object> MeAsync(
        ActorAccessor accessor, CmmsDbContext db, Guid? justSignedInId = null)
    {
        var actor = await accessor.GetAsync();

        var user = justSignedInId is { } id
            ? await db.Users.Include(u => u.Roles).SingleOrDefaultAsync(u => u.Id == id)
            : actor.User;

        var permissions = justSignedInId is { } signedIn
            ? await accessor.PermissionsForUserAsync(signedIn)
            : actor.Permissions;

        return new
        {
            authenticated = user is not null,
            setupRequired = user is null && actor.SetupRequired,
            user = user is null ? null : new
            {
                user.Id,
                user.Username,
                user.DisplayName,
                user.Kind,
                // For the account page. LastLoginAt is deliberately not served: signing in
                // is what sets it, so to the user reading it it would always say "just now".
                user.CreatedAt,
                roles = user.Roles.OrderBy(r => r.SortOrder).Select(r => new { r.Id, r.Name }),
            },
            // The client mirrors these into can() to hide and disable controls. Enforcement
            // is server-side; this is only so the UI does not offer what will be refused.
            permissions,
            labelScopedEquipmentId = actor.ScopedEquipmentId,
            labelScopedStorageLocationId = actor.ScopedStorageLocationId,
            // So a script can confirm what it is holding: whose token, and that `permissions`
            // above is already narrowed to the token's scope.
            viaApiToken = actor.IsApiToken,
        };
    }
}

record LoginDto(string? Username, string? Password);
record SetupDto(string? Username, string? Password, string? DisplayName);
record ChangePasswordDto(string? CurrentPassword, string? NewPassword);
record LabelSessionDto(Guid? EquipmentId, Guid? StorageLocationId, string? Token);
