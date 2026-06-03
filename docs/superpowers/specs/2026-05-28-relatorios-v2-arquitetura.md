# Relatórios V2 — Arquitetura do Módulo

**Data:** 2026-05-28
**Status:** Draft
**Repo:** `chatfunnel-services`
**Branch:** `feature/reports-v2`
**Spec base:** [`2026-05-24-relatorios-design.md`](./2026-05-24-relatorios-design.md)

---

## 1. Resumo

Construir um módulo NestJS novo (`ReportsV2Module`) do zero, em paralelo ao módulo legado, baseado em **engines reusáveis + catálogo declarativo** em vez de um handler por relatório.

**Por que do zero:** o módulo atual tem `any` em todo lugar, sem cache, sem padronização de shape de saída, sem separação entre lógica de cálculo e configuração. Tentar refatorar gradualmente é mais arriscado que escrever paralelo e migrar.

**Por que engines:** dos 34 relatórios do catálogo, 28 caem em 6 padrões de cálculo idênticos. Escrever 34 handlers seria duplicar a mesma estrutura 28 vezes com pequenas variações de tabela/coluna.

---

## 2. Por que não 34 handlers

### 2.1 Análise dos relatórios

Mapeando o catálogo do spec por padrão de cálculo:

| Padrão | Relatórios | Total | O que muda entre eles |
|---|---|---|---|
| **Time series** | R02, R08, R09, R15, R17, R21, R27, R30, R32 | 9 | Tabela, coluna de data, agregação (count/sum/avg) |
| **Ranking** | R04, R05, R10, R13, R14, R18, R23, R25 | 8 | Entidade rankeada, métrica de ordenação, join |
| **Heatmap hora × dia** | R11, R20, R29 | 3 | Tabela, coluna de data |
| **Funil de conversão** | R01, R19, R26 | 3 | Sequência de estágios, fonte das transições |
| **Aging / bucket de duração** | R06, R12, R16 | 3 | Entidade, coluna de referência, faixas |
| **Dashboard composto** | R35, R36, R37 | 3 | Conjunto de métricas a compor |
| **Lógica própria (special)** | R03, R07, R28, R31, R33, R34 | 6 | Algoritmo não padronizável |

Total: **28 relatórios** seguem 6 padrões + **6 casos especiais**.

### 2.2 O problema de 34 handlers

Se cada relatório virar um arquivo `handler.ts` separado:

- **9 cópias do mesmo código de time series** — só mudando o nome da tabela e da coluna
- **8 cópias do mesmo código de ranking** — só mudando o `ORDER BY`
- Mudar o formato do shape de "time series" exige editar 9 arquivos sincronizados
- Fix de cache, timezone ou validação se espalha por 34 lugares
- Risco alto de relatórios "iguais" divergirem ao longo do tempo

### 2.3 A proposta

**6 engines** que implementam cada padrão de cálculo + **catálogo declarativo** descrevendo cada relatório como configuração.

Resultado:

- 6 engines (~100 linhas cada) + 6 handlers especiais = **12 arquivos de lógica**
- Catálogo: cada relatório padronizado vira ~15 linhas de configuração
- Adicionar relatório novo de padrão existente = editar 1 catalog file, sem novo handler

---

## 3. Estrutura de pastas

