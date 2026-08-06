using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Endpoints;

public static class ExternalLinkEndpoints
{
    public static void MapExternalLinkEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/external-links").WithTags("ExternalLinks");

        group.MapGet("/", async (Guid? equipment_id, Guid? part_id, CmmsDbContext db) =>
        {
            var query = db.ExternalLinks.AsQueryable();
            if (equipment_id.HasValue) query = query.Where(l => l.EquipmentId == equipment_id.Value);
            if (part_id.HasValue) query = query.Where(l => l.PartId == part_id.Value);
            return await query.OrderBy(l => l.CreatedAt).ToListAsync();
        });

        group.MapPost("/", async (SaveExternalLinkDto dto, CmmsDbContext db) =>
        {
            var errors = await ValidateAsync(dto, db, requireTarget: true);
            if (errors.Count > 0) return Results.ValidationProblem(errors);

            var link = new ExternalLink
            {
                Id = Guid.NewGuid(),
                Url = NormalizeUrl(dto.Url),
                Label = dto.Label.Trim(),
                EquipmentId = dto.EquipmentId,
                PartId = dto.PartId,
            };
            db.ExternalLinks.Add(link);
            await db.SaveChangesAsync();
            return Results.Created($"/external-links/{link.Id}", link);
        });

        // Only the url/label are editable — moving a link to a different parent is a
        // delete-and-recreate, so the target ids are ignored here.
        group.MapPut("/{id:guid}", async (Guid id, SaveExternalLinkDto dto, CmmsDbContext db) =>
        {
            var link = await db.ExternalLinks.FindAsync(id);
            if (link is null) return Results.NotFound();

            var errors = await ValidateAsync(dto, db, requireTarget: false);
            if (errors.Count > 0) return Results.ValidationProblem(errors);

            link.Url = NormalizeUrl(dto.Url);
            link.Label = dto.Label.Trim();
            await db.SaveChangesAsync();
            return Results.Ok(link);
        });

        group.MapDelete("/{id:guid}", async (Guid id, CmmsDbContext db) =>
        {
            var link = await db.ExternalLinks.FindAsync(id);
            if (link is null) return Results.NotFound();
            db.ExternalLinks.Remove(link);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    static async Task<Dictionary<string, string[]>> ValidateAsync(
        SaveExternalLinkDto dto, CmmsDbContext db, bool requireTarget)
    {
        var errors = new Dictionary<string, string[]>();

        if (string.IsNullOrWhiteSpace(dto.Label))
            errors["label"] = ["Label is required"];

        if (string.IsNullOrWhiteSpace(dto.Url))
            errors["url"] = ["URL is required"];
        else if (!IsAllowedUrl(NormalizeUrl(dto.Url)))
            errors["url"] = ["Must be a valid http(s) URL"];

        if (requireTarget)
        {
            // Exactly one parent, mirroring the document-link check in DocumentEndpoints.
            if (dto.EquipmentId.HasValue == dto.PartId.HasValue)
                errors["equipmentId"] = ["Exactly one of equipmentId or partId is required"];
            else if (dto.EquipmentId is Guid eid && !await db.Equipment.AnyAsync(e => e.Id == eid))
                errors["equipmentId"] = ["Equipment not found"];
            else if (dto.PartId is Guid pid && !await db.Parts.AnyAsync(p => p.Id == pid))
                errors["partId"] = ["Part not found"];
        }

        return errors;
    }

    // A bare "example.com" in an href resolves relative to the app ("/equipment/example.com"),
    // so assume https when no scheme was typed — on a phone, nobody types the scheme.
    static string NormalizeUrl(string url)
    {
        var trimmed = url.Trim();
        return trimmed.Contains("://") ? trimmed : $"https://{trimmed}";
    }

    // http(s) only: these end up in an href, and javascript:/data: URLs there are a
    // script-injection vector.
    static bool IsAllowedUrl(string url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var uri)
        && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
}

record SaveExternalLinkDto(string Url, string Label, Guid? EquipmentId, Guid? PartId);
