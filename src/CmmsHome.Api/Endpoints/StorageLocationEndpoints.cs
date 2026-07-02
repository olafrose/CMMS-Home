using CmmsHome.Api.Data;
using CmmsHome.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CmmsHome.Api.Endpoints;

public static class StorageLocationEndpoints
{
    // Root is depth 1; a place can be nested at most this deep.
    private const int MaxDepth = 4;

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
        });

        group.MapGet("/{id:guid}", async (Guid id, CmmsDbContext db) =>
            await db.StorageLocations.FindAsync(id) is StorageLocation loc
                ? Results.Ok(loc)
                : Results.NotFound());

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
        });

        group.MapPost("/", async (SaveStorageLocationDto dto, CmmsDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(dto.Name))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["name"] = ["Name is required"] });

            var all = await db.StorageLocations.AsNoTracking().ToListAsync();
            if (dto.ParentId is Guid pid)
            {
                if (all.All(s => s.Id != pid))
                    return Results.ValidationProblem(new Dictionary<string, string[]> { ["parentId"] = ["Parent not found"] });
                if (DepthOf(pid, all) + 1 > MaxDepth)
                    return Results.ValidationProblem(new Dictionary<string, string[]> { ["parentId"] = [$"Max nesting depth is {MaxDepth}"] });
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
        });

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
                    if (DepthOf(pid, all) + 1 + SubtreeHeight(id, all) - 1 > MaxDepth)
                        return Results.ValidationProblem(new Dictionary<string, string[]> { ["parentId"] = [$"Move would exceed max depth of {MaxDepth}"] });
                }
            }

            loc.Name = dto.Name.Trim();
            loc.Icon = string.IsNullOrWhiteSpace(dto.Icon) ? null : dto.Icon.Trim();
            loc.ParentId = dto.ParentId;
            await db.SaveChangesAsync();
            return Results.Ok(loc);
        });

        group.MapDelete("/{id:guid}", async (Guid id, CmmsDbContext db) =>
        {
            var loc = await db.StorageLocations.FindAsync(id);
            if (loc is null) return Results.NotFound();
            if (await db.StorageLocations.AnyAsync(s => s.ParentId == id))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["children"] = ["Empty or move the places inside first"] });

            db.StorageLocations.Remove(loc); // items here have StorageLocationId set null
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    static int DepthOf(Guid id, List<StorageLocation> all)
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
