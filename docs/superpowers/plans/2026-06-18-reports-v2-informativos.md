# Informativos do Reports V2 (piloto Geral) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar informativos (ⓘ + popover no clique) a cada seção e card do Reports V2, explicando o que o dado representa e se ele depende do filtro de data — começando pelo tab Geral.

**Architecture:** Registro centralizado tipado (`reportInfo.ts`) como fonte única de verdade; um componente `InfoPopover.vue` que renderiza o selo "Tempo real" (só na exceção) + o ⓘ com popover; props opcionais `infoKey` em `ReportSection` e `MetricCard`; `GeralTab` referencia só por chave.

**Tech Stack:** Vue 3 `<script setup lang="ts">`, shadcn-vue (`ui/popover`, `ui/badge`, `ui/separator`), lucide-vue-next, Vitest + @vue/test-utils.

**Spec:** `docs/superpowers/specs/2026-06-18-reports-v2-informativos-design.md`

**Diretório de trabalho:** todos os caminhos são relativos a `chatfunnel-front/`. Rodar comandos de dentro de `chatfunnel-front/`. Trabalhar na branch atual (`feature/reports-v2`) — sem criar branch nova e sem commits durante a execução.

---

### Task 1: Registro centralizado `reportInfo.ts`

**Files:**
- Create: `src/views/reportsV2/info/reportInfo.ts`
- Test: `src/views/reportsV2/info/__tests__/reportInfo.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

Create `src/views/reportsV2/info/__tests__/reportInfo.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { REPORT_INFO, getReportInfo } from '../reportInfo'

