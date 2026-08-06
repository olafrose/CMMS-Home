using System.Text.Json.Serialization;
using CmmsHome.Api.Data;
using CmmsHome.Api.Endpoints;
using CmmsHome.Api.Services;
using Microsoft.EntityFrameworkCore;

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

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddCors(opt => opt.AddDefaultPolicy(p =>
    p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));

var app = builder.Build();

app.UseCors();
app.UseSwagger();
app.UseSwaggerUI();

using (var scope = app.Services.CreateScope())
    scope.ServiceProvider.GetRequiredService<CmmsDbContext>().Database.Migrate();

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

app.Run();
