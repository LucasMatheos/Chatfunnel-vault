# Aba "Geral" do Relatórios V2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar a aba "Geral" do Relatórios V2 (`GeralTab.vue`) para cobrir as 11 métricas pedidas na reunião, consumindo apenas endpoints e métodos de service que já existem.

**Architecture:** Frontend puro no `chatfunnel-front`. Todo o backend de relatórios (`@chatfunnel/core/reports`) e todos os métodos do `ReportsV2Service` necessários **já existem e estão testados** — nenhuma mudança de backend, controller, core ou service. O trabalho é: (1) dois utils puros de derivação (melhor dia da semana a partir do heatmap; soma de série segmentada), com TDD; (2) reescrever a `GeralTab.vue` para compor uma grade de KPIs + seções, reusando os componentes primitivos existentes (`MetricCard`, `ChannelDonut`, `BarSeriesChart`, `SegmentedTimeSeriesChart`, `Heatmap`, `EventFeed`) e o padrão `useReportQuery` + `ReportSection`; (3) teste de tab espelhando `FunilTab.spec.ts`.

**Tech Stack:** Vue 3 (`<script setup lang="ts">`), Tailwind v4 (tokens de escala), Vitest + @vue/test-utils, contracts Zod de `@chatfunnel/contracts`.

---

## Contexto e Decisões

**De onde vem cada métrica da reunião (todas já têm método no `ReportsV2Service`):**

| Métrica da reunião | Fonte | Método do service |
|---|---|---|
| Entrada de leads por origem | ranking por `fromPlatform` | `getContactsByChannel` |
| Quantidade total de leads | **soma** do ranking acima (`Ranking.total`) | `getContactsByChannel` (campo `total`) |
| Leads ganhos | card `"Ganhos (período)"` (delta) | `getFunnelOverview` |
| Leads perdidos | card `"Perdidos (período)"` (delta) | `getFunnelOverview` |
| Faturamento | card `"Receita do funil (período)"` (delta, já em reais) | `getFunnelOverview` |
| Agendamentos | **soma** dos pontos da série segmentada | `getSchedulesVolume` |
| Horário de maior fluxo | heatmap dia×hora | `getActivityHeatmap` |
| Melhor dia da semana | **derivado** do heatmap | `getActivityHeatmap` |
| Histórico de entrada por dia | série temporal diária | `getLeadsSeries` |
| Últimos acontecimentos/eventos | feed paginado | `useEventFeed` |
| Horas economizadas pela IA | card (value em horas, format number, delta) | `getAiHoursSaved` |

**Decisões de design (locked):**

1. **"Total de leads" = `byChannel.total`** (soma do "Entrada por origem"), não o `dashboard.summary.newContacts` nem o `"Leads no funil"` do funnel-overview. Motivo: coerência visual — o total bate exatamente com a soma das fatias do donut exibido logo abaixo, e a definição "lead = contato que entrou" é a do usuário. O `dashboard.summary` deixa de ser usado na aba Geral (evita dois números de "leads" divergentes na mesma tela).
2. **Ganhos/Perdidos/Faturamento vêm do `funnel-overview` SEM `pipelineId`** → o backend agrega todos os pipelines da conta (account-wide), apropriado para uma aba "Geral". As keys dos cards são labels pt-BR fixos do handler do core: `"Ganhos (período)"`, `"Perdidos (período)"`, `"Receita do funil (período)"` (com acento em "período").
3. **Grade de KPIs = uma única `ReportSection`** ("Indicadores") com loading/erro agregados das 4 queries que a alimentam (`byChannel`, `overview`, `schedules`, `aiHours`). Cada card é guardado por `v-if` (não renderiza enquanto sua fonte não chegou).
4. **"Melhor dia da semana"** aparece como texto no slot `#actions` da seção "Atividade por horário" (mesmo padrão do `ContatosTab` para textos auxiliares de seção) — não cria card próprio.
5. **`GeralTab.vue` é a aba v2 em desenvolvimento ativo** (não é legado a preservar). Reescrevê-la é o trabalho pretendido; o `getDashboardOverview` continua existindo no service para outros usos.

