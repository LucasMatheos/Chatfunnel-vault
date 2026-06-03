# Reports V2 — Fase F1 (Engines + 1 Relatório por Padrão) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar os 6 engines reusáveis (`TimeSeries`, `Ranking`, `Heatmap`, `Funnel`, `Aging`, `MetricCard`) e um relatório piloto por engine (R08 contatos, R04 motivos de perda, R11 horários de pico, R01 funil, R06 aging, R35 card do dashboard). Evoluir o orchestrator da F0 para resolver configs do catalog e despachar por engine. **Cache permanece adiado** (não entra nesta fase).

**Architecture:** Engines são providers NestJS que recebem `config + dto + accountId + timezone` e devolvem um shape Zod do `@chatfunnel/contracts/endpoints/reports.contracts.ts` (F0). Catálogo é declarativo em arquivos por domínio (`contacts.catalog.ts`, `crm.catalog.ts`, `dashboard.catalog.ts`). Orchestrator mantém `Map<id, ReportConfigBase>` e roteia para o engine certo via discriminator `engine: EngineKind`. Engines executam SQL parametrizado via `prisma.$queryRawUnsafe`. Sem `ReportCacheService` nesta fase — quando o volume justificar, a camada é uma mudança isolada no orchestrator.

**Tech Stack:**
- `chatfunnel-services`: NestJS 10, Prisma (`$queryRawUnsafe`), class-validator + class-transformer (DTOs de input), moment-timezone, Jest + ts-jest. TypeScript estrito (zero `any`).
- Shapes de saída: importados de `@chatfunnel/contracts/endpoints` (entregues na F0).

**Branch:** `feature/reports-v2` (mesma da F0).

**Especificação base:**
- `docs/superpowers/specs/2026-05-28-relatorios-v2-arquitetura.md` (versão com cache adiado)
- `docs/superpowers/specs/2026-05-24-relatorios-design.md` (catálogo R01–R35)
- `vault/wiki/features/reports-v2-arquitetura.md`

---

## File Structure

```
chatfunnel-services/src/modules/reports-v2/
├── core/
│   ├── period.helper.ts                       # mantido da F0
│   ├── granularity.helper.ts                  # NOVO — auto-pick day/week/month
│   ├── granularity.helper.spec.ts             # NOVO
│   └── report-engine.contract.ts              # NOVO — interface ReportEngine + EngineKind
│
├── engines/
│   ├── time-series.engine.ts                  # NOVO — atende R08 (e futuros R02, R09, R15, R17, R21, R27, R30, R32)
│   ├── time-series.engine.spec.ts
│   ├── ranking.engine.ts                      # NOVO — atende R04
│   ├── ranking.engine.spec.ts
│   ├── heatmap.engine.ts                      # NOVO — atende R11
│   ├── heatmap.engine.spec.ts
│   ├── funnel.engine.ts                       # NOVO — atende R01
│   ├── funnel.engine.spec.ts
│   ├── aging.engine.ts                        # NOVO — atende R06
│   ├── aging.engine.spec.ts
│   ├── metric-card.engine.ts                  # NOVO — atende R35
│   └── metric-card.engine.spec.ts
│
├── catalog/
│   ├── contacts.catalog.ts                    # NOVO — contacts.growth (R08), contacts.peak-hours (R11)
│   ├── crm.catalog.ts                         # NOVO — crm.loss-reasons (R04), crm.funnel (R01), crm.aging (R06)
│   ├── dashboard.catalog.ts                   # NOVO — dashboard.card-contacts-new (R35)
│   └── index.ts                               # NOVO — buildRegistry() junta todos os catalogs
│
├── dtos/
│   ├── base-report.dto.ts                     # mantido da F0
│   ├── contacts-growth.dto.ts                 # NOVO
│   ├── contacts-peak-hours.dto.ts             # NOVO
│   ├── crm-loss-reasons.dto.ts                # NOVO
│   ├── crm-funnel.dto.ts                      # NOVO
│   ├── crm-aging.dto.ts                       # NOVO
│   └── dashboard-card.dto.ts                  # NOVO
│
├── controllers/
│   ├── ping.controller.ts                     # mantido da F0
│   ├── contacts.controller.ts                 # NOVO
│   ├── crm.controller.ts                      # NOVO
│   └── dashboard.controller.ts                # NOVO
│
├── orchestrator/
│   ├── report.orchestrator.ts                 # REESCRITO (substitui o stub da F0)
│   └── report.orchestrator.spec.ts            # REESCRITO
│
└── reports-v2.module.ts                       # ATUALIZADO — registra todos engines + controllers
```

**Modificações fora do módulo:** nenhuma. F1 fica contida em `reports-v2/`.

**Convenções herdadas da F0 / legado:**
- DTOs: `@ApiProperty` + `class-validator` + `@Transform`
- Controllers: `@Headers("Account-Selected")`, `@Headers("Timezone")`, `@UseGuards(AuthGuard("jwt"))`, `@ApiBearerAuth()`, `@ApiTags(...)`
- Datas: `moment.utc(...).format("YYYY-MM-DD HH:mm:ss")` + `moment.tz(string, timezone)` (já encapsulado em `period.helper.ts`)
- Strings user-facing em pt-BR **com acentos**
- Zero `any`. Engines respeitam `ReportEngine<TConfig, TResponse>`.
- Imports de tipo de saída sempre via `import type { ... } from "@chatfunnel/contracts/endpoints"`.

---

## Task 1: Contrato base `ReportEngine` + `EngineKind`

Define a interface comum entre engines e o discriminator usado pelo orchestrator. Sem TDD dedicado (só tipos).

**Files:**
- Create: `chatfunnel-services/src/modules/reports-v2/core/report-engine.contract.ts`

- [ ] **Step 1: Criar o contract**

```ts
// src/modules/reports-v2/core/report-engine.contract.ts
import type { BaseReportDto } from "../dtos/base-report.dto";

export const ENGINE_KINDS = [
  "timeSeries",
  "ranking",
  "heatmap",
  "funnel",
  "aging",
  "metricCard",
] as const;

export type EngineKind = (typeof ENGINE_KINDS)[number];

export interface ReportConfigBase {
  readonly id: string;
  readonly engine: EngineKind;
  /**
   * TTL em segundos para o cache.
   *
   * Mantido como metadado para uso futuro — a camada de cache não está
   * implementada na F1. O orchestrator ignora este campo até a camada
   * ser introduzida.
   */
  readonly cacheTtl: number;
}

export interface ReportEngine<
  TConfig extends ReportConfigBase,
  TResponse,
  TDto extends BaseReportDto = BaseReportDto,
> {
  readonly kind: EngineKind;
  run(
    config: TConfig,
    accountId: string,
    dto: TDto,
    timezone: string,
  ): Promise<TResponse>;
}
```

- [ ] **Step 2: Garantir que compila**

Run: `cd chatfunnel-services && npx tsc --noEmit -p tsconfig.json`
Expected: sem erros.

---

## Task 2: Helper de granularidade automática

Auto-pick `day | week | month` baseado no tamanho do range. Usado por engines de série temporal (`TimeSeries`, `MetricCard.sparkline`). TDD.

**Files:**
- Create: `chatfunnel-services/src/modules/reports-v2/core/granularity.helper.ts`
- Test: `chatfunnel-services/src/modules/reports-v2/core/granularity.helper.spec.ts`

- [ ] **Step 1: Escrever o spec falhando**

```ts
// src/modules/reports-v2/core/granularity.helper.spec.ts
import { pickGranularity } from "./granularity.helper";

describe("pickGranularity", () => {
  it("retorna 'day' para range de até 31 dias", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const end = new Date("2026-01-31T23:59:59Z");
    expect(pickGranularity(start, end)).toBe("day");
  });

  it("retorna 'week' para range entre 32 e 120 dias", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const end = new Date("2026-03-15T23:59:59Z"); // ~73 dias
    expect(pickGranularity(start, end)).toBe("week");
  });

  it("retorna 'month' para range maior que 120 dias", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const end = new Date("2026-12-31T23:59:59Z"); // ~365 dias
    expect(pickGranularity(start, end)).toBe("month");
  });

  it("retorna 'day' quando start == end", () => {
    const date = new Date("2026-01-15T00:00:00Z");
    expect(pickGranularity(date, date)).toBe("day");
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `cd chatfunnel-services && npx jest src/modules/reports-v2/core/granularity.helper.spec.ts`
Expected: FAIL — `Cannot find module './granularity.helper'`.

- [ ] **Step 3: Implementar o helper**

```ts
// src/modules/reports-v2/core/granularity.helper.ts
import type { Granularity } from "@chatfunnel/contracts/endpoints";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAY_THRESHOLD = 31;
const WEEK_THRESHOLD = 120;

export function pickGranularity(start: Date, end: Date): Granularity {
  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / MS_PER_DAY));
  if (days <= DAY_THRESHOLD) return "day";
  if (days <= WEEK_THRESHOLD) return "week";
  return "month";
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `cd chatfunnel-services && npx jest src/modules/reports-v2/core/granularity.helper.spec.ts`
Expected: PASS — 4 testes.

---

## Task 3: `TimeSeriesEngine` + R08 (`contacts.growth`)

Primeiro engine implementado. Estabelece o padrão: TDD com `PrismaService` mockado, SQL parametrizado, output tipado vindo do contracts. R08 = "Crescimento de contatos". Query: `COUNT(*)` em `Contacts` por dia/semana/mês, filtrado por `accountId` e `isDeleted=false`.

**Files:**
- Create: `chatfunnel-services/src/modules/reports-v2/engines/time-series.engine.ts`
- Test: `chatfunnel-services/src/modules/reports-v2/engines/time-series.engine.spec.ts`
- Create: `chatfunnel-services/src/modules/reports-v2/catalog/contacts.catalog.ts`
- Create: `chatfunnel-services/src/modules/reports-v2/dtos/contacts-growth.dto.ts`
- Create: `chatfunnel-services/src/modules/reports-v2/controllers/contacts.controller.ts`

- [ ] **Step 1: Criar a DTO `ContactsGrowthDto`**

```ts
// src/modules/reports-v2/dtos/contacts-growth.dto.ts
import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsIn, IsOptional, IsUUID } from "class-validator";
import type { Granularity } from "@chatfunnel/contracts/endpoints";
import { BaseReportDto } from "./base-report.dto";

const GRANULARITIES: ReadonlyArray<Granularity> = ["day", "week", "month"];

export class ContactsGrowthDto extends BaseReportDto {
  @ApiProperty({
    description: "Granularidade da série (default: auto pelo tamanho do range)",
    enum: GRANULARITIES,
    required: false,
  })
  @IsOptional()
  @IsIn(GRANULARITIES as Granularity[])
  granularity?: Granularity;

  @ApiProperty({
    description: "ID da tag para filtrar contatos",
    required: false,
  })
  @IsOptional()
  @IsUUID()
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value : undefined))
  tagId?: string;
}
```

- [ ] **Step 2: Escrever o spec da engine falhando**

