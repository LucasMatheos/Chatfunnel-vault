---
title: Reports v2 — Catálogo de Dados (aba por aba)
description: Catálogo de dados do Reports V2 gerado do código-fonte — cada aba, gráfico por gráfico, com o que é o dado, de onde vem (tabelas Prisma), como é o cálculo, a query de origem, shaper, filtros e cache TTL.
tags: [features, reports, reportsV2, catalogo-dados, queries, prisma, reference]
related: ["[[reports-v2-front-arquitetura]]", "[[reports-v2-arquitetura]]", "[[dashboard-v2]]", "[[crm-kanban]]", "[[automations]]", "[[broadcast]]", "[[ai-agents]]"]
last_updated: 2026-07-03
status: reference
source: docs/reports-v2/data-catalog/REPORTS-V2-DATA-CATALOG.md
---

> Artigo de referência. Fonte canônica gerada em `docs/reports-v2/data-catalog/`
> (um arquivo por aba em `sections/`). Derivado do código-fonte em
> `chatfunnel-core/src/reports/**` e `chatfunnel-front/src/views/reportsV2/**` —
> ao mudar o código, regenerar. Contraparte de dados de [[reports-v2-front-arquitetura]]
> e [[reports-v2-arquitetura]].


> Documento gerado a partir do código-fonte (não da spec). Para cada gráfico/card
> descreve: **o que é o dado**, **de onde vem** (tabelas Prisma), **como é o cálculo**
> e **qual a query de origem**. Fiel ao que está implementado — divergências entre
> código e spec estão marcadas explicitamente.

## Como ler este documento

O pipeline de um relatório atravessa três repositórios:

```
chatfunnel-front                     chatfunnel-services            chatfunnel-core
─────────────────                    ───────────────────            ───────────────
Tab .vue  → useReportQuery  ── HTTP ─→ reports.controller  ──→  orchestrator
(seção)     (service)                  reports.service            └─ catalog[id].query(repos, ...)
                                                                       └─ repository.<método>()  ← QUERY real (SQL/Prisma)
                                                                            └─ shaper           ← molda p/ o gráfico
```

- **`id` do report** (ex: `crm.revenue`) mora no *catalog* (`chatfunnel-core/src/reports/catalog/*.catalog.ts`)
  e aponta para (a) um **shaper** (tipo de gráfico) e (b) um **método do repository** (a query).
- **A query real** mora no repository (`chatfunnel-core/src/repositories/reports/*-reports.repository.ts`) —
  `$queryRaw` (SQL cru) ou chamada Prisma.
- **O cálculo** costuma ser dividido: agregação/join no repository + transformação final no **shaper**
  (ver seção "Visão geral" para o que cada shaper espera e produz).
- **As descrições user-facing** vêm de `chatfunnel-front/src/views/reportsV2/info/reportInfo.ts`.
- **Tipo de dado:** `período` reage ao filtro de datas; `estado atual` ignora a data (snapshot de agora);
  `últimos 30 dias` é fixo (superfície DashboardV2).

## Índice

