# Reports V2 — Migração de Gráficos para ECharts (PoC) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir as libs de gráfico dos Relatórios V2 (chart.js, vue-chartjs, @unovis) por **Apache ECharts** via `vue-echarts`, mantendo o `FunnelChartV2` (funnel-graph-js) intacto.

**Architecture:** Cada gráfico vira um par **builder puro + wrapper fino**: uma função `buildXOption(data)` em `.ts` (testável sem canvas) que monta o objeto `option` do ECharts, e um `.vue` que só liga `data → option → <VChart>`. Os novos componentes ficam em `chatfunnel-front/src/views/reportsV2/components/primitives/echarts/` com **os mesmos nomes e as mesmas props** dos atuais, então migrar cada tab é trocar só o caminho do import. Os componentes antigos ficam no lugar até a validação final (rollback = reverter o import). O ECharts é registrado com tree-shaking (`echarts/core` + imports explícitos).

**Tech Stack:** Vue 3.5 `<script setup lang="ts">`, ECharts 5 (`echarts/core`), `vue-echarts`, Vitest, Tailwind v4. Tokens de cor lidos de CSS vars (canvas não aceita classes).

**Escopo do PoC:** Heatmap (piloto), TimeSeriesChart (linha), SegmentedTimeSeriesChart (multi-linha), BarSeriesChart (barra + média móvel), ChannelDonut (donut). **Fora do escopo:** FunnelChartV2 e os componentes feitos à mão sem lib (AgingChart, RankingList, MetricCard, ComparisonTable, EventFeed).

**Nota de paths:** todos os caminhos `src/...` abaixo são relativos a `chatfunnel-front/`. Rodar os comandos `npm` dentro de `chatfunnel-front/`.

---

## File Structure

**Criar:**
- `src/views/reportsV2/charts/tokens.ts` — leitores de token CSS + `formatDateBR`, lib-agnósticos (extraídos de `chart.config.ts`).
- `src/views/reportsV2/charts/echarts.config.ts` — registro tree-shaken dos módulos ECharts (side-effect import).
- `src/views/reportsV2/components/primitives/echarts/heatmap.option.ts` + `Heatmap.vue`
- `src/views/reportsV2/components/primitives/echarts/timeSeries.option.ts` + `TimeSeriesChart.vue`
- `src/views/reportsV2/components/primitives/echarts/segmentedTimeSeries.option.ts` + `SegmentedTimeSeriesChart.vue`
- `src/views/reportsV2/components/primitives/echarts/barSeries.option.ts` + `BarSeriesChart.vue`
- `src/views/reportsV2/components/primitives/echarts/channelDonut.option.ts` + `ChannelDonut.vue`
- `src/views/reportsV2/components/primitives/echarts/__tests__/*.spec.ts` — testes dos builders.

**Modificar (só troca de import path por tab):**
- `BroadcastTab.vue`, `ColaboradoresTab.vue`, `GeralTab.vue`, `ContatosTab.vue`, `FunilTab.vue`, `MensagensTab.vue`, `AgendamentosTab.vue`, `AutomacoesTab.vue`.
- `chart.config.ts` — re-exporta de `tokens.ts` (mantém imports legados funcionando).
- `package.json` — adiciona `echarts`, `vue-echarts`.

**Não tocar:** `FunnelChartV2.vue`, `funnel-graph-js`, e os componentes hand-rolled.

---

## Task 1: Instalar ECharts + vue-echarts

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Instalar as dependências**

Run (em `chatfunnel-front/`): `npm install echarts vue-echarts`
Expected: `echarts` (^5.x) e `vue-echarts` (^7.x) adicionados em `dependencies` do `package.json`.

- [ ] **Step 2: Confirmar que instalou**

Run: `npm ls echarts vue-echarts`
Expected: ambas listadas sem `UNMET DEPENDENCY`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build(reports): adiciona echarts e vue-echarts para PoC de graficos"
```

---

## Task 2: Extrair tokens lib-agnósticos para `charts/tokens.ts`

Hoje `chart.config.ts` registra o chart.js **e** expõe os leitores de token. Importar dele puxa o chart.js junto — ruim para o bundle do ECharts. Extraímos os leitores (e `formatDateBR`) para um módulo neutro e re-exportamos no `chart.config.ts` (zero quebra nos imports legados).

**Files:**
- Create: `src/views/reportsV2/charts/tokens.ts`
- Modify: `src/views/reportsV2/charts/chart.config.ts:30-76`

- [ ] **Step 1: Criar `tokens.ts` com os leitores e o formatador**

```ts
// src/views/reportsV2/charts/tokens.ts
// Leitores de token CSS e formatadores SEM dependência de lib de gráfico.
// Canvas (chart.js/ECharts) não aceita classes Tailwind, então lemos o valor
// computado do token no :root, com fallback defensivo.
function readToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

export function getBrandColor(): string {
  return readToken('--color-brand-500', '#3CA1A1')
}
export function getInkColor(): string {
  return readToken('--color-gray-1000', '#33303E')
}
export function getGreenColor(): string {
  return readToken('--color-green-500', '#2BA471')
}
export function getRedColor(): string {
  return readToken('--color-red-500', '#E5484D')
}
export function getYellowColor(): string {
  return readToken('--color-yellow-500', '#D9A514')
}
export function getBlueColor(): string {
  return readToken('--color-blue-500', '#3B82F6')
}

