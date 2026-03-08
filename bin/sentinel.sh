#!/usr/bin/env sh
# Sentinel CLI launcher — locates tsx and entry point via npm root.
NODE_MODULES="$(npm root 2>/dev/null)"
if [ -z "$NODE_MODULES" ] || [ ! -d "$NODE_MODULES" ]; then
  echo "sentinel: could not find node_modules — run from project root" >&2
  exit 1
fi
exec "$NODE_MODULES/.bin/tsx" "$NODE_MODULES/sentinel/src/cli/index.ts" "$@"
