using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace CmmsHome.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddAuthRolesAndPermissions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CreatedByUserId",
                table: "Events",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Roles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    IsSystem = table.Column<bool>(type: "boolean", nullable: false),
                    IsAnonymous = table.Column<bool>(type: "boolean", nullable: false),
                    IsDefaultForNewUsers = table.Column<bool>(type: "boolean", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Roles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ServerSecrets",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false),
                    LabelSigningKey = table.Column<string>(type: "text", nullable: false),
                    RotatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ServerSecrets", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Username = table.Column<string>(type: "text", nullable: false),
                    DisplayName = table.Column<string>(type: "text", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    LastLoginAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "RolePermissions",
                columns: table => new
                {
                    RoleId = table.Column<Guid>(type: "uuid", nullable: false),
                    Permission = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RolePermissions", x => new { x.RoleId, x.Permission });
                    table.ForeignKey(
                        name: "FK_RolePermissions_Roles_RoleId",
                        column: x => x.RoleId,
                        principalTable: "Roles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Sessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    TokenHash = table.Column<string>(type: "text", nullable: false),
                    UserIdentityId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LastSeenAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UserAgent = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Sessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Sessions_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "UserIdentities",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Provider = table.Column<string>(type: "text", nullable: false),
                    Subject = table.Column<string>(type: "text", nullable: false),
                    PasswordHash = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    LastUsedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserIdentities", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserIdentities_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "UserRoles",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RoleId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserRoles", x => new { x.RoleId, x.UserId });
                    table.ForeignKey(
                        name: "FK_UserRoles_Roles_RoleId",
                        column: x => x.RoleId,
                        principalTable: "Roles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_UserRoles_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                table: "Roles",
                columns: new[] { "Id", "IsAnonymous", "IsDefaultForNewUsers", "IsSystem", "Name", "SortOrder" },
                values: new object[,]
                {
                    { new Guid("a0000000-0000-0000-0000-000000000001"), false, false, true, "Admin", 1 },
                    { new Guid("a0000000-0000-0000-0000-000000000002"), false, true, false, "Member", 2 },
                    { new Guid("a0000000-0000-0000-0000-000000000003"), false, false, false, "Viewer", 3 },
                    { new Guid("a0000000-0000-0000-0000-000000000004"), true, false, true, "Anonymous", 4 }
                });

            migrationBuilder.InsertData(
                table: "RolePermissions",
                columns: new[] { "Permission", "RoleId" },
                values: new object[,]
                {
                    { "categories.manage", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "categories.read", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "documents.classify", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "documents.delete", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "documents.download", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "documents.list", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "documents.read", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "documents.read_sensitive", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "documents.scan", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "documents.upload", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "equipment.delete", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "equipment.lend", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "equipment.list", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "equipment.read", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "equipment.write", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "events.create", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "events.edit", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "events.read", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "links.read", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "links.write", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "parts.consume", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "parts.delete", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "parts.list", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "parts.read", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "parts.write", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "roles.manage", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "rules.delete", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "rules.read", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "rules.write", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "settings.manage", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "settings.read", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "storage.delete", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "storage.read", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "storage.write", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "users.manage", new Guid("a0000000-0000-0000-0000-000000000001") },
                    { "categories.manage", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "categories.read", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "documents.classify", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "documents.delete", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "documents.download", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "documents.list", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "documents.read", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "documents.read_sensitive", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "documents.scan", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "documents.upload", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "equipment.delete", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "equipment.lend", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "equipment.list", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "equipment.read", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "equipment.write", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "events.create", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "events.edit", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "events.read", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "links.read", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "links.write", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "parts.consume", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "parts.delete", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "parts.list", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "parts.read", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "parts.write", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "rules.delete", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "rules.read", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "rules.write", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "settings.read", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "storage.delete", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "storage.read", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "storage.write", new Guid("a0000000-0000-0000-0000-000000000002") },
                    { "categories.read", new Guid("a0000000-0000-0000-0000-000000000003") },
                    { "documents.download", new Guid("a0000000-0000-0000-0000-000000000003") },
                    { "documents.list", new Guid("a0000000-0000-0000-0000-000000000003") },
                    { "documents.read", new Guid("a0000000-0000-0000-0000-000000000003") },
                    { "equipment.list", new Guid("a0000000-0000-0000-0000-000000000003") },
                    { "equipment.read", new Guid("a0000000-0000-0000-0000-000000000003") },
                    { "events.read", new Guid("a0000000-0000-0000-0000-000000000003") },
                    { "links.read", new Guid("a0000000-0000-0000-0000-000000000003") },
                    { "parts.list", new Guid("a0000000-0000-0000-0000-000000000003") },
                    { "parts.read", new Guid("a0000000-0000-0000-0000-000000000003") },
                    { "rules.read", new Guid("a0000000-0000-0000-0000-000000000003") },
                    { "settings.read", new Guid("a0000000-0000-0000-0000-000000000003") },
                    { "storage.read", new Guid("a0000000-0000-0000-0000-000000000003") },
                    { "equipment.read", new Guid("a0000000-0000-0000-0000-000000000004") },
                    { "events.create", new Guid("a0000000-0000-0000-0000-000000000004") },
                    { "events.read", new Guid("a0000000-0000-0000-0000-000000000004") },
                    { "rules.read", new Guid("a0000000-0000-0000-0000-000000000004") }
                });

            migrationBuilder.CreateIndex(
                name: "IX_Events_CreatedByUserId",
                table: "Events",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Roles_Name",
                table: "Roles",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Sessions_TokenHash",
                table: "Sessions",
                column: "TokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Sessions_UserId",
                table: "Sessions",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_UserIdentities_Provider_Subject",
                table: "UserIdentities",
                columns: new[] { "Provider", "Subject" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserIdentities_UserId",
                table: "UserIdentities",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_UserRoles_UserId",
                table: "UserRoles",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_Users_Username",
                table: "Users",
                column: "Username",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Events_Users_CreatedByUserId",
                table: "Events",
                column: "CreatedByUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Events_Users_CreatedByUserId",
                table: "Events");

            migrationBuilder.DropTable(
                name: "RolePermissions");

            migrationBuilder.DropTable(
                name: "ServerSecrets");

            migrationBuilder.DropTable(
                name: "Sessions");

            migrationBuilder.DropTable(
                name: "UserIdentities");

            migrationBuilder.DropTable(
                name: "UserRoles");

            migrationBuilder.DropTable(
                name: "Roles");

            migrationBuilder.DropTable(
                name: "Users");

            migrationBuilder.DropIndex(
                name: "IX_Events_CreatedByUserId",
                table: "Events");

            migrationBuilder.DropColumn(
                name: "CreatedByUserId",
                table: "Events");
        }
    }
}
