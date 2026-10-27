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
expect "admin holds the whole catalogue" "37" "$admin_perm_count"

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
days_from_now() { node -e 'console.log(new Date(Date.now()+Number(process.argv[1])*864e5).toISOString())' "$1"; }
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
section "sign out"
expect "POST /auth/logout" "204" "$(status POST /auth/logout smokeviewer)"
expect "the session is dead immediately" "401" "$(status GET /equipment smokeviewer)"

# ---------------------------------------------------------------------------------------
printf '\n%s passed, %s failed, %s skipped\n' "$PASS" "$FAIL" "$SKIP"
[ "$FAIL" -eq 0 ] || exit 1
