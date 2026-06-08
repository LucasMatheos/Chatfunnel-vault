# Relatórios V2 — Guia de Implementação e Integração

> **Para quem é este doc:** time de backend (entender o que foi feito e como estender) e,
> principalmente, o **dev de frontend** (integrar os relatórios nas telas/componentes já prontos).
> **Status:** backend completo no `chatfunnel-core` + expostos por **REST** (`chatfunnel-services`) e
> **MCP** (`chatfunnel-mcp`); contratos em `chatfunnel-contracts`. Telas do front ainda **não** foram
> implementadas — este guia habilita essa integração.

---

## 1. Visão geral da arquitetura

A lógica de relatório **mora inteira no `chatfunnel-core`** (pacote compartilhado) e é consumida por
qualquer app. Separação em 3 peças:

- **Query** → método numa *reports repository* do core (`$queryRaw`, account-scoped, devolve rows tipadas).
- **Shaper** → função **pura** que transforma as rows no *payload* do contrato (ex. `TimeSeries`).
- **Catalog + Orchestrator** → o catálogo liga `reportId → { query, shaper }`; o orchestrator recebe
  o id, executa a query e passa pelo shaper.

```
                 @chatfunnel/contracts (shapes Zod: ReportPayload)
                        ▲ tipa os payloads (front, services, mcp, core)
                        │
   chatfunnel-core ─────┤
     src/repositories/reports/*   →  queries ($queryRaw, account-scoped)
     src/reports/shapers/*        →  rows → payload (puro)
     src/reports/handlers/*       →  specials (EventFeed)
     src/reports/catalog/*        →  reportId → { query, shaper }
     src/reports/orchestrator/*   →  createReportsOrchestrator(prisma).run(id, accountId, params, tz)
                        ▲
        ┌───────────────┴───────────────┐
   chatfunnel-services             chatfunnel-mcp
   REST  /nest/reports/v2/*        7 tools  report_*
        ▲
   chatfunnel-front (a integrar) — consome a REST
```

**Princípio-chave:** os dois consumidores chamam o **mesmo** `orchestrator.run(...)` — zero duplicação
de lógica/SQL.

---

## 2. O que está pronto

| Relatório | id (catálogo) | Padrão / payload | Endpoint REST | Tool MCP |
|---|---|---|---|---|
| Crescimento de contatos (R08) | `contacts.growth` | `TimeSeries` | `GET /nest/reports/v2/contacts/growth` | `report_contacts_growth` |
| Horários de pico (R11) | `contacts.peak-hours` | `HeatmapData` | `GET /nest/reports/v2/contacts/peak-hours` | `report_contacts_peak_hours` |
| Motivos de perda (R04) | `crm.loss-reasons` | `Ranking` | `GET /nest/reports/v2/crm/loss-reasons` | `report_crm_loss_reasons` |
| Funil de conversão (R01) | `crm.funnel` | `FunnelData` | `GET /nest/reports/v2/crm/funnel` | `report_crm_funnel` |
| Aging de oportunidades (R06) | `crm.aging` | `AgingData` | `GET /nest/reports/v2/crm/aging` | `report_crm_aging` |
| Receita ganha — card (R35) | `crm.revenue-card` | `MetricCard` | `GET /nest/reports/v2/crm/revenue-card` | `report_crm_revenue_card` |
| Feed de eventos | `general.feed` | `EventFeed` | `GET /nest/reports/v2/general/feed` | `report_general_feed` |

**Pendente (próximas stories):** telas no `chatfunnel-front`, agrupamento por origem/UTM, aba
Agendamentos (depende de modelo de dados), Dashboard composto (R35 com 6 métricas), Intelligence.

---

## 3. Contratos — `@chatfunnel/contracts` (o que o front consome)

Todos os payloads são **schemas Zod** com tipos `z.infer` em
`chatfunnel-contracts/src/endpoints/reports.contracts.ts`. **Importe os tipos do pacote** (raiz ou
subpath `@chatfunnel/contracts/endpoints`):

```ts
import type {
  TimeSeries, SegmentedTimeSeries, FunnelData, HeatmapData,
  Ranking, AgingData, MetricCard, Dashboard, EventFeed, ReportPayload, Granularity,
} from "@chatfunnel/contracts";
```

### Shapes (TypeScript)

