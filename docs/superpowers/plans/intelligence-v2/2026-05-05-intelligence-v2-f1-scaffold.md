# Intelligence V2 — F1 Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold da pasta `intelligenceV2` com layout 3-pane card-based, roteamento, tipos, composables com mock e navegacao funcional entre empty state e conversa com mensagens estaticas.

**Architecture:** Vue 3 + `<script setup lang="ts">` + Tailwind CSS v4. Layout card-based (sidebar card + chat card em fundo gray). Composables com dados mock — conexao real ao backend SSE fica pra F2. Reutiliza patterns do v1 (`useA2aChat`/`useA2aHistory`) mas reescrito em TS estrito.

**Tech Stack:** Vue 3, TypeScript, Tailwind CSS v4, Pinia, Phosphor Icons (`@phosphor-icons/vue`), shadcn-vue (`src/components/ui/`)

**shadcn-vue obrigatorio:** TODOS os componentes devem usar a base `ui/` quando disponivel. Nunca reimplementar overlay, botoes, cards ou separadores manualmente.

| Necessidade | Componente ui/ | Import |
|-------------|---------------|--------|
| Panes do layout (sidebar, chat, artifact) | `Card` | `@/components/ui/card` |
| Linhas divisorias | `Separator` | `@/components/ui/separator` |
| Botoes (send, cancel, close, +) | `Button` (CVA variants) | `@/components/ui/button` |
| Modal de tools | `Dialog`/`DialogContent`/`DialogHeader`/`DialogBody`/`DialogClose` | `@/components/ui/dialog` |
| Health badge | `Badge` (variant agent) | `@/components/ui/badge` |
| Loading states | `Skeleton` | `@/components/ui/skeleton` |
| Class merging | `cn()` | `@/common/utils/cn` |

**Tokens obrigatorios:** `rounded-cf-xxl` (nao `rounded-2xl`), `shadow-sombra-1` (nao `shadow-sm`), `bg-gray-100` (nao `bg-white`), `text-gray-1000` (nao `text-gray-800`).

**Tipografia — usar tokens de `typography-utilities.css`:**

| Uso | Prototipo Pencil | Token |
|-----|-----------------|-------|
| Hero title | 28/700 | `typo-header-28-bold` |
| Modal title | 18/700 | `typo-body-18-bold` |
| Sidebar "Conversas", Header "Intelligence" | 16/700 | `typo-body-16-bold` |
| Card titles, conv title | 14/600 | `typo-body-14-semibold` |
| ToolCall name | 14/500 | `typo-body-14-medium` |
| Body text, input, messages | 14/400 | `typo-body-14-regular` |
| Subtextos, tool names, timestamps | 12/400 | `typo-body-12-regular` |
| Helper text, / comandos | 11/400 | `typo-body-10-regular` |

**Referencia:** `vault/wiki/features/intelligence-v2-arquitetura.md` — plano completo de arquitetura com backend A2A, decisoes de UX e prototipos Pencil.

**Criterio F1 "feito":** navegar pra `/app/intelligenceV2`, ver empty state com 6 module cards, clicar num card e ver modal de tools, trocar pra modo conversa com mensagens mock (user + AI + tool call), sidebar com conversas mock, textarea funcional.

---

## File Map

```
chatfunnel-front/src/
├── router/index.js                          # MODIFY: add intelligenceV2 route
├── views/intelligenceV2/
│   ├── IntelligenceV2View.vue               # CREATE: entry point, 3-pane orchestrator
│   ├── types/
│   │   ├── sse-event.ts                     # CREATE: 6 SSE event types
│   │   ├── message.ts                       # CREATE: Message discriminated union
│   │   └── session.ts                       # CREATE: session + usage types
│   ├── components/
│   │   ├── layout/
│   │   │   ├── ConversationsSidebar.vue     # CREATE: sidebar card com lista de conversas
│   │   │   ├── ChatColumn.vue               # CREATE: chat card (header + messages + input)
│   │   │   └── ArtifactPanel.vue            # CREATE: slide-out placeholder
│   │   ├── chat/
│   │   │   ├── ChatHeader.vue               # CREATE: titulo + health badge
│   │   │   ├── ChatInput.vue                # CREATE: textarea 120px + botoes
│   │   │   ├── EmptyState.vue               # CREATE: hero + module cards
│   │   │   ├── ToolCatalogModal.vue         # CREATE: modal de tools por modulo
│   │   │   └── PhIcon.vue                   # CREATE: dynamic phosphor icon helper
│   │   └── messages/
│   │       ├── MessageRenderer.vue          # CREATE: switch por message.kind
│   │       ├── UserMessage.vue              # CREATE: bubble direita
│   │       ├── AssistantText.vue            # CREATE: avatar + texto
│   │       └── ToolCallCard.vue             # CREATE: loading/done/error wrapper
│   ├── composables/
│   │   ├── useIntelligenceChat.ts           # CREATE: mock messages + send/cancel shell
│   │   └── useIntelligenceHistory.ts        # CREATE: mock conversations
│   ├── registry/
│   │   └── tool-catalog.registry.ts         # CREATE: moduleId → tools com titulo/prompt
│   └── utils/
│       └── destructive-guard.ts             # CREATE: isDestructive(text): boolean
```

---

## Task 1: Types Foundation

**Files:**
- Create: `src/views/intelligenceV2/types/sse-event.ts`
- Create: `src/views/intelligenceV2/types/message.ts`
- Create: `src/views/intelligenceV2/types/session.ts`

- [ ] **Step 1: Create SSE event types**

