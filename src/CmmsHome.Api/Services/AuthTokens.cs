using System.Security.Cryptography;
using System.Text;

namespace CmmsHome.Api.Services;

// Opaque session tokens and the hashing used to store them.
public static class AuthTokens
{
    // 256 bits of randomness: the token is the credential, so it must not be guessable and
    // there is no rate limit worth relying on for something this cheap to make large.
    public static string NewToken() =>
        Base64Url(RandomNumberGenerator.GetBytes(32));

    // Sessions are looked up by hash, so the plaintext token never touches the database.
    // A fast hash is correct here (unlike for passwords): the input is already 256 bits of
    // entropy, so there is nothing to brute-force and no reason to pay a KDF per request.
    public static string Hash(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    public static string Base64Url(ReadOnlySpan<byte> bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