```ts
type Granularity = "day" | "week" | "month";

// Série temporal (contacts.growth)
type TimeSeriesPoint = { date: string; value: number; label?: string }; // date = "YYYY-MM-DD"
type TimeSeries = { series: TimeSeriesPoint[]; granularity: Granularity };

// Série segmentada (por origem/UTM — ainda não emitida; previsto p/ futuro)
type TimeSeriesSegment = { segment: string; label?: string; points: TimeSeriesPoint[] };
type SegmentedTimeSeries = { granularity: Granularity; segments: TimeSeriesSegment[] };

// Funil (crm.funnel) — estágios em ordem; conversionFromPrevious = fração 0..1
type FunnelStage = { id: string; name: string; total: number; conversionFromPrevious?: number };
type FunnelData = { stages: FunnelStage[] };

// Heatmap (contacts.peak-hours) — day: 0..6 (0 = SEGUNDA), hour: 0..23
type HeatmapCell = { day: number; hour: number; value: number };
type HeatmapData = { cells: HeatmapCell[]; max: number }; // max = maior valor (escala de cor)

// Ranking (crm.loss-reasons)
type RankingEntry = { id: string; label: string; value: number; meta?: Record<string, unknown> };
type Ranking = { entries: RankingEntry[]; total: number };

// Aging (crm.aging) — range = [min, max|null] em dias
type AgingBucket = { label: string; range: [number, number | null]; count: number };
type AgingData = { buckets: AgingBucket[] };

// Card de KPI (crm.revenue-card)
type MetricFormat = "number" | "currency" | "percentage" | "duration";
type MetricDelta = { absolute: number; percentage: number };
type MetricCard = { value: number; format?: MetricFormat; delta?: MetricDelta; sparkline?: number[] };

// Dashboard composto (ainda não emitido — follow-up)
type Dashboard = { cards: Record<string, MetricCard> };

// Feed de eventos (general.feed) — title já vem PRONTO em pt-BR
type EventFeedItem = {
  id: string;
  type: string;            // "lead.created" | "automation.executed" | ...
  timestamp: string;       // ISO 8601 (UTC, "...Z")
  title: string;           // pt-BR, pronto para exibir
  description?: string;
  contactId?: string;
  contactName?: string;
  meta?: Record<string, unknown>;
};
type EventFeed = { items: EventFeedItem[]; hasMore: boolean; nextCursor?: string };

type ReportPayload =
  | TimeSeries | SegmentedTimeSeries | FunnelData | HeatmapData
  | Ranking | AgingData | MetricCard | Dashboard | EventFeed;
```

> O front pode (opcionalmente) validar a resposta em dev com o schema Zod correspondente
> (`TimeSeries.safeParse(data)` etc.), já que o mesmo pacote exporta os schemas runtime além dos tipos.

---

## 4. API REST — `chatfunnel-services` (integração do frontend)

Base: prefixo global **`/nest`** → todas as rotas começam com `/nest/reports/v2/...`.

### Headers (obrigatórios em toda chamada)

| Header | Conteúdo | Obrigatório |
|---|---|---|
| `Authorization` | `Bearer <jwt>` (token de 30s do app) | **Sim** (sem ele → `401`) |
| `Account-Selected` | `accountId` (UUID da conta selecionada) | **Sim** — escopo multi-tenant |
| `Timezone` | ex. `America/Sao_Paulo` | Não (default `America/Sao_Paulo`) |

### Query params (validados; `ValidationPipe` estrito — param desconhecido → `400`)

| Param | Tipo | Obrigatório | Observações |
|---|---|---|---|
| `initialDate` | ISO 8601 | **Sim** | início do período |
| `finalDate` | ISO 8601 | **Sim** | fim do período |
| `channelId` | UUID | Não | filtro de canal (heatmap) |
| `moderatorId` | UUID | Não | reservado |
| `pipelineId` | UUID | Não / **Sim no funil** | `crm/funnel` exige; `crm/*` aceita como filtro |
| `limit` | int 1–100 | Não (feed) | só `general/feed` (default 20) |
| `cursor` | string | Não (feed) | só `general/feed` (use o `nextCursor` da página anterior) |

### Endpoints e respostas

| Método + rota | Resposta | Notas |
|---|---|---|
| `GET /nest/reports/v2/contacts/growth` | `TimeSeries` | granularidade automática: ≤31d→`day`, ≤120d→`week`, senão `month` |
| `GET /nest/reports/v2/contacts/peak-hours` | `HeatmapData` | aceita `channelId` opcional |
| `GET /nest/reports/v2/crm/loss-reasons` | `Ranking` | ordenado por `value` desc |
| `GET /nest/reports/v2/crm/funnel` | `FunnelData` | **exige `pipelineId`** (senão `400`); estágios na ordem do pipeline |
| `GET /nest/reports/v2/crm/aging` | `AgingData` | **snapshot "agora"** — ignora o período; 4 faixas fixas |
| `GET /nest/reports/v2/crm/revenue-card` | `MetricCard` | `format: "currency"`; `delta` vs período anterior de mesma duração |
| `GET /nest/reports/v2/general/feed` | `EventFeed` | paginação por cursor (`limit`/`cursor`) |

O corpo da resposta é **o payload direto** (não há envelope `{ data: ... }`).

### Erros

