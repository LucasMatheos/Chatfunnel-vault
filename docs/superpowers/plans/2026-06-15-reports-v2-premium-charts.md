# Relatórios V2 — Camada visual premium (fatia Geral) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o motor Chart.js dos relatórios por `@unovis/vue` e elevar a aba Geral à direção visual premium aprovada (KPIs com sparkline+delta, barras com gradiente/animação, enquadramento editorial), sem alterar contratos, services, composables nem a estrutura das abas.

**Architecture:** Os gráficos são *primitives* isolados que consomem tipos de `@chatfunnel/contracts`. Reescrevemos o miolo de cada primitive preservando suas props (drop-in) — as abas não mudam. A lógica de transformação de dados é extraída para funções puras (testáveis via Vitest); o wiring visual do Unovis é verificado por typecheck + Storybook (Unovis mede o DOM real, então asserts de SVG no happy-dom são frágeis e evitados de propósito). `prefers-reduced-motion` desliga as animações via `@vueuse/core`.

**Tech Stack:** Vue 3.5 `<script setup lang="ts">`, `@unovis/vue` ^1.6.4 (já instalado), Tailwind v4 (tokens de escala), `@vueuse/core` (`usePreferredReducedMotion`), Vitest + `@testing-library/vue` (happy-dom), Storybook 10.

**Repo:** `chatfunnel-front/` (sub-repo → exige branch `feature/*`).

**Spec:** `docs/superpowers/specs/2026-06-15-reports-v2-premium-charts-design.md`

---

## Escopo desta fatia

**Entrega (aba Geral):**
- `MetricCard.vue` — sparkline + elevação editorial.
- `Sparkline.vue` — novo primitive (SVG puro).
- `BarSeriesChart.vue` — migração Chart.js → Unovis (é o gráfico que a Geral mostra em "Entrada de leads").
- `Heatmap.vue` — restyle leve com rampa de cor da brand.
- `ReportSection.vue` — enquadramento editorial (divisores finos, respiro).
- `chart.theme.ts` — novo módulo de helpers Unovis (cores reaproveitadas de `chart.config.ts`).
- `TimeSeriesChart.vue` — primitive de referência área+linha (peça-chave da direção premium; a Geral não a monta, então verificada via Storybook — estabelece o padrão p/ a propagação).

**Fora desta fatia (propagação posterior):** `SegmentedTimeSeriesChart`, `AgingChart`, `RankingList`, `ComparisonTable`, demais 7 abas, `FunnelChartV2` (lib dedicada, intacta). `chart.config.ts` permanece para os primitives ainda em Chart.js.

