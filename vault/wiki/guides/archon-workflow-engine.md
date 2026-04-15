---
title: Archon — Workflow Engine para AI Coding
description: Tutorial completo de setup, uso e workflows do Archon no workspace ChatFunnel
tags: [guide, archon, workflows, ai, automation]
related: ["[[skills-workspace-guide]]"]
last_updated: 2026-04-12
---

# Archon — Workflow Engine para AI Coding

Motor de workflows declarativos (YAML) que orquestra agentes de IA (Claude Code / Codex) para tarefas de desenvolvimento. Mantido pela comunidade open-source (17k+ stars, MIT).

- **Repo**: https://github.com/coleam00/archon
- **Local**: `D:\Code\4-Vinicius\archon`
- **Web UI**: http://localhost:3090
- **Docs**: https://archon.diy

## Por que usar

- Workflows declarativos reutilizaveis pelo time (YAML no repo)
- Code review multi-agente (5 reviewers paralelos)
- Git worktree isolation — tarefas paralelas sem conflito de branch
- Human-in-the-loop — gates de aprovacao antes de merge
- **Comunidade mantém** — updates, bug fixes e novos workflows sem esforco proprio

## Stack

- **Runtime**: Bun (nao Node)
- **DB**: SQLite (default) ou PostgreSQL
- **Auth**: Claude global auth (`claude /login`)
- **Server**: porta 3090

## Setup (ja feito)

### 1. Instalar Bun

```bash
powershell -Command "irm bun.sh/install.ps1 | iex"
```

### 2. Clonar e instalar

```bash
cd /d/Code/4-Vinicius
git clone https://github.com/coleam00/archon.git
cd archon
bun install
```

### 3. Configurar `.env`

```env
CLAUDE_USE_GLOBAL_AUTH=true
DEFAULT_AI_ASSISTANT=claude
PORT=3090
```

### 4. Build da Web UI

```bash
bun run build:web
```

### 5. Subir o server

```bash
bun run dev:server
```

Acessar http://localhost:3090

## Codebases registrados

Todos os repos do ChatFunnel estao registrados:

| Codebase | Path |
|----------|------|
| chatfunnel-front | `chatfunnel-front/` |
| chatfunnel-api | `chatfunnel-api/` |
| chatfunnel-services | `chatfunnel-services/` |
| chatfunnel-external-api | `chatfunnel-external-api/` |
| chatfunnel-gateway | `chatfunnel-gateway/` |
| chatfunnel-websocket | `chatfunnel-websocket/` |
| chatfunnel-worker-broadcast | `chatfunnel-worker-broadcast/` |
| chatfunnel-scheduler | `chatfunnel-scheduler/` |
| chatfunnel-core | `chatfunnel-core/` |
| chatfunnel-mcp | `chatfunnel-mcp/` |

Para registrar novos repos via API:

```bash
curl -X POST http://localhost:3090/api/codebases \
  -H "Content-Type: application/json" \
  -d '{"name":"repo-name","path":"D:/Code/4-Vinicius/Chatfunnel/repo-name"}'
```

## Workflows disponiveis

### Roteamento automatico

O Archon roteia automaticamente pelo conteudo da mensagem:

| Voce diz | Workflow ativado | O que faz |
|----------|-----------------|-----------|
| Pergunta sobre o codigo | `archon-assist` | IA conversa sobre o codebase |
| "Create a PR that adds X" | `archon-idea-to-pr` | Planeja → implementa → testa → cria PR |
| "Fix issue #123" | `archon-fix-github-issue` | Investiga issue → branch → fix → PR |
| "Review PR #456" | `archon-smart-pr-review` | Review com multiplos agentes especializados |
| "Plan architecture for X" | `archon-architect` | Analise arquitetural com PRD |
| "Refactor X safely" | `archon-refactor-safely` | Refactor com testes de regressao |

### Workflows completos

