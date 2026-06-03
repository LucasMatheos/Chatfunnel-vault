---
title: Intelligence (A2A) — Shapes de Dados e Componentes
description: Referencia completa das shapes de request, eventos SSE, resultados de tools MCP e modelos persistidos do A2A — base para desenhar componentes do frontend.
tags: [features, intelligence, a2a, frontend, types]
related: ["[[intelligence-a2a]]", "[[mcp-integration]]", "[[automations]]", "[[crm-kanban]]", "[[contacts]]"]
last_updated: 2026-04-30
---

# Intelligence (A2A) — Shapes de Dados

> Companion de [[intelligence-a2a]]. Aqui ficam as shapes exatas que o front recebe — para tipar stores, props de componentes e renderizadores.

## 1. Request — `POST /nest/a2a/chat`

```ts
interface A2aChatRequest {
  sessionId: string;        // UUID gerado pelo front (ephemeral)
  message: string;          // 1..4000 chars (validado por class-validator)
  conversationId?: string;  // UUID — primeira mensagem omite, demais mandam
}
```

Headers obrigatorios:
- `Authorization: Bearer <jwt>`
- `Account-Selected: <accountId>`
- `Content-Type: application/json`

Erros sincronos antes do stream:
- **400** `{ error: "Configure sua chave da Anthropic..." }` — `account.anthropicKey` ausente
- **403** `{ error: "Access denied" }` — sessao pertence a outra conta/usuario
- **404** `{ error: "Conversation not found" }` — `conversationId` invalido
- **429** rate limit (ver secao 1.1 abaixo)
- **500** `{ error: "Internal server error" }`

### 1.1. Rate limits — duas camadas distintas

Quando o front recebe **429**, pode vir de **dois lugares diferentes** com causas e remediacoes distintas:

| Camada | Limite | Source | Quando dispara |
|--------|--------|--------|----------------|
| **A2A throttler** | 10 req/min por usuario | `@Throttle({ limit: 10, ttl: 60000 })` + `A2aThrottlerGuard` em `chatfunnel-services` | Usuario manda mais de 10 mensagens/min no chat |
| **MCP session limits** | 10 sessoes concorrentes por conta + limite de criacao por janela | `McpRateLimiterService` em `chatfunnel-mcp` | Tools de varios contextos (Intelligence + integracoes externas) abriram sessoes MCP demais simultaneamente. Subiu de 5 para 10 em `bde65d8` |

> Atualizado em 2026-04-29: o MCP elevou o teto de sessoes concorrentes por conta de **5 para 10** (commit `bde65d8`). Pre-essa mudanca, contas com integracoes externas + Intelligence ativos batiam o limite com facilidade.

**Diferenciacao no front (recomendado):**
- Erro de A2A throttler vem como erro sincrono na rota `/a2a/chat` antes do stream — UX: toast simples "Aguarde alguns segundos" com countdown 60s
- Erro de MCP rate limit aparece como `tool_result` com `isError: true` e shape `McpToolErrorPayload` com `code: "RATE_LIMIT"` e `details.retryAfterSeconds` — UX: card de erro inline na tool com countdown especifico

Detalhe pratico: o MCP rate limit tambem cobre **criacao de sessoes** (limite por janela de tempo) alem de **sessoes concorrentes**. Sessoes MCP tem TTL e cleanup proprio (commits `17ce3f3`, `4c0302a`) — operador nao precisa se preocupar com lifecycle, mas se ver muitos 429 com `code: "RATE_LIMIT"` em sequencia, vale checar se o backend nao esta vazando sessoes.

## 2. Eventos SSE — payloads exatos

Definicao canonica em `chatfunnel-services/src/modules/a2a/types/a2a.types.ts:34-45`. Todos os payloads sao `JSON.stringify`-ados e enviados como `event: <type>\ndata: <json>\n\n`.

### `event: text`
```ts
{ content: string }   // delta incremental
```

### `event: tool_start`
```ts
{
  id: string;                   // toolCallId — identificador unico do call
  name: string;                 // ex: "list_automations", "create_kanban_card"
  input: Record<string, unknown>; // args da tool (estruturados conforme schema)
  textOffset: number;           // injetado pelo controller (a2a.controller.ts:189-199)
}
```

> `textOffset` e o `length` do texto **ja emitido** ate aquele ponto. Use para inserir o card da tool inline no markdown que esta sendo construido.

### `event: tool_result`
```ts
{
  id: string;          // mesmo toolCallId do tool_start
  name: string;
  result: string;      // SEMPRE string — JSON stringificado (ver secao 4)
  isError?: boolean;   // true em tool-error
}
```

### `event: cancelled`
```ts
{ reason: "user_requested" }
```

### `event: error`
```ts
{
  message: string;     // "Erro interno do agente" ou mensagem do agente
  cause?: string;      // root cause da cadeia .cause (Mastra wrap)
}
```

### `event: done`
```ts
{
  conversationId: string;       // injetado pelo controller (sempre presente)
  finishReason: "stop" | "tool_calls" | "length" | string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;            // custo total da request (USD)
  };
}
```

## 3. Modelo de tool call no front (acumulado)

Estrutura sugerida para o store (espelha `A2aToolCallInfo`):

```ts
interface ToolCallState {
  id: string;
  name: string;
  status: "running" | "done" | "error" | "cancelled";
  input?: Record<string, unknown>;
  result?: string;        // JSON string — fazer JSON.parse no render
  error?: string;
  textOffset: number;     // posicao no texto onde aparece inline
}
```

Ciclo de vida:
1. `tool_start` -> push `{ status: 'running', input, textOffset }`
2. `tool_result` -> find by id, set `status: 'done'`, `result`
3. `tool_result` com `isError: true` -> `status: 'error'`, copiar `result` para `error`
4. `cancelled` antes do result -> set `status: 'cancelled'` em todas as `running`

## 4. Shape do `tool_result.result`

Todas as tools MCP retornam `content: [{ type: "text", text: JSON.stringify(data) }]`. Apos o backend, o front recebe **`result: string`** que precisa ser `JSON.parse`-ado. Tres formatos possiveis:

### 4.1. Sucesso — payload de dominio
```ts
type ToolSuccessResult = unknown;   // varia por tool — ver secao 5
```

### 4.2. Erro estruturado (`isError: true`)
Origem: `chatfunnel-mcp/src/mcp/errors/mcp-tool-error.ts:48-55`.

```ts
interface McpToolErrorPayload {
  error: {
    code: "NOT_FOUND" | "VALIDATION_ERROR" | "CONFLICT" | "FORBIDDEN"
        | "RATE_LIMIT" | "EXTERNAL_API_ERROR" | "INTERNAL_ERROR";
    type: "domain" | "external_api" | "rate_limit" | "internal";
    message: string;
    details?: unknown;   // payload extra (ex: { retryAfterSeconds: 30 })
  };
}
```

### 4.3. Erro emitido pelo Mastra (tool-error)
Quando a tool jogou excecao fora do handler (timeout, falha de rede), o controller envia `result` como string formatada:
```
"Erro: <wrapper> (causa: <rootCause>)"
```

> Para o componente de tool card: tente `JSON.parse` — se falhar, e mensagem de erro plain. Se `isError: true` e parse OK, e o shape 4.2.

## 5. Catalogo de tools por agente

Definido em `chatfunnel-services/src/modules/a2a/agents/tool-map.ts:14-98`.

### Flow (`flow-agent`) — 19 tools

**Builder (11):** `create_trigger`, `add_step_message`, `add_step_delay`, `add_step_condition`, `add_step_action`, `add_step_kanban`, `add_step_ab_test`, `add_step_follow_up`, `add_step_run_automation`, `add_step_chat_action`, `build_automation`

**Management (6):** `list_automations`, `get_automation`, `toggle_automation`, `rename_automation`, `delete_automations`, `get_draft`

**Discovery (2):** `get_channels`, `get_tags`

### System (`system-agent`) — 13 tools

**Discovery (7):** `get_custom_fields`, `get_tags`, `get_channels`, `get_kanbans`, `get_assistants`, `get_moderators`, `get_agents_v2`

**Tag CRUD (3):** `create_tag`, `update_tag`, `delete_tag`

**Folder CRUD (3):** `list_tag_folders`, `create_tag_folder`, `delete_tag_folder`

### Template (`template-agent`) — 10 tools

`list_templates`, `get_template`, `get_template_status`, `get_template_buttons`, `create_template`, `update_template`, `delete_templates`, `sync_templates`, `configure_template_params`, `get_channels`

### CRM (`crm-agent`) — 8 tools

`get_kanbans`, `get_moderators`, `create_kanban_card`, `move_kanban_card`, `win_kanban_card`, `lose_kanban_card`, `assign_card_moderator`, `list_kanban_cards`

### Contacts (`contacts-agent`) — 6 tools

`add_contact_tag`, `remove_contact_tag`, `get_custom_fields`, `search_contacts`, `get_contact`, `update_contact_field`

## 6. Shapes de retorno mais comuns

> **Atualizado 2026-05-04 (rodada 2)** com captura real do playbook. Para context, gotchas e bugs detalhados, ver section 13.9.

Apenas as mais frequentes — para shapes completas, consultar os services em `chatfunnel-mcp/src/<modulo>/`.

### `list_automations` -> `AutomationSummary[]`
```ts
interface AutomationSummary {
  id: string;
  name: string;
  isActive: boolean;
  triggerType: string;        // ex: "MESSAGE", "DIRECT", "TAG_ADDED", "NEW_CONTACT"
  triggerKeyword?: string | null;
  triggerPlatform?: "WHATSAPP" | "INSTAGRAM";
  flow: unknown[];             // 4/5 vem [] vazio em prod (ver 13.7)
  _count: {
    executions: number;        // 🐛 divergencia 26x vs 1x entre root e trigger (ver 13.7)
  };
  createdAt: string;
  updatedAt: string;
}
```
> **🐛 Bug (13.7):** `_count.executions` no root vs no trigger pode divergir em ate 26x. Source of truth nao definida.

