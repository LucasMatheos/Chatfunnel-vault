# Reports V2 Front — 27 Novos Relatórios — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar no `chatfunnel-front` os 27 relatórios novos do backend (doc `RELATORIOS-V2-COMPLETO.md`), substituir o mock do dashboard da aba Geral pelo endpoint real e criar as abas Mensagens e Broadcast — cobrindo os 45 relatórios disponíveis.

**Architecture:** Tudo segue o padrão já estabelecido em `views/reportsV2`: métodos novos no `ReportsV2Service` (whitelist de params em `useReportsFilters.helpers.ts` contra o ValidationPipe estrito), `useReportQuery` por seção, primitives existentes (`BarSeriesChart`, `SegmentedTimeSeriesChart`, `RankingList`, `AgingChart`, `Heatmap`, `FunnelChart`, `MetricCard`, `ComparisonTable`, `EventFeed`) renderizados dentro de `ReportSection`. Extensões pontuais: formatação USD (custos de IA vêm em dólar cru, **não** centavos), `Heatmap` com modo "taxa 0..1" (best-send-time) e paleta de cores para séries segmentadas com >2 segmentos.

**Tech Stack:** Vue 3.5 `<script setup lang="ts">`, Tailwind v4 (tokens de escala, nunca semânticos), `@chatfunnel/contracts` (tipos), Vitest + @testing-library/vue, Axios via `NestApi`.

**Decisões fechadas com o usuário (2026-06-10):**
1. Criar as abas **Mensagens** e **Broadcast** (8 abas no total).
2. Aba **Agentes / Colaboradores** = `agents.*` (7) + `intelligence.ai-hours-saved` + `messages.workload` + `messages.service-hours`.
3. Cards da aba Geral usam **`dashboard.summary`** (delta, sem sparkline). `dashboard.metric` e `dashboard.periodic-summary` ficam fora deste plano (YAGNI).

**Fora de escopo:** sparkline no MetricCard; seletores de `channelId`/`moderatorId`/`automationId` (filtros opcionais do backend — só enviamos `channelId` quando já presente nos filtros via URL); `crm` overview composto/stage-counts (continuam mock — backend não entregou endpoint composto do CRM).

**Gotchas do backend que este plano codifica (doc §5):**
- `dashboard.summary` → card `wonRevenue` em **centavos** (÷100, como os demais monetários do CRM).
- `agents.cost` / `agents.cost-by-model` → **USD cru** (NÃO dividir por 100; formatar como US$).
- `messages.response-time` e `agents.avg-session-duration` → **segundos** (`format: "duration"` já suportado em `format.ts`).
- `intelligence.ai-hours-saved` → **horas** (estimativa de 2 min/mensagem — rotular como estimativa).
- `broadcasts.best-send-time` → `cells[].value` é **fração 0..1** (taxa de leitura), não contagem.
- Param desconhecido → `400` (whitelist obrigatória por endpoint).

---

## Pré-requisitos (verificar antes da Task 1)

1. `@chatfunnel/contracts` linkado no front deve exportar `ResponseTimeMetrics` e `Dashboard`. Verificar (sem editar node_modules — build do core/contracts é manual do usuário):
   ```bash
   rtk grep "ResponseTimeMetrics" chatfunnel-front/node_modules/@chatfunnel/contracts/dist
   ```
   Se não existir, **parar e avisar o usuário** para rebuildar `contracts → core` (npm link).
2. Backend `chatfunnel-services` rodando em :3200 para smoke manual no final.

---

### Task 0: Branch

**Files:** nenhum (git)

- [ ] **Step 0.1: Criar branch a partir da branch atual do front**

```bash
cd chatfunnel-front
rtk git checkout -b feature/reports-v2-novos-relatorios
```

Todos os comandos das tasks seguintes rodam dentro de `chatfunnel-front/`. **Sem commits** — o usuário commita manualmente ao final.

---

### Task 1: Base — tipos e whitelist de endpoints

**Files:**
- Modify: `src/views/reportsV2/types/reportsV2.ui.ts`
- Modify: `src/views/reportsV2/composables/useReportsFilters.helpers.ts`
- Test: `src/views/reportsV2/composables/__tests__/useReportsFilters.helpers.spec.ts`

- [ ] **Step 1.1: Escrever os testes que falham (whitelist dos novos endpoints + UTM)**

Adicionar ao final de `useReportsFilters.helpers.spec.ts` (reaproveitar os imports existentes de `buildReportParams` e `ReportsFilters`):

```ts
describe("buildReportParams — novos endpoints (doc RELATORIOS-V2-COMPLETO)", () => {
  const filters: ReportsFilters = {
    initialDate: "2026-05-01",
    finalDate: "2026-05-31",
    pipelineId: "pipe-1",
    channelId: "chan-1",
    utmSource: "google",
    utmMedium: "cpc",
    utmCampaign: "promo",
    customFieldId: "cf-1",
  };

  it("contacts/growth agora aceita filtros utm (e segue sem pipelineId)", () => {
    const p = buildReportParams("contacts/growth", filters);
    expect(p.utmSource).toBe("google");
    expect(p.utmMedium).toBe("cpc");
    expect(p.utmCampaign).toBe("promo");
    expect(p.pipelineId).toBeUndefined();
  });

  it("contacts/peak-hours aceita channelId + utm", () => {
    const p = buildReportParams("contacts/peak-hours", filters);
    expect(p.channelId).toBe("chan-1");
    expect(p.utmSource).toBe("google");
  });

  it("contacts/by-channel aceita utm", () => {
    expect(buildReportParams("contacts/by-channel", filters).utmCampaign).toBe("promo");
  });

  it("contacts/growth-by-source aceita utm", () => {
    expect(buildReportParams("contacts/growth-by-source", filters).utmSource).toBe("google");
  });

  it("contacts/by-custom-field envia customFieldId", () => {
    expect(buildReportParams("contacts/by-custom-field", filters).customFieldId).toBe("cf-1");
  });

  it("dashboard/summary envia apenas as datas", () => {
    const p = buildReportParams("dashboard/summary", filters);
    expect(Object.keys(p).sort()).toEqual(["finalDate", "initialDate"]);
  });

  it("messages/volume envia channelId e ignora pipelineId/utm", () => {
    const p = buildReportParams("messages/volume", filters);
    expect(p.channelId).toBe("chan-1");
    expect(p.pipelineId).toBeUndefined();
    expect(p.utmSource).toBeUndefined();
  });

  it("agents/cost e broadcasts/best-send-time enviam apenas as datas", () => {
    expect(Object.keys(buildReportParams("agents/cost", filters)).sort()).toEqual([
      "finalDate",
      "initialDate",
    ]);
    expect(
      Object.keys(buildReportParams("broadcasts/best-send-time", filters)).sort()
    ).toEqual(["finalDate", "initialDate"]);
  });
});
```

- [ ] **Step 1.2: Rodar e confirmar falha**

```bash
rtk vitest run src/views/reportsV2/composables/__tests__/useReportsFilters.helpers.spec.ts
```
Esperado: FAIL — erros de tipo (`customFieldId` não existe em `ReportsFilters`; endpoints novos não existem em `ReportEndpoint`).

- [ ] **Step 1.3: Atualizar `types/reportsV2.ui.ts`**

```ts
export type TabKey =
  | "geral"
  | "funil"
  | "contatos"
  | "mensagens"
  | "automacoes"
  | "broadcast"
  | "agendamentos"
  | "colaboradores";
```

E em `ReportsFilters`, adicionar o campo (após `utmCampaign`):

```ts
export interface ReportsFilters {
  initialDate: string;
  finalDate: string;
  pipelineId?: string;
  channelId?: string;
  origin?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  // Selecionado por seção (contacts.by-custom-field) — não vem da URL.
  customFieldId?: string;
}
```

E no union de formatos da tabela (USD será implementado na Task 2):

```ts
export interface ComparisonTableColumn {
  key: string;
  label: string;
  align?: "left" | "right";
  format?: "number" | "currency" | "percentage" | "duration" | "usd";
}
```

- [ ] **Step 1.4: Atualizar `useReportsFilters.helpers.ts` — union `ReportEndpoint` e `ENDPOINT_OPTIONAL`**

Substituir o type `ReportEndpoint` por:

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
  | "contacts/utm-campaign"
  // --- Novos (doc RELATORIOS-V2-COMPLETO, 2026-06) ---
  | "contacts/growth-by-source"
  | "contacts/by-custom-field"
  | "dashboard/summary"
  | "automations/executions"
  | "automations/by-trigger"
  | "automations/top"
  | "schedules/volume"
  | "agents/usage"
  | "agents/satisfaction"
  | "agents/cost"
  | "agents/cost-by-model"
  | "agents/resolution"
  | "agents/human-vs-ai"
  | "agents/avg-session-duration"
  | "intelligence/ai-hours-saved"
  | "messages/volume"
  | "messages/response-time"
  | "messages/conversations"
  | "messages/workload"
  | "messages/delivery-status"
  | "messages/service-hours"
  | "broadcasts/performance"
  | "broadcasts/history"
  | "broadcasts/reach-by-segment"
  | "broadcasts/best-send-time";
```

Substituir `ENDPOINT_OPTIONAL` por (UTM agora aceito nos 4 relatórios baseados em `Contacts` — doc §4 "Filtros UTM"):

```ts
const UTM_KEYS = ["utmSource", "utmMedium", "utmCampaign"] as const;

