---
title: Relatórios V2 — Arquitetura Completa da Atividade
description: Documento mestre da atividade Relatórios V2. Consolida produto, arquitetura backend (engines + catálogo + orchestrator + specials), contratos, fluxo de request, estado atual e plano de execução. Fonte única de referência para implementação.
tags: [features, reports, reportsV2, backend, services, contracts, frontend, arquitetura, plano, master]
related: ["[[reports-v2-arquitetura]]", "[[contacts]]", "[[crm-kanban]]", "[[automations]]", "[[ai-agents]]"]
last_updated: 2026-06-03
status: f0-concluida-f1-nao-iniciada
---

# Relatórios V2 — Arquitetura Completa da Atividade

> **Propósito deste documento.** Reunir, num lugar só, tudo que define a atividade
> Relatórios V2: o que o produto pediu, como o backend está desenhado, como cada
> peça funciona, o que já está feito, o que falta e em que ordem fazer. Os outros
> documentos continuam válidos como detalhe; este é o ponto de entrada.

> **Documentos-fonte (detalhe por trás deste resumo):**
> - Reunião / produto: `docs/research/atividade-relatorios.md` (Weekly Dev × Product 2026-04-24)
> - Catálogo base (34 relatórios): `docs/superpowers/specs/2026-05-24-relatorios-design.md`
> - Arquitetura com snippets: `docs/superpowers/specs/2026-05-28-relatorios-v2-arquitetura.md`
> - Decisões e backlog repriorizado: `docs/superpowers/specs/2026-06-03-relatorios-v2-decisoes-e-backlog.md`
> - Escopo por aba: `docs/superpowers/specs/2026-06-03-relatorios-v2-escopo-por-aba.md`
> - Mapping técnico por aba: `docs/superpowers/specs/2026-06-03-relatorios-v2-mapping-tecnico-por-aba.md`
> - Plano por fatias: `docs/superpowers/plans/2026-06-03-relatorios-v2-implementacao-por-fatias.md`
> - Plano técnico F1 (engines, TDD): `docs/superpowers/plans/2026-06-01-reports-v2-f1-engines.md`
> - Wiki (discussão): `vault/wiki/features/reports-v2-arquitetura.md`

---

## 1. O que é esta atividade

Construir o módulo **Relatórios V2** do ChatFunnel: uma **tela única** de relatórios,
organizada em **abas fixas**, alimentada por um **backend novo** (`ReportsV2Module` no
`chatfunnel-services`) desenhado a partir de **engines reusáveis + catálogo declarativo**,
em vez de um handler por relatório.

A atividade tem duas frentes que andam juntas:

1. **Backend** (`chatfunnel-services` + `chatfunnel-contracts`): engines de cálculo,
   catálogo de relatórios, orchestrator, handlers especiais, shapes de saída.
2. **Frontend** (`chatfunnel-front`): a tela de Relatórios, com shell de abas, filtros
   globais (período, origem/UTM) e os componentes de gráfico que consomem os payloads.

Há ainda dependências cross-repo (`chatfunnel-core`) e uma fronteira clara com a
**Intelligence**, que cuidará dos relatórios dinâmicos / sob demanda.

---

## 2. Decisão de produto (origem de tudo)

A reunião de 2026-04-24 fixou o enquadramento:

- Relatórios **não** são um dashboard solto com dezenas de métricas espalhadas.
- A experiência é **uma tela** com **abas fixas** e alguns gráficos curados (o funil é o coração).
- Filtros de **período, origem e UTM** são de primeira classe.
- Análises **específicas e ad hoc** ficam para a **Intelligence** gerar sob demanda — não
  viram novas telas/rotas no front.
- Estatísticas **não** ficam espalhadas dentro de cada agente; são **centralizadas** na
  tela de Relatórios e recortadas por **filtro de colaborador**.

### 2.1 As 5 abas