describe('reportInfo', () => {
  it('getReportInfo retorna a entry da chave', () => {
    const info = getReportInfo('geral.totalLeads')
    expect(info.title).toBe('Total de leads')
    expect(info.dataType).toBe('periodo')
  })

  it('toda entry tem title, description não-vazios e dataType válido', () => {
    for (const entry of Object.values(REPORT_INFO)) {
      expect(entry.title.length).toBeGreaterThan(0)
      expect(entry.description.length).toBeGreaterThan(0)
      expect(['periodo', 'tempoReal']).toContain(entry.dataType)
    }
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run src/views/reportsV2/info/__tests__/reportInfo.spec.ts`
Expected: FAIL — `Failed to resolve import '../reportInfo'`.

- [ ] **Step 3: Implementar o registro**

Create `src/views/reportsV2/info/reportInfo.ts`:

```ts
// Fonte única de verdade dos informativos do Reports V2.
// dataType: 'periodo' = reage ao filtro de data; 'tempoReal' = estado atual, ignora a data.
export interface ReportInfoEntry {
  title: string
  description: string
  dataType: 'periodo' | 'tempoReal'
}

export const REPORT_INFO = {
  // — Seções do tab Geral —
  'geral.indicadores': {
    title: 'Indicadores',
    description:
      'Resumo dos principais números do período: leads, ganhos, perdas, faturamento e produtividade.',
    dataType: 'periodo'
  },
  'geral.byChannel': {
    title: 'Entrada de leads por origem',
    description:
      'Distribuição dos leads que entraram no período por canal de origem (WhatsApp, Instagram, etc.).',
    dataType: 'periodo'
  },
  'geral.leadsHistory': {
    title: 'Histórico de entrada de leads',
    description:
      'Evolução diária da quantidade de leads que entraram, dentro do período selecionado.',
    dataType: 'periodo'
  },
  'geral.heatmap': {
    title: 'Atividade por horário',
    description:
      'Concentração de atividade por dia da semana e hora, no período. Ajuda a identificar os melhores horários.',
    dataType: 'periodo'
  },
  'geral.schedulesSection': {
    title: 'Agendamentos',
    description: 'Volume de agendamentos criados ao longo do período.',
    dataType: 'periodo'
  },
  'geral.eventFeed': {
    title: 'Últimos eventos',
    description:
      'Eventos mais recentes registrados no período (entradas, ganhos, perdas e afins).',
    dataType: 'periodo'
  },

  // — Cards do bloco Indicadores —
  'geral.totalLeads': {
    title: 'Total de leads',
    description:
      'Total de contatos que entraram no período selecionado, somando todas as origens.',
    dataType: 'periodo'
  },
  'geral.ganhos': {
    title: 'Leads ganhos',
    description:
      'Leads marcados como ganhos (negócio fechado) no período, somando todos os funis.',
    dataType: 'periodo'
  },
  'geral.perdidos': {
    title: 'Leads perdidos',
    description: 'Leads marcados como perdidos no período, somando todos os funis.',
    dataType: 'periodo'
  },
  'geral.faturamento': {
    title: 'Faturamento',
    description: 'Soma da receita dos leads ganhos no período, somando todos os funis.',
    dataType: 'periodo'
  },
  'geral.agendamentos': {
    title: 'Agendamentos',
    description: 'Total de agendamentos criados no período.',
    dataType: 'periodo'
  },
  'geral.aiHours': {
    title: 'Horas economizadas pela IA',
    description: 'Estimativa de horas de atendimento poupadas pela IA no período.',
    dataType: 'periodo'
  }
} as const satisfies Record<string, ReportInfoEntry>

export type ReportInfoKey = keyof typeof REPORT_INFO

export function getReportInfo(key: ReportInfoKey): ReportInfoEntry {
  return REPORT_INFO[key]
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx vitest run src/views/reportsV2/info/__tests__/reportInfo.spec.ts`
Expected: PASS (2 testes).

---

### Task 2: Componente `InfoPopover.vue`

**Files:**
- Create: `src/views/reportsV2/components/shared/InfoPopover.vue`
- Test: `src/views/reportsV2/components/shared/__tests__/InfoPopover.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

Create `src/views/reportsV2/components/shared/__tests__/InfoPopover.spec.ts`. O registro real do Geral é todo `periodo`; para exercitar as duas ramificações (`periodo` e `tempoReal`) sem poluir o registro, mockamos `getReportInfo` com fixtures:

```ts
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import InfoPopover from '../InfoPopover.vue'
import type { ReportInfoKey } from '../../../info/reportInfo'

vi.mock('../../../info/reportInfo', () => ({
  getReportInfo: (key: string) =>
    ({
      'test.periodo': {
        title: 'Métrica X',
        description: 'Descrição da métrica X.',
        dataType: 'periodo'
      },
      'test.tempoReal': {
        title: 'Métrica Y',
        description: 'Descrição da métrica Y.',
        dataType: 'tempoReal'
      }
    })[key]
}))

const periodo = 'test.periodo' as unknown as ReportInfoKey
const tempoReal = 'test.tempoReal' as unknown as ReportInfoKey

describe('InfoPopover', () => {
  it('mostra o selo "Tempo real" quando dataType é tempoReal', () => {
    const wrapper = mount(InfoPopover, { props: { infoKey: tempoReal } })
    expect(wrapper.text()).toContain('Tempo real')
  })

  it('não mostra o selo quando dataType é periodo', () => {
    const wrapper = mount(InfoPopover, { props: { infoKey: periodo } })
    expect(wrapper.text()).not.toContain('Tempo real')
  })

  it('o trigger tem aria-label com o título', () => {
    const wrapper = mount(InfoPopover, { props: { infoKey: periodo } })
    expect(wrapper.get('button').attributes('aria-label')).toContain('Métrica X')
  })

  it('abre o popover ao clicar e mostra descrição + dependência (periodo)', async () => {
    const wrapper = mount(InfoPopover, {
      props: { infoKey: periodo },
      attachTo: document.body
    })
    await wrapper.get('button').trigger('click')
    await nextTick()
    await flushPromises()
    expect(document.body.textContent).toContain('Descrição da métrica X.')
    expect(document.body.textContent).toContain('Reage ao filtro de período')
    wrapper.unmount()
  })

  it('mostra dependência de tempo real no popover', async () => {
    const wrapper = mount(InfoPopover, {
      props: { infoKey: tempoReal },
      attachTo: document.body
    })
    await wrapper.get('button').trigger('click')
    await nextTick()
    await flushPromises()
    expect(document.body.textContent).toContain('Estado atual — ignora o filtro de período')
    wrapper.unmount()
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run src/views/reportsV2/components/shared/__tests__/InfoPopover.spec.ts`
Expected: FAIL — `Failed to resolve import '../InfoPopover.vue'`.

- [ ] **Step 3: Implementar o componente**

Create `src/views/reportsV2/components/shared/InfoPopover.vue`:

```vue
<template>
  <span class="inline-flex items-center gap-1.5 align-middle">
    <Badge
      v-if="info.dataType === 'tempoReal'"
      color="gray"
      size="xs"
      hierarchy="outlined"
    >
      Tempo real
    </Badge>
    <Popover>
      <PopoverTrigger as-child>
        <button
          type="button"
          class="inline-flex text-gray-700 transition-colors hover:text-gray-1000"
          :aria-label="`Mais informações sobre ${info.title}`"
        >
          <Info class="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" class="flex flex-col gap-2">
        <strong class="typo-body-14-semibold text-gray-1000">{{ info.title }}</strong>
        <p class="typo-body-12-regular text-gray-700">{{ info.description }}</p>
        <Separator />
        <span
          class="typo-body-12-regular inline-flex items-center gap-1.5 text-gray-700"
        >
          <component :is="dependencyIcon" class="size-3.5 shrink-0" />
          {{ dependencyLabel }}
        </span>
      </PopoverContent>
    </Popover>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Info, Clock, Zap } from 'lucide-vue-next'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { getReportInfo, type ReportInfoKey } from '../../info/reportInfo'

const props = defineProps<{ infoKey: ReportInfoKey }>()

const info = computed(() => getReportInfo(props.infoKey))
const dependencyIcon = computed(() => (info.value.dataType === 'tempoReal' ? Zap : Clock))
const dependencyLabel = computed(() =>
  info.value.dataType === 'tempoReal'
    ? 'Estado atual — ignora o filtro de período'
    : 'Reage ao filtro de período'
)
</script>
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx vitest run src/views/reportsV2/components/shared/__tests__/InfoPopover.spec.ts`
Expected: PASS (5 testes).

Se os dois últimos testes (popover aberto) falharem por o conteúdo não estar no DOM, confirme que reka-ui está montando o `PopoverContent` no `document.body` (via PopoverPortal) — os asserts já leem `document.body.textContent`, que cobre o teleport.

---

### Task 3: Integrar `infoKey` em `ReportSection.vue`

**Files:**
- Modify: `src/views/reportsV2/components/shared/ReportSection.vue`
- Test: `src/views/reportsV2/components/shared/__tests__/ReportSection.spec.ts`

- [ ] **Step 1: Adicionar os testes que falham**

Append dentro do `describe` existente em `src/views/reportsV2/components/shared/__tests__/ReportSection.spec.ts` (se `mount` e `ReportSection` ainda não estiverem importados no topo, adicione `import { mount } from '@vue/test-utils'` e `import ReportSection from '../ReportSection.vue'`):

```ts
  it('renderiza o informativo quando infoKey é passado', () => {
    const wrapper = mount(ReportSection, {
      props: { title: 'Indicadores', infoKey: 'geral.indicadores' },
      slots: { default: 'conteúdo' }
    })
    expect(wrapper.find('button[aria-label]').exists()).toBe(true)
  })

  it('não renderiza informativo sem infoKey', () => {
    const wrapper = mount(ReportSection, {
      props: { title: 'Indicadores' },
      slots: { default: 'conteúdo' }
    })
    expect(wrapper.find('button[aria-label]').exists()).toBe(false)
  })
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/views/reportsV2/components/shared/__tests__/ReportSection.spec.ts`
Expected: FAIL — o primeiro teste não acha o `button[aria-label]` (infoKey ainda não suportado / nada renderizado).

- [ ] **Step 3: Implementar**

Em `src/views/reportsV2/components/shared/ReportSection.vue`:

No `<script setup>`, importar e estender props:

```ts
import ReportSkeleton from './ReportSkeleton.vue'
import { Badge } from '@/components/ui/badge'
import InfoPopover from './InfoPopover.vue'
import type { ReportInfoKey } from '../../info/reportInfo'

defineProps<{
  title: string
  loading?: boolean
  error?: unknown
  empty?: boolean
  mock?: boolean
  infoKey?: ReportInfoKey
}>()
```

No `<template>`, dentro do `<div class="flex items-center gap-2">`, após o `<Badge>`:

```vue
      <div class="flex items-center gap-2">
        <h3 class="typo-body-14-semibold text-gray-1000">{{ title }}</h3>
        <Badge v-if="mock" color="gray" size="xs" hierarchy="outlined">Dados de exemplo</Badge>
        <InfoPopover v-if="infoKey" :info-key="infoKey" />
      </div>
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/views/reportsV2/components/shared/__tests__/ReportSection.spec.ts`
Expected: PASS (testes novos + os já existentes).

---

### Task 4: Integrar `infoKey` em `MetricCard.vue`

**Files:**
- Modify: `src/views/reportsV2/components/primitives/MetricCard.vue`
- Test: `src/views/reportsV2/components/primitives/__tests__/MetricCard.spec.ts`

- [ ] **Step 1: Adicionar o teste que falha**

Append dentro do `describe("MetricCard", ...)` em `src/views/reportsV2/components/primitives/__tests__/MetricCard.spec.ts`:

```ts
  it("renderiza o informativo quando infoKey é passado", () => {
    const metric: MetricCardData = { value: 1, format: "number" };
    const wrapper = mount(MetricCard, {
      props: { label: "Total de leads", metric, infoKey: "geral.totalLeads" },
    });
    expect(wrapper.find('button[aria-label]').exists()).toBe(true);
  });

  it("não renderiza informativo sem infoKey", () => {
    const metric: MetricCardData = { value: 1, format: "number" };
    const wrapper = mount(MetricCard, { props: { label: "Leads", metric } });
    expect(wrapper.find('button[aria-label]').exists()).toBe(false);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/views/reportsV2/components/primitives/__tests__/MetricCard.spec.ts`
Expected: FAIL — o teste novo não acha `button[aria-label]`.

- [ ] **Step 3: Implementar**

Em `src/views/reportsV2/components/primitives/MetricCard.vue`:

No `<script setup>`, adicionar imports e estender props:

```ts
import { computed } from 'vue'
import { TrendingUp, TrendingDown } from 'lucide-vue-next'
import type { MetricCard as MetricCardData } from '@chatfunnel/contracts'
import { formatMetricValue } from '../../utils/format'
import InfoPopover from '../shared/InfoPopover.vue'
import type { ReportInfoKey } from '../../info/reportInfo'

const props = defineProps<{
  label: string
  metric: MetricCardData
  note?: string
  infoKey?: ReportInfoKey
}>()
```

No `<template>`, trocar a primeira `<span>` do label por um wrapper que comporta o ⓘ:

```vue
    <div class="flex items-center gap-1.5">
      <span class="typo-body-12-regular text-gray-700">{{ label }}</span>
      <InfoPopover v-if="infoKey" :info-key="infoKey" />
    </div>
```

(o restante do template — valor, delta, note — permanece igual.)

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/views/reportsV2/components/primitives/__tests__/MetricCard.spec.ts`
Expected: PASS (testes novos + os 3 já existentes).

---

### Task 5: Ligar os informativos no `GeralTab.vue`

**Files:**
- Modify: `src/views/reportsV2/tabs/GeralTab.vue`

- [ ] **Step 1: Adicionar `info-key` em cada `<ReportSection>`**

No `<template>` de `src/views/reportsV2/tabs/GeralTab.vue`, adicionar a prop em cada seção (mapeamento título → chave):

```vue
    <ReportSection title="Indicadores" info-key="geral.indicadores">
```
```vue
    <ReportSection
        title="Entrada de leads por origem"
        info-key="geral.byChannel"
        :loading="byChannel.loading.value"
        :error="byChannel.error.value"
        :empty="!!byChannel.data.value && byChannel.data.value.entries.length === 0"
    >
```
```vue
    <ReportSection
        title="Histórico de entrada de leads"
        info-key="geral.leadsHistory"
        :loading="leads.loading.value"
        :error="leads.error.value"
        :empty="!!leads.data.value && leads.data.value.series.length === 0"
    >
```
```vue
    <ReportSection
        title="Atividade por horário"
        info-key="geral.heatmap"
        :loading="heatmap.loading.value"
        :error="heatmap.error.value"
        :empty="!!heatmap.data.value && heatmap.data.value.cells.length === 0"
    >
```
```vue
    <ReportSection
        title="Agendamentos"
        info-key="geral.schedulesSection"
        :loading="schedules.loading.value"
        :error="schedules.error.value"
        :empty="!!schedules.data.value && schedules.data.value.series.length === 0"
    >
```
```vue
    <ReportSection
        title="Últimos eventos"
        info-key="geral.eventFeed"
        :loading="feed.loading.value"
        :error="feed.error.value"
        :empty="!feed.loading.value && !feed.error.value && feed.items.value.length === 0"
    >
```

- [ ] **Step 2: Adicionar `infoKey` ao tipo e aos itens de `kpiCards`**

No `<script setup>`, estender a interface `KpiCardView`:

```ts
interface KpiCardView {
  key: string
  label: string
  note?: string
  loading: boolean
  metric: MetricCardData | null
  infoKey: ReportInfoKey
}
```

Importar o tipo no topo (junto aos demais imports):

```ts
import type { ReportInfoKey } from '../info/reportInfo'
```

Adicionar `infoKey` em cada item do array `kpiCards`:

```ts
const kpiCards = computed<KpiCardView[]>(() => [
  {
    key: 'total',
    label: 'Total de leads',
    note: 'Contatos que entraram no período',
    loading: byChannel.loading.value,
    metric: totalLeadsCard.value,
    infoKey: 'geral.totalLeads'
  },
  {
    key: 'ganhos',
    label: 'Leads ganhos',
    loading: overview.loading.value,
    metric: ganhosCard.value,
    infoKey: 'geral.ganhos'
  },
  {
    key: 'perdidos',
    label: 'Leads perdidos',
    loading: overview.loading.value,
    metric: perdidosCard.value,
    infoKey: 'geral.perdidos'
  },
  {
    key: 'faturamento',
    label: 'Faturamento',
    loading: overview.loading.value,
    metric: faturamentoCard.value,
    infoKey: 'geral.faturamento'
  },
  {
    key: 'agendamentos',
    label: 'Agendamentos',
    loading: schedules.loading.value,
    metric: agendamentosCard.value,
    infoKey: 'geral.agendamentos'
  },
  {
    key: 'aiHours',
    label: 'Horas economizadas pela IA',
    note: 'Estimativa',
    loading: aiHours.loading.value,
    metric: aiHoursCard.value,
    infoKey: 'geral.aiHours'
  }
])
```

- [ ] **Step 3: Passar `info-key` para o `<MetricCard>`**

No `<template>`, no bloco do grid de KPIs:

```vue
          <MetricCard
            v-else-if="card.metric"
            :label="card.label"
            :metric="card.metric"
            :note="card.note"
            :info-key="card.infoKey"
          />
```

- [ ] **Step 4: Typecheck + testes do tab**

Run: `npm run typecheck`
Expected: sem erros novos (chaves inválidas em `info-key` quebrariam aqui — confirma a tipagem do registro).

Run: `npx vitest run src/views/reportsV2/tabs/__tests__/GeralTab.spec.ts`
Expected: PASS (o spec existente continua verde).

- [ ] **Step 5: Verificação visual**

Run: `npm run dev` e abrir o Reports V2 → tab Geral. Conferir:
- ⓘ ao lado de cada título de seção e de cada label de card;
- clique abre o popover com título, descrição e a linha "Reage ao filtro de período";
- nenhum selo "Tempo real" aparece (esperado: Geral é todo `periodo`).

---

### Task 6: Fechamento

- [ ] **Step 1: Rodar toda a suíte do reportsV2**

Run: `npx vitest run src/views/reportsV2`
Expected: PASS (todos os specs do módulo).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: sem erros nos arquivos tocados.

---

## Notas de execução

- **Selo "Tempo real" não aparece no Geral** — é o esperado (tudo é `periodo`). O mecanismo
  está construído/testado e será exercitado em Funil/Contatos numa entrega futura.
- **Sem commits durante a execução** — todo o trabalho fica na branch atual `feature/reports-v2`;
  o commit fica a cargo do usuário quando ele pedir.
- **Tokens de escala** (`text-gray-700`, `text-gray-1000`) — nunca semânticos — nos
  componentes próprios; o `PopoverContent` base (`ui/`) pode usar semânticos internamente.
```