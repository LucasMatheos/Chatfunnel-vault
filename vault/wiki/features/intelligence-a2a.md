---
title: Intelligence (A2A) — Chat Conversacional Multi-Agent
description: Modulo Intelligence do ChatFunnel — chat conversacional com Orchestrator + 5 agentes especializados (Flow, System, Template, CRM, Contacts) via SSE streaming, integrado a MCP tools.
tags: [features, intelligence, a2a, ai-agents, services]
related: ["[[intelligence-a2a-shapes]]", "[[intelligence-a2a-prototipo]]", "[[ai-agents]]", "[[ai-agents-architecture]]", "[[mcp-integration]]", "[[automations]]", "[[crm-kanban]]", "[[contacts]]", "[[realtime-communication]]"]
last_updated: 2026-04-29
---

# Intelligence (A2A)

Branch ativa em desenvolvimento: `feature/intelligence` em `chatfunnel-services`.

## O que e

**A2A (Agent-to-Agent)** e a interface de chat conversacional **interna** do ChatFunnel para moderadores/operadores. Permite executar operacoes complexas (criar automacoes, mexer no kanban, gerenciar templates, consultar contatos) em **linguagem natural**, sem clicks na UI.

Substitui clicks por uma conversa: o operador descreve o que quer, o **Orchestrator** analisa a intencao e delega para um dos 5 **agentes especialistas**, que executam **MCP tools** contra a plataforma e respondem em streaming.

> A feature esta no mesmo modulo logico de [[ai-agents]] (AgentsV2 — agentes que atendem contatos finais), mas tem um proposito diferente: A2A e voltado para operadores, AgentsV2 para clientes.

## Arquitetura geral

```
[Front Vue] ──POST /a2a/chat (SSE)──→ [Services :3200]
                                          │
                                  ┌───────┴────────┐
                                  ▼                ▼
                          [Orchestrator]    [Mastra Memory]
                              (Claude)        (PG + Redis)
                                  │
              ┌──────┬──────┬────┴────┬───────┬───────┐
              ▼      ▼      ▼         ▼       ▼       ▼
            Flow  System Template   CRM   Contacts  ...
              │      │      │         │       │
              └──────┴──────┴────┬────┴───────┘
                                 ▼
                          [MCP Server]
                       (tools da plataforma)
```

- **Stack:** Mastra `@1.7.0` + `@mastra/mcp` + `@mastra/memory` + `@mastra/pg` + `@anthropic-ai/sdk`
- **LLM provider:** Anthropic (chave por conta — `accounts.anthropicKey`)
- **Streaming:** Server-Sent Events nativo (HTTP keep-alive)
- **Memoria:** `conversationId` -> `threadId` Mastra (persistente em PostgreSQL); `sessionId` ephemeral em Redis (TTL 30min)
- **Persistencia:** `A2aConversations` + `A2aMessages` (Prisma, multi-tenant por `accountId` + `userId`)

## Os 6 agentes

Definidos em `chatfunnel-services/src/modules/a2a/agents/agent-ids.ts:1-9`:

| ID | Responsabilidade |
|----|------------------|
| `orchestrator` | Recebe a mensagem do usuario, classifica intent, delega para o especialista correto |
| `flow-agent` | Cria/edita [[automations]] (fluxos visuais) |
| `system-agent` | Consulta dados da conta, gerencia tags e pastas |
| `template-agent` | Cria/edita templates WhatsApp (sincroniza via [[mcp-integration|MCP]]) |
| `crm-agent` | Operacoes em [[crm-kanban]] (cards, colunas, vendido/perdido) |
| `contacts-agent` | Busca [[contacts]], adiciona/remove tags |

Prompts em Markdown ficam em `chatfunnel-services/src/modules/a2a/prompts/` e sao copiados como assets pelo `nest-cli.json` (watchAssets: true).

## Endpoints HTTP

Base: `/nest/a2a` (todos os requests do front passam pelo prefixo global `/nest`).

Todos protegidos por `AuthGuard("jwt")` + `AccountSelectedGuard`. Header obrigatorio: `Account-Selected: <accountId>`.

