#!/usr/bin/env sh
set -eu

SKILL_NAME="hf-model-architecture"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
SOURCE_DIR="$SCRIPT_DIR"

usage() {
  cat <<EOF
Install $SKILL_NAME into Claude Code, Codex CLI, and/or Cursor skill directories.

Usage:
  ./install.sh [--all | --claude | --codex | --cursor] [--link]

Options:
  --all      Install to every detected skills directory (default)
  --claude   Install to ~/.claude/skills/
  --codex    Install to ~/.codex/skills/
  --cursor   Install to ~/.cursor/skills/
  --link     Symlink instead of copying
  --help     Show this help

After install, dependencies are installed in the skill directory and
Playwright Chromium is downloaded when needed.
EOF
}

TARGETS=""
USE_LINK=0

while [ $# -gt 0 ]; do
  case "$1" in
    --all) TARGETS="claude codex cursor" ;;
    --claude) TARGETS="$TARGETS claude" ;;
    --codex) TARGETS="$TARGETS codex" ;;
    --cursor) TARGETS="$TARGETS cursor" ;;
    --link) USE_LINK=1 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
  shift
done

if [ -z "$TARGETS" ]; then
  TARGETS="claude codex cursor"
fi

install_one() {
  host=$1
  dest=$2
  mkdir -p "$(dirname "$dest")"
  if [ -e "$dest" ] || [ -L "$dest" ]; then
    echo "Removing existing $host target: $dest"
    rm -rf "$dest"
  fi
  if [ "$USE_LINK" -eq 1 ]; then
    ln -s "$SOURCE_DIR" "$dest"
    echo "Linked $host -> $dest"
  else
    cp -R "$SOURCE_DIR" "$dest"
    echo "Copied $host -> $dest"
  fi
}

for host in $TARGETS; do
  case "$host" in
    claude) install_one claude "$HOME/.claude/skills/$SKILL_NAME" ;;
    codex) install_one codex "$HOME/.codex/skills/$SKILL_NAME" ;;
    cursor) install_one cursor "$HOME/.cursor/skills/$SKILL_NAME" ;;
  esac
done

echo "Installing npm dependencies..."
(cd "$SOURCE_DIR" && npm install)

if command -v npx >/dev/null 2>&1; then
  echo "Installing Playwright Chromium..."
  (cd "$SOURCE_DIR" && npx playwright install chromium)
else
  echo "npx not found; run 'npx playwright install chromium' inside $SOURCE_DIR"
fi

echo "Done. Invoke with: Use hf-model-architecture to capture <owner/model>"
