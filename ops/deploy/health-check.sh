#!/bin/bash
# KAIROX Health Check — validates deployment integrity
# Usage: bash health-check.sh [--quiet]
set -euo pipefail

DOMAIN="${KAIROX_DOMAIN:-https://kairoxmarkets.xyz}"
QUIET="${1:-}"
PASS=0
FAIL=0

log() { if [ -z "$QUIET" ]; then echo "$@"; fi; }
pass() { PASS=$((PASS+1)); if [ -z "$QUIET" ]; then echo "  ✅ $1"; fi; }
fail() { FAIL=$((FAIL+1)); echo "  ❌ $1"; }

extract_asset_refs() {
  local scan_root="$1"
  python3 - "$scan_root" <<'PY'
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])
pattern = re.compile(r'''/_next/static/[^"'<>\s)]+?\.(?:js|css)(?:[?#][^"'<>\s)]*)?''')
refs = set()
paths = [root] if root.is_file() else root.rglob("*")
for path in paths:
    if not path.is_file():
        continue
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        continue
    text = text.replace(r"\/", "/")
    for match in pattern.findall(text):
        refs.add(match.split("?", 1)[0].split("#", 1)[0])
for ref in sorted(refs):
    print(ref)
PY
}

check_http() {
  local desc="$1" url="$2" expected="${3:-200}"
  local code=$(curl -sk -o /dev/null -w '%{http_code}' "$url" --connect-timeout 5 2>/dev/null)
  if [ "$code" = "$expected" ]; then pass "$desc ($code)"; else fail "$desc (got $code, expected $expected)"; fi
}

check_chunk() {
  local chunk="$1"
  local code=$(curl -sk -o /dev/null -w '%{http_code}' "${DOMAIN}${chunk}" --connect-timeout 5 2>/dev/null)
  local size=$(curl -sk -o /dev/null -w '%{size_download}' "${DOMAIN}${chunk}" 2>/dev/null)
  local ct=$(curl -sk -I "${DOMAIN}${chunk}" 2>/dev/null | grep -i 'content-type' | head -1 | tr -d '\r')
  if [ "$code" = "200" ] && [ "$size" -gt 100 ]; then
    pass "$chunk ($size bytes)"
  else
    fail "$chunk (HTTP $code, $size bytes, $ct)"
  fi
}

log "=== KAIROX Health Check ==="
log "Domain: $DOMAIN"
CURRENT_RELEASE=$(readlink -f /home/hermes/current 2>/dev/null || true)
BUILD_ID_FILE="$CURRENT_RELEASE/.next/BUILD_ID"
if [ -f "$BUILD_ID_FILE" ]; then
  log "BUILD_ID: $(cat "$BUILD_ID_FILE")"
else
  fail "BUILD_ID missing: $BUILD_ID_FILE"
fi
METADATA_FILE="$CURRENT_RELEASE/RELEASE_METADATA"
if [ -f "$METADATA_FILE" ]; then
  RELEASE_NAME=$(grep '^release_name=' "$METADATA_FILE" | cut -d= -f2-)
  RELEASE_COMMIT=$(grep '^commit=' "$METADATA_FILE" | cut -d= -f2-)
  RELEASE_DIRTY=$(grep '^dirty=' "$METADATA_FILE" | cut -d= -f2-)
  RELEASE_BUILD=$(grep '^build_timestamp=' "$METADATA_FILE" | cut -d= -f2-)
  RELEASE_MODE=$(grep '^source_mode=' "$METADATA_FILE" | cut -d= -f2-)
  RELEASE_WORKTREE=$(grep '^working_tree_dirty=' "$METADATA_FILE" | cut -d= -f2- || true)
  log "Release: ${RELEASE_NAME:-unknown}"
  log "Commit: ${RELEASE_COMMIT:-unknown}"
  log "BUILD timestamp: ${RELEASE_BUILD:-unknown}"
  log "Source mode: ${RELEASE_MODE:-unknown}"
  log "Release dirty: ${RELEASE_DIRTY:-unknown}"
  log "Working tree dirty: ${RELEASE_WORKTREE:-unknown}"
  [ "$RELEASE_DIRTY" = "false" ] && [ "$RELEASE_MODE" = "git-archive" ] && pass "Release metadata is clean git-archive" || fail "Release metadata invalid"
