namespace CmmsHome.Api.Services;

// The permission catalogue: a fixed, code-defined list of capabilities.
//
// Admins decide which roles hold which permissions (the grid at /settings/access); they
// never invent new ones. That is deliberate — a permission only means something because an
// endpoint checks it, so a user-created permission would be a checkbox that does nothing.
// Adding one is a code change; the grid renders whatever is listed here.
//
// Keys are strings rather than enum values because grants are stored as rows: renaming or
// reordering a C# enum member would silently repoint every existing grant in the database.
public static class Permissions
{
    // Equipment. The read/list split is what lets a role — or an anonymous label scan —
    // see one scanned item without being handed the whole inventory.
    public const string EquipmentRead = "equipment.read";
    public const string EquipmentList = "equipment.list";
    public const string EquipmentWrite = "equipment.write";
    public const string EquipmentDelete = "equipment.delete";
    public const string EquipmentLend = "equipment.lend";

    public const string EventsRead = "events.read";
    public const string EventsCreate = "events.create";
    public const string EventsEdit = "events.edit";
    public const string EventsDelete = "events.delete";

    public const string RulesRead = "rules.read";
    public const string RulesWrite = "rules.write";
    public const string RulesDelete = "rules.delete";

    public const string MetersRead = "meters.read";
    public const string MetersRecord = "meters.record";
    public const string MetersWrite = "meters.write";

    public const string StorageRead = "storage.read";
    public const string StorageWrite = "storage.write";
    public const string StorageDelete = "storage.delete";

    public const string PartsRead = "parts.read";
    public const string PartsList = "parts.list";
    public const string PartsWrite = "parts.write";
    public const string PartsDelete = "parts.delete";
    public const string PartsConsume = "parts.consume";

    public const string DocumentsRead = "documents.read";
    public const string DocumentsList = "documents.list";
    public const string DocumentsDownload = "documents.download";
    public const string DocumentsUpload = "documents.upload";
    public const string DocumentsClassify = "documents.classify";
    public const string DocumentsDelete = "documents.delete";
    public const string DocumentsScan = "documents.scan";

    // Additive gate, not an endpoint gate: without it, documents in a Sensitive category
    // are filtered out of lists and 404 on fetch/download. This is the enforcement the
    // DocumentCategory.Sensitive flag has been waiting for.
    public const string DocumentsReadSensitive = "documents.read_sensitive";

    public const string CategoriesRead = "categories.read";
    public const string CategoriesManage = "categories.manage";

    public const string LinksRead = "links.read";
    public const string LinksWrite = "links.write";

    public const string SettingsRead = "settings.read";
    public const string SettingsManage = "settings.manage";

    public const string UsersManage = "users.manage";
    public const string RolesManage = "roles.manage";
    public const string TokensPersonal = "tokens.personal";
    public const string ApiDocs = "api.docs";

    public const string GroupEquipment = "Equipment";
    public const string GroupEvents = "Maintenance history";
    public const string GroupRules = "Schedules";
    public const string GroupMeters = "Meters";
    public const string GroupStorage = "Storage";
    public const string GroupParts = "Parts";
    public const string GroupDocuments = "Documents";
    public const string GroupCategories = "Categories";
    public const string GroupLinks = "Web links";
    public const string GroupSettings = "Settings";
    public const string GroupAdmin = "Administration";