// Converte "YYYY-MM-DD" (ou ISO truncado) em "DD-MM-YYYY". Usa as partes da
// string (não new Date()) para não sofrer shift de timezone. Devolve o valor
// original quando não casa (labels não-data vindos do backend).
export function formatDateBR(value: string | number): string {
  const str = String(value)
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(str)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : str
}
```

- [ ] **Step 2: Substituir as definições em `chart.config.ts` por re-export**

Em `chart.config.ts`, remover as funções `readToken`, `getBrandColor`, `getInkColor`, `getGreenColor`, `getRedColor`, `getYellowColor`, `getBlueColor` e `formatDateBR` (linhas 30-76) e colocar no lugar:

```ts
// Token readers e formatDateBR agora vivem em tokens.ts (lib-agnósticos).
// Re-exportados aqui para manter compatibilidade com os imports legados.
export {
  getBrandColor,
  getInkColor,
  getGreenColor,
  getRedColor,
  getYellowColor,
  getBlueColor,
  formatDateBR
} from './tokens'
```

(O bloco `Chart.register(...)` e os `baseBarOptions`/`baseLineOptions` permanecem.)

- [ ] **Step 3: Rodar typecheck — nada quebrou nos consumidores legados**

Run: `npm run typecheck`
Expected: PASS (mesmos símbolos exportados de `chart.config.ts`).

- [ ] **Step 4: Commit**

```bash
git add src/views/reportsV2/charts/tokens.ts src/views/reportsV2/charts/chart.config.ts
git commit -m "refactor(reports): extrai token readers para charts/tokens.ts"
```

---

## Task 3: Setup do ECharts (registro tree-shaken)

**Files:**
- Create: `src/views/reportsV2/charts/echarts.config.ts`

- [ ] **Step 1: Criar o módulo de registro**

```ts
// src/views/reportsV2/charts/echarts.config.ts
// Registro ÚNICO dos módulos ECharts usados nos Relatórios. Import por
// side-effect: cada wrapper .vue faz `import '../../../charts/echarts.config'`.
// Tree-shaking: só os charts/componentes abaixo entram no bundle.
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart, PieChart, HeatmapChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent
} from 'echarts/components'

use([
  CanvasRenderer,
  LineChart,
  BarChart,
  PieChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent
])
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/views/reportsV2/charts/echarts.config.ts
git commit -m "feat(reports): registro tree-shaken dos modulos ECharts"
```

---

## Task 4: Heatmap em ECharts (PILOTO)

Mapeia a matriz 7×24 (`buildHeatmapMatrix`) para tuplas `[hora, dia, valor]` do `heatmap` do ECharts. Intensidade via `visualMap` (gray-300 → brand), igual à opacidade do componente atual.

**Files:**
- Create: `src/views/reportsV2/components/primitives/echarts/heatmap.option.ts`
- Create: `src/views/reportsV2/components/primitives/echarts/Heatmap.vue`
- Test: `src/views/reportsV2/components/primitives/echarts/__tests__/heatmap.option.spec.ts`

- [ ] **Step 1: Escrever o teste do builder (falha)**

```ts
// __tests__/heatmap.option.spec.ts
import { describe, it, expect } from 'vitest'
import { buildHeatmapOption } from '../heatmap.option'

const data = {
  max: 10,
  cells: [
    { day: 0, hour: 9, value: 10 },
    { day: 6, hour: 23, value: 5 }
  ]
}

describe('buildHeatmapOption', () => {
  it('mapeia células para tuplas [hora, dia, valor] e preenche 7x24', () => {
    const opt = buildHeatmapOption(data)
    expect(opt.series[0].type).toBe('heatmap')
    expect(opt.series[0].data).toHaveLength(7 * 24)
    expect(opt.series[0].data).toContainEqual([9, 0, 10])
    expect(opt.series[0].data).toContainEqual([23, 6, 5])
  })

  it('usa data.max como teto do visualMap (com piso 1)', () => {
    expect(buildHeatmapOption(data).visualMap.max).toBe(10)
    expect(buildHeatmapOption({ max: 0, cells: [] }).visualMap.max).toBe(1)
  })

  it('formata tooltip "rate" como porcentagem', () => {
    const opt = buildHeatmapOption({ max: 1, cells: [{ day: 0, hour: 0, value: 0.42 }] }, 'rate')
    expect(opt.tooltip.formatter({ value: [0, 0, 0.42] })).toContain('42%')
  })
})
```

- [ ] **Step 2: Rodar o teste — falha (módulo não existe)**

Run: `npm run test:run -- heatmap.option`
Expected: FAIL — "Cannot find module '../heatmap.option'".

- [ ] **Step 3: Implementar o builder**

```ts
// heatmap.option.ts
import type { HeatmapData } from '@chatfunnel/contracts'
import { buildHeatmapMatrix } from '../../../utils/heatmap'
import { getBrandColor } from '../../../charts/tokens'

const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const HOURS = Array.from({ length: 24 }, (_, h) => `${h}h`)

type HeatmapValueFormat = 'count' | 'rate'

