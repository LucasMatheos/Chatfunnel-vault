# Intelligence V2 — Tool Result Components Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar 6 novos componentes especializados para renderizar resultados de tools no chat Intelligence V2, substituindo archetypes genéricos por UIs ricas que mostram dados de canais, automações, templates, kanban cards, detalhes e build summaries.

**Architecture:** Cada componente vive em `tool-results/`, recebe `toolName` + `data` (mesmo contrato dos archetypes existentes), e renderiza dados formatados. O registry (`tool-result.registry.ts`) ganha 6 novos archetypes. Componentes seguem o pattern existente de DiscoveryChips/ListResult (validação + fallback + rendering).

**Tech Stack:** Vue 3 `<script setup lang="ts">`, Tailwind v4, shadcn-vue Badge, Phosphor Icons, Zod (validação via contracts)

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `src/views/intelligenceV2/components/messages/tool-results/ChannelList.vue` | Lista de canais com ícone de plataforma, username/phone, badge de status |
| `src/views/intelligenceV2/components/messages/tool-results/AutomationList.vue` | Lista de automações com trigger, execuções, flow pills, status |
| `src/views/intelligenceV2/components/messages/tool-results/TemplateList.vue` | Lista de templates com status badge, categoria, idioma |
| `src/views/intelligenceV2/components/messages/tool-results/KanbanCardList.vue` | Lista de kanban cards com coluna, contato, prioridade |
| `src/views/intelligenceV2/components/messages/tool-results/DetailCard.vue` | Key-value card para get_automation, get_template, get_template_status, get_template_buttons, get_draft |
| `src/views/intelligenceV2/components/messages/tool-results/BuildSummary.vue` | Card de sucesso para build_automation com contagens e trigger types |

### Modified Files

| File | Change |
|------|--------|
| `src/views/intelligenceV2/registry/tool-result.registry.ts` | Adicionar 6 novos archetypes e remapear tools |
| `src/views/intelligenceV2/components/messages/tool-results/ToolResultParts.vue` | Adicionar imports e cases no switch para os 6 novos componentes |

---

## Task 1: Registrar novos archetypes

**Files:**
- Modify: `src/views/intelligenceV2/registry/tool-result.registry.ts`

- [x] **Step 1: Adicionar novos tipos ao ResultArchetype**

```typescript
export type ResultArchetype =
  | "discovery"
  | "list"
  | "action"
  | "agent"
  | "contact"
  | "generic"
  | "channel"
  | "automation-list"
  | "template-list"
  | "kanban-list"
  | "detail"
  | "build-summary";
```

- [x] **Step 2: Remapear tools no TOOL_RESULT_MAP**

Alterar estas entries existentes:

```typescript
// De discovery para channel
get_channels: { archetype: "channel" },

// De list para archetypes especializados
list_automations: { archetype: "automation-list" },
list_templates: { archetype: "template-list" },
list_kanban_cards: { archetype: "kanban-list" },

// De action para build-summary
build_automation: { archetype: "build-summary" },

// De generic para detail
get_automation: { archetype: "detail" },
get_template: { archetype: "detail" },
get_template_status: { archetype: "detail" },
get_template_buttons: { archetype: "detail" },
get_draft: { archetype: "detail" },
```

- [ ] **Step 3: Commit**

```bash
git add src/views/intelligenceV2/registry/tool-result.registry.ts
git commit -m "feat(intelligence): add 6 new result archetypes to tool registry"
```

---

## Task 2: Wiring — conectar novos archetypes ao ToolResultParts

**Files:**
- Modify: `src/views/intelligenceV2/components/messages/tool-results/ToolResultParts.vue`

- [x] **Step 1: Adicionar imports dos 6 novos componentes**

Adicionar após os imports existentes (após linha 69):

```typescript
import ChannelList from './ChannelList.vue'
import AutomationList from './AutomationList.vue'
import TemplateList from './TemplateList.vue'
import KanbanCardList from './KanbanCardList.vue'
import DetailCard from './DetailCard.vue'
import BuildSummary from './BuildSummary.vue'
```

