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
    }
}