```
chatfunnel-services/src/modules/reports-v2/
├── reports-v2.module.ts               # registra controllers, services, orchestrator, engines
│
├── controllers/                       # um por domínio, endpoints finos
│   ├── crm.controller.ts              # GET /reports/v2/crm/*
│   ├── contacts.controller.ts         # GET /reports/v2/contacts/*
│   ├── messages.controller.ts         # GET /reports/v2/messages/*
│   ├── automations.controller.ts      # GET /reports/v2/automations/*
│   ├── broadcasts.controller.ts       # GET /reports/v2/broadcasts/*
│   ├── agents.controller.ts           # GET /reports/v2/agents/*
│   └── dashboard.controller.ts        # GET /reports/v2/dashboard/*
│
├── orchestrator/
│   └── report.orchestrator.ts         # recebe id do relatório, escolhe engine, cacheia
│
├── engines/                           # os 6 padrões reusáveis
│   ├── time-series.engine.ts          # count/sum/avg agrupado por dia/semana/mês
│   ├── ranking.engine.ts              # top-N por métrica
│   ├── heatmap.engine.ts              # bucket hora × dia da semana
│   ├── funnel.engine.ts               # estágios sequenciais com taxa de conversão
│   ├── aging.engine.ts                # distribuição por faixa de duração
│   └── metric-card.engine.ts          # valor + delta vs período anterior + sparkline
│
├── catalog/                           # 28 relatórios como configuração declarativa
│   ├── crm.catalog.ts                 # R01, R02, R04, R05, R06 (R03, R07 são specials)
│   ├── contacts.catalog.ts            # R08-R14
│   ├── messages.catalog.ts            # R15-R20
│   ├── automations.catalog.ts         # R21, R23, R25
│   ├── broadcasts.catalog.ts          # R26, R27, R29 (R28 é special)
│   ├── agents.catalog.ts              # R30, R32 (R31, R33, R34 são specials)
│   └── dashboard.catalog.ts           # R35, R36, R37
│
├── handlers/                          # apenas os 6 casos especiais
│   ├── crm-velocity.handler.ts        # R03 — percorre KanbanCardsHistory por card
│   ├── crm-forecast.handler.ts        # R07 — soma ponderada por posição da etapa
│   ├── broadcasts-reach-by-segment.handler.ts  # R28
│   ├── agents-satisfaction.handler.ts # R31 — histograma de notas
│   ├── agents-resolution-rate.handler.ts       # R33
│   └── agents-human-vs-ai.handler.ts  # R34 — comparativo lado a lado
│
├── core/
│   ├── report-handler.base.ts         # contrato comum entre engines e specials
│   ├── report-cache.service.ts        # wrapper Redis com hash de DTO — ADIADO (não entra na F1)
│   ├── period.helper.ts               # normalização de datas + timezone
│   ├── period-comparison.helper.ts    # cálculo de período anterior (R36)
│   └── chart-data.types.ts            # shapes padronizados de saída
│
├── dtos/
│   ├── base-report.dto.ts             # initialDate, finalDate, channelId?, moderatorId?
│   ├── period-comparison.dto.ts       # adiciona previousInitialDate, previousFinalDate
│   └── filters.dto.ts                 # filtros extras por domínio (pipelineId, tagId, etc.)
│
└── repositories/                      # repos próprios do módulo, queries otimizadas
    ├── reports-crm.repository.ts
    ├── reports-contacts.repository.ts
    ├── reports-messages.repository.ts
    ├── reports-automations.repository.ts
    ├── reports-broadcasts.repository.ts
    └── reports-agents.repository.ts
```

---

## 4. Componentes principais

### 4.1 Engine — `engines/time-series.engine.ts`

Implementa o padrão genérico de série temporal. Recebe uma config + dto e gera SQL dinâmico.

```ts
type TimeSeriesConfig = {
  id: string;
  engine: "timeSeries";
  cacheTtl: number;
  source: {
    table: string;
    dateColumn: string;
    valueColumn?: string;              // se omitido, agregação vira COUNT
    aggregation: "count" | "sum" | "avg";
    accountIdColumn?: string;          // path direto
    accountIdJoin?: { via: string; on: string };  // ou via join
    where?: Record<string, unknown>;
    groupBy?: string[];                // dimensões adicionais (ex: status, channel)
  };
  filters: Array<"channelId" | "moderatorId" | "pipelineId" | "tagId">;
};

@Injectable()
export class TimeSeriesEngine implements ReportEngine<TimeSeriesConfig, TimeSeries> {
  async run(config: TimeSeriesConfig, accountId: string, dto: BaseReportDto, timezone: string): Promise<TimeSeries> {
    // 1. monta SELECT com DATE_TRUNC pela granularidade pedida
    // 2. aplica filtros conforme config.filters
    // 3. roda $queryRawUnsafe parametrizado
    // 4. retorna { series: TimeSeriesPoint[], granularity }
  }
}
```

Um único engine atende 9 relatórios diferentes.

### 4.2 Catalog — `catalog/crm.catalog.ts`

Cada relatório padronizado é um objeto:

