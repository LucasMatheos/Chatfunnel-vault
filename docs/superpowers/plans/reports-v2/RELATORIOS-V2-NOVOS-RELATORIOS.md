# Relatórios V2 — Novos relatórios (adendo para o frontend)

> **Complemento** ao guia `RELATORIOS-V2-IMPLEMENTACAO.md`. Aquele documento cobre os **7 primeiros**
> relatórios; **este lista os 11 relatórios adicionados depois** (CRM restante + Contatos restante) que
> **ainda não estavam** no guia principal. Arquitetura, headers, query params, formato de erro e padrão
> de build são **os mesmos** do guia principal — aqui foco no que o FE precisa para integrar cada novo
> relatório (id, payload, rota REST, tool MCP e particularidades).

Tudo continua valendo:
- **Base REST:** `/nest/reports/v2/...` (prefixo global `/nest`).
- **Headers obrigatórios:** `Authorization: Bearer <jwt>`, `Account-Selected: <accountId>`,
  `Timezone` (opcional, default `America/Sao_Paulo`). Ver §4 do guia principal.
- **Query params:** `initialDate`/`finalDate` (ISO 8601, **obrigatórios**), `pipelineId?`, `granularity?`.
- **Resposta = payload direto** (sem envelope `{ data }`). Tipos em `@chatfunnel/contracts`.
- **Sem publish:** `npm link` + `npm run build` (contracts → core → services/mcp).

---

## 1. Tabela dos novos relatórios

### CRM / Pipeline (story-12)

| Relatório | id (catálogo) | Payload | Endpoint REST | Tool MCP |
|---|---|---|---|---|
| Receita do pipeline no tempo (R02) | `crm.revenue` | `SegmentedTimeSeries` | `GET /nest/reports/v2/crm/revenue` | `report_crm_revenue` |
| Velocidade de vendas — ciclo (R03) | `crm.sales-velocity` | `AgingData` | `GET /nest/reports/v2/crm/sales-velocity` | `report_crm_sales_velocity` |
| Tempo médio por etapa (R03) | `crm.stage-time` | `Ranking` | `GET /nest/reports/v2/crm/stage-time` | `report_crm_stage_time` |
| Performance por vendedor (R05) | `crm.performance-by-seller` | `Ranking` (+`meta`) | `GET /nest/reports/v2/crm/performance-by-seller` | `report_crm_performance_by_seller` |
| Previsão de receita (R07) | `crm.revenue-forecast` | `MetricCard` (sem `delta`) | `GET /nest/reports/v2/crm/revenue-forecast` | `report_crm_revenue_forecast` |

### Contatos / Leads (story-13)

| Relatório | id (catálogo) | Payload | Endpoint REST | Tool MCP |
|---|---|---|---|---|
| Aquisição por canal (R09) | `contacts.by-channel` | `Ranking` | `GET /nest/reports/v2/contacts/by-channel` | `report_contacts_by_channel` |
| Distribuição por tags (R10) | `contacts.by-tag` | `Ranking` | `GET /nest/reports/v2/contacts/by-tag` | `report_contacts_by_tag` |
| Contatos inativos (R12) | `contacts.inactivity` | `AgingData` | `GET /nest/reports/v2/contacts/inactivity` | `report_contacts_inactivity` |
| Origem UTM — source (R13) | `contacts.utm-source` | `Ranking` | `GET /nest/reports/v2/contacts/utm-source` | `report_contacts_utm_source` |
| Origem UTM — medium (R13) | `contacts.utm-medium` | `Ranking` | `GET /nest/reports/v2/contacts/utm-medium` | `report_contacts_utm_medium` |
| Origem UTM — campaign (R13) | `contacts.utm-campaign` | `Ranking` | `GET /nest/reports/v2/contacts/utm-campaign` | `report_contacts_utm_campaign` |

> Total de tools MCP agora: **18** (7 do guia principal + 11 acima).

---

## 2. Detalhe por relatório (o que o FE precisa saber)

### CRM

