#!/bin/bash
# KAIROX Deploy — versioned atomic deployment with shared static
set -euo pipefail

RELEASES_DIR="/home/hermes/releases"
CURRENT_LINK="/home/hermes/current"
SHARED_STATIC="/home/hermes/shared/next-static"
SOURCE_REPO="/home/hermes/kairox"
SOURCE_BRANCH="${DEPLOY_BRANCH:-main}"
SOURCE_COMMIT="${DEPLOY_COMMIT:-}"
PM2_CONFIG="/home/hermes/kairox-pm2.config.cjs"
LOCK_FILE="/tmp/kairox-deploy.lock"
DEPLOY_LOG="/home/hermes/deploy.log"

log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$DEPLOY_LOG"; }

extract_asset_refs() {
  local scan_root="$1"
  python3 - "$scan_root" <<'PY'
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])
pattern = re.compile(r'''/_next/static/[^"'<>\s)]+?\.(?:js|css)(?:[?#][^"'<>\s)]*)?''')
refs = set()
for path in root.rglob("*"):
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

verify_assets() {
  local release_dir="$1" shared_dir="$2" refs_file="$3"
  extract_asset_refs "$release_dir/.next" > "$refs_file"
  local ref_count
  ref_count=$(grep -c . "$refs_file" 2>/dev/null || true)
  if [ "$ref_count" -eq 0 ]; then
    log "Asset verification failed: no referenced JS/CSS assets found"
    return 1
  fi
  log "Extracted $ref_count referenced JS/CSS assets"
  local missing=0 ref rel
  while IFS= read -r ref; do
    [ -z "$ref" ] && continue
    rel="${ref#/_next/static/}"
    if [ ! -s "$release_dir/.next/static/$rel" ]; then
      log "MISSING build asset: $ref"
      missing=$((missing+1))
    fi
    if [ ! -s "$shared_dir/$rel" ]; then
      log "MISSING shared asset: $ref"
      missing=$((missing+1))
    fi
  done < "$refs_file"
  [ "$missing" -eq 0 ] || return 1
}

pm2_jlist() {
  su - hermes -c 'export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; pm2 jlist'
}

verify_pm2_cwds() {
  local resolved_current="$(readlink -f "$CURRENT_LINK")" name row pid configured process status
  [ -n "$resolved_current" ] || { log "PM2 cwd check failed: current symlink is unresolved"; return 1; }
  for name in kairox-next kairox-socket kairox-settlement; do
    row=$(pm2_jlist 2>/dev/null | python3 -c 'import json,sys; name=sys.argv[1]; p=next((p for p in json.load(sys.stdin) if p.get("name")==name), None); print("\t".join([str(p.get("pid",0)) if p else "0", str((p or {}).get("pm2_env",{}).get("cwd") or (p or {}).get("pm2_env",{}).get("pm_cwd") or ""), str((p or {}).get("pm2_env",{}).get("status") or "missing")]))' "$name")
    IFS=$'\t' read -r pid configured status <<< "$row"
    process=$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)
    log "$name status=$status configured_cwd=${configured:-missing} resolved_current=$resolved_current process_cwd=${process:-missing} pid=$pid"
    if [ "$status" != "online" ] || [ "$configured" != "$CURRENT_LINK" ] || [ "$process" != "$resolved_current" ]; then
      log "PM2 cwd verification failed for $name: configured=${configured:-missing} process=${process:-missing} expected=$resolved_current"
      return 1
    fi
  done
}

reload_or_replace_pm2() {
  if verify_pm2_cwds; then
    log "Existing PM2 processes already use current; reloading all three processes"
    su - hermes -c "export NVM_DIR=\"\$HOME/.nvm\"; . \"\$NVM_DIR/nvm.sh\"; pm2 reload kairox-next kairox-socket kairox-settlement --update-env"
  else
    log "PM2 processes use a previous release; controlled delete/start is required to move cwd without serving the wrong release"
    su - hermes -c "export NVM_DIR=\"\$HOME/.nvm\"; . \"\$NVM_DIR/nvm.sh\"; pm2 delete kairox-next kairox-socket kairox-settlement >/dev/null 2>&1 || true; pm2 start $PM2_CONFIG --update-env"
  fi
  su - hermes -c 'export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; pm2 save'
}

