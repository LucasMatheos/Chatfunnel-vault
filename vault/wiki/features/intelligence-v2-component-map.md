# Intelligence V2 — Mapeamento de Componentes

> Referência: como o Claude web renderiza blocos → como o Intelligence deve renderizar.
> Base: `@chatfunnel/contracts` (A2A types + TOOL_REGISTRY)

## 1. Modelo Mental: Claude Web vs Intelligence

| Claude Web | Intelligence | Contracts type |
|---|---|---|
| Texto com streaming (cursor piscando) | `AssistantText.vue` | `A2aContentBlock { type: "text" }` |
| "Thinking..." collapsible | `AgentResult.vue` (sub-agente) | `A2aContentBlock { type: "tool_result", subThread }` |
| Tool use card (loading → resultado) | `ToolCallCard.vue` | `A2aContentBlock { type: "tool_use" }` + `{ type: "tool_result" }` |
| Artifact (painel lateral) | `ArtifactPanel.vue` (F5) | Derivado de tool_result complexo |
| Token/custo badge | `CostBadge.vue` (pendente) | `A2aSseEvent { type: "done", usage }` |
| Mensagem do usuário | `UserMessage.vue` | `A2aChatMessage { role: "user" }` |

## 2. Anatomia do ToolCallCard (componente central)

Inspiração direta no Claude web: card collapsible com 3 estados.

