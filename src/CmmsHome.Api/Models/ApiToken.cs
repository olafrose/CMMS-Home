namespace CmmsHome.Api.Models;

// A bearer credential for a script or integration, sent as `Authorization: Bearer cmms_…`.
//
// Owned by a User: a service account (the usual case, minted by an admin) or a person (a
// personal token, minted for themselves, which must expire). What it may do is its own
// scope rows *intersected with* the owner's current role permissions, evaluated per
// request — so the rights grid stays the ceiling, and an edit there shrinks every token
// immediately.
//
// Deliberately not a UserIdentity, although both are "a way to act as this user". An
// identity is how a *person* proves who they are and establishes a full session; a token
// is narrowed, there are many per account, and it never reaches the self-service account
// routes. Folding it into UserIdentity would make every identity carry a scope list that
// only means something for one kind of row.
//
// Same storage reasoning as Session: only the SHA-256 is kept, the plaintext is shown once
// at creation, and revoking is a row delete.
public class ApiToken
{
    public const string Prefix = "cmms_";

    public Guid Id { get; set; }
    public Guid UserId { get; set; }

    // What it is for ("Home Assistant", "nightly backup"), so a list of tokens is legible.
    public required string Name { get; set; }

    public required string TokenHash { get; set; }

    // The last few characters of the plaintext. Enough to match a token in a config file
    // to its row here; far too few to be worth anything to whoever reads the table.
    public required string Hint { get; set; }

    public DateTime CreatedAt { get; set; }

    // Who minted it — the owner for a personal token, an admin for a service account's.
    // Nulled rather than cascaded if that admin's account goes away.
    public Guid? CreatedByUserId { get; set; }

    // Null = never expires, allowed for service accounts only (see ApiTokenService).
    public DateTime? ExpiresAt { get; set; }
    public DateTime? LastUsedAt { get; set; }

    public List<ApiTokenPermission> Permissions { get; set; } = [];
}
