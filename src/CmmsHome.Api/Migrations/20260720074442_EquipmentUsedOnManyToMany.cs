using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CmmsHome.Api.Migrations
{
    /// <inheritdoc />
    public partial class EquipmentUsedOnManyToMany : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Create the self-join table.
            migrationBuilder.CreateTable(
                name: "EquipmentUsedOn",
                columns: table => new
                {
                    EquipmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    UsedOnEquipmentId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EquipmentUsedOn", x => new { x.EquipmentId, x.UsedOnEquipmentId });
                    table.ForeignKey(
                        name: "FK_EquipmentUsedOn_Equipment_EquipmentId",
                        column: x => x.EquipmentId,
                        principalTable: "Equipment",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_EquipmentUsedOn_Equipment_UsedOnEquipmentId",
                        column: x => x.UsedOnEquipmentId,
                        principalTable: "Equipment",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EquipmentUsedOn_UsedOnEquipmentId",
                table: "EquipmentUsedOn",
                column: "UsedOnEquipmentId");

            // 2. Copy existing single links into the join table BEFORE dropping the column.
            migrationBuilder.Sql(
                "INSERT INTO \"EquipmentUsedOn\" (\"EquipmentId\", \"UsedOnEquipmentId\") " +
                "SELECT \"Id\", \"UsedOnEquipmentId\" FROM \"Equipment\" WHERE \"UsedOnEquipmentId\" IS NOT NULL;");

            // 3. Drop the old single self-FK column.
            migrationBuilder.DropForeignKey(
                name: "FK_Equipment_Equipment_UsedOnEquipmentId",
                table: "Equipment");

            migrationBuilder.DropIndex(
                name: "IX_Equipment_UsedOnEquipmentId",
                table: "Equipment");

            migrationBuilder.DropColumn(
                name: "UsedOnEquipmentId",
                table: "Equipment");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EquipmentUsedOn");

            migrationBuilder.AddColumn<Guid>(
                name: "UsedOnEquipmentId",
                table: "Equipment",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Equipment_UsedOnEquipmentId",
                table: "Equipment",
                column: "UsedOnEquipmentId");

            migrationBuilder.AddForeignKey(
                name: "FK_Equipment_Equipment_UsedOnEquipmentId",
                table: "Equipment",
                column: "UsedOnEquipmentId",
                principalTable: "Equipment",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }
    }
}
