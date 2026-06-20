---
title: Intelligence v2 — Arquitetura Frontend (Plano)
description: Plano arquitetural do Intelligence v2 — cruza research, shapes MCP, backend A2A real (chatfunnel-services) e prototipo Pencil. Atualizado 2026-05-05 com levantamento completo do backend.
tags: [features, intelligence, intelligenceV2, frontend, plano, arquitetura]
related: ["[[intelligence-a2a]]", "[[intelligence-a2a-shapes]]", "[[intelligence-a2a-fixtures]]", "[[intelligence-a2a-prototipo]]", "[[intelligence-a2a-cobertura]]", "[[mcp-integration]]", "[[mcp-bugs-tracking]]"]
last_updated: 2026-05-05
status: plano-pre-implementacao
---

# Intelligence v2 — Arquitetura Frontend (Plano)

> Documento de discussao. Cruza:
> - **Research** (`docs/research/Intelligence chat.md`)
> - **Shapes MCP** ([[intelligence-a2a-shapes]] + [[intelligence-a2a-fixtures]]) — ~50 tools, envelopes inconsistentes
> - **Backend A2A real** (`chatfunnel-services/src/modules/a2a/`) — levantamento completo 2026-05-05
> - **v1 atual** (`chatfunnel-front/src/views/intelligence/IntelligenceView.vue`, 221 linhas)
> - **Prototipo Pencil** ([[intelligence-a2a-prototipo]], 36 message types catalogados)
> - **Bugs MCP** ([[mcp-bugs-tracking]] — 32 bugs + 4 gaps rastreados)
>
> **Estado v2:** sem pasta criada ainda. Este doc e o plano.

---

## 1. Backend A2A — o que ja existe (chatfunnel-services)

> Levantamento de 2026-05-05. Fonte: `chatfunnel-services/src/modules/a2a/`

### 1.1 Arquitetura de agentes

```
┌─────────────────────────────────────────────┐
│  Orchestrator (Claude Sonnet)               │
│  - Mastra Memory habilitada (PostgreSQL)    │
│  - Working memory (scratchpad de automacao)  │
│  - Delega via meta-tools pra sub-agentes    │
│  - SEM tools MCP diretas                    │
└─────────────────────────────────────────────┘
         ↓ delegation calls ↓
  ┌──────┬──────┬──────────┬─────┬──────────┐
  │      │      │          │     │          │
  ▼      ▼      ▼          ▼     ▼          ▼
 Flow  System  Template   CRM  Contacts
 Agent  Agent   Agent    Agent  Agent
 11+6   7+6     9        6      3      ← MCP tools por agente
```

- **Orchestrator** roteia por intent do usuario. Frontend **nao sabe** qual sub-agente esta rodando.
- Cada sub-agente pode usar modelo diferente via env vars (`A2A_FLOW_MODEL`, etc.).
- Tools compartilhadas read-only (get_channels, get_tags) duplicadas entre agentes pra evitar round-trips.
- Tool distribution definida em `agents/tool-map.ts`.

### 1.2 Endpoint principal

```
POST /nest/a2a/chat
Auth: JWT + AccountSelectedGuard
Rate limit: 10 req / 60s por user+account (A2aThrottlerGuard)
Response: Server-Sent Events (SSE)
```

**Request:**
```typescript
{
  sessionId: string;        // UUID efemero — front gera 1 por reload
  message: string;          // Max 4000 chars (@MinLength(1) @MaxLength(4000))
  conversationId?: string;  // UUID persistente — pra continuar conversa existente
}
```

**Cancel:** `POST /nest/a2a/chat/:sessionId/cancel` — aborta stream via AbortController.

**Health:** `GET /nest/a2a/health` (sem auth) — retorna `{ status, dbOk, activeSessions, memoryEnabled, uptime, requestCount, errorCount, totalCost }`.

### 1.3 SSE events (contrato real)

```typescript
type A2aSseEventType = 'text' | 'tool_start' | 'tool_result' | 'done' | 'error' | 'cancelled';
```