| # | Aba | O que mostra (resumo da reunião) |
|---|---|---|
| 1 | **Geral** | Visão executiva: leads totais/ganhos/perdidos, entrada por origem, faturamento, agendamentos, horário/dia de pico (heatmap), histórico de leads por dia, últimos eventos, horas economizadas pela IA |
| 2 | **Flows / Automações** | Flows executados, ranking dos mais executados, eventos recentes de automação |
| 3 | **Funil** | Funil visual, leads que entraram, leads por etapa, avanço entre etapas, ganhos, taxa de conversão por etapa, motivos de perda; leitura **absoluta** e **relativa** |
| 4 | **Agendamentos** | Quantidade, últimos agendamentos, comparecimento, no-show, tempo até agendamento, mensagens até agendamento, comparações por origem/UTM |
| 5 | **Agentes / Colaboradores** | Visão por pessoa via filtro: leads abordados, conversão, tempo de conversa/resposta, sentimento, receita, agendamentos, no-show, carga de trabalho, leads ativos no CRM |

### 2.2 Fora de escopo / a remover

- **ROAS / tráfego** — citado e depois descartado do escopo.
- **Relatórios dentro de cada agente** — evitar; centralizar e filtrar.
- **"Temperatura média"** — métrica confusa; deve ser **removida ou renomeada** para
  mood/sentimento (item de limpeza no produto atual, ver §11).

---

## 3. Princípio arquitetural: por que engines + catálogo

Os 34 relatórios do catálogo base, quando olhados pelo **padrão de cálculo**, colapsam em
**6 padrões + 6 casos especiais**. Escrever 34 handlers duplicaria a mesma estrutura
(query + timezone + shape + cache) dezenas de vezes, com risco de divergência.

A solução: **engine** = a implementação de um padrão; **catalog** = a configuração
declarativa de cada relatório; **orchestrator** = quem recebe o id, acha a config e
despacha para o engine certo.

### 3.1 Os 34 relatórios → 6 padrões

| Padrão | Relatórios | Total | O que varia entre eles |
|---|---|---|---|
| **Time series** | R02, R08, R09, R15, R17, R21, R27, R30, R32 | 9 | Tabela, coluna de data, agregação |
| **Ranking** | R04, R05, R10, R13, R14, R18, R23, R25 | 8 | Entidade rankeada, métrica, join |
| **Heatmap** | R11, R20, R29 | 3 | Tabela, coluna de data |
| **Funnel** | R01, R19, R26 | 3 | Sequência de estágios, fonte das transições |
| **Aging** | R06, R12, R16 | 3 | Entidade, coluna de referência, faixas |
| **Dashboard composto** | R35, R36, R37 | 3 | Conjunto de métricas a compor |
| **Special (lógica própria)** | R03, R07, R28, R31, R33, R34 | 6 | Algoritmo não padronizável |

28 relatórios via 6 engines + 6 specials = **~12 arquivos de lógica** em vez de 34.

### 3.2 Ganho concreto

- **Adicionar relatório padronizado** = ~15 linhas de config no catálogo (sem novo handler, sem nova lógica de query/timezone).
- **Mudar shape de saída** de um padrão = editar **1 engine**, não N handlers.
- **Bug de timezone/cache** = corrigir em **1 lugar**.
- **Impossível divergir**: todos os relatórios de um padrão passam pelo mesmo código.

### 3.3 Mitigações do over-engineering

- Engines têm propósito **limitado**. O que não cabe sem virar canivete suíço vira **special**.
- O SQL gerado é **logado em DEBUG** em toda execução.
- Specials existem **desde o dia 1** (6 dos 34) — não se força tudo no engine.

---

## 4. Catálogo de produto vs. UI

O catálogo de 34 relatórios continua útil como **biblioteca de métricas e capacidades de
backend**. **Não** significa 34 telas. A UI expõe **5 abas curadas**; cada aba **compõe**
primitivos (cards, séries, heatmap, funil, ranking, feed) reaproveitados dos engines.
Relatórios realmente abertos vão para a Intelligence (§10).

---

## 5. Estrutura de pastas do módulo