- [x] **Step 2: Adicionar cases no switch do jsonComponent**

Adicionar antes do `default`:

```typescript
case 'channel':
  return ChannelList
case 'automation-list':
  return AutomationList
case 'template-list':
  return TemplateList
case 'kanban-list':
  return KanbanCardList
case 'detail':
  return DetailCard
case 'build-summary':
  return BuildSummary
```

- [ ] **Step 3: Commit**

```bash
git add src/views/intelligenceV2/components/messages/tool-results/ToolResultParts.vue
git commit -m "feat(intelligence): wire 6 new archetype components in ToolResultParts"
```

---

## Task 3: ChannelList — lista de canais conectados

**Files:**
- Create: `src/views/intelligenceV2/components/messages/tool-results/ChannelList.vue`

Renderiza canais com ícone de plataforma, username/phone, e badge de status.

- [x] **Step 1: Criar ChannelList.vue**

```vue
<template>
  <div v-if="channels.length > 0" class="flex flex-col gap-1">
    <span class="typo-body-12-regular text-gray-500">
      {{ channels.length }} {{ channels.length === 1 ? 'canal' : 'canais' }}
    </span>

    <div class="flex flex-col divide-y divide-gray-200 overflow-y-auto rounded-cf-md border border-gray-300 max-h-[300px]">
      <div
        v-for="ch in channels"
        :key="ch.id"
        class="flex items-center gap-3 px-3 py-2.5"
      >
        <!-- Platform icon -->
        <div
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          :class="platformBg(ch.platform)"
        >
          <PhInstagramLogo v-if="isInstagram(ch.platform)" :size="16" class="text-white" />
          <PhWhatsappLogo v-else-if="isWhatsapp(ch.platform)" :size="16" class="text-white" />
          <PhMessengerLogo v-else-if="isMessenger(ch.platform)" :size="16" class="text-white" />
          <PhChatCircle v-else :size="16" class="text-white" />
        </div>

        <!-- Channel info -->
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="typo-body-14-medium text-gray-1000 truncate">
            {{ channelLabel(ch) }}
          </span>
          <span v-if="channelSub(ch)" class="typo-body-12-regular text-gray-500 truncate">
            {{ channelSub(ch) }}
          </span>
        </div>

        <!-- Status badge -->
        <Badge
          v-if="ch.isActive != null"
          :color="ch.isActive ? 'success' : 'gray'"
          hierarchy="agent"
          size="agent"
        >
          {{ ch.isActive ? 'Ativo' : 'Inativo' }}
        </Badge>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  PhInstagramLogo,
  PhWhatsappLogo,
  PhMessengerLogo,
  PhChatCircle
} from '@phosphor-icons/vue'
import { Badge } from '@/components/ui/badge'

const props = defineProps<{
  toolName: string
  data: unknown
}>()

interface Channel {
  id: string
  name?: string | null
  platform?: string | null
  type?: string | null
  username?: string | null
  phoneNumber?: string | null
  isActive?: boolean | null
}

const channels = computed<Channel[]>(() => {
  const d = props.data as Record<string, unknown> | null
  if (!d) return []
  const arr = Array.isArray(d) ? d : (d.channels as unknown[]) ?? []
  return arr as Channel[]
})

function isInstagram(p?: string | null): boolean {
  return !!p && p.toLowerCase().includes('instagram')
}

function isWhatsapp(p?: string | null): boolean {
  return !!p && p.toLowerCase().includes('whatsapp')
}

function isMessenger(p?: string | null): boolean {
  return !!p && p.toLowerCase().includes('messenger')
}

function platformBg(p?: string | null): string {
  if (isInstagram(p)) return 'bg-pink-500'
  if (isWhatsapp(p)) return 'bg-green-500'
  if (isMessenger(p)) return 'bg-blue-500'
  return 'bg-gray-400'
}

function channelLabel(ch: Channel): string {
  if (ch.name) return ch.name
  if (ch.username) return `@${ch.username}`
  if (ch.phoneNumber) return ch.phoneNumber
  return ch.platform ?? 'Canal'
}

function channelSub(ch: Channel): string | null {
  const parts: string[] = []
  if (ch.platform) parts.push(ch.platform)
  if (ch.username && ch.name) parts.push(`@${ch.username}`)
  if (ch.phoneNumber && ch.name) parts.push(ch.phoneNumber)
  return parts.length > 0 ? parts.join(' · ') : null
}
</script>
```

