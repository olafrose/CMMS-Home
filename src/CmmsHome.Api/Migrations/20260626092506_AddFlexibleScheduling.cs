using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CmmsHome.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddFlexibleScheduling : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DueWindowUnit",
                table: "Rules",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "DueWindowValue",
                table: "Rules",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "NextDueAt",
                table: "Rules",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ReminderLeadUnit",
                table: "Rules",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "ReminderLeadValue",
                table: "Rules",
                type: "integer",
                nullable: false,
                defaultValue: 30);

            migrationBuilder.AddColumn<int>(
                name: "ScheduleType",
                table: "Rules",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DueWindowUnit",
                table: "Rules");

            migrationBuilder.DropColumn(
                name: "DueWindowValue",
                table: "Rules");

            migrationBuilder.DropColumn(
                name: "NextDueAt",
                table: "Rules");

            migrationBuilder.DropColumn(
                name: "ReminderLeadUnit",
                table: "Rules");

            migrationBuilder.DropColumn(
                name: "ReminderLeadValue",
                table: "Rules");

            migrationBuilder.DropColumn(
                name: "ScheduleType",
                table: "Rules");
        }
    }
}
