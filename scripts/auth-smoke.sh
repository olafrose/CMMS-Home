#!/usr/bin/env bash
#
# End-to-end check of the permission grid against a running stack.
#
# There is no test project in this repo, and the thing most worth checking here is not a unit
# of code but a matrix: N roles x ~35 permissions x 57 routes. Asserting a representative
# endpoint per permission per role is the only practical way to know the grid actually bites,
# and it doubles as the regression net a newly added endpoint has to pass.
#
# Usage:
#   scripts/auth-smoke.sh                        # against the API directly
#   BASE=http://localhost:3000/api ...           # through the web proxy (also tests cookie forwarding)
#   ADMIN_USER=me ADMIN_PASS=... ...             # against a stack that is already set up
#
# Exits non-zero on the first failing expectation, and prints a summary.

set -uo pipefail

BASE="${BASE:-http://localhost:8080}"
ADMIN_USER="${ADMIN_USER:-smokeadmin}"
ADMIN_PASS="${ADMIN_PASS:-smoke-admin-pw-1}"

JARS=$(mktemp -d)
trap 'rm -rf "$JARS"' EXIT

PASS=0
FAIL=0
SKIP=0

c_ok=$'\033[32m'; c_bad=$'\033[31m'; c_dim=$'\033[2m'; c_off=$'\033[0m'

# status METHOD PATH JAR [JSON]
status() {
  local method="$1" path="$2" jar="$3" data="${4:-}"
  if [ -n "$data" ]; then
    curl -s -o /dev/null -w '%{http_code}' -X "$method" \
      -H 'Content-Type: application/json' -d "$data" \
      -b "$JARS/$jar" -c "$JARS/$jar" "$BASE$path"
  else
    curl -s -o /dev/null -w '%{http_code}' -X "$method" \
      -b "$JARS/$jar" -c "$JARS/$jar" "$BASE$path"
  fi
}

# body METHOD PATH JAR [JSON]
body() {
  local method="$1" path="$2" jar="$3" data="${4:-}"
  if [ -n "$data" ]; then
    curl -s -X "$method" -H 'Content-Type: application/json' -d "$data" \
      -b "$JARS/$jar" -c "$JARS/$jar" "$BASE$path"
  else
    curl -s -X "$method" -b "$JARS/$jar" -c "$JARS/$jar" "$BASE$path"
  fi
}

# expect DESCRIPTION EXPECTED ACTUAL
expect() {
  if [ "$2" = "$3" ]; then
    PASS=$((PASS + 1))
    printf '  %sok%s   %-58s %s\n' "$c_ok" "$c_off" "$1" "$3"
  else
    FAIL=$((FAIL + 1))
    printf '  %sFAIL%s %-58s expected %s, got %s\n' "$c_bad" "$c_off" "$1" "$2" "$3"
  fi
}

# expect_one_of DESCRIPTION "401 403" ACTUAL   -- for denials where either is correct
expect_one_of() {
  if [[ " $2 " == *" $3 "* ]]; then
    PASS=$((PASS + 1))
    printf '  %sok%s   %-58s %s\n' "$c_ok" "$c_off" "$1" "$3"
  else
    FAIL=$((FAIL + 1))
    printf '  %sFAIL%s %-58s expected one of [%s], got %s\n' "$c_bad" "$c_off" "$1" "$2" "$3"
  fi
}

section() { printf '\n%s== %s%s\n' "$c_dim" "$1" "$c_off"; }

jq_r() { node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    try { const v=process.argv[1].split(".").reduce((a,k)=>k?a?.[k]:a, JSON.parse(s)); console.log(v ?? "") }
    catch { console.log("") }
  })' "$1"; }

# ---------------------------------------------------------------------------------------
section "reachability"
me=$(body GET /auth/me anon)
if [ -z "$me" ]; then
  echo "  cannot reach $BASE/auth/me — is the stack up?"
  exit 1
fi
echo "  $BASE reachable"

# ---------------------------------------------------------------------------------------
section "first-run setup"
setup_required=$(printf '%s' "$me" | jq_r setupRequired)

if [ "$setup_required" = "true" ]; then
  # While unconfigured, guarded endpoints must report 503 + setupRequired rather than 401, so
  # the client sends the operator to /setup instead of a login form no password can satisfy.
  expect "guarded endpoint while unconfigured" "503" "$(status GET /equipment anon)"

  code=$(status POST /auth/setup admin \
    "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\",\"displayName\":\"Smoke Admin\"}")
  expect "POST /auth/setup creates first admin" "200" "$code"

  # And must refuse to mint a second admin once anyone exists.
  expect "POST /auth/setup again is refused" "409" \
    "$(status POST /auth/setup anon "{\"username\":\"x2\",\"password\":\"another-pw-123\"}")"
else
  echo "  already set up; signing in as $ADMIN_USER"
  code=$(status POST /auth/login admin \
    "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")
  expect "POST /auth/login as admin" "200" "$code"
fi

admin_perm_count=$(body GET /auth/me admin | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    try { console.log(JSON.parse(s).permissions.length) } catch { console.log(0) }})')
expect "admin holds the whole catalogue" "41" "$admin_perm_count"

# ---------------------------------------------------------------------------------------
section "wrong credentials"
expect "login with a bad password" "401" \
  "$(status POST /auth/login bad "{\"username\":\"$ADMIN_USER\",\"password\":\"definitely-wrong\"}")"
expect "login with an unknown user" "401" \
  "$(status POST /auth/login bad '{"username":"nobody-here","password":"whatever-123"}')"

# ---------------------------------------------------------------------------------------
section "per-role users"
grid=$(body GET /roles admin)
role_id() { printf '%s' "$grid" | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    const r=JSON.parse(s).roles.find(r=>r.name===process.argv[1]); console.log(r?r.id:"")})' "$1"; }

member_role=$(role_id Member)
viewer_role=$(role_id Viewer)
anon_role=$(role_id Anonymous)

for spec in "smokemember:$member_role" "smokeviewer:$viewer_role"; do
  user="${spec%%:*}"; role="${spec##*:}"
  code=$(status POST /users admin \
    "{\"username\":\"$user\",\"password\":\"smoke-pw-12345\",\"isActive\":true,\"roleIds\":[\"$role\"]}")
  # 400 = already exists from an earlier run, which is fine.
  expect_one_of "create $user" "201 400" "$code"
  status POST /auth/login "$user" "{\"username\":\"$user\",\"password\":\"smoke-pw-12345\"}" >/dev/null
done

# ---------------------------------------------------------------------------------------
section "the matrix"
# One representative endpoint per capability, per role. 2xx where granted, 401/403 where not.

# Admin: everything.
expect "admin  GET /equipment"        "200" "$(status GET /equipment admin)"
expect "admin  GET /parts"            "200" "$(status GET /parts admin)"
expect "admin  GET /documents"        "200" "$(status GET /documents admin)"
expect "admin  GET /app-settings"     "200" "$(status GET /app-settings admin)"
expect "admin  GET /users"            "200" "$(status GET /users admin)"
expect "admin  GET /roles"            "200" "$(status GET /roles admin)"