```typescript
// src/views/intelligenceV2/types/sse-event.ts

export interface SseTextEvent {
  type: 'text'
  data: { content: string }
}

export interface SseToolStartEvent {
  type: 'tool_start'
  data: {
    id: string
    name: string
    input: Record<string, unknown>
    textOffset: number
  }
}

export interface SseToolResultEvent {
  type: 'tool_result'
  data: {
    id: string
    name: string
    result: string
    isError?: boolean
  }
}

export interface SseDoneEvent {
  type: 'done'
  data: {
    usage: {
      inputTokens: number
      outputTokens: number
      totalTokens: number
      costUsd: number
    }
    finishReason: string
    conversationId: string
  }
}

export interface SseErrorEvent {
  type: 'error'
  data: {
    message: string
    cause?: string
  }
}

export interface SseCancelledEvent {
  type: 'cancelled'
  data: { reason: 'user_requested' }
}

export type SseEvent =
  | SseTextEvent
  | SseToolStartEvent
  | SseToolResultEvent
  | SseDoneEvent
  | SseErrorEvent
  | SseCancelledEvent

export type SseEventType = SseEvent['type']
```

- [ ] **Step 2: Create message types**

```typescript
// src/views/intelligenceV2/types/message.ts

export type ToolCallStatus = 'running' | 'done' | 'error' | 'cancelled'

export interface ToolCallInfo {
  id: string
  name: string
  status: ToolCallStatus
  input?: Record<string, unknown>
  result?: string
  error?: string
  textOffset?: number
}

export interface UserMessage {
  kind: 'user'
  id: string
  content: string
  timestamp: Date
}

export interface AssistantTextMessage {
  kind: 'assistant_text'
  id: string
  content: string
  toolCalls: ToolCallInfo[]
  timestamp: Date
}

export interface StatusMessage {
  kind: 'status'
  id: string
  variant: 'success' | 'error' | 'cancelled'
  title: string
  description: string
  timestamp: Date
}

export type ChatMessage = UserMessage | AssistantTextMessage | StatusMessage
```

- [ ] **Step 3: Create session types**

```typescript
// src/views/intelligenceV2/types/session.ts

export interface SessionState {
  sessionId: string
  conversationId: string | null
}

export interface UsageInfo {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number
}

export interface ConversationPreview {
  id: string
  title: string
  updatedAt: string
  messageCount: number
}

export type HealthStatus = 'healthy' | 'degraded' | 'offline'
```

- [ ] **Step 4: Commit**

```bash
git add src/views/intelligenceV2/types/
git commit -m "feat(intelligenceV2): add TypeScript types for SSE events, messages and session"
```

---

## Task 2: Route + Entry Point

**Files:**
- Modify: `src/router/index.js` (~line 732)
- Create: `src/views/intelligenceV2/IntelligenceV2View.vue`

- [ ] **Step 1: Add route**

In `src/router/index.js`, find the `intelligence` route (around line 732) and add below it:

```javascript
{
  path: "intelligenceV2",
  name: "IntelligenceV2",
  component: () => import("../views/intelligenceV2/IntelligenceV2View.vue"),
  meta: { title: "ChatFunnel - Intelligence V2" },
},
```

- [ ] **Step 2: Create entry point shell**

```vue
<!-- src/views/intelligenceV2/IntelligenceV2View.vue -->
<template>
  <div class="flex min-h-dvh gap-3 bg-gray-200 p-4">
    <ConversationsSidebar
      :conversations="conversations"
      :active-id="activeConversationId"
      :loading="historyLoading"
      @select="handleSelectConversation"
      @new-conversation="handleNewConversation"
    />

    <ChatColumn
      :messages="messages"
      :is-streaming="isStreaming"
      :mode="mode"
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
import { ref, computed } from 'vue'
import ConversationsSidebar from './components/layout/ConversationsSidebar.vue'
import ChatColumn from './components/layout/ChatColumn.vue'
import ArtifactPanel from './components/layout/ArtifactPanel.vue'
import ToolCatalogModal from './components/chat/ToolCatalogModal.vue'
import { useIntelligenceChat } from './composables/useIntelligenceChat'
import { useIntelligenceHistory } from './composables/useIntelligenceHistory'
import type { ModuleId } from './registry/tool-catalog.registry'

const {
  messages,
  isStreaming,
  send,
  cancel,
  loadMockConversation,
  resetChat,
} = useIntelligenceChat()

const {
  conversations,
  loading: historyLoading,
  activeConversationId,
  setActive,
} = useIntelligenceHistory()

const mode = computed(() => messages.value.length > 0 ? 'chat' : 'home')
const artifactOpen = ref(false)
const artifact = ref<unknown>(null)
const catalogModule = ref<ModuleId | null>(null)

function handleSend(text: string) {
  send(text)
}

function handleCancel() {
  cancel()
}

function handleSelectConversation(id: string) {
  setActive(id)
  loadMockConversation()
}

function handleNewConversation() {
  setActive(null)
  resetChat()
}

function handleOpenCatalog(moduleId: ModuleId) {
  catalogModule.value = moduleId
}

function handleToolSelect(prompt: string) {
  catalogModule.value = null
  send(prompt)
}
</script>
```

- [ ] **Step 3: Verify route loads**

