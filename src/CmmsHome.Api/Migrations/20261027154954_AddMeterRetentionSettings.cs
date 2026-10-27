using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CmmsHome.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMeterRetentionSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "MeterDailyDays",
                table: "AppSettings",
                type: "integer",
                nullable: false,
                // Hand-edited from 0: a 0-day window would thin everything at once. The
                // UpdateData below sets the seeded row anyway; this covers any other.
                defaultValue: 730);

            migrationBuilder.AddColumn<int>(
                name: "MeterFullDetailDays",
                table: "AppSettings",
                type: "integer",
                nullable: false,
                // Hand-edited from 0: a 0-day window would thin everything at once. The
                // UpdateData below sets the seeded row anyway; this covers any other.
                defaultValue: 90);

            migrationBuilder.AddColumn<int>(
                name: "MeterWeeklyDays",
                table: "AppSettings",
                type: "integer",
                nullable: false,
                // Hand-edited from 0: a 0-day window would thin everything at once. The
                // UpdateData below sets the seeded row anyway; this covers any other.
                defaultValue: 1825);

            migrationBuilder.UpdateData(
                table: "AppSettings",
                keyColumn: "Id",
                keyValue: 1,
                columns: new[] { "MeterDailyDays", "MeterFullDetailDays", "MeterWeeklyDays" },
                values: new object[] { 730, 90, 1825 });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "MeterDailyDays",
                table: "AppSettings");

            migrationBuilder.DropColumn(
                name: "MeterFullDetailDays",
                table: "AppSettings");

            migrationBuilder.DropColumn(
                name: "MeterWeeklyDays",
                table: "AppSettings");
        }
    }
}
