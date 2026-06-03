# Intelligence A2A — Contratos (v2)

Source of truth: `chatfunnel-contracts/src/` (branch `feature/intelligence-resource-events`).

Esta wiki documenta o **protocolo A2A v2** consumido pelo `chatfunnel-front` em
`src/views/intelligenceV2/`. O v1 (blocos `tool_use`/`tool_result` aninhados,
eventos `block_start/delta/stop`) **nao existe mais** — toda mensagem de resource
agora viaja como um envelope tipado em evento SSE dedicado.

Documentos relacionados:
- [[intelligence-v2-arquitetura]] — visao geral
- [[intelligence-a2a]] — escopo do modulo A2A
- [[intelligence-a2a-shapes]] — shapes detalhados por kind
- [[intelligence-a2a-cobertura]] — matriz de cobertura por tool

---

## 1. Versionamento

```typescript
import {
  A2A_PROTOCOL_VERSION,        // = 2
  A2A_PROTOCOL_VERSION_HEADER  // = "X-A2A-Protocol-Version"
} from '@chatfunnel/contracts/a2a'
```

- Header enviado em request **e** response. Mismatch → HTTP 400 no server,
  banner / fail-fast no front.
- Bumpar `A2A_PROTOCOL_VERSION` quando: vocabulario SSE muda, shape de
  `ResourceEnvelope` muda, ou shape de `PersistedBlock` muda.
- `RESOURCE_SCHEMA_VERSION[kind]` e independente: bumpa quando o shape de
  `data` de **um** kind muda incompativelmente. Permite o front detectar
  renderer stale sem invalidar a sessao toda.

---

## 2. ResourceEnvelope

A entidade canonica do dominio surfaceada ao front. Indexada server-side num
`ResourceStore` Redis (key `(accountId, conversationId)`) e replicada no front
pelo store em `src/views/intelligenceV2/stores/resource-store.ts`.

```typescript
interface ResourceEnvelope<K extends ResourceKind = ResourceKind> {
  envelopeId: string      // = `${kind}:${id}` — re-emissoes deduplificam
  kind: K
  id: string              // id canonico da entidade
  data: unknown           // payload projetado pelo `extract` da tool
  producedBy: {
    toolName: string
    toolCallId: string
    agent: string         // "orchestrator" | "flowAgent" | ...
  }
  source: 'fresh' | 'replay'
  fetchedAt: number       // unix ms — replays preservam o original
  schemaVersion: number   // = RESOURCE_SCHEMA_VERSION[kind]
}

// helper publico
makeEnvelopeId(kind, id): string  // `${kind}:${id}`
```

### ResourceKind (16 valores)

```
contact, contact_messages
automation, automation_draft
template, template_status, template_buttons
kanban_card, kanban_board
tag, tag_folder
custom_field, moderator, assistant, agent_v2, media, channel
```

Todos com `schemaVersion = 1` no estado atual.

---

## 3. PersistedBlock — corpo de mensagem persistida

Shape **persistido** em `a2a_messages.content` (JSON) e no cache Redis da
sessao. NAO e o que viaja pelo SSE durante stream — e a projecao normalizada
salva ao final, replayavel verbatim no reload de historico.

```typescript
type PersistedBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_invocation'
      id: string; name: string
      args: Record<string, unknown>
      agent: string }
  | { type: 'resource_ref'
      envelopeId: string
      kind: ResourceKind
      id: string
      toolCallId: string }
  | { type: 'tool_status'
      id: string; name: string
      status: 'ok' | 'error'
      message?: string
      originalOutput?: unknown }  // raw output p/ `toCoreMessages` fidelity
  | { type: 'delegation'
      agent: string
      parentToolUseId: string
      args: Record<string, unknown>
      children: PersistedBlock[] }  // recursivo
```

### Notas importantes

- **Resource nao inline.** Tool result vira `resource_ref` apontando para
  envelope no `envelopes` map sibling. Mesmo envelope referenciado N vezes =
  1 entry no map.
- **Delegation recursivo.** Sub-agente vira um `delegation { children }` com
  PersistedBlocks proprios. Front renderiza como sub-thread expansivel.
- **`originalOutput`** existe so para fidelidade no `toCoreMessages` (replay
  para o LLM no turno seguinte). Front NAO renderiza esse campo.

### A2aChatMessage (live, dentro do Redis)

```typescript
interface A2aChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: PersistedBlock[]
  timestamp: number
}
```

### A2aPersistedMessage (formato por-mensagem, exposto pelo contracts)

