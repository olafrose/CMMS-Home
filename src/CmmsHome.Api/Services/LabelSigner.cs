using System.Security.Cryptography;
using System.Text;
using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Services;

// Printed-label tokens, and the short-lived scope a scan grants.
//
// Two different things are signed with the same key:
//
//  - The label token (`?t=` in the QR) is *deterministic* — HMAC of the equipment id, no
//    expiry. Reprinting a label therefore yields the same token, so no per-item column is
//    needed and a lost label cannot be "reissued" into a second valid value. Rotating the
//    key invalidates every printed label at once, which is the revoke-everything button.
//
//  - The label session (a cookie) is that token exchanged for a *time-limited scope*
//    naming one item, so the rest of the request path needs no token plumbing. It is signed
//    rather than stored: there is nothing to clean up, and nothing to leak.
public class LabelSigner(CmmsDbContext db)
{
    // Long enough that the fast path is never interrupted mid-log, short enough that a
    // borrowed phone left on a bench does not stay authorised all week.
    public static readonly TimeSpan LabelSessionLifetime = TimeSpan.FromHours(2);

    // 128 bits of tag. The token rides in a QR code that has to stay scannable on a 40mm
    // label, and 128 bits is far past anything worth brute-forcing on a home network.
    private const int TokenBytes = 16;

    public async Task<string> GetKeyAsync()
    {
        var secret = await db.ServerSecrets.AsNoTracking().SingleOrDefaultAsync(s => s.Id == 1);
        if (secret is not null) return secret.LabelSigningKey;

        // Generated on demand so there is nothing to configure on the NAS. Racing requests
        // both inserting Id=1 is harmless: the loser hits the primary key and re-reads.
        var created = new ServerSecret
        {
            Id = 1,
            LabelSigningKey = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)),
            RotatedAt = DateTime.UtcNow,
        };

        try
        {
            db.ServerSecrets.Add(created);
            await db.SaveChangesAsync();
            return created.LabelSigningKey;
        }
        catch (DbUpdateException)
        {
            db.Entry(created).State = EntityState.Detached;
            return (await db.ServerSecrets.AsNoTracking().SingleAsync(s => s.Id == 1)).LabelSigningKey;
        }
    }

    public async Task<string> RotateKeyAsync()
    {
        var secret = await db.ServerSecrets.SingleOrDefaultAsync(s => s.Id == 1);
        if (secret is null)
        {
            secret = new ServerSecret { Id = 1, LabelSigningKey = "", RotatedAt = DateTime.UtcNow };
            db.ServerSecrets.Add(secret);
        }

        secret.LabelSigningKey = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        secret.RotatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return secret.LabelSigningKey;
    }

    public async Task<string> ComputeLabelTokenAsync(LabelTarget target)
    {
        var key = await GetKeyAsync();
        return AuthTokens.Base64Url(Sign(key, $"{target.TokenPrefix}:{target.Id:D}").AsSpan(0, TokenBytes));
    }

    public async Task<bool> VerifyLabelTokenAsync(LabelTarget target, string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return false;
        var expected = await ComputeLabelTokenAsync(target);

        // Fixed-time compare: this is a signature check, so leaking how many leading
        // characters matched would let a caller build a valid token a byte at a time.
        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(token));
    }

    public async Task<string> IssueLabelSessionAsync(LabelTarget target)
    {
        var expires = DateTimeOffset.UtcNow.Add(LabelSessionLifetime).ToUnixTimeSeconds();
        var payload = $"{target.CookieTag}:{target.Id:D}.{expires}";
        var key = await GetKeyAsync();
        return $"{payload}.{AuthTokens.Base64Url(Sign(key, payload))}";
    }

    // Returns the target the caller may act on, or null if there is no valid scope. Never
    // throws on malformed input: this reads an attacker-supplied cookie.
    //
    // The kind is inside the signed payload, so an equipment scope can't be relabelled as a
    // place one. Cookies from before places had labels carry no tag and are rejected —
    // they live two hours, and the log page re-exchanges its `?t=` on every load anyway.
    public async Task<LabelTarget?> TryReadLabelSessionAsync(string? cookie)
    {
        if (string.IsNullOrWhiteSpace(cookie)) return null;

        var parts = cookie.Split('.');
        if (parts.Length != 3) return null;
        if (LabelTarget.TryParseCookieSubject(parts[0]) is not LabelTarget target) return null;
        if (!long.TryParse(parts[1], out var expiresUnix)) return null;
        if (DateTimeOffset.FromUnixTimeSeconds(expiresUnix) <= DateTimeOffset.UtcNow) return null;

        var key = await GetKeyAsync();
        var expected = AuthTokens.Base64Url(Sign(key, $"{parts[0]}.{parts[1]}"));

        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(parts[2]))
            ? target
            : null;
    }

    private static byte[] Sign(string base64Key, string payload) =>
        HMACSHA256.HashData(Convert.FromBase64String(base64Key), Encoding.UTF8.GetBytes(payload));
}

// What a printed label names: one item, or one place.
public enum LabelTargetKind { Equipment, StorageLocation }

public readonly record struct LabelTarget(LabelTargetKind Kind, Guid Id)
{
    public static LabelTarget Equipment(Guid id) => new(LabelTargetKind.Equipment, id);
    public static LabelTarget StorageLocation(Guid id) => new(LabelTargetKind.StorageLocation, id);

    // Signed into the QR token. "equipment:" is what every label printed so far signed, so
    // it must never change or those labels stop working.
    public string TokenPrefix => Kind == LabelTargetKind.Equipment ? "equipment" : "location";

    // The cookie's shorter tag for the same thing.
    public string CookieTag => Kind == LabelTargetKind.Equipment ? "e" : "l";

    public static LabelTarget? TryParseCookieSubject(string subject)
    {
        var colon = subject.IndexOf(':');
        if (colon < 0 || !Guid.TryParse(subject.AsSpan(colon + 1), out var id)) return null;
        return subject[..colon] switch
        {
            "e" => Equipment(id),
            "l" => StorageLocation(id),
            _ => null,
        };
    }
}
