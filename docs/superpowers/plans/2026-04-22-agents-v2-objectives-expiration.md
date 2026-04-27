# Agents V2 — Objectives e Expiração por Tempo (Frontend) Implementation Plan

> **⚠ Superseded:** Este plano implementa o modelo `{ name, description }`. A regra de negocio mudou em 2026-04-24 para `{ name, key, description }` com UI baseada em cards para tools vinculadas. Ver plano de refactor: [`2026-04-24-agents-v2-objectives-key-refactor.md`](./2026-04-24-agents-v2-objectives-key-refactor.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar no formulário `AgentsForm` (chatfunnel-front) a nova tool `OBJECTIVES` (lista dinâmica name/description com validação) e o bloco de expiração por inatividade (`duration`/`unit`), conforme especificado em `docs/features/agent-exec/agents-v2-frontend-manual.md`.

**Architecture:** O formulário já segue o padrão de 10 steps orquestrados em `AgentsForm/index.vue`, com tools plugáveis via `AddToolModal` + `ToolsStep` + dialogs individuais em `components/modals/`. Vamos (1) adicionar um novo tool `OBJECTIVES` seguindo o mesmo padrão dos existentes (ex.: `DataMappingConfigDialog.vue`) e (2) introduzir um novo step `SessionStep` (step 11) que agrupa toggle + duration + unit. O payload será estendido para emitir os novos campos no formato exato do backend (NestJS `PUT/POST /agents-v2/:id`), respeitando a semântica de substituição total do manual (seção 5).

**Tech Stack:** Vue 3 (Composition API, `<script setup lang="ts">`), VeeValidate + Zod, shadcn-vue, Tailwind v4, Vitest + `@testing-library/vue` (happy-dom). Services via `@services/AgentsV2Service`.

---

## File Structure

**Novos arquivos:**

| Arquivo | Responsabilidade |
|---|---|
| `chatfunnel-front/src/views/agents/AgentsForm/components/modals/objectivesValidation.ts` | Funções puras: validação de nome snake_case + lista de nomes reservados |
| `chatfunnel-front/src/views/agents/AgentsForm/components/modals/objectivesValidation.spec.ts` | Unit tests das validações |
| `chatfunnel-front/src/views/agents/AgentsForm/components/modals/ObjectivesConfigDialog.vue` | Dialog de config da tool OBJECTIVES: lista `{name, description}` dinâmica |
| `chatfunnel-front/src/views/agents/AgentsForm/components/steps/SessionStep.vue` | Step 11: toggle + duration + unit |

**Arquivos modificados:**

| Arquivo | Escopo da mudança |
|---|---|
| `chatfunnel-front/src/views/agents/AgentsForm/components/modals/AddToolModal.vue` | Adicionar entry `OBJECTIVES` em `AVAILABLE_TOOLS` |
| `chatfunnel-front/src/views/agents/AgentsForm/components/steps/ToolsStep.vue` | Registrar `OBJECTIVES` em `toolConfigs`, `configDialogs`, `isToolConfigured`, e renderizar `ObjectivesConfigDialog` |
| `chatfunnel-front/src/views/agents/AgentsForm/index.vue` | Schema Zod, `initialValues`, `steps[]`, `stepFields`, `buildToolConfigs`, `buildApiPayload`, `loadAgent`, `completedSteps` |

---

## Task 1: Validação de nome de objective (puro TS + TDD)

**Files:**
- Create: `chatfunnel-front/src/views/agents/AgentsForm/components/modals/objectivesValidation.ts`
- Test: `chatfunnel-front/src/views/agents/AgentsForm/components/modals/objectivesValidation.spec.ts`

**Contexto:** A seção 4 do manual exige (a) `name` snake_case sem espaços, (b) `name` não pode colidir com 5 nomes reservados do runtime.

- [ ] **Step 1: Criar o arquivo de testes falhando**

```ts
// chatfunnel-front/src/views/agents/AgentsForm/components/modals/objectivesValidation.spec.ts
import { describe, it, expect } from 'vitest'
import {
  RESERVED_OBJECTIVE_NAMES,
  isValidObjectiveName,
  isReservedObjectiveName,
  validateObjectiveName
} from './objectivesValidation'

describe('objectivesValidation', () => {
  describe('isValidObjectiveName', () => {
    it('aceita snake_case puro', () => {
      expect(isValidObjectiveName('agendar_demo')).toBe(true)
      expect(isValidObjectiveName('lead_desqualificado')).toBe(true)
      expect(isValidObjectiveName('a')).toBe(true)
    })

    it('rejeita string vazia', () => {
      expect(isValidObjectiveName('')).toBe(false)
    })

    it('rejeita espaços', () => {
      expect(isValidObjectiveName('agendar demo')).toBe(false)
    })

    it('rejeita hifens e pontuacao', () => {
      expect(isValidObjectiveName('agendar-demo')).toBe(false)
      expect(isValidObjectiveName('agendar.demo')).toBe(false)
    })

    it('rejeita maiusculas', () => {
      expect(isValidObjectiveName('AgendarDemo')).toBe(false)
      expect(isValidObjectiveName('agendar_Demo')).toBe(false)
    })

    it('rejeita numero no inicio', () => {
      expect(isValidObjectiveName('1demo')).toBe(false)
    })

    it('aceita digito apos underscore/letra', () => {
      expect(isValidObjectiveName('demo_1')).toBe(true)
      expect(isValidObjectiveName('v2_demo')).toBe(true)
    })
  })

  describe('isReservedObjectiveName', () => {
    it('detecta todos os 5 nomes reservados', () => {
      for (const name of RESERVED_OBJECTIVE_NAMES) {
        expect(isReservedObjectiveName(name)).toBe(true)
      }
    })

    it('retorna false para nomes customizados', () => {
      expect(isReservedObjectiveName('agendar_demo')).toBe(false)
    })

    it('e case-sensitive (reservados sao lower snake_case)', () => {
      expect(isReservedObjectiveName('Save_Contact_Data')).toBe(false)
    })
  })

  describe('validateObjectiveName', () => {
    it('retorna null quando valido', () => {
      expect(validateObjectiveName('agendar_demo')).toBeNull()
    })

    it('retorna mensagem quando vazio', () => {
      expect(validateObjectiveName('')).toBe('Nome do objective é obrigatório')
    })

    it('retorna mensagem quando formato invalido', () => {
      expect(validateObjectiveName('Agendar Demo')).toBe(
        'Use apenas snake_case (letras minúsculas, números e underline)'
      )
    })

    it('retorna mensagem quando nome reservado', () => {
      expect(validateObjectiveName('save_contact_data')).toBe(
        'Este nome é reservado pelo sistema e não pode ser usado'
      )
    })
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd chatfunnel-front && npx vitest run src/views/agents/AgentsForm/components/modals/objectivesValidation.spec.ts`
Expected: todos falham com `Cannot find module './objectivesValidation'`.

- [ ] **Step 3: Implementar as funções**

```ts
// chatfunnel-front/src/views/agents/AgentsForm/components/modals/objectivesValidation.ts
export const RESERVED_OBJECTIVE_NAMES = [
  'save_contact_data',
  'get_google_calendar_slots',
  'create_google_calendar_event',
  'cancel_google_calendar_event',
  'search_google_calendar_events'
] as const

const SNAKE_CASE_RE = /^[a-z][a-z0-9_]*$/

export function isValidObjectiveName(name: string): boolean {
  if (!name) return false
  return SNAKE_CASE_RE.test(name)
}

export function isReservedObjectiveName(name: string): boolean {
  return (RESERVED_OBJECTIVE_NAMES as readonly string[]).includes(name)
}

export function validateObjectiveName(name: string): string | null {
  if (!name) return 'Nome do objective é obrigatório'
  if (!isValidObjectiveName(name)) {
    return 'Use apenas snake_case (letras minúsculas, números e underline)'
  }
  if (isReservedObjectiveName(name)) {
    return 'Este nome é reservado pelo sistema e não pode ser usado'
  }
  return null
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd chatfunnel-front && npx vitest run src/views/agents/AgentsForm/components/modals/objectivesValidation.spec.ts`
Expected: 13 testes passando.

- [ ] **Step 5: Commit**

```bash
cd chatfunnel-front
git add src/views/agents/AgentsForm/components/modals/objectivesValidation.ts src/views/agents/AgentsForm/components/modals/objectivesValidation.spec.ts
git commit -m "feat(agents-v2): add snake_case + reserved-name validation for objectives"
```

---

## Task 2: ObjectivesConfigDialog (manual + reuso de automation/external query)

**Files:**
- Create: `chatfunnel-front/src/views/agents/AgentsForm/components/modals/ObjectivesConfigDialog.vue`

**Contexto:** Dialog com dois modos de adição, conforme manual sec. 4 + 4.5:

1. **Manual** — botão "Adicionar manualmente" cria item com `name`/`description` editáveis e validação snake_case + não-reservado.
2. **Reusar tool existente** — dropdown lista as `EXTERNAL_QUERIES.queries[]` e `AUTOMATIONS.conditionalAutomations[]` já cadastradas no agente. Ao escolher, o objective é criado com `name` igual à tool (bloqueado para edição) e `description` vazia pro usuário preencher (manual: "a description continua obrigatória e reforça ao LLM quando o critério está atingido").

`DATA_MAPPING` e `CALENDAR` NÃO aparecem como fontes — manual sec. 4.5 "Gotchas" confirma que continuam proibidos por colidirem com nomes reservados (`save_contact_data`, `get_google_calendar_slots`, etc.).

O flag `locked` no item é **client-only**: stripado antes de emitir. O payload que sai pro backend mantém formato do manual — `{ name, description }`.

- [ ] **Step 1: Criar o componente**

```vue
<!-- chatfunnel-front/src/views/agents/AgentsForm/components/modals/ObjectivesConfigDialog.vue -->
<template>
  <DialogControl
    :open="isOpen"
    @update:open="handleOpenChange"
    title="Objetivos"
    subtitle="Defina metas nomeadas que o agente pode declarar como concluídas durante a conversa."
    size="xl"
    :has-actions="true"
    :close-on-action="false"
    action-button-text="Salvar"
    @action="handleConfirm"
    @cancel="handleCancel"
  >
    <div class="flex flex-col gap-6">
      <Alert class="border-none bg-blue-50">
        <AlertDescription class="typo-body-12-regular text-blue-700">
          Cada objetivo vira uma ferramenta que o LLM pode acionar. Use
          snake_case sem espaços e descreva com clareza quando o objetivo foi
          atingido. Você também pode reutilizar uma automation ou external
          query existente — nesse modo o nome fica vinculado à tool de origem.
        </AlertDescription>
      </Alert>

      <div v-if="!values.objectives?.length" class="py-4 text-center">
        <p class="typo-body-14-regular text-gray-500">
          Nenhum objetivo adicionado ainda.
        </p>
      </div>

      <div v-for="i in objectiveIndices" :key="i" class="flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span
              class="typo-body-12-medium rounded-cf-sm bg-brand-100 text-brand-700 px-2 py-0.5"
            >
              Objetivo #{{ i + 1 }}
            </span>
            <span
              v-if="values.objectives?.[i]?.locked"
              class="typo-body-12-medium rounded-cf-sm inline-flex items-center gap-1 bg-teal-100 text-teal-700 px-2 py-0.5"
            >
              <PhLink :size="12" />
              Vinculado a tool
            </span>
          </div>
          <Button
            variant="icon"
            size="icon-sm"
            tone="danger"
            @click="removeObjective(i)"
          >
            <PhTrash :size="14" />
          </Button>
        </div>

        <div
          v-if="values.objectives?.[i]?.locked"
          class="flex flex-col gap-2"
        >
          <FieldLabel>Nome</FieldLabel>
          <div
            class="rounded-cf-md flex items-center gap-2 border border-gray-300 bg-gray-50 px-3 py-2"
          >
            <PhLink :size="14" class="text-gray-500" />
            <span class="typo-body-14-regular text-gray-700">
              {{ values.objectives[i].name }}
            </span>
          </div>
          <p class="typo-body-12-regular text-gray-500">
            Nome bloqueado: é vinculado a uma tool existente. Remova e adicione
            novamente para trocar.
          </p>
        </div>
        <VeeInput
          v-else
          :name="`objectives[${i}].name`"
          label="Nome"
          placeholder="Ex: agendar_demo"
        />

        <VeeTextarea
          :name="`objectives[${i}].description`"
          label="Descrição"
          :rows="3"
          placeholder="Ex: Chame quando o lead confirmar o agendamento de uma demonstração"
        />

        <div
          v-if="i < (values.objectives?.length ?? 0) - 1"
          class="border-t border-gray-200"
        />
      </div>

      <div class="flex flex-wrap justify-center gap-3">
        <Button
          variant="outline"
          tone="primary"
          size="medium"
          @click="addObjective"
        >
          <template #startIcon>
            <PhPlus :size="16" />
          </template>
          Adicionar manualmente
        </Button>

        <DropdownMenu v-if="hasToolSources">
          <DropdownMenuTrigger as-child>
            <Button variant="outline" tone="dark" size="medium">
              <template #startIcon>
                <PhLink :size="16" />
              </template>
              Usar tool existente
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent class="w-80">
            <template v-if="externalQuerySources.length">
              <DropdownMenuLabel>Consultas externas</DropdownMenuLabel>
              <DropdownMenuItem
                v-for="src in externalQuerySources"
                :key="`eq-${src.name}`"
                @click="addSourcedObjective(src)"
              >
                <div class="flex flex-col">
                  <span class="typo-body-14-medium">{{ src.name }}</span>
                  <span
                    class="typo-body-12-regular line-clamp-1 text-gray-500"
                  >
                    {{ src.description || 'Sem descrição' }}
                  </span>
                </div>
              </DropdownMenuItem>
            </template>
            <DropdownMenuSeparator
              v-if="externalQuerySources.length && automationSources.length"
            />
            <template v-if="automationSources.length">
              <DropdownMenuLabel>Automações</DropdownMenuLabel>
              <DropdownMenuItem
                v-for="src in automationSources"
                :key="`auto-${src.name}`"
                @click="addSourcedObjective(src)"
              >
                <div class="flex flex-col">
                  <span class="typo-body-14-medium">{{ src.name }}</span>
                  <span
                    class="typo-body-12-regular line-clamp-1 text-gray-500"
                  >
                    {{ src.description || 'Sem descrição' }}
                  </span>
                </div>
              </DropdownMenuItem>
            </template>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p
        v-if="!hasToolSources"
        class="typo-body-12-regular text-center text-gray-500"
      >
        Para vincular a uma automation ou consulta externa, configure-a antes
        nas ferramentas correspondentes.
      </p>
    </div>
  </DialogControl>
</template>

<script lang="ts">
export interface ToolSourceRef {
  name: string
  description: string
}

export interface ObjectiveItem {
  name: string
  description: string
  /** Client-only: true quando o name veio de uma automation/query existente. Stripado antes do emit. */
  locked?: boolean
}

export interface ObjectivesConfig {
  objectives: ObjectiveItem[]
}

export interface AvailableToolSources {
  externalQueries?: ToolSourceRef[]
  automations?: ToolSourceRef[]
}
</script>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'
import { PhPlus, PhTrash, PhLink } from '@phosphor-icons/vue'
import { useAlerts } from '@/common/composables/AlertsComposable'
import { useAlertDialog } from '@/components/ui/alert-dialog'
import { DialogControl } from '@/components/ui/dialog'
import VeeInput from '@/components/ui/input/VeeInput.vue'
import { VeeTextarea } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FieldLabel } from '@/components/ui/field'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import {
  validateObjectiveName,
  isReservedObjectiveName,
  isValidObjectiveName
} from './objectivesValidation'

const props = defineProps<{
  open: boolean
  modelValue: ObjectivesConfig
  availableToolSources?: AvailableToolSources
}>()

const { showToastError } = useAlerts()
const { showConfirmation } = useAlertDialog()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:modelValue': [value: ObjectivesConfig]
}>()

const schema = z.object({
  objectives: z.array(
    z.object({
      name: z
        .string()
        .min(1, 'Nome do objective é obrigatório')
        .refine(isValidObjectiveName, {
          message:
            'Use apenas snake_case (letras minúsculas, números e underline)'
        })
        .refine((v) => !isReservedObjectiveName(v), {
          message: 'Este nome é reservado pelo sistema e não pode ser usado'
        }),
      description: z.string().min(1, 'Descrição é obrigatória'),
      locked: z.boolean().optional()
    })
  )
})

const { handleSubmit, resetForm, values, setFieldValue, meta } = useForm({
  validationSchema: toTypedSchema(schema),
  initialValues: {
    objectives: [] as ObjectiveItem[]
  }
})

const objectiveIndices = computed(() =>
  Array.from({ length: values.objectives?.length ?? 0 }, (_, i) => i)
)

const externalQuerySources = computed(() =>
  (props.availableToolSources?.externalQueries ?? []).filter(
    (s) => !!s.name && !isReservedObjectiveName(s.name)
  )
)
const automationSources = computed(() =>
  (props.availableToolSources?.automations ?? []).filter(
    (s) => !!s.name && !isReservedObjectiveName(s.name)
  )
)
const hasToolSources = computed(
  () =>
    externalQuerySources.value.length > 0 ||
    automationSources.value.length > 0
)

const isOpen = ref(props.open)

watch(
  () => props.open,
  (val) => {
    isOpen.value = val
    if (val) {
      resetForm({
        values: {
          objectives: props.modelValue.objectives.map((o) => ({ ...o }))
        }
      })
    }
  }
)

function closeDialog() {
  resetForm({
    values: {
      objectives: props.modelValue.objectives.map((o) => ({ ...o }))
    }
  })
  isOpen.value = false
  emit('update:open', false)
}

async function tryClose() {
  if (meta.value.dirty) {
    const { isConfirmed } = await showConfirmation(
      'Você tem alterações não salvas. Deseja descartar?',
      {
        title: 'Alterações não salvas',
        confirmText: 'Descartar',
        cancelText: 'Continuar editando'
      }
    )
    if (!isConfirmed) return
  }
  closeDialog()
}

async function handleOpenChange(val: boolean) {
  if (val) {
    isOpen.value = true
    return
  }
  await tryClose()
}

function addObjective() {
  setFieldValue('objectives', [
    ...(values.objectives ?? []),
    { name: '', description: '', locked: false }
  ])
}

function addSourcedObjective(source: ToolSourceRef) {
  const existing = values.objectives ?? []
  if (existing.some((o) => o.name === source.name)) {
    showToastError(`Já existe um objective com nome "${source.name}"`)
    return
  }
  setFieldValue('objectives', [
    ...existing,
    { name: source.name, description: '', locked: true }
  ])
}

function removeObjective(index: number) {
  const updated = [...(values.objectives ?? [])]
  updated.splice(index, 1)
  setFieldValue('objectives', updated)
}

const fieldLabelMap: Record<string, string> = {
  name: 'Nome',
  description: 'Descrição'
}

const handleConfirm = handleSubmit(
  (formValues) => {
    const seen = new Set<string>()
    for (const o of formValues.objectives) {
      if (seen.has(o.name)) {
        showToastError(`Objetivo duplicado: "${o.name}"`)
        return
      }
      seen.add(o.name)
      const msg = validateObjectiveName(o.name)
      if (msg) {
        showToastError(`"${o.name}": ${msg}`)
        return
      }
    }

    emit('update:modelValue', {
      objectives: formValues.objectives.map(
        ({ locked: _locked, ...rest }) => ({ ...rest })
      )
    })
    closeDialog()
  },
  ({ errors }) => {
    const messages: string[] = []
    for (const [path, message] of Object.entries(errors)) {
      const match = path.match(/^objectives\[(\d+)]\.(\w+)$/)
      if (match) {
        const index = Number(match[1]) + 1
        const label = fieldLabelMap[match[2]] ?? match[2]
        messages.push(`Objetivo #${index} - ${label}: ${message}`)
      } else {
        messages.push(message)
      }
    }
    messages.forEach((msg, i) =>
      setTimeout(() => showToastError(msg), i * 300)
    )
  }
)

