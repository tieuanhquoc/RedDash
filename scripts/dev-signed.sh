#!/usr/bin/env bash
# Run `tauri dev` with auto ad-hoc codesigning so macOS Keychain entries
# persist across Rust rebuilds. Without signing, each rebuild changes the
# binary signature, invalidating the previous biometric enrollment.
#
# Requires fswatch:  brew install fswatch
# Usage:             npm run tauri:dev:signed

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BINARY="${REPO_ROOT}/src-tauri/target/debug/redmine-dashboard"
ENTITLEMENTS="${REPO_ROOT}/src-tauri/tauri.app.entitlements"
DEBOUNCE_SECONDS=3

if ! command -v fswatch >/dev/null 2>&1; then
  echo "✗ fswatch not found — install via: brew install fswatch" >&2
  exit 1
fi

LAST_SIGN=0
sign() {
  local now
  now=$(date +%s)
  # Debounce: codesign itself triggers an fswatch event for the binary, which
  # would loop forever. Skip if we signed within the last N seconds.
  if (( now - LAST_SIGN < DEBOUNCE_SECONDS )); then
    return
  fi
  if [[ -x "$BINARY" ]]; then
    if codesign --force --sign - --entitlements "$ENTITLEMENTS" "$BINARY" 2>/dev/null; then
      LAST_SIGN=$(date +%s)
      echo "✓ codesigned $(basename "$BINARY")"
    else
      echo "✗ codesign failed (continuing)" >&2
    fi
  fi
}

# Initial sign in case binary already exists.
sign

# Watch the binary and re-sign on every link. Use process substitution so the
# debounce variable updates persist in the main shell (a piped while loop
# would run in a subshell with isolated state → loop forever).
watch_loop() {
  while read -r _; do
    sleep 0.3    # let the linker finish writing
    sign
  done < <(fswatch -o "$BINARY" 2>/dev/null)
}

watch_loop &
WATCHER_PID=$!

cleanup() {
  kill "$WATCHER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Hand off to the real Tauri dev command.
cd "$REPO_ROOT"
npm run tauri -- dev
