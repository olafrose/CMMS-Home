namespace CmmsHome.Api.Models;

// One observed value of a meter. Never edited — a wrong one is deleted and the meter's
// current value recomputed — so the list is an honest record of what was reported when.
public class MeterReading
{
    public Guid Id { get; set; }
    public Guid MeterId { get; set; }

    // What the device said, before the meter's Offset was applied.
    public decimal RawValue { get; set; }

    // The meter's total at this reading: RawValue + the Offset in force when it was taken.
    // Stored rather than recomputed, so a later rebase can't rewrite history.
    public decimal Value { get; set; }

    // When the device read that value — the client's timestamp, so a backlog pushed after an
    // outage lands at the right times. Unique per meter, which is what makes a retry harmless.
    public DateTime ReadAt { get; set; }

    // When it reached us.
    public DateTime RecordedAt { get; set; }

    // Who said so, loosely: "homeassistant", "manual", "event", "rebase", "replaced".
    public string? Source { get; set; }

    public Guid? CreatedByUserId { get; set; }
}
