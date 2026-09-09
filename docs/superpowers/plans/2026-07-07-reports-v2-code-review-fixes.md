# Reports V2 — Correções do Code Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolver todos os achados acionáveis do code review de `chatfunnel-front/src/views/reportsV2` — testes vermelhos, violações de convenção e polimentos — sem alterar comportamento correto já existente.

**Architecture:** Correções pontuais e independentes sobre a feature Reports V2 já entregue. Nenhuma refatoração estrutural. Cada task é um diff pequeno e testável isoladamente, agrupado por severidade (bloqueadores → importantes → polimento).

**Tech Stack:** Vue 3.5 `<script setup lang="ts">`, Tailwind v4 + shadcn-vue (Reka UI), `@phosphor-icons/vue`, `vue-echarts` (ECharts 6), Vitest + happy-dom + `@vue/test-utils`.

## Contexto: achado descartado (NÃO implementar)

O reviewer marcou como **Critical** "valores monetários exibidos 100× inflados — não existe `centavosToReais`". **Isto é falso positivo.** O grep do reviewer foi escopado só a `src/views/reportsV2/`; a normalização existe e está completa na borda do service, fora do diretório revisado:

- `src/common/services/ReportsV2Service.ts:31` — `function centavosToReais(v) { return v / 100 }`
- `:55` `normalizeCurrencyCard()` aplicado em `getRevenueCard` (`:172`) e `getRevenueForecast` (`:247`)
- `:140` `getFunnelOverview` normaliza **todo** card com `format === "currency"` num loop (cobre "Receita do funil (período)" do GeralTab)
- `:201` `getCrmRevenue` divide cada ponto; `:233-236` `getPerformanceBySeller` divide `total` e cada `entry.value` (alimenta a coluna "Receita" do `FunilTab`)

Os únicos outros `MetricCard` (`getAgentsAvgSessionDuration`, `getAiHoursSaved`) não são `currency`. Custos de IA usam `formatUsd` (USD cru, sem `/100`, correto). **Conclusão: nenhuma correção de moeda é necessária.** Não crie task para isso.

---

## Global Constraints

Copiadas verbatim de `chatfunnel-front/CLAUDE.md` e `.claude/rules/10-frontend-design-quality.md`. Todo task herda estas regras:

- **Ícones:** SOMENTE `@phosphor-icons/vue`. NUNCA Lucide, FontAwesome, MDI.
- **Tokens de cor:** em componentes próprios (`views/reportsV2`) use tokens de ESCALA (`bg-gray-100`, `text-gray-1000`, `bg-brand-500`, `text-green-500`) — NUNCA semânticos (`bg-background`, `text-card`, etc.). NUNCA hardcode hex/rgba fora dos tokens de `src/assets/tailwind/`.
- **Styling:** Tailwind utilities, nunca `<style scoped>` para layout/cor. Tailwind v4: `!` vai no FINAL da classe (`shadow-none!`).
- **Texto user-facing:** pt-BR com acentuação correta.
- **SFC:** `<script setup lang="ts">`; ordem `<template>` → `<script>` → `<style>`.
- **Testes:** Vitest + happy-dom, arquivo `*.spec.ts` junto ao componente. Rodar com `npx vitest run <path>`.
- **Git:** NUNCA commitar sem pedido explícito do usuário; NUNCA `Co-Authored-By`. Trabalhar sempre em branch (já estamos em `fix/report-v2-mateus-pediu`). Mensagens em pt-BR, seguindo o estilo do repo.
- **Prettier:** sem `;`, aspas simples, `printWidth 100`, sem trailing comma.

---

## FASE 1 — Bloqueadores (suíte de testes vermelha)

Verificado com `npx vitest run`: os dois arquivos abaixo falham hoje contra a implementação real.

### Task 1: Corrigir vocabulário de `dataType` em reportInfo.spec.ts

O componente ships `dataType: "periodo" | "estadoAtual" | "ultimos30dias"` (`info/reportInfo.ts:6`), mas o teste assere o vocabulário abandonado `tempoReal`.

**Files:**
- Modify/Test: `chatfunnel-front/src/views/reportsV2/info/__tests__/reportInfo.spec.ts:15`

**Interfaces:**
- Consumes: `REPORT_INFO`, `getReportInfo` de `../reportInfo` (union `dataType` = `"periodo" | "estadoAtual" | "ultimos30dias"`).
- Produces: nada (só teste).

- [ ] **Step 1: Rodar o teste para confirmar que falha**

Run: `npx vitest run src/views/reportsV2/info/__tests__/reportInfo.spec.ts`
Expected: FAIL — `expected [ 'periodo', 'tempoReal' ] to contain 'ultimos30dias'` (ou `'estadoAtual'`).

- [ ] **Step 2: Atualizar a lista de dataTypes válidos**

Em `reportInfo.spec.ts`, trocar a linha 15:

```ts
      expect(["periodo", "tempoReal"]).toContain(entry.dataType);
```

por:

```ts
      expect(["periodo", "estadoAtual", "ultimos30dias"]).toContain(entry.dataType);
```

- [ ] **Step 3: Rodar o teste para confirmar verde**

Run: `npx vitest run src/views/reportsV2/info/__tests__/reportInfo.spec.ts`
Expected: PASS (2 testes).

- [ ] **Step 4: Commit**

```bash
git add src/views/reportsV2/info/__tests__/reportInfo.spec.ts
git commit -m "test(reports-v2): corrige vocabulario dataType em reportInfo.spec"
```

---

### Task 2: Reescrever InfoPopover.spec.ts para o contrato real (`estadoAtual`/`ultimos30dias`)