- [x] **Step 2: Testar visualmente**

Rodar `npm run dev` no chatfunnel-front, enviar "quais canais tenho?" no Intelligence V2, verificar que a lista renderiza com ícones de plataforma e badges de status.

- [x] **Step 3: Commit**

```bash
git add src/views/intelligenceV2/components/messages/tool-results/ChannelList.vue
git commit -m "feat(intelligence): add ChannelList component for get_channels"
```

---

## Task 4: AutomationList — lista de automações

**Files:**
- Create: `src/views/intelligenceV2/components/messages/tool-results/AutomationList.vue`

Renderiza automações com nome, trigger, flow pills, execuções e status.

- [x] **Step 1: Criar AutomationList.vue**

```vue
<template>
  <div v-if="automations.length > 0" class="flex flex-col gap-1">
    <span class="typo-body-12-regular text-gray-500">
      {{ automations.length }} {{ automations.length === 1 ? 'automação' : 'automações' }}
    </span>

    <div class="flex flex-col divide-y divide-gray-200 overflow-y-auto rounded-cf-md border border-gray-300 max-h-[300px]">
      <div
        v-for="auto in automations"
        :key="auto.id"
        class="flex flex-col gap-1.5 px-3 py-2.5"
      >
        <!-- Row 1: Name + Status -->
        <div class="flex items-center gap-2">
          <span class="flex-1 typo-body-14-medium text-gray-1000 truncate">
            {{ auto.name }}
          </span>
          <Badge
            :color="auto.isActive ? 'success' : 'gray'"
            hierarchy="agent"
            size="agent"
            show-dot
          >
            {{ auto.isActive ? 'Ativa' : 'Inativa' }}
          </Badge>
        </div>

        <!-- Row 2: Trigger + Executions -->
        <div class="flex items-center gap-2 typo-body-12-regular text-gray-500">
          <span class="flex-1 truncate">{{ triggerSummary(auto) }}</span>
          <span v-if="execCount(auto) > 0" class="shrink-0">
            {{ execCount(auto) }} {{ execCount(auto) === 1 ? 'execução' : 'execuções' }}
          </span>
        </div>

        <!-- Row 3: Flow pills -->
        <div v-if="auto.flow && auto.flow.length > 0" class="flex flex-wrap gap-1">
          <Badge
            v-for="(step, i) in auto.flow"
            :key="i"
            color="brand"
            hierarchy="agent"
            size="agent"
          >
            {{ formatFlowStep(step) }}
          </Badge>
        </div>
        <span
          v-else
          class="typo-body-12-regular text-gray-400 italic"
        >
          Sem steps configurados
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'

const props = defineProps<{
  toolName: string
  data: unknown
}>()

interface Automation {
  id: string
  name: string
  type?: string
  shared?: boolean
  isActive?: boolean
  triggers?: {
    typeTrigger?: string
    messagesConditions?: { keywords?: string[] }[]
    _count?: { executions?: number }
  }[]
  _count?: { executions?: number }
  folder?: unknown
  flow?: string[]
}

const automations = computed<Automation[]>(() => {
  const d = props.data as Record<string, unknown> | null
  if (!d) return []
  const arr = (d.automations as unknown[]) ?? []
  return arr as Automation[]
})

function triggerSummary(auto: Automation): string {
  const trigger = auto.triggers?.[0]
  if (!trigger) return 'Sem trigger'
  const type = trigger.typeTrigger === 'DIRECT' ? 'DM' : trigger.typeTrigger ?? 'Trigger'
  const keywords = trigger.messagesConditions?.[0]?.keywords?.join(', ')
  return keywords ? `${type} · "${keywords}"` : type
}

function execCount(auto: Automation): number {
  return auto._count?.executions ?? auto.triggers?.[0]?._count?.executions ?? 0
}

const FLOW_LABELS: Record<string, string> = {
  KANBAN_ACTIONS: 'Kanban',
  ASSISTANT: 'Assistente IA',
  MESSAGE: 'Mensagem',
  DELAY: 'Delay',
  CONDITION: 'Condição',
  ACTION: 'Ação',
  AB_TEST: 'Teste A/B',
  FOLLOW_UP: 'Follow-up',
  RUN_AUTOMATION: 'Automação',
  CHAT_ACTION: 'Chat'
}

function formatFlowStep(step: string): string {
  return FLOW_LABELS[step] ?? step.replace(/_/g, ' ').toLowerCase()
}
</script>
```

