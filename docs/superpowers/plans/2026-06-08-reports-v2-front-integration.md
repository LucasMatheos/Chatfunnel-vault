# Relatórios V2 — Integração Front ↔ Backend Real — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar os mocks do front de Relatórios V2 pelos endpoints REST reais onde o backend já entrega, corrigir divergências de convenção, e construir a UI faltante de Receita e Aging.

**Architecture:** O front consome o backend via `ReportsV2Service` (camada HTTP sobre `NestApi`). Os 7 endpoints reais vivem em `/nest/reports/v2/*`. Um helper monta os query params por endpoint (whitelist, evita `400`). Os 3 blocos sem backend (Dashboard composto / stage-counts) continuam em mock, sinalizados. Shapes de dados vêm de `@chatfunnel/contracts`.

**Tech Stack:** Vue 3 (`<script setup lang="ts">`), Tailwind v4 + shadcn-vue, Vitest + @testing-library/vue, Axios (`NestApi`), Pinia (`auth` store).

**Spec:** `docs/superpowers/specs/2026-06-08-reports-v2-front-integration-design.md`

**Diretório base de todos os caminhos:** `chatfunnel-front/`

---

## File Structure

- **Create** `src/views/reportsV2/utils/reportParams.ts` — monta query params por endpoint (whitelist + datas ISO).
- **Create** `src/views/reportsV2/utils/__tests__/reportParams.spec.ts` — testes do helper.
- **Create** `src/views/reportsV2/composables/useDefaultPipeline.ts` — resolve `pipelineId` real (lastKanban → 1º da lista).
- **Create** `src/views/reportsV2/components/primitives/AgingChart.vue` — barras por faixa de aging.
- **Create** `src/views/reportsV2/components/primitives/__tests__/AgingChart.spec.ts`.
- **Modify** `src/common/services/ReportsV2Service.ts` — paths reais, mock por-método, 2 métodos novos, receita ÷100.
- **Modify** `src/views/reportsV2/components/shared/ReportSection.vue` — prop `mock` + badge.
- **Modify** `src/views/reportsV2/components/primitives/FunnelChart.vue` — `conversionFromPrevious` `0..1` → %.
- **Modify** `src/views/reportsV2/utils/heatmap.ts` (+ `Heatmap.vue`) — `0 = segunda`.
- **Modify** `src/views/reportsV2/mocks/funnel.mocks.ts` — alinhar conversão a `0..1`.
- **Modify** `src/views/reportsV2/tabs/GeralTab.vue` — real + feed com "Carregar mais" + selo no grid.
- **Modify** `src/views/reportsV2/tabs/FunilTab.vue` — real + pipeline real + Receita + Aging + selo nos blocos mock.

**Comandos do repo:** testes `npm test` (Vitest); um arquivo: `npx vitest run src/caminho/arquivo.spec.ts`. Typecheck: `npm run typecheck`.

---

## Task 1: Helper de query params por endpoint

**Files:**
- Create: `src/views/reportsV2/utils/reportParams.ts`
- Test: `src/views/reportsV2/utils/__tests__/reportParams.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/views/reportsV2/utils/__tests__/reportParams.spec.ts
import { describe, it, expect } from 'vitest'
import { buildReportParams } from '../reportParams'
import type { ReportsFilters } from '../../types/reportsV2.ui'

const base: ReportsFilters = {
  initialDate: '2026-05-01',
  finalDate: '2026-05-31',
  pipelineId: 'kanban-1',
  channelId: 'chan-9',
  origin: 'meta',
  utmSource: 'ig',
  utmMedium: 'cpc',
  utmCampaign: 'promo'
}

describe('buildReportParams', () => {
  it('converte datas para ISO 8601 completo (início/fim do dia em UTC)', () => {
    const p = buildReportParams('contacts/growth', base)
    expect(p.initialDate).toBe('2026-05-01T00:00:00Z')
    expect(p.finalDate).toBe('2026-05-31T23:59:59Z')
  })

  it('growth envia somente datas (sem UTM/origin/pipeline/channel)', () => {
    const p = buildReportParams('contacts/growth', base)
    expect(Object.keys(p).sort()).toEqual(['finalDate', 'initialDate'])
  })

  it('peak-hours inclui channelId quando presente', () => {
    const p = buildReportParams('contacts/peak-hours', base)
    expect(p.channelId).toBe('chan-9')
    expect('origin' in p).toBe(false)
  })

  it('crm/funnel inclui pipelineId', () => {
    const p = buildReportParams('crm/funnel', base)
    expect(p.pipelineId).toBe('kanban-1')
  })

  it('general/feed inclui limit e cursor quando passados via overrides', () => {
    const p = buildReportParams('general/feed', base, { limit: 20, cursor: 'abc' })
    expect(p.limit).toBe(20)
    expect(p.cursor).toBe('abc')
  })

  it('omite chaves opcionais ausentes', () => {
    const p = buildReportParams('crm/aging', { initialDate: '2026-05-01', finalDate: '2026-05-31' })
    expect('pipelineId' in p).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/views/reportsV2/utils/__tests__/reportParams.spec.ts`