```ts
// src/modules/reports-v2/engines/time-series.engine.spec.ts
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "../../../prisma/prisma.service";
import { TimeSeriesEngine, TimeSeriesConfig } from "./time-series.engine";
import { ContactsGrowthDto } from "../dtos/contacts-growth.dto";

const config: TimeSeriesConfig = {
  id: "contacts.growth",
  engine: "timeSeries",
  cacheTtl: 900,
  source: {
    table: "Contacts",
    dateColumn: "dateCreated",
    aggregation: "count",
    accountIdColumn: "accountId",
    softDeleteColumn: "isDeleted",
  },
};

describe("TimeSeriesEngine", () => {
  let engine: TimeSeriesEngine;
  let prisma: { $queryRawUnsafe: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRawUnsafe: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TimeSeriesEngine,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    engine = moduleRef.get(TimeSeriesEngine);
  });

  it("expõe kind === 'timeSeries'", () => {
    expect(engine.kind).toBe("timeSeries");
  });

  it("monta SQL com DATE_TRUNC pela granularidade, filtra accountId e isDeleted e devolve TimeSeries tipado", async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      { date: new Date("2026-01-01T00:00:00Z"), value: 10 },
      { date: new Date("2026-01-02T00:00:00Z"), value: 15 },
    ]);

    const dto: ContactsGrowthDto = {
      initialDate: new Date("2026-01-01T00:00:00Z"),
      finalDate: new Date("2026-01-10T00:00:00Z"),
    };

    const result = await engine.run(config, "acc-1", dto, "America/Sao_Paulo");

    expect(result.granularity).toBe("day");
    expect(result.series).toEqual([
      { date: "2026-01-01", value: 10 },
      { date: "2026-01-02", value: 15 },
    ]);

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    const sql = prisma.$queryRawUnsafe.mock.calls[0][0] as string;
    expect(sql).toContain(`DATE_TRUNC('day'`);
    expect(sql).toContain(`"Contacts"`);
    expect(sql).toContain(`"dateCreated"`);
    expect(sql).toContain(`"accountId" = $1`);
    expect(sql).toContain(`"isDeleted" = false`);
    expect(prisma.$queryRawUnsafe.mock.calls[0]).toEqual(
      expect.arrayContaining(["acc-1"]),
    );
  });

  it("respeita granularidade explícita da DTO", async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([]);

    const dto: ContactsGrowthDto = {
      initialDate: new Date("2026-01-01T00:00:00Z"),
      finalDate: new Date("2026-01-10T00:00:00Z"),
      granularity: "week",
    };

    const result = await engine.run(config, "acc-1", dto, "America/Sao_Paulo");

    expect(result.granularity).toBe("week");
    const sql = prisma.$queryRawUnsafe.mock.calls[0][0] as string;
    expect(sql).toContain(`DATE_TRUNC('week'`);
  });

  it("lança erro quando initialDate ou finalDate são ausentes", async () => {
    const dto: ContactsGrowthDto = {};

    await expect(
      engine.run(config, "acc-1", dto, "America/Sao_Paulo"),
    ).rejects.toThrow(/initialDate.*finalDate.*obrigatórios/i);
  });

  it("usa SUM quando aggregation = 'sum'", async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([]);

    const sumConfig: TimeSeriesConfig = {
      ...config,
      source: { ...config.source, aggregation: "sum", valueColumn: "amount" },
    };

    await engine.run(
      sumConfig,
      "acc-1",
      {
        initialDate: new Date("2026-01-01T00:00:00Z"),
        finalDate: new Date("2026-01-10T00:00:00Z"),
      },
      "America/Sao_Paulo",
    );

    const sql = prisma.$queryRawUnsafe.mock.calls[0][0] as string;
    expect(sql).toContain(`SUM("amount")`);
  });
});
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `cd chatfunnel-services && npx jest src/modules/reports-v2/engines/time-series.engine.spec.ts`
Expected: FAIL — `Cannot find module './time-series.engine'`.

- [ ] **Step 4: Implementar a engine**

```ts
// src/modules/reports-v2/engines/time-series.engine.ts
import { BadRequestException, Injectable } from "@nestjs/common";
import type { Granularity, TimeSeries } from "@chatfunnel/contracts/endpoints";
import { PrismaService } from "../../../prisma/prisma.service";
import { normalizeRange } from "../core/period.helper";
import { pickGranularity } from "../core/granularity.helper";
import {
  ReportConfigBase,
  ReportEngine,
} from "../core/report-engine.contract";
import { BaseReportDto } from "../dtos/base-report.dto";

export interface TimeSeriesConfig extends ReportConfigBase {
  readonly engine: "timeSeries";
  readonly source: {
    readonly table: string;
    readonly dateColumn: string;
    readonly aggregation: "count" | "sum" | "avg";
    readonly valueColumn?: string;
    readonly accountIdColumn: string;
    readonly softDeleteColumn?: string;
  };
}

interface TimeSeriesDto extends BaseReportDto {
  granularity?: Granularity;
}

interface Row {
  date: Date;
  value: number;
}

@Injectable()
export class TimeSeriesEngine
  implements ReportEngine<TimeSeriesConfig, TimeSeries, TimeSeriesDto>
{
  readonly kind = "timeSeries" as const;

  constructor(private readonly prisma: PrismaService) {}

  async run(
    config: TimeSeriesConfig,
    accountId: string,
    dto: TimeSeriesDto,
    timezone: string,
  ): Promise<TimeSeries> {
    if (!dto.initialDate || !dto.finalDate) {
      throw new BadRequestException(
        "initialDate e finalDate são obrigatórios em TimeSeries",
      );
    }

    const { start, end } = normalizeRange(dto.initialDate, dto.finalDate, timezone);
    const granularity = dto.granularity ?? pickGranularity(start, end);

    const valueExpr = this.buildValueExpression(config);
    const table = quoteIdent(config.source.table);
    const dateCol = quoteIdent(config.source.dateColumn);
    const accountCol = quoteIdent(config.source.accountIdColumn);
    const softDeleteFilter = config.source.softDeleteColumn
      ? `AND ${table}.${quoteIdent(config.source.softDeleteColumn)} = false`
      : "";

    const sql = `
      SELECT
        DATE_TRUNC('${granularity}', ${table}.${dateCol} AT TIME ZONE $4)::date AS date,
        ${valueExpr}::float AS value
      FROM ${table}
      WHERE ${table}.${accountCol} = $1
        AND ${table}.${dateCol} BETWEEN $2 AND $3
        ${softDeleteFilter}
      GROUP BY date
      ORDER BY date ASC
    `;

    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      sql,
      accountId,
      start,
      end,
      timezone,
    );

    return {
      granularity,
      series: rows.map((row) => ({
        date: row.date.toISOString().slice(0, 10),
        value: Number(row.value),
      })),
    };
  }

  private buildValueExpression(config: TimeSeriesConfig): string {
    const agg = config.source.aggregation;
    if (agg === "count") return "COUNT(*)";
    if (!config.source.valueColumn) {
      throw new Error(
        `valueColumn é obrigatório para aggregation="${agg}" em ${config.id}`,
      );
    }
    const col = quoteIdent(config.source.valueColumn);
    return agg === "sum" ? `SUM(${col})` : `AVG(${col})`;
  }
}

const SAFE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function quoteIdent(name: string): string {
  if (!SAFE_IDENT.test(name)) {
    throw new Error(`Identificador SQL inválido: "${name}"`);
  }
  return `"${name}"`;
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `cd chatfunnel-services && npx jest src/modules/reports-v2/engines/time-series.engine.spec.ts`
Expected: PASS — 5 testes.

- [ ] **Step 6: Criar `contacts.catalog.ts` com R08**

```ts
// src/modules/reports-v2/catalog/contacts.catalog.ts
import { TimeSeriesConfig } from "../engines/time-series.engine";

export const contactsGrowthReport: TimeSeriesConfig = {
  id: "contacts.growth",
  engine: "timeSeries",
  cacheTtl: 900,
  source: {
    table: "Contacts",
    dateColumn: "dateCreated",
    aggregation: "count",
    accountIdColumn: "accountId",
    softDeleteColumn: "isDeleted",
  },
};

export const contactsCatalog = {
  [contactsGrowthReport.id]: contactsGrowthReport,
};
```

- [ ] **Step 7: Criar `contacts.controller.ts` com o endpoint `/growth`**

```ts
// src/modules/reports-v2/controllers/contacts.controller.ts
import { Controller, Get, Headers, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { TimeSeries } from "@chatfunnel/contracts/endpoints";
import { ContactsGrowthDto } from "../dtos/contacts-growth.dto";
import { ReportOrchestrator } from "../orchestrator/report.orchestrator";

@ApiTags("Relatórios V2 — Contatos")
@Controller("reports/v2/contacts")
@UseGuards(AuthGuard("jwt"))
@ApiBearerAuth()
export class ContactsReportsController {
  constructor(private readonly orchestrator: ReportOrchestrator) {}

  @Get("growth")
  @ApiOperation({
    summary: "R08 — Crescimento de contatos no período",
  })
  growth(
    @Headers("Account-Selected") accountId: string,
    @Headers("Timezone") timezone: string,
    @Query() dto: ContactsGrowthDto,
  ): Promise<TimeSeries> {
    return this.orchestrator.run<TimeSeries>(
      "contacts.growth",
      accountId,
      dto,
      timezone,
    );
  }
}
```

> **Nota:** os providers (`TimeSeriesEngine`, controller, etc.) só serão amarrados ao módulo na Task 10. O orchestrator usado aqui é o **stub da F0**, que ainda lança `NotFoundException` — a reescrita acontece na Task 9. Isso significa: build compila, mas o endpoint `/reports/v2/contacts/growth` retorna 404 até a Task 9. **Sem problema** — o spec da engine prova o comportamento isoladamente.

- [ ] **Step 8: Garantir que compila**

Run: `cd chatfunnel-services && npx tsc --noEmit -p tsconfig.json`
Expected: sem erros.

---

## Task 4: `RankingEngine` + R04 (`crm.loss-reasons`)

R04 = "Ranking de motivos de perda". Query: `COUNT(*)` em `KanbanCards` agrupado por `KanbanLossesReasons.name`, filtrado por `statusOportunity='LOST'`, `accountId` (via JOIN com `Kanbans`), `isDeleted=false`, ordenado por contagem desc.

**Files:**
- Create: `chatfunnel-services/src/modules/reports-v2/engines/ranking.engine.ts`
- Test: `chatfunnel-services/src/modules/reports-v2/engines/ranking.engine.spec.ts`
- Create: `chatfunnel-services/src/modules/reports-v2/catalog/crm.catalog.ts`
- Create: `chatfunnel-services/src/modules/reports-v2/dtos/crm-loss-reasons.dto.ts`
- Create: `chatfunnel-services/src/modules/reports-v2/controllers/crm.controller.ts`

- [ ] **Step 1: Criar a DTO**

```ts
// src/modules/reports-v2/dtos/crm-loss-reasons.dto.ts
import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsUUID } from "class-validator";
import { BaseReportDto } from "./base-report.dto";

export class CrmLossReasonsDto extends BaseReportDto {
  @ApiProperty({
    description: "ID do pipeline (Kanban) para filtrar",
    required: false,
  })
  @IsOptional()
  @IsUUID()
  pipelineId?: string;
}
```

- [ ] **Step 2: Escrever o spec da engine falhando**

```ts
// src/modules/reports-v2/engines/ranking.engine.spec.ts
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "../../../prisma/prisma.service";
import { RankingEngine, RankingConfig } from "./ranking.engine";

const config: RankingConfig = {
  id: "crm.loss-reasons",
  engine: "ranking",
  cacheTtl: 1800,
  source: {
    table: "KanbanCards",
    joinTable: "KanbanLossesReasons",
    joinOn: "lossReasonId",
    labelColumn: "name",
    rankBy: "count",
    accountIdJoin: { via: "Kanbans", on: "kanbanId" },
    softDeleteColumn: "isDeleted",
    dateColumn: "statusOportunityUpdatedAt",
    extraWhere: { statusOportunity: "LOST" },
  },
};

describe("RankingEngine", () => {
  let engine: RankingEngine;
  let prisma: { $queryRawUnsafe: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRawUnsafe: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        RankingEngine,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    engine = moduleRef.get(RankingEngine);
  });

  it("expõe kind === 'ranking'", () => {
    expect(engine.kind).toBe("ranking");
  });

  it("retorna entries ordenadas por value desc + total", async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      { id: "r1", label: "Preço alto", value: 12 },
      { id: "r2", label: "Sem orçamento", value: 7 },
      { id: "r3", label: "Concorrente", value: 4 },
    ]);

    const result = await engine.run(
      config,
      "acc-1",
      {
        initialDate: new Date("2026-01-01T00:00:00Z"),
        finalDate: new Date("2026-01-31T23:59:59Z"),
      },
      "America/Sao_Paulo",
    );

    expect(result.total).toBe(23);
    expect(result.entries).toEqual([
      { id: "r1", label: "Preço alto", value: 12 },
      { id: "r2", label: "Sem orçamento", value: 7 },
      { id: "r3", label: "Concorrente", value: 4 },
    ]);
  });

  it("aplica accountId via JOIN com Kanbans e WHERE de status", async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([]);

    await engine.run(
      config,
      "acc-1",
      {
        initialDate: new Date("2026-01-01T00:00:00Z"),
        finalDate: new Date("2026-01-31T23:59:59Z"),
      },
      "America/Sao_Paulo",
    );

    const sql = prisma.$queryRawUnsafe.mock.calls[0][0] as string;
    expect(sql).toContain(`JOIN "Kanbans"`);
    expect(sql).toContain(`"Kanbans"."accountId" = $1`);
    expect(sql).toContain(`"KanbanCards"."statusOportunity" = 'LOST'`);
    expect(sql).toContain(`"KanbanCards"."isDeleted" = false`);
    expect(sql).toContain(`ORDER BY value DESC`);
  });

  it("devolve total=0 e entries=[] quando não há linhas", async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([]);

    const result = await engine.run(
      config,
      "acc-1",
      {
        initialDate: new Date("2026-01-01T00:00:00Z"),
        finalDate: new Date("2026-01-31T23:59:59Z"),
      },
      "America/Sao_Paulo",
    );

    expect(result).toEqual({ entries: [], total: 0 });
  });
});
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `cd chatfunnel-services && npx jest src/modules/reports-v2/engines/ranking.engine.spec.ts`
Expected: FAIL — `Cannot find module './ranking.engine'`.

- [ ] **Step 4: Implementar a engine**

```ts
// src/modules/reports-v2/engines/ranking.engine.ts
import { BadRequestException, Injectable } from "@nestjs/common";
import type { Ranking } from "@chatfunnel/contracts/endpoints";
import { PrismaService } from "../../../prisma/prisma.service";
import { normalizeRange } from "../core/period.helper";
import {
  ReportConfigBase,
  ReportEngine,
} from "../core/report-engine.contract";
import { BaseReportDto } from "../dtos/base-report.dto";

export interface RankingConfig extends ReportConfigBase {
  readonly engine: "ranking";
  readonly source: {
    readonly table: string;
    readonly joinTable: string;
    readonly joinOn: string;
    readonly labelColumn: string;
    readonly rankBy: "count" | "sum";
    readonly valueColumn?: string;
    readonly accountIdJoin: { readonly via: string; readonly on: string };
    readonly softDeleteColumn?: string;
    readonly dateColumn?: string;
    readonly extraWhere?: Readonly<Record<string, string>>;
  };
}

interface Row {
  id: string;
  label: string;
  value: number;
}

@Injectable()
export class RankingEngine
  implements ReportEngine<RankingConfig, Ranking>
{
  readonly kind = "ranking" as const;

  constructor(private readonly prisma: PrismaService) {}

  async run(
    config: RankingConfig,
    accountId: string,
    dto: BaseReportDto,
    timezone: string,
  ): Promise<Ranking> {
    if (!dto.initialDate || !dto.finalDate) {
      throw new BadRequestException(
        "initialDate e finalDate são obrigatórios em Ranking",
      );
    }

    const { start, end } = normalizeRange(dto.initialDate, dto.finalDate, timezone);

    const table = quoteIdent(config.source.table);
    const joinTable = quoteIdent(config.source.joinTable);
    const joinOnCol = quoteIdent(config.source.joinOn);
    const labelCol = quoteIdent(config.source.labelColumn);
    const accountTable = quoteIdent(config.source.accountIdJoin.via);
    const accountFk = quoteIdent(config.source.accountIdJoin.on);

    const valueExpr =
      config.source.rankBy === "count"
        ? "COUNT(*)"
        : `SUM(${table}.${quoteIdent(config.source.valueColumn ?? "")})`;

    const softDeleteFilter = config.source.softDeleteColumn
      ? `AND ${table}.${quoteIdent(config.source.softDeleteColumn)} = false`
      : "";

    const dateFilter = config.source.dateColumn
      ? `AND ${table}.${quoteIdent(config.source.dateColumn)} BETWEEN $2 AND $3`
      : "";

    const extraFilters = Object.entries(config.source.extraWhere ?? {})
      .map(([col, val]) => {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(col)) {
          throw new Error(`Coluna inválida em extraWhere: ${col}`);
        }
        const safeVal = String(val).replace(/'/g, "''");
        return `AND ${table}."${col}" = '${safeVal}'`;
      })
      .join("\n        ");

    const sql = `
      SELECT
        ${joinTable}."id"::text AS id,
        ${joinTable}.${labelCol} AS label,
        ${valueExpr}::float AS value
      FROM ${table}
      JOIN ${accountTable} ON ${table}.${accountFk} = ${accountTable}."id"
      JOIN ${joinTable} ON ${table}.${joinOnCol} = ${joinTable}."id"
      WHERE ${accountTable}."accountId" = $1
        ${dateFilter || "AND $2::timestamp IS NOT NULL AND $3::timestamp IS NOT NULL"}
        ${softDeleteFilter}
        ${extraFilters}
      GROUP BY ${joinTable}."id", ${joinTable}.${labelCol}
      ORDER BY value DESC
    `;

    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      sql,
      accountId,
      start,
      end,
    );

    const entries = rows.map((r) => ({
      id: String(r.id),
      label: String(r.label),
      value: Number(r.value),
    }));

    return {
      entries,
      total: entries.reduce((sum, e) => sum + e.value, 0),
    };
  }
}

const SAFE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function quoteIdent(name: string): string {
  if (!SAFE_IDENT.test(name)) {
    throw new Error(`Identificador SQL inválido: "${name}"`);
  }
  return `"${name}"`;
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `cd chatfunnel-services && npx jest src/modules/reports-v2/engines/ranking.engine.spec.ts`
Expected: PASS — 4 testes.

- [ ] **Step 6: Criar `crm.catalog.ts` com R04 (outros entram nas Tasks 6 e 7)**

```ts
// src/modules/reports-v2/catalog/crm.catalog.ts
import { RankingConfig } from "../engines/ranking.engine";

export const crmLossReasonsReport: RankingConfig = {
  id: "crm.loss-reasons",
  engine: "ranking",
  cacheTtl: 1800,
  source: {
    table: "KanbanCards",
    joinTable: "KanbanLossesReasons",
    joinOn: "lossReasonId",
    labelColumn: "name",
    rankBy: "count",
    accountIdJoin: { via: "Kanbans", on: "kanbanId" },
    softDeleteColumn: "isDeleted",
    dateColumn: "statusOportunityUpdatedAt",
    extraWhere: { statusOportunity: "LOST" },
  },
};

export const crmCatalog = {
  [crmLossReasonsReport.id]: crmLossReasonsReport,
};
```

- [ ] **Step 7: Criar `crm.controller.ts` com o endpoint `/loss-reasons`**

```ts
// src/modules/reports-v2/controllers/crm.controller.ts
import { Controller, Get, Headers, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Ranking } from "@chatfunnel/contracts/endpoints";
import { CrmLossReasonsDto } from "../dtos/crm-loss-reasons.dto";
import { ReportOrchestrator } from "../orchestrator/report.orchestrator";

@ApiTags("Relatórios V2 — CRM")
@Controller("reports/v2/crm")
@UseGuards(AuthGuard("jwt"))
@ApiBearerAuth()
export class CrmReportsController {
  constructor(private readonly orchestrator: ReportOrchestrator) {}

  @Get("loss-reasons")
  @ApiOperation({
    summary: "R04 — Ranking de motivos de perda no período",
  })
  lossReasons(
    @Headers("Account-Selected") accountId: string,
    @Headers("Timezone") timezone: string,
    @Query() dto: CrmLossReasonsDto,
  ): Promise<Ranking> {
    return this.orchestrator.run<Ranking>(
      "crm.loss-reasons",
      accountId,
      dto,
      timezone,
    );
  }
}
```

- [ ] **Step 8: Garantir que compila**

Run: `cd chatfunnel-services && npx tsc --noEmit -p tsconfig.json`
Expected: sem erros.

---

## Task 5: `HeatmapEngine` + R11 (`contacts.peak-hours`)

R11 = "Horários de pico de contatos". Heatmap 7 dias × 24 horas. Padrão: `day` 0=segunda → 6=domingo (definido nos contracts F0). PostgreSQL `EXTRACT(ISODOW)` retorna 1=segunda → 7=domingo, então convertemos com `- 1`.

**Files:**
- Create: `chatfunnel-services/src/modules/reports-v2/engines/heatmap.engine.ts`
- Test: `chatfunnel-services/src/modules/reports-v2/engines/heatmap.engine.spec.ts`
- Modify: `chatfunnel-services/src/modules/reports-v2/catalog/contacts.catalog.ts`
- Create: `chatfunnel-services/src/modules/reports-v2/dtos/contacts-peak-hours.dto.ts`
- Modify: `chatfunnel-services/src/modules/reports-v2/controllers/contacts.controller.ts`

- [ ] **Step 1: Criar a DTO**

```ts
// src/modules/reports-v2/dtos/contacts-peak-hours.dto.ts
import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsUUID } from "class-validator";
import { BaseReportDto } from "./base-report.dto";

export class ContactsPeakHoursDto extends BaseReportDto {
  @ApiProperty({
    description: "ID do canal para filtrar",
    required: false,
  })
  @IsOptional()
  @IsUUID()
  channelId?: string;
}
```

- [ ] **Step 2: Escrever o spec da engine falhando**

```ts
// src/modules/reports-v2/engines/heatmap.engine.spec.ts
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "../../../prisma/prisma.service";
import { HeatmapEngine, HeatmapConfig } from "./heatmap.engine";

const config: HeatmapConfig = {
  id: "contacts.peak-hours",
  engine: "heatmap",
  cacheTtl: 1800,
  source: {
    table: "Contacts",
    dateColumn: "dateCreated",
    accountIdColumn: "accountId",
    softDeleteColumn: "isDeleted",
  },
};

describe("HeatmapEngine", () => {
  let engine: HeatmapEngine;
  let prisma: { $queryRawUnsafe: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRawUnsafe: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        HeatmapEngine,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    engine = moduleRef.get(HeatmapEngine);
  });

  it("expõe kind === 'heatmap'", () => {
    expect(engine.kind).toBe("heatmap");
  });

  it("converte ISODOW (1-7) em day (0-6) com 0=segunda e calcula max", async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      { day: 0, hour: 9, value: 5 },
      { day: 2, hour: 14, value: 12 },
      { day: 6, hour: 20, value: 3 },
    ]);

    const result = await engine.run(
      config,
      "acc-1",
      {
        initialDate: new Date("2026-01-01T00:00:00Z"),
        finalDate: new Date("2026-01-31T23:59:59Z"),
      },
      "America/Sao_Paulo",
    );

    expect(result.cells).toEqual([
      { day: 0, hour: 9, value: 5 },
      { day: 2, hour: 14, value: 12 },
      { day: 6, hour: 20, value: 3 },
    ]);
    expect(result.max).toBe(12);
  });

  it("aplica EXTRACT(ISODOW) - 1 e EXTRACT(HOUR) no SQL", async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([]);

    await engine.run(
      config,
      "acc-1",
      {
        initialDate: new Date("2026-01-01T00:00:00Z"),
        finalDate: new Date("2026-01-31T23:59:59Z"),
      },
      "America/Sao_Paulo",
    );

    const sql = prisma.$queryRawUnsafe.mock.calls[0][0] as string;
    expect(sql).toContain(`EXTRACT(ISODOW FROM "Contacts"."dateCreated" AT TIME ZONE $4) - 1`);
    expect(sql).toContain(`EXTRACT(HOUR FROM "Contacts"."dateCreated" AT TIME ZONE $4)`);
    expect(sql).toContain(`"accountId" = $1`);
  });

  it("max=0 quando cells vazio", async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([]);

    const result = await engine.run(
      config,
      "acc-1",
      {
        initialDate: new Date("2026-01-01T00:00:00Z"),
        finalDate: new Date("2026-01-31T23:59:59Z"),
      },
      "America/Sao_Paulo",
    );

    expect(result).toEqual({ cells: [], max: 0 });
  });
});
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `cd chatfunnel-services && npx jest src/modules/reports-v2/engines/heatmap.engine.spec.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar a engine**

```ts
// src/modules/reports-v2/engines/heatmap.engine.ts
import { BadRequestException, Injectable } from "@nestjs/common";
import type { HeatmapCell, HeatmapData } from "@chatfunnel/contracts/endpoints";
import { PrismaService } from "../../../prisma/prisma.service";
import { normalizeRange } from "../core/period.helper";
import {
  ReportConfigBase,
  ReportEngine,
} from "../core/report-engine.contract";
import { BaseReportDto } from "../dtos/base-report.dto";

export interface HeatmapConfig extends ReportConfigBase {
  readonly engine: "heatmap";
  readonly source: {
    readonly table: string;
    readonly dateColumn: string;
    readonly accountIdColumn: string;
    readonly softDeleteColumn?: string;
  };
}

interface Row {
  day: number;
  hour: number;
  value: number;
}

@Injectable()
export class HeatmapEngine
  implements ReportEngine<HeatmapConfig, HeatmapData>
{
  readonly kind = "heatmap" as const;

  constructor(private readonly prisma: PrismaService) {}

  async run(
    config: HeatmapConfig,
    accountId: string,
    dto: BaseReportDto,
    timezone: string,
  ): Promise<HeatmapData> {
    if (!dto.initialDate || !dto.finalDate) {
      throw new BadRequestException(
        "initialDate e finalDate são obrigatórios em Heatmap",
      );
    }

    const { start, end } = normalizeRange(dto.initialDate, dto.finalDate, timezone);

    const table = quoteIdent(config.source.table);
    const dateCol = quoteIdent(config.source.dateColumn);
    const accountCol = quoteIdent(config.source.accountIdColumn);
    const softDeleteFilter = config.source.softDeleteColumn
      ? `AND ${table}.${quoteIdent(config.source.softDeleteColumn)} = false`
      : "";

    const sql = `
      SELECT
        (EXTRACT(ISODOW FROM ${table}.${dateCol} AT TIME ZONE $4) - 1)::int AS day,
        EXTRACT(HOUR FROM ${table}.${dateCol} AT TIME ZONE $4)::int AS hour,
        COUNT(*)::float AS value
      FROM ${table}
      WHERE ${table}.${accountCol} = $1
        AND ${table}.${dateCol} BETWEEN $2 AND $3
        ${softDeleteFilter}
      GROUP BY day, hour
      ORDER BY day, hour
    `;

    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      sql,
      accountId,
      start,
      end,
      timezone,
    );

    const cells: HeatmapCell[] = rows.map((r) => ({
      day: clampDay(r.day),
      hour: Math.max(0, Math.min(23, Number(r.hour))),
      value: Number(r.value),
    }));

    return {
      cells,
      max: cells.reduce((m, c) => Math.max(m, c.value), 0),
    };
  }
}

function clampDay(value: number): HeatmapCell["day"] {
  const n = Math.max(0, Math.min(6, Math.trunc(Number(value))));
  return n as HeatmapCell["day"];
}

const SAFE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function quoteIdent(name: string): string {
  if (!SAFE_IDENT.test(name)) {
    throw new Error(`Identificador SQL inválido: "${name}"`);
  }
  return `"${name}"`;
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `cd chatfunnel-services && npx jest src/modules/reports-v2/engines/heatmap.engine.spec.ts`
Expected: PASS — 4 testes.

- [ ] **Step 6: Adicionar R11 ao `contacts.catalog.ts`**

Substituir o conteúdo do arquivo:

```ts
// src/modules/reports-v2/catalog/contacts.catalog.ts
import { TimeSeriesConfig } from "../engines/time-series.engine";
import { HeatmapConfig } from "../engines/heatmap.engine";

export const contactsGrowthReport: TimeSeriesConfig = {
  id: "contacts.growth",
  engine: "timeSeries",
  cacheTtl: 900,
  source: {
    table: "Contacts",
    dateColumn: "dateCreated",
    aggregation: "count",
    accountIdColumn: "accountId",
    softDeleteColumn: "isDeleted",
  },
};

export const contactsPeakHoursReport: HeatmapConfig = {
  id: "contacts.peak-hours",
  engine: "heatmap",
  cacheTtl: 1800,
  source: {
    table: "Contacts",
    dateColumn: "dateCreated",
    accountIdColumn: "accountId",
    softDeleteColumn: "isDeleted",
  },
};

export const contactsCatalog = {
  [contactsGrowthReport.id]: contactsGrowthReport,
  [contactsPeakHoursReport.id]: contactsPeakHoursReport,
};
```

- [ ] **Step 7: Adicionar endpoint `/peak-hours` no `contacts.controller.ts`**

Editar o controller — adicionar o import do tipo e DTO, e o método:

```ts
import type { HeatmapData, TimeSeries } from "@chatfunnel/contracts/endpoints";
import { ContactsPeakHoursDto } from "../dtos/contacts-peak-hours.dto";

// ...dentro da classe, após growth():

  @Get("peak-hours")
  @ApiOperation({
    summary: "R11 — Heatmap de horários de pico de novos contatos",
  })
  peakHours(
    @Headers("Account-Selected") accountId: string,
    @Headers("Timezone") timezone: string,
    @Query() dto: ContactsPeakHoursDto,
  ): Promise<HeatmapData> {
    return this.orchestrator.run<HeatmapData>(
      "contacts.peak-hours",
      accountId,
      dto,
      timezone,
    );
  }
```

- [ ] **Step 8: Garantir que compila**

Run: `cd chatfunnel-services && npx tsc --noEmit -p tsconfig.json`
Expected: sem erros.

---

## Task 6: `FunnelEngine` + R01 (`crm.funnel`)

R01 = "Funil de conversão". Para a F1 usamos a query base do spec (`docs/superpowers/specs/2026-05-24-relatorios-design.md`): contar cards em cada coluna do pipeline e derivar `conversionFromPrevious` como `totalEstagioN / totalEstagioN-1`. Versão refinada via `KanbanCardsHistory` fica para fase futura.

**Files:**
- Create: `chatfunnel-services/src/modules/reports-v2/engines/funnel.engine.ts`
- Test: `chatfunnel-services/src/modules/reports-v2/engines/funnel.engine.spec.ts`
- Modify: `chatfunnel-services/src/modules/reports-v2/catalog/crm.catalog.ts`
- Create: `chatfunnel-services/src/modules/reports-v2/dtos/crm-funnel.dto.ts`
- Modify: `chatfunnel-services/src/modules/reports-v2/controllers/crm.controller.ts`

- [ ] **Step 1: Criar a DTO**

```ts
// src/modules/reports-v2/dtos/crm-funnel.dto.ts
import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsUUID } from "class-validator";
import { BaseReportDto } from "./base-report.dto";

export class CrmFunnelDto extends BaseReportDto {
  @ApiProperty({
    description: "ID do pipeline (Kanban) — obrigatório no funil",
  })
  @IsUUID()
  @IsNotEmpty()
  pipelineId!: string;
}
```

- [ ] **Step 2: Escrever o spec da engine falhando**

```ts
// src/modules/reports-v2/engines/funnel.engine.spec.ts
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "../../../prisma/prisma.service";
import { FunnelEngine, FunnelConfig } from "./funnel.engine";

const config: FunnelConfig = {
  id: "crm.funnel",
  engine: "funnel",
  cacheTtl: 900,
  source: {
    cardsTable: "KanbanCards",
    columnsTable: "KanbanColumns",
    pipelineFkInCards: "kanbanId",
    pipelineFkInColumns: "kanbanId",
    columnOrderColumn: "order",
    columnNameColumn: "name",
    columnFkInCards: "columnId",
    dateColumn: "createdAt",
    softDeleteColumn: "isDeleted",
    accountIdJoin: { via: "Kanbans", on: "kanbanId" },
  },
};

describe("FunnelEngine", () => {
  let engine: FunnelEngine;
  let prisma: { $queryRawUnsafe: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRawUnsafe: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        FunnelEngine,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    engine = moduleRef.get(FunnelEngine);
  });

  it("expõe kind === 'funnel'", () => {
    expect(engine.kind).toBe("funnel");
  });

  it("calcula conversionFromPrevious como total[n] / total[n-1] em fração 0..1", async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      { id: "c1", name: "Leads", total: 100 },
      { id: "c2", name: "Qualificados", total: 60 },
      { id: "c3", name: "Proposta", total: 30 },
      { id: "c4", name: "Fechado", total: 9 },
    ]);

    const result = await engine.run(
      config,
      "acc-1",
      {
        pipelineId: "k1",
        initialDate: new Date("2026-01-01T00:00:00Z"),
        finalDate: new Date("2026-01-31T23:59:59Z"),
      } as never,
      "America/Sao_Paulo",
    );

    expect(result.stages).toEqual([
      { id: "c1", name: "Leads", total: 100 },
      { id: "c2", name: "Qualificados", total: 60, conversionFromPrevious: 0.6 },
      { id: "c3", name: "Proposta", total: 30, conversionFromPrevious: 0.5 },
      { id: "c4", name: "Fechado", total: 9, conversionFromPrevious: 0.3 },
    ]);
  });

  it("não calcula conversionFromPrevious quando estágio anterior tem total=0", async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      { id: "c1", name: "Leads", total: 0 },
      { id: "c2", name: "Qualificados", total: 5 },
    ]);

    const result = await engine.run(
      config,
      "acc-1",
      {
        pipelineId: "k1",
        initialDate: new Date("2026-01-01T00:00:00Z"),
        finalDate: new Date("2026-01-31T23:59:59Z"),
      } as never,
      "America/Sao_Paulo",
    );

    expect(result.stages[1]).toEqual({ id: "c2", name: "Qualificados", total: 5 });
  });

  it("aplica pipelineId, accountId e período no SQL", async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([]);

    await engine.run(
      config,
      "acc-1",
      {
        pipelineId: "k1",
        initialDate: new Date("2026-01-01T00:00:00Z"),
        finalDate: new Date("2026-01-31T23:59:59Z"),
      } as never,
      "America/Sao_Paulo",
    );

    const sql = prisma.$queryRawUnsafe.mock.calls[0][0] as string;
    expect(sql).toContain(`"KanbanColumns"`);
    expect(sql).toContain(`"KanbanCards"`);
    expect(sql).toContain(`"Kanbans"."accountId" = $1`);
    expect(sql).toContain(`"KanbanColumns"."kanbanId" = $4`);
    expect(sql).toContain(`ORDER BY`);
    expect(prisma.$queryRawUnsafe.mock.calls[0]).toEqual(
      expect.arrayContaining(["acc-1", "k1"]),
    );
  });

  it("lança BadRequest quando pipelineId não é informado", async () => {
    await expect(
      engine.run(
        config,
        "acc-1",
        {
          initialDate: new Date("2026-01-01T00:00:00Z"),
          finalDate: new Date("2026-01-31T23:59:59Z"),
        } as never,
        "America/Sao_Paulo",
      ),
    ).rejects.toThrow(/pipelineId.*obrigatório/i);
  });
});
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `cd chatfunnel-services && npx jest src/modules/reports-v2/engines/funnel.engine.spec.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar a engine**

```ts
// src/modules/reports-v2/engines/funnel.engine.ts
import { BadRequestException, Injectable } from "@nestjs/common";
import type { FunnelData, FunnelStage } from "@chatfunnel/contracts/endpoints";
import { PrismaService } from "../../../prisma/prisma.service";
import { normalizeRange } from "../core/period.helper";
import {
  ReportConfigBase,
  ReportEngine,
} from "../core/report-engine.contract";
import { BaseReportDto } from "../dtos/base-report.dto";

