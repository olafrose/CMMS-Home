using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CmmsHome.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddIntervalUnit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "IntervalDays",
                table: "Rules",
                newName: "IntervalValue");

            migrationBuilder.AddColumn<int>(
                name: "IntervalUnit",
                table: "Rules",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IntervalUnit",
                table: "Rules");

            migrationBuilder.RenameColumn(
                name: "IntervalValue",
                table: "Rules",
                newName: "IntervalDays");
        }
    }
}
