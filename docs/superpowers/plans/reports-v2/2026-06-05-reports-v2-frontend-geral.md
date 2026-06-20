# Reports v2 — Frontend (Fundacao + Aba Geral) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a fundacao do front de Relatorios V2 (`src/views/reportsV2/`) — shell com 5 abas fixas via rotas aninhadas, filtros via composable + querystring, Chart.js configurado — e entregar a aba **Geral** consumindo `overview`, `leads-series` e `activity-heatmap`.

**Architecture:** Tela unica com `<router-view>` aninhado; cada aba e um componente fino que compoe **primitivos burros** (MetricCard, TimeSeriesChart, Heatmap, EventFeed). Os tipos vem de `@chatfunnel/contracts` (zero redeclaracao). Fetch via composable `useReportQuery` (estado loading/data/erro) sobre um service que usa o axios `NestApi` ja existente. Filtros centralizados em `useReportsFilters`, sincronizados com a URL. E o espelho no front do "engine + catalog" do backend.

**Tech Stack:** Vue 3 (`<script setup lang="ts">`), Vue Router, TypeScript, Chart.js 4 + vue-chartjs 5 (ja instalados), Vitest 4 + @vue/test-utils, `@chatfunnel/contracts` (Zod + `z.infer`).

**Branch:** `feature/reports-v2` (ja ativa em front/services/contracts). Commits seguem as regras do projeto: **sem `Co-Authored-By`**, nunca na `main`/`release`.

**Escopo deste plano:** Fundacao + aba **Geral** (Fatia 1 do plano por fatias). As abas Funil, Flows/Automacoes, Colaboradores e Agendamentos entram como **placeholders navegaveis** aqui e ganham implementacao completa em planos proprios (Fatias 2-6), reusando os primitivos criados aqui. Os primitivos `RankingList`, `FunnelChart` e `ComparisonTable` nascem nesses planos seguintes.

**Documentos base:**
- `vault/wiki/features/reports-v2-front-arquitetura.md` (arquitetura do front)
- `vault/wiki/features/reports-v2-arquitetura.md` (backend)
- `docs/superpowers/specs/2026-06-03-relatorios-v2-escopo-por-aba.md` (escopo por aba)
- `docs/superpowers/plans/2026-06-03-relatorios-v2-implementacao-por-fatias.md` (fatias)

---

## Convencoes verificadas no codebase (ler antes de comecar)

- **Service HTTP:** `import { Api, NestApi } from "@/common/api/index"`. Reports V2 e NestJS → usar **`NestApi`**. Padrao curried: `NestApi.get()(url, params)`, `NestApi.post()(url, body)`. O `get`/`post` retornam o **response do axios** (use `res.data`). Erros HTTP (toast + logout 401) ja sao tratados no interceptor de `src/common/api/index.js` — **nao adicionar catch que re-exiba mensagem**.
- **Prefixo de rota da API:** services NestApi usam caminhos sem `/nest` (ex.: `NestApi.get()("/tags")`). Portanto os endpoints v2 no front sao `/reports/v2/...` (o `/nest` do gateway ja esta embutido no baseURL). Constante `REPORTS_V2_BASE = "/reports/v2"`.
- **Router:** `src/router/index.js` (JS). Rotas autenticadas sao `children` do `FullLayout` (`meta.requiresAuth`). Cada child tem `meta: { title, ... }`. Vite resolve imports `.ts` a partir do `.js`.
- **Tipos compartilhados:** `import type { Dashboard, TimeSeries, HeatmapData, EventFeed, MetricCard } from "@chatfunnel/contracts"`. Esses shapes ja existem em `reports.contracts.ts` e estao reexportados pelo barrel do pacote (`endpoints/index.ts` → `index.ts`) — basta o build+sync do contracts estar feito (Task 0).
- **Testes:** Vitest 4. Specs em `__tests__/*.spec.ts` ao lado do codigo. `@vue/test-utils` disponivel (`mount`). **Componentes com Chart.js NAO sao montaveis em jsdom** (falta canvas) — por isso a logica de transformacao mora em helpers puros testados isoladamente; o `.vue` do chart so renderiza.
- **Brand:** cor primaria `--color-brand-500: #3CA1A1` (em `src/assets/tailwind/shadcn-theme.css`).
- **Tabs shadcn:** `src/components/ui/tabs` exporta `Tabs, TabsList, TabsTrigger, TabsContent`.

---

## File Structure

```
chatfunnel-front/src/views/reportsV2/
├── ReportsV2View.vue                  # shell: header + ReportsFilterBar + tabs + <router-view>
├── routes.ts                          # RouteRecordRaw "reports" com children
├── tabs/
│   ├── GeralTab.vue                   # implementada nesta fatia
│   ├── FunilTab.vue                   # placeholder "Em breve"
│   ├── AutomacoesTab.vue              # placeholder
│   ├── AgendamentosTab.vue            # placeholder
│   └── ColaboradoresTab.vue          # placeholder
├── components/
│   ├── primitives/
│   │   ├── MetricCard.vue
│   │   ├── TimeSeriesChart.vue
│   │   ├── Heatmap.vue
│   │   └── EventFeed.vue
│   ├── filters/
│   │   └── ReportsFilterBar.vue
│   └── shared/
│       ├── ReportSection.vue
│       └── ReportSkeleton.vue
├── composables/
│   ├── useReportQuery.ts
│   ├── useReportsFilters.ts
│   ├── useReportsFilters.helpers.ts   # puro (testavel)
│   └── __tests__/
│       ├── useReportQuery.spec.ts
│       └── useReportsFilters.helpers.spec.ts
├── charts/
│   └── chart.config.ts
├── utils/
│   ├── format.ts                      # formatMetricValue
│   ├── heatmap.ts                     # buildHeatmapMatrix
│   └── __tests__/
│       ├── format.spec.ts
│       └── heatmap.spec.ts
└── types/
    └── reportsV2.ui.ts                # ReportsFilters, TabKey
```

> **Service HTTP fica fora da pasta da feature.** Por convencao do projeto, services HTTP vivem em `src/common/services/` (nomeados `XxxService`, reexportados pelo barrel `index.js`, importados via `@services`). Por isso nao ha pasta `api/` dentro de `reportsV2/`.

