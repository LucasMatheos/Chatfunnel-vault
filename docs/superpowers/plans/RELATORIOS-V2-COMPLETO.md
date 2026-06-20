# Relatórios V2 — Documentação completa (frontend)

> **Documento único e autocontido** com **todos os 45 relatórios** em detalhe — arquitetura, integração
> REST/MCP, contratos (payloads), cada relatório (id, payload, rota, tool, params, particularidades) e os
> pontos de atenção. Substitui a necessidade de pular entre docs.
>
> **Status:** backend completo no `chatfunnel-core`, exposto por **REST** (`chatfunnel-services`) e **MCP**
> (`chatfunnel-mcp`); contratos (Zod) em `@chatfunnel/contracts`. As telas do front ainda **não** foram
> implementadas — este guia habilita essa integração.

## Sumário
1. [Arquitetura](#1-arquitetura)
2. [Integração REST](#2-integração-rest-headers-params-erros)
3. [Contratos / payloads (TypeScript)](#3-contratos--payloads-typescript)
4. [Relatórios — detalhe completo](#4-relatórios--detalhe-completo)
   - [Geral / base](#geral--base) · [CRM](#crm--pipeline) · [Contatos](#contatos--leads) · [Mensagens](#mensagens--atendimento) · [Automações](#automações--fluxos) · [Broadcast](#broadcast--campanhas) · [Agentes IA](#agentes-ia) · [Dashboard](#dashboard--visão-geral) · [Agendamentos](#agendamentos) · [Intelligence](#intelligence)
5. [Pontos de atenção (gotchas)](#5-pontos-de-atenção-gotchas)
6. [Mapeamento relatório ↔ aba](#6-mapeamento-relatório--aba)
7. [Tools MCP](#7-tools-mcp)
8. [Ainda não disponível](#8-ainda-não-disponível-bloqueadoa-definir)

---

## 1. Arquitetura

A lógica mora inteira no `chatfunnel-core` (pacote compartilhado) e é consumida por qualquer app. Três peças:

- **Query** → método numa *reports repository* do core (`$queryRaw`, account-scoped, devolve rows tipadas).
- **Shaper** → função **pura** que transforma rows no *payload* do contrato (6 shapers: timeSeries, ranking,
  heatmap, funnel, aging, metricCard) + **specials** (lógica própria: EventFeed, response-time, dashboard).
- **Catalog + Orchestrator** → o catálogo liga `reportId → { query, shaper }`; o orchestrator recebe o id,
  executa a query e passa pelo shaper. REST e MCP chamam o **mesmo** `orchestrator.run(...)` — zero duplicação.

```
            @chatfunnel/contracts (shapes Zod: ReportPayload)
                         ▲ tipa payloads (front, services, mcp, core)
   chatfunnel-core ──────┤  queries + shapers + catálogo + orchestrator
                         ▲
        ┌────────────────┴────────────────┐
  chatfunnel-services                 chatfunnel-mcp
  REST  /nest/reports/v2/*            45 tools  report_*
        ▲
  chatfunnel-front (a integrar) — consome a REST
```

**Build/link (sem publish):** os repos são linkados via `npm link`. Para propagar mudança, `npm run build`
no pacote alterado (`contracts → core → services/mcp/front`). Migrations Prisma são do dev (só `prisma generate`).

---

## 2. Integração REST (headers, params, erros)

Base: prefixo global **`/nest`** → todas as rotas começam com `/nest/reports/v2/...`. O corpo da resposta é
**o payload direto** (não há envelope `{ data }`).

### Headers (obrigatórios)
| Header | Conteúdo | Obrigatório |
|---|---|---|
| `Authorization` | `Bearer <jwt>` (token de 30s do app) | **Sim** (sem ele → `401`) |
| `Account-Selected` | `accountId` (UUID da conta selecionada) | **Sim** — escopo multi-tenant |
| `Timezone` | ex. `America/Sao_Paulo` | Não (default `America/Sao_Paulo`) |

### Query params (validados; `ValidationPipe` estrito → param desconhecido = `400`)
| Param | Tipo | Observação |
|---|---|---|
| `initialDate` / `finalDate` | ISO 8601 | **obrigatórios em toda rota** |
| `granularity` | `day`/`week`/`month` | séries; default automático: ≤31d→`day`, ≤120d→`week`, senão `month` |
| `channelId` | UUID | filtro de canal (onde indicado) |
| `moderatorId` | UUID | filtro de atendente (`messages.service-hours`) |
| `pipelineId` | UUID | filtro CRM; **obrigatório em `crm.funnel`** |
| `customFieldId` | string | **obrigatório em `contacts.by-custom-field`** |
| `automationId` | string | filtro dos `automations.*` |
| `metric` | string | seletor de `dashboard.metric` |
| `utmSource` / `utmMedium` / `utmCampaign` | string | filtro UTM (relatórios de contatos baseados em `Contacts`) |
| `limit` / `cursor` | int 1–100 / string | paginação (só `general.feed`) |

### Erros
| Status | Quando |
|---|---|
| `401` | sem `Authorization` válido (JWT) |
| `400` | validação: data ausente/inválida, param obrigatório faltando (ex. `pipelineId` no funil, `customFieldId`), param desconhecido |
| `404` | `reportId` inexistente (não deve ocorrer pelos endpoints fixos) |

### Exemplo (axios/fetch tipado)
```ts
import type { TimeSeries, FunnelData, EventFeed } from "@chatfunnel/contracts";

const headers = {
  Authorization: `Bearer ${token}`,
  "Account-Selected": accountId,
  Timezone: "America/Sao_Paulo",
};

const growth = await http.get<TimeSeries>("/nest/reports/v2/contacts/growth", {
  headers, params: { initialDate: "2026-05-01T00:00:00Z", finalDate: "2026-05-31T23:59:59Z" },
});

const funnel = await http.get<FunnelData>("/nest/reports/v2/crm/funnel", {
  headers, params: { initialDate, finalDate, pipelineId }, // pipelineId obrigatório
});

// feed paginado por cursor
let cursor: string | undefined;
do {
  const feed = await http.get<EventFeed>("/nest/reports/v2/general/feed", {
    headers, params: { initialDate, finalDate, limit: 20, cursor },
  });
  cursor = feed.data.hasMore ? feed.data.nextCursor : undefined;
} while (cursor);
```

---

## 3. Contratos / payloads (TypeScript)

Importe os tipos de `@chatfunnel/contracts` (os schemas Zod runtime também são exportados — dá p/ validar em
dev com `TimeSeries.safeParse(data)` etc.):

```ts
type Granularity = "day" | "week" | "month";

// Série temporal (única)
type TimeSeriesPoint = { date: string; value: number; label?: string }; // date = "YYYY-MM-DD"
type TimeSeries = { series: TimeSeriesPoint[]; granularity: Granularity };

// Série segmentada (por origem/status/etc.)
type TimeSeriesSegment = { segment: string; label?: string; points: TimeSeriesPoint[] };
type SegmentedTimeSeries = { granularity: Granularity; segments: TimeSeriesSegment[] };

// Funil — estágios em ordem; conversionFromPrevious = fração 0..1 (ausente quando anterior = 0)
type FunnelStage = { id: string; name: string; total: number; conversionFromPrevious?: number };
type FunnelData = { stages: FunnelStage[] };

// Heatmap — day: 0..6 (0 = SEGUNDA), hour: 0..23; max = maior valor (escala de cor)
type HeatmapCell = { day: number; hour: number; value: number };
type HeatmapData = { cells: HeatmapCell[]; max: number };

// Ranking — entries já vêm ordenados; meta opcional por entrada
type RankingEntry = { id: string; label: string; value: number; meta?: Record<string, unknown> };
type Ranking = { entries: RankingEntry[]; total: number };

// Aging — range = [min, max|null]
type AgingBucket = { label: string; range: [number, number | null]; count: number };
type AgingData = { buckets: AgingBucket[] };

// Card de KPI
type MetricFormat = "number" | "currency" | "percentage" | "duration";
type MetricDelta = { absolute: number; percentage: number };
type MetricCard = { value: number; format?: MetricFormat; delta?: MetricDelta; sparkline?: number[] };

// Dashboard composto (Record de cards)
type Dashboard = { cards: Record<string, MetricCard> };

// Métricas de tempo de resposta (só messages.response-time) — tempos em SEGUNDOS
type ResponseTimeMetrics = {
  averageSeconds: number; medianSeconds: number; p95Seconds: number;
  count: number; distribution: AgingBucket[]; // range em segundos
};

// Feed de eventos — title já vem PRONTO em pt-BR
type EventFeedItem = {
  id: string; type: string;       // "lead.created" | "automation.executed" | ...
  timestamp: string;              // ISO 8601 (UTC "...Z")
  title: string; description?: string; contactId?: string; contactName?: string;
  meta?: Record<string, unknown>;
};
type EventFeed = { items: EventFeedItem[]; hasMore: boolean; nextCursor?: string };

type ReportPayload =
  | TimeSeries | SegmentedTimeSeries | FunnelData | HeatmapData
  | Ranking | AgingData | MetricCard | Dashboard | EventFeed | ResponseTimeMetrics;
```

---

## 4. Relatórios — detalhe completo

> Todos aceitam `initialDate`/`finalDate`. Abaixo só destaco params/notas extras. Rotas omitem o prefixo
> `/nest/reports/v2/`.

### Geral / base

#### `contacts.growth` — Crescimento de contatos → `TimeSeries`
- Novos contatos por bucket de tempo (série única). Account-scope por `Contacts.accountId`.
- Rota `GET contacts/growth` · tool `report_contacts_growth`. Params: `granularity?`, filtros `utm*`.

#### `contacts.peak-hours` — Horários de pico → `HeatmapData`
- Mapa de calor dia-da-semana × hora dos novos contatos (`day` 0 = segunda … 6 = domingo; `hour` 0–23).
- Rota `GET contacts/peak-hours` · tool `report_contacts_peak_hours`. Params: `channelId?`, filtros `utm*`.

#### `crm.loss-reasons` — Motivos de perda → `Ranking`
- Cards `LOST` agrupados por motivo no período (janela = `statusOportunityUpdatedAt`). Ordenado por `value` desc.
- Rota `GET crm/loss-reasons` · tool `report_crm_loss_reasons`. Params: `pipelineId?`.

#### `crm.funnel` — Funil de conversão → `FunnelData`
- Conta cards que **entraram** em cada etapa no período (via histórico `CREATE`/`MOVE`), **não** ocupação
  atual. Estágios na ordem do pipeline; `conversionFromPrevious` = fração entre etapas.
- Rota `GET crm/funnel` · tool `report_crm_funnel`. Params: **`pipelineId` obrigatório** (senão `400`).

#### `crm.aging` — Aging de oportunidades → `AgingData`
- ⚠️ **Snapshot "agora"** (ignora o período): distribuição dos cards `OPEN` por "dias na etapa atual".
  4 faixas fixas: `< 3 dias`, `3–7`, `7–15`, `> 15`.
- Rota `GET crm/aging` · tool `report_crm_aging`. Params: `pipelineId?`.

#### `crm.revenue-card` — Receita ganha (card) → `MetricCard`
- Receita `WON` do período + `delta` vs o período anterior de mesma duração. `format: "currency"`.
- Rota `GET crm/revenue-card` · tool `report_crm_revenue_card`. ⚠️ `value` = `amount` cru (ver §5).

#### `general.feed` — Feed de eventos → `EventFeed`
- Feed cronológico (UNION de fontes; hoje `lead.created` + `automation.executed`), `title` pronto em pt-BR.
- Paginação **keyset** por cursor: passe `feed.nextCursor` no `cursor` da próxima página; `hasMore` indica fim.
- Rota `GET general/feed` · tool `report_general_feed`. Params: `limit?` (default 20), `cursor?`.

### CRM / Pipeline

#### `crm.revenue` — Receita do pipeline no tempo → `SegmentedTimeSeries`
- Soma `amount` por bucket **e por status** (`segment` ∈ `"WON"`/`"LOST"`). Janela = `statusOportunityUpdatedAt`.
- Rota `GET crm/revenue` · tool `report_crm_revenue`. Params: `granularity?`, `pipelineId?`. ⚠️ `amount` cru.

#### `crm.sales-velocity` — Velocidade de vendas (ciclo) → `AgingData`
- Distribuição dos negócios **WON** por tempo de ciclo (criação→fechamento): `< 1 dia`, `1–7`, `7–30`, `> 30`.
- Rota `GET crm/sales-velocity` · tool `report_crm_sales_velocity`. Params: `pipelineId?`.

#### `crm.stage-time` — Tempo médio por etapa → `Ranking`
- `entries[]`: `id` = coluna, `label` = nome da etapa, `value` = **tempo médio em DIAS**. **Ordenado pela
  posição do funil** (não por value); etapas sem saída registrada não entram. `total` tem pouco sentido — use os entries.
- Rota `GET crm/stage-time` · tool `report_crm_stage_time`. Params: `pipelineId?`.

#### `crm.performance-by-seller` — Performance por vendedor → `Ranking` (+`meta`)
- `entries[]`: `id` = usuário, `label` = nome, `value` = **receita WON**. `meta` = `{ won, lost, winRate }`
  (`winRate` = `won/(won+lost)`, fração 0..1; `null` se sem WON/LOST). Ordenado por `value` desc.
- Rota `GET crm/performance-by-seller` · tool `report_crm_performance_by_seller`. Params: `pipelineId?`.
  ⚠️ Expor receita por vendedor é decisão de produto/autorização.

```ts
type SellerMeta = { won: number; lost: number; winRate: number | null };
const r = await http.get<Ranking>("/nest/reports/v2/crm/performance-by-seller", { headers, params: { initialDate, finalDate }});
r.data.entries.forEach(e => { const m = e.meta as SellerMeta; /* receita = e.value; taxa = m.winRate */ });
```

#### `crm.revenue-forecast` — Previsão de receita → `MetricCard` (sem `delta`)
- ⚠️ **Snapshot** (ignora o período): `Σ amount × (posição_da_etapa + 1) / nº_de_etapas` sobre cards `OPEN`.
- `format: "currency"`, **sem `delta`** e sem `sparkline`. Rota `GET crm/revenue-forecast` · tool
  `report_crm_revenue_forecast`. Params: `pipelineId?`. ⚠️ `amount` cru.

### Contatos / Leads

#### `contacts.by-channel` — Aquisição por canal → `Ranking`
- Contatos **criados no período** agrupados pela plataforma de aquisição (`fromPlatform`: INSTAGRAM/WHATSAPP/
  FACEBOOK/SYSTEM). 1 plataforma por contato. Rota `GET contacts/by-channel` · tool `report_contacts_by_channel`.

#### `contacts.by-tag` — Distribuição por tags → `Ranking`
- Tags mais usadas: `value` = `COUNT(DISTINCT contato)` (não deletados) criados no período. Tags sem contatos
  no período não aparecem. Rota `GET contacts/by-tag` · tool `report_contacts_by_tag`.

#### `contacts.inactivity` — Contatos inativos → `AgingData`
- ⚠️ **Snapshot** (ignora período): distribuição por dias desde a última atividade (`COALESCE(lastUpdate,
  dateCreated)`). 6 faixas: `<7`, `7–15`, `15–30`, `30–60`, `60–90`, `90+`. Rota `GET contacts/inactivity` ·
  tool `report_contacts_inactivity`.

#### `contacts.utm-source` / `contacts.utm-medium` / `contacts.utm-campaign` — Origem UTM → `Ranking`
- 3 rotas (uma por dimensão). Ranking dos contatos **criados no período** com a UTM **preenchida** (sem-UTM
  excluído). `id`=`label`= valor da UTM. Tools `report_contacts_utm_{source,medium,campaign}`.

#### `contacts.by-custom-field` — Campos personalizados → `Ranking`
- Valores mais frequentes de um campo, entre contatos criados no período. **Exige `customFieldId`** (senão
  `400`). `id`=`label`= valor do campo. Rota `GET contacts/by-custom-field` · tool `report_contacts_by_custom_field`.

```ts
await http.get<Ranking>("/nest/reports/v2/contacts/by-custom-field", { headers, params: { initialDate, finalDate, customFieldId }});
```

#### `contacts.growth-by-source` — Crescimento por origem → `SegmentedTimeSeries`
- Novos contatos por bucket, **segmentados por `utmSource`** (sem-UTM agrupado como `direct`; soma dos
  segmentos = total). Rota `GET contacts/growth-by-source` · tool `report_contacts_growth_by_source`. Params: `granularity?`.

> **Filtros UTM:** `utmSource`/`utmMedium`/`utmCampaign` (igualdade exata) são aceitos e aplicados aos
> relatórios baseados em `Contacts`: `contacts.growth`, `contacts.peak-hours`, `contacts.by-channel`,
> `contacts.growth-by-source` (account-scope preservado; demais relatórios ignoram esses params por ora).

### Mensagens / Atendimento

#### `messages.volume` — Volume de mensagens → `SegmentedTimeSeries`
- Mensagens por bucket, segmentadas por origem (`segment` ∈ `CONTACT`/`BOT`/`ASSISTANT`/`HUMAN`). Só mensagens
  contáveis e não deletadas. Rota `GET messages/volume` · tool `report_messages_volume`. Params: `granularity?`, `channelId?`.

#### `messages.response-time` — Tempo de resposta → `ResponseTimeMetrics`
- SLA: tempo entre uma mensagem do contato e a **primeira resposta** seguinte (qualquer origem ≠ `CONTACT`).
  ⚠️ Indicadores e `distribution[].range` em **segundos**. Faixas da distribuição: `<5min`, `5–15`, `15–30`,
  `30–60`, `>1h`. Rota `GET messages/response-time` · tool `report_messages_response_time`. Params: `channelId?`.

```ts
import type { ResponseTimeMetrics } from "@chatfunnel/contracts";
const rt = await http.get<ResponseTimeMetrics>("/nest/reports/v2/messages/response-time", { headers, params: { initialDate, finalDate }});
// rt.data.averageSeconds/medianSeconds/p95Seconds → formate de segundos; rt.data.distribution → histograma
```

#### `messages.conversations` — Conversas ativas → `SegmentedTimeSeries`
- Conversas **abertas vs fechadas** por bucket (`segment` ∈ `opened`/`closed`; abertas pela criação, fechadas
  pela finalização das `finished`). Rota `GET messages/conversations` · tool `report_messages_conversations`.
  Params: `granularity?`, `channelId?`.

#### `messages.workload` — Carga por atendente → `Ranking` (+`meta`)
- Atendentes por **mensagens enviadas** (`from = HUMAN`). `value` = nº de mensagens; `meta` = `{ contacts }`
  (contatos distintos atendidos). Rota `GET messages/workload` · tool `report_messages_workload`. Params: `channelId?`.

#### `messages.delivery-status` — Status de entrega → `FunnelData`
- Funil das mensagens enviadas pela conta: `sent` → `delivered` → `read`. `conversionFromPrevious` = taxa de
  entrega e de leitura. Rota `GET messages/delivery-status` · tool `report_messages_delivery_status`. Params: `channelId?`.

#### `messages.service-hours` — Horários de atendimento → `HeatmapData`
- Heatmap dia × hora do volume de **respostas do operador** (`from = HUMAN`). `day` 0 = segunda.
  Rota `GET messages/service-hours` · tool `report_messages_service_hours`. Params: `moderatorId?`, `channelId?`.

### Automações / Fluxos

#### `automations.executions` — Execuções de automação → `TimeSeries`
- Total de execuções por bucket (série única). Rota `GET automations/executions` · tool
  `report_automations_executions`. Params: `granularity?`, `automationId?`.

#### `automations.by-trigger` — Efetividade por trigger → `Ranking`
- Gatilhos por nº de execuções (`label` = nome ou tipo do gatilho). "Efetividade" = **volume** (não há status
  de conclusão no schema). Rota `GET automations/by-trigger` · tool `report_automations_by_trigger`. Params: `automationId?`.

#### `automations.top` — Top automações → `Ranking`
- Automações por nº de execuções (`label` = nome da automação). Rota `GET automations/top` · tool `report_automations_top`.

### Broadcast / Campanhas

#### `broadcasts.performance` — Performance de campanha → `FunnelData`
- Funil das mensagens de broadcast: `sent` → `delivered` → `read` (fonte: `Messages` com `broadcastId`).
  `conversionFromPrevious` = taxas. Rota `GET broadcasts/performance` · tool `report_broadcasts_performance`.

#### `broadcasts.history` — Histórico de broadcasts → `Ranking` (+`meta`)
- Lista **cronológica** das campanhas: `label` = nome, `value` = enviados (`contactCount`). `meta` =
  `{ delivered, read, createdAt }`. Exclui canceladas. Rota `GET broadcasts/history` · tool
  `report_broadcasts_history`. Params: `channelId?`.

#### `broadcasts.reach-by-segment` — Alcance por segmento → `Ranking` (+`meta`)
- Performance por **tag** usada nos broadcasts: `value` = lidos; `meta` = `{ sent, delivered, read }`. Uma
  mensagem conta em cada tag do broadcast. Rota `GET broadcasts/reach-by-segment` · tool `report_broadcasts_reach_by_segment`.

#### `broadcasts.best-send-time` — Melhor horário de envio → `HeatmapData`
- Heatmap dia × hora de envio com a **taxa de leitura**. ⚠️ `cells[].value` é **fração 0..1** (leituras/total),
  **não** contagem; `max` = melhor taxa. Rota `GET broadcasts/best-send-time` · tool `report_broadcasts_best_send_time`.

### Agentes IA

#### `agents.usage` — Uso de agentes → `TimeSeries`
- Sessões de agente (agents-v2) por bucket. Rota `GET agents/usage` · tool `report_agents_usage`. Params: `granularity?`.

#### `agents.satisfaction` — Satisfação → `Ranking`
- Distribuição das notas (`id`/`label` = "1".."5", `value` = nº de avaliações), ordenado 1→5. Rota
  `GET agents/satisfaction` · tool `report_agents_satisfaction`.

#### `agents.cost` — Custo de IA no tempo → `TimeSeries`
- `SUM(costUsd)` por bucket. ⚠️ `value` = **USD cru**. Rota `GET agents/cost` · tool `report_agents_cost`. Params: `granularity?`.

#### `agents.cost-by-model` — Custo de IA por modelo → `Ranking` (+`meta`)
- Por `model`: `value` = custo USD; `meta` = `{ tokens }`. Rota `GET agents/cost-by-model` · tool `report_agents_cost_by_model`.

#### `agents.resolution` — Taxa de resolução → `Ranking`
- Duas entradas: `resolved` ("Resolvidas") vs `unresolved` ("Não resolvidas"), `value` = nº de sessões. **Taxa**
  = `resolved.value / total` (calcule no front; bom p/ donut). Rota `GET agents/resolution` · tool `report_agents_resolution`.

#### `agents.human-vs-ai` — Humano vs IA → `Ranking`
- Duas entradas: `ai` (mensagens ASSISTANT/BOT) vs `human` (HUMAN), `value` = volume. Rota `GET agents/human-vs-ai`
  · tool `report_agents_human_vs_ai`.

#### `agents.avg-session-duration` — Duração média de sessão → `MetricCard`
- Tempo médio de uma sessão (`endedAt − startedAt`), `value` em **segundos** (`format: "duration"`), com `delta`.
  Rota `GET agents/avg-session-duration` · tool `report_agents_avg_session_duration`.

### Dashboard / Visão Geral

#### `dashboard.summary` — Dashboard principal → `Dashboard`
- `{ cards: Record<string, MetricCard> }`. Cards (MVP): `newContacts` (number), `wonRevenue` (currency, cru),
  `messages` (number), `aiSessions` (number) — cada um com `delta` vs período anterior. Rota `GET dashboard/summary`
  · tool `report_dashboard_summary`.

#### `dashboard.metric` — Comparativo de períodos → `MetricCard`
- Uma métrica via **`metric`** (`newContacts`/`wonRevenue`/`messages`/`aiSessions`; default `newContacts`),
  com `delta`. `wonRevenue` → `format: currency`. Rota `GET dashboard/metric` · tool `report_dashboard_metric`.

#### `dashboard.periodic-summary` — Resumo semanal/mensal → `Dashboard`
- Mesmos 4 cards do `summary`, mas **cada `MetricCard` traz `sparkline: number[]`** (mini-tendência diária;
  dias sem dado omitidos). Rota `GET dashboard/periodic-summary` · tool `report_dashboard_periodic_summary`.

### Agendamentos

#### `schedules.volume` — Volume de agendamentos → `SegmentedTimeSeries`
- Eventos de agenda (`GoogleCalendarEvents`) por dia (pela data do compromisso, `startAt`), segmentados por
  status (`segment` ∈ `active`/`cancelled`). Rota `GET schedules/volume` · tool `report_schedules_volume`.
  Params: `granularity?`. ℹ️ Comparecimento/no-show não disponíveis (ver §8).

### Intelligence

#### `intelligence.ai-hours-saved` — Horas economizadas pela IA → `MetricCard`
- ⚠️ **Estimativa**: `value` = (mensagens de IA ASSISTANT/BOT no período) × **2 min** / 60 = **horas**;
  `delta` vs período anterior. A constante (2 min/mensagem) é premissa documentada, a refinar com produto.
  Rota `GET intelligence/ai-hours-saved` · tool `report_intelligence_ai_hours_saved`.

---

## 5. Pontos de atenção (gotchas)

- **Valores monetários crus:** `crm.revenue`, `crm.revenue-card`, `crm.revenue-forecast`,
  `crm.performance-by-seller` (`value`), `agents.cost*` vêm de `amount`/`costUsd` **sem conversão de escala**.
  Alinhe centavos↔reais/USD com o time de dados antes de formatar moeda.
- **Relatórios snapshot (ignoram o período):** `crm.aging`, `crm.revenue-forecast`, `contacts.inactivity`.
  Datas exigidas pela rota, mas não afetam o resultado — não rotule "no período X".
- **Unidades não-óbvias do `value`:**
  - `messages.response-time` → **segundos** (+ `distribution[].range` em segundos).
  - `agents.avg-session-duration` → **segundos** (`format: "duration"`).
  - `intelligence.ai-hours-saved` → **horas** (estimativa).
  - `broadcasts.best-send-time` → `cells[].value` é **taxa de leitura 0..1**, não contagem.
  - `crm.stage-time` → `value` em **dias**, ordenado pela posição do funil (não por value).
- **`MetricCard` sem `delta`:** `crm.revenue-forecast` (snapshot) — esconda o indicador quando `undefined`.
- **`Ranking.meta` (opcional, tratar como `unknown`):** `crm.performance-by-seller` `{won,lost,winRate}`;
  `messages.workload` `{contacts}`; `broadcasts.history` `{delivered,read,createdAt}`;
  `broadcasts.reach-by-segment` `{sent,delivered,read}`; `agents.cost-by-model` `{tokens}`.
- **Params obrigatórios além do período:** `crm.funnel` → `pipelineId`; `contacts.by-custom-field` → `customFieldId`.
- **Heatmap:** `day` = **0 = segunda** … 6 = domingo; `hour` 0..23; `max` = maior célula (escala de cor).
- **Funil = conversão real** (cards que **entraram** na etapa no período), não ocupação atual.
- **Validação estrita:** query param desconhecido → `400`. Envie só os params documentados.

---

## 6. Mapeamento relatório ↔ aba

| Aba | Relatórios |
|---|---|
| **Geral / Dashboard** | `dashboard.summary`, `dashboard.periodic-summary`, `dashboard.metric`, `contacts.growth`, `crm.revenue-card`, `crm.revenue-forecast`, `general.feed` |
| **Funil / CRM** | `crm.funnel`, `crm.loss-reasons`, `crm.aging`, `crm.revenue`, `crm.revenue-card`, `crm.sales-velocity`, `crm.stage-time`, `crm.performance-by-seller`, `crm.revenue-forecast` |
| **Contatos / Leads** | `contacts.growth`, `contacts.growth-by-source`, `contacts.peak-hours`, `contacts.by-channel`, `contacts.by-tag`, `contacts.inactivity`, `contacts.utm-source/medium/campaign`, `contacts.by-custom-field` |
| **Mensagens / Atendimento** | `messages.volume`, `messages.response-time`, `messages.conversations`, `messages.workload`, `messages.delivery-status`, `messages.service-hours` |
| **Automações** | `automations.executions`, `automations.by-trigger`, `automations.top`, `general.feed` |
| **Broadcast** | `broadcasts.performance`, `broadcasts.history`, `broadcasts.reach-by-segment`, `broadcasts.best-send-time` |
| **Agentes IA** | `agents.usage`, `agents.satisfaction`, `agents.cost`, `agents.cost-by-model`, `agents.resolution`, `agents.human-vs-ai`, `agents.avg-session-duration`, `intelligence.ai-hours-saved` |
| **Agendamentos** | `schedules.volume` |

---

## 7. Tools MCP

São **45 tools `report_*`** (uma por relatório), registradas no servidor MCP — mesma lógica do core (a tool só
converte input e delega).

- **Input** (`ReportToolInput`, datas como **string ISO**): `initialDate`, `finalDate`, `timezone?`,
  `granularity?`, `channelId?`, `moderatorId?`, `pipelineId?`, `customFieldId?`, `automationId?`, `metric?`,
  `utmSource?`, `utmMedium?`, `utmCampaign?`, `limit?`, `cursor?`.
- **Output:** o mesmo payload do contrato; validável por `validateToolOutput`.
- **`accountId` vem SEMPRE do contexto de auth da sessão MCP** (`getAuth().accountId`), nunca dos argumentos.

O nome da tool é `report_` + o id do relatório com `.`/`-` virando `_` (ex.: `agents.cost-by-model` →
`report_agents_cost_by_model`). A lista completa está na coluna "Tool MCP" da §4.

---

## 8. Ainda não disponível (bloqueado/a definir)

Não há rota/tool para estes — dependem de decisões de produto ou de dados inexistentes hoje:

- **Comparecimento / no-show de agendamentos** — exige novos campos no schema (`COMPARECEU`/`NO_SHOW`); a
  migration é responsabilidade do dev. `schedules.volume` cobre só a quantidade (ativos/cancelados).
- **Mood / sentimento e insights de conversa** — sem fonte no banco; precisam de pipeline NLP.
- **Relatórios dinâmicos / text-to-SQL** — PoC com guard-rails (read-only, account-scope, whitelist, timeout,
  rate limit) ainda não iniciado.

**Follow-ups menores já mapeados** (incrementos sobre relatórios existentes): taxa de erro de broadcast;
conversas por moderador; "conversas ativas agora" (snapshot); tempo de resposta IA vs humano; filtro por pasta
em `contacts.by-tag`; taxa de reativação de inativos; conversão UTM→pipeline; filtro por campanha em
`broadcasts.reach-by-segment`; cache por request no dashboard; média de notas (card) em `agents.satisfaction`.