export interface FunnelConfig extends ReportConfigBase {
  readonly engine: "funnel";
  readonly source: {
    readonly cardsTable: string;
    readonly columnsTable: string;
    readonly pipelineFkInCards: string;
    readonly pipelineFkInColumns: string;
    readonly columnOrderColumn: string;
    readonly columnNameColumn: string;
    readonly columnFkInCards: string;
    readonly dateColumn: string;
    readonly softDeleteColumn?: string;
    readonly accountIdJoin: { readonly via: string; readonly on: string };
  };
}

interface FunnelDto extends BaseReportDto {
  pipelineId?: string;
}

interface Row {
  id: string;
  name: string;
  total: number;
}

@Injectable()
export class FunnelEngine
  implements ReportEngine<FunnelConfig, FunnelData, FunnelDto>
{
  readonly kind = "funnel" as const;

  constructor(private readonly prisma: PrismaService) {}

  async run(
    config: FunnelConfig,
    accountId: string,
    dto: FunnelDto,
    timezone: string,
  ): Promise<FunnelData> {
    if (!dto.pipelineId) {
      throw new BadRequestException("pipelineId é obrigatório no funil");
    }
    if (!dto.initialDate || !dto.finalDate) {
      throw new BadRequestException(
        "initialDate e finalDate são obrigatórios em Funnel",
      );
    }

    const { start, end } = normalizeRange(dto.initialDate, dto.finalDate, timezone);

    const cards = quoteIdent(config.source.cardsTable);
    const cols = quoteIdent(config.source.columnsTable);
    const accountTable = quoteIdent(config.source.accountIdJoin.via);
    const colFk = quoteIdent(config.source.columnFkInCards);
    const dateCol = quoteIdent(config.source.dateColumn);
    const orderCol = quoteIdent(config.source.columnOrderColumn);
    const nameCol = quoteIdent(config.source.columnNameColumn);
    const pipelineFkCol = quoteIdent(config.source.pipelineFkInColumns);
    const accountFk = quoteIdent(config.source.accountIdJoin.on);

    const softDeleteFilter = config.source.softDeleteColumn
      ? `AND ${cards}.${quoteIdent(config.source.softDeleteColumn)} = false`
      : "";

    const sql = `
      SELECT
        ${cols}."id"::text AS id,
        ${cols}.${nameCol} AS name,
        COUNT(${cards}."id")::int AS total
      FROM ${cols}
      LEFT JOIN ${cards}
        ON ${cards}.${colFk} = ${cols}."id"
        AND ${cards}.${dateCol} BETWEEN $2 AND $3
        ${softDeleteFilter}
      JOIN ${accountTable} ON ${cols}.${pipelineFkCol} = ${accountTable}."id"
      WHERE ${accountTable}."accountId" = $1
        AND ${cols}.${pipelineFkCol} = $4
      GROUP BY ${cols}."id", ${cols}.${nameCol}, ${cols}.${orderCol}
      ORDER BY ${cols}.${orderCol} ASC
    `;

    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      sql,
      accountId,
      start,
      end,
      dto.pipelineId,
    );

    const stages: FunnelStage[] = rows.map((row, index) => {
      const total = Number(row.total);
      const prev = index > 0 ? Number(rows[index - 1].total) : null;
      const stage: FunnelStage = {
        id: String(row.id),
        name: String(row.name),
        total,
      };
      if (prev !== null && prev > 0) {
        stage.conversionFromPrevious = total / prev;
      }
      return stage;
    });

    return { stages };
  }
}