else
  fail "Release metadata missing: $METADATA_FILE"
fi
log ""

# 1. Core pages
log "--- Core Pages ---"
check_http "Homepage"     "$DOMAIN/"
check_http "Login"        "$DOMAIN/login"
check_http "Register"     "$DOMAIN/register"
check_http "About"        "$DOMAIN/about"

# 2. API endpoints
log ""
log "--- API ---"
check_http "Me (auth)"      "$DOMAIN/api/me" "200"
check_http "Settings (CSRF)" "$DOMAIN/api/settings" "401"

# 3. Homepage HTML, RSC and static chunks
log ""
log "--- Homepage / RSC Asset Integrity ---"
TMP_DIR=$(mktemp -d /tmp/kairox-health.XXXXXX)
trap 'rm -rf "$TMP_DIR"' EXIT
HOME_HTML="$TMP_DIR/home.html"
HOME_HEADERS="$TMP_DIR/home.headers"
HOME_CODE=$(curl -skD "$HOME_HEADERS" -o "$HOME_HTML" -w '%{http_code}' "$DOMAIN/" --connect-timeout 5 2>/dev/null)
[ "$HOME_CODE" = "200" ] && pass "Homepage HTML ($HOME_CODE)" || fail "Homepage HTML (got $HOME_CODE, expected 200)"

HOME_REFS=$(extract_asset_refs "$HOME_HTML")
HOME_REF_COUNT=$(printf '%s\n' "$HOME_REFS" | sed '/^$/d' | wc -l | tr -d ' ')
if [ "$HOME_REF_COUNT" -eq 0 ]; then
  fail "Homepage asset integrity: no referenced JS/CSS assets found"
else
  pass "Homepage references $HOME_REF_COUNT JS/CSS assets"
  while IFS= read -r chunk; do
    [ -z "$chunk" ] && continue
    check_chunk "$chunk"
    rel="${chunk#/_next/static/}"
    [ -s "$CURRENT_RELEASE/.next/static/$rel" ] && pass "Build asset exists: $rel" || fail "Build asset missing: $CURRENT_RELEASE/.next/static/$rel"
    [ -s "/home/hermes/shared/next-static/$rel" ] && pass "Shared asset exists: $rel" || fail "Shared asset missing: /home/hermes/shared/next-static/$rel"
  done <<< "$HOME_REFS"
fi

RSC_HEADERS="$TMP_DIR/rsc.headers"
RSC_BODY="$TMP_DIR/rsc.body"
RSC_CODE=$(curl -skD "$RSC_HEADERS" -o "$RSC_BODY" -w '%{http_code}' -H 'RSC: 1' -H 'Next-Router-Prefetch: 1' "$DOMAIN/login" --connect-timeout 5 2>/dev/null)
RSC_TYPE=$(grep -i '^content-type:' "$RSC_HEADERS" | head -1 | tr -d '\r' || true)
if [ "$RSC_CODE" = "200" ] && printf '%s' "$RSC_TYPE" | grep -qi 'text/x-component'; then
  pass "Auth RSC response ($RSC_CODE, $RSC_TYPE)"
else
  fail "Auth RSC response (HTTP $RSC_CODE, ${RSC_TYPE:-missing content-type})"
fi
RSC_REFS=$(extract_asset_refs "$RSC_BODY")
RSC_REF_COUNT=$(printf '%s\n' "$RSC_REFS" | sed '/^$/d' | wc -l | tr -d ' ')
if [ "$RSC_REF_COUNT" -gt 0 ]; then
  pass "Auth RSC references $RSC_REF_COUNT JS/CSS assets"
  while IFS= read -r chunk; do
    [ -z "$chunk" ] && continue
    check_chunk "$chunk"
  done <<< "$RSC_REFS"
else
  pass "Auth RSC response contains no direct JS/CSS references"
fi

LOCAL_REFS=$(extract_asset_refs "$CURRENT_RELEASE/.next")
LOCAL_REF_COUNT=$(printf '%s\n' "$LOCAL_REFS" | sed '/^$/d' | wc -l | tr -d ' ')
[ "$LOCAL_REF_COUNT" -gt 0 ] && pass "Current release references $LOCAL_REF_COUNT JS/CSS assets" || fail "Current release asset integrity: no referenced JS/CSS assets found"