O spec mocka `dataType: "tempoReal"` e assere textos ("Tempo real", "Estado atual — ignora o filtro de período") que o componente NÃO renderiza. O `InfoPopover.vue` real (verificado) renderiza:
- Badge `Estado atual` **apenas** quando `dataType === 'estadoAtual'`.
- Linha de dependência: `'Estado atual, não reage ao filtro de período'` (estadoAtual), `'Últimos 30 dias'` (ultimos30dias), `'Depende do período selecionado'` (periodo).

**Files:**
- Modify/Test: `chatfunnel-front/src/views/reportsV2/components/shared/__tests__/InfoPopover.spec.ts`
- Reference (não editar): `chatfunnel-front/src/views/reportsV2/components/shared/InfoPopover.vue`

**Interfaces:**
- Consumes: `InfoPopover` (prop `infoKey: ReportInfoKey`), mock de `getReportInfo`.
- Produces: nada (só teste).

- [ ] **Step 1: Rodar para confirmar falha**

Run: `npx vitest run src/views/reportsV2/components/shared/__tests__/InfoPopover.spec.ts`
Expected: FAIL nos casos "Tempo real" e "Estado atual — ignora...".

- [ ] **Step 2: Substituir o arquivo inteiro pelo conteúdo abaixo**

```ts
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import InfoPopover from "../InfoPopover.vue";
import type { ReportInfoKey } from "../../../info/reportInfo";

vi.mock("../../../info/reportInfo", () => ({
  getReportInfo: (key: string) =>
    ({
      "test.periodo": {
        title: "Métrica X",
        description: "Descrição da métrica X.",
        dataType: "periodo",
      },
      "test.estadoAtual": {
        title: "Métrica Y",
        description: "Descrição da métrica Y.",
        dataType: "estadoAtual",
      },
      "test.ultimos30dias": {
        title: "Métrica Z",
        description: "Descrição da métrica Z.",
        dataType: "ultimos30dias",
      },
    })[key],
}));

const periodo = "test.periodo" as unknown as ReportInfoKey;
const estadoAtual = "test.estadoAtual" as unknown as ReportInfoKey;
const ultimos30dias = "test.ultimos30dias" as unknown as ReportInfoKey;

// Stubs dos wrappers do Popover que renderizam o slot inline. Assim verificamos a
// MARCAÇÃO/LÓGICA do InfoPopover (descrição + linha de dependência) sem depender do
// comportamento de abrir/fechar + portal do reka-ui (que exige floating-ui no DOM).
const popoverStubs = {
  Popover: { template: "<div><slot /></div>" },
  PopoverTrigger: { template: "<div><slot /></div>" },
  PopoverContent: { template: "<div><slot /></div>" },
};

function mountInfo(infoKey: ReportInfoKey) {
  return mount(InfoPopover, {
    props: { infoKey },
    global: { stubs: popoverStubs },
  });
}

describe("InfoPopover", () => {
  it('mostra o selo "Estado atual" quando dataType é estadoAtual', () => {
    const wrapper = mountInfo(estadoAtual);
    expect(wrapper.text()).toContain("Estado atual");
  });

  it("não mostra o selo quando dataType é periodo", () => {
    const wrapper = mountInfo(periodo);
    expect(wrapper.text()).not.toContain("Estado atual");
  });

  it("o trigger tem aria-label com o título", () => {
    const wrapper = mountInfo(periodo);
    expect(wrapper.get("button").attributes("aria-label")).toContain(
      "Métrica X"
    );
  });

  it('mostra título, descrição e a dependência "período"', () => {
    const wrapper = mountInfo(periodo);
    expect(wrapper.text()).toContain("Métrica X");
    expect(wrapper.text()).toContain("Descrição da métrica X.");
    expect(wrapper.text()).toContain("Depende do período selecionado");
  });

  it("mostra a dependência de estado atual", () => {
    const wrapper = mountInfo(estadoAtual);
    expect(wrapper.text()).toContain(
      "Estado atual, não reage ao filtro de período"
    );
  });

  it('mostra a dependência "Últimos 30 dias"', () => {
    const wrapper = mountInfo(ultimos30dias);
    expect(wrapper.text()).toContain("Últimos 30 dias");
  });
});
```

- [ ] **Step 3: Rodar para confirmar verde**

Run: `npx vitest run src/views/reportsV2/components/shared/__tests__/InfoPopover.spec.ts`
Expected: PASS (6 testes).

- [ ] **Step 4: Rodar toda a suíte reportsV2 para garantir que nada mais quebrou**

Run: `npx vitest run src/views/reportsV2`
Expected: PASS em todos os arquivos.

- [ ] **Step 5: Commit**

```bash
git add src/views/reportsV2/components/shared/__tests__/InfoPopover.spec.ts
git commit -m "test(reports-v2): alinha InfoPopover.spec ao contrato estadoAtual/ultimos30dias"
```

---

## FASE 2 — Importantes (violações de convenção / risco de bug)

### Task 3: Trocar ícones Lucide por Phosphor (regra dura)

Verificado com grep — 2 imports de `lucide-vue-next` em código novo, violando a regra "SOMENTE Phosphor".

**Files:**
- Modify: `chatfunnel-front/src/views/reportsV2/components/primitives/MetricCard.vue:29,38`
- Modify: `chatfunnel-front/src/views/reportsV2/ReportsV2View.vue:41,88`

**Interfaces:**
- Consumes: nada novo.
- Produces: nada (troca interna de import/tag).

- [ ] **Step 1: MetricCard — trocar o import (linha 38)**

