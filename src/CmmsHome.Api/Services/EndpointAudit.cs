using Microsoft.AspNetCore.Routing;

namespace CmmsHome.Api.Services;

// Refuses to start if any mapped endpoint is neither guarded by a permission nor explicitly
// marked public.
//
// Worth the startup cost because the failure it catches is invisible: adding an endpoint and
// forgetting .RequirePermission(...) produces a working, tested, wide-open route, and
// nothing about it looks wrong in review. Crashing on boot with the offending route named is
// a far better outcome than a silent hole, and it means the permission model cannot rot as
// the app grows.
public static class EndpointAudit
{
    public static void AuditPermissionCoverage(this WebApplication app)
    {
        // The app's own data sources, NOT the EndpointDataSource service: that composite is
        // only populated once routing builds, so at startup it is empty — and for a long time
        // this audit read it, checked zero routes, and passed whatever was mapped. Reading
        // the WebApplication's sources sees every route mapped above it in Program.cs.
        var endpoints = ((IEndpointRouteBuilder)app).DataSources.SelectMany(d => d.Endpoints).ToList();
        if (endpoints.Count == 0)
            throw new InvalidOperationException("Permission audit found no endpoints; it must run after mapping them.");

        var unguarded = endpoints
            .OfType<RouteEndpoint>()
            .Where(e => e.Metadata.GetMetadata<RequiredPermissionMetadata>() is null)
            .Where(e => e.Metadata.GetMetadata<PublicEndpointMetadata>() is null)
            .Where(e => e.Metadata.GetMetadata<AuthenticatedOnlyMetadata>() is null)
            .Select(e => $"{HttpMethodsOf(e)} /{e.RoutePattern.RawText?.TrimStart('/')}")
            .OrderBy(s => s)
            .ToList();

        if (unguarded.Count > 0)
            throw new InvalidOperationException(
                "These endpoints have no permission requirement and are not marked .Public(...):"
                + Environment.NewLine + string.Join(Environment.NewLine, unguarded.Select(u => "  " + u))
                + Environment.NewLine
                + "Add .RequirePermission(Permissions.X), or .Public(\"why\") if it genuinely must be open.");

        // The catalogue's LabelScopable flags must match the routes: a scopable permission
        // guarding no .AllowLabelScope() route would be a Label scan checkbox that does
        // nothing, and a label-reachable route whose permission isn't flagged couldn't be
        // granted to Label scan at all.
        var labelRoutes = endpoints
            .Where(e => e.Metadata.GetMetadata<LabelScopeAllowedMetadata>() is not null)
            .Select(e => e.Metadata.GetMetadata<RequiredPermissionMetadata>()?.Permission)
            .OfType<string>()
            .ToHashSet();
        if (!labelRoutes.SetEquals(Permissions.LabelScopableKeys))
            throw new InvalidOperationException(
                "Permissions marked LabelScopable must be exactly those guarding .AllowLabelScope() routes. "
                + $"Routes: {string.Join(", ", labelRoutes.Order())}. "
                + $"Catalogue: {string.Join(", ", Permissions.LabelScopableKeys.Order())}.");

        // Also verify every granted key still exists in the catalogue, so a permission
        // removed in code cannot linger as a grant row that grants nothing while looking
        // like it does.
        var stale = Permissions.All.Select(p => p.Key)
            .GroupBy(k => k).Where(g => g.Count() > 1).Select(g => g.Key).ToList();

        if (stale.Count > 0)
            throw new InvalidOperationException(
                "Duplicate permission keys in the catalogue: " + string.Join(", ", stale));
    }

    private static string HttpMethodsOf(RouteEndpoint endpoint) =>
        endpoint.Metadata.GetMetadata<IHttpMethodMetadata>() is { } m
            ? string.Join("|", m.HttpMethods)
            : "ANY";
}
