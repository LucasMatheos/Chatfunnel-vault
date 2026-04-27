# Agents V2 — Objectives: Refactor para `{ name, key, description }` + Cards de Tool Vinculada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar a feature Objectives do formulario `AgentsForm` (chatfunnel-front) para o novo modelo de dados `{ name, key, description }` do manual `docs/features/agent-exec/agents-v2-frontend-manual.md` e substituir o modo "tool existente" por um card compacto com icone + label fixo + descricao editavel.

**Architecture:** O `ObjectivesConfigDialog` passa a renderizar **dois tipos de item** no mesmo array: `manual` (form com inputs Nome/Descricao e `key` auto-gerada via slugify exibida como preview read-only) e `bound` (card compacto espelhando o visual do `AddToolModal` — icone, tone, label imutavel — com apenas a descricao editavel). A lista de fontes disponiveis (`availableToolSources`) deixa de ser agrupada por categoria e passa a ser **granular por tool registrada no LLM** (cada external query, cada automation condicional, cada operacao do calendario, `save_contact_data` se DATA_MAPPING esta ativo). O payload emitido ao backend mantem o contrato do manual: `{ name, key, description }[]` sem o flag client-only.

**Tech Stack:** Vue 3 (Composition API, `<script setup lang="ts">`), VeeValidate + Zod, shadcn-vue, Tailwind v4, Vitest (happy-dom), Phosphor Icons.

**Pre-requisitos:** Este plano assume que as tasks 1-9 do plano `2026-04-22-agents-v2-objectives-expiration.md` ja estao implementadas (arquivos `objectivesValidation.ts`, `ObjectivesConfigDialog.vue`, `ToolsStep.vue` ja existem e estao integrados). Este plano **refatora** esses arquivos para a nova regra de negocio.

**Escopo fora deste plano:** Nao mexe em `SessionStep.vue` nem em `duration`/`unit` — permanecem como implementados no plano anterior. Nao altera o backend (contrato do manual ja reflete o comportamento atual). Nao toca na feature `AUTOMATIONS.conditionalAutomations` em si — apenas consome.

---

## File Structure

**Novos arquivos:**

| Arquivo | Responsabilidade |
|---|---|
| `chatfunnel-front/src/views/agents/AgentsForm/components/modals/objectiveKey.ts` | Funcoes puras: `slugifyObjectiveKey` + `isValidObjectiveKey` |
| `chatfunnel-front/src/views/agents/AgentsForm/components/modals/objectiveKey.spec.ts` | Unit tests das utilitarias de key |
| `chatfunnel-front/src/views/agents/AgentsForm/components/modals/BoundObjectiveCard.vue` | Card compacto de objective vinculado a tool (icone + label fixo + descricao) |
| `chatfunnel-front/src/views/agents/AgentsForm/components/modals/toolSources.ts` | Construtor puro: converte `toolConfigs` ativos em lista granular de `ToolSourceRef` para o dropdown |
| `chatfunnel-front/src/views/agents/AgentsForm/components/modals/toolSources.spec.ts` | Unit tests do construtor de sources |

**Arquivos modificados:**

| Arquivo | Escopo da mudanca |
|---|---|
| `chatfunnel-front/src/views/agents/AgentsForm/components/modals/objectivesValidation.ts` | Relaxar regex para `/^[a-zA-Z0-9_]+$/`; remover check de `RESERVED_OBJECTIVE_NAMES` (intencionalmente colidem no modo bound); manter apenas validacao de formato |
| `chatfunnel-front/src/views/agents/AgentsForm/components/modals/objectivesValidation.spec.ts` | Atualizar asserts para refletir regex nova e remocao do check de reservados |
| `chatfunnel-front/src/views/agents/AgentsForm/components/modals/ObjectivesConfigDialog.vue` | Schema Zod com `key`; renderizar `BoundObjectiveCard` para itens `locked`; input `key` read-only (preview slug) no modo manual; dedup por `key` apos slugify |
| `chatfunnel-front/src/views/agents/AgentsForm/components/modals/AddToolModal.vue` | Exportar `AVAILABLE_TOOLS` como `const` tipada para reutilizacao do icon/bgClass/iconClass no card de bound objective |
| `chatfunnel-front/src/views/agents/AgentsForm/components/steps/ToolsStep.vue` | Substituir o objeto `availableToolSources` pela chamada a `buildToolSources(toolConfigs)` |
| `chatfunnel-front/src/views/agents/AgentsForm/index.vue` | `buildToolConfigs`: emitir `{ name, key, description }`; `loadAgent`: hidratar `key` vindo do backend |

---

## Task 1: Slugify + validacao de key (puro TS + TDD)

**Files:**
- Create: `chatfunnel-front/src/views/agents/AgentsForm/components/modals/objectiveKey.ts`
- Test: `chatfunnel-front/src/views/agents/AgentsForm/components/modals/objectiveKey.spec.ts`

**Contexto:** O manual (secao 4) define o regex do `key` como `/^[a-zA-Z0-9_]+$/`. Para simplificar a UX, o frontend auto-gera a `key` a partir do `name` digitado pelo usuario no modo manual, normalizando diacriticos e substituindo nao-alfanumericos por `_`. A key gerada deve sempre passar no regex do backend.

- [ ] **Step 1: Criar o arquivo de testes falhando**

```ts
// chatfunnel-front/src/views/agents/AgentsForm/components/modals/objectiveKey.spec.ts
import { describe, it, expect } from 'vitest'
import { slugifyObjectiveKey, isValidObjectiveKey } from './objectiveKey'

describe('slugifyObjectiveKey', () => {
  it('converte texto simples para snake_case lowercase', () => {
    expect(slugifyObjectiveKey('Agendar Demo')).toBe('agendar_demo')
  })

  it('remove acentos e diacriticos (NFD)', () => {
    expect(slugifyObjectiveKey('Qualificação')).toBe('qualificacao')
    expect(slugifyObjectiveKey('Ação do usuário')).toBe('acao_do_usuario')
  })

  it('substitui pontuacao e simbolos por underscore', () => {
    expect(slugifyObjectiveKey('Agendar: Demo!')).toBe('agendar_demo')
    expect(slugifyObjectiveKey('demo@empresa.com')).toBe('demo_empresa_com')
    expect(slugifyObjectiveKey('100% convertido')).toBe('100_convertido')
  })

  it('colapsa sequencias de separadores em um unico underscore', () => {
    expect(slugifyObjectiveKey('a   b')).toBe('a_b')
    expect(slugifyObjectiveKey('a---b')).toBe('a_b')
    expect(slugifyObjectiveKey('a _ b')).toBe('a_b')
  })

  it('remove underscores das pontas', () => {
    expect(slugifyObjectiveKey('  agendar  ')).toBe('agendar')
    expect(slugifyObjectiveKey('__agendar__')).toBe('agendar')
    expect(slugifyObjectiveKey('!!agendar!!')).toBe('agendar')
  })

  it('retorna string vazia quando sem alfanumericos', () => {
    expect(slugifyObjectiveKey('')).toBe('')
    expect(slugifyObjectiveKey('!!!')).toBe('')
    expect(slugifyObjectiveKey('???...')).toBe('')
  })

  it('preserva digitos em qualquer posicao (o backend aceita)', () => {
    expect(slugifyObjectiveKey('v2 demo')).toBe('v2_demo')
    expect(slugifyObjectiveKey('1 objetivo')).toBe('1_objetivo')
    expect(slugifyObjectiveKey('demo 1')).toBe('demo_1')
  })

  it('converte todas as letras para lowercase', () => {
    expect(slugifyObjectiveKey('AGENDAR DEMO')).toBe('agendar_demo')
    expect(slugifyObjectiveKey('AgendarDemo')).toBe('agendardemo')
  })
})

describe('isValidObjectiveKey', () => {
  it('aceita chaves alfanumericas com underscore', () => {
    expect(isValidObjectiveKey('agendar_demo')).toBe(true)
    expect(isValidObjectiveKey('AgendarDemo')).toBe(true)
    expect(isValidObjectiveKey('demo_1')).toBe(true)
    expect(isValidObjectiveKey('_internal')).toBe(true)
    expect(isValidObjectiveKey('a')).toBe(true)
  })

  it('rejeita string vazia', () => {
    expect(isValidObjectiveKey('')).toBe(false)
  })

  it('rejeita qualquer caractere fora do conjunto [a-zA-Z0-9_]', () => {
    expect(isValidObjectiveKey('agendar-demo')).toBe(false)
    expect(isValidObjectiveKey('agendar demo')).toBe(false)
    expect(isValidObjectiveKey('agendar.demo')).toBe(false)
    expect(isValidObjectiveKey('agendar@demo')).toBe(false)
    expect(isValidObjectiveKey('agendar/demo')).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd chatfunnel-front && npx vitest run src/views/agents/AgentsForm/components/modals/objectiveKey.spec.ts`