### `get_automation` -> `AutomationFull`
Estrutura completa com `triggers[]`, `steps[]`, `flows[]`, `positions[]`. Steps carregam discriminator `stepType` (10 valores: `WHATSAPP_ACTIONS`, `INSTAGRAM_ACTIONS`, `DELAY`, `ACTIONS`, `CONDITIONS`, `KANBAN_ACTIONS`, `AB_TEST`, `FOLLOW_UP`, `RUN_AUTOMATION`, `CHAT_ACTIONS`). Triggers carregam discriminator `typeTrigger` (16 valores). Ver `chatfunnel-mcp/src/automations/automations.service.ts`.

> **🐛 Bugs conhecidos:** `runAutomationId: null` apesar do input passar `automationId`; trigger commentConfig/storyConfig nao persistem inputs (so defaults voltam); `flows[0].channelId: null` em MSG TEMPLATE (especifico de TEMPLATE flowType); `storyMentionActivateMode: "ALWAYS"` orphan default em qualquer trigger. Ver section 13.9.

### `delete_automations` -> string plana
Retorna `"Successfully deleted N automation(s)."` como string, nao envelope JSON. Tratar como toast.

### `get_tags` -> `Tag[]`
```ts
interface Tag {
  id: string;
  name: string;
  accountId: string;
  folderId: string | null;
  // ⚠️ NAO tem `color` no MCP — schema gap (UI tem cor, MCP nao expoe)
}
```

### `get_channels` -> `Channel[]`
```ts
interface Channel {
  id: string;
  allocatedType: "WHATSAPP" | "INSTAGRAM" | null;  // null = canal orfao/desconectado
  igName: string | null;       // ex: "Raul 💙 e José 💚"
  wppName: string | null;      // ex: "Vinicius Teider"
  wppNumber: string | null;    // 🔴 PII em plaintext — audit 4.6
}
```
> **🔴 PII leak (audit 4.6):** `wppName`, `wppNumber`, `igName` retornam plaintext sem mascaramento.

### `get_kanbans` -> `Kanban[]`
```ts
interface Kanban {
  id: string;
  name: string;
  accountId: string;
  isDeleted: boolean;
  deletedAt: string | null;
  columns: Array<{
    id: string;
    kanbanId: string;
    name: string;
    color: string;             // hex ex: "#00DDD7"
    position: number;
    isDone: boolean;
    isDeleted: boolean;
    deletedByUserId: string | null;
    deletedByUserName: string | null;
  }>;
}
```

### `get_moderators` -> `Moderator[]`
```ts
// 🔴 SHAPE COM PII MASSIVA — ver audit 4.1 + 4.1.b. NUNCA serializar inteiro pro client.
interface Moderator {
  id: string | null;           // 🎯 null quando moderator eh owner (usar userId nesse caso)
  userId: string;
  accountId: string;
  user: {                      // 🔴 80+ campos sensiveis
    id: string;
    name: string;              // 🔴 PII: pode ter phone embedado ("VUKODE +55 (45) 99813-5374")
    phone: string;
    email: string;
    cpfCnpj: string;
    document: string;
    documentType: "CPF" | "CNPJ";
    passwordHash: string;      // 🔴 hash bcrypt
    longLivedAccessToken: string;  // 🔴 Facebook token
    facebookId: string;
    pagarmeCustomerId: string;
    stripeCustomerId: string | null;
    // ... +60 campos billing/subscription/profile
  };
  account: {                   // 🔴 chaves API REAIS de prod
    id: string;
    openaiKey: string;         // 🔴 sk-proj-... ou sk-...
    elevenlabsKey: string;     // 🔴 sk_af7c...
    anthropicKey: string | null;
    // ... +50 campos billing/subscription
    user: User;                // 🔴 duplicata do user root (audit 4.1.b)
  };
  pending: boolean;
  token: string | null;
}
```
> **🎯 Gotcha critico:** quando `moderator.id === null` (owner), o param `moderatorId` em `assign_card_moderator` aceita `userId`. Frontend deve usar `moderator.id ?? moderator.userId`.

### `get_agents_v2` -> `AgentV2Summary[]`
Subset definido em `chatfunnel-mcp/src/mcp/tools/discovery.tools.ts:160-166`:
```ts
interface AgentV2Summary {
  id: string;
  name: string;
  model: string;
  providerType: "OPENAI" | "ANTHROPIC";
  createdAt: string;
}
```
> Gap: shape populado real ainda nao capturado em prod. Confirmar quando user tiver agentes V2 ativos.

### `search_contacts` -> `SearchContactsResult`
```ts
// ⚠️ Naming divergente: usa `contacts[]` (nao `data[]`) e `quantity` (nao `total`)
interface SearchContactsResult {
  contacts: Array<{
    id: string;
    name: string;
    photo: string | null;
    phone: string | null;
    email: string | null;
    folder: { id: string; name: string } | null;
    tags: Array<{ id: string; name: string }>;
    quantity: number;          // count de conversas/atividades — NAO existe em get_contact
    rating: number;             // score de engajamento — NAO existe em get_contact
    dateCreated: string;
  }>;
  quantity: number;             // total da query (paginated)
  topRanking: Array<{           // 🔴 PII LEAK — audit 4.7
    id: string;
    name: string;
    photo: string | null;
    quantity: number;
  }>;
}
```
> **🔴 audit 4.7:** `topRanking[]` retorna top contatos da conta inteira (nao matches da query). Vaza ranking de relacionamento sem filtro.

### `get_contact` -> `ContactFull`
```ts
// 35+ campos. Shape full real:
interface ContactFull {
  id: string;
  name: string;
  firstName: string;            // split server-side de `name`
  lastName: string;             // string vazia "" quando nome eh single-word
  photo: string | null;
  email: string | null;
  phone: string | null;          // 🔴 PII direta
  // Instagram
  instagramUsername: string | null;
  instagramIsVerified: boolean;
  instagramFollowerCount: number;
  instagramFollowBusinnes: boolean;  // 🐛 typo confirmado em prod (audit 4.10)
  instagramFollow: boolean;
  instagramId: string | null;
  facebookId: string | null;
  // WhatsApp
  wppUserId: string | null;
  wppUsername: string | null;
  wppCountryCode: string | null;
  // UTMs
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  // Schedule (system fields desnormalizados — NAO atualizam via update_contact_field)
  lastScheduleLink: string | null;
  lastScheduleDate: string | null;
  // Metadata
  dateCreated: string;
  userId: string;                // 🔴 vinculo PII com owner
  accountId: string;
  hasEdited: boolean;
  wppLastUpdate: string | null;
  igLastUpdate: string | null;
  lastUpdate: string | null;
  folderId: string | null;
  fromPlatform: "INSTAGRAM" | "FACEBOOK" | "WHATSAPP" | string;
  isDeleted: boolean;
  deletedAt: string | null;
  isActive: boolean;
  // Relacionamentos
  TagsContacts: unknown[];       // 🔴 nome de tabela junction Prisma vazado (audit 4.9)
  customFields: Array<{
    id: string;
    value: string;
    customFieldId: string;
    contactId: string;
    customField: {
      id: string;
      name: string;
      accountId: string | null;  // null = system field
      folderId: string | null;
      assistants: unknown[];
    };
  }>;
}
```

### `create_kanban_card` -> ⚠️ silent-fail false-negative
```ts
// 🔴 Tool retorna INTERNAL_ERROR mas mutacao PERSISTE (audit 4.11 critica)
// Workaround obrigatorio: ler via list_kanban_cards apos catch
interface KanbanCardFull {
  id: string;
  position: number;              // server-calculated
  contactId: string;
  kanbanId: string;
  columnId: string;
  statusOportunity: "OPEN" | "WON" | "LOST";  // OPEN default
  priority: "LOW" | "MEDIUM" | "HIGH";
  createdAt: string;
  isDeleted: boolean;
  amount: number;                // monetario, default 0
  hasActivity: boolean;          // populado server-side baseado em estado real
  moderators: Array<{
    user: {                      // 🔴 PII leak — phone embedado em name (audit 4.8)
      id: string;
      name: string;
    };
  }>;
  contact: {
    id: string;
    name: string;
    photo: string | null;
    tags: Array<{ id: string; name: string }>;
  };
  // ⚠️ description input NAO aparece no shape do read (gap — vai pra notes/comments?)
}
```

### `move_kanban_card` / `win_kanban_card` / `lose_kanban_card` / `assign_card_moderator` -> ⚠️ silent-fail
Mesma classe de bug do `create_kanban_card` (audit 4.11). Tool retorna `INTERNAL_ERROR/internal/Cannot read properties of undefined (reading 'emit')` mas mutacao persiste. Validar via `list_kanban_cards` apos catch.

### `list_kanban_cards` -> ⚠️ shape CONDICIONAL
```ts
// 🐛 Shape muda conforme presenca de columnId no input (audit-pendente)
// SEM columnId:
type ListWithoutFilter = {
  kanban: {
    id: string;
    name: string;
    accountId: string;
    isDeleted: boolean;
    deletedAt: string | null;
    columns: Array<KanbanColumnSummary>;  // SEM `cards[]` aninhado
  };
};

// COM columnId:
type ListWithFilter = {
  kanban: {
    id: string;
    name: string;
    accountId: string;
    isDeleted: boolean;
    deletedAt: string | null;
    columns: Array<KanbanColumnSummary & {
      cards: Array<KanbanCardFull>;  // 🎯 cards SO aparecem com filtro
    }>;
  };
  kanbans: Array<{ id: string; name: string; accountId: string; isDeleted: boolean; deletedAt: string | null }>;  // ⚠️ campo extra so com filtro
};
```

### `toggle_automation` / `remove_contact_tag` -> `{}`
Confirmacao silenciosa. Tratar como sucesso se nao houver `error` envelope.

### `update_contact_field` -> ⚠️ 3 comportamentos no mesmo shape de input
```ts
// (1) INSERT (row de junction nao existia) — retorna row de junction
type Insert = {
  id: string;
  value: string;
  customFieldId: string;
  contactId: string;
};
// (2) UPDATE in-place (row existe + value novo) — retorna {}
type Update = Record<string, never>;
// (3) DELETE (row existe + value === "") — retorna {}, mas DELETA a relacao da junction
type Delete = Record<string, never>;
// ⚠️ Cliente nao distingue (2) de (3) pelo response. Se input value="", junction some no get_contact.
```
> **Audit acoes 29-30.** Frontend deve evitar `value: ""`.