De:
```ts
import {TrendingUp, TrendingDown} from 'lucide-vue-next'
```
Para:
```ts
import {PhTrendUp, PhTrendDown} from '@phosphor-icons/vue'
```

- [ ] **Step 2: MetricCard — trocar a tag no template (linha 29)**

De:
```html
      <component :is="deltaUp ? TrendingUp : TrendingDown" class="size-3.5"/>
```
Para:
```html
      <component :is="deltaUp ? PhTrendUp : PhTrendDown" class="size-3.5"/>
```

- [ ] **Step 3: ReportsV2View — trocar o import (linha 88)**

De:
```ts
import {Printer} from 'lucide-vue-next'
```
Para:
```ts
import {PhPrinter} from '@phosphor-icons/vue'
```

- [ ] **Step 4: ReportsV2View — trocar a tag no template (linha 41)**

De:
```html
              <Printer class="size-4"/>
```
Para:
```html
              <PhPrinter class="size-4"/>
```

- [ ] **Step 5: Verificar que não restou nenhum import Lucide na feature**

Run: `git grep -n "lucide-vue-next" -- src/views/reportsV2`
Expected: sem resultados (exit 1 / vazio).

- [ ] **Step 6: Typecheck + testes dos componentes afetados**

Run: `npx vitest run src/views/reportsV2/components/primitives/__tests__/MetricCard.spec.ts src/views/reportsV2/__tests__/ReportsV2View.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/views/reportsV2/components/primitives/MetricCard.vue src/views/reportsV2/ReportsV2View.vue
git commit -m "fix(reports-v2): usa Phosphor no MetricCard e botao imprimir (remove Lucide)"
```

---

### Task 4: `notMerge` nos gráficos com série dinâmica (evita série fantasma)

`vue-echarts` chama `setOption` em modo merge por padrão. No `BarSeriesChart` a contagem de séries muda 1↔2 ao alternar "Média móvel" (`barSeries.option.ts` adiciona/remove a série de média), então a linha da média pode persistir depois de desligada. `SegmentedTimeSeriesChart` tem contagem de séries orientada a dados (segmentos), mesmo risco.

Testar merge de uma lib via prop passthrough tem baixo valor; esta é uma mudança de config com verificação manual.

**Files:**
- Modify: `chatfunnel-front/src/views/reportsV2/components/primitives/echarts/BarSeriesChart.vue:10`
- Modify: `chatfunnel-front/src/views/reportsV2/components/primitives/echarts/SegmentedTimeSeriesChart.vue:3`

**Interfaces:**
- Consumes: `<VChart>` de `vue-echarts` (aceita prop `update-options` repassada ao `setOption`).
- Produces: nada.

- [ ] **Step 1: BarSeriesChart — adicionar `update-options`**

De:
```html
      <VChart :option="option" autoresize />
```
Para:
```html
      <VChart :option="option" :update-options="{ notMerge: true }" autoresize />
```

- [ ] **Step 2: SegmentedTimeSeriesChart — adicionar `update-options`**

De:
```html
    <VChart :option="option" autoresize />
```
Para:
```html
    <VChart :option="option" :update-options="{ notMerge: true }" autoresize />
```

- [ ] **Step 3: Verificação manual (dev server)**

Run: `npm run dev`, abrir a aba do gráfico de barras (ex.: Mensagens/volume), ligar "Média móvel", depois desligar.
Expected: ao desligar, a linha de média some completamente (sem série fantasma).

- [ ] **Step 4: Testes das options (garantir que builders não regrediram)**

Run: `npx vitest run src/views/reportsV2/components/primitives/echarts/__tests__/barSeries.option.spec.ts src/views/reportsV2/components/primitives/echarts/__tests__/segmentedTimeSeries.option.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/reportsV2/components/primitives/echarts/BarSeriesChart.vue src/views/reportsV2/components/primitives/echarts/SegmentedTimeSeriesChart.vue
git commit -m "fix(reports-v2): notMerge nos graficos de serie dinamica (barra/segmentado)"
```

---

### Task 5: Documentar e blindar a semântica de data do `defaultFilters`

**Nota de escopo:** ao inspecionar, `defaultFilters` já é internamente consistente em UTC (`new Date(now)` + `setUTCDate` + `toISODate` que fatia `toISOString()`). Não há "mistura" dentro da função — o ponto sensível é a escolha semântica UTC vs local do calendário perto da meia-noite, combinada com o anchor fixo `T00:00:00Z`/`T23:59:59Z` em `buildReportParams`. **Não reescrever a lógica cegamente** (pode brigar com o header de timezone que o backend usa). A ação correta e de baixo risco é fixar o comportamento atual com teste de fronteira + comentário, e deixar um TODO para confirmar o contrato de tz com o backend.

**Files:**
- Modify: `chatfunnel-front/src/views/reportsV2/composables/useReportsFilters.helpers.ts:3-12`
- Test: `chatfunnel-front/src/views/reportsV2/composables/__tests__/useReportsFilters.helpers.spec.ts:16-20`

**Interfaces:**
- Consumes: `defaultFilters(now: Date): ReportsFilters`, `toISODate(d: Date): string`.
- Produces: comportamento inalterado (calendário UTC), agora documentado e testado na fronteira.

- [ ] **Step 1: Escrever o teste de fronteira (deve passar já, pinando o comportamento UTC)**

Adicionar ao bloco `describe("useReportsFilters.helpers", ...)`, logo após o teste `defaultFilters cobre os ultimos 30 dias`:

