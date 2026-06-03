# Intelligence V2 Front — Migração para Resource Events (A2A v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar o módulo `chatfunnel-front/src/views/intelligenceV2/` do protocolo A2A v1 (eventos `block_*` + pares `tool_use`/`tool_result`) para o protocolo A2A v2 baseado em eventos semânticos e `ResourceEnvelope`, mantendo o stream e o reload de conversa funcionais.

**Architecture:** O front passa a (1) enviar o header `X-A2A-Protocol-Version: 2`, (2) consumir um vocabulário de eventos SSE explícito via `A2A_SSE_EVENT_TYPES`, (3) guardar `ResourceEnvelope`s num `ResourceStore` local indexado por `envelopeId`, (4) renderizar `resource_ref` resolvendo pelo store via um `resource.registry` que indexa por `ResourceKind` (não por `toolName`), e (5) hidratar o store a partir do mapa `resources` retornado pelo histórico.

**Tech Stack:** Vue 3.5 (Composition API, `<script setup lang="ts">`), TypeScript strict, Vitest + happy-dom, `@chatfunnel/contracts/a2a` (v2). Sem alterações no `tool-catalog.registry.ts` (metadados auxiliares por `toolName` continuam válidos).

**Branch:** `feature/intelligence-content-blocks` (já criada).

**Spec de referência:** `vault/wiki/features/intelligence-v2-resource-events-front-plan.md` (revisão 2).

**Out of scope (post-MVP, plano separado):** delegation sub-thread rendering, partial-state animations, schemaVersion mismatch UI, métricas de cache hit/miss de envelopes.

---

## File Structure

### Novos arquivos

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/views/intelligenceV2/stores/resource-store.ts` | Composable `useResourceStore()` — guarda envelopes por `envelopeId`, dedupe `fresh`/`replay`, lookup por `toolCallId`. |
| `src/views/intelligenceV2/stores/resource-store.spec.ts` | Specs do store. |
| `src/views/intelligenceV2/registry/resource.registry.ts` | Mapa `ResourceKind -> archetype -> Component`. |
| `src/views/intelligenceV2/registry/resource.registry.spec.ts` | Specs do registry. |
| `src/views/intelligenceV2/components/messages/tool-results/ResourceRenderer.vue` | Substitui `ToolResultParts.vue` — recebe `ResourceEnvelope[]` + `status?` e delega ao registry. |
| `src/views/intelligenceV2/components/messages/tool-results/ResourceRenderer.spec.ts` | Specs do renderer. |

### Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `src/views/intelligenceV2/types/content-block.ts` | Substituir imports v1 por `PersistedBlock` v2 + aliases. |
| `src/views/intelligenceV2/types/message.ts` | Trocar `A2aContentBlock[]` por `PersistedBlock[]`. |
| `src/views/intelligenceV2/types/sse-event.ts` | Substituir `SseBlock*Event` por extracts dos eventos v2. |
| `src/views/intelligenceV2/utils/sse-parser.ts` | Reescrever usando `A2A_SSE_EVENT_TYPES`. |
| `src/views/intelligenceV2/utils/sse-parser.spec.ts` | (Criar) — cobrir eventos v2. |
| `src/common/services/IntelligenceV2Service.ts` | Adicionar header `X-A2A-Protocol-Version` em `streamChat`; tipar `ConversationMessagesResponse` com `page` e `resources`. |
| `src/views/intelligenceV2/composables/useIntelligenceChat.ts` | Reescrever state machine para eventos v2 + hidratar store. |
| `src/views/intelligenceV2/composables/useIntelligenceChat.spec.ts` | (Criar) Specs do composable cobrindo cada tipo de evento. |
| `src/views/intelligenceV2/components/messages/ContentBlockList.vue` | Agrupar por `tool_invocation.id`. |
| `src/views/intelligenceV2/components/messages/ToolCallCard.vue` | Trocar props `use`/`result` por `invocation`/`status`/`resources`. |
| `src/views/intelligenceV2/components/messages/AssistantMessage.vue` | Atualizar heurística "has content" (linha 43). |
| `src/views/intelligenceV2/components/messages/tool-results/ToolResultParts.vue` | Apagar ao final da Fase 2. |
| `src/views/intelligenceV2/registry/tool-result.registry.ts` | Apagar ao final da Fase 2 (após zero consumidores). |

---

## Convenções

- Cada task termina com `npm run typecheck`, `npm test` (escopo do arquivo) e **um commit**.
- Mensagens de commit em português, prefixadas com `feat(intelV2):`, `refactor(intelV2):`, `test(intelV2):`.
- Imports do contracts sempre via path explícito: `import { … } from "@chatfunnel/contracts/a2a"` (re-exports são named, ver `chatfunnel-contracts/src/a2a/index.ts`).
- TDD onde possível (parser, store, registry, composable). Componentes Vue com test de render + props.
- Não tocar `tool-catalog.registry.ts` — segue válido como metadado por `toolName`.
- Todo `cd chatfunnel-front` é o ponto de partida dos comandos `npm`.

---

## Phase 1 — Compatibilizar contrato

Objetivo: stream e reload deixam de quebrar; UI renderiza placeholder simples por bloco enquanto a Fase 2 não substitui os renderers.

### Task 1: Atualizar tipos de bloco e mensagem para v2

**Files:**
- Modify: `chatfunnel-front/src/views/intelligenceV2/types/content-block.ts`
- Modify: `chatfunnel-front/src/views/intelligenceV2/types/message.ts`

- [ ] **Step 1: Substituir conteúdo de `content-block.ts`**

```ts
import type { PersistedBlock, ResourceEnvelope, ResourceKind } from '@chatfunnel/contracts/a2a'

export type { PersistedBlock, ResourceEnvelope, ResourceKind }

export type ContentBlock = PersistedBlock
export type TextBlock = Extract<PersistedBlock, { type: 'text' }>
export type ToolInvocationBlock = Extract<PersistedBlock, { type: 'tool_invocation' }>
export type ResourceRefBlock = Extract<PersistedBlock, { type: 'resource_ref' }>
export type ToolStatusBlock = Extract<PersistedBlock, { type: 'tool_status' }>
export type DelegationBlock = Extract<PersistedBlock, { type: 'delegation' }>
```

- [ ] **Step 2: Substituir conteúdo de `message.ts`**

```ts
import type { PersistedBlock } from './content-block'

export interface UserMessage {
  role: 'user'
  content: PersistedBlock[]
}

export interface AssistantMessage {
  role: 'assistant'
  content: PersistedBlock[]
}

export type ChatMessage = UserMessage | AssistantMessage
```

> Caso `message.ts` exporte campos adicionais hoje (id, createdAt, etc.), preservá-los — só trocar o tipo de `content`.

- [ ] **Step 3: Rodar typecheck (esperado: erros nos consumidores; ok por enquanto)**

```bash
cd chatfunnel-front && npm run typecheck
```

Expected: erros em `useIntelligenceChat.ts`, `ContentBlockList.vue`, `ToolCallCard.vue`, `ToolResultParts.vue`, `AssistantMessage.vue` (todos serão resolvidos nas tasks seguintes). Não deve haver erro novo em outros módulos.

- [ ] **Step 4: Commit**

```bash
git add src/views/intelligenceV2/types/content-block.ts \
        src/views/intelligenceV2/types/message.ts