| Event | Shape | Notas |
|-------|-------|-------|
| `text` | `{ content: string }` | Token/character chunks acumulativos |
| `tool_start` | `{ id, name, input, textOffset }` | `textOffset` = posicao no texto acumulado pra ancorar inline |
| `tool_result` | `{ id, name, result: string, isError?: boolean }` | `result` e **string opaca** (JSON stringified) — front parseia |
| `done` | `{ usage: { inputTokens, outputTokens, totalTokens, costUsd }, finishReason, conversationId }` | `conversationId` retornado aqui — front salva pra restaurar |
| `error` | `{ message, cause? }` | Inclui root cause quando disponivel |
| `cancelled` | `{ reason: 'user_requested' }` | Apos POST cancel |

**Mapeamento interno Mastra → SSE:**
```
text-delta   → text
tool-call    → tool_start
tool-result  → tool_result
tool-error   → tool_result (isError: true)
finish       → done (com usage + cost calculado)
exception    → error
abort        → cancelled
```

### 1.4 Sessao — duas camadas

| Camada | Storage | TTL | Chave | Uso |
|--------|---------|-----|-------|-----|
| **Efemera** | Redis | 30 min | `a2a:session:${accountId}:${sessionId}` | Mensagens in-flight, estado de stream |
| **Persistente** | PostgreSQL | Permanente | `a2a_conversations` + `a2a_messages` | Historico, restaurar conversa |

**Fluxo de sessao:**
1. Front gera `sessionId` (UUID) a cada reload
2. Front envia `{ sessionId, message }` (sem `conversationId` na 1a msg)
3. Backend cria sessao Redis + conversation PostgreSQL
4. `done` event retorna `conversationId`
5. Front salva `conversationId` → envia nas proximas mensagens
6. Em reload, front gera novo `sessionId` mas envia `conversationId` anterior → backend carrega historico (max 50 msgs)

**Tabelas:**
- `a2a_conversations` — `{ id, accountId, userId, sessionId?, createdAt, updatedAt, isDeleted }`
- `a2a_messages` — `{ id, conversationId, role, content, toolCalls: JSON, createdAt, updatedAt }`
- `a2a_memory_store` — Mastra Memory backing (working memory do orchestrator)

### 1.5 Resiliencia

| Mecanismo | Config | Comportamento |
|-----------|--------|---------------|
| **Rate limit** | 10/60s por user+account | 429 Too Many Requests |
| **Circuit breaker (MCP)** | 5 failures → open → 30s reset → half-open | Se MCP degradar, `error` event |
| **Stream timeout** | 300s (AbortSignal.timeout) | Aborta stream longo |
| **Concorrencia** | Max 50 streams simultaneos | Back-pressure rejection |
| **Client disconnect** | `req.on('close')` | Para de escrever SSE |
| **MCP tool cache** | 60s TTL | Evita listToolsets() repetido |

### 1.6 Configuracao (env vars)

```
A2A_SESSION_TTL_S              = 1800        # Redis TTL
A2A_MAX_CONTEXT_MESSAGES       = 50          # Historico carregado
A2A_MAX_STEPS                  = 35          # Max steps do agente (cap 100)
A2A_MAX_CONCURRENT_STREAMS     = 50          # Back-pressure
A2A_TOOLS_CACHE_TTL_MS         = 60000       # MCP cache
A2A_LLM_STREAM_TIMEOUT_MS     = 300000      # 5 min abort
A2A_MCP_CB_FAILURE_THRESHOLD   = 5           # Circuit breaker trips
A2A_MCP_CB_RESET_MS            = 30000       # Circuit breaker reset
A2A_CHAT_THROTTLE_TTL_MS       = 60000       # Rate limit window
A2A_CHAT_THROTTLE_LIMIT        = 10          # Requests per window
A2A_MEMORY_ENABLED             = true        # Mastra Memory on/off
```

### 1.7 Arquivos-chave no services

| Arquivo | Responsabilidade |
|---------|------------------|
| `a2a.controller.ts` | Endpoints HTTP, SSE streaming, validacao de ownership |
| `a2a-agent.service.ts` | Orchestrator + sub-agentes, Mastra, mapeamento de chunks, calculo de custo |
| `a2a-session.service.ts` | Redis CRUD, carregamento de historico, resolucao de conversation |
| `a2a.config.ts` | Parametros de runtime |
| `a2a.types.ts` | Contratos TypeScript (SSE events, session data, tool calls) |
| `agent-ids.ts` + `tool-map.ts` | Routing de agentes + distribuicao de tools |
| `orchestrator.agent.ts` ... `contacts.agent.ts` | Configs + prompts dos sub-agentes |
| `memory/memory.config.ts` | Mastra Memory + PostgreSQL |
| `a2a-health.controller.ts` | GET /health |