function handleCancel() {
  tryClose()
}
</script>
```

- [ ] **Step 2: Rodar o typecheck para garantir que compila**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit 2>&1 | grep -E "ObjectivesConfigDialog|objectivesValidation" || echo "no errors"`
Expected: `no errors`.

- [ ] **Step 3: Commit**

```bash
cd chatfunnel-front
git add src/views/agents/AgentsForm/components/modals/ObjectivesConfigDialog.vue
git commit -m "feat(agents-v2): ObjectivesConfigDialog with manual + tool-source add modes"
```

---

## Task 3: Registrar OBJECTIVES em AVAILABLE_TOOLS

**Files:**
- Modify: `chatfunnel-front/src/views/agents/AgentsForm/components/modals/AddToolModal.vue:46-109`

- [ ] **Step 1: Adicionar o import do ícone**

Em `AddToolModal.vue`, localizar a linha:

```ts
import {
  PhDatabase,
  PhGlobeSimple,
  PhCalendarBlank,
  PhClock,
  PhRobot,
} from '@phosphor-icons/vue';
```

E substituir por:

```ts
import {
  PhDatabase,
  PhGlobeSimple,
  PhCalendarBlank,
  PhClock,
  PhRobot,
  PhTarget,
} from '@phosphor-icons/vue';
```