// Conjunto de params opcionais aceitos por cada endpoint (alem das datas obrigatorias).
const ENDPOINT_OPTIONAL: Record<
  ReportEndpoint,
  ReadonlyArray<keyof ReportsFilters>
> = {
  "contacts/growth": [...UTM_KEYS],
  "contacts/peak-hours": ["channelId", ...UTM_KEYS],
  "crm/funnel": ["pipelineId"],
  "crm/loss-reasons": ["pipelineId"],
  "crm/revenue-card": ["pipelineId"],
  "crm/aging": ["pipelineId"],
  "general/feed": [],
  "crm/revenue": ["pipelineId"],
  "crm/sales-velocity": ["pipelineId"],
  "crm/stage-time": ["pipelineId"],
  "crm/performance-by-seller": ["pipelineId"],
  "crm/revenue-forecast": ["pipelineId"],
  "contacts/by-channel": [...UTM_KEYS],
  "contacts/by-tag": [],
  "contacts/inactivity": [],
  "contacts/utm-source": [],
  "contacts/utm-medium": [],
  "contacts/utm-campaign": [],
  // --- Novos ---
  "contacts/growth-by-source": [...UTM_KEYS],
  "contacts/by-custom-field": ["customFieldId"],
  "dashboard/summary": [],
  "automations/executions": [],
  "automations/by-trigger": [],
  "automations/top": [],
  "schedules/volume": [],
  "agents/usage": [],
  "agents/satisfaction": [],
  "agents/cost": [],
  "agents/cost-by-model": [],
  "agents/resolution": [],
  "agents/human-vs-ai": [],
  "agents/avg-session-duration": [],
  "intelligence/ai-hours-saved": [],
  "messages/volume": ["channelId"],
  "messages/response-time": ["channelId"],
  "messages/conversations": ["channelId"],
  "messages/workload": ["channelId"],
  "messages/delivery-status": ["channelId"],
  "messages/service-hours": ["channelId"],
  "broadcasts/performance": [],
  "broadcasts/history": ["channelId"],
  "broadcasts/reach-by-segment": [],
  "broadcasts/best-send-time": [],
};
```

- [ ] **Step 1.5: Rodar e confirmar verde**

```bash
rtk vitest run src/views/reportsV2/composables/__tests__/useReportsFilters.helpers.spec.ts
```
Esperado: PASS (todos, incluindo os antigos).

---

### Task 2: Formatação USD (custos de IA)

**Files:**
- Modify: `src/views/reportsV2/utils/format.ts`
- Modify: `src/views/reportsV2/components/primitives/RankingList.vue:30-47`
- Modify: `src/views/reportsV2/components/primitives/ComparisonTable.vue:50-57`
- Test: `src/views/reportsV2/utils/__tests__/format.spec.ts`

- [ ] **Step 2.1: Teste que falha**

Adicionar ao `format.spec.ts` (reaproveitar imports; adicionar `formatUsd` ao import de `../format`):

```ts
describe("formatUsd", () => {
  it("formata dólar com locale pt-BR (custos de IA vêm em USD cru)", () => {
    const out = formatUsd(1.5);
    expect(out).toContain("US$");
    expect(out).toContain("1,50");
  });

  it("não divide por 100 — o valor já está em dólares", () => {
    expect(formatUsd(2)).toContain("2,00");
  });
});
```

- [ ] **Step 2.2: Rodar e confirmar falha**

```bash
rtk vitest run src/views/reportsV2/utils/__tests__/format.spec.ts
```
Esperado: FAIL — `formatUsd` não exportado.

- [ ] **Step 2.3: Implementar em `format.ts`**

Adicionar após a declaração de `df`:

```ts
// Custos de IA (agents.cost*) vem em USD CRU — nunca dividir por 100 (doc §5).
const usdf = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "USD",
});

export function formatUsd(value: number): string {
  return usdf.format(value);
}
```

- [ ] **Step 2.4: Rodar e confirmar verde**

```bash
rtk vitest run src/views/reportsV2/utils/__tests__/format.spec.ts
```
Esperado: PASS.

- [ ] **Step 2.5: Estender `RankingList.vue`**

Trocar (linha 30):

```ts
type RankingValueFormat = 'number' | 'currency' | 'percentage' | 'days'
```
por:
```ts
type RankingValueFormat = 'number' | 'currency' | 'percentage' | 'days' | 'usd'
```

E na função `formatValue` (linha ~46), incluir o caso `usd` antes do fallback:

```ts
function formatValue(value: number): string {
  if (props.valueFormat === 'days') return formatDays(value)
  if (props.valueFormat === 'usd') return formatUsd(value)
  return formatMetricValue(value, props.valueFormat)
}
```

Adicionar `formatUsd` ao import existente de `'../../utils/format'`.

- [ ] **Step 2.6: Estender `ComparisonTable.vue`**

Na função `formatCell` (linha ~50), tratar `usd` antes de delegar (o union da coluna ganhou `"usd"` na Task 1; `formatMetricValue` não conhece esse formato):

```ts
function formatCell(
  value: ComparisonTableValue,
  format: ComparisonTableColumn['format']
): string {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'number') {
    if (format === 'usd') return formatUsd(value)
    return formatMetricValue(value, format)
  }
  return value
}
```

Adicionar `formatUsd` ao import existente de `'../../utils/format'`.

- [ ] **Step 2.7: Rodar specs de componentes afetados + typecheck**

```bash
rtk vitest run src/views/reportsV2/components/primitives/__tests__/RankingList.spec.ts src/views/reportsV2/components/primitives/__tests__/ComparisonTable.spec.ts
rtk npm run typecheck
```
Esperado: PASS / 0 erros.

---

### Task 3: SegmentedTimeSeriesChart — cores e rótulos para os novos segmentos

Hoje só `WON`/`LOST` têm cor; todos os demais caem no brand — séries com 2+ segmentos novos (messages.volume tem 4) ficariam indistinguíveis.

**Files:**
- Modify: `src/assets/tailwind/shadcn-theme.css`
- Modify: `src/views/reportsV2/charts/chart.config.ts`
- Modify: `src/views/reportsV2/components/primitives/SegmentedTimeSeriesChart.vue:30-61`

- [ ] **Step 3.1: Criar os tokens `--color-yellow-500` e `--color-blue-500` no `@theme`**

O `shadcn-theme.css` só tem as escalas Brand/Gray/Green/Red — sem os tokens, os getters
da Step 3.2 cairiam sempre no fallback hex (cor hardcoded fora da paleta, contra o
CLAUDE.md do front). Adicionar em `src/assets/tailwind/shadcn-theme.css`, após o bloco
"Red (error)" (linha ~37):

```css
    /* Yellow (warning) — séries categóricas dos relatórios (segmento BOT) */
    --color-yellow-500: #D9A514;

    /* Blue (info) — séries categóricas dos relatórios (segmento ASSISTANT) */
    --color-blue-500: #3B82F6;
```

(Mesmos valores dos fallbacks dos getters — token e fallback concordam.)

- [ ] **Step 3.2: Adicionar getters de token em `chart.config.ts`** (após `getRedColor`):

```ts
// Amarelo de alerta (--color-yellow-500) — segmento BOT e paleta categórica.
export function getYellowColor(): string {
  return readToken("--color-yellow-500", "#D9A514");
}

// Azul informativo (--color-blue-500) — segmento ASSISTANT e paleta categórica.
export function getBlueColor(): string {
  return readToken("--color-blue-500", "#3B82F6");
}
```

- [ ] **Step 3.3: Substituir `segmentColor` e o `chartData` no `SegmentedTimeSeriesChart.vue`**

Substituir o bloco da função `segmentColor` (linhas 30–35) por:

```ts
// Cores fixas por convenção dos relatórios; segmentos dinâmicos (ex.: utmSource
// em growth-by-source) usam paleta categórica por índice.
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
  const known = KNOWN_SEGMENT_COLOR[segment]
  if (known) return known()
  return PALETTE[index % PALETTE.length]()
}