Expected: todos falham com `Cannot find module './objectiveKey'`.

- [ ] **Step 3: Implementar as funcoes**

```ts
// chatfunnel-front/src/views/agents/AgentsForm/components/modals/objectiveKey.ts
/**
 * Regex do backend para `objectives[].key` (manual secao 4).
 */
const OBJECTIVE_KEY_RE = /^[a-zA-Z0-9_]+$/

/**
 * Gera uma key valida a partir de um label humano:
 * - Normaliza diacriticos (NFD)
 * - Converte para lowercase
 * - Substitui sequencias de nao-alfanumericos por `_`
 * - Remove `_` das pontas
 *
 * Pode retornar string vazia quando `input` nao tem alfanumericos.
 * O chamador e responsavel por tratar esse caso.
 */
export function slugifyObjectiveKey(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function isValidObjectiveKey(key: string): boolean {
  if (!key) return false
  return OBJECTIVE_KEY_RE.test(key)
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd chatfunnel-front && npx vitest run src/views/agents/AgentsForm/components/modals/objectiveKey.spec.ts`
Expected: todos os testes passam (23 asserts).

- [ ] **Step 5: Commit**

```bash
cd chatfunnel-front
git add src/views/agents/AgentsForm/components/modals/objectiveKey.ts src/views/agents/AgentsForm/components/modals/objectiveKey.spec.ts
git commit -m "feat(agents-v2): add slugifyObjectiveKey + isValidObjectiveKey utils"
```

---

## Task 2: Revisao de `objectivesValidation.ts`

**Files:**
- Modify: `chatfunnel-front/src/views/agents/AgentsForm/components/modals/objectivesValidation.ts`
- Modify: `chatfunnel-front/src/views/agents/AgentsForm/components/modals/objectivesValidation.spec.ts`

**Contexto:** A regra antiga validava um unico campo `name` com regex snake_case estrito e lista de reservados. Agora temos dois campos: `name` (label livre, sem validacao de formato) e `key` (regex do manual + unicidade por agente). A lista `RESERVED_OBJECTIVE_NAMES` e **mantida e exportada** porque ainda e util — nao para bloquear, mas para ajudar o dropdown de fontes a diferenciar tools nativas das demais.

A funcao `validateObjectiveName` e removida. Substituida por `validateObjectiveKey`. O componente passa a depender de `objectiveKey.ts` (Task 1) para o regex.

- [ ] **Step 1: Atualizar os testes**

```ts
// chatfunnel-front/src/views/agents/AgentsForm/components/modals/objectivesValidation.spec.ts
import { describe, it, expect } from 'vitest'
import {
  RESERVED_OBJECTIVE_NAMES,
  isReservedObjectiveName,
  validateObjectiveKey
} from './objectivesValidation'

describe('objectivesValidation', () => {
  describe('RESERVED_OBJECTIVE_NAMES', () => {
    it('contem os 5 nomes nativos do runtime', () => {
      expect(RESERVED_OBJECTIVE_NAMES).toEqual([
        'save_contact_data',
        'get_google_calendar_slots',
        'create_google_calendar_event',
        'cancel_google_calendar_event',
        'search_google_calendar_events'
      ])
    })
  })

  describe('isReservedObjectiveName', () => {
    it('detecta todos os nomes reservados', () => {
      for (const name of RESERVED_OBJECTIVE_NAMES) {
        expect(isReservedObjectiveName(name)).toBe(true)
      }
    })

    it('retorna false para nomes customizados', () => {
      expect(isReservedObjectiveName('agendar_demo')).toBe(false)
    })

    it('e case-sensitive', () => {
      expect(isReservedObjectiveName('Save_Contact_Data')).toBe(false)
    })
  })

  describe('validateObjectiveKey', () => {
    it('retorna null quando valido', () => {
      expect(validateObjectiveKey('agendar_demo')).toBeNull()
      expect(validateObjectiveKey('AgendarDemo')).toBeNull()
      expect(validateObjectiveKey('demo_1')).toBeNull()
    })

    it('retorna mensagem quando vazio', () => {
      expect(validateObjectiveKey('')).toBe('Chave do objective e obrigatoria')
    })

    it('retorna mensagem quando formato invalido', () => {
      expect(validateObjectiveKey('agendar demo')).toBe(
        'Use apenas letras, numeros e underline'
      )
      expect(validateObjectiveKey('agendar-demo')).toBe(
        'Use apenas letras, numeros e underline'
      )
    })
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd chatfunnel-front && npx vitest run src/views/agents/AgentsForm/components/modals/objectivesValidation.spec.ts`
Expected: falha — `validateObjectiveName` ainda existe e `validateObjectiveKey` nao.

- [ ] **Step 3: Reescrever a implementacao**

Substituir o conteudo inteiro do arquivo por:

```ts
// chatfunnel-front/src/views/agents/AgentsForm/components/modals/objectivesValidation.ts
import { isValidObjectiveKey } from './objectiveKey'

/**
 * Nomes das tools nativas que o runtime expoe ao LLM. Mantido para referencia:
 * o dropdown de "Usar tool existente" usa isso para listar as tools de DATA_MAPPING
 * e CALENDAR, que sao tools fixas do sistema (sec. 4.5 do manual).
 */
export const RESERVED_OBJECTIVE_NAMES = [
  'save_contact_data',
  'get_google_calendar_slots',
  'create_google_calendar_event',
  'cancel_google_calendar_event',
  'search_google_calendar_events'
] as const

export function isReservedObjectiveName(name: string): boolean {
  return (RESERVED_OBJECTIVE_NAMES as readonly string[]).includes(name)
}

export function validateObjectiveKey(key: string): string | null {
  if (!key) return 'Chave do objective e obrigatoria'
  if (!isValidObjectiveKey(key)) {
    return 'Use apenas letras, numeros e underline'
  }
  return null
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd chatfunnel-front && npx vitest run src/views/agents/AgentsForm/components/modals/objectivesValidation.spec.ts`
Expected: todos os testes passam.

- [ ] **Step 5: Garantir que nada mais importa `validateObjectiveName` ou `isValidObjectiveName`**

