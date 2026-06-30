# Dashboard V2 — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar uma tela de dashboard operacional com dados fixos dos últimos 30 dias — sem filtros de período expostos ao usuário, com KPIs, gráficos de tendência (2 colunas), heatmap de atividade por horário, donut de entrada de leads por canal, ranking de interações de contatos, ranking de automações e feed de atividade recente.

**Architecture:** View independente em `src/views/dashboardV2/`, paralela à rota `/dashboard` legado durante validação. Composable único `useDashboardV2` agrega todas as queries via `useReportQuery` + `ReportsV2Service`. Datas calculadas internamente com `getLast30DaysRange()` (reusa `defaultFilters` do helpers de reportsV2). Nenhum DashboardV2Service — o padrão do projeto é composable → `ReportsV2Service` diretamente.

**Tech Stack:** Vue 3 + TypeScript. Gráficos via **componentes já prontos** em `reportsV2/components/primitives/echarts/` (ECharts via `vue-echarts` exclusivamente) — não criar nova lógica de chart. Shadcn-vue `Skeleton` para loading states. `@chatfunnel/contracts` para tipos (`Dashboard`, `TimeSeries`, `SegmentedTimeSeries`, `Ranking`, `EventFeed`). `defaultFilters` de `useReportsFilters.helpers.ts`.

---

## Mapa de Arquivos

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| `src/views/reportsV2/composables/useReportsFilters.helpers.ts` | Modificar | Adicionar `"dashboard/periodic-summary"` ao union `ReportEndpoint` e ao `ENDPOINT_OPTIONAL` |
| `src/common/services/ReportsV2Service.ts` | Modificar | Adicionar método `getDashboardPeriodicSummary` |
| `src/views/dashboardV2/routes.ts` | Criar | Definição da rota `/dashboard-v2` |
| `src/views/dashboardV2/DashboardV2View.vue` | Criar | Container principal — orquestra composable e componentes |
| `src/views/dashboardV2/utils/getLast30DaysRange.ts` | Criar | Helper que retorna `ReportsFilters` com os últimos 30 dias |
| `src/views/dashboardV2/utils/getLast30DaysRange.spec.ts` | Criar | Testes unitários do helper |
| `src/views/dashboardV2/composables/useDashboardV2.ts` | Criar | Agrega todas as queries via `useReportQuery` |
| `src/views/dashboardV2/components/KpiGrid.vue` | Criar | Grid de cards KPI (reusa `MetricCard` de reportsV2) |
| `src/views/dashboardV2/components/ContactsTrendChart.vue` | Criar | Card wrapper + `echarts/TimeSeriesChart` (reúso) |
| `src/views/dashboardV2/components/MessagesTrendChart.vue` | Criar | Card wrapper + `SegmentedTimeSeriesChart` (reúso) |
| `src/views/dashboardV2/components/AutomationsTrendChart.vue` | Criar | Card wrapper + `echarts/TimeSeriesChart` (reúso) |
| `src/views/dashboardV2/components/AutomationsRankingCard.vue` | Criar | Card wrapper + `RankingList` (reúso) |
| `src/views/dashboardV2/components/InteractionsRankingCard.vue` | Criar | Ranking de contatos por interações — vem de `AccountsService.getDashboard().topRanking` |
| `src/views/dashboardV2/components/RecentFeed.vue` | Criar | Card wrapper + `EventFeed` primitivo (reúso) |
| `src/views/dashboardV2/components/ActivityHeatmap.vue` | Criar | Card wrapper + `echarts/Heatmap` (reúso) — linha inteira |
| `src/views/dashboardV2/components/LeadsChannelDonut.vue` | Criar | Card wrapper + `echarts/ChannelDonut` (reúso) |
| `src/router/index.js` | Modificar | Registrar `dashboardV2Route` nos filhos do layout |

---

## Task 1: Registrar periodic-summary no helpers e no service

**Files:**
- Modify: `src/views/reportsV2/composables/useReportsFilters.helpers.ts`
- Modify: `src/common/services/ReportsV2Service.ts`

- [ ] **Step 1.1: Adicionar o endpoint ao union ReportEndpoint**

Em `useReportsFilters.helpers.ts`, no union `ReportEndpoint` (linha ~75), adicionar logo após `"dashboard/summary"`:

```ts
| "dashboard/periodic-summary"
```

No objeto `ENDPOINT_OPTIONAL` (linha ~135), logo após `"dashboard/summary": [],`:

```ts
"dashboard/periodic-summary": [],
```

- [ ] **Step 1.2: Adicionar getDashboardPeriodicSummary no ReportsV2Service**

Em `src/common/services/ReportsV2Service.ts`, logo após o método `getDashboardOverview` (por volta da linha 66):

