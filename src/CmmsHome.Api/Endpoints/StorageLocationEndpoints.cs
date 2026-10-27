using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using CmmsHome.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Endpoints;

public static class StorageLocationEndpoints
{
    // Root is depth 1; how deep a place may nest is the user-editable
    // AppSettings.StorageMaxDepth (default 6), itself capped at
    // AppSettings.AbsoluteStorageMaxDepth.
    public static void MapStorageLocationEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/storage-locations").WithTags("StorageLocations");

        // Flat list of all places (the frontend builds the tree / breadcrumbs).
        // Optional ?parent_id= filters to direct children; ?q= searches by name.
        group.MapGet("/", async (Guid? parent_id, string? q, CmmsDbContext db) =>
        {
            var query = db.StorageLocations.AsQueryable();
            if (parent_id.HasValue) query = query.Where(s => s.ParentId == parent_id);
            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = q.Trim().ToLower();
                query = query.Where(s => s.Name.ToLower().Contains(term));
            }
            return await query.OrderBy(s => s.Name).ToListAsync();
        }).RequirePermission(Permissions.StorageRead);

        group.MapGet("/{id:guid}", async (Guid id, CmmsDbContext db) =>
            await db.StorageLocations.FindAsync(id) is StorageLocation loc
                ? Results.Ok(loc)
                : Results.NotFound())
            .RequirePermission(Permissions.StorageRead);

        // Everything stored at a place: ancestors (for breadcrumbs), direct child
        // places, and the parts/tools/assets sitting directly in this place.
        group.MapGet("/{id:guid}/contents", async (Guid id, CmmsDbContext db) =>
        {
            var all = await db.StorageLocations.ToListAsync();
            var self = all.FirstOrDefault(s => s.Id == id);
            if (self is null) return Results.NotFound();

            var byId = all.ToDictionary(s => s.Id);
            var ancestors = new List<StorageLocation>();
            for (var p = self.ParentId; p is not null && byId.TryGetValue(p.Value, out var node); p = node.ParentId)
                ancestors.Insert(0, node);

            var children = all.Where(s => s.ParentId == id).OrderBy(s => s.Name).ToList();

            var parts = await db.Parts.Include(p => p.PartCategory).Include(p => p.Equipment)
                .Where(p => p.StorageLocationId == id).OrderBy(p => p.Name).ToListAsync();
            var equipment = await db.Equipment.Include(e => e.Category)
                .Include(e => e.Loans.Where(l => l.ReturnedAt == null))
                .Where(e => e.StorageLocationId == id).OrderBy(e => e.Name).ToListAsync();

            return Results.Ok(new { location = self, ancestors, children, equipment, parts });
        }).RequirePermission(Permissions.StorageRead);

        group.MapPost("/", async (SaveStorageLocationDto dto, CmmsDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(dto.Name))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["name"] = ["Name is required"] });

            var all = await db.StorageLocations.AsNoTracking().ToListAsync();
            if (dto.ParentId is Guid pid)
            {
                if (all.All(s => s.Id != pid))
                    return Results.ValidationProblem(new Dictionary<string, string[]> { ["parentId"] = ["Parent not found"] });
                var maxDepth = (await db.GetAppSettingsAsync()).StorageMaxDepth;
                if (DepthOf(pid, all) + 1 > maxDepth)
                    return Results.ValidationProblem(new Dictionary<string, string[]> { ["parentId"] = [$"Max nesting depth is {maxDepth}"] });
            }

            var loc = new StorageLocation
            {
                Id = Guid.NewGuid(),
                Name = dto.Name.Trim(),
                Icon = string.IsNullOrWhiteSpace(dto.Icon) ? null : dto.Icon.Trim(),
                ParentId = dto.ParentId,
            };
            db.StorageLocations.Add(loc);
            await db.SaveChangesAsync();
            return Results.Created($"/storage-locations/{loc.Id}", loc);
        }).RequirePermission(Permissions.StorageWrite);

        group.MapPut("/{id:guid}", async (Guid id, SaveStorageLocationDto dto, CmmsDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(dto.Name))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["name"] = ["Name is required"] });

            var loc = await db.StorageLocations.FindAsync(id);
            if (loc is null) return Results.NotFound();

            if (dto.ParentId != loc.ParentId)
            {
                if (dto.ParentId == id)
                    return Results.ValidationProblem(new Dictionary<string, string[]> { ["parentId"] = ["A place cannot be its own parent"] });

                var all = await db.StorageLocations.AsNoTracking().ToListAsync();
                if (dto.ParentId is Guid pid)
                {
                    if (all.All(s => s.Id != pid))
                        return Results.ValidationProblem(new Dictionary<string, string[]> { ["parentId"] = ["Parent not found"] });
                    if (IsDescendant(pid, id, all))
                        return Results.ValidationProblem(new Dictionary<string, string[]> { ["parentId"] = ["Cannot move a place into its own subtree"] });
                    var maxDepth = (await db.GetAppSettingsAsync()).StorageMaxDepth;
                    if (DepthOf(pid, all) + 1 + SubtreeHeight(id, all) - 1 > maxDepth)
                        return Results.ValidationProblem(new Dictionary<string, string[]> { ["parentId"] = [$"Move would exceed max depth of {maxDepth}"] });
                }
            }

            loc.Name = dto.Name.Trim();
            loc.Icon = string.IsNullOrWhiteSpace(dto.Icon) ? null : dto.Icon.Trim();
            loc.ParentId = dto.ParentId;
            await db.SaveChangesAsync();
            return Results.Ok(loc);
        }).RequirePermission(Permissions.StorageWrite);

        group.MapDelete("/{id:guid}", async (Guid id, CmmsDbContext db) =>
        {
            var loc = await db.StorageLocations.FindAsync(id);
            if (loc is null) return Results.NotFound();
            if (await db.StorageLocations.AnyAsync(s => s.ParentId == id))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["children"] = ["Empty or move the places inside first"] });

            // A place's own maintenance history is not collateral of tidying the storage tree
            // (the FK is Restrict for the same reason). Say what is in the way. Deleting the
            // history is possible, but a deliberate act of its own (events.delete), never a
            // side effect of removing the place.
            var events = await db.Events.CountAsync(e => e.StorageLocationId == id);
            if (events > 0)
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["maintenance"] = [$"This place has {Plural(events, "logged maintenance event")}, so it's kept to "
                        + "preserve that history. Someone allowed to delete history entries can remove them first."],
                });
            var rules = await db.Rules.CountAsync(r => r.StorageLocationId == id);
            if (rules > 0)
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["maintenance"] = [$"Delete this place's {Plural(rules, "maintenance schedule")} first"] });

            db.StorageLocations.Remove(loc); // items here have StorageLocationId set null
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequirePermission(Permissions.StorageDelete);
    }

    static string Plural(int n, string noun) => n == 1 ? $"1 {noun}" : $"{n} {noun}s";

    // internal: AppSettingsEndpoints reuses this to count places left over a lowered cap.
    internal static int DepthOf(Guid id, List<StorageLocation> all)
    {
        var byId = all.ToDictionary(s => s.Id);
        var depth = 1;
        var cur = byId[id];
        while (cur.ParentId is Guid pid && byId.TryGetValue(pid, out var parent)) { depth++; cur = parent; }
        return depth;
    }

    // Height of the subtree rooted at id (a leaf = 1).
    static int SubtreeHeight(Guid id, List<StorageLocation> all)
    {
        var kids = all.Where(s => s.ParentId == id).ToList();
        return kids.Count == 0 ? 1 : 1 + kids.Max(k => SubtreeHeight(k.Id, all));
    }

    // Is `candidate` inside the subtree rooted at `ancestor`?
    static bool IsDescendant(Guid candidate, Guid ancestor, List<StorageLocation> all)
    {
        var byId = all.ToDictionary(s => s.Id);
        for (var p = byId[candidate].ParentId; p is Guid pid && byId.TryGetValue(pid, out var node); p = node.ParentId)
            if (pid == ancestor) return true;
        return false;
    }
}

record SaveStorageLocationDto(string Name, Guid? ParentId, string? Icon);
