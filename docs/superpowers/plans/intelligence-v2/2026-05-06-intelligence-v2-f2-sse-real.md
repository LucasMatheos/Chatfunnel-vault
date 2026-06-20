# Intelligence V2 — F2 SSE Real Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o mock do `useIntelligenceChat` por conexao SSE real ao backend A2A, com cancel, throttle 429, health check e historico de conversas via HTTP.

**Architecture:** Codigo novo do zero — sem heranca do V1. Parser SSE extraido em util pura. Todo HTTP centralizado no `IntelligenceV2Service` (`src/common/services/`): metodos REST via `NestApi` (axios) e SSE streaming via `fetch` (axios nao suporta ReadableStream) — composables nunca fazem HTTP direto. Tipos V2 (`kind` discriminated unions) sao o contrato. `StatusMessage` usado para erros, cancelamentos e sucesso — nunca appendar texto na mensagem assistant.

**Tech Stack:** Vue 3, TypeScript strict, Tailwind CSS v4, Pinia (store leve), NestApi axios instance, fetch API (SSE), tipos V2 existentes.

**Referencia backend:** `vault/wiki/features/intelligence-v2-arquitetura.md` secoes 1.1-1.6. Endpoint: `POST /nest/a2a/chat` (SSE), `POST /nest/a2a/chat/:sessionId/cancel`, `GET /nest/a2a/conversations`, `GET /nest/a2a/conversations/:id/messages`, `DELETE /nest/a2a/conversations/:id`, `GET /nest/a2a/health`.

**Referencia service pattern:** `src/common/services/IntelligenceService.js` — object literal com metodos que retornam `NestApi.get()(url, params)`. NestApi injeta Bearer token e Account-Selected via interceptor.

**Criterio F2 "feito":** enviar mensagem no V2, ver texto streamando em tempo real, ver tool_start/tool_result renderizados, cancelar stream, receber 429 e ver countdown, sidebar lista conversas reais do banco, clicar numa conversa carrega mensagens, health badge muda de cor.

---

## File Map

```
chatfunnel-front/src/
├── common/services/
│   └── IntelligenceV2Service.ts            # CREATE: HTTP calls (conversations, messages, health)
└── views/intelligenceV2/
├── utils/
│   ├── sse-parser.ts                       # CREATE: ReadableStream → AsyncGenerator<SseEvent>
│   ├── error-messages.ts                   # CREATE: mensagens pt-BR centralizadas
│   └── destructive-guard.ts                # EXISTS (unchanged)
├── composables/
│   ├── useIntelligenceChat.ts              # REWRITE: SSE real + cancel + throttle + StatusMessage
│   ├── useIntelligenceHistory.ts           # REWRITE: HTTP real para sidebar
│   └── useHealthCheck.ts                   # CREATE: polling GET /health
├── types/
│   ├── sse-event.ts                        # EXISTS (unchanged)
│   ├── message.ts                          # EXISTS (unchanged)
│   └── session.ts                          # MODIFY: add ThrottleState
├── components/
│   ├── chat/
│   │   └── ChatHeader.vue                  # MODIFY: consumir health badge
│   └── layout/
│       └── ChatColumn.vue                  # MODIFY: wiring throttle + scroll anchor
└── IntelligenceV2View.vue                  # MODIFY: wiring real composables + URL restore
```

---

## Task 1: SSE Parser Util

**Files:**
- Create: `src/views/intelligenceV2/utils/sse-parser.ts`

O parser e uma funcao pura que recebe um `ReadableStream<Uint8Array>` e retorna um `AsyncGenerator` de `SseEvent`. Sem dependencias de Vue, sem estado, testavel isolado.

- [ ] **Step 1: Create `sse-parser.ts`**

```typescript
// src/views/intelligenceV2/utils/sse-parser.ts
import type { SseEvent, SseEventType } from '../types/sse-event'

const VALID_EVENTS: Set<string> = new Set<SseEventType>([
  'text',
  'tool_start',
  'tool_result',
  'done',
  'error',
  'cancelled',
])

/**
 * Parses a ReadableStream of SSE bytes into typed SseEvent objects.
 * Follows the SSE spec: events separated by blank lines (\n\n),
 * each event has `event:` and `data:` fields.
 *
 * Usage:
 * ```ts
 * for await (const event of parseSseStream(response.body!)) {
 *   // event is fully typed SseEvent
 * }
 * ```
 */
export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      let eventEnd: number
      while ((eventEnd = buffer.indexOf('\n\n')) !== -1) {
        const eventBlock = buffer.slice(0, eventEnd)
        buffer = buffer.slice(eventEnd + 2)

        const parsed = parseEventBlock(eventBlock)
        if (parsed) yield parsed
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function parseEventBlock(block: string): SseEvent | null {
  let eventType = ''
  const dataLines: string[] = []

  for (const line of block.split('\n')) {
    if (line.startsWith('event: ')) {
      eventType = line.slice(7).trim()
    } else if (line.startsWith('data: ')) {
      dataLines.push(line.slice(6))
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5))
    }
  }

  if (!eventType || dataLines.length === 0) return null
  if (!VALID_EVENTS.has(eventType)) return null

  try {
    const data = JSON.parse(dataLines.join('\n'))
    return { type: eventType, data } as SseEvent
  } catch {
    return null
  }
}
```

