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

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddCors(opt => opt.AddDefaultPolicy(p =>
    p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));

var app = builder.Build();

app.UseCors();
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