| Status | Quando |
|---|---|
| `401` | sem `Authorization` válido (JWT) |
| `400` | validação (ex. `crm/funnel` sem `pipelineId`; data ausente/ inválida; query param desconhecido) |
| `404` | `reportId` inexistente (erro interno — não deveria ocorrer pelos endpoints fixos) |

### Exemplo (axios/fetch tipado)

```ts
import type { TimeSeries, FunnelData, EventFeed } from "@chatfunnel/contracts";

const headers = {
  Authorization: `Bearer ${token}`,
  "Account-Selected": accountId,
  Timezone: "America/Sao_Paulo",
};

// Série de crescimento de contatos
const growth = await http.get<TimeSeries>("/nest/reports/v2/contacts/growth", {
  headers,
  params: { initialDate: "2026-05-01T00:00:00Z", finalDate: "2026-05-31T23:59:59Z" },
});

// Funil (pipelineId obrigatório)
const funnel = await http.get<FunnelData>("/nest/reports/v2/crm/funnel", {
  headers,
  params: { initialDate, finalDate, pipelineId },
});

// Feed paginado
const feed = await http.get<EventFeed>("/nest/reports/v2/general/feed", {
  headers,
  params: { initialDate, finalDate, limit: 20, cursor }, // cursor = feed.nextCursor da página anterior
});
// próxima página: enquanto feed.hasMore, repetir com cursor = feed.nextCursor
```

### Sugestão de mapeamento relatório ↔ aba do front

| Aba | Consome |
|---|---|
| **Geral** | `contacts.growth` (série de leads) + `contacts.peak-hours` (heatmap) + `crm.revenue-card` (card receita) + `general.feed` (últimos eventos) |
| **Funil** | `crm.funnel` (+ `crm.loss-reasons` como detalhe de perdas) |
| **Automações** | `general.feed` (eventos de automação) + (volume/ranking — a implementar) |
| **CRM** | `crm.funnel`, `crm.loss-reasons`, `crm.aging`, `crm.revenue-card` |

---

## 5. Tools MCP — `chatfunnel-mcp` (integração com IA)

7 tools `report_*` (uma por relatório) registradas no servidor MCP. **Mesma lógica do core** — a tool
só converte input e delega.

- **Input** (`ReportToolInput`, todos os campos de data como **string ISO**):
  `initialDate`, `finalDate`, `timezone?`, `granularity?`, `channelId?`, `moderatorId?`, `pipelineId?`,
  `limit?`, `cursor?`.
- **Output**: o mesmo payload do contrato (`TimeSeries`, `Ranking`, `FunnelData`, `HeatmapData`,
  `AgingData`, `MetricCard`, `EventFeed`), validável por `validateToolOutput`.
- **`accountId` vem SEMPRE do contexto de auth da sessão MCP** (`getAuth().accountId`), nunca dos
  argumentos da tool → escopo de conta garantido.

Tools: `report_contacts_growth`, `report_contacts_peak_hours`, `report_crm_loss_reasons`,
`report_crm_funnel`, `report_crm_aging`, `report_crm_revenue_card`, `report_general_feed`.

---

## 6. Internals do core (backend) — como funciona e como estender

### Estrutura

```
chatfunnel-core/
  src/repositories/reports/         # QUERIES ($queryRaw, account-scoped, rows tipadas)
    contacts-reports.repository.ts  # growthTimeSeries, countByHourDow
    crm-reports.repository.ts       # lossReasonRanking, funnelFromHistory, agingBuckets, revenueWonCard
    event-feed-reports.repository.ts# feed (UNION ALL + cursor keyset)
    types.ts                        # row types (TimeSeriesRow, RankingRow, ...)
  src/reports/
    core/report-shaper.contract.ts  # ReportShaper, ReportParams, SpecialReportHandler, ReportContext
    core/period.helper.ts           # normalizeRange (timezone) · granularity.helper.ts (pickGranularity)
    shapers/*.shaper.ts             # 6 shapers puros (timeSeries, ranking, heatmap, funnel, aging, metricCard)
    handlers/event-feed.handler.ts  # special EventFeed
    catalog/{contacts,crm}.catalog.ts + index.ts (buildRegistry)
    orchestrator/create-reports-orchestrator.ts  # factory + run()
```

Exposto por subpath: **`@chatfunnel/core/reports`** → `createReportsOrchestrator(prisma, { logger?, cache? })`
devolve `{ run<T extends ReportPayload>(id, accountId, params, timezone): Promise<T> }`. Erros: lança
`NotFoundError`/`ValidationError` de `@chatfunnel/core/errors` (os consumidores mapeiam p/ HTTP/MCP).

### `ReportParams` (input do core — objeto simples, sem class-validator)
```ts
interface ReportParams {
  initialDate: Date; finalDate: Date;
  granularity?: "day" | "week" | "month";
  channelId?: string; moderatorId?: string; pipelineId?: string;
  limit?: number; cursor?: string;   // paginação (feed)
}
```

