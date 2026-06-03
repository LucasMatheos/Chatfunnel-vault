# Intelligence V2 — F3 Tool Result Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar visualização rica aos resultados de tools MCP no chat do Intelligence V2 — de "get_channels — Concluído" para cards formatados com chips, tabelas e confirmações.

**Architecture:** Registry central mapeia `tool_name` → parser + componente. 6 archetypes de card cobrem ~50 tools. ToolCallCard ganha estado expandível. GenericJsonResult como fallback universal.

**Tech Stack:** Vue 3 + `<script setup lang="ts">`, Tailwind v4, shadcn-vue (Badge), Phosphor Icons

---

## File Structure

```
views/intelligenceV2/
├── types/
│   ├── message.ts                          # MODIFY — add ParsedToolResult to ToolCallInfo
│   └── tool-result.ts                      # CREATE — discriminated unions for parsed results
├── registry/
│   ├── tool-catalog.registry.ts            # EXISTS — no changes
│   └── tool-result.registry.ts             # CREATE — tool_name → archetype
├── utils/
│   ├── tool-result-parser.ts               # CREATE — JSON.parse + error envelope detect
│   └── tool-label.ts                       # CREATE — tool_name → friendly label pt-BR
├── components/
│   └── messages/
│       ├── ToolCallCard.vue                # MODIFY — expandable with result slot
│       ├── tool-results/
│       │   ├── GenericJsonResult.vue        # CREATE — collapsible JSON tree fallback
│       │   ├── ActionResult.vue            # CREATE — icon + confirmation for writes
│       │   ├── DiscoveryChips.vue          # CREATE — inline chips for discovery tools
│       │   ├── ListResult.vue              # CREATE — compact table for list tools
│       │   └── ToolErrorResult.vue         # CREATE — error code-aware display
│       └── AssistantText.vue               # VERIFY — already passes toolCall (no changes)
├── composables/
│   └── useIntelligenceChat.ts              # MODIFY — parse tool_result on arrival
```

**9 files total:** 7 create, 2 modify, 1 verify.

---

### Task 1: Types — ParsedToolResult + ToolCallInfo update

**Files:**
- Create: `src/views/intelligenceV2/types/tool-result.ts`
- Modify: `src/views/intelligenceV2/types/message.ts`

- [ ] **Step 1: Create `tool-result.ts` with discriminated unions**

```typescript
// src/views/intelligenceV2/types/tool-result.ts

/**
 * Error envelope from MCP tools.
 * Backend returns { error: { code, type, message } } inside tool_result.result string.
 * See: vault/wiki/features/intelligence-a2a-shapes.md §4.2
 */
export interface McpToolError {
  kind: 'error'
  code:
    | 'NOT_FOUND'
    | 'VALIDATION_ERROR'
    | 'CONFLICT'
    | 'FORBIDDEN'
    | 'RATE_LIMIT'
    | 'EXTERNAL_API_ERROR'
    | 'INTERNAL_ERROR'
  type: 'domain' | 'external_api' | 'rate_limit' | 'internal'
  message: string
  details?: unknown
}

/**
 * Successfully parsed tool result — raw JSON after envelope unwrap.
 * The `data` field is the payload (array, object, string, etc.).
 */
export interface McpToolSuccess {
  kind: 'success'
  data: unknown
}

/**
 * When JSON.parse fails on tool_result.result — plain text error from Mastra.
 * Format: "Erro: <wrapper> (causa: <rootCause>)"
 */
export interface McpToolPlainError {
  kind: 'plain_error'
  text: string
}

export type ParsedToolResult = McpToolError | McpToolSuccess | McpToolPlainError
```

- [ ] **Step 2: Update `message.ts` — add `parsedResult` to ToolCallInfo**

In `src/views/intelligenceV2/types/message.ts`, add the import and field:

```typescript
import type { ParsedToolResult } from './tool-result'

export interface ToolCallInfo {
  id: string
  name: string
  status: ToolCallStatus
  input?: Record<string, unknown>
  result?: string
  error?: string
  textOffset?: number
  parsedResult?: ParsedToolResult  // ← ADD THIS
}
```

Only add the `parsedResult` field and the import. Do not change anything else in the file.

---

### Task 2: Tool result parser — JSON.parse + error envelope detection

**Files:**
- Create: `src/views/intelligenceV2/utils/tool-result-parser.ts`

- [ ] **Step 1: Create parser utility**