export function buildHeatmapOption(data: HeatmapData, valueFormat: HeatmapValueFormat = 'count') {
  const matrix = buildHeatmapMatrix(data)
  // ECharts heatmap: x = hora (0..23), y = dia (0..6).
  const seriesData: [number, number, number][] = []
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      seriesData.push([hour, day, matrix[day][hour]])
    }
  }
  const fmt = (v: number) => (valueFormat === 'rate' ? `${Math.round(v * 100)}%` : String(v))

  return {
    tooltip: {
      position: 'top',
      formatter: (p: { value: [number, number, number] }) =>
        `${DAYS[p.value[1]]} ${p.value[0]}h: ${fmt(p.value[2])}`
    },
    grid: { left: 36, right: 8, top: 8, bottom: 24 },
    xAxis: {
      type: 'category',
      data: HOURS,
      splitArea: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { interval: 2, color: '#8c8a97', fontSize: 10 }
    },
    yAxis: {
      type: 'category',
      data: DAYS,
      splitArea: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#6b7280', fontSize: 10 }
    },
    visualMap: {
      min: 0,
      max: data.max > 0 ? data.max : 1,
      show: false,
      inRange: { color: ['#F2F2F2', getBrandColor()] }
    },
    series: [
      {
        type: 'heatmap',
        data: seriesData,
        itemStyle: { borderRadius: 2, borderWidth: 1, borderColor: '#ffffff' }
      }
    ]
  }
}
```

- [ ] **Step 4: Rodar o teste — passa**

Run: `npm run test:run -- heatmap.option`
Expected: PASS (3 testes).

- [ ] **Step 5: Escrever o wrapper `.vue`**

```vue
<!-- echarts/Heatmap.vue -->
<template>
  <div class="h-[200px] w-full">
    <VChart :option="option" autoresize />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import type { HeatmapData } from '@chatfunnel/contracts'
import '../../../charts/echarts.config'
import { buildHeatmapOption } from './heatmap.option'

const props = withDefaults(
  defineProps<{ data: HeatmapData; valueFormat?: 'count' | 'rate' }>(),
  { valueFormat: 'count' }
)

const option = computed(() => buildHeatmapOption(props.data, props.valueFormat))
</script>
```

- [ ] **Step 6: Trocar o import no `BroadcastTab.vue` (piloto visual)**

Em `src/views/reportsV2/tabs/BroadcastTab.vue:63`, trocar:

```ts
import Heatmap from '../components/primitives/Heatmap.vue'
```
por:
```ts
import Heatmap from '../components/primitives/echarts/Heatmap.vue'
```

- [ ] **Step 7: Validar no navegador (CHECKPOINT)**

Run: `npm run dev`
Abrir Relatórios → aba Broadcast → "Melhor horário de envio". Conferir: cores da brand, tooltip "Seg 9h: 42%", labels de hora a cada 3h, responsividade. **Comparar com o atual e validar com o time/CEO antes de seguir.**

- [ ] **Step 8: Commit**

```bash
git add src/views/reportsV2/components/primitives/echarts/ src/views/reportsV2/tabs/BroadcastTab.vue
git commit -m "feat(reports): heatmap em ECharts (piloto) + swap no BroadcastTab"
```

---

## Task 5: TimeSeriesChart (linha simples) em ECharts

Linha única com área preenchida (brand). `formatDateBR` no eixo X e no tooltip.

**Files:**
- Create: `src/views/reportsV2/components/primitives/echarts/timeSeries.option.ts`
- Create: `src/views/reportsV2/components/primitives/echarts/TimeSeriesChart.vue`
- Test: `src/views/reportsV2/components/primitives/echarts/__tests__/timeSeries.option.spec.ts`

- [ ] **Step 1: Teste do builder (falha)**

```ts
// __tests__/timeSeries.option.spec.ts
import { describe, it, expect } from 'vitest'
import { buildTimeSeriesOption } from '../timeSeries.option'

const data = {
  granularity: 'day' as const,
  series: [
    { date: '2026-06-01', value: 12 },
    { date: '2026-06-02', value: 18 }
  ]
}

describe('buildTimeSeriesOption', () => {
  it('cria uma série de linha com os valores na ordem', () => {
    const opt = buildTimeSeriesOption(data, 'Leads')
    expect(opt.series[0].type).toBe('line')
    expect(opt.series[0].name).toBe('Leads')
    expect(opt.series[0].data).toEqual([12, 18])
  })

  it('usa as datas como labels do eixo X', () => {
    expect(buildTimeSeriesOption(data).xAxis.data).toEqual(['2026-06-01', '2026-06-02'])
  })

  it('formata as datas como DD-MM-YYYY no eixo', () => {
    const opt = buildTimeSeriesOption(data)
    expect(opt.xAxis.axisLabel.formatter('2026-06-01')).toBe('01-06-2026')
  })
})
```

- [ ] **Step 2: Rodar — falha**

Run: `npm run test:run -- timeSeries.option`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar o builder**

```ts
// timeSeries.option.ts
import type { TimeSeries } from '@chatfunnel/contracts'
import { getBrandColor, formatDateBR } from '../../../charts/tokens'

export function buildTimeSeriesOption(data: TimeSeries, label = 'Total') {
  const brand = getBrandColor()
  const labels = data.series.map((p) => p.label ?? p.date)
  return {
    grid: { left: 40, right: 12, top: 10, bottom: 28, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      formatter: (items: { axisValue: string; data: number }[]) =>
        items.length ? `${formatDateBR(items[0].axisValue)}<br/>${label}: ${items[0].data}` : ''
    },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#8c8a97', formatter: (v: string) => formatDateBR(v) }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: '#f0f0f0' } },
      axisLabel: { color: '#8c8a97' }
    },
    series: [
      {
        type: 'line',
        name: label,
        data: data.series.map((p) => p.value),
        smooth: true,
        showSymbol: false,
        lineStyle: { color: brand, width: 2 },
        itemStyle: { color: brand },
        areaStyle: { color: 'rgba(60, 161, 161, 0.12)' }
      }
    ]
  }
}
```

- [ ] **Step 4: Rodar — passa**

Run: `npm run test:run -- timeSeries.option`
Expected: PASS (3 testes).

- [ ] **Step 5: Wrapper `.vue`**

```vue
<!-- echarts/TimeSeriesChart.vue -->
<template>
  <div class="h-[260px] w-full">
    <VChart :option="option" autoresize />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import type { TimeSeries } from '@chatfunnel/contracts'