---

## Task 2: Error Messages Util

**Files:**
- Create: `src/views/intelligenceV2/utils/error-messages.ts`

Mensagens de erro centralizadas em pt-BR. Usadas pelo composable para criar `StatusMessage`.

- [ ] **Step 1: Create `error-messages.ts`**

```typescript
// src/views/intelligenceV2/utils/error-messages.ts

export const ERROR_MESSAGES = {
  network: 'Não foi possível conectar ao servidor. Verifique sua conexão.',
  generic: 'Ocorreu um erro ao processar sua mensagem. Tente novamente.',
  throttle: 'Limite de mensagens atingido. Aguarde antes de enviar novamente.',
  cancelled: 'Geração interrompida pelo usuário.',
  timeout: 'O servidor demorou demais para responder. Tente novamente.',
  noBody: 'Resposta do servidor sem conteúdo.',
} as const

export type ErrorKey = keyof typeof ERROR_MESSAGES

export function getHttpErrorMessage(status: number): string {
  switch (status) {
    case 429:
      return ERROR_MESSAGES.throttle
    case 408:
    case 504:
      return ERROR_MESSAGES.timeout
    default:
      return ERROR_MESSAGES.generic
  }
}
```

---

## Task 3: Intelligence V2 Service

**Files:**
- Create: `src/common/services/IntelligenceV2Service.ts`

Segue o pattern do projeto (object literal, `NestApi` wrapper, em `src/common/services/`). Import via `@services/IntelligenceV2Service`. Nao usa `IntelligenceService.js` do V1.

- [ ] **Step 1: Create the service**

```typescript
// src/common/services/IntelligenceV2Service.ts
import { NestApi } from '@/common/api'
import { useAuthStore } from '@/stores/auth'

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
  data: Array<{
    id: string
    role: 'user' | 'assistant'
    content: string
    toolCalls: unknown[] | null
    createdAt: string
  }>
  total: number
}

export interface HealthResponse {
  status: 'ok' | 'degraded'
  activeSessions: number
  memoryEnabled: boolean
  checks: { database: 'ok' | 'down' }
}

const nestBaseUrl = (
  (import.meta.env.VITE_NEST_BASE_API as string) || 'http://localhost:3200/'
).replace(/\/$/, '')

function authHeaders(): Record<string, string> {
  const authStore = useAuthStore()
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authStore.token}`,
    'Account-Selected': authStore.accountSelected || '',
  }
}

const IntelligenceV2Service = {
  // --- HTTP via NestApi (axios) ---

  listConversations(params: { page: number; limit: number }) {
    return NestApi.get()('/a2a/conversations', { params })
  },

  getMessages(conversationId: string, params: { page: number; limit: number }) {
    return NestApi.get()(
      `/a2a/conversations/${conversationId}/messages`,
      { params },
    )
  },

  deleteConversation(conversationId: string) {
    return NestApi.delete()(`/a2a/conversations/${conversationId}`)
  },

  getHealth() {
    return NestApi.get()('/a2a/health')
  },

  // --- SSE via fetch (axios nao suporta ReadableStream) ---

  streamChat(
    params: { sessionId: string; message: string; conversationId?: string },
    signal?: AbortSignal,
  ): Promise<Response> {
    return fetch(`${nestBaseUrl}/a2a/chat`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(params),
      signal,
    })
  },

  cancelStream(sessionId: string): Promise<Response> {
    return fetch(`${nestBaseUrl}/a2a/chat/${sessionId}/cancel`, {
      method: 'POST',
      headers: authHeaders(),
    })
  },
}

export default IntelligenceV2Service
```

---

## Task 4: Extend Session Types

**Files:**
- Modify: `src/views/intelligenceV2/types/session.ts`

Adicionar `ThrottleState` e corrigir `HealthStatus` para refletir o retorno real do backend (`'ok' | 'degraded'`) mais `'offline'` para falha de rede no client.

- [ ] **Step 1: Update session.ts**

Substituir `HealthStatus` existente e adicionar `ThrottleState` ao final do arquivo:

```typescript
// Replace existing HealthStatus and append ThrottleState