```ts
export const crmRevenueReport: TimeSeriesConfig = {
  id: "crm.revenue",                              // R02
  engine: "timeSeries",
  cacheTtl: 900,
  source: {
    table: "KanbanCards",
    dateColumn: "statusOportunityUpdatedAt",
    valueColumn: "amount",
    aggregation: "sum",
    accountIdJoin: { via: "Kanbans", on: "kanbanId" },
    where: { isDeleted: false },
    groupBy: ["statusOportunity"],
  },
  filters: ["pipelineId", "moderatorId"],
};

export const crmLossReasonsReport: RankingConfig = {
  id: "crm.loss-reasons",                         // R04
  engine: "ranking",
  cacheTtl: 1800,
  source: {
    table: "KanbanCards",
    joinTable: "KanbanLossesReasons",
    rankBy: "count",
    labelColumn: "KanbanLossesReasons.name",
    accountIdJoin: { via: "Kanbans", on: "kanbanId" },
    where: { isDeleted: false, statusOportunity: "LOST" },
  },
  filters: ["pipelineId"],
};

export const crmCatalog = {
  [crmRevenueReport.id]: crmRevenueReport,
  [crmLossReasonsReport.id]: crmLossReasonsReport,
  // ...R01, R05, R06
};
```

### 4.3 Orchestrator — `orchestrator/report.orchestrator.ts`

Ponto único de entrada. Escolhe engine e executa. (Cache adiado — pseudocódigo abaixo mostra a versão futura; na F1 as chamadas `cache.get` / `cache.set` são omitidas e o engine roda direto.)

```ts
@Injectable()
export class ReportOrchestrator {
  private readonly registry: Map<string, ReportConfig>;

  constructor(
    private readonly cache: ReportCacheService,
    private readonly timeSeries: TimeSeriesEngine,
    private readonly ranking: RankingEngine,
    private readonly heatmap: HeatmapEngine,
    private readonly funnel: FunnelEngine,
    private readonly aging: AgingEngine,
    private readonly metricCard: MetricCardEngine,
    // specials são injetados como handlers separados
    private readonly specials: SpecialHandlersRegistry,
  ) {
    this.registry = buildRegistry();   // junta todos os catalogs
  }

  async run<T>(reportId: string, accountId: string, dto: BaseReportDto, timezone: string): Promise<T> {
    const cached = await this.cache.get<T>(reportId, accountId, dto);
    if (cached) return cached;

    const config = this.registry.get(reportId);
    if (!config) {
      // pode ser um special
      const special = this.specials.get(reportId);
      if (!special) throw new NotFoundException(`Relatório ${reportId} não encontrado`);
      const result = await special.execute(accountId, dto, timezone);
      await this.cache.set(reportId, accountId, dto, result, special.cacheTtl);
      return result as T;
    }

    const engine = this.engineFor(config.engine);
    const result = await engine.run(config, accountId, dto, timezone);
    await this.cache.set(reportId, accountId, dto, result, config.cacheTtl);
    return result as T;
  }
}
```

### 4.4 Controller — `controllers/crm.controller.ts`

Endpoints viram one-liners que só escolhem o id do relatório:

```ts
@Controller("reports/v2/crm")
@UseGuards(AuthGuard("jwt"))
@ApiBearerAuth()
@ApiTags("Relatórios V2 — CRM")
export class CrmReportsController {
  constructor(private readonly orchestrator: ReportOrchestrator) {}

  @Get("funnel")
  funnel(
    @Headers("Account-Selected") accountId: string,
    @Headers("Timezone") timezone: string,
    @Query() dto: CrmFunnelDto,
  ) {
    return this.orchestrator.run("crm.funnel", accountId, dto, timezone);
  }

  @Get("revenue")
  revenue(@Headers("Account-Selected") accountId, @Query() dto: CrmRevenueDto, @Headers("Timezone") tz) {
    return this.orchestrator.run("crm.revenue", accountId, dto, tz);
  }

  @Get("velocity")
  velocity(@Headers("Account-Selected") accountId, @Query() dto: CrmVelocityDto, @Headers("Timezone") tz) {
    return this.orchestrator.run("crm.velocity", accountId, dto, tz);  // resolve como special
  }

  // ...loss-reasons, seller-performance, aging, forecast
}
```

### 4.5 Special handler — `handlers/crm-velocity.handler.ts`

Para os 6 relatórios que não cabem em config. Mesma interface que engines:

```ts
@Injectable()
export class CrmVelocityHandler implements SpecialReportHandler {
  readonly id = "crm.velocity";
  readonly cacheTtl = 1800;

  constructor(private readonly repo: ReportsCrmRepository) {}

  async execute(accountId: string, dto: CrmVelocityDto, timezone: string) {
    // lógica custom: percorre KanbanCardsHistory por card,
    // calcula diff entre movimentações, agrega por etapa
    const history = await this.repo.fetchCardHistoryForVelocity(accountId, dto);
    return computeVelocityByStage(history);
  }
}
```

