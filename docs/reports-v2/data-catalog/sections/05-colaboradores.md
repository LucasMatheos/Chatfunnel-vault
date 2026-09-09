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
