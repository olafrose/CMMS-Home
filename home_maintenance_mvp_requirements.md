# Home Maintenance System – MVP Anforderungsdokument

## 1. Ziel des Systems
Webbasierte Anwendung zur Verwaltung von Haushaltsgeräten und Maschinen mit Wartungshistorie.

Ziele:
- Assets erfassen
- Wartungen schnell dokumentieren (≤ 10 Sekunden)
- Wartungsstatus (fällig / überfällig) anzeigen
- Historie pro Gerät

Mobile-first PWA.

## 2. Nutzerrolle
- Einzelner Nutzer
- Kein Login im MVP

## 3. Kernfunktionen

### 3.1 Asset Management
Felder:
- id (UUID)
- name (pflicht)
- category (optional)
- location (optional)
- image_url (optional)
- created_at

Funktionen:
- CRUD Assets
- QR-Code pro Asset

### 3.2 Wartungsereignisse
Felder:
- id
- asset_id
- type (maintenance, repair, cleaning, replacement)
- note
- photo_url
- created_at

Funktionen:
- Wartung erstellen
- Timeline pro Asset

### 3.3 Wartungsregeln (einfach)
- interval_days
- last_done_at

Logik:
Wenn last_done_at + interval_days < heute => überfällig

### 3.4 Dashboard
- Überfällige Wartungen
- Bald fällig (≤ 30 Tage)
- Letzte Events

### 3.5 Asset Detail
- Infos
- QR-Code
- Timeline
- Wartungsstatus

### 3.6 QR Code Flow
- Scan → Asset öffnen
- Wartung hinzufügen

### 3.7 Quick Wartung
- Typ
- optional Notiz
- optional Foto
- Speichern in <10 Sekunden

## 4. Nicht im MVP
- Login / Auth
- Multi-User
- Home Assistant Integration
- OBD2
- Meter / Betriebsstunden
- KI
- ~~Dokumentenmanagement~~ → in Planung aufgenommen, siehe Abschnitt 11

> **Hinweis (Erweiterung):** Ersatzteile waren ursprünglich nicht im MVP-Umfang.
> Nach der ersten erfolgreichen Funktionsverifikation des MVP wurde die
> Ersatzteilverwaltung **bewusst nachträglich in den MVP aufgenommen**.
> Siehe Abschnitt 10.

## 5. Tech Stack
- Frontend: React / Next.js (PWA)
- Backend: REST API
- DB: PostgreSQL

## 6. API (Minimal)

### Assets
- POST /assets
- GET /assets
- GET /assets/:id
- PUT /assets/:id
- DELETE /assets/:id

### Events
- POST /events
- GET /events?asset_id=
- GET /events/:id

### Rules
- POST /rules
- GET /rules?asset_id=
- PUT /rules/:id

## 7. Datenmodell

### Asset
- id
- name
- category
- location
- image_url
- created_at

### MaintenanceEvent
- id
- asset_id
- type
- note
- photo_url
- created_at

### MaintenanceRule
- id
- asset_id
- interval_days
- last_done_at

## 8. UX Prinzipien
- extrem schnelle Eingabe
- QR-Code als Einstieg
- mobile first
- minimale Pflichtfelder

## 9. Definition of Done
- Assets funktionieren
- QR Scan funktioniert
- Wartung in <10 Sekunden
- Timeline sichtbar
- Dashboard zeigt fällige Wartungen

## 10. Ersatzteilverwaltung (nach MVP-Verifikation ergänzt)

Nach der ersten erfolgreichen Verifikation der MVP-Kernfunktionen (Abschnitt 9)
wurde die Ersatzteilverwaltung **bewusst zum MVP-Umfang hinzugefügt**. Sie ist
damit kein Out-of-Scope-Thema mehr, sondern fester Bestandteil des Produkts.

### 10.1 Ersatzteile (Parts)
Felder:
- id
- name (pflicht)
- quantity
- unit (pflicht)
- min_quantity (optional, für Mindestbestand / Low-Stock-Warnung)
- Lagerort: genau eine Referenz auf box_id **oder** shelf_id **oder** location_id

Funktionen:
- CRUD Ersatzteile
- Low-Stock-Anzeige im Dashboard (quantity ≤ min_quantity)

### 10.2 Ersatzteilverbrauch (PartUsage)
- Verknüpft ein Ersatzteil mit einem Wartungsereignis
- Felder: id, maintenance_event_id, part_id, quantity_used
- Beim Loggen einer Wartung können optional verbrauchte Ersatzteile erfasst werden
  (der Bestand wird entsprechend reduziert)

