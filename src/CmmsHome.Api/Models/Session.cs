namespace CmmsHome.Api.Models;

// A signed-in browser. Sessions are opaque random tokens kept server-side rather than
// self-contained encrypted cookies, for two reasons:
//
//  - ASP.NET DataProtection's key ring lives in the container filesystem, so every NAS
//    image rebuild would silently sign everyone out.
//  - Revocation (deactivate a user, "sign out everywhere") becomes a row delete instead of
//    something that has to wait for a ticket to expire.
public class Session
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }

    // SHA-256 of the cookie token. The token itself is never stored, so this table leaking
    // does not hand anyone a usable login.
    public required string TokenHash { get; set; }

    // Which identity established this session. Needed once an external provider exists: to
    // end the session at the provider on sign-out, and to tell a password session from an
    // SSO one when deciding whether to re-authenticate for something sensitive. Nullable so
    // a session survives its identity being unlinked.
    public Guid? UserIdentityId { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime LastSeenAt { get; set; }
    public string? UserAgent { get; set; }
}