---

## 2. Principios nao-negociaveis

| # | Principio | Razao |
|---|-----------|-------|
| 1 | **Frontend nunca chama tool MCP direto** | Orchestrator e soberano. Front fala so com `POST /nest/a2a/chat`. |
| 2 | **Tool result mapeado por `tool_name` num registry central** | Backend envia `tool_result.result` como **string opaca**. Front parseia JSON + normaliza via registry. |
| 3 | **Toda resposta MCP passa por mapper antes de renderizar** | Bugs catalogados em [[mcp-bugs-tracking]] (32 bugs). Mapper normaliza num unico lugar. |
| 4 | **Tool cards inline ancorados via `textOffset`** | Backend ja computa `textOffset` em `tool_start`. Front usa pra posicionar card na bolha. |
| 5 | **Confirmacoes destrutivas no cliente** | Backend nao tem approval token. Interceptar `delete_*`/`publish_*` no input layer. |
| 6 | **Strict TS, discriminated unions, zero `any`** | Types espelham `a2a.types.ts` do backend + shapes MCP (com typos preservados no raw, normalizados no parsed). |
| 7 | **Dois IDs de sessao** | `sessionId` (efemero, por reload) + `conversationId` (persistente, do `done` event). |

---

## 3. Layout 3-pane (Pencil)

```
┌──────────┬────────────────────────────┬──────────────┐
│ Sidebar  │ Chat                       │ Artifact     │
│ 260px    │ Header / Messages / Input  │ 480px        │
│ Convs    │                            │ slide-out    │
└──────────┴────────────────────────────┴──────────────┘
```

- **Sidebar** — lista de conversations (dados de `a2a_conversations`). Portar `IntelligenceSidebar` + `useA2aHistory`.
- **Chat** — empty state, input pill (max 4000 chars), mensagens com `textOffset` anchoring.
- **Artifact Panel** — slide-out on-demand pra artefatos pesados (flow grafo, template preview).

---

## 4. Estrutura de arquivos proposta