- [ ] **Step 2: Adicionar a entrada no array AVAILABLE_TOOLS**

Em `AddToolModal.vue`, localizar o último elemento do array (id `'SERVICE_HOURS'` terminando em `iconClass: 'text-rose-600'`) e adicionar a nova entrada **antes** do fechamento `];`:

```ts
  {
    id: 'OBJECTIVES',
    label: 'Objetivos',
    description:
      'Metas nomeadas que o agente pode declarar como concluídas para encerrar a conversa.',
    icon: PhTarget,
    bgClass: 'bg-teal-100',
    iconClass: 'text-teal-600',
  },
```

- [ ] **Step 3: Confirmar no dev server que o card aparece**

Run: `cd chatfunnel-front && npm run dev` (em outro terminal), abrir `http://localhost:5173/agents/create`, clicar step "Ferramentas" → "Adicionar ferramenta" → verificar que o card "Objetivos" aparece na lista com ícone de alvo. Matar o servidor com Ctrl+C após validar.

- [ ] **Step 4: Commit**

```bash
cd chatfunnel-front
git add src/views/agents/AgentsForm/components/modals/AddToolModal.vue
git commit -m "feat(agents-v2): register OBJECTIVES in AVAILABLE_TOOLS"
```

---

## Task 4: Wirear OBJECTIVES em ToolsStep

