# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CMMS@home is a mobile-first Progressive Web App for homeowners to track household appliances and log maintenance history. The target UX is quick maintenance entry (≤10 seconds per log). Multi-user with a role/permission grid the admin controls — including whether a scanned label can log maintenance without an account (see Authentication).

Full requirements: `home_maintenance_mvp_requirements.md`

## Tech Stack

- **Backend**: ASP.NET Core 10 Minimal APIs (`src/CmmsHome.Api/`)
- **ORM**: EF Core 10 + Npgsql
- **Database**: PostgreSQL 17
- **Frontend**: Next.js 16 PWA + Tailwind CSS v4 (`src/cmms-home-web/`)

## Commands

```bash
# Full stack via Docker (all three: db + api + web)
docker compose up --build

# Run API locally (requires PostgreSQL on localhost:5432)
dotnet run --project src/CmmsHome.Api

# Run frontend locally (API must be running)
cd src/cmms-home-web && npm run dev

# Add EF Core migration
dotnet ef migrations add <Name> --project src/CmmsHome.Api

# Apply migrations manually
dotnet ef database update --project src/CmmsHome.Api
```

- API Swagger UI: `http://localhost:8080/swagger`, or `http://localhost:3000/swagger`
  (proxied through the web app — the only route in a deployment, where the API port
  isn't published). Needs the `api.docs` permission
- Frontend: `http://localhost:3000`

## Backend Architecture (`src/CmmsHome.Api/`)

Single-project Minimal API. No service layer — endpoints call `CmmsDbContext` directly.

```
├── Program.cs               # DI setup, middleware, endpoint registration, auto-migrate on startup
├── Data/CmmsDbContext.cs    # EF Core context; fluent config for cascade deletes + DB defaults
├── Data/CmmsDbContextExtensions.cs # GetAppSettingsAsync() — the settings read seam
├── Models/                  # Plain C# model classes — no EF Core references
│   ├── Equipment.cs         # durable item; Kind = Asset|Tool|Both (former Asset + Tool)
│   ├── EquipmentLoan.cs     # lending history (former ToolLoan)
│   ├── StorageLocation.cs   # self-referencing storage hierarchy (former Location/Shelf/Box)
│   ├── MaintenanceEvent.cs  # type: maintenance | repair | cleaning | replacement
│   ├── MaintenanceRule.cs   # computed Status property (Ok/Upcoming/Due/Overdue)
│   ├── ExternalLink.cs      # web link (url + label) on one Equipment or Part
│   ├── Meter.cs / MeterReading.cs  # cumulative counters (hours, km, cycles) + their readings
│   ├── AppSettings.cs       # single-row user config + AbsoluteStorageMaxDepth ceiling
│   ├── User.cs / UserIdentity.cs  # account; credentials split out for future IdPs
│   ├── Role.cs / UserRole.cs / RolePermission.cs  # the grid; Anonymous is a Role
│   ├── Session.cs           # server-side opaque session (only the token's hash is stored)
│   ├── ApiToken.cs / ApiTokenPermission.cs  # bearer tokens + their scope rows
│   └── ServerSecret.cs      # single-row label signing key; NOT seeded, generated on use
├── Services/                # The few cross-cutting concerns (no service layer otherwise)
│   ├── Permissions.cs       # the permission catalogue — the grid renders whatever is here
│   ├── CurrentActor.cs      # who is calling + ActorAccessor (per-request, uncached)
│   ├── RequirePermission.cs # .RequirePermission / .AllowLabelScope / .RequireAuthenticated / .SessionOnly / .Public
│   ├── EndpointAudit.cs     # FAILS STARTUP on any unguarded endpoint
│   ├── AccountService.cs    # password hashing, session issue, cookie options
│   ├── ApiTokenService.cs   # mint/validate/list API tokens (service + personal)
│   ├── LabelSigner.cs       # printed-label tokens + the scope a scan grants
│   ├── MeterService.cs      # record/validate readings, rebase/replace, value-at-time, rates
│   ├── MeterRetention.cs    # tiered thinning of old readings + its daily hosted service
│   └── AdminReset.cs        # Auth__ResetAdmin recovery hatch, applied at startup
└── Endpoints/               # One static class per resource; extension methods on WebApplication
    ├── EquipmentEndpoints.cs      # CRUD + ?kind=/?location_id=/?on_loan=/?maintained= + checkout/return
    ├── StorageLocationEndpoints.cs # CRUD + move (cycle/depth guards) + /{id}/contents
    ├── EventEndpoints.cs    # POST + GET (filter by ?equipment_id=) + GET/PUT/DELETE /:id
    ├── RuleEndpoints.cs     # POST + GET (filter by ?equipment_id=) + PUT/:id
    ├── ExternalLinkEndpoints.cs # CRUD + ?equipment_id=/?part_id=; http(s)-only URL guard
    ├── MeterEndpoints.cs    # meters CRUD + readings (single/batch) + rebase/replace
    ├── AppSettingsEndpoints.cs  # GET/PUT singleton (no /{id})
    ├── AuthEndpoints.cs     # login/logout/setup/me/password + label session & tokens
    ├── UserEndpoints.cs     # account admin; refuses to strand the last admin
    └── RoleEndpoints.cs     # roles CRUD + PUT /roles/permissions (the grid, saved whole)
```

The `Dockerfile` is in `src/CmmsHome.Api/` and uses `.` (repo root) as the build context.

## Frontend Architecture (`src/cmms-home-web/`)

Next.js 16 App Router. All pages are `'use client'` with client-side data fetching via `lib/api.ts`, which calls the relative path `/api`. A catch-all route handler (`app/api/[...path]/route.ts`) proxies that to the backend at `API_URL` (server-side env var, defaults to `http://localhost:8080`), so the same build works in the browser and in Docker without baking a host into the bundle.

A second proxy (`app/swagger/[[...path]]/route.ts`) does the same for the API's Swagger
UI + OpenAPI document, so the docs are reachable on the single published web port —
deployments don't publish the API's port at all. See "Swagger through the web port" below.
The `/api` proxy forwards `Authorization`, so API tokens work through the web port.

```
├── lib/types.ts             # TypeScript types matching backend models exactly
├── lib/api.ts               # Typed fetch wrapper — all API calls go through here
├── lib/labelFormats.ts      # sheet/roll label format presets (Avery, Brother, Dymo)
├── components/BottomNav.tsx # Fixed bottom tab bar (Home / Assets / Parts / Scan / More)
├── components/PrintLabel.tsx # one printable QR label, fills its cell
├── components/StorageLocationPicker.tsx # typeahead + breadcrumb place picker
├── components/ManagedNameList.tsx # generic CRUD list over an {id,name} lookup table
├── components/ExternalLinkList.tsx # add/edit/delete web links for one equipment or part
├── components/MeterList.tsx # an item's meters: current value, record, history, rebase/replace
├── lib/meters.ts            # meter/usage formatting (never re-derives the server's numbers)
├── components/ApiTokenManager.tsx  # list/mint/revoke API tokens (Access → Accounts, /account)
└── app/
    ├── layout.tsx           # Root layout: PWA meta, BottomNav
    ├── page.tsx             # Dashboard: overdue/upcoming rules + recent events
    ├── api/[...path]/route.ts     # proxy → API_URL, strips the /api prefix
    ├── swagger/[[...path]]/route.ts # proxy → API_URL/swagger (api.docs gate lives in the API)
    ├── labels/page.tsx      # print QR labels for equipment/places (batch or single)
    ├── equipment/[id]/
    │   ├── page.tsx         # Universal detail: info, lending, schedule, history, QR, parts, links
    │   └── log/page.tsx     # Quick maintenance log (≤10s: 4-button type picker + note)
    ├── equipment/new/page.tsx  # Create form (kind selector); /assets|tools/new redirect here
    ├── assets/page.tsx      # Equipment list, kind=asset view (/assets/{id}* redirect to /equipment)
    ├── tools/page.tsx       # Equipment list, kind=tool view
    ├── storage/            # nestable tree + /storage/{id} contents
    ├── settings/           # config hub (depth cap, location display) + /settings/categories
    │                       #   (/categories redirects here — category lists are settings)
    ├── account/            # own details, devices, personal API tokens; /account/password
    └── scan/page.tsx        # Camera QR scanner (html5-qrcode, dynamic import)
```

**Key patterns:**
- `useParams<{ id: string }>()` for dynamic route params (Next.js 16: params are Promises in server components; use the hook in client components)
- Equipment QR codes encode `window.location.origin + /equipment/{id}/log`; legacy
  `/assets/{id}/log` and `/storage/{type}/{id}` URLs on already-printed labels redirect
- `StorageLocationPicker` self-loads places; `locationPath()`/`DEFAULT_LOCATION_ICON` live in `lib/storage.ts`
- Location breadcrumbs: `formatLocationPath(id, places, settings)` for a *reference* to a
  place (lists, dashboard, equipment labels — shortened per `AppSettings`), `locationPath()`
  for a place's own heading/label, which always shows its full lineage. Pages needing either
  must load `api.storageLocations.list()` (the flat tree) alongside their own data
- `API_URL` (server-side, read by the `/api` proxy route) defaults to `http://localhost:8080`; `NEXT_PUBLIC_QR_BASE_URL` overrides the host baked into printed QR codes when behind a reverse proxy
- `html5-qrcode` is dynamically imported in `scan/page.tsx` to avoid SSR issues

### Swagger through the web port

Swagger is enabled unconditionally in `Program.cs` (not gated on `IsDevelopment()`), but
`deploy/docker-compose.nas.yml` publishes **only** the web port, and the `/api` proxy
doesn't cover `/swagger` — so deployed, the docs had no route from the browser at all.
`app/swagger/[[...path]]/route.ts` mirrors `/swagger/*` to the api container. Two details
are load-bearing:

- **Land the browser on `/swagger/index.html`.** Swashbuckle's `index.html` references its
  assets and the spec *relatively* (`./swagger-ui.css`, `v1/swagger.json`), so those only
  resolve back into the proxy from inside the `/swagger/` directory. Bare `/swagger` gets
  its own 307 rather than forwarding the upstream 301, whose `Location` is relative.
- **`X-Forwarded-Prefix: /api`.** The proxy sets it; a `PreSerializeFilters` hook in
  `Program.cs` turns it into an OpenAPI `servers` entry, so "Try it out" aims at the `/api`
  proxy instead of the web host's root (where `/equipment` is a Next.js 404). The header is
  ignored unless it's a relative path, and absent when the API is reached directly — so a
  direct `:8080/swagger` still emits no `servers` and works unchanged.

**Gated by the `api.docs` permission** (Admin only by default), enforced by a `/swagger`
middleware branch in `Program.cs` — Swashbuckle is middleware, so neither the per-route filters
nor the startup audit see it. Being in the API, it covers a direct `:8080/swagger` too. The proxy
forwards the cookie and `Authorization`, and turns a 401 on `index.html` into a redirect to
`/login?next=/swagger/index.html`. Try-it-out hits the live data with the caller's own rights, or
with a pasted API token (the spec declares a Bearer scheme). This replaced the old
`SWAGGER_PROXY` env toggle.

## Data Model

```
Equipment           { Id UUID, Name*, Kind(Asset|Tool|Both), CategoryId?→Category, StorageLocationId?→StorageLocation,
                      ImageUrl?, Notes?, PurchasedAt?, WarrantyMonths?, WarrantyUntil?, CreatedAt }
EquipmentUsedOn     { EquipmentId, UsedOnEquipmentId }        # m:n self-link — assets a tool is used on
EquipmentLoan       { Id, EquipmentId, Borrower*, LoanedAt (default now()), ReturnedAt? }
MaintenanceEvent    { Id, EquipmentId? | StorageLocationId?, Type(maintenance|repair|cleaning|replacement), Note?, PhotoUrl?, CreatedAt }
MaintenanceRule     { Id, EquipmentId? | StorageLocationId?, Name?, ScheduleType(Interval|DueDate|Usage),
                      IntervalValue, IntervalUnit(Days|Weeks|Months|Years), LastDoneAt?,
                      NextDueAt?, DueWindowValue, DueWindowUnit, ReminderLeadValue, ReminderLeadUnit,
                      MeterId?, UsageInterval, LastDoneValue?, UsageGrace, UsageReminderLead }   # Usage: see Meters
Meter               { Id, EquipmentId, Name*, Unit*, Offset, BaselineAt, CurrentValue?, CurrentReadAt?, RatePerDay? }
MeterReading        { Id, MeterId, RawValue, Value, ReadAt, RecordedAt, Source?, CreatedByUserId? }
ExternalLink        { Id, Url*, Label*, EquipmentId? | PartId?, CreatedAt }   # user-entered web link
AppSettings         { Id=1, StorageMaxDepth, PathShorteningMode(Full|LastNSegments), PathShorteningSegments,
                      MeterFullDetailDays, MeterDailyDays, MeterWeeklyDays }   # meter reading retention
User                { Id, Username*, DisplayName?, Kind(Person|Service), IsActive, CreatedAt, LastLoginAt? }   # no credentials here
UserIdentity        { Id, UserId, Provider, Subject, PasswordHash?, CreatedAt, LastUsedAt? }
Role                { Id, Name*, IsSystem, IsAnonymous, IsDefaultForNewUsers, SortOrder }
UserRole            { UserId, RoleId }              # m:n — a user holds the union of their roles' grants
RolePermission      { RoleId, Permission }          # grant rows; absence = deny, no deny rows exist
Session             { Id, UserId, TokenHash, UserIdentityId?, CreatedAt, ExpiresAt, LastSeenAt, UserAgent? }
ApiToken            { Id, UserId, Name*, TokenHash, Hint, CreatedAt, CreatedByUserId?, ExpiresAt?, LastUsedAt? }
ApiTokenPermission  { ApiTokenId, Permission }      # a token's scope; narrows, never widens, the owner's roles
ServerSecret        { Id=1, LabelSigningKey, RotatedAt }   # never serialized by any endpoint
```

`MaintenanceEvent.CreatedByUserId` is nullable and stays null for anonymous scans and every
row predating auth — both render as "—" rather than being backfilled to a fiction. Deleting a
user nulls it rather than cascading: the maintenance history is the point of the app.

`Equipment` is the unified durable-item table (Asset + Tool merged). `Kind` is a
*lens* only: any equipment can be located, maintained (Rules/Events), and lent
(Loans). The `/assets` and `/tools` pages are `?kind=`-filtered views (Assets =
Asset+Both, Tools = Tool+Both); the detail page `/equipment/{id}` is universal.
(`Category` is first-class; parts/storage models are in the Parts & Storage section below.)

Due/overdue logic (in `MaintenanceRule.Status`) supports two schedule types. *Interval*:
due = `LastDoneAt + IntervalValue·IntervalUnit`, no grace window. *DueDate*: due =
`NextDueAt`, going Overdue only after a `DueWindowValue·DueWindowUnit` grace period.
Past the overdue point → Overdue; past due → Due; within `ReminderLeadValue·ReminderLeadUnit`
of due (per-rule, default 30 days) → Upcoming; otherwise Ok. A rule with no `LastDoneAt`
(or no `NextDueAt`) is Due — "never done".

**Dates are day-granular, and the server owns the arithmetic.** Due/expiry values are
stored at midnight, so a thing due (or expiring) on date D stays Due/Active for the whole
of D and only turns Overdue/Expired at the start of D+1 — hence the `.Date.AddDays(1)`
in both `MaintenanceRule.OverdueAt` and `Equipment.WarrantyStatus`. Comparing against the
raw midnight instant instead made something due *today* read as overdue.

Consequently `MaintenanceRule` serializes computed `DueAt`/`OverdueAt` beside `Status`,
and `Equipment` serializes computed `WarrantyExpiresAt`/`WarrantyStatus`. All are
getter-only, so EF maps no columns for them. **The frontend must not re-derive these** —
it did once (re-implementing the interval maths in TS to render "98 days overdue"), which
could disagree with `Status` and show an "Overdue" badge next to "Due in 3 days". Clients
format the instants they are handed; the schedule/warranty maths lives in the model only.

`Equipment` warranty: `WarrantyUntil` is an absolute override that wins outright;
otherwise expiry = `PurchasedAt + WarrantyMonths`. The override exists for cover starting
at delivery/installation rather than purchase, and for extensions outliving the base
warranty. `WarrantyStatus` (Unknown|Active|ExpiringSoon|Expired) is deliberately its own
vocabulary — a warranty is a fact with a deadline, not an obligation, so nothing
"completes" it and Due/Overdue would read wrong. `ExpiringSoon` uses a fixed 60-day lead
(`Equipment.ExpiringSoonDays`) rather than an `AppSettings` field, because nothing
surfaces warranties outside the detail page yet; promote it if that changes. Note
`PurchasedAt` is when the item was *bought* — distinct from `CreatedAt`, when the row was
added. Proof of purchase is already covered by the seeded `Receipt`/`Invoice`/`Warranty`
document categories, so warranty adds only the structured dates.

`ExternalLink` is a URL + label attached to one `Equipment` or one `Part` (nullable FKs,
no navs — same shape as `DocumentLink`). The API assumes `https://` when no scheme is
typed and rejects non-http(s) schemes, since the value lands in an `href`.

`AppSettings` is a **single-row** table (`Id` always 1) of user-editable server-side
config, read via `db.GetAppSettingsAsync()` (per request — no caching, so a PUT applies
immediately). Env-var config stays in `appsettings`/`IOptions`; this table is only for
what the Settings page changes. Deliberately no `HasDefaultValue` on its columns: the
seeded row sets them all, and a DB default on `PathShorteningMode` would misfire because
`Full` is enum value 0 (EF would read "chose Full" as "unset").

## REST API Surface

```
Equipment:   POST/GET /equipment (?kind=asset|tool, ?location_id=, ?on_loan=, ?maintained=)
             |  GET/PUT/DELETE /equipment/{id}  |  POST /equipment/{id}/checkout, /equipment/{id}/return
Events:      POST /events  |  GET /events (?equipment_id=, ?storage_location_id=)  |  GET/PUT/DELETE /events/{id}
Rules:       POST /rules  |  GET /rules (?equipment_id=, ?storage_location_id=)  |  PUT/DELETE /rules/{id}
Meters:      CRUD /meters (?equipment_id=)  |  GET/POST /meters/{id}/readings  |  POST /meters/readings (batch)
             |  POST /meters/{id}/rebase, /meters/{id}/replace  |  DELETE /meters/{id}/readings/{rid}
             |  POST /meters/prune   # retention now, settings.manage
StorageLocations: CRUD /storage-locations (?parent_id=, ?q=)  |  GET /storage-locations/{id}/contents
Categories:  CRUD /categories
Parts:       POST/GET /parts (?equipment_id=, ?location_id=, ?low_stock=)  |  GET/PUT/DELETE /parts/{id}
PartUsages:  POST/GET /part-usages  |  DELETE /part-usages/{id}
PartCategories: CRUD /part-categories
Documents:   GET /documents (?status=, ?equipment_id=, ?event_id=, ?part_id=)  |  GET /documents/{id}[/content]
             |  POST /documents/upload (multipart)  |  PUT /documents/{id}/classify  |  POST /documents/{id}/ignore
             |  POST /documents/scan  |  DELETE /documents/{id}  |  POST /documents/prune-missing
DocumentCategories: CRUD /document-categories
ExternalLinks: POST/GET /external-links (?equipment_id=, ?part_id=)  |  PUT/DELETE /external-links/{id}
AppSettings: GET/PUT /app-settings          # singleton — no /{id}; PUT also returns placesOverNewDepthCap
Auth:        GET /auth/me  |  POST /auth/login, /auth/logout, /auth/setup, /auth/password
             |  POST /auth/label-session  |  GET /auth/label-tokens (?equipment_id=)
             |  GET /auth/location-label-tokens (?storage_location_id=)
             |  POST /auth/label-key/rotate  |  GET /auth/sessions  |  DELETE /auth/sessions/{id}
             |  GET/POST /auth/tokens  |  GET /auth/tokens/grantable-permissions  |  DELETE /auth/tokens/{id}
Users:       CRUD /users  |  GET/POST /users/{id}/tokens  |  DELETE /users/{id}/tokens/{tokenId}
             |  GET /users/{id}/grantable-permissions
Roles:       CRUD /roles  |  PUT /roles/permissions   # the whole grid, roleId -> permission keys
```

**Every route carries a permission.** `.RequirePermission(Permissions.X)` is attached per
route (never per group — a group default would silently cover a route added later), and
`app.AuditPermissionCoverage()` **fails startup** if any endpoint has neither a permission nor
an explicit `.Public("why")`/`.RequireAuthenticated()`. Full endpoint→permission table:
`docs/authentication.md`.

## Documents

Indexes files from a watched folder (`Documents__RootPath`, a NAS/SMB share) and
links them to equipment, events or parts. Metadata only lives in Postgres; the files are the
NAS's domain. `DocumentScanner` (background + on-demand `/scan`) discovers files by
`RelativePath`, dedupes/re-links by SHA-256 `ContentHash`, and marks vanished files
`Missing` (never auto-deleted). `GET /documents/{id}/content` streams bytes back
(inline; path-traversal guarded). Frontend renders PDFs/Word/Excel client-side to
bypass browser download settings (`PdfViewer`/`OfficeViewer`, `DocumentPreview`).

`DocumentLink` is the join: nullable `EquipmentId` / `MaintenanceEventId` / `PartId`,
**exactly one** set per row, cascade-deleted with whichever target it names (the document
itself survives, classified but unlinked). Parts are a target because a consumable's own
paperwork — filter spec sheet, oil safety data sheet, reorder confirmation — belongs to
the part, not to whichever appliance it happens to fit. A part link stays **literal**: it
does *not* surface on the equipment `PartEquipment` says the part is used on, because an
equipment's document list would then silently mix direct and inherited paperwork with no
way to tell them apart. Validation counts the set targets rather than comparing them
pairwise — "both set / neither set" stopped scaling at three.

`DocumentCategory` is a managed entity (`Name`, `Sensitive`, `Color`). `Sensitive` is
enforced as a query filter: without `documents.read_sensitive` those documents are absent
from lists and 404 (not 403 — that would confirm they exist) on fetch and download.

**Managed foldering (Phase 2, `Documents__ManagedFoldering`):** the app owns two
write zones under the root — `inbox/` (uploads land here via `POST /documents/upload`)
and `library/<Category>/` (classify moves files here via `DocumentFiler`). It writes
only in `library/`, deletes only from an app zone, and never touches files the user
organized elsewhere (those are classified in place). Moves are atomic renames
(copy→verify→delete only if forced cross-volume), audited in `DocumentMove`, and
`PendingMove` docs are retried each scan. `DocumentScanner` and `DocumentFiler` share
one `DocumentIoLock` so moves never race the scan. Full design: `docs/document-management.md`.

## Key UX Constraints

- **Quick entry**: Logging a maintenance event must be completable in ≤10 seconds
- **QR code as primary entry point**: Each asset gets a QR code; scanning opens the asset and quick-log flow
- **Printable labels**: Asset, box, and shelf QR codes can be printed as physical labels from `/labels` (batch select + editable sheet layout for peel-and-stick sheets, or label-printer roll formats), via browser `window.print()`.
- **Minimal required fields**: Only `Name` is required for assets; `Type` for events
- **Mobile-first**: All UI decisions should prioritize mobile usability

## Parts & Storage

Parts inventory, per-event parts consumption, and the unified storage hierarchy:

```
Part          { Id, Name*, Quantity, Unit*, MinQuantity?, PartCategoryId?, StorageLocationId? }
PartEquipment { PartId, EquipmentId }                          # m:n — assets a consumable is used on
PartUsage     { Id, MaintenanceEventId, PartId, QuantityUsed } # parts consumed by an event
```

- A `Part` is consumable (has `Quantity`/`Unit`); it stays a **separate table** from
  `Equipment`. It references one `StorageLocationId` and is used on **many** `Equipment`
  (many-to-many via `PartEquipment`; `part.equipment` serializes as an array). The
  `/parts` new/edit forms pick assets with `EquipmentMultiSelect`.
- Logging a maintenance event flows into an optional "parts used" step
  (`/events/{id}/parts`) which decrements stock.
- Dashboard surfaces low-stock parts (`Quantity ≤ MinQuantity`).
- Endpoints: `PartEndpoints`, `PartUsageEndpoints`. Frontend: `/parts` + `EntityCombobox`.

### Unified storage (`StorageLocation`)

`Location`/`Shelf`/`StorageBox` were collapsed into one self-referencing
`StorageLocation { Id, Name*, Icon?, ParentId? }` (House > Floor > Room > Shelf > Box, or
any nesting; max depth is the user-editable `AppSettings.StorageMaxDepth`, default 6,
hard-capped at `AppSettings.AbsoluteStorageMaxDepth` = 16 — pinned to the 16-iteration
guard in `locationPath`, which truncates silently, so data must never outgrow it.
Lowering the setting grandfathers existing places and only gates new creates/moves).
Every `Equipment` and `Part` references a single
`StorageLocationId` at any depth. Each place has an optional emoji `Icon`
(default `DEFAULT_LOCATION_ICON` in `lib/storage.ts`).

- Endpoints: `StorageLocationEndpoints` (CRUD, move with cycle/depth guards, `/{id}/contents`
  returning ancestors + child places + equipment + parts).
- Frontend: `/storage` nestable tree (add/rename/**move**/delete) + `/storage/{id}` contents;
  `StorageLocationPicker` (typeahead + breadcrumb). Legacy `/storage/{type}/{id}` redirects
  to `/storage/{id}` via `next.config.ts`. `/locations` redirects to `/storage`.
- The tree's indent caps at `INDENT_MAX_LEVELS` (`app/storage/page.tsx`) so a deep tree
  doesn't push rows off a phone screen; the expand arrows still convey structure.

### Places as maintenance targets

A `MaintenanceEvent` or `MaintenanceRule` targets **exactly one** `Equipment` **or** one
`StorageLocation` — for things that *are* places (a room repainted, gutters cleaned), which
users otherwise faked as an Equipment row stored there. Enforced by a DB check constraint
(`num_nonnulls(...) = 1`, the only one in the schema) plus `Endpoints/MaintenanceTarget.cs`
for a readable 400. Logging an event advances Interval rules on the **same** target.

- **Literal, not rolled up.** A place's history is what was logged on the place, never the
  events of what is stored in it — same reasoning as part documents. A subtree roll-up is
  deferred to the planned analytics feature.
- **Deleting a place with history is refused**, not cascaded (FKs are `Restrict`, unlike
  Equipment's `Cascade`): tidying the storage tree must not take years of history with it.
  Schedules just need deleting first; events only with `events.delete` (Admin-only by default),
  a deliberate act of its own — never a side effect of removing the place.
- **Deleting an event undoes logging it, nothing more** (`DELETE /events/{id}`, one transaction):
  parts it consumed go back into stock, and Interval/Usage rules whose `LastDoneAt` *is* that
  event's time revert to the previous remaining entry on the target (or to a later meter
  replacement, or to "never done"). Rules baselined by anything else are left alone. Document
  links cascade away (the documents survive), and meter readings are kept.
- Labels: a place token signs `location:{id}` and scopes a scan to that one place (not its
  contents). Only the place label's log QR (`/storage/{id}/log`) carries it — see
  `docs/authentication.md`.
- Frontend: a target is `MaintenanceTarget = { kind: 'equipment' | 'place', id }`, converted
  by `lib/maintenance.ts` (`targetFields`/`targetQuery`/`targetHref`/`eventHref`). The log form,
  schedule and history are shared components (`LogEventForm`, `MaintenanceSchedule`,
  `MaintenanceHistory`) used by both `/equipment/{id}` and `/storage/{id}`. The legacy
  `/storage/:type/:id` redirect is narrowed to `box|shelf` so it doesn't eat `/storage/{id}/log`.

### Equipment merge (Asset + Tool)

`Asset` and `Tool` were merged into one `Equipment` table (see Data Model). Rationale:
once tools can be maintained, the only difference from an asset is "can be lent" — and
assets can be lent too, so they're one concept viewed through two lenses. `Kind`
(Asset|Tool|Both) drives which filtered list a row shows in; the `/equipment/{id}` detail
page always offers maintenance schedule + history **and** lending. `UsedOn` is a
self-referencing **many-to-many** ("used on / services", former `Tool.AssetId`; join
table `EquipmentUsedOn`) — a tool can be used on several assets; purely associative,
not maintenance ownership. Picked with `EquipmentMultiSelect`. `ToolCategory` folded into `Category`; `ToolLoan` → `EquipmentLoan`.
`Category` was promoted from a free-text field to a first-class entity (managed at
`/settings/categories`).

## Meters & usage schedules

Full design and the Home Assistant recipe: `docs/meters.md`. The parts that bite:

- **Readings are cumulative totals, never increments**, so retries are harmless. The API
  takes the *raw* device value and adds `Meter.Offset`. A lower value is a **409**, never
  guessed at.
- **Two different "back to 0"s.** `rebase`: the counter reset on the same device, and the offset
  keeps the total climbing, so schedules are untouched. `replace`: a new device, so the meter
  restarts at 0, `BaselineAt` moves, and **every usage rule on it is rebased**. Readings before
  `BaselineAt` are history only.
- `Meter.CurrentValue/CurrentReadAt/RatePerDay` are denormalised by `MeterService` on every
  write, so `MaintenanceRule.Status` stays a pure getter. **Every query returning rules must
  `.Include(r => r.Meter)`**, or a Usage rule silently reads as "never done".
- Usage status lives in `MaintenanceRule.cs` with the rest: `dueValue`/`overdueValue`/
  `remainingValue`, forecast `dueAt`/`overdueAt` (instants, not day-granular), and an optional
  calendar ceiling with `dueReason`. The frontend formats them via `lib/meters.ts` and never
  re-derives them.
- An idle push (same value as the latest) writes no row; it only moves `CurrentReadAt`.
- Logging an event reads the meters at `MeterService.MeterTimeFor(occurredAt)`: the form sends a
  bare date, so that's end of day, or now if today, not midnight. Typed readings and the schedule
  advance share one transaction with the event.
- Rule→Meter is **NO ACTION, not Restrict**: deleting an item cascades to both, and RESTRICT is
  checked mid-cascade.
- **Readings are thinned with age** (`MeterRetention`, daily, plus `POST /meters/prune`): all are
  kept for 90 days, then the last per day / week / month, per the three `AppSettings` windows.
  `rebase`/`replaced`/`event`/`manual` readings and each meter's first reading are never thinned.
  So `ValueAtAsync` **interpolates** between kept readings rather than stepping. Detailed run
  history is deliberately left to the reporting system (Home Assistant's long-term statistics).

## Settings

`/settings` is the config hub and the app's only *server-side* user configuration —
everything else is env-var-driven, or localStorage for the genuinely device-specific:
print preferences (`labels.design` / `labels.formatId`) and the theme (`theme`, via
`next-themes`). It owns:

- **Storage** — `StorageMaxDepth`.
- **Location display** — `PathShorteningMode` + `PathShorteningSegments`, previewed live
  against the user's own deepest place.
- **Meter history** — the three retention windows, plus "Thin now" (`POST /meters/prune`).
- **`/settings/categories`** — the asset/part/document category lists, stacked
  `ManagedNameList`s (a separate sub-page rather than one long scroll, since it's three
  lists). `/categories` client-redirects here.

Rows link out to `/labels`, `/storage` and `/documents`, which stay content pages in the
"More" menu — Settings links to them without owning them.

**Theme deliberately does NOT live here.** It is a property of the device, not the account:
"Auto" follows the phone's own night mode, which a shared server value could only fight, and
an anonymous label-scanner has no account for a server-side preference to hang off. It lives
in the account popover in `BottomNav` as a three-state Light/Dark/Auto picker — three states
because a light/dark flip-flop can never return to "follow the device", which made the default
unreachable the first time anyone touched it. It was moved out of the tab bar because a
control you set once was holding a permanent slot in the app's scarcest space.

Settings live server-side (not localStorage) so they follow the user across devices, and
so the deferred reminder/notification feature can read the same path-formatting policy;
`Services/LocationPathFormatter.cs` is the C# twin of `lib/storage.ts`'s formatting,
written for that consumer and not yet wired to an endpoint.

## Authentication and the rights grid

Full design and the endpoint→permission table: `docs/authentication.md`. The parts that will
bite you if you don't know them:

- **"Not signed in" is a Role, not a code path.** `Anonymous` is a row in the `Roles` table
  with `IsAnonymous`, and every request without a session is evaluated against it. That is what
  makes "can a scanned label log maintenance without an account?" a checkbox in
  `/settings/access` rather than a branch in the code. Seeded with `equipment.read`,
  `events.read`, `events.create`, `rules.read` — the quick-log and nothing else.
- **The grid says *what*, the label token says *which*.** A printed QR carries
  `?t=HMAC(LabelSigningKey, "equipment:{id}")[..16]`, exchanged at `POST /auth/label-session`
  for a 2h signed cookie naming one item. Routes a scan may reach are marked
  `.AllowLabelScope()` and must call `actor.MayTouchEquipment(id)` themselves — the filter
  can't know if the id is in the route, query or body. Everything else refuses a label-scoped
  caller outright.
- **Credentials live in `UserIdentity`, not on `User`** (`Provider`/`Subject`, `"local"` for a
  password). Adding an identity provider later is an insert plus a callback, not a migration of
  the user table. Roles hang off `User` and are indifferent to how someone signed in.
- **Permissions are read from the DB every request** (`ActorAccessor`, memoised per request),
  following `GetAppSettingsAsync`'s precedent — so a grid edit is in force immediately,
  including for existing sessions. Don't add a cache without solving invalidation.
- **API tokens are a fourth caller** (`Authorization: Bearer cmms_…`), owned by a *service
  account* (`User.Kind = Service`: no `UserIdentity`, so no way to sign in; minted by admins) or
  a person (personal tokens, `tokens.personal`, mandatory expiry ≤ `Auth__PersonalTokenMaxDays`).
  Effective rights = owner's **current** role permissions ∩ the token's scope rows. A bearer
  header beats cookies; an invalid one is a **401 from middleware**, never Anonymous. Tokens
  can't reach `.RequireAuthenticated()` routes or `.SessionOnly()` ones (minting), so no token
  mints tokens. Service accounts may hold Admin but never count as the last admin. Details:
  `docs/authentication.md` → API tokens.
- **Sessions are opaque tokens with only their SHA-256 stored**, not encrypted cookie tickets:
  DataProtection's key ring lives in the container filesystem and would sign everyone out on
  every NAS rebuild. Revocation is a row delete.
- **Three guards stop an admin locking everyone out** — locked cells in the grid, a refusal in
  `PUT /roles/permissions`, and `Permissions.AdminAlwaysOn` re-added in `ActorAccessor`
  whatever the grant rows say. Plus `/users` refuses to remove the last active admin.
  `Auth__ResetAdmin="user:password"` is the documented way back in.
- **`ServerSecret` is deliberately not seeded** — a `HasData` row would bake one label-signing
  key into the migration and every deployment would share it.
- Cookies are `SameSite=Lax` (Strict would drop the session on a QR scan, which is a top-level
  cross-origin navigation) and `Secure` only via `Auth__SecureCookies`, since the API only sees
  the proxy's plain-HTTP hop and can't detect HTTPS itself.
- `DocumentCategory.Sensitive` is **finally enforced**, as a query filter: without
  `documents.read_sensitive` those documents are absent from lists and **404** (not 403 — that
  would confirm they exist) on fetch and download.
- Client-side `can()` from `useAuth()` is for hiding and disabling controls only. `AuthProvider`
  renders children immediately rather than gating on `/auth/me`, because blocking the tree
  would put a network round-trip in front of every QR scan.
- `scripts/auth-smoke.sh` asserts the whole matrix end-to-end against a running stack. There is
  still no test project, so this is the regression net a new endpoint has to pass.

## Out of Scope (MVP)

Home Assistant integration (CMMS@home exposes the API — meters, tokens — but does not
integrate with HA itself), OBD2/vehicle diagnostics, AI features. Operating-hours tracking
*is* in scope now: see Meters & usage schedules.
External identity providers are not wired, but the seam exists (see Authentication).