Run dev server: `cd chatfunnel-front && npm run dev`
Navigate to: `http://localhost:5173/app/intelligenceV2`
Expected: page loads without errors (components missing is OK — they're created next)

- [ ] **Step 4: Commit**

```bash
git add src/router/index.js src/views/intelligenceV2/IntelligenceV2View.vue
git commit -m "feat(intelligenceV2): add route and entry point view"
```

---

## Task 3: Tool Catalog Registry + Destructive Guard

**Files:**
- Create: `src/views/intelligenceV2/registry/tool-catalog.registry.ts`
- Create: `src/views/intelligenceV2/utils/destructive-guard.ts`

- [ ] **Step 1: Create registry**

```typescript
// src/views/intelligenceV2/registry/tool-catalog.registry.ts

export type ModuleId = 'automations' | 'crm' | 'templates' | 'contacts' | 'config' | 'agents'

export interface ToolCatalogEntry {
  toolName: string
  title: string
  prompt: string
  icon: string
}

export interface ModuleInfo {
  id: ModuleId
  title: string
  description: string
  icon: string
  iconBg: string
  iconColor: string
  tools: ToolCatalogEntry[]
}

const automations: ModuleInfo = {
  id: 'automations',
  title: 'Automacoes',
  description: 'Crie e gerencie seus flows',
  icon: 'PhTreeStructure',
  iconBg: '#E3F2FD',
  iconColor: '#1565C0',
  tools: [
    { toolName: 'list_automations', title: 'Listar automacoes', prompt: 'Liste minhas automacoes', icon: 'list-bullets' },
    { toolName: 'get_automation', title: 'Ver detalhes de automacao', prompt: 'Mostre os detalhes da automacao ', icon: 'magnifying-glass' },
    { toolName: 'build_automation', title: 'Criar automacao completa', prompt: 'Crie uma automacao de ', icon: 'plus-circle' },
    { toolName: 'create_trigger', title: 'Criar trigger', prompt: 'Adicione um trigger na automacao ', icon: 'lightning' },
    { toolName: 'add_step_message', title: 'Adicionar mensagem', prompt: 'Adicione um passo de mensagem na automacao ', icon: 'chat-text' },
    { toolName: 'add_step_delay', title: 'Adicionar delay', prompt: 'Adicione um delay na automacao ', icon: 'timer' },
    { toolName: 'add_step_condition', title: 'Adicionar condicao', prompt: 'Adicione uma condicao na automacao ', icon: 'git-branch' },
    { toolName: 'add_step_action', title: 'Adicionar acao', prompt: 'Adicione uma acao na automacao ', icon: 'play' },
    { toolName: 'add_step_follow_up', title: 'Adicionar follow-up', prompt: 'Adicione um follow-up na automacao ', icon: 'chat-text' },
    { toolName: 'add_step_kanban', title: 'Adicionar passo kanban', prompt: 'Adicione um passo de kanban na automacao ', icon: 'kanban' },
    { toolName: 'add_step_chat_action', title: 'Adicionar acao de chat', prompt: 'Adicione uma acao de chat na automacao ', icon: 'chat-text' },
    { toolName: 'add_step_ab_test', title: 'Adicionar teste A/B', prompt: 'Adicione um teste A/B na automacao ', icon: 'git-branch' },
    { toolName: 'add_step_run_automation', title: 'Executar outra automacao', prompt: 'Adicione um passo que executa outra automacao', icon: 'play' },
    { toolName: 'rename_automation', title: 'Renomear automacao', prompt: 'Renomeie a automacao ', icon: 'pencil-simple' },
    { toolName: 'toggle_automation', title: 'Ativar/desativar', prompt: 'Ative a automacao ', icon: 'toggle-right' },
    { toolName: 'delete_automations', title: 'Excluir automacoes', prompt: 'Exclua a automacao ', icon: 'trash' },
  ],
}

const crm: ModuleInfo = {
  id: 'crm',
  title: 'Funil de Vendas',
  description: 'Gerencie pipelines e cards',
  icon: 'PhFunnelSimple',
  iconBg: 'var(--brand-100, #CAFFFB)',
  iconColor: 'var(--brand-500, #3CA1A1)',
  tools: [
    { toolName: 'get_kanbans', title: 'Ver pipelines', prompt: 'Mostre meus pipelines', icon: 'columns' },
    { toolName: 'list_kanban_cards', title: 'Listar cards', prompt: 'Liste os cards do pipeline ', icon: 'list-bullets' },
    { toolName: 'create_kanban_card', title: 'Criar card', prompt: 'Crie um card no pipeline ', icon: 'plus-circle' },
    { toolName: 'move_kanban_card', title: 'Mover card', prompt: 'Mova o card para a coluna ', icon: 'arrows-left-right' },
    { toolName: 'win_kanban_card', title: 'Marcar como ganho', prompt: 'Marque o card como ganho', icon: 'trophy' },
    { toolName: 'lose_kanban_card', title: 'Marcar como perdido', prompt: 'Marque o card como perdido', icon: 'x-circle' },
    { toolName: 'assign_card_moderator', title: 'Atribuir responsavel', prompt: 'Atribua o card para ', icon: 'user-plus' },
  ],
}

const templates: ModuleInfo = {
  id: 'templates',
  title: 'Templates',
  description: 'Templates do WhatsApp',
  icon: 'PhChat',
  iconBg: '#E8F5E9',
  iconColor: '#2E7D32',
  tools: [
    { toolName: 'list_templates', title: 'Listar templates', prompt: 'Liste meus templates do WhatsApp', icon: 'list-bullets' },
    { toolName: 'get_template', title: 'Ver detalhes', prompt: 'Mostre os detalhes do template ', icon: 'magnifying-glass' },
    { toolName: 'create_template', title: 'Criar template', prompt: 'Crie um template de ', icon: 'plus-circle' },
    { toolName: 'update_template', title: 'Editar template', prompt: 'Atualize o template ', icon: 'pencil-simple' },
    { toolName: 'delete_templates', title: 'Excluir templates', prompt: 'Exclua o template ', icon: 'trash' },
    { toolName: 'sync_templates', title: 'Sincronizar com Meta', prompt: 'Sincronize os templates com a Meta', icon: 'arrows-clockwise' },
    { toolName: 'get_template_status', title: 'Ver status de aprovacao', prompt: 'Qual o status do template ', icon: 'check-circle' },
    { toolName: 'get_template_buttons', title: 'Ver botoes', prompt: 'Mostre os botoes do template ', icon: 'squares-four' },
    { toolName: 'configure_template_params', title: 'Configurar parametros', prompt: 'Configure os parametros do template ', icon: 'gear' },
  ],
}

const contacts: ModuleInfo = {
  id: 'contacts',
  title: 'Contatos',
  description: 'Busque e gerencie contatos',
  icon: 'PhUsers',
  iconBg: '#E0F7FA',
  iconColor: '#00695C',
  tools: [
    { toolName: 'search_contacts', title: 'Buscar contatos', prompt: 'Busque contatos com ', icon: 'magnifying-glass' },
    { toolName: 'get_contact', title: 'Ver detalhes do contato', prompt: 'Mostre os detalhes do contato ', icon: 'user' },
    { toolName: 'add_contact_tag', title: 'Adicionar tag', prompt: 'Adicione a tag ao contato ', icon: 'tag' },
    { toolName: 'remove_contact_tag', title: 'Remover tag', prompt: 'Remova a tag do contato ', icon: 'tag' },
    { toolName: 'update_contact_field', title: 'Atualizar campo', prompt: 'Atualize o campo do contato ', icon: 'pencil-simple' },
  ],
}

const config: ModuleInfo = {
  id: 'config',
  title: 'Configuracoes',
  description: 'Tags, campos e integracoes',
  icon: 'PhGear',
  iconBg: '#F2F2F2',
  iconColor: '#7A7786',
  tools: [
    { toolName: 'get_channels', title: 'Ver canais conectados', prompt: 'Mostre meus canais conectados', icon: 'broadcast' },
    { toolName: 'get_tags', title: 'Listar tags', prompt: 'Liste minhas tags', icon: 'tag' },
    { toolName: 'create_tag', title: 'Criar tag', prompt: 'Crie uma tag chamada ', icon: 'plus-circle' },
    { toolName: 'update_tag', title: 'Editar tag', prompt: 'Renomeie a tag ', icon: 'pencil-simple' },
    { toolName: 'delete_tag', title: 'Excluir tag', prompt: 'Exclua a tag ', icon: 'trash' },
    { toolName: 'list_tag_folders', title: 'Ver pastas de tags', prompt: 'Liste minhas pastas de tags', icon: 'folder' },
    { toolName: 'create_tag_folder', title: 'Criar pasta de tags', prompt: 'Crie uma pasta de tags chamada ', icon: 'folder-plus' },
    { toolName: 'delete_tag_folder', title: 'Excluir pasta de tags', prompt: 'Exclua a pasta de tags ', icon: 'trash' },
    { toolName: 'get_custom_fields', title: 'Ver campos personalizados', prompt: 'Liste meus campos personalizados', icon: 'textbox' },
    { toolName: 'get_moderators', title: 'Ver membros da equipe', prompt: 'Mostre os membros da minha equipe', icon: 'users' },
  ],
}

const agents: ModuleInfo = {
  id: 'agents',
  title: 'Agentes IA',
  description: 'Agentes e assistentes',
  icon: 'PhAtom',
  iconBg: '#FFF3E0',
  iconColor: '#E65100',
  tools: [
    { toolName: 'get_agents_v2', title: 'Ver agentes', prompt: 'Liste meus agentes de IA', icon: 'atom' },
    { toolName: 'get_assistants', title: 'Ver assistentes', prompt: 'Liste meus assistentes configurados', icon: 'robot' },
  ],
}

export const MODULE_CATALOG: Record<ModuleId, ModuleInfo> = {
  automations, crm, templates, contacts, config, agents,
}

export const MODULES_ORDERED: ModuleInfo[] = [
  automations, crm, templates, contacts, config, agents,
]
```

- [ ] **Step 2: Create destructive guard util**

```typescript
// src/views/intelligenceV2/utils/destructive-guard.ts

const DESTRUCTIVE_PATTERNS = /\b(exclu|delet|remov|desativ|apag)/i

export function isDestructive(text: string): boolean {
  return DESTRUCTIVE_PATTERNS.test(text)
}
```

- [ ] **Step 3: Commit**

```bash
git add src/views/intelligenceV2/registry/ src/views/intelligenceV2/utils/
git commit -m "feat(intelligenceV2): add tool catalog registry and destructive guard util"
```

---

## Task 4: Composables with Mock Data

**Files:**
- Create: `src/views/intelligenceV2/composables/useIntelligenceChat.ts`
- Create: `src/views/intelligenceV2/composables/useIntelligenceHistory.ts`

- [ ] **Step 1: Create useIntelligenceHistory with mock**

```typescript
// src/views/intelligenceV2/composables/useIntelligenceHistory.ts

import { ref } from 'vue'
import type { ConversationPreview } from '../types/session'

const MOCK_CONVERSATIONS: ConversationPreview[] = [
  { id: '1', title: 'Buscar contatos ativos', updatedAt: new Date().toISOString(), messageCount: 4 },
  { id: '2', title: 'Criar flow de boas-vindas', updatedAt: new Date(Date.now() - 7200000).toISOString(), messageCount: 8 },
  { id: '3', title: 'Configurar agente de vendas', updatedAt: new Date(Date.now() - 86400000).toISOString(), messageCount: 3 },
]

export function useIntelligenceHistory() {
  const conversations = ref<ConversationPreview[]>(MOCK_CONVERSATIONS)
  const loading = ref(false)
  const activeConversationId = ref<string | null>(null)

  function setActive(id: string | null) {
    activeConversationId.value = id
  }

  function deleteConversation(id: string) {
    conversations.value = conversations.value.filter(c => c.id !== id)
    if (activeConversationId.value === id) {
      activeConversationId.value = null
    }
  }

  return {
    conversations,
    loading,
    activeConversationId,
    setActive,
    deleteConversation,
  }
}
```

- [ ] **Step 2: Create useIntelligenceChat with mock**

```typescript
// src/views/intelligenceV2/composables/useIntelligenceChat.ts

import { ref } from 'vue'
import type { ChatMessage, ToolCallInfo } from '../types/message'

function uid(): string {
  return crypto.randomUUID()
}

const MOCK_TOOL_CALL: ToolCallInfo = {
  id: 'tc-1',
  name: 'search_contacts',
  status: 'done',
  input: { query: 'mais ativos' },
  result: JSON.stringify({
    contacts: [
      { name: 'Claudia Tania', phone: '+55 45 9830-3960', interactions: 422 },
      { name: 'Silmar Martins', phone: '+55 11 9999-0000', interactions: 66 },
    ],
    quantity: 2,
  }),
  textOffset: 52,
}

const MOCK_MESSAGES: ChatMessage[] = [
  {
    kind: 'user',
    id: uid(),
    content: 'Busque meus contatos mais ativos',
    timestamp: new Date(Date.now() - 60000),
  },
  {
    kind: 'assistant_text',
    id: uid(),
    content: 'Vou buscar seus contatos mais ativos. Um momento...\n\nEncontrei seus contatos mais ativos. Claudia Tania lidera com 422 interacoes via WhatsApp, seguida por Silmar Martins com 66 via Instagram.',
    toolCalls: [MOCK_TOOL_CALL],
    timestamp: new Date(Date.now() - 55000),
  },
]

export function useIntelligenceChat() {
  const messages = ref<ChatMessage[]>([])
  const isStreaming = ref(false)
  const sessionId = ref(crypto.randomUUID())
  const conversationId = ref<string | null>(null)

  function send(text: string) {
    messages.value.push({
      kind: 'user',
      id: uid(),
      content: text,
      timestamp: new Date(),
    })

    isStreaming.value = true
    setTimeout(() => {
      messages.value.push({
        kind: 'assistant_text',
        id: uid(),
        content: `Recebi sua mensagem: "${text}". Esta e uma resposta mock do Intelligence V2. Na F2 isso sera conectado ao backend real via SSE.`,
        toolCalls: [],
        timestamp: new Date(),
      })
      isStreaming.value = false
      conversationId.value = conversationId.value ?? uid()
    }, 500)
  }

  function cancel() {
    isStreaming.value = false
  }

  function loadMockConversation() {
    messages.value = [...MOCK_MESSAGES]
    conversationId.value = '1'
  }

  function resetChat() {
    messages.value = []
    conversationId.value = null
    sessionId.value = crypto.randomUUID()
  }

  return {
    messages,
    isStreaming,
    sessionId,
    conversationId,
    send,
    cancel,
    loadMockConversation,
    resetChat,
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/views/intelligenceV2/composables/
git commit -m "feat(intelligenceV2): add composables with mock data"
```

---

## Task 5: Layout Components

**Files:**
- Create: `src/views/intelligenceV2/components/layout/ConversationsSidebar.vue`
- Create: `src/views/intelligenceV2/components/layout/ChatColumn.vue`
- Create: `src/views/intelligenceV2/components/layout/ArtifactPanel.vue`

- [ ] **Step 1: Create ConversationsSidebar**

```vue
<!-- src/views/intelligenceV2/components/layout/ConversationsSidebar.vue -->
<template>
  <Card class="h-full w-[260px] shrink-0 gap-3 px-4 py-5">
    <div class="flex items-center justify-between">
      <span class="typo-body-16-bold text-gray-1000">Conversas</span>
      <Button
        variant="icon"
        tone="primary"
        size="icon-sm"
        @click="emit('new-conversation')"
      >
        <PhPlus :size="16" />
      </Button>
    </div>

    <div class="flex h-9 items-center gap-2 rounded-cf-sm bg-gray-200 px-3">
      <PhMagnifyingGlass :size="16" class="text-gray-500" />
      <span class="typo-body-12-regular text-gray-500">Buscar conversas...</span>
    </div>

    <div class="flex flex-1 flex-col gap-1 overflow-y-auto">
      <button
        v-for="conv in conversations"
        :key="conv.id"
        :class="cn(
          'flex w-full flex-col gap-1 rounded-cf-sm px-3 py-2.5 text-left transition-colors',
          conv.id === activeId
            ? 'bg-brand-100'
            : 'hover:bg-gray-200'
        )"
        @click="emit('select', conv.id)"
      >
        <span class="truncate typo-body-14-semibold text-gray-1000">{{ conv.title }}</span>
        <span class="typo-body-12-regular text-gray-500">{{ formatTime(conv.updatedAt) }}</span>
      </button>

      <template v-if="loading">
        <div v-for="i in 3" :key="i" class="flex flex-col gap-2 px-3 py-2.5">
          <Skeleton class="h-4 w-3/4" />
          <Skeleton class="h-3 w-1/2" />
        </div>
      </template>

      <p v-else-if="!conversations.length" class="py-8 text-center typo-body-12-regular text-gray-500">
        Nenhuma conversa ainda
      </p>
    </div>
  </Card>
</template>

<script setup lang="ts">
import { PhPlus, PhMagnifyingGlass } from '@phosphor-icons/vue'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/common/utils/cn'
import type { ConversationPreview } from '../../types/session'

interface Props {
  conversations: ConversationPreview[]
  activeId: string | null
  loading: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  select: [id: string]
  'new-conversation': []
}>()

function formatTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `Ha ${mins} minutos`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Ha ${hours} horas`
  return 'Ontem'
}
</script>
```

- [ ] **Step 2: Create ArtifactPanel placeholder**

```vue
<!-- src/views/intelligenceV2/components/layout/ArtifactPanel.vue -->
<template>
  <Card class="h-full w-[440px] shrink-0 p-0">
    <CardHeader class="flex h-14 items-center justify-between px-5">
      <div>
        <CardTitle class="text-sm">Preview</CardTitle>
        <CardDescription>Artefato</CardDescription>
      </div>
      <Button variant="icon" tone="dark" size="icon-sm" @click="emit('close')">
        <PhX :size="14" />
      </Button>
    </CardHeader>
    <Separator />
    <CardContent class="flex flex-1 items-center justify-center p-5 typo-body-14-regular text-gray-500">
      Artifact panel — implementado na F5
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { PhX } from '@phosphor-icons/vue'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