const SAFE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function quoteIdent(name: string): string {
  if (!SAFE_IDENT.test(name)) {
    throw new Error(`Identificador SQL inválido: "${name}"`);
  }
  return `"${name}"`;
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `cd chatfunnel-services && npx jest src/modules/reports-v2/engines/funnel.engine.spec.ts`
Expected: PASS — 5 testes.

- [ ] **Step 6: Adicionar R01 ao `crm.catalog.ts`**

Editar o arquivo — adicionar o import e a config, e atualizar o `crmCatalog`:

```ts
import { FunnelConfig } from "../engines/funnel.engine";

export const crmFunnelReport: FunnelConfig = {
  id: "crm.funnel",
  engine: "funnel",
  cacheTtl: 900,
  source: {
    cardsTable: "KanbanCards",
    columnsTable: "KanbanColumns",
    pipelineFkInCards: "kanbanId",
    pipelineFkInColumns: "kanbanId",
    columnOrderColumn: "order",
    columnNameColumn: "name",
    columnFkInCards: "columnId",
    dateColumn: "createdAt",
    softDeleteColumn: "isDeleted",
    accountIdJoin: { via: "Kanbans", on: "kanbanId" },
  },
};

export const crmCatalog = {
  [crmLossReasonsReport.id]: crmLossReasonsReport,
  [crmFunnelReport.id]: crmFunnelReport,
};
```

- [ ] **Step 7: Adicionar endpoint `/funnel` no `crm.controller.ts`**

```ts
import type { FunnelData, Ranking } from "@chatfunnel/contracts/endpoints";
import { CrmFunnelDto } from "../dtos/crm-funnel.dto";

// dentro da classe, após lossReasons():

  @Get("funnel")
  @ApiOperation({
    summary: "R01 — Funil de conversão por estágio do pipeline",
  })
  funnel(
    @Headers("Account-Selected") accountId: string,
    @Headers("Timezone") timezone: string,
    @Query() dto: CrmFunnelDto,
  ): Promise<FunnelData> {
    return this.orchestrator.run<FunnelData>(
      "crm.funnel",
      accountId,
      dto,
      timezone,
    );
  }
```

- [ ] **Step 8: Garantir que compila**

Run: `cd chatfunnel-services && npx tsc --noEmit -p tsconfig.json`
Expected: sem erros.

---

## Task 7: `AgingEngine` + R06 (`crm.aging`)

R06 = "Aging de oportunidades". Distribuir cards `statusOportunity='OPEN'` em buckets pela idade desde `createdAt`. Buckets default: `<3d`, `3-7d`, `7-15d`, `>15d`. Versão com `KanbanCardsHistory` fica para fase futura.

**Files:**
- Create: `chatfunnel-services/src/modules/reports-v2/engines/aging.engine.ts`
- Test: `chatfunnel-services/src/modules/reports-v2/engines/aging.engine.spec.ts`
- Modify: `chatfunnel-services/src/modules/reports-v2/catalog/crm.catalog.ts`
- Create: `chatfunnel-services/src/modules/reports-v2/dtos/crm-aging.dto.ts`
- Modify: `chatfunnel-services/src/modules/reports-v2/controllers/crm.controller.ts`

- [ ] **Step 1: Criar a DTO**

```ts
// src/modules/reports-v2/dtos/crm-aging.dto.ts
import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsUUID } from "class-validator";
import { BaseReportDto } from "./base-report.dto";

export class CrmAgingDto extends BaseReportDto {
  @ApiProperty({ description: "ID do pipeline (Kanban) para filtrar", required: false })
  @IsOptional()
  @IsUUID()
  pipelineId?: string;

  @ApiProperty({ description: "ID da coluna para restringir", required: false })
  @IsOptional()
  @IsUUID()
  columnId?: string;
}
```

- [ ] **Step 2: Escrever o spec da engine falhando**

```ts
// src/modules/reports-v2/engines/aging.engine.spec.ts
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "../../../prisma/prisma.service";
import { AgingEngine, AgingConfig } from "./aging.engine";

const config: AgingConfig = {
  id: "crm.aging",
  engine: "aging",
  cacheTtl: 900,
  source: {
    table: "KanbanCards",
    referenceColumn: "createdAt",
    statusColumn: "statusOportunity",
    openStatusValue: "OPEN",
    softDeleteColumn: "isDeleted",
    accountIdJoin: { via: "Kanbans", on: "kanbanId" },
  },
  buckets: [
    { label: "< 3 dias", range: [0, 3] },
    { label: "3-7 dias", range: [3, 7] },
    { label: "7-15 dias", range: [7, 15] },
    { label: "> 15 dias", range: [15, null] },
  ],
};

describe("AgingEngine", () => {
  let engine: AgingEngine;
  let prisma: { $queryRawUnsafe: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRawUnsafe: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AgingEngine,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    engine = moduleRef.get(AgingEngine);
  });

  it("expõe kind === 'aging'", () => {
    expect(engine.kind).toBe("aging");
  });

  it("distribui rows em buckets na ordem da config", async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      { bucket: 0, count: 4 },
      { bucket: 1, count: 6 },
      { bucket: 2, count: 2 },
      { bucket: 3, count: 1 },
    ]);

    const result = await engine.run(
      config,
      "acc-1",
      {},
      "America/Sao_Paulo",
    );

    expect(result.buckets).toEqual([
      { label: "< 3 dias", range: [0, 3], count: 4 },
      { label: "3-7 dias", range: [3, 7], count: 6 },
      { label: "7-15 dias", range: [7, 15], count: 2 },
      { label: "> 15 dias", range: [15, null], count: 1 },
    ]);
  });

  it("preenche buckets ausentes com count=0", async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      { bucket: 1, count: 5 },
    ]);

    const result = await engine.run(
      config,
      "acc-1",
      {},
      "America/Sao_Paulo",
    );

    expect(result.buckets.map((b) => b.count)).toEqual([0, 5, 0, 0]);
  });

  it("aplica accountId via JOIN e WHERE de status=OPEN no SQL", async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([]);

    await engine.run(config, "acc-1", {}, "America/Sao_Paulo");

    const sql = prisma.$queryRawUnsafe.mock.calls[0][0] as string;
    expect(sql).toContain(`"Kanbans"."accountId" = $1`);
    expect(sql).toContain(`"statusOportunity" = 'OPEN'`);
    expect(sql).toContain(`"isDeleted" = false`);
    expect(sql).toContain(`CASE`);
  });
});
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `cd chatfunnel-services && npx jest src/modules/reports-v2/engines/aging.engine.spec.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar a engine**

```ts
// src/modules/reports-v2/engines/aging.engine.ts
import { Injectable } from "@nestjs/common";
import type { AgingBucket, AgingData } from "@chatfunnel/contracts/endpoints";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  ReportConfigBase,
  ReportEngine,
} from "../core/report-engine.contract";
import { BaseReportDto } from "../dtos/base-report.dto";

export interface AgingBucketConfig {
  readonly label: string;
  readonly range: readonly [number, number | null];
}

export interface AgingConfig extends ReportConfigBase {
  readonly engine: "aging";
  readonly source: {
    readonly table: string;
    readonly referenceColumn: string;
    readonly statusColumn?: string;
    readonly openStatusValue?: string;
    readonly softDeleteColumn?: string;
    readonly accountIdJoin: { readonly via: string; readonly on: string };
  };
  readonly buckets: readonly AgingBucketConfig[];
}

interface Row {
  bucket: number;
  count: number;
}

@Injectable()
export class AgingEngine implements ReportEngine<AgingConfig, AgingData> {
  readonly kind = "aging" as const;

  constructor(private readonly prisma: PrismaService) {}

  async run(
    config: AgingConfig,
    accountId: string,
    _dto: BaseReportDto,
    _timezone: string,
  ): Promise<AgingData> {
    void _dto;
    void _timezone;

    const table = quoteIdent(config.source.table);
    const refCol = quoteIdent(config.source.referenceColumn);
    const accountTable = quoteIdent(config.source.accountIdJoin.via);
    const accountFk = quoteIdent(config.source.accountIdJoin.on);

    const softDeleteFilter = config.source.softDeleteColumn
      ? `AND ${table}.${quoteIdent(config.source.softDeleteColumn)} = false`
      : "";

    const statusFilter =
      config.source.statusColumn && config.source.openStatusValue
        ? `AND ${table}.${quoteIdent(config.source.statusColumn)} = '${escapeLiteral(config.source.openStatusValue)}'`
        : "";

    const caseExpr = buildBucketCase(config.buckets, table, refCol);

    const sql = `
      SELECT bucket, COUNT(*)::int AS count FROM (
        SELECT ${caseExpr} AS bucket
        FROM ${table}
        JOIN ${accountTable} ON ${table}.${accountFk} = ${accountTable}."id"
        WHERE ${accountTable}."accountId" = $1
          ${softDeleteFilter}
          ${statusFilter}
      ) t
      WHERE bucket >= 0
      GROUP BY bucket
      ORDER BY bucket
    `;

    const rows = await this.prisma.$queryRawUnsafe<Row[]>(sql, accountId);
    const byIndex = new Map<number, number>(
      rows.map((r) => [Number(r.bucket), Number(r.count)]),
    );

    const buckets: AgingBucket[] = config.buckets.map((cfg, idx) => ({
      label: cfg.label,
      range: [cfg.range[0], cfg.range[1]] as [number, number | null],
      count: byIndex.get(idx) ?? 0,
    }));

    return { buckets };
  }
}

function buildBucketCase(
  buckets: readonly AgingBucketConfig[],
  table: string,
  refCol: string,
): string {
  const daysExpr = `EXTRACT(EPOCH FROM (NOW() - ${table}.${refCol})) / 86400`;
  const whens = buckets.map((b, i) => {
    const [from, to] = b.range;
    if (to === null) {
      return `WHEN ${daysExpr} >= ${from} THEN ${i}`;
    }
    return `WHEN ${daysExpr} >= ${from} AND ${daysExpr} < ${to} THEN ${i}`;
  });
  return `CASE\n          ${whens.join("\n          ")}\n          ELSE -1\n        END`;
}

const SAFE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function quoteIdent(name: string): string {
  if (!SAFE_IDENT.test(name)) {
    throw new Error(`Identificador SQL inválido: "${name}"`);
  }
  return `"${name}"`;
}

function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''");
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `cd chatfunnel-services && npx jest src/modules/reports-v2/engines/aging.engine.spec.ts`
Expected: PASS — 4 testes.

- [ ] **Step 6: Adicionar R06 ao `crm.catalog.ts`**

```ts
import { AgingConfig } from "../engines/aging.engine";

export const crmAgingReport: AgingConfig = {
  id: "crm.aging",
  engine: "aging",
  cacheTtl: 900,
  source: {
    table: "KanbanCards",
    referenceColumn: "createdAt",
    statusColumn: "statusOportunity",
    openStatusValue: "OPEN",
    softDeleteColumn: "isDeleted",
    accountIdJoin: { via: "Kanbans", on: "kanbanId" },
  },
  buckets: [
    { label: "< 3 dias", range: [0, 3] },
    { label: "3-7 dias", range: [3, 7] },
    { label: "7-15 dias", range: [7, 15] },
    { label: "> 15 dias", range: [15, null] },
  ],
};

export const crmCatalog = {
  [crmLossReasonsReport.id]: crmLossReasonsReport,
  [crmFunnelReport.id]: crmFunnelReport,
  [crmAgingReport.id]: crmAgingReport,
};
```

- [ ] **Step 7: Adicionar endpoint `/aging` no `crm.controller.ts`**

```ts
import type { AgingData, FunnelData, Ranking } from "@chatfunnel/contracts/endpoints";
import { CrmAgingDto } from "../dtos/crm-aging.dto";

// dentro da classe:

  @Get("aging")
  @ApiOperation({
    summary: "R06 — Aging de oportunidades abertas por faixa de dias",
  })
  aging(
    @Headers("Account-Selected") accountId: string,
    @Headers("Timezone") timezone: string,
    @Query() dto: CrmAgingDto,
  ): Promise<AgingData> {
    return this.orchestrator.run<AgingData>(
      "crm.aging",
      accountId,
      dto,
      timezone,
    );
  }
```

- [ ] **Step 8: Garantir que compila**

Run: `cd chatfunnel-services && npx tsc --noEmit -p tsconfig.json`
Expected: sem erros.

---

## Task 8: `MetricCardEngine` + R35 (`dashboard.card-contacts-new`)

R35 = "Card do dashboard principal". Valor = `COUNT(*)` em `Contacts` no período + `delta` vs período anterior do mesmo tamanho + `sparkline` opcional (mini série diária).

**Files:**
- Create: `chatfunnel-services/src/modules/reports-v2/engines/metric-card.engine.ts`
- Test: `chatfunnel-services/src/modules/reports-v2/engines/metric-card.engine.spec.ts`
- Create: `chatfunnel-services/src/modules/reports-v2/catalog/dashboard.catalog.ts`
- Create: `chatfunnel-services/src/modules/reports-v2/dtos/dashboard-card.dto.ts`
- Create: `chatfunnel-services/src/modules/reports-v2/controllers/dashboard.controller.ts`

- [ ] **Step 1: Criar a DTO**

```ts
// src/modules/reports-v2/dtos/dashboard-card.dto.ts
import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsOptional } from "class-validator";
import { BaseReportDto } from "./base-report.dto";