```
chatfunnel-services/src/modules/reports-v2/
├── reports-v2.module.ts            # registra controllers, engines, specials, orchestrator
│
├── controllers/                    # um por domínio, endpoints finos (só delegam ao orchestrator)
│   ├── ping.controller.ts          # F0 — smoke test
│   ├── dashboard.controller.ts     # GET /reports/v2/dashboard/*
│   ├── crm.controller.ts           # GET /reports/v2/crm/*   (funil, motivos de perda, aging)
│   ├── contacts.controller.ts      # GET /reports/v2/contacts/*
│   ├── automations.controller.ts   # GET /reports/v2/automations/*
│   ├── collaborators.controller.ts # GET /reports/v2/collaborators/*
│   └── schedules.controller.ts     # GET /reports/v2/schedules/*  (só após Fatia 6)
│
├── orchestrator/
│   └── report.orchestrator.ts      # registry: Map<id, config>; resolve + despacha por engine
│
├── engines/                        # os 6 padrões reusáveis
│   ├── time-series.engine.ts       # count/sum/avg por dia/semana/mês (+ segmentação opcional)
│   ├── ranking.engine.ts           # top-N por métrica
│   ├── heatmap.engine.ts           # bucket hora × dia da semana
│   ├── funnel.engine.ts            # estágios sequenciais + conversão
│   ├── aging.engine.ts             # distribuição por faixa de duração
│   └── metric-card.engine.ts       # valor + delta vs período anterior + sparkline
│
├── handlers/                       # os casos especiais (lógica própria)
│   ├── event-feed.handler.ts       # feed cronológico (UNION de tabelas por timestamp)
│   ├── crm-velocity.handler.ts     # R03
│   ├── crm-forecast.handler.ts     # R07
│   ├── agents-satisfaction.handler.ts        # R31
│   ├── agents-resolution-rate.handler.ts     # R33
│   ├── agents-human-vs-ai.handler.ts         # R34
│   └── broadcasts-reach-by-segment.handler.ts # R28
│
├── catalog/                        # relatórios como configuração declarativa
│   ├── contacts.catalog.ts
│   ├── crm.catalog.ts
│   ├── dashboard.catalog.ts
│   ├── automations.catalog.ts
│   ├── collaborators.catalog.ts
│   └── index.ts                    # buildRegistry() junta todos os catalogs
│
├── core/
│   ├── period.helper.ts            # F0 — normalizeRange, fixTimezone, DEFAULT_TIMEZONE
│   ├── granularity.helper.ts       # auto-pick day/week/month pelo tamanho do range
│   └── report-engine.contract.ts   # interface ReportEngine + EngineKind + ReportConfigBase
│
└── dtos/
    ├── base-report.dto.ts          # F0 — initialDate, finalDate, channelId?, moderatorId?
    └── *.dto.ts                    # DTOs específicos por endpoint (class-validator)
```

> **Convivência com o legado:** o módulo antigo `reports/` continua intacto servindo
> `/nest/reports/*`. O V2 sobe **em paralelo** em `/nest/reports/v2/*`. Nada do legado é
> alterado. O legado só é deprecado quando todos os consumidores migrarem.

---

## 6. Conceitos centrais

### 6.1 Engine

Implementa **um padrão de cálculo**. Recebe `config + accountId + dto + timezone`, monta SQL
parametrizado, executa via `prisma.$queryRawUnsafe`, devolve um shape Zod do contracts.

Contrato comum (`core/report-engine.contract.ts`):

```ts
export const ENGINE_KINDS = [
  "timeSeries", "ranking", "heatmap", "funnel", "aging", "metricCard",
] as const;
export type EngineKind = (typeof ENGINE_KINDS)[number];

export interface ReportConfigBase {
  readonly id: string;        // ex: "contacts.growth"
  readonly engine: EngineKind;
  readonly cacheTtl: number;  // metadado p/ uso futuro — IGNORADO na F1 (cache adiado)
}

export interface ReportEngine<TConfig extends ReportConfigBase, TResponse, TDto extends BaseReportDto = BaseReportDto> {
  readonly kind: EngineKind;
  run(config: TConfig, accountId: string, dto: TDto, timezone: string): Promise<TResponse>;
}
```

### 6.2 Catalog

Lista de configs declarativas, uma por relatório. Exemplo (revenue por etapa, com segmentação):

```ts
export const crmRevenueReport: TimeSeriesConfig = {
  id: "crm.revenue",                       // R02
  engine: "timeSeries",
  cacheTtl: 900,
  source: {
    table: "KanbanCards",
    dateColumn: "statusOportunityUpdatedAt",
    valueColumn: "amount",
    aggregation: "sum",
    accountIdColumn: "accountId",
    softDeleteColumn: "isDeleted",
    // segmentColumn: "utmSource",          // ativa SegmentedTimeSeries quando presente
  },
};
```