defineProps<{ artifact: unknown }>()
const emit = defineEmits<{ close: [] }>()
</script>
```

- [ ] **Step 3: Create ChatColumn**

```vue
<!-- src/views/intelligenceV2/components/layout/ChatColumn.vue -->
<template>
  <Card class="min-w-0 flex-1 overflow-hidden p-0">
    <ChatHeader />

    <Separator />

    <div v-if="mode === 'home'" class="flex flex-1 flex-col items-center justify-center gap-8 p-6">
      <EmptyState @open-catalog="emit('open-catalog', $event)" />
    </div>

    <template v-else>
      <div class="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
        <MessageRenderer
          v-for="msg in messages"
          :key="msg.id"
          :message="msg"
        />
      </div>
    </template>

    <Separator />

    <ChatInput
      :is-streaming="isStreaming"
      @send="emit('send', $event)"
      @cancel="emit('cancel')"
    />
  </Card>
</template>

<script setup lang="ts">
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import ChatHeader from '../chat/ChatHeader.vue'
import ChatInput from '../chat/ChatInput.vue'
import EmptyState from '../chat/EmptyState.vue'
import MessageRenderer from '../messages/MessageRenderer.vue'
import type { ChatMessage } from '../../types/message'
import type { ModuleId } from '../../registry/tool-catalog.registry'