# Member: everything day-to-day, nothing administrative.
expect "member GET /equipment"        "200" "$(status GET /equipment smokemember)"
expect "member GET /parts"            "200" "$(status GET /parts smokemember)"
expect "member GET /app-settings"     "200" "$(status GET /app-settings smokemember)"
expect "member PUT /app-settings"     "403" \
  "$(status PUT /app-settings smokemember '{"storageMaxDepth":6,"pathShorteningMode":"LastNSegments","pathShorteningSegments":2}')"
expect "member GET /users"            "403" "$(status GET /users smokemember)"
expect "member GET /roles"            "403" "$(status GET /roles smokemember)"

# Viewer: reads only.
expect "viewer GET /equipment"        "200" "$(status GET /equipment smokeviewer)"
expect "viewer POST /equipment"       "403" "$(status POST /equipment smokeviewer '{"name":"Nope","kind":"Asset"}')"
expect "viewer POST /events"          "403" "$(status POST /events smokeviewer '{"equipmentId":"00000000-0000-0000-0000-000000000000","type":"maintenance"}')"
expect "viewer GET /users"            "403" "$(status GET /users smokeviewer)"

# Anonymous: no browsing at all, by default.
expect "anon   GET /equipment (list)" "401" "$(status GET /equipment anon)"
expect "anon   GET /parts"            "401" "$(status GET /parts anon)"
expect "anon   GET /documents"        "401" "$(status GET /documents anon)"
expect "anon   GET /app-settings"     "401" "$(status GET /app-settings anon)"
expect "anon   GET /users"            "401" "$(status GET /users anon)"

# ---------------------------------------------------------------------------------------
section "lockout guards"
admin_role=$(role_id Admin)

# Stripping Admin's own administrative rights must be refused, from all three directions.
expect "strip users.manage from Admin" "400" \
  "$(status PUT /roles/permissions admin "{\"grants\":{\"$admin_role\":[\"equipment.read\"]}}")"

expect "grant users.manage to Anonymous" "400" \
  "$(status PUT /roles/permissions admin \
    "{\"grants\":{\"$anon_role\":[\"equipment.read\",\"users.manage\"]}}")"

admin_id=$(body GET /auth/me admin | jq_r user.id)

# The last-admin guards only mean anything when this IS the last admin. Run against an install
# that has two, they would correctly permit the change and report a confusing failure — so
# count first and say why rather than asserting something untrue of the fixture.
active_admins=$(body GET /users admin | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    try { console.log(JSON.parse(s).filter(u=>u.isActive && u.roles.some(r=>r.name==="Admin")).length) }
    catch { console.log(0) }})')

if [ "$active_admins" = "1" ]; then
  expect "deactivate the last admin" "400" \
    "$(status PUT "/users/$admin_id" admin \
      "{\"username\":\"$ADMIN_USER\",\"isActive\":false,\"roleIds\":[\"$admin_role\"]}")"
  expect "drop the last admin's Admin role" "400" \
    "$(status PUT "/users/$admin_id" admin \
      "{\"username\":\"$ADMIN_USER\",\"isActive\":true,\"roleIds\":[\"$member_role\"]}")"
  expect "delete the last admin" "400" "$(status DELETE "/users/$admin_id" admin)"
else
  SKIP=$((SKIP + 1))
  echo "  skipped last-admin guards: $active_admins active admins, so they correctly do not fire"
fi

expect "delete a system role" "400" "$(status DELETE "/roles/$anon_role" admin)"
expect "delete a role users still hold" "400" "$(status DELETE "/roles/$member_role" admin)"

# ---------------------------------------------------------------------------------------
section "label tokens and the anonymous quick-log"
eq_id=$(body GET /equipment admin | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    try { const a=JSON.parse(s); console.log(a.length?a[0].id:"") } catch { console.log("") }})')

if [ -z "$eq_id" ]; then
  SKIP=$((SKIP + 1))
  echo "  skipped: no equipment in this database to scan"
else
  token=$(body GET "/auth/label-tokens?equipment_id=$eq_id" admin | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      try { console.log(Object.values(JSON.parse(s))[0] ?? "") } catch { console.log("") }})')

  expect "a token was issued" "true" "$([ -n "$token" ] && echo true || echo false)"

  expect "tampered token is refused" "401" \
    "$(status POST /auth/label-session tampered "{\"equipmentId\":\"$eq_id\",\"token\":\"not-a-real-token\"}")"
  expect "missing token is refused" "401" \
    "$(status POST /auth/label-session notoken "{\"equipmentId\":\"$eq_id\"}")"

  expect "valid token opens a label session" "200" \
    "$(status POST /auth/label-session label "{\"equipmentId\":\"$eq_id\",\"token\":\"$token\"}")"

  # The whole point: this works without an account.
  expect "labelled anon GET /equipment/{id}" "200" "$(status GET "/equipment/$eq_id" label)"
  expect "labelled anon GET /rules?equipment_id" "200" "$(status GET "/rules?equipment_id=$eq_id" label)"
  expect "labelled anon POST /events" "201" \
    "$(status POST /events label "{\"equipmentId\":\"$eq_id\",\"type\":\"maintenance\",\"note\":\"auth smoke test\"}")"

  # ...and buys nothing else. Either code is a refusal, and which one fires is not the
  # property under test: 403 when the permission is held but the route is not label-scopable
  # (rules, unfiltered), 401 when the Anonymous role never held the permission at all — a
  # list, a write, a delete. Asserting one specific code here would be testing the message
  # rather than the boundary.
  expect_one_of "labelled anon GET /equipment (list)" "401 403" "$(status GET /equipment label)"
  expect_one_of "labelled anon GET /rules (unfiltered)" "401 403" "$(status GET /rules label)"
  expect_one_of "labelled anon PUT /equipment/{id}" "401 403" \
    "$(status PUT "/equipment/$eq_id" label '{"name":"Renamed by a sticker","kind":"Asset"}')"
  expect_one_of "labelled anon DELETE /equipment/{id}" "401 403" \
    "$(status DELETE "/equipment/$eq_id" label)"

  # A token for one item must not work on another.
  other_id=$(body GET /equipment admin | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      try { const a=JSON.parse(s); console.log(a.length>1?a[1].id:"") } catch { console.log("") }})')
  if [ -n "$other_id" ]; then
    expect "token for A rejected on B" "403" "$(status GET "/equipment/$other_id" label)"
    expect "cannot log against B with A's scope" "403" \
      "$(status POST /events label "{\"equipmentId\":\"$other_id\",\"type\":\"maintenance\"}")"
  else
    SKIP=$((SKIP + 1)); echo "  skipped cross-item check: only one equipment row"
  fi

  # Rotation invalidates every label already printed.
  expect "rotate the label key" "200" "$(status POST /auth/label-key/rotate admin)"
  expect "old token now refused" "401" \
    "$(status POST /auth/label-session stale "{\"equipmentId\":\"$eq_id\",\"token\":\"$token\"}")"
fi

# ---------------------------------------------------------------------------------------
section "places as maintenance targets"
# A place's label is scoped exactly like an item's: that one place, nothing else — not even
# the equipment stored in it. Uses an existing place, as above uses existing equipment, so the
# run leaves one smoke-test event behind rather than an undeletable place.
place_id=$(body GET /storage-locations admin | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    try { const a=JSON.parse(s); console.log(a.length?a[0].id:"") } catch { console.log("") }})')