**Files:**
- Modify: `chatfunnel-front/src/views/agents/AgentsForm/components/steps/ToolsStep.vue`

**Contexto:** Registrar estado reativo de `toolConfigs.OBJECTIVES`, o flag `configDialogs.OBJECTIVES`, o case de `isToolConfigured`, e renderizar o dialog.

- [ ] **Step 1: Adicionar import do dialog e tipo**

Em `ToolsStep.vue`, após a linha `import ServiceHoursConfigDialog from '../modals/ServiceHoursConfigDialog.vue';`, adicionar:

```ts
import ObjectivesConfigDialog from '../modals/ObjectivesConfigDialog.vue';
import type { ObjectivesConfig } from '../modals/ObjectivesConfigDialog.vue';
```

- [ ] **Step 2: Registrar em `configDialogs`**

Localizar o bloco:

```ts
const configDialogs = reactive<Record<string, boolean>>({
  DATA_MAPPING: false,
  EXTERNAL_QUERIES: false,
  calendar: false,
  automations: false,
  SERVICE_HOURS: false,
});
```

E substituir por:

```ts
const configDialogs = reactive<Record<string, boolean>>({
  DATA_MAPPING: false,
  EXTERNAL_QUERIES: false,
  CALENDAR: false,
  AUTOMATIONS: false,
  SERVICE_HOURS: false,
  OBJECTIVES: false,
});
```