interface Props {
  messages: ChatMessage[]
  isStreaming: boolean
  mode: 'home' | 'chat'
}

defineProps<Props>()

const emit = defineEmits<{
  send: [text: string]
  cancel: []
  'open-catalog': [moduleId: ModuleId]
}>()
</script>
```

- [ ] **Step 4: Commit**

```bash
git add src/views/intelligenceV2/components/layout/
git commit -m "feat(intelligenceV2): add layout components (sidebar, chat column, artifact panel)"
```

---

## Task 6: Chat Components

**Files:**
- Create: `src/views/intelligenceV2/components/chat/ChatHeader.vue`
- Create: `src/views/intelligenceV2/components/chat/ChatInput.vue`
- Create: `src/views/intelligenceV2/components/chat/EmptyState.vue`
- Create: `src/views/intelligenceV2/components/chat/ToolCatalogModal.vue`
- Create: `src/views/intelligenceV2/components/chat/PhIcon.vue`

- [ ] **Step 1: Create ChatHeader**

```vue
<!-- src/views/intelligenceV2/components/chat/ChatHeader.vue -->
<template>
  <div class="flex h-14 items-center gap-3 px-6">
    <div class="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500">
      <PhLightning :size="16" weight="fill" class="text-gray-100" />
    </div>
    <span class="typo-body-16-bold text-gray-1000">Intelligence</span>
    <Badge color="success" hierarchy="agent" size="agent">
      <div class="h-2 w-2 rounded-full bg-green-500" />
      Online
    </Badge>
  </div>