// Backend retorna 'ok' | 'degraded'. 'offline' e estado client-side (fetch falhou).
export type HealthStatus = 'ok' | 'degraded' | 'offline'

export interface ThrottleState {
  active: boolean
  retryAfter: Date | null
}
```

---

## Task 5: Rewrite `useIntelligenceChat`

**Files:**
- Rewrite: `src/views/intelligenceV2/composables/useIntelligenceChat.ts`

O composable principal. Codigo novo do zero. Responsabilidades:
- Gerenciar `sessionId` (efemero, por reload) e `conversationId` (persistente, do `done` event)
- SSE streaming e cancel via `IntelligenceV2Service.streamChat()` / `.cancelStream()`
- Consumir `parseSseStream` para iterar eventos tipados
- Criar `StatusMessage` para erros e cancelamentos (nunca appendar texto no assistant)
- Fallback timeout 3s no cancel
- Throttle 429 com `Retry-After` header
- Load conversation do DB via `IntelligenceV2Service.getMessages()`

- [ ] **Step 1: Rewrite the composable**

```typescript
// src/views/intelligenceV2/composables/useIntelligenceChat.ts
import { ref } from 'vue'
import { parseSseStream } from '../utils/sse-parser'
import { ERROR_MESSAGES, getHttpErrorMessage } from '../utils/error-messages'
import IntelligenceV2Service from '@services/IntelligenceV2Service'
import type {
  ChatMessage,
  AssistantTextMessage,
  StatusMessage,
  ToolCallInfo,
} from '../types/message'
import type { SseEvent } from '../types/sse-event'
import type { ThrottleState, UsageInfo } from '../types/session'

function uid(): string {
  return crypto.randomUUID()
}