```ts
  it("defaultFilters usa o calendário UTC (fronteira de meia-noite)", () => {
    // 2026-07-07T01:00:00Z ainda é 06/07 22:00 em UTC-3, mas a janela é
    // ancorada no calendário UTC (contrato: backend recebe T..Z + header de tz).
    const f = defaultFilters(new Date("2026-07-07T01:00:00Z"));
    expect(f.finalDate).toBe("2026-07-07");
    expect(f.initialDate).toBe("2026-06-08");
  });
```

- [ ] **Step 2: Rodar para confirmar verde (documenta o atual, não muda lógica)**

Run: `npx vitest run src/views/reportsV2/composables/__tests__/useReportsFilters.helpers.spec.ts`
Expected: PASS.

- [ ] **Step 3: Adicionar comentário + TODO em `useReportsFilters.helpers.ts`**

Substituir o cabeçalho de `defaultFilters` (linhas 7-8):

```ts
// Ultimos 30 dias inclusivos: [now-29, now].
export function defaultFilters(now: Date): ReportsFilters {
```
por:

```ts
// Ultimos 30 dias inclusivos: [now-29, now]. A janela usa o calendário UTC
// (getUTCDate + toISODate via toISOString) para ser determinística; perto da
// meia-noite o dia UTC pode diferir do dia local do usuário. As datas viram
// T00:00:00Z / T23:59:59Z em buildReportParams.
// TODO(reports-v2): confirmar com o backend se o header de timezone reenquadra
// esses limites ancorados em Z — se sim, avaliar migrar para calendário local.
export function defaultFilters(now: Date): ReportsFilters {
```

- [ ] **Step 4: Rodar novamente e commitar**

Run: `npx vitest run src/views/reportsV2/composables/__tests__/useReportsFilters.helpers.spec.ts`
Expected: PASS.

```bash
git add src/views/reportsV2/composables/useReportsFilters.helpers.ts src/views/reportsV2/composables/__tests__/useReportsFilters.helpers.spec.ts
git commit -m "docs(reports-v2): pina semantica UTC do defaultFilters com teste de fronteira"
```

---

### Task 6: Acessibilidade — `role="img"` + `aria-label` nos gráficos canvas

Todo `<VChart>` (ECharts) renderiza em `<canvas>` sem alternativa textual. Adicionar `role="img"` + `aria-label` pt-BR no `<div>` wrapper de cada gráfico ECharts. Os donuts já expõem legenda como texto (`<ul>`), mas o canvas continua opaco — adicionar mesmo assim.

**Escopo:** SOMENTE os gráficos ECharts (`echarts/*.vue`). Ficam de fora os gráficos não-ECharts: `FunnelChartV2.vue` (funnel-graph-js) e `AgingChart.vue` (SVG/CSS nativo), além de toda a pasta `legado/` (Unovis). Não anotar esses.

**Files:**
- Modify: `chatfunnel-front/src/views/reportsV2/components/primitives/echarts/BarSeriesChart.vue`
- Modify: `chatfunnel-front/src/views/reportsV2/components/primitives/echarts/SegmentedTimeSeriesChart.vue`
- Modify: `chatfunnel-front/src/views/reportsV2/components/primitives/echarts/TimeSeriesChart.vue`
- Modify: `chatfunnel-front/src/views/reportsV2/components/primitives/echarts/FunnelChart.vue`
- Modify: `chatfunnel-front/src/views/reportsV2/components/primitives/echarts/Heatmap.vue`
- Modify: `chatfunnel-front/src/views/reportsV2/components/primitives/echarts/ChannelDonut.vue`
- Modify: `chatfunnel-front/src/views/reportsV2/components/primitives/echarts/RankingDonut.vue`

**Interfaces:**
- Consumes: nada novo (atributos estáticos ARIA + texto vindo de props existentes quando houver `label`).
- Produces: nada.

- [ ] **Step 1: BarSeriesChart — anotar o wrapper (linha 9)**

De:
```html
    <div class="h-[260px] w-full">
      <VChart :option="option" :update-options="{ notMerge: true }" autoresize />
    </div>
```
Para:
```html
    <div class="h-[260px] w-full" role="img" :aria-label="label ? `Gráfico de barras: ${label}` : 'Gráfico de barras'">
      <VChart :option="option" :update-options="{ notMerge: true }" autoresize />
    </div>
```

- [ ] **Step 2: SegmentedTimeSeriesChart — anotar o wrapper (linha 2)**

De:
```html
  <div class="h-[260px] w-full">
    <VChart :option="option" :update-options="{ notMerge: true }" autoresize />
  </div>
```
Para:
```html
  <div class="h-[260px] w-full" role="img" aria-label="Série temporal segmentada">
    <VChart :option="option" :update-options="{ notMerge: true }" autoresize />
  </div>
```

- [ ] **Step 3: Aplicar o MESMO padrão aos demais gráficos**

Nos 5 arquivos ECharts restantes (TimeSeriesChart, FunnelChart, Heatmap, ChannelDonut, RankingDonut), localizar o `<div>` que envolve o gráfico (o wrapper com `h-[...]`/`w-full`) e adicionar `role="img"` + um `:aria-label`/`aria-label` pt-BR curto descrevendo a métrica. Descrições sugeridas:

- `TimeSeriesChart.vue`: `aria-label="Série temporal"`
- `FunnelChart.vue`: `aria-label="Funil de conversão por etapa"`
- `Heatmap.vue`: `aria-label="Mapa de calor por dia e hora"`
- `ChannelDonut.vue`: `aria-label="Distribuição por canal"`
- `RankingDonut.vue`: `aria-label="Ranking (rosca)"`

NÃO tocar em `FunnelChartV2.vue`, `AgingChart.vue` nem em `legado/*` (não são ECharts).

