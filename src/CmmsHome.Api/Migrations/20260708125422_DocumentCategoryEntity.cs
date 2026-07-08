using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CmmsHome.Api.Migrations
{
    /// <inheritdoc />
    public partial class DocumentCategoryEntity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. New managed-category table.
            migrationBuilder.CreateTable(
                name: "DocumentCategories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Sensitive = table.Column<bool>(type: "boolean", nullable: false),
                    Color = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DocumentCategories", x => x.Id);
                });

            // 2. Seed the former enum values (fixed IDs so existing docs remap; Receipt/Invoice sensitive).
            migrationBuilder.Sql(
                "INSERT INTO \"DocumentCategories\" (\"Id\",\"Name\",\"Sensitive\",\"Color\") VALUES " +
                "('11111111-1111-1111-1111-111111111111','Manual',false,'#3b82f6')," +
                "('22222222-2222-2222-2222-222222222222','Warranty',false,'#22c55e')," +
                "('33333333-3333-3333-3333-333333333333','Receipt',true,'#f59e0b')," +
                "('44444444-4444-4444-4444-444444444444','Invoice',true,'#a855f7')," +
                "('55555555-5555-5555-5555-555555555555','Photo',false,'#14b8a6')," +
                "('66666666-6666-6666-6666-666666666666','Other',false,'#64748b');");

            // 3. Add the FK column and remap existing documents from the old enum int.
            migrationBuilder.AddColumn<Guid>(
                name: "CategoryId", table: "Documents", type: "uuid", nullable: true);
            migrationBuilder.Sql(
                "UPDATE \"Documents\" SET \"CategoryId\" = CASE \"Category\" " +
                "WHEN 0 THEN '11111111-1111-1111-1111-111111111111'::uuid " +
                "WHEN 1 THEN '22222222-2222-2222-2222-222222222222'::uuid " +
                "WHEN 2 THEN '33333333-3333-3333-3333-333333333333'::uuid " +
                "WHEN 3 THEN '44444444-4444-4444-4444-444444444444'::uuid " +
                "WHEN 4 THEN '55555555-5555-5555-5555-555555555555'::uuid " +
                "WHEN 5 THEN '66666666-6666-6666-6666-666666666666'::uuid END " +
                "WHERE \"Category\" IS NOT NULL;");

            migrationBuilder.DropColumn(name: "Category", table: "Documents");

            migrationBuilder.CreateIndex(
                name: "IX_Documents_CategoryId", table: "Documents", column: "CategoryId");
            migrationBuilder.AddForeignKey(
                name: "FK_Documents_DocumentCategories_CategoryId",
                table: "Documents", column: "CategoryId",
                principalTable: "DocumentCategories", principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Documents_DocumentCategories_CategoryId",
                table: "Documents");

            migrationBuilder.DropTable(
                name: "DocumentCategories");

            migrationBuilder.DropIndex(
                name: "IX_Documents_CategoryId",
                table: "Documents");

            migrationBuilder.DropColumn(
                name: "CategoryId",
                table: "Documents");

            migrationBuilder.AddColumn<int>(
                name: "Category",
                table: "Documents",
                type: "integer",
                nullable: true);
        }
    }
}