export class DashboardCardDto extends BaseReportDto {
  @ApiProperty({
    description: "Inclui sparkline diária no card",
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: unknown }) => value === "true" || value === true)
  includeSparkline?: boolean;
}
```

- [ ] **Step 2: Escrever o spec da engine falhando**

```ts
// src/modules/reports-v2/engines/metric-card.engine.spec.ts
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "../../../prisma/prisma.service";
import { MetricCardEngine, MetricCardConfig } from "./metric-card.engine";

const config: MetricCardConfig = {
  id: "dashboard.card-contacts-new",
  engine: "metricCard",
  cacheTtl: 600,
  source: {
    table: "Contacts",
    dateColumn: "dateCreated",
    aggregation: "count",
    accountIdColumn: "accountId",
    softDeleteColumn: "isDeleted",
  },
  format: "number",
};

describe("MetricCardEngine", () => {
  let engine: MetricCardEngine;
  let prisma: { $queryRawUnsafe: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRawUnsafe: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        MetricCardEngine,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    engine = moduleRef.get(MetricCardEngine);
  });

  it("expõe kind === 'metricCard'", () => {
    expect(engine.kind).toBe("metricCard");
  });

  it("devolve valor + delta vs período anterior (absolute e percentage)", async () => {
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ value: 80 }])  // período atual
      .mockResolvedValueOnce([{ value: 50 }]); // período anterior

    const result = await engine.run(
      config,
      "acc-1",
      {
        initialDate: new Date("2026-01-11T00:00:00Z"),
        finalDate: new Date("2026-01-20T00:00:00Z"),
      },
      "America/Sao_Paulo",
    );

    expect(result.value).toBe(80);
    expect(result.format).toBe("number");
    expect(result.delta).toEqual({ absolute: 30, percentage: 0.6 });
    expect(result.sparkline).toBeUndefined();
  });

  it("percentage = 0 quando período anterior tem valor 0", async () => {
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ value: 10 }])
      .mockResolvedValueOnce([{ value: 0 }]);

    const result = await engine.run(
      config,
      "acc-1",
      {
        initialDate: new Date("2026-01-11T00:00:00Z"),
        finalDate: new Date("2026-01-20T00:00:00Z"),
      },
      "America/Sao_Paulo",
    );

    expect(result.delta).toEqual({ absolute: 10, percentage: 0 });
  });

  it("inclui sparkline quando includeSparkline=true", async () => {
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ value: 30 }])
      .mockResolvedValueOnce([{ value: 20 }])
      .mockResolvedValueOnce([
        { date: new Date("2026-01-11T00:00:00Z"), value: 5 },
        { date: new Date("2026-01-12T00:00:00Z"), value: 7 },
      ]);

    const result = await engine.run(
      config,
      "acc-1",
      {
        initialDate: new Date("2026-01-11T00:00:00Z"),
        finalDate: new Date("2026-01-20T00:00:00Z"),
        includeSparkline: true,
      } as never,
      "America/Sao_Paulo",
    );

    expect(result.sparkline).toEqual([
      { date: "2026-01-11", value: 5 },
      { date: "2026-01-12", value: 7 },
    ]);
  });
});
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `cd chatfunnel-services && npx jest src/modules/reports-v2/engines/metric-card.engine.spec.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar a engine**

```ts
// src/modules/reports-v2/engines/metric-card.engine.ts
import { BadRequestException, Injectable } from "@nestjs/common";
import type {
  MetricCard,
  MetricCardFormat,
  TimeSeriesPoint,
} from "@chatfunnel/contracts/endpoints";
import { PrismaService } from "../../../prisma/prisma.service";
import { normalizeRange } from "../core/period.helper";
import {
  ReportConfigBase,
  ReportEngine,
} from "../core/report-engine.contract";
import { BaseReportDto } from "../dtos/base-report.dto";