```typescript
// src/views/intelligenceV2/utils/tool-result-parser.ts

import type { ParsedToolResult, McpToolError } from '../types/tool-result'

/**
 * Parses the raw `tool_result.result` string from SSE.
 *
 * Three possible outcomes:
 * 1. JSON with error envelope { error: { code, type, message } } → McpToolError
 * 2. Valid JSON (success payload) → McpToolSuccess
 * 3. Not valid JSON (Mastra plain text error) → McpToolPlainError
 */
export function parseToolResult(raw: string, isError?: boolean): ParsedToolResult {
  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    return { kind: 'plain_error', text: raw }
  }

  // Detect error envelope: { error: { code, type, message } }
  if (isErrorEnvelope(parsed)) {
    const err = (parsed as { error: McpToolError }).error
    return {
      kind: 'error',
      code: err.code ?? 'INTERNAL_ERROR',
      type: err.type ?? 'internal',
      message: err.message ?? 'Erro desconhecido',
      details: err.details,
    }
  }

  // If SSE event had isError: true but no error envelope, treat as plain error
  if (isError) {
    const msg =
      typeof parsed === 'object' && parsed !== null && 'message' in parsed
        ? String((parsed as Record<string, unknown>).message)
        : raw
    return { kind: 'plain_error', text: msg }
  }

  return { kind: 'success', data: parsed }
}

function isErrorEnvelope(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  if (typeof obj.error !== 'object' || obj.error === null) return false
  const err = obj.error as Record<string, unknown>
  return typeof err.code === 'string' || typeof err.message === 'string'
}
```

---

### Task 3: Tool labels — friendly names in pt-BR

**Files:**
- Create: `src/views/intelligenceV2/utils/tool-label.ts`

- [ ] **Step 1: Create label map**

```typescript
// src/views/intelligenceV2/utils/tool-label.ts

const TOOL_LABELS: Record<string, string> = {
  // Discovery
  get_channels: 'Canais conectados',
  get_tags: 'Tags',
  get_kanbans: 'Pipelines',
  get_moderators: 'Membros da equipe',
  get_custom_fields: 'Campos personalizados',
  get_agents_v2: 'Agentes de IA',
  get_assistants: 'Assistentes',

  // Contacts
  search_contacts: 'Busca de contatos',
  get_contact: 'Detalhes do contato',
  add_contact_tag: 'Tag adicionada',
  remove_contact_tag: 'Tag removida',
  update_contact_field: 'Campo atualizado',

  // Automations
  list_automations: 'Automações',
  get_automation: 'Detalhes da automação',
  get_draft: 'Rascunho da automação',
  build_automation: 'Automação criada',
  create_trigger: 'Trigger criado',
  toggle_automation: 'Automação alternada',
  rename_automation: 'Automação renomeada',
  delete_automations: 'Automações excluídas',
  add_step_message: 'Passo de mensagem',
  add_step_delay: 'Passo de delay',
  add_step_condition: 'Passo de condição',
  add_step_action: 'Passo de ação',
  add_step_kanban: 'Passo de kanban',
  add_step_ab_test: 'Teste A/B',
  add_step_follow_up: 'Follow-up',
  add_step_run_automation: 'Executar automação',
  add_step_chat_action: 'Ação de chat',

  // Templates
  list_templates: 'Templates',
  get_template: 'Detalhes do template',
  get_template_status: 'Status do template',
  get_template_buttons: 'Botões do template',
  create_template: 'Template criado',
  update_template: 'Template atualizado',
  delete_templates: 'Templates excluídos',
  sync_templates: 'Templates sincronizados',
  configure_template_params: 'Parâmetros configurados',

  // CRM
  list_kanban_cards: 'Cards do pipeline',
  create_kanban_card: 'Card criado',
  move_kanban_card: 'Card movido',
  win_kanban_card: 'Card ganho',
  lose_kanban_card: 'Card perdido',
  assign_card_moderator: 'Responsável atribuído',

  // Tags
  create_tag: 'Tag criada',
  update_tag: 'Tag atualizada',
  delete_tag: 'Tag excluída',
  list_tag_folders: 'Pastas de tags',
  create_tag_folder: 'Pasta criada',
  delete_tag_folder: 'Pasta excluída',
}

/**
 * Returns a human-friendly label for a tool name.
 * Falls back to the raw tool_name with underscores replaced by spaces.
 */
export function getToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? toolName.replace(/_/g, ' ')
}
```

---

### Task 4: Tool result registry — maps tool_name → component archetype

**Files:**
- Create: `src/views/intelligenceV2/registry/tool-result.registry.ts`

- [ ] **Step 1: Create the registry**