```typescript
interface A2aPersistedMessage {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: PersistedBlock[]
  envelopes?: Record<string, ResourceEnvelope>  // envelopes referenciados POR ESTA mensagem
  createdAt: string  // ISO-8601 do Prisma
}
```

### Storage shape em `A2aMessages.content` (coluna JSON)

A coluna JSON do Prisma armazena `{ blocks, envelopes? }` (note o `blocks`,
nao `content`). O repository projeta para `A2aPersistedMessage` no boundary
do controller.

### Response do `GET /a2a/conversations/:id/messages` (paginado, agregado)

```typescript
interface ConversationMessagesResponse {
  data: A2aPersistedMessage[]                 // sem envelopes inline na maioria dos casos
  total: number
  page: number
  resources: Record<string, ResourceEnvelope> // AGREGACAO no nivel da pagina
}
```

O controller agrega `envelopes` de todas as mensagens da pagina no top-level
`resources`. Front consome via
`src/common/services/IntelligenceV2Service.ts` e despeja tudo no
`ResourceStore` ao reabrir conversa (`useIntelligenceChat.ts:384`).

> **TODO (futuro):** quando a tabela `a2a_resources` em Postgres entrar, esse
> `resources` agregado some — controller faz join e devolve envelopes direto.
> Ver plan "Trabalho Futuro".

---

## 4. Eventos SSE

Vocabulario completo emitido pelo server e consumido pelo parser em
`src/views/intelligenceV2/utils/sse-parser.ts`. Cada evento e um bloco
`\n\n`-delimitado com linhas `event: <tipo>` + `data: <json>`.

| Evento | Quando emitido | Payload |
|--------|----------------|---------|
| `text_delta` | Cada chunk de texto streaming | `{ delta: string }` |
| `text_end` | Final de um run contiguo de texto | `{}` |
| `tool_invocation` | LLM chamou uma tool | `{ id, name, args, agent }` |
| `resource` | Tool produziu uma entidade (1+ por tool) | `{ envelope: ResourceEnvelope, toolCallId, agent }` |
| `tool_status` | Tool terminou (ok ou error, fechando o invocation) | `{ id, name, status: 'ok'\|'error', message? }` |
| `delegation_start` | Orchestrator delegou para sub-agente | `{ agent, parentToolUseId }` |
| `delegation_end` | Sub-agente terminou | `{ agent }` |
| `done` | Turno completo | `{ conversationId, usage: A2aTokenUsage, finishReason }` |
| `error` | Erro de execucao | `{ message, cause? }` |
| `cancelled` | Usuario cancelou | `{ reason }` |

### Constantes exportadas

```typescript
import { A2A_SSE_EVENT_TYPES } from '@chatfunnel/contracts/a2a'
// ReadonlySet<A2aSseEventType> com todos os 10 tipos acima.
// Usado pelo parser para descartar `event:` desconhecido (forwards-compat).
```

### A2aSseEvent (discriminated union)

```typescript
type A2aSseEvent =
  | { type: 'text_delta'; data: A2aTextDeltaEvent }
  | { type: 'text_end'; data: A2aTextEndEvent }
  | { type: 'tool_invocation'; data: A2aToolInvocationEvent }
  | { type: 'resource'; data: A2aResourceEvent }
  | { type: 'tool_status'; data: A2aToolStatusEvent }
  | { type: 'delegation_start'; data: A2aDelegationStartEvent }
  | { type: 'delegation_end'; data: A2aDelegationEndEvent }
  | { type: 'done'; data: A2aDoneEvent }
  | { type: 'error'; data: A2aErrorEvent }
  | { type: 'cancelled'; data: A2aCancelledEvent }
```

### A2aTokenUsage

```typescript
interface A2aTokenUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  costUsd?: number
}
```

Todos opcionais — alguns providers nao reportam custo, e o stream pode acabar
antes de algum step acumular usage.

---

## 5. TOOL_REGISTRY

Single source of truth para input/output schema **e** projecao para resource.

```typescript
import {
  TOOL_REGISTRY,
  RENDERABLE_TOOL_NAMES,
  RenderableToolNameSchema,
  validateToolOutput,
  extractToolResources,
  type ToolName,
  type ToolContract,
  type ResourceDescriptor
} from '@chatfunnel/contracts/tools'

interface ToolContract<Input, Output> {
  input: Input              // ZodRawShape — passada para McpServer.registerTool
  output: Output            // ZodRawShape
  resources?: ResourceDescriptor  // omitido em tools status-only
}

interface ResourceDescriptor<K extends ResourceKind = ResourceKind> {
  kind: K
  extract: (output: unknown) => Array<{ id: string; data: unknown }>
}
```

