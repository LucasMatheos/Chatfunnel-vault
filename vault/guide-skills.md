---
title: Guia de Skills & Workspace
description: Guia pratico de como usar skills, rules, vault e ferramentas configuradas no workspace ChatFunnel
tags: [guide, skills, workspace, rules, vault]
last_updated: 2026-04-05
---

# ChatFunnel — Guia de Skills & Workspace

Guia pratico de como usar as skills, rules, vault e ferramentas configuradas no workspace.

> [!tip] No Claude Code, digite `/` para ver as skills disponiveis, ou mencione o nome da skill na conversa.

---

## 1. Como funciona o sistema de Skills

Skills sao "superpoderes" que o Claude carrega sob demanda. Algumas ativam automaticamente quando voce trabalha em certos arquivos; outras voce invoca manualmente.

| Tipo | Onde ficam | Quando carregam |
|------|-----------|----------------|
| **Custom** | `.claude/skills/` do projeto | Sob demanda ou por trigger |
| **Official** | Anthropic skills repo | Por trigger automatico |
| **Community** | `.claude/skills/` (instaladas do skills.sh) | Por trigger ou invocacao |
| **Plugin** | Plugins instalados (ECC, superpowers, etc.) | Automatico por contexto |
| **Rules** | `.claude/rules/` de cada repo | Automatico ao abrir arquivos do repo |

---

## 2. Skills Instaladas no Projeto

### `obsidian-vault` — Custom
> Gerencia o vault Obsidian — navega indices, cria/edita wikis, processa raw, mantem wikilinks.

- **Invocar:** `/obsidian-vault`
- **Quando usar:** documentar features, criar gotchas, ADRs, processar `raw/`

### `claude-api` — Anthropic Official
> Referencia completa da API Claude — tool use, streaming, batches, Agent SDK, prompt caching. 27 arquivos de docs.

- **Invocar:** ativa automaticamente ao importar `@anthropic-ai/sdk`
- **Quando usar:** trabalhar nos modulos `a2a/` ou `agents-v2/` do services

### `tailwind-design-system` — Community
> Design systems com Tailwind CSS v4 — tokens, componentes, responsive patterns, migracao v3→v4.

- **Invocar:** `/tailwind-design-system`
- **Quando usar:** criar/modificar componentes no chatfunnel-front

### `typescript-advanced-types` — Community
> Generics, conditional types, mapped types, template literals, utility types avancados.

- **Invocar:** `/typescript-advanced-types`
- **Quando usar:** criar tipos complexos em qualquer repo TypeScript

### `postgresql-table-design` — Community
> Design de tabelas PostgreSQL — tipos, indices, constraints, normalizacao, performance.

- **Invocar:** `/postgresql-table-design`
- **Quando usar:** alterar schema Prisma no chatfunnel-core

### `prompt-engineering-patterns` — Community
> Tecnicas avancadas de prompt — chain-of-thought, few-shot, system prompts, otimizacao.

- **Invocar:** `/prompt-engineering-patterns`
- **Quando usar:** criar/melhorar prompts dos agentes IA em `services/modules/a2a/prompts/`

### `security-best-practices` — Community
> Review de seguranca por framework — Express, Vue, Go. OWASP, auth, XSS, injection.

- **Invocar:** `/security-best-practices`
- **Quando usar:** antes de deploy, ao criar endpoints com input de usuario

---

## 3. Rules por Repo (carregam automaticamente)

Rules sao instrucoes modulares em `.claude/rules/` que carregam automaticamente quando Claude trabalha nos arquivos daquele repo.

### chatfunnel-front
- `design-system.md` — CVA variants, tamanhos, tokens, field system, icones Phosphor

### chatfunnel-services
- `nestjs-patterns.md` — DTOs, guards, Swagger, error handling, logging
- `ai-agents.md` — Anthropic SDK, Mastra, sessions, tools, prompts