git commit -m "refactor(intelV2): migrar tipos de bloco para PersistedBlock v2"
```

---

### Task 2: Atualizar `sse-event.ts` para extracts v2

**Files:**
- Modify: `chatfunnel-front/src/views/intelligenceV2/types/sse-event.ts`

- [ ] **Step 1: Substituir conteúdo**

```ts
import type { A2aSseEvent } from '@chatfunnel/contracts/a2a'

export type { A2aSseEvent }

export type SseTextDeltaEvent = Extract<A2aSseEvent, { type: 'text_delta' }>
export type SseTextEndEvent = Extract<A2aSseEvent, { type: 'text_end' }>
export type SseToolInvocationEvent = Extract<A2aSseEvent, { type: 'tool_invocation' }>
export type SseResourceEvent = Extract<A2aSseEvent, { type: 'resource' }>
export type SseToolStatusEvent = Extract<A2aSseEvent, { type: 'tool_status' }>
export type SseDelegationStartEvent = Extract<A2aSseEvent, { type: 'delegation_start' }>
export type SseDelegationEndEvent = Extract<A2aSseEvent, { type: 'delegation_end' }>
export type SseDoneEvent = Extract<A2aSseEvent, { type: 'done' }>
export type SseErrorEvent = Extract<A2aSseEvent, { type: 'error' }>
export type SseCancelledEvent = Extract<A2aSseEvent, { type: 'cancelled' }>
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: erros pré-existentes; nenhum novo em `sse-event.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/views/intelligenceV2/types/sse-event.ts
git commit -m "refactor(intelV2): substituir SseBlock*Event por extracts v2"
```

---

### Task 3: Reescrever `sse-parser.ts` com `A2A_SSE_EVENT_TYPES`

**Files:**
- Modify: `chatfunnel-front/src/views/intelligenceV2/utils/sse-parser.ts`
- Create: `chatfunnel-front/src/views/intelligenceV2/utils/sse-parser.spec.ts`

- [ ] **Step 1: Escrever specs (failing)**

```ts
// sse-parser.spec.ts
import { describe, it, expect } from 'vitest'
import { parseSseChunk } from './sse-parser'

describe('parseSseChunk', () => {
  it('extrai evento text_delta', () => {
    const chunk = 'event: text_delta\ndata: {"delta":"olá"}\n\n'
    const { events, rest } = parseSseChunk('', chunk)
    expect(events).toEqual([{ type: 'text_delta', data: { delta: 'olá' } }])
    expect(rest).toBe('')
  })

  it('mantém buffer parcial em rest', () => {
    const chunk = 'event: text_delta\ndata: {"delta":"a"}\n\nevent: text_end'
    const { events, rest } = parseSseChunk('', chunk)
    expect(events).toHaveLength(1)
    expect(rest).toBe('event: text_end')
  })

  it('descarta evento desconhecido', () => {
    const chunk = 'event: block_start\ndata: {}\n\n'
    const { events } = parseSseChunk('', chunk)
    expect(events).toEqual([])
  })

  it('parseia resource event', () => {
    const env = {
      envelopeId: 'automation:abc',
      kind: 'automation',
      id: 'abc',
      data: { id: 'abc', name: 'Funil 1' },
      producedBy: { toolName: 'list_automations', toolCallId: 'tc-1', agent: 'orchestrator' },
      source: 'fresh',
      fetchedAt: 1,
      schemaVersion: 1,
    }
    const payload = JSON.stringify({ envelope: env, toolCallId: 'tc-1', agent: 'orchestrator' })
    const chunk = `event: resource\ndata: ${payload}\n\n`
    const { events } = parseSseChunk('', chunk)
    expect(events[0].type).toBe('resource')
    expect(events[0].data).toMatchObject({ envelope: { envelopeId: 'automation:abc' } })
  })
})
```

- [ ] **Step 2: Rodar specs (esperar fail)**

```bash
npm test -- --run src/views/intelligenceV2/utils/sse-parser.spec.ts
```

Expected: FAIL — `parseSseChunk` não exportado ou lógica antiga.

- [ ] **Step 3: Substituir `sse-parser.ts`**

```ts
import { A2A_SSE_EVENT_TYPES, type A2aSseEvent, type A2aSseEventType } from '@chatfunnel/contracts/a2a'

export interface ParseResult {
  events: A2aSseEvent[]
  rest: string
}

export function parseSseChunk(buffer: string, chunk: string): ParseResult {
  const combined = buffer + chunk
  const parts = combined.split('\n\n')
  const rest = parts.pop() ?? ''
  const events: A2aSseEvent[] = []

  for (const block of parts) {
    if (!block.trim()) continue
    let type: string | null = null
    let dataLine: string | null = null
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) type = line.slice(6).trim()
      else if (line.startsWith('data:')) dataLine = (dataLine ?? '') + line.slice(5).trim()
    }
    if (!type || !dataLine) continue
    if (!A2A_SSE_EVENT_TYPES.has(type as A2aSseEventType)) continue
    try {
      const data = JSON.parse(dataLine)
      events.push({ type, data } as A2aSseEvent)
    } catch {
      // ignora frame com JSON corrompido — protocolo é fail-soft
    }
  }

  return { events, rest }
}
```

- [ ] **Step 4: Specs passam**

```bash
npm test -- --run src/views/intelligenceV2/utils/sse-parser.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/intelligenceV2/utils/sse-parser.ts \
        src/views/intelligenceV2/utils/sse-parser.spec.ts
git commit -m "refactor(intelV2): reescrever sse-parser para vocabulário A2A v2"
```

---

### Task 4: Criar `useResourceStore` composable

**Files:**
- Create: `chatfunnel-front/src/views/intelligenceV2/stores/resource-store.ts`
- Create: `chatfunnel-front/src/views/intelligenceV2/stores/resource-store.spec.ts`

- [ ] **Step 1: Specs**

```ts
// resource-store.spec.ts
import { describe, it, expect } from 'vitest'
import { useResourceStore } from './resource-store'
import type { ResourceEnvelope } from '@chatfunnel/contracts/a2a'

function env(over: Partial<ResourceEnvelope> = {}): ResourceEnvelope {
  return {
    envelopeId: 'automation:abc',
    kind: 'automation',
    id: 'abc',
    data: { id: 'abc' },
    producedBy: { toolName: 'list_automations', toolCallId: 'tc-1', agent: 'orchestrator' },
    source: 'fresh',
    fetchedAt: 1,
    schemaVersion: 1,
    ...over,
  } as ResourceEnvelope
}

describe('useResourceStore', () => {
  it('put e get por envelopeId', () => {
    const s = useResourceStore()
    s.clear()
    s.put(env())
    expect(s.get('automation:abc')?.kind).toBe('automation')
  })

  it('dedupe last-write-wins: replay sobrescreve fresh', () => {
    const s = useResourceStore()
    s.clear()
    s.put(env({ source: 'fresh', fetchedAt: 1 }))
    s.put(env({ source: 'replay', fetchedAt: 999 }))
    expect(s.get('automation:abc')?.source).toBe('replay')
  })

  it('getByToolCall agrupa por toolCallId', () => {
    const s = useResourceStore()
    s.clear()
    s.put(env({ envelopeId: 'automation:a', id: 'a' }))
    s.put(env({ envelopeId: 'automation:b', id: 'b' }))
    s.put(
      env({
        envelopeId: 'tag:x',
        id: 'x',
        kind: 'tag',
        producedBy: { toolName: 'get_tags', toolCallId: 'tc-2', agent: 'o' },
      }),
    )
    expect(s.getByToolCall('tc-1')).toHaveLength(2)
    expect(s.getByToolCall('tc-2')).toHaveLength(1)
  })

  it('putMany aceita Record e Array', () => {
    const s = useResourceStore()
    s.clear()
    s.putMany({ 'automation:abc': env() })
    expect(s.get('automation:abc')).toBeDefined()
    s.clear()
    s.putMany([env()])
    expect(s.get('automation:abc')).toBeDefined()
  })
})
```

