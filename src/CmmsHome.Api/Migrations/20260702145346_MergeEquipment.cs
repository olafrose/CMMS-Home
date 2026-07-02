using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CmmsHome.Api.Migrations
{
    /// <inheritdoc />
    public partial class MergeEquipment : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Drop the old maintenance/part FKs to Assets so we can restructure.
            migrationBuilder.DropForeignKey(name: "FK_Events_Assets_AssetId", table: "Events");
            migrationBuilder.DropForeignKey(name: "FK_Parts_Assets_AssetId", table: "Parts");
            migrationBuilder.DropForeignKey(name: "FK_Rules_Assets_AssetId", table: "Rules");

            // 2. Fold tool categories into the shared Categories table (IDs preserved).
            migrationBuilder.Sql(
                "INSERT INTO \"Categories\" (\"Id\", \"Name\") " +
                "SELECT \"Id\", \"Name\" FROM \"ToolCategories\" ON CONFLICT (\"Id\") DO NOTHING;");

            // 3. Create the unified Equipment table.
            migrationBuilder.CreateTable(
                name: "Equipment",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Kind = table.Column<int>(type: "integer", nullable: false),
                    CategoryId = table.Column<Guid>(type: "uuid", nullable: true),
                    StorageLocationId = table.Column<Guid>(type: "uuid", nullable: true),
                    ImageUrl = table.Column<string>(type: "text", nullable: true),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    UsedOnEquipmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Equipment", x => x.Id);
                    table.ForeignKey("FK_Equipment_Categories_CategoryId", x => x.CategoryId, "Categories", "Id", onDelete: ReferentialAction.SetNull);
                    table.ForeignKey("FK_Equipment_Equipment_UsedOnEquipmentId", x => x.UsedOnEquipmentId, "Equipment", "Id", onDelete: ReferentialAction.SetNull);
                    table.ForeignKey("FK_Equipment_StorageLocations_StorageLocationId", x => x.StorageLocationId, "StorageLocations", "Id", onDelete: ReferentialAction.SetNull);
                });

            // 4. Populate Equipment: assets first (kind 0), then tools (kind 1) whose
            //    UsedOnEquipmentId references those asset rows.
            migrationBuilder.Sql(
                "INSERT INTO \"Equipment\" (\"Id\",\"Name\",\"Kind\",\"CategoryId\",\"StorageLocationId\",\"ImageUrl\",\"Notes\",\"UsedOnEquipmentId\",\"CreatedAt\") " +
                "SELECT \"Id\",\"Name\",0,\"CategoryId\",\"StorageLocationId\",\"ImageUrl\",NULL,NULL,\"CreatedAt\" FROM \"Assets\";");
            migrationBuilder.Sql(
                "INSERT INTO \"Equipment\" (\"Id\",\"Name\",\"Kind\",\"CategoryId\",\"StorageLocationId\",\"ImageUrl\",\"Notes\",\"UsedOnEquipmentId\",\"CreatedAt\") " +
                "SELECT \"Id\",\"Name\",1,\"ToolCategoryId\",\"StorageLocationId\",NULL,\"Notes\",\"AssetId\",now() FROM \"Tools\";");

            // 5. Loans table + migrate open/closed loans.
            migrationBuilder.CreateTable(
                name: "EquipmentLoans",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EquipmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Borrower = table.Column<string>(type: "text", nullable: false),
                    LoanedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    ReturnedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EquipmentLoans", x => x.Id);
                    table.ForeignKey("FK_EquipmentLoans_Equipment_EquipmentId", x => x.EquipmentId, "Equipment", "Id", onDelete: ReferentialAction.Cascade);
                });
            migrationBuilder.Sql(
                "INSERT INTO \"EquipmentLoans\" (\"Id\",\"EquipmentId\",\"Borrower\",\"LoanedAt\",\"ReturnedAt\") " +
                "SELECT \"Id\",\"ToolId\",\"Borrower\",\"LoanedAt\",\"ReturnedAt\" FROM \"ToolLoans\";");

            // 6. Repoint maintenance + parts from AssetId to EquipmentId (values still valid).
            migrationBuilder.RenameColumn(name: "AssetId", table: "Rules", newName: "EquipmentId");
            migrationBuilder.RenameIndex(name: "IX_Rules_AssetId", table: "Rules", newName: "IX_Rules_EquipmentId");
            migrationBuilder.RenameColumn(name: "AssetId", table: "Parts", newName: "EquipmentId");
            migrationBuilder.RenameIndex(name: "IX_Parts_AssetId", table: "Parts", newName: "IX_Parts_EquipmentId");
            migrationBuilder.RenameColumn(name: "AssetId", table: "Events", newName: "EquipmentId");
            migrationBuilder.RenameIndex(name: "IX_Events_AssetId", table: "Events", newName: "IX_Events_EquipmentId");

            // 7. Indexes + FKs onto Equipment.
            migrationBuilder.CreateIndex(name: "IX_Equipment_CategoryId", table: "Equipment", column: "CategoryId");
            migrationBuilder.CreateIndex(name: "IX_Equipment_StorageLocationId", table: "Equipment", column: "StorageLocationId");
            migrationBuilder.CreateIndex(name: "IX_Equipment_UsedOnEquipmentId", table: "Equipment", column: "UsedOnEquipmentId");
            migrationBuilder.CreateIndex(name: "IX_EquipmentLoans_EquipmentId", table: "EquipmentLoans", column: "EquipmentId");

            migrationBuilder.AddForeignKey("FK_Events_Equipment_EquipmentId", "Events", "EquipmentId", "Equipment", principalColumn: "Id", onDelete: ReferentialAction.Cascade);
            migrationBuilder.AddForeignKey("FK_Parts_Equipment_EquipmentId", "Parts", "EquipmentId", "Equipment", principalColumn: "Id", onDelete: ReferentialAction.SetNull);
            migrationBuilder.AddForeignKey("FK_Rules_Equipment_EquipmentId", "Rules", "EquipmentId", "Equipment", principalColumn: "Id", onDelete: ReferentialAction.Cascade);

            // 8. Drop the old tables now that their data lives in Equipment/EquipmentLoans.
            migrationBuilder.DropTable(name: "ToolLoans");
            migrationBuilder.DropTable(name: "Tools");
            migrationBuilder.DropTable(name: "ToolCategories");
            migrationBuilder.DropTable(name: "Assets");
        }

        /// <inheritdoc />
        // NOTE: the merge enables relationships the old schema forbade (tool maintenance,
        // asset loans) and folds tool categories in irreversibly, so a faithful rollback
        // is impossible. This Down restores the schema and does a best-effort split by
        // Kind, dropping rows that can't be represented (rules/events on tool-only items,
        // loans on asset-only items, tool categories). Restore from a backup for fidelity.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(name: "FK_Events_Equipment_EquipmentId", table: "Events");
            migrationBuilder.DropForeignKey(name: "FK_Parts_Equipment_EquipmentId", table: "Parts");
            migrationBuilder.DropForeignKey(name: "FK_Rules_Equipment_EquipmentId", table: "Rules");

            migrationBuilder.CreateTable(
                name: "Assets",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CategoryId = table.Column<Guid>(type: "uuid", nullable: true),
                    StorageLocationId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    ImageUrl = table.Column<string>(type: "text", nullable: true),
                    Name = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Assets", x => x.Id);
                    table.ForeignKey("FK_Assets_Categories_CategoryId", x => x.CategoryId, "Categories", "Id", onDelete: ReferentialAction.SetNull);
                    table.ForeignKey("FK_Assets_StorageLocations_StorageLocationId", x => x.StorageLocationId, "StorageLocations", "Id", onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "ToolCategories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table => table.PrimaryKey("PK_ToolCategories", x => x.Id));

            migrationBuilder.CreateTable(
                name: "Tools",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AssetId = table.Column<Guid>(type: "uuid", nullable: true),
                    StorageLocationId = table.Column<Guid>(type: "uuid", nullable: true),
                    ToolCategoryId = table.Column<Guid>(type: "uuid", nullable: true),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Notes = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Tools", x => x.Id);
                    table.ForeignKey("FK_Tools_Assets_AssetId", x => x.AssetId, "Assets", "Id", onDelete: ReferentialAction.SetNull);
                    table.ForeignKey("FK_Tools_StorageLocations_StorageLocationId", x => x.StorageLocationId, "StorageLocations", "Id", onDelete: ReferentialAction.SetNull);
                    table.ForeignKey("FK_Tools_ToolCategories_ToolCategoryId", x => x.ToolCategoryId, "ToolCategories", "Id", onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "ToolLoans",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ToolId = table.Column<Guid>(type: "uuid", nullable: false),
                    Borrower = table.Column<string>(type: "text", nullable: false),
                    LoanedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    ReturnedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ToolLoans", x => x.Id);
                    table.ForeignKey("FK_ToolLoans_Tools_ToolId", x => x.ToolId, "Tools", "Id", onDelete: ReferentialAction.Cascade);
                });

            // Best-effort split by Kind (0 asset, 1 tool, 2 both).
            migrationBuilder.Sql(
                "INSERT INTO \"Assets\" (\"Id\",\"CategoryId\",\"StorageLocationId\",\"CreatedAt\",\"ImageUrl\",\"Name\") " +
                "SELECT \"Id\",\"CategoryId\",\"StorageLocationId\",\"CreatedAt\",\"ImageUrl\",\"Name\" FROM \"Equipment\" WHERE \"Kind\" <> 1;");
            migrationBuilder.Sql(
                "INSERT INTO \"Tools\" (\"Id\",\"Name\",\"Notes\",\"StorageLocationId\",\"ToolCategoryId\",\"AssetId\") " +
                "SELECT \"Id\",\"Name\",\"Notes\",\"StorageLocationId\",NULL," +
                "CASE WHEN \"UsedOnEquipmentId\" IN (SELECT \"Id\" FROM \"Assets\") THEN \"UsedOnEquipmentId\" ELSE NULL END " +
                "FROM \"Equipment\" WHERE \"Kind\" <> 0;");
            migrationBuilder.Sql(
                "INSERT INTO \"ToolLoans\" (\"Id\",\"ToolId\",\"Borrower\",\"LoanedAt\",\"ReturnedAt\") " +
                "SELECT \"Id\",\"EquipmentId\",\"Borrower\",\"LoanedAt\",\"ReturnedAt\" FROM \"EquipmentLoans\" " +
                "WHERE \"EquipmentId\" IN (SELECT \"Id\" FROM \"Tools\");");

            // Drop what can't map back to an Asset (tool-only maintenance/parts).
            migrationBuilder.Sql("DELETE FROM \"Rules\" WHERE \"EquipmentId\" NOT IN (SELECT \"Id\" FROM \"Assets\");");
            migrationBuilder.Sql("DELETE FROM \"Events\" WHERE \"EquipmentId\" NOT IN (SELECT \"Id\" FROM \"Assets\");");
            migrationBuilder.Sql("UPDATE \"Parts\" SET \"EquipmentId\" = NULL WHERE \"EquipmentId\" NOT IN (SELECT \"Id\" FROM \"Assets\");");

            migrationBuilder.DropTable(name: "EquipmentLoans");
            migrationBuilder.DropTable(name: "Equipment");

            migrationBuilder.RenameColumn(name: "EquipmentId", table: "Rules", newName: "AssetId");
            migrationBuilder.RenameIndex(name: "IX_Rules_EquipmentId", table: "Rules", newName: "IX_Rules_AssetId");
            migrationBuilder.RenameColumn(name: "EquipmentId", table: "Parts", newName: "AssetId");
            migrationBuilder.RenameIndex(name: "IX_Parts_EquipmentId", table: "Parts", newName: "IX_Parts_AssetId");
            migrationBuilder.RenameColumn(name: "EquipmentId", table: "Events", newName: "AssetId");
            migrationBuilder.RenameIndex(name: "IX_Events_EquipmentId", table: "Events", newName: "IX_Events_AssetId");

            migrationBuilder.CreateIndex(name: "IX_Assets_CategoryId", table: "Assets", column: "CategoryId");
            migrationBuilder.CreateIndex(name: "IX_Assets_StorageLocationId", table: "Assets", column: "StorageLocationId");
            migrationBuilder.CreateIndex(name: "IX_ToolLoans_ToolId", table: "ToolLoans", column: "ToolId");
            migrationBuilder.CreateIndex(name: "IX_Tools_AssetId", table: "Tools", column: "AssetId");
            migrationBuilder.CreateIndex(name: "IX_Tools_StorageLocationId", table: "Tools", column: "StorageLocationId");
            migrationBuilder.CreateIndex(name: "IX_Tools_ToolCategoryId", table: "Tools", column: "ToolCategoryId");

            migrationBuilder.AddForeignKey("FK_Events_Assets_AssetId", "Events", "AssetId", "Assets", principalColumn: "Id", onDelete: ReferentialAction.Cascade);
            migrationBuilder.AddForeignKey("FK_Parts_Assets_AssetId", "Parts", "AssetId", "Assets", principalColumn: "Id", onDelete: ReferentialAction.SetNull);
            migrationBuilder.AddForeignKey("FK_Rules_Assets_AssetId", "Rules", "AssetId", "Assets", principalColumn: "Id", onDelete: ReferentialAction.Cascade);
        }
    }
}
