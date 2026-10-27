using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CmmsHome.Api.Services;

// Minting and describing API tokens. Shared by the admin routes (service accounts, under
// /users) and the self-service ones (personal tokens, under /auth), so the rules about what
// a valid token is live in one place — the same arrangement as AccountService.
public class ApiTokenService(CmmsDbContext db, ActorAccessor accessor, IOptions<AuthOptions> options)
{
    private const int HintLength = 4;
    private const int MaxNameLength = 100;

    // Returns the plaintext token, which is never stored and cannot be shown again, or the
    // validation errors that stopped it.
    public async Task<(string? Token, ApiToken? Row, Dictionary<string, string[]>? Errors)> MintAsync(
        User owner, MintTokenDto dto, Guid? createdBy)
    {
        var errors = new Dictionary<string, string[]>();

        var name = dto.Name?.Trim() ?? "";
        if (name.Length == 0)
            errors["name"] = ["A name is required, so the token can be recognised later"];
        else if (name.Length > MaxNameLength)
            errors["name"] = [$"At most {MaxNameLength} characters"];

        var expiresAt = dto.ExpiresAt is { } e ? DateTime.SpecifyKind(e, DateTimeKind.Utc) : (DateTime?)null;
        if (expiresAt is { } at && at <= DateTime.UtcNow)
            errors["expiresAt"] = ["Must be in the future"];
        else if (owner.Kind == UserKind.Person)
        {
            var max = DateTime.UtcNow.AddDays(options.Value.PersonalTokenMaxDays);
            if (expiresAt is null)
                errors["expiresAt"] = ["Personal tokens must have an expiry date"];
            else if (expiresAt > max.AddMinutes(5)) // slack for the client's clock
                errors["expiresAt"] = [$"Personal tokens may last at most {options.Value.PersonalTokenMaxDays} days"];
        }

        // A scope is a subset of what the owner holds *now*. Not strictly necessary — the
        // per-request intersection would neuter anything beyond it — but a token listing
        // rights it can never exercise would misdescribe itself to whoever reads the list.
        var requested = (dto.Permissions ?? []).Distinct().ToList();
        var held = await accessor.PermissionsForUserAsync(owner.Id);
        if (requested.Count == 0)
            errors["permissions"] = ["Choose at least one permission"];
        else if (requested.Where(p => !held.Contains(p)).ToList() is { Count: > 0 } beyond)
            errors["permissions"] = [$"Not held by this account: {string.Join(", ", beyond)}"];

        if (errors.Count > 0) return (null, null, errors);

        var token = ApiToken.Prefix + AuthTokens.NewToken();
        var row = new ApiToken
        {
            Id = Guid.NewGuid(),
            UserId = owner.Id,
            Name = name,
            TokenHash = AuthTokens.Hash(token),
            Hint = token[^HintLength..],
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = createdBy,
            ExpiresAt = expiresAt,
            Permissions = requested
                .OrderBy(p => p, StringComparer.Ordinal)
                .Select(p => new ApiTokenPermission { Permission = p })
                .ToList(),
        };

        db.ApiTokens.Add(row);
        await db.SaveChangesAsync();
        return (token, row, null);
    }

    public async Task<List<object>> ListAsync(Guid ownerId)
    {
        var tokens = await db.ApiTokens
            .Include(t => t.Permissions)
            .Where(t => t.UserId == ownerId)
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync();

        return tokens.Select(Dto).ToList();
    }

    // The catalogue entries an account holds right now, in catalogue order: what a new
    // token for it may be scoped to. Served separately from GET /roles so minting a
    // personal token doesn't require the right to read the whole grid.
    public async Task<List<PermissionInfo>> GrantableAsync(Guid ownerId)
    {
        var held = await accessor.PermissionsForUserAsync(ownerId);
        return Permissions.All.Where(p => held.Contains(p.Key)).ToList();
    }

    // Projected, never the raw row: the hash has no business in a response, even though it
    // is useless without the plaintext.
    public static object Dto(ApiToken t) => new
    {
        t.Id,
        t.Name,
        t.Hint,
        t.CreatedAt,
        t.CreatedByUserId,
        t.ExpiresAt,
        t.LastUsedAt,
        expired = t.ExpiresAt is { } at && at <= DateTime.UtcNow,
        permissions = t.Permissions.Select(p => p.Permission).Order(StringComparer.Ordinal),
    };
}

public record MintTokenDto(string? Name, DateTime? ExpiresAt, List<string>? Permissions);