### 6.3 Orchestrator

Ponto central. Mantém `Map<id, ReportConfigBase>` (montado por `buildRegistry()`), recebe o
id, acha a config, escolhe o engine pelo discriminator `config.engine`, executa e devolve.
Hoje (F0) é um **stub** que lança `NotFoundException`; será reescrito na F1 Task 9.

### 6.4 Special handler

Para o que **não** cabe em engine (lógica própria). Não entra no `ENGINE_KINDS`; é registrado
no orchestrator ao lado dos engines, implementando um contrato análogo
`SpecialReportHandler<TDto, TResponse>`. O **EventFeed** é o primeiro special porque "feed
cronológico" não é série, ranking nem funil — é UNION de tabelas ordenada por timestamp.

---

## 7. Contratos (shapes de saída)

Vivem em `chatfunnel-contracts/src/endpoints/reports.contracts.ts` (Zod + `z.infer`,
zero runtime). O front e o backend consomem o **mesmo** shape. Estado atual do arquivo
(já com os shapes novos aplicados em 2026-06-03):

### 7.1 Primitivos e padrões

```ts
Granularity        = "day" | "week" | "month"
TimeSeriesPoint    = { date: string; value: number; label?: string }
TimeSeries         = { series: TimeSeriesPoint[]; granularity: Granularity }
FunnelStage        = { id; name; total; conversionFromPrevious? }
FunnelData         = { stages: FunnelStage[] }
HeatmapCell        = { day: 0..6; hour: 0..23; value: number }   // 0 = segunda
HeatmapData        = { cells: HeatmapCell[]; max: number }
RankingEntry       = { id; label; value; meta? }
Ranking            = { entries: RankingEntry[]; total: number }
AgingBucket        = { label; range: [number, number|null]; count }
AgingData          = { buckets: AgingBucket[] }
MetricCard         = { value; format?; delta?; sparkline? }
Dashboard          = { cards: Record<string, MetricCard> }
```

### 7.2 Shapes novos (segmentação + feed)

**Segmentação por origem/UTM/canal** — shape irmão do `TimeSeries`, sem alterá-lo:

```ts
TimeSeriesSegment    = { segment: string; label?: string; points: TimeSeriesPoint[] }
SegmentedTimeSeries  = { granularity: Granularity; segments: TimeSeriesSegment[] }
```

- `segment` = valor cru da dimensão (`"meta"`, `"instagram-organico"`).
- O relatório segmentado é **outra entrada de catálogo** do mesmo engine, com
  `segmentColumn` setado. Não é flag de DTO.
- Por que shape separado: gráfico de série única (linha) e multi-série (multi-linha/stacked)
  são **componentes diferentes** no front; tipos distintos deixam o consumidor explícito e
  evitam `if (segments)` espalhado.

**Feed de eventos** — Geral, Flows e Agendamentos:

```ts
EventFeedItem = {
  id; type;                 // "lead.created" | "automation.executed" | "schedule.created" | ...
  timestamp;                // ISO 8601
  title;                    // string pt-BR PRONTA para exibir (templating fica no handler)
  description?; contactId?; contactName?; meta?;
}
EventFeed = { items: EventFeedItem[]; hasMore: boolean; nextCursor?: string }
```

### 7.3 União despachável

```ts
ReportPayload = TimeSeries | SegmentedTimeSeries | FunnelData | HeatmapData
              | Ranking | AgingData | MetricCard | Dashboard | EventFeed
```

`orchestrator.run<T extends ReportPayload>(...)` usa essa união. **Tudo additivo** — nenhum
shape pré-existente mudou.

---

## 8. Como cada engine funciona (detalhado)

Convenções comuns a todos:
- `accountId` **sempre** no WHERE (multi-tenancy).
- `isDeleted = false` por padrão (soft delete).
- Timezone aplicado via `AT TIME ZONE $n`; datas normalizadas em `period.helper.normalizeRange`.
- Identificadores SQL passam por `quoteIdent()` (regex `^[A-Za-z_][A-Za-z0-9_]*$`) antes de
  ir para `$queryRawUnsafe` — defesa contra injection em nomes de tabela/coluna vindos do config.
