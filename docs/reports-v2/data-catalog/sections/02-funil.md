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