```
views/intelligenceV2/
├── index.vue                       # orquestrador 3-pane
├── components/
│   ├── layout/
│   │   ├── IntelligenceLayout.vue
│   │   ├── ConversationsSidebar.vue
│   │   ├── ChatColumn.vue
│   │   └── ArtifactPanel.vue
│   ├── chat/
│   │   ├── ChatHeader.vue          # titulo conversa + health badge
│   │   ├── ChatMessageList.vue     # ancora textOffset
│   │   ├── ChatInput.vue           # max 4000 chars + slash menu + cancel btn
│   │   ├── SlashCommandMenu.vue
│   │   ├── EmptyState.vue
│   │   ├── SuggestionCards.vue
│   │   ├── ThrottleCountdown.vue   # countdown quando 429
│   │   └── CostBadge.vue           # tokens + custo USD do done event
│   ├── messages/
│   │   ├── MessageRenderer.vue     # switch por message.kind
│   │   ├── UserMessage.vue
│   │   ├── AssistantText.vue
│   │   ├── ToolCallCard.vue        # wrap generico (loading/done/error)
│   │   ├── ConfirmationCard.vue
│   │   ├── SuggestionChips.vue
│   │   ├── StatusCard.vue          # success/error/cancelled
│   │   └── tool-results/           # 1 por tool relevante
│   │       ├── ChannelsResult.vue
│   │       ├── KanbansResult.vue
│   │       ├── KanbanCardsResult.vue
│   │       ├── ContactResult.vue
│   │       ├── ContactsListResult.vue
│   │       ├── AutomationResult.vue
│   │       ├── TemplateResult.vue
│   │       ├── TemplatesListResult.vue
│   │       ├── TagsResult.vue
│   │       ├── BuildAutomationResult.vue
│   │       └── GenericJsonResult.vue  # fallback
│   └── artifact/
│       ├── FlowArtifact.vue
│       ├── TemplateArtifact.vue
│       └── AgentArtifact.vue
├── composables/
│   ├── useIntelligenceChat.ts      # core: SSE stream + session (2 IDs) + throttle 429 + messages + cancel
│   ├── useIntelligenceHistory.ts   # lista conversations do PostgreSQL pra sidebar
│   ├── useHealthCheck.ts           # polling GET /health a cada 5min
│   ├── useArtifactPanel.ts         # isOpen + artifact + open/close
│   └── useSlashCommands.ts         # watch input "/" + filtro + select
├── registry/
│   ├── tool-result.registry.ts     # tool_name → { parser, component, artifactKind }
│   ├── slash-commands.registry.ts
│   └── suggestion-prompts.registry.ts
├── mappers/
│   ├── contact.mapper.ts           # TagsContacts→tags, redact PII, lastName coalesce
│   ├── template.mapper.ts          # snake→camel, dedup buttons[], IDs dual
│   ├── kanban.mapper.ts            # cards condicional, position sort, moderator PII strip
│   ├── automation.mapper.ts        # steps reorder via firstStepId→nextStepId chain
│   ├── channel.mapper.ts           # wppNumber E.164, allocatedType null handling
│   └── error-envelope.mapper.ts    # detecta { error: {...} } vs success
├── stores/
│   └── intelligenceV2.store.ts     # Pinia: draft input, prefs UI, ultimo artifact, conversationId
├── types/
│   ├── sse-event.ts                # espelha a2a.types.ts do backend (6 events)
│   ├── message.ts                  # kind: user|text|tool_call|confirmation|status|suggestion|cancelled
│   ├── session.ts                  # sessionId, conversationId, usage
│   ├── tool-result.ts              # discriminated unions por tool
│   ├── mcp-shapes.ts               # espelha intelligence-a2a-shapes (com typos!)
│   └── artifact.ts
└── utils/
    ├── error-messages.ts
    ├── format.ts                   # phone pt-BR, dateRelative, costUsd
    ├── markdown-streaming.ts       # buffer pra blocos nao-fechados
    ├── pii-redact.ts               # strip phone de moderator.name
    └── destructive-guard.ts        # isDestructive(text): boolean (funcao pura)
```

---

## 5. Fluxo de dados

```
User digita mensagem (max 4000 chars)
  ↓
destructive-guard.ts → isDestructive(text)? → ConfirmationCard
  ↓
useIntelligenceChat.send(text)
  ├── gera/reutiliza sessionId + conversationId (interno)
  ├── POST /nest/a2a/chat { sessionId, message, conversationId? }
  ├── SSE stream (parser interno)
  │   ├── text         → append chunks em assistant_text
  │   ├── tool_start   → insere ToolCall na posicao textOffset (status: running)
  │   ├── tool_result  → JSON.parse → mapper → registry.parser → atualiza ToolCall (done|error)
  │   ├── done         → salva conversationId + extrai usage
  │   ├── error        → StatusCard com message + cause
  │   └── cancelled    → StatusCard com reason
  └── 429 → throttle countdown interno
  ↓
ChatMessageList → MessageRenderer (switch kind)
  ├── tool_call → ToolCallCard
  │       └── registry[tool_name].component → ResultCard rico / StepResult / GenericJson
  └── acao "Abrir" → useArtifactPanel.open(parsed, kind)
              ↓
        ArtifactPanel → FlowArtifact / TemplateArtifact / AgentArtifact
```

**Pipeline do tool_result (detalhe):**
```
tool_result.result (string opaca do backend)
  → JSON.parse()
  → error-envelope.mapper detecta { error: {...} } → StatusCard error
  → registry[tool_name].parser(parsed) → tipo normalizado
  → mapper (contact/template/kanban/...) → redact PII, normalize naming
  → registry[tool_name].component → renderiza
```

---

## 6. Decisoes de UX — resolvidas (2026-05-05)