Expected: FAIL — "Failed to resolve import '../reportParams'".

- [ ] **Step 3: Write the implementation**

```ts
// src/views/reportsV2/utils/reportParams.ts
import type { ReportsFilters } from '../types/reportsV2.ui'

// Endpoints reais de Relatórios V2 (paths relativos ao baseURL do NestApi, sem /nest).
export type ReportEndpoint =
  | 'contacts/growth'
  | 'contacts/peak-hours'
  | 'crm/funnel'
  | 'crm/loss-reasons'
  | 'crm/revenue-card'
  | 'crm/aging'
  | 'general/feed'

export interface ReportParamOverrides {
  limit?: number
  cursor?: string
}

export type ReportQueryParams = Record<string, string | number>

// Quais campos (além das datas) cada endpoint aceita. ValidationPipe do back é
// estrito (forbidNonWhitelisted) — enviar campo extra (ex: UTM) => 400.
const ALLOWED: Record<ReportEndpoint, Array<keyof ReportsFilters>> = {
  'contacts/growth': [],
  'contacts/peak-hours': ['channelId'],
  'crm/funnel': ['pipelineId'],
  'crm/loss-reasons': ['pipelineId'],
  'crm/revenue-card': ['pipelineId'],
  'crm/aging': ['pipelineId'],
  'general/feed': []
}

function startOfDayIso(yyyymmdd: string): string {
  return `${yyyymmdd}T00:00:00Z`
}
function endOfDayIso(yyyymmdd: string): string {
  return `${yyyymmdd}T23:59:59Z`
}

export function buildReportParams(
  endpoint: ReportEndpoint,
  filters: ReportsFilters,
  overrides: ReportParamOverrides = {}
): ReportQueryParams {
  const params: ReportQueryParams = {
    initialDate: startOfDayIso(filters.initialDate),
    finalDate: endOfDayIso(filters.finalDate)
  }

  for (const key of ALLOWED[endpoint]) {
    const value = filters[key]
    if (value !== undefined && value !== null && value !== '') {
      params[key] = value as string
    }
  }

  if (endpoint === 'general/feed') {
    if (overrides.limit !== undefined) params.limit = overrides.limit
    if (overrides.cursor) params.cursor = overrides.cursor
  }

  return params
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/views/reportsV2/utils/__tests__/reportParams.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/views/reportsV2/utils/reportParams.ts src/views/reportsV2/utils/__tests__/reportParams.spec.ts
git commit -m "feat(reports-v2): helper de query params por endpoint (whitelist + ISO)"
```

---

## Task 2: ReportsV2Service — paths reais, mock por-método, métodos novos, receita ÷100

**Files:**
- Modify: `src/common/services/ReportsV2Service.ts`

> Contexto: `NestApi.get()(url, params)` resolve para o response do axios; o service usa `.then((res) => res.data)`. O `get` interno faz `new URLSearchParams({ ...params })`, então `ReportQueryParams` (valores string/number) serializa corretamente.

- [ ] **Step 1: Substituir o arquivo inteiro**