Regra: se o componente já recebe uma prop `label`/`title` descritiva, prefira interpolá-la (`:aria-label="\`...: ${label}\`"`) como no Step 1.

- [ ] **Step 4: Verificar que todos os gráficos têm o atributo**

Run: `git grep -L "role=\"img\"" -- "src/views/reportsV2/components/primitives/echarts/*.vue"`
Expected: sem resultados (todos os 7 arquivos ECharts contêm `role="img"`).

- [ ] **Step 5: Rodar testes dos primitivos**

Run: `npx vitest run src/views/reportsV2/components/primitives`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/views/reportsV2/components/primitives
git commit -m "a11y(reports-v2): role=img + aria-label nos graficos canvas"
```

---

## FASE 3 — Polimento (Minor)

### Task 7: Deduplicar classes do TabsTrigger e remover sombra hardcoded no FunilTab

`FunilTab.vue:36,42` repetem a mesma string de classe com `shadow-[0_2px_6px_rgba(60,161,161,0.25)]` (rgba hardcoded, viola a Global Constraint). Não há token de sombra teal (`sombra-1/2/3` são roxos). **Decisão do usuário:** remover a sombra do tab ativo (fica só `bg-brand-500`) e deduplicar a classe repetida numa constante.

**Files:**
- Modify: `chatfunnel-front/src/views/reportsV2/tabs/FunilTab.vue:32-47` (bloco `<TabsList>`), e `<script setup>` do mesmo arquivo.

**Interfaces:**
- Consumes: nada.
- Produces: constante local `ACTIVE_TAB_TRIGGER_CLASS` usada nos dois triggers (sem sombra hardcoded).

- [ ] **Step 1: Adicionar a constante no `<script setup>`**

Localizar o início do bloco `<script setup lang="ts">` do `FunilTab.vue` e, junto às demais constantes de módulo (após os imports), adicionar (SEM o `shadow-[...]`):

```ts
// Classe compartilhada dos dois TabsTrigger (Absoluto/Relativo).
const ACTIVE_TAB_TRIGGER_CLASS =
  'hover:bg-brand-100 hover:text-gray-1000 data-[state=active]:bg-brand-500 h-8 gap-2 border-0 px-3 text-gray-600 data-[state=active]:text-white'
```

- [ ] **Step 2: Usar a constante nos dois triggers (linhas 34-45)**

De:
```html
            <TabsTrigger
              value="absolute"
              class="hover:bg-brand-100 hover:text-gray-1000 data-[state=active]:bg-brand-500 h-8 gap-2 border-0 px-3 text-gray-600 data-[state=active]:text-white data-[state=active]:shadow-[0_2px_6px_rgba(60,161,161,0.25)]"
            >
              Absoluto
            </TabsTrigger>
            <TabsTrigger
              value="relative"
              class="hover:bg-brand-100 hover:text-gray-1000 data-[state=active]:bg-brand-500 h-8 gap-2 border-0 px-3 text-gray-600 data-[state=active]:text-white data-[state=active]:shadow-[0_2px_6px_rgba(60,161,161,0.25)]"
            >
              Relativo
            </TabsTrigger>
```
Para:
```html
            <TabsTrigger value="absolute" :class="ACTIVE_TAB_TRIGGER_CLASS">
              Absoluto
            </TabsTrigger>
            <TabsTrigger value="relative" :class="ACTIVE_TAB_TRIGGER_CLASS">
              Relativo
            </TabsTrigger>
```

- [ ] **Step 3: Typecheck + teste do FunilTab**

Run: `npx vitest run src/views/reportsV2/tabs/__tests__/FunilTab.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/views/reportsV2/tabs/FunilTab.vue
git commit -m "refactor(reports-v2): remove sombra hardcoded e deduplica classe do TabsTrigger"
```

---

### Task 8: Rotear hex hardcoded dos gráficos pelos tokens

Cores fixas espalhadas nos builders bypassam `charts/tokens.ts` (não seguem tema). Centralizar via novos leitores de token e opacidade.

**Files:**
- Modify: `chatfunnel-front/src/views/reportsV2/charts/tokens.ts`
- Modify: `chatfunnel-front/src/views/reportsV2/components/primitives/echarts/timeSeries.option.ts:39`
- Modify: `chatfunnel-front/src/views/reportsV2/components/primitives/echarts/heatmap.option.ts:48,54`
- Modify: `chatfunnel-front/src/views/reportsV2/components/primitives/echarts/funnel.option.ts:63,68`
- Modify: `chatfunnel-front/src/views/reportsV2/components/primitives/echarts/channelDonut.option.ts:24`
- Modify: `chatfunnel-front/src/views/reportsV2/components/primitives/FunnelChartV2.vue:30`

**Interfaces:**
- Consumes: `readToken` (interno de tokens.ts), `getBrandColor`, `getGridColor` (já existem).
- Produces: novos exports `getSurfaceColor(): string` e `getFunnelGradient(): [string, string]` em `charts/tokens.ts`.

- [ ] **Step 1: Adicionar leitores em `charts/tokens.ts`**

Após `getGridColor` (linha 34), adicionar:

```ts
// Branco de superfície — usado para bordas/labels sobre cor cheia (funil, donut,
// heatmap). Lido de token para respeitar dark mode.
export function getSurfaceColor(): string {
  return readToken('--color-white', '#ffffff')
}

// Gradiente da brand para o funil (funnel-graph-js): brand-200 -> brand-700.
export function getFunnelGradient(): [string, string] {
  return [readToken('--color-brand-200', '#00E8DC'), readToken('--color-brand-700', '#3C7C7F')]
}
```

- [ ] **Step 2: timeSeries.option.ts — derivar a área do brand com opacidade (linha 39)**

De:
```ts
        areaStyle: { color: 'rgba(60, 161, 161, 0.12)' }
