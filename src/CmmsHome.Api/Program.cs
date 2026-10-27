using System.Text.Json.Serialization;
using CmmsHome.Api.Data;
using CmmsHome.Api.Endpoints;
using CmmsHome.Api.Models;
using CmmsHome.Api.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<CmmsDbContext>(opt =>
    opt.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

// Document ingest: NAS/SMB watched-folder scanner (background) + Phase 2 managed
// foldering (uploads land in inbox/, classify files them into library/<Category>/).
builder.Services.Configure<DocumentScanOptions>(builder.Configuration.GetSection("Documents"));
builder.Services.AddSingleton<DocumentIoLock>();
builder.Services.AddSingleton<IDocumentScanner, DocumentScanner>();
builder.Services.AddSingleton<IDocumentFiler, DocumentFiler>();
builder.Services.AddHostedService<DocumentScanHostedService>();

// Allow large document uploads (single-user LAN app); the multipart body carries
// whole PDFs/scans. Cap generously rather than the tiny defaults.
builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(o =>
    o.MultipartBodyLengthLimit = 256L * 1024 * 1024);
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 256L * 1024 * 1024);

builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    // Equipment ↔ EquipmentLoan (and StorageLocation self-refs) are bidirectional;
    // break cycles when serializing.
    o.SerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
});

// Authentication and the rights grid. Hand-rolled rather than ASP.NET Identity so model
// classes stay free of framework types; only password hashing is borrowed (PasswordHasher<T>
// ships in the shared framework and constrains nothing but `class`).
builder.Services.Configure<AuthOptions>(builder.Configuration.GetSection("Auth"));
builder.Services.AddHttpContextAccessor();
builder.Services.AddSingleton<IPasswordHasher<UserIdentity>, PasswordHasher<UserIdentity>>();
builder.Services.AddSingleton<SetupState>();
builder.Services.AddScoped<ActorAccessor>();
builder.Services.AddScoped<AccountService>();
builder.Services.AddScoped<LabelSigner>();
builder.Services.AddScoped<ApiTokenService>();
builder.Services.AddScoped<MeterService>();
builder.Services.AddHostedService<MeterRetentionHostedService>();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    // So "Authorize" in Swagger UI takes a pasted API token. Without it, Try-it-out only
    // ever carries the browser's session cookie.
    c.AddSecurityDefinition("bearer", new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "cmms_…",
        Description = "An API token from Settings → Access (service account) or My account (personal).",
    });
    c.AddSecurityRequirement(doc => new OpenApiSecurityRequirement
    {
        [new OpenApiSecuritySchemeReference("bearer", doc)] = [],
    });
});
builder.Services.AddCors(opt => opt.AddDefaultPolicy(p =>
    p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));

var app = builder.Build();

app.UseCors();

// A bearer header naming no valid token is refused here, before any endpoint runs, rather
// than evaluated as Anonymous: a revoked key quietly succeeding on the routes Anonymous may
// use would hide that it is broken until something that matters fails.
app.Use(async (ctx, next) =>
{
    if (ActorAccessor.BearerToken(ctx) is not null
        && await ctx.RequestServices.GetRequiredService<ActorAccessor>().GetAsync() is { InvalidBearer: true })
    {
        ctx.Response.Headers.WWWAuthenticate = "Bearer";
        await Results.Problem(
            detail: "The API token is unknown, expired or revoked, or its account is deactivated.",
            title: "Invalid token", statusCode: 401, instance: ctx.Request.Path).ExecuteAsync(ctx);
        return;
    }

    await next();
});

// Swagger is middleware, not endpoints, so the per-route permission filters and the startup
// audit never see it. Gated here instead, in the API rather than only in the web proxy, so a
// direct :8080/swagger is held to the same rule. Try-it-out runs against the live data, so
// who may open it is a grid decision (api.docs) rather than a deploy-time env toggle.
app.UseWhen(ctx => ctx.Request.Path.StartsWithSegments("/swagger"), branch => branch.Use(async (ctx, next) =>
{
    var actor = await ctx.RequestServices.GetRequiredService<ActorAccessor>().GetAsync();
    if (actor.Can(Permissions.ApiDocs))
    {
        await next();
        return;
    }

    await (actor.IsAuthenticated
        ? Results.Problem(detail: "Your roles do not include \"Administration: View API documentation\".",
            title: "Not permitted", statusCode: 403, instance: ctx.Request.Path)
        : Results.Problem(detail: "Signing in is required to view the API documentation.",
            title: "Sign in required", statusCode: 401, instance: ctx.Request.Path)).ExecuteAsync(ctx);
}));

app.UseSwagger(o => o.PreSerializeFilters.Add((doc, req) =>
{
    // In deployment only the web container's port is published, and it proxies
    // /swagger through to here (see app/swagger/[[...path]]/route.ts), setting
    // X-Forwarded-Prefix to the prefix the API answers on from the browser's side.
    // Without a matching `servers` entry Swagger UI would aim "Try it out" at the
    // web host's root — where /equipment is a Next.js 404, not the API.
    // Ignored when the API is reached directly, which needs no server override.
    var prefix = req.Headers["X-Forwarded-Prefix"].ToString();
    if (prefix.StartsWith('/') && !prefix.StartsWith("//"))
        doc.Servers = [new OpenApiServer { Url = prefix.TrimEnd('/') }];
}));
app.UseSwaggerUI();

using (var scope = app.Services.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<CmmsDbContext>().Database.Migrate();
    await scope.ServiceProvider.ApplyAdminResetAsync();
}

app.MapAuthEndpoints();
app.MapUserEndpoints();
app.MapRoleEndpoints();
app.MapEquipmentEndpoints();
app.MapEventEndpoints();
app.MapRuleEndpoints();
app.MapMeterEndpoints();
app.MapStorageLocationEndpoints();
app.MapCategoryEndpoints();
app.MapPartEndpoints();
app.MapPartUsageEndpoints();
app.MapPartCategoryEndpoints();
app.MapDocumentEndpoints();
app.MapDocumentCategoryEndpoints();
app.MapAppSettingsEndpoints();
app.MapExternalLinkEndpoints();

// Fails startup if any endpoint above was mapped without a permission requirement. The hole
// it catches is invisible in review — a new route simply works, wide open — so turning it
// into a crash-on-boot is worth the startup cost.
app.AuditPermissionCoverage();

app.Run();
