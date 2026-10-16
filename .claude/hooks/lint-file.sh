#!/usr/bin/env bash
# Runs ESLint with --fix on the one TypeScript file Claude just changed.
# Remaining errors go back to Claude (exit 2) so they are fixed before push.
set -uo pipefail

input=$(cat)
file=$(jq -r '.tool_input.file_path // empty' <<<"$input")
case "$file" in
  *.ts|*.tsx|*.mts|*.mjs) ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
[ -x "$root/node_modules/.bin/eslint" ] || exit 0

cd "$root"
if ! out=$(node_modules/.bin/eslint --fix "$file" 2>&1); then
  echo "$out" >&2
  exit 2
fi
exit 0