### chatfunnel-api
- `command-pattern.md` — createRoute(), commands, JS puro, module aliases
- `queue-patterns.md` — Bull queues, BaseQueue, workers

> [!info] Rules NAO precisam ser invocadas — carregam sozinhas ao trabalhar no repo.

---

## 4. Cenarios de Uso — Quando usar cada skill

### Frontend (chatfunnel-front)

#### Criar um novo componente de input
`design-system.md` → `/tailwind-design-system` → vault [[frontend-layer]]

O rule `design-system.md` carrega automaticamente com as specs de CVA, tamanhos e tokens. Se precisar de patterns avancados de Tailwind v4, invoque a skill.

#### Criar formulario com validacao
`design-system.md` → `/typescript-advanced-types` → vault [[automations]]

VeeValidate + Zod. O rule ja tem o Field System pattern. Para tipos Zod complexos, use a skill de TypeScript.

---

### Backend — Services (chatfunnel-services)

#### Criar um novo modulo NestJS
`nestjs-patterns.md` → vault [[services-layer]]

O rule carrega automaticamente: estrutura Controller → Service → Repository, DTOs com class-validator, decorators Swagger.

#### Trabalhar nos agentes IA
`ai-agents.md` → `/claude-api` → `/prompt-engineering-patterns` → vault [[ai-agents-architecture]]

O rule `ai-agents.md` cobre Anthropic SDK + Mastra. A skill `claude-api` ativa automaticamente ao tocar no SDK. Para melhorar prompts, use `/prompt-engineering-patterns`.

#### Alterar o schema do banco
`/postgresql-table-design` → vault [[database-architecture]] → vault [[database-gotchas]]

Use a skill para design de tabela, consulte o vault para entender o schema existente e os gotchas de migrations.

---

### Backend — API (chatfunnel-api)

#### Criar nova rota + command
`command-pattern.md` → vault [[api-layer]]

O rule carrega automaticamente: `createRoute()`, module aliases, estrutura handler/validation/index. Lembre: JavaScript puro, CommonJS.

#### Adicionar fila Bull
`queue-patterns.md` → vault [[queue-architecture]]

O rule tem o passo-a-passo: criar Queue, registrar no index, criar processor em commands/workers/.

---

### Cross-repo

#### Revisar seguranca antes de deploy
`/security-best-practices` → vault [[infrastructure-gotchas]] → vault [[auth-flow]]

A skill tem references especificos para Express, Vue e Go. Combine com os gotchas do vault.

#### Documentar decisao arquitetural
`/obsidian-vault` → `vault/decisions/`

Use a skill para criar ADR com template padrao (Contexto, Decisao, Alternativas, Consequencias).

---

## 5. Skills dos Plugins (ativam automaticamente)

Alem das skills instaladas, voce tem ~100+ skills via plugins que ativam por contexto:

| Situacao | Skill | Plugin |
|----------|-------|--------|
| Planejar uma feature complexa | `/plan` | everything-claude-code |
| Debugar um bug | `/systematic-debugging` | superpowers |
| Escrever testes primeiro (TDD) | `/tdd` | everything-claude-code |
| Rodar testes E2E Playwright | `/e2e` | everything-claude-code |
| Review de codigo | `/code-review` | code-review |
| Buscar docs de uma lib | `/docs` | everything-claude-code |
| Criar interface/dashboard | `/interface-design` | interface-design |
| Auditar design system | `/audit` | interface-design |
| Orquestrar agents paralelos | `/devfleet` | everything-claude-code |
| Pesquisa profunda na web | `/deep-research` | everything-claude-code |
| Review de seguranca | `/security-review` | everything-claude-code |
| Audit de context window | `/context-budget` | everything-claude-code |
| Salvar/retomar sessao | `/save-session` `/resume-session` | everything-claude-code |
| Brainstorm antes de criar | `/brainstorming` | superpowers |
| Verificar antes de completar | `/verification-before-completion` | superpowers |

