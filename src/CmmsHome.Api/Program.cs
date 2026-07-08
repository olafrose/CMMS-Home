using System.Text.Json.Serialization;
using CmmsHome.Api.Data;
using CmmsHome.Api.Endpoints;
using CmmsHome.Api.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<CmmsDbContext>(opt =>
    opt.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

// Document ingest: read-only NAS/SMB watched-folder scanner (background).
builder.Services.Configure<DocumentScanOptions>(builder.Configuration.GetSection("Documents"));
builder.Services.AddSingleton<IDocumentScanner, DocumentScanner>();
builder.Services.AddHostedService<DocumentScanHostedService>();

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

app.Run();