export function useIntelligenceChat() {
  const messages = ref<ChatMessage[]>([])
  const isStreaming = ref(false)
  const isCancelling = ref(false)
  const isRestoringConversation = ref(false)
  const sessionId = ref(uid())
  const conversationId = ref<string | null>(null)
  const lastUsage = ref<UsageInfo | null>(null)
  const throttle = ref<ThrottleState>({ active: false, retryAfter: null })

  let abortController: AbortController | null = null
  let cancelFallbackTimer: ReturnType<typeof setTimeout> | null = null
  let throttleTimer: ReturnType<typeof setTimeout> | null = null

  // --- Helpers ---

  function pushStatus(
    variant: StatusMessage['variant'],
    title: string,
    description: string,
  ) {
    messages.value.push({
      kind: 'status',
      id: uid(),
      variant,
      title,
      description,
      timestamp: new Date(),
    })
  }

  function currentAssistant(): AssistantTextMessage | null {
    const last = messages.value[messages.value.length - 1]
    if (last && last.kind === 'assistant_text') return last
    return null
  }

  // --- SSE Event Handlers ---

  function handleEvent(event: SseEvent) {
    const assistant = currentAssistant()

    switch (event.type) {
      case 'text': {
        if (assistant) {
          assistant.content += event.data.content
        }
        break
      }

      case 'tool_start': {
        if (assistant) {
          assistant.toolCalls.push({
            id: event.data.id,
            name: event.data.name,
            status: 'running',
            input: event.data.input,
            textOffset: event.data.textOffset ?? assistant.content.length,
          })
        }
        break
      }

      case 'tool_result': {
        if (!assistant) break
        const tc = assistant.toolCalls.find((t) => t.id === event.data.id)
        if (!tc) break

        if (event.data.isError) {
          tc.status = 'error'
          tc.error = event.data.result
        } else {
          tc.status = 'done'
          tc.result = event.data.result
        }
        break
      }

      case 'done': {
        if (event.data.conversationId) {
          conversationId.value = event.data.conversationId
        }
        lastUsage.value = event.data.usage
        // Mark any still-running tools as done
        if (assistant) {
          for (const tc of assistant.toolCalls) {
            if (tc.status === 'running') tc.status = 'done'
          }
        }
        isStreaming.value = false
        break
      }

      case 'error': {
        isStreaming.value = false
        pushStatus('error', 'Erro', event.data.message || ERROR_MESSAGES.generic)
        break
      }

      case 'cancelled': {
        if (cancelFallbackTimer) {
          clearTimeout(cancelFallbackTimer)
          cancelFallbackTimer = null
        }
        // Mark running tools as cancelled
        if (assistant) {
          for (const tc of assistant.toolCalls) {
            if (tc.status === 'running') tc.status = 'cancelled'
          }
        }
        isStreaming.value = false
        isCancelling.value = false
        pushStatus('cancelled', 'Interrompido', ERROR_MESSAGES.cancelled)
        break
      }
    }
  }

  // --- Throttle ---

  function activateThrottle(retryAfterSeconds: number) {
    const retryAt = new Date(Date.now() + retryAfterSeconds * 1000)
    throttle.value = { active: true, retryAfter: retryAt }

    if (throttleTimer) clearTimeout(throttleTimer)
    throttleTimer = setTimeout(() => {
      throttle.value = { active: false, retryAfter: null }
      throttleTimer = null
    }, retryAfterSeconds * 1000)
  }

  // --- Public API ---

  async function send(text: string) {
    if (isStreaming.value || throttle.value.active) return

    // Push user message
    messages.value.push({
      kind: 'user',
      id: uid(),
      content: text,
      timestamp: new Date(),
    })

    isStreaming.value = true

    // Push empty assistant message (will be filled by SSE)
    const assistantMsg: AssistantTextMessage = {
      kind: 'assistant_text',
      id: uid(),
      content: '',
      toolCalls: [],
      timestamp: new Date(),
    }
    messages.value.push(assistantMsg)

    abortController = new AbortController()

    try {
      const response = await IntelligenceV2Service.streamChat(
        {
          sessionId: sessionId.value,
          message: text,
          ...(conversationId.value && { conversationId: conversationId.value }),
        },
        abortController.signal,
      )

      // Handle 429 throttle
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10)
        activateThrottle(retryAfter)
        // Remove the empty assistant message
        messages.value.pop()
        isStreaming.value = false
        pushStatus('error', 'Limite atingido', ERROR_MESSAGES.throttle)
        return
      }

      if (!response.ok) {
        messages.value.pop()
        isStreaming.value = false
        pushStatus('error', 'Erro', getHttpErrorMessage(response.status))
        return
      }

      if (!response.body) {
        messages.value.pop()
        isStreaming.value = false
        pushStatus('error', 'Erro', ERROR_MESSAGES.noBody)
        return
      }

      // Stream SSE events
      for await (const event of parseSseStream(response.body)) {
        handleEvent(event)
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return

      const isNetwork = err instanceof TypeError
      const assistant = currentAssistant()

      // Remove empty assistant if no content was streamed
      if (assistant && !assistant.content && assistant.toolCalls.length === 0) {
        messages.value.pop()
      }

      pushStatus(
        'error',
        'Erro de conexao',
        isNetwork ? ERROR_MESSAGES.network : ERROR_MESSAGES.generic,
      )
    } finally {
      abortController = null
      isStreaming.value = false
      isCancelling.value = false
      if (cancelFallbackTimer) {
        clearTimeout(cancelFallbackTimer)
        cancelFallbackTimer = null
      }
    }
  }

  async function cancel() {
    if (!abortController) {
      isCancelling.value = false
      isStreaming.value = false
      return
    }

    isCancelling.value = true

    // Signal backend to cancel
    try {
      await IntelligenceV2Service.cancelStream(sessionId.value)
    } catch {
      // Network error — fallback will handle it
    }

    // Fallback: force abort after 3s if server doesn't send 'cancelled' event
    cancelFallbackTimer = setTimeout(() => {
      if (isStreaming.value) {
        abortController?.abort()
        abortController = null
        isStreaming.value = false
        isCancelling.value = false
      }
    }, 3000)
  }

  async function loadConversation(id: string) {
    cancel()
    isRestoringConversation.value = true

    try {
      const res = await IntelligenceV2Service.getMessages(id, { page: 1, limit: 200 })
      const dbMessages = res.data?.data || []

      messages.value = dbMessages.map((msg): ChatMessage => {
        if (msg.role === 'user') {
          return {
            kind: 'user',
            id: msg.id,
            content: msg.content,
            timestamp: new Date(msg.createdAt),
          }
        }
        return {
          kind: 'assistant_text',
          id: msg.id,
          content: msg.content,
          toolCalls: Array.isArray(msg.toolCalls)
            ? (msg.toolCalls as ToolCallInfo[]).map((tc) => ({
                ...tc,
                status: tc.status === 'running' ? 'done' : tc.status,
              }))
            : [],
          timestamp: new Date(msg.createdAt),
        }
      })

      conversationId.value = id
      sessionId.value = uid()
    } catch {
      // NestApi interceptor handles error toast
    } finally {
      isRestoringConversation.value = false
    }
  }

  function resetChat() {
    cancel()
    messages.value = []
    sessionId.value = uid()
    conversationId.value = null
    lastUsage.value = null
  }

  return {
    messages,
    isStreaming,
    isCancelling,
    isRestoringConversation,
    conversationId,
    lastUsage,
    throttle,
    send,
    cancel,
    loadConversation,
    resetChat,
  }
}
```

---

## Task 6: Rewrite `useIntelligenceHistory`

**Files:**
- Rewrite: `src/views/intelligenceV2/composables/useIntelligenceHistory.ts`

Substitui mock por chamadas HTTP reais via `IntelligenceV2Service`.

- [ ] **Step 1: Rewrite the composable**

```typescript
// src/views/intelligenceV2/composables/useIntelligenceHistory.ts
import { ref } from 'vue'
import IntelligenceV2Service from '@services/IntelligenceV2Service'
import type { ConversationPreview } from '../types/session'