</template>

<script setup lang="ts">
import { PhLightning } from '@phosphor-icons/vue'
import { Badge } from '@/components/ui/badge'
</script>
```

- [ ] **Step 2: Create ChatInput**

```vue
<!-- src/views/intelligenceV2/components/chat/ChatInput.vue -->
<template>
  <div class="flex flex-col items-center gap-2 px-6 pb-5 pt-4">
    <InputRoot class="!h-auto !max-h-none flex-col gap-2 !rounded-cf-xxl pt-[14px] pr-2 pb-2 pl-4">
      <textarea
        ref="textareaRef"
        v-model="input"
        class="h-[120px] w-full resize-none bg-transparent typo-body-14-regular text-gray-1000 placeholder-gray-500 outline-none"
        placeholder="Mensagem para o ChatFunnel..."
        rows="3"
        @keydown.enter.exact.prevent="handleSend"
      />
      <div class="flex items-center justify-end gap-2">
        <span class="typo-body-10-regular text-gray-500">/ comandos</span>
        <Button
          v-if="isStreaming"
          variant="icon"
          tone="danger"
          size="icon-sm"
          @click="emit('cancel')"
        >
          <PhStop :size="16" weight="fill" />
        </Button>
        <Button
          variant="icon"
          tone="primary"
          size="icon-sm"
          :disabled="!canSend"
          @click="handleSend"
        >
          <PhPaperPlaneTilt :size="18" weight="fill" />
        </Button>
      </div>
    </InputRoot>
    <p class="typo-body-10-regular text-gray-500">
      Enter para enviar · Shift+Enter para nova linha · / para comandos
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { PhPaperPlaneTilt, PhStop } from '@phosphor-icons/vue'
import { InputRoot } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Props {
  isStreaming: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  send: [text: string]
  cancel: []
}>()

const input = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const canSend = computed(() => input.value.trim().length > 0 && !props.isStreaming)

