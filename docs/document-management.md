# Document Management — Design

**Status:** Implemented. Phase 1 (read-only index in place) and Phase 2 (managed
foldering + in-app uploads) are both live. This document is the design of record;
where the implementation diverged from the original plan, the notes below say so.

## What shipped vs. this design

- **Asset → Equipment merge:** everything below that says `Asset`/`AssetId` is now
  `Equipment`/`EquipmentId`, and a document links m:n to equipment and/or events.
- **Parts are a third link target:** `DocumentLink.PartId`, so a consumable's own
  paperwork (filter spec sheet, oil safety data sheet, reorder confirmation) lives on
  the part rather than on whichever appliance it happens to fit. Filter with
  `?part_id=`; `/parts/{id}` lists them read-only, exactly as equipment does.
  A part link is **literal** — bleed-through via `PartEquipment` (showing a filter's
  manual on every appliance the filter fits) was considered and rejected: the equipment
  page's list would mix direct and inherited paperwork with nothing to distinguish them.
- **Category is a managed entity, not an enum:** `DocumentCategory { Name,
  Sensitive, Color }` (CRUD on `/document-categories`), replacing the fixed
  `Manual|Warranty|…` enum. `Sensitive` is now enforced — see `docs/authentication.md`.
- **Phase 2 foldering keys on category, not asset:** the managed tree is
  `library/<Category>/<file>` (a document has exactly one category; it may link to
  several equipment, which the folder tree can't represent). Files that live
  outside the app's `inbox/`/`library/` zones are classified **in place** and never
  moved. Uncategorized-but-classified files go to `library/Uncategorized/`.
- **Uploads:** `POST /documents/upload` writes into `inbox/`, then a scan indexes
  it as a normal `Unclassified` document. Classifying then moves it to `library/`.
- **`ManagedFoldering` config flag** gates all writing/moving; off = pure Phase-1
  behavior.

CMMS@home document management lets the household keep manuals, warranties, receipts,
invoices and scans alongside the assets and maintenance events they relate to. The
defining choice: **CMMS does not own the bytes — the NAS does.** Files live on an SMB
share; CMMS indexes what it finds, helps file it, and links it to assets/events. Only
metadata lives in Postgres, so this feature adds **no new backup burden** (the existing
`postgres_data` volume already covers the metadata; the files are the user's NAS domain).

This is the first real file-handling capability in the app. Today `Asset.ImageUrl` and
`MaintenanceEvent.PhotoUrl` are unused free-text `string?` columns — there is no upload
path, no static file serving, and the `api` container has no persistent volume.

## Concept

```
NAS SMB share  ──mounted──>  API container  ──periodic scan──>  Postgres (metadata only)
  /inbox/                                                            │
  /library/<asset>/<category>/   GET /documents/{id}/content ◄───────┘  (streams bytes from share)
                you drop files;  CMMS indexes, you classify, (Phase 2) CMMS files them
```

1. Files are dropped onto the share by the household.
2. CMMS scans the tree on a timer (and on demand) and records **new** files as
   `Unclassified` documents.
3. An **inbox UI** surfaces unclassified files; the user assigns each to one or more
   assets and/or maintenance events plus a category.
4. Asset and event detail pages show their linked documents with inline preview / download.

## Resolved decisions

| Decision | Choice | Rationale |
|---|---|---|
| Linking model | **B — join table** (`DocumentLink`) | One receipt/manual can span several assets, and a doc can be both an asset manual and referenced by an event. Worth the small extra code. |
| File identity | **Content hash (SHA-256)** is the durable identity, not the path | Critical once CMMS moves files (Phase 2): a moved/renamed file is re-linked by hash, so classification survives. Also dedupes. |
| Read-only vs managed | **Phased.** Phase 1 indexes in place (read-only). Phase 2 adds opt-in managed moves. | Build trust in the read loop before letting the app write to the NAS. Most value lands in Phase 1 at zero risk to files. |
| Privacy (no-auth posture) | ~~Non-issue.~~ **Resolved by auth.** | Was: single-tenant, the whole household sees everything. Now `Sensitive` actually bites — without `documents.read_sensitive` those documents are absent from lists and 404 (not 403, which would confirm they exist) on fetch and download. See `docs/authentication.md`. |

## Data model (metadata only)

```
Document {
  Id              UUID
  RelativePath    string   # path under the configured root; mutable in Phase 2
  FileName        string   # display name
  ContentType     string   # inferred from extension
  SizeBytes       long
  ContentHash     string   # sha256 — durable identity, dedupe, re-link on move/rename
  LastModifiedUtc DateTime # from the filesystem
  DiscoveredAt    DateTime
  Status          Unclassified | Classified | Ignored | Missing | PendingMove
  Category        Manual | Warranty | Receipt | Invoice | Photo | Other   (nullable until classified)
  Title           string?  # friendly label
  CreatedAt       DateTime
}

DocumentLink {            # many-to-many; flexible linking (decision B)
  Id                  UUID
  DocumentId          UUID  -> Document
  EquipmentId         UUID? -> Equipment          # was AssetId
  MaintenanceEventId  UUID? -> MaintenanceEvent
  PartId              UUID? -> Part               # shipped later; see the delta list above
  LinkedAt            DateTime
}                         # exactly one of the three targets is set per row; each is
                          # cascade-delete, so losing the target loses the link but not
                          # the document

DocumentMove {            # Phase 2 only — audit trail + undo
  Id          UUID
  DocumentId  UUID -> Document
  FromPath    string
  ToPath      string
  MovedAt     DateTime
}
```

## Lifecycle

```
(discovered) → Unclassified ──classify──> Classified ──(Phase 2 move ok)──> Classified
                   │                           │
                   └──ignore──> Ignored        └──(Phase 2 move fails)──> PendingMove (retried)

file disappears on a SUCCESSFUL full scan → Missing   (never auto-deleted; re-link by hash if it reappears)
```

## Scanning & change detection

- **Periodic `BackgroundService`** on a timer (e.g. every 10–15 min) → "scan occasionally"
  automatically. Plus a manual **`POST /documents/scan`** ("Rescan now") for instant pickup.
- **No `FileSystemWatcher`** — real-time FS events are unreliable over SMB/CIFS mounts;
  polling is the robust pattern for network shares.
- Change detection keys on `RelativePath`, short-circuits on unchanged `(SizeBytes, LastModifiedUtc)`
  to avoid re-hashing large scanned PDFs; hashes only when something changed.
- A file absent on a **successful** full enumeration is marked `Missing` (never deleted —
  preserves classification if it merely moved). Re-link by `ContentHash` when a hash reappears
  at a new path.
- Scans must tolerate the share being unavailable (NAS asleep / blip): a failed scan reconciles
  nothing, so it can never mass-mark files `Missing`.

## Managed foldering — Phase 2 (opt-in, behind a config flag)

Two-zone layout on a single share (so every move is an atomic rename, never copy+delete):

```
/inbox/                        ← household drops unsorted files (CMMS reads + removes after verified move)
/library/<asset>/<category>/   ← CMMS-managed organized tree (CMMS writes ONLY here)
```

Safety rules (bounded blast radius — worst case is a misfile *within* the library, never loss
and never touching folders the user curates):

- CMMS writes **only** inside `/library` and deletes **only** from `/inbox`, after a verified move.
- Same-share → moves are atomic renames. If a cross-volume copy is ever forced:
  **copy → verify size+hash → only then delete source.** A source is never deleted before
  its destination is confirmed.
- **Hash is identity**, so every scan reconciles DB ↔ disk and an interrupted move self-heals.
- Collision-safe destination naming (append a short id/suffix).
- Share unavailable mid-move → abort cleanly, leave file in `/inbox`, mark `PendingMove`, retry next scan.
- `DocumentMove` records every move for audit + undo.

## API surface (matches existing `*Endpoints` style)

```
GET  /documents?status=unclassified      # the inbox
GET  /documents?equipment_id= | ?event_id= | ?part_id=   # docs linked to an entity (directly)
GET  /documents/{id}
GET  /documents/{id}/content              # streams bytes from the share; path-traversal validated
PUT  /documents/{id}/classify             # set link(s) + category + title → Status=Classified (+ move in Phase 2)
POST /documents/{id}/ignore               # Status=Ignored (hide from inbox)
POST /documents/scan                       # trigger a rescan
```

## Frontend (Next.js, mobile-first)

- New **`/documents` inbox** page; an **unclassified-count badge** in `BottomNav`.
- **Documents section** on equipment, part and event detail (list + preview; PDFs open in browser,
  images thumbnail inline). Read-only on all three — attaching happens in `/documents`.
- Classification form: pick target(s), tap a category, optional title — kept quick. Each link
  row is **one** `<select>` whose options are grouped `Equipment` / `Parts` and whose value
  carries the kind (`eq:<id>` / `pt:<id>`); a separate kind toggle would have cost an extra tap
  on a phone. Picking equipment reveals a second select to narrow to one of its maintenance
  events; picking a part does not, since events hang off equipment only.

## Docker / deployment

- Mount the SMB share into the `api` container via a `cifs` volume:
  ```yaml
  volumes:
    documents:
      driver: local
      driver_opts:
        type: cifs
        device: "//NAS/cmms-docs"
        o: "username=...,password=...,uid=...,gid=..."   # ro for Phase 1; rw for Phase 2
  ```
  mounted at `/documents`. **Read-only for Phase 1.**
- Config: `Documents__RootPath=/documents`, scan interval, allowed extensions, and a
  `Documents__ManagedFoldering` flag (off until Phase 2 is trusted).

## Phasing

- **Phase 1 — index in place (read-only):** scan, inbox UI, classify, link to asset/event,
  preview/download. Files stay where the user put them. Zero risk. Delivers most of the value.
- **Phase 2 — managed moves (opt-in):** inbox→library mover with the copy-verify / reconcile-by-hash
  guarantees, `DocumentMove` audit + undo, gated behind the config flag.

## Out of scope / future

- OCR / full-text search of document contents.
- Auto-classification (guessing asset/category from filename or content).
- Thumbnails generation pipeline (rely on browser-native PDF/image preview first).