import '../../../charts/echarts.config'
import { buildTimeSeriesOption } from './timeSeries.option'

const props = defineProps<{ data: TimeSeries; label?: string }>()
const option = computed(() => buildTimeSeriesOption(props.data, props.label ?? 'Total'))
</script>
```

- [ ] **Step 6: Trocar imports nos consumidores**

Em `ColaboradoresTab.vue:132`, trocar:
```ts
import TimeSeriesChart from '../components/primitives/TimeSeriesChart.vue'
```
por:
```ts
import TimeSeriesChart from '../components/primitives/echarts/TimeSeriesChart.vue'
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/views/reportsV2/components/primitives/echarts/timeSeries.option.ts src/views/reportsV2/components/primitives/echarts/TimeSeriesChart.vue src/views/reportsV2/components/primitives/echarts/__tests__/timeSeries.option.spec.ts src/views/reportsV2/tabs/ColaboradoresTab.vue
git commit -m "feat(reports): TimeSeriesChart em ECharts + swap"
```

---

## Task 6: SegmentedTimeSeriesChart (multi-linha + legenda) em ECharts

Várias linhas (uma por segmento) sobre eixo X de datas unidas. Cores/labels por segmento conhecido, com fallback de paleta categórica. Legenda embaixo.

**Files:**
- Create: `src/views/reportsV2/components/primitives/echarts/segmentedTimeSeries.option.ts`
- Create: `src/views/reportsV2/components/primitives/echarts/SegmentedTimeSeriesChart.vue`
- Test: `src/views/reportsV2/components/primitives/echarts/__tests__/segmentedTimeSeries.option.spec.ts`

- [ ] **Step 1: Teste do builder (falha)**

```ts
// __tests__/segmentedTimeSeries.option.spec.ts
import { describe, it, expect } from 'vitest'
import { buildSegmentedTimeSeriesOption } from '../segmentedTimeSeries.option'

const data = {
  segments: [
    { segment: 'WON', points: [{ date: '2026-06-01', value: 3 }, { date: '2026-06-02', value: 5 }] },
    { segment: 'LOST', points: [{ date: '2026-06-02', value: 2 }] }
  ]
}

describe('buildSegmentedTimeSeriesOption', () => {
  it('une e ordena as datas de todos os segmentos no eixo X', () => {
    const opt = buildSegmentedTimeSeriesOption(data)
    expect(opt.xAxis.data).toEqual(['2026-06-01', '2026-06-02'])
  })

  it('cria uma série de linha por segmento, com 0 nas datas ausentes', () => {
    const opt = buildSegmentedTimeSeriesOption(data)
    expect(opt.series).toHaveLength(2)
    const won = opt.series.find((s: { name: string }) => s.name === 'Ganhos')
    const lost = opt.series.find((s: { name: string }) => s.name === 'Perdidos')
    expect(won.data).toEqual([3, 5])
    expect(lost.data).toEqual([0, 2]) // 2026-06-01 ausente -> 0
  })

  it('rotula segmentos conhecidos em pt-BR', () => {
    const names = buildSegmentedTimeSeriesOption(data).series.map((s: { name: string }) => s.name)
    expect(names).toContain('Ganhos')
    expect(names).toContain('Perdidos')
  })
})
```

- [ ] **Step 2: Rodar — falha**

Run: `npm run test:run -- segmentedTimeSeries.option`
Expected: FAIL.

- [ ] **Step 3: Implementar o builder**

```ts
// segmentedTimeSeries.option.ts
import type { SegmentedTimeSeries } from '@chatfunnel/contracts'
import {
  getBrandColor,
  getInkColor,
  getGreenColor,
  getRedColor,
  getYellowColor,
  getBlueColor,
  formatDateBR
} from '../../../charts/tokens'

const KNOWN_SEGMENT_COLOR: Record<string, () => string> = {
  WON: getGreenColor,
  LOST: getRedColor,
  opened: getBrandColor,
  closed: getInkColor,
  active: getGreenColor,
  cancelled: getRedColor,
  CONTACT: getBrandColor,
  HUMAN: getInkColor,
  BOT: getYellowColor,
  ASSISTANT: getBlueColor
}

const PALETTE = [getBrandColor, getGreenColor, getYellowColor, getRedColor, getBlueColor, getInkColor]

function segmentColor(segment: string, index: number): string {
  return (KNOWN_SEGMENT_COLOR[segment] ?? PALETTE[index % PALETTE.length])()
}

const KNOWN_SEGMENT_LABEL: Record<string, string> = {
  WON: 'Ganhos',
  LOST: 'Perdidos',
  opened: 'Abertas',
  closed: 'Fechadas',
  active: 'Ativos',
  cancelled: 'Cancelados',
  CONTACT: 'Contato',
  HUMAN: 'Humano',
  BOT: 'Flow',
  ASSISTANT: 'IA',
  direct: 'Direto'
}