| Workflow | Descricao |
|----------|-----------|
| `archon-assist` | Chat livre sobre o codigo (mais leve) |
| `archon-idea-to-pr` | Ideia → planejamento → implementacao → PR |
| `archon-plan-to-pr` | Plano existente → implementacao → PR |
| `archon-fix-github-issue` | Issue do GitHub → branch → fix → PR |
| `archon-feature-development` | Feature completa com testes |
| `archon-comprehensive-pr-review` | 5 agentes revisam em paralelo (seguranca, performance, qualidade, etc.) |
| `archon-smart-pr-review` | Review inteligente (menos agentes, mais rapido) |
| `archon-validate-pr` | Valida PR antes de merge |
| `archon-adversarial-dev` | Desenvolvimento com agente adversarial que tenta quebrar |
| `archon-architect` | Planejamento arquitetural |
| `archon-refactor-safely` | Refactor com safety nets |
| `archon-resolve-conflicts` | Resolve conflitos de merge |
| `archon-piv-loop` | Plan → Implement → Verify loop |
| `archon-interactive-prd` | PRD interativo com aprovacao humana |
| `archon-create-issue` | Cria issue estruturada no GitHub |

## Como usar na pratica

### 1. Abrir Web UI

Acessar http://localhost:3090

### 2. Selecionar codebase

No dropdown superior, escolher o repo alvo (ex: `chatfunnel-front`).

### 3. Conversar

Digitar a tarefa em linguagem natural. Exemplos:

**Simples (assist):**
> "What components are used in the dashboard page?"

**Medio (fix):**
> "Fix the TypeScript errors in the kanban board component"

**Avancado (idea-to-pr):**
> "Create a PR that adds dark mode support to the settings page"

### 4. Monitorar

- A Web UI mostra o progresso em tempo real
- Cada node do workflow aparece com status (pending → running → completed)
- Nodes interativos pausam e pedem aprovacao

## Workflows customizados

Criar YAML em `.archon/workflows/` dentro de qualquer repo. O arquivo com mesmo nome sobrescreve o default.

Exemplo basico:

```yaml
name: chatfunnel-lint-fix
description: Roda lint, corrige erros, commita
trigger_rules:
  - "fix lint"
  - "lint errors"

nodes:
  lint-check:
    prompt: |
      Run the linter and identify all errors.
      List each file and error.

  fix-errors:
    depends_on: [lint-check]
    prompt: |
      Fix all lint errors found in the previous step.
      Do not change logic, only formatting and lint rules.

  verify:
    depends_on: [fix-errors]
    bash: "npm run lint"

  commit:
    depends_on: [verify]
    interactive: true
    prompt: |
      Create a commit with the lint fixes.
      Use conventional commit format: fix(lint): description
```

## Integracao com plataformas (opcional)

No `.env` do Archon:

- **Slack**: `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN`
- **Discord**: `DISCORD_BOT_TOKEN`
- **Telegram**: `TELEGRAM_BOT_TOKEN`
- **GitHub Webhooks**: `GH_TOKEN` + `WEBHOOK_SECRET`

Isso permite disparar workflows de fora (ex: comentar `@archon fix this` numa issue do GitHub).

## Comandos uteis

```bash
# Subir server
cd /d/Code/4-Vinicius/archon
export PATH="$HOME/.bun/bin:$PATH"
bun run dev:server

# Subir server + web dev (hot reload)
bun run dev

# Listar codebases
curl http://localhost:3090/api/codebases

# Ver conversas
curl http://localhost:3090/api/conversations

# Health check
curl http://localhost:3090/api/health
```

## Atualizar Archon

```bash
cd /d/Code/4-Vinicius/archon
git pull
bun install
bun run build:web
# Reiniciar o server
```

## Custos

Cada workflow spawna sessoes do Claude Code que consomem tokens:

| Workflow | Custo estimado |
|----------|---------------|
| `archon-assist` | Baixo (1 sessao) |
| `archon-fix-github-issue` | Medio (2-3 sessoes) |
| `archon-idea-to-pr` | Alto (3-5 sessoes) |
| `archon-comprehensive-pr-review` | Alto (5+ sessoes paralelas) |

Dica: comece com `archon-assist` para familiarizar, depois escale para workflows mais complexos.