```
┌─────────────────────────────────────────────────────┐
│ [⟳ spin]  Busca de contatos          [Buscando...]  │  ← running
│ [✓ green] Busca de contatos          [Concluído] ▼  │  ← done (collapsed)
│ [✗ red]   Busca de contatos          [Erro]      ▼  │  ← error
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─ Resultado expandido (componente dinâmico) ────┐ │
│  │  DiscoveryChips / ListResult / ActionResult /   │ │
│  │  AgentResult / GenericJsonResult / DETAIL*      │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Estados SSE → UI:**

| SSE Event | ToolCallCard state | Visual |
|---|---|---|
| `block_start { type: "tool_use" }` | `status: "running"` | Spinner + badge "Buscando..." |
| `block_start { type: "tool_result" }` | `status: "done"` | Check verde + badge "Concluído" |
| `block_start { type: "tool_result", isError }` | `status: "error"` | X vermelho + badge "Erro" |
| `cancelled` | `status: "cancelled"` | Ícone cinza + badge "Cancelado" |

## 3. Archetypes → Componentes de Resultado

O registry define 5 archetypes. Abaixo, como cada um renderiza:

### 3.1 `discovery` → DiscoveryChips

**Quando:** Tools que retornam listas curtas de entidades do sistema (configuração, metadata).

**Visual (inspiração: Claude web mostrando listas inline):**
```
┌──────────────────────────────────────────┐
│  ● Vendas   ● Suporte   ● Marketing     │  ← chips coloridos
│  ● VIP      ● Novo                       │
└──────────────────────────────────────────┘
```

**Tools:**

| Tool | Output key | Chip label | Chip extra |
|---|---|---|---|
| `get_tags` | `tags[]` | `name` | Dot com `color` |
| `get_channels` | `channels[]` | `name \|\| phoneNumber` | Ícone da `platform` (WhatsApp/Instagram) |
| `get_kanbans` | `kanbans[]` | `name` | Badge com count de `columns[]` |
| `get_moderators` | `moderators[]` | `name \|\| email` | Badge `role`, dot se `pending` |
| `get_custom_fields` | `customFields[] \|\| fields[]` | `name` | Badge `type` |
| `get_agents_v2` | `agents[]` | `name` | Badge `providerType` |
| `get_assistants` | `assistants[]` | `name` | Badge `model` |
| `list_tag_folders` | `folders[]` | `name` | Tags aninhadas como sub-chips |

### 3.2 `list` → ListResult

**Quando:** Tools que retornam listas grandes de entidades de negócio (dados do usuário).

**Visual (inspiração: Claude web mostrando tabelas/listas estruturadas):**
```
┌──────────────────────────────────────────────────────┐
│  Nome              Telefone        Tags       Status │
│  ─────────────────────────────────────────────────── │
│  Maria Silva       +55 11 9...     VIP, Lead    ●   │
│  João Souza        +55 21 9...     Novo         ●   │
│  Ana Costa         +55 31 9...     VIP          ●   │
│                                                      │
│  42 contatos encontrados                             │
└──────────────────────────────────────────────────────┘
```

**Tools:**

| Tool | Output key | Colunas sugeridas | Footer |
|---|---|---|---|
| `search_contacts` | `contacts[]` | name, phone, email, tags (chips), isActive (dot) | `quantity` contatos |
| `list_automations` | `automations[]` | name, type (badge), isActive (toggle visual), triggers[0].typeTrigger | `quantity` automações |
| `list_templates` | `templates[]` | name, category (badge), status (badge colorido), language | `total` templates |
| `list_kanban_cards` | `cards[]` | name, status (badge), priority (badge), moderators (avatars) | `total` cards |

**Badges de status por domínio:**

| Campo | Valores | Cor |
|---|---|---|
| Template `status` | APPROVED → verde, PENDING → amarelo, REJECTED → vermelho, PAUSED → cinza, DISABLED → cinza | Semântica |
| Template `category` | UTILITY → azul, MARKETING → roxo, AUTHENTICATION → laranja | Neutra |
| Automation `type` | Texto capitalize | Cinza |
| Card `priority` | high → vermelho, medium → amarelo, low → verde | Semântica |
| Card `status` | open → azul, won → verde, lost → vermelho | Semântica |

### 3.3 `action` → ActionResult

**Quando:** Tools que executam uma mutação (criar, deletar, mover, toggle).

**Visual (inspiração: Claude web mostrando confirmação de ação — ícone + texto curto):**
```
┌──────────────────────────────────────┐
│  ✓  Tag "VIP" criada com sucesso     │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│  ✓  Automação construída             │
│     3 passos · 1 trigger · DIRECT    │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│  ✓  Card movido para "Negociação"    │
└──────────────────────────────────────┘
```

**Tools e mensagens:**

| Tool | Output fields | Mensagem renderizada |
|---|---|---|
| `create_tag` | `tag.name`, `tag.color` | Tag "{name}" criada (dot com cor) |
| `update_tag` | `tag.name` | Tag "{name}" atualizada |
| `delete_tag` | `deleted`, `tagId` | Tag excluída |
| `create_tag_folder` | `folder.name` | Pasta "{name}" criada |
| `delete_tag_folder` | `deleted` | Pasta excluída |
| `add_contact_tag` | `added`, `tagId` | Tag adicionada ao contato |
| `remove_contact_tag` | (vazio) | Tag removida do contato |
| `update_contact_field` | `operation`, `field.value` | Campo {operation}: "{value}" |
| `toggle_automation` | (vazio) | Automação alternada |
| `rename_automation` | `name` | Automação renomeada para "{name}" |
| `delete_automations` | `deletedCount` | {deletedCount} automação(ões) excluída(s) |
| `create_kanban_card` | `card.name` | Card "{name}" criado |
| `move_kanban_card` | `moved`, `card.columnId` | Card movido |
| `win_kanban_card` | (vazio) | Card marcado como ganho |
| `lose_kanban_card` | (vazio) | Card marcado como perdido |
| `assign_card_moderator` | `card.moderators` | Responsável atribuído |
| `build_automation` | `success`, `stepCount`, `triggerCount`, `triggerTypes` | Automação construída — {stepCount} passos, {triggerCount} trigger(s), {triggerTypes} |
| `create_trigger` | `trigger.type`, `trigger.platform` | Trigger {type} ({platform}) criado |
| `add_step_*` (todos) | `step._mcpType` | Passo "{_mcpType}" adicionado |
| `create_template` | `success`, `status` | Template criado ({status}) |
| `update_template` | `success`, `status` | Template atualizado ({status}) |
| `delete_templates` | `deleted[]`, `warnings[]` | {deleted.length} template(s) excluído(s). Warnings se houver |
| `sync_templates` | `success`, `message` | Templates sincronizados |
| `configure_template_params` | `configured` | Parâmetros configurados |

### 3.4 `agent` → AgentResult

**Quando:** Meta-tools do Mastra (delegação para sub-agente). O resultado é o texto final do sub-agente.

**Visual (inspiração: Claude web "Thinking..." — collapsible com conteúdo interno):**
```
┌──────────────────────────────────────────────────┐
│  Consultando sistema                              │
│  ─────────────────────────────────────────────── │
│                                                  │
│  Encontrei os seguintes canais conectados:       │
│  - WhatsApp Business: +55 11 99999-0000          │
│  - Instagram: @chatfunnel                        │
│                                                  │
│  ┌─ [✓] Canais conectados      [Concluído] ──┐  │  ← tool_use aninhado
│  │  ● WhatsApp  ● Instagram                  │  │     (subThread)
│  └────────────────────────────────────────────┘  │
│                                                  │
│  Você tem 2 canais ativos.                       │
└──────────────────────────────────────────────────┘
```

**O `subThread` (A2aContentBlock[]) renderiza recursivamente** — texto intercalado com ToolCallCards internos. Isso espelha como o Claude web mostra a cadeia de raciocínio.

**Meta-tools:**

| Tool name | Label | Sub-agente | Tools disponíveis |
|---|---|---|---|
| `agent-systemAgent` | Consultando sistema | SystemAgent | discovery + tags + campos |
| `agent-flowAgent` | Montando automação | FlowAgent | builder + management |
| `agent-templateAgent` | Gerenciando templates | TemplateAgent | template (9 tools) |
| `agent-crmAgent` | Operando CRM | CRMAgent | kanban (6 tools) |
| `agent-contactsAgent` | Buscando contatos | ContactsAgent | contacts (3 tools) |

### 3.5 `generic` → GenericJsonResult

**Quando:** Tools de detalhe que ainda não têm renderer especializado (planejado para F4).

**Visual (inspiração: Claude web mostrando JSON/code blocks):**
```
┌──────────────────────────────────────────────────┐
│  {                                               │
│    "id": "abc-123",                              │
│    "name": "Boas-vindas WhatsApp",               │
│    "status": "APPROVED",                         │
│    "category": "UTILITY",                        │
│    "components": [...]                           │
│  }                                               │
└──────────────────────────────────────────────────┘
```

**Tools (candidatos a renderer especializado no F4):**

| Tool | Output | Renderer futuro sugerido |
|---|---|---|
| `get_contact` | Contato completo (tags, channels, customFields) | **ContactDetailCard** — avatar, dados, chips de tags, lista de canais, tabela de campos |
| `get_automation` | Automação com steps/triggers | **AutomationDetailCard** — mini flow visual, lista de steps, triggers |
| `get_template` | Template com components | **TemplatePreviewCard** — preview do header/body/footer/buttons como no WhatsApp |
| `get_draft` | Rascunho (payload) | **DraftPreviewCard** — diff visual do draft vs published |
| `get_template_status` | Status + rejection reason | **TemplateStatusBadge** — badge grande + motivo rejeição |
| `get_template_buttons` | Botões do template | **ButtonPreviewList** — botões como ficariam no WhatsApp |
| `list_medias` | Mídias com URLs | **MediaGrid** — grid de thumbnails clicáveis |

## 4. Erro e Estados Especiais

### 4.1 ToolErrorResult (já existe)

**Quando:** `parsedResult.kind === "error"` ou `"plain_error"`

```
┌──────────────────────────────────────────────────┐
│  ✗  Contato não encontrado                       │  ← kind: "error", code: "NOT_FOUND"
│     O contato com ID informado não existe.       │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│  ✗  Erro interno                                 │  ← kind: "plain_error"
│     Erro: timeout ao consultar API Meta          │
│     (causa: ETIMEDOUT)                           │
└──────────────────────────────────────────────────┘
```

**Códigos de erro → mensagem amigável:**

| code | Título | Cor |
|---|---|---|
| `NOT_FOUND` | Não encontrado | Amarelo (warning) |
| `VALIDATION_ERROR` | Dados inválidos | Amarelo |
| `CONFLICT` | Conflito | Amarelo |
| `FORBIDDEN` | Sem permissão | Vermelho |
| `RATE_LIMIT` | Limite atingido | Laranja |
| `EXTERNAL_API_ERROR` | Erro na API externa | Vermelho |
| `INTERNAL_ERROR` | Erro interno | Vermelho |

### 4.2 StatusMessage

```
┌──────────────────────────────────────────────────┐
│  ✗  Sessão encerrada                             │  ← variant: "cancelled"
│     A conversa foi cancelada pelo usuário.       │
└──────────────────────────────────────────────────┘
```

## 5. Fluxo SSE → Renderização (timeline)

Exemplo: usuário pede "busca contatos VIP"

```
t0  User: "busca contatos VIP"
    └→ UserMessage.vue