| Metodo | Path | Body / Query | Resposta | Notas |
|--------|------|--------------|----------|-------|
| POST | `/a2a/chat` | `A2aChatRequestDto { sessionId, message, conversationId? }` | **SSE stream** | Throttled: 10 req/min (`A2aThrottlerGuard`) |
| POST | `/a2a/chat/:sessionId/cancel` | — | `{ cancelled: true, sessionId }` ou 404 | Aborta stream ativo |
| GET | `/a2a/conversations` | `?page=&limit=` (default 1/20) | `{ data, total, page }` | Por usuario+account |
| GET | `/a2a/conversations/:id/messages` | `?page=&limit=` (default 1/50) | `{ data, total, page }` | 404 se nao for dona |
| DELETE | `/a2a/conversations/:id` | — | `204` | Soft delete |
| GET | `/a2a/health` | — | `{ status, activeStreams, memoryUsage }` | Public |

> Falha cedo com **400** se `account.anthropicKey` nao estiver configurada. Mensagem: `"Configure sua chave da Anthropic nas configuracoes da conta."` — tratar isso como banner/CTA no front.

Codigo de referencia: `chatfunnel-services/src/modules/a2a/a2a.controller.ts:33-346`.

## Protocolo SSE — `POST /a2a/chat`

Os eventos emitidos pelo backend (na ordem em que chegam):

| `event:` | `data:` payload | Quando dispara |
|----------|-----------------|----------------|
| `text` | `{ content: string }` | Token/delta de texto do agente (incremental) |
| `tool_start` | `{ id, name, input, textOffset }` | Agente comecou a executar uma tool MCP |
| `tool_result` | `{ id, result }` | Tool retornou (sucesso ou erro encapsulado) |
| `cancelled` | `{ reason: 'user_requested' }` | Stream abortado via `/cancel` ou `req.close` |
| `error` | `{ message: 'Erro interno do agente' }` | Excecao no executor |
| `done` | `{ conversationId, cost, tokens, ... }` | Final feliz — fechar buffer e finalizar UI |

### Detalhe importante: `textOffset`

`tool_start` vem enriquecido com `textOffset` (comprimento do texto **ja emitido** ate aquele momento — ver `a2a.controller.ts:189-199`). O front deve usar esse offset para **renderizar o card da tool inline na posicao certa do texto** — caso contrario, multiplas tool calls aparecem fora de ordem.

### Acumulacao no backend

Apos o stream:
1. Tools com status `running` sao marcadas `done` (ou `cancelled` em abort)
2. Mensagem assistant inteira (texto completo + `toolCalls[]`) e persistida em `A2aMessages`
3. Cache Redis da sessao e atualizado

## Modelo de dados

Tabelas Prisma (em `@chatfunnel/core`):

| Tabela | Campos relevantes | Multi-tenancy | Soft delete |
|--------|-------------------|---------------|:-----------:|
| `A2aConversations` | `id, accountId, userId, title, firstMessage, lastMessage, messageCount, createdAt, updatedAt` | `accountId + userId` | `isDeleted` |
| `A2aMessages` | `id, conversationId, role (user\|assistant), content, toolCalls (JSON), timestamp, createdAt` | via conversation | — |

A2A usa **a propria tabela** — nao reaproveita `AgentSessions` / `AgentSessionMessages` (essas pertencem ao [[ai-agents|AgentsV2]]).

## Sessoes vs. Conversas

Conceitos distintos que sao faceis de confundir:

- **`sessionId`** (ephemeral, gerado pelo front): identifica um **stream ativo**. Vive em Redis com TTL de 30min. Usado para cancelar e para o cache de mensagens recentes.
- **`conversationId`** (persistente, gerado pelo backend): id da conversa em `A2aConversations`. **E o `threadId` da Mastra Memory** — garante que ao recarregar a pagina, a memory do agente persiste.

Fluxo:
1. Front gera `sessionId` (UUID) localmente ao abrir o chat
2. Primeira chamada `/a2a/chat` sem `conversationId` -> backend cria conversation
3. Evento `done` retorna `conversationId` -> front guarda
4. Mensagens subsequentes mandam ambos: `sessionId` + `conversationId`
5. Refresh da pagina: front ainda tem `conversationId`, gera `sessionId` novo, retoma conversa

## Quotas, throttling e custos

- **Rate limit:** 10 req/min por usuario (`@Throttle({ limit: 10, ttl: 60000 })` + `A2aThrottlerGuard`)
- **Anthropic prompt caching:** ativo (reduz custo significativamente em conversas longas)
- **OpenTelemetry:** trace de cost/tokens em cada request (exporter OTLP HTTP — ver `chatfunnel-services/src/main.ts`)
- **Cost por mensagem:** retornado no evento `done.cost` (USD)

## Pontos de atencao para o frontend