if [ -z "$place_id" ]; then
  SKIP=$((SKIP + 1))
  echo "  skipped: no places in this database to scan"
else
  ptoken=$(body GET "/auth/location-label-tokens?storage_location_id=$place_id" admin | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      try { console.log(Object.values(JSON.parse(s))[0] ?? "") } catch { console.log("") }})')
  expect "a place token was issued" "true" "$([ -n "$ptoken" ] && echo true || echo false)"

  # Tokens are signed per kind: a place's token presented as an item's must not verify.
  expect "place token refused as an equipment token" "401" \
    "$(status POST /auth/label-session crosskind "{\"equipmentId\":\"$place_id\",\"token\":\"$ptoken\"}")"
  expect "label session naming both targets" "400" \
    "$(status POST /auth/label-session both "{\"equipmentId\":\"$place_id\",\"storageLocationId\":\"$place_id\",\"token\":\"$ptoken\"}")"

  expect "valid place token opens a label session" "200" \
    "$(status POST /auth/label-session plabel "{\"storageLocationId\":\"$place_id\",\"token\":\"$ptoken\"}")"
  expect "place-labelled anon GET /rules?storage_location_id" "200" \
    "$(status GET "/rules?storage_location_id=$place_id" plabel)"
  expect "place-labelled anon GET /events?storage_location_id" "200" \
    "$(status GET "/events?storage_location_id=$place_id" plabel)"
  expect "place-labelled anon POST /events on the place" "201" \
    "$(status POST /events plabel "{\"storageLocationId\":\"$place_id\",\"type\":\"cleaning\",\"note\":\"auth smoke test\"}")"

  expect_one_of "place-labelled anon GET /storage-locations" "401 403" "$(status GET /storage-locations plabel)"
  expect_one_of "place-labelled anon GET /events (unfiltered)" "401 403" "$(status GET /events plabel)"
  if [ -n "${eq_id:-}" ]; then
    expect "place scope cannot log on equipment" "403" \
      "$(status POST /events plabel "{\"equipmentId\":\"$eq_id\",\"type\":\"maintenance\"}")"
    expect "place scope cannot read equipment" "403" "$(status GET "/equipment/$eq_id" plabel)"
    # And the reverse: an item's scope (the jar from above, re-issued after the rotation)
    # cannot reach a place.
    etoken=$(body GET "/auth/label-tokens?equipment_id=$eq_id" admin | node -e '
      let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
        try { console.log(Object.values(JSON.parse(s))[0] ?? "") } catch { console.log("") }})')
    status POST /auth/label-session elabel "{\"equipmentId\":\"$eq_id\",\"token\":\"$etoken\"}" > /dev/null
    expect "equipment scope cannot log on a place" "403" \
      "$(status POST /events elabel "{\"storageLocationId\":\"$place_id\",\"type\":\"maintenance\"}")"
  fi

  # Exactly one target, for signed-in callers too.
  expect "event naming both targets" "400" \
    "$(status POST /events admin "{\"equipmentId\":\"${eq_id:-$place_id}\",\"storageLocationId\":\"$place_id\",\"type\":\"maintenance\"}")"
  expect "event naming no target" "400" "$(status POST /events admin '{"type":"maintenance"}')"

  # History pins a place: deleting it is refused rather than cascading.
  expect "delete a place with logged history" "400" "$(status DELETE "/storage-locations/$place_id" admin)"

  # A schedule is in the way only until it is deleted. A throwaway place, so this is undone.
  tmp_place=$(body POST /storage-locations admin '{"name":"auth smoke place"}' | jq_r id)
  tmp_rule=$(body POST /rules admin \
    "{\"storageLocationId\":\"$tmp_place\",\"scheduleType\":\"Interval\",\"intervalValue\":3,\"intervalUnit\":\"Months\",\"dueWindowValue\":0,\"dueWindowUnit\":\"Days\",\"reminderLeadValue\":30,\"reminderLeadUnit\":\"Days\"}" \
    | jq_r id)
  expect "a schedule on a place was created" "true" "$([ -n "$tmp_rule" ] && echo true || echo false)"
  expect "delete a place with a schedule" "400" "$(status DELETE "/storage-locations/$tmp_place" admin)"
  expect "delete that schedule" "204" "$(status DELETE "/rules/$tmp_rule" admin)"
  expect "then the place deletes" "204" "$(status DELETE "/storage-locations/$tmp_place" admin)"
fi

# ---------------------------------------------------------------------------------------
section "attribution"
# A signed-in user's events are attributed; an anonymous label scan's are not. Both matter:
# the first is the point of the feature, the second is why the column has to stay nullable.
if [ -n "${eq_id:-}" ]; then
  attributed=$(body POST /events admin \
    "{\"equipmentId\":\"$eq_id\",\"type\":\"maintenance\",\"note\":\"auth smoke attribution\"}" \
    | jq_r createdByUserId)
  admin_uid=$(body GET /auth/me admin | jq_r user.id)
  expect "signed-in event is attributed" "$admin_uid" "$attributed"
else
  SKIP=$((SKIP + 1)); echo "  skipped: no equipment to log against"
fi

# ---------------------------------------------------------------------------------------
section "sensitive documents"
# Sensitive categories must be invisible, not merely locked: a 403 would confirm the document
# exists, which leaks the very thing the flag is for.
sens_doc=$(body GET /documents admin | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    try { const d=JSON.parse(s).find(x=>x.category&&x.category.sensitive); console.log(d?d.id:"") }
    catch { console.log("") }})')

if [ -z "$sens_doc" ]; then
  SKIP=$((SKIP + 1))
  echo "  skipped: no document in a sensitive category (classify one as Receipt or Invoice)"
else
  expect "admin can fetch a sensitive doc" "200" "$(status GET "/documents/$sens_doc" admin)"
  expect "viewer 404s on a sensitive doc" "404" "$(status GET "/documents/$sens_doc" smokeviewer)"
  expect "viewer 404s on its contents" "404" "$(status GET "/documents/$sens_doc/content" smokeviewer)"

  hidden=$(body GET /documents smokeviewer | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      try { console.log(JSON.parse(s).some(x=>x.id===process.argv[1])?"listed":"hidden") }
      catch { console.log("?") }})' "$sens_doc")
  expect "sensitive doc absent from viewer's list" "hidden" "$hidden"
fi