// Rótulos pt-BR quando o backend não envia label.
const KNOWN_SEGMENT_LABEL: Record<string, string> = {
  WON: 'Ganhos',
  LOST: 'Perdidos',
  opened: 'Abertas',
  closed: 'Fechadas',
  active: 'Ativos',
  cancelled: 'Cancelados',
  CONTACT: 'Contato',
  HUMAN: 'Humano',
  BOT: 'Bot',
  ASSISTANT: 'IA',
  direct: 'Direto'
}
```

Atualizar o import do chart.config para incluir os getters novos:

```ts
import {
  getBrandColor,
  getInkColor,
  getGreenColor,
  getRedColor,
  getYellowColor,
  getBlueColor,
  baseLineOptions
} from '../../charts/chart.config'
```

E no `chartData`, trocar o map dos datasets para passar o índice e o rótulo:

```ts
const chartData = computed<ChartData<'line'>>(() => ({
  labels: labels.value,
  datasets: props.data.segments.map((seg, i) => {
    const byDate = new Map(seg.points.map((p) => [p.date, p.value]))
    const color = segmentColor(seg.segment, i)
    return {
      label: seg.label ?? KNOWN_SEGMENT_LABEL[seg.segment] ?? seg.segment,
      data: labels.value.map((d) => byDate.get(d) ?? 0),
      borderColor: color,
      backgroundColor: 'transparent',
      fill: false,
      tension: 0.3,
      pointRadius: 2
    }
  })
}))
```

- [ ] **Step 3.4: Rodar spec existente + typecheck**

```bash
rtk vitest run src/views/reportsV2/components/primitives/__tests__/SegmentedTimeSeriesChart.spec.ts
rtk npm run typecheck
```
Esperado: PASS / 0 erros. Se o spec asserta cor de `WON`/`LOST`, segue passando (mapa preserva o comportamento).

---

### Task 4: Heatmap — modo taxa (best-send-time)

`broadcasts.best-send-time` manda `cells[].value` como fração 0..1. A escala de cor já funciona (relativa ao `max`), mas o tooltip mostraria `0.42`.

**Files:**
- Modify: `src/views/reportsV2/components/primitives/Heatmap.vue`
- Test: `src/views/reportsV2/components/primitives/__tests__/Heatmap.spec.ts`

- [ ] **Step 4.1: Teste que falha** — adicionar ao `Heatmap.spec.ts` (reaproveitar imports de `render`/`Heatmap` do arquivo):

```ts
it("exibe percentual no tooltip quando valueFormat='rate'", () => {
  const data = { cells: [{ day: 0, hour: 9, value: 0.42 }], max: 0.42 };
  const { container } = render(Heatmap, {
    props: { data, valueFormat: "rate" },
  });
  expect(container.querySelector('[title="Seg 9h: 42%"]')).toBeTruthy();
});
```

- [ ] **Step 4.2: Rodar e confirmar falha**

```bash
rtk vitest run src/views/reportsV2/components/primitives/__tests__/Heatmap.spec.ts
```
Esperado: FAIL — title renderiza `Seg 9h: 0.42`.

- [ ] **Step 4.3: Implementar no `Heatmap.vue`**

Trocar a prop (linha 37):

```ts
const props = withDefaults(
  defineProps<{ data: HeatmapData; valueFormat?: 'count' | 'rate' }>(),
  { valueFormat: 'count' }
)
```

Adicionar após `intensity`:

```ts
// 'rate': valor é fração 0..1 (ex. taxa de leitura do best-send-time, doc §5).
function formatCellValue(value: number): string {
  return props.valueFormat === 'rate' ? `${Math.round(value * 100)}%` : String(value)
}
```

E no template, trocar o `:title` da célula:

```html
:title="`${DAYS[day]} ${hour}h: ${formatCellValue(value)}`"
```

- [ ] **Step 4.4: Rodar e confirmar verde**

```bash
rtk vitest run src/views/reportsV2/components/primitives/__tests__/Heatmap.spec.ts
```
Esperado: PASS (todos).

---

### Task 5: Fatia Geral — `dashboard.summary` real

**Files:**
- Modify: `src/common/services/ReportsV2Service.ts`
- Modify: `src/views/reportsV2/mocks/dashboard.mocks.ts`
- Modify: `src/views/reportsV2/tabs/GeralTab.vue`
- Test: `src/common/services/__tests__/ReportsV2Service.spec.ts` (novo)

- [ ] **Step 5.1: Teste que falha — normalização de centavos do summary**

Criar `src/common/services/__tests__/ReportsV2Service.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGet = vi.fn();
vi.mock("@/common/api/index", () => ({
  Api: { get: () => mockGet },
  NestApi: { get: () => mockGet },
}));

import ReportsV2Service from "../ReportsV2Service";

const baseFilters = { initialDate: "2026-05-01", finalDate: "2026-05-31" };

describe("ReportsV2Service", () => {
  beforeEach(() => mockGet.mockReset());

  describe("getDashboardOverview (dashboard.summary)", () => {
    it("chama o endpoint real e normaliza wonRevenue de centavos para reais", async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          cards: {
            newContacts: {
              value: 10,
              format: "number",
              delta: { absolute: 2, percentage: 25 },
            },
            wonRevenue: {
              value: 1234500,
              format: "currency",
              delta: { absolute: 50000, percentage: 4.2 },
            },
          },
        },
      });

      const out = await ReportsV2Service.getDashboardOverview(baseFilters);

      expect(mockGet).toHaveBeenCalledWith(
        "/reports/v2/dashboard/summary",
        expect.objectContaining({ initialDate: "2026-05-01T00:00:00Z" })
      );
      expect(out.cards["wonRevenue"].value).toBe(12345);
      expect(out.cards["wonRevenue"].delta?.absolute).toBe(500);
      // Cards de contagem ficam intactos.
      expect(out.cards["newContacts"].value).toBe(10);
    });
  });
});
```

- [ ] **Step 5.2: Rodar e confirmar falha**

```bash
rtk vitest run src/common/services/__tests__/ReportsV2Service.spec.ts
```
Esperado: FAIL — `getDashboardOverview` retorna o mock (cards pt-BR), não chama `mockGet`.

- [ ] **Step 5.3: Implementar no `ReportsV2Service.ts`**

(a) Extrair o normalizador de card monetário — adicionar após `centavosToReais`:

```ts
// MetricCard monetário: backend envia value e delta.absolute em centavos (Int).
function normalizeCurrencyCard(card: MetricCard): MetricCard {
  return {
    ...card,
    value: centavosToReais(card.value),
    ...(card.delta
      ? { delta: { ...card.delta, absolute: centavosToReais(card.delta.absolute) } }
      : {}),
  };
}
```

(b) Substituir `getDashboardOverview` (remover o mock):

```ts
  getDashboardOverview: (filters: ReportsFilters): Promise<Dashboard> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/dashboard/summary`,
        buildReportParams("dashboard/summary", filters)
      ) as Promise<AxiosResponse<Dashboard>>
    ).then((res) => {
      // wonRevenue vem em centavos; os demais cards do MVP são contagens.
      const cards = { ...res.data.cards };
      if (cards["wonRevenue"]) {
        cards["wonRevenue"] = normalizeCurrencyCard(cards["wonRevenue"]);
      }
      return { cards };
    }),
```

(c) DRY — simplificar `getRevenueCard` e `getRevenueForecast` com o normalizador:

```ts
  getRevenueCard: (filters: ReportsFilters): Promise<MetricCard> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/crm/revenue-card`,
        buildReportParams("crm/revenue-card", filters)
      ) as Promise<AxiosResponse<MetricCard>>
    ).then((res) => normalizeCurrencyCard(res.data)),
```

```ts
  getRevenueForecast: (filters: ReportsFilters): Promise<MetricCard> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/crm/revenue-forecast`,
        buildReportParams("crm/revenue-forecast", filters)
      ) as Promise<AxiosResponse<MetricCard>>
    ).then((res) => normalizeCurrencyCard(res.data)),
```

(d) Remover `mockDashboard` do import de mocks (manter `withMockLatency`, ainda usado pelos mocks do funil):

```ts
import { withMockLatency } from "@/views/reportsV2/mocks/dashboard.mocks";
```

- [ ] **Step 5.4: Limpar `dashboard.mocks.ts`** — remover o bloco `mockDashboard` inteiro (linhas 18–53) e o import de `Dashboard`; atualizar o comentário de cabeçalho:

```ts
// Mocks parciais de Relatórios V2.
// Permanecem mockados apenas "Resumo do funil" + "Etapas" (stage counts) da
// FunilTab — o backend ainda não expôs endpoint composto do CRM.
```

- [ ] **Step 5.5: Atualizar `GeralTab.vue`** — remover `:mock="true"` da seção "Visão geral" e traduzir as chaves do record:

No template:

```html
    <ReportSection
      title="Visão geral"
      :loading="overview.loading.value"
      :error="overview.error.value"
      :empty="!!overview.data.value && Object.keys(overview.data.value.cards).length === 0"
    >
      <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        <MetricCard
          v-for="(metric, key) in overview.data.value!.cards"
          :key="key"
          :label="cardLabel(String(key))"
          :metric="metric"
        />
      </div>
    </ReportSection>
```

No script (após `const { filters } = useReportsFilters()`):

```ts
// Chaves do dashboard.summary → rótulos pt-BR (doc §4 Dashboard).
const DASHBOARD_CARD_LABELS: Record<string, string> = {
  newContacts: 'Novos contatos',
  wonRevenue: 'Receita ganha',
  messages: 'Mensagens',
  aiSessions: 'Sessões de IA'
}

function cardLabel(key: string): string {
  return DASHBOARD_CARD_LABELS[key] ?? key
}
```

- [ ] **Step 5.6: Rodar testes e typecheck**

```bash
rtk vitest run src/common/services/__tests__/ReportsV2Service.spec.ts src/views/reportsV2
rtk npm run typecheck
```
Esperado: PASS / 0 erros.

---

### Task 6: Fatia Contatos — growth-by-source + by-custom-field

**Files:**
- Create: `src/views/reportsV2/composables/useCustomFields.ts`
- Test: `src/views/reportsV2/composables/__tests__/useCustomFields.spec.ts` (novo)
- Modify: `src/common/services/ReportsV2Service.ts`
- Modify: `src/views/reportsV2/tabs/ContatosTab.vue`

- [ ] **Step 6.1: Teste que falha — composable `useCustomFields`**