### 4.6 Tipos de saída — `core/chart-data.types.ts`

Todos os relatórios retornam usando esses primitivos. O front consome um shape por padrão, não 34:

```ts
export type Granularity = "day" | "week" | "month";

export type TimeSeriesPoint = { date: string; value: number; label?: string };
export type TimeSeries = { series: TimeSeriesPoint[]; granularity: Granularity };

export type FunnelStage = {
  id: string;
  name: string;
  total: number;
  conversionFromPrevious?: number;     // % entre etapas
};
export type FunnelData = { stages: FunnelStage[] };

export type HeatmapCell = {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6;       // 0 = segunda
  hour: number;                         // 0-23
  value: number;
};
export type HeatmapData = { cells: HeatmapCell[]; max: number };

export type RankingEntry<T = Record<string, unknown>> = {
  id: string;
  label: string;
  value: number;
  meta?: T;
};
export type Ranking = { entries: RankingEntry[]; total: number };

export type AgingBucket = {
  label: string;                        // "< 3 dias", "3-7 dias", etc.
  range: [number, number | null];       // dias
  count: number;
};
export type AgingData = { buckets: AgingBucket[] };

export type MetricCard = {
  value: number;
  format?: "number" | "currency" | "percentage" | "duration";
  delta?: { absolute: number; percentage: number };
  sparkline?: TimeSeriesPoint[];
};
export type Dashboard = { cards: Record<string, MetricCard> };
```

---

## 5. Por que usar — comparativo

### 5.1 Adicionar relatório novo

**Cenário:** cliente pede "relatório de tags criadas por dia".

**Abordagem 1 handler/relatório:**

1. Criar `commands/tags-created/handler.ts`
2. Criar `commands/tags-created/dto.ts`
3. Criar `commands/tags-created/response.ts`
4. Registrar handler no `reports.service.ts`
5. Adicionar endpoint no controller
6. Escrever lógica de query, cache, timezone, validação

Linhas escritas: ~120. Tempo: ~30min.

**Abordagem engines + catalog:**

1. Adicionar entrada em `catalog/tags.catalog.ts`:
   ```ts
   export const tagsCreatedReport: TimeSeriesConfig = {
     id: "tags.created",
     engine: "timeSeries",
     cacheTtl: 1800,
     source: {
       table: "Tags",
       dateColumn: "createdAt",
       aggregation: "count",
       accountIdColumn: "accountId",
       where: { isDeleted: false },
     },
     filters: [],
   };
   ```
2. Adicionar endpoint no controller (3 linhas)

Linhas escritas: ~18. Tempo: ~3min.

### 5.2 Mudança no shape de "time series"

**Cenário:** o front precisa que cada ponto traga também a contagem acumulada.

**Abordagem 1 handler/relatório:** editar 9 handlers (ou correr risco de alguns ficarem desatualizados).

**Abordagem engines + catalog:** editar `TimeSeriesEngine` em 1 lugar. Os 9 relatórios herdam automaticamente.

### 5.3 Fix de bug em cache, timezone, formato de data

**Abordagem 1 handler/relatório:** 34 lugares para auditar.

**Abordagem engines + catalog:** 1 lugar (`ReportOrchestrator`, `period.helper.ts`, `report-cache.service.ts`).

### 5.4 Garantia de consistência

Com 34 handlers, é inevitável que dois relatórios "iguais" divirjam. Um usa `DATE_TRUNC`, outro usa `to_char`. Um arredonda no SQL, outro no TypeScript. Um aplica timezone, outro não.

Com engines, **é impossível divergir** — todos passam pelo mesmo código.

---

## 6. Trade-offs

| Aspecto | Engines + catalog | 1 handler/relatório |
|---|---|---|
| Arquivos de lógica | 12 | 34 |
| Setup inicial | Maior (engines + orchestrator) | Menor (só copiar pattern) |
| Adicionar relatório padronizado | 1 config, ~15 linhas | 1 handler, ~120 linhas |
| Adicionar caso especial | Mesma carga que abordagem 1 | Mesma carga |
| Curva de aprendizado | Precisa entender o conceito de engine | Mais óbvio à primeira vista |
| Debugging de SQL | SQL é construído dinâmicamente — log do query gerado é obrigatório | SQL literal no handler |
| Flexibilidade extrema | Limitada ao que o engine suporta | Total |
| Risco de over-engineering | Real, se tentar parametrizar demais | Baixo |