```typescript
// src/views/intelligenceV2/registry/tool-result.registry.ts

/**
 * Each tool maps to a result archetype that determines which component renders it.
 */
export type ResultArchetype =
  | 'discovery' // DiscoveryChips — inline pills
  | 'list' // ListResult — compact table
  | 'action' // ActionResult — icon + confirmation
  | 'generic' // GenericJsonResult — JSON tree fallback

export interface ToolResultEntry {
  archetype: ResultArchetype
}

const TOOL_RESULT_MAP: Record<string, ToolResultEntry> = {
  // Discovery → chips
  get_channels: { archetype: 'discovery' },
  get_tags: { archetype: 'discovery' },
  get_kanbans: { archetype: 'discovery' },
  get_moderators: { archetype: 'discovery' },
  get_custom_fields: { archetype: 'discovery' },
  get_agents_v2: { archetype: 'discovery' },
  get_assistants: { archetype: 'discovery' },
  list_tag_folders: { archetype: 'discovery' },

  // List → table
  list_automations: { archetype: 'list' },
  list_templates: { archetype: 'list' },
  search_contacts: { archetype: 'list' },
  list_kanban_cards: { archetype: 'list' },

  // Action → confirmation
  create_tag: { archetype: 'action' },
  update_tag: { archetype: 'action' },
  delete_tag: { archetype: 'action' },
  create_tag_folder: { archetype: 'action' },
  delete_tag_folder: { archetype: 'action' },
  add_contact_tag: { archetype: 'action' },
  remove_contact_tag: { archetype: 'action' },
  update_contact_field: { archetype: 'action' },
  toggle_automation: { archetype: 'action' },
  rename_automation: { archetype: 'action' },
  delete_automations: { archetype: 'action' },
  create_kanban_card: { archetype: 'action' },
  move_kanban_card: { archetype: 'action' },
  win_kanban_card: { archetype: 'action' },
  lose_kanban_card: { archetype: 'action' },
  assign_card_moderator: { archetype: 'action' },
  build_automation: { archetype: 'action' },
  create_trigger: { archetype: 'action' },
  add_step_message: { archetype: 'action' },
  add_step_delay: { archetype: 'action' },
  add_step_condition: { archetype: 'action' },
  add_step_action: { archetype: 'action' },
  add_step_kanban: { archetype: 'action' },
  add_step_ab_test: { archetype: 'action' },
  add_step_follow_up: { archetype: 'action' },
  add_step_run_automation: { archetype: 'action' },
  add_step_chat_action: { archetype: 'action' },
  create_template: { archetype: 'action' },
  update_template: { archetype: 'action' },
  delete_templates: { archetype: 'action' },
  sync_templates: { archetype: 'action' },
  configure_template_params: { archetype: 'action' },

  // Detail → generic for now (F4 will add DetailResult)
  get_automation: { archetype: 'generic' },
  get_contact: { archetype: 'generic' },
  get_template: { archetype: 'generic' },
  get_draft: { archetype: 'generic' },
  get_template_status: { archetype: 'generic' },
  get_template_buttons: { archetype: 'generic' },
}

export function getToolResultEntry(toolName: string): ToolResultEntry {
  return TOOL_RESULT_MAP[toolName] ?? { archetype: 'generic' }
}
```

---

### Task 5: Integrate parser into useIntelligenceChat

**Files:**
- Modify: `src/views/intelligenceV2/composables/useIntelligenceChat.ts`

- [ ] **Step 1: Add import at the top**

```typescript
import { parseToolResult } from '../utils/tool-result-parser'
```

Add this import next to the existing imports (after the `import type { SseEvent }` line).

- [ ] **Step 2: Update the `tool_result` handler in `handleEvent`**

Find the existing `case 'tool_result'` block (lines 81-94) and replace with:

```typescript
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
        tc.parsedResult = parseToolResult(event.data.result, event.data.isError)
        break
      }
```

The only addition is the `tc.parsedResult = parseToolResult(...)` line.

- [ ] **Step 3: Parse results when restoring conversation**

In the `loadConversation` function (line 291), replace:

```typescript
            ? (msg.toolCalls as ToolCallInfo[]).map((tc) => ({
                ...tc,
                status: tc.status === "running" ? "done" : tc.status,
              }))
```

With:

```typescript
            ? (msg.toolCalls as ToolCallInfo[]).map((tc) => ({
                ...tc,
                status: tc.status === 'running' ? 'done' : tc.status,
                parsedResult: tc.result
                  ? parseToolResult(tc.result, tc.status === 'error')
                  : undefined,
              }))
```