Criar `src/views/reportsV2/composables/__tests__/useCustomFields.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockList = vi.fn();
vi.mock("@services/index", () => ({
  AccountsService: { listAccountCustomField: () => mockList() },
}));

import { useCustomFields } from "../useCustomFields";

describe("useCustomFields", () => {
  beforeEach(() => mockList.mockReset());

  it("carrega campos, filtra os de sistema e seleciona o primeiro", async () => {
    mockList.mockResolvedValueOnce({
      data: [
        { id: "00000000-0000-0000-0000-000000000001", name: "Sistema" },
        { id: "cf-1", name: "Cidade" },
        { id: "cf-2", name: "Plano" },
      ],
    });

    const cf = useCustomFields();
    await cf.load();

    expect(cf.fields.value).toEqual([
      { id: "cf-1", name: "Cidade" },
      { id: "cf-2", name: "Plano" },
    ]);
    expect(cf.selectedFieldId.value).toBe("cf-1");
    expect(cf.loading.value).toBe(false);
  });

  it("mantém seleção indefinida quando não há campos", async () => {
    mockList.mockResolvedValueOnce({ data: [] });

    const cf = useCustomFields();
    await cf.load();

    expect(cf.fields.value).toEqual([]);
    expect(cf.selectedFieldId.value).toBeUndefined();
  });

  it("selectField troca a seleção", async () => {
    mockList.mockResolvedValueOnce({
      data: [
        { id: "cf-1", name: "Cidade" },
        { id: "cf-2", name: "Plano" },
      ],
    });

    const cf = useCustomFields();
    await cf.load();
    cf.selectField("cf-2");

    expect(cf.selectedFieldId.value).toBe("cf-2");
  });
});
```

- [ ] **Step 6.2: Rodar e confirmar falha**

```bash
rtk vitest run src/views/reportsV2/composables/__tests__/useCustomFields.spec.ts
```
Esperado: FAIL — módulo `../useCustomFields` não existe.

- [ ] **Step 6.3: Criar `src/views/reportsV2/composables/useCustomFields.ts`**

```ts
import { ref, type Ref } from "vue";
import { AccountsService } from "@services/index";

export interface CustomFieldOption {
  id: string;
  name: string;
}

export interface UseCustomFields {
  fields: Ref<CustomFieldOption[]>;
  selectedFieldId: Ref<string | undefined>;
  loading: Ref<boolean>;
  load: () => Promise<void>;
  selectField: (id: string) => void;
}

// Campos de sistema usam UUID com prefixo zerado — não fazem sentido no
// relatório por valor (mesmo filtro usado em InputCustomFields.vue:144).
const SYSTEM_ID_PREFIX = "00000000-0000-0000-0000-";

export function useCustomFields(): UseCustomFields {
  const fields = ref<CustomFieldOption[]>([]);
  const selectedFieldId = ref<string | undefined>(undefined);
  const loading = ref(true);

  async function load(): Promise<void> {
    loading.value = true;
    try {
      const res = await AccountsService.listAccountCustomField();
      fields.value = (res.data as Array<{ id: string; name: string }>)
        .filter((f) => !f.id.includes(SYSTEM_ID_PREFIX))
        .map((f) => ({ id: f.id, name: f.name }));
      if (!selectedFieldId.value && fields.value.length > 0) {
        selectedFieldId.value = fields.value[0].id;
      }
    } finally {
      loading.value = false;
    }
  }

  function selectField(id: string): void {
    selectedFieldId.value = id;
  }

  return { fields, selectedFieldId, loading, load, selectField };
}
```

- [ ] **Step 6.4: Rodar e confirmar verde**

```bash
rtk vitest run src/views/reportsV2/composables/__tests__/useCustomFields.spec.ts
```
Esperado: PASS.

- [ ] **Step 6.5: Métodos novos no `ReportsV2Service.ts`** — adicionar ao final do bloco "Contatos (story-13)":

```ts
  getContactsGrowthBySource: (
    filters: ReportsFilters
  ): Promise<SegmentedTimeSeries> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/contacts/growth-by-source`,
        buildReportParams("contacts/growth-by-source", filters)
      ) as Promise<AxiosResponse<SegmentedTimeSeries>>
    ).then((res) => res.data),

  // Exige filters.customFieldId (400 sem ele) — o caller só chama com campo selecionado.
  getContactsByCustomField: (filters: ReportsFilters): Promise<Ranking> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/contacts/by-custom-field`,
        buildReportParams("contacts/by-custom-field", filters)
      ) as Promise<AxiosResponse<Ranking>>
    ).then((res) => res.data),
```

- [ ] **Step 6.6: Seções novas no `ContatosTab.vue`**

Adicionar ao final do template (após o grid de UTM, antes do `</div>` raiz):

```html
    <ReportSection
      title="Crescimento por origem"
      :loading="growthBySource.loading.value"
      :error="growthBySource.error.value"
      :empty="!!growthBySource.data.value && growthBySource.data.value.segments.length === 0"
    >
      <template #actions>
        <span class="typo-body-10-regular text-gray-700">Novos contatos por utm_source</span>
      </template>
      <SegmentedTimeSeriesChart :data="growthBySource.data.value!" />
    </ReportSection>

    <ReportSection
      title="Campos personalizados"
      :loading="customFieldLoading"
      :error="byCustomField.error.value"
      :empty="customFieldEmpty"
    >
      <template #actions>
        <select
          v-if="cf.fields.value.length > 0"
          class="typo-body-13-semibold min-w-48 rounded-cf-lg border border-gray-400 bg-gray-100 px-3 py-1.5 text-gray-1000 outline-none focus:border-brand-500 disabled:opacity-50"
          :value="cf.selectedFieldId.value"
          :disabled="cf.loading.value"
          @change="onCustomFieldChange"
        >
          <option v-for="f in cf.fields.value" :key="f.id" :value="f.id">
            {{ f.name }}
          </option>
        </select>
      </template>
      <RankingList :entries="byCustomField.data.value!.entries" />
    </ReportSection>
```

No script, adicionar imports:

```ts
import { computed } from 'vue'
import SegmentedTimeSeriesChart from '../components/primitives/SegmentedTimeSeriesChart.vue'
import { useCustomFields } from '../composables/useCustomFields'
```

(mesclar `computed` no import existente de `vue`)

E a lógica (após as queries existentes):

```ts
const cf = useCustomFields()

const growthBySource = useReportQuery(() =>
  ReportsV2Service.getContactsGrowthBySource({ ...filters })
)
const byCustomField = useReportQuery(() =>
  ReportsV2Service.getContactsByCustomField({
    ...filters,
    customFieldId: cf.selectedFieldId.value
  })
)

// A query de campo só roda com campo selecionado; sem campos cadastrados a
// seção cai no estado vazio (nunca dispara 400 por customFieldId ausente).
const customFieldLoading = computed(
  () => cf.loading.value || (!!cf.selectedFieldId.value && byCustomField.loading.value)
)
const customFieldEmpty = computed(
  () =>
    (!cf.loading.value && cf.fields.value.length === 0) ||
    (!!byCustomField.data.value && byCustomField.data.value.entries.length === 0)
)

function onCustomFieldChange(event: Event): void {
  cf.selectField((event.target as HTMLSelectElement).value)
  byCustomField.execute()
}
```

Atualizar `reloadAll` e o mount:

```ts
function reloadAll(): void {
  byChannel.execute()
  byTag.execute()
  inactivity.execute()
  utmSource.execute()
  utmMedium.execute()
  utmCampaign.execute()
  growthBySource.execute()
  if (cf.selectedFieldId.value) byCustomField.execute()
}

onMounted(async () => {
  // O interceptor do Axios já trata o erro; engolimos a rejeição (padrão FunilTab).
  await cf.load().catch(() => {})
  reloadAll()
})
watch(() => [filters.initialDate, filters.finalDate], reloadAll)
```

(remover o `onMounted(reloadAll)` antigo)

- [ ] **Step 6.7: Rodar testes + typecheck**

```bash
rtk vitest run src/views/reportsV2
rtk npm run typecheck
```
Esperado: PASS / 0 erros.

---

### Task 7: Fatia Automações — aba real

**Files:**
- Modify: `src/common/services/ReportsV2Service.ts`
- Modify: `src/views/reportsV2/tabs/AutomacoesTab.vue` (substituição completa do placeholder)

- [ ] **Step 7.1: Métodos no service** — adicionar bloco após os de Contatos:

```ts
  // ---- Automações ----

  getAutomationsExecutions: (filters: ReportsFilters): Promise<TimeSeries> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/automations/executions`,
        buildReportParams("automations/executions", filters)
      ) as Promise<AxiosResponse<TimeSeries>>
    ).then((res) => res.data),

  getAutomationsByTrigger: (filters: ReportsFilters): Promise<Ranking> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/automations/by-trigger`,
        buildReportParams("automations/by-trigger", filters)
      ) as Promise<AxiosResponse<Ranking>>
    ).then((res) => res.data),

  getAutomationsTop: (filters: ReportsFilters): Promise<Ranking> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/automations/top`,
        buildReportParams("automations/top", filters)
      ) as Promise<AxiosResponse<Ranking>>
    ).then((res) => res.data),