| # | Decisao | Resolucao |
|---|---------|-----------|
| A | Artifact panel | **on-demand** — so aparece quando tem artefato |
| B | Slash commands no MVP | **sim** — lista enxuta (5-6), pos-MVP (F6) |
| C | Voice input | **futuro** — backend nao suporta, descopado |
| D | Confirmacao destrutiva | **client-side** no MVP |
| E | Drafts persistidos | **sessionStorage** — backend ja persiste historico em PostgreSQL |
| F | Empty state | **Hero + modulos do sistema** — ver secao 6.1 |
| G | Markdown streaming parcial | **buffer com sentinel** pra blocos de codigo |
| H | Cards FlowGraph in-bubble | **so no ArtifactPanel** — bolha fica leve |
| I | PII redaction | **silenciosa** — strip no mapper |
| J | Exibir custo (tokens/USD) | **nao por agora** — descopado do MVP |
| K | Health badge | **sim** — mostrar health no chat (header ou banner) |
| L | Cancel button | **visivel** durante stream |

### 6.1 Empty state — Hero + Modulos do sistema

Layout vertical centralizado:

```
┌─────────────────────────────────────────────┐
│              [Avatar 56px]                  │
│         "Como posso ajudar?"                │
│                                             │
│   ┌──────────── Input ──────────────┐       │
│   │ Mensagem para o ChatFunnel...   │       │
│   └─────────────────────────────────┘       │
│                                             │
│   ┌───────────┐ ┌───────────┐ ┌───────────┐│
│   │ PhTree    │ │ PhFunnel  │ │ PhChat    ││
│   │ Structure │ │ Simple    │ │           ││
│   │Automacoes │ │ CRM       │ │ Templates ││
│   │ "Liste    │ │ "Mostre   │ │ "Liste    ││
│   │  minhas   │ │  meus     │ │  meus     ││
│   │  autom."  │ │  pipes."  │ │  templa." ││
│   └───────────┘ └───────────┘ └───────────┘│
│   ┌───────────┐ ┌───────────┐ ┌───────────┐│
│   │ PhUsers   │ │ PhGear    │ │ PhAtom    ││
│   │           │ │           │ │           ││
│   │ Contatos  │ │ Configur. │ │ Agentes   ││
│   │ "Busque   │ │ "Mostre   │ │ "Liste    ││
│   │  meus     │ │  minhas   │ │  meus     ││
│   │  contat." │ │  tags."   │ │  agentes."││
│   └───────────┘ └───────────┘ └───────────┘│
└─────────────────────────────────────────────┘
```

**Comportamento:** ao clicar no card, **abre modal** com catalogo de tools disponiveis do modulo. Ao clicar numa tool do modal, **preenche o input** com prompt contextualizado (nao envia) e fecha modal. Usuario pode editar antes de enviar.

**Cards por modulo (6 cards, grid 3x2):**

| Modulo | Icone Phosphor | Sub-agente | Titulo | Descricao | BG icone | Cor icone |
|--------|---------------|------------|--------|-----------|----------|-----------|
| Automacoes | `PhTreeStructure` | Flow Agent | Automacoes | Crie e gerencie seus flows | `#E3F2FD` | `#1565C0` |
| CRM | `PhFunnelSimple` | CRM Agent | Funil de Vendas | Gerencie pipelines e cards | `$--brand-100` | `$--brand-500` |
| Templates | `PhChat` | Template Agent | Templates | Templates do WhatsApp | `#E8F5E9` | `#2E7D32` |
| Contatos | `PhUsers` | Contacts Agent | Contatos | Busque e gerencie contatos | `#E0F7FA` | `#00695C` |
| Configuracoes | `PhGear` | System Agent | Configuracoes | Tags, campos e integracoes | `$--gray-300` | `$--font-secondary` |
| Agentes IA | `PhAtom` | System Agent | Agentes IA | Agentes e assistentes | `#FFF3E0` | `#E65100` |

### 6.2 Modal de tools por modulo

Cada card do empty state abre um modal com o catalogo completo de tools do sub-agente. ~50 tools no total.

**Layout do modal:** titulo do modulo + lista de tools + botao fechar

**Cada item da lista:**
- Titulo amigavel (14/600 `$--font-primary`)
- Nome da tool em cinza (12/normal `$--font-muted`) — ex: `list_automations`
- Descricao curta (12/normal `$--font-muted`)
- Ao clicar: preenche input com prompt contextualizado + fecha modal

**Catalogo de tools por modulo:**