- [ ] **Step 2: Rodar specs (FAIL)**

```bash
npm test -- --run src/views/intelligenceV2/stores/resource-store.spec.ts
```

- [ ] **Step 3: Implementar store**

```ts
// resource-store.ts
import { shallowRef } from 'vue'
import type { ResourceEnvelope } from '@chatfunnel/contracts/a2a'

const envelopes = shallowRef<Map<string, ResourceEnvelope>>(new Map())

function put(envelope: ResourceEnvelope): void {
  const next = new Map(envelopes.value)
  next.set(envelope.envelopeId, envelope)
  envelopes.value = next
}

function putMany(items: Record<string, ResourceEnvelope> | ResourceEnvelope[]): void {
  const next = new Map(envelopes.value)
  const list = Array.isArray(items) ? items : Object.values(items)
  for (const e of list) next.set(e.envelopeId, e)
  envelopes.value = next
}

function get(envelopeId: string): ResourceEnvelope | undefined {
  return envelopes.value.get(envelopeId)
}

function getByToolCall(toolCallId: string): ResourceEnvelope[] {
  const out: ResourceEnvelope[] = []
  for (const e of envelopes.value.values()) {
    if (e.producedBy.toolCallId === toolCallId) out.push(e)
  }
  return out
}

function clear(): void {
  envelopes.value = new Map()
}

export function useResourceStore() {
  return { envelopes, put, putMany, get, getByToolCall, clear }
}
```

- [ ] **Step 4: Specs passam + typecheck**

```bash
npm test -- --run src/views/intelligenceV2/stores/resource-store.spec.ts
npm run typecheck
```

Expected: PASS no spec; typecheck mantém só os erros pré-existentes nos componentes Vue.

- [ ] **Step 5: Commit**

```bash
git add src/views/intelligenceV2/stores/resource-store.ts \
        src/views/intelligenceV2/stores/resource-store.spec.ts
git commit -m "feat(intelV2): adicionar useResourceStore para envelopes v2"
```

---

### Task 5: Adicionar header `X-A2A-Protocol-Version` em `IntelligenceV2Service`

**Files:**
- Modify: `chatfunnel-front/src/common/services/IntelligenceV2Service.ts`

> Correção em relação ao spec: este service expõe `streamChat` (linhas 62-72) — o header entra exatamente aqui, não em `useIntelligenceChat`.

- [ ] **Step 1: Atualizar imports e tipo de response**

Substituir o topo do arquivo:

```ts
import { NestApi } from '../api/index'
import { useAuthStore } from '@/stores/auth'
import {
  A2A_PROTOCOL_VERSION,
  A2A_PROTOCOL_VERSION_HEADER,
  type A2aPersistedMessage,
  type ResourceEnvelope,
} from '@chatfunnel/contracts/a2a'

export interface ConversationListResponse {
  data: Array<{
    id: string
    title: string | null
    updatedAt: string
    _count?: { messages: number }
  }>
  total: number
  page: number
  limit: number
}

export interface ConversationMessagesResponse {
  data: A2aPersistedMessage[]
  total: number
  page: number
  resources: Record<string, ResourceEnvelope>
}
```

- [ ] **Step 2: Injetar header em `authHeaders()`**

```ts
function authHeaders(): Record<string, string> {
  const authStore = useAuthStore()
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authStore.token}`,
    'Account-Selected': authStore.accountSelected || '',
    [A2A_PROTOCOL_VERSION_HEADER]: String(A2A_PROTOCOL_VERSION),
  }
}
```

- [ ] **Step 3: Validar manualmente no devtools**

```bash
npm run dev
```

Abrir o módulo Intelligence no browser, iniciar uma conversa, abrir DevTools → Network → confirmar que `POST /a2a/chat` carrega `X-A2A-Protocol-Version: 2`.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: nenhum erro novo em `IntelligenceV2Service.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/common/services/IntelligenceV2Service.ts
git commit -m "feat(intelV2): enviar X-A2A-Protocol-Version: 2 em streamChat"
```

---

### Task 6: Reescrever state machine de `useIntelligenceChat`

**Files:**
- Modify: `chatfunnel-front/src/views/intelligenceV2/composables/useIntelligenceChat.ts`
- Create: `chatfunnel-front/src/views/intelligenceV2/composables/useIntelligenceChat.spec.ts`

> Esta task é a maior. Reescreva incrementalmente: comece pelo handler de cada evento, mantenha tudo o que **não** é state machine (refs públicas, lifecycle, abort, `sendMessage`) intacto. O loop de leitura do stream deve passar a chamar `parseSseChunk` e iterar `events.forEach(_applyEvent)` — substitua o handler antigo de `block_start | block_delta | block_stop` por isso.

- [ ] **Step 1: Specs cobrindo cada evento**

```ts
// useIntelligenceChat.spec.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useIntelligenceChat } from './useIntelligenceChat'
import { useResourceStore } from '../stores/resource-store'

beforeEach(() => {
  useResourceStore().clear()
  useIntelligenceChat()._resetForTest?.()
})