# ---------------------------------------------------------------------------------------
section "API tokens: service accounts"
# bstatus METHOD PATH TOKEN [JSON] [JAR]  -- bearer request; JAR adds a cookie alongside it
bstatus() {
  local method="$1" path="$2" tok="$3" data="${4:-}" jar="${5:-}"
  local args=(-s -o /dev/null -w '%{http_code}' -X "$method" -H "Authorization: Bearer $tok")
  [ -n "$data" ] && args+=(-H 'Content-Type: application/json' -d "$data")
  [ -n "$jar" ] && args+=(-b "$JARS/$jar")
  curl "${args[@]}" "$BASE$path"
}
bbody() {
  local method="$1" path="$2" tok="$3" data="${4:-}"
  local args=(-s -X "$method" -H "Authorization: Bearer $tok")
  [ -n "$data" ] && args+=(-H 'Content-Type: application/json' -d "$data")
  curl "${args[@]}" "$BASE$path"
}
# Via the environment, not argv: node would read a negative day count ("-10") as an option.
days_from_now() { DAYS="$1" node -e 'console.log(new Date(Date.now()+Number(process.env.DAYS)*864e5).toISOString())'; }
user_id() { body GET /users admin | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    const u=JSON.parse(s).find(u=>u.username===process.argv[1]); console.log(u?u.id:"")})' "$1"; }

expect "service account with a password is refused" "400" \
  "$(status POST /users admin "{\"username\":\"smokesvc-pw\",\"password\":\"smoke-pw-12345\",\"isActive\":true,\"roleIds\":[],\"kind\":\"Service\"}")"

# Left over from an aborted run? Start clean, so every assertion below is about this run.
old_svc=$(user_id smokesvc)
[ -n "$old_svc" ] && status DELETE "/users/$old_svc" admin >/dev/null

svc_json="{\"username\":\"smokesvc\",\"isActive\":true,\"roleIds\":[\"$member_role\"],\"kind\":\"Service\"}"
created_svc=$(body POST /users admin "$svc_json")
svc_id=$(printf '%s' "$created_svc" | jq_r id)
expect "create service account (no password)" "Service" "$(printf '%s' "$created_svc" | jq_r kind)"

# No UserIdentity exists for it, so there is nothing a login could match.
expect "service account cannot sign in" "401" \
  "$(status POST /auth/login svcjar '{"username":"smokesvc","password":"anything-at-all"}')"

scope='["equipment.read","equipment.list","events.read","events.create"]'
expect "scope beyond the account's roles is refused" "400" \
  "$(status POST "/users/$svc_id/tokens" admin '{"name":"too much","permissions":["users.manage"]}')"
expect "a token needs at least one permission" "400" \
  "$(status POST "/users/$svc_id/tokens" admin '{"name":"nothing","permissions":[]}')"

minted=$(body POST "/users/$svc_id/tokens" admin "{\"name\":\"smoke\",\"expiresAt\":null,\"permissions\":$scope}")
svc_tok=$(printf '%s' "$minted" | jq_r token)
svc_tok_id=$(printf '%s' "$minted" | jq_r apiToken.id)
expect "service token minted, no expiry" "true" "$([[ "$svc_tok" == cmms_* ]] && echo true || echo false)"

expect "token: in scope        GET /equipment" "200" "$(bstatus GET /equipment "$svc_tok")"
expect "token: out of scope    GET /parts" "403" "$(bstatus GET /parts "$svc_tok")"
expect "token: owner lacks it  GET /users" "403" "$(bstatus GET /users "$svc_tok")"
expect "token: /auth/me says viaApiToken" "true" "$(bbody GET /auth/me "$svc_tok" | jq_r viaApiToken)"
# The bearer is the only credential considered, even next to an admin's session cookie.
expect "token beats an admin cookie GET /parts" "403" "$(bstatus GET /parts "$svc_tok" "" admin)"

expect "garbage bearer on a public route" "401" "$(bstatus GET /auth/me not-a-token)"
expect "garbage bearer on a guarded route" "401" "$(bstatus GET /equipment cmms_nope)"

expect "token cannot list sessions" "403" "$(bstatus GET /auth/sessions "$svc_tok")"
expect "token cannot change a password" "403" \
  "$(bstatus POST /auth/password "$svc_tok" '{"currentPassword":"x","newPassword":"yyyyyyyyyy"}')"
expect "token cannot mint a personal token" "403" \
  "$(bstatus POST /auth/tokens "$svc_tok" '{"name":"x","permissions":["equipment.read"]}')"

if [ -n "${eq_id:-}" ]; then
  by=$(bbody POST /events "$svc_tok" "{\"equipmentId\":\"$eq_id\",\"type\":\"cleaning\",\"note\":\"auth smoke token\"}" \
    | jq_r createdByUserId)
  expect "token's event is attributed to the account" "$svc_id" "$by"
fi

# The owner's roles are read per request, so editing the account binds its tokens at once.
put_svc() { status PUT "/users/$svc_id" admin "{\"username\":\"smokesvc\",\"isActive\":$1,\"roleIds\":$2}"; }
put_svc false "[\"$member_role\"]" >/dev/null
expect "deactivated account's token" "401" "$(bstatus GET /equipment "$svc_tok")"
put_svc true "[\"$member_role\"]" >/dev/null
expect "reactivated account's token" "200" "$(bstatus GET /equipment "$svc_tok")"
put_svc true "[]" >/dev/null
expect "token after its account loses the role" "403" "$(bstatus GET /equipment "$svc_tok")"
put_svc true "[\"$member_role\"]" >/dev/null

# A service account holding Admin must not count as "another admin": it cannot sign in.
admin_uid=$(body GET /auth/me admin | jq_r user.id)
admin_role=$(role_id Admin)
person_admins=$(body GET /users admin | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    console.log(JSON.parse(s).filter(u=>u.kind==="Person"&&u.isActive&&u.roles.some(r=>r.name==="Admin")).length)})')
if [ "$person_admins" = "1" ]; then
  put_svc true "[\"$admin_role\"]" >/dev/null
  expect "last person admin can't be demoted past a service admin" "400" \
    "$(status PUT "/users/$admin_uid" admin "{\"username\":\"$ADMIN_USER\",\"isActive\":true,\"roleIds\":[]}")"
  put_svc true "[\"$member_role\"]" >/dev/null
else
  SKIP=$((SKIP + 1)); echo "  skipped: last-admin check needs exactly one person admin"
fi

expect "revoke the service token" "204" "$(status DELETE "/users/$svc_id/tokens/$svc_tok_id" admin)"
expect "revoked token is dead immediately" "401" "$(bstatus GET /equipment "$svc_tok")"

# ---------------------------------------------------------------------------------------
section "API tokens: personal"
expect "member lacks tokens.personal" "403" \
  "$(status POST /auth/tokens smokemember "{\"name\":\"x\",\"expiresAt\":\"$(days_from_now 30)\",\"permissions\":[\"equipment.read\"]}")"
expect "personal token without expiry" "400" \
  "$(status POST /auth/tokens admin '{"name":"x","expiresAt":null,"permissions":["equipment.read"]}')"
expect "personal token past the max lifetime" "400" \
  "$(status POST /auth/tokens admin "{\"name\":\"x\",\"expiresAt\":\"$(days_from_now 400)\",\"permissions\":[\"equipment.read\"]}")"
expect "an admin can't mint a token for a person" "400" \
  "$(status POST "/users/$admin_uid/tokens" admin '{"name":"x","permissions":["equipment.read"]}')"

pat=$(body POST /auth/tokens admin \
  "{\"name\":\"smoke personal\",\"expiresAt\":\"$(days_from_now 30)\",\"permissions\":[\"users.manage\",\"equipment.list\"]}" \
  | jq_r token)