```ts
  getDashboardPeriodicSummary: (filters: ReportsFilters): Promise<Dashboard> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/dashboard/periodic-summary`,
        buildReportParams("dashboard/periodic-summary", filters)
      ) as Promise<AxiosResponse<Dashboard>>
    ).then((res) => {
      const cards = { ...res.data.cards }
      if (cards['wonRevenue']) {
        cards['wonRevenue'] = normalizeCurrencyCard(cards['wonRevenue'])
      }
      return { cards }
    }),
```

- [ ] **Step 1.3: Verificar typecheck**

```bash
cd chatfunnel-front && npm run typecheck 2>&1 | head -30
```

Esperado: sem erros nos dois arquivos modificados.


---

## Task 2: Rota + Shell View + Registro no Router

**Files:**
- Create: `src/views/dashboardV2/routes.ts`
- Create: `src/views/dashboardV2/DashboardV2View.vue`
- Modify: `src/router/index.js`

- [ ] **Step 2.1: Criar routes.ts**

```ts
// src/views/dashboardV2/routes.ts
import type { RouteRecordRaw } from 'vue-router'

export const dashboardV2Route: RouteRecordRaw = {
  path: 'dashboard-v2',
  name: 'DashboardV2View',
  component: () => import('./DashboardV2View.vue'),
  meta: {
    title: 'ChatFunnel - Dashboard',
    accessPaused: true,
    module: 'DASHBOARD'
  }
}
```

- [ ] **Step 2.2: Criar DashboardV2View.vue (shell)**

```vue
<!-- src/views/dashboardV2/DashboardV2View.vue -->
<template>
  <div class="min-h-dvh bg-gray-50 p-6">
    <div class="mx-auto max-w-7xl space-y-6">
      <header class="flex items-center justify-between">
        <h1 class="text-xl font-semibold text-gray-1000">Dashboard</h1>
        <span class="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500">
          Dados dos últimos 30 dias
        </span>
      </header>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>
```

- [ ] **Step 2.3: Registrar rota em src/router/index.js**

No topo do arquivo, junto aos imports de routes existentes:

```js
import { dashboardV2Route } from '../views/dashboardV2/routes'
```

No array `children` do layout principal (onde está a rota `"DashboardView"`), adicionar logo após ela:

```js
dashboardV2Route,
```

- [ ] **Step 2.4: Verificar que /dashboard-v2 carrega**

```bash
npm run dev
```

Abrir `http://localhost:5173/dashboard-v2`. Esperado: header "Dashboard" visível, fundo cinza, sem erros no console.

---

## Task 3: Helper getLast30DaysRange + Testes

**Files:**
- Create: `src/views/dashboardV2/utils/getLast30DaysRange.ts`
- Create: `src/views/dashboardV2/utils/getLast30DaysRange.spec.ts`

- [ ] **Step 3.1: Escrever os testes primeiro (TDD)**

```ts
// src/views/dashboardV2/utils/getLast30DaysRange.spec.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { getLast30DaysRange } from './getLast30DaysRange'

afterEach(() => vi.useRealTimers())

describe('getLast30DaysRange', () => {
  it('finalDate é hoje em UTC no formato YYYY-MM-DD', () => {
    vi.setSystemTime(new Date('2026-06-22T14:30:00Z'))
    const range = getLast30DaysRange()
    expect(range.finalDate).toBe('2026-06-22')
  })

  it('initialDate é 29 dias antes de finalDate (30 dias inclusivos)', () => {
    vi.setSystemTime(new Date('2026-06-22T14:30:00Z'))
    const range = getLast30DaysRange()
    expect(range.initialDate).toBe('2026-05-24')
  })

  it('não inclui campos de filtro extras', () => {
    vi.setSystemTime(new Date('2026-06-22T14:30:00Z'))
    const range = getLast30DaysRange()
    expect((range as Record<string, unknown>).channelId).toBeUndefined()
    expect((range as Record<string, unknown>).pipelineId).toBeUndefined()
  })
})
```

- [ ] **Step 3.2: Rodar e confirmar que falha**

```bash
npm run test -- getLast30DaysRange
```

Esperado: `Error: Cannot find module './getLast30DaysRange'`.

- [ ] **Step 3.3: Implementar o helper**

`defaultFilters` já existe em `useReportsFilters.helpers.ts` e implementa exatamente esta lógica.

```ts
// src/views/dashboardV2/utils/getLast30DaysRange.ts
import { defaultFilters } from '@/views/reportsV2/composables/useReportsFilters.helpers'
import type { ReportsFilters } from '@/views/reportsV2/types/reportsV2.ui'

export function getLast30DaysRange(): ReportsFilters {
  return defaultFilters(new Date())
}
```