Run: `cd chatfunnel-front && grep -rn "validateObjectiveName\|isValidObjectiveName" src/ || echo "no references"`
Expected: apos a Task 5 (dialog refator), resultado deve ser `no references`. Nesta task, espere ainda referencias em `ObjectivesConfigDialog.vue` — isso sera corrigido na Task 5.

- [ ] **Step 6: Commit**

```bash
cd chatfunnel-front
git add src/views/agents/AgentsForm/components/modals/objectivesValidation.ts src/views/agents/AgentsForm/components/modals/objectivesValidation.spec.ts
git commit -m "refactor(agents-v2): simplify objectivesValidation to key-only (name is free label)"
```

---

## Task 3: Exportar `AVAILABLE_TOOLS` do `AddToolModal`

**Files:**
- Modify: `chatfunnel-front/src/views/agents/AgentsForm/components/modals/AddToolModal.vue`

**Contexto:** O `BoundObjectiveCard` (Task 4) reaproveita o `icon`/`bgClass`/`iconClass` da mesma estrutura `AVAILABLE_TOOLS` para renderizar a identidade visual da tool no objective vinculado. Hoje `AVAILABLE_TOOLS` e local ao `<script setup>` do componente. Precisamos promove-la para export reutilizavel, sem duplicar dados.

- [ ] **Step 1: Mover `AVAILABLE_TOOLS` para um `<script>` (nao `setup`) exportado**

Em `AddToolModal.vue`, localizar o bloco dentro de `<script setup lang="ts">`:

```ts
const AVAILABLE_TOOLS = [
  { id: 'DATA_MAPPING', ... },
  ...
  { id: 'OBJECTIVES', label: 'Objetivos', ..., icon: PhTarget, ... },
];
```

E mover todo o array para um `<script lang="ts">` separado no topo do arquivo, exportando:

```vue
<script lang="ts">
import {
  PhDatabase,
  PhGlobeSimple,
  PhCalendarBlank,
  PhClock,
  PhRobot,
  PhTarget
} from '@phosphor-icons/vue'
import type { Component } from 'vue'

export type AvailableToolId =
  | 'DATA_MAPPING'
  | 'EXTERNAL_QUERIES'
  | 'CALENDAR'
  | 'AUTOMATIONS'
  | 'SERVICE_HOURS'
  | 'OBJECTIVES'

export interface AvailableTool {
  id: AvailableToolId
  label: string
  description: string
  icon: Component
  bgClass: string
  iconClass: string
}

export const AVAILABLE_TOOLS: readonly AvailableTool[] = [
  {
    id: 'DATA_MAPPING',
    label: 'Mapeamento de dados',
    description:
      'Extraia e salve dados do contato durante a conversa em campos customizados.',
    icon: PhDatabase,
    bgClass: 'bg-violet-100',
    iconClass: 'text-violet-600'
  },
  {
    id: 'EXTERNAL_QUERIES',
    label: 'Consultas externas',
    description:
      'Consulte APIs externas (REST) em tempo real para enriquecer o contexto do LLM.',
    icon: PhGlobeSimple,
    bgClass: 'bg-sky-100',
    iconClass: 'text-sky-600'
  },
  {
    id: 'CALENDAR',
    label: 'Calendario Google',
    description:
      'Consulte horarios, crie, cancele e busque eventos no Google Calendar.',
    icon: PhCalendarBlank,
    bgClass: 'bg-amber-100',
    iconClass: 'text-amber-600'
  },
  {
    id: 'AUTOMATIONS',
    label: 'Automacoes',
    description:
      'Dispare fluxos (automations) com base em gatilhos condicionais durante a conversa.',
    icon: PhRobot,
    bgClass: 'bg-indigo-100',
    iconClass: 'text-indigo-600'
  },
  {
    id: 'SERVICE_HOURS',
    label: 'Horario de atendimento',
    description: 'Defina janelas de atendimento e mensagens de fallback fora de horario.',
    icon: PhClock,
    bgClass: 'bg-rose-100',
    iconClass: 'text-rose-600'
  },
  {
    id: 'OBJECTIVES',
    label: 'Objetivos',
    description:
      'Metas nomeadas que o agente pode declarar como concluidas para encerrar a conversa.',
    icon: PhTarget,
    bgClass: 'bg-teal-100',
    iconClass: 'text-teal-600'
  }
]
</script>

<script setup lang="ts">
// remover imports e const AVAILABLE_TOOLS daqui (migraram para o <script> acima)
// manter o restante do setup intacto
</script>
```

> Ajuste os labels/descriptions para bater com os reais do arquivo atual. Se algum campo estiver diferente do snippet acima, **preserve o valor atual** do arquivo — o foco desta task e apenas extrair a constante, nao reescrever conteudo.

- [ ] **Step 2: Rodar typecheck + confirmar render do modal**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit 2>&1 | grep -E "AddToolModal" || echo "no errors"`
Expected: `no errors`.

Run: `cd chatfunnel-front && npm run dev` (em outro terminal), abrir `/agents/create`, step "Ferramentas" → "Adicionar ferramenta" → confirmar que todos os 6 cards aparecem exatamente como antes. Matar o servidor.

- [ ] **Step 3: Commit**

```bash
cd chatfunnel-front
git add src/views/agents/AgentsForm/components/modals/AddToolModal.vue
git commit -m "refactor(agents-v2): extract AVAILABLE_TOOLS as exported const"
```

---

## Task 4: Construtor de tool sources (`toolSources.ts` + TDD)

**Files:**
- Create: `chatfunnel-front/src/views/agents/AgentsForm/components/modals/toolSources.ts`
- Test: `chatfunnel-front/src/views/agents/AgentsForm/components/modals/toolSources.spec.ts`

**Contexto:** Cada entrada do dropdown "Usar tool existente" precisa ser granular (nao por categoria). O backend expoe ao LLM uma tool por:
- `DATA_MAPPING` configurado (nao vazio) → 1 source `save_contact_data`
- Cada item em `EXTERNAL_QUERIES.queries[]` → 1 source com o `name` da query
- `CALENDAR` configurado → 4 sources (um por operacao Google Calendar)
- Cada item em `AUTOMATIONS.conditionalAutomations[]` → 1 source com o `name` da automation

`SERVICE_HOURS` nao expoe tool ao LLM (e filtro interno de atendimento) — **fica de fora**.

Cada source carrega: `key` (nome canonico da tool), `name` (label amigavel), `description` (contexto), `iconId` (`AvailableToolId` para reaproveitar identidade visual), `category` (label agrupador no dropdown).

- [ ] **Step 1: Criar o arquivo de testes falhando**

```ts
// chatfunnel-front/src/views/agents/AgentsForm/components/modals/toolSources.spec.ts
import { describe, it, expect } from 'vitest'
import { buildToolSources } from './toolSources'