```

- [ ] **Step 7.2: Substituir `AutomacoesTab.vue` inteiro por:**

```vue
<template>
  <div class="flex flex-col gap-4">
    <ReportSection
      title="Execuções de automação"
      :loading="executions.loading.value"
      :error="executions.error.value"
      :empty="!!executions.data.value && executions.data.value.series.length === 0"
    >
      <BarSeriesChart :data="executions.data.value!" label="Execuções" />
    </ReportSection>

    <div class="grid gap-4 xl:grid-cols-2">
      <ReportSection
        title="Top automações"
        :loading="top.loading.value"
        :error="top.error.value"
        :empty="!!top.data.value && top.data.value.entries.length === 0"
      >
        <RankingList :entries="top.data.value!.entries" />
      </ReportSection>

      <ReportSection
        title="Efetividade por gatilho"
        :loading="byTrigger.loading.value"
        :error="byTrigger.error.value"
        :empty="!!byTrigger.data.value && byTrigger.data.value.entries.length === 0"
      >
        <template #actions>
          <!-- "Efetividade" = volume de execuções; não há status de conclusão no schema (doc §4). -->
          <span class="typo-body-10-regular text-gray-700">Volume de execuções</span>
        </template>
        <RankingList :entries="byTrigger.data.value!.entries" />
      </ReportSection>
    </div>

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
import type { EventFeed } from '@chatfunnel/contracts'
import { ReportsV2Service } from '@services/index'
import { useReportsFilters } from '../composables/useReportsFilters'
import { useReportQuery } from '../composables/useReportQuery'
import { useEventFeed } from '../composables/useEventFeed'
import ReportSection from '../components/shared/ReportSection.vue'
import BarSeriesChart from '../components/primitives/BarSeriesChart.vue'
import RankingList from '../components/primitives/RankingList.vue'
import EventFeedComponent from '../components/primitives/EventFeed.vue'
import { Button } from '@/components/ui/button'

const { filters } = useReportsFilters()

const executions = useReportQuery(() => ReportsV2Service.getAutomationsExecutions({ ...filters }))
const top = useReportQuery(() => ReportsV2Service.getAutomationsTop({ ...filters }))
const byTrigger = useReportQuery(() => ReportsV2Service.getAutomationsByTrigger({ ...filters }))
const feed = useEventFeed(() => ({ ...filters }))

const feedProp = computed<EventFeed>(() => ({
  items: feed.items.value,
  hasMore: feed.hasMore.value
}))

function reloadAll(): void {
  executions.execute()
  top.execute()
  byTrigger.execute()
  feed.reload()
}

onMounted(reloadAll)
watch(() => [filters.initialDate, filters.finalDate], reloadAll)
</script>
```

- [ ] **Step 7.3: Typecheck + testes**

```bash
rtk npm run typecheck
rtk vitest run src/views/reportsV2
```
Esperado: 0 erros / PASS.

---

### Task 8: Fatia Agendamentos — aba real

**Files:**
- Modify: `src/common/services/ReportsV2Service.ts`
- Modify: `src/views/reportsV2/tabs/AgendamentosTab.vue` (substituição completa do placeholder)

- [ ] **Step 8.1: Método no service:**

```ts
  // ---- Agendamentos ----

  getSchedulesVolume: (filters: ReportsFilters): Promise<SegmentedTimeSeries> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/schedules/volume`,
        buildReportParams("schedules/volume", filters)
      ) as Promise<AxiosResponse<SegmentedTimeSeries>>
    ).then((res) => res.data),
```

- [ ] **Step 8.2: Substituir `AgendamentosTab.vue` inteiro por:**

```vue
<template>
  <div class="flex flex-col gap-4">
    <ReportSection
      title="Volume de agendamentos"
      :loading="volume.loading.value"
      :error="volume.error.value"
      :empty="!!volume.data.value && volume.data.value.segments.length === 0"
    >
      <template #actions>
        <span class="typo-body-10-regular text-gray-700">
          Ativos × cancelados, pela data do compromisso
        </span>
      </template>
      <SegmentedTimeSeriesChart :data="volume.data.value!" />
    </ReportSection>

    <!-- Comparecimento/no-show dependem de novos campos no schema (doc §8). -->
    <p class="typo-body-12-regular text-gray-700">
      Comparecimento e no-show ainda não estão disponíveis — em breve.
    </p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { ReportsV2Service } from '@services/index'
import { useReportsFilters } from '../composables/useReportsFilters'
import { useReportQuery } from '../composables/useReportQuery'
import ReportSection from '../components/shared/ReportSection.vue'
import SegmentedTimeSeriesChart from '../components/primitives/SegmentedTimeSeriesChart.vue'

const { filters } = useReportsFilters()

const volume = useReportQuery(() => ReportsV2Service.getSchedulesVolume({ ...filters }))

function reloadAll(): void {
  volume.execute()
}

onMounted(reloadAll)
watch(() => [filters.initialDate, filters.finalDate], reloadAll)
</script>
```

- [ ] **Step 8.3: Typecheck**

```bash
rtk npm run typecheck
```
Esperado: 0 erros.

---

### Task 9: Fatia Agentes / Colaboradores — aba real

**Files:**
- Modify: `src/common/services/ReportsV2Service.ts`
- Modify: `src/views/reportsV2/tabs/ColaboradoresTab.vue` (substituição completa do placeholder)
- Test: `src/common/services/__tests__/ReportsV2Service.spec.ts`

- [ ] **Step 9.1: Teste que falha — USD cru não é dividido**

Adicionar ao `ReportsV2Service.spec.ts`:

```ts
  describe("getAgentsCost (USD cru — doc §5)", () => {
    it("NÃO divide por 100 — costUsd já está em dólares", async () => {
      mockGet.mockResolvedValueOnce({
        data: { series: [{ date: "2026-05-01", value: 1.23 }], granularity: "day" },
      });

      const out = await ReportsV2Service.getAgentsCost(baseFilters);

      expect(mockGet).toHaveBeenCalledWith(
        "/reports/v2/agents/cost",
        expect.objectContaining({ finalDate: "2026-05-31T23:59:59Z" })
      );
      expect(out.series[0].value).toBe(1.23);
    });
  });
```

- [ ] **Step 9.2: Rodar e confirmar falha**

```bash
rtk vitest run src/common/services/__tests__/ReportsV2Service.spec.ts
```
Esperado: FAIL — `getAgentsCost` não existe.

- [ ] **Step 9.3: Métodos no service** (bloco Agentes IA + Intelligence + os dois de mensagens desta aba):

```ts
  // ---- Agentes IA / Intelligence ----

  getAgentsUsage: (filters: ReportsFilters): Promise<TimeSeries> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/agents/usage`,
        buildReportParams("agents/usage", filters)
      ) as Promise<AxiosResponse<TimeSeries>>
    ).then((res) => res.data),

  getAgentsSatisfaction: (filters: ReportsFilters): Promise<Ranking> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/agents/satisfaction`,
        buildReportParams("agents/satisfaction", filters)
      ) as Promise<AxiosResponse<Ranking>>
    ).then((res) => res.data),

  // value em USD CRU (não centavos) — formatar com formatUsd, nunca dividir (doc §5).
  getAgentsCost: (filters: ReportsFilters): Promise<TimeSeries> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/agents/cost`,
        buildReportParams("agents/cost", filters)
      ) as Promise<AxiosResponse<TimeSeries>>
    ).then((res) => res.data),

  // value em USD cru; meta = { tokens }.
  getAgentsCostByModel: (filters: ReportsFilters): Promise<Ranking> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/agents/cost-by-model`,
        buildReportParams("agents/cost-by-model", filters)
      ) as Promise<AxiosResponse<Ranking>>
    ).then((res) => res.data),

  getAgentsResolution: (filters: ReportsFilters): Promise<Ranking> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/agents/resolution`,
        buildReportParams("agents/resolution", filters)
      ) as Promise<AxiosResponse<Ranking>>
    ).then((res) => res.data),

  getAgentsHumanVsAi: (filters: ReportsFilters): Promise<Ranking> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/agents/human-vs-ai`,
        buildReportParams("agents/human-vs-ai", filters)
      ) as Promise<AxiosResponse<Ranking>>
    ).then((res) => res.data),

  // value em SEGUNDOS, format "duration" (doc §5).
  getAgentsAvgSessionDuration: (filters: ReportsFilters): Promise<MetricCard> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/agents/avg-session-duration`,
        buildReportParams("agents/avg-session-duration", filters)
      ) as Promise<AxiosResponse<MetricCard>>
    ).then((res) => res.data),

  // value em HORAS (estimativa: msgs de IA × 2min — doc §4 Intelligence).
  getAiHoursSaved: (filters: ReportsFilters): Promise<MetricCard> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/intelligence/ai-hours-saved`,
        buildReportParams("intelligence/ai-hours-saved", filters)
      ) as Promise<AxiosResponse<MetricCard>>
    ).then((res) => res.data),

  // ---- Mensagens (carga dos atendentes — exibido na aba Colaboradores) ----

  // value = mensagens enviadas (from HUMAN); meta = { contacts }.
  getMessagesWorkload: (filters: ReportsFilters): Promise<Ranking> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/messages/workload`,
        buildReportParams("messages/workload", filters)
      ) as Promise<AxiosResponse<Ranking>>
    ).then((res) => res.data),

  getMessagesServiceHours: (filters: ReportsFilters): Promise<HeatmapData> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/messages/service-hours`,
        buildReportParams("messages/service-hours", filters)
      ) as Promise<AxiosResponse<HeatmapData>>
    ).then((res) => res.data),
```

