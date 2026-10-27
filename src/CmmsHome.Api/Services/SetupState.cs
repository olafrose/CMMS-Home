using CmmsHome.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Services;

// Remembers that first-run setup is done, so the check costs nothing after it is.
//
// Every request has to know whether any account exists — an unconfigured app answers 503 and
// "go to /setup" rather than 401 and "sign in". Asking the database each time would add a
// query to every single API call, forever, to learn something that changes once in the
// lifetime of an install. On a J4025 NAS that is worth avoiding.
//
// Safe to latch because it only ever goes false -> true: creating the first account cannot be
// undone through the app, since deleting or deactivating the last administrator is refused.
// If someone empties the Users table directly in psql, this will wrongly believe setup is
// done and answer 401 instead of 503 until a restart — recoverable with Auth__ResetAdmin, and
// a fair trade for one fewer query per request.
public class SetupState
{
    private volatile bool _complete;

    public async Task<bool> IsCompleteAsync(CmmsDbContext db)
    {
        if (_complete) return true;

        if (await db.Users.AnyAsync())
            _complete = true;

        return _complete;
    }

    // Called when setup or the recovery hatch creates an account, so the very next request
    // does not have to rediscover it.
    public void MarkComplete() => _complete = true;
}