**Mitigação dos riscos:**

- **Engines limitados de propósito.** Se uma feature pedida não cabe no engine sem virar canivete suíço, vira special handler. Não adiciona campo no engine para um caso só.
- **SQL gerado é logado em DEBUG.** Toda execução de engine loga o SQL final gerado para auditoria.
- **Specials existem desde o dia 1.** Não força tudo no engine — 6 dos 34 já entram como special.

---

## 7. Padrão técnico (regras do módulo)

- **Tipagem estrita.** Zero `any`. Todo response tem tipo. `ReportEngine<TConfig, TResponse>` e `SpecialReportHandler<TDto, TResponse>` são contratos genéricos.
- **DTOs com class-validator** (padrão do `chatfunnel-services` — Zod não entra aqui).
- **`accountId` obrigatório.** Toda query do engine inclui automaticamente o filtro de tenant. Specials passam explicitamente.
- **Soft delete.** `isDeleted: false` é default em todas as configs e specials.
- **Cache adiado.** A camada de cache (Redis + `ReportCacheService`) **não entra na F1**. O orchestrator chama o engine direto. Cada config segue declarando `cacheTtl` como metadado (para uso futuro), mas o orchestrator ignora esse campo enquanto a camada não for implementada. Quando o volume de queries justificar, ativar a camada é uma mudança isolada no orchestrator — engines e configs não mudam.
- **Timezone via header.** `Timezone` é resolvido em `period.helper.ts` — engines não fazem cálculo de fuso direto.
- **Strings user-facing em pt-BR com acentos.** Labels de erro, mensagens de validação.
- **Logging via winston** com `name` do relatório como contexto.

---

## 8. Migração e coexistência com o legado

- **Sem alteração no `ReportsModule` atual.** Ele continua servindo `/nest/reports/*`.
- **`ReportsV2Module` registrado no `app.module.ts`** lado a lado.
- **Rota base:** `/nest/reports/v2/*`.
- **Front decide quando migrar.** O endpoint legado fica disponível enquanto o consumo não migra para V2.
- **Quando todos os consumidores estiverem em V2,** o módulo legado pode ser deprecado. Não antes.

---

## 9. Plano de implementação sugerido

### Fase 0 — Esqueleto (1 dia)

- `reports-v2.module.ts` registrado em `app.module.ts`
- `core/chart-data.types.ts`, `core/report-cache.service.ts`, `core/period.helper.ts`
- `dtos/base-report.dto.ts`
- `orchestrator/report.orchestrator.ts` (sem nenhum engine ainda)
- 1 endpoint dummy retornando shape de teste

### Fase 1 — Engines + 1 relatório por padrão (2-3 dias)

- `TimeSeriesEngine` + 1 config (R08 contatos)
- `RankingEngine` + 1 config (R04 motivos de perda)
- `HeatmapEngine` + 1 config (R11 horários de pico)
- `FunnelEngine` + 1 config (R01 funil de conversão)
- `AgingEngine` + 1 config (R06 aging)
- `MetricCardEngine` + 1 config (R35 card do dashboard)

Validar shape de saída no front com 1 relatório de cada padrão antes de seguir.

> **Sem cache na F1.** O `ReportCacheService` não é implementado nesta fase — orchestrator chama o engine direto. Será adicionado em fase posterior, quando o volume de queries justificar, como mudança isolada no orchestrator.

### Fase 2 — Especiais (1-2 dias)

- R03 velocidade
- R07 forecast
- R31 satisfação
- R33 taxa de resolução
- R34 humano vs IA
- R28 alcance por segmento

### Fase 3 — Popular o catálogo (1-2 dias)

Adicionar as 22 configs restantes (cada uma ~15 linhas) nos respectivos catalogs.

### Fase 4 — Migration de indexes (paralelo, feito uma vez)

Migration com os 6 indexes compostos do spec base. Roda independente dos handlers.

---

## 10. Referências cruzadas

- Spec do catálogo: [`2026-05-24-relatorios-design.md`](./2026-05-24-relatorios-design.md)
- Regras do `chatfunnel-services`: `chatfunnel-services/CLAUDE.md`
- Padrões de arquitetura do workspace: `CLAUDE.md` raiz
- Branch ativa: `feature/reports-v2` (front, services, core)
