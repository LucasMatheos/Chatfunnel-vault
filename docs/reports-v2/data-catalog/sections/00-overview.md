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
