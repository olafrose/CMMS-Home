using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CmmsHome.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPartAssetAndCategory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "AssetId",
                table: "Parts",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PartCategoryId",
                table: "Parts",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PartCategories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PartCategories", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Parts_AssetId",
                table: "Parts",
                column: "AssetId");

            migrationBuilder.CreateIndex(
                name: "IX_Parts_PartCategoryId",
                table: "Parts",
                column: "PartCategoryId");

            migrationBuilder.AddForeignKey(
                name: "FK_Parts_Assets_AssetId",
                table: "Parts",
                column: "AssetId",
                principalTable: "Assets",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Parts_PartCategories_PartCategoryId",
                table: "Parts",
                column: "PartCategoryId",
                principalTable: "PartCategories",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Parts_Assets_AssetId",
                table: "Parts");

            migrationBuilder.DropForeignKey(
                name: "FK_Parts_PartCategories_PartCategoryId",
                table: "Parts");

            migrationBuilder.DropTable(
                name: "PartCategories");

            migrationBuilder.DropIndex(
                name: "IX_Parts_AssetId",
                table: "Parts");

            migrationBuilder.DropIndex(
                name: "IX_Parts_PartCategoryId",
                table: "Parts");

            migrationBuilder.DropColumn(
                name: "AssetId",
                table: "Parts");

            migrationBuilder.DropColumn(
                name: "PartCategoryId",
                table: "Parts");
        }
    }
}