- [ ] **Step 9.4: Rodar e confirmar verde**

```bash
rtk vitest run src/common/services/__tests__/ReportsV2Service.spec.ts
```
Esperado: PASS.

- [ ] **Step 9.5: Substituir `ColaboradoresTab.vue` inteiro por:**

```vue
<template>
  <div class="flex flex-col gap-4">
    <div class="grid gap-4 xl:grid-cols-2">
      <ReportSection
        title="Duração média de sessão IA"
        :loading="avgDuration.loading.value"
        :error="avgDuration.error.value"
        :empty="false"
      >
        <MetricCard label="Duração média" :metric="avgDuration.data.value!" />
      </ReportSection>

      <ReportSection
        title="Horas economizadas pela IA"
        :loading="hoursSaved.loading.value"
        :error="hoursSaved.error.value"
        :empty="false"
      >
        <template #actions>
          <!-- Premissa do backend: 2 min por mensagem de IA (doc §4). -->
          <span class="typo-body-10-regular text-gray-700">Estimativa · horas no período</span>
        </template>
        <MetricCard label="Horas economizadas" :metric="hoursSaved.data.value!" />
      </ReportSection>
    </div>

    <ReportSection
      title="Uso de agentes IA"
      :loading="usage.loading.value"
      :error="usage.error.value"
      :empty="!!usage.data.value && usage.data.value.series.length === 0"
    >
      <BarSeriesChart :data="usage.data.value!" label="Sessões" />
    </ReportSection>

    <div class="grid gap-4 xl:grid-cols-2">
      <ReportSection
        title="Taxa de resolução"
        :loading="resolution.loading.value"
        :error="resolution.error.value"
        :empty="!!resolution.data.value && resolution.data.value.entries.length === 0"
      >
        <template #actions>
          <span v-if="resolutionRate" class="typo-body-12-semibold text-gray-1000">
            {{ resolutionRate }} resolvidas
          </span>
        </template>
        <RankingList :entries="resolution.data.value!.entries" />
      </ReportSection>

      <ReportSection
        title="Humano vs IA"
        :loading="humanVsAi.loading.value"
        :error="humanVsAi.error.value"
        :empty="!!humanVsAi.data.value && humanVsAi.data.value.entries.length === 0"
      >
        <template #actions>
          <span class="typo-body-10-regular text-gray-700">Volume de mensagens</span>
        </template>
        <RankingList :entries="humanVsAi.data.value!.entries" />
      </ReportSection>
    </div>

    <div class="grid gap-4 xl:grid-cols-2">
      <ReportSection
        title="Satisfação"
        :loading="satisfaction.loading.value"
        :error="satisfaction.error.value"
        :empty="!!satisfaction.data.value && satisfaction.data.value.entries.length === 0"
      >
        <template #actions>
          <span class="typo-body-10-regular text-gray-700">Notas de 1 a 5</span>
        </template>
        <RankingList :entries="satisfaction.data.value!.entries" />
      </ReportSection>

      <ReportSection
        title="Custo de IA por modelo"
        :loading="costByModel.loading.value"
        :error="costByModel.error.value"
        :empty="!!costByModel.data.value && costByModel.data.value.entries.length === 0"
      >
        <ComparisonTable :table="costByModelTable" first-column-label="Modelo" />
      </ReportSection>
    </div>

    <ReportSection
      title="Custo de IA no tempo"
      :loading="cost.loading.value"
      :error="cost.error.value"
      :empty="!!cost.data.value && cost.data.value.series.length === 0"
    >
      <template #actions>
        <span class="typo-body-10-regular text-gray-700">Valores em US$</span>
      </template>
      <TimeSeriesChart :data="cost.data.value!" label="Custo (US$)" />
    </ReportSection>

    <ReportSection
      title="Carga por atendente"
      :loading="workload.loading.value"
      :error="workload.error.value"
      :empty="!!workload.data.value && workload.data.value.entries.length === 0"
    >
      <ComparisonTable :table="workloadTable" first-column-label="Atendente" />
    </ReportSection>

    <ReportSection
      title="Horários de atendimento"
      :loading="serviceHours.loading.value"
      :error="serviceHours.error.value"
      :empty="!!serviceHours.data.value && serviceHours.data.value.cells.length === 0"
    >
      <template #actions>
        <span class="typo-body-10-regular text-gray-700">Respostas de operadores humanos</span>
      </template>
      <Heatmap :data="serviceHours.data.value!" />
    </ReportSection>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { ReportsV2Service } from '@services/index'
import type { ComparisonTableData } from '../types/reportsV2.ui'
import { useReportsFilters } from '../composables/useReportsFilters'
import { useReportQuery } from '../composables/useReportQuery'
import ReportSection from '../components/shared/ReportSection.vue'
import MetricCard from '../components/primitives/MetricCard.vue'
import BarSeriesChart from '../components/primitives/BarSeriesChart.vue'
import TimeSeriesChart from '../components/primitives/TimeSeriesChart.vue'
import RankingList from '../components/primitives/RankingList.vue'
import ComparisonTable from '../components/primitives/ComparisonTable.vue'
import Heatmap from '../components/primitives/Heatmap.vue'

const { filters } = useReportsFilters()

const avgDuration = useReportQuery(() => ReportsV2Service.getAgentsAvgSessionDuration({ ...filters }))
const hoursSaved = useReportQuery(() => ReportsV2Service.getAiHoursSaved({ ...filters }))
const usage = useReportQuery(() => ReportsV2Service.getAgentsUsage({ ...filters }))
const resolution = useReportQuery(() => ReportsV2Service.getAgentsResolution({ ...filters }))
const humanVsAi = useReportQuery(() => ReportsV2Service.getAgentsHumanVsAi({ ...filters }))
const satisfaction = useReportQuery(() => ReportsV2Service.getAgentsSatisfaction({ ...filters }))
const cost = useReportQuery(() => ReportsV2Service.getAgentsCost({ ...filters }))
const costByModel = useReportQuery(() => ReportsV2Service.getAgentsCostByModel({ ...filters }))
const workload = useReportQuery(() => ReportsV2Service.getMessagesWorkload({ ...filters }))
const serviceHours = useReportQuery(() => ReportsV2Service.getMessagesServiceHours({ ...filters }))

// Taxa = resolved / total — calculada no front (doc §4 agents.resolution).
const resolutionRate = computed<string | null>(() => {
  const entries = resolution.data.value?.entries ?? []
  const total = entries.reduce((sum, e) => sum + e.value, 0)
  if (total === 0) return null
  const resolved = entries.find((e) => e.id === 'resolved')?.value ?? 0
  return `${Math.round((resolved / total) * 1000) / 10}%`
})

// meta de cost-by-model chega como unknown; tipamos localmente.
interface CostByModelMeta {
  tokens: number
}

const costByModelTable = computed<ComparisonTableData>(() => ({
  columns: [
    { key: 'cost', label: 'Custo', align: 'right', format: 'usd' },
    { key: 'tokens', label: 'Tokens', align: 'right', format: 'number' }
  ],
  rows: (costByModel.data.value?.entries ?? []).map((e) => {
    const m = e.meta as unknown as CostByModelMeta | undefined
    return {
      id: e.id,
      label: e.label,
      values: { cost: e.value, tokens: m?.tokens ?? 0 }
    }
  })
}))

// meta de workload chega como unknown; tipamos localmente.
interface WorkloadMeta {
  contacts: number
}

const workloadTable = computed<ComparisonTableData>(() => ({
  columns: [
    { key: 'messages', label: 'Mensagens enviadas', align: 'right', format: 'number' },
    { key: 'contacts', label: 'Contatos atendidos', align: 'right', format: 'number' }
  ],
  rows: (workload.data.value?.entries ?? []).map((e) => {
    const m = e.meta as unknown as WorkloadMeta | undefined
    return {
      id: e.id,
      label: e.label,
      values: { messages: e.value, contacts: m?.contacts ?? 0 }
    }
  })
}))

function reloadAll(): void {
  avgDuration.execute()
  hoursSaved.execute()
  usage.execute()
  resolution.execute()
  humanVsAi.execute()
  satisfaction.execute()
  cost.execute()
  costByModel.execute()
  workload.execute()
  serviceHours.execute()
}

onMounted(reloadAll)
watch(() => [filters.initialDate, filters.finalDate], reloadAll)
</script>
```

- [ ] **Step 9.6: Typecheck + testes**

```bash
rtk npm run typecheck
rtk vitest run src/views/reportsV2 src/common/services
```
Esperado: 0 erros / PASS.

---

### Task 10: Fatia Mensagens — aba nova

**Files:**
- Modify: `src/common/services/ReportsV2Service.ts`
- Create: `src/views/reportsV2/tabs/MensagensTab.vue`
- Test: `src/views/reportsV2/tabs/__tests__/MensagensTab.spec.ts` (novo)

- [ ] **Step 10.1: Métodos restantes de mensagens no service** (workload/service-hours já existem da Task 9):

