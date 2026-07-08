using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CmmsHome.Api.Migrations
{
    /// <inheritdoc />
    public partial class DocumentMovesAndPendingMove : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DocumentMoves",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DocumentId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromPath = table.Column<string>(type: "text", nullable: false),
                    ToPath = table.Column<string>(type: "text", nullable: false),
                    MovedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DocumentMoves", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DocumentMoves_Documents_DocumentId",
                        column: x => x.DocumentId,
                        principalTable: "Documents",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DocumentMoves_DocumentId",
                table: "DocumentMoves",
                column: "DocumentId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DocumentMoves");
        }
    }
}
