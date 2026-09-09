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
