# Deploying CMMS@home on a Synology NAS (Intel J4025 / amd64)

The J4025 is x86_64 but low-powered (dual-core Celeron, ~2 GB RAM), so **build the
images on your PC and let the NAS only run them** — don't build on the NAS.

You need **Container Manager** (Package Center → install; DSM 7.2+). Everything runs
from `deploy/docker-compose.nas.yml` + a `.env` you fill in — the NAS never needs
the source code or git.

---

## 0. Create the documents folder + prep the NAS

1. DSM → **Control Panel → Shared Folder → Create** a folder for documents, e.g. a
   share named `documents` (path `/volume1/documents`). Drop your PDFs/Word/Excel here.
   **Give the container write access** to this folder — the mount is read-**write**
   so the app can file uploads and classified documents. The app writes **only**
   inside two subfolders it owns: `inbox/` (uploads land here) and
   `library/<Category>/` (classified files move here). Anything you organize in
   other subfolders is indexed in place and never moved or modified. To keep the
   old read-only "index only" behavior, set `MANAGED_FOLDERING=false` in `.env`
   (and you can leave the mount read-only in that case).
2. Package Center → install **Container Manager**.

---

## Path A — push to a registry, NAS pulls (recommended)

On **your PC** (from the repo root), pick a registry and image names:

- **Docker Hub:** `docker login`, images like `docker.io/<your-id>/cmms-api:test`.
- **GHCR:** `docker login ghcr.io -u <user>` (PAT with `write:packages`), images like
  `ghcr.io/<user>/cmms-api:test`. Make the packages **public**, or you'll also need to
  log Container Manager into ghcr.io.

```bash
export API_IMAGE=docker.io/<you>/cmms-api:test
export WEB_IMAGE=docker.io/<you>/cmms-web:test
./deploy/build-and-push.sh
```

Then on the **NAS**:
1. Put `deploy/docker-compose.nas.yml` and a filled-in `.env` (copy from `.env.example`)
   into a shared folder, e.g. `/volume1/docker/cmms/`. Set `API_IMAGE`/`WEB_IMAGE` to the
   pushed refs, a strong `DB_PASSWORD`, `DOCS_PATH=/volume1/documents`, `WEB_PORT=3000`.
2. Container Manager → **Project → Create** → point at that folder / paste the compose →
   it reads `.env`, **pulls** the images, and starts. (Private registry? add it under
   Container Manager → **Registry** and sign in first.)

---

## Path B — no registry (build here, copy a tarball)

On your PC:
```bash
TAG=test ./deploy/save-images.sh          # -> cmms-images-test.tar
```
Copy `cmms-images-test.tar` to the NAS (File Station / SMB). Then, either via SSH
(`docker load -i /volume1/.../cmms-images-test.tar`) or Container Manager → **Image →
Import**. Set `API_IMAGE=cmms-api:test` and `WEB_IMAGE=cmms-web:test` in `.env`, then
create the Project as in Path A step 2 (it uses the loaded images, no pull).

Re-push/re-copy whenever you rebuild.

---

## After it's up

- Browse **http://<NAS-IP>:3000**. QR codes on labels/equipment automatically encode
  that address (they use the URL you're browsing from), so scanning from a phone on the
  same network works — no extra config.
- The API auto-migrates the database on first start (creates all tables, including
  Documents). The `postgres_data` volume persists across restarts/updates.
- Document ingest scans `/volume1/documents` on a timer and via the **Rescan** button
  on `/documents`. With `MANAGED_FOLDERING=true` (default) the mount is read-write and
  the app files uploads/classified docs into `inbox/` and `library/<Category>/`; it
  never touches files in other subfolders. You can also **Upload** files directly from
  the `/documents` page.

## Notes / gotchas

- **Only port 3000 is published**; the API (8080) and Postgres (5432) stay internal.
  Keep it that way — don't port-forward this to the internet (no auth in the MVP). LAN /
  VPN only.
- **`DB_PASSWORD` is fixed at first run** — it's written into the DB when the volume is
  initialized. To change it later you must recreate the `postgres_data` volume (wipes data).
- **Updating:** rebuild + push (or re-save) with a new tag, bump `API_IMAGE`/`WEB_IMAGE`
  in `.env`, and in Container Manager rebuild/clean-and-rebuild the Project.
- **Later, a real hostname / HTTPS (reverse proxy):** QR codes would then need to encode
  that hostname. That value (`NEXT_PUBLIC_QR_BASE_URL`) is baked into the web image at
  build time, so it needs a one-time image rebuild wired for it — ping me when you get there.