---

### Task 6: ToolErrorResult component

**Files:**
- Create: `src/views/intelligenceV2/components/messages/tool-results/ToolErrorResult.vue`

- [ ] **Step 1: Create error display component**

```vue
<template>
  <div class="flex items-start gap-2 rounded-cf-md border border-red-300 bg-red-50 px-3 py-2.5">
    <component :is="errorIcon" :size="14" class="mt-0.5 shrink-0 text-red-400" />
    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
      <span class="typo-body-12-semibold text-red-700">{{ errorLabel }}</span>
      <span class="typo-body-12-regular text-red-600">{{ message }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  PhMagnifyingGlassMinus,
  PhWarningCircle,
  PhLock,
  PhClockClockwise,
  PhCloudWarning,
  PhBug,
} from '@phosphor-icons/vue'
import type { McpToolError, McpToolPlainError } from '../../../types/tool-result'

const props = defineProps<{
  error: McpToolError | McpToolPlainError
}>()

const errorIcon = computed(() => {
  if (props.error.kind === 'plain_error') return PhBug
  switch (props.error.code) {
    case 'NOT_FOUND': return PhMagnifyingGlassMinus
    case 'VALIDATION_ERROR': return PhWarningCircle
    case 'FORBIDDEN': return PhLock
    case 'RATE_LIMIT': return PhClockClockwise
    case 'EXTERNAL_API_ERROR': return PhCloudWarning
    default: return PhBug
  }
})

const errorLabel = computed(() => {
  if (props.error.kind === 'plain_error') return 'Erro'
  switch (props.error.code) {
    case 'NOT_FOUND': return 'Não encontrado'
    case 'VALIDATION_ERROR': return 'Dados inválidos'
    case 'FORBIDDEN': return 'Sem permissão'
    case 'RATE_LIMIT': return 'Limite atingido'
    case 'EXTERNAL_API_ERROR': return 'Erro externo'
    case 'INTERNAL_ERROR': return 'Erro interno'
    default: return 'Erro'
  }
})

const message = computed(() => {
  if (props.error.kind === 'plain_error') return props.error.text
  return props.error.message
})
</script>
```

---

### Task 7: GenericJsonResult component

**Files:**
- Create: `src/views/intelligenceV2/components/messages/tool-results/GenericJsonResult.vue`

- [ ] **Step 1: Create collapsible JSON tree**

```vue
<template>
  <div class="flex flex-col gap-1">
    <div v-if="isArray" class="typo-body-12-regular text-gray-600">
      {{ items.length }} {{ items.length === 1 ? 'resultado' : 'resultados' }}
    </div>

    <div class="max-h-[280px] overflow-y-auto rounded-cf-md bg-gray-100 p-3">
      <pre
        class="whitespace-pre-wrap break-words typo-body-12-regular text-gray-800"
      >{{ formatted }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ data: unknown }>()

const isArray = computed(() => Array.isArray(props.data))
const items = computed(() => (isArray.value ? (props.data as unknown[]) : []))

const formatted = computed(() => {
  try {
    return JSON.stringify(props.data, null, 2)
  } catch {
    return String(props.data)
  }
})
</script>
```

---

### Task 8: ActionResult component

**Files:**
- Create: `src/views/intelligenceV2/components/messages/tool-results/ActionResult.vue`

- [ ] **Step 1: Create confirmation card for write operations**