describe('buildToolSources', () => {
  it('retorna lista vazia quando nenhuma tool esta configurada', () => {
    expect(buildToolSources({})).toEqual([])
  })

  it('inclui save_contact_data quando DATA_MAPPING tem fields', () => {
    const sources = buildToolSources({
      DATA_MAPPING: { fields: [{ name: 'email', description: '...' }] }
    })
    expect(sources).toContainEqual({
      key: 'save_contact_data',
      name: 'Mapeamento de Dados',
      description: 'Salva dados extraidos do contato em campos customizados',
      iconId: 'DATA_MAPPING',
      category: 'Mapeamento de dados'
    })
  })

  it('omite DATA_MAPPING quando fields esta vazio', () => {
    const sources = buildToolSources({
      DATA_MAPPING: { fields: [] }
    })
    expect(sources.find((s) => s.key === 'save_contact_data')).toBeUndefined()
  })

  it('cria uma source por external query', () => {
    const sources = buildToolSources({
      EXTERNAL_QUERIES: {
        queries: [
          { name: 'consultar_plano', description: 'Busca plano do cliente' },
          { name: 'verificar_estoque', description: 'Verifica estoque' }
        ]
      }
    })
    expect(sources).toHaveLength(2)
    expect(sources[0]).toEqual({
      key: 'consultar_plano',
      name: 'consultar_plano',
      description: 'Busca plano do cliente',
      iconId: 'EXTERNAL_QUERIES',
      category: 'Consultas externas'
    })
  })

  it('cria 4 sources quando CALENDAR esta configurado', () => {
    const sources = buildToolSources({ CALENDAR: { connectedAccountId: 'abc' } })
    const calendarKeys = sources.filter((s) => s.iconId === 'CALENDAR').map((s) => s.key)
    expect(calendarKeys).toEqual([
      'get_google_calendar_slots',
      'create_google_calendar_event',
      'cancel_google_calendar_event',
      'search_google_calendar_events'
    ])
  })

  it('omite CALENDAR quando nao esta configurado (connectedAccountId nulo/vazio)', () => {
    expect(buildToolSources({ CALENDAR: { connectedAccountId: null } })).toEqual([])
    expect(buildToolSources({ CALENDAR: { connectedAccountId: '' } })).toEqual([])
  })

  it('cria uma source por conditional automation', () => {
    const sources = buildToolSources({
      AUTOMATIONS: {
        conditionalAutomations: [
          { name: 'fechar_venda', description: 'Dispara quando o cliente confirma' }
        ]
      }
    })
    expect(sources).toHaveLength(1)
    expect(sources[0]).toEqual({
      key: 'fechar_venda',
      name: 'fechar_venda',
      description: 'Dispara quando o cliente confirma',
      iconId: 'AUTOMATIONS',
      category: 'Automacoes'
    })
  })

  it('ignora lifecycleAutomations (nao sao tools)', () => {
    const sources = buildToolSources({
      AUTOMATIONS: {
        conditionalAutomations: [],
        lifecycleAutomations: { onStart: 'abc', onEnd: 'def' }
      }
    })
    expect(sources).toEqual([])
  })

  it('ignora SERVICE_HOURS (nao expoe tool ao LLM)', () => {
    const sources = buildToolSources({
      SERVICE_HOURS: { schedule: { mon: ['09:00-18:00'] } }
    })
    expect(sources).toEqual([])
  })

  it('descarta sources com key/name vazios (defensivo)', () => {
    const sources = buildToolSources({
      EXTERNAL_QUERIES: {
        queries: [
          { name: '', description: 'sem nome' },
          { name: 'valida', description: 'ok' }
        ]
      }
    })
    expect(sources).toHaveLength(1)
    expect(sources[0].key).toBe('valida')
  })

  it('combina multiplas categorias em uma lista plana', () => {
    const sources = buildToolSources({
      DATA_MAPPING: { fields: [{ name: 'email' }] },
      EXTERNAL_QUERIES: { queries: [{ name: 'q1', description: 'd1' }] },
      CALENDAR: { connectedAccountId: 'abc' },
      AUTOMATIONS: { conditionalAutomations: [{ name: 'a1', description: 'd2' }] }
    })
    expect(sources).toHaveLength(1 + 1 + 4 + 1)
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd chatfunnel-front && npx vitest run src/views/agents/AgentsForm/components/modals/toolSources.spec.ts`
Expected: falha com `Cannot find module './toolSources'`.

- [ ] **Step 3: Implementar o construtor**

```ts
// chatfunnel-front/src/views/agents/AgentsForm/components/modals/toolSources.ts
import type { AvailableToolId } from './AddToolModal.vue'

export interface ToolSourceRef {
  /** Nome canonico da tool como o LLM a ve (ex: `save_contact_data`, `consultar_plano`). */
  key: string
  /** Label amigavel exibido no dropdown e no card de objective bound. */
  name: string
  /** Descricao da tool (enriquece o dropdown e ajuda o usuario a escolher). */
  description: string
  /** Id da categoria para reaproveitar icon/bgClass/iconClass de `AVAILABLE_TOOLS`. */
  iconId: AvailableToolId
  /** Nome do grupo no dropdown (ex: `Consultas externas`). */
  category: string
}

/**
 * Mapeamento entre `AvailableToolId` e os nomes canonicos que o LLM recebe do backend
 * para cada tool nativa/fixa (nao dinamica). External queries e automations sao dinamicas
 * e o `key` vem do proprio config.
 */
const NATIVE_TOOL_SOURCES: Record<
  'DATA_MAPPING' | 'CALENDAR',
  ReadonlyArray<{ key: string; name: string; description: string }>
> = {
  DATA_MAPPING: [
    {
      key: 'save_contact_data',
      name: 'Mapeamento de Dados',
      description: 'Salva dados extraidos do contato em campos customizados'
    }
  ],
  CALENDAR: [
    {
      key: 'get_google_calendar_slots',
      name: 'Buscar horarios disponiveis',
      description: 'Consulta janelas livres na agenda do Google'
    },
    {
      key: 'create_google_calendar_event',
      name: 'Criar evento',
      description: 'Cria um evento no Google Calendar'
    },
    {
      key: 'cancel_google_calendar_event',
      name: 'Cancelar evento',
      description: 'Cancela um evento existente'
    },
    {
      key: 'search_google_calendar_events',
      name: 'Buscar eventos',
      description: 'Busca eventos ja agendados'
    }
  ]
}

type ToolConfigsSnapshot = Partial<{
  DATA_MAPPING: { fields?: Array<{ name: string; description?: string }> }
  EXTERNAL_QUERIES: {
    queries?: Array<{ name: string; description?: string }>
  }
  CALENDAR: { connectedAccountId?: string | null }
  AUTOMATIONS: {
    conditionalAutomations?: Array<{ name: string; description?: string }>
    lifecycleAutomations?: unknown
  }
  SERVICE_HOURS: unknown
}>

export function buildToolSources(configs: ToolConfigsSnapshot): ToolSourceRef[] {
  const out: ToolSourceRef[] = []

  if ((configs.DATA_MAPPING?.fields?.length ?? 0) > 0) {
    for (const src of NATIVE_TOOL_SOURCES.DATA_MAPPING) {
      out.push({
        key: src.key,
        name: src.name,
        description: src.description,
        iconId: 'DATA_MAPPING',
        category: 'Mapeamento de dados'
      })
    }
  }

  for (const q of configs.EXTERNAL_QUERIES?.queries ?? []) {
    if (!q.name) continue
    out.push({
      key: q.name,
      name: q.name,
      description: q.description ?? '',
      iconId: 'EXTERNAL_QUERIES',
      category: 'Consultas externas'
    })
  }

  if (configs.CALENDAR?.connectedAccountId) {
    for (const src of NATIVE_TOOL_SOURCES.CALENDAR) {
      out.push({
        key: src.key,
        name: src.name,
        description: src.description,
        iconId: 'CALENDAR',
        category: 'Calendario Google'
      })
    }
  }

  for (const a of configs.AUTOMATIONS?.conditionalAutomations ?? []) {
    if (!a.name) continue
    out.push({
      key: a.name,
      name: a.name,
      description: a.description ?? '',
      iconId: 'AUTOMATIONS',
      category: 'Automacoes'
    })
  }

  return out
}
```

> **Observacao:** o snapshot de `CALENDAR` assume que o config real tem `connectedAccountId`. Se o shape do `CalendarConfig` for diferente no seu codigo (ex: `accountId`, `isConnected`), ajustar a checagem de "esta configurado" para o campo correto em `ToolConfigsSnapshot` + na funcao. Tudo o mais permanece.

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd chatfunnel-front && npx vitest run src/views/agents/AgentsForm/components/modals/toolSources.spec.ts`
Expected: todos passam.

- [ ] **Step 5: Commit**

```bash
cd chatfunnel-front
git add src/views/agents/AgentsForm/components/modals/toolSources.ts src/views/agents/AgentsForm/components/modals/toolSources.spec.ts
git commit -m "feat(agents-v2): add buildToolSources for granular objective binding"
```

---

## Task 5: Criar `BoundObjectiveCard.vue`

**Files:**
- Create: `chatfunnel-front/src/views/agents/AgentsForm/components/modals/BoundObjectiveCard.vue`

**Contexto:** Card compacto renderizado quando o objective tem `locked: true`. Reaproveita `AVAILABLE_TOOLS` para puxar icone + tone + background. Nao permite editar `name` nem `key`. Textarea de `description` fica editavel via v-model. Botao de remover no canto superior direito.

- [ ] **Step 1: Criar o componente**

```vue
<!-- chatfunnel-front/src/views/agents/AgentsForm/components/modals/BoundObjectiveCard.vue -->
<template>
  <div
    class="rounded-cf-lg flex flex-col gap-4 border border-gray-200 bg-white p-4"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-center gap-3">
        <span
          v-if="visual"
          :class="['flex h-9 w-9 items-center justify-center rounded-lg', visual.bgClass]"
        >
          <component :is="visual.icon" :size="18" :class="visual.iconClass" />
        </span>
        <div class="flex flex-col gap-0.5">
          <span class="typo-body-14-medium text-gray-900">
            {{ name }}
          </span>
          <span class="typo-body-12-regular text-gray-500">
            Tool vinculada — chave
            <code class="rounded bg-gray-100 px-1 py-0.5 text-gray-700">{{
              keyValue
            }}</code>
          </span>
        </div>
      </div>
      <Button
        variant="icon"
        size="icon-sm"
        tone="danger"
        aria-label="Remover objective"
        @click="emit('remove')"
      >
        <PhTrash :size="14" />
      </Button>
    </div>

    <VeeTextarea
      :name="descriptionFieldName"
      label="Descricao"
      :rows="3"
      placeholder="Chame quando... (descreva quando o objetivo e considerado atingido)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { PhTrash } from '@phosphor-icons/vue'
import { Button } from '@/components/ui/button'
import { VeeTextarea } from '@/components/ui/input'
import {
  AVAILABLE_TOOLS,
  type AvailableToolId
} from './AddToolModal.vue'

const props = defineProps<{
  /** Label amigavel (ex: "Mapeamento de Dados" ou "consultar_plano"). */
  name: string
  /** Key canonica da tool (ex: "save_contact_data"). Exibida como code pill. */
  keyValue: string
  /** Id da categoria visual (DATA_MAPPING / EXTERNAL_QUERIES / CALENDAR / AUTOMATIONS). */
  iconId: AvailableToolId
  /** Nome do campo vee-validate para a descricao (ex: "objectives[2].description"). */
  descriptionFieldName: string
}>()

const emit = defineEmits<{
  remove: []
}>()

const visual = computed(() =>
  AVAILABLE_TOOLS.find((t) => t.id === props.iconId)
)
</script>
```

- [ ] **Step 2: Typecheck**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit 2>&1 | grep -E "BoundObjectiveCard" || echo "no errors"`
Expected: `no errors`.

- [ ] **Step 3: Commit**

```bash
cd chatfunnel-front
git add src/views/agents/AgentsForm/components/modals/BoundObjectiveCard.vue
git commit -m "feat(agents-v2): add BoundObjectiveCard for tool-bound objectives"
```

---

## Task 6: Refatorar `ObjectivesConfigDialog.vue`

**Files:**
- Modify: `chatfunnel-front/src/views/agents/AgentsForm/components/modals/ObjectivesConfigDialog.vue`

**Contexto:** Mudancas:
1. Tipo `ObjectiveItem` ganha `key` (obrigatorio) e `iconId` (opcional, so presente em bound).
2. Schema Zod valida `key` com `isValidObjectiveKey` e unicidade no array; `name` apenas nao-vazio.
3. Modo **manual**: input `Nome` (livre) + preview read-only da `key` gerada via `slugifyObjectiveKey(name)` + textarea `Descricao`. `key` tambem pode ser editada manualmente em um segundo campo colapsado (acordion "Chave tecnica") para cobrir casos raros onde o slug automatico colide.
4. Modo **bound**: renderiza `<BoundObjectiveCard>` no lugar do form item. Nao renderiza input de name/key.
5. Dropdown "Usar tool existente" passa a consumir o array plano `availableToolSources: ToolSourceRef[]` (prop) e agrupa por `category`.
6. `addSourcedObjective` recebe um `ToolSourceRef` completo e cria um item `{ name: src.name, key: src.key, description: '', locked: true, iconId: src.iconId }`.
7. Dedup: ao adicionar (manual ou bound), rejeitar se ja existe item com a mesma `key`.
8. Emit: stripa `locked` e `iconId` (client-only), envia `{ name, key, description }[]`.

- [ ] **Step 1: Reescrever o componente completo**

Substituir o conteudo inteiro de `ObjectivesConfigDialog.vue` por:

```vue
<template>
  <DialogControl
    :open="isOpen"
    @update:open="handleOpenChange"
    title="Objetivos"
    subtitle="Defina metas nomeadas que o agente pode declarar como concluidas durante a conversa."
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
          Cada objetivo vira uma ferramenta que o LLM pode acionar. No modo
          manual, a chave tecnica e gerada automaticamente a partir do nome. No
          modo vinculado, o objetivo reaproveita uma ferramenta ja cadastrada no
          agente.
        </AlertDescription>
      </Alert>

      <div v-if="!values.objectives?.length" class="py-4 text-center">
        <p class="typo-body-14-regular text-gray-500">
          Nenhum objetivo adicionado ainda.
        </p>
      </div>

      <template v-for="i in objectiveIndices" :key="i">
        <BoundObjectiveCard
          v-if="values.objectives?.[i]?.locked"
          :name="values.objectives[i].name"
          :key-value="values.objectives[i].key"
          :icon-id="values.objectives[i].iconId!"
          :description-field-name="`objectives[${i}].description`"
          @remove="removeObjective(i)"
        />
        <div v-else class="flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <span
              class="typo-body-12-medium rounded-cf-sm bg-brand-100 text-brand-700 px-2 py-0.5"
            >
              Objetivo #{{ i + 1 }}
            </span>
            <Button
              variant="icon"
              size="icon-sm"
              tone="danger"
              @click="removeObjective(i)"
            >
              <PhTrash :size="14" />
            </Button>
          </div>

          <VeeInput
            :name="`objectives[${i}].name`"
            label="Nome"
            placeholder="Ex: Agendar Demo"
            @update:model-value="(val: string) => handleManualNameChange(i, val)"
          />

          <div class="flex flex-col gap-1">
            <FieldLabel>Chave tecnica</FieldLabel>
            <div
              class="rounded-cf-md flex items-center gap-2 border border-gray-300 bg-gray-50 px-3 py-2"
            >
              <code class="typo-body-13-regular text-gray-700">{{
                values.objectives[i].key || '—'
              }}</code>
            </div>
            <p class="typo-body-12-regular text-gray-500">
              Gerada automaticamente a partir do nome. Use apenas letras,
              numeros e underline se editar.
            </p>
          </div>

          <VeeTextarea
            :name="`objectives[${i}].description`"
            label="Descricao"
            :rows="3"
            placeholder="Ex: Chame quando o lead confirmar o agendamento"
          />
        </div>

        <div
          v-if="i < (values.objectives?.length ?? 0) - 1"
          class="border-t border-gray-200"
        />
      </template>

      <div class="flex flex-wrap justify-center gap-3">
        <Button
          variant="outline"
          tone="primary"
          size="medium"
          @click="addManualObjective"
        >
          <template #startIcon>
            <PhPlus :size="16" />
          </template>
          Adicionar manualmente
        </Button>

        <DropdownMenu v-if="visibleToolSources.length > 0">
          <DropdownMenuTrigger as-child>
            <Button variant="outline" tone="dark" size="medium">
              <template #startIcon>
                <PhLink :size="16" />
              </template>
              Usar tool existente
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent class="w-80">
            <template
              v-for="(group, idx) in groupedToolSources"
              :key="group.category"
            >
              <DropdownMenuSeparator v-if="idx > 0" />
              <DropdownMenuLabel>{{ group.category }}</DropdownMenuLabel>
              <DropdownMenuItem
                v-for="src in group.items"
                :key="`${group.category}-${src.key}`"
                :disabled="isSourceAlreadyUsed(src.key)"
                @click="addSourcedObjective(src)"
              >
                <div class="flex flex-col gap-0.5">
                  <div class="flex items-center gap-2">
                    <span class="typo-body-14-medium">{{ src.name }}</span>
                    <span
                      v-if="isSourceAlreadyUsed(src.key)"
                      class="typo-body-10-semibold rounded-cf-sm bg-gray-300 px-1.5 py-0.5 text-gray-700"
                    >
                      Ja usado
                    </span>
                  </div>
                  <span
                    class="typo-body-12-regular line-clamp-1 text-gray-500"
                  >
                    {{ src.description || 'Sem descricao' }}
                  </span>
                </div>
              </DropdownMenuItem>
            </template>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p
        v-if="visibleToolSources.length === 0"
        class="typo-body-12-regular text-center text-gray-500"
      >
        Para vincular a uma ferramenta existente, configure-a antes no passo de
        Ferramentas.
      </p>
    </div>
  </DialogControl>
</template>

<script lang="ts">
import type { AvailableToolId } from './AddToolModal.vue'
import type { ToolSourceRef } from './toolSources'

export interface ObjectiveItem {
  name: string
  key: string
  description: string
  /** Client-only: true quando veio de uma tool existente. Stripado antes do emit. */
  locked?: boolean
  /** Client-only: categoria visual quando `locked`. Stripado antes do emit. */
  iconId?: AvailableToolId
}

export interface ObjectivesConfig {
  objectives: ObjectiveItem[]
}

export type { ToolSourceRef }
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
import BoundObjectiveCard from './BoundObjectiveCard.vue'
import { slugifyObjectiveKey, isValidObjectiveKey } from './objectiveKey'

const props = defineProps<{
  open: boolean
  modelValue: ObjectivesConfig
  availableToolSources?: ToolSourceRef[]
}>()

const { showToastError } = useAlerts()
const { showConfirmation } = useAlertDialog()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:modelValue': [value: ObjectivesConfig]
}>()

const schema = z.object({
  objectives: z
    .array(
      z.object({
        name: z.string().min(1, 'Nome e obrigatorio'),
        key: z
          .string()
          .min(1, 'Chave tecnica e obrigatoria')
          .refine(isValidObjectiveKey, {
            message: 'Use apenas letras, numeros e underline'
          }),
        description: z.string().min(1, 'Descricao e obrigatoria'),
        locked: z.boolean().optional(),
        iconId: z.string().optional()
      })
    )
    .superRefine((arr, ctx) => {
      const seen = new Map<string, number>()
      arr.forEach((o, i) => {
        if (seen.has(o.key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [i, 'key'],
            message: `Chave duplicada: ja existe um objective com key "${o.key}"`
          })
        }
        seen.set(o.key, i)
      })
    })
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

const visibleToolSources = computed(() => props.availableToolSources ?? [])

const groupedToolSources = computed(() => {
  const map = new Map<string, ToolSourceRef[]>()
  for (const s of visibleToolSources.value) {
    if (!map.has(s.category)) map.set(s.category, [])
    map.get(s.category)!.push(s)
  }
  return Array.from(map.entries()).map(([category, items]) => ({
    category,
    items
  }))
})

const isOpen = ref(props.open)

watch(
  () => props.open,
  (val) => {
    isOpen.value = val
    if (val) {
      resetForm({
        values: {
          objectives: (props.modelValue.objectives ?? []).map((o) => ({
            ...o
          }))
        }
      })
    }
  }
)

function closeDialog() {
  resetForm({
    values: {
      objectives: (props.modelValue.objectives ?? []).map((o) => ({ ...o }))
    }
  })
  isOpen.value = false
  emit('update:open', false)
}

async function tryClose() {
  if (meta.value.dirty) {
    const { isConfirmed } = await showConfirmation(
      'Voce tem alteracoes nao salvas. Deseja descartar?',
      {
        title: 'Alteracoes nao salvas',
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

function addManualObjective() {
  setFieldValue('objectives', [
    ...(values.objectives ?? []),
    { name: '', key: '', description: '', locked: false }
  ])
}

function isSourceAlreadyUsed(key: string): boolean {
  return (values.objectives ?? []).some((o) => o.key === key)
}

function addSourcedObjective(source: ToolSourceRef) {
  if (isSourceAlreadyUsed(source.key)) {
    showToastError(`Ja existe um objective vinculado a "${source.name}"`)
    return
  }
  setFieldValue('objectives', [
    ...(values.objectives ?? []),
    {
      name: source.name,
      key: source.key,
      description: '',
      locked: true,
      iconId: source.iconId
    }
  ])
}

function handleManualNameChange(index: number, newName: string) {
  const list = values.objectives ?? []
  const current = list[index]
  if (!current || current.locked) return
  setFieldValue(`objectives[${index}].key`, slugifyObjectiveKey(newName))
}

function removeObjective(index: number) {
  const updated = [...(values.objectives ?? [])]
  updated.splice(index, 1)
  setFieldValue('objectives', updated)
}

const handleConfirm = handleSubmit(
  (formValues) => {
    emit('update:modelValue', {
      objectives: formValues.objectives.map(
        ({ locked: _locked, iconId: _iconId, ...rest }) => ({ ...rest })
      )
    })
    closeDialog()
  },
  ({ errors }) => {
    const messages = Object.values(errors).filter(Boolean) as string[]
    messages
      .slice(0, 5)
      .forEach((msg, i) => setTimeout(() => showToastError(msg), i * 300))
  }
)

function handleCancel() {
  tryClose()
}
</script>
```

- [ ] **Step 2: Typecheck**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit 2>&1 | grep -E "ObjectivesConfigDialog" || echo "no errors"`
Expected: `no errors`.

- [ ] **Step 3: Grep final de referencias mortas**

Run: `cd chatfunnel-front && grep -rn "validateObjectiveName\|isValidObjectiveName" src/ || echo "no references"`
Expected: `no references`.

- [ ] **Step 4: Commit**

```bash
cd chatfunnel-front
git add src/views/agents/AgentsForm/components/modals/ObjectivesConfigDialog.vue
git commit -m "refactor(agents-v2): ObjectivesConfigDialog uses {name,key,description} + BoundObjectiveCard"
```

---

## Task 7: `ToolsStep.vue` consome `buildToolSources`

**Files:**
- Modify: `chatfunnel-front/src/views/agents/AgentsForm/components/steps/ToolsStep.vue`

**Contexto:** O `ToolsStep` ja renderiza `<ObjectivesConfigDialog>` e passava um objeto `availableToolSources` agrupado por categoria com dois arrays (`externalQueries`, `automations`). Agora o dialog espera um array plano `ToolSourceRef[]` e a funcao `buildToolSources` ja produz esse formato a partir de todo o `toolConfigs`.

- [ ] **Step 1: Adicionar o import**

No topo de `ToolsStep.vue`, proximo aos demais imports de modais, adicionar:

```ts
import { buildToolSources, type ToolSourceRef } from '../modals/toolSources'
```

- [ ] **Step 2: Substituir a prop `available-tool-sources` passada ao dialog**

Localizar no `<template>`:

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

E substituir por:

```vue
<ObjectivesConfigDialog
  v-model:open="configDialogs['OBJECTIVES']"
  v-model="toolConfigs['OBJECTIVES']"
  :available-tool-sources="objectiveSources"
/>
```

- [ ] **Step 3: Adicionar o computed no `<script setup>`**

Localizar um bom lugar (proximo aos demais `computed`) e adicionar:

```ts
const objectiveSources = computed<ToolSourceRef[]>(() =>
  buildToolSources({
    DATA_MAPPING: toolConfigs.DATA_MAPPING,
    EXTERNAL_QUERIES: toolConfigs.EXTERNAL_QUERIES,
    CALENDAR: toolConfigs.CALENDAR,
    AUTOMATIONS: toolConfigs.AUTOMATIONS,
    SERVICE_HOURS: toolConfigs.SERVICE_HOURS
  })
)
```

> Se `computed` ainda nao esta importado de `vue`, adicionar ao import existente.

- [ ] **Step 4: Typecheck**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit 2>&1 | grep -E "ToolsStep" || echo "no errors"`
Expected: `no errors`.

- [ ] **Step 5: Commit**

```bash
cd chatfunnel-front
git add src/views/agents/AgentsForm/components/steps/ToolsStep.vue
git commit -m "refactor(agents-v2): ToolsStep uses buildToolSources for granular bindings"
```

---

## Task 8: `index.vue` — `buildToolConfigs` + `loadAgent` com `key`

**Files:**
- Modify: `chatfunnel-front/src/views/agents/AgentsForm/index.vue`

**Contexto:** O payload para o backend agora e `{ name, key, description }`. O GET retorna a mesma tripla. Precisa:
1. `buildToolConfigs`: incluir `key` no mapeamento do case `OBJECTIVES`.
2. `loadAgent`: ler `agent.objectives[].key` e hidratar no estado. Quando um objective carregado tem `key` que coincide com um `ToolSourceRef.key` ja presente nos toolConfigs atuais, marcar `locked: true` e setar `iconId` para que a UI renderize como `BoundObjectiveCard`.

- [ ] **Step 1: Atualizar `buildToolConfigs` para emitir `key`**

Localizar o case adicionado anteriormente em `buildToolConfigs()`:

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

E substituir por:

```ts
} else if (id === 'OBJECTIVES' && config && 'objectives' in config) {
  const objConfig = config as {
    objectives: { name: string; key: string; description: string }[];
  };
  result[id] = {
    objectives: objConfig.objectives.map((o) => ({
      name: o.name,
      key: o.key,
      description: o.description,
    })),
  };
}
```

- [ ] **Step 2: Atualizar `loadAgent` para hidratar `key` e inferir `locked`**

Localizar, em `loadAgent`, o bloco adicionado anteriormente:

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

E substituir por:

```ts
// OBJECTIVES ← agent.objectives[]
if (agent.objectives?.length) {
  // Monta um snapshot de toolConfigs ja adaptados ate este ponto para descobrir
  // quais keys correspondem a tools cadastradas (bound) e quais sao manuais.
  const sources = buildToolSources({
    DATA_MAPPING: adapted['DATA_MAPPING'] as { fields?: unknown[] },
    EXTERNAL_QUERIES: adapted['EXTERNAL_QUERIES'] as {
      queries?: { name: string; description?: string }[]
    },
    CALENDAR: adapted['CALENDAR'] as { connectedAccountId?: string | null },
    AUTOMATIONS: adapted['AUTOMATIONS'] as {
      conditionalAutomations?: { name: string; description?: string }[]
    }
  });
  const byKey = new Map(sources.map((s) => [s.key, s]));

  adapted['OBJECTIVES'] = {
    objectives: agent.objectives.map((o: any) => {
      const match = byKey.get(o.key);
      return match
        ? {
            name: match.name,
            key: o.key,
            description: o.description,
            locked: true,
            iconId: match.iconId,
          }
        : {
            name: o.name,
            key: o.key,
            description: o.description,
            locked: false,
          };
    }),
  };
  originalHadObjectives.value = true;
}
```

> A inferencia de `locked` depende da ordem de hidratacao — este bloco deve executar **depois** de DATA_MAPPING, EXTERNAL_QUERIES, CALENDAR e AUTOMATIONS estarem em `adapted`. Verifique a ordem atual do `loadAgent` e mova o bloco de OBJECTIVES para apos esses, se ainda nao estiver.

- [ ] **Step 3: Adicionar o import no topo de `index.vue`**

Proximo aos demais imports de modals, adicionar:

```ts
import { buildToolSources } from './components/modals/toolSources';
```

- [ ] **Step 4: Typecheck**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit 2>&1 | tail -20`
Expected: sem erros novos em `AgentsForm`.

- [ ] **Step 5: Commit**

```bash
cd chatfunnel-front
git add src/views/agents/AgentsForm/index.vue
git commit -m "feat(agents-v2): serialize/hydrate objectives with key + infer locked on load"
```

---

## Task 9: Smoke test manual no dev server

**Files:**
- None (validacao E2E manual via browser).

**Contexto:** Validar que o fluxo completo funciona antes de fechar. Exercita os 4 cenarios principais.

- [ ] **Step 1: Subir o dev server**

Run: `cd chatfunnel-front && npm run dev` (em outro terminal).

- [ ] **Step 2: Cenario A — Objective manual puro**

1. Abrir `/agents/create`.
2. Adicionar tool `OBJECTIVES` → "Configurar".
3. Clicar "Adicionar manualmente". Digitar `Nome` = "Agendar Demo" → o preview "Chave tecnica" deve mostrar `agendar_demo` automaticamente.
4. Preencher `Descricao` = "Chame quando o lead confirmar".
5. Salvar → badge muda para "Configurado".
6. Abrir DevTools → Network → salvar agente → verificar payload POST:
   - `enabledTools` contem `"OBJECTIVES"`
   - `toolConfigs.OBJECTIVES.objectives` e `[{ name: "Agendar Demo", key: "agendar_demo", description: "..." }]`
   - Nenhum campo `locked` ou `iconId` vaza para o payload.

- [ ] **Step 3: Cenario B — Objective vinculado a external query**

1. Criar outro agente. Adicionar tool `EXTERNAL_QUERIES` → configurar uma query `consultar_plano` / "Busca plano do cliente" / endpoint dummy → salvar.
2. Adicionar tool `OBJECTIVES` → "Configurar".
3. Clicar "Usar tool existente" → verificar que o dropdown lista `Consultas externas > consultar_plano`.
4. Selecionar → aparece um `BoundObjectiveCard` com icone azul (sky), label "consultar_plano", chave `consultar_plano`.
5. Preencher `Descricao` = "Considere atingido quando a query retornar o plano".
6. Salvar → verificar payload:
   - `toolConfigs.OBJECTIVES.objectives[0] = { name: "consultar_plano", key: "consultar_plano", description: "..." }`.

- [ ] **Step 4: Cenario C — Objective vinculado a calendario**

1. No mesmo agente (ou outro), remover a tool `EXTERNAL_QUERIES` (para testar isolado) e adicionar `CALENDAR` → conectar conta Google (ou usar dados mockados do seu ambiente).
2. `OBJECTIVES` → "Usar tool existente" → verificar que o grupo `Calendario Google` lista **4 itens**: `get_google_calendar_slots`, `create_google_calendar_event`, `cancel_google_calendar_event`, `search_google_calendar_events`.
3. Selecionar `Criar evento` → card amber aparece com chave `create_google_calendar_event`.
4. Tentar selecionar o mesmo item no dropdown novamente → item vem desabilitado (`disabled` + toast "Ja existe um objective vinculado").

- [ ] **Step 5: Cenario D — Edit com hidratacao de bound**

1. Salvar um dos agentes dos cenarios anteriores.
2. Voltar a listagem de agentes → editar o mesmo agente.
3. Navegar ate `OBJECTIVES` → "Configurar".
4. Verificar que o item originalmente bound aparece como `BoundObjectiveCard` (nao como form manual), com icone/label/chave corretos.
5. Verificar que o item originalmente manual aparece como form manual.

- [ ] **Step 6: Cenario E — Delete-guard continua funcionando**

1. Editar um agente que tem objectives.
2. Remover a tool `OBJECTIVES` inteira do step Ferramentas.
3. Salvar → payload PUT deve conter `toolConfigs.OBJECTIVES.objectives = []` e `enabledTools` sem `"OBJECTIVES"`.

- [ ] **Step 7: Matar o servidor e commitar qualquer regressao encontrada**

Se algum cenario falhou, corrigir antes de prosseguir. Se todos passaram, nao ha commit adicional aqui.

---

## Task 10: Atualizar grafo, wiki e plano anterior

**Files:**
- Run: `graphify update` no `chatfunnel-front`
- Modify: `vault/wiki/features/_index.md` ou `vault/wiki/features/agents-v2.md` (se existir)
- Modify: `docs/superpowers/plans/2026-04-22-agents-v2-objectives-expiration.md` — adicionar nota no topo apontando para este plano

- [ ] **Step 1: Regenerar o grafo do front**

Run: `"D:/Code/4-Vinicius/Chatfunnel/graphify-test/.venv/Scripts/graphify.exe" update D:/Code/4-Vinicius/Chatfunnel/chatfunnel-front`
Expected: `graph.json, graph.html and GRAPH_REPORT.md updated`.

- [ ] **Step 2: Adicionar nota no plano anterior**

Editar `docs/superpowers/plans/2026-04-22-agents-v2-objectives-expiration.md` inserindo logo apos o header `# Agents V2 — Objectives e Expiração...`:

```markdown
> **⚠ Superseded:** Este plano implementa o modelo `{ name, description }`. A regra de negocio mudou em 2026-04-24 para `{ name, key, description }` com UI baseada em cards para tools vinculadas. Ver plano de refactor: [`2026-04-24-agents-v2-objectives-key-refactor.md`](./2026-04-24-agents-v2-objectives-key-refactor.md).
```

- [ ] **Step 3: Atualizar wiki de features**

Se existir `vault/wiki/features/in-app-campaigns.md` ou um arquivo similar para agents-v2, registrar a mudanca. Caso contrario, atualizar `vault/wiki/features/_index.md` com uma entrada:

```markdown
- [[agents-v2-objectives|Agents V2 — Objectives]] — `{ name, key, description }` com bind a tools existentes via `key`
```

(Criar `vault/wiki/features/agents-v2-objectives.md` com 1-2 paragrafos de resumo referenciando o manual e este plano, caso queira materializar.)

- [ ] **Step 4: Commit**

```bash
cd D:/Code/4-Vinicius/Chatfunnel
git add chatfunnel-front/graphify-out/ docs/superpowers/plans/2026-04-22-agents-v2-objectives-expiration.md vault/
git commit -m "docs(agents-v2): mark prior plan superseded + refresh graph and wiki"
```

```bash
cd chatfunnel-front
git add graphify-out/
git commit -m "chore(graphify): update graph after objectives key refactor"
```

---

## Self-Review

**1. Spec coverage (contra `docs/features/agent-exec/agents-v2-frontend-manual.md`):**
- Sec 4 (estrutura `{ name, key, description }`) — Tasks 1, 2, 6, 8 cobrem schema, validacao, UI e payload. ✓
- Sec 4 regra `name` livre — Task 6: input sem regex. ✓
- Sec 4 regra `key` `/^[a-zA-Z0-9_]+$/` — Task 1 (regex + slugify), Task 6 (schema Zod). ✓
- Sec 4 lista de reservados no `name` — Task 2 mantem `RESERVED_OBJECTIVE_NAMES` exportado apenas como referencia, sem bloqueio. O plano **nao bloqueia colisoes em `name`** porque (a) o manual diz que sao descartadas silenciosamente pelo runtime, (b) o modo bound exige `key = name canonico`, que coincide com reservados intencionalmente, e (c) a dedup acontece por `key`, nao por `name`. Se o produto quiser bloquear `name` reservado no modo manual, adicionar uma validacao no schema Zod. ✓
- Sec 4 "Reutilizar uma tool existente" — Tasks 4, 5, 6, 7 cobrem dropdown granular + card + bind por `key`. ✓
- Sec 4.1 UX "key preenchida automaticamente, bloqueada para edicao" no modo bound — Task 5 (BoundObjectiveCard nao expoe input de key). ✓
- Sec 5 semantica de update — Task 8 preserva o delete-guard ja implementado (nao mudou). ✓
- Sec 6 exemplos payload — Task 8 emite o shape exato. ✓
- Sec 7 GET response inclui `key` — Task 8 Step 2 hidrata. ✓
- Sec 8 checklist — todos os 10 bullets mapeiam para tasks 1-8 (exceto `duration/unit`, que ja estao em outro plano). ✓

**2. Placeholder scan:** Nenhum "TBD", "TODO", "similar a...". Um unico ponto de adaptacao explicitamente marcado (Task 4 Step 3: campo de deteccao de `CALENDAR` configurado pode variar por shape real do `CalendarConfig`) — instrucao clara de como ajustar, nao um placeholder.

**3. Type consistency:**
- `ObjectiveItem` com `name`, `key`, `description`, `locked?`, `iconId?` — consistente em Task 6 (tipo), Task 7 (consumo), Task 8 (payload/hidratacao). ✓
- `ToolSourceRef` com `key`, `name`, `description`, `iconId`, `category` — definido em Task 4, consumido em Tasks 5, 6, 7, 8. ✓
- `AvailableToolId` exportado de `AddToolModal.vue` (Task 3), usado em Tasks 4, 5, 6. ✓
- `slugifyObjectiveKey` e `isValidObjectiveKey` exportados em Task 1, importados em Tasks 2 e 6. ✓
- `buildToolSources` signature `(configs: ToolConfigsSnapshot) => ToolSourceRef[]` consistente em Tasks 4, 7, 8. ✓

Nada a corrigir.
