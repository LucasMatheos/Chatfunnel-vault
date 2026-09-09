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