- Valores de usuário vão sempre como **parâmetro posicional** (`$1`, `$2`, ...), nunca interpolados.

### 8.1 TimeSeriesEngine

Conta/soma/média agrupada por `DATE_TRUNC(granularity, ...)`. Piloto: **R08** (crescimento de
contatos, `COUNT(*)` em `Contacts` por dia).

SQL (forma base, série única):

```sql
SELECT
  DATE_TRUNC('day', "Contacts"."dateCreated" AT TIME ZONE $4)::date AS date,
  COUNT(*)::float AS value
FROM "Contacts"
WHERE "Contacts"."accountId" = $1
  AND "Contacts"."dateCreated" BETWEEN $2 AND $3
  AND "Contacts"."isDeleted" = false
GROUP BY date
ORDER BY date ASC
```

- Granularidade: vem da DTO; se ausente, `pickGranularity(start, end)` (≤31d → day, ≤120d → week, senão month).
- Agregação: `count` → `COUNT(*)`; `sum`/`avg` → exige `valueColumn`.
- **Segmentação (novo):** se `config.source.segmentColumn` presente, adiciona a coluna ao
  `SELECT` e ao `GROUP BY`, e o engine devolve `SegmentedTimeSeries` (uma `TimeSeriesSegment`
  por valor distinto da coluna) em vez de `TimeSeries`.

### 8.2 RankingEngine

Top-N por contagem/soma, com join na tabela da entidade rankeada. Piloto: **R04** (motivos de
perda: `COUNT(*)` em `KanbanCards` join `KanbanLossesReasons`, `statusOportunity = 'LOST'`).

- `accountId` chega via JOIN com a tabela "dona" (`accountIdJoin: { via, on }` — ex. `Kanbans`).
- `extraWhere` aplica filtros fixos do relatório (ex. status), com escape de aspas.
- `ORDER BY value DESC`; `total` = soma das entries.
- **Origem por ranking não precisa de shape novo:** basta um config com `labelColumn: "utmSource"`
  (a origem vira a entidade rankeada).

### 8.3 HeatmapEngine

Bucket dia-da-semana × hora. Piloto: **R11** (horários de pico de contatos).

- `EXTRACT(ISODOW ...) - 1` converte 1..7 (seg..dom do Postgres) para 0..6 (padrão do contract: 0 = segunda).
- `EXTRACT(HOUR ...)` para a hora; `COUNT(*)` por célula.
- `max` = maior valor de célula (para escala de cor no front).

### 8.4 FunnelEngine

Estágios sequenciais do pipeline. Piloto: **R01**. Exige `pipelineId` (obrigatório).

- F1 usa a **forma base**: conta cards por coluna do Kanban e deriva
  `conversionFromPrevious = total[n] / total[n-1]` (fração 0..1; ausente quando o anterior é 0).
- Leitura **relativa** = `conversionFromPrevious`. Leitura **absoluta** = `total[n] / total[0]`
  (derivada no front ou em campo adicional na Fatia 2).
- A versão refinada via `KanbanCardsHistory` (quem realmente avançou no período) fica para
  fase futura — risco de performance.

### 8.5 AgingEngine

Distribuição por faixa de duração (ex. há quanto tempo um card está parado). Piloto: **R06**.

- Faixas declaradas como buckets `[min, max|null]`; `count` por faixa.
- Coluna de referência (ex. `updatedAt`) comparada com `now()` em horas/dias.

### 8.6 MetricCardEngine

Card de KPI: valor + delta vs período anterior + sparkline. Piloto: **R35**.

- Calcula o valor no período e (quando há comparação) no período anterior → `delta { absolute, percentage }`.
- `sparkline` opcional = mini série temporal do mesmo dado.
- `format` controla a renderização (`number | currency | percentage | duration`).

### 8.7 Special: EventFeedHandler

- Recebe N fontes (`{ table, dateColumn, type, ...mapa para title }`), faz `UNION ALL`
  ordenado por `timestamp DESC`, com `LIMIT` + cursor.
- Devolve `EventFeed`. O `title` já sai como string pt-BR montada no handler.
- O **mesmo** handler atende os 3 feeds por configuração (Geral, Flows, Agendamentos).
  O feed de Agendamentos só liga depois que a Fatia 6 definir a fonte canônica.

