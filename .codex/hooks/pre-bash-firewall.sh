#!/usr/bin/env bash
set -euo pipefail

input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")

# Bloqueia comandos destrutivos
if echo "$cmd" | grep -qE '(rm -rf /|rm -rf \.|sudo rm|chmod 777|git reset --hard|git push.*--force|git push.*-f[^i])'; then
  echo "Comando potencialmente destrutivo bloqueado: $cmd" >&2
  exit 2
fi

# --- Prisma migration workflow ---

if echo "$cmd" | grep -qE 'prisma\s+db\s+push'; then
  echo "BLOQUEADO: 'prisma db push' nao e permitido." >&2
  echo "Use: npx prisma migrate dev --name <nome> --create-only" >&2
  exit 2
fi

if echo "$cmd" | grep -qE 'prisma\s+migrate\s+deploy'; then
  echo "BLOQUEADO: 'prisma migrate deploy' nao e permitido." >&2
  exit 2
fi

if echo "$cmd" | grep -qE 'prisma\s+migrate\s+dev' && ! echo "$cmd" | grep -qE '\-\-create-only'; then
  echo "BLOQUEADO: 'prisma migrate dev' sem '--create-only'." >&2
  echo "Use: npx prisma migrate dev --name <nome> --create-only" >&2
  exit 2
fi

# --- Git flow ---

CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")

if echo "$cmd" | grep -qE 'git\s+merge'; then
  if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ] || [ "$CURRENT_BRANCH" = "release" ]; then
    echo "BLOQUEADO: merge direto na branch '$CURRENT_BRANCH'." >&2
    echo "Fluxo: feature/fix -> beta -> release -> main" >&2
    exit 2
  fi
fi

# Branch naming convention
BRANCH_NAME=""
if echo "$cmd" | grep -qE 'git\s+checkout\s+-b\s+'; then
  BRANCH_NAME=$(echo "$cmd" | grep -oE 'git\s+checkout\s+-b\s+\S+' | awk '{print $NF}')
elif echo "$cmd" | grep -qE 'git\s+switch\s+-c\s+'; then
  BRANCH_NAME=$(echo "$cmd" | grep -oE 'git\s+switch\s+-c\s+\S+' | awk '{print $NF}')
fi

if [ -n "$BRANCH_NAME" ]; then
  if [ "$BRANCH_NAME" = "beta" ] || [ "$BRANCH_NAME" = "main" ] || [ "$BRANCH_NAME" = "master" ] || [ "$BRANCH_NAME" = "release" ]; then
    true
  elif ! echo "$BRANCH_NAME" | grep -qE '^(fix|feature)/'; then
    echo "BLOQUEADO: branch '$BRANCH_NAME' invalida." >&2
    echo "Use: fix/<nome> ou feature/<nome>" >&2
    exit 2
  fi
fi

exit 0