### `add_contact_tag` -> shape mini
```ts
interface AddContactTagResult {
  tagId: string;
  tagName: string;
  // ⚠️ sem contactId, sem tagsCount. Idempotente silent quando tag ja atribuida.
}
```

### `list_templates` -> `TemplateList`
```ts
interface TemplateList {
  data: Array<TemplateMeta>;
  status: boolean;               // 🐛 envelope-level success boolean — colide com `data[i].status` string (audit 39)
}
interface TemplateMeta {
  name: string;
  parameter_format: "POSITIONAL" | "NAMED";  // 🐛 snake_case (Meta) inconsistente com camelCase (audit naming hibrido)
  components: Array<TemplateComponent>;
  language: string;
  status: "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | "DISABLED";
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  is_primary_device_delivery_only: boolean;
  id: string;                    // Meta numeric string (ex: "1559135439076768")
  wasSynced: boolean;
  needsConfiguration: boolean;   // 🐛 divergente entre list_templates (false) e get_template (true) — audit 32
  internalId: string;            // UUID interno
  // Apos update: campo NOVO `previous_category?: string` aparece (audit confirmou)
}
type TemplateComponent =
  | { type: "HEADER"; format: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION"; text?: string }
  | { type: "BODY"; text: string; example?: { body_text: string[][] } }
  | { type: "FOOTER"; text: string }
  | { type: "BUTTONS"; buttons: Array<TemplateButton> };
type TemplateButton =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url: string }
  | { type: "PHONE_NUMBER"; text: string; phone_number: string }
  | { type: "COPY_CODE"; text: string };
```

### `get_template` -> `TemplateMeta` extendido
Extends `TemplateMeta` com:
```ts
interface TemplateFull extends TemplateMeta {
  parameters: Array<{
    componentType: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
    componentFormat: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
    parameter: string;            // bare digit "1" (NAO "{{1}}" — schema doc engana)
    internalParameter: string;    // "" quando nao mapeado, "name" / "customFields.X" quando mapeado
  }>;
  buttons: Array<{                // 🐛 outer buttons[] — shape diferente de components[type=BUTTONS].buttons (audit 34)
    id: string;                   // UUID interno do button
    whatsappTemplateId: string;
    type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "COPY_CODE";
    url: string | null;
    index: number;
    // ⚠️ NAO tem `text` — frontend precisa join com components[type=BUTTONS].buttons[index] pra obter
  }>;
}
```
> Envelope wrapper: `{ status: true, data: TemplateFull }`. Mesmo conflito de naming `status`.

### `get_template_status` -> subset
```ts
{
  name: string;
  status: "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | "DISABLED";
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  rejectedReason: string | null;  // 🐛 sempre null em REJECTED capturado (audit 33 — Meta API tem reason mas MCP nao mapeia)
  qualityScore: string | null;
}
```

### `get_template_buttons` -> `QuickReplyButton[]`
```ts
// 🐛 NAO eh "get all buttons" — eh "get QUICK_REPLY buttons for trigger matching"
// Templates URL/PHONE_NUMBER/COPY_CODE/OTP sao filtrados ou (se zero QUICK_REPLY) error explicito
interface QuickReplyButton {
  buttonId: string;               // UUID interno
  text: string;
  type: "QUICK_REPLY";
  index: number;
}
// Quando template nao tem nenhum QUICK_REPLY:
type Error = {
  error: {
    code: "VALIDATION_ERROR";
    type: "domain";
    message: "Template has no QUICK_REPLY buttons — TEMPLATE trigger only works with QUICK_REPLY buttons.";
  };
};
```

### `create_template` -> `{ success: true, id: string }` (8ª variante write)
```ts
interface CreateTemplateResult {
  success: true;
  id: string;                     // Meta numeric string
}
// ⚠️ frontend que precisa do internal UUID precisa follow-up via list_templates ou get_template
```

### `update_template` -> `{ success: true, id: string }` (envelope COMPARTILHADO com create)
```ts
interface UpdateTemplateResult {
  success: true;
  id: string;
}
// 🔴 BUG CRITICO partial-update: payload parcial APAGA components nao enviados (audit 35).
// 🔴 BUG `category` vai pra MARKETING default quando omitido (audit 36).
// Workaround: re-enviar TODOS os components + category atual via snapshot pre-update.
```

### `sync_templates` -> `{ success: true, message: string }` (6ª variante write)
```ts
interface SyncTemplatesResult {
  success: true;
  message: "Templates synchronized successfully";
}
```

### `delete_templates` -> `{ deleted: true }` (9ª variante write)
```ts
interface DeleteTemplatesResult {
  deleted: true;
}
// Cleanup instantaneo (NAO scheduled deletion como hipotese inicial). Template some imediatamente do MCP.
// Schema doc menciona "Returns warnings if templates are used by automations" — gap nao testado.
```

### `configure_template_params` -> `{ configured: true, status: true }` (7ª variante write)
```ts
interface ConfigureTemplateParamsResult {
  configured: true;
  status: true;                   // redundante, sempre true em sucesso
}
// Semantica: upsert por `parameter` key. Missing keys reset to "" (NAO delete).
// `parameters: []` eh DEFENSIVO (reset all to unconfigured) — NAO destrutivo.
```

### Catalogo de envelopes write (catalogo ate 2026-05-04 rodada 2)

| # | Tools | Envelope shape |
|---|---|---|
| 1 | tag CRUD + create_tag_folder | objeto echo full |
| 2 | `delete_tag_folder`, `rename_automation` | string UUID pura |
| 3 | `add_contact_tag` | `{ tagId, tagName }` |
| 4 | `remove_contact_tag`, `toggle_automation` | `{}` vazio |
| 5a | `update_contact_field` (INSERT) | row de junction `{id, value, customFieldId, contactId}` |
| 5b | `update_contact_field` (UPDATE/DELETE) | `{}` vazio (3 comportamentos no mesmo shape — audit 30) |
| 6 | `sync_templates` | `{ success, message }` |
| 7 | `configure_template_params` | `{ configured, status }` |
| 8 | `create_template`, `update_template` | `{ success, id }` (compartilhado — primeira coerencia intra-familia) |
| 9 | `delete_templates` | `{ deleted: true }` |

### Error envelope reference (capturado 2026-05-04 rodada 2)

```ts
type McpError = {
  error: {
    code: McpErrorCode;
    type: McpErrorType;
    message: string;              // 3 idiomas misturados em prod: EN, PT-BR, i18n key raw
  };
};

type McpErrorCode =
  | "NOT_FOUND"                   // recurso nao encontrado (6 variantes capturadas)
  | "VALIDATION_ERROR"             // input invalido (phone BR formato, tag duplicada, template sem QUICK_REPLY)
  | "INTERNAL_ERROR"               // bug servidor (3 sub-tipos: .emit(), Prisma stack, i18n key raw)
  // gaps (state-specific, nao capturados):
  | "CONFLICT"
  | "FORBIDDEN"
  | "RATE_LIMIT"
  | "EXTERNAL_API_ERROR";

type McpErrorType =
  | "domain"                      // erro de regra de negocio (NOT_FOUND, VALIDATION) — mensagem geralmente segura pra UI
  | "internal";                   // bug servidor — mensagem tecnica, pode vazar Prisma/stack/i18n

// Padroes anti-pattern (audit acoes 4.12 + 4.13):
// 1. get_automation NOT_FOUND retorna i18n key raw "errors.Automation.ErrorOnGetAutomations"
// 2. delete_tag em tag deletada vaza Prisma stack: "Invalid `prisma.tags.delete()` invocation: ... Record to delete does not exist."
```

> **Frontend deve usar `error.code` como discriminator estavel** (nao `error.message` — 3 idiomas misturados + bugs de leak).

## 7. Endpoints REST — shapes de resposta

### `GET /nest/a2a/conversations?page=1&limit=20`
```ts
interface ConversationListResponse {
  data: Array<{
    id: string;          // UUID — mesmo que conversationId/threadId
    userId: string;
    accountId: string;
    sessionId: string | null;
    title: string | null;   // gerado pelo agente; pode estar null em conversas novas
    createdAt: string;
    updatedAt: string;
  }>;
  total: number;
  page: number;
}
```

> A wiki principal mencionava `firstMessage`, `lastMessage`, `messageCount`, `isDeleted` — esses campos **nao existem** no schema atual (`chatfunnel-core/prisma/schema.prisma:2767-2782`). Para preview de ultima mensagem, listar via `/conversations/:id/messages?limit=1`.

### `GET /nest/a2a/conversations/:id/messages?page=1&limit=50`
```ts
interface MessageListResponse {
  data: Array<{
    id: string;
    conversationId: string;
    role: "user" | "assistant";
    content: string;       // markdown completo (sem deltas)
    toolCalls: Array<{     // JSONB — null em mensagens user
      id: string;
      name: string;
      status: "done" | "error" | "cancelled";
      input?: Record<string, unknown>;
      result?: string;     // JSON string
      error?: string;
      textOffset: number;
    }> | null;
    createdAt: string;     // ISO 8601
  }>;
  total: number;
  page: number;
}
```

> Ordenacao **ascendente** por `createdAt` — as mensagens vem ja na ordem de leitura. Refresh da pagina = montar UI direto da resposta.

### `GET /nest/a2a/health`
```ts
{
  status: "ok" | "degraded";
  activeStreams: number;
  memoryUsage: { ... };  // process.memoryUsage()
}
```

## 8. Mapeamento sugerido — tool name -> componente visual