describe('useIntelligenceChat reducer (events v2)', () => {
  it('text_delta acumula em um único bloco text', () => {
    const chat = useIntelligenceChat()
    chat._startAssistantMessage()
    chat._applyEvent({ type: 'text_delta', data: { delta: 'Olá' } })
    chat._applyEvent({ type: 'text_delta', data: { delta: ' mundo' } })
    const last = chat.messages.value.at(-1)!
    expect(last.content).toEqual([{ type: 'text', text: 'Olá mundo' }])
  })

  it('text_end fecha o run de texto', () => {
    const chat = useIntelligenceChat()
    chat._startAssistantMessage()
    chat._applyEvent({ type: 'text_delta', data: { delta: 'A' } })
    chat._applyEvent({ type: 'text_end', data: {} })
    chat._applyEvent({ type: 'text_delta', data: { delta: 'B' } })
    const last = chat.messages.value.at(-1)!
    expect(last.content).toEqual([
      { type: 'text', text: 'A' },
      { type: 'text', text: 'B' },
    ])
  })

  it('tool_invocation cria bloco tool_invocation', () => {
    const chat = useIntelligenceChat()
    chat._startAssistantMessage()
    chat._applyEvent({
      type: 'tool_invocation',
      data: { id: 'tc-1', name: 'list_automations', args: {}, agent: 'orchestrator' },
    })
    const last = chat.messages.value.at(-1)!
    expect(last.content).toContainEqual({
      type: 'tool_invocation',
      id: 'tc-1',
      name: 'list_automations',
      args: {},
      agent: 'orchestrator',
    })
  })

  it('resource grava envelope no store e gera resource_ref', () => {
    const chat = useIntelligenceChat()
    const store = useResourceStore()
    chat._startAssistantMessage()
    chat._applyEvent({
      type: 'tool_invocation',
      data: { id: 'tc-1', name: 'list_automations', args: {}, agent: 'orchestrator' },
    })
    chat._applyEvent({
      type: 'resource',
      data: {
        envelope: {
          envelopeId: 'automation:a',
          kind: 'automation',
          id: 'a',
          data: {},
          producedBy: { toolName: 'list_automations', toolCallId: 'tc-1', agent: 'orchestrator' },
          source: 'fresh',
          fetchedAt: 1,
          schemaVersion: 1,
        },
        toolCallId: 'tc-1',
        agent: 'orchestrator',
      },
    })
    expect(store.get('automation:a')).toBeDefined()
    const last = chat.messages.value.at(-1)!
    expect(last.content).toContainEqual({
      type: 'resource_ref',
      envelopeId: 'automation:a',
      kind: 'automation',
      id: 'a',
      toolCallId: 'tc-1',
    })
  })

  it('tool_status fecha tool com ok/error', () => {
    const chat = useIntelligenceChat()
    chat._startAssistantMessage()
    chat._applyEvent({
      type: 'tool_invocation',
      data: { id: 'tc-1', name: 'create_tag', args: {}, agent: 'orchestrator' },
    })
    chat._applyEvent({
      type: 'tool_status',
      data: { id: 'tc-1', name: 'create_tag', status: 'ok', message: 'Tag criada' },
    })
    const last = chat.messages.value.at(-1)!
    expect(last.content).toContainEqual({
      type: 'tool_status',
      id: 'tc-1',
      name: 'create_tag',
      status: 'ok',
      message: 'Tag criada',
    })
  })

  it('done seta conversationId, usage e isStreaming=false', () => {
    const chat = useIntelligenceChat()
    chat._startAssistantMessage()
    chat._applyEvent({
      type: 'done',
      data: { conversationId: 'c-1', usage: { totalTokens: 42 }, finishReason: 'stop' },
    })
    expect(chat.conversationId.value).toBe('c-1')
    expect(chat.lastUsage.value?.totalTokens).toBe(42)
    expect(chat.isStreaming.value).toBe(false)
  })

  it('cancelled encerra stream', () => {
    const chat = useIntelligenceChat()
    chat._startAssistantMessage()
    chat._applyEvent({ type: 'cancelled', data: { reason: 'user_abort' } })
    expect(chat.isStreaming.value).toBe(false)
  })
})
```

> A API interna `_applyEvent`, `_startAssistantMessage` e `_resetForTest` é exposta **só para teste**. Prefixo `_` sinaliza.

- [ ] **Step 2: Rodar specs (FAIL — esperado, métodos não existem)**

```bash
npm test -- --run src/views/intelligenceV2/composables/useIntelligenceChat.spec.ts
```

- [ ] **Step 3: Reescrever o miolo de `useIntelligenceChat.ts`**

Substituir as funções de manipulação de bloco antigo por um reducer com este shape:

```ts
import { ref, shallowRef } from 'vue'
import type {
  A2aSseEvent,
  A2aTokenUsage,
  PersistedBlock,
  ResourceEnvelope,
} from '@chatfunnel/contracts/a2a'
import { useResourceStore } from '../stores/resource-store'
import { parseSseChunk } from '../utils/sse-parser'
import type { ChatMessage } from '../types/message'
import IntelligenceV2Service from '@/common/services/IntelligenceV2Service'

const messages = shallowRef<ChatMessage[]>([])
const isStreaming = ref(false)
const conversationId = ref<string | null>(null)
const lastUsage = ref<A2aTokenUsage | null>(null)
const lastError = ref<string | null>(null)

let textRunOpen = false

function _resetForTest() {
  messages.value = []
  isStreaming.value = false
  conversationId.value = null
  lastUsage.value = null
  lastError.value = null
  textRunOpen = false
}

function _startAssistantMessage() {
  messages.value = [...messages.value, { role: 'assistant', content: [] }]
  textRunOpen = false
}

function _appendBlock(block: PersistedBlock) {
  const last = messages.value.at(-1)
  if (!last || last.role !== 'assistant') return
  const next: ChatMessage = { ...last, content: [...last.content, block] }
  messages.value = [...messages.value.slice(0, -1), next]
}

function _replaceLastBlock(replacer: (b: PersistedBlock) => PersistedBlock) {
  const last = messages.value.at(-1)
  if (!last || last.role !== 'assistant') return
  if (last.content.length === 0) return
  const nextContent = [...last.content]
  nextContent[nextContent.length - 1] = replacer(nextContent[nextContent.length - 1])
  const next: ChatMessage = { ...last, content: nextContent }
  messages.value = [...messages.value.slice(0, -1), next]
}

function _applyEvent(ev: A2aSseEvent) {
  const store = useResourceStore()

  switch (ev.type) {
    case 'text_delta': {
      const last = messages.value.at(-1)
      const lastBlock = last?.content.at(-1)
      if (textRunOpen && lastBlock?.type === 'text') {
        _replaceLastBlock((b) => {
          const t = b as Extract<PersistedBlock, { type: 'text' }>
          return { type: 'text', text: t.text + ev.data.delta }
        })
      } else {
        _appendBlock({ type: 'text', text: ev.data.delta })
        textRunOpen = true
      }
      break
    }
    case 'text_end': {
      textRunOpen = false
      break
    }
    case 'tool_invocation': {
      textRunOpen = false
      _appendBlock({
        type: 'tool_invocation',
        id: ev.data.id,
        name: ev.data.name,
        args: ev.data.args,
        agent: ev.data.agent,
      })
      break
    }
    case 'resource': {
      const env: ResourceEnvelope = ev.data.envelope
      store.put(env)
      _appendBlock({
        type: 'resource_ref',
        envelopeId: env.envelopeId,
        kind: env.kind,
        id: env.id,
        toolCallId: ev.data.toolCallId,
      })
      break
    }
    case 'tool_status': {
      _appendBlock({
        type: 'tool_status',
        id: ev.data.id,
        name: ev.data.name,
        status: ev.data.status,
        message: ev.data.message,
      })
      break
    }
    case 'delegation_start': {
      _appendBlock({
        type: 'delegation',
        agent: ev.data.agent,
        parentToolUseId: ev.data.parentToolUseId,
        args: {},
        children: [],
      })
      break
    }
    case 'delegation_end': {
      // no-op no MVP — Fase 3 fecha sub-thread real
      break
    }
    case 'done': {
      conversationId.value = ev.data.conversationId
      lastUsage.value = ev.data.usage
      isStreaming.value = false
      textRunOpen = false
      break
    }
    case 'error': {
      lastError.value = ev.data.message
      isStreaming.value = false
      textRunOpen = false
      break
    }
    case 'cancelled': {
      isStreaming.value = false
      textRunOpen = false
      break
    }
  }
}

