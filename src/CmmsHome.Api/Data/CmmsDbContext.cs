using Microsoft.EntityFrameworkCore;
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

        // A document link points at one Equipment or one MaintenanceEvent.
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
    }
}