expect "personal token minted" "true" "$([[ "$pat" == cmms_* ]] && echo true || echo false)"
expect "personal token GET /users" "200" "$(bstatus GET /users "$pat")"
# users.manage is in scope, but minting is session-only: no token creates tokens.
expect "personal token can't mint a service token" "403" \
  "$(bstatus POST "/users/$svc_id/tokens" "$pat" '{"name":"x","permissions":["equipment.read"]}')"

# Changing the password revokes personal tokens. Changed and changed back, so reruns still sign in.
tmp_pass="smoke-admin-pw-tmp-$$"
expect "change admin password" "204" \
  "$(status POST /auth/password admin "{\"currentPassword\":\"$ADMIN_PASS\",\"newPassword\":\"$tmp_pass\"}")"
expect "personal token revoked by the change" "401" "$(bstatus GET /users "$pat")"
status POST /auth/password admin "{\"currentPassword\":\"$tmp_pass\",\"newPassword\":\"$ADMIN_PASS\"}" >/dev/null

# ---------------------------------------------------------------------------------------
section "swagger gate (api.docs)"
# Swagger lives beside /api, not under it: strip the proxy prefix when testing through :3000.
SWAGGER="${BASE%/api}/swagger/v1/swagger.json"
sw() { curl -s -o /dev/null -w '%{http_code}' "$@" "$SWAGGER"; }
expect "anon       swagger.json" "401" "$(sw)"
expect "member     swagger.json" "403" "$(sw -b "$JARS/smokemember")"
expect "admin      swagger.json" "200" "$(sw -b "$JARS/admin")"
docs_tok=$(body POST /auth/tokens admin \
  "{\"name\":\"smoke docs\",\"expiresAt\":\"$(days_from_now 1)\",\"permissions\":[\"api.docs\"]}" | jq_r token)
nodocs_tok=$(body POST /auth/tokens admin \
  "{\"name\":\"smoke no docs\",\"expiresAt\":\"$(days_from_now 1)\",\"permissions\":[\"equipment.read\"]}" | jq_r token)
expect "token with api.docs    swagger.json" "200" "$(sw -H "Authorization: Bearer $docs_tok")"
expect "token without api.docs swagger.json" "403" "$(sw -H "Authorization: Bearer $nodocs_tok")"
for id in $(body GET /auth/tokens admin | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    JSON.parse(s).filter(t=>t.name.startsWith("smoke")).forEach(t=>console.log(t.id))})'); do
  status DELETE "/auth/tokens/$id" admin >/dev/null
done

status DELETE "/users/$svc_id" admin >/dev/null

# ---------------------------------------------------------------------------------------
section "meters and usage schedules"
# rule_field RULE_ID FIELD  -- one field of one rule, from the item's schedule list
rule_field() { body GET "/rules?equipment_id=$m_eq" admin | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    const r=JSON.parse(s).find(r=>r.id===process.argv[1]); const v=r?r[process.argv[2]]:undefined;
    console.log(v===null||v===undefined?"null":v)})' "$1" "$2"; }
record() { status POST "/meters/$1/readings" admin "{\"value\":$2${3:+,\"readAt\":\"$3\"}}"; }

m_eq=$(body POST /equipment admin '{"name":"Smoke Meter Pump","kind":"Asset"}' | jq_r id)
meter=$(body POST /meters admin "{\"equipmentId\":\"$m_eq\",\"name\":\"Operating hours\",\"unit\":\"h\"}" | jq_r id)
expect "create a meter" "true" "$([ -n "$meter" ] && echo true || echo false)"
expect "viewer can read meters" "200" "$(status GET "/meters?equipment_id=$m_eq" smokeviewer)"
expect "viewer cannot record a reading" "403" "$(status POST "/meters/$meter/readings" smokeviewer '{"value":1}')"
expect "anon cannot read meters" "401" "$(status GET "/meters?equipment_id=$m_eq" anon)"

t10=$(days_from_now -10); t5=$(days_from_now -5); t1=$(days_from_now -1)
expect "reading 100 h, 10 days ago" "201" "$(record "$meter" 100 "$t10")"
expect "reading 110 h, 5 days ago" "201" "$(record "$meter" 110 "$t5")"
expect "same instant, same value: a retry" "200" "$(record "$meter" 110 "$t5")"
expect "same instant, other value" "409" "$(record "$meter" 111 "$t5")"
expect "counter going backwards" "409" "$(record "$meter" 105)"
expect "a reading in the future" "400" "$(record "$meter" 200 "$(days_from_now 2)")"
count_before=$(body GET "/meters/$meter/readings" admin | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).length))')
expect "unchanged value only confirms" "200" "$(record "$meter" 110 "$t1")"
count_after=$(body GET "/meters/$meter/readings" admin | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).length))')
expect "...and writes no row" "$count_before" "$count_after"
rate=$(body GET "/meters/$meter" admin | jq_r ratePerDay)
expect "usage rate is known" "true" "$([ -n "$rate" ] && [ "$rate" != "null" ] && echo true || echo false)"

rule=$(body POST /rules admin "{\"equipmentId\":\"$m_eq\",\"name\":\"Service\",\"scheduleType\":\"Usage\",\"intervalValue\":0,\"intervalUnit\":\"Days\",\"dueWindowValue\":0,\"dueWindowUnit\":\"Days\",\"reminderLeadValue\":30,\"reminderLeadUnit\":\"Days\",\"meterId\":\"$meter\",\"usageInterval\":100,\"lastDoneValue\":50}" | jq_r id)
expect "usage rule: 40 h left is Ok" "Ok" "$(rule_field "$rule" status)"
expect "usage rule: due at 150 h" "150" "$(rule_field "$rule" dueValue)"
expect "usage rule: forecast date" "true" "$([ "$(rule_field "$rule" dueAt)" != "null" ] && echo true || echo false)"
record "$meter" 145 >/dev/null
expect "within the 10% lead: Upcoming" "Upcoming" "$(rule_field "$rule" status)"
record "$meter" 150 >/dev/null
expect "at the threshold: Due" "Due" "$(rule_field "$rule" status)"
record "$meter" 161 >/dev/null
expect "past the 10% grace: Overdue" "Overdue" "$(rule_field "$rule" status)"

expect "a time-based rule can't name a meter" "400" \
  "$(status POST /rules admin "{\"storageLocationId\":null,\"equipmentId\":\"$m_eq\",\"scheduleType\":\"Usage\",\"intervalValue\":0,\"intervalUnit\":\"Days\",\"dueWindowValue\":0,\"dueWindowUnit\":\"Days\",\"reminderLeadValue\":30,\"reminderLeadUnit\":\"Days\",\"usageInterval\":100}")"

# Logging the service with a typed reading rebaselines the schedule from it.
code=$(status POST /events admin "{\"equipmentId\":\"$m_eq\",\"type\":\"maintenance\",\"note\":\"smoke service\",\"meterReadings\":[{\"meterId\":\"$meter\",\"value\":170}]}")
expect "log a service with a meter reading" "201" "$code"
expect "...restarts the usage rule from 170 h" "170" "$(rule_field "$rule" lastDoneValue)"
expect "...so it is Ok again" "Ok" "$(rule_field "$rule" status)"
expect "a refused reading fails the whole log" "409" \
  "$(status POST /events admin "{\"equipmentId\":\"$m_eq\",\"type\":\"maintenance\",\"meterReadings\":[{\"meterId\":\"$meter\",\"value\":1}]}")"

