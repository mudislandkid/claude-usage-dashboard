#!/usr/bin/env bash
# Codesigns every .node native addon under src-tauri/server-bundle/node_modules with
# hardened runtime + entitlements. Notarization fails if any embedded .node is unsigned.
# Run this BEFORE `tauri build`.
#
# Required env: APPLE_SIGNING_IDENTITY (exact codesign identity string).

set -euo pipefail

if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  echo "ERROR: APPLE_SIGNING_IDENTITY not set" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENTITLEMENTS="${REPO_ROOT}/src-tauri/entitlements.plist"
SEARCH_DIR="${REPO_ROOT}/src-tauri/server-bundle/node_modules"

if [[ ! -f "$ENTITLEMENTS" ]]; then
  echo "ERROR: entitlements file not found at ${ENTITLEMENTS}" >&2
  exit 1
fi

if [[ ! -d "$SEARCH_DIR" ]]; then
  echo "ERROR: ${SEARCH_DIR} does not exist (run \`npm run prepare:server-deps\` first)" >&2
  exit 1
fi

echo "[sign-addons] Searching for .node files under ${SEARCH_DIR}"
mapfile -t ADDONS < <(find "$SEARCH_DIR" -name "*.node" -type f)

if [[ ${#ADDONS[@]} -eq 0 ]]; then
  echo "[sign-addons] No .node files found — nothing to sign."
  exit 0
fi

for addon in "${ADDONS[@]}"; do
  echo "[sign-addons] Signing: $addon"
  codesign --force --timestamp --options runtime \
    --entitlements "$ENTITLEMENTS" \
    --sign "$APPLE_SIGNING_IDENTITY" \
    "$addon"
  codesign --verify --strict --verbose=2 "$addon"
done

echo "[sign-addons] All ${#ADDONS[@]} addons signed and verified."