```ts
// src/common/services/ReportsV2Service.ts
import type { AxiosResponse } from "axios";
import { NestApi } from "../api/index";
import type {
  Dashboard,
  TimeSeries,
  HeatmapData,
  EventFeed,
  FunnelData,
  Ranking,
  MetricCard,
  AgingData,
} from "@chatfunnel/contracts";
import type {
  ComparisonTableData,
  ReportsFilters,
} from "@/views/reportsV2/types/reportsV2.ui";
import {
  buildReportParams,
  type ReportParamOverrides,
} from "@/views/reportsV2/utils/reportParams";
import {
  mockDashboard,
  withMockLatency,
} from "@/views/reportsV2/mocks/dashboard.mocks";
import {
  mockFunnelOverview,
  mockFunnelStageTable,
} from "@/views/reportsV2/mocks/funnel.mocks";

const REPORTS_V2_BASE = "/reports/v2";

// Os 3 blocos abaixo dependem do "Dashboard composto"/stage-counts que o backend
// ainda NÃO emite — seguem em mock (sinalizados na UI). O resto é API real.
const ReportsV2Service = {
  // ---- BLOQUEADOS (mock sinalizado) ----
  getDashboardOverview: (_filters: ReportsFilters): Promise<Dashboard> =>
    withMockLatency(mockDashboard),

  getFunnelOverview: (_filters: ReportsFilters): Promise<Dashboard> =>
    withMockLatency(mockFunnelOverview),

  getFunnelStageCounts: (_filters: ReportsFilters): Promise<ComparisonTableData> =>
    withMockLatency(mockFunnelStageTable),

  // ---- REAIS ----
  getLeadsSeries: (filters: ReportsFilters): Promise<TimeSeries> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/contacts/growth`,
        buildReportParams("contacts/growth", filters)
      ) as Promise<AxiosResponse<TimeSeries>>
    ).then((res) => res.data),

  getActivityHeatmap: (filters: ReportsFilters): Promise<HeatmapData> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/contacts/peak-hours`,
        buildReportParams("contacts/peak-hours", filters)
      ) as Promise<AxiosResponse<HeatmapData>>
    ).then((res) => res.data),

  getEventFeed: (
    filters: ReportsFilters,
    overrides: ReportParamOverrides = {}
  ): Promise<EventFeed> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/general/feed`,
        buildReportParams("general/feed", filters, overrides)
      ) as Promise<AxiosResponse<EventFeed>>
    ).then((res) => res.data),

  getFunnel: (filters: ReportsFilters): Promise<FunnelData> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/crm/funnel`,
        buildReportParams("crm/funnel", filters)
      ) as Promise<AxiosResponse<FunnelData>>
    ).then((res) => res.data),

  getFunnelLossReasons: (filters: ReportsFilters): Promise<Ranking> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/crm/loss-reasons`,
        buildReportParams("crm/loss-reasons", filters)
      ) as Promise<AxiosResponse<Ranking>>
    ).then((res) => res.data),

  // Backend manda value/delta.absolute em CENTAVOS (Int) → dividir por 100.
  getRevenueCard: (filters: ReportsFilters): Promise<MetricCard> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/crm/revenue-card`,
        buildReportParams("crm/revenue-card", filters)
      ) as Promise<AxiosResponse<MetricCard>>
    ).then((res) => {
      const card = res.data;
      return {
        ...card,
        value: card.value / 100,
        delta: card.delta
          ? { ...card.delta, absolute: card.delta.absolute / 100 }
          : card.delta,
      };
    }),

  getAging: (filters: ReportsFilters): Promise<AgingData> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/crm/aging`,
        buildReportParams("crm/aging", filters)
      ) as Promise<AxiosResponse<AgingData>>
    ).then((res) => res.data),
};

export default ReportsV2Service;
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: sem erros novos em `ReportsV2Service.ts`. (Se `MetricCard`/`AgingData` não existirem no import de contracts, confirmar nomes em `chatfunnel-contracts/src/endpoints/reports.contracts.ts` — são `MetricCard` e `AgingData`.)

- [ ] **Step 3: Commit**

```bash
git add src/common/services/ReportsV2Service.ts
git commit -m "feat(reports-v2): service aponta endpoints reais + receita em reais"
```

---

## Task 3: Correção do funil — `conversionFromPrevious` é fração 0..1

**Files:**
- Modify: `src/views/reportsV2/components/primitives/FunnelChart.vue:48`
- Modify: `src/views/reportsV2/mocks/funnel.mocks.ts`

- [ ] **Step 1: Ajustar o cálculo do modo relativo no FunnelChart**

Em `FunnelChart.vue`, dentro do `computed(() => ...)`, trocar a linha:

```ts
    const relative = index === 0 ? 100 : (stage.conversionFromPrevious ?? 0)
```

por:

```ts
    // conversionFromPrevious vem como fração 0..1 (contrato); exibimos em %.
    const relative = index === 0 ? 100 : (stage.conversionFromPrevious ?? 0) * 100
```

- [ ] **Step 2: Alinhar o mock à fração 0..1**

Em `funnel.mocks.ts`, no `mockFunnelData`, trocar os valores de `conversionFromPrevious` de `0..100` para fração `0..1`:

```ts
export const mockFunnelData: FunnelData = {
  stages: [
    { id: "novo", name: "Novo lead", total: 842, conversionFromPrevious: 1 },
    { id: "qualificacao", name: "Qualificacao", total: 612, conversionFromPrevious: 0.727 },
    { id: "proposta", name: "Proposta", total: 331, conversionFromPrevious: 0.541 },
    { id: "negociacao", name: "Negociacao", total: 244, conversionFromPrevious: 0.737 },
    { id: "ganho", name: "Ganho", total: 186, conversionFromPrevious: 0.762 },
  ],
};
```

- [ ] **Step 3: Atualizar o teste existente do FunnelChart**

Run: `npx vitest run src/views/reportsV2/components/primitives/__tests__/FunnelChart.spec.ts`
Se o teste afirmava conversão relativa com mock em `0..100`, ajustar as expectativas para os valores em % derivados da fração (ex.: `0.727` → `"72,7%"` conforme `formatMetricValue`). Rodar até PASS.

