using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CmmsHome.Api.Migrations
{
    /// <inheritdoc />
    public partial class PlaceMaintenanceTarget : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<Guid>(
                name: "EquipmentId",
                table: "Rules",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<Guid>(
                name: "StorageLocationId",
                table: "Rules",
                type: "uuid",
                nullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "EquipmentId",
                table: "Events",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<Guid>(
                name: "StorageLocationId",
                table: "Events",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Rules_StorageLocationId",
                table: "Rules",
                column: "StorageLocationId");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Rules_OneTarget",
                table: "Rules",
                sql: "num_nonnulls(\"EquipmentId\", \"StorageLocationId\") = 1");

            migrationBuilder.CreateIndex(
                name: "IX_Events_StorageLocationId",
                table: "Events",
                column: "StorageLocationId");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Events_OneTarget",
                table: "Events",
                sql: "num_nonnulls(\"EquipmentId\", \"StorageLocationId\") = 1");

            migrationBuilder.AddForeignKey(
                name: "FK_Events_StorageLocations_StorageLocationId",
                table: "Events",
                column: "StorageLocationId",
                principalTable: "StorageLocations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Rules_StorageLocations_StorageLocationId",
                table: "Rules",
                column: "StorageLocationId",
                principalTable: "StorageLocations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Events_StorageLocations_StorageLocationId",
                table: "Events");

            migrationBuilder.DropForeignKey(
                name: "FK_Rules_StorageLocations_StorageLocationId",
                table: "Rules");

            migrationBuilder.DropIndex(
                name: "IX_Rules_StorageLocationId",
                table: "Rules");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Rules_OneTarget",
                table: "Rules");

            migrationBuilder.DropIndex(
                name: "IX_Events_StorageLocationId",
                table: "Events");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Events_OneTarget",
                table: "Events");

            // The old schema cannot represent a place-targeted row, so rolling back loses them
            // rather than failing on the NOT NULL below.
            migrationBuilder.Sql("DELETE FROM \"Rules\" WHERE \"EquipmentId\" IS NULL;");
            migrationBuilder.Sql("DELETE FROM \"Events\" WHERE \"EquipmentId\" IS NULL;");

            migrationBuilder.DropColumn(
                name: "StorageLocationId",
                table: "Rules");

            migrationBuilder.DropColumn(
                name: "StorageLocationId",
                table: "Events");

            migrationBuilder.AlterColumn<Guid>(
                name: "EquipmentId",
                table: "Rules",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "EquipmentId",
                table: "Events",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);
        }
    }
}