#### `crm.revenue` — Receita do pipeline no tempo → `SegmentedTimeSeries`
- Soma `amount` por bucket de tempo **e por status da oportunidade** (`segment`).
- `segment` ∈ `"WON"` / `"LOST"` (status de `KanbanCards.statusOportunity`). Renderize uma série por
  segmento (ex.: linha verde = WON, vermelha = LOST).
- Params: período (obrigatório), `granularity?` (`day`/`week`/`month`; default automático: ≤31d→day,
  ≤120d→week, senão month), `pipelineId?` (filtra um pipeline; se omitido, soma todos).
- Janela temporal = `statusOportunityUpdatedAt` (momento em que o card virou WON/LOST).
- ⚠️ `value` é a **soma de `amount` cru (Int do banco)** — ver nota de escala em §3.

```ts
// type SegmentedTimeSeries = { granularity; segments: { segment; label?; points: {date,value}[] }[] }
const rev = await http.get<SegmentedTimeSeries>("/nest/reports/v2/crm/revenue", {
  headers, params: { initialDate, finalDate, pipelineId /* opcional */ },
});
```

#### `crm.sales-velocity` — Velocidade de vendas (ciclo) → `AgingData`
- Distribuição dos negócios **ganhos (WON)** por tempo de ciclo (criação → fechamento), 4 faixas fixas:
  `< 1 dia` `[0,1)`, `1–7 dias` `[1,7)`, `7–30 dias` `[7,30)`, `> 30 dias` `[30, null]`.
- Params: período (obrigatório), `pipelineId?`. Janela = `statusOportunityUpdatedAt` dos WON.

#### `crm.stage-time` — Tempo médio por etapa → `Ranking`
- `entries[]`: `id` = id da coluna, `label` = nome da etapa, `value` = **tempo médio em DIAS** (float)
  que os cards ficam naquela etapa.
- **Ordenado pela posição do funil** (não por `value`). `total` = soma dos tempos médios (use os
  `entries` individualmente; o `total` aqui tem pouco significado de negócio).
- Etapas sem saída registrada (cards ainda parados) não entram na média. Params: período, `pipelineId?`.

#### `crm.performance-by-seller` — Performance por vendedor → `Ranking` com `meta`
- `entries[]`: `id` = id do usuário, `label` = nome do vendedor, `value` = **receita WON** (soma `amount`).
- **`meta`** por entrada: `{ won: number, lost: number, winRate: number | null }`
  - `won`/`lost` = nº de negócios; `winRate` = `won / (won + lost)` (fração **0..1**; `null` se não houve
    WON nem LOST). Formate como `%` no front.
- Ordenado por `value` (receita) desc. Params: período, `pipelineId?`.
- ⚠️ Expor receita por vendedor é decisão de **produto/autorização** — confirme visibilidade por papel.

```ts
type SellerMeta = { won: number; lost: number; winRate: number | null };
const r = await http.get<Ranking>("/nest/reports/v2/crm/performance-by-seller", { headers, params: { initialDate, finalDate }});
r.data.entries.forEach(e => {
  const m = e.meta as SellerMeta; // receita = e.value; taxa = m.winRate
});
```

#### `crm.revenue-forecast` — Previsão de receita → `MetricCard` (sem `delta`)
- **Snapshot "agora"** (ignora o período): previsão ponderada do pipeline aberto =
  `Σ amount × (posição_da_etapa + 1) / nº_de_etapas` sobre os cards `OPEN`.
- `value` = número (currency), **`format: "currency"`**, **sem `delta`** (não há comparativo) e sem
  `sparkline`. Params: `pipelineId?` (período é ignorado, mas `initialDate`/`finalDate` continuam
  obrigatórios na rota por padronização).

### Contatos

#### `contacts.by-channel` — Aquisição por canal → `Ranking`
- Agrupa os contatos **criados no período** pela **plataforma de aquisição** (`Contacts.fromPlatform`).
- `entries[]`: `id` = `label` = plataforma (`"INSTAGRAM"`/`"WHATSAPP"`/`"FACEBOOK"`/`"SYSTEM"`),
  `value` = nº de contatos. `total` = soma. (1 plataforma por contato — sem duplicação.)
- Params: período (obrigatório).