**Verificação prévia (já confirmada na base — não precisa re-checar):**
- `ReportsV2Service` (`src/common/services/ReportsV2Service.ts`) já expõe: `getContactsByChannel`, `getFunnelOverview`, `getSchedulesVolume`, `getAiHoursSaved`, `getLeadsSeries`, `getActivityHeatmap`. `getFunnelOverview` já normaliza cards `currency` (centavos → reais).
- Tipos de contrato (`@chatfunnel/contracts`): `Ranking { entries, total }`, `HeatmapData { cells: {day,hour,value}[], max }`, `SegmentedTimeSeries { granularity, segments: { segment, points: {date,value}[] }[] }`, `MetricCard { value, format?, delta?, sparkline? }`, `Dashboard { cards: Record<string, MetricCard> }`, `TimeSeries { series, granularity }`.
- `MetricCard.vue` props: `{ label: string; metric: MetricCard; note?: string }` — o fundo do card segue o sinal do delta (não neutralizar).
- `utils/format.ts` (`formatMetricValue`) e `utils/heatmap.ts` (`buildHeatmapMatrix`) já existem.

---

## File Structure

- **Create:** `chatfunnel-front/src/views/reportsV2/utils/weekday.ts` — derivação pura do melhor dia da semana a partir de `HeatmapData`.
- **Create:** `chatfunnel-front/src/views/reportsV2/utils/__tests__/weekday.spec.ts` — testes do util acima.
- **Create:** `chatfunnel-front/src/views/reportsV2/utils/series.ts` — soma de todos os pontos de uma `SegmentedTimeSeries`.
- **Create:** `chatfunnel-front/src/views/reportsV2/utils/__tests__/series.spec.ts` — testes do util acima.
- **Modify (rewrite):** `chatfunnel-front/src/views/reportsV2/tabs/GeralTab.vue` — composição da aba.
- **Create:** `chatfunnel-front/src/views/reportsV2/tabs/__tests__/GeralTab.spec.ts` — teste de integração da tab.

Todos os comandos abaixo são executados a partir de `chatfunnel-front/`.

---

### Task 1: Util `bestWeekdayFromHeatmap`

**Files:**
- Create: `chatfunnel-front/src/views/reportsV2/utils/weekday.ts`
- Test: `chatfunnel-front/src/views/reportsV2/utils/__tests__/weekday.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/views/reportsV2/utils/__tests__/weekday.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { bestWeekdayFromHeatmap } from '../weekday'

describe('bestWeekdayFromHeatmap', () => {
  it('retorna o dia com maior soma de fluxo (todas as horas)', () => {
    const result = bestWeekdayFromHeatmap({
      max: 9,
      cells: [
        { day: 0, hour: 9, value: 3 },
        { day: 3, hour: 10, value: 9 },
        { day: 3, hour: 14, value: 4 },
        { day: 5, hour: 20, value: 5 }
      ]
    })
    // day 3 = Quinta-feira; total 9 + 4 = 13
    expect(result).toEqual({ label: 'Quinta-feira', total: 13 })
  })

  it('retorna null quando não há fluxo no período', () => {
    expect(bestWeekdayFromHeatmap({ max: 0, cells: [] })).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm run test:run -- src/views/reportsV2/utils/__tests__/weekday.spec.ts`
Expected: FAIL — `Failed to resolve import "../weekday"` (arquivo ainda não existe).

- [ ] **Step 3: Implementar o util**

Criar `src/views/reportsV2/utils/weekday.ts`:

