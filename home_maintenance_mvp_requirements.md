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
- Ersatzteile
- KI
- Dokumentenmanagement

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