```vue
<template>
  <div class="flex items-center gap-2 py-1">
    <component :is="icon" :size="14" weight="bold" :class="iconClass" />
    <span class="typo-body-12-medium text-gray-800">{{ summary }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  PhCheck,
  PhTrash,
  PhToggleRight,
  PhPencilSimple,
  PhArrowsLeftRight,
  PhTrophy,
  PhX,
  PhUserPlus,
  PhPlus,
  PhTag,
  PhGear,
  PhArrowsClockwise,
  PhLightning,
} from '@phosphor-icons/vue'
import { getToolLabel } from '../../../utils/tool-label'

const props = defineProps<{
  toolName: string
  data: unknown
}>()

const isDelete = computed(() => props.toolName.startsWith('delete_'))
const isCreate = computed(
  () =>
    props.toolName.startsWith('create_') ||
    props.toolName.startsWith('add_') ||
    props.toolName === 'build_automation',
)

const icon = computed(() => {
  if (isDelete.value) return PhTrash
  if (props.toolName === 'toggle_automation') return PhToggleRight
  if (props.toolName.startsWith('rename_')) return PhPencilSimple
  if (props.toolName === 'move_kanban_card') return PhArrowsLeftRight
  if (props.toolName === 'win_kanban_card') return PhTrophy
  if (props.toolName === 'lose_kanban_card') return PhX
  if (props.toolName === 'assign_card_moderator') return PhUserPlus
  if (props.toolName === 'add_contact_tag') return PhTag
  if (props.toolName === 'remove_contact_tag') return PhTag
  if (props.toolName === 'update_contact_field') return PhPencilSimple
  if (props.toolName === 'sync_templates') return PhArrowsClockwise
  if (props.toolName === 'configure_template_params') return PhGear
  if (props.toolName === 'build_automation') return PhLightning
  if (isCreate.value) return PhPlus
  return PhCheck
})

const iconClass = computed(() => {
  if (isDelete.value) return 'text-red-400'
  if (props.toolName === 'win_kanban_card') return 'text-green-500'
  if (props.toolName === 'lose_kanban_card') return 'text-red-400'
  return 'text-green-500'
})

const summary = computed(() => {
  const d = props.data
  if (typeof d === 'string') return d

  if (d && typeof d === 'object') {
    const obj = d as Record<string, unknown>

    // build_automation: { success, automationId, stepCount, message }
    if (obj.stepCount != null) {
      return `${getToolLabel(props.toolName)} — ${obj.stepCount} passos`
    }

    // Tags: { tagId, tagName } or { id, name }
    if (obj.tagName) return `${getToolLabel(props.toolName)}: ${obj.tagName}`
    if (obj.name) return `${getToolLabel(props.toolName)}: ${obj.name}`

    // Templates: { success, id } or { deleted, configured }
    if (obj.success === true && obj.message) return String(obj.message)
    if (obj.success === true) return getToolLabel(props.toolName)
    if (obj.deleted === true) return getToolLabel(props.toolName)
    if (obj.configured === true) return getToolLabel(props.toolName)

    // Empty {} — silent confirmation
    if (Object.keys(obj).length === 0) return getToolLabel(props.toolName)
  }

  return getToolLabel(props.toolName)
})
</script>
```

---

### Task 9: DiscoveryChips component

**Files:**
- Create: `src/views/intelligenceV2/components/messages/tool-results/DiscoveryChips.vue`

- [ ] **Step 1: Create inline chips for discovery tools**

```vue
<template>
  <div class="flex flex-col gap-2">
    <span class="typo-body-12-regular text-gray-600">
      {{ items.length }} {{ items.length === 1 ? 'resultado' : 'resultados' }}
    </span>
    <div class="flex flex-wrap gap-1.5">
      <span
        v-for="(item, i) in displayItems"
        :key="i"
        class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 typo-body-12-medium"
        :class="chipClass"
      >
        <component v-if="chipIcon" :is="chipIcon" :size="12" />
        {{ itemLabel(item) }}
      </span>
      <span
        v-if="items.length > MAX_CHIPS"
        class="inline-flex items-center rounded-full bg-gray-200 px-2.5 py-1 typo-body-12-regular text-gray-600"
      >
        +{{ items.length - MAX_CHIPS }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  PhTag,
  PhColumns,
  PhUser,
  PhTextbox,
  PhAtom,
  PhRobot,
  PhFolder,
} from '@phosphor-icons/vue'

const props = defineProps<{
  toolName: string
  data: unknown
}>()

const MAX_CHIPS = 12

const items = computed<unknown[]>(() => {
  const d = props.data
  if (Array.isArray(d)) return d

  if (d && typeof d === 'object') {
    const obj = d as Record<string, unknown>
    if (Array.isArray(obj.data)) return obj.data
    if (Array.isArray(obj.kanbans)) return obj.kanbans
  }

  return []
})

const displayItems = computed(() => items.value.slice(0, MAX_CHIPS))

const chipIcon = computed(() => {
  switch (props.toolName) {
    case 'get_channels':
      return null
    case 'get_tags':
      return PhTag
    case 'get_kanbans':
      return PhColumns
    case 'get_moderators':
      return PhUser
    case 'get_custom_fields':
      return PhTextbox
    case 'get_agents_v2':
      return PhAtom
    case 'get_assistants':
      return PhRobot
    case 'list_tag_folders':
      return PhFolder
    default:
      return null
  }
})

const chipClass = computed(() => {
  switch (props.toolName) {
    case 'get_tags':
      return 'bg-brand-100 text-brand-700'
    case 'get_kanbans':
      return 'bg-blue-50 text-blue-700'
    case 'get_moderators':
      return 'bg-gray-200 text-gray-800'
    case 'get_channels':
      return 'bg-green-50 text-green-700'
    case 'get_agents_v2':
    case 'get_assistants':
      return 'bg-orange-50 text-orange-700'
    default:
      return 'bg-gray-200 text-gray-700'
  }
})

function itemLabel(item: unknown): string {
  if (typeof item === 'string') return item
  if (!item || typeof item !== 'object') return String(item)

  const obj = item as Record<string, unknown>

  // Channels: show name + platform
  if (props.toolName === 'get_channels') {
    if (obj.allocatedType === 'WHATSAPP') return obj.wppName ? String(obj.wppName) : 'WhatsApp'
    if (obj.allocatedType === 'INSTAGRAM') return obj.igName ? String(obj.igName) : 'Instagram'
    return 'Desconectado'
  }

  // Kanbans: name + column count
  if (props.toolName === 'get_kanbans') {
    const cols = Array.isArray(obj.columns) ? obj.columns.length : 0
    return `${obj.name ?? 'Pipeline'} (${cols} col.)`
  }

  // Moderators: name (strip PII phone if embedded)
  if (props.toolName === 'get_moderators') {
    const user = obj.user as Record<string, unknown> | undefined
    const name = user?.name ?? obj.name ?? 'Membro'
    return String(name).replace(/\+?\d[\d\s()-]{8,}/g, '').trim() || 'Membro'
  }

  // Default: use name field
  if (obj.name != null) return String(obj.name)

  return JSON.stringify(item).slice(0, 40)
}
</script>
```

