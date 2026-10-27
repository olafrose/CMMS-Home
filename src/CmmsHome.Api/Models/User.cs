using System.Text.Json.Serialization;

namespace CmmsHome.Api.Models;

// A person the app knows about. Deliberately holds no credentials — *how* someone proves
// they are this user lives in UserIdentity, so adding an external identity provider later
// is an insert plus an endpoint, not a migration of this table and everything pointing at
// it. See UserIdentity for the reasoning.
//
// Hand-rolled rather than ASP.NET Core Identity: Identity wants entities deriving from
// IdentityUser and a context deriving from IdentityDbContext, which would put framework
// types into Models/ — this project keeps model classes free of infrastructure references.
// Only password *hashing* is borrowed from the framework (PasswordHasher<T>, which
// constrains nothing but `class`).
public class User
{
    public Guid Id { get; set; }

    // Display/login handle, case-insensitively unique, stored lowercase-trimmed. For an
    // externally-authenticated user this is seeded from the provider but stays editable
    // here — it is our handle for them, not the provider's key (that is Identity.Subject).
    public required string Username { get; set; }

    public string? DisplayName { get; set; }

    // Person or service account. A service account has no UserIdentity, so there is no
    // password to sign in with — it can only act through an ApiToken. That absence is the
    // guarantee; nothing else has to remember to refuse it at /auth/login.
    public UserKind Kind { get; set; } = UserKind.Person;

    // Deactivating keeps history attributable while stopping new sign-ins, which deleting
    // would not: MaintenanceEvent.CreatedByUserId points here.
    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; }
    public DateTime? LastLoginAt { get; set; }

    public List<Role> Roles { get; set; } = [];

    // Not serialized: identities carry password hashes and provider subjects, neither of
    // which belongs in an API response. Endpoints project to DTOs regardless.
    [JsonIgnore]
    public List<UserIdentity> Identities { get; set; } = [];
}

// Service accounts exist for scripts and integrations. They hold roles like anyone else,
// but never count as "the last administrator": a person must always be able to get in.
public enum UserKind { Person, Service }
