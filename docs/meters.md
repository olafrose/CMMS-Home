# Meters and usage-based schedules

Some maintenance is due by use, not by date: an engine's oil every 250 operating hours, a
heat pump's service every 2000 h, a car's tyres every 40 000 km. A **meter** is a counter on one
item, and a **usage schedule** counts against it.

## Model

```
Meter        { Id, EquipmentId, Name, Unit, Offset, BaselineAt,
               CurrentValue?, CurrentReadAt?, RatePerDay?, CreatedAt }
MeterReading { Id, MeterId, RawValue, Value, ReadAt, RecordedAt, Source?, CreatedByUserId? }
MaintenanceRule (ScheduleType = Usage)
             { MeterId, UsageInterval, LastDoneValue?, UsageGrace, UsageReminderLead,
               + optional calendar ceiling: IntervalValue/IntervalUnit/LastDoneAt }
```

- **Generic.** A meter has a unit *label* ("h", "km", "cycles"); nothing is ever converted.
- **Equipment only.** A place-level meter can come later; nothing needs it yet.
- **Cumulative.** A reading is the device's running total, never an increment. A total is
  idempotent: a retried push changes nothing, and a lost one only delays the next value. A lost
  or doubled increment would silently skew every schedule on the meter.
- `CurrentValue`, `CurrentReadAt` and `RatePerDay` are denormalised from the readings by
  `Services/MeterService.cs` whenever one is written. That is what lets a usage rule's `Status`
  stay a getter with no database access, like the time-based rules.

## Recording readings

`POST /meters/{id}/readings` `{ value, readAt?, source? }` takes the **raw device value**; the
meter's `Offset` is added server-side. `readAt` defaults to now. Send the device's own timestamp
when you have one, so a backlog pushed after an outage lands at the right times.

| Situation | Result |
|---|---|
| New value | **201**, row written, current value and rate updated |
| Same `readAt` and value again (a retry) | **200** `Duplicate`, nothing written |
| Same `readAt`, different value | **409** |
| Lower than the reading before it | **409**: the counter went backwards, see below |
| Higher than a *later* reading (backfill out of order) | **409** |
| Same value as the latest (device idle) | **200** `Unchanged`: only `CurrentReadAt` moves, no row is written |
| `readAt` in the future, or before the device was replaced | **400** |

The "unchanged" rule is what makes a 15-minute push cheap: an idle device doesn't write
~35 000 identical rows a year.

`POST /meters/readings` takes `[{ meterId, value, readAt?, source? }]` (up to 200), applies each
item as above and reports a status per item, so one stale counter doesn't sink the rest.

## Going back to zero: rebase vs replace

A cumulative counter never decreases, so a reading lower than the last one is refused. The two
real reasons for it are a human decision, not something to guess at.

- **The counter reset, same device** (a controller board swapped, a counter wrapped): use
  `POST /meters/{id}/rebase` `{ newRawValue }`, "Counter was reset" in the UI. The offset
  absorbs the jump, so the **total carries on**: 5000 h stays 5000 h, and the next raw 5 reads as
  5005 h. Schedules are untouched.
- **The device was replaced** (a new pump or boiler): use `POST /meters/{id}/replace`
  `{ newRawValue = 0, replacedAt? }`, "Device replaced" in the UI, or the checkbox when logging a
  *replacement* event. The meter **starts over**: the offset goes to 0, and `BaselineAt` =
  `replacedAt`. **Every usage schedule on the meter restarts** from the new value, because a new
  pump isn't 6000 h overdue for the old one's service.
  - Readings before `BaselineAt` stay in the history (struck through in the UI) but no longer
    count for anything: not the backwards check, not the rate, not value-at-time.
  - `replacedAt` must be later than the last reading. Readings after it would carry the old
    device's totals, so they are refused rather than reinterpreted.

## Usage schedules

For `ScheduleType = Usage`, all computed in `Models/MaintenanceRule.cs` and served with the rule:

- `dueValue = lastDoneValue + usageInterval`, `overdueValue = dueValue + usageGrace`.
- **Status** from the meter's current value: below `dueValue − usageReminderLead` → Ok, then
  Upcoming, then Due at `dueValue`, then Overdue past `overdueValue`. Grace and lead default to
  10% of the interval. No baseline, or no reading yet, → Due ("never done"), as for the
  time-based types.
- `remainingValue` = how much use is left (negative once past it).
- `dueAt`/`overdueAt` are **forecasts** from `RatePerDay`: the recent average over ~30 days,
  anchored on the last reading before that window. They are instants rather than day-granular
  dates, since a counter crosses 1500 h at a moment. They are null until there are at least two
  readings at least a day apart.
- **Calendar ceiling** ("500 h or 12 months, whichever first"): when `intervalValue > 0`, the
  interval fields apply too, exactly as for an Interval rule. Status is the worse of the two,
  `dueAt` the earlier, and `dueReason` (`Usage` | `Time`) says which limit is driving it.

As with dates, **clients must not re-derive any of this.** Format `remainingValue`, `dueValue`
and `dueAt` as given.

Logging maintenance restarts the item's usage schedules from **the meter's value at the time of
the work**: the last reading at or before it, never backwards, as for Interval rules. The log
form only sends a date, so the meter is read at the end of that day, or now if it is today. The
form also has a collapsed "Meter readings" field, pre-filled with the current values. A value
typed there is recorded as a reading (with `meters.record`) and becomes the new baseline. If the
reading is refused, the whole log is refused, so it can't restart schedules from the wrong count.