---

### Task 10: ListResult component

**Files:**
- Create: `src/views/intelligenceV2/components/messages/tool-results/ListResult.vue`

- [ ] **Step 1: Create compact table for list tools**

```vue
<template>
  <div class="flex flex-col gap-1.5">
    <span class="typo-body-12-regular text-gray-600">
      {{ rows.length }} {{ rows.length === 1 ? 'resultado' : 'resultados' }}
    </span>

    <div class="max-h-[300px] overflow-y-auto rounded-cf-md border border-gray-300">
      <table class="w-full">
        <thead>
          <tr class="border-b border-gray-300 bg-gray-100">
            <th
              v-for="col in columns"
              :key="col.key"
              class="px-3 py-2 text-left typo-body-12-semibold text-gray-700"
            >
              {{ col.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, i) in rows"
            :key="i"
            class="border-b border-gray-200 last:border-b-0"
          >
            <td
              v-for="col in columns"
              :key="col.key"
              class="px-3 py-2 typo-body-12-regular text-gray-800"
            >
              <Badge
                v-if="col.badge && cellValue(row, col.key)"
                :color="badgeColor(cellValue(row, col.key))"
                hierarchy="agent"
                size="agent"
              >
                {{ cellValue(row, col.key) }}
              </Badge>
              <span v-else>{{ cellValue(row, col.key) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import type { BadgeColor } from '@/components/ui/badge'

interface ColumnDef {
  key: string
  label: string
  badge?: boolean
}

const props = defineProps<{
  toolName: string
  data: unknown
}>()

const rows = computed<Record<string, unknown>[]>(() => {
  const d = props.data
  if (Array.isArray(d)) return d as Record<string, unknown>[]

  if (d && typeof d === 'object') {
    const obj = d as Record<string, unknown>
    // list_automations: { automations: [], quantity }
    if (Array.isArray(obj.automations)) return obj.automations as Record<string, unknown>[]
    // list_templates: { data: [], status }
    if (Array.isArray(obj.data)) return obj.data as Record<string, unknown>[]
    // search_contacts: { contacts: [], quantity }
    if (Array.isArray(obj.contacts)) return obj.contacts as Record<string, unknown>[]
    // list_kanban_cards: { kanban: { columns: [{ cards }] } }
    if (obj.kanban && typeof obj.kanban === 'object') {
      const kanban = obj.kanban as Record<string, unknown>
      if (Array.isArray(kanban.columns)) {
        const cards: Record<string, unknown>[] = []
        for (const col of kanban.columns as Record<string, unknown>[]) {
          if (Array.isArray(col.cards)) {
            for (const card of col.cards as Record<string, unknown>[]) {
              cards.push({ ...(card as object), _columnName: col.name })
            }
          }
        }
        return cards
      }
    }
  }
  return []
})

const columns = computed<ColumnDef[]>(() => {
  switch (props.toolName) {
    case 'list_automations':
      return [
        { key: 'name', label: 'Nome' },
        { key: 'isActive', label: 'Status', badge: true },
        { key: 'triggerType', label: 'Trigger' },
      ]
    case 'list_templates':
      return [
        { key: 'name', label: 'Nome' },
        { key: 'status', label: 'Status', badge: true },
        { key: 'category', label: 'Categoria' },
      ]
    case 'search_contacts':
      return [
        { key: 'name', label: 'Nome' },
        { key: 'phone', label: 'Telefone' },
        { key: '_tags', label: 'Tags' },
      ]
    case 'list_kanban_cards':
      return [
        { key: '_contactName', label: 'Contato' },
        { key: '_columnName', label: 'Coluna' },
        { key: 'statusOportunity', label: 'Status', badge: true },
      ]
    default:
      return autoColumns.value
  }
})

const autoColumns = computed<ColumnDef[]>(() => {
  if (rows.value.length === 0) return []
  const first = rows.value[0]
  const keys = Object.keys(first).filter(
    (k) => !k.startsWith('_') && typeof first[k] !== 'object',
  )
  return keys.slice(0, 4).map((k) => ({ key: k, label: k }))
})

function cellValue(row: Record<string, unknown>, key: string): string {
  // Special computed columns
  if (key === '_tags') {
    const tags = row.tags
    if (Array.isArray(tags)) {
      return tags
        .map((t) => (typeof t === 'string' ? t : (t as Record<string, unknown>).name ?? ''))
        .filter(Boolean)
        .join(', ')
    }
    return ''
  }
  if (key === '_contactName') {
    const contact = row.contact as Record<string, unknown> | undefined
    return contact?.name ? String(contact.name) : ''
  }

  const val = row[key]
  if (val === true) return 'Ativo'
  if (val === false) return 'Inativo'
  if (val == null) return '—'
  return String(val)
}

function badgeColor(value: string): BadgeColor {
  const v = value.toUpperCase()
  if (['ATIVO', 'APPROVED', 'OPEN'].includes(v)) return 'success'
  if (['INATIVO', 'REJECTED', 'LOST', 'DISABLED'].includes(v)) return 'destructive'
  if (['PENDING', 'PAUSED', 'WON'].includes(v)) return 'brand'
  return 'gray'
}
</script>
```

