# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CMMS@home is a mobile-first Progressive Web App for homeowners to track household appliances and log maintenance history. The target UX is quick maintenance entry (≤10 seconds per log). No authentication in MVP — single-user only.

Full requirements: `home_maintenance_mvp_requirements.md`

## Tech Stack

- **Backend**: ASP.NET Core 10 Minimal APIs (`src/CmmsHome.Api/`)
- **ORM**: EF Core 10 + Npgsql
- **Database**: PostgreSQL 17
- **Frontend**: React / Next.js PWA (not yet scaffolded)

## Commands

```bash
# Run API locally (requires PostgreSQL on localhost:5432)
dotnet run --project src/CmmsHome.Api

# Build
dotnet build

# Add EF Core migration
dotnet ef migrations add <Name> --project src/CmmsHome.Api

# Apply migrations manually
dotnet ef database update --project src/CmmsHome.Api

# Full stack via Docker
docker compose up --build
```

Swagger UI is available at `http://localhost:8080/swagger` (Docker) or `http://localhost:5000/swagger` (local run).

## Architecture

Single-project Minimal API. No service layer — endpoints call `CmmsDbContext` directly, which is appropriate for this scale.

```
src/CmmsHome.Api/
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

The `Dockerfile` is in `src/CmmsHome.Api/` and uses `.` as the build context (referenced by `docker-compose.yml` in the repo root).

## Data Model

```
Asset               { Id UUID, Name*, Category?, Location?, ImageUrl?, CreatedAt }
MaintenanceEvent    { Id, AssetId, Type(maintenance|repair|cleaning|replacement), Note?, PhotoUrl?, CreatedAt }
MaintenanceRule     { Id, AssetId, IntervalDays, LastDoneAt? }
```

Due/overdue logic (in `MaintenanceRule.Status`): `LastDoneAt + IntervalDays < UtcNow` → Overdue; within 30 days → Upcoming; `LastDoneAt` null → Due.

## REST API Surface

```
Assets:  POST/GET /assets  |  GET/PUT/DELETE /assets/{id}
Events:  POST /events  |  GET /events?asset_id=  |  GET /events/{id}
Rules:   POST /rules  |  GET /rules?asset_id=  |  PUT /rules/{id}
```

## Key UX Constraints

- **Quick entry**: Logging a maintenance event must be completable in ≤10 seconds
- **QR code as primary entry point**: Each asset gets a QR code; scanning opens the asset and quick-log flow
- **Minimal required fields**: Only `Name` is required for assets; `Type` for events
- **Mobile-first**: All UI decisions should prioritize mobile usability

## Out of Scope (MVP)

Auth, multi-user, Home Assistant integration, OBD2/vehicle diagnostics, operating hours tracking, spare parts, AI features, document management.