### Validacao no boundary

```typescript
validateToolOutput(toolName, data)
// → { success: true,  data }                       — tool nao registrada (passthrough)
// → { success: true,  data: parsed }               — schema bateu
// → { success: false, data, issues: ZodIssue[] }   — schema drift (wire shape preservada)
```

Wire shape **nunca** muda em drift — apenas telemetria captura. Front usa
o wrapper `validateToolData<T>(toolName, data)` em
`src/views/intelligenceV2/utils/tool-output-validator.ts` que adiciona
typed-narrow do generic `T` quando `ok: true`.

### Projecao para envelope

```typescript
extractToolResources(toolName, output)
// → null                                              — tool sem `resources` (emite tool_status apenas)
// → { kind, items: Array<{ id, data }> }              — n envelopes a emitir
```

Helpers internos de extracao (`fromRoot`, `fromArray`, `fromNested`) sao
**defensivos**: aceitam variacoes legitimas do output (e.g. `customFields`
vs `fields`, `id` vs `internalId`, `automationId` vs `id`). Schema drift do
MCP nao quebra o pipeline.

### Inventario (53 tools + 1 A2A-local)

```
contacts      (5)  search_contacts, get_contact, update_contact_field,
                   get_contact_messages, update_contact
discovery     (8)  get_custom_fields, get_tags, get_channels, get_kanbans,
                   get_assistants, get_moderators, list_medias, get_agents_v2
tag           (8)  create_tag, update_tag, delete_tag, list_tag_folders,
                   create_tag_folder, delete_tag_folder, add_contact_tag,
                   remove_contact_tag
template      (9)  list_templates, get_template, get_template_status,
                   get_template_buttons, create_template, update_template,
                   delete_templates, sync_templates, configure_template_params
management    (6)  list_automations, get_automation, toggle_automation,
                   rename_automation, delete_automations, get_draft
crm           (6)  create_kanban_card, move_kanban_card, win_kanban_card,
                   lose_kanban_card, assign_card_moderator, list_kanban_cards
builder      (11)  create_trigger, add_step_message/_delay/_condition/_action/
                   _kanban/_ab_test/_follow_up/_run_automation/_chat_action,
                   build_automation
A2A-local     (1)  present_resource  (NAO no MCP, NAO no TOOL_REGISTRY)
```

---

## 6. present_resource (A2A-local)

Tool **fora** do TOOL_REGISTRY — vive em `src/tools/present.contracts.ts`.
Permite o orchestrator re-exibir um resource ja fetchado antes na conversa,
sem novo round-trip MCP. O service intercepta a chamada, busca no
`ResourceStore` da conversa e re-emite como `resource` event carregando o
`toolName` original — front renderiza com o **mesmo** componente que renderizou
o fetch original.

```typescript
// input
{
  toolName: RenderableToolNameSchema    // enum com RENDERABLE_TOOL_NAMES
  resourceIds?: string[]                // omit → re-exibe o mais recente
}

// result (entregue ao LLM)
type PresentResourceResult = {
  renderedIds: string[]      // matched & renderizados
  notFoundIds: string[]      // pedidos mas nao stored — orchestrator deve refetch
  ambiguous?: boolean        // sem ids e varios candidatos — re-call com ids
  candidateIds?: string[]    // ids candidatos quando ambiguous
}
```

`RENDERABLE_TOOL_NAMES` e derivado em runtime: todo entry do TOOL_REGISTRY
com `resources !== undefined`. Re-exibir uma tool status-only nao faz sentido,
entao a Zod enum trava no boundary.

---

## 7. Mapeamento Kind → Componente (front)

Front roteia o renderer por `ResourceKind`, **nao** por archetype/toolName.
Duas tools (e.g. `list_automations` + `get_automation`) emitem
`kind: 'automation'` e dividem o mesmo componente.

Definido em `src/views/intelligenceV2/registry/resource.registry.ts`:

| Kind | Componente |
|------|-----------|
| `contact` | `ContactResult.vue` |
| `automation`, `template`, `kanban_card` | `ListResult.vue` |
| `tag`, `tag_folder`, `custom_field`, `channel`, `moderator`, `assistant`, `agent_v2`, `media`, `kanban_board` | `DiscoveryChips.vue` |
| `automation_draft`, `template_status`, `template_buttons`, `contact_messages` | `GenericJsonResult.vue` (fallback ate ter typed component) |

Kinds nao mapeados caem em `GenericJsonResult` (defensivo — adicionar novo
kind no contracts nao quebra build do front).

---

## 8. Source files