export function buildSegmentedTimeSeriesOption(data: SegmentedTimeSeries) {
  const dateSet = new Set<string>()
  for (const seg of data.segments) for (const p of seg.points) dateSet.add(p.date)
  const labels = Array.from(dateSet).sort()

  const series = data.segments.map((seg, i) => {
    const byDate = new Map(seg.points.map((p) => [p.date, p.value]))
    const color = segmentColor(seg.segment, i)
    return {
      type: 'line',
      name: seg.label ?? KNOWN_SEGMENT_LABEL[seg.segment] ?? seg.segment,
      data: labels.map((d) => byDate.get(d) ?? 0),
      smooth: true,
      showSymbol: false,
      lineStyle: { color, width: 2 },
      itemStyle: { color }
    }
  })

  return {
    grid: { left: 40, right: 12, top: 10, bottom: 40, containLabel: true },
    tooltip: {
      trigger: 'axis',
      formatter: (items: { axisValue: string; seriesName: string; data: number; marker: string }[]) => {
        if (!items.length) return ''
        const head = `${formatDateBR(items[0].axisValue)}<br/>`
        return head + items.map((it) => `${it.marker}${it.seriesName}: ${it.data}`).join('<br/>')
      }
    },
    legend: { bottom: 0, icon: 'roundRect', itemWidth: 18, itemHeight: 4 },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#8c8a97', formatter: (v: string) => formatDateBR(v) }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: '#f0f0f0' } },
      axisLabel: { color: '#8c8a97' }
    },
    series
  }
}
```

- [ ] **Step 4: Rodar — passa**

Run: `npm run test:run -- segmentedTimeSeries.option`
Expected: PASS (3 testes).

- [ ] **Step 5: Wrapper `.vue`**

```vue
<!-- echarts/SegmentedTimeSeriesChart.vue -->
<template>
  <div class="h-[260px] w-full">
    <VChart :option="option" autoresize />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import type { SegmentedTimeSeries } from '@chatfunnel/contracts'
import '../../../charts/echarts.config'
import { buildSegmentedTimeSeriesOption } from './segmentedTimeSeries.option'

const props = defineProps<{ data: SegmentedTimeSeries }>()
const option = computed(() => buildSegmentedTimeSeriesOption(props.data))
</script>
```

- [ ] **Step 6: Trocar imports nos consumidores**

Trocar `../components/primitives/SegmentedTimeSeriesChart.vue` → `../components/primitives/echarts/SegmentedTimeSeriesChart.vue` em:
- `ContatosTab.vue:120`
- `FunilTab.vue:147`
- `MensagensTab.vue:74`

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/views/reportsV2/components/primitives/echarts/segmentedTimeSeries.option.ts src/views/reportsV2/components/primitives/echarts/SegmentedTimeSeriesChart.vue src/views/reportsV2/components/primitives/echarts/__tests__/segmentedTimeSeries.option.spec.ts src/views/reportsV2/tabs/ContatosTab.vue src/views/reportsV2/tabs/FunilTab.vue src/views/reportsV2/tabs/MensagensTab.vue
git commit -m "feat(reports): SegmentedTimeSeriesChart em ECharts + swap"
```

---

## Task 7: BarSeriesChart (barra + média móvel) em ECharts

Barra única (brand, cantos arredondados no topo) com linha de média móvel (SMA) opcional via toggle. Janela: 7 (day), 4 (week), 3 (default). O toggle continua no `.vue`; o builder recebe `showMovingAverage`.

**Files:**
- Create: `src/views/reportsV2/components/primitives/echarts/barSeries.option.ts`
- Create: `src/views/reportsV2/components/primitives/echarts/BarSeriesChart.vue`
- Test: `src/views/reportsV2/components/primitives/echarts/__tests__/barSeries.option.spec.ts`

- [ ] **Step 1: Teste do builder (falha)**

```ts
// __tests__/barSeries.option.spec.ts
import { describe, it, expect } from 'vitest'
import { buildBarSeriesOption } from '../barSeries.option'

const data = {
  granularity: 'day' as const,
  series: [
    { date: '2026-06-01', value: 10 },
    { date: '2026-06-02', value: 20 },
    { date: '2026-06-03', value: 30 }
  ]
}

describe('buildBarSeriesOption', () => {
  it('cria uma série de barra com os valores', () => {
    const opt = buildBarSeriesOption(data, { label: 'Leads', showMovingAverage: false })
    expect(opt.series).toHaveLength(1)
    expect(opt.series[0].type).toBe('bar')
    expect(opt.series[0].data).toEqual([10, 20, 30])
  })

  it('adiciona a linha de média móvel quando ligada', () => {
    const opt = buildBarSeriesOption(data, { showMovingAverage: true })
    expect(opt.series).toHaveLength(2)
    const line = opt.series.find((s: { type: string }) => s.type === 'line')
    expect(line).toBeTruthy()
    // SMA trailing janela 7 (day): com 3 pontos, é a média acumulada.
    expect(line.data).toEqual([10, 15, 20])
  })
})
```

- [ ] **Step 2: Rodar — falha**

Run: `npm run test:run -- barSeries.option`
Expected: FAIL.

- [ ] **Step 3: Implementar o builder**

