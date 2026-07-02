using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CmmsHome.Api.Migrations
{
    /// <inheritdoc />
    public partial class UnifyStorageLocations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Drop the old placement FKs so we can restructure the columns.
            migrationBuilder.DropForeignKey(name: "FK_Assets_Locations_LocationId", table: "Assets");
            migrationBuilder.DropForeignKey(name: "FK_Parts_Boxes_BoxId", table: "Parts");
            migrationBuilder.DropForeignKey(name: "FK_Parts_Locations_LocationId", table: "Parts");
            migrationBuilder.DropForeignKey(name: "FK_Parts_Shelves_ShelfId", table: "Parts");
            migrationBuilder.DropForeignKey(name: "FK_Tools_Boxes_BoxId", table: "Tools");
            migrationBuilder.DropForeignKey(name: "FK_Tools_Locations_LocationId", table: "Tools");
            migrationBuilder.DropForeignKey(name: "FK_Tools_Shelves_ShelfId", table: "Tools");

            // 2. Create the unified, self-referencing storage hierarchy.
            migrationBuilder.CreateTable(
                name: "StorageLocations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    ParentId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StorageLocations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StorageLocations_StorageLocations_ParentId",
                        column: x => x.ParentId,
                        principalTable: "StorageLocations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StorageLocations_ParentId",
                table: "StorageLocations",
                column: "ParentId");

            // 3. Fold existing Locations -> Shelves -> Boxes into StorageLocations,
            //    preserving IDs (so item placements remap without lookups). Order
            //    matters for the self-referencing parent FK.
            migrationBuilder.Sql(
                "INSERT INTO \"StorageLocations\" (\"Id\", \"Name\", \"ParentId\") " +
                "SELECT \"Id\", \"Name\", NULL FROM \"Locations\";");
            migrationBuilder.Sql(
                "INSERT INTO \"StorageLocations\" (\"Id\", \"Name\", \"ParentId\") " +
                "SELECT \"Id\", \"Name\", \"LocationId\" FROM \"Shelves\";");
            migrationBuilder.Sql(
                "INSERT INTO \"StorageLocations\" (\"Id\", \"Name\", \"ParentId\") " +
                "SELECT \"Id\", \"Name\", COALESCE(\"ShelfId\", \"LocationId\") FROM \"Boxes\";");

            // 4. Assets: single source (LocationId) -> just rename to StorageLocationId.
            migrationBuilder.RenameColumn(name: "LocationId", table: "Assets", newName: "StorageLocationId");
            migrationBuilder.RenameIndex(name: "IX_Assets_LocationId", table: "Assets", newName: "IX_Assets_StorageLocationId");

            // 5. Parts: collapse the Box/Shelf/Location triple into one column.
            migrationBuilder.AddColumn<Guid>(name: "StorageLocationId", table: "Parts", type: "uuid", nullable: true);
            migrationBuilder.Sql("UPDATE \"Parts\" SET \"StorageLocationId\" = COALESCE(\"BoxId\", \"ShelfId\", \"LocationId\");");
            migrationBuilder.DropIndex(name: "IX_Parts_BoxId", table: "Parts");
            migrationBuilder.DropIndex(name: "IX_Parts_ShelfId", table: "Parts");
            migrationBuilder.DropIndex(name: "IX_Parts_LocationId", table: "Parts");
            migrationBuilder.DropColumn(name: "BoxId", table: "Parts");
            migrationBuilder.DropColumn(name: "ShelfId", table: "Parts");
            migrationBuilder.DropColumn(name: "LocationId", table: "Parts");
            migrationBuilder.CreateIndex(name: "IX_Parts_StorageLocationId", table: "Parts", column: "StorageLocationId");

            // 6. Tools: same collapse.
            migrationBuilder.AddColumn<Guid>(name: "StorageLocationId", table: "Tools", type: "uuid", nullable: true);
            migrationBuilder.Sql("UPDATE \"Tools\" SET \"StorageLocationId\" = COALESCE(\"BoxId\", \"ShelfId\", \"LocationId\");");
            migrationBuilder.DropIndex(name: "IX_Tools_BoxId", table: "Tools");
            migrationBuilder.DropIndex(name: "IX_Tools_ShelfId", table: "Tools");
            migrationBuilder.DropIndex(name: "IX_Tools_LocationId", table: "Tools");
            migrationBuilder.DropColumn(name: "BoxId", table: "Tools");
            migrationBuilder.DropColumn(name: "ShelfId", table: "Tools");
            migrationBuilder.DropColumn(name: "LocationId", table: "Tools");
            migrationBuilder.CreateIndex(name: "IX_Tools_StorageLocationId", table: "Tools", column: "StorageLocationId");

            // 7. Drop the old tables now that their rows live in StorageLocations.
            migrationBuilder.DropTable(name: "Boxes");
            migrationBuilder.DropTable(name: "Shelves");
            migrationBuilder.DropTable(name: "Locations");

            // 8. Wire the single placement FK on each item type.
            migrationBuilder.AddForeignKey(
                name: "FK_Assets_StorageLocations_StorageLocationId", table: "Assets",
                column: "StorageLocationId", principalTable: "StorageLocations", principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
            migrationBuilder.AddForeignKey(
                name: "FK_Parts_StorageLocations_StorageLocationId", table: "Parts",
                column: "StorageLocationId", principalTable: "StorageLocations", principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
            migrationBuilder.AddForeignKey(
                name: "FK_Tools_StorageLocations_StorageLocationId", table: "Tools",
                column: "StorageLocationId", principalTable: "StorageLocations", principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        // NOTE: merging Box/Shelf/Location into one hierarchy is inherently lossy to
        // reverse (a freestanding box and a shelf both become depth-2 nodes). This Down
        // restores the schema and rebuilds Locations/Shelves/Boxes heuristically
        // (root = Location, child-of-root = Shelf, deeper = Box), nulling any item
        // placement that can't be mapped so no FK is violated. Restore from a backup
        // for a faithful rollback.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(name: "FK_Assets_StorageLocations_StorageLocationId", table: "Assets");
            migrationBuilder.DropForeignKey(name: "FK_Parts_StorageLocations_StorageLocationId", table: "Parts");
            migrationBuilder.DropForeignKey(name: "FK_Tools_StorageLocations_StorageLocationId", table: "Tools");

            migrationBuilder.CreateTable(
                name: "Locations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table => table.PrimaryKey("PK_Locations", x => x.Id));

            migrationBuilder.CreateTable(
                name: "Shelves",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    LocationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Shelves", x => x.Id);
                    table.ForeignKey("FK_Shelves_Locations_LocationId", x => x.LocationId, "Locations", "Id", onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Boxes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    LocationId = table.Column<Guid>(type: "uuid", nullable: true),
                    ShelfId = table.Column<Guid>(type: "uuid", nullable: true),
                    Name = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Boxes", x => x.Id);
                    table.ForeignKey("FK_Boxes_Locations_LocationId", x => x.LocationId, "Locations", "Id", onDelete: ReferentialAction.SetNull);
                    table.ForeignKey("FK_Boxes_Shelves_ShelfId", x => x.ShelfId, "Shelves", "Id", onDelete: ReferentialAction.SetNull);
                });

            // Rebuild the three tables from the hierarchy (heuristic classification).
            migrationBuilder.Sql(
                "INSERT INTO \"Locations\" (\"Id\", \"Name\") " +
                "SELECT \"Id\", \"Name\" FROM \"StorageLocations\" WHERE \"ParentId\" IS NULL;");
            migrationBuilder.Sql(
                "INSERT INTO \"Shelves\" (\"Id\", \"Name\", \"LocationId\") " +
                "SELECT s.\"Id\", s.\"Name\", s.\"ParentId\" FROM \"StorageLocations\" s " +
                "JOIN \"StorageLocations\" p ON s.\"ParentId\" = p.\"Id\" WHERE p.\"ParentId\" IS NULL;");
            migrationBuilder.Sql(
                "INSERT INTO \"Boxes\" (\"Id\", \"Name\", \"ShelfId\", \"LocationId\") " +
                "SELECT s.\"Id\", s.\"Name\", s.\"ParentId\", NULL FROM \"StorageLocations\" s " +
                "JOIN \"StorageLocations\" p ON s.\"ParentId\" = p.\"Id\" WHERE p.\"ParentId\" IS NOT NULL;");

            // Assets: rename back; null any placement that isn't a (rebuilt) Location.
            migrationBuilder.RenameColumn(name: "StorageLocationId", table: "Assets", newName: "LocationId");
            migrationBuilder.RenameIndex(name: "IX_Assets_StorageLocationId", table: "Assets", newName: "IX_Assets_LocationId");
            migrationBuilder.Sql("UPDATE \"Assets\" SET \"LocationId\" = NULL WHERE \"LocationId\" NOT IN (SELECT \"Id\" FROM \"Locations\");");

            // Parts: restore the triple, mapping the single id into whichever table it landed in.
            migrationBuilder.DropIndex(name: "IX_Parts_StorageLocationId", table: "Parts");
            migrationBuilder.AddColumn<Guid>(name: "BoxId", table: "Parts", type: "uuid", nullable: true);
            migrationBuilder.AddColumn<Guid>(name: "ShelfId", table: "Parts", type: "uuid", nullable: true);
            migrationBuilder.AddColumn<Guid>(name: "LocationId", table: "Parts", type: "uuid", nullable: true);
            migrationBuilder.Sql("UPDATE \"Parts\" SET \"BoxId\" = \"StorageLocationId\" WHERE \"StorageLocationId\" IN (SELECT \"Id\" FROM \"Boxes\");");
            migrationBuilder.Sql("UPDATE \"Parts\" SET \"ShelfId\" = \"StorageLocationId\" WHERE \"StorageLocationId\" IN (SELECT \"Id\" FROM \"Shelves\");");
            migrationBuilder.Sql("UPDATE \"Parts\" SET \"LocationId\" = \"StorageLocationId\" WHERE \"StorageLocationId\" IN (SELECT \"Id\" FROM \"Locations\");");
            migrationBuilder.DropColumn(name: "StorageLocationId", table: "Parts");
            migrationBuilder.CreateIndex(name: "IX_Parts_BoxId", table: "Parts", column: "BoxId");
            migrationBuilder.CreateIndex(name: "IX_Parts_ShelfId", table: "Parts", column: "ShelfId");
            migrationBuilder.CreateIndex(name: "IX_Parts_LocationId", table: "Parts", column: "LocationId");

            // Tools: same.
            migrationBuilder.DropIndex(name: "IX_Tools_StorageLocationId", table: "Tools");
            migrationBuilder.AddColumn<Guid>(name: "BoxId", table: "Tools", type: "uuid", nullable: true);
            migrationBuilder.AddColumn<Guid>(name: "ShelfId", table: "Tools", type: "uuid", nullable: true);
            migrationBuilder.AddColumn<Guid>(name: "LocationId", table: "Tools", type: "uuid", nullable: true);
            migrationBuilder.Sql("UPDATE \"Tools\" SET \"BoxId\" = \"StorageLocationId\" WHERE \"StorageLocationId\" IN (SELECT \"Id\" FROM \"Boxes\");");
            migrationBuilder.Sql("UPDATE \"Tools\" SET \"ShelfId\" = \"StorageLocationId\" WHERE \"StorageLocationId\" IN (SELECT \"Id\" FROM \"Shelves\");");
            migrationBuilder.Sql("UPDATE \"Tools\" SET \"LocationId\" = \"StorageLocationId\" WHERE \"StorageLocationId\" IN (SELECT \"Id\" FROM \"Locations\");");
            migrationBuilder.DropColumn(name: "StorageLocationId", table: "Tools");
            migrationBuilder.CreateIndex(name: "IX_Tools_BoxId", table: "Tools", column: "BoxId");
            migrationBuilder.CreateIndex(name: "IX_Tools_ShelfId", table: "Tools", column: "ShelfId");
            migrationBuilder.CreateIndex(name: "IX_Tools_LocationId", table: "Tools", column: "LocationId");

            migrationBuilder.CreateIndex(name: "IX_Boxes_LocationId", table: "Boxes", column: "LocationId");
            migrationBuilder.CreateIndex(name: "IX_Boxes_ShelfId", table: "Boxes", column: "ShelfId");
            migrationBuilder.CreateIndex(name: "IX_Shelves_LocationId", table: "Shelves", column: "LocationId");

            migrationBuilder.DropTable(name: "StorageLocations");

            migrationBuilder.AddForeignKey("FK_Assets_Locations_LocationId", "Assets", "LocationId", "Locations", principalColumn: "Id", onDelete: ReferentialAction.SetNull);
            migrationBuilder.AddForeignKey("FK_Parts_Boxes_BoxId", "Parts", "BoxId", "Boxes", principalColumn: "Id", onDelete: ReferentialAction.SetNull);
            migrationBuilder.AddForeignKey("FK_Parts_Locations_LocationId", "Parts", "LocationId", "Locations", principalColumn: "Id", onDelete: ReferentialAction.SetNull);
            migrationBuilder.AddForeignKey("FK_Parts_Shelves_ShelfId", "Parts", "ShelfId", "Shelves", principalColumn: "Id", onDelete: ReferentialAction.SetNull);
            migrationBuilder.AddForeignKey("FK_Tools_Boxes_BoxId", "Tools", "BoxId", "Boxes", principalColumn: "Id", onDelete: ReferentialAction.SetNull);
            migrationBuilder.AddForeignKey("FK_Tools_Locations_LocationId", "Tools", "LocationId", "Locations", principalColumn: "Id", onDelete: ReferentialAction.SetNull);
            migrationBuilder.AddForeignKey("FK_Tools_Shelves_ShelfId", "Tools", "ShelfId", "Shelves", principalColumn: "Id", onDelete: ReferentialAction.SetNull);
        }
    }
}