- [ ] **Step 4: Commit**

```bash
git add src/views/reportsV2/components/primitives/FunnelChart.vue src/views/reportsV2/mocks/funnel.mocks.ts src/views/reportsV2/components/primitives/__tests__/FunnelChart.spec.ts
git commit -m "fix(reports-v2): funil usa conversionFromPrevious como fracao 0..1"
```

---

## Task 4: Correção do heatmap — `0 = segunda`

**Files:**
- Modify: `src/views/reportsV2/components/primitives/Heatmap.vue` (rótulos das linhas)
- Modify: `src/views/reportsV2/utils/heatmap.ts` (comentário)

- [ ] **Step 1: Ajustar os rótulos de dias no Heatmap.vue**

Abrir `Heatmap.vue` e localizar o array de rótulos de dia da semana (atualmente iniciando em domingo, ex.: `['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']`). Substituir por ordem iniciando na **segunda**, casando com o contrato (`0 = segunda`):

```ts
const WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
```

A indexação `matrix[cell.day]` em `heatmap.ts` **não muda** — apenas os rótulos passam a refletir 0=segunda.

- [ ] **Step 2: Atualizar o comentário em heatmap.ts**

Trocar o comentário `// Linha = dia da semana (0=domingo), coluna = hora.` por `// Linha = dia da semana (0=segunda, contrato), coluna = hora.`

- [ ] **Step 3: Atualizar o teste do Heatmap**

Run: `npx vitest run src/views/reportsV2/components/primitives/__tests__/Heatmap.spec.ts`
Se o teste verificava rótulo `Dom` na 1ª linha, trocar para `Seg`. Rodar até PASS.

- [ ] **Step 4: Commit**

```bash
git add src/views/reportsV2/components/primitives/Heatmap.vue src/views/reportsV2/utils/heatmap.ts src/views/reportsV2/components/primitives/__tests__/Heatmap.spec.ts
git commit -m "fix(reports-v2): heatmap rotula dias com 0=segunda (contrato)"
```

---

## Task 5: Selo "dados de exemplo" no ReportSection

**Files:**
- Modify: `src/views/reportsV2/components/shared/ReportSection.vue`

- [ ] **Step 1: Adicionar prop `mock` + badge no header**

Substituir o conteúdo de `ReportSection.vue` por:

```vue
<template>
  <section class="flex flex-col gap-3 rounded-cf-xl border border-border bg-card p-4">
    <header class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <h3 class="typo-body-14-semibold text-foreground">{{ title }}</h3>
        <Badge v-if="mock" variant="outline" class="text-muted-foreground">
          Dados de exemplo
        </Badge>
      </div>
      <slot name="actions" />
    </header>

    <ReportSkeleton v-if="loading" />
    <p
      v-else-if="error"
      class="typo-body-12-regular text-destructive py-6 text-center"
    >
      Não foi possível carregar estes dados.
    </p>
    <p
      v-else-if="empty"
      class="typo-body-12-regular text-muted-foreground py-6 text-center"
    >
      Nenhum dado para o período selecionado.
    </p>
    <slot v-else />
  </section>
</template>

<script setup lang="ts">
import ReportSkeleton from './ReportSkeleton.vue'
import { Badge } from '@/components/ui/badge'

defineProps<{
  title: string
  loading?: boolean
  error?: unknown
  empty?: boolean
  mock?: boolean
}>()
</script>
```

> Nota: confirmar o caminho/named export do `Badge` em `src/components/ui/badge` (export nomeado `Badge`). Se a variante `outline` não existir, usar a variante padrão do componente.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/views/reportsV2/components/shared/ReportSection.vue
git commit -m "feat(reports-v2): ReportSection com selo 'Dados de exemplo'"
```

---

## Task 6: Composable `useDefaultPipeline`

**Files:**
- Create: `src/views/reportsV2/composables/useDefaultPipeline.ts`

> Espelha `Kanban.vue:952-973`: lista kanbans via `KanbanService.list()` (`GET /accounts/kanbans` → `[{ id, name }]`); seleção inicial = `authStore.getLastKanbanSelectedId` se existir, senão o 1º; ao trocar, persiste com `authStore.setLastKanbanSelectedId(id)`.

- [ ] **Step 1: Criar o composable**

```ts
// src/views/reportsV2/composables/useDefaultPipeline.ts
import { ref, onMounted } from 'vue'
import KanbanService from '@services/KanbanService'
import { useAuthStore } from '@/stores/auth'

export interface PipelineOption {
  id: string
  name: string
}