export function useIntelligenceChat() {
  return {
    messages,
    isStreaming,
    conversationId,
    lastUsage,
    lastError,
    // internos expostos para teste:
    _startAssistantMessage,
    _applyEvent,
    _resetForTest,
    // …sendMessage / abort / loadConversation continuam no arquivo,
    // só substitua o loop de leitura para usar parseSseChunk + _applyEvent.
  }
}
```

> Importante: este arquivo hoje tem outros métodos (`sendMessage`, `loadConversation`, `abort`). **Não remover**. Trocar apenas o miolo do reducer (o `switch` antigo de `block_start | block_delta | block_stop`). O loop de leitura do stream passa a:
>
> ```ts
> const reader = response.body!.getReader()
> const decoder = new TextDecoder()
> let buffer = ''
> isStreaming.value = true
> _startAssistantMessage()
> try {
>   while (true) {
>     const { value, done } = await reader.read()
>     if (done) break
>     const chunk = decoder.decode(value, { stream: true })
>     const { events, rest } = parseSseChunk(buffer, chunk)
>     buffer = rest
>     for (const ev of events) _applyEvent(ev)
>   }
> } finally {
>   isStreaming.value = false
> }
> ```

- [ ] **Step 4: Specs do composable passam**

```bash
npm test -- --run src/views/intelligenceV2/composables/useIntelligenceChat.spec.ts
```

Expected: PASS em todos os casos.

- [ ] **Step 5: Typecheck (escopo intelligenceV2)**

```bash
npm run typecheck
```

Expected: `types/`, `utils/sse-parser.ts`, `stores/`, `composables/useIntelligenceChat.ts` e `IntelligenceV2Service.ts` **sem erros**. Erros restantes devem estar apenas nos componentes Vue (resolvidos na Fase 2).

- [ ] **Step 6: Commit**

```bash
git add src/views/intelligenceV2/composables/useIntelligenceChat.ts \
        src/views/intelligenceV2/composables/useIntelligenceChat.spec.ts
git commit -m "refactor(intelV2): reescrever state machine para eventos A2A v2"
```

---

### Task 7: `loadConversation` hidrata `ResourceStore`

**Files:**
- Modify: `chatfunnel-front/src/views/intelligenceV2/composables/useIntelligenceChat.ts`

- [ ] **Step 1: Spec**

Adicionar ao `useIntelligenceChat.spec.ts`:

```ts
import type { ConversationMessagesResponse } from '@/common/services/IntelligenceV2Service'

it('loadConversation hidrata o store com res.resources', async () => {
  const chat = useIntelligenceChat()
  const store = useResourceStore()
  const fixture: ConversationMessagesResponse = {
    data: [
      {
        role: 'assistant',
        content: [
          {
            type: 'resource_ref',
            envelopeId: 'automation:a',
            kind: 'automation',
            id: 'a',
            toolCallId: 'tc-1',
          },
        ],
      } as never,
    ],
    total: 1,
    page: 1,
    resources: {
      'automation:a': {
        envelopeId: 'automation:a',
        kind: 'automation',
        id: 'a',
        data: { id: 'a', name: 'F' },
        producedBy: { toolName: 'list_automations', toolCallId: 'tc-1', agent: 'orchestrator' },
        source: 'replay',
        fetchedAt: 1,
        schemaVersion: 1,
      },
    },
  }
  await chat._setMessagesFromResponse(fixture)
  expect(store.get('automation:a')).toBeDefined()
  expect(chat.messages.value[0].content[0]).toMatchObject({ type: 'resource_ref' })
})
```

- [ ] **Step 2: Implementar `_setMessagesFromResponse` e atualizar `loadConversation`**

```ts
import type { ConversationMessagesResponse } from '@/common/services/IntelligenceV2Service'

async function _setMessagesFromResponse(res: ConversationMessagesResponse) {
  useResourceStore().putMany(res.resources)
  messages.value = res.data.map((m) => ({
    role: m.role,
    content: m.content,
  })) as ChatMessage[]
}

async function loadConversation(id: string) {
  const res = await IntelligenceV2Service.getMessages(id, { page: 1, limit: 100 })
  // O helper `NestApi.get()` retorna axios response; ajustar o unpacking
  // ao padrão do projeto. Se já desempacotar, usar `res` direto.
  const payload = (res as { data: ConversationMessagesResponse }).data
  await _setMessagesFromResponse(payload)
  conversationId.value = id
}
```

> Confirmar o shape de retorno do `NestApi.get()` no projeto antes de fazer o unpacking. Se o helper já entrega o body, remover `.data`.

Exportar também `_setMessagesFromResponse` no return do composable (com prefixo `_` para sinalizar uso interno/teste).

- [ ] **Step 3: Test + typecheck**

```bash
npm test -- --run src/views/intelligenceV2/composables/useIntelligenceChat.spec.ts
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/views/intelligenceV2/composables/useIntelligenceChat.ts \
        src/views/intelligenceV2/composables/useIntelligenceChat.spec.ts
git commit -m "feat(intelV2): hidratar ResourceStore em loadConversation"
```

---

**Checkpoint Fase 1.**

```bash
npm run typecheck
npm test -- --run src/views/intelligenceV2
```

Após esta task, `types/`, `utils/`, `stores/`, `composables/` e `IntelligenceV2Service.ts` devem estar **100% v2 e sem erros de typecheck**. Componentes Vue ainda quebram — Fase 2 resolve.

---

## Phase 2 — Renderer

Objetivo: UI volta a renderizar resultados — agora a partir do `ResourceStore`, via `resource.registry.ts` e `ResourceRenderer.vue`. Componentes específicos (`AutomationList`, etc.) são adaptados para receber `ResourceEnvelope[]`.

### Task 8: Criar `resource.registry.ts`

**Files:**
- Create: `chatfunnel-front/src/views/intelligenceV2/registry/resource.registry.ts`
- Create: `chatfunnel-front/src/views/intelligenceV2/registry/resource.registry.spec.ts`

- [ ] **Step 1: Spec**

```ts
import { describe, it, expect } from 'vitest'
import { resolveResourceRenderer } from './resource.registry'

describe('resolveResourceRenderer', () => {
  it('mapeia automation para automation-list', () => {
    expect(resolveResourceRenderer('automation').archetype).toBe('automation-list')
  })

  it('tag/tag_folder/custom_field caem em discovery', () => {
    expect(resolveResourceRenderer('tag').archetype).toBe('discovery')
    expect(resolveResourceRenderer('tag_folder').archetype).toBe('discovery')
    expect(resolveResourceRenderer('custom_field').archetype).toBe('discovery')
  })

  it('kind desconhecido cai em generic', () => {
    expect(resolveResourceRenderer('algo-novo' as never).archetype).toBe('generic')
  })
})
```

- [ ] **Step 2: Implementar registry**

```ts
// resource.registry.ts
import type { Component } from 'vue'
import type { ResourceKind } from '@chatfunnel/contracts/a2a'
import AutomationList from '../components/messages/tool-results/AutomationList.vue'
import TemplateList from '../components/messages/tool-results/TemplateList.vue'
import KanbanCardList from '../components/messages/tool-results/KanbanCardList.vue'
import ChannelList from '../components/messages/tool-results/ChannelList.vue'
import ContactResult from '../components/messages/tool-results/ContactResult.vue'
import AgentResult from '../components/messages/tool-results/AgentResult.vue'
import DiscoveryChips from '../components/messages/tool-results/DiscoveryChips.vue'
import GenericJsonResult from '../components/messages/tool-results/GenericJsonResult.vue'
import BuildSummary from '../components/messages/tool-results/BuildSummary.vue'