- [x] **Step 2: Testar visualmente**

Enviar "quais automações tenho?" no Intelligence V2, verificar nome, status badge, trigger summary, contagem de execuções e flow pills.

- [ ] **Step 3: Commit**

```bash
git add src/views/intelligenceV2/components/messages/tool-results/AutomationList.vue
git commit -m "feat(intelligence): add AutomationList component for list_automations"
```

---

## Task 5: TemplateList — lista de templates

**Files:**
- Create: `src/views/intelligenceV2/components/messages/tool-results/TemplateList.vue`

Renderiza templates com nome, status badge, categoria e idioma.

- [ ] **Step 1: Criar TemplateList.vue**

```vue
<template>
  <div v-if="templates.length > 0" class="flex flex-col gap-1">
    <span class="typo-body-12-regular text-gray-500">
      {{ templates.length }} {{ templates.length === 1 ? 'template' : 'templates' }}
    </span>

    <div class="flex flex-col divide-y divide-gray-200 overflow-y-auto rounded-cf-md border border-gray-300 max-h-[300px]">
      <div
        v-for="tpl in templates"
        :key="tpl.id ?? tpl.internalId ?? tpl.name"
        class="flex items-center gap-3 px-3 py-2.5"
      >
        <!-- Name + details -->
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="typo-body-14-medium text-gray-1000 truncate">
            {{ tpl.name }}
          </span>
          <span class="typo-body-12-regular text-gray-500">
            {{ [tpl.category, tpl.language].filter(Boolean).join(' · ') || 'Sem categoria' }}
          </span>
        </div>

        <!-- Status badge -->
        <Badge
          v-if="tpl.status"
          :color="statusColor(tpl.status)"
          hierarchy="agent"
          size="agent"
        >
          {{ statusLabel(tpl.status) }}
        </Badge>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'

const props = defineProps<{
  toolName: string
  data: unknown
}>()

interface Template {
  id?: string
  internalId?: string
  name: string
  status?: string
  category?: string
  language?: string
}

const templates = computed<Template[]>(() => {
  const d = props.data as Record<string, unknown> | null
  if (!d) return []
  const arr = (d.templates as unknown[]) ?? []
  return arr as Template[]
})

function statusColor(status: string): 'success' | 'destructive' | 'brand' | 'gray' {
  const s = status.toUpperCase()
  if (s === 'APPROVED') return 'success'
  if (s === 'REJECTED') return 'destructive'
  if (s === 'PENDING') return 'brand'
  return 'gray'
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    APPROVED: 'Aprovado',
    REJECTED: 'Rejeitado',
    PENDING: 'Pendente',
    PAUSED: 'Pausado',
    DISABLED: 'Desativado'
  }
  return map[status.toUpperCase()] ?? status
}
</script>
```

- [ ] **Step 2: Testar visualmente**

Enviar "quais templates tenho?" no Intelligence V2, verificar nome, status badge colorido, categoria e idioma.

- [ ] **Step 3: Commit**

```bash
git add src/views/intelligenceV2/components/messages/tool-results/TemplateList.vue
git commit -m "feat(intelligence): add TemplateList component for list_templates"
```

---

## Task 6: KanbanCardList — lista de cards do pipeline

**Files:**
- Create: `src/views/intelligenceV2/components/messages/tool-results/KanbanCardList.vue`

Renderiza kanban cards com contato, coluna, e badge de status/prioridade.