```ts
// barSeries.option.ts
import type { TimeSeries } from '@chatfunnel/contracts'
import { getBrandColor, getInkColor, formatDateBR } from '../../../charts/tokens'

function maWindow(granularity: TimeSeries['granularity']): number {
  switch (granularity) {
    case 'day':
      return 7
    case 'week':
      return 4
    default:
      return 3
  }
}

export function buildBarSeriesOption(
  data: TimeSeries,
  opts: { label?: string; showMovingAverage?: boolean } = {}
) {
  const label = opts.label ?? 'Leads'
  const w = maWindow(data.granularity)
  const values = data.series.map((p) => p.value)
  const labels = data.series.map((p) => p.label ?? formatDateBR(p.date))

  // SMA trailing: média de [max(0, i-w+1) .. i]. Janelas parciais no início.
  const ma = values.map((_, i) => {
    const window = values.slice(Math.max(0, i - w + 1), i + 1)
    const sum = window.reduce((acc, v) => acc + v, 0)
    return Math.round((sum / window.length) * 10) / 10
  })

  const series: Record<string, unknown>[] = [
    {
      type: 'bar',
      name: label,
      data: values,
      barMaxWidth: 40,
      itemStyle: { color: getBrandColor(), borderRadius: [4, 4, 0, 0] }
    }
  ]
  if (opts.showMovingAverage) {
    series.push({
      type: 'line',
      name: `Média móvel (${w})`,
      data: ma,
      smooth: true,
      showSymbol: false,
      lineStyle: { color: getInkColor(), width: 2 }
    })
  }

  return {
    grid: { left: 40, right: 12, top: 10, bottom: 28, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#8c8a97' }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: '#f0f0f0' } },
      axisLabel: { color: '#8c8a97' }
    },
    series
  }
}
```

- [ ] **Step 4: Rodar — passa**

Run: `npm run test:run -- barSeries.option`
Expected: PASS (2 testes).

- [ ] **Step 5: Wrapper `.vue` (mantém o toggle de média móvel)**

```vue
<!-- echarts/BarSeriesChart.vue -->
<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-end gap-2">
      <label :for="toggleId" class="typo-body-12-regular cursor-pointer select-none text-gray-700">
        Média móvel
      </label>
      <SwitchControl :id="toggleId" v-model:checked="showMovingAverage" />
    </div>
    <div class="h-[260px] w-full">
      <VChart :option="option" autoresize />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import VChart from 'vue-echarts'
import type { TimeSeries } from '@chatfunnel/contracts'
import { SwitchControl } from '@/components/ui/switch'
import '../../../charts/echarts.config'
import { buildBarSeriesOption } from './barSeries.option'

const props = defineProps<{ data: TimeSeries; label?: string }>()
const toggleId = useId()
const showMovingAverage = ref(false)

const option = computed(() =>
  buildBarSeriesOption(props.data, {
    label: props.label,
    showMovingAverage: showMovingAverage.value
  })
)
</script>
```

- [ ] **Step 6: Trocar imports nos consumidores**

Trocar `../components/primitives/BarSeriesChart.vue` → `../components/primitives/echarts/BarSeriesChart.vue` em:
- `AgendamentosTab.vue:31`
- `AutomacoesTab.vue:73`
- `ColaboradoresTab.vue:131`
- `GeralTab.vue:103`

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/views/reportsV2/components/primitives/echarts/barSeries.option.ts src/views/reportsV2/components/primitives/echarts/BarSeriesChart.vue src/views/reportsV2/components/primitives/echarts/__tests__/barSeries.option.spec.ts src/views/reportsV2/tabs/AgendamentosTab.vue src/views/reportsV2/tabs/AutomacoesTab.vue src/views/reportsV2/tabs/ColaboradoresTab.vue src/views/reportsV2/tabs/GeralTab.vue
git commit -m "feat(reports): BarSeriesChart em ECharts + swap"
```

---

## Task 8: ChannelDonut (donut + legenda) em ECharts

Donut do share por canal. A **legenda em lista** (Tailwind, com valor e %) e o **total central** continuam no `.vue`; só o gráfico vira ECharts (pie com `radius`). Cores por canal conhecido (WhatsApp verde, Instagram azul, sistema brand) + fallback de paleta.

**Files:**
- Create: `src/views/reportsV2/components/primitives/echarts/channelDonut.option.ts`
- Create: `src/views/reportsV2/components/primitives/echarts/ChannelDonut.vue`
- Test: `src/views/reportsV2/components/primitives/echarts/__tests__/channelDonut.option.spec.ts`

- [ ] **Step 1: Teste do builder (falha)**

```ts
// __tests__/channelDonut.option.spec.ts
import { describe, it, expect } from 'vitest'
import { buildChannelDonutOption } from '../channelDonut.option'

const segments = [
  { displayLabel: 'WhatsApp', value: 80, color: '#2BA471' },
  { displayLabel: 'Instagram', value: 20, color: '#3B82F6' }
]

describe('buildChannelDonutOption', () => {
  it('cria uma série pie (donut) com name/value/cor por segmento', () => {
    const opt = buildChannelDonutOption(segments)
    expect(opt.series[0].type).toBe('pie')
    expect(opt.series[0].radius).toEqual(['62%', '90%'])
    expect(opt.series[0].data).toEqual([
      { name: 'WhatsApp', value: 80, itemStyle: { color: '#2BA471' } },
      { name: 'Instagram', value: 20, itemStyle: { color: '#3B82F6' } }
    ])
  })

  it('tooltip mostra valor formatado e participação', () => {
    const opt = buildChannelDonutOption(segments)
    const txt = opt.tooltip.formatter({ name: 'WhatsApp', value: 80, percent: 80 })
    expect(txt).toContain('WhatsApp')
    expect(txt).toContain('80')
  })
})
```

- [ ] **Step 2: Rodar — falha**

Run: `npm run test:run -- channelDonut.option`
Expected: FAIL.

- [ ] **Step 3: Implementar o builder**

```ts
// channelDonut.option.ts
export interface DonutSegment {
  displayLabel: string
  value: number
  color: string
}

