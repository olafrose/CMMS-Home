using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CmmsHome.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCategories : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Categories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Categories", x => x.Id);
                });

            // Migrate existing category strings into the new Categories table
            migrationBuilder.Sql("""
                INSERT INTO "Categories" ("Id", "Name")
                SELECT gen_random_uuid(), "Category"
                FROM "Assets"
                WHERE "Category" IS NOT NULL AND "Category" <> ''
                GROUP BY "Category";
                """);

            migrationBuilder.AddColumn<Guid>(
                name: "CategoryId",
                table: "Assets",
                type: "uuid",
                nullable: true);

            // Point each asset at its matching category row
            migrationBuilder.Sql("""
                UPDATE "Assets"
                SET "CategoryId" = c."Id"
                FROM "Categories" c
                WHERE "Assets"."Category" = c."Name";
                """);

            migrationBuilder.DropColumn(
                name: "Category",
                table: "Assets");

            migrationBuilder.CreateIndex(
                name: "IX_Assets_CategoryId",
                table: "Assets",
                column: "CategoryId");

            migrationBuilder.AddForeignKey(
                name: "FK_Assets_Categories_CategoryId",
                table: "Assets",
                column: "CategoryId",
                principalTable: "Categories",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Restore the Category string column first so we can populate it
            migrationBuilder.AddColumn<string>(
                name: "Category",
                table: "Assets",
                type: "text",
                nullable: true);

            // Copy category names back before dropping the FK relationship
            migrationBuilder.Sql("""
                UPDATE "Assets"
                SET "Category" = c."Name"
                FROM "Categories" c
                WHERE "Assets"."CategoryId" = c."Id";
                """);

            migrationBuilder.DropForeignKey(
                name: "FK_Assets_Categories_CategoryId",
                table: "Assets");

            migrationBuilder.DropIndex(
                name: "IX_Assets_CategoryId",
                table: "Assets");

            migrationBuilder.DropColumn(
                name: "CategoryId",
                table: "Assets");

            migrationBuilder.DropTable(
                name: "Categories");
        }
    }
}