    // Display order is the order of this list; the grid groups by Group, preserving it.
    public static readonly IReadOnlyList<PermissionInfo> All =
    [
        new(EquipmentRead, GroupEquipment, "View one item",
            "Open a single item by its id — the scanned-label case."),
        new(EquipmentList, GroupEquipment, "Browse and search",
            "List and filter the whole inventory."),
        new(EquipmentWrite, GroupEquipment, "Create and edit",
            "Add items and change their details."),
        new(EquipmentDelete, GroupEquipment, "Delete",
            "Remove items, along with their history and schedules."),
        new(EquipmentLend, GroupEquipment, "Lend and return",
            "Check items out to a borrower and take them back."),

        new(EventsRead, GroupEvents, "View history",
            "See logged maintenance, repairs and cleaning."),
        new(EventsCreate, GroupEvents, "Log maintenance",
            "Record a new event. This is the quick-log QR flow."),
        new(EventsEdit, GroupEvents, "Edit history",
            "Change or annotate events already logged."),
        new(EventsDelete, GroupEvents, "Delete history entries",
            "Remove a logged event, e.g. one logged by mistake. Parts it used go back into stock "
            + "and its schedules revert to the previous entry.",
            AllowedForAnonymous: false),

        new(RulesRead, GroupRules, "View schedules",
            "See maintenance schedules and what is due."),
        new(RulesWrite, GroupRules, "Create and edit",
            "Add schedules and change their intervals or due dates."),
        new(RulesDelete, GroupRules, "Delete",
            "Remove schedules."),

        new(MetersRead, GroupMeters, "View meters",
            "See running-hour, mileage and cycle counters and their reading history.",
            AllowedForAnonymous: false),
        new(MetersRecord, GroupMeters, "Record readings",
            "Report a counter's current value. What an integration such as Home Assistant needs.",
            AllowedForAnonymous: false),
        new(MetersWrite, GroupMeters, "Manage meters",
            "Add, rename and delete meters, mark a counter reset or a replaced device, "
            + "and remove a mistaken reading.",
            AllowedForAnonymous: false),

        new(StorageRead, GroupStorage, "View places",
            "Browse the storage tree and see what is stored where."),
        new(StorageWrite, GroupStorage, "Create and edit",
            "Add, rename and move places."),
        new(StorageDelete, GroupStorage, "Delete",
            "Remove places."),

        new(PartsRead, GroupParts, "View one part",
            "Open a single part by its id and see its stock."),
        new(PartsList, GroupParts, "Browse and search",
            "List the whole parts inventory."),
        new(PartsWrite, GroupParts, "Create and edit",
            "Add parts and change stock levels."),
        new(PartsDelete, GroupParts, "Delete",
            "Remove parts."),
        new(PartsConsume, GroupParts, "Record parts used",
            "Attach parts to an event, decrementing stock."),

        new(DocumentsRead, GroupDocuments, "View one document",
            "Open a single document by its id."),
        new(DocumentsList, GroupDocuments, "Browse and search",
            "List the document library and the inbox."),
        new(DocumentsDownload, GroupDocuments, "Open file contents",
            "Read or preview the actual file, not just its metadata."),
        new(DocumentsUpload, GroupDocuments, "Upload",
            "Add files to the inbox."),
        new(DocumentsClassify, GroupDocuments, "File and classify",
            "Categorise documents, link them to items, and move them into the library."),
        new(DocumentsDelete, GroupDocuments, "Delete",
            "Remove document records, including pruning missing ones."),
        new(DocumentsScan, GroupDocuments, "Trigger a rescan",
            "Re-index the watched folder on demand."),
        new(DocumentsReadSensitive, GroupDocuments, "See sensitive documents",
            "Include categories marked sensitive — receipts and invoices, by default. "
            + "Without this they are hidden entirely rather than merely locked."),

        new(CategoriesRead, GroupCategories, "View categories",
            "Needed to show category names on items, parts and documents."),
        new(CategoriesManage, GroupCategories, "Manage categories",
            "Add, rename and delete the item, part and document category lists."),

        new(LinksRead, GroupLinks, "View links",
            "See web links saved against items and parts."),
        new(LinksWrite, GroupLinks, "Manage links",
            "Add, edit and remove web links."),

        new(SettingsRead, GroupSettings, "Read settings",
            "Needed to format location breadcrumbs consistently. Harmless on its own."),
        new(SettingsManage, GroupSettings, "Change settings",
            "Edit storage depth and location display, and rotate the label signing key.",
            AllowedForAnonymous: false),

        new(UsersManage, GroupAdmin, "Manage users",
            "Create, edit, deactivate and delete accounts, and assign their roles.",
            AllowedForAnonymous: false, AlwaysOnForAdmin: true),
        new(RolesManage, GroupAdmin, "Manage roles and rights",
            "Add and remove roles, and edit this grid.",
            AllowedForAnonymous: false, AlwaysOnForAdmin: true),
        new(TokensPersonal, GroupAdmin, "Create personal API tokens",
            "Mint expiring tokens for your own scripts, limited to what your roles allow. "
            + "Service-account tokens are covered by Manage users instead.",
            AllowedForAnonymous: false),
        new(ApiDocs, GroupAdmin, "View API documentation",
            "Open the Swagger UI and download the OpenAPI document. Try-it-out runs against "
            + "the live data, with the caller's own rights.",
            AllowedForAnonymous: false),
    ];

    public static readonly IReadOnlySet<string> AllKeys = All.Select(p => p.Key).ToHashSet();

    // Permissions the Admin role can never lose, enforced server-side as well as by the
    // locked cells in the grid. Otherwise an admin could uncheck their way into a system
    // nobody can administer — on a NAS whose only door is this app.
    public static readonly IReadOnlySet<string> AdminAlwaysOn =
        All.Where(p => p.AlwaysOnForAdmin).Select(p => p.Key).ToHashSet();

    // Permissions that make no sense for a subject with no account, so the grid renders
    // them as not-applicable and the API refuses to grant them.
    public static readonly IReadOnlySet<string> AnonymousForbidden =
        All.Where(p => !p.AllowedForAnonymous).Select(p => p.Key).ToHashSet();
}

public record PermissionInfo(
    string Key,
    string Group,
    string Label,
    string Description,
    bool AllowedForAnonymous = true,
    bool AlwaysOnForAdmin = false);