**Decisões de escopo confirmadas:**
- A Geral usa a `ReportsFilterBar` global → **sem** seletor `7d/30d/90d` por seção nesta fatia.
- `chart.config.ts` **não** é renomeado: ele ainda registra módulos Chart.js usados pelos primitives não migrados. Criamos `chart.theme.ts` ao lado.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/views/reportsV2/charts/chart.theme.ts` | **Criar.** Helpers Unovis: re-export de cores, `formatAxisDate`, `numberTickFormat`, `AREA_GRADIENT_STOPS`. Zero Chart.js. |
| `src/views/reportsV2/charts/__tests__/chart.theme.spec.ts` | **Criar.** Testa `formatAxisDate` e `numberTickFormat`. |
| `src/views/reportsV2/components/primitives/Sparkline.vue` | **Criar.** SVG puro a partir de `number[]`. |
| `src/views/reportsV2/components/primitives/sparkline.path.ts` | **Criar.** Função pura `sparklinePath(values, w, h)`. |
| `src/views/reportsV2/components/primitives/__tests__/sparkline.path.spec.ts` | **Criar.** Testa `sparklinePath`. |
| `src/views/reportsV2/components/primitives/MetricCard.vue` | **Modificar.** Renderiza `<Sparkline>` quando `metric.sparkline` existe; elevação visual. |
| `src/views/reportsV2/components/primitives/BarSeriesChart.vue` | **Reescrever miolo.** Unovis `VisXYContainer`+`VisStackedBar`(+`VisLine` média móvel). Mesma prop `{ data: TimeSeries; label?: string }`. |
| `src/views/reportsV2/components/primitives/BarSeriesChart.stories.ts` | **Criar.** Story Storybook p/ verificação visual. |
| `src/views/reportsV2/components/primitives/TimeSeriesChart.vue` | **Reescrever miolo.** Unovis área+linha+gradiente+glow+crosshair+draw-in. Mesma prop `{ data: TimeSeries; label?: string }`. |
| `src/views/reportsV2/components/primitives/TimeSeriesChart.stories.ts` | **Criar.** Story Storybook. |
| `src/views/reportsV2/components/primitives/Heatmap.vue` | **Modificar.** Rampa de cor da brand (sem mudar estrutura/props). |
| `src/views/reportsV2/components/shared/ReportSection.vue` | **Modificar.** Divisores finos + respiro; Skeleton espelha. |

**Sem mudança:** `GeralTab.vue` (primitives são drop-in), contratos, services, composables, `chart.config.ts`, `FunnelChartV2.vue`.

---

## Task 0: Branch

- [ ] **Step 1: Criar branch de feature no sub-repo**

Run:
```bash
cd chatfunnel-front && git checkout -b feature/reports-v2-premium-charts
```
Expected: `Switched to a new branch 'feature/reports-v2-premium-charts'`

---

## Task 1: Módulo de tema Unovis (`chart.theme.ts`)

**Files:**
- Create: `chatfunnel-front/src/views/reportsV2/charts/chart.theme.ts`
- Test: `chatfunnel-front/src/views/reportsV2/charts/__tests__/chart.theme.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// chart.theme.spec.ts
import { describe, it, expect } from 'vitest'
import { formatAxisDate, numberTickFormat } from '../chart.theme'

describe('formatAxisDate', () => {
  it('converte ISO truncado para DD/MM', () => {
    expect(formatAxisDate('2026-06-09')).toBe('09/06')
  })
  it('devolve o valor original quando não casa o padrão de data', () => {
    expect(formatAxisDate('semana 23')).toBe('semana 23')
  })
})

