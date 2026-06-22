using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CmmsHome.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddRuleName : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Name",
                table: "Rules",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Name",
                table: "Rules");
        }
    }
}
