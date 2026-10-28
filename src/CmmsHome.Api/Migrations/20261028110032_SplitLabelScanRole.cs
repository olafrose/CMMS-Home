using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace CmmsHome.Api.Migrations
{
    /// <inheritdoc />
    public partial class SplitLabelScanRole : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Hand-edited. EF generated four unconditional deletes of Anonymous's seeded grants,
            // which would also strip them from an install whose admin had *widened* Anonymous
            // on purpose. Anonymous is emptied only if it still holds exactly the old seeded
            // set — then those rights move to the new Label scan role below, which is where
            // they always belonged. Anything an admin changed is theirs and stays.
            migrationBuilder.Sql("""
                DELETE FROM "RolePermissions"
                WHERE "RoleId" = 'a0000000-0000-0000-0000-000000000004'
                  AND (SELECT array_agg("Permission" ORDER BY "Permission")
                       FROM "RolePermissions" WHERE "RoleId" = 'a0000000-0000-0000-0000-000000000004')
                      = ARRAY['equipment.read', 'events.create', 'events.read', 'rules.read']::text[];
                """);

            migrationBuilder.AddColumn<bool>(
                name: "IsLabelScan",
                table: "Roles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.UpdateData(
                table: "Roles",
                keyColumn: "Id",
                keyValue: new Guid("a0000000-0000-0000-0000-000000000001"),
                column: "IsLabelScan",
                value: false);

            migrationBuilder.UpdateData(
                table: "Roles",
                keyColumn: "Id",
                keyValue: new Guid("a0000000-0000-0000-0000-000000000002"),
                column: "IsLabelScan",
                value: false);

            migrationBuilder.UpdateData(
                table: "Roles",
                keyColumn: "Id",
                keyValue: new Guid("a0000000-0000-0000-0000-000000000003"),
                column: "IsLabelScan",
                value: false);

            migrationBuilder.UpdateData(
                table: "Roles",
                keyColumn: "Id",
                keyValue: new Guid("a0000000-0000-0000-0000-000000000004"),
                column: "IsLabelScan",
                value: false);

            migrationBuilder.InsertData(
                table: "Roles",
                columns: new[] { "Id", "IsAnonymous", "IsDefaultForNewUsers", "IsLabelScan", "IsSystem", "Name", "SortOrder" },
                values: new object[] { new Guid("a0000000-0000-0000-0000-000000000005"), false, false, true, true, "Label scan", 5 });

            migrationBuilder.InsertData(
                table: "RolePermissions",
                columns: new[] { "Permission", "RoleId" },
                values: new object[,]
                {
                    { "equipment.read", new Guid("a0000000-0000-0000-0000-000000000005") },
                    { "events.create", new Guid("a0000000-0000-0000-0000-000000000005") },
                    { "events.read", new Guid("a0000000-0000-0000-0000-000000000005") },
                    { "rules.read", new Guid("a0000000-0000-0000-0000-000000000005") }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "RolePermissions",
                keyColumns: new[] { "Permission", "RoleId" },
                keyValues: new object[] { "equipment.read", new Guid("a0000000-0000-0000-0000-000000000005") });

            migrationBuilder.DeleteData(
                table: "RolePermissions",
                keyColumns: new[] { "Permission", "RoleId" },
                keyValues: new object[] { "events.create", new Guid("a0000000-0000-0000-0000-000000000005") });

            migrationBuilder.DeleteData(
                table: "RolePermissions",
                keyColumns: new[] { "Permission", "RoleId" },
                keyValues: new object[] { "events.read", new Guid("a0000000-0000-0000-0000-000000000005") });

            migrationBuilder.DeleteData(
                table: "RolePermissions",
                keyColumns: new[] { "Permission", "RoleId" },
                keyValues: new object[] { "rules.read", new Guid("a0000000-0000-0000-0000-000000000005") });

            migrationBuilder.DeleteData(
                table: "Roles",
                keyColumn: "Id",
                keyValue: new Guid("a0000000-0000-0000-0000-000000000005"));

            migrationBuilder.DropColumn(
                name: "IsLabelScan",
                table: "Roles");

            // Hand-edited: Anonymous may still hold some of these (a widened install), so the
            // restore must not trip over existing rows.
            migrationBuilder.Sql("""
                INSERT INTO "RolePermissions" ("Permission", "RoleId")
                VALUES ('equipment.read', 'a0000000-0000-0000-0000-000000000004'),
                       ('events.create', 'a0000000-0000-0000-0000-000000000004'),
                       ('events.read', 'a0000000-0000-0000-0000-000000000004'),
                       ('rules.read', 'a0000000-0000-0000-0000-000000000004')
                ON CONFLICT DO NOTHING;
                """);
        }
    }
}