```ts
import type { HeatmapData } from '@chatfunnel/contracts'

// Rótulos pt-BR por índice de dia do contrato (0 = segunda … 6 = domingo).
const WEEKDAY_LABELS = [
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
  'Domingo'
]

export interface BestWeekday {
  label: string
  total: number
}

// Soma os valores de cada dia (todas as horas) e retorna o dia de maior fluxo.
// Retorna null quando não há nenhum valor positivo (base vazia no período).
export function bestWeekdayFromHeatmap(data: HeatmapData): BestWeekday | null {
  const totals = new Array<number>(7).fill(0)
  for (const cell of data.cells) {
    totals[cell.day] += cell.value
  }

  let bestDay = -1
  let bestTotal = 0
  for (let day = 0; day < 7; day++) {
    if (totals[day] > bestTotal) {
      bestTotal = totals[day]
      bestDay = day
    }
  }

  if (bestDay === -1) return null
  return { label: WEEKDAY_LABELS[bestDay], total: bestTotal }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm run test:run -- src/views/reportsV2/utils/__tests__/weekday.spec.ts`
Expected: PASS (2 testes).

---

### Task 2: Util `sumSegmentedSeries`

**Files:**
- Create: `chatfunnel-front/src/views/reportsV2/utils/series.ts`
- Test: `chatfunnel-front/src/views/reportsV2/utils/__tests__/series.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/views/reportsV2/utils/__tests__/series.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sumSegmentedSeries } from '../series'

describe('sumSegmentedSeries', () => {
  it('soma todos os pontos de todos os segmentos', () => {
    const total = sumSegmentedSeries({
      granularity: 'day',
      segments: [
        {
          segment: 'SCHEDULED',
          points: [
            { date: '2026-06-01', value: 4 },
            { date: '2026-06-02', value: 6 }
          ]
        },
        {
          segment: 'DONE',
          points: [{ date: '2026-06-01', value: 3 }]
        }
      ]
    })
    expect(total).toBe(13)
  })

  it('retorna 0 para série sem segmentos', () => {
    expect(sumSegmentedSeries({ granularity: 'day', segments: [] })).toBe(0)
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm run test:run -- src/views/reportsV2/utils/__tests__/series.spec.ts`
Expected: FAIL — `Failed to resolve import "../series"`.

- [ ] **Step 3: Implementar o util**

Criar `src/views/reportsV2/utils/series.ts`:

```ts
import type { SegmentedTimeSeries } from '@chatfunnel/contracts'

// Soma todos os pontos de todos os segmentos — total de uma série segmentada
// (ex.: total de agendamentos no período, somando todos os status).
export function sumSegmentedSeries(data: SegmentedTimeSeries): number {
  return data.segments.reduce(
    (sum, seg) => sum + seg.points.reduce((s, p) => s + p.value, 0),
    0
  )
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm run test:run -- src/views/reportsV2/utils/__tests__/series.spec.ts`
Expected: PASS (2 testes).

---

### Task 3: Reescrever `GeralTab.vue`

**Files:**
- Modify (rewrite): `chatfunnel-front/src/views/reportsV2/tabs/GeralTab.vue`
- Test: `chatfunnel-front/src/views/reportsV2/tabs/__tests__/GeralTab.spec.ts` (criado na Task 4)

> A `GeralTab` não tem teste hoje; o teste é a Task 4. Nesta task implementamos a tab e validamos com `typecheck`. (A ordem teste-antes é exercida no conjunto Task 3+4: a Task 4 escreve o teste do comportamento final e roda contra esta implementação.)

- [ ] **Step 1: Substituir o conteúdo inteiro de `GeralTab.vue`**

Reescrever `src/views/reportsV2/tabs/GeralTab.vue`. O arquivo final tem **exatamente** um bloco `<template>` (topo) seguido de um bloco `<script setup lang="ts">` que termina em `</script>` — **sem** bloco `<style>`. Conteúdo:

```vue
<template>
  <div class="flex flex-col gap-4">
    <ReportSection
      title="Indicadores"
      :loading="kpiLoading"
      :error="kpiError"
      :empty="false"
    >
      <div class="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <MetricCard
          v-if="totalLeadsCard"
          label="Total de leads"
          :metric="totalLeadsCard"
          note="Contatos que entraram no período"
        />
        <MetricCard v-if="ganhosCard" label="Leads ganhos" :metric="ganhosCard" />
        <MetricCard v-if="perdidosCard" label="Leads perdidos" :metric="perdidosCard" />
        <MetricCard v-if="faturamentoCard" label="Faturamento" :metric="faturamentoCard" />
        <MetricCard v-if="agendamentosCard" label="Agendamentos" :metric="agendamentosCard" />
        <MetricCard
          v-if="aiHoursCard"
          label="Horas economizadas pela IA"
          :metric="aiHoursCard"
          note="Estimativa"
        />
      </div>
    </ReportSection>

    <ReportSection
      title="Entrada de leads por origem"
      :loading="byChannel.loading.value"
      :error="byChannel.error.value"
      :empty="!!byChannel.data.value && byChannel.data.value.entries.length === 0"
    >
      <ChannelDonut :entries="byChannel.data.value!.entries" />
    </ReportSection>

    <ReportSection
      title="Histórico de entrada de leads"
      :loading="leads.loading.value"
      :error="leads.error.value"
      :empty="!!leads.data.value && leads.data.value.series.length === 0"
    >
      <BarSeriesChart :data="leads.data.value!" label="Leads" />
    </ReportSection>

    <ReportSection
      title="Atividade por horário"
      :loading="heatmap.loading.value"
      :error="heatmap.error.value"
      :empty="!!heatmap.data.value && heatmap.data.value.cells.length === 0"
    >
      <template #actions>
        <span v-if="bestWeekday" class="typo-body-10-regular text-gray-700">
          Melhor dia: {{ bestWeekday.label }}
        </span>
      </template>
      <Heatmap :data="heatmap.data.value!" />
    </ReportSection>

    <ReportSection
      title="Agendamentos"
      :loading="schedules.loading.value"
      :error="schedules.error.value"
      :empty="!!schedules.data.value && schedules.data.value.segments.length === 0"
    >
      <SegmentedTimeSeriesChart :data="schedules.data.value!" />
    </ReportSection>

    <ReportSection
      title="Últimos eventos"
      :loading="feed.loading.value"
      :error="feed.error.value"
      :empty="!feed.loading.value && !feed.error.value && feed.items.value.length === 0"
    >
      <div class="flex flex-col gap-3">
        <EventFeedComponent :feed="feedProp" />
        <div v-if="feed.hasMore.value" class="flex justify-center pt-1">
          <Button
            variant="outline"
            tone="dark"
            size="small"
            :disabled="feed.loadingMore.value"
            @click="feed.loadMore()"
          >
            {{ feed.loadingMore.value ? 'Carregando…' : 'Carregar mais' }}
          </Button>
        </div>
      </div>
    </ReportSection>
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch, computed } from 'vue'
import type { EventFeed, MetricCard as MetricCardData } from '@chatfunnel/contracts'
import { ReportsV2Service } from '@services/index'
import { useReportsFilters } from '../composables/useReportsFilters'
import { useReportQuery } from '../composables/useReportQuery'
import { useEventFeed } from '../composables/useEventFeed'
import { bestWeekdayFromHeatmap } from '../utils/weekday'
import { sumSegmentedSeries } from '../utils/series'
import ReportSection from '../components/shared/ReportSection.vue'
import MetricCard from '../components/primitives/MetricCard.vue'
import ChannelDonut from '../components/primitives/ChannelDonut.vue'
import BarSeriesChart from '../components/primitives/BarSeriesChart.vue'
import SegmentedTimeSeriesChart from '../components/primitives/SegmentedTimeSeriesChart.vue'
import Heatmap from '../components/primitives/Heatmap.vue'
import EventFeedComponent from '../components/primitives/EventFeed.vue'
import { Button } from '@/components/ui/button'

const { filters } = useReportsFilters()

const byChannel = useReportQuery(() => ReportsV2Service.getContactsByChannel({ ...filters }))
const overview = useReportQuery(() => ReportsV2Service.getFunnelOverview({ ...filters }))
const schedules = useReportQuery(() => ReportsV2Service.getSchedulesVolume({ ...filters }))
const aiHours = useReportQuery(() => ReportsV2Service.getAiHoursSaved({ ...filters }))
const leads = useReportQuery(() => ReportsV2Service.getLeadsSeries({ ...filters }))
const heatmap = useReportQuery(() => ReportsV2Service.getActivityHeatmap({ ...filters }))
const feed = useEventFeed(() => ({ ...filters }))

// A grade de KPIs combina 4 fontes numa única seção com loading/erro agregados.
const kpiLoading = computed(
  () =>
    byChannel.loading.value ||
    overview.loading.value ||
    schedules.loading.value ||
    aiHours.loading.value
)
const kpiError = computed(
  () =>
    byChannel.error.value ??
    overview.error.value ??
    schedules.error.value ??
    aiHours.error.value
)

// Total de leads = soma do ranking de aquisição por canal (Ranking.total já é a soma).
const totalLeadsCard = computed<MetricCardData | null>(() =>
  byChannel.data.value ? { value: byChannel.data.value.total, format: 'number' } : null
)

// Ganhos/Perdidos/Faturamento: funnel-overview (período, com delta), agregando TODOS
// os pipelines (sem pipelineId). Keys = labels pt-BR do handler do core (com acento).
const ganhosCard = computed<MetricCardData | null>(
  () => overview.data.value?.cards['Ganhos (período)'] ?? null
)
const perdidosCard = computed<MetricCardData | null>(
  () => overview.data.value?.cards['Perdidos (período)'] ?? null
)
const faturamentoCard = computed<MetricCardData | null>(
  () => overview.data.value?.cards['Receita do funil (período)'] ?? null
)

// Agendamentos = soma de todos os pontos/segmentos da série de volume.
const agendamentosCard = computed<MetricCardData | null>(() =>
  schedules.data.value
    ? { value: sumSegmentedSeries(schedules.data.value), format: 'number' }
    : null
)

// Horas de IA: card vem pronto do backend (value em horas, format number, com delta).
const aiHoursCard = computed<MetricCardData | null>(() => aiHours.data.value)

const bestWeekday = computed(() =>
  heatmap.data.value ? bestWeekdayFromHeatmap(heatmap.data.value) : null
)

const feedProp = computed<EventFeed>(() => ({
  items: feed.items.value,
  hasMore: feed.hasMore.value
}))

function reloadAll(): void {
  byChannel.execute()
  overview.execute()
  schedules.execute()
  aiHours.execute()
  leads.execute()
  heatmap.execute()
  feed.reload()
}

onMounted(reloadAll)
watch(() => [filters.initialDate, filters.finalDate], reloadAll)
</script>
```