---

## 9. Fluxo de uma request (ponta a ponta)

```
[Front] GET /nest/reports/v2/contacts/growth?initialDate=...&finalDate=...
   │     headers: Authorization, Account-Selected, Timezone
   ▼
[ContactsReportsController.growth()]
   │  AuthGuard(jwt) valida token
   │  lê @Headers("Account-Selected") -> accountId
   │  lê @Headers("Timezone")         -> timezone
   │  ValidationPipe transforma query -> ContactsGrowthDto (class-validator)
   ▼
[ReportOrchestrator.run<TimeSeries>("contacts.growth", accountId, dto, timezone)]
   │  config = registry.get("contacts.growth")    // do catálogo
   │  engine = enginesByKind[config.engine]        // "timeSeries"
   ▼
[TimeSeriesEngine.run(config, accountId, dto, timezone)]
   │  normalizeRange(...) + pickGranularity(...)
   │  monta SQL com quoteIdent + params $1..$4
   │  prisma.$queryRawUnsafe(sql, accountId, start, end, timezone)
   ▼
[Postgres] -> rows
   │  map -> { granularity, series: [{date, value}] }   // valida contra contract
   ▼
[Front] renderiza o gráfico a partir do TimeSeries
```

Regras de controller (herdadas do legado/F0):
`@Controller("reports/v2/<domínio>")`, `@UseGuards(AuthGuard("jwt"))`, `@ApiBearerAuth()`,
`@ApiTags(...)`, headers `Account-Selected` e `Timezone`, **rotas literais antes de
parametrizadas**, strings user-facing em pt-BR com acentos.

---

## 10. Fronteira com a Intelligence

- O `ReportsV2Module` é a camada de **métricas curadas e estáveis**.
- Ele expõe **payloads estruturados** (os mesmos shapes do contracts) reaproveitáveis tanto
  no front quanto pela IA.
- Para a IA: a direção é um **reports MCP** (ou endpoint dedicado) que chama o **mesmo**
  `orchestrator.run()` — sem duplicar lógica.
- Para perguntas realmente abertas: abordagem estilo **text-to-sql** com guard-rails
  (read-only, `accountId` obrigatório, whitelist de tabelas, timeout, rate limit).
- Itens que pertencem a esta camada e **não** têm fatia ainda: horas economizadas pela IA,
  mood/sentimento, insights de conversa (top objeções, FAQ). Ver §11.

---

## 11. Decisões em aberto / gaps sem dono

Itens que a reunião levantou e que **não** estão cobertos pelas fatias atuais. Precisam de
decisão antes de virarem trabalho:

| Gap | Natureza | Encaminhamento proposto |
|---|---|---|
| **Horas economizadas pela IA** | Métrica manchete da Geral, sem fonte definida | Definir cálculo (mensagens tratadas por IA × tempo médio? conversas resolvidas sem humano?). Provável Fatia 7 / Intelligence |
| **Mood / sentimento** | Depende de análise de conversa (Intelligence) | Adiar; nomear na Fatia 7 |
| **Insights de conversa** (objeções, FAQ) | Intelligence | Adiar; nomear na Fatia 7 |
| **"Temperatura média"** | Limpeza no produto **atual** | Task avulsa: auditar e remover/renomear — independe das fatias |
| **Agendamentos** | Aba 4 **e** card na Geral, mas sem modelo de `COMPARECEU`/`NO_SHOW` | Bloqueado até a Fatia 6; a Geral declara o card como adiado |
| **Origem vs filtro UTM** | Dois custos diferentes tratados como um | Separar: *agrupar por origem* (SQL, cedo) vs *filtrar por UTM com UI* (Fatia 5) |
| **EventFeed** | Padrão recorrente em 3 abas | Resolvido como special + shape (já no contracts) |

---

## 12. Estado atual (verificado no código)

**Fase 0 — Esqueleto: CONCLUÍDA (2026-06-01).**