- [ ] **Step 3.4: Rodar e confirmar que passa**

```bash
npm run test -- getLast30DaysRange
```

Esperado: 3 testes passando.

---

## Task 4: Composable useDashboardV2

**Files:**
- Create: `src/views/dashboardV2/composables/useDashboardV2.ts`

- [ ] **Step 4.1: Criar o composable**

```ts
// src/views/dashboardV2/composables/useDashboardV2.ts
import { onMounted } from 'vue'
import { useReportQuery } from '@/views/reportsV2/composables/useReportQuery'
import { ReportsV2Service } from '@services/index'
import { getLast30DaysRange } from '../utils/getLast30DaysRange'

export function useDashboardV2() {
  const range = getLast30DaysRange()

  const periodicSummary = useReportQuery(() =>
    ReportsV2Service.getDashboardPeriodicSummary(range)
  )
  const contactsGrowth = useReportQuery(() =>
    ReportsV2Service.getLeadsSeries(range)
  )
  const messagesVolume = useReportQuery(() =>
    ReportsV2Service.getMessagesVolume(range)
  )
  const automationsExecutions = useReportQuery(() =>
    ReportsV2Service.getAutomationsExecutions(range)
  )
  const automationsTop = useReportQuery(() =>
    ReportsV2Service.getAutomationsTop(range)
  )
  const eventFeed = useReportQuery(() =>
    ReportsV2Service.getEventFeed(range)
  )

  onMounted(() => {
    periodicSummary.execute()
    contactsGrowth.execute()
    messagesVolume.execute()
    automationsExecutions.execute()
    automationsTop.execute()
    eventFeed.execute()
  })

  return {
    periodicSummary,
    contactsGrowth,
    messagesVolume,
    automationsExecutions,
    automationsTop,
    eventFeed
  }
}
```

- [ ] **Step 4.2: Typecheck**

```bash
npm run typecheck 2>&1 | head -30
```

Esperado: sem erros no novo arquivo.

---

## Task 5: KpiGrid — cards de KPI com sparkline

**Files:**
- Create: `src/views/dashboardV2/components/KpiGrid.vue`
- Modify: `src/views/dashboardV2/DashboardV2View.vue`

- [ ] **Step 5.1: Criar KpiGrid.vue**

> **ATENÇÃO:** `CARD_ORDER` e `CARD_LABELS` usam nomes estimados. Na Step 5.3, inspecionar o response real de `periodic-summary` no DevTools (Network → filtrar por "periodic-summary" → ver objeto `cards`) e corrigir os nomes reais das chaves antes de commitar.

```vue
<!-- src/views/dashboardV2/components/KpiGrid.vue -->
<template>
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
    <template v-if="loading">
      <Skeleton v-for="i in 6" :key="i" class="h-24 rounded-xl" />
    </template>
    <template v-else-if="data">
      <MetricCard
        v-for="[key, metric] in orderedCards"
        :key="key"
        :label="labelFor(key)"
        :metric="metric"
        :invertDelta="false"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Dashboard } from '@chatfunnel/contracts'
import MetricCard from '@/views/reportsV2/components/primitives/MetricCard.vue'
import { Skeleton } from '@/components/ui/skeleton'

const props = defineProps<{
  data: Dashboard | null
  loading: boolean
}>()

// Ordem de exibição e rótulos — verificar nomes reais contra a resposta da API.
const CARD_ORDER = [
  'newContacts',
  'wonRevenue',
  'messagesSent',
  'aiSessions',
  'activeAutomations',
  'automationExecutions'
]

const CARD_LABELS: Record<string, string> = {
  newContacts: 'Novos contatos',
  wonRevenue: 'Receita ganha',
  messagesSent: 'Mensagens',
  aiSessions: 'Sessões IA',
  activeAutomations: 'Flows ativos',
  automationExecutions: 'Execuções de flows'
}

function labelFor(key: string): string {
  return CARD_LABELS[key] ?? key
}

const orderedCards = computed(() => {
  if (!props.data) return []
  const entries = Object.entries(props.data.cards)
  const known = CARD_ORDER.flatMap((k) => entries.filter(([key]) => key === k))
  const rest = entries.filter(([key]) => !CARD_ORDER.includes(key))
  return [...known, ...rest]
})
</script>
```

- [ ] **Step 5.2: Conectar composable e renderizar KpiGrid na view**

```vue
<!-- src/views/dashboardV2/DashboardV2View.vue -->
<template>
  <div class="min-h-dvh bg-gray-50 p-6">
    <div class="mx-auto max-w-7xl space-y-6">
      <header class="flex items-center justify-between">
        <h1 class="text-xl font-semibold text-gray-1000">Dashboard</h1>
        <span class="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500">
          Dados dos últimos 30 dias
        </span>
      </header>

      <KpiGrid
        :data="periodicSummary.data.value"
        :loading="periodicSummary.loading.value"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDashboardV2 } from './composables/useDashboardV2'
import KpiGrid from './components/KpiGrid.vue'

const { periodicSummary } = useDashboardV2()
</script>
```

