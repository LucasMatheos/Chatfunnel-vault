# Relatórios V2 — Novos Relatórios (Front) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar no `chatfunnel-front` os 11 novos relatórios de Relatórios V2 (5 de CRM + 6 de Contatos/Leads) descritos em `docs/superpowers/plans/reports-v2/RELATORIOS-V2-NOVOS-RELATORIOS.md`, reusando os payloads já existentes em `@chatfunnel/contracts` e seguindo os padrões da feature `views/reportsV2`.

**Architecture:** Faseamento **por primitive → telas**. Fatia 1 constrói a infraestrutura reusável (helpers de formatação, primitive `RankingList`, primitive `SegmentedTimeSeriesChart`, whitelist de params e métodos de service) com testes unitários. Fatia 2 conecta os 5 relatórios de CRM nas abas existentes (Funil + card de previsão na Geral). Fatia 3 cria a nova aba **Contatos / Leads** e conecta os 6 relatórios de contatos. Cada relatório usa o componente `ReportSection` (loading/erro/empty/skeleton) + `useReportQuery`, exatamente como os 7 relatórios já integrados.

**Tech Stack:** Vue 3.5 `<script setup lang="ts">`, Tailwind v4 (tokens de **escala** — `bg-gray-100`, `text-gray-1000`, `bg-brand-500`, `text-green-500`, `text-red-500` — nunca semânticos), shadcn-vue, Chart.js + vue-chartjs, Axios via `NestApi`, Vitest + `@vue/test-utils`.

---

## Decisões fechadas (input do usuário)

1. **Escala monetária:** `crm.revenue`, `crm.performance-by-seller` e `crm.revenue-forecast` chegam como `amount` cru (Int = centavos). O front **divide por 100** na borda do service (mesmo tratamento já aplicado em `getRevenueCard`). Centralizado num helper `centavosToReais`.
2. **`crm.performance-by-seller`:** receita por vendedor é **visível para todos** os usuários com acesso a Relatórios — **sem** gate por papel nesta entrega.
3. **Faseamento:** por primitive (infra → telas CRM → aba Contatos).
4. **`crm.revenue-forecast` — onde renderizar (decisão 2026-06-10):** o card aparece em **dois lugares com semânticas distintas**, porque `pipelineId` **não** é filtro global (vive no FunilTab via `useDefaultPipeline`/`authStore.lastKanbanSelectedId`; a `ReportsFilterBar` só tem período/origem/UTM):
   - **Funil** → forecast **do pipeline selecionado** (envia `filters.pipelineId`). Subtítulo: "Pipeline analisado".
   - **Geral** → forecast **consolidado de todos os funis** (envia **sem** `pipelineId`). Subtítulo: "Todos os funis · estado atual". Como a Geral não tem seletor de pipeline, mostrar o forecast de um pipeline específico ali seria ambíguo.
   - **Validado no backend** (`chatfunnel-core/src/repositories/reports/crm-reports.repository.ts:32-37`): a query do forecast aplica o filtro de pipeline só quando `pipelineId` existe (`: Prisma.empty` caso contrário) → omitir agrega todos os funis da conta, sem erro. (Diferente de `crm/funnel`, que exige `pipelineId`.)

## Premissas e gotchas

- **Sem mudança em `@chatfunnel/contracts`:** os 4 payloads (`SegmentedTimeSeries`, `AgingData`, `Ranking`, `MetricCard`) já existem. Não tocar o contracts.
- **`ValidationPipe` estrito:** o NestJS rejeita query param fora da whitelist com `400`. Toda rota nova precisa de uma entrada em `ENDPOINT_OPTIONAL`. UTM/origin nunca são enviados.
- **`granularity` de `crm.revenue`:** não será enviada nesta entrega — o backend aplica o default automático (≤31d→day, ≤120d→week, senão month). Seletor de granularidade fica como follow-up.
- **Relatórios "snapshot"** (`crm.revenue-forecast`, `contacts.inactivity`): ignoram o período no cálculo. A UI **não** deve dizer "no período X" nesses blocos; usar subtítulo "Estado atual".
- **`crm.stage-time`:** `value` = tempo médio em **dias (float)**, ordenado pela posição do funil (não re-ordenar no front). `MetricFormat` do contracts não tem `"days"`, então a formatação de dias é local (`formatDays`), fora do enum.
- **`Ranking.meta`:** só `crm.performance-by-seller` usa (`{won, lost, winRate}`); `winRate` é fração `0..1` ou `null`. Tratar `meta` como `unknown` nos demais.
- **SFC order:** `<template>` → `<script>` → `<style>`. Sem `<style scoped>` para layout. Strings user-facing em pt-BR acentuado.

## Cobertura do spec (rastreabilidade)

| Relatório (doc) | Payload | Primitive de render | Fatia/Task |
|---|---|---|---|
| `crm.revenue` | `SegmentedTimeSeries` | `SegmentedTimeSeriesChart` (novo) | F1 T4 · F2 T8 |
| `crm.sales-velocity` | `AgingData` | `AgingChart` (existe) | F2 T8 |
| `crm.stage-time` | `Ranking` | `RankingList` (novo, `days`) | F1 T3 · F2 T8 |
| `crm.performance-by-seller` | `Ranking`+`meta` | `ComparisonTable` (existe, +prop) | F2 T7 · T8 |
| `crm.revenue-forecast` | `MetricCard` | `MetricCard` (existe) | F2 T8 (Funil, por pipeline) · T9 (Geral, consolidado) |
| `contacts.by-channel` | `Ranking` | `RankingList` | F3 T11 |
| `contacts.by-tag` | `Ranking` | `RankingList` | F3 T11 |
| `contacts.inactivity` | `AgingData` | `AgingChart` | F3 T11 |
| `contacts.utm-source/medium/campaign` | `Ranking` | `RankingList` | F3 T11 |

## File Structure

