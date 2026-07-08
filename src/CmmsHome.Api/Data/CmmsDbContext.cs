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
    public DbSet<PartUsage> PartUsages => Set<PartUsage>();
    public DbSet<PartCategory> PartCategories => Set<PartCategory>();
    public DbSet<Document> Documents => Set<Document>();
    public DbSet<DocumentLink> DocumentLinks => Set<DocumentLink>();

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

        // Optional "used on / services" self-link.
        modelBuilder.Entity<Equipment>()
            .HasOne(e => e.UsedOnEquipment)
            .WithMany()
            .HasForeignKey(e => e.UsedOnEquipmentId)
            .OnDelete(DeleteBehavior.SetNull);

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

        modelBuilder.Entity<Part>()
            .HasOne(p => p.Equipment)
            .WithMany()
            .HasForeignKey(p => p.EquipmentId)
            .OnDelete(DeleteBehavior.SetNull);

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
    }
}