#### Automacoes (Flow Agent) — 17 tools
| Tool | Titulo amigavel | Prompt |
|------|----------------|--------|
| `list_automations` | Listar automacoes | "Liste minhas automacoes" |
| `get_automation` | Ver detalhes de automacao | "Mostre os detalhes da automacao [nome]" |
| `get_draft` | Ver rascunho | "Mostre o rascunho da automacao [nome]" |
| `build_automation` | Criar automacao completa | "Crie uma automacao de [objetivo]" |
| `create_trigger` | Criar trigger | "Adicione um trigger de [tipo] na automacao [nome]" |
| `add_step_message` | Adicionar mensagem | "Adicione um passo de mensagem na automacao [nome]" |
| `add_step_delay` | Adicionar delay | "Adicione um delay de [tempo] na automacao [nome]" |
| `add_step_condition` | Adicionar condicao | "Adicione uma condicao na automacao [nome]" |
| `add_step_action` | Adicionar acao | "Adicione uma acao na automacao [nome]" |
| `add_step_follow_up` | Adicionar follow-up | "Adicione um follow-up de [tempo] na automacao [nome]" |
| `add_step_kanban` | Adicionar passo kanban | "Adicione um passo de kanban na automacao [nome]" |
| `add_step_chat_action` | Adicionar acao de chat | "Adicione uma acao de chat na automacao [nome]" |
| `add_step_ab_test` | Adicionar teste A/B | "Adicione um teste A/B na automacao [nome]" |
| `add_step_run_automation` | Executar outra automacao | "Adicione um passo que executa outra automacao" |
| `rename_automation` | Renomear automacao | "Renomeie a automacao [nome] para [novo nome]" |
| `toggle_automation` | Ativar/desativar | "Ative a automacao [nome]" |
| `delete_automations` | Excluir automacoes | "Exclua a automacao [nome]" |

#### CRM (CRM Agent) — 7 tools
| Tool | Titulo amigavel | Prompt |
|------|----------------|--------|
| `get_kanbans` | Ver pipelines | "Mostre meus pipelines" |
| `list_kanban_cards` | Listar cards | "Liste os cards do pipeline [nome]" |
| `create_kanban_card` | Criar card | "Crie um card para [contato] no pipeline [nome]" |
| `move_kanban_card` | Mover card | "Mova o card de [contato] para a coluna [coluna]" |
| `win_kanban_card` | Marcar como ganho | "Marque o card de [contato] como ganho" |
| `lose_kanban_card` | Marcar como perdido | "Marque o card de [contato] como perdido" |
| `assign_card_moderator` | Atribuir responsavel | "Atribua o card de [contato] para [moderador]" |

#### Templates (Template Agent) — 9 tools
| Tool | Titulo amigavel | Prompt |
|------|----------------|--------|
| `list_templates` | Listar templates | "Liste meus templates do WhatsApp" |
| `get_template` | Ver detalhes | "Mostre os detalhes do template [nome]" |
| `create_template` | Criar template | "Crie um template de [tipo] com [conteudo]" |
| `update_template` | Editar template | "Atualize o corpo do template [nome]" |
| `delete_templates` | Excluir templates | "Exclua o template [nome]" |
| `sync_templates` | Sincronizar com Meta | "Sincronize os templates com a Meta" |
| `get_template_status` | Ver status de aprovacao | "Qual o status do template [nome]?" |
| `get_template_buttons` | Ver botoes | "Mostre os botoes do template [nome]" |
| `configure_template_params` | Configurar parametros | "Configure os parametros do template [nome]" |

#### Contatos (Contacts Agent) — 5 tools
| Tool | Titulo amigavel | Prompt |
|------|----------------|--------|
| `search_contacts` | Buscar contatos | "Busque contatos com [filtro]" |
| `get_contact` | Ver detalhes do contato | "Mostre os detalhes do contato [nome]" |
| `add_contact_tag` | Adicionar tag | "Adicione a tag [tag] ao contato [nome]" |
| `remove_contact_tag` | Remover tag | "Remova a tag [tag] do contato [nome]" |
| `update_contact_field` | Atualizar campo | "Atualize o campo [campo] do contato [nome]" |