export function useIntelligenceHistory() {
  const conversations = ref<ConversationPreview[]>([])
  const loading = ref(false)
  const activeConversationId = ref<string | null>(null)

  async function loadConversations() {
    loading.value = true
    try {
      const res = await IntelligenceV2Service.listConversations({ page: 1, limit: 50 })
      const data = res.data?.data || []

      conversations.value = data.map((c) => ({
        id: c.id,
        title: c.title || 'Conversa sem titulo',
        updatedAt: c.updatedAt,
        messageCount: c._count?.messages ?? 0,
      }))
    } catch {
      // NestApi interceptor handles error toast
    } finally {
      loading.value = false
    }
  }

  async function deleteConversation(id: string) {
    try {
      await IntelligenceV2Service.deleteConversation(id)
      conversations.value = conversations.value.filter((c) => c.id !== id)
      if (activeConversationId.value === id) {
        activeConversationId.value = null
      }
    } catch {
      // NestApi interceptor handles error toast
    }
  }

  function addOrUpdateConversation(preview: ConversationPreview) {
    const idx = conversations.value.findIndex((c) => c.id === preview.id)
    if (idx >= 0) {
      conversations.value[idx] = preview
    } else {
      conversations.value.unshift(preview)
    }
  }

  function setActive(id: string | null) {
    activeConversationId.value = id
  }

  return {
    conversations,
    loading,
    activeConversationId,
    loadConversations,
    deleteConversation,
    addOrUpdateConversation,
    setActive,
  }
}
```

---

## Task 7: Create `useHealthCheck`

**Files:**
- Create: `src/views/intelligenceV2/composables/useHealthCheck.ts`

Polling `GET /a2a/health` a cada 5 minutos. Expoe `status: Ref<HealthStatus>`.

- [ ] **Step 1: Create the composable**

```typescript
// src/views/intelligenceV2/composables/useHealthCheck.ts
import { ref, onMounted, onUnmounted } from 'vue'
import IntelligenceV2Service from '@services/IntelligenceV2Service'
import type { HealthStatus } from '../types/session'

const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

export function useHealthCheck() {
  const status = ref<HealthStatus>('ok')
  let timer: ReturnType<typeof setInterval> | null = null

  async function check() {
    try {
      const res = await IntelligenceV2Service.getHealth()
      status.value = res.data?.status ?? 'ok'
    } catch {
      status.value = 'offline'
    }
  }

  onMounted(() => {
    check()
    timer = setInterval(check, POLL_INTERVAL_MS)
  })

  onUnmounted(() => {
    if (timer) clearInterval(timer)
  })

  return { status, check }
}
```

---

## Task 8: Wire View + ChatColumn + ChatHeader

**Files:**
- Modify: `src/views/intelligenceV2/IntelligenceV2View.vue`
- Modify: `src/views/intelligenceV2/components/layout/ChatColumn.vue`
- Modify: `src/views/intelligenceV2/components/chat/ChatHeader.vue`

Conectar os composables reais na view, adicionar URL restore, sidebar real, health badge no header e throttle state no chat.

- [ ] **Step 1: Rewrite `IntelligenceV2View.vue`**

```vue
<!-- src/views/intelligenceV2/IntelligenceV2View.vue -->
<template>
  <div class="flex min-h-dvh gap-3 bg-gray-200 p-[6px]">
    <ConversationsSidebar
      :conversations="conversations"
      :active-id="activeConversationId"
      :loading="historyLoading"
      @select="handleSelectConversation"
      @delete="handleDeleteConversation"
      @new-conversation="handleNewConversation"
    />

    <ChatColumn
      :messages="messages"
      :is-streaming="isStreaming"
      :mode="mode"
      :throttle="throttle"
      :health-status="healthStatus"
      @send="handleSend"
      @cancel="handleCancel"
      @open-catalog="handleOpenCatalog"
    />

    <ArtifactPanel
      v-if="artifactOpen"
      :artifact="artifact"
      @close="artifactOpen = false"
    />

    <ToolCatalogModal
      v-if="catalogModule"
      :module-id="catalogModule"
      @select-tool="handleToolSelect"
      @close="catalogModule = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConversationsSidebar from './components/layout/ConversationsSidebar.vue'