Modificacoes fora da pasta:
- `chatfunnel-contracts` — **build + sync manual** do pacote para o `node_modules` do front (Task 0; source ja pronto, nenhum codigo a alterar)
- `chatfunnel-front/src/common/services/ReportsV2Service.ts` — service HTTP da feature (Task 5)
- `chatfunnel-front/src/common/services/index.js` — registrar `ReportsV2Service` no barrel (Task 5)
- `chatfunnel-front/src/router/index.js` — registrar `reportsV2Route` (Task 18)

---

## Task 0: Build + sync do @chatfunnel/contracts (passo manual do usuario)

> Os shapes de reports **ja existem e ja estao reexportados** no source do `chatfunnel-contracts`:
> `src/endpoints/reports.contracts.ts` → `src/endpoints/index.ts` → `src/index.ts`. **Nao ha codigo a alterar no contracts.**
> O unico bloqueio e que a copia instalada em `chatfunnel-front/node_modules/@chatfunnel/contracts` esta
> desatualizada (sem a pasta `endpoints/`). O **build + sync** do pacote para o node_modules do front e feito
> **manualmente pelo usuario** (regra do projeto: nunca editar/sincronizar `node_modules` automaticamente).

**Files:**
- Verify (read-only): `chatfunnel-contracts/src/endpoints/index.ts` (ja contem `export * from "./reports.contracts"`)
- Verify (read-only): `chatfunnel-front/package.json` (dependencia `@chatfunnel/contracts`)

- [ ] **Step 1: Confirmar o reexport no source do contracts (ja presente)**

Run: `grep -n "reports.contracts" chatfunnel-contracts/src/endpoints/index.ts`
Expected: linha `export * from "./reports.contracts";`. Nada a fazer no codigo do contracts.

- [ ] **Step 2: [USUARIO] Rebuild + sync do pacote para o front**

PARE. Passo manual do usuario: rebuildar `chatfunnel-contracts` e sincronizar o `dist/` para
`chatfunnel-front/node_modules/@chatfunnel/contracts`. So prossiga quando o usuario confirmar que o sync terminou.

- [ ] **Step 3: Confirmar que a copia do front ja tem os endpoints**

Run: `ls chatfunnel-front/node_modules/@chatfunnel/contracts/dist/endpoints/reports.contracts.d.ts`
Expected: o arquivo existe (sync concluido). Se nao existir, o sync ainda nao foi feito — volte ao Step 2.

- [ ] **Step 4: Confirmar resolucao dos tipos no front**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep "@chatfunnel/contracts"`
Expected: nenhuma linha relacionada a `@chatfunnel/contracts` (os tipos resolvem; erros pre-existentes do projeto podem aparecer, mas nenhum sobre o pacote).

---

## Task 1: Tipos de UI

**Files:**
- Create: `chatfunnel-front/src/views/reportsV2/types/reportsV2.ui.ts`

- [ ] **Step 1: Criar os tipos so-de-UI**

```ts
// Tipos exclusivos da UI de Relatorios V2.
// Shapes de DADOS vem de @chatfunnel/contracts — nunca redeclarar aqui.

export type TabKey =
  | "geral"
  | "funil"
  | "automacoes"
  | "agendamentos"
  | "colaboradores";

// Estado dos filtros da tela. Datas em ISO "yyyy-mm-dd".
export interface ReportsFilters {
  initialDate: string;
  finalDate: string;
  channelId?: string;
  origin?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}
```

---

## Task 2: Helpers puros de filtros (TDD)

**Files:**
- Create: `chatfunnel-front/src/views/reportsV2/composables/useReportsFilters.helpers.ts`
- Test: `chatfunnel-front/src/views/reportsV2/composables/__tests__/useReportsFilters.helpers.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from "vitest";
import {
  defaultFilters,
  filtersToQuery,
  queryToFilters,
  toISODate,
} from "../useReportsFilters.helpers";