**Criar:**
- `src/views/reportsV2/components/primitives/RankingList.vue` — lista de ranking reutilizável (barras + valor formatado), ordem preservada.
- `src/views/reportsV2/components/primitives/__tests__/RankingList.spec.ts`
- `src/views/reportsV2/components/primitives/SegmentedTimeSeriesChart.vue` — linha multi-série (Chart.js).
- `src/views/reportsV2/components/primitives/__tests__/SegmentedTimeSeriesChart.spec.ts`
- `src/views/reportsV2/tabs/ContatosTab.vue` — nova aba Contatos/Leads.

**Modificar:**
- `src/views/reportsV2/utils/format.ts` — `formatDays`.
- `src/views/reportsV2/utils/__tests__/format.spec.ts` — testes de `formatDays`.
- `src/views/reportsV2/charts/chart.config.ts` — `getGreenColor`, `getRedColor`.
- `src/views/reportsV2/composables/useReportsFilters.helpers.ts` — `ReportEndpoint` + `ENDPOINT_OPTIONAL` (11 rotas).
- `src/views/reportsV2/composables/__tests__/useReportsFilters.helpers.spec.ts` — testes das novas rotas.
- `src/common/services/ReportsV2Service.ts` — `centavosToReais` + 11 métodos.
- `src/views/reportsV2/components/primitives/ComparisonTable.vue` — prop `firstColumnLabel`.
- `src/views/reportsV2/tabs/FunilTab.vue` — 4 seções CRM novas + refactor loss-reasons para `RankingList`.
- `src/views/reportsV2/tabs/GeralTab.vue` — card `crm.revenue-forecast`.
- `src/views/reportsV2/ReportsV2View.vue` — aba "Contatos / Leads" no `TABS`.
- `src/views/reportsV2/types/reportsV2.ui.ts` — `TabKey` += `"contatos"`.
- `src/views/reportsV2/routes.ts` — rota `contatos`.

---

# FATIA 1 — Infraestrutura (primitives, helpers, service)

### Task 1: `formatDays` em format.ts

**Files:**
- Modify: `src/views/reportsV2/utils/format.ts`
- Test: `src/views/reportsV2/utils/__tests__/format.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `format.spec.ts` (manter os imports existentes; importar `formatDays`):

```ts
import { formatDays } from '../format'