| Arquivo | Conteudo |
|---------|----------|
| `src/a2a/version.ts` | `A2A_PROTOCOL_VERSION`, `A2A_PROTOCOL_VERSION_HEADER` |
| `src/a2a/envelope.ts` | `ResourceEnvelope`, `ResourceKind`, `RESOURCE_SCHEMA_VERSION`, `makeEnvelopeId` |
| `src/a2a/events.ts` | Vocabulario SSE, `A2aSseEvent`, `A2A_SSE_EVENT_TYPES` |
| `src/a2a/types.ts` | `PersistedBlock`, `A2aChatMessage`, `A2aPersistedMessage` |
| `src/a2a/index.ts` | Re-exports nomeados explicitos (NAO `export *`) |
| `src/tools/registry.ts` | `TOOL_REGISTRY`, `validateToolOutput`, `extractToolResources`, helpers de extracao |
| `src/tools/present.contracts.ts` | `present_resource` (A2A-local) |
| `src/tools/contacts.contracts.ts` | 5 contacts tools |
| `src/tools/discovery.contracts.ts` | 8 discovery tools |
| `src/tools/tag.contracts.ts` | 8 tag tools |
| `src/tools/template.contracts.ts` | 9 template tools |
| `src/tools/management.contracts.ts` | 6 automation management tools |
| `src/tools/crm.contracts.ts` | 6 kanban tools |
| `src/tools/builder.contracts.ts` | 11 automation builder tools |

---

## 9. Gotchas

### Export pattern

`src/a2a/index.ts` usa **exports nomeados explicitos** (nao `export *`).
Motivo: `cjs-module-lexer` (usado por Vite/esbuild) so detecta named exports
escritos como `exports.X = ...`. `export *` compila para o helper runtime
`__exportStar`, opaco ao lexer — causa `does not provide an export named X`
no build do front ao consumir `A2A_SSE_EVENT_TYPES` /
`A2A_PROTOCOL_VERSION` / etc.

Adicionar novo export → adicionar named na `index.ts` tambem.

### Build dual

Pacote publica CJS **e** ESM via `scripts/write-esm-package.cjs` +
`tsconfig.esm.json`. Front importa o ESM build.

### Zod cross-version

Front roda `zod@^3.24`. Contracts pode usar `zod` interno. **NUNCA** chamar
`z.object(entry.output).safeParse(...)` direto no front com schema do
contracts — sempre usar `validateToolOutput` (ou o wrapper
`validateToolData<T>`) para o parse rodar **dentro** do pacote, garantindo
versao consistente.

### Padroes dos schemas

- Maioria dos campos sao `.optional()` — respostas parciais sao normais
- Objetos usam `.loose()` — campos extras nao quebram
- Strings frequentemente `.nullable()`
- Relacionamentos sao `unknown[]` (tags, channels, customFields aninhados)
- Enums comuns:
  - Status template: `APPROVED | PENDING | REJECTED | PAUSED | DISABLED`
  - Actions automation: `ADD_TAG | REMOVE_TAG | HTTP_REQUEST | ASSISTANT | ...`
  - Operators: `EQUALS | CONTAINS | STARTS_WITH | ...`

---

## 10. Verificacao no front (`feature/intelligence-resource-events`)

Confirmado que o front consome **todos** os exports v2 corretamente:

| Consumidor (`src/views/intelligenceV2/...`) | Import |
|---|---|
| `types/content-block.ts` | re-exporta `PersistedBlock`, `ResourceEnvelope`, `ResourceKind` + extracts por variant |
| `types/sse-event.ts` | re-exporta `A2aSseEvent`, `A2aSseEventType`, `A2aTokenUsage` + extracts por variant |
| `stores/resource-store.ts` | usa `ResourceEnvelope`, `ResourceKind` — store chaveado por `envelopeId` (`shallowRef<Map<string, ResourceEnvelope>>`) |
| `registry/resource.registry.ts` | usa `ResourceKind` — `Partial<Record<ResourceKind, Component>>` |
| `utils/sse-parser.ts` | usa `A2A_SSE_EVENT_TYPES`, `A2aSseEventType` — filtro de event types desconhecidos |
| `utils/tool-output-validator.ts` | usa `validateToolOutput`, `TOOL_REGISTRY` — wrapper tipado com generic |

E o front tambem mantem o servico legacy `common/services/IntelligenceV2Service.ts`
para auth/health/historico.

Nao foram detectados imports do v1 (`A2aContentBlock`, `A2aToolResultPart`,
`block_start/delta/stop`) — protocolo v1 esta completamente fora.