(também corrige os nomes minúsculos `calendar`/`automations` para bater com os IDs reais.)

- [ ] **Step 3: Adicionar OBJECTIVES ao tipo e ao objeto `toolConfigs`**

Localizar:

```ts
const toolConfigs = reactive<{
  DATA_MAPPING: DataMappingConfig;
  EXTERNAL_QUERIES: ExternalQueriesConfig;
  CALENDAR: CalendarConfig;
  AUTOMATIONS: AutomationsConfig;
  SERVICE_HOURS: ServiceHoursConfig;
}>({
```

E adicionar `OBJECTIVES: ObjectivesConfig;` à assinatura do tipo:

```ts
const toolConfigs = reactive<{
  DATA_MAPPING: DataMappingConfig;
  EXTERNAL_QUERIES: ExternalQueriesConfig;
  CALENDAR: CalendarConfig;
  AUTOMATIONS: AutomationsConfig;
  SERVICE_HOURS: ServiceHoursConfig;
  OBJECTIVES: ObjectivesConfig;
}>({
```

Depois, no objeto literal inicial, adicionar após `SERVICE_HOURS: { ... }` (antes do `});` final):

```ts
  OBJECTIVES: {
    objectives: [],
  },
```

- [ ] **Step 4: Adicionar case em `isToolConfigured`**

Localizar o `switch (toolId)` dentro de `isToolConfigured` e adicionar antes do `default:`:

```ts
    case 'OBJECTIVES':
      return toolConfigs['OBJECTIVES'].objectives.length > 0;
```

- [ ] **Step 5: Renderizar o `ObjectivesConfigDialog` no template passando as fontes disponíveis**

No `<template>`, localizar o bloco com os config dialogs (próximo de `<ServiceHoursConfigDialog ... />`) e adicionar após ele:

```vue
    <ObjectivesConfigDialog
      v-model:open="configDialogs['OBJECTIVES']"
      v-model="toolConfigs['OBJECTIVES']"
      :available-tool-sources="{
        externalQueries: (toolConfigs['EXTERNAL_QUERIES']?.queries ?? []).map((q) => ({
          name: q.name,
          description: q.description,
        })),
        automations: (toolConfigs['AUTOMATIONS']?.conditionalAutomations ?? []).map((a) => ({
          name: a.name,
          description: a.description,
        })),
      }"
    />
```

> **Observação:** `DATA_MAPPING` e `CALENDAR` intencionalmente ficam **fora** das fontes. O manual sec. 4.5 "Gotchas" proíbe uso como objective por colidirem com os 5 nomes reservados do runtime.

- [ ] **Step 6: Confirmar no dev server**

Run: `cd chatfunnel-front && npm run dev`, abrir `/agents/create`, step Ferramentas:
- Adicionar tool **OBJECTIVES**, clicar "Configurar":
  - Adicionar 1 objetivo manual com `name=agendar_demo` e `description=ok`. Salvar → badge muda para "Configurado".
- Voltar ao step Ferramentas, adicionar tool **EXTERNAL_QUERIES**, configurar com uma query `consultar_plano` / description "Busca plano do cliente".
- Voltar em OBJECTIVES → "Usar tool existente" → verificar que `consultar_plano` aparece na lista sob "Consultas externas". Selecionar → novo item aparece com badge "Vinculado a tool", name bloqueado, description editável.
- Verificar que `DATA_MAPPING` e `CALENDAR` configurados **não aparecem** no dropdown.
- Matar o servidor.

- [ ] **Step 7: Commit**

```bash
cd chatfunnel-front
git add src/views/agents/AgentsForm/components/steps/ToolsStep.vue
git commit -m "feat(agents-v2): wire OBJECTIVES config into ToolsStep"
```

---

## Task 5: buildToolConfigs + loadAgent para OBJECTIVES

**Files:**
- Modify: `chatfunnel-front/src/views/agents/AgentsForm/index.vue:317-411` (`buildToolConfigs` e `buildApiPayload`)
- Modify: `chatfunnel-front/src/views/agents/AgentsForm/index.vue:528-664` (`loadAgent`)

**Contexto:** O backend (seção 5) faz `deleteMany + create` em transação. Quando OBJECTIVES está em `enabledTools`, a lista é substituída. Precisamos (a) emitir `toolConfigs.OBJECTIVES` com o array completo quando o tool está selecionado, (b) em modo edit, se o agente originalmente tinha objectives e o usuário removeu a tool, enviar `toolConfigs.OBJECTIVES = { objectives: [] }` para acionar o deleteMany.

- [ ] **Step 1: Criar ref para memória do estado inicial de OBJECTIVES**

Em `index.vue`, após `const isHydrating = ref(false);` (aproximadamente linha 219), adicionar:

```ts
const originalHadObjectives = ref(false);
```

- [ ] **Step 2: Estender `buildToolConfigs` com o case OBJECTIVES**

Localizar, dentro da função `buildToolConfigs()`, o bloco `else if (id === 'SERVICE_HOURS' ...)` e adicionar **antes** do `else { result[id] = config; }`:

```ts
    } else if (id === 'OBJECTIVES' && config && 'objectives' in config) {
      const objConfig = config as { objectives: { name: string; description: string }[] };
      result[id] = {
        objectives: objConfig.objectives.map((o) => ({
          name: o.name,
          description: o.description,
        })),
      };
    }
```

- [ ] **Step 3: Injetar delete-guard em `buildApiPayload`**

Localizar dentro de `buildApiPayload()` a linha `const toolConfigs = buildToolConfigs();` e substituir o bloco seguinte (até `return {`) por:

```ts
  const enabledTools = toolsStepRef.value?.selectedTools ?? values.tools ?? [];
  const toolConfigs = buildToolConfigs() ?? {};

  // Delete-guard: se o agente tinha objectives e o usuario removeu a tool,
  // enviar array vazio para acionar o deleteMany no backend (manual sec. 5).
  const objectivesNowSelected = enabledTools.includes('OBJECTIVES');
  if (
    isEditMode.value &&
    originalHadObjectives.value &&
    !objectivesNowSelected
  ) {
    (toolConfigs as Record<string, unknown>)['OBJECTIVES'] = { objectives: [] };
  }

  const finalToolConfigs =
    Object.keys(toolConfigs).length > 0 ? toolConfigs : undefined;

  const mediaIds = referenceDataStepRef.value?.getMediaIds() ?? [];

  const automationsConfig = toolsStepRef.value?.toolConfigs?.['AUTOMATIONS'] as
    { lifecycleAutomations?: Record<string, unknown> } | undefined;
  const lifecycleAutomations = enabledTools.includes('AUTOMATIONS')
    ? automationsConfig?.lifecycleAutomations ?? undefined
    : undefined;
```

E trocar `toolConfigs,` dentro do `return { ... }` por `toolConfigs: finalToolConfigs,`.

- [ ] **Step 4: Hidratar objectives no `loadAgent`**

Em `loadAgent()`, localizar o bloco `// DATA_MAPPING ← agent.fields[]` e adicionar **antes** dele:

```ts
      // OBJECTIVES ← agent.objectives[]
      if (agent.objectives?.length) {
        adapted['OBJECTIVES'] = {
          objectives: agent.objectives.map((o: any) => ({
            name: o.name,
            description: o.description,
          })),
        };
        originalHadObjectives.value = true;
      }
```

- [ ] **Step 5: Confirmar no dev server**

Run: `cd chatfunnel-front && npm run dev`.
- Criar agente novo com 1 objective. Abrir DevTools → Network → salvar → verificar payload POST:
  - `enabledTools` contém `"OBJECTIVES"`
  - `toolConfigs.OBJECTIVES.objectives` é um array com 1 item `{name, description}`
- Editar o agente, remover a tool OBJECTIVES, salvar → verificar payload PUT:
  - `enabledTools` NÃO contém `"OBJECTIVES"`
  - `toolConfigs.OBJECTIVES.objectives` É `[]` (delete-guard)
- Matar o servidor.

- [ ] **Step 6: Commit**

```bash
cd chatfunnel-front
git add src/views/agents/AgentsForm/index.vue
git commit -m "feat(agents-v2): serialize/hydrate OBJECTIVES with delete-guard"
```

---

## Task 6: SessionStep component (duration/unit)

**Files:**
- Create: `chatfunnel-front/src/views/agents/AgentsForm/components/steps/SessionStep.vue`

**Contexto:** Step 11 do form. Toggle "Encerrar por inatividade" controla a visibilidade do bloco `duration`+`unit`. Os valores são persistidos no form via `useField` (pois o step não recebe props/state próprio, segue padrão dos outros steps).

- [ ] **Step 1: Criar o componente**

```vue
<!-- chatfunnel-front/src/views/agents/AgentsForm/components/steps/SessionStep.vue -->
<template>
  <div class="flex flex-col gap-6">
    <StepHeader
      title="Encerramento por inatividade"
      description="Defina se a sessão deve expirar quando o contato ficar sem responder por um período."
    />

    <Card class="flex flex-col gap-5 p-5!">
      <div class="flex items-start justify-between gap-4">
        <div class="flex flex-1 flex-col gap-1">
          <span class="typo-body-14-medium text-gray-1000">
            Encerrar sessão por inatividade
          </span>
          <span class="typo-body-12-regular text-gray-600">
            O timer é reiniciado a cada nova mensagem do contato. Com objetivos
            habilitados, o timer só começa quando um objetivo é atingido.
          </span>
        </div>
        <Switch
          :model-value="expirationEnabled"
          @update:model-value="handleToggle"
        />
      </div>

      <div v-if="expirationEnabled" class="grid grid-cols-2 gap-4">
        <VeeInput
          name="duration"
          type="number"
          label="Duração"
          :min="1"
          placeholder="Ex: 30"
        />

        <VeeField name="unit" v-slot="{ errorMessage, handleChange, value }">
          <Field>
            <FieldLabel>Unidade</FieldLabel>
            <NativeSelect
              :model-value="value"
              :invalid="!!errorMessage"
              @update:model-value="handleChange"
            >
              <option value="SECONDS">Segundos</option>
              <option value="MINUTES">Minutos</option>
              <option value="HOURS">Horas</option>
              <option value="DAYS">Dias</option>
            </NativeSelect>
            <FieldError :errors="[errorMessage]" />
          </Field>
        </VeeField>
      </div>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useField, Field as VeeField } from 'vee-validate'
import VeeInput from '@/components/ui/input/VeeInput.vue'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { NativeSelect } from '@/components/ui/native-select'
import { Field, FieldLabel, FieldError } from '@/components/ui/field'
import StepHeader from './StepHeader.vue'

const { value: durationValue, setValue: setDuration } = useField<number | null>(
  'duration'
)
const { setValue: setUnit } = useField<string>('unit')

const expirationEnabled = computed(
  () => durationValue.value !== null && durationValue.value !== undefined
)

function handleToggle(enabled: boolean) {
  if (enabled) {
    setDuration(30)
    setUnit('MINUTES')
  } else {
    setDuration(null)
  }
}
</script>
```

- [ ] **Step 2: Verificar se `NativeSelect` e `Switch` existem**

Run: `cd chatfunnel-front && ls src/components/ui/native-select src/components/ui/switch`
Expected: lista os diretórios com `index.ts` e `NativeSelect.vue`/`Switch.vue` (são componentes listados no CLAUDE.md do front).