- [ ] **Step 5.3: Verificar no browser e ajustar CARD_LABELS**

Abrir `http://localhost:5173/dashboard-v2`. Durante o carregamento: 6 skeletons. Após carregar: cards com valores. Se os cards mostrarem a chave como label (ex: `"newContacts"` em vez de `"Novos contatos"`), abrir DevTools → Network → filtrar por `periodic-summary` → copiar as chaves reais do objeto `cards` e atualizar `CARD_ORDER` e `CARD_LABELS`.

---

## Task 6: Três gráficos de tendência

**Files:**
- Create: `src/views/dashboardV2/components/ContactsTrendChart.vue`
- Create: `src/views/dashboardV2/components/MessagesTrendChart.vue`
- Create: `src/views/dashboardV2/components/AutomationsTrendChart.vue`
- Modify: `src/views/dashboardV2/DashboardV2View.vue`

Os componentes de chart já existem em `reportsV2/components/primitives/echarts/`. Criamos apenas card wrappers finos (título + skeleton + reúso do primitivo). **Não reimplementar lógica de chart. Todos os charts usam ECharts (`vue-echarts`).**

- `TimeSeries` → `echarts/TimeSeriesChart.vue` (`{ data: TimeSeries, label?: string }`)
- `SegmentedTimeSeries` → `echarts/SegmentedTimeSeriesChart.vue` (`{ data: SegmentedTimeSeries }`)

- [ ] **Step 6.1: Criar ContactsTrendChart.vue**

```vue
<!-- src/views/dashboardV2/components/ContactsTrendChart.vue -->
<template>
  <div class="rounded-xl border border-gray-200 bg-white p-4">
    <p class="mb-2 text-sm font-semibold text-gray-800">Tendência de contatos</p>
    <Skeleton v-if="loading" class="h-[260px] w-full rounded-lg" />
    <TimeSeriesChartECharts v-else-if="data" :data="data" label="Contatos" />
    <p v-else class="flex h-[260px] items-center justify-center text-xs text-gray-400">
      Sem dados
    </p>
  </div>
</template>

<script setup lang="ts">
import type { TimeSeries } from '@chatfunnel/contracts'
import TimeSeriesChartECharts from '@/views/reportsV2/components/primitives/echarts/TimeSeriesChart.vue'
import { Skeleton } from '@/components/ui/skeleton'

defineProps<{
  data: TimeSeries | null
  loading: boolean
}>()
</script>
```

- [ ] **Step 6.2: Criar MessagesTrendChart.vue**

`getMessagesVolume` retorna `SegmentedTimeSeries`. O `SegmentedTimeSeriesChart` já renderiza múltiplas linhas com legenda e cores por segmento.

```vue
<!-- src/views/dashboardV2/components/MessagesTrendChart.vue -->
<template>
  <div class="rounded-xl border border-gray-200 bg-white p-4">
    <p class="mb-2 text-sm font-semibold text-gray-800">Volume de mensagens</p>
    <Skeleton v-if="loading" class="h-[260px] w-full rounded-lg" />
    <SegmentedTimeSeriesChart v-else-if="data" :data="data" />
    <p v-else class="flex h-[260px] items-center justify-center text-xs text-gray-400">
      Sem dados
    </p>
  </div>
</template>

<script setup lang="ts">
import type { SegmentedTimeSeries } from '@chatfunnel/contracts'
import SegmentedTimeSeriesChart from '@/views/reportsV2/components/primitives/echarts/SegmentedTimeSeriesChart.vue'
import { Skeleton } from '@/components/ui/skeleton'

defineProps<{
  data: SegmentedTimeSeries | null
  loading: boolean
}>()
</script>
```

- [ ] **Step 6.3: Criar AutomationsTrendChart.vue**

```vue
<!-- src/views/dashboardV2/components/AutomationsTrendChart.vue -->
<template>
  <div class="rounded-xl border border-gray-200 bg-white p-4">
    <p class="mb-2 text-sm font-semibold text-gray-800">Execuções de automações</p>
    <Skeleton v-if="loading" class="h-[260px] w-full rounded-lg" />
    <TimeSeriesChartECharts v-else-if="data" :data="data" label="Execuções" />
    <p v-else class="flex h-[260px] items-center justify-center text-xs text-gray-400">
      Sem dados
    </p>
  </div>
</template>

<script setup lang="ts">
import type { TimeSeries } from '@chatfunnel/contracts'
import TimeSeriesChartECharts from '@/views/reportsV2/components/primitives/echarts/TimeSeriesChart.vue'
import { Skeleton } from '@/components/ui/skeleton'

defineProps<{
  data: TimeSeries | null
  loading: boolean
}>()
</script>
```