#### Configuracoes (System Agent) — 10 tools
| Tool | Titulo amigavel | Prompt |
|------|----------------|--------|
| `get_channels` | Ver canais conectados | "Mostre meus canais conectados" |
| `get_tags` | Listar tags | "Liste minhas tags" |
| `create_tag` | Criar tag | "Crie uma tag chamada [nome]" |
| `update_tag` | Editar tag | "Renomeie a tag [nome] para [novo nome]" |
| `delete_tag` | Excluir tag | "Exclua a tag [nome]" |
| `list_tag_folders` | Ver pastas de tags | "Liste minhas pastas de tags" |
| `create_tag_folder` | Criar pasta de tags | "Crie uma pasta de tags chamada [nome]" |
| `delete_tag_folder` | Excluir pasta de tags | "Exclua a pasta de tags [nome]" |
| `get_custom_fields` | Ver campos personalizados | "Liste meus campos personalizados" |
| `get_moderators` | Ver membros da equipe | "Mostre os membros da minha equipe" |

#### Agentes IA (System Agent) — 2 tools
| Tool | Titulo amigavel | Prompt |
|------|----------------|--------|
| `get_agents_v2` | Ver agentes | "Liste meus agentes de IA" |
| `get_assistants` | Ver assistentes | "Liste meus assistentes configurados" |

**Componentes:**
- `ToolCatalogModal.vue` — modal generico que recebe `moduleId` e renderiza lista de tools
- `ToolCatalogItem.vue` — item individual (titulo + tool name + descricao)
- `tool-catalog.registry.ts` — mapa `moduleId → ToolCatalogEntry[]` com titulo, toolName, prompt

**Design tokens do modal:**
- Overlay: `rgba(0,0,0,0.5)`
- Modal: `$--gray-100`, radius 16, shadow purple, padding 24, max-height 80vh com scroll
- Header: titulo do modulo (18/700) + icone fechar
- Items: padding `[12, 16]`, radius 8, hover fill `$--gray-200`, gap 4 entre titulo/tool/descricao

**Design tokens:**
- Card: radius 12, fill `$--gray-100`, stroke `$--gray-400`, shadow purple, padding 16, gap 10
- Icone: 36x36, radius 8, cor por area (tabela acima). 4 cores existentes (`$--brand-100`, `#E8F5E9`, `#FFF3E0`, `$--gray-200`) + 2 novas (`#E3F2FD`, `#E0F7FA`)
- Titulo: 14/600
- Descricao: 12/normal `$--font-muted`

**Componente:** `EmptyState.vue` + `SuggestionCards.vue` (renomear pra `ModuleCards.vue`)
**Registry:** `suggestion-prompts.registry.ts` contem o mapa modulo → prompt

---

## 7. Riscos identificados

1. **Backend nao emite `ui hint`** — registry no front e canon. Se backend evoluir, preferir hint quando presente.
2. **`textOffset` e race condition** — SSE garante ordem TCP, mas cancelamento mid-tool precisa de teste.
3. **Bugs MCP no mapper** — catalogo completo em [[mcp-bugs-tracking]]. 32 bugs a tratar no mapper ou aguardar fix upstream.
4. **Envelope error** — detector em `error-envelope.mapper.ts`. Codigos: `NOT_FOUND`, `VALIDATION_ERROR`, `INTERNAL_ERROR` (sub-tipos: `.emit()` bug, Prisma stack, i18n raw).
5. **Mastra @1.7.0 JSON.parse bug** — backend tem monkey-patch. Mensagens truncadas → evento `error` → StatusCard.
6. **Throttle 429** — UI precisa de `ThrottleCountdown.vue` com feedback amigavel.
7. **`anthropicKey` ausente** → 400 → banner CTA pra [[credenciais-page]].
8. **Steps order nao-deterministica** — mapper reconstroi via `firstStepId` → `nextStepId` chain.
9. **Circuit breaker MCP** — se degradar, front recebe `error` event. Considerar health badge.
10. **Max 50 concurrent streams** — se rejeitar, front precisa fila ou feedback "servidor ocupado".
11. **Working memory do orchestrator** — frontend nao controla, mas impacta contexto. Se scratchpad corromper, respostas divergem.

---

## 8. Fases sugeridas

