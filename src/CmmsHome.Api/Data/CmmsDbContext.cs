using Microsoft.EntityFrameworkCore;
using CmmsHome.Api.Models;

namespace CmmsHome.Api.Data;

public class CmmsDbContext(DbContextOptions<CmmsDbContext> options) : DbContext(options)
{
    public DbSet<Asset> Assets => Set<Asset>();
    public DbSet<MaintenanceEvent> Events => Set<MaintenanceEvent>();
    public DbSet<MaintenanceRule> Rules => Set<MaintenanceRule>();
    public DbSet<Location> Locations => Set<Location>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Shelf> Shelves => Set<Shelf>();
    public DbSet<StorageBox> Boxes => Set<StorageBox>();
    public DbSet<Part> Parts => Set<Part>();
    public DbSet<PartUsage> PartUsages => Set<PartUsage>();
    public DbSet<PartCategory> PartCategories => Set<PartCategory>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Asset>()
            .Property(a => a.CreatedAt)
            .HasDefaultValueSql("now()");

        modelBuilder.Entity<MaintenanceEvent>()
            .Property(e => e.CreatedAt)
            .HasDefaultValueSql("now()");

        modelBuilder.Entity<Asset>()
            .HasMany(a => a.Events)
            .WithOne(e => e.Asset)
            .HasForeignKey(e => e.AssetId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Asset>()
            .HasMany(a => a.Rules)
            .WithOne(r => r.Asset)
            .HasForeignKey(r => r.AssetId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Asset>()
            .HasOne(a => a.Location)
            .WithMany()
            .HasForeignKey(a => a.LocationId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<Asset>()
            .HasOne(a => a.Category)
            .WithMany()
            .HasForeignKey(a => a.CategoryId)
            .OnDelete(DeleteBehavior.SetNull);

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

        modelBuilder.Entity<Shelf>()
            .HasOne(s => s.Location)
            .WithMany()
            .HasForeignKey(s => s.LocationId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<StorageBox>()
            .HasOne(b => b.Shelf)
            .WithMany()
            .HasForeignKey(b => b.ShelfId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<StorageBox>()
            .HasOne(b => b.Location)
            .WithMany()
            .HasForeignKey(b => b.LocationId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<Part>()
            .HasOne(p => p.Box)
            .WithMany()
            .HasForeignKey(p => p.BoxId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<Part>()
            .HasOne(p => p.Shelf)
            .WithMany()
            .HasForeignKey(p => p.ShelfId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<Part>()
            .HasOne(p => p.Location)
            .WithMany()
            .HasForeignKey(p => p.LocationId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<Part>()
            .HasOne(p => p.Asset)
            .WithMany()
            .HasForeignKey(p => p.AssetId)
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
    }
}