1. **EventSource nao serve** para POST com body. Usar `fetch` + `ReadableStream` + parser SSE manual, ou biblioteca como `@microsoft/fetch-event-source`.
2. **AbortController:** ligar no fetch e disparar `/cancel` em paralelo quando o usuario clica "parar".
3. **textOffset matters:** sem ele, as tool cards aparecem na posicao errada.
4. **Markdown rendering:** o agente responde em markdown (codigo, listas, links). Render em tempo real precisa lidar com markdown parcial (ex: bloco de codigo ainda nao fechado).
5. **anthropicKey ausente:** mostrar banner com link para [[credenciais-page]].
6. **Persistencia transparente:** ao recarregar, recuperar `conversationId` da URL/storage e listar mensagens via `GET /a2a/conversations/:id/messages` antes de reabrir o stream.
7. **Cancel ja em flight:** se o usuario cancela mas o `done` ja chegou, tratar 404 silenciosamente.
8. **Conversation list:** paginada, mostrar `title` (gerado pelo agente) + `lastMessage` + `updatedAt`.

## Telas previstas no front

1. **Chat principal** (`/intelligence` ou similar)
   - Sidebar: lista de conversas (paginada) + botao "Nova conversa"
   - Main: bubbles (user/assistant) + tool cards inline + input com botao parar
   - Empty state quando nao tem conversation
2. **Configuracao de chave Anthropic** (CTA quando `anthropicKey` ausente — pode ser link para [[credenciais-page]])
3. **Tool call card** componente reutilizavel: nome, input collapsado, resultado/erro

## Diferencas vs. AgentsV2

| Dimensao | A2A (Intelligence) | AgentsV2 ([[ai-agents]]) |
|----------|--------------------|-----|
| Quem usa | Operador interno | Contato final via canal |
| Trigger | UI de chat web | Step `START_ASSISTANT` em [[automations]] |
| Provider | Anthropic only | Anthropic ou OpenAI |
| Memoria | Mastra `@mastra/memory` + PG | Sliding window manual em Redis/PG |
| Tools | MCP da plataforma (cross-domain) | Built-in + external queries configuraveis |
| Persistencia | `A2aConversations`/`A2aMessages` | `AgentSessions`/`AgentSessionMessages` |
| Streaming | SSE para o front | LLM call sincrono no executor |
| Multi-agent | Orchestrator + 5 specialists | Single agent |

## Codigo-fonte chave

```
chatfunnel-services/src/modules/a2a/
├── a2a.controller.ts          # Rotas SSE + REST
├── a2a.module.ts
├── agents/
│   ├── agent-ids.ts           # Enum dos 6 agentes
│   ├── orchestrator.agent.ts  # Roteador
│   ├── flow.agent.ts          # Automacoes
│   ├── system.agent.ts        # Conta/tags
│   ├── template.agent.ts      # WhatsApp templates
│   ├── crm.agent.ts           # Kanban
│   ├── contacts.agent.ts      # Contatos
│   ├── tool-map.ts            # Mapeamento agente -> tools MCP
│   └── prompt-loader.ts       # Carrega .md de prompts/
├── services/
│   ├── a2a-agent.service.ts   # streamChat() + cancelStream()
│   └── a2a-session.service.ts # Ownership, get/create, cache Redis
├── dto/
│   ├── a2a-chat-request.dto.ts
│   └── a2a-pagination-query.dto.ts
├── guards/
│   └── a2a-throttler.guard.ts # Rate limit por usuario
├── prompts/                   # Markdown dos system prompts
├── memory/                    # Mastra memory config
├── health/                    # /a2a/health
└── types/a2a.types.ts         # A2aAuthContext, A2aToolCallInfo
```

## Gotchas conhecidos

- **Mastra @1.7.0** tem bug de `JSON.parse` — workaround monkey-patched em `chatfunnel-services/src/main.ts`. Remover quando atualizar Mastra.
- **MCP circuit breaker** implementado para resiliencia quando o MCP server cai.
- **Prompts `.md`** precisam ser declarados em `nest-cli.json` (assets) — sem isso, build de producao nao copia.
- **`/nest` prefixo:** o front consome `NestApi` ja com `/nest`, mas tudo que documentar como path absoluto deve incluir `/nest/a2a/...`.

## Status

- Backend: em desenvolvimento ativo na branch `feature/intelligence`
- Frontend: **a construir** (este doc e o ponto de partida)
- MCP server: ver [[mcp-integration]] para o catalogo de tools disponiveis