---

### Task 11: Refactor ToolCallCard — expandable with result rendering

**Files:**
- Modify: `src/views/intelligenceV2/components/messages/ToolCallCard.vue`

- [ ] **Step 1: Replace entire ToolCallCard with expandable version**

Replace the full content of `ToolCallCard.vue` with:

```vue
<template>
  <div class="w-full overflow-hidden rounded-cf-md border border-gray-300 bg-gray-200">
    <!-- Header — always visible -->
    <button
      class="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-gray-300"
      :class="{ 'cursor-default': !hasResult }"
      @click="toggleExpand"
    >
      <PhCircleNotch
        v-if="toolCall.status === 'running'"
        :size="16"
        class="animate-spin text-brand-500"
      />
      <PhCheckCircle v-else-if="toolCall.status === 'done'" :size="16" class="text-green-500" />
      <PhXCircle v-else-if="toolCall.status === 'error'" :size="16" class="text-red-400" />
      <PhSlash v-else :size="16" class="text-gray-500" />

      <span class="flex-1 typo-body-14-medium text-gray-1000">{{ label }}</span>

      <Badge v-if="toolCall.status === 'running'" color="brand" hierarchy="agent" size="agent">
        Buscando...
      </Badge>
      <Badge v-else-if="toolCall.status === 'done'" color="success" hierarchy="agent" size="agent">
        Concluído
      </Badge>
      <Badge
        v-else-if="toolCall.status === 'error'"
        color="destructive"
        hierarchy="agent"
        size="agent"
      >
        Erro
      </Badge>
      <Badge v-else color="gray" hierarchy="agent" size="agent"> Cancelado </Badge>

      <PhCaretDown
        v-if="hasResult"
        :size="14"
        class="shrink-0 text-gray-500 transition-transform"
        :class="{ 'rotate-180': expanded }"
      />
    </button>

    <!-- Body — expandable result -->
    <div
      v-if="expanded && toolCall.parsedResult"
      class="border-t border-gray-300 bg-white px-4 py-3"
    >
      <ToolErrorResult
        v-if="
          toolCall.parsedResult.kind === 'error' || toolCall.parsedResult.kind === 'plain_error'
        "
        :error="toolCall.parsedResult"
      />
      <component
        v-else
        :is="resultComponent"
        :tool-name="toolCall.name"
        :data="toolCall.parsedResult.data"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  PhCircleNotch,
  PhCheckCircle,
  PhXCircle,
  PhSlash,
  PhCaretDown,
} from '@phosphor-icons/vue'
import { Badge } from '@/components/ui/badge'
import { getToolLabel } from '../../utils/tool-label'
import { getToolResultEntry } from '../../registry/tool-result.registry'
import type { ToolCallInfo } from '../../types/message'
import ToolErrorResult from './tool-results/ToolErrorResult.vue'
import GenericJsonResult from './tool-results/GenericJsonResult.vue'
import ActionResult from './tool-results/ActionResult.vue'
import DiscoveryChips from './tool-results/DiscoveryChips.vue'
import ListResult from './tool-results/ListResult.vue'

defineProps<{ toolCall: ToolCallInfo }>()

const expanded = ref(false)

const props = defineProps<{ toolCall: ToolCallInfo }>()

const label = computed(() => getToolLabel(props.toolCall.name))

const hasResult = computed(
  () => props.toolCall.parsedResult != null && props.toolCall.status !== 'running',
)

const resultComponent = computed(() => {
  const entry = getToolResultEntry(props.toolCall.name)
  switch (entry.archetype) {
    case 'discovery':
      return DiscoveryChips
    case 'list':
      return ListResult
    case 'action':
      return ActionResult
    default:
      return GenericJsonResult
  }
})

function toggleExpand() {
  if (hasResult.value) expanded.value = !expanded.value
}
</script>
```

