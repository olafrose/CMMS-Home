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

   > **Write permission:** the API image is chiseled and runs as non-root UID 1654,
   > which can't write the share. The compose runs the api container as
   > `${PUID:-1026}:${PGID:-100}` — set `PUID`/`PGID` in `.env` to a DSM user (UID)
   > and the `users` group (GID 100) that own/can-write the `documents` share. Find
   > a UID over SSH with `id <username>`. If uploads return 500 "Could not write the
   > uploaded file," this is almost always the cause.
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
- **Create the first administrator.** The app sends you to `/setup`. Until you do that,
  nothing else works — every other endpoint answers "setup required" rather than
  "sign in", including the anonymous QR quick-log.

  > `/setup` is open to whoever gets there first. On a LAN that window is short, but if
  > you would rather not have one at all, set `RESET_ADMIN=user:password` in `.env`
  > **before the first start**: it is applied during startup, before any request is
  > served, so the account already exists and `/setup` refuses. Clear the variable and
  > restart afterwards.

- **Reprint your labels.** Printed QR labels now carry a signed token, and labels printed
  before this release do not have one. Signed-in users scanning an old label are fine;
  *anonymous* scans of them stop working until you reprint from `/labels`. If you would
  rather not reprint, grant the Anonymous role more in `/settings/access` — but understand
  that widens it beyond the one scanned item.

- **Decide the posture** at *Settings → Access*. Out of the box, "Anonymous" can scan a
  label, log maintenance and see what it logged, and nothing else — no browsing the
  inventory. Everything beyond that needs an account. Tighten or widen it there; the
  Anonymous column is what decides whether the ≤10s QR flow needs a login.

- **If you lock yourself out**, set `RESET_ADMIN=user:password` in `.env` and restart the
  api container. It resets that account's password, reactivates it, restores the Admin
  role and drops its other sessions, logging loudly. Remove the variable and restart
  again. Without this the only way back would be a `psql` prompt — the NAS's only door is
  this app.
- Document ingest scans `/volume1/documents` on a timer and via the **Rescan** button
  on `/documents`. With `MANAGED_FOLDERING=true` (default) the mount is read-write and
  the app files uploads/classified docs into `inbox/` and `library/<Category>/`; it
  never touches files in other subfolders. You can also **Upload** files directly from
  the `/documents` page.

## Notes / gotchas

- **Only port 3000 is published**; the API (8080) and Postgres (5432) stay internal.
  Keep it that way — don't port-forward this to the internet. There is authentication now,
  but no rate limiting on sign-in and no TLS of its own. LAN / VPN only.
- **`DB_PASSWORD` is fixed at first run** — it's written into the DB when the volume is
  initialized. To change it later you must recreate the `postgres_data` volume (wipes data).
- **Updating:** rebuild + push (or re-save) with a new tag, bump `API_IMAGE`/`WEB_IMAGE`
  in `.env`, and in Container Manager rebuild/clean-and-rebuild the Project.
## HTTPS — and why the live viewfinder needs it

The `/scan` page has two modes. **"Open Camera to Scan"** is an `<input type="file"
capture="environment">`: a file picker that hands off to the phone's camera app, and it works
over plain HTTP. The **live viewfinder** uses `getUserMedia`, which browsers only expose in a
**secure context** — so `app/scan/page.tsx` checks `window.isSecureContext` and simply doesn't
mount it otherwise.

That is why it works on a dev machine and not on the NAS: `localhost` is treated as a secure
context even over plain HTTP; `http://<NAS-IP>:3000` is not. Nothing in the app is stopping it,
and no app change can — the browser owns that gate.

The fix is HTTPS with a certificate **the phone trusts**. A bare self-signed cert is not
enough: it stays an insecure context unless you install its CA on every device.

Options, best fit for this setup first:

1. **Tailscale** (recommended — this deployment is already LAN/VPN-only). Install the Synology
   package, then use Tailscale Serve / `tailscale cert` to front the app on
   `https://<nas>.<tailnet>.ts.net`. You get a real Let's Encrypt certificate with **no port
   forwarding and no DNS records to manage**, and phones on the tailnet reach it from anywhere.
2. **DSM reverse proxy + Let's Encrypt via Synology DDNS.** Control Panel → Security →
   Certificate to issue a cert for a `*.synology.me` DDNS name, then Login Portal → Advanced →
   Reverse Proxy mapping `https://cmms.<name>.synology.me:443` → `http://localhost:3000`.
   Everything stays in DSM. Check what issuance needs on your DSM version — some paths want
   port 80 reachable briefly for validation.
3. **Your own CA.** No internet dependency at all, but you must install the CA on each Android
   device, and Android keeps making user-installed CAs more awkward.
4. **Stopgap for testing only:** Chrome → `chrome://flags` → *Insecure origins treated as
   secure*, add `http://<NAS-IP>:3000`. Per-device and lost when flags reset.

### Three things to change when you switch

- **`NEXT_PUBLIC_QR_BASE_URL=https://…`** — it is a `NEXT_PUBLIC_` variable, so it is inlined
  into the bundle at **build time**. Editing `.env` is not enough: rebuild and repush the web
  image.
- **Reprint the labels.** Printed QR codes encode the origin they were printed from, so old
  labels would still point at `http://<NAS-IP>:3000`. Note you **already** need a reprint for
  the signed label tokens that came with authentication — so do both in one pass rather than
  reprinting twice.
- **`SECURE_COOKIES=true`** in `.env`. It cannot be inferred: with a reverse proxy in front,
  the API only ever sees the proxy's plain-HTTP hop, so `Request.IsHttps` is false even though
  the browser is on HTTPS.

Worth having anyway: PWA "add to home screen" also requires a secure context, so HTTPS turns
this into a properly installable app rather than a bookmark.