#### `contacts.by-tag` — Distribuição por tags → `Ranking`
- Ranking das tags mais usadas: `id` = id da tag, `label` = nome da tag, `value` =
  `COUNT(DISTINCT contato)` (não deletados) criados no período. Tags sem contatos no período não aparecem.
- Params: período. *(Filtro por pasta de tags ainda não exposto — follow-up.)*

#### `contacts.inactivity` — Contatos inativos → `AgingData`
- **Snapshot "agora"** (ignora o período): distribuição da base por **dias desde a última atividade**
  (`COALESCE(lastUpdate, dateCreated)`). **6 faixas**: `< 7 dias` `[0,7)`, `7–15` `[7,15)`,
  `15–30` `[15,30)`, `30–60` `[30,60)`, `60–90` `[60,90)`, `90+ dias` `[90, null]`.
- Params: período obrigatório na rota, mas ignorado no cálculo (snapshot).

#### `contacts.utm-source` / `contacts.utm-medium` / `contacts.utm-campaign` — Origem UTM → `Ranking`
- **3 rotas** (uma por dimensão UTM). Cada uma: ranking dos contatos **criados no período** com a UTM
  **preenchida** (contatos sem UTM são excluídos — só origens atribuídas).
- `entries[]`: `id` = `label` = o valor da UTM (ex.: `"google"`, `"cpc"`, `"black-friday"`),
  `value` = nº de contatos. Params: período.

---

## 3. Notas de integração (importantes)

- **Escala monetária:** `value` de `crm.revenue`, `crm.performance-by-seller` (receita) e
  `crm.revenue-forecast` vem do campo `amount` **cru (Int)** do banco — o backend **não** converte
  centavos↔reais. Alinhe a escala com o time de dados antes de formatar como moeda.
- **Relatórios "snapshot" (ignoram o período):** `crm.revenue-forecast` e `contacts.inactivity`
  (assim como `crm.aging` do guia principal) refletem o estado **atual** — as datas são exigidas pela
  rota por padronização, mas não afetam o resultado. Não exiba "no período X" nesses cards/gráficos.
- **`Ranking.meta`:** só `crm.performance-by-seller` usa `meta` hoje (`{won,lost,winRate}`). Trate `meta`
  como opcional/`unknown` nos demais rankings.
- **`MetricCard` sem `delta`:** `crm.revenue-forecast` não traz `delta` (≠ `crm.revenue-card`, que traz).
  Esconda o indicador de variação quando `delta` for `undefined`.
- **`pipelineId`:** opcional em todos os relatórios CRM acima (filtra um pipeline); **só o `crm.funnel`**
  (guia principal) o exige.
- **Validação estrita:** `ValidationPipe` rejeita query param desconhecido com `400` — envie só os params
  documentados.

---

## 4. Mapeamento sugerido relatório ↔ aba (atualizado)

| Aba | Consome (novos relatórios em **negrito**) |
|---|---|
| **Geral** | `contacts.growth`, `contacts.peak-hours`, `crm.revenue-card`, `general.feed`, **`crm.revenue-forecast`** (card de previsão) |
| **Funil / CRM** | `crm.funnel`, `crm.loss-reasons`, `crm.aging`, `crm.revenue-card`, **`crm.revenue`** (receita no tempo), **`crm.sales-velocity`**, **`crm.stage-time`**, **`crm.performance-by-seller`**, **`crm.revenue-forecast`** |
| **Contatos / Leads** | `contacts.growth`, `contacts.peak-hours`, **`contacts.by-channel`**, **`contacts.by-tag`**, **`contacts.inactivity`**, **`contacts.utm-source` / `utm-medium` / `utm-campaign`** |

---

## 5. Ainda pendente (não implementado)

- **R14 — Campos personalizados** (`contacts.*`, ranking por valor de custom field): última pendência da
  story-13.
- Mensagens/Atendimento (R15–R20), Automações (R21/R23/R25), Broadcast (R26–R29), Agentes IA (R30–R34),
  Dashboard composto (R36/R37), Agendamentos, Intelligence — próximas stories.
- Follow-ups menores já mapeados: filtro por **pasta** em `contacts.by-tag`; **taxa de reativação** em
  inativos; **conversão UTM→pipeline**; filtros canal/período onde hoje são snapshot.