| Tool | Tipo de card | Componente |
|------|--------------|------------|
| `list_automations`, `list_templates`, `list_kanban_cards`, `search_contacts` | Tabela compacta | `<ToolListCard>` com colunas dinamicas |
| `get_automation`, `get_contact`, `get_template` | JSON tree expandivel | `<ToolDetailCard>` |
| `create_*`, `update_*` | Confirmacao + link | `<ToolActionCard>` (icone verde + "ver") |
| `delete_*` | Confirmacao destrutiva | `<ToolActionCard>` (icone vermelho) |
| `move_kanban_card`, `win_kanban_card`, `lose_kanban_card` | Status update | `<ToolStatusCard>` |
| `toggle_automation` | Toggle visual | `<ToolToggleCard>` |
| `get_channels`, `get_tags`, `get_kanbans`, `get_moderators`, `get_agents_v2`, `get_custom_fields` | Chips inline | `<ToolDiscoveryChips>` |
| `add_step_*`, `create_trigger`, `build_automation` | Step builder progress | `<ToolBuilderCard>` |
| `sync_templates`, `configure_template_params` | Loading + resultado | `<ToolProcessCard>` |

Card universal precisa de:
- **Header colapsado:** icone do status (`running` spinner / `done` check / `error` X / `cancelled` slash) + label amigavel + tempo
- **Body expandido:** input formatado + resultado renderizado conforme tabela acima + raw JSON em "Ver mais"
- **Erro:** badge vermelho + `error.code` + `error.message` (do shape 4.2)

## 9. Estado vazio e loading

| Cenario | Estado |
|---------|--------|
| Lista de conversas vazia | empty state — "Inicie uma conversa com a Intelligence" + CTA |
| Conversa sem mensagens (acabou de criar) | empty state — exemplos de prompt |
| `anthropicKey` ausente (400) | banner persistente com link para [[credenciais-page]] |
| Stream ativo sem token ainda | spinner inline ate primeiro `text` |
| Tool `running` | placeholder card com skeleton |
| Erro de rede / disconnect | toast + botao "Reenviar" (cliente refaz POST) |
| Rate limit (429 do throttler) | toast — "Aguarde alguns segundos" |
| `error` event com cause | tool/mensagem com erro inline + opcao retry |

## 10. Checklist tipos para a store Vue

```ts
// types/a2a.ts
export interface A2aMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallState[];
  createdAt: string;
  pending?: boolean;       // true enquanto stream rola
}

export interface A2aConversation {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface A2aChatStore {
  conversations: A2aConversation[];
  currentConversationId: string | null;
  messages: A2aMessage[];
  streaming: boolean;
  abortController: AbortController | null;
  error: string | null;
  cost: number | null;             // ultimo done.usage.costUsd
  hasAnthropicKey: boolean;
}
```

## 11. Referencia de arquivos

- Tipos backend: `chatfunnel-services/src/modules/a2a/types/a2a.types.ts`
- DTO: `chatfunnel-services/src/modules/a2a/dto/a2a-chat-request.dto.ts`
- Mapeamento Mastra -> SSE: `chatfunnel-services/src/modules/a2a/services/a2a-agent.service.ts:877-940`
- Schema Prisma: `chatfunnel-core/prisma/schema.prisma:2767-2795`
- Tools MCP: `chatfunnel-mcp/src/mcp/tools/*.ts`
- Erros MCP: `chatfunnel-mcp/src/mcp/errors/mcp-tool-error.ts`

---

## 12. Achados de producao (2026-04-30) — captura ao vivo do MCP

> Esta secao documenta **shapes reais** observados via captura direta do MCP, em 3 contas diferentes (STARTER vazia, conta intermediaria com automacoes, e conta com WhatsApp ativo + cards + templates). Algumas shapes da secao 6 desta pagina foram derivadas de leitura estatica do codigo e **divergem da realidade** — esta secao tem precedencia onde houver conflito. Corpus completo em `scripts/mcp-prompts-playbook.md` (gitignored, contem PII).
>
> **Fixtures synthetic prontas pra usar em components/tests:** [[intelligence-a2a-fixtures]] tem JSON redigidos (PII zerada, estrutura preservada com bugs) pra cada tool documentada aqui.

### 12.1 Tabela de envelopes — 8 padroes diferentes catalogados

Diferente do esperado, **cada tool MCP tem seu proprio envelope**. Frontend precisa adapter por tool:

| Tool | Envelope |
|---|---|
| `list_automations` | `{ automations: [], quantity: N }` |
| `get_automation` | array puro `[]` |
| `get_draft` | array puro `[]` |
| `list_templates` | `{ data: [], status: true }` |
| `get_template` | `{ status: true, data: {...} }` (data eh **objeto**, nao array) |
| `get_template_status` | flat (sem wrap) |
| `get_template_buttons` (success) | array puro `[]` |
| `get_template_buttons` (error) | `{ error: { code, type, message } }` |
| `get_channels` | array puro `[]` |
| `get_kanbans` | array puro `[]` |
| `list_kanban_cards` (sem `columnId`) | `{ kanban: {...} }` (cards ausentes em columns[]) |
| `list_kanban_cards` (com `columnId`) | `{ kanban: {...}, kanbans: [] }` (cards populados, meta duplicada) |
| `search_contacts` | `{ contacts: [], quantity: N, topRanking: [] }` ⚠️ vaza top 3 da conta inteira |
| `get_contact` | flat (sem wrap) |

**Implicacao pra store:** nao da pra ter um wrapper `unwrap(response)` generico. Cada handler/composable tem que conhecer o envelope da sua tool. Candidato a issue de padronizacao no MCP.

### 12.2 Discriminators e enums descobertos (com valores observados em prod)

| Campo | Valores vistos | Faltam capturar |
|---|---|---|
| `channel.allocatedType` | `WHATSAPP`, `INSTAGRAM`, `null` (canal orfao) | — |
| `template.status` | `APPROVED`, `PENDING` | `REJECTED`, `PAUSED`, `DISABLED` |
| `template.category` | `MARKETING` | `UTILITY`, `AUTHENTICATION` |
| `template.parameter_format` | `POSITIONAL` | `NAMED` (se existir) |
| `template.components[].type` | `HEADER`, `BODY`, `FOOTER`, `BUTTONS` | — (cobertura completa) |
| `template.components[type=HEADER].format` | `TEXT` | `IMAGE`, `VIDEO`, `DOCUMENT`, `LOCATION` |
| `template.components[type=BUTTONS].buttons[].type` | `URL`, `QUICK_REPLY` | `PHONE_NUMBER`, `COPY_CODE`, `OTP` |
| `template.parameters[].componentType` | `BODY` | `HEADER`, `BUTTONS` |
| `template.parameters[].componentFormat` | `TEXT` | `IMAGE`, `VIDEO`, `DOCUMENT`, `LOCATION` |
| `kanban.column.isDone` | `false` (Inicio), `true` (Concluido) | — |
| `card.statusOportunity` | `OPEN` | `WON`, `LOST` |
| `card.priority` | `LOW` | `MEDIUM`, `HIGH` |
| `contact.fromPlatform` | `WHATSAPP` | `INSTAGRAM`, `FACEBOOK` |
| `step.stepType` (em `get_automation`) | `ACTIONS` (com `actionType: ASSISTANT` ou `ADD_TAG`), `INSTAGRAM_ACTIONS`, `WHATSAPP_ACTIONS`, `FOLLOW_UP`, `DELAY`, `CONDITIONS` (plural!), `AB_TEST`, `KANBAN_ACTIONS`, `CHAT_ACTIONS`, `RUN_AUTOMATION` (capturados via builder 2026-05-04) | — (cobertura praticamente completa; ver 13.4 sobre bug `runAutomationId: null`) |
| `mcp_error.code` | `VALIDATION_ERROR`, `INTERNAL_ERROR` (capturado 2026-05-04 via bug `create_kanban_card`) | `NOT_FOUND`, `CONFLICT`, `FORBIDDEN`, `RATE_LIMIT`, `EXTERNAL_API_ERROR` |
| `mcp_error.type` | `domain`, `internal` (capturado 2026-05-04) | `external_api`, `rate_limit` |
| `card.priority` | `LOW`, `MEDIUM`, `HIGH` (todos enviados como input de `create_kanban_card` — bug bloqueou retorno mas schema confirmado) | — (cobertura completa do enum) |

> Discriminators ainda sem cobertura em corpus = TODO pra session futura criar fixtures que forcem esses estados (criar template REJECTED, mover card pra WON/LOST, etc.)

### 12.3 Padrao de divergencia list-vs-get

Cada par `list_<entity>` / `get_<entity>` tem shape **diferente** com regras consistentes:

| Padrao | Em `list_*` | Em `get_*` |
|---|---|---|
| **Campo de sync** | `wasSynced`, `pending`, `*Count` (denormalizados) | omitidos |
| **Relacoes** | apenas FK ID (`folderId`, `kanbanId`) | embedding completo OU FK + array denormalizado |
| **Joins extras** | nao | sim — `parameters[]`, `buttons[]` denormalizados, etc. |
| **Score interno** | `quantity`, `rating` (em `search_contacts`) | omitido |
| **Casos especiais** | `firstStepId` em `list_automations` | `firstStep` em `get_draft` (rename!) |

**Exemplos concretos** (alem dos ja documentados em secao 6):

#### `list_templates[i]` vs `get_template`
- `list_templates[i]` tem `wasSynced: bool` que **nao existe** em `get_template`
- `get_template` adiciona `parameters[]`, `buttons[]` (denormalizado, sem `text`), `assistantId` (opcional) que **nao existem** em `list_templates[i]`

#### `search_contacts.contacts[i]` vs `get_contact`
- `search` tem `tags: string[]` → `get` tem `TagsContacts: []` (PascalCase, shape diferente, ver gotchas)
- `search` tem `folder: string` (nome) → `get` tem `folderId: UUID|null`
- `search` tem `quantity` e `rating` (score interno) que `get` **nao tem**
- `get` adiciona ~20 campos extras: Instagram (`instagramUsername`, `instagramFollowerCount`, `instagramFollowBusinnes` [sic — typo], `instagramFollow`, `instagramIsVerified`, `instagramId`), WhatsApp (`wppUserId`, `wppUsername`, `wppCountryCode`, `wppLastUpdate`), UTMs (`utmSource/Medium/Campaign/Term/Content`), Schedule (`lastScheduleLink`, `lastScheduleDate`), Sync (`wppLastUpdate`, `igLastUpdate`, `lastUpdate`), Estado (`hasEdited`, `isActive`, `fromPlatform`), `userId`, `accountId`, `firstName`/`lastName` (split do `name`)