### Como adicionar um novo relatório
1. **Query**: método `$queryRaw` numa reports repository (`src/repositories/reports/*`), account-scoped
   (coluna direta **ou** JOIN com a tabela "dona"), retornando uma row type tipada.
2. **Shaper**: reusar um dos 6 (se o formato de saída casa) ou criar um novo em `shapers/` + registrar
   em `buildShapers()`.
3. **Catálogo**: entrada `{ id, shaper, cacheTtl, query }` em `catalog/<dominio>.catalog.ts` (entra no
   `buildRegistry()` automaticamente).
4. **Repo no bag**: se for repo nova, instanciar em `buildReportsRepositories(prisma)`.
5. **Expor**: rota no `chatfunnel-services` (controller + DTO) e/ou tool no `chatfunnel-mcp` + contrato.
6. **Teste**: dispatch (`orchestrator.run`) + **account-scope** (params da conta A ⇏ linhas da conta B).

### Convenções importantes (decisões tomadas)
- **Multi-tenancy:** `accountId` filtra **toda** query (coluna direta em `Contacts`/`BroadcastMessage`/
  `LlmUsageLogs`; via JOIN `Kanbans`/`Channels`/`IGAutomations`/`Agents` nas demais). Há teste de
  account-scope por método.
- **Timezone:** colunas `TIMESTAMP` são UTC naive → bucketização usa
  `("col" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}`; intervalos via `period.helper.normalizeRange`.
- **Funil = conversão real:** conta cards que **entraram** em cada etapa no período via
  `KanbanCardsHistory` (ações `CREATE`/`MOVE`), **não** ocupação atual. Ordenado por `KanbanColumns.position`.
- **Aging = snapshot "agora":** ignora o período; mede "dias na etapa atual" (última entrada na coluna,
  fallback `createdAt`). 4 faixas: `<3d`, `3–7d`, `7–15d`, `>15d`.
- **Heatmap:** `day` = `EXTRACT(ISODOW)-1` ⇒ **0 = segunda** … 6 = domingo.
- **Feed:** cursor **keyset** estável via `sort_key` textual (`ts|type|id`); `nextCursor` opaco — repasse
  como recebeu. `LIMIT n+1` define `hasMore`.
- **SQL:** sempre `$queryRaw` + `Prisma.sql` (valores parametrizados); **nunca** `$queryRawUnsafe` nem
  SQL montado por config.

---

## 7. Build / link entre repos (sem publish)

Os 4 repos são **linkados localmente via `npm link`** — **não há `npm publish`**. Para propagar uma
mudança aos consumidores, basta **`npm run build`** no pacote alterado:

```
contracts → core → (services, mcp, front)
```

- Alterou shapes em `chatfunnel-contracts`? `npm run build` lá → core/services/mcp/front enxergam.
- Alterou lógica no `chatfunnel-core`? `npm run build` lá → services/mcp enxergam.
- **Nunca** rodar `prisma migrate` (só `prisma generate`); migrations são responsabilidade do dev.
- Detalhe técnico: o `chatfunnel-core` usa `moduleResolution: node` e importa contracts pela **raiz**
  (`@chatfunnel/contracts`); services/mcp resolvem subpaths (`@chatfunnel/core/reports`).

---

## 8. Pontos de atenção para o time

- **`MetricCard.value` (receita) é valor cru `Int`** do banco (`amount`). A **escala** (centavos vs reais)
  **não** é convertida no backend — confirme com o time de dados antes de formatar como moeda no front.
- **`contacts.growth`** hoje retorna `TimeSeries` (série única). A versão **segmentada por origem/UTM**
  (`SegmentedTimeSeries`) virá depois — o tipo do consumidor já aceita a união, mas o endpoint atual só
  emite `TimeSeries`.
- **Aba Agendamentos** e **Dashboard composto (R35 completo)** ainda não existem (dependem de modelagem
  e de mais métricas) — planejados como follow-up.
- **`general.feed`** no MVP cobre 2 fontes: `lead.created` (Contacts) e `automation.executed`
  (IGAutomationsExecutions). Outras fontes (agendamentos) entram depois.
- **Visibilidade por colaborador** (expor receita/conversão por vendedor) é decisão de produto/authz
  ainda em aberto.

---

## 9. Testes

Cada relatório do core tem testes co-localizados (`*.spec.ts`, Jest): **shaper puro** + **dispatch via
orchestrator** + **account-scope** (verifica que o `accountId` é parametrizado na query). Consumidores:
`chatfunnel-services` (mapeamento de erro `DomainError`→HTTP, controllers) e `chatfunnel-mcp` (registro
das 7 tools + conversão de datas + auth). Rodar: `npm test` (ou `npx jest src/reports`) em cada repo.
```
