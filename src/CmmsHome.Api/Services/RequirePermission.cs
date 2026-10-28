namespace CmmsHome.Api.Services;

// The one place a request is allowed or refused.
//
// Attached per route rather than per group on purpose: a group-wide default would silently
// cover a route added later, and "the new endpoint inherited whatever the group had" is
// exactly how an unguarded surface appears. Chaining .RequirePermission(...) onto every
// route means an unguarded endpoint is visible as a missing call, and the startup audit in
// Program.cs turns that into a failure to boot rather than a hole nobody notices.
public static class RequirePermissionExtensions
{
    public static RouteHandlerBuilder RequirePermission(this RouteHandlerBuilder builder, string permission) =>
        builder
            .AddEndpointFilterFactory((ctx, next) => async invocation =>
            {
                var accessor = invocation.HttpContext.RequestServices.GetRequiredService<ActorAccessor>();
                var actor = await accessor.GetAsync();

                var denial = Evaluate(actor, permission, invocation.HttpContext);
                return denial ?? await next(invocation);
            })
            .WithMetadata(new RequiredPermissionMetadata(permission));

    // Marks a route as safe for a label scan to reach. Everything else refuses a
    // label-scoped caller outright, so the blast radius of a printed QR code is a short,
    // reviewable list rather than "whatever Anonymous happens to be granted".
    //
    // A route marked this way MUST check actor.MayTouchEquipment(id) (or MayTouchTarget)
    // itself — the filter cannot know which of the route, query or body carries the item id.
    public static RouteHandlerBuilder AllowLabelScope(this RouteHandlerBuilder builder) =>
        builder.WithMetadata(new LabelScopeAllowedMetadata());

    // Deliberately reachable by anyone: signing in, first-run setup, and exchanging a label
    // token. Requiring a permission to sign in would be a locked door with the key inside.
    // Explicit metadata rather than a path allowlist, so the startup audit can tell an
    // intentionally-public endpoint from a forgotten one.
    public static RouteHandlerBuilder Public(this RouteHandlerBuilder builder, string why) =>
        builder.WithMetadata(new PublicEndpointMetadata(why));

    // Marks a permissioned route as unreachable with an API token, whatever its scope:
    // minting tokens, chiefly. A token that could mint tokens could outlive its own
    // revocation by leaving a successor behind, so only a signed-in person may do it.
    public static RouteHandlerBuilder SessionOnly(this RouteHandlerBuilder builder) =>
        builder.WithMetadata(new SessionOnlyMetadata());

    // Signed in, but needing no particular right: changing your own password,
    // signing out, listing your own sessions. A third category on purpose — forcing
    // these through a permission would mean an admin could accidentally revoke
    // someone's ability to log out.
    //
    // A person with a session only: these are the account's self-service routes, and an
    // API token — scoped to the app's data — is not the account holder at a keyboard.
    public static RouteHandlerBuilder RequireAuthenticated(this RouteHandlerBuilder builder) =>
        builder
            .AddEndpointFilterFactory((ctx, next) => async invocation =>
            {
                var accessor = invocation.HttpContext.RequestServices.GetRequiredService<ActorAccessor>();
                var actor = await accessor.GetAsync();

                if (!actor.IsAuthenticated)
                    return Results.Problem(detail: "Signing in is required.", title: "Sign in required",
                        statusCode: 401, instance: invocation.HttpContext.Request.Path);

                if (actor.IsApiToken)
                    return TokenRefused(invocation.HttpContext);

                return await next(invocation);
            })
            .WithMetadata(new AuthenticatedOnlyMetadata());

    private static IResult? Evaluate(CurrentActor actor, string permission, HttpContext http)
    {
        // First run: no accounts exist, so nothing but /auth is reachable. Reported
        // distinctly from a plain 401 so the client sends the operator to /setup rather
        // than to a login form no password can satisfy.
        if (actor.SetupRequired)
            return Problem(http, 503, "Setup required",
                "No accounts exist yet. Create the first administrator to continue.",
                new Dictionary<string, object?> { ["setupRequired"] = true });

        if (!actor.Can(permission) && actor.IsApiToken && actor.OwnerPermissions?.Contains(permission) == true)
            // The account could, the token was not given it. Worth saying apart from a roles
            // refusal: the fix is a new token, not a request to an admin.
            return Problem(http, 403, "Not permitted",
                $"This token's scope does not include \"{Describe(permission)}\".",
                new Dictionary<string, object?> { ["permission"] = permission, ["tokenScope"] = true });

        if (!actor.Can(permission))
            return actor.IsAuthenticated
                // Signed in, but this is not theirs to do. Saying which permission is
                // missing is deliberate: this is a household tool, and "ask an admin for
                // parts.consume" is more use than "forbidden".
                ? Problem(http, 403, "Not permitted",
                    $"Your roles do not include \"{Describe(permission)}\".",
                    new Dictionary<string, object?> { ["permission"] = permission })
                : Problem(http, 401, "Sign in required",
                    $"Signing in is required for \"{Describe(permission)}\".",
                    new Dictionary<string, object?> { ["permission"] = permission });

        if (actor.IsApiToken && http.GetEndpoint()?.Metadata.GetMetadata<SessionOnlyMetadata>() is not null)
            return TokenRefused(http);

        // Held only because a label was scanned (Anonymous itself lacks it): good for the
        // scanned target alone. Only routes marked .AllowLabelScope() can tell which target a
        // request names, so everything else refuses; those that can then check MayTouch*.
        if (actor.IsLabelScoped && actor.UnscopedPermissions?.Contains(permission) == false)
        {
            if (http.GetEndpoint()?.Metadata.GetMetadata<LabelScopeAllowedMetadata>() is null)
                return Problem(http, 403, "Sign in required",
                    "Scanning a label allows logging maintenance on that one item. Sign in to do more.",
                    new Dictionary<string, object?> { ["permission"] = permission, ["labelScoped"] = true });
            actor.ScopeEnforced = true;
        }

        return null;
    }

    private static IResult TokenRefused(HttpContext http) =>
        Problem(http, 403, "Not available to API tokens",
            "This needs a signed-in session. API tokens cannot manage accounts or mint other tokens.",
            new Dictionary<string, object?> { ["sessionOnly"] = true });

    private static string Describe(string permission) =>
        Permissions.All.FirstOrDefault(p => p.Key == permission) is { } info
            ? $"{info.Group}: {info.Label}"
            : permission;

    // Results.Problem shape, matching the ValidationProblem responses the endpoints already
    // return, so the client has one error format to parse rather than two.
    private static IResult Problem(HttpContext http, int status, string title, string detail,
        Dictionary<string, object?> extensions) =>
        Results.Problem(detail: detail, title: title, statusCode: status,
            instance: http.Request.Path, extensions: extensions);
}

public record RequiredPermissionMetadata(string Permission);

public record LabelScopeAllowedMetadata;

public record PublicEndpointMetadata(string Reason);

public record AuthenticatedOnlyMetadata;

public record SessionOnlyMetadata;