export type ResourceArchetype =
  | 'automation-list'
  | 'template-list'
  | 'kanban-list'
  | 'channel-list'
  | 'contact'
  | 'agent'
  | 'discovery'
  | 'build-summary'
  | 'generic'

const KIND_TO_ARCHETYPE: Partial<Record<ResourceKind, ResourceArchetype>> = {
  automation: 'automation-list',
  template: 'template-list',
  kanban_card: 'kanban-list',
  channel: 'channel-list',
  contact: 'contact',
  agent_v2: 'agent',
  tag: 'discovery',
  tag_folder: 'discovery',
  custom_field: 'discovery',
  moderator: 'discovery',
  assistant: 'discovery',
  media: 'discovery',
  kanban_board: 'discovery',
  automation_draft: 'build-summary',
}

const ARCHETYPE_COMPONENT: Record<ResourceArchetype, Component> = {
  'automation-list': AutomationList,
  'template-list': TemplateList,
  'kanban-list': KanbanCardList,
  'channel-list': ChannelList,
  contact: ContactResult,
  agent: AgentResult,
  discovery: DiscoveryChips,
  'build-summary': BuildSummary,
  generic: GenericJsonResult,
}

export interface ResourceRendererSpec {
  archetype: ResourceArchetype
  component: Component
}

export function resolveResourceRenderer(kind: ResourceKind): ResourceRendererSpec {
  const archetype = KIND_TO_ARCHETYPE[kind] ?? 'generic'
  return { archetype, component: ARCHETYPE_COMPONENT[archetype] }
}
```

- [ ] **Step 3: Spec passa + typecheck**

```bash
npm test -- --run src/views/intelligenceV2/registry/resource.registry.spec.ts
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/views/intelligenceV2/registry/resource.registry.ts \
        src/views/intelligenceV2/registry/resource.registry.spec.ts
git commit -m "feat(intelV2): adicionar resource.registry por ResourceKind"
```

---

### Task 9: Criar `ResourceRenderer.vue`

**Files:**
- Create: `chatfunnel-front/src/views/intelligenceV2/components/messages/tool-results/ResourceRenderer.vue`
- Create: `chatfunnel-front/src/views/intelligenceV2/components/messages/tool-results/ResourceRenderer.spec.ts`

- [ ] **Step 1: Spec de render**

```ts
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/vue'
import ResourceRenderer from './ResourceRenderer.vue'
import type { ResourceEnvelope, ResourceKind } from '@chatfunnel/contracts/a2a'

function env(kind: ResourceKind, id: string, data: unknown): ResourceEnvelope {
  return {
    envelopeId: `${kind}:${id}`,
    kind,
    id,
    data,
    producedBy: { toolName: 't', toolCallId: 'tc-1', agent: 'o' },
    source: 'fresh',
    fetchedAt: 1,
    schemaVersion: 1,
  } as ResourceEnvelope
}

describe('ResourceRenderer', () => {
  it('renderiza pelo archetype mapeado em resource.registry', () => {
    const { container } = render(ResourceRenderer, {
      props: { resources: [env('automation', 'a', { id: 'a', name: 'F1' })] },
    })
    expect(container.querySelector('[data-testid="automation-list"]')).toBeTruthy()
  })

  it('cai em generic para kind desconhecido', () => {
    const { container } = render(ResourceRenderer, {
      props: { resources: [env('algo-novo' as ResourceKind, 'x', { foo: 1 })] },
    })
    expect(container.querySelector('[data-testid="generic-json-result"]')).toBeTruthy()
  })
})
```

> Os `data-testid` exigem que cada componente alvo exponha o atributo no root. Isso é parte da Task 10 — se necessário, ajustar a ordem das tasks (Task 10 antes de Task 9).

- [ ] **Step 2: Spec FAIL**

```bash
npm test -- --run src/views/intelligenceV2/components/messages/tool-results/ResourceRenderer.spec.ts
```

- [ ] **Step 3: Implementar `ResourceRenderer.vue`**

```vue
<template>
  <div class="flex flex-col gap-3">
    <component
      v-for="group in grouped"
      :key="group.kind"
      :is="group.component"
      :resources="group.items"
      :status="status"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ResourceEnvelope, ResourceKind } from '@chatfunnel/contracts/a2a'
import { resolveResourceRenderer } from '../../../registry/resource.registry'
import type { ToolStatusBlock } from '../../../types/content-block'

const props = defineProps<{
  resources: ResourceEnvelope[]
  status?: ToolStatusBlock
}>()

const grouped = computed(() => {
  const byKind = new Map<ResourceKind, ResourceEnvelope[]>()
  for (const r of props.resources) {
    const list = byKind.get(r.kind) ?? []
    list.push(r)
    byKind.set(r.kind, list)
  }
  return [...byKind.entries()].map(([kind, items]) => {
    const { component } = resolveResourceRenderer(kind)
    return { kind, items, component }
  })
})
</script>
```

- [ ] **Step 4: Specs passam**

```bash
npm test -- --run src/views/intelligenceV2/components/messages/tool-results/ResourceRenderer.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/views/intelligenceV2/components/messages/tool-results/ResourceRenderer.vue \
        src/views/intelligenceV2/components/messages/tool-results/ResourceRenderer.spec.ts
git commit -m "feat(intelV2): adicionar ResourceRenderer baseado em registry por kind"
```

---

### Task 10: Adaptar componentes de resultado para receber `ResourceEnvelope[]`

**Files (modify cada um):**
- `chatfunnel-front/src/views/intelligenceV2/components/messages/tool-results/AutomationList.vue`
- `chatfunnel-front/src/views/intelligenceV2/components/messages/tool-results/TemplateList.vue`
- `chatfunnel-front/src/views/intelligenceV2/components/messages/tool-results/KanbanCardList.vue`
- `chatfunnel-front/src/views/intelligenceV2/components/messages/tool-results/ChannelList.vue`
- `chatfunnel-front/src/views/intelligenceV2/components/messages/tool-results/ContactResult.vue`
- `chatfunnel-front/src/views/intelligenceV2/components/messages/tool-results/AgentResult.vue`
- `chatfunnel-front/src/views/intelligenceV2/components/messages/tool-results/DiscoveryChips.vue`
- `chatfunnel-front/src/views/intelligenceV2/components/messages/tool-results/GenericJsonResult.vue`
- `chatfunnel-front/src/views/intelligenceV2/components/messages/tool-results/BuildSummary.vue`

> Estes componentes hoje recebem o payload achatado do v1 (vindo de `tool_result.content[].data`). Precisam aceitar `resources: ResourceEnvelope[]` e extrair `.data`. Não reescrever o visual — manter template/estilos atuais e trocar **somente a fonte dos dados**.

- [ ] **Step 1: Padrão a aplicar em cada componente**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { ResourceEnvelope } from '@chatfunnel/contracts/a2a'
import type { ToolStatusBlock } from '../../../types/content-block'

const props = defineProps<{
  resources: ResourceEnvelope[]
  status?: ToolStatusBlock
}>()

const rows = computed(() => props.resources.map((r) => r.data))
</script>

<template>
  <div data-testid="automation-list" class="…">
    <!-- iterar `rows` como antes -->
  </div>
</template>
```

