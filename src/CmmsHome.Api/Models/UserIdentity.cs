using System.Text.Json.Serialization;

namespace CmmsHome.Api.Models;

// One way a User can prove who they are. A user may have several: a local password *and* a
// linked SSO account, so switching to (or away from) an identity provider never orphans an
// account or its history.
//
// This split is the whole point. Authentication is the pluggable part; authorization — the
// roles and the rights grid — is ours and hangs off User, not off any provider. Adding
// OIDC later means inserting rows with a new Provider value and adding a callback
// endpoint; User, Role, RolePermission and Session are untouched.
public class UserIdentity
{
    public const string LocalProvider = "local";

    public Guid Id { get; set; }
    public Guid UserId { get; set; }

    // "local" for a password, or a provider key such as "oidc:authelia" for an external
    // one. A string, not an enum, for the same reason permissions are: these are stored as
    // rows, and renaming an enum member would silently repoint existing identities.
    public required string Provider { get; set; }

    // The provider's stable identifier for this person: their `sub` claim for OIDC, or the
    // normalised username for the local provider. Unique per provider — that pairing is
    // what a sign-in looks up, so it must not depend on a mutable display name.
    public required string Subject { get; set; }

    // Local provider only: PBKDF2 hash in PasswordHasher's versioned format, so its
    // parameters can change under us and old hashes still verify (and are rehashed on the
    // next successful sign-in). Null for external identities, which have no password here.
    [JsonIgnore]
    public string? PasswordHash { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime? LastUsedAt { get; set; }
}