- [ ] **Step 1: Criar KanbanCardList.vue**

```vue
<template>
  <div v-if="cards.length > 0" class="flex flex-col gap-1">
    <span class="typo-body-12-regular text-gray-500">
      {{ cards.length }} {{ cards.length === 1 ? 'card' : 'cards' }}
    </span>

    <div class="flex flex-col divide-y divide-gray-200 overflow-y-auto rounded-cf-md border border-gray-300 max-h-[300px]">
      <div
        v-for="card in cards"
        :key="card.id"
        class="flex items-center gap-3 px-3 py-2.5"
      >
        <!-- Priority indicator -->
        <div
          class="h-8 w-1 shrink-0 rounded-full"
          :class="priorityColor(card.priority)"
        />

        <!-- Card info -->
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="typo-body-14-medium text-gray-1000 truncate">
            {{ cardLabel(card) }}
          </span>
          <span class="typo-body-12-regular text-gray-500 truncate">
            {{ cardSub(card) }}
          </span>
        </div>

        <!-- Status badge -->
        <Badge
          v-if="card.status || card.statusOportunity"
          :color="statusColor(card.status ?? card.statusOportunity ?? '')"
          hierarchy="agent"
          size="agent"
        >
          {{ statusLabel(card.status ?? card.statusOportunity ?? '') }}
        </Badge>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'

const props = defineProps<{
  toolName: string
  data: unknown
}>()

interface KanbanCard {
  id: string
  name?: string
  columnId?: string
  columnName?: string
  contactId?: string
  contactName?: string
  contact?: { name?: string }
  status?: string
  statusOportunity?: string
  priority?: string
  moderators?: unknown[]
  position?: number
}

const cards = computed<KanbanCard[]>(() => {
  const d = props.data as Record<string, unknown> | null
  if (!d) return []
  const arr = (d.cards as unknown[]) ?? []
  return arr as KanbanCard[]
})

function cardLabel(card: KanbanCard): string {
  return card.contactName ?? card.contact?.name ?? card.name ?? 'Sem nome'
}

function cardSub(card: KanbanCard): string {
  const parts: string[] = []
  if (card.columnName) parts.push(card.columnName)
  if (card.priority) parts.push(`Prioridade: ${card.priority}`)
  return parts.join(' · ') || 'Sem detalhes'
}

function priorityColor(p?: string): string {
  if (!p) return 'bg-gray-300'
  const upper = p.toUpperCase()
  if (upper === 'HIGH' || upper === 'ALTA') return 'bg-red-400'
  if (upper === 'MEDIUM' || upper === 'MEDIA') return 'bg-yellow-400'
  if (upper === 'LOW' || upper === 'BAIXA') return 'bg-green-400'
  return 'bg-gray-300'
}

function statusColor(status: string): 'success' | 'destructive' | 'brand' | 'gray' {
  const s = status.toUpperCase()
  if (s === 'OPEN' || s === 'ABERTO') return 'brand'
  if (s === 'WON' || s === 'GANHO') return 'success'
  if (s === 'LOST' || s === 'PERDIDO') return 'destructive'
  return 'gray'
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    OPEN: 'Aberto',
    WON: 'Ganho',
    LOST: 'Perdido'
  }
  return map[status.toUpperCase()] ?? status
}
</script>
```

- [ ] **Step 2: Testar visualmente**

Enviar "quais cards do pipeline tenho?" no Intelligence V2, verificar indicador de prioridade, nome do contato, coluna e status badge.

- [ ] **Step 3: Commit**

```bash
git add src/views/intelligenceV2/components/messages/tool-results/KanbanCardList.vue
git commit -m "feat(intelligence): add KanbanCardList component for list_kanban_cards"
```

---

## Task 7: DetailCard — card de detalhes key-value

**Files:**
- Create: `src/views/intelligenceV2/components/messages/tool-results/DetailCard.vue`

Renderiza dados de detalhe como pares key-value formatados. Usado para get_automation, get_template, get_template_status, get_template_buttons, get_draft.

- [ ] **Step 1: Criar DetailCard.vue**

