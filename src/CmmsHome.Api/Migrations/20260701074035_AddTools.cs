using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CmmsHome.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTools : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ToolCategories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ToolCategories", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Tools",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    AssetId = table.Column<Guid>(type: "uuid", nullable: true),
                    ToolCategoryId = table.Column<Guid>(type: "uuid", nullable: true),
                    BoxId = table.Column<Guid>(type: "uuid", nullable: true),
                    ShelfId = table.Column<Guid>(type: "uuid", nullable: true),
                    LocationId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Tools", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Tools_Assets_AssetId",
                        column: x => x.AssetId,
                        principalTable: "Assets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_Tools_Boxes_BoxId",
                        column: x => x.BoxId,
                        principalTable: "Boxes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_Tools_Locations_LocationId",
                        column: x => x.LocationId,
                        principalTable: "Locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_Tools_Shelves_ShelfId",
                        column: x => x.ShelfId,
                        principalTable: "Shelves",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_Tools_ToolCategories_ToolCategoryId",
                        column: x => x.ToolCategoryId,
                        principalTable: "ToolCategories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
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
                    table.ForeignKey(
                        name: "FK_ToolLoans_Tools_ToolId",
                        column: x => x.ToolId,
                        principalTable: "Tools",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ToolLoans_ToolId",
                table: "ToolLoans",
                column: "ToolId");

            migrationBuilder.CreateIndex(
                name: "IX_Tools_AssetId",
                table: "Tools",
                column: "AssetId");

            migrationBuilder.CreateIndex(
                name: "IX_Tools_BoxId",
                table: "Tools",
                column: "BoxId");

            migrationBuilder.CreateIndex(
                name: "IX_Tools_LocationId",
                table: "Tools",
                column: "LocationId");

            migrationBuilder.CreateIndex(
                name: "IX_Tools_ShelfId",
                table: "Tools",
                column: "ShelfId");

            migrationBuilder.CreateIndex(
                name: "IX_Tools_ToolCategoryId",
                table: "Tools",
                column: "ToolCategoryId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ToolLoans");

            migrationBuilder.DropTable(
                name: "Tools");

            migrationBuilder.DropTable(
                name: "ToolCategories");
        }
    }
}