# A calendar ceiling that has already elapsed drives the status, and says so.
ceil=$(body POST /rules admin "{\"equipmentId\":\"$m_eq\",\"scheduleType\":\"Usage\",\"intervalValue\":1,\"intervalUnit\":\"Days\",\"lastDoneAt\":\"$(days_from_now -3)\",\"dueWindowValue\":0,\"dueWindowUnit\":\"Days\",\"reminderLeadValue\":0,\"reminderLeadUnit\":\"Days\",\"meterId\":\"$meter\",\"usageInterval\":1000,\"lastDoneValue\":170}" | jq_r id)
expect "ceiling elapsed: Overdue" "Overdue" "$(rule_field "$ceil" status)"
expect "...because of time" "Time" "$(rule_field "$ceil" dueReason)"

# The log form sends a bare date (midnight). A schedule set up earlier today must still be
# moved by a service logged "today", not skipped as older than its own baseline.
today=$(node -e 'const d=new Date();console.log(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())).toISOString())')
r3=$(body POST /rules admin "{\"equipmentId\":\"$m_eq\",\"scheduleType\":\"Usage\",\"intervalValue\":12,\"intervalUnit\":\"Months\",\"dueWindowValue\":0,\"dueWindowUnit\":\"Days\",\"reminderLeadValue\":30,\"reminderLeadUnit\":\"Days\",\"meterId\":\"$meter\",\"usageInterval\":500,\"lastDoneValue\":170}" | jq_r id)
status POST /events admin "{\"equipmentId\":\"$m_eq\",\"type\":\"maintenance\",\"occurredAt\":\"$today\",\"meterReadings\":[{\"meterId\":\"$meter\",\"value\":180}]}" >/dev/null
expect "date-only log today moves a rule set up today" "180" "$(rule_field "$r3" lastDoneValue)"

# Counter reset on the same device: the total carries on.
expect "rebase after a counter reset" "201" "$(status POST "/meters/$meter/rebase" admin '{"newRawValue":0}')"
record "$meter" 5 >/dev/null
expect "...raw 5 continues the total at 185 h" "185" "$(body GET "/meters/$meter" admin | jq_r currentValue)"

# Device replaced: the meter and its schedules start over.
expect "mark the device replaced" "201" "$(status POST "/meters/$meter/replace" admin '{"newRawValue":0}')"
expect "...meter restarts at 0" "0" "$(body GET "/meters/$meter" admin | jq_r currentValue)"
expect "...usage rule rebased to 0" "0" "$(rule_field "$rule" lastDoneValue)"
expect "...and is Ok" "Ok" "$(rule_field "$rule" status)"
expect "new device's 12 h is not 'backwards'" "201" "$(record "$meter" 12)"
expect "a reading from before the replacement" "400" "$(record "$meter" 20 "$t1")"
old_kept=$(body GET "/meters/$meter/readings?limit=100" admin | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).some(r=>r.value===161)))')
expect "old device's readings kept as history" "true" "$old_kept"

expect "a meter with schedules can't be deleted" "400" "$(status DELETE "/meters/$meter" admin)"

# A forecast needs history; one reading isn't enough.
meter2=$(body POST /meters admin "{\"equipmentId\":\"$m_eq\",\"name\":\"Starts\",\"unit\":\"cycles\"}" | jq_r id)
record "$meter2" 10 >/dev/null
r2=$(body POST /rules admin "{\"equipmentId\":\"$m_eq\",\"scheduleType\":\"Usage\",\"intervalValue\":0,\"intervalUnit\":\"Days\",\"dueWindowValue\":0,\"dueWindowUnit\":\"Days\",\"reminderLeadValue\":0,\"reminderLeadUnit\":\"Days\",\"meterId\":\"$meter2\",\"usageInterval\":100,\"lastDoneValue\":10}" | jq_r id)
expect "single reading: no forecast date" "null" "$(rule_field "$r2" dueAt)"

# An integration's token: record readings, nothing more.
old_isvc=$(user_id smokemetersvc); [ -n "$old_isvc" ] && status DELETE "/users/$old_isvc" admin >/dev/null
isvc=$(body POST /users admin "{\"username\":\"smokemetersvc\",\"isActive\":true,\"roleIds\":[\"$member_role\"],\"kind\":\"Service\"}" | jq_r id)
itok=$(body POST "/users/$isvc/tokens" admin '{"name":"ha","permissions":["equipment.read","rules.read","meters.read","meters.record"]}' | jq_r token)
expect "integration token records a reading" "201" \
  "$(bstatus POST "/meters/$meter/readings" "$itok" '{"value":20,"source":"homeassistant"}')"
expect "integration token reads the schedule" "200" "$(bstatus GET "/rules?equipment_id=$m_eq" "$itok")"
expect "integration token can't create meters" "403" \
  "$(bstatus POST /meters "$itok" "{\"equipmentId\":\"$m_eq\",\"name\":\"x\",\"unit\":\"h\"}")"
expect "integration token can't change schedules" "403" "$(bstatus PUT "/rules/$rule" "$itok" '{"usageInterval":1}')"
batch=$(bbody POST /meters/readings "$itok" "[{\"meterId\":\"$meter\",\"value\":25},{\"meterId\":\"00000000-0000-0000-0000-000000000000\",\"value\":1}]" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).map(r=>r.status).join(",")))')
expect "batch push reports per item" "201,404" "$batch"

status DELETE "/users/$isvc" admin >/dev/null
expect "deleting the item takes its meters along" "204" "$(status DELETE "/equipment/$m_eq" admin)"
expect "...meter gone" "404" "$(status GET "/meters/$meter" admin)"

# ---------------------------------------------------------------------------------------
section "meter retention"
# iso EXPR  -- evaluate a JS Date expression (d = today 00:00 UTC) to an ISO string
iso() { EXPR="$1" node -e '
  const n=new Date(); const d=new Date(Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),n.getUTCDate()));
  const day=864e5; console.log(new Date(eval(process.env.EXPR)).toISOString())'; }
rec_src() { status POST "/meters/$1/readings" admin "{\"value\":$2,\"readAt\":\"$3\"${4:+,\"source\":\"$4\"}}"; }

r_eq=$(body POST /equipment admin '{"name":"Smoke Retention Pump","kind":"Asset"}' | jq_r id)
r_m=$(body POST /meters admin "{\"equipmentId\":\"$r_eq\",\"name\":\"Hours\",\"unit\":\"h\"}" | jq_r id)

# Oldest first, so every backfill climbs. Each group sits in a single bucket of its tier.
# Month tier (~2000 days ago): days 2..6 of one month — the first is the meter's first reading.
for i in 1 2 3 4 5; do
  t=$(iso "(()=>{const o=new Date(d.getTime()-2000*day);return Date.UTC(o.getUTCFullYear(),o.getUTCMonth(),1+$i,12)})()")
  rec_src "$r_m" $((i * 10)) "$t" >/dev/null