t1  SSE block_start { index:0, block: { type:"text", text:"" } }
    └→ AssistantText.vue (cursor piscando, vazio)

t2  SSE block_delta { index:0, delta:"Vou buscar os contatos" }
    └→ AssistantText.vue (streaming: "Vou buscar os contatos")

t3  SSE block_delta { index:0, delta:" com tag VIP..." }
    └→ AssistantText.vue (streaming: "Vou buscar os contatos com tag VIP...")

t4  SSE block_stop { index:0 }
    └→ AssistantText.vue (texto finalizado)

t5  SSE block_start { index:1, block: { type:"tool_use", name:"agent-contactsAgent", id:"x" } }
    └→ ToolCallCard [spin Buscando contatos] [Buscando...]

t6  SSE block_start { index:1, block: { type:"tool_result", name:"agent-contactsAgent",
      content: [{ type:"json", data: { ... } }],
      subThread: [
        { type:"text", text:"Encontrei 42 contatos..." },
        { type:"tool_use", name:"search_contacts", id:"y" },
        { type:"tool_result", name:"search_contacts", content:[...] }
      ]
    }}
    └→ ToolCallCard [check Buscando contatos] [Concluído] ▼
        └→ AgentResult.vue
            ├→ texto: "Encontrei 42 contatos..."
            └→ ToolCallCard aninhado [check Busca de contatos] [Concluído]
                └→ ListResult.vue (tabela com contatos)