```
Para:
```ts
        areaStyle: { color: brand, opacity: 0.12 }
```
(`brand` já está em escopo — `const brand = getBrandColor()` na linha 5.)

- [ ] **Step 3: heatmap.option.ts — usar tokens (linhas 3, 48, 54)**

Trocar o import (linha 3):
```ts
import { getBrandColor, getMutedColor } from '../../../charts/tokens'
```
por:
```ts
import { getBrandColor, getMutedColor, getGridColor, getSurfaceColor } from '../../../charts/tokens'
```

Linha 48 — de:
```ts
      inRange: { color: ['#F2F2F2', getBrandColor()] }
```
para:
```ts
      inRange: { color: [getGridColor(), getBrandColor()] }
```

Linha 54 — de:
```ts
        itemStyle: { borderRadius: 2, borderWidth: 1, borderColor: '#ffffff' }
```
para:
```ts
        itemStyle: { borderRadius: 2, borderWidth: 1, borderColor: getSurfaceColor() }
```

- [ ] **Step 4: funnel.option.ts — usar `getSurfaceColor` (linhas 3, 63, 68)**

Trocar o import (linha 3):
```ts
import { getBrandColor } from "../../../charts/tokens";
```
por:
```ts
import { getBrandColor, getSurfaceColor } from "../../../charts/tokens";
```
Depois, dentro de `buildFunnelOption`, adicionar após `const n = stages.length;` (linha 17):
```ts
  const surface = getSurfaceColor();
```
Linha 63 — de `color: "#ffffff",` para `color: surface,`.
Linha 68 — de `itemStyle: { borderColor: "#ffffff", borderWidth: 1 },` para `itemStyle: { borderColor: surface, borderWidth: 1 },`.

- [ ] **Step 5: channelDonut.option.ts — usar `getSurfaceColor` (linhas 1, 24)**

No topo do arquivo, adicionar o import:
```ts
import { getSurfaceColor } from '../../../charts/tokens'
```
Linha 24 — de:
```ts
        itemStyle: { borderRadius: 4, borderColor: '#ffffff', borderWidth: 1 },
```
para:
```ts
        itemStyle: { borderRadius: 4, borderColor: getSurfaceColor(), borderWidth: 1 },
```

- [ ] **Step 6: FunnelChartV2.vue — ler o gradiente do token (linha 30)**

Adicionar `getFunnelGradient` ao import de `../../charts/tokens` no `<script setup>` e trocar:
```ts
// gradiente da brand: brand-200 (#00E8DC) -> brand-700 (#3C7C7F)
const GRADIENT = ['#00E8DC', '#3C7C7F']
```
por:
```ts
// gradiente da brand: brand-200 -> brand-700 (lido dos tokens p/ seguir o tema)
const GRADIENT = getFunnelGradient()
```
Se ainda não houver import de tokens no arquivo, adicionar:
```ts
import { getFunnelGradient } from '../../charts/tokens'
```

- [ ] **Step 7: Rodar os specs das options (fallback do token = hex antigo em happy-dom)**

Run: `npx vitest run src/views/reportsV2/components/primitives/echarts`
Expected: PASS. Em happy-dom `window` existe mas os CSS vars não são resolvidos → `getSurfaceColor()` retorna o fallback `'#ffffff'` e `getGridColor()` o fallback `'#F0F0F0'`. Se algum spec asserava exatamente `'#F2F2F2'` no heatmap, ajustar a expectativa para `'#F0F0F0'`. Só editar assert se realmente quebrar.

- [ ] **Step 8: Commit**

```bash
git add src/views/reportsV2/charts/tokens.ts src/views/reportsV2/components/primitives/echarts/timeSeries.option.ts src/views/reportsV2/components/primitives/echarts/heatmap.option.ts src/views/reportsV2/components/primitives/echarts/funnel.option.ts src/views/reportsV2/components/primitives/echarts/channelDonut.option.ts src/views/reportsV2/components/primitives/FunnelChartV2.vue
git commit -m "refactor(reports-v2): roteia cores dos graficos pelos tokens (remove hex hardcoded)"
```

---

### Task 9: `useCustomFields` — guard de shape + ref de erro

`res.data as Array<...>` confia cegamente no shape; se vier `null`/objeto, `.filter` estoura como erro não tratado. Além disso, sem `error` ref, "sem campos" e "falha ao carregar" colapsam no mesmo estado vazio.

**Files:**
- Modify: `chatfunnel-front/src/views/reportsV2/composables/useCustomFields.ts`
- Test: `chatfunnel-front/src/views/reportsV2/composables/__tests__/useCustomFields.spec.ts`

**Interfaces:**
- Consumes: `AccountsService.listAccountCustomField()`.
- Produces: `UseCustomFields` agora inclui `error: Ref<unknown | null>`; `load()` popula `error` em falha e usa `Array.isArray` como guard.

- [ ] **Step 1: Escrever o teste que falha (guard de shape não-array)**

Adicionar ao `useCustomFields.spec.ts` (dentro do `describe` existente). Se o mock de `AccountsService` ainda não existir no arquivo, adicionar no topo (e importar `vi`):

```ts
import { AccountsService } from "@services/index";
vi.mock("@services/index", () => ({
  AccountsService: { listAccountCustomField: vi.fn() },
}));
```

O caso novo:

```ts
  it("não estoura quando a resposta não é um array (retorna lista vazia)", async () => {
    vi.mocked(AccountsService.listAccountCustomField).mockResolvedValueOnce({
      data: null,
    } as never);
    const cf = useCustomFields();
    await cf.load();
    expect(cf.fields.value).toEqual([]);
    expect(cf.loading.value).toBe(false);
  });