export interface MetricCardConfig extends ReportConfigBase {
  readonly engine: "metricCard";
  readonly source: {
    readonly table: string;
    readonly dateColumn: string;
    readonly aggregation: "count" | "sum" | "avg";
    readonly valueColumn?: string;
    readonly accountIdColumn: string;
    readonly softDeleteColumn?: string;
  };
  readonly format?: MetricCardFormat;
}

interface CardDto extends BaseReportDto {
  includeSparkline?: boolean;
}

interface AggRow {
  value: number;
}

interface PointRow {
  date: Date;
  value: number;
}

@Injectable()
export class MetricCardEngine
  implements ReportEngine<MetricCardConfig, MetricCard, CardDto>
{
  readonly kind = "metricCard" as const;

  constructor(private readonly prisma: PrismaService) {}

  async run(
    config: MetricCardConfig,
    accountId: string,
    dto: CardDto,
    timezone: string,
  ): Promise<MetricCard> {
    if (!dto.initialDate || !dto.finalDate) {
      throw new BadRequestException(
        "initialDate e finalDate são obrigatórios em MetricCard",
      );
    }

    const { start, end } = normalizeRange(dto.initialDate, dto.finalDate, timezone);
    const rangeMs = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - rangeMs);

    const valueExpr = this.buildValueExpression(config);
    const aggSql = this.buildAggregateSql(config, valueExpr);

    const [currentRow] = await this.prisma.$queryRawUnsafe<AggRow[]>(
      aggSql,
      accountId,
      start,
      end,
    );
    const [previousRow] = await this.prisma.$queryRawUnsafe<AggRow[]>(
      aggSql,
      accountId,
      prevStart,
      prevEnd,
    );

    const value = Number(currentRow?.value ?? 0);
    const prev = Number(previousRow?.value ?? 0);
    const card: MetricCard = {
      value,
      format: config.format,
      delta: {
        absolute: value - prev,
        percentage: prev === 0 ? 0 : (value - prev) / prev,
      },
    };

    if (dto.includeSparkline) {
      const sparklineSql = this.buildSparklineSql(config, valueExpr);
      const rows = await this.prisma.$queryRawUnsafe<PointRow[]>(
        sparklineSql,
        accountId,
        start,
        end,
        timezone,
      );
      const sparkline: TimeSeriesPoint[] = rows.map((row) => ({
        date: row.date.toISOString().slice(0, 10),
        value: Number(row.value),
      }));
      card.sparkline = sparkline;
    }

    return card;
  }

  private buildValueExpression(config: MetricCardConfig): string {
    if (config.source.aggregation === "count") return "COUNT(*)";
    if (!config.source.valueColumn) {
      throw new Error(
        `valueColumn é obrigatório para aggregation="${config.source.aggregation}" em ${config.id}`,
      );
    }
    const col = quoteIdent(config.source.valueColumn);
    return config.source.aggregation === "sum" ? `SUM(${col})` : `AVG(${col})`;
  }

  private buildAggregateSql(
    config: MetricCardConfig,
    valueExpr: string,
  ): string {
    const table = quoteIdent(config.source.table);
    const dateCol = quoteIdent(config.source.dateColumn);
    const accountCol = quoteIdent(config.source.accountIdColumn);
    const softDeleteFilter = config.source.softDeleteColumn
      ? `AND ${table}.${quoteIdent(config.source.softDeleteColumn)} = false`
      : "";

    return `
      SELECT ${valueExpr}::float AS value
      FROM ${table}
      WHERE ${table}.${accountCol} = $1
        AND ${table}.${dateCol} BETWEEN $2 AND $3
        ${softDeleteFilter}
    `;
  }

  private buildSparklineSql(
    config: MetricCardConfig,
    valueExpr: string,
  ): string {
    const table = quoteIdent(config.source.table);
    const dateCol = quoteIdent(config.source.dateColumn);
    const accountCol = quoteIdent(config.source.accountIdColumn);
    const softDeleteFilter = config.source.softDeleteColumn
      ? `AND ${table}.${quoteIdent(config.source.softDeleteColumn)} = false`
      : "";

    return `
      SELECT
        DATE_TRUNC('day', ${table}.${dateCol} AT TIME ZONE $4)::date AS date,
        ${valueExpr}::float AS value
      FROM ${table}
      WHERE ${table}.${accountCol} = $1
        AND ${table}.${dateCol} BETWEEN $2 AND $3
        ${softDeleteFilter}
      GROUP BY date
      ORDER BY date ASC
    `;
  }
}