t7  SSE block_start { index:2, block: { type:"text", text:"" } }
    └→ AssistantText.vue (segundo bloco de texto)

t8  SSE block_delta { index:2, delta:"Encontrei 42 contatos com tag VIP..." }
    └→ texto final do orchestrator

t9  SSE done { conversationId, usage: { inputTokens:485, outputTokens:152, costUsd:0.00234 } }
    └→ CostBadge.vue (se implementado)
```

## 6. Árvore de Componentes (Completa)

```
IntelligenceV2View.vue
├── ConversationsSidebar.vue
│   └── ConversationItem.vue (por conversa)
│
├── ChatColumn.vue
│   ├── ChatHeader.vue
│   │   └── SessionControls (cancel, clear)
│   │
│   ├── ChatMessageList.vue (pendente F1)
│   │   └── MessageRenderer.vue (switch por message.kind)
│   │       │
│   │       ├── UserMessage.vue
│   │       │   └── Texto com avatar do usuário
│   │       │
│   │       ├── AssistantText.vue
│   │       │   └── Markdown renderizado (streaming com cursor)
│   │       │
│   │       ├── ToolCallCard.vue        << COMPONENTE CENTRAL
│   │       │   ├── Header: ícone status + label + badge + caret
│   │       │   └── Body (expanded): switch por archetype
│   │       │       ├── DiscoveryChips.vue    (archetype: "discovery")
│   │       │       ├── ListResult.vue        (archetype: "list")
│   │       │       ├── ActionResult.vue      (archetype: "action")
│   │       │       ├── AgentResult.vue       (archetype: "agent")
│   │       │       │   └── RECURSIVO: texto + ToolCallCard aninhados
│   │       │       ├── GenericJsonResult.vue  (archetype: "generic")
│   │       │       └── ToolErrorResult.vue    (kind: "error"/"plain_error")
│   │       │
│   │       └── StatusMessage.vue (success/error/cancelled)
│   │
│   ├── ChatInput.vue
│   │   ├── Textarea auto-resize
│   │   ├── SlashCommandMenu.vue (pendente F1)
│   │   └── Botão enviar / cancelar
│   │
│   └── EmptyState.vue (hero + suggestions)
│       └── SuggestionCards.vue (pendente F1)
│
└── ArtifactPanel.vue (pendente F5)
    ├── FlowArtifact.vue      (build_automation visual)
    ├── TemplateArtifact.vue   (preview WhatsApp)
    └── AgentArtifact.vue      (config de agente)
