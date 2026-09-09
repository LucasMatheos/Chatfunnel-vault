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
