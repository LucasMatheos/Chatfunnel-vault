#!/usr/bin/env bash

# Bloqueia edicoes diretas em branches protegidas nos sub-repos.

SUBREPO_NAMES="chatfunnel-api chatfunnel-services chatfunnel-front chatfunnel-database chatfunnel-core"

input=$(cat)
FILE_PATH=$(echo "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // ""' 2>/dev/null)

if [ -z "$FILE_PATH" ] || [ "$FILE_PATH" = "null" ]; then
  exit 0
fi

FILE_DIR=$(dirname "$FILE_PATH")
if [ ! -d "$FILE_DIR" ]; then
  exit 0
fi

REPO_DIR=$(git -C "$FILE_DIR" rev-parse --show-toplevel 2>/dev/null)
if [ -z "$REPO_DIR" ]; then
  exit 0
fi

CURRENT_BRANCH=$(git -C "$REPO_DIR" branch --show-current 2>/dev/null)
if [ -z "$CURRENT_BRANCH" ]; then
  exit 0
fi

REPO_NAME=$(basename "$REPO_DIR")

IS_SUBREPO="false"
for name in $SUBREPO_NAMES; do
  if [ "$REPO_NAME" = "$name" ]; then
    IS_SUBREPO="true"
    break
  fi
done

# Branches protegidas em TODOS os repos
if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ] || [ "$CURRENT_BRANCH" = "release" ]; then
  echo "BLOQUEADO: '$REPO_NAME' esta na branch '$CURRENT_BRANCH'." >&2
  echo "Crie uma branch antes de editar:" >&2
  echo "  cd $REPO_DIR && git checkout -b feature/<nome>" >&2
  exit 2
fi

# Beta protegida APENAS em sub-repos
if [ "$IS_SUBREPO" = "true" ] && [ "$CURRENT_BRANCH" = "beta" ]; then
  echo "BLOQUEADO: '$REPO_NAME' esta na branch 'beta'." >&2
  echo "Crie uma feature branch primeiro:" >&2
  echo "  cd $REPO_DIR && git checkout -b feature/<nome>" >&2
  exit 2
fi

exit 0