const nf = new Intl.NumberFormat('pt-BR')

export function buildChannelDonutOption(segments: DonutSegment[]) {
  return {
    tooltip: {
      trigger: 'item',
      formatter: (p: { name: string; value: number; percent: number }) =>
        `${p.name}: ${nf.format(p.value)} · ${p.percent}%`
    },
    series: [
      {
        type: 'pie',
        radius: ['62%', '90%'],
        avoidLabelOverlap: false,
        padAngle: 2,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: { borderRadius: 4, borderColor: '#ffffff', borderWidth: 1 },
        data: segments.map((s) => ({
          name: s.displayLabel,
          value: s.value,
          itemStyle: { color: s.color }
        }))
      }
    ]
  }
}
```

- [ ] **Step 4: Rodar — passa**

Run: `npm run test:run -- channelDonut.option`
Expected: PASS (2 testes).

- [ ] **Step 5: Wrapper `.vue` (legenda e total central preservados)**

```vue
<!-- echarts/ChannelDonut.vue -->
<template>
  <div class="flex flex-col items-center gap-5 sm:flex-row sm:justify-center sm:gap-7">
    <div class="relative h-[180px] w-[180px] shrink-0">
      <VChart :option="option" autoresize />
      <!-- Total central: overlay (ECharts pie não tem central-label nativo simples) -->
      <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span class="typo-body-16-semibold text-gray-1000">{{ centralLabel }}</span>
        <span class="typo-body-10-regular text-gray-700">contatos</span>
      </div>
    </div>

    <ul class="flex w-full flex-col gap-2.5 sm:w-auto sm:min-w-44">
      <li v-for="seg in segments" :key="seg.id" class="flex items-center gap-2.5">
        <span class="size-2.5 shrink-0 rounded-full" :style="{ backgroundColor: seg.color }" />
        <span class="typo-body-12-semibold truncate text-gray-1000">{{ seg.displayLabel }}</span>
        <span class="typo-body-12-semibold ml-auto font-mono tabular-nums text-gray-1000">
          {{ formatNumber(seg.value) }}
        </span>
        <span class="typo-body-12-regular w-10 text-right font-mono tabular-nums text-gray-700">
          {{ formatPercent(seg.value) }}
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import type { RankingEntry } from '@chatfunnel/contracts'
import {
  getBrandColor,
  getGreenColor,
  getBlueColor,
  getYellowColor,
  getRedColor
} from '../../../charts/tokens'
import { channelLabel } from '../../../utils/channel'
import '../../../charts/echarts.config'
import { buildChannelDonutOption, type DonutSegment } from './channelDonut.option'

const props = defineProps<{ entries: RankingEntry[] }>()

type Segment = RankingEntry & { color: string; displayLabel: string }

const FALLBACK_PALETTE = [getBlueColor, getYellowColor, getRedColor, getGreenColor]

function channelColor(label: string, index: number): string {
  const key = label.trim().toLowerCase()
  if (key.includes('whatsapp') || key.includes('whats')) return getGreenColor()
  if (key.includes('instagram') || key.includes('insta')) return getBlueColor()
  if (key.includes('sistema') || key.includes('system')) return getBrandColor()
  return FALLBACK_PALETTE[index % FALLBACK_PALETTE.length]()
}

const segments = computed<Segment[]>(() =>
  props.entries.map((entry, index) => ({
    ...entry,
    color: channelColor(entry.label, index),
    displayLabel: channelLabel(entry.label)
  }))
)

const total = computed(() => props.entries.reduce((acc, e) => acc + e.value, 0))

const nf = new Intl.NumberFormat('pt-BR')
const pf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

function formatNumber(value: number): string {
  return nf.format(value)
}
function formatPercent(value: number): string {
  if (total.value <= 0) return '0%'
  return `${pf.format((value / total.value) * 100)}%`
}

const centralLabel = computed(() => nf.format(total.value))