| Fase | Entrega | Criterio "feito" |
|------|---------|------------------|
| **F0** | Plano aprovado (este doc) + decisoes A-L | Brand+UX alinhados |
| **F1** | Esqueleto layout 3-pane + roteamento + `useSessionManager` + `useSseStream` com mock | Navega entre panels, gera sessionId, parseia events mock |
| **F2** | `useIntelligenceChat` rodando contra backend real + cancel + throttle handling | Mensagem ida-e-volta com text deltas + cancel funcional + 429 tratado |
| **F3** | Registry + mappers + 5 tool result cards prioritarios + StatusCard + CostBadge | Teste manual com get_channels, search_contacts, get_template, list_automations, build_automation |
| **F4** | Restantes message types do catalogo Pencil | Parity visual com prototipo |
| **F5** | ArtifactPanel + FlowArtifact + TemplateArtifact | Clicar "Abrir" no card → painel slide-out |
| **F6** | Slash commands + interceptor destrutivo + ConversationsSidebar com historico PostgreSQL | Sidebar lista conversations reais, /slash funciona, deletes interceptados |
| **F7** | (opcional) voice input + health badge + custo visivel | Descopado do MVP |

---

## 9. O que manter de v1

- Composables `useA2aChat` / `useA2aHistory` — portar pra TS estrito
- Roteamento e restore via URL query + `conversationId`
- `IntelligenceSidebar` — visual ja alinhado
- `IntelligenceQuickActions` → `SuggestionCards.vue`

V1 fica intacto para rollback (regra `feedback_v2_suffix_no_legacy`).

---

## 10. Decisoes tomadas (2026-05-05)

| Ponto | Decisao |
|-------|---------|
| **Decisoes A-L** | Todas resolvidas — secao 6 |
| **Registry-no-front** | Confirmado como canon. Backend nao emite ui hints. |
| **ArtifactPanel** | On-demand confirmado |
| **Escopo MVP** | **F0-F5** (inclui ArtifactPanel). F6/F7 pos-MVP. |
| **Rota** | `/intelligenceV2` provisorio. Substitui `/intelligence` quando pronto. |
| **Mapper strategy** | **Defensivo pra tudo.** Mapper no front normaliza independente de fix upstream. Bugs enviados pro dev via [[mcp-bugs-tracking]] mas sem dependencia de timeline. Se backend corrigir, mapper vira passthrough. |
| **Exibir custo** | Nao por agora — descopado do MVP |
| **Health badge** | Sim — mostrar health no chat |
| **Empty state** | Hero + 6 cards por modulo. Clicar abre modal com catalogo de tools do modulo. Clicar na tool preenche input com prompt (nao envia). |

## 11. Pontos resolvidos adicionais (2026-05-05)

| Ponto | Decisao |
|-------|---------|
| **Icones por area** | Cor por modulo do sistema (nao uniforme) — cada area tem identidade visual propria |
| **Health badge** | No `ChatHeader.vue` (junto ao titulo da conversa) |
| **Clicar no card** | Abre modal com catalogo de tools do modulo. Clicar na tool preenche input (nao envia). |

## 12. Estado atual e proximos passos

**Concluido (2026-05-05):**
- Arquitetura completa com levantamento do backend A2A real
- Todas decisoes de UX batidas (A-L)
- Prototipos Pencil completos (frames 10-22 em `intelligence-componetes.pen`): empty state, 6 modais tools, conversa ativa, artifact panel, health/throttle, 9 tool result cards, StepResult
- Plano de implementacao F1 escrito: `docs/superpowers/plans/intelligence-v2/2026-05-05-intelligence-v2-f1-scaffold.md`
- Composables simplificados: 5 composables + 1 util (reduzido de 9)

**Proximo passo: F1 — Scaffold (8 tasks, 21 arquivos)**
1. Types (sse-event, message, session)
2. Route `/app/intelligenceV2` + entry point
3. Tool catalog registry + destructive guard
4. Composables com mock (useIntelligenceChat, useIntelligenceHistory)
5. Layout (sidebar, chat column, artifact panel)
6. Chat (header, input, empty state, tool catalog modal)
7. Messages (renderer, user, assistant, tool call)
8. Wire + manual test

**Depois de F1:**
- **F2:** SSE real + cancel + throttle + useHealthCheck
- **F3:** Registry + mappers + 5 tool result cards ricos
- **F4:** Restantes message types
- **F5:** ArtifactPanel funcional
