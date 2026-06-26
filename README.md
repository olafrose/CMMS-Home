# CMMS@home

A mobile-first Progressive Web App for homeowners to track household appliances and
machines, log maintenance in **≤10 seconds** via QR codes, and stay on top of
due/overdue service. Single-user, no login — built for a home network.

> CMMS = Computerized Maintenance Management System, scaled down for the home.

## Features

- **Assets** — track appliances/machines with category, location, and image.
- **QR codes** — every asset gets a QR code; scanning it opens the asset and the
  quick-log flow. The primary entry point for maintenance.
- **Quick maintenance log** — record an event (maintenance / repair / cleaning /
  replacement) with an optional note in under 10 seconds.
- **Maintenance rules** — per-asset service intervals with automatic
  Ok / Upcoming / Due / Overdue status.
- **Dashboard** — overdue and upcoming maintenance, recent activity, and low-stock parts.
- **Spare parts & storage** — parts inventory with min-stock warnings, per-event parts
  consumption, and a Location → Shelf → Box storage hierarchy.
- **Document management** *(planned)* — NAS-backed manuals, warranties, and receipts
  linked to assets and events. See [`docs/document-management.md`](docs/document-management.md).

## Tech stack

| Layer    | Technology |
|----------|------------|
| Backend  | ASP.NET Core 10 Minimal APIs (`src/CmmsHome.Api`) |
| ORM / DB | EF Core 10 + Npgsql, PostgreSQL 17 |
| Frontend | Next.js 16 PWA + Tailwind CSS v4 (`src/cmms-home-web`) |

## Quick start

The whole stack (PostgreSQL + API + web) runs via Docker Compose:

```bash
docker compose up --build
```

- Web app: http://localhost:3000
- API + Swagger UI: http://localhost:8080/swagger

> **Before deploying beyond localhost:** change the default DB password in
> `docker-compose.yml` and set `NEXT_PUBLIC_QR_BASE_URL` so QR codes encode a URL
> reachable from your phones (e.g. `https://cmms.myhome.net`).

## Local development

Run the pieces individually (API must be running for the frontend to work):

```bash
# API — requires PostgreSQL on localhost:5432
dotnet run --project src/CmmsHome.Api

# Frontend
cd src/cmms-home-web && npm run dev
```

Database schema is managed with EF Core migrations and applied automatically on API
startup. To work with migrations manually:

```bash
dotnet ef migrations add <Name> --project src/CmmsHome.Api
dotnet ef database update     --project src/CmmsHome.Api
```

## Project layout

```
CmmsHome.slnx                       # solution
docker-compose.yml                  # db + api + web
docs/                               # design docs (e.g. document management)
src/
├── CmmsHome.Api/                   # ASP.NET Core Minimal API + EF Core
│   ├── Program.cs                  # DI, middleware, endpoint + auto-migrate setup
│   ├── Data/CmmsDbContext.cs
│   ├── Models/                     # plain C# models (no EF Core references)
│   └── Endpoints/                  # one static class per resource
└── cmms-home-web/                  # Next.js 16 App Router PWA
    ├── lib/                        # API client + shared types
    ├── components/
    └── app/                        # dashboard, assets, parts, storage, scan
```

## API surface

```
Assets:      POST/GET /assets            |  GET/PUT/DELETE /assets/{id}
Events:      POST /events                |  GET /events?asset_id=  |  GET /events/{id}
Rules:       POST /rules                 |  GET /rules?asset_id=   |  PUT /rules/{id}
Locations:   CRUD /locations             |  Categories: CRUD /categories
Shelves:     CRUD /shelves               |  Boxes:      CRUD /boxes
Parts:       POST/GET /parts             |  GET/PUT/DELETE /parts/{id}
PartUsages:  POST/GET /part-usages       |  DELETE /part-usages/{id}
```

## Status & scope

The core MVP (assets, QR flow, quick logging, rules, dashboard) and spare-parts &
storage management are implemented. Document management is currently a design
(not yet built).

**Out of scope:** authentication, multi-user, Home Assistant integration,
OBD2/vehicle diagnostics, operating-hours tracking, and AI features.

Full requirements: [`home_maintenance_mvp_requirements.md`](home_maintenance_mvp_requirements.md).
Contributor/architecture notes for AI tooling: [`CLAUDE.md`](CLAUDE.md).

## License

[MIT](LICENSE) © Olaf Rose