function handleSend() {
  if (!canSend.value) return
  emit('send', input.value.trim())
  input.value = ''
}
</script>
```

- [ ] **Step 3: Create PhIcon helper**

```vue
<!-- src/views/intelligenceV2/components/chat/PhIcon.vue -->
<template>
  <component :is="iconComponent" :size="size" :color="color" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import * as PhosphorIcons from '@phosphor-icons/vue'

interface Props {
  name: string
  size?: number
  color?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 20,
  color: undefined,
})

const iconComponent = computed(() => {
  const pascalName = 'Ph' + props.name
    .split('-')
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')

  return (PhosphorIcons as Record<string, unknown>)[pascalName] ?? PhosphorIcons.PhQuestion
})
</script>
```

- [ ] **Step 4: Create EmptyState**

```vue
<!-- src/views/intelligenceV2/components/chat/EmptyState.vue -->
<template>
  <div class="flex flex-col items-center gap-8">
    <div class="flex flex-col items-center gap-4">
      <div class="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500">
        <PhLightning :size="28" weight="fill" class="text-gray-100" />
      </div>
      <h1 class="typo-header-28-bold text-gray-1000">Como posso ajudar?</h1>
    </div>

    <div class="grid grid-cols-3 gap-3">
      <button
        v-for="mod in MODULES_ORDERED"
        :key="mod.id"
        :class="cn(
          'flex items-center gap-2.5 rounded-cf-md border border-gray-300 bg-gray-100 p-4',
          'shadow-sombra-1 transition-colors hover:bg-gray-200 active:scale-95'
        )"
        @click="emit('open-catalog', mod.id)"
      >
        <div
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-cf-sm"
          :style="{ backgroundColor: mod.iconBg }"
        >
          <component :is="iconComponents[mod.id]" :size="20" :color="mod.iconColor" />
        </div>
        <div class="flex flex-col gap-0.5 text-left">
          <span class="typo-body-14-semibold text-gray-1000">{{ mod.title }}</span>
          <span class="typo-body-12-regular text-gray-500">{{ mod.description }}</span>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  PhTreeStructure, PhFunnelSimple, PhChat,
  PhUsers, PhGear, PhAtom, PhLightning,
} from '@phosphor-icons/vue'
import { cn } from '@/common/utils/cn'
import { MODULES_ORDERED, type ModuleId } from '../../registry/tool-catalog.registry'

const emit = defineEmits<{ 'open-catalog': [moduleId: ModuleId] }>()

const iconComponents: Record<ModuleId, unknown> = {
  automations: PhTreeStructure,
  crm: PhFunnelSimple,
  templates: PhChat,
  contacts: PhUsers,
  config: PhGear,
  agents: PhAtom,
}
</script>
```

- [ ] **Step 5: Create ToolCatalogModal**

```vue
<!-- src/views/intelligenceV2/components/chat/ToolCatalogModal.vue -->
<template>
  <Dialog :open="true" @update:open="(v: boolean) => { if (!v) emit('close') }">
    <DialogContent :size="680">
      <DialogHeader>
        <DialogTitle :style="{ color: module.iconColor }">
          {{ module.title }}
        </DialogTitle>
        <DialogClose />
      </DialogHeader>

      <DialogBody>
        <div class="grid grid-cols-2 gap-3">
          <button
            v-for="tool in module.tools"
            :key="tool.toolName"
            :class="cn(
              'flex items-center gap-2.5 rounded-cf-md border border-gray-300 bg-gray-100 p-4',
              'shadow-sombra-1 transition-colors hover:bg-gray-200'
            )"
            @click="emit('select-tool', tool.prompt)"
          >
            <div
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-cf-sm"
              :style="{ backgroundColor: module.iconBg }"
            >
              <PhIcon :name="tool.icon" :size="20" :color="module.iconColor" />
            </div>
            <div class="flex flex-col gap-0.5 text-left">
              <span class="typo-body-14-semibold text-gray-1000">{{ tool.title }}</span>
              <span class="typo-body-12-regular text-gray-500">{{ tool.toolName }}</span>
            </div>
          </button>

          <div v-if="module.tools.length % 2 !== 0" class="h-[69px]" />
        </div>
      </DialogBody>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogClose } from '@/components/ui/dialog'
import { cn } from '@/common/utils/cn'
import { MODULE_CATALOG, type ModuleId } from '../../registry/tool-catalog.registry'
import PhIcon from './PhIcon.vue'

interface Props {
  moduleId: ModuleId
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'select-tool': [prompt: string]
  close: []
}>()

