using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace CmmsHome.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMeters : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "LastDoneValue",
                table: "Rules",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "MeterId",
                table: "Rules",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "UsageGrace",
                table: "Rules",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "UsageInterval",
                table: "Rules",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "UsageReminderLead",
                table: "Rules",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.CreateTable(
                name: "Meters",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EquipmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Unit = table.Column<string>(type: "text", nullable: false),
                    Offset = table.Column<decimal>(type: "numeric", nullable: false),
                    BaselineAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CurrentValue = table.Column<decimal>(type: "numeric", nullable: true),
                    CurrentReadAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RatePerDay = table.Column<double>(type: "double precision", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Meters", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Meters_Equipment_EquipmentId",
                        column: x => x.EquipmentId,
                        principalTable: "Equipment",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MeterReadings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MeterId = table.Column<Guid>(type: "uuid", nullable: false),
                    RawValue = table.Column<decimal>(type: "numeric", nullable: false),
                    Value = table.Column<decimal>(type: "numeric", nullable: false),
                    ReadAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    RecordedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Source = table.Column<string>(type: "text", nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MeterReadings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MeterReadings_Meters_MeterId",
                        column: x => x.MeterId,
                        principalTable: "Meters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MeterReadings_Users_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.InsertData(
                table: "RolePermissions",
                columns: new[] { "Permission", "RoleId" },
                values: new object[,]
                {
                    { "meters.read", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "meters.record", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "meters.write", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "meters.read", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "meters.record", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "meters.write", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "meters.read", new Guid("a0000000-0000-0000-0000-000000000003") }
                });

            migrationBuilder.CreateIndex(
                name: "IX_Rules_MeterId",
                table: "Rules",
                column: "MeterId");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Rules_UsageMeter",
                table: "Rules",
                sql: "(\"ScheduleType\" = 2) = (\"MeterId\" IS NOT NULL)");

            migrationBuilder.CreateIndex(
                name: "IX_MeterReadings_CreatedByUserId",
                table: "MeterReadings",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_MeterReadings_MeterId_ReadAt",
                table: "MeterReadings",
                columns: new[] { "MeterId", "ReadAt" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Meters_EquipmentId",
                table: "Meters",
                column: "EquipmentId");

            migrationBuilder.AddForeignKey(
                name: "FK_Rules_Meters_MeterId",
                table: "Rules",
                column: "MeterId",
                principalTable: "Meters",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Rules_Meters_MeterId",
                table: "Rules");

            migrationBuilder.DropTable(
                name: "MeterReadings");

            migrationBuilder.DropTable(
                name: "Meters");

            migrationBuilder.DropIndex(
                name: "IX_Rules_MeterId",
                table: "Rules");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Rules_UsageMeter",
                table: "Rules");

            migrationBuilder.DeleteData(
                table: "RolePermissions",
                keyColumns: new[] { "Permission", "RoleId" },
                keyValues: new object[] { "meters.read", new Guid("a0000000-0000-0000-0000-000000000001") });

            migrationBuilder.DeleteData(
                table: "RolePermissions",
                keyColumns: new[] { "Permission", "RoleId" },
                keyValues: new object[] { "meters.record", new Guid("a0000000-0000-0000-0000-000000000001") });

            migrationBuilder.DeleteData(
                table: "RolePermissions",
                keyColumns: new[] { "Permission", "RoleId" },
                keyValues: new object[] { "meters.write", new Guid("a0000000-0000-0000-0000-000000000001") });

            migrationBuilder.DeleteData(
                table: "RolePermissions",
                keyColumns: new[] { "Permission", "RoleId" },
                keyValues: new object[] { "meters.read", new Guid("a0000000-0000-0000-0000-000000000002") });

            migrationBuilder.DeleteData(
                table: "RolePermissions",
                keyColumns: new[] { "Permission", "RoleId" },
                keyValues: new object[] { "meters.record", new Guid("a0000000-0000-0000-0000-000000000002") });

            migrationBuilder.DeleteData(
                table: "RolePermissions",
                keyColumns: new[] { "Permission", "RoleId" },
                keyValues: new object[] { "meters.write", new Guid("a0000000-0000-0000-0000-000000000002") });

            migrationBuilder.DeleteData(
                table: "RolePermissions",
                keyColumns: new[] { "Permission", "RoleId" },
                keyValues: new object[] { "meters.read", new Guid("a0000000-0000-0000-0000-000000000003") });

            migrationBuilder.DropColumn(
                name: "LastDoneValue",
                table: "Rules");

            migrationBuilder.DropColumn(
                name: "MeterId",
                table: "Rules");

            migrationBuilder.DropColumn(
                name: "UsageGrace",
                table: "Rules");

            migrationBuilder.DropColumn(
                name: "UsageInterval",
                table: "Rules");

            migrationBuilder.DropColumn(
                name: "UsageReminderLead",
                table: "Rules");
        }
    }
}