describe('formatDays', () => {
  it('singular para 1 dia', () => {
    expect(formatDays(1)).toBe('1 dia')
  })
  it('plural com 1 casa decimal (pt-BR)', () => {
    expect(formatDays(3.42)).toBe('3,4 dias')
  })
  it('zero é plural', () => {
    expect(formatDays(0)).toBe('0 dias')
  })
  it('fração arredonda para 1 casa', () => {
    expect(formatDays(0.55)).toBe('0,6 dia')
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm test -- src/views/reportsV2/utils/__tests__/format.spec.ts`
Expected: FAIL — `formatDays is not a function`.

- [ ] **Step 3: Implementar**

Adicionar em `src/views/reportsV2/utils/format.ts`:

```ts
const df = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

// Tempo em dias (float) — usado por rankings de "tempo médio por etapa".
// MetricFormat do contracts nao possui "days"; por isso fica fora do enum.
export function formatDays(days: number): string {
  const rounded = Math.round(days * 10) / 10;
  const unit = rounded === 1 ? "dia" : "dias";
  return `${df.format(rounded)} ${unit}`;
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npm test -- src/views/reportsV2/utils/__tests__/format.spec.ts`
Expected: PASS.

---

### Task 2: Cores de segmento em chart.config.ts

**Files:**
- Modify: `src/views/reportsV2/charts/chart.config.ts`

> Sem teste unitário dedicado: `getGreenColor`/`getRedColor` apenas leem token CSS (mesma forma de `getBrandColor`, que também não tem teste isolado). São cobertas indiretamente pelo `SegmentedTimeSeriesChart.spec.ts` (Task 4).

- [ ] **Step 1: Implementar**

Adicionar em `src/views/reportsV2/charts/chart.config.ts`, logo após `getInkColor`:

```ts
// Verde de sucesso (--color-green-500) — usado p/ segmento WON.
export function getGreenColor(): string {
  return readToken("--color-green-500", "#2BA471");
}

// Vermelho de erro (--color-red-500) — usado p/ segmento LOST.
export function getRedColor(): string {
  return readToken("--color-red-500", "#E5484D");
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run typecheck`
Expected: sem erros novos.

---

### Task 3: Primitive `RankingList`

**Files:**
- Create: `src/views/reportsV2/components/primitives/RankingList.vue`
- Test: `src/views/reportsV2/components/primitives/__tests__/RankingList.spec.ts`

Componente de lista de ranking reutilizável. Renderiza `entries` **na ordem recebida** (não re-ordena — `crm.stage-time` depende da ordem do funil), cada item com label, valor formatado (`number`/`currency`/`days`/`percentage`) e barra proporcional ao maior `value`. Generaliza o bloco inline de "Motivos de perda" hoje no `FunilTab`.

- [ ] **Step 1: Escrever o teste que falha**

`src/views/reportsV2/components/primitives/__tests__/RankingList.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import RankingList from "../RankingList.vue";
import type { RankingEntry } from "@chatfunnel/contracts";

const entries: RankingEntry[] = [
  { id: "a", label: "Instagram", value: 120 },
  { id: "b", label: "WhatsApp", value: 60 },
];

describe("RankingList", () => {
  it("renderiza labels na ordem recebida", () => {
    const w = mount(RankingList, { props: { entries } });
    const text = w.text();
    expect(text.indexOf("Instagram")).toBeLessThan(text.indexOf("WhatsApp"));
  });

  it("formata valor como número por padrão", () => {
    const w = mount(RankingList, { props: { entries } });
    expect(w.text()).toContain("120");
  });

  it("formata valor como moeda quando valueFormat=currency", () => {
    const w = mount(RankingList, {
      props: { entries: [{ id: "x", label: "Vendas", value: 1500 }], valueFormat: "currency" },
    });
    expect(w.text()).toContain("R$");
  });

  it("formata valor como dias quando valueFormat=days", () => {
    const w = mount(RankingList, {
      props: { entries: [{ id: "x", label: "Qualificação", value: 3.4 }], valueFormat: "days" },
    });
    expect(w.text()).toContain("3,4 dias");
  });

  it("barra do maior valor ocupa 100% e do menor é proporcional", () => {
    const w = mount(RankingList, { props: { entries } });
    const bars = w.findAll("[data-ranking-bar]");
    expect(bars[0].attributes("style")).toContain("width: 100%");
    expect(bars[1].attributes("style")).toContain("width: 50%");
  });

  it("não quebra com lista vazia", () => {
    const w = mount(RankingList, { props: { entries: [] } });
    expect(w.findAll("li")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/views/reportsV2/components/primitives/__tests__/RankingList.spec.ts`
Expected: FAIL — não encontra `RankingList.vue`.

- [ ] **Step 3: Implementar o componente**

`src/views/reportsV2/components/primitives/RankingList.vue`:

```vue
<template>
  <ul class="flex flex-col gap-3">
    <li
      v-for="entry in entries"
      :key="entry.id"
      class="flex flex-col gap-1"
    >
      <div class="flex items-center justify-between gap-3">
        <span class="typo-body-12-semibold truncate text-gray-1000">{{ entry.label }}</span>
        <span class="typo-body-12-semibold font-mono tabular-nums text-gray-700">
          {{ formatValue(entry.value) }}
        </span>
      </div>
      <div class="h-2 rounded-full bg-gray-300">
        <div
          data-ranking-bar
          class="h-2 rounded-full bg-brand-500"
          :style="{ width: `${barWidth(entry.value)}%` }"
        />
      </div>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RankingEntry } from '@chatfunnel/contracts'
import { formatMetricValue, formatDays } from '../../utils/format'

type RankingValueFormat = 'number' | 'currency' | 'percentage' | 'days'

const props = withDefaults(
  defineProps<{ entries: RankingEntry[]; valueFormat?: RankingValueFormat }>(),
  { valueFormat: 'number' }
)

const max = computed(() =>
  Math.max(...props.entries.map((e) => e.value), 0)
)

function barWidth(value: number): number {
  if (max.value <= 0) return 0
  return Math.max(4, (value / max.value) * 100)
}

function formatValue(value: number): string {
  if (props.valueFormat === 'days') return formatDays(value)
  return formatMetricValue(value, props.valueFormat)
}
</script>
```

> Nota: o teste de barra espera exatamente `width: 100%` e `width: 50%`. Para `value=120` (max) → `(120/120)*100 = 100`; para `value=60` → `(60/120)*100 = 50`. `Math.max(4, ...)` não interfere nesses casos.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/views/reportsV2/components/primitives/__tests__/RankingList.spec.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Refatorar "Motivos de perda" no FunilTab para usar RankingList (DRY)**

Em `src/views/reportsV2/tabs/FunilTab.vue`, **substituir** o `<ul>…</ul>` inline da seção "Motivos de perda" (linhas ~101-120) por:

```vue
<RankingList :entries="lossReasons.data.value!.entries" />
```

Adicionar o import no `<script setup>`:

```ts
import RankingList from '../components/primitives/RankingList.vue'
```

Remover o código agora morto: `maxLossReason` (computed) e `lossReasonWidth` (function).

- [ ] **Step 6: Rodar a suíte do FunilTab e typecheck**

Run: `npm test -- src/views/reportsV2/tabs/__tests__/FunilTab.spec.ts && npm run typecheck`
Expected: PASS, sem erros de tipo.

---

### Task 4: Primitive `SegmentedTimeSeriesChart`

**Files:**
- Create: `src/views/reportsV2/components/primitives/SegmentedTimeSeriesChart.vue`
- Test: `src/views/reportsV2/components/primitives/__tests__/SegmentedTimeSeriesChart.spec.ts`

Linha multi-série para `SegmentedTimeSeries`. Uma linha por `segment`. Cores fixas por convenção do doc: `WON`→verde, `LOST`→vermelho; demais segmentos caem no brand. Legenda visível (≠ charts single-série).

- [ ] **Step 1: Escrever o teste que falha**

`src/views/reportsV2/components/primitives/__tests__/SegmentedTimeSeriesChart.spec.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import type { SegmentedTimeSeries } from "@chatfunnel/contracts";

// Stub do componente Line do vue-chartjs: captura as props sem renderizar canvas.
vi.mock("vue-chartjs", () => ({
  Line: {
    name: "Line",
    props: ["data", "options"],
    template: "<div data-chart />",
  },
}));

import SegmentedTimeSeriesChart from "../SegmentedTimeSeriesChart.vue";

const data: SegmentedTimeSeries = {
  granularity: "day",
  segments: [
    { segment: "WON", label: "Ganhos", points: [{ date: "2026-06-01", value: 10 }] },
    { segment: "LOST", label: "Perdidos", points: [{ date: "2026-06-01", value: 4 }] },
  ],
};

describe("SegmentedTimeSeriesChart", () => {
  it("cria um dataset por segmento", () => {
    const w = mount(SegmentedTimeSeriesChart, { props: { data } });
    const line = w.findComponent({ name: "Line" });
    expect(line.props("data").datasets).toHaveLength(2);
  });

  it("usa o label do segmento como label do dataset", () => {
    const w = mount(SegmentedTimeSeriesChart, { props: { data } });
    const labels = w.findComponent({ name: "Line" }).props("data").datasets.map((d: any) => d.label);
    expect(labels).toEqual(["Ganhos", "Perdidos"]);
  });

  it("WON é verde e LOST é vermelho", () => {
    const w = mount(SegmentedTimeSeriesChart, { props: { data } });
    const ds = w.findComponent({ name: "Line" }).props("data").datasets;
    expect(ds[0].borderColor).not.toBe(ds[1].borderColor);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/views/reportsV2/components/primitives/__tests__/SegmentedTimeSeriesChart.spec.ts`
Expected: FAIL — não encontra `SegmentedTimeSeriesChart.vue`.

- [ ] **Step 3: Implementar o componente**

`src/views/reportsV2/components/primitives/SegmentedTimeSeriesChart.vue`:

```vue
<template>
  <div class="relative h-[260px] w-full">
    <Line :data="chartData" :options="options" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import type { ChartData } from 'chart.js'
import type { SegmentedTimeSeries } from '@chatfunnel/contracts'
import {
  getBrandColor,
  getGreenColor,
  getRedColor,
  baseLineOptions
} from '../../charts/chart.config'

const props = defineProps<{ data: SegmentedTimeSeries }>()

// Legenda visível (multi-série) — sobrescreve o baseLineOptions (legend off).
const options = {
  ...baseLineOptions,
  plugins: {
    ...baseLineOptions.plugins,
    legend: { display: true, position: 'bottom' as const }
  }
}

// Cor fixa por convenção do doc; fallback no brand p/ segmentos não mapeados.
function segmentColor(segment: string): string {
  if (segment === 'WON') return getGreenColor()
  if (segment === 'LOST') return getRedColor()
  return getBrandColor()
}

// Une as datas de todos os segmentos (eixo X compartilhado), ordenadas.
const labels = computed(() => {
  const set = new Set<string>()
  for (const seg of props.data.segments) {
    for (const p of seg.points) set.add(p.date)
  }
  return Array.from(set).sort()
})

const chartData = computed<ChartData<'line'>>(() => ({
  labels: labels.value,
  datasets: props.data.segments.map((seg) => {
    const byDate = new Map(seg.points.map((p) => [p.date, p.value]))
    const color = segmentColor(seg.segment)
    return {
      label: seg.label ?? seg.segment,
      data: labels.value.map((d) => byDate.get(d) ?? 0),
      borderColor: color,
      backgroundColor: 'transparent',
      fill: false,
      tension: 0.3,
      pointRadius: 2
    }
  })
}))
</script>
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/views/reportsV2/components/primitives/__tests__/SegmentedTimeSeriesChart.spec.ts`
Expected: PASS (3 testes).

---

### Task 5: Whitelist de params para as 11 rotas novas

**Files:**
- Modify: `src/views/reportsV2/composables/useReportsFilters.helpers.ts`
- Test: `src/views/reportsV2/composables/__tests__/useReportsFilters.helpers.spec.ts`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao `describe("buildReportParams", …)` em `useReportsFilters.helpers.spec.ts`:

```ts
describe("rotas CRM novas — pipelineId opcional, sem channelId/utm", () => {
  const crm = [
    "crm/revenue",
    "crm/sales-velocity",
    "crm/stage-time",
    "crm/performance-by-seller",
    "crm/revenue-forecast",
  ] as const;

  for (const ep of crm) {
    it(`${ep} inclui pipelineId e nunca utm/channel/origin`, () => {
      const p = buildReportParams(ep, baseFilters);
      expect(p["pipelineId"]).toBe("pipe-abc");
      expect(p).not.toHaveProperty("channelId");
      expect(p).not.toHaveProperty("utmSource");
      expect(p).not.toHaveProperty("origin");
    });

    it(`${ep} omite pipelineId quando ausente`, () => {
      const p = buildReportParams(ep, { ...baseFilters, pipelineId: undefined });
      expect(p).not.toHaveProperty("pipelineId");
    });
  }
});

describe("rotas Contatos novas — apenas datas", () => {
  const contacts = [
    "contacts/by-channel",
    "contacts/by-tag",
    "contacts/inactivity",
    "contacts/utm-source",
    "contacts/utm-medium",
    "contacts/utm-campaign",
  ] as const;

  for (const ep of contacts) {
    it(`${ep} contem somente initialDate e finalDate`, () => {
      const p = buildReportParams(ep, baseFilters);
      expect(Object.keys(p).sort()).toEqual(["finalDate", "initialDate"]);
    });
  }
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/views/reportsV2/composables/__tests__/useReportsFilters.helpers.spec.ts`
Expected: FAIL — tipos/rotas inexistentes (erro de TS no `buildReportParams`).

- [ ] **Step 3: Estender o tipo e a whitelist**

Em `useReportsFilters.helpers.ts`, substituir o tipo `ReportEndpoint` por:

```ts
export type ReportEndpoint =
  | "contacts/growth"
  | "contacts/peak-hours"
  | "crm/funnel"
  | "crm/loss-reasons"
  | "crm/revenue-card"
  | "crm/aging"
  | "general/feed"
  // --- CRM (story-12) ---
  | "crm/revenue"
  | "crm/sales-velocity"
  | "crm/stage-time"
  | "crm/performance-by-seller"
  | "crm/revenue-forecast"
  // --- Contatos (story-13) ---
  | "contacts/by-channel"
  | "contacts/by-tag"
  | "contacts/inactivity"
  | "contacts/utm-source"
  | "contacts/utm-medium"
  | "contacts/utm-campaign";
```

E adicionar as entradas ao `ENDPOINT_OPTIONAL` (dentro do objeto existente, antes do `}`):

```ts
  "crm/revenue": ["pipelineId"],
  "crm/sales-velocity": ["pipelineId"],
  "crm/stage-time": ["pipelineId"],
  "crm/performance-by-seller": ["pipelineId"],
  "crm/revenue-forecast": ["pipelineId"],
  "contacts/by-channel": [],
  "contacts/by-tag": [],
  "contacts/inactivity": [],
  "contacts/utm-source": [],
  "contacts/utm-medium": [],
  "contacts/utm-campaign": [],
```

> O segundo overload de `buildReportParams` (`Exclude<ReportEndpoint, "general/feed">`) já cobre as novas rotas automaticamente.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/views/reportsV2/composables/__tests__/useReportsFilters.helpers.spec.ts`
Expected: PASS.

---

### Task 6: Métodos de service para os 11 relatórios

**Files:**
- Modify: `src/common/services/ReportsV2Service.ts`

> Service é a borda HTTP — testes de integração HTTP não existem na feature hoje (os 7 atuais não têm `.spec`). Mantemos o padrão: validação por typecheck + uso nas telas (Fatias 2/3). A normalização de centavos é exercitada visualmente. Não inventar teste de rede aqui.

- [ ] **Step 1: Adicionar o helper de escala monetária**

Em `ReportsV2Service.ts`, logo após a const `REPORTS_V2_BASE`:

```ts
// Backend envia valores monetarios em centavos (Int cru). Normalizamos p/ reais
// na borda do service — mesma regra de getRevenueCard. Ver doc §3 (escala).
function centavosToReais(v: number): number {
  return v / 100;
}
```

- [ ] **Step 2: Adicionar os imports de tipo**

Garantir que o import de `@chatfunnel/contracts` inclua `SegmentedTimeSeries`. O bloco passa a ser:

```ts
import type {
  Dashboard,
  TimeSeries,
  HeatmapData,
  EventFeed,
  FunnelData,
  Ranking,
  MetricCard,
  AgingData,
  SegmentedTimeSeries,
} from "@chatfunnel/contracts";
```

- [ ] **Step 3: Adicionar os 11 métodos**

Inserir dentro do objeto `ReportsV2Service`, após `getAging` (antes do `};` final, adicionando vírgula após o `getAging` existente):

```ts
  // ---- CRM (story-12) ----

  getCrmRevenue: (filters: ReportsFilters): Promise<SegmentedTimeSeries> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/crm/revenue`,
        buildReportParams("crm/revenue", filters)
      ) as Promise<AxiosResponse<SegmentedTimeSeries>>
    ).then((res) => {
      // value = soma de amount cru (centavos) por bucket/segmento → reais.
      const raw = res.data;
      return {
        ...raw,
        segments: raw.segments.map((seg) => ({
          ...seg,
          points: seg.points.map((p) => ({ ...p, value: centavosToReais(p.value) })),
        })),
      };
    }),

  getSalesVelocity: (filters: ReportsFilters): Promise<AgingData> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/crm/sales-velocity`,
        buildReportParams("crm/sales-velocity", filters)
      ) as Promise<AxiosResponse<AgingData>>
    ).then((res) => res.data),

  getStageTime: (filters: ReportsFilters): Promise<Ranking> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/crm/stage-time`,
        buildReportParams("crm/stage-time", filters)
      ) as Promise<AxiosResponse<Ranking>>
    ).then((res) => res.data),

  getPerformanceBySeller: (filters: ReportsFilters): Promise<Ranking> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/crm/performance-by-seller`,
        buildReportParams("crm/performance-by-seller", filters)
      ) as Promise<AxiosResponse<Ranking>>
    ).then((res) => {
      // value = receita WON (centavos) → reais. meta (won/lost/winRate) intacto.
      const raw = res.data;
      return {
        total: centavosToReais(raw.total),
        entries: raw.entries.map((e) => ({ ...e, value: centavosToReais(e.value) })),
      };
    }),

  getRevenueForecast: (filters: ReportsFilters): Promise<MetricCard> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/crm/revenue-forecast`,
        buildReportParams("crm/revenue-forecast", filters)
      ) as Promise<AxiosResponse<MetricCard>>
    ).then((res) => {
      // Snapshot, sem delta. value em centavos → reais; format vem "currency".
      const raw = res.data;
      return { ...raw, value: centavosToReais(raw.value) };
    }),

  // ---- Contatos (story-13) ----

  getContactsByChannel: (filters: ReportsFilters): Promise<Ranking> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/contacts/by-channel`,
        buildReportParams("contacts/by-channel", filters)
      ) as Promise<AxiosResponse<Ranking>>
    ).then((res) => res.data),

  getContactsByTag: (filters: ReportsFilters): Promise<Ranking> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/contacts/by-tag`,
        buildReportParams("contacts/by-tag", filters)
      ) as Promise<AxiosResponse<Ranking>>
    ).then((res) => res.data),

  getContactsInactivity: (filters: ReportsFilters): Promise<AgingData> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/contacts/inactivity`,
        buildReportParams("contacts/inactivity", filters)
      ) as Promise<AxiosResponse<AgingData>>
    ).then((res) => res.data),

  getContactsUtmSource: (filters: ReportsFilters): Promise<Ranking> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/contacts/utm-source`,
        buildReportParams("contacts/utm-source", filters)
      ) as Promise<AxiosResponse<Ranking>>
    ).then((res) => res.data),

  getContactsUtmMedium: (filters: ReportsFilters): Promise<Ranking> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/contacts/utm-medium`,
        buildReportParams("contacts/utm-medium", filters)
      ) as Promise<AxiosResponse<Ranking>>
    ).then((res) => res.data),

  getContactsUtmCampaign: (filters: ReportsFilters): Promise<Ranking> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/contacts/utm-campaign`,
        buildReportParams("contacts/utm-campaign", filters)
      ) as Promise<AxiosResponse<Ranking>>
    ).then((res) => res.data),
```

- [ ] **Step 4: Verificar typecheck**

Run: `npm run typecheck`
Expected: sem erros.

---

# FATIA 2 — Telas CRM (aba Funil + card na Geral)

### Task 7: Prop `firstColumnLabel` no ComparisonTable

**Files:**
- Modify: `src/views/reportsV2/components/primitives/ComparisonTable.vue`
- Test: `src/views/reportsV2/components/primitives/__tests__/ComparisonTable.spec.ts`

`performance-by-seller` vai reusar `ComparisonTable`, mas o header da 1ª coluna é hardcoded "Etapa". Tornar configurável (default mantém "Etapa" → zero regressão nos usos atuais).

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao `ComparisonTable.spec.ts` (manter o que já existe):

```ts
it("usa firstColumnLabel quando fornecido", () => {
  const table = { columns: [{ key: "v", label: "Receita" }], rows: [] };
  const w = mount(ComparisonTable, { props: { table, firstColumnLabel: "Vendedor" } });
  expect(w.text()).toContain("Vendedor");
});

it("default do header da 1a coluna continua 'Etapa'", () => {
  const table = { columns: [{ key: "v", label: "Receita" }], rows: [] };
  const w = mount(ComparisonTable, { props: { table } });
  expect(w.text()).toContain("Etapa");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/views/reportsV2/components/primitives/__tests__/ComparisonTable.spec.ts`
Expected: FAIL — header não muda para "Vendedor".

- [ ] **Step 3: Implementar**

No `<template>`, trocar o `<th>` fixo:

```vue
<th class="typo-body-12-semibold px-3 py-2 text-gray-700">{{ firstColumnLabel }}</th>
```

E no `<script setup>`, trocar o `defineProps`:

```ts
withDefaults(defineProps<{ table: ComparisonTableData; firstColumnLabel?: string }>(), {
  firstColumnLabel: 'Etapa'
})
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/views/reportsV2/components/primitives/__tests__/ComparisonTable.spec.ts`
Expected: PASS.

---

### Task 8: Conectar `crm.revenue`, `sales-velocity`, `stage-time`, `performance-by-seller` no FunilTab

**Files:**
- Modify: `src/views/reportsV2/tabs/FunilTab.vue`

As 4 seções entram **depois** da seção "Oportunidades paradas" (aging). Todas seguem o padrão `useReportQuery` + `ReportSection` e entram no `reloadAll()`. Como o FunilTab já gate-ia por `pipelineId`, herdam o pipeline selecionado.

- [ ] **Step 1: Adicionar os imports e as queries**

No `<script setup>` do `FunilTab.vue`, adicionar imports:

```ts
import SegmentedTimeSeriesChart from '../components/primitives/SegmentedTimeSeriesChart.vue'
import ComparisonTable from '../components/primitives/ComparisonTable.vue'
import type { ComparisonTableData } from '../types/reportsV2.ui'
```

(`ComparisonTable` já é importado hoje para a tabela "Etapas"; não duplicar o import — reaproveitar a linha existente. `AgingChart`, `RankingList`, `MetricCard` já estão importados após Task 3.)

Adicionar as queries junto às existentes:

```ts
const crmRevenue = useReportQuery(() =>
  ReportsV2Service.getCrmRevenue({ ...filters })
)
const salesVelocity = useReportQuery(() =>
  ReportsV2Service.getSalesVelocity({ ...filters })
)
const stageTime = useReportQuery(() =>
  ReportsV2Service.getStageTime({ ...filters })
)
const performanceBySeller = useReportQuery(() =>
  ReportsV2Service.getPerformanceBySeller({ ...filters })
)
// Forecast POR PIPELINE (Funil tem seletor). Herda filters.pipelineId. Ver Decisão 4.
const crmForecast = useReportQuery(() =>
  ReportsV2Service.getRevenueForecast({ ...filters })
)
```

- [ ] **Step 2: Transformar performance-by-seller em ComparisonTableData**

Ainda no `<script setup>`, adicionar o computed (com tipagem do `meta`):

```ts
interface SellerMeta {
  won: number
  lost: number
  winRate: number | null
}

const sellerTable = computed<ComparisonTableData>(() => ({
  columns: [
    { key: 'revenue', label: 'Receita', align: 'right', format: 'currency' },
    { key: 'won', label: 'Ganhos', align: 'right', format: 'number' },
    { key: 'lost', label: 'Perdidos', align: 'right', format: 'number' },
    { key: 'winRate', label: 'Taxa de ganho', align: 'right', format: 'percentage' }
  ],
  rows: (performanceBySeller.data.value?.entries ?? []).map((e) => {
    const m = e.meta as unknown as SellerMeta | undefined
    return {
      id: e.id,
      label: e.label,
      values: {
        revenue: e.value,
        won: m?.won ?? 0,
        lost: m?.lost ?? 0,
        // winRate vem 0..1; ComparisonTable formata "percentage" como `${n}%` → *100.
        winRate: m && m.winRate !== null ? Math.round(m.winRate * 1000) / 10 : null
      }
    }
  })
}))
```

- [ ] **Step 3: Incluir as 4 queries no reloadAll**

Atualizar `reloadAll()`:

```ts
function reloadAll(): void {
  overview.execute()
  funnel.execute()
  stageCounts.execute()
  lossReasons.execute()
  revenue.execute()
  aging.execute()
  crmRevenue.execute()
  salesVelocity.execute()
  stageTime.execute()
  performanceBySeller.execute()
  crmForecast.execute()
}
```

- [ ] **Step 4: Adicionar as 4 seções no template**

Após a `<ReportSection title="Oportunidades paradas">…</ReportSection>` (a do aging), inserir:

```vue
    <ReportSection
      title="Receita no tempo"
      :loading="crmRevenue.loading.value"
      :error="crmRevenue.error.value"
      :empty="!!crmRevenue.data.value && crmRevenue.data.value.segments.length === 0"
    >
      <SegmentedTimeSeriesChart :data="crmRevenue.data.value!" />
    </ReportSection>

    <div class="grid gap-4 xl:grid-cols-2">
      <ReportSection
        title="Velocidade de vendas"
        :loading="salesVelocity.loading.value"
        :error="salesVelocity.error.value"
        :empty="!!salesVelocity.data.value && salesVelocity.data.value.buckets.length === 0"
      >
        <AgingChart :data="salesVelocity.data.value!" />
      </ReportSection>

      <ReportSection
        title="Tempo médio por etapa"
        :loading="stageTime.loading.value"
        :error="stageTime.error.value"
        :empty="!!stageTime.data.value && stageTime.data.value.entries.length === 0"
      >
        <RankingList :entries="stageTime.data.value!.entries" value-format="days" />
      </ReportSection>
    </div>

    <ReportSection
      title="Performance por vendedor"
      :loading="performanceBySeller.loading.value"
      :error="performanceBySeller.error.value"
      :empty="!!performanceBySeller.data.value && performanceBySeller.data.value.entries.length === 0"
    >
      <ComparisonTable :table="sellerTable" first-column-label="Vendedor" />
    </ReportSection>

    <!-- Forecast POR PIPELINE: herda o pipeline selecionado acima. Snapshot, sem delta. -->
    <ReportSection
      title="Previsão de receita"
      :loading="crmForecast.loading.value"
      :error="crmForecast.error.value"
      :empty="false"
    >
      <template #actions>
        <span class="typo-body-10-regular text-gray-700">Pipeline analisado · estado atual</span>
      </template>
      <MetricCard label="Previsão ponderada" :metric="crmForecast.data.value!" />
    </ReportSection>
```

> `MetricCard` já é importado no `FunilTab` (após Task 3 usa-se nos cards). Se não estiver, adicionar `import MetricCard from '../components/primitives/MetricCard.vue'`.

- [ ] **Step 5: Rodar testes do FunilTab e typecheck**

Run: `npm test -- src/views/reportsV2/tabs/__tests__/FunilTab.spec.ts && npm run typecheck`
Expected: PASS. Se o `FunilTab.spec.ts` afirmar contagem de seções, ajustar a expectativa para incluir as novas (atualizar o teste, não remover seções).

- [ ] **Step 6: Verificação visual**

Run: `npm run dev` → abrir `/reports/funil`. Confirmar: linha WON verde / LOST vermelha; velocidade e tempo por etapa renderizam; tabela de vendedor com header "Vendedor" e Receita em R$, Taxa em %.

---

### Task 9: Card `crm.revenue-forecast` na aba Geral

**Files:**
- Modify: `src/views/reportsV2/tabs/GeralTab.vue`

`revenue-forecast` é snapshot ("agora"), sem delta, `format: "currency"`. O `MetricCard` já esconde o delta quando ausente — basta passar o payload normalizado. A seção não deve sugerir "no período". **Aqui é o forecast CONSOLIDADO** (todos os funis): a Geral não tem seletor de pipeline, então a query vai **sem `pipelineId`** (ver Decisão 4).

- [ ] **Step 1: Adicionar a query**

No `<script setup>` do `GeralTab.vue`:

```ts
const revenueForecast = useReportQuery(() =>
  // Consolidado: Geral não tem seletor de pipeline → forecast de TODOS os funis.
  // pipelineId omitido de propósito (backend agrega; ver Decisão 4).
  ReportsV2Service.getRevenueForecast({ ...filters, pipelineId: undefined })
)
```

E incluir no `reloadAll()`:

```ts
function reloadAll(): void {
  overview.execute()
  leads.execute()
  heatmap.execute()
  feed.reload()
  revenueForecast.execute()
}
```

- [ ] **Step 2: Adicionar a seção no template**

Inserir após a `<ReportSection title="Visão geral">…</ReportSection>`:

```vue
    <!-- Snapshot: previsão ponderada do pipeline aberto AGORA. Não usar "no período". -->
    <ReportSection
      title="Previsão de receita"
      :loading="revenueForecast.loading.value"
      :error="revenueForecast.error.value"
      :empty="false"
    >
      <template #actions>
        <span class="typo-body-10-regular text-gray-700">Todos os funis · estado atual</span>
      </template>
      <MetricCard label="Previsão ponderada" :metric="revenueForecast.data.value!" />
    </ReportSection>
```

> `MetricCard` já está importado no `GeralTab`. Não duplicar o import.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 4: Verificação visual**

Run: `npm run dev` → `/reports/geral`. Confirmar o card em R$ sem indicador de variação e com o rótulo "Estado atual do pipeline".

---

# FATIA 3 — Aba "Contatos / Leads"

### Task 10: Criar rota e nav da aba Contatos

**Files:**
- Modify: `src/views/reportsV2/types/reportsV2.ui.ts`
- Modify: `src/views/reportsV2/routes.ts`
- Modify: `src/views/reportsV2/ReportsV2View.vue`
- Create: `src/views/reportsV2/tabs/ContatosTab.vue` (placeholder mínimo nesta task; conteúdo na Task 11)

- [ ] **Step 1: Estender `TabKey`**

Em `reportsV2.ui.ts`:

```ts
export type TabKey =
  | "geral"
  | "funil"
  | "contatos"
  | "automacoes"
  | "agendamentos"
  | "colaboradores";
```

- [ ] **Step 2: Criar placeholder ContatosTab**

`src/views/reportsV2/tabs/ContatosTab.vue` (mínimo p/ a rota resolver; preenchido na Task 11):

```vue
<template>
  <div class="flex flex-col gap-4" />
</template>

<script setup lang="ts"></script>
```

- [ ] **Step 3: Registrar a rota**

Em `routes.ts`, adicionar como filho **após** a rota `funil` (mantém ordem visual):

```ts
    {
      path: "contatos",
      name: "ReportsV2Contatos",
      component: () => import("./tabs/ContatosTab.vue"),
      meta: { title: "ChatFunnel - Relatorios - Contatos" },
    },
```

- [ ] **Step 4: Adicionar a aba ao TABS**

Em `ReportsV2View.vue`, inserir no array `TABS` após `funil`:

```ts
  { key: 'contatos', label: 'Contatos / Leads' },
```

- [ ] **Step 5: Typecheck + verificação**

Run: `npm run typecheck`
Expected: sem erros. `npm run dev` → a aba "Contatos / Leads" aparece e navega para `/reports/contatos` (tela vazia por enquanto).

---

### Task 11: Conectar os 6 relatórios de Contatos

**Files:**
- Modify: `src/views/reportsV2/tabs/ContatosTab.vue`

Todos só recebem datas. `inactivity` é snapshot (6 faixas) → `AgingChart` + nota "Estado atual". `by-channel`, `by-tag` e as 3 UTM → `RankingList`. Padrão idêntico ao `GeralTab` (onMounted + watch nas datas).

- [ ] **Step 1: Implementar a aba completa**

Substituir todo o conteúdo de `src/views/reportsV2/tabs/ContatosTab.vue`:

```vue
<template>
  <div class="flex flex-col gap-4">
    <div class="grid gap-4 xl:grid-cols-2">
      <ReportSection
        title="Aquisição por canal"
        :loading="byChannel.loading.value"
        :error="byChannel.error.value"
        :empty="!!byChannel.data.value && byChannel.data.value.entries.length === 0"
      >
        <RankingList :entries="byChannel.data.value!.entries" />
      </ReportSection>

      <ReportSection
        title="Distribuição por tags"
        :loading="byTag.loading.value"
        :error="byTag.error.value"
        :empty="!!byTag.data.value && byTag.data.value.entries.length === 0"
      >
        <RankingList :entries="byTag.data.value!.entries" />
      </ReportSection>
    </div>

    <!-- Snapshot: distribuição da base AGORA por dias de inatividade. -->
    <ReportSection
      title="Contatos inativos"
      :loading="inactivity.loading.value"
      :error="inactivity.error.value"
      :empty="!!inactivity.data.value && inactivity.data.value.buckets.length === 0"
    >
      <template #actions>
        <span class="typo-body-10-regular text-gray-700">Estado atual da base</span>
      </template>
      <AgingChart :data="inactivity.data.value!" />
    </ReportSection>

    <div class="grid gap-4 xl:grid-cols-3">
      <ReportSection
        title="Origem UTM — source"
        :loading="utmSource.loading.value"
        :error="utmSource.error.value"
        :empty="!!utmSource.data.value && utmSource.data.value.entries.length === 0"
      >
        <RankingList :entries="utmSource.data.value!.entries" />
      </ReportSection>

      <ReportSection
        title="Origem UTM — medium"
        :loading="utmMedium.loading.value"
        :error="utmMedium.error.value"
        :empty="!!utmMedium.data.value && utmMedium.data.value.entries.length === 0"
      >
        <RankingList :entries="utmMedium.data.value!.entries" />
      </ReportSection>

      <ReportSection
        title="Origem UTM — campaign"
        :loading="utmCampaign.loading.value"
        :error="utmCampaign.error.value"
        :empty="!!utmCampaign.data.value && utmCampaign.data.value.entries.length === 0"
      >
        <RankingList :entries="utmCampaign.data.value!.entries" />
      </ReportSection>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { ReportsV2Service } from '@services/index'
import { useReportsFilters } from '../composables/useReportsFilters'
import { useReportQuery } from '../composables/useReportQuery'
import ReportSection from '../components/shared/ReportSection.vue'
import RankingList from '../components/primitives/RankingList.vue'
import AgingChart from '../components/primitives/AgingChart.vue'

const { filters } = useReportsFilters()

const byChannel = useReportQuery(() => ReportsV2Service.getContactsByChannel({ ...filters }))
const byTag = useReportQuery(() => ReportsV2Service.getContactsByTag({ ...filters }))
const inactivity = useReportQuery(() => ReportsV2Service.getContactsInactivity({ ...filters }))
const utmSource = useReportQuery(() => ReportsV2Service.getContactsUtmSource({ ...filters }))
const utmMedium = useReportQuery(() => ReportsV2Service.getContactsUtmMedium({ ...filters }))
const utmCampaign = useReportQuery(() => ReportsV2Service.getContactsUtmCampaign({ ...filters }))

function reloadAll(): void {
  byChannel.execute()
  byTag.execute()
  inactivity.execute()
  utmSource.execute()
  utmMedium.execute()
  utmCampaign.execute()
}

onMounted(reloadAll)
watch(() => [filters.initialDate, filters.finalDate], reloadAll)
</script>
```

- [ ] **Step 2: Typecheck + suíte completa**

Run: `npm run typecheck && npm run test:run -- src/views/reportsV2`
Expected: sem erros de tipo; todos os specs da feature passam.

- [ ] **Step 3: Verificação visual**

Run: `npm run dev` → `/reports/contatos`. Trocar o período no `ReportsFilterBar` e confirmar que as 6 seções recarregam. Confirmar que "Contatos inativos" mostra "Estado atual da base".

---

## Verificação final (após as 3 fatias)

- [ ] **Suíte completa de testes:** `npm run test:run` → tudo verde.
- [ ] **Typecheck:** `npm run typecheck` → sem erros.
- [ ] **Lint:** `npm run lint` → sem erros novos.
- [ ] **Smoke manual:** `npm run dev` → percorrer `/reports/geral`, `/reports/funil`, `/reports/contatos`. Trocar período e pipeline; confirmar loading (skeleton), erro (toast do interceptor) e empty states.
- [x] **Escala monetária:** CONFIRMADO pelo usuário (2026-06-10) — os valores chegam como `Int` (centavos); dividir por 100 está correto. `centavosToReais` mantido em `getCrmRevenue`, `getPerformanceBySeller` e `getRevenueForecast`.

## Follow-ups (fora do escopo desta entrega)

- Seletor de **granularidade** (day/week/month) para `crm.revenue`.
- **R14 — Campos personalizados** (`contacts.*`): pendência da story-13 no backend.
- Gate por papel em `crm.performance-by-seller`, se produto decidir restringir.
- Filtro por **pasta de tags** em `contacts.by-tag`; **taxa de reativação** em inativos; **conversão UTM→pipeline**.
- Atualizar o vault (`vault/`) com a decisão de escala monetária e o mapa relatório↔aba final.
