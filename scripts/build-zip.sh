#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"

cd "$ROOT_DIR"
mkdir -p "$DIST_DIR"

# Extract version from manifest.json
VERSION=$(sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' manifest.json | head -n1)
if [ -z "${VERSION:-}" ]; then
  VERSION="dev"
fi

OUT_ZIP="$DIST_DIR/linkbox-$VERSION.zip"

echo "Cleaning old archives…"
rm -f "$DIST_DIR"/*.zip || true

echo "Creating $OUT_ZIP"
zip -r -q "$OUT_ZIP" \
  manifest.json \
  background.js \
  popup.html popup.js \
  manage.html manage.js \
  import.html import.js \
  styles.css \
  icons \
  _locales

echo "Done: $OUT_ZIP"