import ChatColumn from './components/layout/ChatColumn.vue'
import ArtifactPanel from './components/layout/ArtifactPanel.vue'
import ToolCatalogModal from './components/chat/ToolCatalogModal.vue'
import { useIntelligenceChat } from './composables/useIntelligenceChat'
import { useIntelligenceHistory } from './composables/useIntelligenceHistory'
import { useHealthCheck } from './composables/useHealthCheck'
import type { ModuleId } from './registry/tool-catalog.registry'

const route = useRoute()
const router = useRouter()

const {
  messages,
  isStreaming,
  isCancelling,
  isRestoringConversation,
  conversationId,
  throttle,
  send,
  cancel,
  loadConversation,
  resetChat,
} = useIntelligenceChat()

const {
  conversations,
  loading: historyLoading,
  activeConversationId,
  loadConversations,
  deleteConversation,
  addOrUpdateConversation,
  setActive,
} = useIntelligenceHistory()

const { status: healthStatus } = useHealthCheck()

const mode = computed(() => (messages.value.length > 0 ? 'chat' : 'home'))
const artifactOpen = ref(false)
const artifact = ref<unknown>(null)
const catalogModule = ref<ModuleId | null>(null)

const STORAGE_KEY = 'intelligenceV2_active_conversation'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

let lastUserMessage = ''

// --- Lifecycle ---

onMounted(async () => {
  await loadConversations()

  const fromUrl = route.query.conversation as string
  const fromStorage = sessionStorage.getItem(STORAGE_KEY)
  const restoreId =
    fromUrl && UUID_RE.test(fromUrl)
      ? fromUrl
      : fromStorage && UUID_RE.test(fromStorage)
        ? fromStorage
        : null

  if (restoreId) {
    try {
      await loadConversation(restoreId)
      setActive(restoreId)
      router.replace({ query: { conversation: restoreId } })
    } catch {
      sessionStorage.removeItem(STORAGE_KEY)
      router.replace({ query: {} })
    }
  }
})

onUnmounted(() => {
  cancel()
  if (activeConversationId.value) {
    sessionStorage.setItem(STORAGE_KEY, activeConversationId.value)
  } else {
    sessionStorage.removeItem(STORAGE_KEY)
  }
})

// --- Handlers ---

function handleSend(text: string) {
  lastUserMessage = text
  send(text)
}

function handleCancel() {
  cancel()
}

function handleSelectConversation(id: string) {
  setActive(id)
  loadConversation(id)
  router.replace({ query: { conversation: id } })
}

async function handleDeleteConversation(id: string) {
  const wasActive = activeConversationId.value === id
  await deleteConversation(id)
  if (wasActive) {
    resetChat()
    sessionStorage.removeItem(STORAGE_KEY)
    router.replace({ query: {} })
  }
}

function handleNewConversation() {
  resetChat()
  setActive(null)
  sessionStorage.removeItem(STORAGE_KEY)
  router.replace({ query: {} })
}

function handleOpenCatalog(moduleId: ModuleId) {
  catalogModule.value = moduleId
}

function handleToolSelect(prompt: string) {
  catalogModule.value = null
  send(prompt)
}

// --- Watchers ---

watch(conversationId, (newId, oldId) => {
  if (newId && newId !== oldId && !isRestoringConversation.value) {
    setActive(newId)
    addOrUpdateConversation({
      id: newId,
      title:
        lastUserMessage.substring(0, 50).trim() +
        (lastUserMessage.length > 50 ? '...' : ''),
      updatedAt: new Date().toISOString(),
      messageCount: messages.value.length,
    })
    router.replace({ query: { conversation: newId } })
  }
}, { flush: 'sync' })
</script>
```

- [ ] **Step 2: Update `ChatColumn.vue` props**

```vue
<!-- src/views/intelligenceV2/components/layout/ChatColumn.vue -->
<template>
  <Card class="min-w-0 flex-1 overflow-hidden p-0">
    <ChatHeader :health-status="healthStatus" />

    <Separator />

    <div v-if="mode === 'home'" class="flex flex-1 flex-col items-center justify-center gap-8 p-6">
      <EmptyState @open-catalog="emit('open-catalog', $event)" />
    </div>

    <template v-else>
      <div
        ref="messagesRef"
        class="messages-scroll flex flex-1 flex-col gap-5 overflow-y-auto bg-gray-50 p-6"
      >
        <MessageRenderer
          v-for="msg in messages"
          :key="msg.id"
          :message="msg"
        />
        <div ref="scrollAnchor" />
      </div>
    </template>

    <Separator />

    <div v-if="throttle.active" class="flex items-center justify-center gap-2 bg-amber-50 px-4 py-2">
      <span class="typo-body-12-regular text-amber-700">
        Limite atingido. Tente novamente em breve.
      </span>
    </div>

    <ChatInput
      :is-streaming="isStreaming"
      :disabled="throttle.active"
      @send="emit('send', $event)"
      @cancel="emit('cancel')"
    />
  </Card>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import ChatHeader from '../chat/ChatHeader.vue'