- [ ] **Step 6.4: Adicionar os três gráficos na DashboardV2View**

```vue
<!-- src/views/dashboardV2/DashboardV2View.vue -->
<template>
  <div class="min-h-dvh bg-gray-50 p-6">
    <div class="mx-auto max-w-7xl space-y-6">
      <header class="flex items-center justify-between">
        <h1 class="text-xl font-semibold text-gray-1000">Dashboard</h1>
        <span class="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500">
          Dados dos últimos 30 dias
        </span>
      </header>

      <KpiGrid
        :data="periodicSummary.data.value"
        :loading="periodicSummary.loading.value"
      />

      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ContactsTrendChart
          :data="contactsGrowth.data.value"
          :loading="contactsGrowth.loading.value"
        />
        <MessagesTrendChart
          :data="messagesVolume.data.value"
          :loading="messagesVolume.loading.value"
        />
        <AutomationsTrendChart
          :data="automationsExecutions.data.value"
          :loading="automationsExecutions.loading.value"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDashboardV2 } from './composables/useDashboardV2'
import KpiGrid from './components/KpiGrid.vue'
import ContactsTrendChart from './components/ContactsTrendChart.vue'
import MessagesTrendChart from './components/MessagesTrendChart.vue'
import AutomationsTrendChart from './components/AutomationsTrendChart.vue'

const { periodicSummary, contactsGrowth, messagesVolume, automationsExecutions } = useDashboardV2()
</script>
```

- [ ] **Step 6.5: Typecheck + verificar no browser**

```bash
npm run typecheck 2>&1 | head -30
```

Abrir `/dashboard-v2`. Esperado: 3 gráficos renderizados pelo ECharts/Chart.js, idênticos em estilo aos gráficos do reportsV2.

---

## Task 7: Ranking Top Automações

**Files:**
- Create: `src/views/dashboardV2/components/AutomationsRankingCard.vue`
- Modify: `src/views/dashboardV2/DashboardV2View.vue`

`getAutomationsTop` retorna `Ranking = { total: number, entries: RankingEntry[] }`. O componente `RankingList` já existe em `reportsV2/components/primitives/` e aceita `{ entries: RankingEntry[], valueFormat? }` — inclui barra de progresso proporcional.

- [ ] **Step 7.1: Criar AutomationsRankingCard.vue**

```vue
<!-- src/views/dashboardV2/components/AutomationsRankingCard.vue -->
<template>
  <div class="rounded-xl border border-gray-200 bg-white p-4">
    <p class="mb-4 text-sm font-semibold text-gray-800">Top automações</p>

    <template v-if="loading">
      <div v-for="i in 5" :key="i" class="mb-3 space-y-1">
        <div class="flex justify-between gap-3">
          <Skeleton class="h-3 w-1/2" />
          <Skeleton class="h-3 w-10" />
        </div>
        <Skeleton class="h-2 w-full rounded-full" />
      </div>
    </template>

    <RankingList
      v-else-if="data?.entries.length"
      :entries="data.entries"
      valueFormat="number"
    />

    <p v-else class="text-xs text-gray-400">Sem dados</p>
  </div>
</template>

<script setup lang="ts">
import type { Ranking } from '@chatfunnel/contracts'
import RankingList from '@/views/reportsV2/components/primitives/RankingList.vue'
import { Skeleton } from '@/components/ui/skeleton'

defineProps<{
  data: Ranking | null
  loading: boolean
}>()
</script>
```

- [ ] **Step 7.2: Adicionar à DashboardV2View**

No `<template>`, após o grid de gráficos:

```vue
      <AutomationsRankingCard
        :data="automationsTop.data.value"
        :loading="automationsTop.loading.value"
      />
```

No `<script setup>`, atualizar:

```ts
import AutomationsRankingCard from './components/AutomationsRankingCard.vue'

const { periodicSummary, contactsGrowth, messagesVolume, automationsExecutions, automationsTop } = useDashboardV2()
```

- [ ] **Step 7.3: Verificar no browser**

Esperado: lista com barra de progresso proporcional (padrão do `RankingList`), nomes de automações e contagem. Skeleton enquanto carrega.

---

## Task 8: Feed de Atividade Recente + Layout Final

**Files:**
- Create: `src/views/dashboardV2/components/RecentFeed.vue`
- Modify: `src/views/dashboardV2/DashboardV2View.vue`

