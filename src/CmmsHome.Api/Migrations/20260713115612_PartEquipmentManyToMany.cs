using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CmmsHome.Api.Migrations
{
    /// <inheritdoc />
    public partial class PartEquipmentManyToMany : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Create the join table.
            migrationBuilder.CreateTable(
                name: "PartEquipment",
                columns: table => new
                {
                    PartId = table.Column<Guid>(type: "uuid", nullable: false),
                    EquipmentId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PartEquipment", x => new { x.EquipmentId, x.PartId });
                    table.ForeignKey(
                        name: "FK_PartEquipment_Equipment_EquipmentId",
                        column: x => x.EquipmentId,
                        principalTable: "Equipment",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PartEquipment_Parts_PartId",
                        column: x => x.PartId,
                        principalTable: "Parts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PartEquipment_PartId",
                table: "PartEquipment",
                column: "PartId");

            // 2. Copy existing single links into the join table BEFORE dropping the column.
            migrationBuilder.Sql(
                "INSERT INTO \"PartEquipment\" (\"PartId\", \"EquipmentId\") " +
                "SELECT \"Id\", \"EquipmentId\" FROM \"Parts\" WHERE \"EquipmentId\" IS NOT NULL;");

            // 3. Drop the old single FK column.
            migrationBuilder.DropForeignKey(
                name: "FK_Parts_Equipment_EquipmentId",
                table: "Parts");

            migrationBuilder.DropIndex(
                name: "IX_Parts_EquipmentId",
                table: "Parts");

            migrationBuilder.DropColumn(
                name: "EquipmentId",
                table: "Parts");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PartEquipment");

            migrationBuilder.AddColumn<Guid>(
                name: "EquipmentId",
                table: "Parts",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Parts_EquipmentId",
                table: "Parts",
                column: "EquipmentId");

            migrationBuilder.AddForeignKey(
                name: "FK_Parts_Equipment_EquipmentId",
                table: "Parts",
                column: "EquipmentId",
                principalTable: "Equipment",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }
    }
}