Adicionar `data-testid` único em cada componente (no elemento root):

| Componente | `data-testid` |
|------------|---------------|
| `AutomationList.vue` | `automation-list` |
| `TemplateList.vue` | `template-list` |
| `KanbanCardList.vue` | `kanban-card-list` |
| `ChannelList.vue` | `channel-list` |
| `ContactResult.vue` | `contact-result` |
| `AgentResult.vue` | `agent-result` |
| `DiscoveryChips.vue` | `discovery-chips` |
| `GenericJsonResult.vue` | `generic-json-result` |
| `BuildSummary.vue` | `build-summary` |

Para `DiscoveryChips` (que vai receber kinds variados — tag/tag_folder/custom_field/etc.), expor também o kind atual para rotular:

```ts
const props = defineProps<{ resources: ResourceEnvelope[]; status?: ToolStatusBlock }>()
const kind = computed(() => props.resources[0]?.kind)
```

E mapear `kind -> label`:

```ts
const KIND_LABEL: Partial<Record<string, string>> = {
  tag: 'Tags',
  tag_folder: 'Pastas de tags',
  custom_field: 'Campos personalizados',
  moderator: 'Moderadores',
  assistant: 'Assistentes',
  media: 'Mídias',
  kanban_board: 'Quadros de kanban',
}
const label = computed(() => (kind.value ? KIND_LABEL[kind.value] ?? kind.value : ''))
```

- [ ] **Step 2: Specs**

Para cada componente, ajustar os fixtures dos specs já existentes (`DetailCard.spec.ts`, `KanbanCardList.spec.ts`) para passar `resources: ResourceEnvelope[]`. Adicionar smoke test para os demais:

```ts
import { render } from '@testing-library/vue'
import AutomationList from './AutomationList.vue'
import type { ResourceEnvelope } from '@chatfunnel/contracts/a2a'

it('renderiza linhas a partir de resources', () => {
  const env: ResourceEnvelope = {
    envelopeId: 'automation:a',
    kind: 'automation',
    id: 'a',
    data: { id: 'a', name: 'Funil 1' },
    producedBy: { toolName: 'list_automations', toolCallId: 'tc-1', agent: 'orchestrator' },
    source: 'fresh',
    fetchedAt: 1,
    schemaVersion: 1,
  }
  const { getByText } = render(AutomationList, { props: { resources: [env] } })
  expect(getByText('Funil 1')).toBeTruthy()
})
```

- [ ] **Step 3: Typecheck + tests**

```bash
npm run typecheck
npm test -- --run src/views/intelligenceV2/components/messages/tool-results
```

- [ ] **Step 4: Commit**

```bash
git add src/views/intelligenceV2/components/messages/tool-results
git commit -m "refactor(intelV2): adaptar componentes de tool-result para ResourceEnvelope[]"
```

---

### Task 11: `ToolCallCard.vue` — novas props v2

**Files:**
- Modify: `chatfunnel-front/src/views/intelligenceV2/components/messages/ToolCallCard.vue`
- Create: `chatfunnel-front/src/views/intelligenceV2/components/messages/ToolCallCard.spec.ts`

- [ ] **Step 1: Trocar props**

Substituir o `defineProps` atual por:

```ts
import { computed } from 'vue'
import type {
  ToolInvocationBlock,
  ToolStatusBlock,
  ResourceEnvelope,
} from '../../types/content-block'

const props = defineProps<{
  invocation: ToolInvocationBlock
  status?: ToolStatusBlock
  resources: ResourceEnvelope[]
}>()

const state = computed<'running' | 'ok' | 'error'>(() => {
  if (!props.status) return 'running'
  return props.status.status === 'ok' ? 'ok' : 'error'
})
```

- [ ] **Step 2: Atualizar template**

Substituir o uso antigo de `use.name`/`result.content` por `invocation.name`, `resources` e `status`. Onde antes havia `<ToolResultParts :parts="result.content" />`, usar:

```vue
<ResourceRenderer :resources="resources" :status="status" />
```

Root do componente recebe `data-testid="tool-call-card"` e `:data-state="state"`. Quando `state === 'running'` e `resources.length === 0`, mostrar skeleton (usar `Skeleton` de `@/components/ui/skeleton`).

- [ ] **Step 3: Spec mínimo**

```ts
import { render } from '@testing-library/vue'
import ToolCallCard from './ToolCallCard.vue'

it('em estado running quando sem status', () => {
  const { container } = render(ToolCallCard, {
    props: {
      invocation: {
        type: 'tool_invocation',
        id: 'tc-1',
        name: 'list_automations',
        args: {},
        agent: 'orchestrator',
      },
      resources: [],
    },
  })
  expect(container.querySelector('[data-state="running"]')).toBeTruthy()
})

it('em estado ok quando status.status=ok', () => {
  const { container } = render(ToolCallCard, {
    props: {
      invocation: {
        type: 'tool_invocation',
        id: 'tc-1',
        name: 'list_automations',
        args: {},
        agent: 'orchestrator',
      },
      status: { type: 'tool_status', id: 'tc-1', name: 'list_automations', status: 'ok' },
      resources: [],
    },
  })
  expect(container.querySelector('[data-state="ok"]')).toBeTruthy()
})
```

- [ ] **Step 4: Typecheck + tests**

```bash
npm run typecheck
npm test -- --run src/views/intelligenceV2/components/messages/ToolCallCard.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/views/intelligenceV2/components/messages/ToolCallCard.vue \
        src/views/intelligenceV2/components/messages/ToolCallCard.spec.ts
git commit -m "refactor(intelV2): ToolCallCard recebe invocation/status/resources"
```

---

### Task 12: `ContentBlockList.vue` — agrupar por `tool_invocation.id`

**Files:**
- Modify: `chatfunnel-front/src/views/intelligenceV2/components/messages/ContentBlockList.vue`

- [ ] **Step 1: Substituir a lógica de pares `tool_use`/`tool_result`**

Novo render flow:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { PersistedBlock, ResourceEnvelope } from '@chatfunnel/contracts/a2a'
import { useResourceStore } from '../../stores/resource-store'
import ToolCallCard from './ToolCallCard.vue'
import MarkdownText from './MarkdownText.vue' // ou o componente já usado para texto

const props = defineProps<{ blocks: PersistedBlock[] }>()
const store = useResourceStore()

interface ToolGroup {
  kind: 'tool'
  invocation: Extract<PersistedBlock, { type: 'tool_invocation' }>
  status?: Extract<PersistedBlock, { type: 'tool_status' }>
  refs: Extract<PersistedBlock, { type: 'resource_ref' }>[]
}
interface TextRun { kind: 'text'; text: string }
interface Delegation { kind: 'delegation'; block: Extract<PersistedBlock, { type: 'delegation' }> }
type Group = ToolGroup | TextRun | Delegation