bluegreen_switch() {
  local release_dir="$1" previous_link="$2"
  local green_config="/tmp/ecosystem.config.cjs" old_upstream="/etc/nginx/conf.d/kairox-upstreams.conf"
  local old_next_port=3000 old_socket_port=3001 green_next_port=3100 green_socket_port=3101
  local switched=0
  cat > "$green_config" <<EOF
const path = require("node:path");
const root = ${release_dir@Q};
const env = require("/home/hermes/kairox-pm2.config.cjs").apps[0].env;
module.exports = { apps: [
  { name: "kairox-next-green", cwd: root, script: "node_modules/.bin/next", args: "start", env: { ...env, NODE_ENV: "production", PORT: "${green_next_port}" }, autorestart: false, exec_mode: "fork", instances: 1, out_file: path.join(root, "logs/next-green-out.log"), error_file: path.join(root, "logs/next-green-error.log") },
  { name: "kairox-socket-green", cwd: root, script: "node", args: "realtime/socket-server.mjs", env: { ...env, NODE_ENV: "production", PORT: "${green_socket_port}", SOCKET_PORT: "${green_socket_port}" }, autorestart: false, exec_mode: "fork", instances: 1, out_file: path.join(root, "logs/socket-green-out.log"), error_file: path.join(root, "logs/socket-green-error.log") }
] };
EOF
  cleanup_green() {
    su - hermes -c 'export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; pm2 delete kairox-next-green kairox-socket-green >/dev/null 2>&1 || true'
    rm -f "$green_config"
  }
  rollback_upstream() {
    printf 'upstream kairox_next_backend { server 127.0.0.1:%s; }\nupstream kairox_socket_backend { server 127.0.0.1:%s; }\n' "$old_next_port" "$old_socket_port" > "$old_upstream"
    nginx -t && systemctl reload nginx || true
    switched=0
  }
  log "Starting blue-green Next/Socket on ports $green_next_port/$green_socket_port"
  su - hermes -c "export NVM_DIR=\"\$HOME/.nvm\"; . \"\$NVM_DIR/nvm.sh\"; pm2 start $green_config" || { cleanup_green; return 1; }
  sleep 3
  local green_next_pid green_socket_pid
  green_next_pid=$(su - hermes -c 'export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; pm2 pid kairox-next-green')
  green_socket_pid=$(su - hermes -c 'export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; pm2 pid kairox-socket-green')
  log "Green cwd next=$(readlink -f /proc/$green_next_pid/cwd) socket=$(readlink -f /proc/$green_socket_pid/cwd)"
  [ "$(readlink -f "/proc/$green_next_pid/cwd")" = "$release_dir" ] || { cleanup_green; return 1; }
  [ "$(readlink -f "/proc/$green_socket_pid/cwd")" = "$release_dir" ] || { cleanup_green; return 1; }
  curl -ksSf "http://127.0.0.1:$green_next_port/login" >/dev/null || { cleanup_green; return 1; }
  curl -ksSf "http://127.0.0.1:$green_socket_port/socket.io/?EIO=4&transport=polling" >/dev/null || { cleanup_green; return 1; }
  printf 'upstream kairox_next_backend { server 127.0.0.1:%s; }\nupstream kairox_socket_backend { server 127.0.0.1:%s; }\n' "$green_next_port" "$green_socket_port" > "$old_upstream"
  nginx -t || { rollback_upstream; cleanup_green; return 1; }
  systemctl reload nginx || { rollback_upstream; cleanup_green; return 1; }
  switched=1
  sleep 2
  curl -ksSf https://kairoxmarkets.xyz/login >/dev/null || { rollback_upstream; cleanup_green; return 1; }
  log "Blue-green traffic switch passed"
  local formal_config="$green_config" formal_tmp="/tmp/ecosystem.formal.tmp.cjs"
  sed 's/kairox-next-green/kairox-next/g; s/kairox-socket-green/kairox-socket/g; s/cwd: root/cwd: "\/home\/hermes\/current"/g; s/PORT: "3100"/PORT: "3000"/g; s/PORT: "3101"/PORT: "3001"/g; s/SOCKET_PORT: "3101"/SOCKET_PORT: "3001"/g' "$green_config" > "$formal_tmp"
  mv "$formal_tmp" "$formal_config"
  # Keep traffic on green while the formal names are recreated on 3000/3001.
  su - hermes -c 'export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; pm2 delete kairox-next kairox-socket >/dev/null 2>&1 || true'
  su - hermes -c "export NVM_DIR=\"\$HOME/.nvm\"; . \"\$NVM_DIR/nvm.sh\"; pm2 start $formal_config" || { rollback_upstream; cleanup_green; rm -f "$formal_config"; return 1; }
  sleep 3
  local formal_next_pid formal_socket_pid
  formal_next_pid=$(su - hermes -c 'export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; pm2 pid kairox-next')
  formal_socket_pid=$(su - hermes -c 'export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; pm2 pid kairox-socket')
  [ "$(readlink -f "/proc/$formal_next_pid/cwd")" = "$release_dir" ] || { rollback_upstream; cleanup_green; rm -f "$formal_config"; return 1; }
  [ "$(readlink -f "/proc/$formal_socket_pid/cwd")" = "$release_dir" ] || { rollback_upstream; cleanup_green; rm -f "$formal_config"; return 1; }
  curl -ksSf "http://127.0.0.1:3000/login" >/dev/null || { rollback_upstream; cleanup_green; rm -f "$formal_config"; return 1; }
  curl -ksSf "http://127.0.0.1:3001/socket.io/?EIO=4&transport=polling" >/dev/null || { rollback_upstream; cleanup_green; rm -f "$formal_config"; return 1; }
  printf 'upstream kairox_next_backend { server 127.0.0.1:3000; }\nupstream kairox_socket_backend { server 127.0.0.1:3001; }\n' > "$old_upstream"
  nginx -t && systemctl reload nginx || { rollback_upstream; cleanup_green; rm -f "$formal_config"; return 1; }
  cleanup_green
  rm -f "$formal_config"
  su - hermes -c "export NVM_DIR=\"\$HOME/.nvm\"; . \"\$NVM_DIR/nvm.sh\"; pm2 delete kairox-settlement >/dev/null 2>&1 || true; pm2 start $PM2_CONFIG --only kairox-settlement"
  su - hermes -c 'export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; pm2 save'
  rm -f "$green_config"
  return 0
}

