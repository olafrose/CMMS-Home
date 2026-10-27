namespace CmmsHome.Api.Models;

// A cumulative counter on one piece of equipment: running hours, kilometres, wash cycles.
// Usage-based schedules (ScheduleType.Usage) count against it.
//
// Fed with the counter's *running total* — the number on the device's hour meter — never
// with increments. A total is idempotent: a retried or duplicated push changes nothing, and
// a lost one only delays the next value, where a lost or doubled increment would silently
// skew every schedule on the meter.
//
// The Current*/RatePerDay fields are denormalised from the readings and rewritten whenever a
// reading is (MeterService). That is what lets MaintenanceRule's Status stay a getter with no
// database access, exactly like the time-based rules: the rule needs the meter row, nothing more.
public class Meter
{
    public Guid Id { get; set; }

    // Equipment only. A place-level meter (the water meter in the utility room) can follow
    // the way place documents might, but nothing needs it yet.
    public Guid EquipmentId { get; set; }

    public required string Name { get; set; }  // "Operating hours"
    public required string Unit { get; set; }  // "h", "km", "cycles" — a label, never converted

    // Added to every raw device value to give the stored total. Absorbs a counter reset on
    // the *same* machine — a controller swapped, a counter wrapped — so the total keeps
    // climbing and schedules anchored to it are untouched (POST /meters/{id}/rebase).
    public decimal Offset { get; set; }

    // When the current device's life began. A *replaced* device starts the meter over at 0
    // (POST /meters/{id}/replace) rather than continuing the old one's total, and readings
    // before this instant are history only: the old pump's 6000 h must not make the new
    // one's 12 h look like the counter ran backwards, nor feed its usage rate.
    public DateTime BaselineAt { get; set; }

    // Latest reading since BaselineAt. Null until the first one arrives.
    public decimal? CurrentValue { get; set; }

    // When CurrentValue was last confirmed. An unchanged push only moves this forward, so a
    // device sitting idle doesn't write a row every 15 minutes yet still reads as "fresh".
    public DateTime? CurrentReadAt { get; set; }

    // Recent average use, for forecasting when a usage schedule will come due. Null with too
    // little history to say (see MeterService.RateWindow).
    public double? RatePerDay { get; set; }

    public DateTime CreatedAt { get; set; }
}