const groups = computed<Group[]>(() => {
  const out: Group[] = []
  const toolIndex = new Map<string, ToolGroup>()
  for (const b of props.blocks) {
    if (b.type === 'text') {
      out.push({ kind: 'text', text: b.text })
    } else if (b.type === 'tool_invocation') {
      const g: ToolGroup = { kind: 'tool', invocation: b, refs: [] }
      out.push(g)
      toolIndex.set(b.id, g)
    } else if (b.type === 'resource_ref') {
      toolIndex.get(b.toolCallId)?.refs.push(b)
    } else if (b.type === 'tool_status') {
      const g = toolIndex.get(b.id)
      if (g) g.status = b
    } else if (b.type === 'delegation') {
      out.push({ kind: 'delegation', block: b })
    }
  }
  return out
})

function resolveResources(
  refs: Extract<PersistedBlock, { type: 'resource_ref' }>[],
): ResourceEnvelope[] {
  return refs
    .map((r) => store.get(r.envelopeId))
    .filter((e): e is ResourceEnvelope => Boolean(e))
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <template v-for="(g, i) in groups" :key="i">
      <MarkdownText v-if="g.kind === 'text'" :text="g.text" />
      <ToolCallCard
        v-else-if="g.kind === 'tool'"
        :invocation="g.invocation"
        :status="g.status"
        :resources="resolveResources(g.refs)"
      />
      <div
        v-else-if="g.kind === 'delegation'"
        data-testid="delegation-placeholder"
        class="text-xs text-gray-500"
      >
        Delegação para {{ g.block.agent }}…
      </div>
    </template>
  </div>
</template>
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: zero erros em `ContentBlockList.vue`.

- [ ] **Step 3: Validação manual**

```bash
npm run dev
```

Abrir o chat, enviar "Liste minhas automações" e validar visualmente:
- `ToolCallCard` aparece no estado `running`
- assim que envelopes chegam, lista é renderizada
- `tool_status` muda o card para `ok`/`error`

- [ ] **Step 4: Commit**

```bash
git add src/views/intelligenceV2/components/messages/ContentBlockList.vue
git commit -m "refactor(intelV2): agrupar PersistedBlock por tool_invocation.id"
```

---

### Task 13: `AssistantMessage.vue` — atualizar heurística "has content"

**Files:**
- Modify: `chatfunnel-front/src/views/intelligenceV2/components/messages/AssistantMessage.vue`

- [ ] **Step 1: Substituir a verificação na linha 43**

```ts
import { computed } from 'vue'
import type { PersistedBlock } from '../../types/content-block'

const props = defineProps<{ message: { role: 'assistant'; content: PersistedBlock[] } }>()

const hasContent = computed(() =>
  props.message.content.some((b) => {
    if (b.type === 'text') return b.text.trim().length > 0
    if (b.type === 'tool_invocation') return true
    if (b.type === 'resource_ref') return true
    if (b.type === 'tool_status') return true
    if (b.type === 'delegation') return b.children.length > 0
    return false
  }),
)
```

Remover qualquer referência a `subThread` ou `tool_result`.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: zero erros em `src/views/intelligenceV2`.

- [ ] **Step 3: Commit**

```bash
git add src/views/intelligenceV2/components/messages/AssistantMessage.vue
git commit -m "refactor(intelV2): atualizar heurística hasContent para PersistedBlock"
```

---

### Task 14: Remover `ToolResultParts.vue` e `tool-result.registry.ts`

**Files:**
- Delete: `chatfunnel-front/src/views/intelligenceV2/components/messages/tool-results/ToolResultParts.vue`
- Delete: `chatfunnel-front/src/views/intelligenceV2/registry/tool-result.registry.ts`

> Pré-condição: garantir zero consumidores via Grep.

- [ ] **Step 1: Verificar zero referências**

```bash
cd chatfunnel-front
git grep -n "ToolResultParts\|tool-result\.registry"
```

Expected: nenhum match em `.ts`/`.vue` fora dos próprios arquivos. Se aparecer um consumidor não previsto, parar, migrar antes e voltar.

- [ ] **Step 2: Apagar**

```bash
rm src/views/intelligenceV2/components/messages/tool-results/ToolResultParts.vue
rm src/views/intelligenceV2/registry/tool-result.registry.ts
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: zero erros.

- [ ] **Step 4: Commit**

```bash
git add -A src/views/intelligenceV2
git commit -m "chore(intelV2): remover ToolResultParts e tool-result.registry (v1)"
```

---

## Checklist de validação final (manual)

Após Task 14:

- [ ] `cd chatfunnel-front && npm run typecheck` — **zero erros** em `src/views/intelligenceV2`.
- [ ] `npm test -- --run src/views/intelligenceV2` — todos os specs passam.
- [ ] `npm run dev` + DevTools/Network:
  - [ ] `POST /a2a/chat` carrega `X-A2A-Protocol-Version: 2`.
  - [ ] Stream com prompt "Liste minhas automações" emite eventos `tool_invocation` → `resource`(s) → `tool_status` → `done` (visíveis na aba EventStream).
  - [ ] UI mostra card "running" → lista de automações → estado `ok`.
- [ ] Reload da conversa (clicar em conversa existente na sidebar) renderiza os mesmos cards **sem chamada nova ao MCP** — verificar Network: só `GET /a2a/conversations/{id}/messages`.
- [ ] `present_resource` reexibe envelopes com `source: "replay"` (validar no console: `useResourceStore().get('automation:xxx')?.source === 'replay'`).
- [ ] Evento desconhecido (servidor enviando `event: foo`) é ignorado pelo parser, stream não trava.
- [ ] Cancelar (`AbortController.abort()`) emite `cancelled` → `isStreaming.value === false` sem mensagem fantasma.

---

## Out of scope (próximo plano)

- Sub-thread real de `delegation` (hoje é placeholder).
- Estados parciais animados (skeleton refinado enquanto `running` com resources já chegando).
- Banner / fallback para `schemaVersion` desconhecida.
- Métricas de hit/miss no `ResourceStore` (replay vs fresh).
- Streaming de `delta` com `requestAnimationFrame` (atual `shallowRef` reativo basta — só vale o esforço se aparecer jank em mensagens longas).

---

## Notas para o executor

- **Não tocar `tool-catalog.registry.ts`** — segue válido como metadado por `toolName` (rótulos, ícones, descrições). Caso o `ToolCallCard` precise de label amigável, ler dali via `tool-catalog.registry.get(invocation.name)?.label`.
- **Não editar nada em `node_modules/@chatfunnel/core`** — se faltar export no contracts, parar e pedir ao usuário para regenerar o pacote (regra: build/sync do core é manual).
- **Mensagens user-facing em pt-BR acentuado** ("Carregando", "Erro ao executar a ação", "Tag criada"). Sem anglicismos.
- **`AssistantMessage.vue:43` é o ponto crítico fora da lista de tipos** — não esquecer (Task 13).
- O reducer expõe `_applyEvent`, `_startAssistantMessage`, `_setMessagesFromResponse` e `_resetForTest` com prefixo `_` **apenas para teste** — não consumir esses símbolos do template.
- Após qualquer commit no `chatfunnel-front`, rodar `graphify update .` para manter o grafo atualizado (AST-only, gratuito).