## Retention

Every changed value is a row, so an integration pushing every 15 minutes grows the table by up
to ~35 000 rows per busy meter per year. Older readings are therefore **thinned in tiers** by
`Services/MeterRetention.cs`. Its hosted service runs daily (first run ~2 minutes after
startup), and `POST /meters/prune` (`settings.manage`) runs it at once.

| Age | Kept | Setting (Settings → Meter history) |
|---|---|---|
| younger than 90 days | every reading | `MeterFullDetailDays` |
| younger than 2 years | the last per UTC day | `MeterDailyDays` |
| younger than 5 years | the last per ISO week | `MeterWeeklyDays` |
| older | the last per calendar month, **forever** | — |

- **The last reading of a period is its end total.** Counters only climb, so nothing about the
  period's use is lost, only its shape. Average daily use between any two kept points is
  Δvalue/Δdays.
- **Never thinned:** readings with source `rebase`/`replaced` (they mark offsets and baselines,
  and `RecordAsync` finds the last rebase by its row), `event` and `manual` (values a person
  typed, or took with a service), and **each meter's first reading**.
- **Schedules are unaffected.** A rule stores its baseline *value* (`LastDoneValue`), never a
  reference to a reading row.
- **Values in between are interpolated.** `MeterService.ValueAtAsync` (used to baseline a
  back-dated log, and to roll a schedule back when an event is deleted) interpolates linearly
  by time between the kept readings around the moment. In thinned history that's an
  approximation, which is all that history can support. A counter only climbs, so the result
  never breaks the ordering.
- Full detail can't go below 31 days, so the 30-day usage rate behind forecasts always works on
  unthinned data. Each later window must be longer than the one before. Both are checked by
  `PUT /app-settings`, and `PruneAsync` clamps the values again, because thinning can't be undone.
- Thinning is set-based SQL (`row_number()` per meter and `date_trunc` bucket), so the first
  run over years of data is a few statements rather than rows loaded into memory.

**CMMS@home is not the place for detailed run history.** It keeps what maintenance needs. If you
want to chart individual runs, the system reporting the counter is the source: in Home
Assistant, the long-term statistics (see below).

## Permissions

| Permission | Allows | Seeded on |
|---|---|---|
| `meters.read` | view meters and reading history | Admin, Member, Viewer |
| `meters.record` | record readings (single and batch) | Admin, Member |
| `meters.write` | add/rename/delete meters, rebase, replace, delete a reading | Admin, Member |

A rule's embedded `meter` (name, unit, current value) comes with `rules.read`: a usage rule's
status means nothing without it.

## Home Assistant

An integration should use its own **service account** (Settings → Access → Accounts) with a
token scoped to exactly `equipment.read`, `rules.read`, `meters.read` and `meters.record`. That
is enough to push readings and read the schedule, and it can't create meters, change schedules
or see anything else. Put the token in `secrets.yaml`:

```yaml
cmms_auth: "Bearer cmms_…"
```

**A cumulative hours sensor.** If the device reports its own hour counter, use that. Otherwise
derive one from an on/off state with the `integration` (Riemann sum) helper. It restores its
state across restarts, so it behaves as a true running total:

```yaml
template:
  - sensor:
      - name: "Heat pump running"
        state: "{{ 1 if is_state('binary_sensor.heat_pump_compressor', 'on') else 0 }}"

sensor:
  - platform: integration
    source: sensor.heat_pump_running
    name: Heat pump operating hours
    unit_time: h
    method: left
    round: 2
```

Keep the sensor's `state_class` at `total_increasing` (the `integration` helper already reports
a total; set it via `customize` for a template sensor). Home Assistant's **long-term statistics**
then keep hourly aggregates of it well beyond the recorder's purge window. That's where finer
history lives than CMMS@home retains.

**Push it every 15 minutes.** The meter id is on the item's page. An unchanged value writes
nothing, so the frequency costs little.

```yaml
rest_command:
  cmms_meter_readings:
    url: "http://<NAS-IP>:<WEB_PORT>/api/meters/readings"
    method: POST
    headers:
      Authorization: !secret cmms_auth
    content_type: "application/json"
    payload: >
      [{"meterId": "<meter-id>",
        "value": {{ states('sensor.heat_pump_operating_hours') | float(0) }},
        "source": "homeassistant"}]

automation:
  - alias: "Push running hours to CMMS@home"
    triggers:
      - trigger: time_pattern
        minutes: "/15"
    conditions:
      - "{{ states('sensor.heat_pump_operating_hours') not in ['unknown', 'unavailable'] }}"
    actions:
      - action: rest_command.cmms_meter_readings
```

(Older Home Assistant versions spell these `trigger:`/`platform:` and `service:`.) Add more
`{ meterId, value }` items to the payload for more devices: one call covers them all.

**Read the schedule back** for a dashboard, one `rest` sensor per item:

```yaml
rest:
  - resource: "http://<NAS-IP>:<WEB_PORT>/api/rules?equipment_id=<item-id>"
    headers:
      Authorization: !secret cmms_auth
    scan_interval: 900
    sensor:
      - name: "Heat pump service"
        value_template: "{{ value_json[0].status }}"
        json_attributes_path: "$[0]"
        json_attributes: [name, dueAt, dueValue, remainingValue, dueReason]
```

`status` is one of Ok / Upcoming / Due / Overdue. `remainingValue` is in the meter's unit, and
`dueAt` is the forecast (null until there is enough history).