import ChatInput from '../chat/ChatInput.vue'
import EmptyState from '../chat/EmptyState.vue'
import MessageRenderer from '../messages/MessageRenderer.vue'
import type { ChatMessage } from '../../types/message'
import type { ThrottleState, HealthStatus } from '../../types/session'
import type { ModuleId } from '../../registry/tool-catalog.registry'

interface Props {
  messages: ChatMessage[]
  isStreaming: boolean
  mode: 'home' | 'chat'
  throttle: ThrottleState
  healthStatus: HealthStatus
}

const props = defineProps<Props>()

const emit = defineEmits<{
  send: [text: string]
  cancel: []
  'open-catalog': [moduleId: ModuleId]
}>()

const scrollAnchor = ref<HTMLElement | null>(null)

function scrollToBottom() {
  nextTick(() => {
    setTimeout(() => {
      scrollAnchor.value?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, 50)
  })
}

watch(() => props.messages.length, scrollToBottom)
watch(() => props.isStreaming, scrollToBottom)
watch(
  () => {
    const last = props.messages[props.messages.length - 1]
    if (last?.kind === 'assistant_text') return last.content.length
    return 0
  },
  scrollToBottom,
)
</script>

<style scoped>
.messages-scroll {
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.15) transparent;
}

.messages-scroll::-webkit-scrollbar {
  width: 4px;
}

.messages-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.messages-scroll::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.15);
  border-radius: 9999px;
}
</style>
```

- [ ] **Step 3: Update `ChatHeader.vue` with health badge**

```vue
<!-- src/views/intelligenceV2/components/chat/ChatHeader.vue -->
<template>
  <div class="flex items-center gap-3 px-5 py-3.5">
    <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500">
      <PhLightning :size="16" weight="fill" class="text-white" />
    </div>

    <div class="flex flex-col">
      <span class="typo-body-14-semibold text-gray-900">Intelligence</span>
      <span class="flex items-center gap-1.5 typo-body-12-regular" :class="statusTextClass">
        <span
          class="inline-block h-[6px] w-[6px] rounded-full"
          :class="statusDotClass"
          aria-hidden="true"
        />
        {{ statusLabel }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { PhLightning } from '@phosphor-icons/vue'
import type { HealthStatus } from '../../types/session'

const props = withDefaults(
  defineProps<{ healthStatus?: HealthStatus }>(),
  { healthStatus: 'ok' },
)

const statusDotClass = computed(() => {
  switch (props.healthStatus) {
    case 'ok':
      return 'bg-green-500'
    case 'degraded':
      return 'bg-amber-500'
    case 'offline':
      return 'bg-red-500'
  }
})

const statusTextClass = computed(() => {
  switch (props.healthStatus) {
    case 'ok':
      return 'text-green-700'
    case 'degraded':
      return 'text-amber-700'
    case 'offline':
      return 'text-red-700'
  }
})

const statusLabel = computed(() => {
  switch (props.healthStatus) {
    case 'ok':
      return 'Online'
    case 'degraded':
      return 'Instavel'
    case 'offline':
      return 'Offline'
  }
})
</script>
```

---

## Task 9: Ajustes em componentes F1 para compatibilidade

**Files:**
- Modify: `src/views/intelligenceV2/components/layout/ConversationsSidebar.vue`
- Modify: `src/views/intelligenceV2/components/chat/ChatInput.vue`
- Modify: `src/views/intelligenceV2/components/messages/MessageRenderer.vue`

Tres componentes do F1 precisam de ajustes para funcionar com os composables reais.

- [ ] **Step 1: Adicionar emit `delete` na `ConversationsSidebar.vue`**

Adicionar botao de delete em cada conversa e o emit correspondente:

```vue
<!-- Substituir o <button> de cada conversa por este bloco -->
<div
  v-for="conv in conversations"
  :key="conv.id"
  :class="cn(
    'group flex w-full items-center gap-2 rounded-cf-sm px-3 py-2.5 text-left transition-colors',
    conv.id === activeId
      ? 'bg-brand-100'
      : 'hover:bg-gray-200'
  )"
>
  <button class="flex min-w-0 flex-1 flex-col gap-1" @click="emit('select', conv.id)">
    <span class="truncate typo-body-14-semibold text-gray-1000">{{ conv.title }}</span>
    <span class="typo-body-12-regular text-gray-500">{{ formatTime(conv.updatedAt) }}</span>
  </button>
  <button
    class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
    aria-label="Excluir conversa"
    @click.stop="emit('delete', conv.id)"
  >
    <PhTrash :size="14" class="text-gray-500 hover:text-red-500" />
  </button>