```

- [ ] **Step 2: Rodar para confirmar falha**

Run: `npx vitest run src/views/reportsV2/composables/__tests__/useCustomFields.spec.ts`
Expected: FAIL — `Cannot read properties of null (reading 'filter')`.

- [ ] **Step 3: Adicionar guard + error ref em `useCustomFields.ts`**

Trocar a interface (linhas 9-15) para incluir `error`:

```ts
export interface UseCustomFields {
  fields: Ref<CustomFieldOption[]>;
  selectedFieldId: Ref<string | undefined>;
  loading: Ref<boolean>;
  error: Ref<unknown | null>;
  load: () => Promise<void>;
  selectField: (id: string | undefined) => void;
}
```

Trocar o corpo (linhas 21-46):

```ts
export function useCustomFields(): UseCustomFields {
  const fields = ref<CustomFieldOption[]>([]);
  const selectedFieldId = ref<string | undefined>(undefined);
  const loading = ref(true);
  const error = ref<unknown | null>(null);

  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const res = await AccountsService.listAccountCustomField();
      // Guard de shape: endpoint pode devolver null/objeto — não confiar no cast.
      const raw = Array.isArray(res.data)
        ? (res.data as Array<{ id: string; name: string }>)
        : [];
      fields.value = raw
        .filter((f) => !f.id.includes(SYSTEM_ID_PREFIX))
        .map((f) => ({ id: f.id, name: f.name }));
      if (!selectedFieldId.value && fields.value.length > 0) {
        selectedFieldId.value = fields.value[0].id;
      }
    } catch (e) {
      // Toast/401 já tratados pelo interceptor Axios; aqui só sinalizamos o estado.
      error.value = e;
    } finally {
      loading.value = false;
    }
  }

  function selectField(id: string | undefined): void {
    selectedFieldId.value = id;
  }

  return { fields, selectedFieldId, loading, error, load, selectField };
}
```

- [ ] **Step 4: Rodar para confirmar verde**

Run: `npx vitest run src/views/reportsV2/composables/__tests__/useCustomFields.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/reportsV2/composables/useCustomFields.ts src/views/reportsV2/composables/__tests__/useCustomFields.spec.ts
git commit -m "fix(reports-v2): guard de shape e error ref no useCustomFields"
```

---

### Task 10: Remover código morto (FunilTab / ColaboradoresTab)

Queries `useReportQuery` declaradas mas nunca renderizadas e blocos `<template>` grandes comentados foram shipados. Remover o que não é usado.

**Files:**
- Modify: `chatfunnel-front/src/views/reportsV2/tabs/FunilTab.vue`
- Modify: `chatfunnel-front/src/views/reportsV2/tabs/ColaboradoresTab.vue`

**Interfaces:**
- Consumes: nada.
- Produces: nada (remoção).

- [ ] **Step 1: Mapear o que está morto no FunilTab**

Run: para cada candidato, confirmar que NÃO aparece no `<template>` nem em `reloadAll`:
```bash
git grep -n "stageCounts\|crmForecast\|salesVelocity\|revenue\b" src/views/reportsV2/tabs/FunilTab.vue
```
Expected: cada nome aparece só na sua declaração `const X = useReportQuery(...)` (e não no template/reloadAll) → é morto. **Só remover os que não têm nenhum outro uso.** `revenue`/`crmForecast` têm seção comentada (linhas ~53-54): se a receita não for reativada agora, remover também.

- [ ] **Step 2: Remover as declarações mortas confirmadas no FunilTab**

Para cada query confirmada morta no Step 1, apagar seu bloco `const X = useReportQuery(() => ...)`. Também remover o comentário `// TESTE funnel-graph-js` / notas "para reverter" se ainda presentes no arquivo. Não tocar em `overview`, `funnel`, `lossReasons`, `aging`, `crmRevenue`, `stageTime`, `performanceBySeller` (usados).

- [ ] **Step 3: Remover blocos comentados e queries mortas no ColaboradoresTab**

Abrir `ColaboradoresTab.vue`. Remover o grande `<template>` comentado (bloco citado no review, ~linhas 22-98) e as queries instanciadas cujas seções estão comentadas (`usage`, `resolution`, `satisfaction`, `cost`, `costByModel`, `costByModelTable`, `resolutionRate`) **apenas se** o grep confirmar que não são referenciadas em nenhum `<template>` ativo:
```bash
git grep -n "usage\|resolution\|satisfaction\|cost\b\|costByModel\|resolutionRate" src/views/reportsV2/tabs/ColaboradoresTab.vue
```
Manter qualquer uma que apareça num `ReportSection`/binding ativo.

- [ ] **Step 4: Typecheck + testes das abas**

Run: `npx vitest run src/views/reportsV2/tabs && npx vue-tsc --noEmit`
Expected: PASS / sem erros de "declared but never read" nos arquivos tocados.

- [ ] **Step 5: Commit**

```bash
git add src/views/reportsV2/tabs/FunilTab.vue src/views/reportsV2/tabs/ColaboradoresTab.vue
git commit -m "chore(reports-v2): remove queries mortas e template comentado (Funil/Colaboradores)"
```

---

### Task 11: Higiene de tipos

Itens pequenos: tipo redundante em `useReportQuery.error` e união duplicada em `RankingList`.

**Mocks fora de escopo:** `funnel.mocks.ts` / `dashboard.mocks.ts` não são mais usados — não corrigir acentos de strings mortas. Se estiverem de fato órfãos, a remoção pertence ao Task 10 (código morto), não a esta task.