- [ ] **Step 3: Typecheck**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit 2>&1 | grep -E "SessionStep" || echo "no errors"`
Expected: `no errors`.

- [ ] **Step 4: Commit**

```bash
cd chatfunnel-front
git add src/views/agents/AgentsForm/components/steps/SessionStep.vue
git commit -m "feat(agents-v2): add SessionStep with duration/unit toggle"
```

---

## Task 7: Registrar SessionStep em index.vue

**Files:**
- Modify: `chatfunnel-front/src/views/agents/AgentsForm/index.vue` (schema, initialValues, steps, stepFields, imports, template)

- [ ] **Step 1: Importar o componente**

Localizar o bloco de imports dos steps (linhas ~125-134) e adicionar após `import AnchoringStep from './components/steps/AnchoringStep.vue';`:

```ts
import SessionStep from './components/steps/SessionStep.vue';
```

- [ ] **Step 2: Estender o schema Zod**

Localizar o schema (linha ~149) e adicionar os dois campos antes do `});`:

```ts
  duration: z
    .number()
    .int('Deve ser um número inteiro')
    .min(1, 'Mínimo 1')
    .nullable(),
  unit: z.enum(['SECONDS', 'MINUTES', 'HOURS', 'DAYS']),
```

- [ ] **Step 3: Estender initialValues**

Localizar o bloco `initialValues: { ... }` (linha ~173) e adicionar antes do fechamento `},`:

```ts
      duration: null,
      unit: 'MINUTES',
```

- [ ] **Step 4: Adicionar ao array `steps`**

Localizar (linha ~194):

```ts
const steps = [
  { title: 'Identidade e papel' },
  { title: 'Objetivo e contexto' },
  { title: 'Dados de referência' },
  { title: 'Instruções principais' },
  { title: 'Ferramentas' },
  { title: 'Etapas de raciocínio' },
  { title: 'Formato de saída' },
  { title: 'Exemplos' },
  { title: 'Restrições e guardrails' },
  { title: 'Ancoragem final' },
];
```

E adicionar o novo step ao final (antes do `];`):

```ts
  { title: 'Encerramento e sessão' },
```

- [ ] **Step 5: Adicionar ao `stepFields`**

Localizar (linha ~270) e adicionar:

```ts
  11: ['duration', 'unit'],
```

- [ ] **Step 6: Renderizar no template**

Localizar (linha ~57) a renderização dos steps e adicionar após `<AnchoringStep v-show="currentStep === 10" />`:

```vue
        <SessionStep v-show="currentStep === 11" />
```

- [ ] **Step 7: Confirmar no dev server**

Run: `cd chatfunnel-front && npm run dev`, abrir `/agents/create`, navegar até o step 11 via sidebar → verificar que a tela "Encerramento por inatividade" aparece com toggle, que ativar toggle exibe os inputs de duração (default 30) e unidade (default Minutos), desativar volta a esconder. Matar o servidor.

- [ ] **Step 8: Commit**

```bash
cd chatfunnel-front
git add src/views/agents/AgentsForm/index.vue
git commit -m "feat(agents-v2): register SessionStep as step 11"
```

---

## Task 8: buildApiPayload + loadAgent para duration/unit

**Files:**
- Modify: `chatfunnel-front/src/views/agents/AgentsForm/index.vue:358-411` (`buildApiPayload`)
- Modify: `chatfunnel-front/src/views/agents/AgentsForm/index.vue:528-664` (`loadAgent`)

**Contexto:** Manual seção 3 — `duration` e `unit` são colunas na tabela `Agents`, enviar top-level. Se o usuário desativa o toggle, `duration` fica `null` e `unit` pode ser omitido (default backend = `MINUTES`).

- [ ] **Step 1: Adicionar `duration` e `unit` ao destructure e ao return de `buildApiPayload`**

Localizar, dentro de `buildApiPayload`, o bloco:

```ts
  const {
    name,
    model,
    provider,
    role,
    objective,
    businessContext,
    knowledgeBase,
    reasoning,
    outputFormat,
    examples,
    guardrails,
    anchoring,
  } = values;
```

E trocar para:

```ts
  const {
    name,
    model,
    provider,
    role,
    objective,
    businessContext,
    knowledgeBase,
    reasoning,
    outputFormat,
    examples,
    guardrails,
    anchoring,
    duration,
    unit,
  } = values;
```

- [ ] **Step 2: Adicionar os campos no return top-level**

Localizar, no mesmo `return { ... }`, logo após `systemPrompt: systemPrompt ?? values.systemPrompt ?? '',` e adicionar (depois de `timezone`):

```ts
    duration: duration ?? null,
    unit: duration !== null && duration !== undefined ? unit : undefined,
```

- [ ] **Step 3: Hidratar `duration`/`unit` no `loadAgent`**

Localizar, dentro de `loadAgent`, o `setValues({ ... })` e adicionar antes do fechamento `});`:

```ts
      duration: agent.duration ?? null,
      unit: agent.unit ?? 'MINUTES',
```

- [ ] **Step 4: Confirmar no dev server via DevTools Network**

Run: `cd chatfunnel-front && npm run dev`.
- Criar agente novo com toggle desligado → payload POST deve ter `"duration": null`, `"unit"` omitido.
- Criar agente novo com toggle ligado, duração 30, unidade Minutos → payload POST deve ter `"duration": 30, "unit": "MINUTES"`.
- Editar um agente existente salvo com duration/unit → verificar que o toggle reflete o estado persistido ao carregar.
- Matar o servidor.

- [ ] **Step 5: Commit**

```bash
cd chatfunnel-front
git add src/views/agents/AgentsForm/index.vue
git commit -m "feat(agents-v2): serialize/hydrate duration and unit at top level"
```

---

## Task 9: completedSteps + validação final

**Files:**
- Modify: `chatfunnel-front/src/views/agents/AgentsForm/index.vue:652-664` (`loadAgent` — bloco `initial.add(...)`)
- Modify: `chatfunnel-front/src/views/agents/AgentsForm/index.vue:234-248` (`filledBlocksCount`)

**Contexto:** Ao editar, a barra lateral deve marcar step 11 como "completed" se o agente tem `duration` configurado. O `filledBlocksCount` referencia total de `10` no `PromptPreviewModal` — **não** aumentar, pois session não é bloco de prompt.

- [ ] **Step 1: Marcar step 11 como completo quando hidratar com duration**

Localizar, em `loadAgent`, o final do bloco `const initial = new Set<number>()` e adicionar após `if (fd.anchoring) initial.add(10);`:

```ts
    if (agent.duration !== null && agent.duration !== undefined) initial.add(11);