done
# Week tier (~1000 days ago): Tuesday..Saturday of one ISO week.
for i in 1 2 3 4 5; do
  t=$(iso "(()=>{const o=new Date(d.getTime()-1000*day);const mon=o.getTime()-((o.getUTCDay()+6)%7)*day;return mon+$i*day+12*3600e3})()")
  rec_src "$r_m" $((100 + i)) "$t" >/dev/null
done
# Day tier (~100 days ago): twelve readings within one UTC day, one typed by hand.
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  src=""; [ "$i" = 6 ] && src="manual"
  rec_src "$r_m" $((200 + i)) "$(iso "d.getTime()-100*day+$i*3600e3")" "$src" >/dev/null
done
# Full detail (recent): left alone.
for i in 10 5 1; do rec_src "$r_m" $((330 - i)) "$(iso "d.getTime()-$i*day")" >/dev/null; done

expect "member cannot run the thinning" "403" "$(status POST /meters/prune smokemember)"
expect "admin runs the thinning" "200" "$(status POST /meters/prune admin)"
tier_counts=$(body GET "/meters/$r_m/readings?limit=1000" admin | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s).map(r=>r.value);
    const n=(a,b)=>v.filter(x=>x>=a&&x<b).length;
    console.log([n(0,100),n(100,200),n(200,300),n(300,1e9)].join(","))})')
# month: first (pinned) + last; week: last; day: last + manual; full detail: all 3
expect "kept per tier (month,week,day,full)" "2,1,2,3" "$tier_counts"
expect "thinning again deletes nothing" "0" "$(body POST /meters/prune admin | jq_r total)"

# Between kept readings, the value at a time is interpolated, not stepped.
r_m2=$(body POST /meters admin "{\"equipmentId\":\"$r_eq\",\"name\":\"Starts\",\"unit\":\"cycles\"}" | jq_r id)
rec_src "$r_m2" 1000 "$(iso "d.getTime()-10*day")" >/dev/null
rec_src "$r_m2" 2000 "$(iso "d.getTime()-8*day")" >/dev/null
r_rule=$(body POST /rules admin "{\"equipmentId\":\"$r_eq\",\"scheduleType\":\"Usage\",\"intervalValue\":0,\"intervalUnit\":\"Days\",\"dueWindowValue\":0,\"dueWindowUnit\":\"Days\",\"reminderLeadValue\":0,\"reminderLeadUnit\":\"Days\",\"meterId\":\"$r_m2\",\"usageInterval\":500}" | jq_r id)
status POST /events admin "{\"equipmentId\":\"$r_eq\",\"type\":\"maintenance\",\"occurredAt\":\"$(iso "d.getTime()-9*day+12*3600e3")\"}" >/dev/null
# 36 h into a 48 h gap from 1000 to 2000.
expect "back-dated log interpolates the count" "1750" "$(body GET "/rules?equipment_id=$r_eq" admin | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).find(r=>r.id===process.argv[1]).lastDoneValue))' "$r_rule")"

# The windows are validated: forecasts need a month of full detail, and each tier must be longer.
settings_with() { body GET /app-settings admin | PATCH="$1" node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify({...JSON.parse(s),...JSON.parse(process.env.PATCH)})))'; }
expect "full detail under 31 days is refused" "400" \
  "$(status PUT /app-settings admin "$(settings_with '{"meterFullDetailDays":20}')")"
expect "daily not longer than full detail is refused" "400" \
  "$(status PUT /app-settings admin "$(settings_with '{"meterFullDetailDays":90,"meterDailyDays":60}')")"
expect "valid windows save" "200" "$(status PUT /app-settings admin "$(settings_with '{}')")"

status DELETE "/equipment/$r_eq" admin >/dev/null

# ---------------------------------------------------------------------------------------
section "deleting history entries"
d_eq=$(body POST /equipment admin '{"name":"Smoke Delete Target","kind":"Asset"}' | jq_r id)
d_rule_field() { body GET "/rules?equipment_id=$d_eq" admin | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    const r=JSON.parse(s).find(r=>r.id===process.argv[1]); const v=r?r[process.argv[2]]:undefined;
    console.log(v===null||v===undefined?"null":v)})' "$1" "$2"; }
same_instant() { node -e 'console.log(new Date(process.argv[1]).getTime()===new Date(process.argv[2]).getTime())' "$1" "$2"; }

iv=$(body POST /rules admin "{\"equipmentId\":\"$d_eq\",\"scheduleType\":\"Interval\",\"intervalValue\":30,\"intervalUnit\":\"Days\",\"dueWindowValue\":0,\"dueWindowUnit\":\"Days\",\"reminderLeadValue\":7,\"reminderLeadUnit\":\"Days\"}" | jq_r id)
d_meter=$(body POST /meters admin "{\"equipmentId\":\"$d_eq\",\"name\":\"Hours\",\"unit\":\"h\"}" | jq_r id)
# Readings exactly at the two events' times, so the value at each is exact rather than
# interpolated between neighbours.
t_a=$(days_from_now -5); t_b=$(days_from_now -1)
record "$d_meter" 100 "$t_a" >/dev/null
record "$d_meter" 150 "$t_b" >/dev/null
record "$d_meter" 200 >/dev/null
us=$(body POST /rules admin "{\"equipmentId\":\"$d_eq\",\"scheduleType\":\"Usage\",\"intervalValue\":0,\"intervalUnit\":\"Days\",\"dueWindowValue\":0,\"dueWindowUnit\":\"Days\",\"reminderLeadValue\":0,\"reminderLeadUnit\":\"Days\",\"meterId\":\"$d_meter\",\"usageInterval\":500}" | jq_r id)

ev_a=$(body POST /events admin "{\"equipmentId\":\"$d_eq\",\"type\":\"maintenance\",\"occurredAt\":\"$t_a\"}" | jq_r id)
ev_b=$(body POST /events admin "{\"equipmentId\":\"$d_eq\",\"type\":\"maintenance\",\"occurredAt\":\"$t_b\"}" | jq_r id)
expect "usage baseline from the later event" "150" "$(d_rule_field "$us" lastDoneValue)"

expect "member cannot delete an entry" "403" "$(status DELETE "/events/$ev_b" smokemember)"
expect "anon cannot delete an entry" "401" "$(status DELETE "/events/$ev_b" anon)"
expect "admin deletes the later entry" "204" "$(status DELETE "/events/$ev_b" admin)"
expect "interval rule reverts to the earlier entry" "true" "$(same_instant "$(d_rule_field "$iv" lastDoneAt)" "$t_a")"
expect "usage rule reverts to the earlier count" "100" "$(d_rule_field "$us" lastDoneValue)"
expect "delete the only remaining entry" "204" "$(status DELETE "/events/$ev_a" admin)"
expect "interval rule is 'never done' again" "null" "$(d_rule_field "$iv" lastDoneAt)"
expect "usage rule is 'never done' again" "null" "$(d_rule_field "$us" lastDoneValue)"
expect "...and reads Due" "Due" "$(d_rule_field "$us" status)"
expect "meter readings survive the deletes" "200" "$(body GET "/meters/$d_meter" admin | jq_r currentValue)"