#### `get_automation` vs `get_draft` (mesma entidade, snapshots diferentes)
- Campo root **renomeado**: `firstStepId` → `firstStep`
- `Trigger.id` eh **DIFERENTE** entre os dois (entidades separadas no banco)
- `Step.id` eh **IGUAL** (compartilhado)
- Missing fields no draft: `storyMentionActivateMode`, `adsId` (trigger); `overrideAssistantStartCommand`, `kanbanStatusOportunity`, `kanbanLossReasonId`, `stepChatActionType`, `moderatorId`, `moderator` (step); `type`, `shared`, `isActive` (root, mas inconsistente)

### 12.4 Bugs em prod confirmados via captura

| Bug | Tool | Severidade | Detalhes |
|---|---|---|---|
| **TYPO `instagramFollowBusinnes`** (sem segundo `s`) | `get_contact` | INFO (divida) | Renomear precisa migration coordenada Prisma + MCP + front. Ver `frontend-gotchas.md` |
| **PascalCase `TagsContacts`** vazando nome de tabela | `get_contact` | INFO (api leak) | Junction table Prisma exposta. Ver `2026-04-30-mcp-data-leak-audit.md` 4.9 |
| **Shape condicional baseado em `columnId`** | `list_kanban_cards` | gotcha | Sem filtro = sem cards. Com filtro = cards + `kanbans[]` extra. Ver `frontend-gotchas.md` |
| **`buttons[]` denormalizado sem `text`** | `get_template` | gotcha | Frontend precisa join entre `components[type=BUTTONS].buttons[]` e `buttons[]` root |
| **`delayLimitStartHour/EndHour` populados com `hasDelayLimit: false`** | `get_automation` step | dado orfao | Ignorar valores quando flag eh false |
| **Sync com Meta nao automatico** | templates | gotcha | UI edit em template nao reflete no MCP ate `sync_templates` ser chamada |
| **`topRanking[]` vaza top 3 da conta independentemente da query** | `search_contacts` | CRITICA (security) | Mapeamento progressivo da base de contatos. Ver audit 4.7 |
| **PII em `wppNumber`/`wppName`/`igName`** | `get_channels` | ALTA (security) | Telefones em plaintext sem mascaramento. Ver audit 4.6 |
| **Telefone embedado em `moderator.user.name`** | `list_kanban_cards` | MEDIA (security) | String `"VUKODE +55 (45) 99813-5374"`. Ver audit 4.8 |
| **Null-deref `.emit()` pos-commit** (capturado 2026-05-04) | `create_kanban_card` | ALTA (data integrity) | Pipeline validate → persist → notify; emit roda fora de contexto socket e quebra. Cards podem ficar orfaos no banco com erro 500 retornando ao client. Ver audit 4.11 |
| **Divergencia de contadores aninhados** (capturado 2026-05-04) | `list_automations` | gotcha | `_count.executions: 26` (root) vs `triggers[0]._count.executions: 1` em `077ccbb1-...`. Cache stale ou semantica diferente entre os dois counters. |
| **Discrepancia entre tools sibling de rename** (capturado 2026-05-04) | `update_tag` vs `rename_automation` | gotcha | Mesma operacao logica, shapes opostos: `update_tag` retorna objeto echo full, `rename_automation` retorna string UUID pura. Wrappers TS unificadores quebram. |
| **Bug `runAutomationId: null` em RUN_AUTOMATION step** (capturado 2026-05-04) | `add_step_run_automation` + `build_automation` + `get_automation` | ALTA (data integrity) | Input do builder `automationId: <uuid>` aceito sem erro; read mostra `runAutomationId: null`. Possivel bug de persistencia ou nome de campo errado. **Verificar via Prisma schema + execucao real (rodar trigger e checar se RUN_AUTOMATION dispara)**. Add a `frontend-gotchas.md` se confirmado. |
| **Naming write/read divergente em AB_TEST** (capturado 2026-05-04) | `add_step_ab_test` vs `get_automation` | gotcha | Builder usa `variants[]`; read retorna `testCases[]`. Frontend que mostre "Variantes A/B" precisa mapear o termo. |
| **Tag nesting extra em ACTIONS step read** (capturado 2026-05-04) | `add_step_action` (ADD_TAG) vs `get_automation` | gotcha | Builder envia `tagIds: [<uuid>]` flat; read retorna `tags: [{tag: {id, name, ...}}]` com camada extra `.tag` por elemento. Provavel artefato `include: { tag: true }` Prisma exposto. |
| **Field discriminator naming inconsistente entre tools de write** (capturado 2026-05-04) | `update_contact_field` (`fieldId: UUID`) vs `add_step_condition` (`field: "ddd"` string) | gotcha | Mesmo conceito (custom/built-in field reference) usa `fieldId: UUID` em uma tool e `field: <name>` string em outra. Wrappers tipados precisam adapter por tool. |
| **`_mcpType` snake_case vs resto camelCase** (capturado 2026-05-04) | builder configs (`step_message`, `step_delay`, etc.) | gotcha | Discriminator interno do MCP em snake_case enquanto resto do shape eh camelCase. Underscore-prefix indica "campo meta". Some no read — so existe na config builder. |
| **Stats orfaos em get_automation** (capturado 2026-05-04) | `get_automation` em flow gerado por builder | gotcha | `storyMentionActivateMode: "ALWAYS"` populado em trigger MESSAGE (campo de outro tipo). `useRequest: false` populado em step ACTIONS ADD_TAG (campo de HTTP_REQUEST). `delayLimit*` populado mesmo com `hasDelayLimit: false` (ja documentado). **Pattern**: defaults sao injetados pra TODOS os campos do schema independentemente do `stepType`/`triggerType` real. UI deve filtrar por tipo. |
| **Order do array `steps[]` nao-deterministica** (re-confirmado 2026-05-04) | `get_automation` | gotcha | Apos `build_automation` com 9 steps em ordem clara (input), o read retorna na ordem CONDITIONS, AB_TEST, RUN_AUTOMATION, CHAT_ACTIONS, KANBAN_ACTIONS, FOLLOW_UP, ACTIONS, DELAY, WHATSAPP_ACTIONS — nao matches o input order. Frontend precisa reconstruir grafo via `firstStepId` + `nextStepId`/`stepsConditions[].nextStepConditionAcceptedId`/`testCases[].nextStepId`. |
| **Bug `flows[0].channelId: null` em MSG TEMPLATE** (capturado 2026-05-04 via Demo Reference Flow `a652d84a-...`) | `add_step_message` (TEMPLATE) + `get_automation` | ALTA (data integrity) | MSG TEXT/IMAGE persistem `channelId` em `flows[0].channelId`; MSG TEMPLATE persiste `null` apesar do step pai ter channelId. Possivel bug de wiring no handler de TEMPLATE flow. Frontend precisa **fallback pro `step.channelId`** quando `flows[0].channelId === null`. |
| **Triggers — campos de config nao persistem no read** (capturado 2026-05-04) | `create_trigger` (COMMENT/STORY) + `get_automation` | ALTA (UX rot) | `commentConfig.firstCommentOnly`/`autoReply` enviados via input nao retornam no read — apenas defaults. `storyConfig.choice`/`activateMode` mesmo problema. Cliente que faca read-modify-write **perde a configuracao original** apos save. Verificar via Prisma se sao runtime-only ou bug de persistencia. |
| **Trigger TEMPLATE — rename + prefixacao `whatsapp*` no read** (capturado 2026-05-04) | `create_trigger` (TEMPLATE) + `get_automation` | gotcha | Input usa `templateConfig.templateId` + `buttonId`; read mostra `whatsappTemplateId` + `whatsappTemplateButtonId` populados. Os campos `templateId`/`templateButtonId` no read voltam **null**. Frontend que faca round-trip precisa mapear ambos. |
| **Triggers Instagram nao armazenam `channelId`** (capturado 2026-05-04) | `create_trigger` (DIRECT/COMMENT/STORY/STORY_MENTION/LINK/LIVE) + `get_automation` | gotcha | Triggers Instagram retornam `channelId: null` mesmo apos persist. Apenas trigger MESSAGE WhatsApp persiste channelId. Provavel auto-resolucao no runtime ou account-level routing pra Instagram. UI que tenta exibir "trigger neste canal" precisa fallback. |
| **`useRequest: false` sempre orfao** (re-confirmado 2026-05-04) | step `ACTIONS` (incluindo HTTP_REQUEST) | gotcha | Campo orfao que nunca apareceu como `true` em nenhuma captura do corpus inteiro. Pode ser legacy ou flag UI-only. Filtrar/ignorar no frontend. |
| **`overrideAssistantStartCommand` flag de customizacao** (capturado 2026-05-04) | step ACTIONS ASSISTANT | feature confirmed | Quando `startCommand` eh customizado no input, read mostra `true`. Quando ausente, `false`. **Util pra UI mostrar "voce customizou esta saudacao"** em editor — nao eh bug. |
| **Bug `build_automation` silent-fail em `branchConnections` invalido** (capturado 2026-05-04) | `build_automation` | ALTA (data integrity) | Aceita `branchId` desconhecido (testado com magic strings `"answer"`/`"unanswer"` em FOLLOW_UP) sem retornar erro. Os fields nao sao setados, e os step indices referenciados ficam **orfaos** no banco (sem ninguem apontando pra eles). Cliente nao tem feedback de falha. Server-side deveria validar `branchId` contra UUIDs gerados pelos builders e rejeitar payload invalido. |
| **Gap MCP: FOLLOW_UP routing nao configuravel** (capturado 2026-05-04) | `add_step_follow_up` + `build_automation` | gotcha (gap MCP) | `add_step_follow_up` schema aceita apenas `duration`/`unit`/`channelId`. Read shape do step FOLLOW_UP tem `answerStepId` (rota se user responder) e `unanswerStepId` (rota se nao responder) — fields populaveis via UI mas **nao via MCP**. `build_automation.connectTo` so seta `nextStepId`. Resultado: FOLLOW_UP criado via MCP funciona como **delay puro** (sem branching condicional). Pra inactivity-followup real, configurar via UI ou usar `inactivityFollowup` do assistant em `lifecycleAutomations`. |
| **Gap MCP: galeria de medias nao exposta** (capturado 2026-05-04) | tools de leitura MCP | gotcha (gap MCP) | Endpoint REST `GET /api/medias?filter=image` (chatfunnel-api) retorna `{id, url, mimetype, name, createdAt, automations}[]` — galeria de midias uploadadas pelo user. **Nenhuma tool MCP equivalente** (`list_medias`/`get_gallery`/`get_uploaded_files` nao existem). Agente LLM construindo flow com MSG IMAGE/VIDEO/AUDIO **nao consegue descobrir `mediaUrl` real** sem input externo. `configure_template_params` aceita `mediaId` mas sem rota pra lista-los. Avaliar expor `list_medias(channelId?, filter: "image"\|"video"\|"audio", page?)` no MCP. Ver audit acao 23. |