- [ ] **Step 2: Rodar typecheck**

Run: `npm run typecheck`
Expected: PASS — sem erros em `GeralTab.vue` (todos os tipos de contrato e props batem).

---

### Task 4: Teste de integração da `GeralTab`

**Files:**
- Create: `chatfunnel-front/src/views/reportsV2/tabs/__tests__/GeralTab.spec.ts`

- [ ] **Step 1: Escrever o teste**

Criar `src/views/reportsV2/tabs/__tests__/GeralTab.spec.ts` (espelha o estilo de mock do `FunilTab.spec.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

// ── Mocks (antes dos imports do SUT) ─────────────────────────────────────────
const mockFilters = {
  initialDate: '2026-01-01',
  finalDate: '2026-01-31'
}

vi.mock('../../composables/useReportsFilters', () => ({
  useReportsFilters: () => ({ filters: mockFilters })
}))

vi.mock('../../composables/useEventFeed', () => ({
  useEventFeed: () => ({
    items: ref([]),
    hasMore: ref(false),
    loading: ref(false),
    error: ref(null),
    loadingMore: ref(false),
    reload: vi.fn(),
    loadMore: vi.fn()
  })
}))

const mockGetContactsByChannel = vi.fn().mockResolvedValue({
  total: 42,
  entries: [{ id: 'meta', label: 'Meta', value: 42 }]
})
const mockGetFunnelOverview = vi.fn().mockResolvedValue({
  cards: {
    'Ganhos (período)': { value: 10, format: 'number' },
    'Perdidos (período)': { value: 4, format: 'number' },
    'Receita do funil (período)': { value: 1500, format: 'currency' }
  }
})
const mockGetSchedulesVolume = vi.fn().mockResolvedValue({
  granularity: 'day',
  segments: [{ segment: 'SCHEDULED', points: [{ date: '2026-01-02', value: 7 }] }]
})
const mockGetAiHoursSaved = vi.fn().mockResolvedValue({ value: 12.5, format: 'number' })
const mockGetLeadsSeries = vi.fn().mockResolvedValue({
  granularity: 'day',
  series: [{ date: '2026-01-02', value: 3 }]
})
const mockGetActivityHeatmap = vi.fn().mockResolvedValue({
  max: 5,
  cells: [{ day: 3, hour: 10, value: 5 }]
})

vi.mock('@services/index', () => ({
  ReportsV2Service: {
    getContactsByChannel: (...a: unknown[]) => mockGetContactsByChannel(...a),
    getFunnelOverview: (...a: unknown[]) => mockGetFunnelOverview(...a),
    getSchedulesVolume: (...a: unknown[]) => mockGetSchedulesVolume(...a),
    getAiHoursSaved: (...a: unknown[]) => mockGetAiHoursSaved(...a),
    getLeadsSeries: (...a: unknown[]) => mockGetLeadsSeries(...a),
    getActivityHeatmap: (...a: unknown[]) => mockGetActivityHeatmap(...a)
  }
}))

// ── Import SUT após os mocks ─────────────────────────────────────────────────
import GeralTab from '../GeralTab.vue'

function mountTab() {
  return mount(GeralTab, {
    global: {
      stubs: {
        ReportSection: {
          template:
            '<section><slot v-if="!loading && !error && !empty" /><slot name="actions" /></section>',
          props: ['title', 'loading', 'error', 'empty']
        },
        MetricCard: {
          template: '<div class="metric-card">{{ label }}</div>',
          props: ['label', 'metric', 'note']
        },
        ChannelDonut: { template: '<div />', props: ['entries'] },
        BarSeriesChart: { template: '<div />', props: ['data', 'label'] },
        SegmentedTimeSeriesChart: { template: '<div />', props: ['data'] },
        Heatmap: { template: '<div />', props: ['data'] },
        EventFeedComponent: { template: '<div />', props: ['feed'] },
        Button: { template: '<button><slot /></button>' }
      }
    }
  })
}

// ── Testes ───────────────────────────────────────────────────────────────────
describe('GeralTab', () => {
  beforeEach(() => vi.clearAllMocks())

  it('dispara todos os endpoints da aba no mount', async () => {
    mountTab()
    await flushPromises()
    expect(mockGetContactsByChannel).toHaveBeenCalledTimes(1)
    expect(mockGetFunnelOverview).toHaveBeenCalledTimes(1)
    expect(mockGetSchedulesVolume).toHaveBeenCalledTimes(1)
    expect(mockGetAiHoursSaved).toHaveBeenCalledTimes(1)
    expect(mockGetLeadsSeries).toHaveBeenCalledTimes(1)
    expect(mockGetActivityHeatmap).toHaveBeenCalledTimes(1)
  })

  it('renderiza os 6 cards de indicadores', async () => {
    const wrapper = mountTab()
    await flushPromises()
    const labels = wrapper.findAll('.metric-card').map((c) => c.text())
    expect(labels).toContain('Total de leads')
    expect(labels).toContain('Leads ganhos')
    expect(labels).toContain('Leads perdidos')
    expect(labels).toContain('Faturamento')
    expect(labels).toContain('Agendamentos')
    expect(labels).toContain('Horas economizadas pela IA')
  })

  it('mostra o melhor dia da semana derivado do heatmap', async () => {
    const wrapper = mountTab()
    await flushPromises()
    // cells day=3 → Quinta-feira
    expect(wrapper.text()).toContain('Melhor dia: Quinta-feira')
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que passa**

Run: `npm run test:run -- src/views/reportsV2/tabs/__tests__/GeralTab.spec.ts`
Expected: PASS (3 testes). Se algum card faltar, verificar as keys pt-BR do `funnel-overview` (`'Ganhos (período)'` etc., com acento).

---

### Task 5: Verificação final

- [ ] **Step 1: Rodar a suíte de testes do reportsV2 e o typecheck**

Run: `npm run test:run -- src/views/reportsV2`
Expected: PASS — todos os specs do reportsV2 (incluindo os novos utils e a GeralTab) verdes.

Run: `npm run typecheck`
Expected: PASS — sem erros.

- [ ] **Step 2: Rodar o lint**

Run: `npm run lint`
Expected: sem erros nos arquivos novos/alterados.

- [ ] **Step 3: Atualizar o grafo (graphify) do front**

```bash
"D:/Code/4-Vinicius/Chatfunnel/graphify-test/.venv/Scripts/graphify.exe" update .
```

- [ ] **Step 4: Verificação visual manual (smoke)**

Run: `npm run dev`
Abrir Relatórios V2 → aba "Geral". Confirmar: grade "Indicadores" com 6 cards (Total de leads, Leads ganhos, Leads perdidos, Faturamento, Agendamentos, Horas economizadas pela IA); donut "Entrada de leads por origem"; "Histórico de entrada de leads"; "Atividade por horário" com texto "Melhor dia: …" no canto; "Agendamentos"; "Últimos eventos" com "Carregar mais". Trocar o intervalo de datas recarrega tudo.

---

## Self-Review

**1. Cobertura das 11 métricas da reunião:**
- Entrada de leads por origem → seção "Entrada de leads por origem" (`ChannelDonut`/`byChannel`) ✓
- Quantidade total de leads → card "Total de leads" (`byChannel.total`) ✓
- Leads ganhos → card "Leads ganhos" (`funnel-overview`) ✓
- Leads perdidos → card "Leads perdidos" (`funnel-overview`) ✓
- Faturamento → card "Faturamento" (`funnel-overview`) ✓
- Agendamentos → card "Agendamentos" + seção "Agendamentos" (`schedules.volume`) ✓
- Horário de maior fluxo → seção "Atividade por horário" (`Heatmap`) ✓
- Melhor dia da semana → `#actions` "Melhor dia: …" (`bestWeekdayFromHeatmap`) ✓
- Histórico de entrada por dia → seção "Histórico de entrada de leads" (`BarSeriesChart`/`leads`) ✓
- Últimos acontecimentos → seção "Últimos eventos" (`useEventFeed`) ✓
- Horas economizadas pela IA → card "Horas economizadas pela IA" (`ai-hours-saved`) ✓

**2. Placeholders:** nenhum — todo passo traz código/comando completo.

**3. Consistência de tipos/nomes:** `bestWeekdayFromHeatmap`/`BestWeekday` e `sumSegmentedSeries` usados na `GeralTab` batem com os utils das Tasks 1 e 2. Props dos componentes (`MetricCard {label,metric,note}`, `ChannelDonut {entries}`, `BarSeriesChart {data,label}`, `SegmentedTimeSeriesChart {data}`, `Heatmap {data}`) batem com os stubs do teste e com os componentes reais. Keys pt-BR do `funnel-overview` consistentes entre tab e teste (`'Ganhos (período)'`, `'Perdidos (período)'`, `'Receita do funil (período)'`).
</content>