```vue
<template>
  <div class="rounded-cf-md border border-gray-300 overflow-hidden">
    <!-- Header -->
    <div class="border-b border-gray-200 bg-gray-100 px-3 py-2">
      <span class="typo-body-12-semibold text-gray-700">{{ title }}</span>
    </div>

    <!-- Key-value pairs -->
    <div class="flex flex-col divide-y divide-gray-100">
      <div
        v-for="(row, idx) in rows"
        :key="idx"
        class="flex items-baseline gap-3 px-3 py-2"
      >
        <span class="w-28 shrink-0 typo-body-12-medium text-gray-500">{{ row.label }}</span>
        <Badge
          v-if="row.badge"
          :color="row.badgeColor ?? 'gray'"
          hierarchy="agent"
          size="agent"
        >
          {{ row.value }}
        </Badge>
        <span v-else class="min-w-0 flex-1 typo-body-12-regular text-gray-800 truncate">
          {{ row.value }}
        </span>
      </div>
    </div>

    <!-- Buttons list (get_template_buttons) -->
    <div
      v-if="buttons.length > 0"
      class="border-t border-gray-200 px-3 py-2"
    >
      <span class="typo-body-12-medium text-gray-500">Botões</span>
      <div class="mt-1.5 flex flex-wrap gap-1.5">
        <Badge
          v-for="btn in buttons"
          :key="btn.buttonId"
          color="brand"
          hierarchy="agent"
          size="agent"
        >
          {{ btn.text }}
        </Badge>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import { getToolLabel } from '../../../utils/tool-label'

const props = defineProps<{
  toolName: string
  data: unknown
}>()

interface Row {
  label: string
  value: string
  badge?: boolean
  badgeColor?: 'success' | 'destructive' | 'brand' | 'gray'
}

interface Button {
  buttonId: string
  text: string
  type: string
  index: number
}

const title = computed(() => getToolLabel(props.toolName))

const obj = computed(() => {
  const d = props.data as Record<string, unknown> | null
  if (!d) return {}
  if (d.data && typeof d.data === 'object') return d.data as Record<string, unknown>
  return d
})

const rows = computed<Row[]>(() => {
  const o = obj.value
  const result: Row[] = []

  if (o.name) result.push({ label: 'Nome', value: String(o.name) })
  if (o.id) result.push({ label: 'ID', value: String(o.id) })
  if (o.type) result.push({ label: 'Tipo', value: String(o.type) })

  if (o.status != null || o.isActive != null) {
    const isActive = o.isActive as boolean | undefined
    const status = o.status ? String(o.status) : (isActive ? 'Ativa' : 'Inativa')
    result.push({
      label: 'Status',
      value: statusLabel(status),
      badge: true,
      badgeColor: statusBadgeColor(status, isActive)
    })
  }

  if (o.category) result.push({ label: 'Categoria', value: String(o.category) })
  if (o.language) result.push({ label: 'Idioma', value: String(o.language) })
  if (o.rejectedReason) result.push({ label: 'Motivo rejeição', value: String(o.rejectedReason) })
  if (o.qualityScore) result.push({ label: 'Qualidade', value: String(o.qualityScore) })

  if (Array.isArray(o.triggers)) result.push({ label: 'Triggers', value: `${o.triggers.length} trigger(s)` })
  if (Array.isArray(o.steps)) result.push({ label: 'Steps', value: `${o.steps.length} passo(s)` })
  if (Array.isArray(o.flow) && (o.flow as string[]).length > 0) {
    result.push({ label: 'Flow', value: (o.flow as string[]).join(' → ') })
  }

  return result
})

const buttons = computed<Button[]>(() => {
  const d = props.data as Record<string, unknown> | null
  if (!d || !Array.isArray(d.buttons)) return []
  return d.buttons as Button[]
})

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    APPROVED: 'Aprovado', REJECTED: 'Rejeitado', PENDING: 'Pendente',
    PAUSED: 'Pausado', DISABLED: 'Desativado'
  }
  return map[status.toUpperCase()] ?? status
}

function statusBadgeColor(status: string, isActive?: boolean): 'success' | 'destructive' | 'brand' | 'gray' {
  if (isActive === true) return 'success'
  if (isActive === false) return 'gray'
  const s = status.toUpperCase()
  if (s === 'APPROVED' || s === 'ATIVA') return 'success'
  if (s === 'REJECTED') return 'destructive'
  if (s === 'PENDING') return 'brand'
  return 'gray'
}
</script>
```