- [x] Contracts: shapes Zod em `reports.contracts.ts` (+ `SegmentedTimeSeries` e `EventFeed` em 2026-06-03)
- [x] `core/period.helper.ts` (+ spec)
- [x] `dtos/base-report.dto.ts` (`initialDate`, `finalDate`, `channelId?`, `moderatorId?`)
- [x] `orchestrator/report.orchestrator.ts` — **stub**: registry vazio, lança `NotFoundException`
- [x] `controllers/ping.controller.ts` — `GET /reports/v2/ping`
- [x] `reports-v2.module.ts` registrado no `app.module.ts`
- Cache **adiado** (decisão: F0 valida o fluxo end-to-end sem cache)

**Fase 1 — Engines: NÃO INICIADA no código.** A pasta `reports-v2/` tem só os arquivos do
F0. Ainda não existem `engines/`, `catalog/`, `granularity.helper.ts`,
`report-engine.contract.ts`, nem os DTOs/controllers de domínio. O orchestrator ainda é stub.

> Como a F1 não começou, **reordenar e ajustar o desenho agora custa zero** — é o momento
> mais barato para fixar `segmentColumn` no engine e o special EventFeed.

---

## 13. Plano de execução

Duas óticas do mesmo trabalho, que se reconciliam:

- **F1 (bottom-up, por engine):** prova cada padrão isoladamente com TDD. Detalhe em
  `2026-06-01-reports-v2-f1-engines.md`.
- **Fatias (top-down, por entrega de tela):** entrega valor navegável por aba. Detalhe em
  `2026-06-03-relatorios-v2-implementacao-por-fatias.md`.

### 13.1 F1 — Engines + 1 relatório por padrão (TDD)

| Task | Entrega | Piloto |
|---|---|---|
| 1 | `ReportEngine` + `EngineKind` + `ReportConfigBase` | — |
| 2 | `granularity.helper` (auto day/week/month) | — |
| 3 | `TimeSeriesEngine` **com `segmentColumn?` desde já** | R08 contatos |
| 4 | `RankingEngine` | R04 motivos de perda |
| 5 | `HeatmapEngine` | R11 horários de pico |
| 6 | `FunnelEngine` | R01 funil |
| 7 | `AgingEngine` | R06 aging |
| 8 | `MetricCardEngine` | R35 card |
| 9 | Reescrever orchestrator (resolver catálogo + despachar) | — |
| 10 | Amarrar tudo no `reports-v2.module.ts` | — |

> **Ajuste travado:** a Task 3 nasce com `segmentColumn?` no `TimeSeriesConfig` e capaz de
> emitir `SegmentedTimeSeries`, para não reescrever a saída depois.

### 13.2 Fatias — ordem ajustada

Ordem original do plano: Dashboard → Funil → Automações → Colaboradores → UTM → Schedules.

**Ajustes propostos** (motivados pela análise da reunião, §11):

1. **Fatia 1a — Shell.** Rota + tabs fixas + filtro de período global. Barato, destrava todas as abas e remove o risco de "tudo depende da Geral".
2. **Fatia 2 — Funil (promovido).** É a aba mais valiosa (coração do produto) **e** a mais
   autocontida (single pipeline, sem cross-domain, sem dependência de origem/agendamento).
   Bom candidato a primeira aba com dados reais.
3. **Fatia 1b — Geral (parcial honesta).** leads-series + heatmap + cards de leads
   autocontidos. Declara como adiados: card de Agendamentos (→ Fatia 6), Horas-IA (→ Fatia 7),
   entrada por origem (→ Fatia 1.5).
4. **Fatia 1.5 — Agrupamento por origem (read-only).** `GROUP BY utmSource/origin` nas queries
   de Geral e Funil, **sem** UI de filtro. Entrega "entrada de leads por origem" e "funil por
   origem" sem esperar o cross-repo. (`Contacts` já tem os campos UTM no schema.)
5. **Fatia 3 — Automações MVP.** Volume + ranking + (feed de eventos via EventFeed).
6. **Fatia 4 — Colaboradores MVP.** Tempo de resposta + carga. Itens magros têm dependências
   explícitas: completo = Fatia 1.5 (origem) + Fatia 6 (schedules) + Fatia 7 (sentimento).
7. **Fatia 5 — UTM filters cross-repo.** Filtro por UTM com **UI + propagação** core→api→front.
8. **Fatia 6 — Schedules data model.** Modela `COMPARECEU`/`NO_SHOW`, source-of-truth de
   agendamento (interno + Google Calendar). **Destrava a aba Agendamentos.**