# 4. Shared static directory — verify every historical JS/CSS asset remains reachable
log ""
log "--- Shared Static (all JS/CSS) ---"
SHARED="/home/hermes/shared/next-static/chunks"
if [ -d "$SHARED" ]; then
  SHARED_FAILS=0
  SHARED_TOTAL=0
  while IFS= read -r file; do
    SHARED_TOTAL=$((SHARED_TOTAL+1))
    chunk="/_next/static/chunks/$(basename "$file")"
    code=$(curl -sk -o /dev/null -w '%{http_code}' "${DOMAIN}${chunk}" --connect-timeout 5 2>/dev/null)
    [ "$code" = "200" ] || { fail "$chunk (HTTP $code)"; SHARED_FAILS=$((SHARED_FAILS+1)); }
  done < <(find "$SHARED" -maxdepth 1 -type f \( -name '*.js' -o -name '*.css' \) -print)
  [ "$SHARED_FAILS" -eq 0 ] && pass "Shared static: $SHARED_TOTAL/$SHARED_TOTAL reachable" || fail "Shared static: $SHARED_FAILS/$SHARED_TOTAL failed"
else
  fail "Shared static directory missing: $SHARED"
fi

# 5. SSL
log ""
log "--- SSL ---"
SSL_EXPIRY=$(echo | openssl s_client -connect kairoxmarkets.xyz:443 -servername kairoxmarkets.xyz 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$SSL_EXPIRY" ]; then
  pass "SSL valid until $SSL_EXPIRY"
else
  fail "SSL check failed"
fi

# 6. PM2
log ""
log "--- PM2 ---"
ONLINE=$(su - hermes -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; pm2 jlist' 2>/dev/null | python3 -c "
import sys,json
procs=json.load(sys.stdin)
online=[p['name'] for p in procs if p.get('pm2_env',{}).get('status')=='online']
stopped=[p['name'] for p in procs if p.get('pm2_env',{}).get('status')!='online']
print(f'online={len(online)} stopped={len(stopped)}')
for p in stopped:
    print(f'STOPPED: {p}')
" 2>/dev/null)
NC=$(echo "$ONLINE" | grep -c 'online=3' || true)
if [ "$NC" -ge 1 ]; then
  pass "PM2: 3/3 online"
else
  fail "PM2: $ONLINE"
fi
PM2_PID_CWDS=$(su - hermes -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; pm2 jlist' 2>/dev/null | python3 -c '
import sys,json
for p in json.load(sys.stdin):
    print(p.get("name",""), p.get("pid",0))
' 2>/dev/null || true)
while read -r name pid; do
  [ -n "$name" ] || continue
  configured_cwd=$(su - hermes -c "export NVM_DIR=\"\$HOME/.nvm\"; . \"\$NVM_DIR/nvm.sh\"; pm2 describe '$name'" 2>/dev/null | awk -F'│' '/exec cwd/{gsub(/^ +| +$/, "", $3); print $3; exit}')
  resolved_current=$(readlink -f /home/hermes/current 2>/dev/null || true)
  process_cwd=$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)
  if [ "$configured_cwd" = "/home/hermes/current" ] && [ "$process_cwd" = "$resolved_current" ]; then
    pass "$name configured_cwd=/home/hermes/current resolved_current=$resolved_current process_cwd=$process_cwd"
  else
    fail "$name configured_cwd=${configured_cwd:-missing} resolved_current=${resolved_current:-missing} process_cwd=${process_cwd:-missing}"
  fi
done <<< "$PM2_PID_CWDS"

# 7. Nginx
log ""
log "--- Nginx ---"
nginx -t >/dev/null 2>&1 && pass "Nginx config valid" || fail "Nginx config invalid"

# 8. Deploy structure
log ""
log "--- Deploy Structure ---"
[ -L /home/hermes/current ] && pass "current symlink exists" || fail "current symlink missing"
[ -f /home/hermes/deploy.sh ] && pass "deploy.sh exists" || fail "deploy.sh missing"
[ -f /home/hermes/shared/.env.local ] && pass "shared/.env.local exists" || fail "shared/.env.local missing"
[ -d /home/hermes/shared/next-static ] && pass "shared/next-static exists" || fail "shared/next-static missing"

# Summary
log ""
log "=== Result: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && log "✅ ALL CHECKS PASSED" || log "❌ DEPLOYMENT HAS ISSUES"
exit $FAIL
