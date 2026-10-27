# Authentication, roles and the rights grid

Status: implemented. Supersedes the "no auth, single user" posture in
`home_maintenance_mvp_requirements.md` §2 and §4.

## Why this shape

The app is reachable by anyone who can reach the NAS, and until now that meant anyone who
could reach it could read and change everything. The obvious fix — a login — would have
broken the feature the app is built around: scanning a QR label and logging maintenance in
one tap, without ceremony.

So the design does not choose between the two. **Every capability is a row in a grid, every
role is a column, and "not signed in" is one of the columns.** Whether a printed label can
still log maintenance without an account is then a checkbox an admin owns, not a policy baked
into the code. Locking the app down completely and leaving the quick-log wide open are both
expressible, and the admin decides which.

Two things follow from that, and they are the whole architecture:

- **The grid says *what*. The label token says *which*.** An anonymous subject granted
  "log maintenance" could otherwise log maintenance on anything, and would need to read
  equipment to do it — handing out the inventory. Instead a scan proves possession of one
  specific label, and that narrows the grant to that one item.
- **Authentication is pluggable; authorization is ours.** Credentials live in
  `UserIdentity`, not on `User`, so adding an identity provider later is an insert and a
  callback endpoint rather than a migration of the user table and everything pointing at it.
  Roles and rights hang off `User` and are indifferent to how someone signed in.

## Data model

```
User           { Id, Username*, DisplayName?, IsActive, CreatedAt, LastLoginAt? }
UserIdentity   { Id, UserId, Provider, Subject, PasswordHash?, CreatedAt, LastUsedAt? }
Role           { Id, Name*, IsSystem, IsAnonymous, IsDefaultForNewUsers, SortOrder }
UserRole       { UserId, RoleId }
RolePermission { RoleId, Permission }
Session        { Id, UserId, TokenHash, UserIdentityId?, CreatedAt, ExpiresAt, LastSeenAt, UserAgent? }
ServerSecret   { Id = 1, LabelSigningKey, RotatedAt }
```

`MaintenanceEvent` gains `CreatedByUserId Guid?` — null for anonymous scans and for every row
that predates this, both of which display as "—" rather than being backfilled to a fiction.
Deleting a user nulls it rather than cascading: the maintenance history is the point of the
app, the account is bookkeeping.

Notes on choices that look arbitrary but are not:

- **`User` holds no credentials.** See above. `UserIdentity.Provider` is `"local"` for a
  password, or e.g. `"oidc:authelia"` later; `Subject` is the provider's stable id (the
  normalised username locally, `sub` for OIDC), unique per provider. A user may hold several
  identities, so a password and SSO can coexist and neither switching to nor away from a
  provider orphans an account.
- **Sessions are opaque random tokens stored server-side**, not encrypted cookie tickets.
  ASP.NET DataProtection's key ring lives in the container filesystem, so self-contained
  cookies would silently sign everyone out on every NAS image rebuild. Server-side rows also
  make revocation — deactivate a user, sign out another device — a row delete.
  Only the SHA-256 of the token is stored, so the table leaking hands nobody a login. A fast
  hash is right here: the input is already 256 bits of entropy, so there is nothing to
  brute-force and no reason to pay a KDF per request.
- **`RolePermission` has no deny rows.** Absence is denial, and a user holds the union of
  their roles' grants. There is therefore no precedence puzzle when someone holds two roles.
- **Permissions are strings, not an enum.** Grants are rows; renaming or reordering an enum
  member would silently repoint every existing grant.
- **`ServerSecret` is deliberately not seeded.** A `HasData` row would bake one
  label-signing key into the migration, so every deployment would share it and every printed
  label would be forgeable by anyone with the source. `LabelSigner` generates it on first use.
  It is a separate table from `AppSettings` because that row is serialized wholesale to
  anyone holding `settings.read`.
- **No ASP.NET Core Identity.** It wants entities deriving from `IdentityUser` and a context
  deriving from `IdentityDbContext`, which would put framework types in `Models/` — this
  project keeps model classes free of infrastructure references. Only `PasswordHasher<T>` is
  borrowed: it ships in the shared framework, needs no package, and constrains nothing but
  `class`.

## Enforcement

`Services/Permissions.cs` is the catalogue: a fixed, code-defined list. Admins assign grants;
they never invent permissions, because a permission only means anything if an endpoint checks
it. Each entry carries its group, label, help text, `AllowedForAnonymous` and
`AlwaysOnForAdmin` — the grid renders whatever is listed there.