9. **Fatia 7 (nova) — Intelligence / dinâmicos + reports MCP.** Placeholder nomeado para
   horas-IA, mood, insights de conversa. Fora do MVP, depende da Intelligence.

> Distinção que evita inflar a Fatia 5: **agrupar por origem** (SQL, Fatia 1.5) ≠ **filtrar por
> UTM com UI** (Fatia 5). A Geral só precisa do primeiro para a métrica de origem.

### 13.3 Validação por fatia (definition of done)

Cada fatia fecha com:
- [ ] endpoint(s) respondendo `200`
- [ ] shape validado pelo contract do `@chatfunnel/contracts`
- [ ] tela consumindo dados reais
- [ ] loading + estado de erro no front
- [ ] smoke test do fluxo principal
- [ ] update do vault/documentação

---

## 14. Mapa de dependências

```
Fatia 1a (shell) ─────────────┬───────────────┬───────────────┬─────────────┐
                              ▼               ▼               ▼             ▼
                          Fatia 2         Fatia 1b        Fatia 3       Fatia 4
                          (Funil)         (Geral)       (Automações) (Colaboradores)
                              │               │                            │
                              └──────┬────────┘                            │
                                     ▼                                     │
                              Fatia 1.5 (origem read-only) ────────────────┤
                                     │                                     │
                                     ▼                                     │
                              Fatia 5 (UTM filter UI) ─────────────────────┤
                                                                           │
        Fatia 6 (schedules data model) ──► aba Agendamentos ──────────────┤
                                                                           ▼
        Fatia 7 (Intelligence) ──► horas-IA, mood, insights ──► Colaboradores completo
```

---

## 15. Regras técnicas (resumo operacional)

- **Tipagem estrita.** Zero `any`. Engines respeitam `ReportEngine<TConfig, TResponse>`.
  (Atenção: `chatfunnel-services` tem `strictNullChecks: false` e SWC no build — rodar
  `tsc --noEmit` separado para pegar erros de tipo.)
- **DTOs com class-validator** (não Zod no services; Zod só nos contracts).
- **`accountId` obrigatório** em toda query (multi-tenancy).
- **Soft delete** (`isDeleted = false`) default em configs e specials.
- **SQL seguro:** valores via parâmetro posicional; identificadores via `quoteIdent()`.
- **Timezone via header**, resolvido em `period.helper.ts`; engines não calculam fuso à mão.
- **Cache adiado.** `cacheTtl` fica como metadado; orchestrator ignora até a camada existir.
- **Logging via winston** com o `id` do relatório como contexto; SQL gerado logado em DEBUG.
- **Strings user-facing em pt-BR com acentos.**
- **Rota base** `/nest/reports/v2/*`, paralela ao legado, sem tocar no módulo antigo.
- **Sync do contracts é manual** (regra do projeto): novos tipos só aparecem no services
  após build/sync do pacote `@chatfunnel/contracts`.

---

## 16. Referências cruzadas

- Reunião / produto: `docs/research/atividade-relatorios.md`
- Catálogo (34 relatórios): `docs/superpowers/specs/2026-05-24-relatorios-design.md`
- Arquitetura com snippets: `docs/superpowers/specs/2026-05-28-relatorios-v2-arquitetura.md`
- Decisões e backlog: `docs/superpowers/specs/2026-06-03-relatorios-v2-decisoes-e-backlog.md`
- Escopo por aba: `docs/superpowers/specs/2026-06-03-relatorios-v2-escopo-por-aba.md`
- Mapping técnico por aba: `docs/superpowers/specs/2026-06-03-relatorios-v2-mapping-tecnico-por-aba.md`
- Plano por fatias: `docs/superpowers/plans/2026-06-03-relatorios-v2-implementacao-por-fatias.md`
- Plano técnico F1 (TDD): `docs/superpowers/plans/2026-06-01-reports-v2-f1-engines.md`
- Wiki (discussão): `vault/wiki/features/reports-v2-arquitetura.md`
- Regras do services: `chatfunnel-services/CLAUDE.md`
- Contracts: `chatfunnel-contracts/src/endpoints/reports.contracts.ts`
