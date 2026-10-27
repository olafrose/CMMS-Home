using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CmmsHome.Api.Services;

// The recovery hatch: Auth__ResetAdmin="username:password", applied once at startup.
//
// This exists because the alternative failure mode is unrecoverable. The NAS's only door is
// this app; an admin who mistypes a password change, deactivates their own account, or
// unchecks the wrong cell would otherwise need a psql prompt to get back in. A documented
// env var is a far better answer than a backdoor nobody wrote down.
//
// Logged at warning level whether or not it changes anything, because silently resetting an
// administrator's password is exactly the kind of thing that should be visible in the
// container log.
public static class AdminReset
{
    public static async Task ApplyAdminResetAsync(this IServiceProvider services)
    {
        var options = services.GetRequiredService<IOptions<AuthOptions>>().Value;
        var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger("Auth.AdminReset");

        if (string.IsNullOrWhiteSpace(options.ResetAdmin)) return;

        // Split on the first colon only, so a password may contain colons.
        var separator = options.ResetAdmin.IndexOf(':');
        if (separator <= 0 || separator == options.ResetAdmin.Length - 1)
        {
            logger.LogWarning(
                "Auth__ResetAdmin is set but malformed. Expected \"username:password\"; ignoring it.");
            return;
        }

        var username = AccountService.NormaliseUsername(options.ResetAdmin[..separator]);
        var password = options.ResetAdmin[(separator + 1)..];

        if (AccountService.ValidateCredentials(username, password) is { } errors)
        {
            logger.LogWarning(
                "Auth__ResetAdmin is set but rejected: {Problems}. Ignoring it.",
                string.Join("; ", errors.SelectMany(e => e.Value)));
            return;
        }

        var db = services.GetRequiredService<CmmsDbContext>();
        var accounts = services.GetRequiredService<AccountService>();
        var setup = services.GetRequiredService<SetupState>();

        var user = await db.Users.SingleOrDefaultAsync(u => u.Username == username);

        if (user is null)
        {
            await accounts.CreateLocalUserAsync(username, password, null, [SeededRoles.Admin]);
            setup.MarkComplete();
            logger.LogWarning(
                "Auth__ResetAdmin created administrator {Username}. Remove the variable and restart.",
                username);
            return;
        }

        await accounts.SetPasswordAsync(user, password);
        user.IsActive = true;

        // Reactivating without restoring the role would be a hollow recovery.
        if (!await db.UserRoles.AnyAsync(r => r.UserId == user.Id && r.RoleId == SeededRoles.Admin))
            db.UserRoles.Add(new UserRole { UserId = user.Id, RoleId = SeededRoles.Admin });

        // Existing sessions are dropped: whoever triggered a password reset should be the
        // only one holding a valid session afterwards.
        await db.Sessions.Where(s => s.UserId == user.Id).ExecuteDeleteAsync();
        await db.SaveChangesAsync();

        logger.LogWarning(
            "Auth__ResetAdmin reset the password for {Username}, restored the Admin role, and signed out "
            + "their other sessions. Remove the variable and restart.",
            username);
    }
}