`getEventFeed` retorna `EventFeed`. O componente `EventFeed` já existe em `reportsV2/components/primitives/` e aceita `{ feed: EventFeed }` — renderiza lista com `item.title`, `item.description` e `item.timestamp`.

- [ ] **Step 8.1: Criar RecentFeed.vue**

O alias `EventFeedPrimitive` evita conflito de nome com o tipo `EventFeed` importado de `@chatfunnel/contracts`.

```vue
<!-- src/views/dashboardV2/components/RecentFeed.vue -->
<template>
  <div class="rounded-xl border border-gray-200 bg-white p-4">
    <p class="mb-4 text-sm font-semibold text-gray-800">Atividade recente</p>

    <template v-if="loading">
      <div v-for="i in 6" :key="i" class="mb-3 flex justify-between gap-3 border-b border-gray-400 pb-3">
        <div class="space-y-1">
          <Skeleton class="h-3 w-40" />
          <Skeleton class="h-2.5 w-24" />
        </div>
        <Skeleton class="h-3 w-16 shrink-0" />
      </div>
    </template>

    <EventFeedPrimitive v-else-if="data" :feed="data" />

    <p v-else class="text-xs text-gray-400">Sem atividade recente</p>
  </div>
</template>

<script setup lang="ts">
import type { EventFeed } from '@chatfunnel/contracts'
import EventFeedPrimitive from '@/views/reportsV2/components/primitives/EventFeed.vue'
import { Skeleton } from '@/components/ui/skeleton'

defineProps<{
  data: EventFeed | null
  loading: boolean
}>()
</script>
```

- [ ] **Step 8.2: DashboardV2View.vue — versão final consolidada**

```vue
<!-- src/views/dashboardV2/DashboardV2View.vue — versão final -->
<template>
  <div class="min-h-dvh bg-gray-50 p-6">
    <div class="mx-auto max-w-7xl space-y-6">

      <header class="flex items-center justify-between">
        <h1 class="text-xl font-semibold text-gray-1000">Dashboard</h1>
        <span class="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500">
          Dados dos últimos 30 dias
        </span>
      </header>

      <KpiGrid
        :data="periodicSummary.data.value"
        :loading="periodicSummary.loading.value"
      />

      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ContactsTrendChart
          :data="contactsGrowth.data.value"
          :loading="contactsGrowth.loading.value"
        />
        <MessagesTrendChart
          :data="messagesVolume.data.value"
          :loading="messagesVolume.loading.value"
        />
        <AutomationsTrendChart
          :data="automationsExecutions.data.value"
          :loading="automationsExecutions.loading.value"
        />
      </div>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AutomationsRankingCard
          :data="automationsTop.data.value"
          :loading="automationsTop.loading.value"
        />
        <RecentFeed
          :data="eventFeed.data.value"
          :loading="eventFeed.loading.value"
        />
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { useDashboardV2 } from './composables/useDashboardV2'
import KpiGrid from './components/KpiGrid.vue'
import ContactsTrendChart from './components/ContactsTrendChart.vue'
import MessagesTrendChart from './components/MessagesTrendChart.vue'
import AutomationsTrendChart from './components/AutomationsTrendChart.vue'
import AutomationsRankingCard from './components/AutomationsRankingCard.vue'
import RecentFeed from './components/RecentFeed.vue'

const {
  periodicSummary,
  contactsGrowth,
  messagesVolume,
  automationsExecutions,
  automationsTop,
  eventFeed
} = useDashboardV2()
</script>
```

- [ ] **Step 8.3: Typecheck final**

```bash
npm run typecheck 2>&1 | head -30
```

Esperado: zero erros em todos os arquivos criados.

- [ ] **Step 8.4: Checklist de validação no browser**

Abrir `http://localhost:5173/dashboard-v2`:
- [ ] KPIs: 6 cards com valores e deltas
- [ ] 3 gráficos com visual idêntico ao reportsV2
- [ ] Ranking de automações: lista com barra de progresso e contagem
- [ ] Feed: eventos com timestamp em pt-BR
- [ ] Mobile (< 768px): todos os blocos em coluna única
- [ ] Console sem erros Vue / runtime

---

## Task 9: Heatmap, ChannelDonut e InteractionsRanking

**Files:**
- Create: `src/views/dashboardV2/components/ActivityHeatmap.vue`
- Create: `src/views/dashboardV2/components/LeadsChannelDonut.vue`
- Create: `src/views/dashboardV2/components/InteractionsRankingCard.vue`
- Modify: `src/views/dashboardV2/composables/useDashboardV2.ts`
- Modify: `src/views/dashboardV2/DashboardV2View.vue`

O heatmap ocupa uma linha inteira (24 colunas de hora × 7 dias — espremido em meia tela). O donut e o ranking de interações completam a linha de 3 colunas na seção inferior.

