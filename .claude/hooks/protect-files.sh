#!/usr/bin/env bash
# Blocks edits to secrets, the lock file and migrations that already exist.
# Exit 2 sends the message back to Claude and the edit does not happen.
set -euo pipefail

input=$(cat)
file=$(jq -r '.tool_input.file_path // empty' <<<"$input")
[ -z "$file" ] && exit 0

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
rel="${file#"$root"/}"

case "$rel" in
  .env.example) ;;
  .env|.env.*|*/.env|*/.env.*)
    echo "Blocked: $rel holds secrets (Stripe, Resend, odds API). Edit it by hand." >&2
    exit 2 ;;
  package-lock.json)
    echo "Blocked: change package.json and run npm install instead of editing package-lock.json." >&2
    exit 2 ;;
  prisma/migrations/*/migration.sql)
    if [ -f "$file" ]; then
      echo "Blocked: $rel has already been applied. Add a new numbered migration instead (see the ny-migration skill)." >&2
      exit 2
    fi ;;
esac
exit 0