`Services/CurrentActor.cs` resolves who is calling. `ActorAccessor.GetAsync()` is memoised per
request and reads permissions **from the database every request**, following
`GetAppSettingsAsync`'s precedent: it is one indexed query, and staying uncached means an edit
in the grid is in force immediately, including for sessions established before the change. An
admin tightening access and finding it unenforced until everyone signed out again would be a
nasty surprise.

`Services/RequirePermission.cs` provides `.RequirePermission(key)`, plus
`.RequireAuthenticated()` (signed in, no particular right — logging out, changing your own
password) and `.Public(why)`. Denials are `Results.Problem` with 401 when nobody is signed in,
403 when signed in but not permitted, and 503 + `setupRequired` on first run, so the client
can tell "offer a login" from "this is not yours to do" from "go and set the app up". The
missing permission is named in the response on purpose: in a household, "ask an admin for
parts.consume" is more use than "forbidden".

Attached **per route, never per group.** A group-wide default would silently cover a route
added later, and "the new endpoint inherited whatever the group had" is exactly how an
unguarded surface appears. `Services/EndpointAudit.cs` then makes that visible:
`app.AuditPermissionCoverage()` **fails startup** if any mapped endpoint has neither a
permission nor an explicit `.Public(...)`. The hole it catches is invisible in review — a new
route simply works, wide open — so a crash on boot naming the route is a much better outcome.

Three independent guards stop an admin locking everyone out, because the failure is
unrecoverable through the UI:

1. The grid renders Admin's `users.manage` / `roles.manage` cells locked.
2. `PUT /roles/permissions` refuses a payload that strips them, or that grants admin
   permissions to Anonymous.
3. `ActorAccessor` adds `Permissions.AdminAlwaysOn` back for system non-anonymous roles
   whatever the grant rows say.

Plus `PUT/DELETE /users/{id}` refuses to remove or deactivate the last active administrator.
Only **people** count toward that: a service account may hold Admin, but it cannot sign in, so
it being "the last admin" would leave nobody at the door.

## API tokens

The fourth kind of caller, for scripts and integrations: `Authorization: Bearer cmms_…`.

**Two owners.**
- **Service accounts** are `User` rows with `Kind = Service`. They have **no `UserIdentity`**, so
  there is no password and `/auth/login` cannot succeed for them. That absence is the guarantee,
  not a branch someone has to remember. They hold roles like anyone else, appear under
  Settings → Access → Accounts, and only an admin (`users.manage`) mints their tokens
  (`POST /users/{id}/tokens`).
- **Personal tokens** belong to a person and act as them. Only that person mints them, from
  `/account` (`POST /auth/tokens`), and only with `tokens.personal`. An admin can list and revoke
  anyone's tokens but cannot mint one for a person: that would be impersonation with extra steps,
  since everything it did would read as theirs.

**What a token may do** is its own scope rows (`ApiTokenPermission`, shaped like `RolePermission`)
**intersected with the owner's role permissions at the time of the request**. The grid stays the
ceiling. An edit there narrows every token immediately, and a token never outlives its owner
losing a right. Minting refuses scopes the owner doesn't currently hold, so a token never lists
rights it can't use. A refusal caused by the scope rather than the roles says so (`tokenScope`),
because the fix is a new token rather than a word with an admin.

**Resolution.** If a bearer header is present it is the **only** credential considered; cookies
are ignored, so a script run from a signed-in browser is exactly as capable as its token. Lookup
is by SHA-256, like sessions; the plaintext is shown once at creation and never stored. A bearer
that names no valid token (unknown, expired, revoked, or the owner deactivated) gets a **401 from
middleware before any endpoint runs**. It is never quietly downgraded to Anonymous, which would
let a broken key keep "working" on anonymous-permitted routes until something important failed.
Events logged by a token record the owner in `CreatedByUserId`.

**What a token can never do**, whatever its scope:
- Anything under `.RequireAuthenticated()`: password change, sessions, listing own tokens.
  Those are the account holder's self-service routes.
- Anything marked `.SessionOnly()`, i.e. both minting routes. A token that could mint tokens could
  outlive its own revocation by leaving a successor behind.

**Expiry.**
- Personal tokens **must** expire, at most `Auth__PersonalTokenMaxDays` (default 365) out; the UI
  defaults to 90 days. They act as a person, the account more likely to be phished or shared.
- Service-account tokens may be open-ended: an integration silently breaking on a forgotten date
  is its own outage.