### 12.5 Naming gotchas catalogados

- **Snake/camel hibrido em templates**: campos espelhados da Meta API ficam snake_case (`parameter_format`, `is_primary_device_delivery_only`, `body_text`) e campos nossos ficam camelCase (`wasSynced`, `internalId`, `needsConfiguration`) **no mesmo objeto**. Front precisa mapper.
- **`templateInternalId` vs `templateId`**: tools mais novas (`get_template_buttons`) usam UUID interno; tools antigas (`get_template`, `get_template_status`) usam Meta numeric ID. Frontend precisa lookup `internalId` antes de chamar `get_template_buttons`.
- **`buttonId` vs `id`**: mesma entidade, dois nomes — `get_template.buttons[].id` (UUID) vs `get_template_buttons[].buttonId` (mesma UUID, nome diferente).
- **`firstName/lastName` split** com `lastName: ""` (string vazia, nao null) quando nome tem 1 palavra so.
- **`flows[]` aninhado em step (mensagem)** ≠ **`flow[]` em list_automations** (tag de capacidade) — naming confuso, contextos diferentes.
- **`kanbans[]` no envelope** de `list_kanban_cards` quando filtra por columnId — meta duplicada do kanban sem `columns`. Provavel bug.
- **`firstStepId` (em `get_automation`/`list_automations`) vs `firstStep` (em `get_draft`)** — rename inexplicado entre snapshots da mesma entidade.

### 12.6 FKs e relacionamentos confirmados em runtime

- `card.contact.id === contact.id` (`get_contact`)
- `card.moderators[].user.id === contact.userId` (owner moderator do contato)
- `card.kanbanId === kanban.id`, `card.columnId === column.id`
- `template.buttons[].whatsappTemplateId === template.internalId`
- `column.kanbanId === kanban.id`
- `accountId` cascateia em todas as entidades top-level (`kanban.accountId`, `contact.accountId`, automation account via token)

### 12.7 Padroes de timestamp

- Sempre ISO 8601 UTC com `Z`: `"2026-04-28T14:19:33.545Z"` (com ms quando relevante)
- Em `get_contact`: ate 4 timestamps separados (`dateCreated`, `wppLastUpdate`, `igLastUpdate`, `lastUpdate`) — `lastUpdate` parece sempre atualizado, os outros so quando ha sync da plataforma especifica
- Em automations/draft: nao auditado em profundidade aqui

### 12.8 Gaps no corpus (TODO pra sessoes futuras)

- `template.status: REJECTED`, `PAUSED`, `DISABLED`
- `template.parameter_format: NAMED`
- `template.components[type=HEADER].format: IMAGE`, `VIDEO`, `DOCUMENT`, `LOCATION`
- `template.components[type=BUTTONS].buttons[].type: PHONE_NUMBER`, `COPY_CODE`, `OTP`
- `template.parameters[].componentType: HEADER`, `BUTTONS`
- Template com 2-3 QUICK_REPLY buttons (validar `index` 0/1/2)
- `card.statusOportunity: WON`, `LOST` (depende de fix do bug 4.11)
- ~~`card.priority: MEDIUM`, `HIGH`~~ — schema confirmado em 2026-05-04 via inputs do `create_kanban_card`; resposta nao capturada por causa do bug
- Card com `amount > 0`, multiplos moderators, tags populadas
- `contact.fromPlatform: INSTAGRAM`, `FACEBOOK`
- `contact` com `TagsContacts` populado, `customFields` populado, UTMs populados
- `step.stepType: MESSAGE`, `CONDITION`, `DELAY`, `AB_TEST`, `CHAT_ACTION`, `KANBAN`, `RUN_AUTOMATION` em `get_automation`
- `get_agents_v2` com agentes V2 reais populados (provavelmente disponivel na 3a conta — adiada)
- `mcp_error.code: NOT_FOUND`, `CONFLICT`, `FORBIDDEN`, `RATE_LIMIT`, `EXTERNAL_API_ERROR` (`INTERNAL_ERROR` capturado 2026-05-04)
- `mcp_error.type: external_api`, `rate_limit` (`internal` e `domain` ja capturados)

## 13. Achados de write-side (sessao 2026-05-04)

> Esta secao consolida shapes e gotchas das tools de **escrita** do MCP capturadas em 2026-05-04 (sections 2.1-2.7 do playbook). A secao 12 acima cobre tools de leitura. Corpus completo em `scripts/mcp-prompts-playbook.md`. Ver tambem `docs/security/2026-04-30-mcp-data-leak-audit.md` 4.1.b e 4.11 pros achados de seguranca/integridade.

### 13.1 Catalogo de envelopes em writes — 10 variantes diferentes

Tools de escrita retornam shapes **diferentes** sem padrao coerente. Cada uma exige adapter especifico:

| Variante | Shape | Tools que usam | Quando |
|---|---|---|---|
| **Objeto echo full** | `{id, name, accountId, folderId, ...}` | `create_tag`, `update_tag`, `delete_tag`, `create_tag_folder` | Mutation que cria/atualiza/deleta entidade simples 1-tabela |
| **String UUID pura** | `"<uuid>"` | `delete_tag_folder`, `rename_automation` | Mutation que so confirma "operacao OK em entidade Y" — sem dados extras |
| **Operacao resumo** | `{tagId, tagName}` | `add_contact_tag` | Mutation em juncao N-N que retorna 1-2 campos da relacao criada |
| **Vazio puro** | `{}` | `remove_contact_tag`, `toggle_automation` | Mutation que so flipa flag/desfaz juncao — sem confirmacao de novo estado |
| **Row de juncao** | `{id, value, customFieldId, contactId}` | `update_contact_field` | Upsert em tabela de juncao que retorna PK da row |
| **Confirmacao com mensagem** | `{success: true, message: string}` | `sync_templates` | Operacao opaca que sincroniza estado externo (Meta) — sem count/lista do que mudou. Mensagem em ingles. |
| **Confirmacao com 2 booleans** | `{configured: true, status: true}` | `configure_template_params` | Mutation em config local de template — `status` redundante com `configured`, provavel wrapping de framework |
| **Builder config wrapper** | `{step: {...}}` ou `{trigger: {...}}` (com `_mcpType` discriminator) | `create_trigger`, `add_step_message/delay/condition/action/kanban/ab_test/follow_up/run_automation/chat_action` | **Stateless** — gera config JSON sem persistir. Pra usar em `build_automation`. `_mcpType: "step_<tipo>"` injetado em snake_case. |
| **Build com stats** | `{success, automationId, stepCount, triggerCount, triggerTypes[], message}` | `build_automation` | Unica write com stats operacionais — UI pode mostrar resumo sem refetch. Mensagem em ingles. |
| **String texto natural-language** | `"Successfully deleted 1 automation(s)."` | `delete_automations` | Bulk delete com pluralizacao `(s)` templated. Sem confirmacao por ID, sem distincao entre 1 vs N. Mensagem em ingles. |

**Anti-pattern observado**: tools conceptualmente equivalentes retornam shapes **opostos** sem regra clara:
- `update_tag` (rename de tag) → objeto echo full
- `rename_automation` (rename de automation) → string UUID pura
- `delete_tag` → objeto echo (estado pre-delete)
- `delete_tag_folder` → string UUID pura
- `sync_templates` → `{success, message}` (em ingles)
- `configure_template_params` (mesma familia) → `{configured, status}` (sem mensagem) — **fragmentacao intra-familia templates**

**Implicacao pra store/wrappers**: nao da pra ter um helper `unwrap()` ou um `MutationResponse<T>` generico. Cada composable tem que conhecer o shape de retorno da sua tool. Candidato a issue de padronizacao (`{ success: true, data: T | null }` uniforme seria ideal).

**Localizacao inconsistente**: `sync_templates` retorna mensagem em **ingles** (`"Templates synchronized successfully"`); errors com `type: "domain"` retornam mensagens em **PT-BR** (`"Telefone inválido"`). Sem padrao i18n — UI que reverbere essas mensagens precisa interceptar e traduzir caso a caso.

### 13.2 Padrao "read enriquece, write retorna minimal"

Confirmado em 2 pares cuidadosamente comparados:

| Tool | Read (`list_*`/`get_*`) | Write (`create_*`/`update_*`) |
|---|---|---|
| Tags | `get_tags[i]`: `{id, name, accountId, folderId}` (sem timestamps) | `create_tag` retorna identico — neste caso, parity por ser shape minimo desde a leitura |
| Tag Folders | `list_tag_folders[i]`: `{id, name, accountId, _count: { tags: N }}` | `create_tag_folder` retorna `{id, name, accountId}` — **`_count` ausente**. Cliente que mostre "0 tags" precisa colocar zero local; nao vem do servidor. |

**Implicacao**: UI logo apos um `create_*` precisa fazer **assume initial state** (counts zerados, arrays vazios, joins ausentes) ou refetch via list/get. Pattern conhecido de REST design (POST cria, GET retorna detalhes), mas surpreendente em MCP onde a expectativa eh "uma chamada, todos os dados".

### 13.3 Schema gaps de tools write

Comparacao schema MCP vs entidade real revela campos que nao podem ser controlados via MCP:

