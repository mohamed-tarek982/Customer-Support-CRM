#!/usr/bin/env bash
#
# Fails if any palette hex code appears outside frontend/design-tokens/.
#
# The point of the token file is that color="primary" (Vuetify) and bg-primary
# (Tailwind) resolve to one value. The moment someone pastes #1E6FEB into a
# component, the two systems start drifting apart and nothing catches it — the
# page still renders, just very slightly wrong, in one place.
#
# Run from anywhere:  bash frontend/scripts/check-token-drift.sh
set -uo pipefail

cd "$(dirname "$0")/../.."   # repository root

TOKENS_FILE="frontend/design-tokens/index.ts"

if [ ! -f "$TOKENS_FILE" ]; then
  echo "FAIL: $TOKENS_FILE is missing. Design tokens have no home."
  exit 1
fi

HEXES="$(grep -oiE '#[0-9a-f]{6}' "$TOKENS_FILE" | tr 'a-f' 'A-F' | sort -u)"

if [ -z "$HEXES" ]; then
  echo "FAIL: no hex colours found in $TOKENS_FILE. Has the palette moved?"
  exit 1
fi

EXCLUDES=(
  --exclude-dir=node_modules
  --exclude-dir=.git
  --exclude-dir=.nuxt
  --exclude-dir=.output
  --exclude-dir=dist
  --exclude-dir=coverage
  --exclude-dir=.squad
  --exclude-dir=migrations
  --exclude=pnpm-lock.yaml
  --exclude=package-lock.json
)

FOUND=0

for hex in $HEXES; do
  # -i so #1e6feb and #1E6FEB are both caught.
  MATCHES="$(grep -rniI "${EXCLUDES[@]}" -- "$hex" . 2>/dev/null \
    | grep -v "design-tokens/index.ts" \
    | grep -v "check-token-drift.sh" || true)"

  if [ -n "$MATCHES" ]; then
    if [ $FOUND -eq 0 ]; then
      echo "FAIL: palette hex codes found outside $TOKENS_FILE"
      echo ""
    fi
    FOUND=1
    echo "  $hex"
    echo "$MATCHES" | sed 's/^/    /'
    echo ""
  fi
done

if [ $FOUND -ne 0 ]; then
  echo "Import the token instead:"
  echo "  Vue/plugin:  import { palette } from '~/design-tokens'"
  echo "  Tailwind:    already available as bg-primary, text-primary, ..."
  exit 1
fi

echo "PASS: every palette hex lives only in $TOKENS_FILE."
exit 0
