namespace CmmsHome.Api.Models;

// Single-row (Id = 1) home for server-side secrets, generated on first startup so there
// is nothing to configure on the NAS.
//
// Deliberately NOT a column on AppSettings: that row is serialized wholesale to any
// client holding settings.read, and a secret should never be one careless
// `Results.Ok(settings)` away from the wire. No endpoint returns this entity.
public class ServerSecret
{
    public int Id { get; set; } = 1;

    // Base64 of 32 random bytes, the HMAC key behind printed-label tokens. Rotating it
    // invalidates every label already printed — that is the "revoke all labels" button.
    public required string LabelSigningKey { get; set; }

    public DateTime RotatedAt { get; set; }
}
