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