const module = computed(() => MODULE_CATALOG[props.moduleId])
</script>
```

- [ ] **Step 6: Commit**

```bash
git add src/views/intelligenceV2/components/chat/
git commit -m "feat(intelligenceV2): add chat components (header, input, empty state, tool catalog modal)"
```

---

## Task 7: Message Components

**Files:**
- Create: `src/views/intelligenceV2/components/messages/MessageRenderer.vue`
- Create: `src/views/intelligenceV2/components/messages/UserMessage.vue`
- Create: `src/views/intelligenceV2/components/messages/AssistantText.vue`
- Create: `src/views/intelligenceV2/components/messages/ToolCallCard.vue`

- [ ] **Step 1: Create UserMessage**

```vue
<!-- src/views/intelligenceV2/components/messages/UserMessage.vue -->
<template>
  <div class="flex w-full justify-end">
    <div class="max-w-[70%] rounded-cf-xxl bg-brand-100 p-4 shadow-sombra-1">
      <p class="whitespace-pre-wrap typo-body-14-regular text-gray-1000">{{ message.content }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { UserMessage as UserMessageType } from '../../types/message'

defineProps<{ message: UserMessageType }>()
</script>
```

- [ ] **Step 2: Create ToolCallCard**

```vue
<!-- src/views/intelligenceV2/components/messages/ToolCallCard.vue -->
<template>
  <div class="flex w-full items-center gap-2.5 rounded-cf-md border border-gray-300 bg-gray-200 px-4 py-3.5">
    <PhCircleNotch v-if="toolCall.status === 'running'" :size="16" class="animate-spin text-brand-500" />
    <PhCheckCircle v-else-if="toolCall.status === 'done'" :size="16" class="text-green-500" />
    <PhXCircle v-else :size="16" class="text-red-400" />

    <span class="typo-body-14-medium text-gray-1000">{{ toolCall.name }}</span>
    <Badge v-if="toolCall.status === 'running'" color="brand" hierarchy="agent" size="agent">Buscando...</Badge>
    <Badge v-else-if="toolCall.status === 'done'" color="success" hierarchy="agent" size="agent">Concluido</Badge>
    <Badge v-else color="destructive" hierarchy="agent" size="agent">Erro</Badge>
  </div>
</template>

<script setup lang="ts">
import { PhCircleNotch, PhCheckCircle, PhXCircle } from '@phosphor-icons/vue'
import { Badge } from '@/components/ui/badge'
import type { ToolCallInfo } from '../../types/message'

defineProps<{ toolCall: ToolCallInfo }>()
</script>
```

- [ ] **Step 3: Create AssistantText**

```vue
<!-- src/views/intelligenceV2/components/messages/AssistantText.vue -->
<template>
  <div class="flex w-full gap-3">
    <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500">
      <PhLightning :size="14" weight="fill" class="text-gray-100" />
    </div>
    <div class="flex min-w-0 flex-1 flex-col gap-3">
      <p class="whitespace-pre-wrap typo-body-14-regular text-gray-1000">{{ message.content }}</p>
      <ToolCallCard
        v-for="tc in message.toolCalls"
        :key="tc.id"
        :tool-call="tc"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { PhLightning } from '@phosphor-icons/vue'
import ToolCallCard from './ToolCallCard.vue'
import type { AssistantTextMessage } from '../../types/message'

defineProps<{ message: AssistantTextMessage }>()
</script>
```

- [ ] **Step 4: Create MessageRenderer**

```vue
<!-- src/views/intelligenceV2/components/messages/MessageRenderer.vue -->
<template>
  <UserMessage v-if="message.kind === 'user'" :message="message" />
  <AssistantText v-else-if="message.kind === 'assistant_text'" :message="message" />
  <Alert
    v-else-if="message.kind === 'status'"
    :variant="message.variant === 'error' ? 'destructive' : 'default'"
    :class="cn(
      'rounded-cf-md border-l-[3px]',
      message.variant === 'error'
        ? 'border-red-400 bg-red-100'
        : 'border-green-500 bg-green-100'
    )"
  >
    <AlertTitle>{{ message.title }}</AlertTitle>
    <AlertDescription>{{ message.description }}</AlertDescription>
  </Alert>
</template>

<script setup lang="ts">
import UserMessage from './UserMessage.vue'
import AssistantText from './AssistantText.vue'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/common/utils/cn'
import type { ChatMessage } from '../../types/message'

defineProps<{ message: ChatMessage }>()
</script>
```

- [ ] **Step 5: Commit**

```bash
git add src/views/intelligenceV2/components/messages/
git commit -m "feat(intelligenceV2): add message components (renderer, user, assistant, tool call)"
```

---

## Task 8: Manual Test + Final Commit

**Files:**
- No new files — verify everything wired together

- [ ] **Step 1: Run dev server and test**

```bash
cd chatfunnel-front && npm run dev
```

Navigate to: `http://localhost:5173/intelligenceV2`

Checklist:
1. Empty state visivel com avatar hero + "Como posso ajudar?" + 6 module cards (3x2)
2. Clicar num module card (ex: "Funil de Vendas") abre modal com tools em grid 2 colunas
3. Clicar numa tool do modal envia o prompt e fecha modal
4. Mensagem user aparece como bubble a direita (brand-100)
5. Resposta AI mock aparece com avatar + texto apos 500ms
6. Sidebar mostra 3 conversas mock
7. Clicar numa conversa na sidebar carrega mensagens mock (user + AI + tool call done)
8. Clicar "+" na sidebar limpa chat e volta pro empty state
9. Textarea funcional: Enter envia, texto aparece, limpa apos envio
10. Cancel button vermelho visivel durante streaming (500ms mock)

- [ ] **Step 2: Fix any issues found**

Address layout, spacing, or rendering issues found during manual testing.

- [ ] **Step 3: Final commit**

```bash
git add src/views/intelligenceV2/
git commit -m "feat(intelligenceV2): F1 scaffold complete — layout, routing, mock data, navigation"
```

---

## Summary

| Task | Files | Description |
|------|-------|-------------|
| 1 | 3 types | SSE events, messages, session — foundation |
| 2 | 2 files | Route + entry point view |
| 3 | 2 files | Tool catalog registry + destructive guard |
| 4 | 2 files | Composables with mock data |
| 5 | 3 files | Layout (sidebar, chat column, artifact panel) |
| 6 | 5 files | Chat (header, input, empty state, modal, icon helper) |
| 7 | 4 files | Messages (renderer, user, assistant, tool call) |
| 8 | 0 files | Wire together + manual test |

**Total: 21 files, 8 tasks, ~8 commits**

**Next phase (F2):** Replace mock composable with real SSE stream to `POST /nest/a2a/chat`. Add `useHealthCheck`. Connect `useIntelligenceHistory` to real `GET /a2a/conversations`.