```ts
  getMessagesVolume: (filters: ReportsFilters): Promise<SegmentedTimeSeries> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/messages/volume`,
        buildReportParams("messages/volume", filters)
      ) as Promise<AxiosResponse<SegmentedTimeSeries>>
    ).then((res) => res.data),

  // Indicadores e distribution[].range em SEGUNDOS (doc §5).
  getMessagesResponseTime: (
    filters: ReportsFilters
  ): Promise<ResponseTimeMetrics> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/messages/response-time`,
        buildReportParams("messages/response-time", filters)
      ) as Promise<AxiosResponse<ResponseTimeMetrics>>
    ).then((res) => res.data),

  getMessagesConversations: (
    filters: ReportsFilters
  ): Promise<SegmentedTimeSeries> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/messages/conversations`,
        buildReportParams("messages/conversations", filters)
      ) as Promise<AxiosResponse<SegmentedTimeSeries>>
    ).then((res) => res.data),

  getMessagesDeliveryStatus: (filters: ReportsFilters): Promise<FunnelData> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/messages/delivery-status`,
        buildReportParams("messages/delivery-status", filters)
      ) as Promise<AxiosResponse<FunnelData>>
    ).then((res) => res.data),
```

Adicionar `ResponseTimeMetrics` e `HeatmapData` (se ainda não estiver) ao import de `@chatfunnel/contracts` no topo do service.

- [ ] **Step 10.2: Teste que falha — smoke da aba**

Criar `src/views/reportsV2/tabs/__tests__/MensagensTab.spec.ts`:

```ts
import { render, screen } from "@testing-library/vue";
import { describe, it, expect, vi } from "vitest";

const mockFilters = { initialDate: "2026-01-01", finalDate: "2026-01-31" };
vi.mock("../../composables/useReportsFilters", () => ({
  useReportsFilters: () => ({ filters: mockFilters, setFilters: vi.fn() }),
}));

vi.mock("@services/index", () => ({
  ReportsV2Service: {
    getMessagesVolume: vi.fn().mockResolvedValue({ granularity: "day", segments: [] }),
    getMessagesResponseTime: vi.fn().mockResolvedValue({
      averageSeconds: 120,
      medianSeconds: 90,
      p95Seconds: 600,
      count: 10,
      distribution: [{ label: "< 5min", range: [0, 300], count: 8 }],
    }),
    getMessagesConversations: vi.fn().mockResolvedValue({ granularity: "day", segments: [] }),
    getMessagesDeliveryStatus: vi.fn().mockResolvedValue({
      stages: [{ id: "sent", name: "Enviadas", total: 100 }],
    }),
  },
}));

import MensagensTab from "../MensagensTab.vue";

describe("MensagensTab", () => {
  it("renderiza as seções e formata o tempo médio de resposta em duração", async () => {
    render(MensagensTab);

    expect(await screen.findByText("Tempo de resposta")).toBeTruthy();
    // 120s -> "2m 0s" (formatMetricValue 'duration')
    expect(await screen.findByText("2m 0s")).toBeTruthy();
    expect(screen.getByText("Status de entrega")).toBeTruthy();
  });
});
```

- [ ] **Step 10.3: Rodar e confirmar falha**

```bash
rtk vitest run src/views/reportsV2/tabs/__tests__/MensagensTab.spec.ts
```
Esperado: FAIL — `../MensagensTab.vue` não existe.

- [ ] **Step 10.4: Criar `src/views/reportsV2/tabs/MensagensTab.vue`:**

```vue
<template>
  <div class="flex flex-col gap-4">
    <ReportSection
      title="Volume de mensagens"
      :loading="volume.loading.value"
      :error="volume.error.value"
      :empty="!!volume.data.value && volume.data.value.segments.length === 0"
    >
      <template #actions>
        <span class="typo-body-10-regular text-gray-700">Por origem (contato, bot, IA, humano)</span>
      </template>
      <SegmentedTimeSeriesChart :data="volume.data.value!" />
    </ReportSection>

    <ReportSection
      title="Tempo de resposta"
      :loading="responseTime.loading.value"
      :error="responseTime.error.value"
      :empty="!!responseTime.data.value && responseTime.data.value.count === 0"
    >
      <template #actions>
        <span class="typo-body-10-regular text-gray-700">
          Da mensagem do contato à primeira resposta
        </span>
      </template>
      <div class="flex flex-col gap-4">
        <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
          <MetricCard label="Média" :metric="rtAverage" />
          <MetricCard label="Mediana" :metric="rtMedian" />
          <MetricCard label="P95" :metric="rtP95" />
          <MetricCard label="Conversas avaliadas" :metric="rtCount" />
        </div>
        <AgingChart :data="rtDistribution" />
      </div>
    </ReportSection>

    <ReportSection
      title="Conversas ativas"
      :loading="conversations.loading.value"
      :error="conversations.error.value"
      :empty="!!conversations.data.value && conversations.data.value.segments.length === 0"
    >
      <template #actions>
        <span class="typo-body-10-regular text-gray-700">Abertas × fechadas</span>
      </template>
      <SegmentedTimeSeriesChart :data="conversations.data.value!" />
    </ReportSection>

    <ReportSection
      title="Status de entrega"
      :loading="deliveryStatus.loading.value"
      :error="deliveryStatus.error.value"
      :empty="!!deliveryStatus.data.value && deliveryStatus.data.value.stages.length === 0"
    >
      <template #actions>
        <span class="typo-body-10-regular text-gray-700">Enviadas → entregues → lidas</span>
      </template>
      <FunnelChart :data="deliveryStatus.data.value!" />
    </ReportSection>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import type { MetricCard as MetricCardData, AgingData } from '@chatfunnel/contracts'
import { ReportsV2Service } from '@services/index'
import { useReportsFilters } from '../composables/useReportsFilters'
import { useReportQuery } from '../composables/useReportQuery'
import ReportSection from '../components/shared/ReportSection.vue'
import MetricCard from '../components/primitives/MetricCard.vue'
import SegmentedTimeSeriesChart from '../components/primitives/SegmentedTimeSeriesChart.vue'
import AgingChart from '../components/primitives/AgingChart.vue'
import FunnelChart from '../components/primitives/FunnelChart.vue'

const { filters } = useReportsFilters()

const volume = useReportQuery(() => ReportsV2Service.getMessagesVolume({ ...filters }))
const responseTime = useReportQuery(() => ReportsV2Service.getMessagesResponseTime({ ...filters }))
const conversations = useReportQuery(() => ReportsV2Service.getMessagesConversations({ ...filters }))
const deliveryStatus = useReportQuery(() => ReportsV2Service.getMessagesDeliveryStatus({ ...filters }))

// ResponseTimeMetrics → cards de duração (valores em SEGUNDOS — doc §5).
const rtAverage = computed<MetricCardData>(() => ({
  value: responseTime.data.value!.averageSeconds,
  format: 'duration'
}))
const rtMedian = computed<MetricCardData>(() => ({
  value: responseTime.data.value!.medianSeconds,
  format: 'duration'
}))
const rtP95 = computed<MetricCardData>(() => ({
  value: responseTime.data.value!.p95Seconds,
  format: 'duration'
}))
const rtCount = computed<MetricCardData>(() => ({
  value: responseTime.data.value!.count,
  format: 'number'
}))
// distribution já vem com labels prontos (< 5min, 5–15…); AgingChart só usa label+count.
const rtDistribution = computed<AgingData>(() => ({
  buckets: responseTime.data.value!.distribution
}))

function reloadAll(): void {
  volume.execute()
  responseTime.execute()
  conversations.execute()
  deliveryStatus.execute()
}

onMounted(reloadAll)
watch(() => [filters.initialDate, filters.finalDate], reloadAll)
</script>
```

- [ ] **Step 10.5: Rodar e confirmar verde**

```bash
rtk vitest run src/views/reportsV2/tabs/__tests__/MensagensTab.spec.ts
rtk npm run typecheck
```
Esperado: PASS / 0 erros.

---

### Task 11: Fatia Broadcast — aba nova

**Files:**
- Modify: `src/common/services/ReportsV2Service.ts`
- Create: `src/views/reportsV2/tabs/BroadcastTab.vue`

- [ ] **Step 11.1: Métodos no service:**

```ts
  // ---- Broadcast ----

  getBroadcastsPerformance: (filters: ReportsFilters): Promise<FunnelData> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/broadcasts/performance`,
        buildReportParams("broadcasts/performance", filters)
      ) as Promise<AxiosResponse<FunnelData>>
    ).then((res) => res.data),

  // Lista cronológica; value = enviados; meta = { delivered, read, createdAt }.
  getBroadcastsHistory: (filters: ReportsFilters): Promise<Ranking> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/broadcasts/history`,
        buildReportParams("broadcasts/history", filters)
      ) as Promise<AxiosResponse<Ranking>>
    ).then((res) => res.data),

  // value = lidos; meta = { sent, delivered, read }.
  getBroadcastsReachBySegment: (filters: ReportsFilters): Promise<Ranking> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/broadcasts/reach-by-segment`,
        buildReportParams("broadcasts/reach-by-segment", filters)
      ) as Promise<AxiosResponse<Ranking>>
    ).then((res) => res.data),

  // cells[].value = taxa de leitura 0..1 (não contagem) — usar Heatmap valueFormat="rate".
  getBroadcastsBestSendTime: (filters: ReportsFilters): Promise<HeatmapData> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/broadcasts/best-send-time`,
        buildReportParams("broadcasts/best-send-time", filters)
      ) as Promise<AxiosResponse<HeatmapData>>
    ).then((res) => res.data),
```

