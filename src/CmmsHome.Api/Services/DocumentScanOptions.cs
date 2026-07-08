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
}