### 10.3 Lagerstruktur (Storage)
Hierarchie zur Verortung von Ersatzteilen:
- **Location** (Raum/Ort) → **Shelf** (Regal) → **StorageBox** (Box)
- Ein Ersatzteil kann direkt einer Location, einem Shelf oder einer Box zugeordnet sein

### 10.4 Kategorien & Locations für Assets
Ergänzend wurden `Category` und `Location` als eigene Entitäten eingeführt
(zuvor nur freie Textfelder am Asset), inkl. Verwaltungsseiten.

### 10.5 Zusätzliche API
```
Parts:       POST/GET /parts            |  GET/PUT/DELETE /parts/:id
PartUsages:  POST/GET /part-usages      |  DELETE /part-usages/:id
Storage:     CRUD /locations, /shelves, /boxes
Categories:  CRUD /categories
```

### 10.6 Erweitertes Datenmodell
```
Part        { id, name, quantity, unit, min_quantity?, box_id? | shelf_id? | location_id? }
PartUsage   { id, maintenance_event_id, part_id, quantity_used }
StorageBox  { id, name, shelf_id? | location_id? }
Shelf       { id, name, location_id }
Location    { id, name }
Category    { id, name }
```

> Hinweis: Auch `MaintenanceRule` wurde erweitert (optionaler `name`,
> `interval_value` + `interval_unit` statt reinem `interval_days`).

## 11. Dokumentenmanagement (in Planung)

> **Status:** Entwurf / Planung. Noch nicht implementiert.
> Vollständiges Design: `docs/document-management.md`.

Verwaltung von Handbüchern, Garantien, Belegen, Rechnungen und Scans, verknüpft mit
Assets und Wartungsereignissen.

**Grundprinzip:** CMMS besitzt die Dateien nicht — sie liegen auf einer **NAS-SMB-Freigabe**,
die in den `api`-Container gemountet wird. CMMS indiziert die gefundenen Dateien
(nur Metadaten in Postgres → kein zusätzlicher Backup-Aufwand), bietet sie in einem
Posteingang zur Klassifizierung an und verknüpft sie mit Assets/Events.

### 11.1 Wesentliche Entscheidungen
- **Verknüpfung:** Join-Tabelle `DocumentLink` (n:m) für Flexibilität (ein Beleg kann mehrere
  Assets betreffen), keine nullable-FKs am `Document`.
- **Identität:** SHA-256-Inhalts-Hash (nicht der Pfad) — übersteht Umbenennen/Verschieben,
  ermöglicht Dedupe und Re-Linking.
- **Klassifizierung:** Posteingang nicht klassifizierter Dateien → Zuordnung zu Asset/Event
  + Kategorie (Manual | Warranty | Receipt | Invoice | Photo | Other).
- **Scan:** periodischer `BackgroundService` + manueller `POST /documents/scan`.
  Kein `FileSystemWatcher` (unzuverlässig über SMB).

### 11.2 Phasen
- **Phase 1 — Index in-place (read-only):** Scan, Posteingang, Klassifizieren, Verknüpfen,
  Vorschau/Download. Dateien bleiben unangetastet. Kein Risiko für die Dateien.
- **Phase 2 — verwaltetes Verschieben (opt-in, hinter Config-Flag):** CMMS verschiebt
  klassifizierte Dateien `/inbox` → `/library/<asset>/<category>` mit copy-verify-delete,
  Reconcile per Hash und `DocumentMove`-Audit/Undo.

### 11.3 Datenmodell (nur Metadaten)
```
Document     { id, relative_path, file_name, content_type, size_bytes, content_hash,
               last_modified_utc, discovered_at, status, category?, title?, created_at }
DocumentLink { id, document_id, asset_id? | maintenance_event_id?, linked_at }
DocumentMove { id, document_id, from_path, to_path, moved_at }   # nur Phase 2
```

### 11.4 API (Entwurf)
```
GET  /documents?status=unclassified
GET  /documents?asset_id= | ?event_id=
GET  /documents/:id
GET  /documents/:id/content        # streamt die Datei von der Freigabe
PUT  /documents/:id/classify       # Verknüpfung(en) + Kategorie + Titel setzen
POST /documents/:id/ignore
POST /documents/scan               # Rescan auslösen
```

### 11.5 Hinweis
Datenschutz ist kein Thema: Die App ist single-tenant; alle Dokumente sind im gesamten
Haushalt sichtbar (konsistent mit der bestehenden Auth-losen Ausrichtung).
