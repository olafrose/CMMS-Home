using Microsoft.EntityFrameworkCore;
using CmmsHome.Api.Services;
using CmmsHome.Api.Models;

namespace CmmsHome.Api.Data;

public class CmmsDbContext(DbContextOptions<CmmsDbContext> options) : DbContext(options)
{
    public DbSet<Equipment> Equipment => Set<Equipment>();
    public DbSet<MaintenanceEvent> Events => Set<MaintenanceEvent>();
    public DbSet<MaintenanceRule> Rules => Set<MaintenanceRule>();
    public DbSet<EquipmentLoan> EquipmentLoans => Set<EquipmentLoan>();
    public DbSet<StorageLocation> StorageLocations => Set<StorageLocation>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Part> Parts => Set<Part>();
    public DbSet<PartEquipment> PartEquipment => Set<PartEquipment>();
    public DbSet<EquipmentUsedOn> EquipmentUsedOn => Set<EquipmentUsedOn>();
    public DbSet<PartUsage> PartUsages => Set<PartUsage>();
    public DbSet<PartCategory> PartCategories => Set<PartCategory>();
    public DbSet<Document> Documents => Set<Document>();
    public DbSet<DocumentLink> DocumentLinks => Set<DocumentLink>();
    public DbSet<DocumentCategory> DocumentCategories => Set<DocumentCategory>();
    public DbSet<DocumentMove> DocumentMoves => Set<DocumentMove>();
    public DbSet<AppSettings> AppSettings => Set<AppSettings>();
    public DbSet<ExternalLink> ExternalLinks => Set<ExternalLink>();
    public DbSet<User> Users => Set<User>();
    public DbSet<UserIdentity> UserIdentities => Set<UserIdentity>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<UserRole> UserRoles => Set<UserRole>();
    public DbSet<RolePermission> RolePermissions => Set<RolePermission>();
    public DbSet<Session> Sessions => Set<Session>();
    public DbSet<Meter> Meters => Set<Meter>();
    public DbSet<MeterReading> MeterReadings => Set<MeterReading>();
    public DbSet<ApiToken> ApiTokens => Set<ApiToken>();
    public DbSet<ApiTokenPermission> ApiTokenPermissions => Set<ApiTokenPermission>();
    public DbSet<ServerSecret> ServerSecrets => Set<ServerSecret>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Equipment>()
            .Property(e => e.CreatedAt)
            .HasDefaultValueSql("now()");

        modelBuilder.Entity<MaintenanceEvent>()
            .Property(e => e.CreatedAt)
            .HasDefaultValueSql("now()");