- [Visão geral — arquitetura do pipeline de dados](#visão-geral--arquitetura-do-pipeline-de-dados)
- [Aba Geral](#aba-geral)
- [Aba Funil (CRM)](#aba-funil-crm)
- [Aba Contatos](#aba-contatos)
- [Aba Mensagens](#aba-mensagens)
- [Aba Colaboradores](#aba-colaboradores)
- [Aba Automações](#aba-automações)
- [Aba Broadcast](#aba-broadcast)
- [Aba Agendamentos](#aba-agendamentos)

## Divergências código × spec e gotchas (leia antes)

Achados que os relatórios abaixo detalham por gráfico, resumidos aqui:

1. **`cacheTtl` é hoje só metadado.** Todo o catálogo usa `900s`, mas o `CacheAdapter` chega ao
   orchestrator e **não é usado** — nenhuma leitura/gravação de cache acontece. O TTL documentado
   em cada card reflete a intenção, não um cache ativo.
2. **Granularidade sempre inferida.** No caminho HTTP, `toReportParams` não repassa
   `granularity`/`limit`/`cursor`; a granularidade é sempre decidida por `pickGranularity` a partir
   do intervalo de datas.
3. **Aba Geral ≠ DashboardV2.** Os arquivos `dashboard.catalog.ts`, `dashboard-reports.repository.ts`
   e `dashboard-periodic.handler.ts` pertencem à superfície **DashboardV2 (janela fixa de 30 dias)** e
   **não alimentam a aba Geral**. A aba Geral monta seus KPIs a partir de 4 endpoints reais
   (`contacts.by-channel`, `crm.funnel-overview`, `schedules.volume`, `intelligence.ai-hours-saved`).
4. **Dinheiro no CRM: divergência centavos × reais.** O backend retorna `amount` como `Int`. **Não há
   `/100` nem `centavosToReais` em `views/reportsV2/`** — `formatMetricValue('currency')` formata o
   `Int` cru como BRL. Se o valor for de fato centavos, a exibição está 100× inflada. Marcado em cada
   card monetário. *(Observação: contradiz a nota de projeto anterior — vale reconferir no runtime.)*
5. **Gráficos implementados mas comentados no template:**
   - **Funil:** o grid do "Resumo do funil" renderiza só 3 dos 8 cards (Ganhos/Perdidos/Receita do
     período); os outros 5 o backend produz mas o front não exibe. `crm.revenue-forecast` está
     consultado mas comentado no template.
   - **Colaboradores:** só 4 seções renderizam; Uso, Resolução, Satisfação, Custo-por-modelo e
     Custo-no-tempo estão prontos ponta-a-ponta mas comentados.
6. **Reports no catálogo mas fora da tela:** `contacts.growth` (R08) e `contacts.peak-hours` (R11)
   existem mas não são renderizados na aba Contatos.
7. **Premissas estimadas:** "Horas economizadas pela IA" usa `MINUTES_SAVED_PER_AI_MESSAGE = 2`
   (constante, a tornar configurável), contando `Messages.from IN ('ASSISTANT','BOT')`.
8. **Custo de IA em USD cru.** `agents.cost`/`agents.cost-by-model` vêm de `LlmUsageLogs.costUsd` em
   dólar, sem conversão — diferente da receita do CRM.
9. **Escopo multi-tenant.** Tabelas sem `accountId` direto (ex: `IGAutomationsExecutions`,
   `KanbanCards`) são escopadas por JOIN na tabela-pai (`IGAutomations`, `Kanbans`). Soft delete
   (`isDeleted`) aplicado nas queries.

---
## Visão geral — arquitetura do pipeline de dados

O Reports V2 é um pipeline em camadas cujo núcleo de dados vive no `chatfunnel-core` (catálogo, queries e shapers), é exposto por controllers finos no `chatfunnel-services` (NestJS) e consumido pelo `chatfunnel-front` via `NestApi`. O princípio central é a separação entre **query** (SQL bruto, com efeitos colaterais de banco) e **shaper** (função pura que transforma linhas cruas no payload do gráfico). Boa parte do "cálculo" de um gráfico — deltas, totais, conversões, máximos de escala — não acontece no SQL nem no front: acontece no shaper.

### Fluxo end-to-end

1. **Front — tab → composable → service HTTP.** Cada aba (`GeralTab.vue`, `FunilTab.vue`, `ContatosTab.vue`, etc., em `chatfunnel-front/src/views/reportsV2/tabs/`) declara suas fontes de dado com `useReportQuery(fetcher)` (`composables/useReportQuery.ts`), um wrapper genérico que segura `data/loading/error` e executa o `fetcher`. O `fetcher` chama um método de `ReportsV2Service` (`chatfunnel-front/src/common/services/ReportsV2Service.ts`), que faz o `GET` via `NestApi` para `/reports/v2/<domínio>/<relatório>`. O `useReportQuery` **não** trata o erro HTTP (toast e logout 401 já são feitos pelo interceptor global do Axios); ele só captura o estado para o slot de erro. Cada card/seção carrega de forma independente (skeleton por fonte). Os filtros vêm de `useReportsFilters` e viram query params; valores monetários chegam em **centavos** e são normalizados para reais na borda do service (`centavosToReais`).

2. **Services (NestJS) — controller → service.** Há um controller por domínio em `chatfunnel-services/src/modules/reports-v2/controllers/` (`crm.controller.ts`, `contacts.controller.ts`, `messages.controller.ts`, `general.controller.ts`, ...), todos com prefixo `@Controller("reports/v2/<domínio>")` e protegidos por `@UseGuards(AuthGuard("jwt"))`. Cada endpoint lê `Account-Selected` e `Timezone` de headers, recebe o `BaseReportDto` na query, converte-o para o `ReportParams` do core via `toReportParams(dto)` (`dtos/base-report.dto.ts`) e chama `this.reports.run<T>("<domínio>.<relatório>", accountId, params, timezone)`. O `ReportsV2Service` (`reports-v2.service.ts`) é um **adapter fino**: cria o orchestrator do core a partir do `PrismaService` (`createReportsOrchestrator(this.prisma)`), delega `run` e mapeia `DomainError` do core para exceções HTTP (`NotFoundError`→404, `ValidationError`→400, `Forbidden`→403, `Conflict`→409).

3. **Core — orchestrator.** `createReportsOrchestrator(prisma)` (`chatfunnel-core/src/reports/orchestrator/create-reports-orchestrator.ts`) é self-contained: instancia as reports repositories (`buildReportsRepositories`), o registry do catálogo (`buildRegistry`), o mapa de shapers (`buildShapers`) e os handlers especiais (`buildSpecials`). Em `run(id, accountId, params, timezone)`:
   - Se `id` for um **special** (ex.: `EventFeed`), delega direto ao handler, que faz a própria query e monta o payload (sem shaper/granularidade).
   - Caso contrário, resolve a config no registry (`id` desconhecido → `NotFoundError`); normaliza o período (`normalizeRange`) e resolve a granularidade uma vez (`params.granularity ?? pickGranularity(start, end)`), propagando-a para a query e para o shaper via `resolvedParams`.
   - Executa `config.query(repos, accountId, resolvedParams, timezone)` e passa as linhas cruas por `shapers[config.shaper].shape(rows, { granularity })`.

4. **Core — catálogo.** O catálogo (`chatfunnel-core/src/reports/catalog/index.ts`) monta um `Map<reportId, ReportConfig>` agregando os catálogos por domínio (`crm.catalog.ts`, `contacts.catalog.ts`, `messages.catalog.ts`, `automations.catalog.ts`, `broadcasts.catalog.ts`, `agents.catalog.ts`, `dashboard.catalog.ts`, `schedules.catalog.ts`, `intelligence.catalog.ts`). Cada entrada (`ReportConfigBase`) amarra `id` → `shaper` (kind) + `query` (delegate para um método de reports repository) + `cacheTtl`. Exemplo (`crm.catalog.ts`): `{ id: "crm.revenue", shaper: "timeSeries", cacheTtl: 900, query: (repos, accountId, params, tz) => repos.crmReports.revenueTimeSeries(accountId, params, tz) }`.

5. **Core — repository (query).** As reports repositories (`chatfunnel-core/src/repositories/reports/*.repository.ts`, instanciadas em `orchestrator/reports-repositories.ts`) executam `$queryRaw` account-scoped e devolvem linhas tipadas (`chatfunnel-core/src/repositories/reports/types.ts`). Elas fazem a agregação SQL (contagens, buckets, `DATE_TRUNC`), aplicam os filtros de `ReportParams` como fragmentos `Prisma.Sql` opcionais e resolvem o timezone dentro do SQL. Não fazem o cálculo derivado do gráfico — isso fica no shaper.

6. **Core — shaper.** Transforma as linhas cruas no payload de contrato (`@chatfunnel/contracts`). É **puro**: sem banco, sem params, sem timezone; recebe apenas `rows` e um `ctx?.granularity` opcional. Ver seção dos shapers abaixo.

7. **Resposta.** O payload do shaper (`ReportPayload` do contracts) sobe pelo service → controller → HTTP → front, onde vira gráfico (ECharts) na aba.

### Contrato `ReportParams` e resolução de período/granularidade

`ReportParams` (`chatfunnel-core/src/reports/types.ts`) é um objeto simples (sem class-validator — a validação de DTO é do consumidor). Campos:

- `initialDate: Date`, `finalDate: Date` — obrigatórios.
- `granularity?: "day" | "week" | "month"` — opcional; se ausente, é inferida.
- `channelId?`, `moderatorId?`, `pipelineId?`, `broadcastId?`, `customFieldId?`, `automationId?` — filtros opcionais por entidade (cada relatório usa os que fizerem sentido; `customFieldId` é obrigatório em `contacts.by-custom-field`).
- `metric?` — métrica selecionada no `dashboard.metric`.
- `utmSource?`, `utmMedium?`, `utmCampaign?` — filtros de origem para relatórios de contatos.
- `limit?`, `cursor?` — paginação (usada por specials como o EventFeed; demais relatórios ignoram).

**`accountId` e `timezone` NÃO ficam em `ReportParams`** — são argumentos posicionais das queries. No caminho HTTP, o `BaseReportDto` (com `class-validator` + `class-transformer`, que faz o parse das datas via `@Transform(({value}) => new Date(value))`) é convertido por `toReportParams(dto)` — note que `toReportParams` **não** copia `granularity`, `limit` nem `cursor`, então pelo caminho HTTP atual a granularidade é sempre resolvida por inferência no orchestrator.

- **Timezone / período — `normalizeRange`** (`core/period.helper.ts`): usa `moment-timezone` para reduzir o intervalo aos limites do dia no fuso informado — início do dia de `initialDate` e fim do dia de `finalDate` (mesmo padrão do `fixTimezone` legado). Default `America/Sao_Paulo`. As queries que bucketizam por data reinterpretam o timestamp UTC do banco no fuso local (`("...".coluna AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}`) antes do `DATE_TRUNC`.
- **Granularidade — `pickGranularity`** (`core/granularity.helper.ts`): escolhida pelo tamanho do range quando não informada — `≤31 dias → day`, `≤120 dias → week`, senão `month`. O orchestrator resolve uma vez e propaga; relatórios não-série ignoram.

### Os shapers (6 documentados)

Todos implementam `ReportShaper<TRow, TResponse>` (`core/report-shaper.contract.ts`), são registrados em `buildShapers()` (`shapers/index.ts`) e são funções puras `shape(rows, ctx?)`. `TRow` vem de `repositories/reports/types.ts`; `TResponse` vem de `@chatfunnel/contracts`.

- **`timeSeries`** (`shapers/time-series.shaper.ts`)
  - **Entrada (`TimeSeriesRow[]`):** `{ date: string ('YYYY-MM-DD', início do bucket), value: number, segment?: string }`.
  - **Saída:** se nenhuma linha tem `segment`, produz `TimeSeries` = `{ series: TimeSeriesPoint[], granularity }`; se alguma linha tem `segment`, agrupa por segmento e produz `SegmentedTimeSeries` = `{ granularity, segments: [{ segment, points }] }`. A `granularity` vem do `ctx` (default `"day"`). Cálculo no shaper: partição por segmento.

- **`ranking`** (`shapers/ranking.shaper.ts`)
  - **Entrada (`RankingRow[]`, já ordenadas pela query):** `{ id, label, value, meta?: Record<string, unknown> }`.
  - **Saída:** `Ranking` = `{ entries: RankingEntry[], total }`, onde `total` é a **soma** de `value` (calculada no shaper). `meta` é copiado só quando presente (usado, p.ex., para `won/lost/winRate` em `crm.performance-by-seller`).

- **`heatmap`** (`shapers/heatmap.shaper.ts`)
  - **Entrada (`HeatmapRow[]`):** `{ day: number (0..6, 0 = segunda), hour: number (0..23), value: number }`.
  - **Saída:** `HeatmapData` = `{ cells: HeatmapCell[], max }`, onde `max` é o **maior valor de célula** (calculado no shaper, para a escala de cor no front).

- **`funnel`** (`shapers/funnel.shaper.ts`)
  - **Entrada (`FunnelRow[]`, já ordenadas por `position`):** `{ stageId, name, position, total }`.
  - **Saída:** `FunnelData` = `{ stages: FunnelStage[] }`. Cálculo no shaper: `conversionFromPrevious = total[n] / total[n-1]` (fração 0..1), ausente no 1º estágio e quando o anterior é 0.

- **`aging`** (`shapers/aging.shaper.ts`)
  - **Entrada (`AgingRow[]`, ordem preservada):** `{ label, rangeMin, rangeMax: number | null, count }`.
  - **Saída:** `AgingData` = `{ buckets: AgingBucket[] }`, cada bucket com `range: [rangeMin, rangeMax]` (`rangeMax = null` = faixa aberta) e `count`. Sem cálculo derivado — mapeamento 1:1.

- **`metricCard`** (`shapers/metric-card.shaper.ts`)
  - **Entrada (`MetricCardRow[]` — usa apenas `rows[0]`):** `{ value, previousValue?: number | null, format?: "number" | "currency" | "percentage" | "duration" }`.
  - **Saída:** `MetricCard` = `{ value, format?, delta? }`. Cálculo no shaper: o `delta` (`{ absolute, percentage }`) só é emitido quando há base de comparação real E variação real — `previousValue` presente, ≠ 0 e ≠ `value`; caso contrário o card sai sem `delta` (evita "0%" enganoso no front). Nota: para cards monetários o backend envia `value`/`delta.absolute` em **centavos** e o front normaliza para reais.

Além dos shapers, relatórios cuja lógica não cabe num shaper são **specials** (`SpecialReportHandler`, em `reports/handlers/`): fazem a própria query e montam o payload diretamente. Exemplos: o EventFeed (paginação por keyset via `cursor`/`sortKey`) e o `messages.response-time` (agregado `ResponseTimeAggRow` com média/mediana/p95 + faixas `b0..b4`).

### Cache (`cacheTtl`)

`cacheTtl` é um campo obrigatório de cada `ReportConfigBase` (em segundos; hoje `900` = 15 min em todas as entradas do catálogo). **Importante:** no estado atual do código é um **metadado** — o orchestrator recebe um `CacheAdapter` opcional em `_options` mas **não o utiliza** em `run` (o parâmetro está prefixado com `_`, e a query é sempre executada). O comentário no contrato (`report-shaper.contract.ts`) é explícito: "cache geral adiado (exceto dashboard composto)". Ou seja, o `cacheTtl` documenta a intenção de TTL por relatório, mas o caching genérico ainda não está ligado no pipeline principal.

### Multi-tenancy e soft delete

`accountId` é argumento posicional obrigatório de toda `ReportQuery`/reports repository e é sempre aplicado no SQL como `WHERE "<Tabela>"."accountId" = ${accountId}::uuid` (o valor vem do header `Account-Selected`, autenticado pelo JWT guard). As queries que partem de tabelas com soft delete filtram `"<Tabela>"."isDeleted" = false` (ex.: `Contacts` em `contacts-reports.repository.ts`). Filtros opcionais de `ReportParams` são adicionados como fragmentos `Prisma.Sql` — ex.: canal via `EXISTS` na junção `ContactsChannels` (evita multiplicar linhas na relação 1:N), UTM por igualdade exata. Nenhuma query cruza contas, e a saída crua (row types em `repositories/reports/types.ts`) é sempre account-scoped antes de chegar ao shaper.
# Data Catalog — Reports V2

## Aba Geral

A aba **Geral** é o dashboard de visão geral do Reports V2: um bloco de KPIs (Indicadores) + quatro visualizações (donut de origem, histórico de leads, heatmap de atividade, agendamentos) + um feed de eventos. **Tudo reage ao filtro de data global** (`initialDate` / `finalDate`); todos os cards de KPI são `dataType: "periodo"`. Fonte no front: `chatfunnel-front/src/views/reportsV2/tabs/GeralTab.vue`, consumindo `ReportsV2Service` (NestJS, base `/reports/v2`).

> **Observação de arquitetura importante:** os arquivos `dashboard.catalog.ts` (`dashboard.metric`), `dashboard-reports.repository.ts` (`summaryMetrics` / `summarySparklines` / `metricComparison`) e `dashboard-periodic.handler.ts` (`dashboard.periodic-summary`) **NÃO alimentam a aba Geral** — servem à superfície separada DashboardV2 (últimos 30 dias fixos). A aba Geral não instancia `dashboard.metric` nem `dashboard.periodic-summary`. Do domínio Intelligence, a Geral usa apenas `intelligence.ai-hours-saved`. Os KPIs da Geral são **derivados** de quatro endpoints reais: `contacts/by-channel`, `crm/funnel-overview`, `schedules/volume` e `intelligence/ai-hours-saved`.

O bloco Indicadores tem 6 cards, mas eles vêm de **4 requisições** (1 card = 1 fonte, exceto o overview do funil que serve 3 cards). Abaixo, cada card e cada gráfico.

---

## Bloco "Indicadores" (6 cards)

Renderizados em `MetricCard` (grid 3 colunas), cada card com skeleton independente atrelado ao loading da sua própria fonte. Seção: `info-key="geral.indicadores"` — "Resumo dos principais números do período: leads, ganhos, perdas, faturamento e produtividade."

### Total de leads — derivado de `contacts.by-channel`
- **Gráfico:** `MetricCard` (número) · shaper: derivado no front (`totalLeadsCard`), sem shaper de backend
- **Tipo de dado:** período
- **O que é:** total de contatos que entraram no período selecionado, somando todas as origens. (`geral.totalLeads`)
- **Fonte (tabelas/models Prisma):** `Contacts`
- **Cálculo:** o front reaproveita a resposta do ranking `contacts.by-channel` e usa `Ranking.total` (a soma de todos os canais) como valor do card. `{ value: byChannel.data.total, format: 'number' }`. Não faz requisição própria.
- **Query:** mesma de "Entrada de leads por origem" (`acquisitionByChannel`) — `SELECT "fromPlatform" AS label, COUNT(*) AS value FROM "Contacts" WHERE accountId=… AND "dateCreated" BETWEEN start AND end AND isDeleted=false GROUP BY "fromPlatform"`. O `total` é a soma dos `value`.
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `timezone`; UTM (`utmSource/Medium/Campaign`) e `channelId` afetam a query subjacente
- **Cache TTL:** 900 s (do report `contacts.by-channel`)

### Leads ganhos — derivado de `crm.funnel-overview`
- **Gráfico:** `MetricCard` (número, `neutral`) · shaper: `metricCard` (via handler special `crm.funnel-overview`)
- **Tipo de dado:** período
- **O que é:** leads marcados como ganhos (negócio fechado) no período, somando todos os funis. (`geral.ganhos`)
- **Fonte (tabelas/models Prisma):** `KanbanCards` JOIN `Kanbans`
- **Cálculo:** o front lê `overview.data.cards['Ganhos (período)']` do `Dashboard` retornado pelo handler `crmFunnelOverviewHandler`. Sem `pipelineId` → agrega **todos** os pipelines. Card com delta vs período anterior de mesma duração.
- **Query:** `COUNT(*) FILTER (WHERE kc."statusOportunity" = 'WON' AND kc."statusOportunityUpdatedAt" BETWEEN start AND end)` como `wonCurrent`, e a mesma contagem na janela anterior (`prevStart..prevEnd`) como `wonPrevious`. `FROM "KanbanCards" kc JOIN "Kanbans" k … WHERE k."accountId"=… AND k.isDeleted=false AND kc.isDeleted=false`.
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `timezone`; `pipelineId` (não passado pela Geral → all-pipelines)
- **Cache TTL:** 900 s (report `crm.funnel-overview`)

### Leads perdidos — derivado de `crm.funnel-overview`
- **Gráfico:** `MetricCard` (número, `neutral`, `invertDelta` — subir é ruim/vermelho) · shaper: `metricCard`
- **Tipo de dado:** período
- **O que é:** leads marcados como perdidos no período, somando todos os funis. (`geral.perdidos`)
- **Fonte (tabelas/models Prisma):** `KanbanCards` JOIN `Kanbans`
- **Cálculo:** front lê `overview.data.cards['Perdidos (período)']`. Mesmo overview do card de ganhos (uma única requisição serve os 3 cards de funil).
- **Query:** `COUNT(*) FILTER (WHERE kc."statusOportunity" = 'LOST' AND kc."statusOportunityUpdatedAt" BETWEEN start AND end)` → `lostCurrent`; janela anterior → `lostPrevious`. Mesmo `FROM/WHERE` do card de ganhos.
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `timezone`; `pipelineId` (não usado pela Geral)
- **Cache TTL:** 900 s

### Faturamento — derivado de `crm.funnel-overview`
- **Gráfico:** `MetricCard` (moeda) · shaper: `metricCard`
- **Tipo de dado:** período
- **O que é:** soma da receita dos leads ganhos no período, somando todos os funis. (`geral.faturamento`)
- **Fonte (tabelas/models Prisma):** `KanbanCards` JOIN `Kanbans`
- **Cálculo:** front lê `overview.data.cards['Receita do funil (período)']`. Valor `currency` **em centavos** (o front converte para reais). Delta vs período anterior.
- **Query:** `COALESCE(SUM(kc."amount") FILTER (WHERE kc."statusOportunity"='WON' AND kc."statusOportunityUpdatedAt" BETWEEN start AND end), 0)::float` → `revenueCurrent`; janela anterior → `revenuePrevious`.
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `timezone`; `pipelineId` (não usado pela Geral)
- **Cache TTL:** 900 s

### Agendamentos (card) — derivado de `schedules.volume`
- **Gráfico:** `MetricCard` (número) · shaper: `timeSeries` (backend) + soma no front (`sumTimeSeries`)
- **Tipo de dado:** período
- **O que é:** total de agendamentos criados no período. (`geral.agendamentos`)
- **Fonte (tabelas/models Prisma):** `GoogleCalendarEvents`
- **Cálculo:** o front reaproveita a série temporal de "Agendamentos" (mesma fonte do gráfico de barras) e soma **todos os pontos** de todos os segmentos (`sumTimeSeries(schedules.data)`) para o valor do card. Sem delta.
- **Query:** `SELECT TO_CHAR(DATE_TRUNC(granularity, e."startAt" …tz), 'YYYY-MM-DD') AS date, CASE WHEN e."isCancelled" THEN 'cancelled' ELSE 'active' END AS segment, COUNT(*) AS value FROM "GoogleCalendarEvents" e WHERE e."accountId"=… AND e."startAt" IS NOT NULL AND e."startAt" BETWEEN start AND end GROUP BY 1,2`.
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `timezone`, `granularity`
- **Cache TTL:** 900 s (report `schedules.volume`)

### Horas economizadas pela IA — `intelligence.ai-hours-saved`
- **Gráfico:** `MetricCard` (número, nota "Estimativa") · shaper: `metricCard`
- **Tipo de dado:** período (estimativa)
- **O que é:** estimativa de horas de atendimento poupadas pela IA no período. (`geral.aiHours`)
- **Fonte (tabelas/models Prisma):** `Messages` JOIN `Contacts`
- **Cálculo:** conta mensagens de IA (`m."from" IN ('ASSISTANT','BOT')`) no período, multiplica por `MINUTES_SAVED_PER_AI_MESSAGE = 2` e divide por 60 → horas. `previousValue` = mesma conta na janela anterior de igual duração, para o delta. Card vem pronto do backend (`format: number`). Premissa documentada, a refinar com produto.
- **Query:** `SELECT COUNT(*) FILTER (WHERE m."createdAt" BETWEEN start AND end) AS current, COUNT(*) FILTER (WHERE m."createdAt" BETWEEN prevStart AND prevEnd) AS previous FROM "Messages" m JOIN "Contacts" c ON c.id=m."contactId" WHERE c."accountId"=… AND m.isDeleted=false AND m."contabilableOnMetrics"=true AND m."from" IN ('ASSISTANT','BOT') AND m."createdAt" BETWEEN prevStart AND end`. Depois `toHours(n) = n*2/60`.
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `timezone`
- **Cache TTL:** 900 s

---

## Entrada de leads por origem — `contacts.by-channel`
- **Gráfico:** `ChannelDonut` (donut/rosca, vertical) · shaper `ranking`
- **Tipo de dado:** período
- **O que é:** distribuição dos leads que entraram no período por canal de origem (WhatsApp, Instagram, etc.). (`geral.byChannel`)
- **Fonte (tabelas/models Prisma):** `Contacts`
- **Cálculo:** ranking de novos contatos agrupados por `Contacts.fromPlatform` (a plataforma pela qual o lead entrou, **uma por contato** — evita duplicar via `ContactsChannels`). Conta contatos criados no período. O shaper `ranking` monta `entries[]` e `total`.
- **Query:** `SELECT "fromPlatform" AS id, "fromPlatform" AS label, COUNT(*) AS value FROM "Contacts" WHERE "accountId"=… AND "dateCreated" BETWEEN start AND end AND isDeleted=false [+channelFilter +utmFilter] GROUP BY "fromPlatform"`.
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `timezone`; `channelId`, UTM (`source/medium/campaign`)
- **Cache TTL:** 900 s

## Histórico de entrada de leads — `contacts.growth`
- **Gráfico:** `BarSeriesChart` (barras, label "Leads") · shaper `timeSeries`
- **Tipo de dado:** período
- **O que é:** evolução diária da quantidade de leads que entraram, dentro do período selecionado. (`geral.leadsHistory`)
- **Fonte (tabelas/models Prisma):** `Contacts`
- **Cálculo:** contagem de contatos criados, agrupada por dia (granularidade dinâmica via `pickGranularity`, default day), com conversão de fuso (`AT TIME ZONE`). Uma série (`series[]`) de `{date, value}`.
- **Query:** `SELECT TO_CHAR(DATE_TRUNC(granularity, ("Contacts"."dateCreated" AT TIME ZONE 'UTC') AT TIME ZONE tz),'YYYY-MM-DD') AS date, COUNT(*) AS value FROM "Contacts" WHERE "accountId"=… AND "dateCreated" BETWEEN start AND end AND isDeleted=false [+utmFilter] GROUP BY 1 ORDER BY 1 ASC`.
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `timezone`, `granularity`; UTM
- **Cache TTL:** 900 s

## Atividade por horário — `contacts.peak-hours`
- **Gráfico:** `Heatmap` (dia da semana × hora); ação de cabeçalho mostra "Melhor dia" (calculado no front por `bestWeekdayFromHeatmap`) · shaper `heatmap`
- **Tipo de dado:** período
- **O que é:** concentração de atividade por dia da semana e hora, no período. Ajuda a identificar os melhores horários. (`geral.heatmap`)
- **Fonte (tabelas/models Prisma):** `Contacts` (novos contatos por dia-da-semana × hora)
- **Cálculo:** para cada contato criado no período, extrai dia-da-semana (`EXTRACT(ISODOW) - 1` → 0..6, 0 = segunda) e hora (`EXTRACT(HOUR)`), ambos no fuso do usuário; conta por célula `(day, hour)`. O shaper monta `cells[]`.
- **Query:** `SELECT (EXTRACT(ISODOW FROM (…"dateCreated"…tz))::int - 1) AS day, EXTRACT(HOUR FROM (…tz))::int AS hour, COUNT(*) AS value FROM "Contacts" WHERE "accountId"=… AND "dateCreated" BETWEEN start AND end AND isDeleted=false [+channelFilter +utmFilter] GROUP BY 1,2 ORDER BY 1,2`.
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `timezone`; `channelId`, UTM
- **Cache TTL:** 900 s

## Agendamentos (gráfico) — `schedules.volume`
- **Gráfico:** `BarSeriesChart` (barras, label "Agendamentos") · shaper `timeSeries`
- **Tipo de dado:** período
- **O que é:** volume de agendamentos criados ao longo do período. (`geral.schedulesSection`)
- **Fonte (tabelas/models Prisma):** `GoogleCalendarEvents`
- **Cálculo:** conta eventos de calendário por dia (granularidade dinâmica) e por segmento (`active` vs `cancelled`, derivado de `isCancelled`), no fuso do usuário. Base do card "Agendamentos" (soma da série).
- **Query:** `SELECT TO_CHAR(DATE_TRUNC(granularity, e."startAt" …tz),'YYYY-MM-DD') AS date, CASE WHEN e."isCancelled" THEN 'cancelled' ELSE 'active' END AS segment, COUNT(*) AS value FROM "GoogleCalendarEvents" e WHERE e."accountId"=… AND e."startAt" IS NOT NULL AND e."startAt" BETWEEN start AND end GROUP BY 1,2 ORDER BY 1 ASC`.
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `timezone`, `granularity`
- **Cache TTL:** 900 s

## Últimos eventos (Event Feed) — `general.feed`
- **Gráfico:** `EventFeed` (lista cronológica) + botão "Carregar mais" (paginação por cursor) · handler special `eventFeedHandler` (sem shaper — monta `items[]`, `hasMore`, `nextCursor`)
- **Tipo de dado:** período
- **O que é:** eventos mais recentes registrados no período (entradas, ganhos, perdas e afins). (`geral.eventFeed`)
- **Fonte (tabelas/models Prisma):** `UNION ALL` de fontes heterogêneas account-scoped — MVP: `Contacts` (evento `lead.created`) e `IGAutomationsExecutions` JOIN `IGAutomations` (evento `automation.executed`).
- **Cálculo:** cada fonte gera linhas com `type`, `timestamp_iso`, `contact_id`, `contact_name`/`extra` e uma `sort_key` textual (`YYYYMMDDHH24MISSUS | type | id`) para keyset estável. `LIMIT limit+1` detecta `hasMore`; o `nextCursor` é a `sortKey` do último item da página. O `title` em pt-BR é montado no handler (`"Novo lead: …"`, `"Automação executada: …"`), não no SQL. Limite default 20, máx 100.
- **Query:**
  ```sql
  SELECT feed.* FROM (
    -- lead.created
    SELECT c.id AS id, 'lead.created' AS type, to_char(c."dateCreated", …) AS timestamp_iso,
           c.id AS contact_id, c."name" AS contact_name, NULL AS extra, (…) AS sort_key
    FROM "Contacts" c
    WHERE c."accountId"=… AND c.isDeleted=false AND c."dateCreated" BETWEEN start AND end
    UNION ALL
    -- automation.executed
    SELECT e.id, 'automation.executed', to_char(e."dateExecution", …),
           e."contactId", NULL, a."name" AS extra, (…) AS sort_key
    FROM "IGAutomationsExecutions" e JOIN "IGAutomations" a ON e."automationId"=a.id
    WHERE a."accountId"=… AND e."dateExecution" BETWEEN start AND end
  ) feed
  WHERE 1=1 [AND feed.sort_key < :cursor]
  ORDER BY feed.sort_key DESC
  LIMIT :limit+1
  ```
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `timezone`; `limit`, `cursor` (paginação)
- **Cache TTL:** não cacheado (handler special de feed paginado, sem `cacheTtl`)
## Aba Funil (CRM)

A aba **Funil** do Reports V2 documenta o pipeline de vendas/CRM (Kanban). Todos os relatórios são account-scoped e usam `$queryRaw` sobre as tabelas de Kanban (`KanbanCards`, `Kanbans`, `KanbanColumns`, `KanbanCardsHistory`, etc.). Como `KanbanCards` **não tem `accountId`**, o escopo de conta vem sempre via `JOIN "Kanbans" k ON ... WHERE k."accountId" = ${accountId} AND k."isDeleted" = false` + `kc."isDeleted" = false` (soft delete). Todos os relatórios do catálogo CRM têm **cache TTL de 900 s (15 min)**.

Fonte no front: `chatfunnel-front/src/views/reportsV2/tabs/FunilTab.vue`. Catálogo: `chatfunnel-core/src/reports/catalog/crm.catalog.ts`. Queries: `chatfunnel-core/src/repositories/reports/crm-reports.repository.ts`. Resumo (special handler): `chatfunnel-core/src/reports/handlers/crm-funnel-overview.handler.ts`. Informativos (ⓘ): `chatfunnel-front/src/views/reportsV2/info/reportInfo.ts`.

> **Nota sobre dinheiro (centavos):** o campo `KanbanCards.amount` é um `Int` cru (documentado em `revenueWonCard` como "a escala — centavos vs reais — é responsabilidade da formatação no front"). Os relatórios `crm.revenue`, `crm.revenue-card`, `crm.revenue-forecast` e os cards de receita/potencial do resumo emitem esses valores com `format: "currency"`. **Atenção divergência código × spec:** a função `formatMetricValue` em `utils/format.ts` formata `currency` via `Intl.NumberFormat("pt-BR", { currency: "BRL" })` **sem dividir por 100** — não existe nenhuma divisão `/100` em todo `views/reportsV2/`. Ou seja, o valor exibido hoje é o `amount` cru formatado como BRL. Se `amount` estiver de fato em centavos, o número exibido está inflado em 100×; se estiver em reais, está correto. Registrado como está no código, não como deveria ser.

---

### Leads no funil — `crm.funnel-overview` (card `Leads no funil`)
- **Gráfico:** `MetricCard` · shaper `metricCardShaper` (special handler `crmFunnelOverviewHandler`, agregado `funnelOverviewMetrics`)
- **Tipo de dado:** estado atual
- **O que é:** total de oportunidades abertas atualmente neste funil, independente do período (`funil.cards.leadsNoFunil`).
- **Fonte (tabelas/models Prisma):** `KanbanCards`, `Kanbans`
- **Cálculo:** `COUNT(*) FILTER (WHERE kc."statusOportunity" = 'OPEN')`. All-time, ignora o range de datas. Sem delta.
- **Query:** parte do `funnelOverviewMetrics` — varredura única de `KanbanCards JOIN Kanbans` com `k."accountId"` + soft delete + `pipelineFilter` opcional. Retorna `leads` (int).
- **Filtros aplicáveis:** `pipelineId` (opcional — ausente agrega todos os pipelines da conta). Datas ignoradas.
- **Cache TTL:** 900 s (special handler; TTL do orquestrador de reports)

> **Renderização no front:** dos 8 cards que o handler produz, o grid "Resumo do funil" do `FunilTab.vue` renderiza atualmente **apenas 3** (`FUNIL_OVERVIEW_CONFIG`): `Ganhos (período)`, `Perdidos (período)` e `Receita do funil (período)`. Os demais (Leads no funil, totais e potencial) são produzidos pelo backend mas não montados no grid. Documentados aqui por completude do dado.

### Ganhos (total) — `crm.funnel-overview` (card `Ganhos (total)`)
- **Gráfico:** `MetricCard` · shaper `metricCardShaper` — *(não renderizado no grid atual)*
- **Tipo de dado:** estado atual
- **O que é:** total acumulado de leads ganhos neste funil desde o início, sem filtro de data (`funil.cards.ganhoTotal`).
- **Fonte:** `KanbanCards`, `Kanbans`
- **Cálculo:** `COUNT(*) FILTER (WHERE kc."statusOportunity" = 'WON')`, all-time. Sem delta.
- **Query:** campo `wonTotal` do `funnelOverviewMetrics`.
- **Filtros aplicáveis:** `pipelineId` opcional. Datas ignoradas.
- **Cache TTL:** 900 s

### Leads ganhos (período) — `crm.funnel-overview` (card `Ganhos (período)`)
- **Gráfico:** `MetricCard` · shaper `metricCardShaper` · `neutral: true` (renderizado no grid, key `ganhos`)
- **Tipo de dado:** período
- **O que é:** leads marcados como ganhos neste funil no período, comparados ao período anterior (`funil.cards.ganhos`).
- **Fonte:** `KanbanCards`, `Kanbans`
- **Cálculo:** `won.current` = `COUNT(*) FILTER (WHERE statusOportunity = 'WON' AND statusOportunityUpdatedAt BETWEEN start AND end)`; `won.previous` = mesma contagem na janela anterior (`prevStart..prevEnd`, de mesma duração, terminando 1 ms antes de `start`). Delta = current vs previous.
- **Query:** campos `wonCurrent`/`wonPrevious` do `funnelOverviewMetrics`; recorte por `statusOportunityUpdatedAt`.
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `pipelineId` (opcional). Timezone via `normalizeRange`.
- **Cache TTL:** 900 s

### Perdidos (total) — `crm.funnel-overview` (card `Perdidos (total)`)
- **Gráfico:** `MetricCard` · shaper `metricCardShaper` — *(não renderizado no grid atual)*
- **Tipo de dado:** estado atual
- **O que é:** total acumulado de leads perdidos neste funil desde o início, sem filtro de data (`funil.cards.perdidoTotal`).
- **Fonte:** `KanbanCards`, `Kanbans`
- **Cálculo:** `COUNT(*) FILTER (WHERE statusOportunity = 'LOST')`, all-time. Sem delta.
- **Query:** campo `lostTotal` do `funnelOverviewMetrics`.
- **Filtros aplicáveis:** `pipelineId` opcional. Datas ignoradas.
- **Cache TTL:** 900 s

### Leads perdidos (período) — `crm.funnel-overview` (card `Perdidos (período)`)
- **Gráfico:** `MetricCard` · shaper `metricCardShaper` · `neutral: true`, `invertDelta: true` (renderizado no grid, key `perdidos`)
- **Tipo de dado:** período
- **O que é:** leads marcados como perdidos neste funil no período, comparados ao período anterior (`funil.cards.perdidos`). `invertDelta` pinta subida como negativa (perder mais é ruim).
- **Fonte:** `KanbanCards`, `Kanbans`
- **Cálculo:** `lost.current` = `COUNT(*) FILTER (WHERE statusOportunity = 'LOST' AND statusOportunityUpdatedAt BETWEEN start AND end)`; `lost.previous` na janela anterior de mesma duração. Delta = current vs previous (invertido na exibição).
- **Query:** campos `lostCurrent`/`lostPrevious` do `funnelOverviewMetrics`.
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `pipelineId` (opcional).
- **Cache TTL:** 900 s

### Receita do funil (total) — `crm.funnel-overview` (card `Receita do funil (total)`)
- **Gráfico:** `MetricCard` · shaper `metricCardShaper`, `format: "currency"` — *(não renderizado no grid atual)*
- **Tipo de dado:** estado atual
- **O que é:** receita acumulada de todos os leads ganhos neste funil desde o início, sem filtro de data (`funil.cards.receitaTotal`).
- **Fonte:** `KanbanCards`, `Kanbans`
- **Cálculo:** `SUM(kc."amount") FILTER (WHERE statusOportunity = 'WON')`, all-time. Valor `currency` — `amount` é `Int` cru (ver nota de centavos no topo). Sem delta.
- **Query:** campo `revenueWonTotal` do `funnelOverviewMetrics`.
- **Filtros aplicáveis:** `pipelineId` opcional. Datas ignoradas.
- **Cache TTL:** 900 s

### Receita do funil (período) — `crm.funnel-overview` (card `Receita do funil (período)`)
- **Gráfico:** `MetricCard` · shaper `metricCardShaper`, `format: "currency"` (renderizado no grid, key `receita`)
- **Tipo de dado:** período
- **O que é:** soma da receita dos leads ganhos neste funil no período, comparada ao período anterior (`funil.cards.receita`).
- **Fonte:** `KanbanCards`, `Kanbans`
- **Cálculo:** `revenue.current` = `SUM(amount) FILTER (WHERE statusOportunity = 'WON' AND statusOportunityUpdatedAt BETWEEN start AND end)`; `revenue.previous` na janela anterior. Delta = current vs previous. Valor em `currency` (`amount` `Int` cru — ver nota de centavos). O `FunilTab` marca `:empty="false"` para receita: `R$ 0,00` é métrica válida, não "sem dados".
- **Query:** campos `revenueCurrent`/`revenuePrevious` do `funnelOverviewMetrics`.
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `pipelineId` (opcional).
- **Cache TTL:** 900 s

### Potencial do funil (Em aberto) — `crm.funnel-overview` (card `Potencial do funil (Em aberto)`)
- **Gráfico:** `MetricCard` · shaper `metricCardShaper`, `format: "currency"` — *(não renderizado no grid atual)*
- **Tipo de dado:** estado atual
- **O que é:** soma da receita esperada dos leads ainda em aberto neste funil — teto de receita possível com as oportunidades ativas (`funil.cards.potencial`).
- **Fonte:** `KanbanCards`, `Kanbans`
- **Cálculo:** `SUM(kc."amount") FILTER (WHERE statusOportunity = 'OPEN')`, all-time. **Soma crua (não ponderada)** — difere do forecast (`crm.revenue-forecast`, que pondera por posição da coluna). Valor `currency`, `amount` `Int` cru. Sem delta.
- **Query:** campo `potentialTotal` do `funnelOverviewMetrics`.
- **Filtros aplicáveis:** `pipelineId` opcional. Datas ignoradas.
- **Cache TTL:** 900 s

---

### Conversão por etapa — `crm.funnel`
- **Gráfico:** `FunnelChart` (funil, alterna modo Absoluto/Relativo via `Tabs` `mode`) · shaper `funnel`
- **Tipo de dado:** período
- **O que é:** quantos leads avançam de uma etapa para a outra no período; em "Relativo" cada etapa mostra sua taxa de conversão (`funil.funnel`).
- **Fonte (tabelas/models Prisma):** `KanbanCardsHistory`, `KanbanColumns`, `Kanbans`
- **Cálculo:** funil **cumulativo por histórico**. Para cada card, deriva a **posição máxima** alcançada no período — CTE `card_reach`: `MAX(c2."position")` sobre `KanbanCardsHistory` (ações `CREATE`/`MOVE`, `columnId` = coluna de entrada; só colunas não-deletadas; `createdAt BETWEEN start AND end`). Cada coluna do pipeline conta os cards cuja `max_pos >= col."position"` → funil monotonicamente não-crescente (um card que chega numa etapa também conta em todas as anteriores). Lista todas as colunas ordenadas por `position`. O shaper `funnel` deriva as taxas de conversão relativas.
- **Query:** `$queryRaw` — `WITH card_reach AS (SELECT h."cardId", MAX(c2."position") AS max_pos FROM "KanbanCardsHistory" h JOIN "KanbanColumns" c2 ON c2."id"=h."columnId" AND c2."isDeleted"=false WHERE h."kanbanId"=${pipelineId} AND h."action" IN ('CREATE','MOVE') AND h."createdAt" BETWEEN ${start} AND ${end} GROUP BY h."cardId")` → `SELECT col."id" stageId, col."name", col."position", (SELECT COUNT(*) FROM card_reach cr WHERE cr.max_pos >= col."position") AS total FROM "KanbanColumns" col JOIN "Kanbans" k ... ORDER BY col."position" ASC`.
- **Filtros aplicáveis:** `initialDate`, `finalDate`, **`pipelineId` obrigatório** (lança `ValidationError` se ausente).
- **Cache TTL:** 900 s

### Motivos de perda — `crm.loss-reasons`
- **Gráfico:** `RankingDonut` (caption "perdas") · shaper `ranking`
- **Tipo de dado:** período
- **O que é:** ranking dos motivos registrados ao marcar leads como perdidos no período (`funil.lossReasons`).
- **Fonte (tabelas/models Prisma):** `KanbanCards`, `Kanbans`, `KanbanLossesReasons`
- **Cálculo:** conta cards `LOST` por motivo, no período (`statusOportunityUpdatedAt BETWEEN start AND end`). O `JOIN "KanbanLossesReasons"` já exclui cards sem motivo. Ordenado por contagem desc.
- **Query:** `SELECT lr."id", lr."name" AS label, COUNT(*)::int AS value FROM "KanbanCards" kc JOIN "Kanbans" k ... JOIN "KanbanLossesReasons" lr ON kc."lossReasonId"=lr."id" WHERE ... kc."statusOportunity"='LOST' AND kc."statusOportunityUpdatedAt" BETWEEN ${start} AND ${end} ${pipelineFilter} GROUP BY lr."id", lr."name" ORDER BY value DESC`.
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `pipelineId` (opcional).
- **Cache TTL:** 900 s

### Oportunidades paradas — `crm.aging`
- **Gráfico:** `AgingChart` · shaper `aging`
- **Tipo de dado:** estado atual (snapshot "as of now")
- **O que é:** distribuição das oportunidades abertas agora por tempo sem movimentação; ajuda a encontrar negócios esquecidos (`funil.aging`).
- **Fonte (tabelas/models Prisma):** `KanbanCards`, `Kanbans`, `KanbanCardsHistory`
- **Cálculo:** snapshot dos cards `OPEN`. "Dias na etapa atual" = `NOW()` − instante em que o card entrou na coluna atual (última `KanbanCardsHistory` `CREATE`/`MOVE` na `columnId` atual; fallback `KanbanCards.createdAt`). Distribui em 4 faixas fixas: **< 3 dias, 3–7 dias, 7–15 dias, > 15 dias** (sempre retorna as 4, mesmo com 0). Ignora período/timezone.
- **Query:** `WITH card_entry AS (SELECT COALESCE((SELECT MAX(h."createdAt") FROM "KanbanCardsHistory" h WHERE h."cardId"=kc."id" AND h."action" IN ('CREATE','MOVE') AND h."columnId"=kc."columnId"), kc."createdAt") AS entered_at FROM "KanbanCards" kc JOIN "Kanbans" k ... WHERE kc."statusOportunity"='OPEN' ${pipelineFilter}), ages AS (SELECT (NOW() - (entered_at AT TIME ZONE 'UTC')) AS age ...) SELECT COUNT(*) FILTER (WHERE age < interval '3 days') ... `.
- **Filtros aplicáveis:** `pipelineId` (opcional). Datas/timezone ignoradas.
- **Cache TTL:** 900 s

### Receita no tempo — `crm.revenue`
- **Gráfico:** `SegmentedTimeSeriesChart` (série temporal segmentada por status) · shaper `timeSeries`
- **Tipo de dado:** período
- **O que é:** evolução da receita dos negócios ao longo do período (`funil.crmRevenue`; informativo cita "negócios ganhos", mas a query segmenta por status).
- **Fonte (tabelas/models Prisma):** `KanbanCards`, `Kanbans`
- **Cálculo:** soma `amount` por `DATE_TRUNC(granularity, statusOportunityUpdatedAt)` (convertido para o timezone do usuário) **e** por `statusOportunity` (segmento → cada status vira uma série). Granularidade: `params.granularity ?? pickGranularity(start, end)`. Cards `OPEN` sem `statusOportunityUpdatedAt` ficam fora. Valor `currency` — `amount` `Int` cru (ver nota de centavos). O shaper `timeSeries` emite `SegmentedTimeSeries`.
- **Query:** `SELECT TO_CHAR(DATE_TRUNC(${granularity}, (kc."statusOportunityUpdatedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}), 'YYYY-MM-DD') AS date, kc."statusOportunity"::text AS segment, SUM(kc."amount")::float AS value FROM "KanbanCards" kc JOIN "Kanbans" k ... WHERE ... kc."statusOportunityUpdatedAt" BETWEEN ${start} AND ${end} ${pipelineFilter} GROUP BY 1,2 ORDER BY 1 ASC`.
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `granularity`, `pipelineId` (opcional). Timezone aplicado no `DATE_TRUNC`.
- **Cache TTL:** 900 s

### Velocidade de vendas — `crm.sales-velocity`
- **Gráfico:** `AgingChart` (reusa o componente de aging para exibir buckets) · shaper `aging`
- **Tipo de dado:** período
- **O que é:** distribuição do tempo entre a entrada do lead e o fechamento, para os negócios ganhos no período (`funil.salesVelocity`).
- **Fonte (tabelas/models Prisma):** `KanbanCards`, `Kanbans`
- **Cálculo:** cards `WON` fechados no período (`statusOportunityUpdatedAt BETWEEN start AND end`). Tempo de ciclo = `EXTRACT(EPOCH FROM (statusOportunityUpdatedAt - createdAt))/86400` (dias; diff de dois timestamps, não precisa de fuso). Distribui em 4 faixas: **< 1 dia, 1–7 dias, 7–30 dias, > 30 dias**.
- **Query:** `WITH won AS (SELECT EXTRACT(EPOCH FROM (kc."statusOportunityUpdatedAt" - kc."createdAt"))/86400 AS days FROM "KanbanCards" kc JOIN "Kanbans" k ... WHERE kc."statusOportunity"='WON' AND kc."statusOportunityUpdatedAt" BETWEEN ${start} AND ${end} ${pipelineFilter}) SELECT COUNT(*) FILTER (WHERE days < 1) b0, ... FROM won`.
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `pipelineId` (opcional).
- **Cache TTL:** 900 s

### Tempo médio por etapa — `crm.stage-time`
- **Gráfico:** `RankingList` (`value-format="days"`) · shaper `ranking`
- **Tipo de dado:** período
- **O que é:** tempo médio, em dias, que os leads permanecem em cada etapa do funil no período (`funil.stageTime`).
- **Fonte (tabelas/models Prisma):** `KanbanCardsHistory`, `KanbanColumns`, `Kanbans`
- **Cálculo:** CTE `ev` com `LEAD(h."createdAt") OVER (PARTITION BY h."cardId" ORDER BY h."createdAt")` sobre o histórico (`CREATE`/`MOVE`) → o `LEAD` dá o instante de saída de cada etapa. Média por coluna: `AVG(EXTRACT(EPOCH FROM (left_at - entered))/86400)` (dias). Filtro de período no `entered` (outer). Entradas sem saída (etapa atual, `left_at IS NULL`) não contam. Ordena por `col."position"` (ordem do funil).
- **Query:** `WITH ev AS (SELECT h."cardId", h."columnId", h."createdAt" AS entered, LEAD(h."createdAt") OVER (PARTITION BY h."cardId" ORDER BY h."createdAt") AS left_at FROM "KanbanCardsHistory" h JOIN "Kanbans" k ... WHERE h."action" IN ('CREATE','MOVE') ${pipelineFilter}) SELECT col."id", col."name" AS label, AVG(...)::float AS value FROM ev JOIN "KanbanColumns" col ON ev."columnId"=col."id" WHERE ev.left_at IS NOT NULL AND ev.entered BETWEEN ${start} AND ${end} GROUP BY col."id", col."name", col."position" ORDER BY col."position" ASC`. (Note: `pipelineFilter` aqui usa `h."kanbanId"`.)
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `pipelineId` (opcional).
- **Cache TTL:** 900 s

### Performance por vendedor — `crm.performance-by-seller`
- **Gráfico:** `ComparisonTable` (colunas: Receita `currency`, Ganhos `number`, Perdidos `number`, Taxa de ganho `percentage`; `first-column-label="Vendedor"`) · shaper `ranking` (`won`/`lost`/`winRate` em `meta`)
- **Tipo de dado:** período
- **O que é:** comparativo por vendedor (moderador): receita, ganhos, perdas e taxa de ganho no período (`funil.performanceBySeller`).
- **Fonte (tabelas/models Prisma):** `KanbanCardsModerators`, `KanbanCards`, `Kanbans`, `Users`
- **Cálculo:** considera apenas cards fechados (`WON`/`LOST`) no período (`statusOportunityUpdatedAt BETWEEN start AND end`). `value` (Receita) = `SUM(amount) FILTER (WHERE WON)` — valor `currency`, `amount` `Int` cru (ver nota de centavos). `meta.won` = `COUNT FILTER (WON)`; `meta.lost` = `COUNT FILTER (LOST)`; `meta.winRate` = `won / NULLIF(won+lost, 0)` (fração 0..1). Escopo de conta via `JOIN Kanbans`; nome via `JOIN Users`. Ordena por receita desc. No front, `winRate` (0..1) vira percentual com 1 casa: `Math.round(winRate*1000)/10`.
- **Query:** `SELECT u."id", u."name" AS label, COALESCE(SUM(kc."amount") FILTER (WHERE WON),0)::float AS value, json_build_object('won', COUNT FILTER(WON), 'lost', COUNT FILTER(LOST), 'winRate', COUNT FILTER(WON)::float / NULLIF(COUNT FILTER(WON|LOST),0)) AS meta FROM "KanbanCardsModerators" km JOIN "KanbanCards" kc ON km."kanbanCardId"=kc."id" JOIN "Kanbans" k ... JOIN "Users" u ON km."userId"=u."id" WHERE ... kc."statusOportunity" IN ('WON','LOST') AND kc."statusOportunityUpdatedAt" BETWEEN ${start} AND ${end} ${pipelineFilter} GROUP BY u."id", u."name" ORDER BY value DESC`.
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `pipelineId` (opcional).
- **Cache TTL:** 900 s

### Previsão de receita — `crm.revenue-forecast` *(implementado, comentado no template atual)*
- **Gráfico:** `ReportSection` + `MetricCard` — **atualmente comentado** no `FunilTab.vue` ("Forecast POR PIPELINE"), mas o report existe no catálogo e é consultado (`crmForecast = useReportQuery(...getRevenueForecast)`) · shaper `metricCard`, `format: "currency"`
- **Tipo de dado:** estado atual (snapshot, sem delta)
- **O que é:** previsão de receita do pipeline aberto, ponderada pela posição da etapa. Herda o `pipelineId` selecionado na barra de filtros.
- **Fonte (tabelas/models Prisma):** `KanbanCards`, `Kanbans`, `KanbanColumns`
- **Cálculo:** snapshot dos cards `OPEN`: `SUM(amount × peso)`, com `peso = (position + 1) / total_colunas` (heurística monotônica em (0,1]; etapas mais avançadas pesam mais). `total_cols` via window `COUNT(*) OVER (PARTITION BY col."kanbanId")`. Ignora período. Valor `currency`, `amount` `Int` cru (ver nota de centavos). Sem delta (não há período anterior). Difere do "Potencial do funil" do resumo, que soma `amount` cru sem ponderar.
- **Query:** `WITH cols AS (SELECT col."id", col."position", COUNT(*) OVER (PARTITION BY col."kanbanId") AS total_cols FROM "KanbanColumns" col JOIN "Kanbans" k ... WHERE ... ${colPipelineFilter}) SELECT COALESCE(SUM(kc."amount" * ((c."position"::float+1)/c.total_cols)),0)::float AS value FROM "KanbanCards" kc JOIN "Kanbans" k ... JOIN cols c ON kc."columnId"=c."id" WHERE ... kc."statusOportunity"='OPEN' ${pipelineFilter}`.
- **Filtros aplicáveis:** `pipelineId` (opcional). Datas ignoradas.
- **Cache TTL:** 900 s

---

**Observações gerais de filtros (`ReportParams`):** `initialDate`/`finalDate` são normalizados por `normalizeRange(initialDate, finalDate, timezone)`; a janela anterior para deltas é de mesma duração terminando 1 ms antes de `start`. `pipelineId` é opcional em todos os relatórios do CRM **exceto `crm.funnel`** (obrigatório, lança `ValidationError`). Relatórios de estado atual (`crm.aging`, `crm.revenue-forecast`, e os cards "total"/"potencial" do resumo) ignoram o range de datas.
## Aba Contatos

A aba **Contatos** do Reports V2 analisa a base de leads: como entram (origem, canal, UTM), como estão distribuídos (tags, campos personalizados) e o estado atual de engajamento (inatividade). Cada seção é renderizada por `ContatosTab.vue`, consome um endpoint do `ReportsV2Service`, é resolvida por um `ReportConfig` do `contacts.catalog.ts` e executa uma query `$queryRaw` (account-scoped) em `contacts-reports.repository.ts`. Todas as queries filtram `Contacts.isDeleted = false` e escopam por `accountId`; a maioria também aceita filtro opcional de canal e UTM.

> **Observação:** o catálogo (`contacts.catalog.ts`) define ainda `contacts.growth` (R08, timeSeries) e `contacts.peak-hours` (R11, heatmap), mas **essas duas seções não são renderizadas em `ContatosTab.vue`** — não têm gráfico na aba. Só as 8 seções abaixo aparecem na tela.

---

### Novos contatos por origem — `contacts.growth-by-source`
- **Gráfico:** `SegmentedTimeSeriesChart.vue` (série temporal empilhada por segmento, ECharts) · shaper `timeSeries`
- **Tipo de dado:** período
- **O que é:** evolução da entrada de novos contatos ao longo do período, separada por origem (UTM source). Contatos sem UTM caem no segmento `direct`.
- **Fonte (tabelas/models Prisma):** `Contacts`
- **Cálculo:** conta contatos criados no período (`dateCreated BETWEEN start AND end`), agrupados por bucket de tempo (dia/semana/mês, granularidade auto via `pickGranularity` se não informada) e por segmento de origem. O segmento é `COALESCE(NULLIF(utmSource, ''), 'direct')` — vazio/nulo vira `direct`. `dateCreated` é naive UTC: interpretado como `AT TIME ZONE 'UTC'` e convertido para o timezone da conta antes de bucketizar. A soma dos segmentos = total de novos contatos.
- **Query:**
  ```sql
  SELECT
    TO_CHAR(DATE_TRUNC(<granularity>, (dateCreated AT TIME ZONE 'UTC') AT TIME ZONE <tz>), 'YYYY-MM-DD') AS date,
    COALESCE(NULLIF("Contacts"."utmSource", ''), 'direct') AS segment,
    COUNT(*)::int AS value
  FROM "Contacts"
  WHERE accountId = <acc> AND isDeleted = false
    AND dateCreated BETWEEN <start> AND <end>
    <utmFilter> <channelFilter>
  GROUP BY 1, 2 ORDER BY 1 ASC
  ```
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `granularity`, `channelId` (EXISTS em `ContactsChannels`), `utmSource`/`utmMedium`/`utmCampaign` (igualdade exata, opcionais).
- **Cache TTL:** 900s

---

### Entrada de leads por origem — `contacts.by-channel`
- **Gráfico:** `ChannelDonut.vue` (donut, ECharts, layout `vertical`) · shaper `ranking`
- **Tipo de dado:** período
- **O que é:** distribuição dos contatos que entraram no período por canal/plataforma de origem.
- **Fonte (tabelas/models Prisma):** `Contacts`
- **Cálculo:** agrupa por `Contacts.fromPlatform` — a plataforma pela qual o lead entrou (uma por contato, a fonte real de aquisição). Usa `fromPlatform` em vez de `ContactsChannels → Channels` de propósito: um contato pode estar em vários canais e o join contaria o mesmo contato mais de uma vez. Conta contatos criados no período.
- **Query:**
  ```sql
  SELECT "fromPlatform"::text AS id, "fromPlatform"::text AS label, COUNT(*)::int AS value
  FROM "Contacts"
  WHERE accountId = <acc> AND dateCreated BETWEEN <start> AND <end> AND isDeleted = false
    <utmFilter> <channelFilter>
  GROUP BY 1 ORDER BY value DESC
  ```
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `channelId`, `utmSource`/`utmMedium`/`utmCampaign`.
- **Cache TTL:** 900s

---

### Distribuição por tags — `contacts.by-tag`
- **Gráfico:** `RankingList.vue` (lista de ranking com barras) · shaper `ranking`
- **Tipo de dado:** período
- **O que é:** ranking das tags aplicadas aos contatos que entraram no período.
- **Fonte (tabelas/models Prisma):** `Tags`, `TagsContacts`, `Contacts`
- **Cálculo:** `COUNT(DISTINCT contactId)` por tag. Account-scope pela própria tag (`Tags.accountId` — `TagsContacts` não tem accountId). Só contatos não deletados criados no período. INNER JOIN: tags sem contatos no período não aparecem (esperado num ranking de uso).
- **Query:**
  ```sql
  SELECT t."id" AS id, t."name" AS label, COUNT(DISTINCT c."id")::int AS value
  FROM "Tags" t
  JOIN "TagsContacts" tc ON tc."tagId" = t."id"
  JOIN "Contacts" c ON c."id" = tc."contactId"
  WHERE t."accountId" = <acc> AND c."isDeleted" = false
    AND c."dateCreated" BETWEEN <start> AND <end>
    <channelFilter>
  GROUP BY t."id", t."name" ORDER BY value DESC
  ```
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `channelId`. (Não aplica filtro UTM.)
- **Cache TTL:** 900s

---

### Origem UTM — source — `contacts.utm-source`
- **Gráfico:** `RankingList.vue` · shaper `ranking`
- **Tipo de dado:** período
- **O que é:** ranking dos contatos do período pela UTM source de origem (efetividade das fontes de campanha).
- **Fonte (tabelas/models Prisma):** `Contacts`
- **Cálculo:** conta contatos criados no período com `utmSource` preenchida (`IS NOT NULL AND <> ''` — só origens atribuídas), agrupados por valor. A dimensão (`source`) é fixada no catálogo (whitelist), então a coluna entra como fragmento SQL literal sem risco de injeção.
- **Query:**
  ```sql
  SELECT "utmSource" AS id, "utmSource" AS label, COUNT(*)::int AS value
  FROM "Contacts"
  WHERE accountId = <acc> AND isDeleted = false
    AND dateCreated BETWEEN <start> AND <end>
    AND "utmSource" IS NOT NULL AND "utmSource" <> ''
    <channelFilter>
  GROUP BY 1 ORDER BY value DESC
  ```
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `channelId`. (O próprio dado é a coluna UTM; não recebe filtro UTM adicional.)
- **Cache TTL:** 900s

---

### Origem UTM — medium — `contacts.utm-medium`
- **Gráfico:** `RankingList.vue` · shaper `ranking`
- **Tipo de dado:** período
- **O que é:** ranking dos contatos do período pela UTM medium de origem.
- **Fonte (tabelas/models Prisma):** `Contacts`
- **Cálculo:** idêntico a `utm-source`, mas sobre a coluna `Contacts.utmMedium` (dimensão `medium` fixada no catálogo). Conta contatos criados no período com `utmMedium` preenchida.
- **Query:** mesma estrutura de `utm-source`, com `"utmMedium"` no lugar de `"utmSource"`.
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `channelId`.
- **Cache TTL:** 900s

---

### Origem UTM — campaign — `contacts.utm-campaign`
- **Gráfico:** `RankingList.vue` · shaper `ranking`
- **Tipo de dado:** período
- **O que é:** ranking dos contatos do período pela UTM campaign de origem.
- **Fonte (tabelas/models Prisma):** `Contacts`
- **Cálculo:** idêntico a `utm-source`, mas sobre a coluna `Contacts.utmCampaign` (dimensão `campaign` fixada no catálogo). Conta contatos criados no período com `utmCampaign` preenchida.
- **Query:** mesma estrutura de `utm-source`, com `"utmCampaign"` no lugar de `"utmSource"`.
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `channelId`.
- **Cache TTL:** 900s

---

### Contatos inativos — `contacts.inactivity`
- **Gráfico:** `AgingChart.vue` (faixas de aging) · shaper `aging`
- **Tipo de dado:** estado atual (snapshot da base **agora**, ignora o filtro de período)
- **O que é:** distribuição da base de contatos agora por tempo sem interação. Mostra o estado atual, não o período.
- **Fonte (tabelas/models Prisma):** `Contacts`
- **Cálculo:** inatividade = `NOW() − COALESCE(lastUpdate, dateCreated)`, onde `lastUpdate` é a última atividade (fallback para `dateCreated` quando nulo). Timestamps naive UTC são convertidos com `AT TIME ZONE 'UTC'` antes de subtrair de `NOW()` (mesmo padrão do aging de CRM R06). Um único `WITH ages` calcula a idade e a query final faz `COUNT(*) FILTER (WHERE ...)` em 6 faixas: `<7`, `7–15`, `15–30`, `30–60`, `60–90`, `90+` dias. Só contatos não deletados. **Período e timezone são ignorados** (snapshot); apenas o filtro de canal se aplica.
- **Query:**
  ```sql
  WITH ages AS (
    SELECT (NOW() - (COALESCE("lastUpdate", "dateCreated") AT TIME ZONE 'UTC')) AS age
    FROM "Contacts"
    WHERE accountId = <acc> AND isDeleted = false <channelFilter>
  )
  SELECT
    COUNT(*) FILTER (WHERE age <  interval '7 days')::int AS b0,
    COUNT(*) FILTER (WHERE age >= interval '7 days'  AND age < interval '15 days')::int AS b1,
    ... (15–30, 30–60, 60–90) ...
    COUNT(*) FILTER (WHERE age >= interval '90 days')::int AS b5
  FROM ages
  ```
  As 6 colunas viram as `AgingRow` (`label`, `rangeMin`, `rangeMax`, `count`).
- **Filtros aplicáveis:** `channelId` apenas. Ignora `initialDate`/`finalDate`/`granularity`/UTM.
- **Cache TTL:** 900s

---

### Campos personalizados — `contacts.by-custom-field`
- **Gráfico:** `RankingList.vue`, com seletor `InputCustomFields` no slot de ações da seção · shaper `ranking`
- **Tipo de dado:** período
- **O que é:** distribuição dos valores mais frequentes de **um** campo personalizado escolhido, entre os contatos que entraram no período.
- **Fonte (tabelas/models Prisma):** `CustomFieldsContacts`, `Contacts`
- **Cálculo:** `customFieldId` é **obrigatório** — o repository lança `ValidationError` se ausente (mesma regra do funil com `pipelineId`). `CustomFieldsContacts` não tem `accountId`, então o escopo é feito via JOIN em `Contacts` (`contactId → Contacts.accountId`). Conta contatos não deletados criados no período, com valor do campo preenchido (`IS NOT NULL AND <> ''`), agrupando por `value`. No front (`useCustomFields.ts`): a lista de campos vem de `AccountsService.listAccountCustomField`, filtrando fora campos de sistema (UUID com prefixo `00000000-0000-0000-0000-`); o primeiro campo válido é auto-selecionado. A query só dispara com um campo selecionado — sem campos cadastrados a seção cai no estado vazio, nunca dispara 400 por `customFieldId` ausente.
- **Query:**
  ```sql
  SELECT cfc."value" AS id, cfc."value" AS label, COUNT(*)::int AS value
  FROM "CustomFieldsContacts" cfc
  JOIN "Contacts" c ON c."id" = cfc."contactId"
  WHERE cfc."customFieldId" = <customFieldId> AND c."accountId" = <acc>
    AND c."isDeleted" = false AND c."dateCreated" BETWEEN <start> AND <end>
    AND cfc."value" IS NOT NULL AND cfc."value" <> ''
    <channelFilter>
  GROUP BY cfc."value" ORDER BY value DESC
  ```
- **Filtros aplicáveis:** `customFieldId` (**obrigatório**, senão `ValidationError`), `initialDate`, `finalDate`, `channelId`.
- **Cache TTL:** 900s
## Aba Mensagens

A aba **Mensagens** do Reports V2 mede o atendimento conversacional: quanto se troca de mensagens (e por qual origem), quão rápido a conta responde, o fluxo de conversas abertas/fechadas e o funil de entrega das mensagens enviadas. Todas as métricas são account-scoped via JOIN em `Contacts` (a tabela `Messages` não tem `accountId` e `channelId` é nullable), consideram apenas `isDeleted = false` e `contabilableOnMetrics = true`, e aceitam filtro opcional por canal (`channelId`). Origem da mensagem é sempre `Messages.from` ∈ {CONTACT, BOT, ASSISTANT, HUMAN}.

O componente `MensagensTab.vue` renderiza **4 seções** (volume, tempo de resposta, conversas ativas, status de entrega). Recarrega tudo em `onMounted` e sempre que `initialDate`, `finalDate` ou `channelId` mudam. Os reports `messages.workload` (R18) e `messages.service-hours` (R20) existem no catálogo mas são consumidos na aba Colaboradores, não aqui.

### Volume de mensagens — `messages.volume`
- **Gráfico:** `SegmentedTimeSeriesChart` (série temporal empilhada por origem) · shaper `timeSeries`
- **Tipo de dado:** período
- **O que é:** "Evolução do volume de mensagens no período, separado por origem (contato, bot, IA, humano)." (info-key `mensagens.volume`)
- **Fonte (tabelas/models Prisma):** `Messages` (JOIN `Contacts` para o escopo de conta)
- **Cálculo:** conta mensagens (`COUNT(*)`) agrupadas por bucket de tempo × origem. O bucket vem de `DATE_TRUNC(<granularity>, createdAt convertido ao timezone)`; a granularidade é `params.granularity` ou inferida do range por `pickGranularity`. A coluna `segment` = `Messages.from::text` (CONTACT/BOT/ASSISTANT/HUMAN) — é isso que separa a origem. O shaper `timeSeries`, ao detectar `segment` nas rows, emite um `SegmentedTimeSeries` (uma série por origem).
- **Query:** `$queryRaw` em `volumeTimeSeries`.
  ```sql
  SELECT
    TO_CHAR(DATE_TRUNC(:gran, (m."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE :tz), 'YYYY-MM-DD') AS date,
    m."from"::text AS segment,
    COUNT(*)::int AS value
  FROM "Messages" m
  JOIN "Contacts" c ON c."id" = m."contactId"
  WHERE c."accountId" = :accountId
    AND m."isDeleted" = false
    AND m."contabilableOnMetrics" = true
    AND m."createdAt" BETWEEN :start AND :end
    [AND m."channelId" = :channelId]
  GROUP BY 1, 2
  ORDER BY 1 ASC
  ```
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `granularity` (opcional, senão auto), `channelId` (opcional). Sem uso de `moderatorId`.
- **Cache TTL:** 900s

### Tempo de resposta — `messages.response-time`
- **Gráfico:** três `MetricCard` (Média / Mediana / Conversas avaliadas) + `AgingChart` para a distribuição por faixa · handler especial `responseTimeHandler` (não usa shaper genérico)
- **Tipo de dado:** período
- **O que é:** "Tempo entre a mensagem do contato e a primeira resposta, com média, mediana e distribuição no período." (info-key `mensagens.responseTime`)
- **Fonte (tabelas/models Prisma):** `Messages` (JOIN `Contacts` para o escopo de conta)
- **Cálculo:** a query ordena as mensagens de cada contato por `createdAt` (`PARTITION BY contactId`). Um **evento de resposta** é uma mensagem cujo `from <> 'CONTACT'` e cujo predecessor imediato (`LAG`) tem `from = 'CONTACT'` — ou seja, a primeira resposta do operador (BOT/ASSISTANT/HUMAN, indistintamente) após uma mensagem do contato. O gap em segundos é `EXTRACT(EPOCH FROM (ts − prev_ts))`. Sobre esses gaps a query calcula, no próprio Postgres: média (`AVG`), mediana (`percentile_cont(0.5)`), p95 (`percentile_cont(0.95)`), contagem total e a contagem por faixa via `COUNT(*) FILTER`. O handler `responseTimeHandler` pega essa única linha agregada e monta `ResponseTimeMetrics` = `{ averageSeconds, medianSeconds, p95Seconds, count, distribution[] }`, rotulando as faixas: `< 5 min` [0,300), `5–15 min` [300,900), `15–30 min` [900,1800), `30–60 min` [1800,3600), `> 1h` [3600,∞). Valores em **segundos**. Os cards no front consomem average/median/count; o `AgingChart` consome `distribution` (label + count).
- **Query:** `$queryRaw` em `responseTimeAgg`.
  ```sql
  WITH ordered AS (
    SELECT m."from"::text AS frm, m."createdAt" AS ts,
           LAG(m."from"::text)  OVER w AS prev_from,
           LAG(m."createdAt")   OVER w AS prev_ts
    FROM "Messages" m
    JOIN "Contacts" c ON c."id" = m."contactId"
    WHERE c."accountId" = :accountId
      AND m."isDeleted" = false AND m."contabilableOnMetrics" = true
      AND m."createdAt" BETWEEN :start AND :end
      [AND m."channelId" = :channelId]
    WINDOW w AS (PARTITION BY m."contactId" ORDER BY m."createdAt")
  ),
  resp AS (
    SELECT EXTRACT(EPOCH FROM (ts - prev_ts)) AS secs
    FROM ordered
    WHERE prev_from = 'CONTACT' AND frm <> 'CONTACT'
  )
  SELECT
    COALESCE(AVG(secs),0)::float AS "avgSeconds",
    COALESCE(percentile_cont(0.5)  WITHIN GROUP (ORDER BY secs),0)::float AS "medianSeconds",
    COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY secs),0)::float AS "p95Seconds",
    COUNT(*)::int AS "count",
    COUNT(*) FILTER (WHERE secs <  300)::int AS b0,
    COUNT(*) FILTER (WHERE secs >= 300  AND secs < 900)::int  AS b1,
    COUNT(*) FILTER (WHERE secs >= 900  AND secs < 1800)::int AS b2,
    COUNT(*) FILTER (WHERE secs >= 1800 AND secs < 3600)::int AS b3,
    COUNT(*) FILTER (WHERE secs >= 3600)::int AS b4
  FROM resp
  ```
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `channelId` (opcional). Sem `moderatorId` (operador = qualquer não-CONTACT, não segmenta por moderador).
- **Cache TTL:** não definido no catálogo (report especial via handler; o TTL genérico do catálogo não se aplica a este id).

### Conversas ativas — `messages.conversations`
- **Gráfico:** `SegmentedTimeSeriesChart` (duas séries: abertas × fechadas) · shaper `timeSeries`
- **Tipo de dado:** período
- **O que é:** "Evolução de conversas abertas e fechadas ao longo do período." (info-key `mensagens.conversations`)
- **Fonte (tabelas/models Prisma):** `Conversations` (JOIN `Contacts` para o escopo de conta — `Conversations` não tem `accountId`)
- **Cálculo:** duas CTEs unidas por `UNION ALL`. **`opened`** conta conversas por `DATE_TRUNC(<granularity>, createdAt)` — data de criação da conversa; segment fixo `'opened'`. **`closed`** conta conversas por `DATE_TRUNC(<granularity>, finishedAt)`, filtrando `finished = true AND finishedAt IS NOT NULL`; segment fixo `'closed'`. Note que o critério de janela de tempo difere por série: aberta usa `createdAt BETWEEN start/end`, fechada usa `finishedAt BETWEEN start/end`. O shaper `timeSeries` emite `SegmentedTimeSeries` com as duas séries.
- **Query:** `$queryRaw` em `conversationsTimeSeries`.
  ```sql
  WITH opened AS (
    SELECT TO_CHAR(DATE_TRUNC(:gran, (conv."createdAt" ... AT TIME ZONE :tz)), 'YYYY-MM-DD') AS date,
           'opened' AS segment, COUNT(*)::int AS value
    FROM "Conversations" conv JOIN "Contacts" c ON c."id" = conv."contactId"
    WHERE c."accountId" = :accountId
      AND conv."createdAt" BETWEEN :start AND :end
      [AND conv."channelId" = :channelId]
    GROUP BY 1
  ),
  closed AS (
    SELECT TO_CHAR(DATE_TRUNC(:gran, (conv."finishedAt" ... AT TIME ZONE :tz)), 'YYYY-MM-DD') AS date,
           'closed' AS segment, COUNT(*)::int AS value
    FROM "Conversations" conv JOIN "Contacts" c ON c."id" = conv."contactId"
    WHERE c."accountId" = :accountId
      AND conv."finished" = true AND conv."finishedAt" IS NOT NULL
      AND conv."finishedAt" BETWEEN :start AND :end
      [AND conv."channelId" = :channelId]
    GROUP BY 1
  )
  SELECT * FROM opened UNION ALL SELECT * FROM closed ORDER BY date ASC
  ```
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `granularity` (opcional), `channelId` (opcional, casa em `Conversations.channelId`). Sem `moderatorId`.
- **Cache TTL:** 900s

### Status de entrega — `messages.delivery-status`
- **Gráfico:** `FunnelChart` (funil de 3 estágios) · shaper `funnel`
- **Tipo de dado:** período
- **O que é:** "Funil de entrega das mensagens enviadas no período: enviadas, entregues e lidas." (info-key `mensagens.deliveryStatus`)
- **Fonte (tabelas/models Prisma):** `Messages` (JOIN `Contacts` para o escopo de conta)
- **Cálculo:** considera apenas mensagens **enviadas pela conta** (`from <> 'CONTACT'`) no período. Três contagens por presença de timestamp: `sent` = `sentAt IS NOT NULL`, `delivered` = `deliveredAt IS NOT NULL`, `read` = `readAt IS NOT NULL`. Como os timestamps são monotônicos (read ⊆ delivered ⊆ sent), formam um funil natural. O repositório já monta os estágios ordenados (`sent`→`delivered`→`read`) com `stageId`/`name`/`position`/`total`; o shaper `funnel` calcula as taxas de conversão entre estágios.
- **Query:** `$queryRaw` em `deliveryStatusFunnel`.
  ```sql
  SELECT
    COUNT(*) FILTER (WHERE m."sentAt"      IS NOT NULL)::int AS sent,
    COUNT(*) FILTER (WHERE m."deliveredAt" IS NOT NULL)::int AS delivered,
    COUNT(*) FILTER (WHERE m."readAt"      IS NOT NULL)::int AS "read"
  FROM "Messages" m
  JOIN "Contacts" c ON c."id" = m."contactId"
  WHERE c."accountId" = :accountId
    AND m."from"::text <> 'CONTACT'
    AND m."isDeleted" = false
    AND m."contabilableOnMetrics" = true
    AND m."createdAt" BETWEEN :start AND :end
    [AND m."channelId" = :channelId]
  ```
  Resultado mapeado para: `[{sent→"Enviadas",pos0}, {delivered→"Entregues",pos1}, {read→"Lidas",pos2}]`.
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `channelId` (opcional). Sem `moderatorId`.
- **Cache TTL:** 900s
## Aba Colaboradores

A aba **Colaboradores** cruza o desempenho dos agentes de IA com o dos atendentes humanos: eficiência da IA (duração de sessão + horas economizadas), volume de mensagens humano vs IA, resolução, satisfação, custo dos modelos e a carga/horários dos operadores humanos. Os relatórios de agentes vêm do domínio **agents-v2** (`AgentsReportsRepository`, catálogo `agents.catalog.ts`); os relatórios de operadores humanos (carga, horários) vêm do domínio **messages** (`MessagesReportsRepository`); e "Horas economizadas" vem do domínio **intelligence** (`IntelligenceReportsRepository`). Todos filtram por `accountId` (multi-tenancy), respeitam soft-delete e usam janela de datas `initialDate`/`finalDate` normalizada por timezone.

> **Nota de implementação (estado atual do template):** dos 9 gráficos abaixo, apenas **Eficiência da IA** (2 cards), **Humano vs IA**, **Carga por atendente** e **Horários de atendimento** estão renderizados no `ColaboradoresTab.vue`. As seções **Uso de agentes IA**, **Taxa de resolução**, **Satisfação**, **Custo de IA por modelo** e **Custo de IA no tempo** estão implementadas ponta-a-ponta (catálogo + repository + shaper + query no `<script setup>`), mas comentadas no `<template>`. `reloadAll()` só dispara `avgDuration`, `hoursSaved`, `humanVsAi`, `workload` e `serviceHours`. Documentamos as 9 por completude, marcando o status.

---

### Duração média de sessão de IA — `agents.avg-session-duration`
- **Gráfico:** `MetricCard` (label "Duração média de sessão", dentro da seção "Eficiência da IA") · shaper `metricCard`
- **Tipo de dado:** período (com comparação à janela anterior)
- **O que é:** duração média das sessões de IA no período. Faz parte do informativo `colaboradores.aiEfficiency` ("Duração média das sessões de IA e estimativa de horas de atendimento economizadas no período").
- **Fonte (tabelas/models Prisma):** `AgentSessionOutcomes` (campos `startedAt`, `endedAt`, `createdAt`, `agentId`) · JOIN `Agents` (para `accountId` e soft-delete).
- **Cálculo:** `AVG(EXTRACT(EPOCH FROM (endedAt − startedAt)))` em **segundos**, dentro da janela atual. Calcula também a média da janela anterior (mesma duração, imediatamente antes) via `FILTER`, retornada como `previousValue` para o delta. `COALESCE(..., 0)` evita null. O shaper `metricCard` só empacota `{ value, previousValue, format: "duration" }` — o front formata como duração.
- **Query:** `$queryRaw` sobre `AgentSessionOutcomes o JOIN Agents a`. Resumo:
  ```sql
  SELECT
    COALESCE(AVG(EXTRACT(EPOCH FROM (o."endedAt" - o."startedAt")))
      FILTER (WHERE o."createdAt" BETWEEN :start AND :end), 0)::float AS current,
    COALESCE(AVG(EXTRACT(EPOCH FROM (o."endedAt" - o."startedAt")))
      FILTER (WHERE o."createdAt" BETWEEN :prevStart AND :prevEnd), 0)::float AS previous
  FROM "AgentSessionOutcomes" o
  JOIN "Agents" a ON a."id" = o."agentId"
  WHERE a."accountId" = :accountId AND a."isDeleted" = false
    AND o."createdAt" BETWEEN :prevStart AND :end
  ```
- **Filtros aplicáveis:** `initialDate`, `finalDate` (janela + janela anterior derivada). Não usa `channelId` nem `moderatorId`.
- **Cache TTL:** 900 s (15 min)

---

### Horas economizadas pela IA — `intelligence.ai-hours-saved`
- **Gráfico:** `MetricCard` (label "Horas economizadas", note "Estimativa · horas no período", dentro da seção "Eficiência da IA") · shaper `metricCard`
- **Tipo de dado:** período (com comparação à janela anterior)
- **O que é:** estimativa de horas de atendimento humano poupadas pela IA no período. Parte do informativo `colaboradores.aiEfficiency`.
- **Fonte (tabelas/models Prisma):** `Messages` (campos `from`, `createdAt`, `isDeleted`, `contabilableOnMetrics`, `contactId`) · JOIN `Contacts` (para `accountId`).
- **Cálculo:** conta as mensagens geradas por IA (`from IN ('ASSISTANT','BOT')`) na janela atual e na anterior, depois converte: `mensagens × 2 min / 60` = horas. A premissa é a constante `MINUTES_SAVED_PER_AI_MESSAGE = 2` (2 minutos de trabalho humano economizados por mensagem de IA) — estimativa documentada no repository, a refinar/tornar configurável. `previousValue` = mesma conta na janela anterior (delta). `format: "number"`.
- **Query:** `$queryRaw` sobre `Messages m JOIN Contacts c`, com dois `COUNT(*) FILTER (...)` (atual e anterior). Resumo:
  ```sql
  SELECT
    COUNT(*) FILTER (WHERE m."createdAt" BETWEEN :start AND :end)::int AS current,
    COUNT(*) FILTER (WHERE m."createdAt" BETWEEN :prevStart AND :prevEnd)::int AS previous
  FROM "Messages" m
  JOIN "Contacts" c ON c."id" = m."contactId"
  WHERE c."accountId" = :accountId AND m."isDeleted" = false
    AND m."contabilableOnMetrics" = true
    AND m."from" IN ('ASSISTANT','BOT')
    AND m."createdAt" BETWEEN :prevStart AND :end
  ```
  Conversão em JS: `(count * 2) / 60`.
- **Filtros aplicáveis:** `initialDate`, `finalDate` (janela + anterior). Não usa `channelId` nem `moderatorId`. (Este mesmo relatório também alimenta o card "Horas economizadas pela IA" na aba Geral e no Dashboard.)
- **Cache TTL:** 900 s (15 min)

---

### Uso de agentes IA — `agents.usage`  *(implementado; comentado no template)*
- **Gráfico:** `BarSeriesChart` (ECharts, label "Sessões") · shaper `timeSeries`
- **Tipo de dado:** período
- **O que é:** evolução do número de sessões atendidas por agentes de IA no período (`colaboradores.usage`).
- **Fonte (tabelas/models Prisma):** `AgentSessions` (campos `createdAt`, `agentId`) · JOIN `Agents` (para `accountId` e soft-delete).
- **Cálculo:** `COUNT(*)` de sessões por bucket temporal. A granularidade (`day`/`week`/`month`) vem de `params.granularity` ou é escolhida automaticamente por `pickGranularity(start, end)`. Data agrupada por `DATE_TRUNC(granularity, createdAt AT TIME ZONE tz)` e formatada `YYYY-MM-DD`. O shaper `timeSeries` monta `{ series: [{ date, value }] }`.
- **Query:**
  ```sql
  SELECT TO_CHAR(DATE_TRUNC(:granularity, (s."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE :tz),'YYYY-MM-DD') AS date,
         COUNT(*)::int AS value
  FROM "AgentSessions" s
  JOIN "Agents" a ON a."id" = s."agentId"
  WHERE a."accountId" = :accountId AND a."isDeleted" = false
    AND s."createdAt" BETWEEN :start AND :end
  GROUP BY 1 ORDER BY 1 ASC
  ```
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `granularity`. Não usa `channelId` nem `moderatorId`.
- **Cache TTL:** 900 s (15 min)

---

### Taxa de resolução — `agents.resolution`  *(implementado; comentado no template)*
- **Gráfico:** `RankingList` + label "% resolvidas" no header (taxa calculada no front) · shaper `ranking`
- **Tipo de dado:** período
- **O que é:** proporção de conversas resolvidas pela IA versus não resolvidas/transferidas (`colaboradores.resolution`).
- **Fonte (tabelas/models Prisma):** `AgentSessionOutcomes` (campo `objectiveReached`, `createdAt`, `agentId`) · JOIN `Agents`.
- **Cálculo:** 2 entradas — `objectiveReached = true` → `resolved` ("Resolvidas"), senão `unresolved` ("Não resolvidas") — cada uma com `COUNT(*)`. A **taxa** (`resolved / total`) NÃO vem do backend: é derivada no front (`resolutionRate` computed → `Math.round((resolved/total)*1000)/10 + '%'`).
- **Query:**
  ```sql
  SELECT CASE WHEN o."objectiveReached" THEN 'resolved' ELSE 'unresolved' END AS id,
         CASE WHEN o."objectiveReached" THEN 'Resolvidas' ELSE 'Não resolvidas' END AS label,
         COUNT(*)::int AS value
  FROM "AgentSessionOutcomes" o
  JOIN "Agents" a ON a."id" = o."agentId"
  WHERE a."accountId" = :accountId AND a."isDeleted" = false
    AND o."createdAt" BETWEEN :start AND :end
  GROUP BY 1,2 ORDER BY value DESC
  ```
- **Filtros aplicáveis:** `initialDate`, `finalDate`. Não usa `channelId` nem `moderatorId`.
- **Cache TTL:** 900 s (15 min)

---

### Humano vs IA — `agents.human-vs-ai`
- **Gráfico:** `RankingList` (header "Volume de mensagens") · shaper `ranking`
- **Tipo de dado:** período
- **O que é:** comparativo do volume de mensagens enviadas por humanos e pela IA no período (`colaboradores.humanVsAi`).
- **Fonte (tabelas/models Prisma):** `Messages` (campos `from`, `createdAt`, `isDeleted`, `contabilableOnMetrics`, `contactId`) · JOIN `Contacts` (para `accountId`).
- **Cálculo:** 2 entradas — `from = 'HUMAN'` → `human` ("Humano"), senão `ai` ("IA") — cada uma com `COUNT(*)`. Mede uniformemente por `Messages.from`: só entram `HUMAN`, `ASSISTANT` e `BOT`; mensagens de entrada do contato (`CONTACT`) ficam de fora. Filtra `isDeleted = false` e `contabilableOnMetrics = true`.
- **Query:**
  ```sql
  SELECT CASE WHEN m."from" = 'HUMAN' THEN 'human' ELSE 'ai' END AS id,
         CASE WHEN m."from" = 'HUMAN' THEN 'Humano' ELSE 'IA' END AS label,
         COUNT(*)::int AS value
  FROM "Messages" m
  JOIN "Contacts" c ON c."id" = m."contactId"
  WHERE c."accountId" = :accountId AND m."isDeleted" = false
    AND m."contabilableOnMetrics" = true
    AND m."from" IN ('HUMAN','ASSISTANT','BOT')
    AND m."createdAt" BETWEEN :start AND :end
  GROUP BY 1,2 ORDER BY value DESC
  ```
- **Filtros aplicáveis:** `initialDate`, `finalDate`. Não usa `channelId` nem `moderatorId`.
- **Cache TTL:** 900 s (15 min)

---

### Satisfação — `agents.satisfaction`  *(implementado; comentado no template)*
- **Gráfico:** `RankingList` (header "Notas de 1 a 5") · shaper `ranking`
- **Tipo de dado:** período
- **O que é:** distribuição das avaliações de atendimento (notas 1 a 5) no período (`colaboradores.satisfaction`).
- **Fonte (tabelas/models Prisma):** `AgentRatings` (campos `rating`, `createdAt`, `agentId`) · JOIN `Agents`.
- **Cálculo:** agrupa por `rating` (1–5), `COUNT(*)` por nota. `id` e `label` = a própria nota como texto; ordenado por nota crescente (1→5, não por volume). O shaper `ranking` empacota `{ entries: [{ id, label, value }] }`.
- **Query:**
  ```sql
  SELECT r."rating"::text AS id, r."rating"::text AS label, COUNT(*)::int AS value
  FROM "AgentRatings" r
  JOIN "Agents" a ON a."id" = r."agentId"
  WHERE a."accountId" = :accountId AND a."isDeleted" = false
    AND r."createdAt" BETWEEN :start AND :end
  GROUP BY r."rating" ORDER BY r."rating" ASC
  ```
- **Filtros aplicáveis:** `initialDate`, `finalDate`. Não usa `channelId` nem `moderatorId`.
- **Cache TTL:** 900 s (15 min)

---

### Custo de IA por modelo — `agents.cost-by-model`  *(implementado; comentado no template)*
- **Gráfico:** `ComparisonTable` (colunas "Custo" em US$ e "Tokens", first-column "Modelo") · shaper `ranking`
- **Tipo de dado:** período
- **O que é:** custo e tokens consumidos por modelo de IA no período (`colaboradores.costByModel`).
- **Fonte (tabelas/models Prisma):** `LlmUsageLogs` (campos `model`, `costUsd`, `totalTokens`, `createdAt`, `accountId` direto — sem JOIN).
- **Cálculo:** agrupa por `model`. `value` = `SUM(costUsd)` (USD cru, sem conversão para centavos). `meta.tokens` = `SUM(totalTokens)` via `json_build_object('tokens', ...)`. Ordenado por custo desc. No front, `costByModelTable` mapeia cada entry para `{ cost: value, tokens: meta.tokens ?? 0 }`; coluna Custo formatada como `usd`, Tokens como `number`.
- **Query:**
  ```sql
  SELECT l."model" AS id, l."model" AS label,
         SUM(l."costUsd")::float AS value,
         json_build_object('tokens', SUM(l."totalTokens")::int) AS meta
  FROM "LlmUsageLogs" l
  WHERE l."accountId" = :accountId
    AND l."createdAt" BETWEEN :start AND :end
  GROUP BY l."model" ORDER BY value DESC
  ```
- **Filtros aplicáveis:** `initialDate`, `finalDate`. Não usa `channelId` nem `moderatorId`.
- **Cache TTL:** 900 s (15 min)

---

### Custo de IA no tempo — `agents.cost`  *(implementado; comentado no template)*
- **Gráfico:** `TimeSeriesChart` (ECharts, label "Custo (US$)", header "Valores em US$") · shaper `timeSeries`
- **Tipo de dado:** período
- **O que é:** evolução do custo de IA (em US$) ao longo do período (`colaboradores.cost`).
- **Fonte (tabelas/models Prisma):** `LlmUsageLogs` (campos `costUsd`, `createdAt`, `accountId` direto).
- **Cálculo:** `SUM(costUsd)` por bucket temporal (USD cru). Granularidade por `params.granularity` ou `pickGranularity(start, end)`; data agrupada por `DATE_TRUNC(granularity, createdAt AT TIME ZONE tz)` e formatada `YYYY-MM-DD`.
- **Query:**
  ```sql
  SELECT TO_CHAR(DATE_TRUNC(:granularity, (l."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE :tz),'YYYY-MM-DD') AS date,
         SUM(l."costUsd")::float AS value
  FROM "LlmUsageLogs" l
  WHERE l."accountId" = :accountId
    AND l."createdAt" BETWEEN :start AND :end
  GROUP BY 1 ORDER BY 1 ASC
  ```
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `granularity`. Não usa `channelId` nem `moderatorId`.
- **Cache TTL:** 900 s (15 min)

---

### Carga por atendente — `messages.workload`
- **Gráfico:** `ComparisonTable` (colunas "Mensagens enviadas" e "Contatos atendidos", first-column "Atendente") · shaper `ranking`
- **Tipo de dado:** período
- **O que é:** mensagens enviadas e contatos atendidos por cada atendente humano no período (`colaboradores.workload`).
- **Fonte (tabelas/models Prisma):** `Messages` (campos `from`, `userId`, `createdAt`, `channelId`, `isDeleted`, `contabilableOnMetrics`, `contactId`) · JOIN `Contacts` (para `accountId`) · JOIN `Users` (nome do atendente).
- **Cálculo:** agrupa por atendente (`Users.id`, `Users.name`). `value` = `COUNT(*)` de mensagens enviadas pelo atendente. `meta.contacts` = `COUNT(DISTINCT contactId)` (contatos distintos atendidos). Só conta mensagens humanas (`from = 'HUMAN'`) com `userId` não nulo, `isDeleted = false`, `contabilableOnMetrics = true`. Ordenado por volume de mensagens desc. No front, `workloadTable` mapeia para `{ messages: value, contacts: meta.contacts ?? 0 }`, ambas formatadas como `number`.
- **Query:**
  ```sql
  SELECT u."id" AS id, u."name" AS label, COUNT(*)::int AS value,
         json_build_object('contacts', COUNT(DISTINCT m."contactId")::int) AS meta
  FROM "Messages" m
  JOIN "Contacts" c ON c."id" = m."contactId"
  JOIN "Users" u ON u."id" = m."userId"
  WHERE c."accountId" = :accountId
    AND m."from" = 'HUMAN' AND m."userId" IS NOT NULL
    AND m."isDeleted" = false AND m."contabilableOnMetrics" = true
    AND m."createdAt" BETWEEN :start AND :end
    [AND m."channelId" = :channelId]
  GROUP BY u."id", u."name" ORDER BY value DESC
  ```
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `channelId` (opcional, aplicado). Não usa `moderatorId`.
- **Cache TTL:** 900 s (15 min)

---

### Horários de atendimento — `messages.service-hours`
- **Gráfico:** `Heatmap` (ECharts, dia×hora, header "Respostas de operadores humanos") · shaper `heatmap`
- **Tipo de dado:** período
- **O que é:** concentração das respostas de operadores humanos por dia da semana e hora no período (`colaboradores.serviceHours`).
- **Fonte (tabelas/models Prisma):** `Messages` (campos `from`, `userId`, `createdAt`, `channelId`, `isDeleted`, `contabilableOnMetrics`, `contactId`) · JOIN `Contacts` (para `accountId`).
- **Cálculo:** agrupa por (dia da semana, hora) no timezone da conta. `day` = `EXTRACT(ISODOW ...) - 1` (0 = segunda … 6 = domingo). `hour` = `EXTRACT(HOUR ...)` (0–23). `value` = `COUNT(*)` de mensagens humanas (`from = 'HUMAN'`, `isDeleted = false`, `contabilableOnMetrics = true`). O shaper `heatmap` monta `{ cells: [{ day, hour, value }] }`.
- **Query:**
  ```sql
  SELECT (EXTRACT(ISODOW FROM (m."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE :tz)::int - 1) AS day,
         EXTRACT(HOUR FROM (m."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE :tz)::int AS hour,
         COUNT(*)::int AS value
  FROM "Messages" m
  JOIN "Contacts" c ON c."id" = m."contactId"
  WHERE c."accountId" = :accountId
    AND m."from" = 'HUMAN' AND m."isDeleted" = false
    AND m."contabilableOnMetrics" = true
    AND m."createdAt" BETWEEN :start AND :end
    [AND m."channelId" = :channelId]
    [AND m."userId" = :moderatorId]
  GROUP BY 1,2 ORDER BY 1,2
  ```
- **Filtros aplicáveis:** `initialDate`, `finalDate`, `channelId` (opcional), **`moderatorId`** (opcional — filtra `Messages.userId`; único relatório desta aba que respeita `moderatorId`).
- **Cache TTL:** 900 s (15 min)
## Aba Automações

A aba **Automações** do Reports V2 mede o volume e a origem das execuções de fluxos/automações no período selecionado. Todos os relatórios são account-scoped (multi-tenancy) e derivam da tabela `IGAutomationsExecutions`, que **não possui `accountId`** — o escopo é sempre resolvido via JOIN com `IGAutomations` (`automationId → IGAutomations.accountId`). Compõem a aba quatro seções: uma série temporal de execuções, dois rankings (por automação e por gatilho) e um feed cronológico de eventos.

Frontend: `chatfunnel-front/src/views/reportsV2/tabs/AutomacoesTab.vue`
Catálogo: `chatfunnel-core/src/reports/catalog/automations.catalog.ts`
Repositório: `chatfunnel-core/src/repositories/reports/automations-reports.repository.ts`
Handler do feed: `chatfunnel-core/src/reports/handlers/event-feed.handler.ts`
Informativos: `chatfunnel-front/src/views/reportsV2/info/reportInfo.ts`

---

### Execuções de automação — `automations.executions`
- **Gráfico:** `BarSeriesChart` (barras, ECharts), `label="Execuções"` · shaper `timeSeries`
- **Tipo de dado:** período
- **O que é:** evolução do número de execuções de automações ao longo do período (`reportInfo` → `automacoes.executions`).
- **Fonte (tabelas/models Prisma):** `IGAutomationsExecutions` (fato) · JOIN `IGAutomations` (account-scope).
- **Cálculo:** `COUNT(*)` das execuções agrupadas por bucket temporal. O bucket vem de `DATE_TRUNC(<granularity>, ...)` sobre `dateExecution`, convertido de UTC para o timezone da conta antes do truncamento; formatado como `YYYY-MM-DD`. A granularidade é `params.granularity` ou, na ausência, definida por `pickGranularity(start, end)` (dia/semana/mês conforme o tamanho do range). O shaper `timeSeries` converte as linhas `{ date, value }` em `series` para o gráfico de barras.
- **Query:** método `executionsTimeSeries` (`$queryRaw`):
  ```sql
  SELECT
    TO_CHAR(
      DATE_TRUNC(:granularity, (e."dateExecution" AT TIME ZONE 'UTC') AT TIME ZONE :tz),
      'YYYY-MM-DD'
    ) AS date,
    COUNT(*)::int AS value
  FROM "IGAutomationsExecutions" e
  JOIN "IGAutomations" a ON a."id" = e."automationId"
  WHERE a."accountId" = :accountId::uuid
    AND e."dateExecution" BETWEEN :start AND :end
    [AND e."automationId" = :automationId::uuid]
  GROUP BY 1
  ORDER BY 1 ASC
  ```
- **Filtros aplicáveis:** `initialDate` / `finalDate` (via `normalizeRange` + timezone), `granularity` (opcional), `automationId` (opcional — adiciona `AND e."automationId" = ...`).
- **Cache TTL:** 900 s (15 min).

---

### Top automações — `automations.top`
- **Gráfico:** `RankingDonut` (donut/ranking, ECharts) · shaper `ranking`
- **Tipo de dado:** período
- **O que é:** ranking das automações mais executadas no período (`reportInfo` → `automacoes.top`).
- **Fonte (tabelas/models Prisma):** `IGAutomationsExecutions` (fato) · JOIN `IGAutomations` (account-scope + rótulo).
- **Cálculo:** `COUNT(*)` de execuções agrupadas por automação (`a."id"`, `a."name"`), ordenado por volume decrescente. O `label` do ranking é o `name` da automação. O shaper `ranking` produz `entries: RankingEntry[]` (`{ id, label, value }`) consumidas diretamente pelo donut.
- **Query:** método `topAutomations` (`$queryRaw`):
  ```sql
  SELECT a."id" AS id, a."name" AS label, COUNT(*)::int AS value
  FROM "IGAutomationsExecutions" e
  JOIN "IGAutomations" a ON a."id" = e."automationId"
  WHERE a."accountId" = :accountId::uuid
    AND e."dateExecution" BETWEEN :start AND :end
  GROUP BY a."id", a."name"
  ORDER BY value DESC
  ```
- **Filtros aplicáveis:** `initialDate` / `finalDate`. **Não** aplica `automationId` (é o próprio eixo de agrupamento).
- **Cache TTL:** 900 s (15 min).

---

### Efetividade por gatilho — `automations.by-trigger`
- **Gráfico:** `RankingDonut` (donut/ranking, ECharts); slot de ação exibe o rótulo "Volume de execuções" · shaper `ranking`
- **Tipo de dado:** período
- **O que é:** volume de execuções agrupado pelo gatilho que disparou a automação, no período (`reportInfo` → `automacoes.byTrigger`). "Efetividade" aqui equivale a **volume** de execuções — o schema não tem status de conclusão, então não há taxa de sucesso.
- **Fonte (tabelas/models Prisma):** `IGAutomationsExecutions` (fato) · JOIN `IGAutomations` (account-scope) · JOIN `IGAutomationsTriggers` (gatilho, por `triggerId`).
- **Cálculo:** `COUNT(*)` de execuções agrupadas por gatilho (`t."id"` + label), ordenado por volume decrescente. O JOIN com `IGAutomationsTriggers` por `e."triggerId" = t."id"` **exclui execuções sem trigger**. O `label` é `COALESCE(NULLIF(t."nameTrigger", ''), t."typeTrigger"::text)` — nome custom do gatilho, ou o tipo do gatilho quando não há nome. No front, `byTriggerEntries` traduz o label **apenas** quando ele bate com uma chave conhecida em `enums.TriggerTypesEnum` (via `te`/`t` do i18n); nomes custom passam intactos. O shaper `ranking` produz `entries`.
- **Query:** método `effectivenessByTrigger` (`$queryRaw`):
  ```sql
  SELECT
    t."id" AS id,
    COALESCE(NULLIF(t."nameTrigger", ''), t."typeTrigger"::text) AS label,
    COUNT(*)::int AS value
  FROM "IGAutomationsExecutions" e
  JOIN "IGAutomations" a ON a."id" = e."automationId"
  JOIN "IGAutomationsTriggers" t ON t."id" = e."triggerId"
  WHERE a."accountId" = :accountId::uuid
    AND e."dateExecution" BETWEEN :start AND :end
    [AND e."automationId" = :automationId::uuid]
  GROUP BY 1, 2
  ORDER BY value DESC
  ```
- **Filtros aplicáveis:** `initialDate` / `finalDate`, `automationId` (opcional — restringe aos gatilhos de uma automação).
- **Cache TTL:** 900 s (15 min).

---

### Últimos eventos — `automacoes.eventFeed` (handler `general.feed`)
- **Gráfico:** `EventFeed` (lista cronológica) com botão "Carregar mais" (paginação por cursor) · handler especial `eventFeedHandler`, não usa shaper genérico
- **Tipo de dado:** período
- **O que é:** eventos de automação mais recentes registrados no período (`reportInfo` → `automacoes.eventFeed`). No front, alimentado pelo composable `useEventFeed`.
- **Fonte (tabelas/models Prisma):** feed cronológico via `repos.eventFeedReports.feed(...)` — UNION de fontes de eventos (inclui `lead.created` e `automation.executed`), retornando `EventFeedRow`. O mesmo handler serve os feeds Geral/Flows/Agendamentos por configuração.
- **Cálculo:** o handler resolve `limit = clamp(params.limit ?? 20, 1..100)` e pede `limit + 1` linhas para detectar `hasMore` (busca `limit`+1, se vier mais que `limit` há próxima página). As linhas da página são mapeadas para `EventFeedItem` (`id`, `type`, `timestamp = timestampIso`, `title`, opcionalmente `contactId`/`contactName`). O `title` é montado em pt-BR **no handler** (não no SQL) via `buildTitle`: `lead.created` → "Novo lead: {contactName|contato}"; `automation.executed` → "Automação executada: {extra|fluxo}"; demais tipos usam o próprio `type`. O `nextCursor` é o `sortKey` do último item da página (paginação keyset por cursor).
- **Query:** delegada ao repositório `eventFeedReports.feed(accountId, params, timezone, { limit, cursor })` — UNION cronológico ordenado por `sortKey`, com filtro por conta e período; paginação keyset (`WHERE sortKey < cursor`).
- **Filtros aplicáveis:** `initialDate` / `finalDate`, `limit` (1–100, default 20), `cursor` (paginação). Filtro por `automationId` não é aplicado por este handler genérico.
- **Cache TTL:** não cacheado no catálogo de automações (handler especial paginado por cursor; resposta muda a cada página).
## Aba Broadcast

Documenta cada gráfico/seção da aba **Broadcast** do Reports V2 (`BroadcastTab.vue`). A aba mede o desempenho de disparo das campanhas (broadcasts): funil de entrega/leitura, histórico de campanhas, alcance por tag e melhor horário de envio. Todas as seções são do tipo **período** (reagem ao filtro de datas). Os quatro relatórios têm `cacheTtl: 900` (15 min) e aceitam o filtro opcional `broadcastId` para restringir a uma campanha específica.

**Nota importante sobre a fonte de dados** (do doc-comment do repository): entrega e leitura vêm de `Messages` (`broadcastId` + `sentAt`/`deliveredAt`/`readAt`), **não** de `BroadcastMessageContacts.status` (que só guarda PENDENT/ERROR/SUCCESS, sem timestamp). Como `Messages` não tem `accountId`, o escopo multi-tenant nas queries que partem de `Messages` é feito via JOIN em `Contacts`.

Todas as queries usam `$queryRaw` (Prisma) e normalizam o intervalo de datas via `normalizeRange(initialDate, finalDate, timezone)`.

---

### Performance de campanha — `broadcasts.performance`
- **Gráfico:** `FunnelChart.vue` · shaper `funnel`
- **Tipo de dado:** período
- **O que é:** Funil de entrega dos broadcasts do período — enviadas → entregues → lidas (reportInfo `broadcast.performance`).
- **Fonte (tabelas/models Prisma):** `Messages` (JOIN `Contacts` para escopo por conta).
- **Cálculo:** Uma única linha agregada convertida em 3 estágios de funil. `sent` = total de mensagens de broadcast no período (`COUNT(*)`); `delivered` = mensagens com `deliveredAt IS NOT NULL`; `read` = mensagens com `readAt IS NOT NULL`. Valores monotônicos (delivered ⊆ sent, read ⊆ delivered). O shaper `funnel` monta os stages `sent` (pos 0), `delivered` (pos 1), `read` (pos 2). Se não houver linha, tudo zera.
- **Query:**
  ```sql
  SELECT
    COUNT(*)::int AS sent,
    COUNT(*) FILTER (WHERE m."deliveredAt" IS NOT NULL)::int AS delivered,
    COUNT(*) FILTER (WHERE m."readAt" IS NOT NULL)::int AS "read"
  FROM "Messages" m
  JOIN "Contacts" c ON c."id" = m."contactId"
  WHERE c."accountId" = $accountId
    AND m."broadcastId" IS NOT NULL
    AND m."isDeleted" = false
    AND m."createdAt" BETWEEN $start AND $end
    -- AND m."broadcastId" = $broadcastId  (se broadcastId informado)
  ```
- **Filtros aplicáveis:** `initialDate`/`finalDate` (via `m.createdAt`), `broadcastId` opcional (filtra `m.broadcastId`). `channelId` não é aplicado aqui.
- **Cache TTL:** 900 s (15 min)

---

### Histórico de broadcasts — `broadcasts.history`
- **Gráfico:** `ComparisonTable.vue` (primeira coluna "Campanha") · shaper `ranking`
- **Tipo de dado:** período
- **O que é:** Lista das campanhas enviadas no período, com enviados, entregues e lidos (reportInfo `broadcast.history`). Ranking cronológico (mais recente primeiro).
- **Fonte (tabelas/models Prisma):** `BroadcastMessage` (linha da campanha) + subquery em `Messages` por `broadcastId` para entregues/lidos.
- **Cálculo:** Uma linha por campanha. `value` = `contactCount` da campanha (= enviados). `meta` = `{ delivered, read, createdAt }`, onde delivered/read vêm de um LEFT JOIN com subquery que agrega `Messages` por `broadcastId` (`deliveredAt`/`readAt` não nulos, `COALESCE 0`). `createdAt` formatado como ISO. Exclui campanhas canceladas (`isCancelled = false`). A tabela do front mapeia `sent = e.value`, `delivered = meta.delivered`, `read = meta.read`, `createdAt = meta.createdAt`. Escopo por conta é direto (`BroadcastMessage.accountId`).
- **Query:**
  ```sql
  SELECT
    b."id" AS id,
    b."name" AS label,
    b."contactCount"::int AS value,
    json_build_object(
      'delivered', COALESCE(m.delivered, 0),
      'read',      COALESCE(m."read", 0),
      'createdAt', to_char(b."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    ) AS meta
  FROM "BroadcastMessage" b
  LEFT JOIN (
    SELECT msg."broadcastId" AS bid,
      COUNT(*) FILTER (WHERE msg."deliveredAt" IS NOT NULL)::int AS delivered,
      COUNT(*) FILTER (WHERE msg."readAt" IS NOT NULL)::int AS "read"
    FROM "Messages" msg
    WHERE msg."broadcastId" IS NOT NULL
    GROUP BY msg."broadcastId"
  ) m ON m.bid = b."id"
  WHERE b."accountId" = $accountId
    AND b."isCancelled" = false
    AND b."createdAt" BETWEEN $start AND $end
    -- AND b."channelId" = $channelId  (se channelId informado)
    -- AND b."id" = $broadcastId       (se broadcastId informado)
  ORDER BY b."createdAt" DESC
  ```
- **Filtros aplicáveis:** `initialDate`/`finalDate` (via `b.createdAt`), `channelId` opcional (`b.channelId`), `broadcastId` opcional (`b.id`).
- **Cache TTL:** 900 s (15 min)

---

### Alcance por segmento — `broadcasts.reach-by-segment`
- **Gráfico:** `ComparisonTable.vue` (primeira coluna "Tag") · shaper `ranking`
- **Tipo de dado:** período
- **O que é:** Alcance dos envios agrupado pela tag usada em cada broadcast, no período (reportInfo `broadcast.reach`). Ranking por total de lidos (desc).
- **Fonte (tabelas/models Prisma):** `BroadcastMessageTags` (JOIN `BroadcastMessage`, `Tags`, `Messages`).
- **Cálculo:** Uma linha por tag. `value` = lidos (`COUNT(*) FILTER readAt IS NOT NULL`). `meta` = `{ sent = COUNT(*), delivered = deliveredAt não nulo, read = readAt não nulo }`. Uma mesma mensagem é contada em cada tag do broadcast (multiplicação intencional para semântica "por segmento"). Escopo por conta direto (`BroadcastMessage.accountId`); agrega por período via `b.createdAt`. Ordenado por lidos desc. No front, a tabela mapeia `sent/delivered/read` a partir do meta (com `read` caindo para `e.value` se ausente).
- **Query:**
  ```sql
  SELECT
    t."id" AS id,
    t."name" AS label,
    COUNT(*) FILTER (WHERE m."readAt" IS NOT NULL)::int AS value,
    json_build_object(
      'sent',      COUNT(*)::int,
      'delivered', COUNT(*) FILTER (WHERE m."deliveredAt" IS NOT NULL)::int,
      'read',      COUNT(*) FILTER (WHERE m."readAt" IS NOT NULL)::int
    ) AS meta
  FROM "BroadcastMessageTags" bt
  JOIN "BroadcastMessage" b ON b."id" = bt."broadcastId"
  JOIN "Tags" t ON t."id" = bt."tagId"
  JOIN "Messages" m ON m."broadcastId" = b."id"
  WHERE b."accountId" = $accountId
    AND b."createdAt" BETWEEN $start AND $end
    -- AND b."id" = $broadcastId  (se broadcastId informado)
  GROUP BY t."id", t."name"
  ORDER BY value DESC
  ```
- **Filtros aplicáveis:** `initialDate`/`finalDate` (via `b.createdAt`), `broadcastId` opcional (`b.id`). `channelId` não é aplicado aqui.
- **Cache TTL:** 900 s (15 min)

---

### Melhor horário de envio — `broadcasts.best-send-time`
- **Gráfico:** `echarts/Heatmap.vue` (`value-format="rate"`) · shaper `heatmap`
- **Tipo de dado:** período
- **O que é:** Taxa de leitura por dia da semana e hora, ajudando a escolher o melhor horário de envio (reportInfo `broadcast.bestSendTime`).
- **Fonte (tabelas/models Prisma):** `Messages` (JOIN `Contacts` para escopo por conta).
- **Cálculo:** Uma célula por combinação dia×hora do envio (`sentAt`). `day` = `ISODOW - 1` (0 = segunda) e `hour` = hora, ambos convertidos para o `timezone` do request (mesma bucketização de fuso dos relatórios R11/R20). `value` = taxa de leitura = `lidos / total` da célula (`COUNT FILTER readAt não nulo / NULLIF(COUNT(*),0)`), float 0..1 — por isso o front usa `value-format="rate"`. Período filtrado por `sentAt`.
- **Query:**
  ```sql
  SELECT
    (EXTRACT(ISODOW FROM (m."sentAt" AT TIME ZONE 'UTC') AT TIME ZONE $timezone)::int - 1) AS day,
    EXTRACT(HOUR FROM (m."sentAt" AT TIME ZONE 'UTC') AT TIME ZONE $timezone)::int AS hour,
    (COUNT(*) FILTER (WHERE m."readAt" IS NOT NULL)::float / NULLIF(COUNT(*), 0)) AS value
  FROM "Messages" m
  JOIN "Contacts" c ON c."id" = m."contactId"
  WHERE c."accountId" = $accountId
    AND m."broadcastId" IS NOT NULL
    AND m."sentAt" IS NOT NULL
    AND m."isDeleted" = false
    AND m."sentAt" BETWEEN $start AND $end
    -- AND m."broadcastId" = $broadcastId  (se broadcastId informado)
  GROUP BY 1, 2
  ORDER BY 1, 2
  ```
- **Filtros aplicáveis:** `initialDate`/`finalDate` (via `m.sentAt`), `timezone` (bucketização), `broadcastId` opcional (`m.broadcastId`). `channelId` não é aplicado aqui.
- **Cache TTL:** 900 s (15 min)
## Aba Agendamentos

A aba **Agendamentos** do Reports V2 documenta o volume de agendamentos (compromissos do Google Calendar) ao longo do período selecionado, segmentado por status. O domínio tem hoje um único gráfico ativo; comparecimento e no-show dependem de campos ainda inexistentes no schema e aparecem apenas como aviso "em breve".

### Volume de agendamentos — `schedules.volume`
- **Gráfico:** `BarSeriesChart` (ECharts, barras) dentro de `ReportSection` (título "Volume de agendamentos", subtítulo/ação "Pela data do compromisso") · shaper `timeSeries`
- **Tipo de dado:** período
- **O que é:** volume de agendamentos criados/marcados ao longo do período, bucketizado pela data do compromisso (`startAt`) e segmentado por status (ativo vs. cancelado). Os informativos correlatos descrevem como "Volume de agendamentos criados ao longo do período" (`geral.schedulesSection`) e "Total de agendamentos criados no período" (`geral.agendamentos`).
- **Fonte (tabelas/models Prisma):** `GoogleCalendarEvents` (possui `accountId` direto — sem JOIN)
- **Cálculo:**
  - `normalizeRange(initialDate, finalDate, timezone)` define o intervalo `[start, end]`.
  - `granularity` vem de `params.granularity` ou, na ausência, de `pickGranularity(start, end)` (dia/semana/mês conforme o tamanho do range).
  - Cada evento é atribuído ao bucket temporal por `startAt`, convertido de UTC para o timezone da conta (`(e."startAt" AT TIME ZONE 'UTC') AT TIME ZONE <tz>`) e truncado por `DATE_TRUNC(<granularity>, ...)`.
  - Segmento: `'cancelled'` quando `isCancelled = true`, senão `'active'`.
  - Agregação `COUNT(*)` por (data, segmento). O shaper `timeSeries` monta as `series` consumidas pelo `BarSeriesChart`; a seção mostra estado vazio quando `series.length === 0`.
- **Query:** `SchedulesReportsRepository.volumeTimeSeries` via `prisma.$queryRaw`:
  ```sql
  SELECT
    TO_CHAR(
      DATE_TRUNC(:granularity, (e."startAt" AT TIME ZONE 'UTC') AT TIME ZONE :timezone),
      'YYYY-MM-DD'
    ) AS date,
    CASE WHEN e."isCancelled" THEN 'cancelled' ELSE 'active' END AS segment,
    COUNT(*)::int AS value
  FROM "GoogleCalendarEvents" e
  WHERE e."accountId" = :accountId::uuid
    AND e."startAt" IS NOT NULL
    AND e."startAt" BETWEEN :start AND :end
  GROUP BY 1, 2
  ORDER BY 1 ASC
  ```
- **Filtros aplicáveis (`ReportParams`):** `initialDate`, `finalDate`, `granularity` (opcional; default por `pickGranularity`), `timezone`; escopo multi-tenant por `accountId`. No front, `AgendamentosTab` recarrega ao mudar `initialDate`/`finalDate`.
- **Cache TTL:** 900 s

---

**Não disponível (aviso em tela, sem query):** comparecimento e no-show ("Comparecimento e no-show ainda não estão disponíveis — em breve"). Dependem de novos campos no schema, não cobertos pelo repository atual.