describe("useReportsFilters.helpers", () => {
  it("toISODate formata para yyyy-mm-dd", () => {
    expect(toISODate(new Date("2026-06-05T13:00:00Z"))).toBe("2026-06-05");
  });

  it("defaultFilters cobre os ultimos 30 dias (inclusive)", () => {
    const f = defaultFilters(new Date("2026-06-30T00:00:00Z"));
    expect(f.finalDate).toBe("2026-06-30");
    expect(f.initialDate).toBe("2026-06-01");
  });

  it("filtersToQuery omite chaves vazias/undefined", () => {
    const q = filtersToQuery({
      initialDate: "2026-06-01",
      finalDate: "2026-06-30",
      channelId: "",
      origin: undefined,
      utmSource: "meta",
    });
    expect(q).toEqual({
      initialDate: "2026-06-01",
      finalDate: "2026-06-30",
      utmSource: "meta",
    });
  });

  it("queryToFilters usa fallback para datas ausentes e ignora arrays", () => {
    const fallback = { initialDate: "2026-06-01", finalDate: "2026-06-30" };
    const f = queryToFilters(
      { utmSource: "meta", origin: ["a", "b"] as unknown as string },
      fallback
    );
    expect(f.initialDate).toBe("2026-06-01");
    expect(f.finalDate).toBe("2026-06-30");
    expect(f.utmSource).toBe("meta");
    expect(f.origin).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/composables/__tests__/useReportsFilters.helpers.spec.ts`
Expected: FAIL — modulo `../useReportsFilters.helpers` nao existe.

- [ ] **Step 3: Implementar os helpers**

```ts
import type { ReportsFilters } from "../types/reportsV2.ui";

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Ultimos 30 dias inclusivos: [now-29, now].
export function defaultFilters(now: Date): ReportsFilters {
  const initial = new Date(now);
  initial.setUTCDate(initial.getUTCDate() - 29);
  return { initialDate: toISODate(initial), finalDate: toISODate(now) };
}

export function filtersToQuery(f: ReportsFilters): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(f)) {
    if (typeof v === "string" && v !== "") out[k] = v;
  }
  return out;
}

type RawQuery = Record<string, string | string[] | undefined | null>;

export function queryToFilters(q: RawQuery, fallback: ReportsFilters): ReportsFilters {
  const pick = (k: string): string | undefined =>
    typeof q[k] === "string" && q[k] !== "" ? (q[k] as string) : undefined;
  return {
    initialDate: pick("initialDate") ?? fallback.initialDate,
    finalDate: pick("finalDate") ?? fallback.finalDate,
    channelId: pick("channelId"),
    origin: pick("origin"),
    utmSource: pick("utmSource"),
    utmMedium: pick("utmMedium"),
    utmCampaign: pick("utmCampaign"),
  };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/composables/__tests__/useReportsFilters.helpers.spec.ts`
Expected: PASS (4 testes).

---

## Task 3: Composable useReportsFilters (sync querystring)

**Files:**
- Create: `chatfunnel-front/src/views/reportsV2/composables/useReportsFilters.ts`

- [ ] **Step 1: Implementar o composable**

```ts
import { reactive, watch, readonly } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { ReportsFilters } from "../types/reportsV2.ui";
import { defaultFilters, filtersToQuery, queryToFilters } from "./useReportsFilters.helpers";

// Estado unico dos filtros da tela, espelhado na querystring.
// Deep-link carrega periodo/UTM automaticamente.
export function useReportsFilters() {
  const route = useRoute();
  const router = useRouter();

  const fallback = defaultFilters(new Date());
  const state = reactive<ReportsFilters>(
    queryToFilters(route.query as Record<string, string>, fallback)
  );

  // Escreve mudancas de filtro na URL (replace, sem empilhar historico).
  watch(
    () => ({ ...state }),
    (next) => {
      router.replace({ query: { ...route.query, ...filtersToQuery(next) } });
    },
    { deep: true }
  );

  function setFilters(patch: Partial<ReportsFilters>): void {
    Object.assign(state, patch);
  }

  return { filters: readonly(state), setFilters };
}
```

- [ ] **Step 2: Verificar typecheck do arquivo**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep reportsV2/composables/useReportsFilters.ts`
Expected: nenhuma linha (sem erros nesse arquivo).

---

## Task 4: Composable useReportQuery (TDD)

**Files:**
- Create: `chatfunnel-front/src/views/reportsV2/composables/useReportQuery.ts`
- Test: `chatfunnel-front/src/views/reportsV2/composables/__tests__/useReportQuery.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from "vitest";
import { nextTick } from "vue";
import { useReportQuery } from "../useReportQuery";

describe("useReportQuery", () => {
  it("estado inicial: data null, loading false, sem erro", () => {
    const { data, loading, error } = useReportQuery(async () => 42);
    expect(data.value).toBeNull();
    expect(loading.value).toBe(false);
    expect(error.value).toBeNull();
  });

  it("execute popula data e desliga loading no sucesso", async () => {
    const { data, loading, error, execute } = useReportQuery(async () => 42);
    const p = execute();
    expect(loading.value).toBe(true);
    await p;
    await nextTick();
    expect(data.value).toBe(42);
    expect(loading.value).toBe(false);
    expect(error.value).toBeNull();
  });

  it("execute captura erro sem relancar e desliga loading", async () => {
    const boom = new Error("falhou");
    const { data, loading, error, execute } = useReportQuery(async () => {
      throw boom;
    });
    await execute();
    expect(error.value).toBe(boom);
    expect(loading.value).toBe(false);
    expect(data.value).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/composables/__tests__/useReportQuery.spec.ts`
Expected: FAIL — modulo `../useReportQuery` nao existe.

- [ ] **Step 3: Implementar o composable**

```ts
import { ref, shallowRef, type Ref } from "vue";

export interface UseReportQuery<T> {
  data: Ref<T | null>;
  loading: Ref<boolean>;
  error: Ref<unknown | null>;
  execute: () => Promise<void>;
}

// Wrapper de fetch com estado loading/data/erro.
// O erro HTTP (toast + logout 401) JA foi tratado pelo interceptor do Axios
// em src/common/api/index.js. Aqui so capturamos o estado para o slot de erro —
// nao re-exibimos mensagem (respeita a regra "sem catch redundante").
export function useReportQuery<T>(fetcher: () => Promise<T>): UseReportQuery<T> {
  const data = shallowRef<T | null>(null);
  const loading = ref(false);
  const error = ref<unknown | null>(null);

  async function execute(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      data.value = await fetcher();
    } catch (err) {
      error.value = err;
    } finally {
      loading.value = false;
    }
  }

  return { data, loading, error, execute };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/composables/__tests__/useReportQuery.spec.ts`
Expected: PASS (3 testes).

---

## Task 5: Service da API (ReportsV2Service)

> Convencao do projeto: services HTTP vivem em `src/common/services/` e sao nomeados `XxxService` (ex.: `ContactsService.js`, `McpService.ts`), reexportados pelo barrel `src/common/services/index.js` e importados via alias `@services` (ex.: `import { AuthService } from "@services/index"`). NAO criar pasta `api/` dentro da feature.

**Files:**
- Create: `chatfunnel-front/src/common/services/ReportsV2Service.ts`
- Modify: `chatfunnel-front/src/common/services/index.js` (registrar no barrel)

- [ ] **Step 1: Implementar o service**

```ts
import { NestApi } from "../api/index";
import type { Dashboard, TimeSeries, HeatmapData, EventFeed } from "@chatfunnel/contracts";
import type { ReportsFilters } from "@/views/reportsV2/types/reportsV2.ui";

// /nest ja esta no baseURL do NestApi (services usam caminhos sem /nest).
const REPORTS_V2_BASE = "/reports/v2";

// NestApi.get()(url, params) resolve para o response do axios → usamos res.data.
const ReportsV2Service = {
  getDashboardOverview: (filters: ReportsFilters): Promise<Dashboard> =>
    NestApi.get()(`${REPORTS_V2_BASE}/dashboard/overview`, filters).then(
      (res: { data: Dashboard }) => res.data
    ),

  getLeadsSeries: (filters: ReportsFilters): Promise<TimeSeries> =>
    NestApi.get()(`${REPORTS_V2_BASE}/dashboard/leads-series`, filters).then(
      (res: { data: TimeSeries }) => res.data
    ),

  getActivityHeatmap: (filters: ReportsFilters): Promise<HeatmapData> =>
    NestApi.get()(`${REPORTS_V2_BASE}/dashboard/activity-heatmap`, filters).then(
      (res: { data: HeatmapData }) => res.data
    ),

  getEventFeed: (filters: ReportsFilters): Promise<EventFeed> =>
    NestApi.get()(`${REPORTS_V2_BASE}/dashboard/events`, filters).then(
      (res: { data: EventFeed }) => res.data
    ),
};

export default ReportsV2Service;
```

- [ ] **Step 2: Registrar no barrel de services**

Abrir `chatfunnel-front/src/common/services/index.js` e adicionar a reexportacao seguindo o padrao das linhas existentes (mesmo estilo usado para `ContactsService`/`McpService`):

```js
export { default as ReportsV2Service } from "./ReportsV2Service";
```

- [ ] **Step 3: Verificar typecheck**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep ReportsV2Service`
Expected: nenhuma linha.

---

## Task 6: Config global do Chart.js

**Files:**
- Create: `chatfunnel-front/src/views/reportsV2/charts/chart.config.ts`

- [ ] **Step 1: Implementar registro + tema**

```ts
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Filler,
} from "chart.js";

// Registro unico dos modulos usados pelos charts de Relatorios.
Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Filler
);

// Cor primaria da brand (ver src/assets/tailwind/shadcn-theme.css → --color-brand-500).
export const BRAND_500 = "#3CA1A1";

// Opcoes base de linha — herdadas por todos os TimeSeriesChart.
export const baseLineOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { intersect: false, mode: "index" as const },
  },
  scales: {
    x: { grid: { display: false } },
    y: { beginAtZero: true, ticks: { precision: 0 } },
  },
};
```

---

## Task 7: Util formatMetricValue (TDD)

**Files:**
- Create: `chatfunnel-front/src/views/reportsV2/utils/format.ts`
- Test: `chatfunnel-front/src/views/reportsV2/utils/__tests__/format.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from "vitest";
import { formatMetricValue } from "../format";

