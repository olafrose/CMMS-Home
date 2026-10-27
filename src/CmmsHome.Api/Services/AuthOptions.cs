namespace CmmsHome.Api.Services;

// Env-var configuration for authentication, bound from the "Auth" section — deployment
// concerns, as opposed to the AppSettings row, which is what the Settings page edits.
public class AuthOptions
{
    // How long a session lasts before it must be re-established.
    public int SessionDays { get; set; } = 30;

    // Marks the session cookie Secure. Off by default because the NAS is normally reached
    // over plain HTTP on the LAN, where a Secure cookie would simply never be sent —
    // silently breaking sign-in with no clue as to why. Turn it on when serving through an
    // HTTPS reverse proxy. (It cannot be inferred: the API only ever sees the proxy's
    // plain-HTTP hop, so Request.IsHttps is false even when the browser is on HTTPS.)
    public bool SecureCookies { get; set; }

    // Recovery hatch, "username:password". Applied once at startup: creates the account if
    // missing, resets its password if present, and always ensures it holds Admin. Logged
    // loudly, because it is a deliberate override of the app's own access control.
    //
    // This exists because the failure mode is otherwise unrecoverable without a psql
    // prompt: the NAS's only door is this app, and an admin who mistypes their password
    // change or unchecks the wrong cell has no other way back in.
    public string? ResetAdmin { get; set; }

    // Ceiling on a personal API token's lifetime. Personal tokens must expire — they act
    // as a person, whose account is the more likely one to be phished or shared — while a
    // service account's may be open-ended, since an integration breaking silently on a
    // date nobody remembers is its own outage.
    public int PersonalTokenMaxDays { get; set; } = 365;

    public const int MinPasswordLength = 8;
}