const option = computed(() =>
  buildChannelDonutOption(
    segments.value.map<DonutSegment>((s) => ({
      displayLabel: s.displayLabel,
      value: s.value,
      color: s.color
    }))
  )
)
</script>
```

- [ ] **Step 6: Trocar imports nos consumidores**

Trocar `../components/primitives/ChannelDonut.vue` → `../components/primitives/echarts/ChannelDonut.vue` em:
- `ContatosTab.vue:118`
- `GeralTab.vue:102`

- [ ] **Step 7: Trocar o import restante do Heatmap nos demais consumidores**

(O piloto trocou só o BroadcastTab.) Trocar `../components/primitives/Heatmap.vue` → `../components/primitives/echarts/Heatmap.vue` em:
- `ColaboradoresTab.vue:135`
- `GeralTab.vue:104`

- [ ] **Step 8: Typecheck + suite completa**

Run: `npm run typecheck && npm run test:run -- echarts`
Expected: PASS (typecheck limpo; todos os specs dos builders verdes).

- [ ] **Step 9: Commit**

```bash
git add src/views/reportsV2/components/primitives/echarts/channelDonut.option.ts src/views/reportsV2/components/primitives/echarts/ChannelDonut.vue src/views/reportsV2/components/primitives/echarts/__tests__/channelDonut.option.spec.ts src/views/reportsV2/tabs/ContatosTab.vue src/views/reportsV2/tabs/GeralTab.vue src/views/reportsV2/tabs/ColaboradoresTab.vue
git commit -m "feat(reports): ChannelDonut em ECharts + swap final do heatmap"
```

---

## Task 9: Validação visual + medição de bundle (CHECKPOINT)

**Files:** nenhum (verificação).

- [ ] **Step 1: Rodar a app e revisar todas as abas**

Run: `npm run dev`
Abrir cada aba e conferir os gráficos migrados: Geral (donut, barra, heatmap), Contatos (donut, multi-linha), Funil (multi-linha), Mensagens (multi-linha), Colaboradores (barra, linha, heatmap), Agendamentos (barra), Automações (barra), Broadcast (heatmap). Conferir cores da brand, tooltips, legendas, responsividade e que o **funil continua igual** (FunnelChartV2 intacto).

- [ ] **Step 2: Build de produção e conferir o bundle**

Run: `npm run build`
Expected: build OK. Anotar o tamanho do(s) chunk(s) que passam a conter ECharts e comparar com o baseline anterior (chart.js + @unovis). Registrar o número no vault.

- [ ] **Step 3: Decisão go/no-go** — validar com o time/CEO antes da limpeza das libs antigas (Task 10).

---

## Task 10: Limpeza (SÓ APÓS aprovação da Task 9)

Com tudo migrado e aprovado, remover os componentes antigos e as libs órfãs. `FunnelChartV2` e `funnel-graph-js` **permanecem**.

**Files:**
- Delete: `src/views/reportsV2/components/primitives/{Heatmap,TimeSeriesChart,SegmentedTimeSeriesChart,BarSeriesChart,ChannelDonut}.vue`
- Modify: `src/views/reportsV2/charts/chart.config.ts` (remover registro chart.js + `baseBarOptions`/`baseLineOptions` se não houver mais consumidores)
- Modify: `package.json`

- [ ] **Step 1: Confirmar que nada mais importa os componentes antigos**

Run: `grep -rEn "primitives/(Heatmap|TimeSeriesChart|SegmentedTimeSeriesChart|BarSeriesChart|ChannelDonut)\.vue" src`
Expected: nenhum resultado (todos os imports apontam para `primitives/echarts/`).

- [ ] **Step 2: Confirmar que `chart.js`/`@unovis` não têm mais consumidores**

Run: `grep -rEn "from '(chart\.js|vue-chartjs|@unovis/(ts|vue))'" src`
Expected: nenhum resultado.

- [ ] **Step 3: Apagar os componentes antigos**

```bash
git rm src/views/reportsV2/components/primitives/Heatmap.vue \
       src/views/reportsV2/components/primitives/TimeSeriesChart.vue \
       src/views/reportsV2/components/primitives/SegmentedTimeSeriesChart.vue \
       src/views/reportsV2/components/primitives/BarSeriesChart.vue \
       src/views/reportsV2/components/primitives/ChannelDonut.vue
```

- [ ] **Step 4: Remover as libs órfãs**

Run: `npm uninstall chart.js vue-chartjs @unovis/ts @unovis/vue`
Expected: removidas do `package.json`. (`funnel-graph-js` permanece — serve o FunnelChartV2.)

- [ ] **Step 5: Typecheck + testes + build**

Run: `npm run typecheck && npm run test:run -- reportsV2 && npm run build`
Expected: tudo PASS; build OK e menor.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(reports): remove chart.js/@unovis e componentes de grafico legados"
```

---

## Self-Review

- **Cobertura do escopo:** os 5 tipos de gráfico baseados em lib (heatmap, linha, multi-linha, barra+MA, donut) têm task de migração; FunnelChartV2 e hand-rolled explicitamente fora. ✓
- **Imports mapeados:** os 13 sites de import nas 8 tabs estão cobertos (Heatmap: Broadcast/Colaboradores/Geral; Bar: Agendamentos/Automacoes/Colaboradores/Geral; Line: Colaboradores; Segmented: Contatos/Funil/Mensagens; Donut: Contatos/Geral). ✓
- **Sem placeholders:** todo step de código traz o código real; todo comando traz output esperado. ✓
- **Consistência de tipos:** builders recebem os contracts existentes (`TimeSeries`, `SegmentedTimeSeries`, `HeatmapData`, `RankingEntry`); wrappers mantêm as mesmas props dos componentes atuais (drop-in). ✓
- **Tema:** `tokens.ts` é a fonte única de cor para ambas as libs durante a transição; ECharts não puxa chart.js. ✓
- **Rollback:** componentes antigos preservados até a Task 10; reverter = apontar o import de volta. ✓

## Riscos / Notas

- **happy-dom + canvas:** ECharts desenha em canvas, que o happy-dom não implementa. Por isso os testes cobrem os **builders puros** (`buildXOption`), não o render. Os wrappers `.vue` são finos e validados no navegador (Tasks 4/9).
- **Total central do donut:** ECharts pie não tem `central-label` nativo simples; usamos overlay absoluto no `.vue` (Task 8) — replica o comportamento do Unovis.
- **`autoresize`:** o `vue-echarts` precisa do atributo `autoresize` + um container com altura definida (todas as wrappers usam `h-[...]`).
- **Compliance CLAUDE.md (front):** componentes próprios usam tokens de **escala** (`text-gray-1000`, `bg-gray-100`), nunca semânticos; ordem SFC `<template>`→`<script>`; `<script setup lang="ts">`. Os wrappers acima já seguem.