        modelBuilder.Entity<Equipment>()
            .HasMany(e => e.Events)
            .WithOne(m => m.Equipment)
            .HasForeignKey(m => m.EquipmentId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Equipment>()
            .HasMany(e => e.Rules)
            .WithOne(r => r.Equipment)
            .HasForeignKey(r => r.EquipmentId)
            .OnDelete(DeleteBehavior.Cascade);

        // A place can be maintained too. Restrict, not Cascade: deleting a place is a tidy-up
        // of the storage tree, and it must not quietly take years of history with it the way
        // deleting an item (a deliberate "this is gone") does. The endpoint refuses first and
        // says why; this is the backstop.
        modelBuilder.Entity<StorageLocation>()
            .HasMany(s => s.Events)
            .WithOne(m => m.StorageLocation)
            .HasForeignKey(m => m.StorageLocationId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<StorageLocation>()
            .HasMany(s => s.Rules)
            .WithOne(r => r.StorageLocation)
            .HasForeignKey(r => r.StorageLocationId)
            .OnDelete(DeleteBehavior.Restrict);

        // Exactly one target. The endpoints validate this with a readable message, but unlike
        // DocumentLink it is cheap to make impossible here — and a row with no target would be
        // history nobody can reach.
        modelBuilder.Entity<MaintenanceEvent>()
            .ToTable(t => t.HasCheckConstraint("CK_Events_OneTarget",
                "num_nonnulls(\"EquipmentId\", \"StorageLocationId\") = 1"));

        modelBuilder.Entity<MaintenanceRule>()
            .ToTable(t => t.HasCheckConstraint("CK_Rules_OneTarget",
                "num_nonnulls(\"EquipmentId\", \"StorageLocationId\") = 1"));

        // A Usage rule names its meter and nothing else does — a meter id on a time-based
        // rule would be ignored by the status maths, which is a lie worth refusing. 2 is
        // ScheduleType.Usage (stored as an integer). That the meter belongs to the rule's own
        // equipment is checked by RuleEndpoints; a check constraint can't follow the FK.
        modelBuilder.Entity<MaintenanceRule>()
            .ToTable(t => t.HasCheckConstraint("CK_Rules_UsageMeter",
                "(\"ScheduleType\" = 2) = (\"MeterId\" IS NOT NULL)"));

        ConfigureMeters(modelBuilder);

        modelBuilder.Entity<Equipment>()
            .HasMany(e => e.Loans)
            .WithOne(l => l.Equipment)
            .HasForeignKey(l => l.EquipmentId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Equipment>()
            .HasOne(e => e.Category)
            .WithMany()
            .HasForeignKey(e => e.CategoryId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<Equipment>()
            .HasOne(e => e.StorageLocation)
            .WithMany()
            .HasForeignKey(e => e.StorageLocationId)
            .OnDelete(DeleteBehavior.SetNull);

        // "Used on / services" — self-referencing many-to-many (a tool used on
        // several assets). Both FKs point at Equipment, so configure explicitly.
        modelBuilder.Entity<Equipment>()
            .HasMany(e => e.UsedOn)
            .WithMany()
            .UsingEntity<EquipmentUsedOn>(
                r => r.HasOne<Equipment>().WithMany().HasForeignKey(x => x.UsedOnEquipmentId).OnDelete(DeleteBehavior.Cascade),
                l => l.HasOne<Equipment>().WithMany().HasForeignKey(x => x.EquipmentId).OnDelete(DeleteBehavior.Cascade));

        modelBuilder.Entity<EquipmentLoan>()
            .Property(l => l.LoanedAt)
            .HasDefaultValueSql("now()");

        modelBuilder.Entity<MaintenanceRule>()
            .Property(r => r.IntervalUnit)
            .HasDefaultValue(IntervalUnit.Days);

        modelBuilder.Entity<MaintenanceRule>()
            .Property(r => r.ScheduleType)
            .HasDefaultValue(ScheduleType.Interval);

        modelBuilder.Entity<MaintenanceRule>()
            .Property(r => r.DueWindowUnit)
            .HasDefaultValue(IntervalUnit.Days);

        modelBuilder.Entity<MaintenanceRule>()
            .Property(r => r.ReminderLeadValue)
            .HasDefaultValue(30);

        modelBuilder.Entity<MaintenanceRule>()
            .Property(r => r.ReminderLeadUnit)
            .HasDefaultValue(IntervalUnit.Days);

        // Self-referencing storage hierarchy.
        modelBuilder.Entity<StorageLocation>()
            .HasOne(s => s.Parent)
            .WithMany(s => s.Children)
            .HasForeignKey(s => s.ParentId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Part>()
            .HasOne(p => p.StorageLocation)
            .WithMany()
            .HasForeignKey(p => p.StorageLocationId)
            .OnDelete(DeleteBehavior.SetNull);

        // A consumable can be used on several assets (many-to-many via PartEquipment).
        modelBuilder.Entity<Part>()
            .HasMany(p => p.Equipment)
            .WithMany()
            .UsingEntity<PartEquipment>();

        modelBuilder.Entity<Part>()
            .HasOne(p => p.PartCategory)
            .WithMany()
            .HasForeignKey(p => p.PartCategoryId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<PartUsage>()
            .HasOne(u => u.MaintenanceEvent)
            .WithMany()
            .HasForeignKey(u => u.MaintenanceEventId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<PartUsage>()
            .HasOne(u => u.Part)
            .WithMany()
            .HasForeignKey(u => u.PartId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Document>()
            .Property(d => d.CreatedAt)
            .HasDefaultValueSql("now()");

        modelBuilder.Entity<Document>()
            .Property(d => d.DiscoveredAt)
            .HasDefaultValueSql("now()");

        modelBuilder.Entity<Document>()
            .HasIndex(d => d.RelativePath)
            .IsUnique();

        modelBuilder.Entity<Document>()
            .HasIndex(d => d.ContentHash);

        modelBuilder.Entity<Document>()
            .HasMany(d => d.Links)
            .WithOne(l => l.Document)
            .HasForeignKey(l => l.DocumentId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Document>()
            .HasOne(d => d.Category)
            .WithMany()
            .HasForeignKey(d => d.CategoryId)
            .OnDelete(DeleteBehavior.SetNull);

        // A document link points at one Equipment, one MaintenanceEvent, or one Part.
        // Deleting the target takes the link with it — the document itself survives,
        // classified but unlinked.
        modelBuilder.Entity<DocumentLink>()
            .HasOne<Equipment>()
            .WithMany()
            .HasForeignKey(l => l.EquipmentId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<DocumentLink>()
            .HasOne<MaintenanceEvent>()
            .WithMany()
            .HasForeignKey(l => l.MaintenanceEventId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<DocumentLink>()
            .HasOne<Part>()
            .WithMany()
            .HasForeignKey(l => l.PartId)
            .OnDelete(DeleteBehavior.Cascade);

        // Managed-foldering move audit (Phase 2).
        modelBuilder.Entity<DocumentMove>()
            .Property(m => m.MovedAt)
            .HasDefaultValueSql("now()");

        modelBuilder.Entity<DocumentMove>()
            .HasOne(m => m.Document)
            .WithMany()
            .HasForeignKey(m => m.DocumentId)
            .OnDelete(DeleteBehavior.Cascade);

        // Single-row settings table. Id is fixed at 1 (never generated), and the row is
        // seeded by the migration so a fresh DB has working values from the start.
        //
        // Deliberately NO HasDefaultValue() on the value columns: the seed row sets every
        // column explicitly, so DB-level defaults would never be used — except harmfully.
        // PathShorteningMode.Full is enum value 0, i.e. the CLR default, so EF would treat
        // "the user chose Full" as "unset" and write the default instead. Defaults live in
        // the C# property initializers, the seeded row, and GetAppSettingsAsync's fallback.
        modelBuilder.Entity<AppSettings>()
            .Property(s => s.Id)
            .ValueGeneratedNever();

        modelBuilder.Entity<AppSettings>()
            .HasData(new AppSettings());

        // An external link points at one Equipment or one Part (same FK-only shape as
        // DocumentLink); deleting the parent takes its links with it.
        modelBuilder.Entity<ExternalLink>()
            .Property(l => l.CreatedAt)
            .HasDefaultValueSql("now()");

        modelBuilder.Entity<ExternalLink>()
            .HasOne<Equipment>()
            .WithMany()
            .HasForeignKey(l => l.EquipmentId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<ExternalLink>()
            .HasOne<Part>()
            .WithMany()
            .HasForeignKey(l => l.PartId)
            .OnDelete(DeleteBehavior.Cascade);

        ConfigureAuth(modelBuilder);
    }

    // Meters and their readings (usage-based schedules count against them).
    private static void ConfigureMeters(ModelBuilder modelBuilder)
    {
        // Deleting the equipment takes its meters and their history with it, like its events.
        modelBuilder.Entity<Meter>()
            .HasOne<Equipment>()
            .WithMany()
            .HasForeignKey(m => m.EquipmentId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Meter>()
            .Property(m => m.CreatedAt)
            .HasDefaultValueSql("now()");

        // A schedule counting against a meter must not quietly lose it; MeterEndpoints refuses
        // with a readable message first, and this is the backstop. NoAction, not Restrict:
        // deleting the *item* cascades to both its rules and its meters, and Postgres checks
        // RESTRICT immediately, mid-cascade — whether that failed would depend on which
        // cascade ran first. NO ACTION is checked at the end of the statement, once both are
        // gone, and still refuses deleting a meter on its own.
        modelBuilder.Entity<MaintenanceRule>()
            .HasOne(r => r.Meter)
            .WithMany()
            .HasForeignKey(r => r.MeterId)
            .OnDelete(DeleteBehavior.NoAction);

        modelBuilder.Entity<MeterReading>()
            .HasOne<Meter>()
            .WithMany()
            .HasForeignKey(r => r.MeterId)
            .OnDelete(DeleteBehavior.Cascade);

        // One reading per meter per instant: what makes a retried push harmless. Also the
        // index every "reading before/after this time" lookup walks.
        modelBuilder.Entity<MeterReading>()
            .HasIndex(r => new { r.MeterId, r.ReadAt })
            .IsUnique();

        modelBuilder.Entity<MeterReading>()
            .HasOne<User>()
            .WithMany()
            .HasForeignKey(r => r.CreatedByUserId)
            .OnDelete(DeleteBehavior.SetNull);
    }

    // Accounts, roles, and the rights grid.
    private static void ConfigureAuth(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>()
            .HasIndex(u => u.Username)
            .IsUnique();

        modelBuilder.Entity<User>()
            .Property(u => u.CreatedAt)
            .HasDefaultValueSql("now()");

        modelBuilder.Entity<User>()
            .HasMany(u => u.Roles)
            .WithMany()
            .UsingEntity<UserRole>();

        modelBuilder.Entity<User>()
            .HasMany(u => u.Identities)
            .WithOne()
            .HasForeignKey(i => i.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // A provider's subject is what a sign-in looks up, so it must be unique per
        // provider — two local identities claiming the same username, or two OIDC
        // identities claiming the same `sub`, is a broken login rather than a duplicate row.
        modelBuilder.Entity<UserIdentity>()
            .HasIndex(i => new { i.Provider, i.Subject })
            .IsUnique();

        modelBuilder.Entity<UserIdentity>()
            .Property(i => i.CreatedAt)
            .HasDefaultValueSql("now()");

        modelBuilder.Entity<Role>()
            .HasIndex(r => r.Name)
            .IsUnique();

        modelBuilder.Entity<RolePermission>()
            .HasKey(p => new { p.RoleId, p.Permission });

        modelBuilder.Entity<RolePermission>()
            .HasOne<Role>()
            .WithMany()
            .HasForeignKey(p => p.RoleId)
            .OnDelete(DeleteBehavior.Cascade);

        // Looked up by hash on every authenticated request, so it carries the index.
        modelBuilder.Entity<Session>()
            .HasIndex(s => s.TokenHash)
            .IsUnique();

        modelBuilder.Entity<Session>()
            .HasOne<User>()
            .WithMany()
            .HasForeignKey(s => s.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Session>()
            .Property(s => s.CreatedAt)
            .HasDefaultValueSql("now()");

        // Looked up by hash on every bearer request, like Session.
        modelBuilder.Entity<ApiToken>()
            .HasIndex(t => t.TokenHash)
            .IsUnique();

        modelBuilder.Entity<ApiToken>()
            .HasOne<User>()
            .WithMany()
            .HasForeignKey(t => t.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // The minting admin may be deleted later; the token is the service account's, not theirs.
        modelBuilder.Entity<ApiToken>()
            .HasOne<User>()
            .WithMany()
            .HasForeignKey(t => t.CreatedByUserId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<ApiToken>()
            .Property(t => t.CreatedAt)
            .HasDefaultValueSql("now()");

        modelBuilder.Entity<ApiTokenPermission>()
            .HasKey(p => new { p.ApiTokenId, p.Permission });

        modelBuilder.Entity<ApiToken>()
            .HasMany(t => t.Permissions)
            .WithOne()
            .HasForeignKey(p => p.ApiTokenId)
            .OnDelete(DeleteBehavior.Cascade);

        // Attribution survives the account: deleting a user leaves their logged events in
        // place with CreatedByUserId nulled, rather than cascading away the maintenance
        // history — the history is the point of the app, the account is bookkeeping.
        modelBuilder.Entity<MaintenanceEvent>()
            .HasOne<User>()
            .WithMany()
            .HasForeignKey(e => e.CreatedByUserId)
            .OnDelete(DeleteBehavior.SetNull);

        // Single-row, like AppSettings, but deliberately NOT seeded: a HasData row would
        // bake one label-signing key into the migration and every deployment would share
        // it, making every printed label forgeable by anyone with the source. LabelSigner
        // generates it on first use instead.
        modelBuilder.Entity<ServerSecret>()
            .Property(s => s.Id)
            .ValueGeneratedNever();

        SeedRoles(modelBuilder);
    }

    // What the Label scan role starts with — and, before it existed, what Anonymous was seeded
    // with. The SplitLabelScanRole migration compares Anonymous against exactly this set.
    public static readonly string[] LabelScanDefaults =
    [
        Permissions.EquipmentRead,
        Permissions.EventsRead,
        Permissions.EventsCreate,
        Permissions.RulesRead,
    ];

    // The five roles every install starts with, and their grants.
    //
    // Grants are computed from the Permissions catalogue rather than written out as ~90
    // literal rows: the seed then cannot drift out of sync with the catalogue, and adding a
    // permission is one edit rather than two. It stays deterministic, so migrations only
    // change when the intent does.
    private static void SeedRoles(ModelBuilder modelBuilder)
    {
        var admin = new Role
        {
            Id = SeededRoles.Admin, Name = "Admin",
            IsSystem = true, SortOrder = 1,
        };
        var member = new Role
        {
            Id = SeededRoles.Member, Name = "Member",
            IsDefaultForNewUsers = true, SortOrder = 2,
        };
        var viewer = new Role
        {
            Id = SeededRoles.Viewer, Name = "Viewer",
            SortOrder = 3,
        };
        var anonymous = new Role
        {
            Id = SeededRoles.Anonymous, Name = "Anonymous",
            IsSystem = true, IsAnonymous = true, SortOrder = 4,
        };
        var labelScan = new Role
        {
            Id = SeededRoles.LabelScan, Name = "Label scan",
            IsSystem = true, IsLabelScan = true, SortOrder = 5,
        };

        modelBuilder.Entity<Role>().HasData(admin, member, viewer, anonymous, labelScan);

        // Admin: everything. Member: everything day-to-day, but not administering the app.
        // Viewer: read-only, and not the sensitive documents. Anonymous: nothing — not signing
        // in grants nothing anywhere. Label scan: exactly enough to log maintenance on the
        // scanned item and see what was logged there.
        var adminGrants = Permissions.AllKeys;

        // Tokens and the API docs are opt-in beyond Admin: both are about scripting the app,
        // which an admin should hand out deliberately rather than every member inheriting.
        var memberGrants = Permissions.AllKeys
            .Except([
                Permissions.UsersManage, Permissions.RolesManage, Permissions.SettingsManage,
                Permissions.TokensPersonal, Permissions.ApiDocs,
                // History is the point of the app: removing it is an admin's call by default.
                Permissions.EventsDelete,
            ]);

        string[] viewerGrants =
        [
            Permissions.EquipmentRead, Permissions.EquipmentList,
            Permissions.EventsRead,
            Permissions.RulesRead,
            Permissions.StorageRead,
            Permissions.PartsRead, Permissions.PartsList,
            Permissions.DocumentsRead, Permissions.DocumentsList, Permissions.DocumentsDownload,
            Permissions.CategoriesRead,
            Permissions.LinksRead,
            Permissions.SettingsRead,
            Permissions.MetersRead,
        ];

        modelBuilder.Entity<RolePermission>().HasData(
            Grants(admin.Id, adminGrants)
                .Concat(Grants(member.Id, memberGrants))
                .Concat(Grants(viewer.Id, viewerGrants))
                .Concat(Grants(labelScan.Id, LabelScanDefaults))
                .ToArray());

        static IEnumerable<RolePermission> Grants(Guid roleId, IEnumerable<string> permissions) =>
            permissions.OrderBy(p => p, StringComparer.Ordinal)
                .Select(p => new RolePermission { RoleId = roleId, Permission = p });
    }
}

// Fixed ids for the seeded roles, so code and migrations can refer to them.
public static class SeededRoles
{
    public static readonly Guid Admin = new("a0000000-0000-0000-0000-000000000001");
    public static readonly Guid Member = new("a0000000-0000-0000-0000-000000000002");
    public static readonly Guid Viewer = new("a0000000-0000-0000-0000-000000000003");
    public static readonly Guid Anonymous = new("a0000000-0000-0000-0000-000000000004");
    public static readonly Guid LabelScan = new("a0000000-0000-0000-0000-000000000005");
}