| Tool | Campos do schema | Campos faltantes (existem na UI/banco) |
|---|---|---|
| `create_tag` | `name`, `folderId` (opcional) | **`color`** — UI permite escolher cor, MCP nao. Cor deve ser default ou controlada por outra rota. |
| `create_tag_folder` | `name` | `parentId` (sem hierarquia), cor, icone |
| `update_tag` | `tagId`, `name` | `folderId` — **nao da pra mover tag entre pastas via update**. Reordenacao requer outra rota. |
| `update_contact_field` | `contactId`, `fieldId`, `value: string` | **`null` nao e aceito**. Pra "limpar" valor, precisa string vazia (nao testado). Tipo eh sempre string mesmo pra fields de data/URL. |
| `toggle_automation` | `automationId` apenas | **Sem `isActive: boolean`**. Toggle eh apenas flip — pra **garantir** ativacao, precisa `list_automations` antes pra checar estado. Nao tem `setActive` explicito. |

### 13.4 Bug `create_kanban_card` — dependencia em chain de 4 tools bloqueada

Capturado em 2026-05-04 com 3 tentativas reproduziveis. Detalhes completos em `docs/security/2026-04-30-mcp-data-leak-audit.md` 4.11.

**TL;DR:** null-deref em `.emit()` pos-commit no banco. Chain bloqueado:

```
create_kanban_card ❌ broken
        ↓ (depende)
   move_kanban_card ⏸️ nao testavel sem cardId
        ↓
   win_kanban_card ⏸️
   lose_kanban_card ⏸️
   assign_card_moderator ⏸️ (gotcha extra: moderator owner tem `id: null`, precisa testar com `moderatorId = userId`)
```

**Acao pra unblock**: hotfix `socket?.emit?.()` (defensivo), ou mover notify pra fora da transacao sincrona (fila/job).

### 13.5 Confirmacao do leak 4.1 em conta de PRODUCAO (3a conta)

Re-rodada de `get_moderators` na conta `c1c4324a-...` confirmou **identicamente** o leak da audit 4.1, com agravantes:

- **Chaves OpenAI Project (`sk-proj-...`) e ElevenLabs (`sk_af7c...`) REAIS expostas** — diferente da conta antiga onde `elevenlabsKey` era `null`.
- **Duplicacao `user` em root + `account.user`** na resposta — dobra superficie de leak (mesmos secrets em 2 paths). Originado provavelmente da combinacao `findById(accountId, { user: true })` + injecao do owner no handler.
- **10 campos extras de billing/subscription** expostos (`plan`, `planLeads`, `subscriptionStatus`, `nextDatePayment`, `additionalUsersQuantity`, `cancelationsOffer*`) — descrevem perfil financeiro do cliente.

Ver `docs/security/2026-04-30-mcp-data-leak-audit.md` 4.1.b pra plano de remediacao + acoes imediatas (rotacionar keys, reset senha owner, anular FB token).

### 13.6 Idempotencia e estado observado em writes

| Tool | Idempotencia testada? | Comportamento | Gap |
|---|---|---|---|
| `create_tag` | nao | — | criar tag com mesmo name 2x — gera duplicata ou unique constraint? |
| `delete_tag` | nao | — | deletar tag ja deletada — erro 404 ou silent? |
| `add_contact_tag` | nao | — | adicionar mesma tag 2x ao mesmo contato — gera juncao duplicata? |
| `remove_contact_tag` | nao | — | remover tag que nao estava no contato — erro ou `{}` igual? |
| `update_contact_field` | nao | — | rodar 2x com mesmo `(contactId, fieldId, value)` — retorna mesmo `id` (UPDATE upsert) ou novo (INSERT)? |
| `toggle_automation` | **sim** ✅ | 2x toggle = estado original (flip simétrico). Race condition possivel em concorrencia. |
| `rename_automation` | **sim** ✅ | aceita rename com mesmo nome (no-op observado, sem erro). |

### 13.7 Achados em `list_automations` (cross-validacao 2026-05-04)

Re-rodada da tool em 3a conta com 5 flows revelou:

- **Discrepancia de contadores aninhados** ⚠️ — `077ccbb1-...` tem `_count.executions: 26` (root) vs `triggers[0]._count.executions: 1`. Diferenca de 25x. Possiveis causas:
  1. Cache stale do trigger counter (banco diz 26, materialized view do trigger nao atualizou)
  2. Bug de incremento (evento de execucao nao incrementa o trigger counter em todos os paths)
  3. Semantica diferente (contador root inclui re-tries; trigger conta apenas matches da regra original)
  - **Verificar no banco**: `SELECT COUNT(*) FROM automation_executions WHERE automation_id = '077ccbb1-...'` vs `automations._count.executions`.
- **4/5 flows com `flow: []` vazio** mas `triggers` configurado — automacoes "quebradas/em construcao" ou pattern de produto. Confirmar com user/codigo:
  - Trigger sem step eh estado **valido** (UI permite salvar)?
  - Ou eh bug que apaga steps em alguma operacao?
- **Naming patterns**: todos os 5 flows na 3a conta usam `Flow DD-MM-AAAA HH:MM` auto-gerado. Apenas 1 flow renomeado pelo user nas 3 contas auditadas — sugere que **renomeacao eh feature pouco usada** (gap UX? renomear nao esta na UI primaria? user nao se importa?).

### 13.8 Gaps no corpus write-side (TODO pra sessoes futuras)

**Capturados 2026-05-04 (foram fechados):**
- ~~`delete_automations`~~ — fechado via `_teste_intelligence_flow` (10ª variante de envelope: string texto puro com `(s)` templated)
- ~~Section 2.8 builder steps~~ — 11 calls capturados (10 step builders + `build_automation`); todos os 9 stepTypes faltantes de section 12.2 fechados
- ~~Section 2.5 partial — `sync_templates` + `configure_template_params`~~ — capturados (6ª e 7ª variantes)

**Pendentes:**
- **Section 2.5 Meta-side restantes**: `create_template`, `update_template`, `delete_templates` — risco fila Meta + cleanup manual no Business Manager
- **Bug `runAutomationId: null`** confirmar via Prisma schema + execucao real
- **Idempotencia de tags** (CRUD duplicado, delete duplicado, add/remove juncoes)
- **Cascade de `delete_tag_folder`** com tags dentro (cascade documentado mas nao testado — folder estava vazia)
- **`delete_tag` em tag ainda atribuida** a contato (cascade ou erro?)
- **`update_contact_field` com string vazia** (limpa valor ou bug?)
- **`update_contact_field` upsert vs insert** (rodar 2x com mesmo trio — mesmo `id` ou novo?)
- **`create_kanban_card` apos hotfix** + `move/win/lose/assign` chain inteira
- **`assign_card_moderator` com moderator owner** (`id: null`, `userId` populado — testar com `moderatorId = userId`)
- **`delete_automations` bulk com mix valido + invalido** (atomic ou partial?)
- **`configure_template_params` com `parameters: []`** (apaga todos os mappings? destructive disfarcado?)
- **Step coverage faltantes** (gaps menores depois de 2026-05-04):
  - `add_step_message` types `IMAGE`/`VIDEO`/`AUDIO`/`INPUT`/`TEMPLATE` (so TEXT capturado)
  - `add_step_message` na plataforma INSTAGRAM (gerar `INSTAGRAM_ACTIONS` via builder pra confirmar pattern de platform-namespacing)
  - `add_step_delay` types `DATE_HOUR`/`WAIT_UNTIL`
  - `add_step_action` types `REMOVE_TAG`/`HTTP_REQUEST`/`ASSISTANT`/`DEFINE_OPTIN`/`REMOVE_OPTIN`
  - `add_step_kanban` types `MOVE_CARD`/`CHANGE_MODERATOR`/`WIN_CARD`/`LOSE_CARD`
  - `add_step_chat_action` `REMOVE_MODERATOR`
  - `create_trigger` types alem de MESSAGE (16 outros — DIRECT, COMMENT, STORY, ADS, TEMPLATE, TAG_ADDED, TAG_REMOVED, NEW_CONTACT, KANBAN_*)
  - `create_trigger` `match` operators alem de EXACTLY (CONTAINS, STARTS_WITH, REGEX, ANY, FULL_KEYWORD, DONT_CONTAINS, REACTION)
  - `add_step_condition` operators alem de EQUALS (NOT_EQUALS, CONTAINS, NOT_CONTAINS, STARTS_WITH, EXISTS, DOES_NOT_EXIST, GREATER, LESS, TRUE, FALSE, DDD, DDI, DDD_IS_NOT, DDI_IS_NOT)
  - `build_automation` com `triggers[]` array (multi-trigger, ex: 2 template buttons cada com proprio startStepIndex)
- ~~**Workflows compostos**~~ ✅ fechado em sessao 2026-05-04 (rodada 2) — ver section 13.9 abaixo

---

## 13.9 Sessao 2026-05-04 (rodada 2) — fechamentos e novos achados

> **Cobertura final pos-rodada 2: ~95% do playbook executado.** Gaps remanescentes sao state-specific (Meta-side, agentes V2 reais) ou intentional (Demo Reference v2 persistido).

### 13.9.1 Stress test idempotencia + NOT_FOUND map

**6 variantes de NOT_FOUND capturadas** (confirma `mcp_error.type` enum: `domain` | `internal`):

| Tool | Cenario | Code | Type | Idioma da mensagem |
|---|---|---|---|---|
| `get_template` | UUID Meta fake | `NOT_FOUND` | `domain` | EN ("Template not found") |
| `get_automation` | UUID fake | `NOT_FOUND` | `domain` | **i18n key raw** 🐛 (`"errors.Automation.ErrorOnGetAutomations"` — bug audit 4.12) |
| `get_contact` | UUID fake | `NOT_FOUND` | `domain` | PT-BR ("Contato não encontrado!") |
| `remove_contact_tag` | tag nao atribuida | `NOT_FOUND` | `domain` | EN |
| `add_contact_tag` | tagId deletado | `NOT_FOUND` | `domain` | EN |
| `delete_tag` | tag ja deletada | `INTERNAL_ERROR` | `internal` | **stack Prisma** 🔴 (audit 4.13) |

**3 idiomas misturados em error messages.** Frontend deve usar `error.code` como discriminator estavel (nao `error.message`).

**8 cenarios de idempotencia** capturados — destaques:

- **`add_contact_tag` duplicado**: idempotente silent (mesmo shape `{tagId, tagName}`, sem error, sem duplicate junction). UPSERT ou filter-before-insert.
- **`update_contact_field` tem 3 comportamentos no mesmo shape de input**:
  - 1ª chamada (INSERT, row nao existia) → retorna row de juncao `{id, value, customFieldId, contactId}`
  - 2ª+ chamadas com mesmo trio (UPDATE in-place) → retorna `{}` vazio
  - `value: ""` → **DELETA o registro da junction** (nao limpa, apaga relacao)
  - Cliente nao distingue do response qual operacao aconteceu — **section 13.1 envelope catalog atualizado: variante 5 quebra em 5a (INSERT) + 5b (UPDATE/DELETE)**
- **`delete_tag` em tag atribuida a contato**: cascade silent (junction `TagsContacts` CASCADE ON DELETE). UI nao recebe sinal.
- **`delete_tag_folder` com tag dentro**: tag movida pra root (`folderId: null`), confirmando docstring "Tags inside are moved to root".
- **`create_tag` duplicado** mesma name: `VALIDATION_ERROR/domain/"Tag already exists"` — unique constraint via VALIDATION_ERROR (nao `CONFLICT` code).

### 13.9.2 INSTAGRAM_ACTIONS — fecha gap de section 12.2

Flow `1635f0fa-...` `_teste_ig_intelligence_flow` (criado/lido/deletado dentro da sessao):

- Builder `add_step_message` com `platform: "INSTAGRAM"` materializa `stepType: "INSTAGRAM_ACTIONS"` no read.
- **Pattern simetrico confirmado**: WhatsApp = `WHATSAPP_ACTIONS`, Instagram = `INSTAGRAM_ACTIONS`. Frontend que renderiza step de mensagem precisa case nos 2 valores.
- **`flows[0].channelId` populado** em INSTAGRAM_ACTIONS (`3dd012f1-...`) — diferente do bug WhatsApp MSG TEMPLATE onde `flows[0].channelId` vinha null. **Bug eh especifico de TEMPLATE flowType, nao de Instagram.**
- **🔄 Contradicao com achado de section 13** ⚠️: trigger DIRECT IG **armazena `channelId`** quando passado explicito no input. Achado anterior "Triggers Instagram nao armazenam channelId" estava errado — comportamento real eh "armazena se vier no input; null se omitido".

### 13.9.3 Section 2.6 CRM write — silent-fail false-negative em 5/5 tools

**🔴 Bug `.emit()` sistemico** (audit 4.11 elevado a CRITICA, escopo expandido):

| Tool | Erro retornado | Mutacao persistiu? |
|---|---|---|
| `create_kanban_card` | `INTERNAL_ERROR/Cannot read properties of undefined (reading 'emit')` | ✅ SIM |
| `move_kanban_card` | mesmo erro | ✅ SIM (`columnId` mudou) |
| `win_kanban_card` | mesmo erro | ✅ SIM (`statusOportunity: WON`) |
| `lose_kanban_card` | mesmo erro | ✅ SIM (`statusOportunity: LOST`) |
| `assign_card_moderator` | mesmo erro | ✅ SIM (`moderators[]` populado) |

Pipeline: `validate → DB commit → emit (BREAK) → throw`. **Silent-fail false-negative**: client recebe erro, banco persiste.

**Achados de seguranca/comportamento**:
- ✅ **Enum `statusOportunity` completo**: OPEN (default), WON, LOST.
- ✅ **Enum `priority` completo**: LOW, MEDIUM, HIGH (LOW capturado em workflow C).
- ✅ **`hasActivity: true` 1ª vez** capturado em workflow C — populado server-side baseado em estado real do contato (count de conversas previas), nao default.
- 🎯 **Gotcha resolvido**: `assign_card_moderator` aceita `userId` quando moderator owner tem `id: null`. Frontend precisa fallback `moderator.id ?? moderator.userId`.
- 🔴 **PII leak novo (audit 4.8 escopo expandido)**: `assign_card_moderator` read tem `moderators[].user.name` com phone embedado. Ja era vista em `list_kanban_cards` e `add_step_chat_action`. **3 endpoints** com mesmo PII shape.
- 🐛 **`list_kanban_cards` shape inconsistente com vs sem `columnId`**:
  - sem filtro: `{kanban: {metadata, columns: [sem cards]}}`
  - com filtro: `{kanban: {columns: [{...col, cards: [...]}]}, kanbans: [...]}` (envelope ganha campo `kanbans[]` extra)
  - Frontend que faz read-all precisa iterar colunas + chamar 1x por coluna.
- ⚠️ **`description` no input do `create_kanban_card` nao aparece no shape do card lido** — possivel persistencia em tabela separada (notes/comments) nao exposta no MCP. Gap.

### 13.9.4 Workflows compostos (section 3 do playbook)

**4/4 capturados.** Handoff catalog completo:

**Workflow A (search → get_contact):**
- `search_contacts.contacts[].id` ≡ `get_contact(id).id` (sem rename, mesmo UUID).
- Shape diff: search retorna **10 campos** com `quantity` + `rating` (metricas calculadas que get_contact NAO tem); get retorna **35+ campos** full.

**Workflow B (build automation):**
- Catalogo de handoffs entre tools de builder formalizado:
  - `get_channels.[].id` → `create_trigger.channelId` + `add_step_message.channelId`
  - `create_tag.id` → `add_step_action.tagIds[]`
  - `get_kanbans.[].id` + `.columns[].id` → `add_step_kanban.{kanbanId, columnId}`
  - `create_trigger` resultado (envelope `{trigger}`) → `build_automation.trigger` direto
  - Cada `add_step_*` resultado (envelope `{step}`) → `build_automation.steps[].step` direto
  - **Client-side UUIDs**: `branchIds[]` + `variantIds[]` viajam direto pra `build_automation.steps[].branchConnections[].branchId` sem roundtrip.

**Workflow C (search → get_kanbans → create_kanban_card):**
- Silent-fail confirmado em sequencia composta. Card persiste, error retorna.

**Workflow D (list_templates → status → buttons):**
- 🐛 **Inconsistencia intra-familia critica** ⚠️:
  - `get_template_status.templateId` espera **Meta numeric string** (`"1559135439076768"`)
  - `get_template_buttons.templateInternalId` espera **internal UUID** (`"02c03855-..."`)
  - Mesmo template, 2 ids diferentes em params sibling.
- 🐛 **`get_template_buttons` naming engana** — nao eh "get all buttons", eh "get QUICK_REPLY buttons for trigger matching". Templates URL/PHONE_NUMBER/COPY_CODE/OTP **silently filtrados** ou (se zero QUICK_REPLY) error explicito.
- ✅ **Mensagem de erro educacional**: padrao DX bom pra replicar (explica POR QUE falhou + sugere o que funciona).

### 13.9.5 Bonus: Shapes/enums fechados nesta sessao (section 12.8 atualizado)

| Gap | Status pos-2026-05-04 (rodada 2) |
|---|---|
| `INSTAGRAM_ACTIONS` shape | ✅ Capturado (13.9.2) |
| Card `statusOportunity` WON/LOST | ✅ Capturado (13.9.3) |
| Card `priority` LOW/MEDIUM/HIGH | ✅ Capturado (13.9.3) |
| Contact `fromPlatform: INSTAGRAM` | ✅ Capturado (workflow A + stress test) |
| Contact `instagramFollowBusinnes: true` + `instagramFollow: true` 1ª vez | ✅ Capturado (workflow A — primeiro caso `true`) |
| `mcp_error.code` NOT_FOUND (6 variantes) + VALIDATION_ERROR + INTERNAL_ERROR | ✅ Capturado (13.9.1) |
| `mcp_error.type` discriminator (domain + internal) | ✅ Capturado (13.9.1) |
| Card `hasActivity: true` 1ª vez | ✅ Capturado (workflow C) |
| Bug `delete_tag` Prisma stack leak | ✅ Capturado (audit 4.13) |
| Bug `get_automation` i18n key leak | ✅ Capturado (audit 4.12) |
| Bug `update_contact_field` 3 comportamentos / value="" deleta | ✅ Capturado (audit acoes 29-30) |
| `create_template` envelope `{success, id}` (8ª variante) | ✅ Capturado (rodada 2 templates) |
| `update_template` envelope (compartilhado com create) + 4 bugs | ✅ Capturado (audit acoes 35-38) |
| `delete_templates` envelope `{deleted: true}` (9ª variante) | ✅ Capturado (cleanup instant, nao scheduled) |
| `configure_template_params` em REJECTED + `parameters: []` defensivo | ✅ Capturado (rebate hipotese de wipe destrutivo — so reseta `internalParameter`) |
| Template `category: UTILITY` + `status: REJECTED` + `previous_category` campo novo | ✅ Capturado |
| `needsConfiguration` flag dinamica (true sem mapping, false apos config) | ✅ Capturado |
| Bugs audit 32-38 (templates): needsConfiguration divergente, rejectedReason null, buttons outer vs inner, update partial deleta, category default MARKETING, divergencia interna, REJECTED nao re-enfileira | ✅ Capturado |
| Conflito naming `status` boolean (envelope) vs `status` string (template state) em `list_templates` | ✅ Capturado |

**Gaps que sobram (state-specific, fora desta sessao):**
- Template `status` REJECTED/PAUSED/DISABLED (Meta-side)
- Template `parameter_format: NAMED` (Meta-side, requer template novo)
- HEADER `format` IMAGE/VIDEO/DOCUMENT/LOCATION (Meta-side)
- Button types PHONE_NUMBER/COPY_CODE/OTP (Meta-side)
- Contact `fromPlatform: FACEBOOK` (state-specific)
- `mcp_error.code` CONFLICT/FORBIDDEN/RATE_LIMIT/EXTERNAL_API_ERROR (state-specific)
- Trigger types ADS/ADS_WHATSAPP (requer `adsId` real do Meta Ads)
- `get_agents_v2` shape populado (state-specific)
- `add_step_message` types IMAGE/VIDEO/AUDIO/INPUT/TEMPLATE (precisa media URLs reais — gap MCP de galeria, audit acao 23)