describe('numberTickFormat', () => {
  it('formata inteiros em pt-BR sem casas decimais', () => {
    expect(numberTickFormat(1847)).toBe('1.847')
  })
  it('arredonda para inteiro', () => {
    expect(numberTickFormat(47.6)).toBe('48')
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/charts/__tests__/chart.theme.spec.ts`
Expected: FAIL — `Failed to resolve import "../chart.theme"`.

- [ ] **Step 3: Implementar o módulo**

```ts
// chart.theme.ts
// Helpers de tema para os charts Unovis dos Relatórios V2. NÃO importa Chart.js
// (isso é responsabilidade do chart.config.ts legado). Cores são lidas dos tokens
// CSS em runtime para acompanhar light/dark.

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

// "2026-06-09" → "09/06". Usa as partes da string (sem new Date) p/ evitar shift
// de timezone. Devolve o original quando não casa o padrão ISO.
export function formatAxisDate(value: string | number): string {
  const str = String(value)
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str)
  return m ? `${m[3]}/${m[2]}` : str
}

// Inteiro em pt-BR para ticks do eixo Y e tooltips.
export function numberTickFormat(value: number): string {
  return Math.round(value).toLocaleString('pt-BR')
}

// Stops do gradiente vertical da área-herói (brand → transparente).
export const AREA_GRADIENT_STOPS = [
  { offset: '0%', opacity: 0.3 },
  { offset: '100%', opacity: 0 }
] as const
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/charts/__tests__/chart.theme.spec.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
cd chatfunnel-front && git add src/views/reportsV2/charts/chart.theme.ts src/views/reportsV2/charts/__tests__/chart.theme.spec.ts && git commit -m "feat(reports-v2): módulo de tema Unovis para os charts"
```

---

## Task 2: Função pura do path da sparkline

**Files:**
- Create: `chatfunnel-front/src/views/reportsV2/components/primitives/sparkline.path.ts`
- Test: `chatfunnel-front/src/views/reportsV2/components/primitives/__tests__/sparkline.path.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// sparkline.path.spec.ts
import { describe, it, expect } from 'vitest'
import { sparklinePath } from '../sparkline.path'

describe('sparklinePath', () => {
  it('mapeia o primeiro ponto na esquerda e o último na direita', () => {
    const d = sparklinePath([0, 10], 100, 20)
    // 2 pontos → x=0 e x=100; valores 0..10 → y=20 (min) e y=0 (max)
    expect(d).toBe('M0,20 L100,0')
  })
  it('normaliza valores constantes na metade da altura', () => {
    const d = sparklinePath([5, 5, 5], 100, 20)
    expect(d).toBe('M0,10 L50,10 L100,10')
  })
  it('devolve string vazia para menos de 2 pontos', () => {
    expect(sparklinePath([7], 100, 20)).toBe('')
    expect(sparklinePath([], 100, 20)).toBe('')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/components/primitives/__tests__/sparkline.path.spec.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar a função pura**

```ts
// sparkline.path.ts
// Gera o atributo `d` de um <polyline>/<path> de sparkline a partir de valores
// brutos, normalizando para o box (w × h). y é invertido (SVG: 0 = topo).
// Valores constantes ficam na metade da altura.
export function sparklinePath(values: number[], w: number, h: number): string {
  if (values.length < 2) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const stepX = w / (values.length - 1)
  return values
    .map((v, i) => {
      const x = Math.round(i * stepX)
      const y = span === 0 ? h / 2 : h - ((v - min) / span) * h
      return `${i === 0 ? 'M' : 'L'}${x},${Math.round(y * 100) / 100}`
    })
    .join(' ')
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/components/primitives/__tests__/sparkline.path.spec.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
cd chatfunnel-front && git add src/views/reportsV2/components/primitives/sparkline.path.ts src/views/reportsV2/components/primitives/__tests__/sparkline.path.spec.ts && git commit -m "feat(reports-v2): função pura sparklinePath"
```

---

## Task 3: Componente `Sparkline.vue`

**Files:**
- Create: `chatfunnel-front/src/views/reportsV2/components/primitives/Sparkline.vue`

- [ ] **Step 1: Implementar o componente (SVG puro, sem dependências)**

```vue
<template>
  <svg
    v-if="polylinePoints"
    class="block w-full"
    :height="height"
    viewBox="0 0 100 20"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <polyline
      :points="polylinePoints"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { sparklinePath } from './sparkline.path'

const props = withDefaults(defineProps<{ values: number[]; height?: number }>(), {
  height: 22
})

const d = computed(() => sparklinePath(props.values, 100, 20))
// <polyline> usa lista "x,y x,y"; derivamos do path "Mx,y Lx,y" trocando comandos por espaço.
const polylinePoints = computed(() => d.value.replace(/[ML]/g, ' ').trim())
</script>
```

- [ ] **Step 2: Verificar o typecheck**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit`
Expected: sem erros novos relativos a `Sparkline.vue`.

- [ ] **Step 3: Commit**

```bash
cd chatfunnel-front && git add src/views/reportsV2/components/primitives/Sparkline.vue && git commit -m "feat(reports-v2): primitive Sparkline (SVG puro)"
```

---

## Task 4: Elevar `MetricCard.vue` (sparkline + editorial)

**Files:**
- Modify: `chatfunnel-front/src/views/reportsV2/components/primitives/MetricCard.vue`

Contexto: `MetricCard` (contrato) = `{ value, format?, delta?: { absolute, percentage }, sparkline?: number[] }`. O componente atual já renderiza `value` e `delta`. Adicionamos a sparkline em teal e refinamos o visual mantendo tokens de **escala**.

- [ ] **Step 1: Substituir o template e o script**

Substituir todo o conteúdo de `MetricCard.vue` por:

```vue
<template>
  <div class="flex flex-col gap-2 rounded-cf-xl border border-gray-300 bg-gray-100 p-4">
    <span class="typo-body-12-regular text-gray-700">{{ label }}</span>
    <strong class="typo-header-24-bold font-mono tabular-nums text-gray-1000">
      {{ formattedValue }}
    </strong>

    <div class="flex items-end justify-between gap-3">
      <span
        v-if="metric.delta"
        class="typo-body-12-semibold inline-flex items-center gap-1"
        :class="deltaUp ? 'text-green-500' : 'text-red-500'"
        :data-trend="deltaUp ? 'up' : 'down'"
      >
        <component :is="deltaUp ? TrendingUp : TrendingDown" class="size-3.5" />
        {{ formattedDelta }}%
      </span>
      <span v-else-if="note" class="typo-body-10-regular text-gray-700">{{ note }}</span>

      <Sparkline
        v-if="metric.sparkline && metric.sparkline.length > 1"
        :values="metric.sparkline"
        class="max-w-[96px] text-brand-500"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { TrendingUp, TrendingDown } from 'lucide-vue-next'
import type { MetricCard as MetricCardData } from '@chatfunnel/contracts'
import { formatMetricValue } from '../../utils/format'
import Sparkline from './Sparkline.vue'

const props = defineProps<{ label: string; metric: MetricCardData; note?: string }>()

const formattedValue = computed(() => formatMetricValue(props.metric.value, props.metric.format))
const deltaUp = computed(() => (props.metric.delta?.percentage ?? 0) >= 0)
const formattedDelta = computed(() =>
  Math.abs(props.metric.delta?.percentage ?? 0).toLocaleString('pt-BR', {
    maximumFractionDigits: 1
  })
)
</script>
```

> Nota de design: trocamos o fundo verde/vermelho do card inteiro (atual) por fundo neutro `bg-gray-100` + cor só no delta e na sparkline — alinha com "1 acento + neutros" da direção premium. O `data-trend` é preservado.

- [ ] **Step 2: Verificar typecheck**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit`
Expected: sem erros novos em `MetricCard.vue`.

- [ ] **Step 3: Rodar a suíte de relatórios**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2`
Expected: PASS. Se algum teste existente asserir as classes de fundo verde/vermelho do card, ajustar o assert para `data-trend`.

- [ ] **Step 4: Commit**

```bash
cd chatfunnel-front && git add src/views/reportsV2/components/primitives/MetricCard.vue && git commit -m "feat(reports-v2): MetricCard com sparkline e visual editorial"
```

---

## Task 5: Migrar `BarSeriesChart.vue` para Unovis

**Files:**
- Modify (reescrever miolo): `chatfunnel-front/src/views/reportsV2/components/primitives/BarSeriesChart.vue`
- Create: `chatfunnel-front/src/views/reportsV2/components/primitives/BarSeriesChart.stories.ts`

A lógica de média móvel (SMA trailing) e a janela por granularidade são **preservadas** (idênticas ao componente legado). Só troca o motor de render. Props inalteradas: `{ data: TimeSeries; label?: string }`.

- [ ] **Step 1: Reescrever o componente**

```vue
<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-end gap-2">
      <label :for="toggleId" class="typo-body-12-regular cursor-pointer select-none text-gray-700">
        Média móvel
      </label>
      <SwitchControl :id="toggleId" v-model:checked="showMovingAverage" />
    </div>
    <div class="relative h-[260px] w-full">
      <VisXYContainer :data="points" :height="260" :duration="duration" :margin="margin">
        <VisStackedBar
          :x="xAccessor"
          :y="barAccessor"
          color="var(--color-brand-500)"
          :roundedCorners="4"
          :barMaxWidth="40"
        />
        <VisLine
          v-if="showMovingAverage"
          :x="xAccessor"
          :y="maAccessor"
          color="var(--color-gray-1000)"
          :lineWidth="2"
        />
        <VisAxis type="x" :tickFormat="xTickFormat" :gridLine="false" :numTicks="6" />
        <VisAxis type="y" :tickFormat="numberTickFormat" :numTicks="4" />
        <VisCrosshair :template="tooltipTemplate" color="var(--color-brand-500)" />
        <VisTooltip />
      </VisXYContainer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { VisXYContainer, VisStackedBar, VisLine, VisAxis, VisCrosshair, VisTooltip } from '@unovis/vue'
import { usePreferredReducedMotion } from '@vueuse/core'
import type { TimeSeries } from '@chatfunnel/contracts'
import { formatAxisDate, numberTickFormat } from '../../charts/chart.theme'
import { SwitchControl } from '@/components/ui/switch'

const props = defineProps<{ data: TimeSeries; label?: string }>()

const toggleId = useId()
const showMovingAverage = ref(false)
const margin = { top: 8, right: 8, bottom: 24, left: 36 }

// Sem animação quando o usuário pediu menos movimento.
const reducedMotion = usePreferredReducedMotion()
const duration = computed(() => (reducedMotion.value === 'reduce' ? 0 : 1000))

// Janela da média móvel por granularidade (idêntica ao comportamento legado).
const maWindow = computed(() => {
  switch (props.data.granularity) {
    case 'day':
      return 7
    case 'week':
      return 4
    default:
      return 3
  }
})

// SMA trailing — preservado do componente legado.
const movingAverage = computed(() => {
  const values = props.data.series.map((p) => p.value)
  const w = maWindow.value
  return values.map((_, i) => {
    const start = Math.max(0, i - w + 1)
    const window = values.slice(start, i + 1)
    const sum = window.reduce((acc, v) => acc + v, 0)
    return Math.round((sum / window.length) * 10) / 10
  })
})

// Estrutura de ponto p/ Unovis: índice + valor + média + label de exibição.
interface BarPoint {
  index: number
  value: number
  ma: number
  display: string
}

const points = computed<BarPoint[]>(() =>
  props.data.series.map((p, i) => ({
    index: i,
    value: p.value,
    ma: movingAverage.value[i],
    display: p.label ?? formatAxisDate(p.date)
  }))
)

const xAccessor = (d: BarPoint) => d.index
const barAccessor = (d: BarPoint) => d.value
const maAccessor = (d: BarPoint) => d.ma
const xTickFormat = (i: number) => points.value[i]?.display ?? ''

function tooltipTemplate(d: BarPoint): string {
  const labelText = props.label ?? 'Leads'
  return `<div class="typo-body-12-regular"><strong>${d.display}</strong><br/>${labelText}: ${numberTickFormat(
    d.value
  )}</div>`
}
</script>
```

> Nota: `VisStackedBar` com uma série única equivale a barras simples e dá o agrupamento por índice. `roundedCorners`/`barMaxWidth`/`numTicks` são props do Unovis 1.6 — o executor deve confirmar os nomes exatos contra os tipos de `@unovis/vue` instalados e ajustar se a major divergir.

- [ ] **Step 2: Criar a story do Storybook**

```ts
// BarSeriesChart.stories.ts
import type { Meta, StoryObj } from '@storybook/vue3'
import BarSeriesChart from './BarSeriesChart.vue'

const meta: Meta<typeof BarSeriesChart> = {
  title: 'ReportsV2/BarSeriesChart',
  component: BarSeriesChart
}
export default meta

export const Diario: StoryObj<typeof BarSeriesChart> = {
  args: {
    label: 'Leads',
    data: {
      granularity: 'day',
      series: [
        { date: '2026-06-01', value: 42 },
        { date: '2026-06-02', value: 58 },
        { date: '2026-06-03', value: 37 },
        { date: '2026-06-04', value: 71 },
        { date: '2026-06-05', value: 64 },
        { date: '2026-06-06', value: 89 },
        { date: '2026-06-07', value: 76 }
      ]
    }
  }
}
```

- [ ] **Step 3: Verificar typecheck**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit`
Expected: sem erros novos. Se algum nome de prop do Unovis não existir, o typecheck acusa — ajustar conforme os tipos instalados.

- [ ] **Step 4: Verificação visual no Storybook**

Run: `cd chatfunnel-front && npm run storybook`
Abrir `ReportsV2/BarSeriesChart › Diario`. Confirmar: barras teal com cantos arredondados, animação de entrada, tooltip no hover, toggle de média móvel desenha a linha escura.

- [ ] **Step 5: Commit**

```bash
cd chatfunnel-front && git add src/views/reportsV2/components/primitives/BarSeriesChart.vue src/views/reportsV2/components/primitives/BarSeriesChart.stories.ts && git commit -m "refactor(reports-v2): BarSeriesChart com Unovis (gradiente, animação, tooltip)"
```

---

## Task 6: Migrar `TimeSeriesChart.vue` para Unovis (área-herói)

**Files:**
- Modify (reescrever miolo): `chatfunnel-front/src/views/reportsV2/components/primitives/TimeSeriesChart.vue`
- Create: `chatfunnel-front/src/views/reportsV2/components/primitives/TimeSeriesChart.stories.ts`

Esta é a peça-herói da direção premium: área com gradiente da brand, glow leve na linha, draw-in no mount, crosshair/tooltip no hover. Props inalteradas: `{ data: TimeSeries; label?: string }`.

- [ ] **Step 1: Reescrever o componente**

```vue
<template>
  <div class="cf-area-chart relative h-[260px] w-full">
    <!-- defs do gradiente: id único por instância p/ múltiplos charts na mesma página -->
    <svg class="absolute h-0 w-0" aria-hidden="true">
      <defs>
        <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--color-brand-500)" stop-opacity="0.3" />
          <stop offset="100%" stop-color="var(--color-brand-500)" stop-opacity="0" />
        </linearGradient>
      </defs>
    </svg>

    <VisXYContainer :data="points" :height="260" :duration="duration" :margin="margin">
      <VisArea :x="xAccessor" :y="yAccessor" :color="`url(#${gradientId})`" />
      <VisLine :x="xAccessor" :y="yAccessor" color="var(--color-brand-500)" :lineWidth="2.5" />
      <VisAxis type="x" :tickFormat="xTickFormat" :gridLine="false" :numTicks="6" />
      <VisAxis type="y" :tickFormat="numberTickFormat" :numTicks="4" />
      <VisCrosshair :template="tooltipTemplate" color="var(--color-brand-500)" />
      <VisTooltip />
    </VisXYContainer>
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { VisXYContainer, VisArea, VisLine, VisAxis, VisCrosshair, VisTooltip } from '@unovis/vue'
import { usePreferredReducedMotion } from '@vueuse/core'
import type { TimeSeries } from '@chatfunnel/contracts'
import { formatAxisDate, numberTickFormat } from '../../charts/chart.theme'

const props = defineProps<{ data: TimeSeries; label?: string }>()

const gradientId = `cf-area-grad-${useId()}`
const margin = { top: 8, right: 8, bottom: 24, left: 36 }

const reducedMotion = usePreferredReducedMotion()
const duration = computed(() => (reducedMotion.value === 'reduce' ? 0 : 1400))

interface SeriesPoint {
  index: number
  value: number
  display: string
}

const points = computed<SeriesPoint[]>(() =>
  props.data.series.map((p, i) => ({
    index: i,
    value: p.value,
    display: p.label ?? formatAxisDate(p.date)
  }))
)

const xAccessor = (d: SeriesPoint) => d.index
const yAccessor = (d: SeriesPoint) => d.value
const xTickFormat = (i: number) => points.value[i]?.display ?? ''

function tooltipTemplate(d: SeriesPoint): string {
  const labelText = props.label ?? 'Total'
  return `<div class="typo-body-12-regular"><strong>${d.display}</strong><br/>${labelText}: ${numberTickFormat(
    d.value
  )}</div>`
}
</script>

<style scoped>
/* Glow na linha gerada pelo Unovis (SVG fora do alcance do Tailwind, mesmo padrão
   de exceção do FunnelChartV2). Confirmar a classe `.vis-line` contra o DOM
   renderizado pela versão instalada do @unovis/vue. */
.cf-area-chart :deep(.vis-line) {
  filter: drop-shadow(0 0 4px color-mix(in oklab, var(--color-brand-500) 55%, transparent));
}
</style>
```

- [ ] **Step 2: Criar a story do Storybook**

```ts
// TimeSeriesChart.stories.ts
import type { Meta, StoryObj } from '@storybook/vue3'
import TimeSeriesChart from './TimeSeriesChart.vue'

const meta: Meta<typeof TimeSeriesChart> = {
  title: 'ReportsV2/TimeSeriesChart',
  component: TimeSeriesChart
}
export default meta

export const Receita: StoryObj<typeof TimeSeriesChart> = {
  args: {
    label: 'Receita',
    data: {
      granularity: 'day',
      series: [
        { date: '2026-06-01', value: 3200 },
        { date: '2026-06-02', value: 4100 },
        { date: '2026-06-03', value: 3850 },
        { date: '2026-06-04', value: 5300 },
        { date: '2026-06-05', value: 4950 },
        { date: '2026-06-06', value: 6420 },
        { date: '2026-06-07', value: 5870 }
      ]
    }
  }
}
```

- [ ] **Step 3: Verificar typecheck**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 4: Verificação visual no Storybook**

Abrir `ReportsV2/TimeSeriesChart › Receita`. Confirmar: gradiente teal sob a linha, glow leve, draw-in ao montar, tooltip + crosshair no hover. Validar `prefers-reduced-motion` (DevTools → Rendering → Emulate CSS prefers-reduced-motion: reduce) → sem animação de entrada.

- [ ] **Step 5: Commit**

```bash
cd chatfunnel-front && git add src/views/reportsV2/components/primitives/TimeSeriesChart.vue src/views/reportsV2/components/primitives/TimeSeriesChart.stories.ts && git commit -m "refactor(reports-v2): TimeSeriesChart área-herói com Unovis (gradiente, glow, draw-in)"
```

---

## Task 7: Polir a rampa de cor do `Heatmap.vue`

**Files:**
- Modify: `chatfunnel-front/src/views/reportsV2/components/primitives/Heatmap.vue`

Contexto (arquivo já lido): o Heatmap **já usa** a brand com rampa via `opacity`
(`cellStyle`). Polimento: trocar a rampa de `opacity` por `color-mix`, para a
célula manter opacidade total (bordas mais crispas) e a intensidade ficar no
canal de cor. Isso também **remove o import de `chart.config`** (decopla o
Heatmap do módulo Chart.js legado, usando o token CSS diretamente). Estrutura,
props (`data`, `valueFormat`) e acessibilidade (`title`) ficam idênticas.

- [ ] **Step 1: Remover o import e a constante da brand**

No `<script setup>`, apagar estas duas linhas:
```ts
import { getBrandColor } from '../../charts/chart.config'
```
```ts
const brand = getBrandColor()
```

- [ ] **Step 2: Substituir `cellStyle`**

Trocar a função atual:
```ts
function cellStyle(value: number): Record<string, string> {
  const a = intensity(value)
  return {
    backgroundColor: a === 0 ? 'var(--color-gray-300, #F2F2F2)' : brand,
    opacity: a === 0 ? '1' : String(0.15 + a * 0.85)
  }
}
```
por:
```ts
function cellStyle(value: number): Record<string, string> {
  const a = intensity(value)
  if (a === 0) return { backgroundColor: 'var(--color-gray-300, #F2F2F2)' }
  // Rampa da brand via color-mix → célula mantém opacidade total (bordas crispas);
  // intensidade no canal de cor, não no opacity. Piso 0.12 p/ valores baixos > 0.
  const pct = Math.round((0.12 + a * 0.88) * 100)
  return { backgroundColor: `color-mix(in oklab, var(--color-brand-500) ${pct}%, transparent)` }
}
```

- [ ] **Step 3: Verificar typecheck + testes**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit && npx vitest run src/views/reportsV2`
Expected: sem erros novos; testes existentes do Heatmap (se houver) seguem verdes.

- [ ] **Step 4: Commit**

```bash
cd chatfunnel-front && git add src/views/reportsV2/components/primitives/Heatmap.vue && git commit -m "feat(reports-v2): Heatmap com rampa da brand via color-mix"
```

---

## Task 8: Enquadramento editorial no `ReportSection.vue`

**Files:**
- Modify: `chatfunnel-front/src/views/reportsV2/components/shared/ReportSection.vue`

Objetivo: respiro maior e divisor fino entre header e conteúdo. Contexto (arquivo
já lido): props são `{ title, loading?, error?, empty?, mock? }`; slots `#actions`
e default; estados loading (`ReportSkeleton`) / error / empty. Tudo isso é
**preservado** — só muda o enquadramento (header com `border-b` + corpo com
padding próprio, em vez de um único `p-4`).

- [ ] **Step 1: Substituir o `<template>`**

Trocar todo o `<template>` por (script inalterado):
```vue
<template>
  <section class="flex flex-col rounded-cf-xxl border border-gray-400 bg-gray-100">
    <header class="flex items-center justify-between gap-2 border-b border-gray-300 px-5 py-4">
      <div class="flex items-center gap-2">
        <h3 class="typo-body-14-semibold text-gray-1000">{{ title }}</h3>
        <Badge v-if="mock" color="gray" size="xs" hierarchy="outlined">Dados de exemplo</Badge>
      </div>
      <slot name="actions" />
    </header>

    <div class="p-5">
      <ReportSkeleton v-if="loading" />
      <p v-else-if="error" class="typo-body-12-regular py-6 text-center text-red-400">
        Não foi possível carregar estes dados.
      </p>
      <p v-else-if="empty" class="typo-body-12-regular py-6 text-center text-gray-1000">
        Nenhum dado para o período selecionado.
      </p>
      <slot v-else />
    </div>
  </section>
</template>
```

> Não tocar no `<script setup>` (props/imports idênticos). Nenhuma mudança em `GeralTab.vue`.

- [ ] **Step 2: Verificar typecheck + testes da seção**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit && npx vitest run src/views/reportsV2/components/shared/__tests__/ReportSection.spec.ts`
Expected: PASS. Se algum teste asserir uma classe de container alterada, ajustar o assert para refletir o novo enquadramento (sem mudar a semântica testada: presença de título, estados, slot actions).

- [ ] **Step 3: Commit**

```bash
cd chatfunnel-front && git add src/views/reportsV2/components/shared/ReportSection.vue && git commit -m "feat(reports-v2): enquadramento editorial no ReportSection"
```

---

## Task 9: Verificação ponta-a-ponta da aba Geral

**Files:** nenhum (apenas verificação; `GeralTab.vue` não muda — primitives são drop-in).

- [ ] **Step 1: Typecheck completo**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit`
Expected: sem erros.

- [ ] **Step 2: Suíte de testes dos relatórios**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2`
Expected: PASS (incluindo `chart.theme.spec.ts` e `sparkline.path.spec.ts`).

- [ ] **Step 3: Lint**

Run: `cd chatfunnel-front && npm run lint`
Expected: sem erros (warnings de auto-fix aceitáveis).

- [ ] **Step 4: Verificação manual no app**

Run: `cd chatfunnel-front && npm run dev` → abrir Relatórios → aba **Geral**. Conferir:
- "Visão geral": cards com número grande tabular, delta verde/vermelho e sparkline teal (quando o backend envia `sparkline`/`delta`); ausência deles não quebra o layout.
- "Entrada de leads": barras Unovis teal com animação + tooltip; toggle de média móvel funciona.
- "Atividade por horário": heatmap com rampa da brand.
- Seções com divisores finos e respiro (enquadramento editorial).
- DevTools → emular `prefers-reduced-motion: reduce` → sem animação de entrada.

- [ ] **Step 5: Confirmar que a Geral não importa mais Chart.js**

Run: `cd chatfunnel-front && rg "vue-chartjs|chart.config" src/views/reportsV2/components/primitives/BarSeriesChart.vue src/views/reportsV2/components/primitives/TimeSeriesChart.vue`
Expected: sem resultados (ambos migrados). `chart.config.ts` segue existindo para os primitives ainda em Chart.js (SegmentedTimeSeriesChart etc.).

- [ ] **Step 6: Commit final da fatia (se houver ajustes pendentes)**

```bash
cd chatfunnel-front && git add -A && git commit -m "test(reports-v2): verificação da fatia premium da aba Geral"
```

---

## Notas de propagação (fora desta fatia)

Depois da validação da Geral, repetir o padrão Unovis para `SegmentedTimeSeriesChart` (áreas empilhadas, paleta semântica WON/LOST/BOT/ASSISTANT já mapeada), `AgingChart`, `RankingList` e as demais abas — uma por vez, cada uma com sua story de Storybook. `chart.config.ts` (Chart.js) só é removido quando o último primitive sair dele.
