#!/usr/bin/env bash
# Cloud sessions only: install dependencies so lint, typecheck, vitest and
# pytest work from the first message. Local sessions are left alone.
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "$CLAUDE_PROJECT_DIR"

if [ ! -d node_modules ]; then
  npm ci --no-audit --no-fund >/dev/null
fi

if ! python3 -c "import pandas, lightgbm, pytest" 2>/dev/null; then
  python3 -m pip install -q --root-user-action=ignore -r pe/requirements.txt
fi

# The app runs without a database on the demo universe.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export DEMO_MODE=\${DEMO_MODE:-true}" >> "$CLAUDE_ENV_FILE"
fi