```

## 7. Renderers Futuros (F4) — Detalhe especializado

Quando implementar F4, os tools `generic` devem migrar para renderers ricos:

### ContactDetailCard (get_contact)
```
┌──────────────────────────────────────────────────┐
│  [Avatar]  Maria Silva                           │
│            +55 11 99999-0000 · maria@email.com   │
│  ─────────────────────────────────────────────── │
│  Tags:  ● VIP  ● Lead  ● Ativo                  │
│  ─────────────────────────────────────────────── │
│  Canais:  WhatsApp  Instagram                    │
│  ─────────────────────────────────────────────── │
│  Campos personalizados:                          │
│    Empresa: ChatFunnel                           │
│    Plano: Pro                                    │
│    Último contato: 15/05/2026                    │
└──────────────────────────────────────────────────┘
```

### AutomationDetailCard (get_automation)
```
┌──────────────────────────────────────────────────┐
│  Boas-vindas Instagram          [Ativo ●]        │
│  ─────────────────────────────────────────────── │
│  Trigger: COMMENT · Instagram                    │
│  ─────────────────────────────────────────────── │
│  Fluxo:                                          │
│    1. Mensagem → "Olá! Bem-vindo..."             │
│    2. Delay → 5 min                              │
│    3. Condição → tag contém "VIP"                │
│       ├─ Sim → Mover p/ Kanban "Qualificados"   │
│       └─ Não → Mensagem → "Saiba mais..."       │
└──────────────────────────────────────────────────┘
```

### TemplatePreviewCard (get_template)
```
┌──────────────────────────────────────────────────┐
│  confirmacao_pedido        APPROVED ●            │
│  UTILITY · pt_BR                                 │
│  ─────────────────────────────────────────────── │
│  ┌────────────────────────────────────────────┐  │
│  │  HEADER: Pedido Confirmado                 │  │
│  │  ──────────────────────────────────        │  │
│  │  Olá {{1}}, seu pedido #{{2}} foi          │  │
│  │  confirmado! Previsão: {{3}}.              │  │
│  │  ──────────────────────────────────        │  │
│  │  FOOTER: ChatFunnel 2026                   │  │
│  │  ──────────────────────────────────        │  │
│  │  [Acompanhar pedido]  [Falar com suporte]  │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

## 8. Thinking pill (AssistantMessage)

Enquanto `hasVisibleContent === false` o `AssistantMessage.vue` renderiza um pill com label derivada de `getThinkingLabel(firstToolInvocation?.name)`.

**Regra:**

- Sem `tool_invocation` na fila → `"Pensando..."` (constante `THINKING_LABEL`)
- Com `tool_invocation[0].name = "X"` → `${getToolLabel("X")}...` (ex: `"Pipelines..."`, `"Buscando contatos..."`)

**Estabilidade:** ao contrário da rotação por seed antiga (`THINKING_LABELS[seed % 8]`), a label NÃO muda entre re-renders da mesma mensagem — espelha o comportamento do Claude web ("Thinking…" → "Searching…").

**Fonte da verdade:** `chatfunnel-contracts/src/tools/labels.ts` exporta `TOOL_LABELS`, `THINKING_LABEL`, `getToolLabel`, `getThinkingLabel`. O front re-exporta em `chatfunnel-front/src/views/intelligenceV2/utils/tool-label.ts` pra preservar imports relativos (`../../utils/tool-label`) usados pelo `ToolCallCard.vue`.
