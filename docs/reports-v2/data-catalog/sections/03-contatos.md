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