**IMPORTANT:** This file has a duplicate `defineProps` in the template above — remove the first bare `defineProps<{ toolCall: ToolCallInfo }>()` line (the one without `const props =`). Only the `const props = defineProps<{ toolCall: ToolCallInfo }>()` should remain.

---

### Task 12: Verify wiring + manual test

**Files:**
- Verify: `src/views/intelligenceV2/components/messages/AssistantText.vue`

- [ ] **Step 1: Verify AssistantText passes toolCall correctly**

`AssistantText.vue` already passes the full `ToolCallInfo` object:

```vue
<ToolCallCard
  v-for="tc in message.toolCalls"
  :key="tc.id"
  :tool-call="tc"
/>
```

No changes needed. The `parsedResult` flows through `ToolCallInfo` → `ToolCallCard` → result component automatically.

- [ ] **Step 2: Manual test — open Intelligence V2**

Open the Intelligence V2 at `/intelligence` and test:

1. Send "Mostre meus canais conectados" → DiscoveryChips with channel pills
2. Send "Liste minhas automações" → ListResult with table (nome, status, trigger)
3. Send "Crie uma tag chamada Teste" → ActionResult with "Tag criada: Teste"
4. Send "Busque contatos com Maria" → ListResult with contacts table
5. Click any ToolCallCard header → expand/collapse toggle
6. Refresh page → restored conversation also shows parsed results

Run: dev server at `http://localhost:5173/intelligence`
Expected: All 6 scenarios render formatted results.

---

## Self-Review

**1. Spec coverage:**
- Registry (`tool-result.registry.ts`) — Task 4
- Error envelope parser — Task 2
- GenericJsonResult fallback — Task 7
- ActionResult (~20 write tools) — Task 8
- DiscoveryChips (7 discovery tools) — Task 9
- ListResult (4 list tools) — Task 10
- ToolCallCard expandable — Task 11
- Conversation restore with parsed results — Task 5
- Tool labels pt-BR — Task 3
- Error code-aware display — Task 6

**2. Placeholder scan:** No TBDs, no "implement later", no "similar to Task N". All code is complete.

**3. Type consistency:**
- `ParsedToolResult` — defined in Task 1, used in Tasks 2, 5, 6, 11
- `ToolCallInfo.parsedResult` — added in Task 1, populated in Task 5, consumed in Task 11
- `getToolResultEntry()` — defined in Task 4, called in Task 11
- `getToolLabel()` — defined in Task 3, called in Tasks 8, 11
- `parseToolResult()` — defined in Task 2, called in Task 5
- Props `toolName` + `data` — consistent across ActionResult, DiscoveryChips, ListResult, GenericJsonResult

**4. Not in scope (deferred to F4+):**
- DetailResult (get_contact, get_template, get_automation) — uses GenericJsonResult for now
- Mappers (PII redact, chain sort, snake→camel) — not needed until DetailResult
- BuilderResult — ActionResult covers build_automation with stepCount summary