- [ ] **Step 9.1: Criar ActivityHeatmap.vue**

O primitivo `echarts/Heatmap.vue` aceita `{ data: HeatmapData }`. O helper `bestWeekdayFromHeatmap` existe em `src/views/reportsV2/utils/weekday.ts`.

```vue
<!-- src/views/dashboardV2/components/ActivityHeatmap.vue -->
<template>
  <div class="rounded-xl border border-gray-200 bg-white p-4">
    <div class="mb-4 flex items-center justify-between">
      <p class="text-sm font-semibold text-gray-800">Atividade por horário</p>
      <span v-if="bestWeekday" class="text-xs text-gray-500">
        Melhor dia: {{ bestWeekday.label }}
      </span>
    </div>
    <Skeleton v-if="loading" class="h-[220px] w-full rounded-lg" />
    <Heatmap v-else-if="data" :data="data" />
    <p v-else class="flex h-[220px] items-center justify-center text-xs text-gray-400">
      Sem dados
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { HeatmapData } from '@chatfunnel/contracts'
import Heatmap from '@/views/reportsV2/components/primitives/echarts/Heatmap.vue'
import { Skeleton } from '@/components/ui/skeleton'
import { bestWeekdayFromHeatmap } from '@/views/reportsV2/utils/weekday'

const props = defineProps<{
  data: HeatmapData | null
  loading: boolean
}>()

const bestWeekday = computed(() =>
  props.data ? bestWeekdayFromHeatmap(props.data) : null
)
</script>
```

- [ ] **Step 9.2: Criar LeadsChannelDonut.vue**

O primitivo `echarts/ChannelDonut.vue` aceita `{ entries: RankingEntry[] }`. O service retorna `Ranking = { total, entries }` via `getContactsByChannel`.

```vue
<!-- src/views/dashboardV2/components/LeadsChannelDonut.vue -->
<template>
  <div class="rounded-xl border border-gray-200 bg-white p-4">
    <p class="mb-4 text-sm font-semibold text-gray-800">Leads por canal</p>
    <Skeleton v-if="loading" class="h-[220px] w-full rounded-lg" />
    <ChannelDonut v-else-if="data?.entries.length" :entries="data.entries" />
    <p v-else class="flex h-[220px] items-center justify-center text-xs text-gray-400">
      Sem dados
    </p>
  </div>
</template>

<script setup lang="ts">
import type { Ranking } from '@chatfunnel/contracts'
import ChannelDonut from '@/views/reportsV2/components/primitives/echarts/ChannelDonut.vue'
import { Skeleton } from '@/components/ui/skeleton'

defineProps<{
  data: Ranking | null
  loading: boolean
}>()
</script>
```

- [ ] **Step 9.3: Criar InteractionsRankingCard.vue**

Dados vêm de `AccountsService.getDashboard().data.topRanking` — API Express (`/dashboard`). Shape: `Array<{ name: string, photo: string, quantity: number }>`. Não existe em ReportsV2Service.

```vue
<!-- src/views/dashboardV2/components/InteractionsRankingCard.vue -->
<template>
  <div class="rounded-xl border border-gray-200 bg-white p-4">
    <p class="mb-4 text-sm font-semibold text-gray-800">Ranking de interações</p>

    <template v-if="loading">
      <div v-for="i in 5" :key="i" class="mb-3 flex items-center gap-3">
        <Skeleton class="h-8 w-8 shrink-0 rounded-full" />
        <Skeleton class="h-3 w-1/2" />
        <Skeleton class="ml-auto h-3 w-10 shrink-0" />
      </div>
    </template>

    <template v-else-if="data?.length">
      <div
        v-for="(contact, index) in data"
        :key="contact.name"
        class="flex items-center gap-3 border-b border-gray-100 py-2 last:border-0"
      >
        <span class="w-5 shrink-0 text-xs font-mono text-gray-400">{{ index + 1 }}º</span>
        <div class="relative h-8 w-8 shrink-0">
          <div class="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">
            {{ initials(contact.name) }}
          </div>
          <img v-if="contact.photo" :src="contact.photo" :alt="contact.name"
            class="absolute inset-0 h-8 w-8 rounded-full object-cover" />
        </div>
        <span class="min-w-0 flex-1 truncate text-sm text-gray-800">{{ contact.name }}</span>
        <span class="shrink-0 text-xs font-mono text-gray-500">{{ contact.quantity }}</span>
      </div>
    </template>

    <p v-else class="text-xs text-gray-400">Sem dados</p>
  </div>
</template>

<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'

interface ContactRanking { name: string; photo: string; quantity: number }

defineProps<{ data: ContactRanking[] | null; loading: boolean }>()

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}
</script>
```