const SAFE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function quoteIdent(name: string): string {
  if (!SAFE_IDENT.test(name)) {
    throw new Error(`Identificador SQL inválido: "${name}"`);
  }
  return `"${name}"`;
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `cd chatfunnel-services && npx jest src/modules/reports-v2/engines/metric-card.engine.spec.ts`
Expected: PASS — 4 testes.

- [ ] **Step 6: Criar `dashboard.catalog.ts` com R35**

```ts
// src/modules/reports-v2/catalog/dashboard.catalog.ts
import { MetricCardConfig } from "../engines/metric-card.engine";

export const dashboardCardContactsNewReport: MetricCardConfig = {
  id: "dashboard.card-contacts-new",
  engine: "metricCard",
  cacheTtl: 600,
  source: {
    table: "Contacts",
    dateColumn: "dateCreated",
    aggregation: "count",
    accountIdColumn: "accountId",
    softDeleteColumn: "isDeleted",
  },
  format: "number",
};

export const dashboardCatalog = {
  [dashboardCardContactsNewReport.id]: dashboardCardContactsNewReport,
};
```

- [ ] **Step 7: Criar `dashboard.controller.ts`**

```ts
// src/modules/reports-v2/controllers/dashboard.controller.ts
import { Controller, Get, Headers, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { MetricCard } from "@chatfunnel/contracts/endpoints";
import { DashboardCardDto } from "../dtos/dashboard-card.dto";
import { ReportOrchestrator } from "../orchestrator/report.orchestrator";

@ApiTags("Relatórios V2 — Dashboard")
@Controller("reports/v2/dashboard")
@UseGuards(AuthGuard("jwt"))
@ApiBearerAuth()
export class DashboardReportsController {
  constructor(private readonly orchestrator: ReportOrchestrator) {}

  @Get("card-contacts-new")
  @ApiOperation({
    summary: "R35 — Card do dashboard: novos contatos no período",
  })
  cardContactsNew(
    @Headers("Account-Selected") accountId: string,
    @Headers("Timezone") timezone: string,
    @Query() dto: DashboardCardDto,
  ): Promise<MetricCard> {
    return this.orchestrator.run<MetricCard>(
      "dashboard.card-contacts-new",
      accountId,
      dto,
      timezone,
    );
  }
}
```

- [ ] **Step 8: Garantir que compila**

Run: `cd chatfunnel-services && npx tsc --noEmit -p tsconfig.json`
Expected: sem erros.

---

## Task 9: Reescrever o `ReportOrchestrator` (substituir stub da F0)

A F0 deixou um orchestrator com `registry` vazio que sempre lança `NotFoundException`. Agora ele recebe os 6 engines no construtor, monta o registry com todos os catalogs e despacha pelo `engine` kind. **Sem cache.**

**Files:**
- Modify: `chatfunnel-services/src/modules/reports-v2/orchestrator/report.orchestrator.ts`
- Modify: `chatfunnel-services/src/modules/reports-v2/orchestrator/report.orchestrator.spec.ts`
- Create: `chatfunnel-services/src/modules/reports-v2/catalog/index.ts`

- [ ] **Step 1: Criar `catalog/index.ts` com `buildRegistry()`**

```ts
// src/modules/reports-v2/catalog/index.ts
import { ReportConfigBase } from "../core/report-engine.contract";
import { contactsCatalog } from "./contacts.catalog";
import { crmCatalog } from "./crm.catalog";
import { dashboardCatalog } from "./dashboard.catalog";

export function buildRegistry(): Map<string, ReportConfigBase> {
  const merged: Record<string, ReportConfigBase> = {
    ...contactsCatalog,
    ...crmCatalog,
    ...dashboardCatalog,
  };
  return new Map(Object.entries(merged));
}
```

- [ ] **Step 2: Reescrever o spec do orchestrator (substitui o da F0)**

```ts
// src/modules/reports-v2/orchestrator/report.orchestrator.spec.ts
import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ReportOrchestrator } from "./report.orchestrator";
import { TimeSeriesEngine } from "../engines/time-series.engine";
import { RankingEngine } from "../engines/ranking.engine";
import { HeatmapEngine } from "../engines/heatmap.engine";
import { FunnelEngine } from "../engines/funnel.engine";
import { AgingEngine } from "../engines/aging.engine";
import { MetricCardEngine } from "../engines/metric-card.engine";

function makeEngine<K extends string>(kind: K) {
  return {
    kind,
    run: jest.fn(),
  };
}

describe("ReportOrchestrator", () => {
  let orchestrator: ReportOrchestrator;
  let timeSeries: ReturnType<typeof makeEngine<"timeSeries">>;
  let ranking: ReturnType<typeof makeEngine<"ranking">>;
  let heatmap: ReturnType<typeof makeEngine<"heatmap">>;
  let funnel: ReturnType<typeof makeEngine<"funnel">>;
  let aging: ReturnType<typeof makeEngine<"aging">>;
  let metricCard: ReturnType<typeof makeEngine<"metricCard">>;

  beforeEach(async () => {
    timeSeries = makeEngine("timeSeries");
    ranking = makeEngine("ranking");
    heatmap = makeEngine("heatmap");
    funnel = makeEngine("funnel");
    aging = makeEngine("aging");
    metricCard = makeEngine("metricCard");

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ReportOrchestrator,
        { provide: TimeSeriesEngine, useValue: timeSeries },
        { provide: RankingEngine, useValue: ranking },
        { provide: HeatmapEngine, useValue: heatmap },
        { provide: FunnelEngine, useValue: funnel },
        { provide: AgingEngine, useValue: aging },
        { provide: MetricCardEngine, useValue: metricCard },
      ],
    }).compile();

    orchestrator = moduleRef.get(ReportOrchestrator);
  });

  it("lança NotFoundException para reportId desconhecido", async () => {
    await expect(
      orchestrator.run("inexistente", "acc-1", {}, "America/Sao_Paulo"),
    ).rejects.toThrow(NotFoundException);
  });

  it("despacha 'contacts.growth' para TimeSeriesEngine com config correta", async () => {
    timeSeries.run.mockResolvedValueOnce({ series: [], granularity: "day" });

    await orchestrator.run("contacts.growth", "acc-1", {}, "America/Sao_Paulo");

    expect(timeSeries.run).toHaveBeenCalledTimes(1);
    const [config] = timeSeries.run.mock.calls[0];
    expect(config.id).toBe("contacts.growth");
    expect(config.engine).toBe("timeSeries");
  });

  it("despacha 'crm.loss-reasons' para RankingEngine", async () => {
    ranking.run.mockResolvedValueOnce({ entries: [], total: 0 });
    await orchestrator.run("crm.loss-reasons", "acc-1", {}, "America/Sao_Paulo");
    expect(ranking.run).toHaveBeenCalledTimes(1);
  });

  it("despacha 'contacts.peak-hours' para HeatmapEngine", async () => {
    heatmap.run.mockResolvedValueOnce({ cells: [], max: 0 });
    await orchestrator.run("contacts.peak-hours", "acc-1", {}, "America/Sao_Paulo");
    expect(heatmap.run).toHaveBeenCalledTimes(1);
  });

  it("despacha 'crm.funnel' para FunnelEngine", async () => {
    funnel.run.mockResolvedValueOnce({ stages: [] });
    await orchestrator.run("crm.funnel", "acc-1", {}, "America/Sao_Paulo");
    expect(funnel.run).toHaveBeenCalledTimes(1);
  });

  it("despacha 'crm.aging' para AgingEngine", async () => {
    aging.run.mockResolvedValueOnce({ buckets: [] });
    await orchestrator.run("crm.aging", "acc-1", {}, "America/Sao_Paulo");
    expect(aging.run).toHaveBeenCalledTimes(1);
  });

  it("despacha 'dashboard.card-contacts-new' para MetricCardEngine", async () => {
    metricCard.run.mockResolvedValueOnce({ value: 0 });
    await orchestrator.run(
      "dashboard.card-contacts-new",
      "acc-1",
      {},
      "America/Sao_Paulo",
    );
    expect(metricCard.run).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Rodar o spec e ver falhar**

Run: `cd chatfunnel-services && npx jest src/modules/reports-v2/orchestrator/report.orchestrator.spec.ts`
Expected: FAIL — orchestrator antigo (stub da F0) ainda lança `NotFoundException` para tudo.

- [ ] **Step 4: Reescrever `report.orchestrator.ts`**

Substituir o conteúdo inteiro do arquivo por:

```ts
// src/modules/reports-v2/orchestrator/report.orchestrator.ts
import { Injectable, NotFoundException } from "@nestjs/common";
import type { ReportPayload } from "@chatfunnel/contracts/endpoints";
import { buildRegistry } from "../catalog";
import {
  EngineKind,
  ReportConfigBase,
  ReportEngine,
} from "../core/report-engine.contract";
import { AgingEngine } from "../engines/aging.engine";
import { FunnelEngine } from "../engines/funnel.engine";
import { HeatmapEngine } from "../engines/heatmap.engine";
import { MetricCardEngine } from "../engines/metric-card.engine";
import { RankingEngine } from "../engines/ranking.engine";
import { TimeSeriesEngine } from "../engines/time-series.engine";
import { BaseReportDto } from "../dtos/base-report.dto";

type AnyEngine = ReportEngine<ReportConfigBase, unknown, BaseReportDto>;

@Injectable()
export class ReportOrchestrator {
  private readonly registry = buildRegistry();
  private readonly engines: Record<EngineKind, AnyEngine>;

  constructor(
    timeSeries: TimeSeriesEngine,
    ranking: RankingEngine,
    heatmap: HeatmapEngine,
    funnel: FunnelEngine,
    aging: AgingEngine,
    metricCard: MetricCardEngine,
  ) {
    this.engines = {
      timeSeries: timeSeries as unknown as AnyEngine,
      ranking: ranking as unknown as AnyEngine,
      heatmap: heatmap as unknown as AnyEngine,
      funnel: funnel as unknown as AnyEngine,
      aging: aging as unknown as AnyEngine,
      metricCard: metricCard as unknown as AnyEngine,
    };
  }

  async run<T extends ReportPayload>(
    reportId: string,
    accountId: string,
    dto: BaseReportDto,
    timezone: string,
  ): Promise<T> {
    const config = this.registry.get(reportId);
    if (!config) {
      throw new NotFoundException(`Relatório "${reportId}" não encontrado`);
    }
    const engine = this.engines[config.engine];
    return engine.run(config, accountId, dto, timezone) as Promise<T>;
  }
}
```

> **Cache:** ausente por decisão da F1. Quando a camada for introduzida, este método ganha um `cache.get` antes do dispatch e um `cache.set` depois — assinatura de `run()` e engines não mudam.

- [ ] **Step 5: Rodar o spec e ver passar**

Run: `cd chatfunnel-services && npx jest src/modules/reports-v2/orchestrator/report.orchestrator.spec.ts`
Expected: PASS — 7 testes.

- [ ] **Step 6: Garantir que compila**

Run: `cd chatfunnel-services && npx tsc --noEmit -p tsconfig.json`
Expected: sem erros.

---

## Task 10: Registrar engines e controllers no `reports-v2.module.ts`

**Files:**
- Modify: `chatfunnel-services/src/modules/reports-v2/reports-v2.module.ts`

- [ ] **Step 1: Substituir o conteúdo do módulo**

```ts
// src/modules/reports-v2/reports-v2.module.ts
import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { ContactsReportsController } from "./controllers/contacts.controller";
import { CrmReportsController } from "./controllers/crm.controller";
import { DashboardReportsController } from "./controllers/dashboard.controller";
import { PingController } from "./controllers/ping.controller";
import { AgingEngine } from "./engines/aging.engine";
import { FunnelEngine } from "./engines/funnel.engine";
import { HeatmapEngine } from "./engines/heatmap.engine";
import { MetricCardEngine } from "./engines/metric-card.engine";
import { RankingEngine } from "./engines/ranking.engine";
import { TimeSeriesEngine } from "./engines/time-series.engine";
import { ReportOrchestrator } from "./orchestrator/report.orchestrator";

@Module({
  imports: [PrismaModule],
  controllers: [
    PingController,
    ContactsReportsController,
    CrmReportsController,
    DashboardReportsController,
  ],
  providers: [
    ReportOrchestrator,
    TimeSeriesEngine,
    RankingEngine,
    HeatmapEngine,
    FunnelEngine,
    AgingEngine,
    MetricCardEngine,
  ],
  exports: [ReportOrchestrator],
})
export class ReportsV2Module {}
```

> **Se `PrismaModule` não estiver exposto** em `chatfunnel-services/src/prisma/prisma.module.ts`, importar `PrismaService` direto como provider:
> ```ts
> import { PrismaService } from "../../prisma/prisma.service";
> // ...em providers: [PrismaService, ReportOrchestrator, ...]
> ```
> Conferir o padrão usado pelo `ReportsModule` legado (`src/modules/reports/reports.module.ts`) e replicar.

- [ ] **Step 2: Garantir que compila**

Run: `cd chatfunnel-services && npx tsc --noEmit -p tsconfig.json`
Expected: sem erros.

---

## Task 11: Smoke test full suite + verificação dos endpoints + atualização do vault

- [ ] **Step 1: Rodar todos os specs do módulo**

Run: `cd chatfunnel-services && npx jest src/modules/reports-v2`
Expected: PASS — F0 (6 testes) + F1 (granularity 4 + 6 engines × 4-5 + orchestrator 7) ≈ **39 testes verdes**.

- [ ] **Step 2: Rodar a suite completa**

Run: `cd chatfunnel-services && npm test`
Expected: todos os specs verdes. Falhas em specs não-relacionados a `reports-v2/` não bloqueiam a F1 — apenas registrar no resumo final.

- [ ] **Step 3: Build de produção**

Run: `cd chatfunnel-services && npm run build`
Expected: build limpo, sem erros TypeScript.

- [ ] **Step 4: Subir o app e exercitar cada endpoint**

Run: `cd chatfunnel-services && npm run start:dev`

Em outro terminal (substituir `$TOKEN` por um JWT de teste local, `$ACC` por um `accountId` real, `$PIPELINE` por um `kanbanId` real):

```bash
# R08 — TimeSeries
curl -s "http://localhost:3200/reports/v2/contacts/growth?initialDate=2026-01-01T00:00:00Z&finalDate=2026-01-31T23:59:59Z" \
  -H "Authorization: Bearer $TOKEN" -H "Account-Selected: $ACC" -H "Timezone: America/Sao_Paulo" | jq .

# R11 — Heatmap
curl -s "http://localhost:3200/reports/v2/contacts/peak-hours?initialDate=2026-01-01T00:00:00Z&finalDate=2026-01-31T23:59:59Z" \
  -H "Authorization: Bearer $TOKEN" -H "Account-Selected: $ACC" -H "Timezone: America/Sao_Paulo" | jq .

# R04 — Ranking
curl -s "http://localhost:3200/reports/v2/crm/loss-reasons?initialDate=2026-01-01T00:00:00Z&finalDate=2026-01-31T23:59:59Z" \
  -H "Authorization: Bearer $TOKEN" -H "Account-Selected: $ACC" -H "Timezone: America/Sao_Paulo" | jq .

# R01 — Funnel (pipelineId obrigatório)
curl -s "http://localhost:3200/reports/v2/crm/funnel?pipelineId=$PIPELINE&initialDate=2026-01-01T00:00:00Z&finalDate=2026-01-31T23:59:59Z" \
  -H "Authorization: Bearer $TOKEN" -H "Account-Selected: $ACC" -H "Timezone: America/Sao_Paulo" | jq .

# R06 — Aging
curl -s "http://localhost:3200/reports/v2/crm/aging" \
  -H "Authorization: Bearer $TOKEN" -H "Account-Selected: $ACC" -H "Timezone: America/Sao_Paulo" | jq .

# R35 — MetricCard
curl -s "http://localhost:3200/reports/v2/dashboard/card-contacts-new?initialDate=2026-01-01T00:00:00Z&finalDate=2026-01-31T23:59:59Z&includeSparkline=true" \
  -H "Authorization: Bearer $TOKEN" -H "Account-Selected: $ACC" -H "Timezone: America/Sao_Paulo" | jq .
```

Expected:
- Todos retornam `200 OK`
- O payload de cada um valida contra o schema Zod do `@chatfunnel/contracts/endpoints` (R08 → `TimeSeries`, R04 → `Ranking`, R11 → `HeatmapData`, R01 → `FunnelData`, R06 → `AgingData`, R35 → `MetricCard`)

Encerrar o `start:dev` (Ctrl+C).

- [ ] **Step 5: Atualizar o vault**

Modify: `vault/wiki/features/reports-v2-arquitetura.md` — alterar o frontmatter `status: f0-em-implementacao` para `status: f1-em-implementacao` (ou `f1-concluida` quando o front consumir os 6 endpoints), e na seção 9 marcar Fase 1 como concluída:

```markdown
### Fase 1 — Engines + 1 relatorio por padrao (2-3 dias) ✅ concluida em 2026-06-XX

> **Sem cache na F1.** `ReportCacheService` nao e implementado aqui — orchestrator chama o engine direto. Sera adicionado em fase posterior, quando o volume de queries justificar, como mudanca isolada no orchestrator.

- [x] `TimeSeriesEngine` + R08 `contacts.growth`
- [x] `RankingEngine` + R04 `crm.loss-reasons`
- [x] `HeatmapEngine` + R11 `contacts.peak-hours`
- [x] `FunnelEngine` + R01 `crm.funnel`
- [x] `AgingEngine` + R06 `crm.aging`
- [x] `MetricCardEngine` + R35 `dashboard.card-contacts-new`
- [x] Orchestrator reescrito (registry real + dispatch por kind, sem cache)
- [x] Catalog declarativo por dominio (`contacts`, `crm`, `dashboard`)
```

---

## Critérios de aceitação da F1

1. Os 6 engines existem em `src/modules/reports-v2/engines/` e cada um tem spec verde isolado.
2. Os 6 relatórios piloto têm config no catalog correspondente (`contacts`, `crm`, `dashboard`).
3. `ReportOrchestrator` despacha cada `id` para o engine correto via `config.engine` — comprovado pelo `report.orchestrator.spec.ts`.
4. Os 6 endpoints respondem `200 OK` com o shape Zod correspondente do `@chatfunnel/contracts/endpoints`:
   - `GET /reports/v2/contacts/growth` → `TimeSeries`
   - `GET /reports/v2/contacts/peak-hours` → `HeatmapData`
   - `GET /reports/v2/crm/loss-reasons` → `Ranking`
   - `GET /reports/v2/crm/funnel` → `FunnelData`
   - `GET /reports/v2/crm/aging` → `AgingData`
   - `GET /reports/v2/dashboard/card-contacts-new` → `MetricCard`
5. **Sem cache:** nenhum arquivo `report-cache.service.ts` foi criado. Configs no catalog declaram `cacheTtl` apenas como metadado; o orchestrator não consulta esse campo.
6. `npx jest src/modules/reports-v2` passa com pelo menos 35 testes verdes.
7. `npx tsc --noEmit` e `npm run build` rodam sem erros.
8. Nenhum arquivo do `ReportsModule` legado foi modificado.
9. Nenhum tipo de shape de saída vive dentro do `chatfunnel-services` — todos são importados de `@chatfunnel/contracts/endpoints`.
10. `vault/wiki/features/reports-v2-arquitetura.md` marca a F1 como concluída.

> Commits, branches, push e publish são responsabilidade manual do usuário — este plano cobre só as mudanças de arquivos e validações.

---

## Próximos passos (fora desta F1)

- **Front:** consumir os 6 endpoints em telas stub (uma por domínio: `/reports/contacts`, `/reports/crm`, `/reports/dashboard`) para validar o shape end-to-end.
- **F2 — Specials (1-2 dias):** R03 velocidade, R07 forecast, R31 satisfação, R33 taxa de resolução, R34 humano vs IA, R28 alcance por segmento. Introduz `handlers/` + `repositories/`.
- **F3 — Popular o catálogo (1-2 dias):** adicionar as ~22 configs restantes nos catalogs existentes (cada uma ~15 linhas, sem código novo).
- **F4 — Migration de indexes compostos:** os 6 indexes do spec base (`docs/superpowers/specs/2026-05-24-relatorios-design.md` seção 1.3) — pode rodar em paralelo.
- **Cache:** quando o volume de queries justificar, implementar `core/report-cache.service.ts` (Redis + hash determinístico da DTO) e inserir `cache.get` / `cache.set` dentro de `ReportOrchestrator.run`. Engines e configs **não mudam**.