describe("formatMetricValue", () => {
  it("number sem format", () => {
    expect(formatMetricValue(1234, undefined)).toBe("1.234");
  });
  it("currency em BRL", () => {
    expect(formatMetricValue(1234.5, "currency")).toContain("1.234,50");
  });
  it("percentage", () => {
    expect(formatMetricValue(12.5, "percentage")).toBe("12,5%");
  });
  it("duration em segundos → h m s", () => {
    expect(formatMetricValue(3661, "duration")).toBe("1h 1m 1s");
    expect(formatMetricValue(45, "duration")).toBe("45s");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/utils/__tests__/format.spec.ts`
Expected: FAIL — modulo `../format` nao existe.

- [ ] **Step 3: Implementar o util**

```ts
import type { MetricCardFormat } from "@chatfunnel/contracts";

const nf = new Intl.NumberFormat("pt-BR");
const cf = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatDuration(totalSeconds: number): string {
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor((totalSeconds / 60) % 60);
  const h = Math.floor(totalSeconds / 3600);
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

export function formatMetricValue(
  value: number,
  format: MetricCardFormat | undefined
): string {
  switch (format) {
    case "currency":
      return cf.format(value);
    case "percentage":
      return `${nf.format(value)}%`;
    case "duration":
      return formatDuration(value);
    case "number":
    default:
      return nf.format(value);
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/utils/__tests__/format.spec.ts`
Expected: PASS (4 testes). Obs.: o teste de currency usa `toContain("1.234,50")` justamente porque o `Intl` pt-BR usa NBSP entre `R$` e o numero — evita falso negativo por tipo de espaco.

---

## Task 8: Util buildHeatmapMatrix (TDD)

**Files:**
- Create: `chatfunnel-front/src/views/reportsV2/utils/heatmap.ts`
- Test: `chatfunnel-front/src/views/reportsV2/utils/__tests__/heatmap.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from "vitest";
import { buildHeatmapMatrix } from "../heatmap";
import type { HeatmapData } from "@chatfunnel/contracts";

describe("buildHeatmapMatrix", () => {
  it("monta matriz 7x24 zerada e preenche celulas", () => {
    const data: HeatmapData = {
      max: 10,
      cells: [
        { day: 0, hour: 0, value: 5 },
        { day: 6, hour: 23, value: 10 },
      ],
    };
    const m = buildHeatmapMatrix(data);
    expect(m.length).toBe(7);
    expect(m[0].length).toBe(24);
    expect(m[0][0]).toBe(5);
    expect(m[6][23]).toBe(10);
    expect(m[3][12]).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/utils/__tests__/heatmap.spec.ts`
Expected: FAIL — modulo `../heatmap` nao existe.

- [ ] **Step 3: Implementar o util**

```ts
import type { HeatmapData } from "@chatfunnel/contracts";

// Converte as celulas esparsas (day 0-6, hour 0-23) numa matriz densa 7x24.
// Linha = dia da semana (0=domingo), coluna = hora.
export function buildHeatmapMatrix(data: HeatmapData): number[][] {
  const matrix: number[][] = Array.from({ length: 7 }, () =>
    new Array<number>(24).fill(0)
  );
  for (const cell of data.cells) {
    matrix[cell.day][cell.hour] = cell.value;
  }
  return matrix;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/utils/__tests__/heatmap.spec.ts`
Expected: PASS (1 teste).

---

## Task 9: Componentes compartilhados (ReportSection, ReportSkeleton)

**Files:**
- Create: `chatfunnel-front/src/views/reportsV2/components/shared/ReportSkeleton.vue`
- Create: `chatfunnel-front/src/views/reportsV2/components/shared/ReportSection.vue`

- [ ] **Step 1: Implementar ReportSkeleton.vue**

```vue
<script setup lang="ts">
// Placeholder de carregamento generico.
withDefaults(defineProps<{ height?: string }>(), { height: "120px" });
</script>

<template>
  <div class="report-skeleton" :style="{ height }" />
</template>

<style scoped>
.report-skeleton {
  width: 100%;
  border-radius: 12px;
  background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 37%, #f3f4f6 63%);
  background-size: 400% 100%;
  animation: report-shimmer 1.4s ease infinite;
}
@keyframes report-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: 0 0; }
}
</style>
```

- [ ] **Step 2: Implementar ReportSection.vue**

```vue
<script setup lang="ts">
import ReportSkeleton from "./ReportSkeleton.vue";

defineProps<{
  title: string;
  loading?: boolean;
  error?: unknown | null;
  empty?: boolean;
}>();
</script>

<template>
  <section class="report-section">
    <header class="report-section__head">
      <h3 class="report-section__title">{{ title }}</h3>
      <slot name="actions" />
    </header>

    <ReportSkeleton v-if="loading" />
    <p v-else-if="error" class="report-section__state report-section__state--error">
      Nao foi possivel carregar estes dados.
    </p>
    <p v-else-if="empty" class="report-section__state">
      Nenhum dado para o periodo selecionado.
    </p>
    <slot v-else />
  </section>
</template>

<style scoped>
.report-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 12px;
  background: var(--color-card, #fff);
}
.report-section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.report-section__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-foreground, #111827);
}
.report-section__state {
  font-size: 13px;
  color: #6b7280;
  padding: 24px 0;
  text-align: center;
}
.report-section__state--error {
  color: #b91c1c;
}
</style>
```

---

## Task 10: Primitivo MetricCard (TDD de render)

**Files:**
- Create: `chatfunnel-front/src/views/reportsV2/components/primitives/MetricCard.vue`
- Test: `chatfunnel-front/src/views/reportsV2/components/primitives/__tests__/MetricCard.spec.ts`

> Sem canvas: o sparkline (opcional no contract) NAO entra neste MVP — so valor + delta. Mantem o componente montavel em jsdom.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import MetricCard from "../MetricCard.vue";
import type { MetricCard as MetricCardData } from "@chatfunnel/contracts";

describe("MetricCard", () => {
  it("exibe label e valor formatado", () => {
    const metric: MetricCardData = { value: 1234, format: "number" };
    const wrapper = mount(MetricCard, { props: { label: "Leads", metric } });
    expect(wrapper.text()).toContain("Leads");
    expect(wrapper.text()).toContain("1.234");
  });

  it("exibe delta positivo com sinal", () => {
    const metric: MetricCardData = {
      value: 100,
      format: "number",
      delta: { absolute: 10, percentage: 11.1 },
    };
    const wrapper = mount(MetricCard, { props: { label: "Leads", metric } });
    expect(wrapper.text()).toContain("11,1%");
    expect(wrapper.find(".metric-card__delta--up").exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/components/primitives/__tests__/MetricCard.spec.ts`
Expected: FAIL — componente nao existe.

- [ ] **Step 3: Implementar MetricCard.vue**

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { MetricCard as MetricCardData } from "@chatfunnel/contracts";
import { formatMetricValue } from "../../utils/format";

const props = defineProps<{ label: string; metric: MetricCardData }>();

const formattedValue = computed(() =>
  formatMetricValue(props.metric.value, props.metric.format)
);
const deltaUp = computed(() => (props.metric.delta?.percentage ?? 0) >= 0);
</script>

<template>
  <div class="metric-card">
    <span class="metric-card__label">{{ label }}</span>
    <strong class="metric-card__value">{{ formattedValue }}</strong>
    <span
      v-if="metric.delta"
      class="metric-card__delta"
      :class="deltaUp ? 'metric-card__delta--up' : 'metric-card__delta--down'"
    >
      {{ deltaUp ? "▲" : "▼" }}
      {{ Math.abs(metric.delta.percentage).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) }}%
    </span>
  </div>
</template>

<style scoped>
.metric-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 12px;
  background: var(--color-card, #fff);
}
.metric-card__label {
  font-size: 12px;
  color: #6b7280;
}
.metric-card__value {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-foreground, #111827);
}
.metric-card__delta {
  font-size: 12px;
  font-weight: 600;
}
.metric-card__delta--up { color: #047857; }
.metric-card__delta--down { color: #b91c1c; }
</style>
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/components/primitives/__tests__/MetricCard.spec.ts`
Expected: PASS (2 testes).

---

## Task 11: Primitivo TimeSeriesChart

**Files:**
- Create: `chatfunnel-front/src/views/reportsV2/components/primitives/TimeSeriesChart.vue`

> Sem teste de mount (Chart.js precisa de canvas, indisponivel em jsdom). A logica de transformacao e trivial e inline; a config vem de `chart.config.ts`.

- [ ] **Step 1: Implementar TimeSeriesChart.vue**

```vue
<script setup lang="ts">
import { computed } from "vue";
import { Line } from "vue-chartjs";
import type { TimeSeries } from "@chatfunnel/contracts";
import { BRAND_500, baseLineOptions } from "../../charts/chart.config";

const props = defineProps<{ data: TimeSeries; label?: string }>();

const chartData = computed(() => ({
  labels: props.data.series.map((p) => p.label ?? p.date),
  datasets: [
    {
      label: props.label ?? "Total",
      data: props.data.series.map((p) => p.value),
      borderColor: BRAND_500,
      backgroundColor: "rgba(60, 161, 161, 0.12)",
      fill: true,
      tension: 0.3,
      pointRadius: 2,
    },
  ],
}));
</script>

<template>
  <div class="time-series-chart">
    <Line :data="chartData" :options="baseLineOptions" />
  </div>
</template>

<style scoped>
.time-series-chart {
  position: relative;
  height: 260px;
  width: 100%;
}
</style>
```

- [ ] **Step 2: Verificar typecheck**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep TimeSeriesChart.vue`
Expected: nenhuma linha.

---

## Task 12: Primitivo Heatmap (CSS Grid)

**Files:**
- Create: `chatfunnel-front/src/views/reportsV2/components/primitives/Heatmap.vue`
- Test: `chatfunnel-front/src/views/reportsV2/components/primitives/__tests__/Heatmap.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import Heatmap from "../Heatmap.vue";
import type { HeatmapData } from "@chatfunnel/contracts";

describe("Heatmap", () => {
  it("renderiza 7x24 celulas", () => {
    const data: HeatmapData = { max: 10, cells: [{ day: 0, hour: 0, value: 5 }] };
    const wrapper = mount(Heatmap, { props: { data } });
    expect(wrapper.findAll(".heatmap__cell").length).toBe(7 * 24);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/components/primitives/__tests__/Heatmap.spec.ts`
Expected: FAIL — componente nao existe.

- [ ] **Step 3: Implementar Heatmap.vue**

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { HeatmapData } from "@chatfunnel/contracts";
import { buildHeatmapMatrix } from "../../utils/heatmap";
import { BRAND_500 } from "../../charts/chart.config";

const props = defineProps<{ data: HeatmapData }>();

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
const matrix = computed(() => buildHeatmapMatrix(props.data));

// Intensidade 0..1 relativa ao max do payload.
function intensity(value: number): number {
  if (props.data.max <= 0) return 0;
  return Math.min(1, value / props.data.max);
}
function cellStyle(value: number): Record<string, string> {
  const a = intensity(value);
  return {
    backgroundColor: a === 0 ? "#f3f4f6" : BRAND_500,
    opacity: a === 0 ? "1" : String(0.15 + a * 0.85),
  };
}
</script>

<template>
  <div class="heatmap">
    <div v-for="(row, day) in matrix" :key="day" class="heatmap__row">
      <span class="heatmap__day">{{ DAYS[day] }}</span>
      <div class="heatmap__cells">
        <span
          v-for="(value, hour) in row"
          :key="hour"
          class="heatmap__cell"
          :style="cellStyle(value)"
          :title="`${DAYS[day]} ${hour}h: ${value}`"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.heatmap { display: flex; flex-direction: column; gap: 4px; }
.heatmap__row { display: flex; align-items: center; gap: 8px; }
.heatmap__day { width: 32px; font-size: 11px; color: #6b7280; }
.heatmap__cells { display: grid; grid-template-columns: repeat(24, 1fr); gap: 2px; flex: 1; }
.heatmap__cell { aspect-ratio: 1; border-radius: 2px; }
</style>
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/components/primitives/__tests__/Heatmap.spec.ts`
Expected: PASS (1 teste).

---

## Task 13: Primitivo EventFeed (TDD de render)

**Files:**
- Create: `chatfunnel-front/src/views/reportsV2/components/primitives/EventFeed.vue`
- Test: `chatfunnel-front/src/views/reportsV2/components/primitives/__tests__/EventFeed.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import EventFeed from "../EventFeed.vue";
import type { EventFeed as EventFeedData } from "@chatfunnel/contracts";

describe("EventFeed", () => {
  it("renderiza um item por evento com titulo", () => {
    const feed: EventFeedData = {
      hasMore: false,
      items: [
        { id: "1", type: "lead.created", timestamp: "2026-06-05T10:00:00Z", title: "Novo lead" },
        { id: "2", type: "automation.executed", timestamp: "2026-06-05T11:00:00Z", title: "Fluxo executado" },
      ],
    };
    const wrapper = mount(EventFeed, { props: { feed } });
    expect(wrapper.findAll(".event-feed__item").length).toBe(2);
    expect(wrapper.text()).toContain("Novo lead");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/components/primitives/__tests__/EventFeed.spec.ts`
Expected: FAIL — componente nao existe.

- [ ] **Step 3: Implementar EventFeed.vue**

```vue
<script setup lang="ts">
import type { EventFeed as EventFeedData } from "@chatfunnel/contracts";

defineProps<{ feed: EventFeedData }>();

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>

<template>
  <ul class="event-feed">
    <li v-for="item in feed.items" :key="item.id" class="event-feed__item">
      <div class="event-feed__main">
        <span class="event-feed__title">{{ item.title }}</span>
        <span v-if="item.description" class="event-feed__desc">{{ item.description }}</span>
      </div>
      <time class="event-feed__time">{{ formatTime(item.timestamp) }}</time>
    </li>
  </ul>
</template>

<style scoped>
.event-feed { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.event-feed__item { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
.event-feed__main { display: flex; flex-direction: column; gap: 2px; }
.event-feed__title { font-size: 13px; font-weight: 600; color: var(--color-foreground, #111827); }
.event-feed__desc { font-size: 12px; color: #6b7280; }
.event-feed__time { font-size: 11px; color: #9ca3af; white-space: nowrap; }
</style>
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/components/primitives/__tests__/EventFeed.spec.ts`
Expected: PASS (1 teste).

---

## Task 14: ReportsFilterBar (periodo)

**Files:**
- Create: `chatfunnel-front/src/views/reportsV2/components/filters/ReportsFilterBar.vue`

> MVP: filtro de periodo (initialDate/finalDate). Origem/UTM/canal entram na Fatia 5 (cross-repo).

- [ ] **Step 1: Implementar ReportsFilterBar.vue**

```vue
<script setup lang="ts">
import type { ReportsFilters } from "../../types/reportsV2.ui";

const props = defineProps<{ filters: ReportsFilters }>();
const emit = defineEmits<{ (e: "change", patch: Partial<ReportsFilters>): void }>();

function onInitial(event: Event) {
  emit("change", { initialDate: (event.target as HTMLInputElement).value });
}
function onFinal(event: Event) {
  emit("change", { finalDate: (event.target as HTMLInputElement).value });
}
</script>

<template>
  <div class="reports-filter-bar">
    <label class="reports-filter-bar__field">
      <span>Inicio</span>
      <input type="date" :value="props.filters.initialDate" @change="onInitial" />
    </label>
    <label class="reports-filter-bar__field">
      <span>Fim</span>
      <input type="date" :value="props.filters.finalDate" @change="onFinal" />
    </label>
  </div>
</template>

<style scoped>
.reports-filter-bar { display: flex; gap: 16px; align-items: flex-end; }
.reports-filter-bar__field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #6b7280; }
.reports-filter-bar__field input {
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 13px;
}
</style>
```

---

## Task 15: Aba Geral

**Files:**
- Create: `chatfunnel-front/src/views/reportsV2/tabs/GeralTab.vue`

- [ ] **Step 1: Implementar GeralTab.vue**

```vue
<script setup lang="ts">
import { onMounted, watch, toRef } from "vue";
import { useReportsFilters } from "../composables/useReportsFilters";
import { useReportQuery } from "../composables/useReportQuery";
import { ReportsV2Service } from "@services/index";
import ReportSection from "../components/shared/ReportSection.vue";
import MetricCard from "../components/primitives/MetricCard.vue";
import TimeSeriesChart from "../components/primitives/TimeSeriesChart.vue";
import Heatmap from "../components/primitives/Heatmap.vue";

const { filters } = useReportsFilters();

const overview = useReportQuery(() => ReportsV2Service.getDashboardOverview({ ...filters }));
const leads = useReportQuery(() => ReportsV2Service.getLeadsSeries({ ...filters }));
const heatmap = useReportQuery(() => ReportsV2Service.getActivityHeatmap({ ...filters }));

function reloadAll(): void {
  overview.execute();
  leads.execute();
  heatmap.execute();
}

onMounted(reloadAll);
watch(toRef(filters, "initialDate"), reloadAll);
watch(toRef(filters, "finalDate"), reloadAll);
</script>

<template>
  <div class="geral-tab">
    <ReportSection
      title="Visao geral"
      :loading="overview.loading.value"
      :error="overview.error.value"
      :empty="!!overview.data.value && Object.keys(overview.data.value.cards).length === 0"
    >
      <div class="geral-tab__cards">
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
      title="Atividade por horario"
      :loading="heatmap.loading.value"
      :error="heatmap.error.value"
      :empty="!!heatmap.data.value && heatmap.data.value.cells.length === 0"
    >
      <Heatmap :data="heatmap.data.value!" />
    </ReportSection>
  </div>
</template>

<style scoped>
.geral-tab { display: flex; flex-direction: column; gap: 16px; }
.geral-tab__cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
</style>
```

- [ ] **Step 2: Verificar typecheck**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep GeralTab.vue`
Expected: nenhuma linha.

---

## Task 16: Abas placeholder (Funil, Automacoes, Agendamentos, Colaboradores)

**Files:**
- Create: `chatfunnel-front/src/views/reportsV2/tabs/FunilTab.vue`
- Create: `chatfunnel-front/src/views/reportsV2/tabs/AutomacoesTab.vue`
- Create: `chatfunnel-front/src/views/reportsV2/tabs/AgendamentosTab.vue`
- Create: `chatfunnel-front/src/views/reportsV2/tabs/ColaboradoresTab.vue`

- [ ] **Step 1: Criar FunilTab.vue**

```vue
<script setup lang="ts"></script>

<template>
  <div class="report-placeholder">
    <h3>Funil</h3>
    <p>Em breve. Esta aba sera implementada na Fatia 2 (Funil MVP).</p>
  </div>
</template>

<style scoped>
.report-placeholder { padding: 48px 16px; text-align: center; color: #6b7280; }
.report-placeholder h3 { font-size: 16px; font-weight: 600; color: #111827; margin-bottom: 8px; }
</style>
```

- [ ] **Step 2: Criar AutomacoesTab.vue**

```vue
<script setup lang="ts"></script>

<template>
  <div class="report-placeholder">
    <h3>Flows / Automacoes</h3>
    <p>Em breve. Esta aba sera implementada na Fatia 3 (Automacoes MVP).</p>
  </div>
</template>

<style scoped>
.report-placeholder { padding: 48px 16px; text-align: center; color: #6b7280; }
.report-placeholder h3 { font-size: 16px; font-weight: 600; color: #111827; margin-bottom: 8px; }
</style>
```

- [ ] **Step 3: Criar AgendamentosTab.vue**

```vue
<script setup lang="ts"></script>

<template>
  <div class="report-placeholder">
    <h3>Agendamentos</h3>
    <p>Em breve. Depende do status de comparecimento (COMPARECEU/NO_SHOW) — Fatia 6.</p>
  </div>
</template>

<style scoped>
.report-placeholder { padding: 48px 16px; text-align: center; color: #6b7280; }
.report-placeholder h3 { font-size: 16px; font-weight: 600; color: #111827; margin-bottom: 8px; }
</style>
```

- [ ] **Step 4: Criar ColaboradoresTab.vue**

```vue
<script setup lang="ts"></script>

<template>
  <div class="report-placeholder">
    <h3>Agentes / Colaboradores</h3>
    <p>Em breve. Esta aba sera implementada na Fatia 4 (Colaboradores MVP).</p>
  </div>
</template>

<style scoped>
.report-placeholder { padding: 48px 16px; text-align: center; color: #6b7280; }
.report-placeholder h3 { font-size: 16px; font-weight: 600; color: #111827; margin-bottom: 8px; }
</style>
```

---

## Task 17: Shell ReportsV2View + rotas aninhadas

**Files:**
- Create: `chatfunnel-front/src/views/reportsV2/ReportsV2View.vue`
- Create: `chatfunnel-front/src/views/reportsV2/routes.ts`

- [ ] **Step 1: Implementar ReportsV2View.vue (shell)**

```vue
<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useReportsFilters } from "./composables/useReportsFilters";
import ReportsFilterBar from "./components/filters/ReportsFilterBar.vue";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TabKey } from "./types/reportsV2.ui";

const route = useRoute();
const router = useRouter();
const { filters, setFilters } = useReportsFilters();

const TABS: { key: TabKey; label: string }[] = [
  { key: "geral", label: "Geral" },
  { key: "funil", label: "Funil" },
  { key: "automacoes", label: "Flows / Automacoes" },
  { key: "agendamentos", label: "Agendamentos" },
  { key: "colaboradores", label: "Agentes / Colaboradores" },
];

const currentTab = computed<TabKey>(() => {
  const seg = route.path.split("/").pop() ?? "geral";
  return (TABS.some((t) => t.key === seg) ? seg : "geral") as TabKey;
});

function goTo(tab: string | number): void {
  router.push({ path: `/reports/${tab}`, query: route.query });
}
</script>

<template>
  <div class="reports-v2">
    <header class="reports-v2__header">
      <h1 class="reports-v2__title">Relatorios</h1>
      <ReportsFilterBar :filters="filters" @change="setFilters" />
    </header>

    <Tabs :model-value="currentTab" @update:model-value="goTo">
      <TabsList>
        <TabsTrigger v-for="t in TABS" :key="t.key" :value="t.key">
          {{ t.label }}
        </TabsTrigger>
      </TabsList>
    </Tabs>

    <main class="reports-v2__content">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.reports-v2 { display: flex; flex-direction: column; gap: 16px; padding: 24px; }
.reports-v2__header { display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
.reports-v2__title { font-size: 20px; font-weight: 700; color: var(--color-foreground, #111827); }
.reports-v2__content { margin-top: 8px; }
</style>
```

- [ ] **Step 2: Implementar routes.ts**

```ts
import type { RouteRecordRaw } from "vue-router";

export const reportsV2Route: RouteRecordRaw = {
  path: "reports",
  component: () => import("./ReportsV2View.vue"),
  redirect: "/reports/geral",
  meta: { title: "ChatFunnel - Relatorios", accessPaused: true },
  children: [
    {
      path: "geral",
      name: "ReportsV2Geral",
      component: () => import("./tabs/GeralTab.vue"),
      meta: { title: "ChatFunnel - Relatorios - Geral" },
    },
    {
      path: "funil",
      name: "ReportsV2Funil",
      component: () => import("./tabs/FunilTab.vue"),
      meta: { title: "ChatFunnel - Relatorios - Funil" },
    },
    {
      path: "automacoes",
      name: "ReportsV2Automacoes",
      component: () => import("./tabs/AutomacoesTab.vue"),
      meta: { title: "ChatFunnel - Relatorios - Automacoes" },
    },
    {
      path: "agendamentos",
      name: "ReportsV2Agendamentos",
      component: () => import("./tabs/AgendamentosTab.vue"),
      meta: { title: "ChatFunnel - Relatorios - Agendamentos" },
    },
    {
      path: "colaboradores",
      name: "ReportsV2Colaboradores",
      component: () => import("./tabs/ColaboradoresTab.vue"),
      meta: { title: "ChatFunnel - Relatorios - Colaboradores" },
    },
  ],
};
```

---

## Task 18: Registrar a rota no router

**Files:**
- Modify: `chatfunnel-front/src/router/index.js`

- [ ] **Step 1: Adicionar o import no topo do arquivo**

Logo apos os imports existentes (ver `src/router/index.js:1-5`), adicione:

```js
import { reportsV2Route } from "../views/reportsV2/routes";
```

- [ ] **Step 2: Inserir a rota nos children do FullLayout**

Dentro do bloco `component: () => import("../layout/FullLayout.vue")` → `children: [` (em torno de `src/router/index.js:119`), logo apos o objeto da rota `dashboard` (que termina por volta de `src/router/index.js:131`), adicione a linha `reportsV2Route,`. O resultado deve ficar assim:

```js
      children: [
        {
          path: "dashboard",
          name: "DashboardView",
          component: () => import("../views/dashboards/DashboardView.vue"),
          meta: {
            title: "ChatFunnel - Dashboard",
            accessPaused: true,
            module: "DASHBOARD",
          },
        },
        reportsV2Route,
        {
          path: "livechat",
          // ...resto inalterado
```

- [ ] **Step 3: Rodar a suite completa de testes do modulo**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2`
Expected: PASS em todos os specs criados (filters helpers, useReportQuery, format, heatmap, MetricCard, Heatmap, EventFeed).

- [ ] **Step 4: Build de sanidade**

Run: `cd chatfunnel-front && npm run build`
Expected: build conclui sem erros novos referentes a `reportsV2/`.

---

## Task 19: Verificacao manual (dependente do backend Fatia 1)

> Esta task confirma o comportamento end-to-end. Os endpoints `/reports/v2/dashboard/*` precisam existir no `chatfunnel-services` (Fatia 1 backend). Enquanto o backend nao estiver pronto, os widgets exibirao o estado de erro/empty — isso e esperado e nao bloqueia as tasks anteriores.

- [ ] **Step 1: Subir o front em dev**

Run: `cd chatfunnel-front && npm run dev`
Expected: servidor em `http://localhost:5173`.

- [ ] **Step 2: Navegar e validar a navegacao por abas**

- Acessar `/reports` → deve redirecionar para `/reports/geral`.
- Clicar em cada aba → a URL muda (`/reports/funil`, etc.) e o `<router-view>` troca o conteudo.
- Placeholders (Funil/Automacoes/Agendamentos/Colaboradores) exibem "Em breve".

- [ ] **Step 3: Validar filtros via querystring**

- Alterar as datas na `ReportsFilterBar` → a URL ganha `?initialDate=...&finalDate=...`.
- Recarregar a pagina (deep-link) → as datas selecionadas permanecem.
- Trocar de aba → as datas permanecem na URL.

- [ ] **Step 4: Validar a aba Geral (com backend disponivel)**

- Com os endpoints respondendo `200`: cards, serie temporal e heatmap renderizam dados reais.
- Durante o fetch: aparece o `ReportSkeleton`.
- Forcando erro (ex.: backend offline): cada secao mostra "Nao foi possivel carregar estes dados." e o toast global do interceptor dispara uma unica vez.

- [ ] **Step 5: Atualizar o vault**

Em `vault/wiki/features/reports-v2-front-arquitetura.md`, atualizar `status` de `plano-pre-implementacao` para `f1-geral-implementada` e o `last_updated`. (Sem commit automatico — confirmar com o usuario antes, conforme regras do projeto.)

---

## Self-Review

**1. Spec coverage (Fatia 1 / aba Geral):**
- Criar rota da tela de Relatorios → Task 17 + 18 ✓
- Criar shell com tabs fixas → Task 17 (ReportsV2View + 5 abas) ✓
- Implementar aba Geral → Task 15 ✓
- Consumir overview / leads-series / activity-heatmap → Task 5 (service) + Task 15 (wiring) ✓
- Renderizar cards / serie temporal / heatmap com placeholders/loading/erro → Tasks 9, 10, 11, 12, 15 ✓
- Filtros compartilhados (periodo) + querystring → Tasks 2, 3, 14, 17 ✓
- Tipos vindos de @chatfunnel/contracts → Task 0 (build+sync) + uso em todas as tasks ✓
- Primitivos restantes (Ranking/Funnel/Comparison) e abas Funil/Automacoes/Colaboradores/Agendamentos → fora do escopo (planos das Fatias 2-6), placeholders entregues na Task 16 ✓

**2. Placeholder scan:** Nenhum "TODO/TBD/implement later". Todo step de codigo traz o codigo completo. As abas placeholder sao um entregavel intencional (empty-state), nao um placeholder de plano.

**3. Type consistency:**
- `ReportsFilters` (Task 1) usado identico em helpers (Task 2), composable (Task 3), service (Task 5), filter bar (Task 14).
- `useReportQuery` retorna `{ data, loading, error, execute }` (Task 4) e e consumido exatamente assim em GeralTab (Task 15) via `.value`.
- `ReportsV2Service` metodos (`getDashboardOverview`, `getLeadsSeries`, `getActivityHeatmap`, `getEventFeed`) (Task 5) batem com as chamadas em GeralTab (Task 15).
- `formatMetricValue(value, format)` (Task 7) chamado com a mesma assinatura no MetricCard (Task 10).
- `buildHeatmapMatrix(data)` (Task 8) consumido no Heatmap (Task 12).
- `reportsV2Route` exportado (Task 17) e importado (Task 18) com o mesmo nome.
- `BRAND_500` / `baseLineOptions` (Task 6) usados em TimeSeriesChart (Task 11) e Heatmap (Task 12).

**Riscos conhecidos / dependencias:**
- Prefixo `/reports/v2` assume `/nest` embutido no baseURL do `NestApi` (como nos services existentes). Confirmar no Step 4 da Task 19; se 404, ajustar `REPORTS_V2_BASE`.
- Backend Fatia 1 (`/reports/v2/dashboard/*`) e dependencia externa para a verificacao end-to-end (Task 19), nao para as tasks de codigo/teste.
- Task 0 depende do **build + sync manual** do `@chatfunnel/contracts` para o `node_modules` do front. O source ja tem os tipos e o reexport (`reports.contracts.ts` → `endpoints/index.ts` → `index.ts`); o que falta e a copia instalada no front ser atualizada. Sem esse sync, os tipos nao resolvem no front (bloqueia a partir da Task 5).
- **Commits manuais:** este plano nao inclui passos de commit — os commits sao feitos manualmente pelo usuario ao final de cada task/sessao.