- [ ] **Step 11.2: Criar `src/views/reportsV2/tabs/BroadcastTab.vue`:**

```vue
<template>
  <div class="flex flex-col gap-4">
    <ReportSection
      title="Performance de campanha"
      :loading="performance.loading.value"
      :error="performance.error.value"
      :empty="!!performance.data.value && performance.data.value.stages.length === 0"
    >
      <template #actions>
        <span class="typo-body-10-regular text-gray-700">Enviadas → entregues → lidas</span>
      </template>
      <FunnelChart :data="performance.data.value!" />
    </ReportSection>

    <ReportSection
      title="Histórico de broadcasts"
      :loading="history.loading.value"
      :error="history.error.value"
      :empty="!!history.data.value && history.data.value.entries.length === 0"
    >
      <ComparisonTable :table="historyTable" first-column-label="Campanha" />
    </ReportSection>

    <ReportSection
      title="Alcance por segmento"
      :loading="reach.loading.value"
      :error="reach.error.value"
      :empty="!!reach.data.value && reach.data.value.entries.length === 0"
    >
      <template #actions>
        <span class="typo-body-10-regular text-gray-700">Por tag usada nos envios</span>
      </template>
      <ComparisonTable :table="reachTable" first-column-label="Tag" />
    </ReportSection>

    <ReportSection
      title="Melhor horário de envio"
      :loading="bestSendTime.loading.value"
      :error="bestSendTime.error.value"
      :empty="!!bestSendTime.data.value && bestSendTime.data.value.cells.length === 0"
    >
      <template #actions>
        <span class="typo-body-10-regular text-gray-700">Taxa de leitura por dia × hora</span>
      </template>
      <Heatmap :data="bestSendTime.data.value!" value-format="rate" />
    </ReportSection>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { ReportsV2Service } from '@services/index'
import type { ComparisonTableData } from '../types/reportsV2.ui'
import { useReportsFilters } from '../composables/useReportsFilters'
import { useReportQuery } from '../composables/useReportQuery'
import ReportSection from '../components/shared/ReportSection.vue'
import FunnelChart from '../components/primitives/FunnelChart.vue'
import ComparisonTable from '../components/primitives/ComparisonTable.vue'
import Heatmap from '../components/primitives/Heatmap.vue'

const { filters } = useReportsFilters()

const performance = useReportQuery(() => ReportsV2Service.getBroadcastsPerformance({ ...filters }))
const history = useReportQuery(() => ReportsV2Service.getBroadcastsHistory({ ...filters }))
const reach = useReportQuery(() => ReportsV2Service.getBroadcastsReachBySegment({ ...filters }))
const bestSendTime = useReportQuery(() => ReportsV2Service.getBroadcastsBestSendTime({ ...filters }))

// meta chega como unknown; tipamos localmente (padrão sellerTable do FunilTab).
interface HistoryMeta {
  delivered: number
  read: number
  createdAt: string
}

const historyTable = computed<ComparisonTableData>(() => ({
  columns: [
    { key: 'sent', label: 'Enviados', align: 'right', format: 'number' },
    { key: 'delivered', label: 'Entregues', align: 'right', format: 'number' },
    { key: 'read', label: 'Lidos', align: 'right', format: 'number' },
    { key: 'createdAt', label: 'Criada em', align: 'right' }
  ],
  rows: (history.data.value?.entries ?? []).map((e) => {
    const m = e.meta as unknown as HistoryMeta | undefined
    return {
      id: e.id,
      label: e.label,
      values: {
        sent: e.value,
        delivered: m?.delivered ?? 0,
        read: m?.read ?? 0,
        createdAt: m?.createdAt ? new Date(m.createdAt).toLocaleDateString('pt-BR') : '-'
      }
    }
  })
}))

interface ReachMeta {
  sent: number
  delivered: number
  read: number
}

const reachTable = computed<ComparisonTableData>(() => ({
  columns: [
    { key: 'sent', label: 'Enviados', align: 'right', format: 'number' },
    { key: 'delivered', label: 'Entregues', align: 'right', format: 'number' },
    { key: 'read', label: 'Lidos', align: 'right', format: 'number' }
  ],
  rows: (reach.data.value?.entries ?? []).map((e) => {
    const m = e.meta as unknown as ReachMeta | undefined
    return {
      id: e.id,
      label: e.label,
      values: {
        sent: m?.sent ?? 0,
        delivered: m?.delivered ?? 0,
        read: m?.read ?? e.value
      }
    }
  })
}))

function reloadAll(): void {
  performance.execute()
  history.execute()
  reach.execute()
  bestSendTime.execute()
}

onMounted(reloadAll)
watch(() => [filters.initialDate, filters.finalDate], reloadAll)
</script>
```

- [ ] **Step 11.3: Typecheck**

```bash
rtk npm run typecheck
```
Esperado: 0 erros.

---

### Task 12: Rotas e navegação das abas novas

**Files:**
- Modify: `src/views/reportsV2/routes.ts`
- Modify: `src/views/reportsV2/ReportsV2View.vue:39-46`

- [ ] **Step 12.1: Adicionar rotas em `routes.ts`** — inserir entre `contatos` e `automacoes`:

```ts
    {
      path: "mensagens",
      name: "ReportsV2Mensagens",
      component: () => import("./tabs/MensagensTab.vue"),
      meta: { title: "ChatFunnel - Relatorios - Mensagens" },
    },
```

E entre `automacoes` e `agendamentos`:

```ts
    {
      path: "broadcast",
      name: "ReportsV2Broadcast",
      component: () => import("./tabs/BroadcastTab.vue"),
      meta: { title: "ChatFunnel - Relatorios - Broadcast" },
    },
```

- [ ] **Step 12.2: Atualizar `TABS` no `ReportsV2View.vue`:**

```ts
const TABS: { key: TabKey; label: string }[] = [
  { key: 'geral', label: 'Geral' },
  { key: 'funil', label: 'Funil' },
  { key: 'contatos', label: 'Contatos / Leads' },
  { key: 'mensagens', label: 'Mensagens' },
  { key: 'automacoes', label: 'Flows / Automações' },
  { key: 'broadcast', label: 'Broadcast' },
  { key: 'agendamentos', label: 'Agendamentos' },
  { key: 'colaboradores', label: 'Agentes / Colaboradores' }
]
```

- [ ] **Step 12.3: Typecheck + suíte completa do módulo**

```bash
rtk npm run typecheck
rtk vitest run src/views/reportsV2 src/common/services
```
Esperado: 0 erros / PASS.

---

### Task 13: Verificação final

**Files:** nenhum (verificação)

- [ ] **Step 13.1: Suíte completa + typecheck**

```bash
rtk vitest run
rtk npm run typecheck
```
Esperado: PASS / 0 erros (suíte completa — checa regressão fora do módulo).

- [ ] **Step 13.2: Smoke manual contra o backend real** (requer services :3200 e front dev)

```bash
rtk npm run dev
```
Abrir `https://localhost:5173/reports` e verificar, aba por aba:
- **Geral:** "Visão geral" sem badge de mock, 4 cards pt-BR, receita ganha em reais (não milhares de vezes maior — sintoma de centavos não normalizados).
- **Contatos:** "Crescimento por origem" plota segmentos com cores distintas; "Campos personalizados" troca o ranking ao mudar o select (ou estado vazio se a conta não tem campos).
- **Mensagens:** tempos formatados como duração (`2m 30s`), funil de entrega com 3 estágios.
- **Automações / Agendamentos / Broadcast / Colaboradores:** seções carregam sem 400 no console (400 = param fora da whitelist — conferir `ENDPOINT_OPTIONAL`).
- **Broadcast → Melhor horário:** tooltip da célula em `%`.
- **Colaboradores → Custo de IA:** valores `US$` (não `R$`).

- [ ] **Step 13.3: Atualizar o grafo do front**

```bash
D:/Code/4-Vinicius/Chatfunnel/graphify-test/.venv/Scripts/graphify.exe update .
```

- [ ] **Step 13.4: Informar o usuário** — branch pronta para review/PR. **Não** fazer merge nem push sem o usuário pedir.

---

## Cobertura — checklist relatório ↔ task

| Relatório | Task | Aba |
|---|---|---|
| `dashboard.summary` | 5 | Geral |
| `contacts.growth-by-source` | 6 | Contatos |
| `contacts.by-custom-field` | 6 | Contatos |
| filtros UTM (growth, peak-hours, by-channel, growth-by-source) | 1 | Contatos/Geral |
| `automations.executions` / `by-trigger` / `top` | 7 | Automações |
| `general.feed` (reuso) | 7 | Automações |
| `schedules.volume` | 8 | Agendamentos |
| `agents.usage` / `satisfaction` / `cost` / `cost-by-model` / `resolution` / `human-vs-ai` / `avg-session-duration` | 9 | Colaboradores |
| `intelligence.ai-hours-saved` | 9 | Colaboradores |
| `messages.workload` / `service-hours` | 9 | Colaboradores |
| `messages.volume` / `response-time` / `conversations` / `delivery-status` | 10 | Mensagens |
| `broadcasts.performance` / `history` / `reach-by-segment` / `best-send-time` | 11 | Broadcast |
| Fora do plano: `dashboard.metric`, `dashboard.periodic-summary` (decisão), `crm.*`/`contacts.*` restantes (já integrados) | — | — |
