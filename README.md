# CMMS@home

A mobile-first Progressive Web App for homeowners to track household appliances and
machines, log maintenance in **≤10 seconds** via QR codes, and stay on top of
due/overdue service. Single-user, no login — built for a home network.

> CMMS = Computerized Maintenance Management System, scaled down for the home.

## Features

- **Equipment** — one table for durable items, viewed through two lenses: *Assets*
  (appliances, machines, vehicles) and *Tools*. Anything can be located, maintained and
  lent out; tools additionally track who borrowed them and when.
- **QR codes** — every item and every storage place gets a QR code; scanning opens the
  item and the quick-log flow. The primary entry point for maintenance.
- **Quick maintenance log** — record an event (maintenance / repair / cleaning /
  replacement) with an optional note in under 10 seconds.
- **Maintenance rules** — per-item schedules, either a recurring interval or a fixed due
  date with an optional grace window, with automatic Ok / Upcoming / Due / Overdue status
  and a per-rule reminder lead time.
- **Purchase & warranty** — purchase date plus a warranty period (or an absolute end
  date), with derived Active / Ending soon / Expired status on the item.
- **Dashboard** — overdue and upcoming maintenance, recent activity, low-stock parts and
  items out on loan, each showing where the item is stored.
- **Spare parts** — inventory with min-stock warnings and per-event parts consumption.
- **Storage** — a single nestable hierarchy of places (house → floor → room → shelf → box,
  or whatever fits), with a configurable depth limit. Every item and part lives in one
  place at any depth.
- **Printable labels** — batch-print QR labels for items and places, on peel-and-stick
  sheets (Avery layouts) or label-printer rolls (Brother, Dymo).
- **Documents** — indexes a NAS/SMB folder, links files to items and events, previews
  PDFs/Word/Excel in-app, and optionally files uploads into `library/<Category>/`.
  See [`docs/document-management.md`](docs/document-management.md).
- **External links** — clickable manual/spec/reorder URLs on items and parts.
- **Settings** — server-side configuration (storage depth, how location paths are
  abbreviated, the category lists), so it follows you across devices.

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
- API + Swagger UI: http://localhost:8080/swagger (also at http://localhost:3000/swagger,
  proxied through the web app — that's the only route in a deployment, where the API port
  isn't published)

> **Before deploying beyond localhost:** change the default DB password in
> `docker-compose.yml` and set `NEXT_PUBLIC_QR_BASE_URL` so QR codes encode a URL
> reachable from your phones (e.g. `https://cmms.myhome.net`).

For a always-on box (e.g. a Synology NAS), `deploy/` holds a separate compose file and
helper scripts: build amd64 images and push them to a registry with
`deploy/build-and-push.sh`, then run `deploy/docker-compose.nas.yml` there. Copy
`deploy/.env.example` to `deploy/.env` and fill in the image refs, DB password and the
documents share path.

Only the web port is published there — the API and DB stay on Docker's internal network,
with the web container proxying `/api` and `/swagger` through to the API. So the docs live
at `http://<NAS-IP>:<WEB_PORT>/swagger`; set `SWAGGER_PROXY=false` to take them off the
port.

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
docker-compose.yml                  # db + api + web (local/dev)
deploy/                             # NAS deployment: compose file + build/push scripts
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
    └── app/                        # dashboard, equipment, assets/tools, parts, storage,
                                    #   documents, labels, settings, scan
```

The frontend talks to the relative path `/api`, which a catch-all route handler proxies
to the backend at `API_URL` (server-side, default `http://localhost:8080`) — so the same
build works in the browser and in Docker without baking a host into the bundle.

## API surface

```
Equipment:        POST/GET /equipment (?kind=asset|tool, ?location_id=, ?on_loan=, ?maintained=)
                  |  GET/PUT/DELETE /equipment/{id}  |  POST /equipment/{id}/checkout, /return
Events:           POST /events  |  GET /events?equipment_id=  |  GET/PUT /events/{id}
Rules:            POST /rules  |  GET /rules?equipment_id=  |  PUT/DELETE /rules/{id}
StorageLocations: CRUD /storage-locations (?parent_id=, ?q=)  |  GET /storage-locations/{id}/contents
Parts:            POST/GET /parts (?equipment_id=, ?location_id=, ?low_stock=)  |  GET/PUT/DELETE /parts/{id}
PartUsages:       POST/GET /part-usages  |  DELETE /part-usages/{id}
Documents:        GET /documents (?status=, ?equipment_id=, ?event_id=)  |  GET /documents/{id}[/content]
                  |  POST /documents/upload  |  PUT /documents/{id}/classify  |  POST /documents/scan
ExternalLinks:    POST/GET /external-links (?equipment_id=, ?part_id=)  |  PUT/DELETE /external-links/{id}
AppSettings:      GET/PUT /app-settings        # singleton, no /{id}
Categories:       CRUD /categories, /part-categories, /document-categories
```

Full details in Swagger at http://localhost:8080/swagger, or `/swagger` on the web port.

## Status & scope

Implemented: the core MVP (equipment, QR flow, quick logging, rules, dashboard),
spare parts, the unified storage hierarchy, printable labels, document management
(NAS indexing, classification, in-app uploads and managed foldering), external links,
purchase/warranty tracking, and server-side settings.

Reminders are surfaced in-app only — there is no push or email delivery yet, so due
maintenance and expiring warranties are seen by opening the dashboard or the item.

**Out of scope:** authentication, multi-user, Home Assistant integration,
OBD2/vehicle diagnostics, operating-hours tracking, and AI features.

Full requirements: [`home_maintenance_mvp_requirements.md`](home_maintenance_mvp_requirements.md).
Contributor/architecture notes for AI tooling: [`CLAUDE.md`](CLAUDE.md).

## License

[MIT](LICENSE) © Olaf Rose
