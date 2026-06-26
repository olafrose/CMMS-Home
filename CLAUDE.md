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
├── Models/                  # Plain C# model classes — no EF Core references
│   ├── Asset.cs
│   ├── MaintenanceEvent.cs  # type: maintenance | repair | cleaning | replacement
│   └── MaintenanceRule.cs   # computed Status property (Ok/Upcoming/Due/Overdue)
└── Endpoints/               # One static class per resource; extension methods on WebApplication
    ├── AssetEndpoints.cs    # full CRUD; inline record CreateAssetDto
    ├── EventEndpoints.cs    # POST + GET (filter by ?asset_id=) + GET/:id
    └── RuleEndpoints.cs     # POST + GET (filter by ?asset_id=) + PUT/:id
```

The `Dockerfile` is in `src/CmmsHome.Api/` and uses `.` (repo root) as the build context.

## Frontend Architecture (`src/cmms-home-web/`)

Next.js 16 App Router. All pages are `'use client'` with client-side data fetching via `lib/api.ts`. This ensures `NEXT_PUBLIC_API_URL` works uniformly in both browser and Docker environments.

```
├── lib/types.ts             # TypeScript types matching backend models exactly
├── lib/api.ts               # Typed fetch wrapper — all API calls go through here
├── components/BottomNav.tsx # Fixed bottom tab bar (Home / Assets / Scan)
└── app/
    ├── layout.tsx           # Root layout: PWA meta, BottomNav
    ├── page.tsx             # Dashboard: overdue/upcoming rules + recent events
    ├── assets/
    │   ├── page.tsx         # Asset list
    │   ├── new/page.tsx     # Create asset form
    │   └── [id]/
    │       ├── page.tsx     # Asset detail: info, QR code, schedule, event timeline
    │       └── log/page.tsx # Quick maintenance log (≤10s: 4-button type picker + note)
    └── scan/page.tsx        # Camera QR scanner (html5-qrcode, dynamic import)
```

**Key patterns:**
- `useParams<{ id: string }>()` for dynamic route params (Next.js 16: params are Promises in server components; use the hook in client components)
- QR codes on asset detail encode `window.location.origin + /assets/{id}/log` — scannable from any device on the same network
- `NEXT_PUBLIC_API_URL` defaults to `http://localhost:8080`; override for non-localhost deployments
- `html5-qrcode` is dynamically imported in `scan/page.tsx` to avoid SSR issues

## Data Model

```
Asset               { Id UUID, Name*, CategoryId?→Category, LocationId?→Location, ImageUrl?, CreatedAt }
MaintenanceEvent    { Id, AssetId, Type(maintenance|repair|cleaning|replacement), Note?, PhotoUrl?, CreatedAt }
MaintenanceRule     { Id, AssetId, Name?, IntervalValue, IntervalUnit(Days|Weeks|Months|Years), LastDoneAt? }
```

(`Category`/`Location` are first-class entities; parts/storage models are in the Parts & Storage section below.)

Due/overdue logic (in `MaintenanceRule.Status`): `LastDoneAt + IntervalValue·IntervalUnit < UtcNow` → Overdue; within 30 days → Upcoming; `LastDoneAt` null → Due.

## REST API Surface

```
Assets:      POST/GET /assets  |  GET/PUT/DELETE /assets/{id}
Events:      POST /events  |  GET /events?asset_id=  |  GET /events/{id}
Rules:       POST /rules  |  GET /rules?asset_id=  |  PUT /rules/{id}
Locations:   CRUD /locations
Categories:  CRUD /categories
Shelves:     CRUD /shelves   |  Boxes: CRUD /boxes
Parts:       POST/GET /parts  |  GET/PUT/DELETE /parts/{id}
PartUsages:  POST/GET /part-usages  |  DELETE /part-usages/{id}
```

## Key UX Constraints

- **Quick entry**: Logging a maintenance event must be completable in ≤10 seconds
- **QR code as primary entry point**: Each asset gets a QR code; scanning opens the asset and quick-log flow
- **Minimal required fields**: Only `Name` is required for assets; `Type` for events
- **Mobile-first**: All UI decisions should prioritize mobile usability

## Parts & Storage (added to MVP after first verification)

Spare-parts management was **intentionally added to the MVP scope after the core
functionality was first verified working**. It is no longer out of scope. It
comprises parts inventory, per-event parts consumption, and a storage hierarchy:

```
Part       { Id, Name*, Quantity, Unit*, MinQuantity?, BoxId? | ShelfId? | LocationId? }
PartUsage  { Id, MaintenanceEventId, PartId, QuantityUsed }   # parts consumed by an event
StorageBox { Id, Name, ShelfId? | LocationId? }
Shelf      { Id, Name, LocationId }
```

- A `Part` references exactly one of `BoxId` / `ShelfId` / `LocationId` for its location.
- Logging a maintenance event flows into an optional "parts used" step
  (`/events/{id}/parts`) which decrements stock.
- Dashboard surfaces low-stock parts (`Quantity ≤ MinQuantity`).
- Endpoints: `PartEndpoints`, `PartUsageEndpoints`, `BoxEndpoints`, `ShelfEndpoints`.
- Frontend: `/parts`, `/storage` pages + `LocationCombobox` / `EntityCombobox`.

`Category` and `Location` were also promoted from free-text asset fields to first-class
entities (with `/categories` and `/locations` management pages).

## Out of Scope (MVP)

Auth, multi-user, Home Assistant integration, OBD2/vehicle diagnostics, operating hours tracking, AI features, document management.