// Resolve o pipelineId real para o funil (pipelineId === kanbanId).
export function useDefaultPipeline() {
  const authStore = useAuthStore()
  const pipelines = ref<PipelineOption[]>([])
  const selectedPipelineId = ref<string>('')
  const loading = ref(true)

  function select(id: string): void {
    selectedPipelineId.value = id
    authStore.setLastKanbanSelectedId(id)
  }

  onMounted(async () => {
    loading.value = true
    try {
      const res = await KanbanService.list()
      pipelines.value = (res.data ?? []).map((k: { id: string; name: string }) => ({
        id: k.id,
        name: k.name
      }))
      if (pipelines.value.length > 0) {
        const last = authStore.getLastKanbanSelectedId
        const exists = last && pipelines.value.some((p) => p.id === last)
        select(exists ? (last as string) : pipelines.value[0].id)
      }
    } finally {
      loading.value = false
    }
  })

  return { pipelines, selectedPipelineId, loading, select }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: sem erros. (`KanbanService` é default export `.js`; `useAuthStore` de `@/stores/auth`.)

- [ ] **Step 3: Commit**

```bash
git add src/views/reportsV2/composables/useDefaultPipeline.ts
git commit -m "feat(reports-v2): composable de pipeline real (lastKanban -> 1o da lista)"
```

---

## Task 7: Componente `AgingChart.vue`

**Files:**
- Create: `src/views/reportsV2/components/primitives/AgingChart.vue`
- Test: `src/views/reportsV2/components/primitives/__tests__/AgingChart.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/views/reportsV2/components/primitives/__tests__/AgingChart.spec.ts
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/vue'
import AgingChart from '../AgingChart.vue'
import type { AgingData } from '@chatfunnel/contracts'

const data: AgingData = {
  buckets: [
    { label: '<3d', range: [0, 3], count: 12 },
    { label: '3–7d', range: [3, 7], count: 7 },
    { label: '7–15d', range: [7, 15], count: 4 },
    { label: '>15d', range: [15, null], count: 2 }
  ]
}

describe('AgingChart', () => {
  it('renderiza uma linha por faixa com label e contagem', () => {
    render(AgingChart, { props: { data } })
    expect(screen.getByText('<3d')).toBeTruthy()
    expect(screen.getByText('>15d')).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/views/reportsV2/components/primitives/__tests__/AgingChart.spec.ts`
Expected: FAIL — "Failed to resolve import '../AgingChart.vue'".

- [ ] **Step 3: Criar o componente**

```vue
<!-- src/views/reportsV2/components/primitives/AgingChart.vue -->
<template>
  <ul class="flex flex-col gap-3">
    <li v-for="bucket in data.buckets" :key="bucket.label" class="flex flex-col gap-1">
      <div class="flex items-center justify-between gap-3">
        <span class="typo-body-12-semibold text-foreground">{{ bucket.label }}</span>
        <span class="typo-body-12-semibold font-mono tabular-nums text-muted-foreground">
          {{ bucket.count }}
        </span>
      </div>
      <div class="h-2 rounded-full bg-muted">
        <div
          class="h-2 rounded-full bg-brand-500"
          :style="{ width: `${barWidth(bucket.count)}%` }"
        />
      </div>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AgingData } from '@chatfunnel/contracts'

const props = defineProps<{ data: AgingData }>()

const maxCount = computed(() =>
  Math.max(...props.data.buckets.map((b) => b.count), 0)
)

function barWidth(count: number): number {
  if (maxCount.value <= 0) return 0
  return Math.max(4, (count / maxCount.value) * 100)
}
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/views/reportsV2/components/primitives/__tests__/AgingChart.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/reportsV2/components/primitives/AgingChart.vue src/views/reportsV2/components/primitives/__tests__/AgingChart.spec.ts
git commit -m "feat(reports-v2): componente AgingChart (barras por faixa)"
```

---

## Task 8: Aba Geral — leads/heatmap reais + feed com "Carregar mais" + selo no grid

**Files:**
- Modify: `src/views/reportsV2/tabs/GeralTab.vue`

> `getLeadsSeries`/`getActivityHeatmap` já passaram a ser reais no service (Task 2) — o `GeralTab` não precisa mudar nessas duas chamadas. As mudanças são: (a) selo no grid "Visão geral", (b) nova seção de feed paginado.

- [ ] **Step 1: Substituir o GeralTab.vue**

```vue
<!-- src/views/reportsV2/tabs/GeralTab.vue -->
<template>
  <div class="flex flex-col gap-4">
    <ReportSection
      title="Visão geral"
      mock
      :loading="overview.loading.value"
      :error="overview.error.value"
      :empty="!!overview.data.value && Object.keys(overview.data.value.cards).length === 0"
    >
      <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        <MetricCard
          v-for="(metric, key) in overview.data.value!.cards"
          :key="key"
          :label="key"
          :metric="metric"
        />
      </div>
    </ReportSection>

    <ReportSection
      title="Entrada de leads"
      :loading="leads.loading.value"
      :error="leads.error.value"
      :empty="!!leads.data.value && leads.data.value.series.length === 0"
    >
      <TimeSeriesChart :data="leads.data.value!" label="Leads" />
    </ReportSection>

    <ReportSection
      title="Atividade por horário"
      :loading="heatmap.loading.value"
      :error="heatmap.error.value"
      :empty="!!heatmap.data.value && heatmap.data.value.cells.length === 0"
    >
      <Heatmap :data="heatmap.data.value!" />
    </ReportSection>

    <ReportSection
      title="Últimos eventos"
      :loading="feed.loading.value"
      :error="feed.error.value"
      :empty="feedItems.length === 0 && !feed.loading.value"
    >
      <div class="flex flex-col gap-3">
        <EventFeed :feed="{ items: feedItems, hasMore: feedHasMore, nextCursor: feedCursor }" />
        <button
          v-if="feedHasMore"
          type="button"
          class="typo-body-12-semibold self-center rounded-cf-lg border border-border px-4 py-2 text-foreground hover:bg-muted"
          :disabled="feed.loading.value"
          @click="loadMoreFeed"
        >
          Carregar mais
        </button>
      </div>
    </ReportSection>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, toRef, watch } from 'vue'
import type { EventFeedItem } from '@chatfunnel/contracts'
import { ReportsV2Service } from '@services/index'
import { useReportsFilters } from '../composables/useReportsFilters'
import { useReportQuery } from '../composables/useReportQuery'
import ReportSection from '../components/shared/ReportSection.vue'
import MetricCard from '../components/primitives/MetricCard.vue'
import TimeSeriesChart from '../components/primitives/TimeSeriesChart.vue'
import Heatmap from '../components/primitives/Heatmap.vue'
import EventFeed from '../components/primitives/EventFeed.vue'

const { filters } = useReportsFilters()

const overview = useReportQuery(() => ReportsV2Service.getDashboardOverview({ ...filters }))
const leads = useReportQuery(() => ReportsV2Service.getLeadsSeries({ ...filters }))
const heatmap = useReportQuery(() => ReportsV2Service.getActivityHeatmap({ ...filters }))

const FEED_LIMIT = 20
const feedItems = ref<EventFeedItem[]>([])
const feedHasMore = ref(false)
const feedCursor = ref<string | undefined>(undefined)

// Primeira página do feed (reseta o acumulado).
const feed = useReportQuery(async () => {
  const page = await ReportsV2Service.getEventFeed({ ...filters }, { limit: FEED_LIMIT })
  feedItems.value = page.items
  feedHasMore.value = page.hasMore
  feedCursor.value = page.nextCursor
  return page
})

async function loadMoreFeed(): Promise<void> {
  if (!feedHasMore.value || !feedCursor.value) return
  const page = await ReportsV2Service.getEventFeed(
    { ...filters },
    { limit: FEED_LIMIT, cursor: feedCursor.value }
  )
  feedItems.value = [...feedItems.value, ...page.items]
  feedHasMore.value = page.hasMore
  feedCursor.value = page.nextCursor
}

function reloadAll(): void {
  overview.execute()
  leads.execute()
  heatmap.execute()
  feed.execute()
}

onMounted(reloadAll)
watch(toRef(filters, 'initialDate'), reloadAll)
watch(toRef(filters, 'finalDate'), reloadAll)
</script>
```

- [ ] **Step 2: Typecheck + smoke**

Run: `npm run typecheck`
Expected: sem erros. Conferir no dev server que o grid "Visão geral" mostra o selo "Dados de exemplo" e o feed mostra "Carregar mais" quando há `hasMore`.

- [ ] **Step 3: Commit**

```bash
git add src/views/reportsV2/tabs/GeralTab.vue
git commit -m "feat(reports-v2): Geral com feed paginado real + selo no grid mock"
```

---

## Task 9: Aba Funil — funil/loss reais + pipeline real + Receita + Aging + selos

**Files:**
- Modify: `src/views/reportsV2/tabs/FunilTab.vue`

- [ ] **Step 1: Substituir o FunilTab.vue**

```vue
<!-- src/views/reportsV2/tabs/FunilTab.vue -->
<template>
  <div class="flex flex-col gap-4">
    <ReportSection
      title="Resumo do funil"
      mock
      :loading="overview.loading.value"
      :error="overview.error.value"
      :empty="!!overview.data.value && Object.keys(overview.data.value.cards).length === 0"
    >
      <div class="mb-1 flex flex-wrap items-center justify-between gap-3 rounded-cf-lg border border-border bg-muted/40 px-3 py-2">
        <div class="flex flex-col">
          <span class="typo-body-12-semibold text-foreground">Pipeline analisado</span>
          <span class="typo-body-10-regular text-muted-foreground">
            Troque o funil para atualizar todos os indicadores abaixo.
          </span>
        </div>
        <select
          class="typo-body-13-semibold min-w-56 rounded-cf-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-brand-500"
          :value="selectedPipelineId"
          @change="onPipelineChange"
        >
          <option v-for="p in pipelines" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </div>

      <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        <MetricCard
          v-for="(metric, key) in overview.data.value!.cards"
          :key="key"
          :label="key"
          :metric="metric"
        />
      </div>
    </ReportSection>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,auto)]">
      <ReportSection
        title="Receita ganha"
        :loading="revenue.loading.value"
        :error="revenue.error.value"
        :empty="false"
      >
        <MetricCard label="Receita ganha" :metric="revenue.data.value!" />
      </ReportSection>

      <ReportSection
        title="Oportunidades paradas"
        :loading="aging.loading.value"
        :error="aging.error.value"
        :empty="!!aging.data.value && aging.data.value.buckets.length === 0"
      >
        <AgingChart :data="aging.data.value!" />
      </ReportSection>
    </div>

    <ReportSection
      title="Conversao por etapa"
      :loading="funnel.loading.value"
      :error="funnel.error.value"
      :empty="!!funnel.data.value && funnel.data.value.stages.length === 0"
    >
      <template #actions>
        <div class="flex rounded-cf-lg border border-border p-0.5">
          <button
            type="button"
            class="typo-body-12-semibold rounded-cf-md px-3 py-1"
            :class="mode === 'absolute' ? 'bg-brand-500 text-white' : 'text-muted-foreground'"
            @click="mode = 'absolute'"
          >
            Absoluto
          </button>
          <button
            type="button"
            class="typo-body-12-semibold rounded-cf-md px-3 py-1"
            :class="mode === 'relative' ? 'bg-brand-500 text-white' : 'text-muted-foreground'"
            @click="mode = 'relative'"
          >
            Relativo
          </button>
        </div>
      </template>

      <FunnelChart :data="funnel.data.value!" :mode="mode" />
    </ReportSection>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
      <ReportSection
        title="Etapas"
        mock
        :loading="stageCounts.loading.value"
        :error="stageCounts.error.value"
        :empty="!!stageCounts.data.value && stageCounts.data.value.rows.length === 0"
      >
        <ComparisonTable :table="stageCounts.data.value!" />
      </ReportSection>

      <ReportSection
        title="Motivos de perda"
        :loading="lossReasons.loading.value"
        :error="lossReasons.error.value"
        :empty="!!lossReasons.data.value && lossReasons.data.value.entries.length === 0"
      >
        <ul class="flex flex-col gap-3">
          <li
            v-for="entry in lossReasons.data.value!.entries"
            :key="entry.id"
            class="flex flex-col gap-1"
          >
            <div class="flex items-center justify-between gap-3">
              <span class="typo-body-12-semibold truncate text-foreground">{{ entry.label }}</span>
              <span class="typo-body-12-semibold font-mono tabular-nums text-muted-foreground">
                {{ entry.value }}
              </span>
            </div>
            <div class="h-2 rounded-full bg-muted">
              <div
                class="h-2 rounded-full bg-brand-500"
                :style="{ width: `${lossReasonWidth(entry.value)}%` }"
              />
            </div>
          </li>
        </ul>
      </ReportSection>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, toRef, watch } from 'vue'
import { ReportsV2Service } from '@services/index'
import type { FunnelMode } from '../types/reportsV2.ui'
import { useReportsFilters } from '../composables/useReportsFilters'
import { useReportQuery } from '../composables/useReportQuery'
import { useDefaultPipeline } from '../composables/useDefaultPipeline'
import ReportSection from '../components/shared/ReportSection.vue'
import MetricCard from '../components/primitives/MetricCard.vue'
import FunnelChart from '../components/primitives/FunnelChart.vue'
import ComparisonTable from '../components/primitives/ComparisonTable.vue'
import AgingChart from '../components/primitives/AgingChart.vue'

const { filters, setFilters } = useReportsFilters()
const { pipelines, selectedPipelineId, select } = useDefaultPipeline()
const mode = ref<FunnelMode>('absolute')

function withPipeline() {
  return { ...filters, pipelineId: selectedPipelineId.value }
}

const overview = useReportQuery(() => ReportsV2Service.getFunnelOverview(withPipeline()))
const funnel = useReportQuery(() => ReportsV2Service.getFunnel(withPipeline()))
const stageCounts = useReportQuery(() => ReportsV2Service.getFunnelStageCounts(withPipeline()))
const lossReasons = useReportQuery(() => ReportsV2Service.getFunnelLossReasons(withPipeline()))
const revenue = useReportQuery(() => ReportsV2Service.getRevenueCard(withPipeline()))
const aging = useReportQuery(() => ReportsV2Service.getAging(withPipeline()))

const maxLossReason = computed(() =>
  Math.max(...(lossReasons.data.value?.entries.map((entry) => entry.value) ?? []), 0)
)
function lossReasonWidth(value: number): number {
  if (maxLossReason.value <= 0) return 0
  return Math.max(4, (value / maxLossReason.value) * 100)
}

function onPipelineChange(event: Event): void {
  const id = (event.target as HTMLSelectElement).value
  select(id)
  setFilters({ pipelineId: id })
}

function reloadAll(): void {
  overview.execute()
  funnel.execute()
  stageCounts.execute()
  lossReasons.execute()
  revenue.execute()
  aging.execute()
}

watch(toRef(filters, 'initialDate'), reloadAll)
watch(toRef(filters, 'finalDate'), reloadAll)
watch(selectedPipelineId, reloadAll)
onMounted(reloadAll)
</script>
```

> Nota: o `select` do pipeline atualiza `selectedPipelineId` (composable) e dispara `reloadAll` via `watch(selectedPipelineId, ...)`. O `setFilters({ pipelineId })` mantém a querystring em sincronia (deep-link). O `reloadAll` do `onMounted` roda com `selectedPipelineId` ainda vazio na 1ª carga; quando o composable resolve o pipeline (async), o `watch(selectedPipelineId)` dispara o reload com o id correto.

- [ ] **Step 2: Typecheck + smoke**

Run: `npm run typecheck`
Expected: sem erros. No dev server: trocar o `<select>` recarrega funil/loss/receita/aging; "Resumo do funil" e "Etapas" com selo "Dados de exemplo"; Receita em R$ (÷100).

- [ ] **Step 3: Commit**

```bash
git add src/views/reportsV2/tabs/FunilTab.vue
git commit -m "feat(reports-v2): Funil com dados reais + pipeline real + Receita + Aging"
```

---

## Task 10: Limpeza de mocks órfãos e verificação final

**Files:**
- Modify: `src/views/reportsV2/mocks/dashboard.mocks.ts`
- Modify: `src/views/reportsV2/mocks/funnel.mocks.ts`

- [ ] **Step 1: Remover mocks não mais referenciados**

Após Tasks 2/8/9, ficam em uso: `mockDashboard`, `mockFunnelOverview`, `mockFunnelStageTable`, `withMockLatency`. Remover de `dashboard.mocks.ts`: `mockLeadsSeries`, `mockActivityHeatmap`, `mockEventFeed` (agora reais). Remover de `funnel.mocks.ts`: `mockFunnelData`, `mockFunnelLossReasons`, `mockPipelineOptions` (pipeline agora é real).

Antes de remover cada export, confirmar que não há mais import:

Run: `npx vitest run` e `npm run typecheck` após cada remoção; se quebrar, o export ainda é usado — restaurar.

- [ ] **Step 2: Suite completa**

Run: `npm test`
Expected: todos os specs de `reportsV2` PASS.

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/views/reportsV2/mocks/
git commit -m "chore(reports-v2): remove mocks orfaos apos integracao real"
```

---

## Self-Review (preenchido)

- **Cobertura do spec:** §3.1 service → Task 2; §3.2 params → Task 1; §3.3 convenções → Tasks 3+4; §3.4 Geral → Task 8; §3.5 Funil+Receita+Aging → Tasks 7+9; §3.6 AgingChart → Task 7; §3.7 selo → Task 5; §3.8 paginação → Task 8; §3.9 pipeline real → Tasks 6+9. ✓
- **Pontos a confirmar pelo executor (verificações de integração, não placeholders):** caminho/variantes do `Badge` (Task 5); array de rótulos de dia no `Heatmap.vue` (Task 4); nomes exatos dos exports de mock a remover (Task 10).
- **Consistência de tipos:** `buildReportParams(endpoint, filters, overrides?)` idêntico Task 1 ↔ 2; `getEventFeed(filters, overrides)`, `getRevenueCard`, `getAging` consistentes Task 2 ↔ 8/9; `useDefaultPipeline` retorna `{ pipelines, selectedPipelineId, loading, select }`, usado igual na Task 9.

## Riscos conhecidos
- **Deploy da branch `feature/reports`** no ambiente services :3200 (confirmado pelo usuário que as branches estão certas).
- **`empty` da Receita:** `MetricCard` sempre tem `value` numérico; usamos `:empty="false"`. Se o back puder devolver receita "vazia", tratar conforme contrato na execução.