**Files:**
- Modify: `chatfunnel-front/src/views/reportsV2/composables/useReportQuery.ts` (tipo do `error`)
- Reference: `chatfunnel-front/src/views/reportsV2/components/primitives/RankingList.vue:30` (comentário)

**Interfaces:**
- Consumes: nada.
- Produces: nada de contrato novo.

- [ ] **Step 1: Simplificar o tipo de `error` no useReportQuery**

Em `useReportQuery.ts`, localizar a declaração do ref de erro tipada `Ref<unknown | null>` e trocar por `Ref<unknown>` (o `| null` é ruído: `unknown | null` colapsa em `unknown`). Manter o valor inicial `null`.

Run para localizar: `git grep -n "unknown | null" src/views/reportsV2/composables/useReportQuery.ts`

- [ ] **Step 2: Comentar a união duplicada do RankingList**

Em `RankingList.vue:30`, acima de `type RankingValueFormat = ...`, adicionar:
```ts
// ponytail: espelha ComparisonTableColumn['format'] + 'days'/'usd'. Se um ranking
// receber valueFormat 'currency', o valor deve chegar já em reais (service normaliza
// performance-by-seller). Consolidar com o tipo do ComparisonTable só se divergirem.
```

- [ ] **Step 3: Typecheck**

Run: `npx vue-tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/views/reportsV2/composables/useReportQuery.ts src/views/reportsV2/components/primitives/RankingList.vue
git commit -m "chore(reports-v2): higiene de tipos (error do useReportQuery + RankingList)"
```

---

### Task 12: Documentar os hacks do ReportsPrintContainer

O `<style>` global (não-scoped) com overrides `.v-*` (Vuetify) e o `setTimeout(2500)` antes de `window.print()` são intencionais, mas sem justificativa no código lê-se como acidente.

**Files:**
- Modify: `chatfunnel-front/src/views/reportsV2/components/ReportsPrintContainer.vue`

**Interfaces:**
- Consumes: nada.
- Produces: nada (só comentários).

- [ ] **Step 1: Comentar o delay fixo antes do print (~linha 142)**

Localizar `setTimeout(..., 2500)` e adicionar acima:
```ts
// ponytail: 2500ms é uma folga fixa para os gráficos ECharts terminarem o
// primeiro render antes do window.print(). Ceiling conhecido: em máquinas lentas
// pode cortar; upgrade path = aguardar um evento 'finished' das instâncias VChart.
```

- [ ] **Step 2: Comentar o bloco de overrides Vuetify no `<style>` global (~linhas 156-212)**

Acima do bloco `.v-application`/`.v-navigation-drawer`, adicionar:
```css
/* Resets legados: o print teleporta para fora do shell atual, mas telas antigas
   ainda montam Vuetify no body. Estes overrides neutralizam o layout .v-* só
   durante a impressão. Global por necessidade (o teleport sai do escopo do SFC). */
```

- [ ] **Step 3: Verificar que a suíte segue verde**

Run: `npx vitest run src/views/reportsV2` (não há spec dedicado do PrintContainer; garantir que a suíte não regrediu).
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/views/reportsV2/components/ReportsPrintContainer.vue
git commit -m "docs(reports-v2): justifica delay de print e overrides Vuetify no PrintContainer"
```

---

## Verificação final (após todas as tasks)

- [ ] **Suíte completa da feature verde**

Run: `npx vitest run src/views/reportsV2`
Expected: todos os arquivos PASS.

- [ ] **Typecheck limpo**

Run: `npx vue-tsc --noEmit`
Expected: sem erros novos.

- [ ] **Sem Lucide, sem hex órfão nos gráficos**

Run:
```bash
git grep -n "lucide-vue-next" -- src/views/reportsV2 ; git grep -n "#ffffff\|rgba(60, 161, 161" -- src/views/reportsV2/components/primitives/echarts
```
Expected: primeiro sem resultados; segundo só em specs (asserts), não nos builders.

---

## Self-Review (executado pelo autor do plano)

**Cobertura dos achados do review:**
- Critical "testes vermelhos" → Tasks 1, 2 ✅
- Critical "centavos 100×" → **descartado** (falso positivo, ver seção de contexto) ✅
- Important "Lucide" → Task 3 ✅ · "notMerge" → Task 4 ✅ · "timezone" → Task 5 (reescopado p/ documentar+testar, risco de regressão) ✅ · "a11y charts" → Task 6 ✅ · "shadow hardcoded" → Task 7 ✅
- Minor "hex hardcoded" → Task 8 ✅ · "useCustomFields guard/error" → Task 9 ✅ · "dead code" → Task 10 ✅ · "higiene de tipos (error/RankingList)" → Task 11 ✅ · "print container comments" → Task 12 ✅
- Minor "mock accents" → **descartado** (mocks não são mais usados; eventual remoção via Task 10)

**Placeholder scan:** as únicas instruções guiadas por grep (em vez de diff literal) são Tasks 6-Step 3, 10 e 11-Steps 2-3 — deliberadamente condicionais porque envolvem remoção/aplicação de padrão idêntico a arquivos parcialmente lidos; cada uma traz o comando de verificação e o valor exato a inserir. Nenhum "TODO/implementar depois" solto.

**Consistência de tipos:** `error: Ref<unknown | null>` (Task 9) segue o padrão de `useReportQuery`/`useEventFeed`; `getSurfaceColor()`/`getFunnelGradient()` (Task 8) usados exatamente com as assinaturas definidas no Step 1 da mesma task.
