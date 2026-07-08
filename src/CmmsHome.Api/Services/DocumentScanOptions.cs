namespace CmmsHome.Api.Services;

public class DocumentScanOptions
{
    public string? RootPath { get; set; }
    public int ScanIntervalMinutes { get; set; } = 15;
    public string[] AllowedExtensions { get; set; } =
    [
        ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif",
        ".txt", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".heic"
    ];

    // Phase 2 — managed foldering (opt-in). When on, the app owns two write
    // zones under RootPath: uploads land in InboxSubpath, and classifying a
    // document that lives in an app zone moves it to LibrarySubpath/<Category>/.
    // Files the user organized elsewhere on the share are left in place.
    public bool ManagedFoldering { get; set; } = false;
    public string InboxSubpath { get; set; } = "inbox";
    public string LibrarySubpath { get; set; } = "library";
}
