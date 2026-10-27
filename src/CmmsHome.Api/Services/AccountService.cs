using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CmmsHome.Api.Services;

// Creating accounts, verifying passwords, and issuing sessions.
//
// Shared between the sign-in endpoints, the user-admin endpoints and the startup recovery
// hatch, so the rules about what a valid username or password is live in exactly one place.
public class AccountService(
    CmmsDbContext db,
    IPasswordHasher<UserIdentity> hasher,
    IOptions<AuthOptions> options)
{
    public static string NormaliseUsername(string username) => username.Trim().ToLowerInvariant();

    public static Dictionary<string, string[]>? ValidateCredentials(string? username, string? password)
    {
        var errors = new Dictionary<string, string[]>();

        var name = username?.Trim() ?? "";
        if (name.Length < 3)
            errors["username"] = ["Must be at least 3 characters"];
        else if (!name.All(c => char.IsLetterOrDigit(c) || c is '.' or '_' or '-'))
            errors["username"] = ["Letters, digits, dot, underscore and hyphen only"];

        if (password is not null && password.Length < AuthOptions.MinPasswordLength)
            errors["password"] = [$"Must be at least {AuthOptions.MinPasswordLength} characters"];

        return errors.Count > 0 ? errors : null;
    }

    public async Task<bool> UsernameTakenAsync(string username, Guid? exceptUserId = null)
    {
        var normalised = NormaliseUsername(username);
        return await db.Users.AnyAsync(u => u.Username == normalised && u.Id != exceptUserId);
    }

    public async Task<User> CreateLocalUserAsync(
        string username, string password, string? displayName, IEnumerable<Guid> roleIds)
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            Username = NormaliseUsername(username),
            DisplayName = string.IsNullOrWhiteSpace(displayName) ? null : displayName.Trim(),
            IsActive = true,
        };

        var identity = new UserIdentity
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Provider = UserIdentity.LocalProvider,
            Subject = user.Username,
        };
        identity.PasswordHash = hasher.HashPassword(identity, password);

        db.Users.Add(user);
        db.UserIdentities.Add(identity);

        foreach (var roleId in roleIds.Distinct())
            db.UserRoles.Add(new UserRole { UserId = user.Id, RoleId = roleId });

        await db.SaveChangesAsync();
        return user;
    }

    // No UserIdentity at all: that is what makes it unable to sign in. It acts only through
    // the ApiTokens an admin mints for it.
    public async Task<User> CreateServiceAccountAsync(
        string username, string? displayName, IEnumerable<Guid> roleIds)
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            Username = NormaliseUsername(username),
            DisplayName = string.IsNullOrWhiteSpace(displayName) ? null : displayName.Trim(),
            Kind = UserKind.Service,
            IsActive = true,
        };

        db.Users.Add(user);
        foreach (var roleId in roleIds.Distinct())
            db.UserRoles.Add(new UserRole { UserId = user.Id, RoleId = roleId });

        await db.SaveChangesAsync();
        return user;
    }

    public async Task SetPasswordAsync(User user, string password)
    {
        // Every caller already refuses this; thrown rather than ignored so a new caller that
        // forgets fails loudly instead of quietly giving a token-only account a login.
        if (user.Kind == UserKind.Service)
            throw new InvalidOperationException("Service accounts cannot have a password.");

        var identity = await db.UserIdentities
            .SingleOrDefaultAsync(i => i.UserId == user.Id && i.Provider == UserIdentity.LocalProvider);

        if (identity is null)
        {
            // No local identity yet — an externally-authenticated user being given a
            // password, which is how someone keeps access if the provider goes away.
            identity = new UserIdentity
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                Provider = UserIdentity.LocalProvider,
                Subject = user.Username,
            };
            db.UserIdentities.Add(identity);
        }

        identity.PasswordHash = hasher.HashPassword(identity, password);
        await db.SaveChangesAsync();
    }

    // Returns the user on success, null on any failure — a wrong password, an unknown
    // username, a deactivated account and an account with no password are deliberately
    // indistinguishable to the caller.
    public async Task<User?> VerifyPasswordAsync(string username, string password)
    {
        var normalised = NormaliseUsername(username);

        var identity = await db.UserIdentities
            .SingleOrDefaultAsync(i => i.Provider == UserIdentity.LocalProvider && i.Subject == normalised);

        if (identity?.PasswordHash is null) return null;

        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == identity.UserId);
        if (user is not { IsActive: true }) return null;

        var result = hasher.VerifyHashedPassword(identity, identity.PasswordHash, password);
        if (result == PasswordVerificationResult.Failed) return null;

        // The hasher tells us when its parameters have moved on; take the free upgrade while
        // we have the plaintext in hand.
        if (result == PasswordVerificationResult.SuccessRehashNeeded)
            identity.PasswordHash = hasher.HashPassword(identity, password);

        identity.LastUsedAt = DateTime.UtcNow;
        user.LastLoginAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return user;
    }

    // Creates a session and returns the raw token to put in the cookie. The token is not
    // stored; only its hash is.
    public async Task<string> IssueSessionAsync(User user, string? userAgent)
    {
        var token = AuthTokens.NewToken();

        var identityId = await db.UserIdentities
            .Where(i => i.UserId == user.Id && i.Provider == UserIdentity.LocalProvider)
            .Select(i => (Guid?)i.Id)
            .SingleOrDefaultAsync();

        db.Sessions.Add(new Session
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            UserIdentityId = identityId,
            TokenHash = AuthTokens.Hash(token),
            ExpiresAt = DateTime.UtcNow.AddDays(options.Value.SessionDays),
            LastSeenAt = DateTime.UtcNow,
            UserAgent = Truncate(userAgent, 256),
        });

        await db.SaveChangesAsync();
        return token;
    }

    public CookieOptions SessionCookieOptions() => new()
    {
        HttpOnly = true,
        // Lax rather than Strict: scanning a printed QR code is a top-level cross-origin
        // navigation, and Strict would drop the session on arrival — the signed-in user
        // would land on their own app logged out. Lax still refuses cross-site POSTs, which
        // is what keeps the antiforgery-free upload endpoint defensible.
        SameSite = SameSiteMode.Lax,
        Secure = options.Value.SecureCookies,
        Path = "/",
        Expires = DateTimeOffset.UtcNow.AddDays(options.Value.SessionDays),
    };

    public CookieOptions LabelCookieOptions() => new()
    {
        HttpOnly = true,
        SameSite = SameSiteMode.Lax,
        Secure = options.Value.SecureCookies,
        Path = "/",
        Expires = DateTimeOffset.UtcNow.Add(LabelSigner.LabelSessionLifetime),
    };

    private static string? Truncate(string? value, int max) =>
        value is null ? null : value.Length <= max ? value : value[..max];
}