</div>
```

Atualizar imports e emits:

```typescript
// Adicionar PhTrash ao import
import { PhPlus, PhMagnifyingGlass, PhTrash } from '@phosphor-icons/vue'

// Atualizar emits
const emit = defineEmits<{
  select: [id: string]
  delete: [id: string]
  'new-conversation': []
}>()
```

- [ ] **Step 2: Adicionar prop `disabled` no `ChatInput.vue`**

```typescript
// Atualizar interface Props
interface Props {
  isStreaming: boolean
  disabled?: boolean
}

// Atualizar canSend computed
const canSend = computed(() => input.value.trim().length > 0 && !props.isStreaming && !props.disabled)
```

Adicionar classe visual de disabled no textarea:

```vue
<!-- Adicionar :disabled ao textarea -->
<textarea
  ref="textareaRef"
  v-model="input"
  :disabled="disabled"
  class="h-[120px] w-full resize-none bg-transparent typo-body-14-regular text-gray-1000 placeholder-gray-500 outline-none disabled:cursor-not-allowed disabled:opacity-50"
  placeholder="Mensagem para o ChatFunnel..."
  rows="3"
  @keydown.enter.exact.prevent="handleSend"
/>
```

- [ ] **Step 3: Tratar variant `cancelled` no `MessageRenderer.vue`**

Atualizar o bloco `status` para distinguir 3 variantes:

```vue
<!-- Substituir o bloco Alert existente por: -->
<Alert
  v-else-if="message.kind === 'status'"
  :variant="message.variant === 'error' ? 'destructive' : 'default'"
  :class="cn(
    'rounded-cf-md border-l-[3px]',
    message.variant === 'error' && 'border-red-400 bg-red-100',
    message.variant === 'cancelled' && 'border-amber-400 bg-amber-50',
    message.variant === 'success' && 'border-green-500 bg-green-100',
  )"
>
  <AlertTitle>{{ message.title }}</AlertTitle>
  <AlertDescription>{{ message.description }}</AlertDescription>
</Alert>
```

---

## Task 10: Manual Test Checklist

Antes de considerar F2 pronto, validar manualmente:

- [ ] **Step 1: Start dev server**

```bash
cd chatfunnel-front && npm run dev
```

Navegar para `http://localhost:5173/app/intelligenceV2`

- [ ] **Step 2: Test SSE streaming**

1. Digitar uma mensagem e enviar
2. Verificar que o texto do assistant aparece streaming (caracter por caracter)
3. Verificar que tool_start mostra card com status "running"
4. Verificar que tool_result atualiza o card para "done" ou "error"
5. Verificar que `StatusMessage` **nao** aparece para fluxo normal (so para erros)

- [ ] **Step 3: Test cancel**

1. Enviar mensagem
2. Clicar cancel durante o streaming
3. Verificar que aparece `StatusMessage` com variant "cancelled"
4. Verificar que tools em "running" mudam para "cancelled"

- [ ] **Step 4: Test sidebar**

1. Verificar que a sidebar lista conversas reais do banco
2. Clicar numa conversa → mensagens carregam
3. Clicar "Nova conversa" → limpa tudo
4. Deletar conversa → some da lista

- [ ] **Step 5: Test URL restore**

1. Enviar mensagem (cria conversationId)
2. Dar refresh na pagina (F5)
3. Verificar que a conversa e restaurada via URL query `?conversation=uuid`

- [ ] **Step 6: Test health badge**

1. Verificar que o header mostra "Online" com dot verde
2. (Opcional) Parar o backend e verificar que muda para "Offline" apos 5 min

---

## Resumo de mudancas

| Arquivo | Acao | Linhas estimadas |
|---------|------|-----------------|
| `utils/sse-parser.ts` | CREATE | ~65 |
| `utils/error-messages.ts` | CREATE | ~20 |
| `common/services/IntelligenceV2Service.ts` | CREATE | ~75 |
| `types/session.ts` | MODIFY | +5 |
| `composables/useIntelligenceChat.ts` | REWRITE | ~250 |
| `composables/useIntelligenceHistory.ts` | REWRITE | ~55 |
| `composables/useHealthCheck.ts` | CREATE | ~30 |
| `IntelligenceV2View.vue` | REWRITE | ~120 |
| `components/layout/ChatColumn.vue` | MODIFY | ~90 |
| `components/chat/ChatHeader.vue` | MODIFY | ~55 |
| `components/layout/ConversationsSidebar.vue` | MODIFY | +15 (delete emit) |
| `components/chat/ChatInput.vue` | MODIFY | +5 (disabled prop) |
| `components/messages/MessageRenderer.vue` | MODIFY | +3 (cancelled variant) |
| **Total** | | **~790** |
