---
title: AI Agents Architecture
description: Como os agentes IA funcionam — modulos a2a e agents-v2, Anthropic SDK, Mastra, tool calling
tags: [architecture, ai, agents, anthropic, mastra, a2a]
related: ["[[message-flow]]", "[[queue-architecture]]"]
last_updated: 2026-04-05
---

# AI Agents Architecture

O sistema tem **dois modulos de agentes IA** independentes no `chatfunnel-services`:

| Modulo | Objetivo | Consumidor | Protocolo |
|--------|----------|------------|-----------|
| `agents-v2/` | Agentes conversacionais voltados ao contato (WhatsApp, Instagram) | Express API via BullMQ | REST (request/response) |
| `a2a/` | Intelligence — assistente interno para moderadores do dashboard | Frontend Vue | SSE (streaming) |

## Dependencias AI

- `@anthropic-ai/sdk` + `@ai-sdk/anthropic` — Anthropic (agents-v2 direto, a2a via Vercel AI SDK)
- `openai` — OpenAI SDK (agents-v2)
- `@mastra/core` + `@mastra/memory` + `@mastra/mcp` + `@mastra/pg` — framework de agentes, memoria PostgreSQL, cliente MCP (a2a)

## agents-v2 — Agentes Conversacionais

Atendem contatos via canais de mensageria. O fluxo completo:

```
[Contato envia msg] → [Express API] → POST /nest/agents-v2/execute
  → Debounce (Redis, 3s)
  → Load agent + relations (functions, fields, kanban)
  → Find/create session (agent_sessions)
  → Build context (contactData + history + mensagem)
  → Provider adapter (Anthropic ou OpenAI)
  → Tool call loop (max 10 iteracoes)
  → Persist messages (agent_session_messages)
  → Trigger automations (fire-and-forget)
  → Return response
```

### Provider Abstraction

- Interface `AIProvider` com metodo `chat(systemPrompt, messages, tools, options)`
- `AnthropicProvider` (system prompt top-level, `max_tokens` required default 4096) e `OpenAIProvider` (system como mensagem)
- Factory `createProvider(type, model, apiKey)` — API key vem da conta, nao do env

### Tool Calling (agents-v2)

Tres tipos de tools construidas dinamicamente pelo `ToolExecutorService`:

1. **External queries** (`AgentExternalQueries`) — POST para URL externa com params do LLM
2. **Conditional automations** (`AgentAutomations`) — dispara automacao quando LLM decide
3. **Built-in tools** — `get_contact_data`, `update_contact_field`, `move_kanban_card`

O loop de tool calling roda ate `MAX_TOOL_ITERATIONS = 10` ou ate o LLM responder com texto puro.

### Sessions (agents-v2)

- `agent_sessions` (sessao ativa por agent+contact+channel) + `agent_session_messages` (historico)
- Cache Redis TTL 30min; debounce via Redis lock (TTL 120s) acumula msgs rapidas
- Expiracao: `POST /agents-v2/expire-session` (BullMQ job ou STOP_ASSISTANT)

### Prompt Generation

- `PromptBuildService` usa Mastra Agent (`prompt-engineer`) com Claude Sonnet 4.6
- Recebe ate 14 campos do formulario → gera system prompt XML (blocos: identity, objective, context, knowledge, tools, guardrails, etc.)

## a2a — Intelligence (Agent-to-Agent)

Assistente interno do dashboard que usa arquitetura multi-agente com Mastra.

```
[Moderador no dashboard] → POST /nest/a2a/chat (SSE)
  → Auth (JWT + Account-Selected)
  → Session management (a2a_conversations + a2a_messages)
  → Orchestrator agent (Mastra)
    → Delega para sub-agentes via meta-tools (agent-flowAgent, etc.)
      → Sub-agente chama MCP tools
    → Working memory (updateWorkingMemory)
  → Stream SSE events (text, tool_start, tool_result, done)
```

### Hierarquia de Agentes

| Agente | Papel | Tools |
|--------|-------|-------|
| **Orchestrator** | Roteador — delega para especialistas, mantem working memory | Nenhuma MCP (usa meta-tools Mastra) |
| Flow Agent | Construtor de automacoes | 19 tools (create_trigger, add_step_*, build_automation, etc.) |
| System Agent | Consulta/gerencia dados da conta | 13 tools (get_channels, get_tags, CRUD tags, etc.) |
| Template Agent | Gerencia templates WhatsApp | 10 tools (list/create/sync templates, etc.) |
| CRM Agent | Operacoes de kanban | 8 tools (create/move/win/lose card, etc.) |
| Contacts Agent | Busca e gestao de contatos | 6 tools (search, get, tag, update field) |

Distribuicao definida no `tool-map.ts`. Tools read-only sao duplicadas entre agentes para evitar round-trips.

### Mastra Memory

- **Somente o Orchestrator** tem memoria — sub-agentes recebem `noopMemory` (InMemoryStore)
- `PostgresStore` com conexao direta (nao PgBouncer) via `A2A_MEMORY_DATABASE_URL`
- `lastMessages: 50` — historico de mensagens no thread
- **Working memory** — scratchpad Markdown persistente por thread (`working-memory.template.ts`) cacheia canal, templates, tags, kanbans, automacao em construcao
- Evita re-discovery loop (ex: FlowAgent chamando get_channels 10x)
- Toggle via env `A2A_MEMORY_ENABLED`

### Delegation Hooks (`delegation-hooks.ts`)

- Filtra `updateWorkingMemory` do SSE output (tool interno, nao mostra pro usuario)
- Detecta meta-tools de delegacao (`agent-*`) e loga com contexto estruturado
- Detecta falhas repetidas (threshold 3x em 5min) e emite alerta
- Valida que buttonIds sao UUIDs (previne bug slug vs UUID)

### Prompts e Health

- Prompts em Markdown copiados como assets pelo `nest-cli.json` — um por agente em `a2a/prompts/` e `agents-v2/prompts/`
- `a2a/prompts/shared/domain-knowledge.md` — conhecimento de dominio compartilhado entre agentes
- `GET /nest/a2a/health` — sessoes ativas, custo 24h, media de steps, erros
- Cancelamento de stream: `POST /nest/a2a/chat/:sessionId/cancel`
- **Modelo padrao:** `claude-sonnet-4-6` em ambos os modulos. agents-v2 tambem suporta OpenAI conforme config da conta.