# Parts consumed by the entry go back into stock.
part=$(body POST /parts admin '{"name":"Smoke filter","quantity":10,"unit":"pcs"}' | jq_r id)
ev_c=$(body POST /events admin "{\"equipmentId\":\"$d_eq\",\"type\":\"replacement\"}" | jq_r id)
status POST /part-usages admin "{\"maintenanceEventId\":\"$ev_c\",\"partId\":\"$part\",\"quantityUsed\":3}" >/dev/null
expect "using 3 filters leaves 7" "7" "$(body GET "/parts/$part" admin | jq_r quantity)"
expect "delete the entry that used them" "204" "$(status DELETE "/events/$ev_c" admin)"
expect "...stock is back to 10" "10" "$(body GET "/parts/$part" admin | jq_r quantity)"
status DELETE "/parts/$part" admin >/dev/null

# A place with history is kept — until the history itself is deliberately deleted.
d_place=$(body POST /storage-locations admin '{"name":"Smoke Delete Room"}' | jq_r id)
ev_p=$(body POST /events admin "{\"storageLocationId\":\"$d_place\",\"type\":\"cleaning\"}" | jq_r id)
expect "a place with history can't be deleted" "400" "$(status DELETE "/storage-locations/$d_place" admin)"
expect "delete the place's entry" "204" "$(status DELETE "/events/$ev_p" admin)"
expect "...then the place can go" "204" "$(status DELETE "/storage-locations/$d_place" admin)"

status DELETE "/equipment/$d_eq" admin >/dev/null

# ---------------------------------------------------------------------------------------
section "anonymous vs label scan"
label_role=$(role_id "Label scan")
expect "the Label scan role exists" "true" "$([ -n "$label_role" ] && echo true || echo false)"
s_a=$(body POST /equipment admin '{"name":"Smoke Split A","kind":"Asset"}' | jq_r id)
s_b=$(body POST /equipment admin '{"name":"Smoke Split B","kind":"Asset"}' | jq_r id)
s_ev='{"equipmentId":"'"$s_b"'","type":"cleaning"}'

# Seeded: Anonymous holds nothing, so without a label nothing about any item is reachable.
expect "no label: GET /events (whole history)" "401" "$(status GET /events anon)"
expect "no label: GET /equipment/{id}" "401" "$(status GET "/equipment/$s_a" anon)"
expect "no label: POST /events on any item" "401" "$(status POST /events anon "$s_ev")"

# A label for A: the Label scan rights, on A only.
s_tok=$(body GET "/auth/label-tokens?equipment_id=$s_a" admin | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(Object.values(JSON.parse(s))[0]))')
status POST /auth/label-session slabel "{\"equipmentId\":\"$s_a\",\"token\":\"$s_tok\"}" >/dev/null
expect "label A: GET /equipment/A" "200" "$(status GET "/equipment/$s_a" slabel)"
expect "label A: POST /events on B" "403" "$(status POST /events slabel "$s_ev")"

# Widen Anonymous to browsing (the live stopgap). A label must then add, never take away.
status PUT /roles/permissions admin "{\"grants\":{\"$anon_role\":[\"equipment.read\",\"equipment.list\",\"events.read\"]}}" >/dev/null
expect "browsing Anonymous, no label: list" "200" "$(status GET /equipment anon)"
expect "browsing Anonymous, label A: list too" "200" "$(status GET /equipment slabel)"
expect "browsing Anonymous, label A: GET /equipment/B" "200" "$(status GET "/equipment/$s_b" slabel)"
expect "browsing Anonymous, label A: GET /events (all)" "200" "$(status GET /events slabel)"
# events.create still comes only from the label, so it is still scoped to A.
expect "label-only right stays scoped: POST on B" "403" "$(status POST /events slabel "$s_ev")"
expect "...and works on A" "201" \
  "$(status POST /events slabel "{\"equipmentId\":\"$s_a\",\"type\":\"cleaning\"}")"
status PUT /roles/permissions admin "{\"grants\":{\"$anon_role\":[]}}" >/dev/null

# The grid keeps Label scan to what a label can actually reach.
expect "Label scan can't hold a browse right" "400" \
  "$(status PUT /roles/permissions admin "{\"grants\":{\"$label_role\":[\"equipment.read\",\"equipment.list\"]}}")"
expect "Label scan can't hold an admin right" "400" \
  "$(status PUT /roles/permissions admin "{\"grants\":{\"$label_role\":[\"users.manage\"]}}")"
expect "Label scan can't be deleted" "400" "$(status DELETE "/roles/$label_role" admin)"
held=$(body POST /users admin "{\"username\":\"smokesplit\",\"password\":\"smoke-pw-12345\",\"isActive\":true,\"roleIds\":[\"$label_role\",\"$anon_role\"]}" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).roles.length))')
expect "nobody can be given Label scan or Anonymous" "0" "$held"
s_u=$(user_id smokesplit); [ -n "$s_u" ] && status DELETE "/users/$s_u" admin >/dev/null
# Admin's own guard is still Admin's alone (the check no longer reads "system and not anonymous").
expect "Admin still can't drop users.manage" "400" \
  "$(status PUT /roles/permissions admin "{\"grants\":{\"$admin_role\":[\"equipment.read\"]}}")"

status DELETE "/equipment/$s_a" admin >/dev/null; status DELETE "/equipment/$s_b" admin >/dev/null

# ---------------------------------------------------------------------------------------
section "sign-in redirect follows the Anonymous role (web proxy)"
# Only meaningful through the web port: the redirect lives in the Next.js proxy, not the API.
if [[ "$BASE" == */api ]]; then
  WEB="${BASE%/api}"
  page() { curl -s -o /dev/null -w '%{http_code}' "$WEB$1"; }
  anon_grants() { body GET /roles admin | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s).roles.find(r=>r.isAnonymous).granted)))'; }
  original=$(anon_grants)
  # The proxy caches its answer for 15 s; wait it out after each grid change.
  expect "quick-log-only Anonymous: /assets redirects to sign in" "307" "$(sleep 16; page /assets)"
  browse=$(printf '%s' "$original" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify([...new Set([...JSON.parse(s),"equipment.list"])])))')
  status PUT /roles/permissions admin "{\"grants\":{\"$anon_role\":$browse}}" >/dev/null
  expect "Anonymous may browse: /assets renders" "200" "$(sleep 16; page /assets)"
  status PUT /roles/permissions admin "{\"grants\":{\"$anon_role\":$original}}" >/dev/null
  expect "browsing revoked again: redirects" "307" "$(sleep 16; page /assets)"
else
  SKIP=$((SKIP + 1)); echo "  skipped: run with BASE=<web>/api to test the web proxy"
fi

# ---------------------------------------------------------------------------------------
section "sign out"
expect "POST /auth/logout" "204" "$(status POST /auth/logout smokeviewer)"
expect "the session is dead immediately" "401" "$(status GET /equipment smokeviewer)"

# ---------------------------------------------------------------------------------------
printf '\n%s passed, %s failed, %s skipped\n' "$PASS" "$FAIL" "$SKIP"
[ "$FAIL" -eq 0 ] || exit 1
