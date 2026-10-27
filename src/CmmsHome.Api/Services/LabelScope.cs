namespace CmmsHome.Api.Services;

// The object half of a label-scoped check: "may this caller touch *this* item?"
//
// RequirePermission's filter can only answer the subject half — that the permission is
// held — because it cannot know whether the item id lives in the route, the query or the
// body. So every .AllowLabelScope() route checks the id itself and calls this to refuse.
// Kept next to the filter so the refusal reads identically to the one the filter issues:
// one problem shape for the client to parse, one wording for the user.
//
// Deliberately not Results.Forbid(): that defers to an authentication handler, and this app
// has no scheme registered (sessions are hand-rolled), so it would throw and answer 500.
public static class LabelScope
{
    public static IResult Denied() =>
        Results.Problem(
            detail: "Scanning a label allows logging maintenance on that one item. Sign in to do more.",
            title: "Sign in required",
            statusCode: 403,
            extensions: new Dictionary<string, object?> { ["labelScoped"] = true });
}