- Expired rows are kept, not deleted on sight like sessions, so the owner sees the token lapsed
  rather than it vanishing.
- Changing your password revokes your personal tokens, for the same reason it signs out your
  other sessions.

Tokens work through the web port (`/api/…`): the proxy forwards `Authorization`, which matters
because the NAS deploy publishes nothing else.

## Label tokens

```
t = Base64Url(HMACSHA256(LabelSigningKey, "equipment:" + id)[..16])   # an item's label
t = Base64Url(HMACSHA256(LabelSigningKey, "location:" + id)[..16])    # a place's label
```

The prefix makes tokens kind-specific: a place's token presented as an item's does not verify.
`"equipment:"` is what every label printed before places existed signed, so it must never
change.

Deterministic, so reprinting a label yields the same token: no per-item column, and a lost
label cannot be "reissued" into a second valid value. 128 bits, which keeps the QR scannable
on a 40 mm label and is far past anything worth brute-forcing on a home network.

A scan hands that token to `POST /auth/label-session`, which verifies it and sets a
short-lived (2 h) signed cookie naming the item or place (`e:{id}` / `l:{id}` inside the
signed payload, so one kind can't be relabelled as the other). The rest of the request path then needs no
token plumbing, and `lib/api.ts` stays free of per-call token handling. The cookie is signed
rather than stored: nothing to clean up, nothing to leak.

Routes a label scan may reach are marked `.AllowLabelScope()` — a short, reviewable list
rather than "whatever Anonymous happens to be granted". Everything else refuses a label-scoped
caller outright. Each of those handlers must call `actor.MayTouchEquipment(id)` — or, for
events and rules, `actor.MayTouchTarget(equipmentId, storageLocationId)` — itself, since the
filter cannot know whether the id is in the route, the query or the body. `MayTouchTarget`
requires *both* halves to match the scope, so an item's label cannot reach a place (or the
equipment stored in it, for a place's label), and an unfiltered list is refused.

A place's label reaches only `/storage/{id}/log`, not the place's contents page: that needs
`storage.read`, which Anonymous does not hold and a label does not grant. So only the log QR on
a place label carries a token (`proxy.ts` lets `/storage/{id}/log` through unauthenticated for
the same reason). Place labels printed before this need reprinting to get a log QR at all.

`POST /auth/label-key/rotate` (needs `settings.manage`) re-rolls the key and invalidates every
label already printed. Deliberately blunt: tokens are derived rather than stored, so there is
no per-label revocation, and "reprint everything" is an honest and comprehensible remedy for a
label having left the house.

**Existing printed labels have no `?t=`.** Signed-in users scanning them are unaffected.
Anonymous scans of them stop working and the labels need reprinting from `/labels` — the
accepted cost of choosing signed tokens over trusting a guessable URL.

## Cookies and CSRF

Session cookies are `HttpOnly`, `Path=/`, `SameSite=Lax`, and `Secure` only when
`Auth__SecureCookies=true`.

- **Lax, not Strict**: scanning a QR code is a top-level cross-origin navigation, and Strict
  would drop the session on arrival — a signed-in user would land on their own app logged out.
- **Secure is opt-in and cannot be inferred**: the API only ever sees the proxy's plain-HTTP
  hop, so `Request.IsHttps` is false even when the browser is on HTTPS. Defaulting it on would
  mean the cookie is never sent on a plain-HTTP LAN, silently breaking sign-in with no clue why.

`SameSite=Lax` refuses cross-site POSTs, and that is what now makes `.DisableAntiforgery()` on
`POST /documents/upload` defensible.

Bearer tokens need no CSRF defence: a browser never attaches an `Authorization` header on its
own, so a hostile page cannot make one ride along.

## First run and recovery

With no accounts, `GET /auth/me` reports `setupRequired` and every guarded endpoint returns
503 rather than 401, so the client sends the operator to `/setup` instead of a login form no
password can satisfy. `POST /auth/setup` creates the first administrator and refuses once any
account exists.

> **Deploy note.** Between applying the migration and completing setup, `/setup` is open to
> anyone who can reach the app — on a LAN that is a short window, but it is real. To close it
> entirely, set `Auth__ResetAdmin` before the container's first boot: it runs at startup,
> before any request is served, so the account already exists and `/setup` refuses.

`Auth__ResetAdmin="username:password"` is the recovery hatch, applied once at startup: it
creates the account if missing, resets the password if present, reactivates it, restores the
Admin role, and drops that user's other sessions. Logged at warning level whether or not it
changes anything. It exists because the alternative failure mode needs a `psql` prompt: the
NAS's only door is this app, and an admin who mistypes a password change or unchecks the wrong
cell has no other way back in. Remove the variable and restart afterwards.

## Client

`lib/api.ts` throws `ApiError` carrying `status`, `permission`, `setupRequired`, `labelScoped`
and validation `errors`, so a page can tell a denial from a fault. `components/AuthProvider.tsx`
loads `/auth/me` once and exposes `can(permission)` for hiding and disabling controls — a
courtesy to the user, never a security boundary, since the API enforces independently.

It renders children immediately rather than gating on the fetch: the quick-log flow depends on
the form painting from local defaults and being usable in one tap, and blocking the tree on an
auth round-trip would put a request in front of every scan.

`proxy.ts` (Next 16 renamed `middleware` to **proxy**) does an optimistic cookie-presence
redirect for page routes only, per Next's own guidance that Proxy must not be the sole
defence. The QR paths are exempt.

Cookies alone can't tell whether *not* signing in is enough, and an admin can let Anonymous
browse. So a visit carrying no cookie at all asks the API's `/auth/me` what Anonymous may do,
cached for 15 s, and skips the redirect when Anonymous holds a **browse** permission
(`equipment.list`, `parts.list`, `documents.list` or `storage.read`). The seeded quick-log grants
are deliberately not on that list: a label-only Anonymous still sends a browsing visitor to
sign in. A grid change reaches the redirect within the cache window. An unreachable API falls
back to redirecting, the old behaviour. Pages Anonymous can reach but not use show their own
denial, as they do for a signed-in user.

**Service-worker caching mattered here.** `@ducanh2912/next-pwa`'s default runtime caching
stores every same-origin `/api/*` GET in a cache named `apis` (NetworkFirst), which would
leave authorised responses on the device to be served offline after sign-out. `/api` is now
excluded, and logout clears the cache — without that, "signed out" would not be true on a
device that keeps working without a network.

**Sign-in, sign-out and setup end in a full page load**, never `router.push`. The BottomNav
links on `/login` are prefetched while signed out, `proxy.ts` answers those prefetches with a
redirect to `/login`, and the client router caches the answer — so a client-side push to `/`
after signing in replayed that redirect and left the form on "Signing in…" until the entry went
stale. A full load also re-reads `/auth/me` from scratch, so nothing from the previous
identity survives. The rule lives in `AuthProvider`'s `login`/`logout`.

**The account page** (`/account`, from the account menu) shows the caller's own details and
signed-in devices (`GET/DELETE /auth/sessions`), with a per-device sign-out. Name and roles are
read-only there — they are what an admin assigns.

**Changing your own password** (`/account/password`, linked from the account page) signs out every
*other* session of that account; the one making the change stays signed in. The usual reason
to change a password is suspecting someone else knows it, and a session they already hold
would otherwise outlive the change. An admin setting a password in *Settings → Access* does
not revoke sessions — deactivate the account for that.

## Seeded roles

| Role | Grants |
|---|---|
| **Admin** (system) | Everything. Cannot lose `users.manage` / `roles.manage`. |
| **Member** (default for new users) | Everything day-to-day, including deletes and sensitive documents; not `users.manage`, `roles.manage`, `settings.manage`, `tokens.personal`, `api.docs` or `events.delete`. |
| **Viewer** | Read-only: view and browse equipment, history, schedules, storage, parts, documents, categories, links, settings. Not sensitive documents. |
| **Anonymous** (system) | `equipment.read`, `events.read`, `events.create`, `rules.read` — exactly enough to scan a label, log maintenance and see the result. No browsing. |

Anonymous's grants are the default posture: the quick-log survives an upgrade, nothing else
does. Widen or close it from `/settings/access`.

## Endpoint → permission map

Reads split into "one by id" and "browse/search" wherever it matters (`equipment`, `parts`,
`documents`): that is what lets a role — or a label scan — see one scanned item without being
handed the inventory.

| Area | Route | Permission |
|---|---|---|
| Auth | `GET /auth/me` | public |
| | `POST /auth/login`, `/auth/logout`, `/auth/setup` | public |
| | `POST /auth/label-session` | public (holding the label is the credential) |
| | `POST /auth/password`, `GET/DELETE /auth/sessions` | signed in (session, not a token) |
| | `GET /auth/tokens`, `/auth/tokens/grantable-permissions`, `DELETE /auth/tokens/{id}` | signed in (session, not a token) |
| | `POST /auth/tokens` | `tokens.personal`, session only |
| | `GET /auth/label-tokens` | `equipment.list` |
| | `GET /auth/location-label-tokens` | `storage.read` |
| | `POST /auth/label-key/rotate` | `settings.manage` |
| Equipment | `GET /equipment` | `equipment.list` |
| | `GET /equipment/{id}` | `equipment.read` — label-scopable |
| | `POST`, `PUT /equipment/{id}` | `equipment.write` |
| | `DELETE /equipment/{id}` | `equipment.delete` |
| | `POST /equipment/{id}/checkout`, `/return` | `equipment.lend` |
| Events | `GET /events`, `GET /events/{id}` | `events.read` — label-scopable |
| | `POST /events` | `events.create` — label-scopable |
| | `PUT /events/{id}` | `events.edit` |
| | `DELETE /events/{id}` | `events.delete` (Admin only by default) |
| Rules | `GET /rules` | `rules.read` — label-scopable |
| | `POST`, `PUT /rules/{id}` | `rules.write` |
| | `DELETE /rules/{id}` | `rules.delete` |
| Meters | `GET /meters`, `/meters/{id}`, `/meters/{id}/readings` | `meters.read` |
| | `POST /meters/{id}/readings`, `POST /meters/readings` (batch) | `meters.record` |
| | `POST`/`PUT`/`DELETE /meters`, `/rebase`, `/replace`, `DELETE …/readings/{id}` | `meters.write` |
| | `POST /meters/prune` (apply retention now) | `settings.manage` |
| Storage | all `GET` (incl. `/{id}/contents`) | `storage.read` |
| | `POST`, `PUT` (incl. move) | `storage.write` |
| | `DELETE` | `storage.delete` |
| Parts | `GET /parts` | `parts.list` |
| | `GET /parts/{id}` | `parts.read` |
| | `POST`, `PUT` | `parts.write` |
| | `DELETE` | `parts.delete` |
| Part usages | `GET /part-usages` | `parts.read` |
| | `POST`, `DELETE` | `parts.consume` |
| Documents | `GET /documents` | `documents.list` |
| | `GET /documents/{id}` | `documents.read` |
| | `GET /documents/{id}/content` | `documents.download` |
| | `PUT /{id}/classify`, `POST /{id}/ignore`, `/{id}/unclassify` | `documents.classify` |
| | `POST /documents/upload` | `documents.upload` |
| | `POST /documents/scan` | `documents.scan` |
| | `DELETE /documents/{id}`, `POST /prune-missing` | `documents.delete` |
| Categories | `GET` on all three category resources | `categories.read` |
| | `POST`, `PUT`, `DELETE` on all three | `categories.manage` |
| External links | `GET /external-links` | `links.read` |
| | `POST`, `PUT`, `DELETE` | `links.write` |
| Settings | `GET /app-settings` | `settings.read` |
| | `PUT /app-settings` | `settings.manage` |
| Users | all `/users`, incl. `GET /users/{id}/tokens`, `/grantable-permissions`, `DELETE …/tokens/{id}` | `users.manage` |
| | `POST /users/{id}/tokens` (service accounts only) | `users.manage`, session only |
| Docs | `/swagger/*` (middleware, both ports) | `api.docs` |
| Roles | all `/roles`, `PUT /roles/permissions` | `roles.manage` |

### Sensitive documents

`documents.read_sensitive` is additive and enforced as a **query filter**, not an endpoint
gate. Without it, documents whose category is marked `Sensitive` are excluded from lists and
return **404** — not 403 — on fetch and download, because a 403 confirms the document exists,
which leaks the very thing the flag is for. Receipt and Invoice are seeded sensitive.

This is the enforcement `DocumentCategory.Sensitive` was waiting for; it had been stored and
editable but inert since the document-management work.

## Not done

- **External identity providers.** The seam is in place (`UserIdentity`, `Session.UserIdentityId`,
  `Role.IsDefaultForNewUsers` for just-in-time provisioning) but no provider is wired.
- **Rate limiting on sign-in.** LAN-only for now; worth adding before this is ever exposed.
- **Rate limiting on bearer tokens.** Unnecessary for guessing (256 random bits), but nothing
  stops a misbehaving script hammering the NAS.
- **Sensitive-category gating beyond documents.** The flag only affects documents.