```

- [ ] **Step 2: Validação no `handleSave` (modo create)**

Localizar `handleSave` e adicionar, após `if (!values.model) return showToastError('Modelo é obrigatório');`:

```ts
  if (
    values.duration !== null &&
    values.duration !== undefined &&
    (!Number.isInteger(values.duration) || values.duration < 1)
  ) {
    return showToastError('Duração deve ser um inteiro maior ou igual a 1');
  }
```

- [ ] **Step 3: Confirmar ponta a ponta no dev server**

Run: `cd chatfunnel-front && npm run dev`.
- Criar agente com 2 objectives (`agendar_demo`, `lead_desqualificado`) + duration 2 HOURS → salvar → verificar no backend (via `GET /nest/agents-v2/:id` ou no DB) que `objectives[]` tem 2 linhas e `duration=2, unit=HOURS`.
- Editar o mesmo agente: apagar 1 objective, trocar o `name` de `agendar_demo` para `venda_realizada`, salvar → verificar no DB que o deleteMany + create rodou (somente `venda_realizada` e `lead_desqualificado` restam).
- Editar novamente: remover toda a tool OBJECTIVES → salvar → verificar que `enabledTools` não tem OBJECTIVES no DB e a lista de objectives ficou vazia.
- Tentar salvar com nome reservado `save_contact_data` → o dialog deve bloquear com toast "Este nome é reservado...".
- Matar o servidor.

- [ ] **Step 4: Rodar o typecheck completo**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit 2>&1 | tail -30`
Expected: sem erros novos em `AgentsForm`.

- [ ] **Step 5: Rodar os testes**

Run: `cd chatfunnel-front && npx vitest run src/views/agents`
Expected: todos os testes passam (13 do Task 1 + qualquer pré-existente).

- [ ] **Step 6: Commit final**

```bash
cd chatfunnel-front
git add src/views/agents/AgentsForm/index.vue
git commit -m "feat(agents-v2): mark session step complete on load + validate on save"
```

---

## Task 10: Atualizar grafo e documentar

**Files:**
- Run: `graphify update` no `chatfunnel-front`

- [ ] **Step 1: Regenerar o grafo do front**

Run: `"D:/Code/4-Vinicius/Chatfunnel/graphify-test/.venv/Scripts/graphify.exe" update D:/Code/4-Vinicius/Chatfunnel/chatfunnel-front`
Expected: `graph.json, graph.html and GRAPH_REPORT.md updated`.

- [ ] **Step 2: Verificar que os novos nós aparecem no grafo**

Run: `"D:/Code/4-Vinicius/Chatfunnel/graphify-test/.venv/Scripts/graphify.exe" query "ObjectivesConfigDialog SessionStep objectivesValidation" --budget 400 --path D:/Code/4-Vinicius/Chatfunnel/chatfunnel-front 2>&1 | head -15`
Expected: listar `ObjectivesConfigDialog.vue`, `SessionStep.vue`, `objectivesValidation.ts`.

- [ ] **Step 3: Commit da atualização do grafo**

```bash
cd chatfunnel-front
git add graphify-out/
git commit -m "chore(graphify): update graph after agents-v2 objectives + session"
```

---

## Self-Review

**1. Spec coverage (contra `docs/features/agent-exec/agents-v2-frontend-manual.md`):**
- Sec 1 (visão geral) — conceitual, sem código a implementar. ✓
- Sec 2 (endpoints) — `AgentsV2Service` já cobre `POST /agents-v2`, `PUT /agents-v2/:id`, `GET /agents-v2/:id`. Header `Account-Selected` + `Authorization` é responsabilidade do `NestApi` Axios (já existente). ✓
- Sec 3 (expiração) — Tasks 6, 7, 8, 9 cobrem `duration`, `unit`, toggle, default 1 / `MINUTES`, regras null-handling. ✓
- Sec 4 (objectives) — Tasks 1, 2, 3, 4 cobrem estrutura em `toolConfigs.OBJECTIVES.objectives`, `enabledTools` auto, validação snake_case, nomes reservados. ✓
- Sec 4.5 (reuso de automation/external query como objective) — Task 2 adiciona dropdown "Usar tool existente" com `AvailableToolSources` prop; Task 4 Step 5 conecta ao `toolConfigs` do ToolsStep; `DATA_MAPPING`/`CALENDAR` excluídos conforme gotcha. Flag `locked` é client-only e stripada antes do emit, mantendo o payload no formato `{name, description}`. ✓
- Sec 5 (semântica update) — Task 5 Step 3 implementa delete-guard para substituição total e zeragem. ✓
- Sec 6 (exemplos payload) — Tasks 5 + 8 cobrem formato exato. ✓
- Sec 7 (GET response) — Tasks 5 Step 4 e 8 Step 3 hidratam `agent.objectives[]`, `agent.duration`, `agent.unit`. ✓
- Sec 8 (checklist) — todos os 8 bullets mapeiam para tasks 3, 4, 6-9. ✓

**2. Placeholder scan:** nenhum "TBD", "TODO", "implementar depois", "similar a...". Todos os trechos de código são completos e exatos.

**3. Type consistency:**
- `ObjectiveItem` / `ObjectivesConfig` usados em Task 2, referenciados em Task 4 ✓
- `RESERVED_OBJECTIVE_NAMES`, `isValidObjectiveName`, `isReservedObjectiveName`, `validateObjectiveName` — mesma assinatura em Tasks 1 e 2 ✓
- Campo `duration: number | null` consistente em schema (Task 7), initialValues (Task 7), payload (Task 8), loadAgent (Task 8), validação (Task 9) ✓
- `unit: 'SECONDS'|'MINUTES'|'HOURS'|'DAYS'` consistente ✓
- `originalHadObjectives` usado em Task 5 Steps 1, 3, 4 ✓
- Todos os `enabledTools.includes('OBJECTIVES')` usam mesma string maiúscula ✓

Nada a corrigir.