rollback_after_cutover() {
  local previous_link="$1"
  printf 'upstream kairox_next_backend { server 127.0.0.1:3000; }\nupstream kairox_socket_backend { server 127.0.0.1:3001; }\n' > /etc/nginx/conf.d/kairox-upstreams.conf
  nginx -t && systemctl reload nginx || log "WARNING: failed to restore old Nginx upstream"
  [ -n "$previous_link" ] && ln -sfn "$previous_link" "$CURRENT_LINK"
  reload_or_replace_pm2
}

case "${1:-deploy}" in
  assets)
    verify_assets "${2:?release directory required}" "${3:-$SHARED_STATIC}" "${4:-/tmp/kairox-asset-refs}"
    ;;
  deploy)
    # Prevent concurrent deployments
    exec 200>"$LOCK_FILE"
    flock -n 200 || { log "Another deployment is in progress"; exit 1; }

    RELEASE_ID=$(date +%Y%m%d-%H%M%S)
    RELEASE_DIR="$RELEASES_DIR/$RELEASE_ID"
    PREV_CURRENT=$(readlink "$CURRENT_LINK" 2>/dev/null || echo "")
    if [ -z "$SOURCE_COMMIT" ]; then
      SOURCE_COMMIT=$(git -C "$SOURCE_REPO" rev-parse "$SOURCE_BRANCH") || { log "Branch not found: $SOURCE_BRANCH"; exit 1; }
    fi
    log "=== Deploying $RELEASE_ID branch=$SOURCE_BRANCH commit=$SOURCE_COMMIT ==="
    [ -f "$PM2_CONFIG" ] || { log "Missing PM2 config: $PM2_CONFIG"; exit 1; }

    # 1. Export exactly the approved commit; never copy the dirty checkout.
    git -C "$SOURCE_REPO" cat-file -e "$SOURCE_COMMIT^{commit}" || { log "Commit not found: $SOURCE_COMMIT"; exit 1; }
    WORKTREE_DIRTY=false
    [ -n "$(git -C "$SOURCE_REPO" status --porcelain)" ] && WORKTREE_DIRTY=true
    log "source_mode=git-archive working_tree_dirty=$WORKTREE_DIRTY release_contains_dirty_changes=false"
    mkdir -p "$RELEASE_DIR"
    git -C "$SOURCE_REPO" archive --format=tar "$SOURCE_COMMIT" | tar -xf - -C "$RELEASE_DIR"
    # Initialize per-release PM2 log directory before reload.
    mkdir -p "$RELEASE_DIR/logs"
    chown hermes:hermes "$RELEASE_DIR/logs"
    printf 'commit=%s\nsource_repo=%s\nsource_branch=%s\nbuild_timestamp=%s\nrelease_name=%s\nsource_mode=git-archive\ndirty=false\nworking_tree_dirty=%s\nrelease_contains_dirty_changes=false\n' \
      "$SOURCE_COMMIT" "$SOURCE_REPO" "$SOURCE_BRANCH" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$RELEASE_ID" "$WORKTREE_DIRTY" \
      > "$RELEASE_DIR/RELEASE_METADATA"
    chown -R hermes:hermes "$RELEASE_DIR"

    # 2. Build from a clean release directory.
    log "Building..."
    su - hermes -c "export NVM_DIR=\"\$HOME/.nvm\"; [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"; cd $RELEASE_DIR && npm ci && npm run lint && npm run build" || {
      log "BUILD FAILED — aborting"
      rm -rf "$RELEASE_DIR"
      exit 1
    }
    log "Build complete"

    # 3. Post-build fixes
    find "$RELEASE_DIR/.next/static/chunks/" -name '*.css' -exec sed -i -E 's/;unicode-range:[^}]+\}//g' {} \;
    sed -i 's|api.resend.com/email"|api.resend.com/emails"|g' "$RELEASE_DIR/.next/server/chunks/"*.js

    # 4. Sync static files to shared directory without deleting old chunks.
    log "Syncing static to shared..."
    mkdir -p "$SHARED_STATIC"
    rsync -a "$RELEASE_DIR/.next/static/" "$SHARED_STATIC/"
    chmod -R 755 "$SHARED_STATIC"
    find "$SHARED_STATIC" -type f -exec chmod 644 {} \;
    log "Shared static: $(find "$SHARED_STATIC" -type f | wc -l) files"

    # 5. Verify every JS/CSS referenced by HTML/RSC/manifests exists in both places.
    log "Verifying chunk integrity..."
    REFS_FILE="$RELEASE_DIR/.asset-refs"
    if ! verify_assets "$RELEASE_DIR" "$SHARED_STATIC" "$REFS_FILE"; then
      log "Chunk verification FAILED — aborting before current switch and PM2 reload"
      rm -rf "$RELEASE_DIR"
      exit 1
    fi
    log "All referenced JS/CSS assets verified ($(wc -l < "$REFS_FILE") files)"

    # 6. Atomic switch via temp symlink + mv
    TMP_LINK="${CURRENT_LINK}.tmp.$$"
    ln -sfn "$RELEASE_DIR" "$TMP_LINK"
    mv -Tf "$TMP_LINK" "$CURRENT_LINK"
    log "current → $RELEASE_DIR"

    # 7. Reload when safe; otherwise use controlled replacement to move cwd.
    log "Updating PM2 with blue-green cutover from $CURRENT_LINK..."
    if ! bluegreen_switch "$RELEASE_DIR" "$PREV_CURRENT"; then
      log "Blue-green cutover FAILED — restoring previous release"
      [ -n "$PREV_CURRENT" ] && ln -sfn "$PREV_CURRENT" "$CURRENT_LINK"
      reload_or_replace_pm2
      rm -rf "$RELEASE_DIR"
      exit 1
    fi
    sleep 3
    if ! verify_pm2_cwds; then
      log "PM2 cwd verification failed — rolling back"
      rollback_after_cutover "$PREV_CURRENT"
      rm -rf "$RELEASE_DIR"
      exit 1
    fi

    # 8. Health check
    for i in $(seq 1 10); do
      CODE=$(curl -sk -o /dev/null -w '%{http_code}' https://kairoxmarkets.xyz/ --connect-timeout 5 2>/dev/null)
      [ "$CODE" = "200" ] && break
      sleep 1
    done
    if [ "$CODE" != "200" ]; then
      log "HEALTH CHECK FAILED — rolling back"
      rollback_after_cutover "$PREV_CURRENT"
      rm -rf "$RELEASE_DIR"
      exit 1
    fi
    log "Health check: HTTP $CODE"

    # 9. Continuous request validation
    log "Continuous request validation (30 requests @ 200ms)..."
    REQ_FAILS=0
    for i in $(seq 1 30); do
      CODE=$(curl -sk -o /dev/null -w '%{http_code}' https://kairoxmarkets.xyz/ --connect-timeout 3 2>/dev/null)
      [ "$CODE" != "200" ] && REQ_FAILS=$((REQ_FAILS+1))
      sleep 0.2
    done
    if [ "$REQ_FAILS" -gt 0 ]; then
      log "Continuous request FAILED ($REQ_FAILS/30 failures) — rolling back"
      rollback_after_cutover "$PREV_CURRENT"
      rm -rf "$RELEASE_DIR"
      exit 1
    fi
    log "Continuous requests: 30/30 OK"

    # 10. Run full health check
    log "Running health-check.sh..."
    if ! bash /home/hermes/health-check.sh --quiet; then
      log "Health check FAILED — rolling back"
      rollback_after_cutover "$PREV_CURRENT"
      rm -rf "$RELEASE_DIR"
      exit 1
    fi

    # 11. Cleanup old releases (keep 3)
    ls -dt "$RELEASES_DIR"/*/ 2>/dev/null | tail -n +4 | while read old; do
      log "Cleaning old release: $(basename $old)"
      rm -rf "$old"
    done
    log "=== Deploy complete ==="
    ;;

  rollback)
    RELEASES=($(ls -dt "$RELEASES_DIR"/*/ 2>/dev/null))
    CURRENT=$(readlink "$CURRENT_LINK")
    log "Current: $CURRENT"
    log "Available releases:"
    for i in "${!RELEASES[@]}"; do
      MARK=""
      [ "${RELEASES[$i]%/}" = "$CURRENT" ] && MARK=" ← current"
      log "  $((i+1)). ${RELEASES[$i]}$MARK"
    done

    TARGET="${2:-}"
    if [ -z "$TARGET" ]; then
      for r in "${RELEASES[@]}"; do
        [ "${r%/}" != "$CURRENT" ] && { TARGET="$r"; break; }
      done
    fi
    [ -z "$TARGET" ] && { log "No previous release to rollback to"; exit 1; }
    log "Rolling back to: $TARGET"

    ln -sfn "$TARGET" "$CURRENT_LINK"
    reload_or_replace_pm2
    log "=== Rollback complete ==="
    ;;

  *)
    echo "Usage: $0 {deploy|assets <release-dir> [shared-dir] [refs-file]|rollback [release-dir]}"
    exit 1
    ;;
esac