---

## 6. Vault Obsidian — Mapa da Knowledge Base

```
vault/
  _index.md                         ← Master Index (ponto de entrada)
  wiki/
    architecture/                   ← 10 artigos
      message-flow                    Fluxo end-to-end de mensagens
      queue-architecture              NATS, Bull, BullMQ
      realtime-communication          Socket.IO server + clients
      multi-tenancy                   accountId em toda query
      auth-flow                       JWT, API keys, inter-service
      inter-service-communication     Mapa: quem chama quem
      ai-agents-architecture          a2a + agents-v2, Mastra
      database-architecture           Schema Prisma, 140 models
      deployment-architecture         Docker, Traefik, Jenkins
      error-handling                  DomainErrors, filters
    features/                       ← 7 artigos
      livechat                        Inbox, chat, assignment
      automations                     17 triggers, 11 step types
      ai-agents                       Config, tools, sessions
      crm-kanban                      Pipeline visual, cards
      contacts                        Tags, custom fields, segments
      broadcast                       Disparo WhatsApp em massa
      channels                        WhatsApp, Instagram, Messenger
    layers/                         ← 4 artigos
      api-layer                       Command pattern, createRoute
      services-layer                  NestJS modules, guards
      frontend-layer                  Vue 3, shadcn, Pinia
      core-layer                      Prisma, repositories, queues
    gotchas/                        ← 3 artigos
      database-gotchas                Prisma, migrations, repos
      infrastructure-gotchas          Docker, Redis, Bull vs BullMQ
      integration-gotchas             Socket.IO, Meta, Mastra
    ai-patterns/                    ← 7 artigos
      tool-use-agents                 Function calling
      prompt-caching                  Cache 90% economia
      classification                  Intent detection
      rag                             Knowledge base
      summarization                   Resumo de conversas
      text-to-sql                     Queries em linguagem natural
      content-moderation              Filtro de conteudo
  decisions/                        ← 6 ADRs
    001-shadcn-vue-design-system
    002-nestjs-services-separado
    003-mastra-agentes-ia
    004-gateway-go-nats
    005-multi-tenancy-accountid
    006-prisma-shared-core
```

> [!tip] Diga "consulta o vault sobre X" e a skill `obsidian-vault` navega automaticamente ate o artigo certo.

---

## 7. Workflow Recomendado

### Antes de comecar qualquer tarefa

1. **Consultar vault** — verificar se tem contexto, decisoes, gotchas
2. **Ler CLAUDE.md do repo** — regras especificas do repo
3. **Rules carregam automaticamente** — ao abrir arquivos do repo
4. **Invocar skill se necessario** — para patterns especificos
5. **Implementar**

### Antes de deploy/merge

1. `/verification-before-completion` — verificar que esta tudo certo
2. `/security-best-practices` — review de seguranca
3. `/code-review` — review de codigo
4. **Atualizar vault** — documentar o que foi feito, gotchas descobertos

---

## 8. Regras Globais do Workspace

| Regra | Escopo |
|-------|--------|
| NEVER commit automaticamente — somente quando pedido | Todos os repos |
| NEVER Co-Authored-By nos commits | Todos os repos |
| NEVER commit na main ou release | Todos os repos |
| ALWAYS criar branch: `feature/`, `fix/`, `refactor/` | Todos os repos |
| NEVER alterar schema sem migration `--create-only` | chatfunnel-core |
| ALWAYS accountId em toda query | Todos os backends |
| ALWAYS soft delete (`isDeleted: true`) | Todos os backends |
| ALWAYS ler CLAUDE.md do sub-repo antes de trabalhar | Todos os repos |
| ALWAYS consultar vault antes de implementar features | Todos os repos |

---

> Workspace configurado em 2026-04-05 — 41 artigos no vault, 7 skills, 7 rules, 10 CLAUDE.md
