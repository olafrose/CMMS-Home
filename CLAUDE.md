# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CMMS@home is a mobile-first Progressive Web App for homeowners to track household appliances and log maintenance history. The target UX is quick maintenance entry (≤10 seconds per log). No authentication in MVP — single-user only.

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

- API Swagger UI: `http://localhost:8080/swagger`
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
│   └── AppSettings.cs       # single-row user config + AbsoluteStorageMaxDepth ceiling
└── Endpoints/               # One static class per resource; extension methods on WebApplication
    ├── EquipmentEndpoints.cs      # CRUD + ?kind=/?location_id=/?on_loan=/?maintained= + checkout/return
    ├── StorageLocationEndpoints.cs # CRUD + move (cycle/depth guards) + /{id}/contents
    ├── EventEndpoints.cs    # POST + GET (filter by ?equipment_id=) + GET/:id
    ├── RuleEndpoints.cs     # POST + GET (filter by ?equipment_id=) + PUT/:id
    ├── ExternalLinkEndpoints.cs # CRUD + ?equipment_id=/?part_id=; http(s)-only URL guard
    └── AppSettingsEndpoints.cs  # GET/PUT singleton (no /{id})
```

The `Dockerfile` is in `src/CmmsHome.Api/` and uses `.` (repo root) as the build context.

## Frontend Architecture (`src/cmms-home-web/`)

Next.js 16 App Router. All pages are `'use client'` with client-side data fetching via `lib/api.ts`, which calls the relative path `/api`. A catch-all route handler (`app/api/[...path]/route.ts`) proxies that to the backend at `API_URL` (server-side env var, defaults to `http://localhost:8080`), so the same build works in the browser and in Docker without baking a host into the bundle.

```
├── lib/types.ts             # TypeScript types matching backend models exactly
├── lib/api.ts               # Typed fetch wrapper — all API calls go through here
├── lib/labelFormats.ts      # sheet/roll label format presets (Avery, Brother, Dymo)
├── components/BottomNav.tsx # Fixed bottom tab bar (Home / Assets / Parts / Scan / More)
├── components/PrintLabel.tsx # one printable QR label, fills its cell
├── components/StorageLocationPicker.tsx # typeahead + breadcrumb place picker
├── components/ManagedNameList.tsx # generic CRUD list over an {id,name} lookup table
├── components/ExternalLinkList.tsx # add/edit/delete web links for one equipment or part
└── app/
    ├── layout.tsx           # Root layout: PWA meta, BottomNav
    ├── page.tsx             # Dashboard: overdue/upcoming rules + recent events
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

## Data Model

```
Equipment           { Id UUID, Name*, Kind(Asset|Tool|Both), CategoryId?→Category, StorageLocationId?→StorageLocation,
                      ImageUrl?, Notes?, CreatedAt }
EquipmentUsedOn     { EquipmentId, UsedOnEquipmentId }        # m:n self-link — assets a tool is used on
EquipmentLoan       { Id, EquipmentId, Borrower*, LoanedAt (default now()), ReturnedAt? }
MaintenanceEvent    { Id, EquipmentId, Type(maintenance|repair|cleaning|replacement), Note?, PhotoUrl?, CreatedAt }
MaintenanceRule     { Id, EquipmentId, Name?, ScheduleType(Interval|DueDate),
                      IntervalValue, IntervalUnit(Days|Weeks|Months|Years), LastDoneAt?,
                      NextDueAt?, DueWindowValue, DueWindowUnit, ReminderLeadValue, ReminderLeadUnit }
ExternalLink        { Id, Url*, Label*, EquipmentId? | PartId?, CreatedAt }   # user-entered web link
AppSettings         { Id=1, StorageMaxDepth, PathShorteningMode(Full|LastNSegments), PathShorteningSegments }
```

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
Events:      POST /events  |  GET /events?equipment_id=  |  GET/PUT /events/{id}
Rules:       POST /rules  |  GET /rules?equipment_id=  |  PUT/DELETE /rules/{id}
StorageLocations: CRUD /storage-locations (?parent_id=, ?q=)  |  GET /storage-locations/{id}/contents
Categories:  CRUD /categories
Parts:       POST/GET /parts (?equipment_id=, ?location_id=, ?low_stock=)  |  GET/PUT/DELETE /parts/{id}
PartUsages:  POST/GET /part-usages  |  DELETE /part-usages/{id}
PartCategories: CRUD /part-categories
Documents:   GET /documents (?status=, ?equipment_id=, ?event_id=)  |  GET /documents/{id}[/content]
             |  POST /documents/upload (multipart)  |  PUT /documents/{id}/classify  |  POST /documents/{id}/ignore
             |  POST /documents/scan  |  DELETE /documents/{id}  |  POST /documents/prune-missing
DocumentCategories: CRUD /document-categories
ExternalLinks: POST/GET /external-links (?equipment_id=, ?part_id=)  |  PUT/DELETE /external-links/{id}
AppSettings: GET/PUT /app-settings          # singleton — no /{id}; PUT also returns placesOverNewDepthCap
```

## Documents

Indexes files from a watched folder (`Documents__RootPath`, a NAS/SMB share) and
links them to equipment/events. Metadata only lives in Postgres; the files are the
NAS's domain. `DocumentScanner` (background + on-demand `/scan`) discovers files by
`RelativePath`, dedupes/re-links by SHA-256 `ContentHash`, and marks vanished files
`Missing` (never auto-deleted). `GET /documents/{id}/content` streams bytes back
(inline; path-traversal guarded). Frontend renders PDFs/Word/Excel client-side to
bypass browser download settings (`PdfViewer`/`OfficeViewer`, `DocumentPreview`).

`DocumentCategory` is a managed entity (`Name`, `Sensitive`, `Color`); `Sensitive`
is stored but unenforced until auth exists.

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

## Settings

`/settings` is the config hub and the app's only persisted user configuration —
everything else is env-var-driven or (for genuinely device-specific print preferences,
`labels.design` / `labels.formatId`) localStorage. It owns:

- **Storage** — `StorageMaxDepth`.
- **Location display** — `PathShorteningMode` + `PathShorteningSegments`, previewed live
  against the user's own deepest place.
- **`/settings/categories`** — the asset/part/document category lists, stacked
  `ManagedNameList`s (a separate sub-page rather than one long scroll, since it's three
  lists). `/categories` client-redirects here.

Rows link out to `/labels`, `/storage` and `/documents`, which stay content pages in the
"More" menu — Settings links to them without owning them.

Settings live server-side (not localStorage) so they follow the user across devices, and
so the deferred reminder/notification feature can read the same path-formatting policy;
`Services/LocationPathFormatter.cs` is the C# twin of `lib/storage.ts`'s formatting,
written for that consumer and not yet wired to an endpoint.

## Out of Scope (MVP)

Auth, multi-user, Home Assistant integration, OBD2/vehicle diagnostics, operating hours tracking, AI features.