- [ ] **Step 2: Testar visualmente**

Enviar "mostre detalhes da automação X" ou "qual o status do template Y" no Intelligence V2, verificar que o card renderiza com pares key-value formatados e badges de status.

- [ ] **Step 3: Commit**

```bash
git add src/views/intelligenceV2/components/messages/tool-results/DetailCard.vue
git commit -m "feat(intelligence): add DetailCard component for detail views"
```

---

## Task 8: BuildSummary — resumo de automação criada

**Files:**
- Create: `src/views/intelligenceV2/components/messages/tool-results/BuildSummary.vue`

Card de sucesso para build_automation com contagens e trigger types.

- [ ] **Step 1: Criar BuildSummary.vue**

```vue
<template>
  <div class="rounded-cf-md border border-green-200 bg-green-50 px-4 py-3">
    <div class="flex items-center gap-2">
      <PhLightning :size="16" weight="fill" class="shrink-0 text-green-600" />
      <span class="typo-body-14-medium text-green-800">
        {{ summary.message || 'Automação criada com sucesso' }}
      </span>
    </div>

    <div v-if="hasMeta" class="mt-2 flex flex-wrap items-center gap-2">
      <Badge v-if="summary.stepCount" color="brand" hierarchy="agent" size="agent">
        {{ summary.stepCount }} {{ summary.stepCount === 1 ? 'passo' : 'passos' }}
      </Badge>
      <Badge v-if="summary.triggerCount" color="brand" hierarchy="agent" size="agent">
        {{ summary.triggerCount }} {{ summary.triggerCount === 1 ? 'trigger' : 'triggers' }}
      </Badge>
      <Badge
        v-for="tt in summary.triggerTypes ?? []"
        :key="tt"
        color="gray"
        hierarchy="agent"
        size="agent"
      >
        {{ tt }}
      </Badge>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { PhLightning } from '@phosphor-icons/vue'
import { Badge } from '@/components/ui/badge'

const props = defineProps<{
  toolName: string
  data: unknown
}>()

interface BuildData {
  success?: boolean
  automationId?: string
  stepCount?: number
  triggerCount?: number
  triggerTypes?: string[]
  message?: string
}

const summary = computed<BuildData>(() => {
  const d = props.data as BuildData | null
  return d ?? {}
})

const hasMeta = computed(() =>
  (summary.value.stepCount ?? 0) > 0 ||
  (summary.value.triggerCount ?? 0) > 0 ||
  (summary.value.triggerTypes?.length ?? 0) > 0
)
</script>
```

- [ ] **Step 2: Testar visualmente**

Pedir ao Intelligence para criar uma automação, verificar que ao completar o build_automation o card verde aparece com ícone de raio, mensagem de sucesso, e pills com contagens.

- [ ] **Step 3: Commit**

```bash
git add src/views/intelligenceV2/components/messages/tool-results/BuildSummary.vue
git commit -m "feat(intelligence): add BuildSummary component for build_automation"
```

---

## Task 9: Commit final consolidado

- [ ] **Step 1: Verificar typecheck**

```bash
cd chatfunnel-front && npm run typecheck
```

Deve passar sem erros novos.

- [ ] **Step 2: Verificar lint**

```bash
npm run lint
```

Corrigir quaisquer warnings.

- [ ] **Step 3: Teste integrado completo**

No Intelligence V2, testar cada cenário:
- "quais canais tenho?" → ChannelList
- "liste minhas automações" → AutomationList
- "quais templates tenho?" → TemplateList
- "mostre os cards do pipeline" → KanbanCardList
- "detalhes da automação X" → DetailCard
- "crie uma automação de boas vindas" → BuildSummary (após build)
