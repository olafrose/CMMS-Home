using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CmmsHome.Api.Migrations
{
    /// <inheritdoc />
    public partial class DocumentLinkPart : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "PartId",
                table: "DocumentLinks",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_DocumentLinks_PartId",
                table: "DocumentLinks",
                column: "PartId");

            migrationBuilder.AddForeignKey(
                name: "FK_DocumentLinks_Parts_PartId",
                table: "DocumentLinks",
                column: "PartId",
                principalTable: "Parts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_DocumentLinks_Parts_PartId",
                table: "DocumentLinks");

            migrationBuilder.DropIndex(
                name: "IX_DocumentLinks_PartId",
                table: "DocumentLinks");

            migrationBuilder.DropColumn(
                name: "PartId",
                table: "DocumentLinks");
        }
    }
}