- [ ] **Step 9.4: Adicionar queries ao useDashboardV2.ts**

```ts
// Adicionar imports
import { AccountsService } from "@services/index";

// Adicionar queries (junto às existentes)
const activityHeatmap = useReportQuery(() =>
  ReportsV2Service.getActivityHeatmap(range)
)
const leadsChannel = useReportQuery(() =>
  ReportsV2Service.getContactsByChannel(range)
)
const interactionsRanking = useReportQuery(() =>
  AccountsService.getDashboard().then((res: any) => res.data.topRanking ?? [])
)

// Adicionar no onMounted
activityHeatmap.execute()
leadsChannel.execute()
interactionsRanking.execute()

// Adicionar no return
return {
  // ...existentes...
  activityHeatmap,
  leadsChannel,
  interactionsRanking,
}
```

- [ ] **Step 9.5: DashboardV2View.vue — layout final**

```vue
<template>
  <div class="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <PageTitle>Dashboard</PageTitle>
        <PageSubtitle>Dados dos últimos 30 dias</PageSubtitle>
      </div>
    </header>

    <!-- KPIs -->
    <KpiGrid :data="periodicSummary.data.value" :loading="periodicSummary.loading.value" />

    <!-- Gráficos de tendência 2×2 -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <ContactsTrendChart :data="contactsGrowth.data.value" :loading="contactsGrowth.loading.value" />
      <MessagesTrendChart :data="messagesVolume.data.value" :loading="messagesVolume.loading.value" />
      <AutomationsTrendChart :data="automationsExecutions.data.value" :loading="automationsExecutions.loading.value" />
      <InteractionsRankingCard :data="interactionsRanking.data.value" :loading="interactionsRanking.loading.value" />
    </div>

    <!-- Heatmap linha inteira -->
    <ActivityHeatmap :data="activityHeatmap.data.value" :loading="activityHeatmap.loading.value" />

    <!-- Seção inferior 3 colunas -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
      <LeadsChannelDonut :data="leadsChannel.data.value" :loading="leadsChannel.loading.value" />
      <AutomationsRankingCard :data="automationsTop.data.value" :loading="automationsTop.loading.value" />
      <RecentFeed :data="eventFeed.data.value" :loading="eventFeed.loading.value" />
    </div>
  </div>
</template>
```

- [ ] **Step 9.6: Typecheck**

```bash
cd chatfunnel-front && npm run typecheck 2>&1 | head -30
```

Esperado: zero erros nos novos arquivos.

- [ ] **Step 9.7: Verificar no browser**

Abrir `/dashboard-v2`. Checklist:
- [ ] Heatmap renderizado em largura total com eixo de horas e dias
- [ ] "Melhor dia:" aparece no header do heatmap após carregar
- [ ] Donut de canais com legenda
- [ ] Ranking de interações com avatars e contagem
- [ ] Sem erros Vue no console

---

## Task 10: Migração de Rota (executar só após validação)

**Files:**
- Modify: `src/router/index.js`

Esta task só deve ser executada após comparar os números de `/dashboard-v2` com o dashboard legado.

- [ ] **Step 10.1: Validar números side-by-side**

Abrir em abas separadas `/dashboard` (legado) e `/dashboard-v2` (novo). Verificar que novos contatos, receita e mensagens têm divergência < 10% para o período equivalente. Divergências maiores indicam definição diferente no core — investigar antes de migrar.

- [ ] **Step 10.2: Trocar componente da rota /dashboard**

Em `src/router/index.js`, na rota `"DashboardView"` (path: `"dashboard"`), alterar o `component`:

```js
{
  path: "dashboard",
  name: "DashboardView",
  component: () => import("../views/dashboardV2/DashboardV2View.vue"),
  meta: {
    title: "ChatFunnel - Dashboard",
    accessPaused: true,
    module: "DASHBOARD"
  }
}
```

- [ ] **Step 10.3: Verificar /dashboard no browser**

Esperado: `/dashboard` renderiza o novo Dashboard V2. Sidebar e navegação continuam funcionando.

---

## Notas para Implementação

**Chaves reais do KpiGrid:** O mapa `CARD_LABELS` usa nomes estimados. Na Task 5, inspecionar o response real de `periodic-summary` no DevTools e corrigir os nomes das chaves.

**Campos do EventFeed primitivo:** O componente usa `item.title`, `item.description` e `item.timestamp` — não `event.label`. Esses campos vêm do tipo `EventFeed` de `@chatfunnel/contracts`.

**Out of scope deste plano:**
- Seção de alertas (canal desconectado, queda de mensagens) — requer definição de fontes de dados por alerta
- Endpoint `interactions/top-contacts` — requer trabalho no backend (`chatfunnel-services` + `chatfunnel-core`)
