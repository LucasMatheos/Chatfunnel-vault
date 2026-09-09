# Gráfico de comparecimento (show/no-show) — aba Agendamentos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o aviso "em breve" da aba Agendamentos (Reports V2) por dois gráficos reais de comparecimento: uma série temporal por dia (Compareceu/Não compareceu/Pendente) e um donut de proporção do período (Compareceu vs Não compareceu).

**Architecture:** Segue o padrão já existente de `schedules.volume` ponta a ponta — novo método na `SchedulesReportsRepository` (core) → nova entrada no catálogo de relatórios → novo endpoint no controller (services, delegação fina) → novo método no `ReportsV2Service` do front → consumo em `AgendamentosTab.vue` via `useReportQuery` + `SegmentedTimeSeriesChart` (série) + novo `AttendanceDonut` (proporção, reaproveitando o builder de opção do `ChannelDonut`).

**Tech Stack:** Prisma raw SQL (core), NestJS + class-validator (services), Vue 3 `<script setup>` + ECharts via `vue-echarts` (front). Zero mudança em `@chatfunnel/contracts` — `SegmentedTimeSeries` já é genérico o suficiente.

## Global Constraints

- Toda query no core filtra por `accountId` (multi-tenancy) — `GoogleCalendarEvents.accountId` é direto na tabela, sem join.
- `GoogleCalendarEvents` **não tem** campo `isDeleted` — usa `isCancelled` como soft-cancel; excluir `isCancelled = true` das métricas de comparecimento (regra do wiki `calendar-attendance-architecture.md`).
- O donut de proporção do período mede só Compareceu vs Não compareceu — `PENDING` fica de fora da soma (agendamento futuro/não marcado não é "comparecimento").
- Textos em pt-BR acentuado: "Compareceu", "Não compareceu", "Pendente".
- Cores: verde (`getGreenColor()`) para Compareceu, vermelho (`getRedColor()`) para Não compareceu, cinza neutro (`getMutedColor()`) para Pendente — convenção já usada em `MetricCard` (verde bom / vermelho ruim).
- `chatfunnel-core`: double quotes + semicolons (estilo já usado em `schedules-reports.repository.ts`).
- `chatfunnel-services`: double quotes + semicolons (`.prettierrc`: `semi: true`, `singleQuote: false`).
- `chatfunnel-front` `.vue` (`<script setup>`): single quotes, sem semicolons. Arquivos `.ts` em `views/reportsV2/{composables,utils,services,info}`: double quotes + semicolons (estilo já usado em `ReportsV2Service.ts`, `series.ts`, `segmentedTimeSeries.option.ts`).
- NEVER rodar `prisma migrate dev/deploy/db push` — a migration do schema (`attendanceStatus`) já existe e já foi aplicada; este plano não toca o schema.

---

### Task 1: Core — `attendanceTimeSeries` na `SchedulesReportsRepository` + catálogo

**Files:**
- Modify: `chatfunnel-core/src/repositories/reports/schedules-reports.repository.ts`
- Modify: `chatfunnel-core/src/reports/catalog/schedules.catalog.ts`
- Create: `chatfunnel-core/src/reports/__tests__/schedules-attendance.spec.ts`

**Interfaces:**
- Produces: `SchedulesReportsRepository.attendanceTimeSeries(accountId: string, params: ReportParams, timezone: string): Promise<TimeSeriesRow[]>` — linhas com `segment` ∈ `"PENDING" | "SHOW" | "NO_SHOW"`.
- Produces: catálogo registra o id `"schedules.attendance"`, shaper `"timeSeries"`, `cacheTtl: 900` — consumido via `orchestrator.run<SegmentedTimeSeries>("schedules.attendance", ...)` (Task 2).

- [ ] **Step 1: Escrever o teste (falhando) do novo relatório no nível do orchestrator**

Criar `chatfunnel-core/src/reports/__tests__/schedules-attendance.spec.ts`:

```typescript
import { PrismaClient } from "@prisma/client";
import { createReportsOrchestrator } from "../orchestrator/create-reports-orchestrator";
import type { ReportParams } from "../types";
import type { SegmentedTimeSeries } from "@chatfunnel/contracts";

function makePrismaMock(rows: unknown[]) {
  return { $queryRaw: jest.fn().mockResolvedValue(rows) } as unknown as PrismaClient & {
    $queryRaw: jest.Mock;
  };
}

const params: ReportParams = {
  initialDate: new Date("2026-01-01T00:00:00Z"),
  finalDate: new Date("2026-01-31T00:00:00Z"),
};

describe("orchestrator.run('schedules.attendance')", () => {
  it("despacha query → timeSeries segmentado (SHOW/NO_SHOW/PENDING)", async () => {
    const prisma = makePrismaMock([
      { date: "2026-01-01", segment: "SHOW", value: 8 },
      { date: "2026-01-01", segment: "NO_SHOW", value: 2 },
      { date: "2026-01-02", segment: "PENDING", value: 3 },
    ]);
    const orchestrator = createReportsOrchestrator(prisma);

    const result = await orchestrator.run<SegmentedTimeSeries>(
      "schedules.attendance",
      "acc-A",
      params,
      "America/Sao_Paulo",
    );

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result.segments.map((s) => s.segment).sort()).toEqual([
      "NO_SHOW",
      "PENDING",
      "SHOW",
    ]);
  });

  it("account-scope + exclui cancelados: GoogleCalendarEvents.accountId e isCancelled=false", async () => {
    const prisma = makePrismaMock([]);
    const orchestrator = createReportsOrchestrator(prisma);

    await orchestrator.run("schedules.attendance", "acc-A", params, "America/Sao_Paulo");

    const sqlArg: any = prisma.$queryRaw.mock.calls[0][0];
    expect(sqlArg.values).toContain("acc-A");
    const text: string = String(sqlArg.text ?? sqlArg.sql ?? "");
    expect(text).toMatch(/accountId/);
    expect(text).toMatch(/"GoogleCalendarEvents"/);
    expect(text).toMatch(/isCancelled/);
    expect(text).toMatch(/attendanceStatus/);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd chatfunnel-core && npm test -- schedules-attendance`
Expected: FAIL — `Cannot find name 'schedules.attendance'` (id não registrado no catálogo) ou erro do orchestrator "unknown report id".

- [ ] **Step 3: Implementar `attendanceTimeSeries` no repository**

Editar `chatfunnel-core/src/repositories/reports/schedules-reports.repository.ts` — trocar o comentário de classe (linhas 7-11) e acrescentar o método após `volumeTimeSeries`:

```typescript
import { Prisma, PrismaClient } from "@prisma/client";
import { normalizeRange } from "../../reports/core/period.helper";
import { pickGranularity } from "../../reports/core/granularity.helper";
import type { ReportParams } from "../../reports/types";
import type { TimeSeriesRow } from "./types";

/**
 * Queries de relatório do domínio Agendamentos. Fonte: `GoogleCalendarEvents`
 * (tem `accountId` direto).
 */
export class SchedulesReportsRepository {
  constructor(protected prisma: PrismaClient) {}

  /**
   * Volume de agendamentos por dia/semana/mês, segmentado por status
   * (`active` vs `cancelled`). Bucketiza por `startAt` (data do compromisso).
   * Account-scope direto por `GoogleCalendarEvents.accountId`.
   */
  async volumeTimeSeries(
    accountId: string,
    params: ReportParams,
    timezone: string,
  ): Promise<TimeSeriesRow[]> {
    const { start, end } = normalizeRange(
      params.initialDate,
      params.finalDate,
      timezone,
    );
    const granularity = params.granularity ?? pickGranularity(start, end);

    return this.prisma.$queryRaw<TimeSeriesRow[]>(Prisma.sql`
      SELECT
        TO_CHAR(
          DATE_TRUNC(${granularity}, (e."startAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}),
          'YYYY-MM-DD'
        ) AS date,
        CASE WHEN e."isCancelled" THEN 'cancelled' ELSE 'active' END AS segment,
        COUNT(*)::int AS value
      FROM "GoogleCalendarEvents" e
      WHERE e."accountId" = ${accountId}::uuid
        AND e."startAt" IS NOT NULL
        AND e."startAt" BETWEEN ${start} AND ${end}
      GROUP BY 1, 2
      ORDER BY 1 ASC
    `);
  }

  /**
   * Comparecimento por dia/semana/mês, segmentado por `attendanceStatus`
   * (`PENDING` | `SHOW` | `NO_SHOW`). Bucketiza por `startAt` (data do
   * compromisso, não a data em que o comparecimento foi registrado). Exclui
   * eventos cancelados (`isCancelled`) — cancelamento não é métrica de
   * comparecimento. Account-scope direto por `GoogleCalendarEvents.accountId`.
   */
  async attendanceTimeSeries(
    accountId: string,
    params: ReportParams,
    timezone: string,
  ): Promise<TimeSeriesRow[]> {
    const { start, end } = normalizeRange(
      params.initialDate,
      params.finalDate,
      timezone,
    );
    const granularity = params.granularity ?? pickGranularity(start, end);

    return this.prisma.$queryRaw<TimeSeriesRow[]>(Prisma.sql`
      SELECT
        TO_CHAR(
          DATE_TRUNC(${granularity}, (e."startAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}),
          'YYYY-MM-DD'
        ) AS date,
        e."attendanceStatus"::text AS segment,
        COUNT(*)::int AS value
      FROM "GoogleCalendarEvents" e
      WHERE e."accountId" = ${accountId}::uuid
        AND e."isCancelled" = false
        AND e."startAt" IS NOT NULL
        AND e."startAt" BETWEEN ${start} AND ${end}
      GROUP BY 1, 2
      ORDER BY 1 ASC
    `);
  }
}
```

- [ ] **Step 4: Registrar o relatório no catálogo**

Editar `chatfunnel-core/src/reports/catalog/schedules.catalog.ts` para o conteúdo completo:

```typescript
import type { ReportConfig } from "./index";

/** Volume de agendamentos no tempo, segmentado por status (timeSeries). */
export const schedulesVolumeReport: ReportConfig = {
  id: "schedules.volume",
  shaper: "timeSeries",
  cacheTtl: 900,
  query: (repos, accountId, params, tz) =>
    repos.schedulesReports.volumeTimeSeries(accountId, params, tz),
};

/** Comparecimento de agendamentos no tempo, segmentado por attendanceStatus (timeSeries). */
export const schedulesAttendanceReport: ReportConfig = {
  id: "schedules.attendance",
  shaper: "timeSeries",
  cacheTtl: 900,
  query: (repos, accountId, params, tz) =>
    repos.schedulesReports.attendanceTimeSeries(accountId, params, tz),
};

export const schedulesCatalog: ReportConfig[] = [
  schedulesVolumeReport,
  schedulesAttendanceReport,
];
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `cd chatfunnel-core && npm test -- schedules-attendance`
Expected: PASS (2 testes).

- [ ] **Step 6: Rodar a suíte de agendamentos completa (garantir que `schedules.volume` não quebrou)**

Run: `cd chatfunnel-core && npm test -- schedules-volume`
Expected: PASS (2 testes, sem regressão).

---

### Task 2: Services — endpoint `GET /reports/v2/schedules/attendance`

**Files:**
- Modify: `chatfunnel-services/src/modules/reports-v2/controllers/schedules.controller.ts`
- Modify: `chatfunnel-services/src/modules/reports-v2/controllers/schedules.controller.spec.ts`

**Interfaces:**
- Consumes: `ReportsV2Service.run<T>(id, accountId, params, timezone)` (já existe, `chatfunnel-services/src/modules/reports-v2/reports-v2.service.ts:29`); id `"schedules.attendance"` (Task 1).
- Produces: rota HTTP `GET /reports/v2/schedules/attendance` (prefixo `/nest` aplicado globalmente), retorna `SegmentedTimeSeries`.

Nenhuma mudança em `reports-v2.module.ts` — `SchedulesReportsV2Controller` já está registrado (linha 29); só ganha um método novo.

- [ ] **Step 1: Escrever o teste (falhando) do controller**

Editar `chatfunnel-services/src/modules/reports-v2/controllers/schedules.controller.spec.ts` para o conteúdo completo:

```typescript
import { SchedulesReportsV2Controller } from "./schedules.controller";
import { ReportsV2Service } from "../reports-v2.service";
import { BaseReportDto } from "../dtos/base-report.dto";

describe("SchedulesReportsV2Controller (mapping)", () => {
  function makeController() {
    const run = jest.fn().mockResolvedValue({ granularity: "day", segments: [] });
    const service = { run } as unknown as ReportsV2Service;
    return { controller: new SchedulesReportsV2Controller(service), run };
  }

  const dto: BaseReportDto = Object.assign(new BaseReportDto(), {
    initialDate: new Date("2026-01-01T00:00:00Z"),
    finalDate: new Date("2026-01-31T00:00:00Z"),
  });

  it("volume() delega com id schedules.volume, accountId e timezone (headers)", async () => {
    const { controller, run } = makeController();
    await controller.volume("acc-A", "America/Sao_Paulo", dto);
    expect(run).toHaveBeenCalledWith(
      "schedules.volume",
      "acc-A",
      expect.objectContaining({
        initialDate: dto.initialDate,
        finalDate: dto.finalDate,
      }),
      "America/Sao_Paulo",
    );
  });

  it("attendance() delega com id schedules.attendance, accountId e timezone (headers)", async () => {
    const { controller, run } = makeController();
    await controller.attendance("acc-A", "America/Sao_Paulo", dto);
    expect(run).toHaveBeenCalledWith(
      "schedules.attendance",
      "acc-A",
      expect.objectContaining({
        initialDate: dto.initialDate,
        finalDate: dto.finalDate,
      }),
      "America/Sao_Paulo",
    );
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd chatfunnel-services && npm test -- schedules.controller`
Expected: FAIL — `controller.attendance is not a function`.

- [ ] **Step 3: Implementar o endpoint**

Editar `chatfunnel-services/src/modules/reports-v2/controllers/schedules.controller.ts` para o conteúdo completo:

```typescript
import { Controller, Get, Headers, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { SegmentedTimeSeries } from "@chatfunnel/contracts";
import { ReportsV2Service } from "../reports-v2.service";
import { BaseReportDto, toReportParams } from "../dtos/base-report.dto";

@ApiTags("reports-v2")
@Controller("reports/v2/schedules")
export class SchedulesReportsV2Controller {
  constructor(private readonly reports: ReportsV2Service) {}

  /** Volume de agendamentos no tempo, segmentado por status (timeSeries). */
  @Get("volume")
  @UseGuards(AuthGuard("jwt"))
  @ApiBearerAuth()
  volume(
    @Headers("Account-Selected") accountId: string,
    @Headers("Timezone") timezone: string,
    @Query() dto: BaseReportDto,
  ) {
    return this.reports.run<SegmentedTimeSeries>(
      "schedules.volume",
      accountId,
      toReportParams(dto),
      timezone,
    );
  }

  /** Comparecimento de agendamentos no tempo, segmentado por attendanceStatus (timeSeries). */
  @Get("attendance")
  @UseGuards(AuthGuard("jwt"))
  @ApiBearerAuth()
  attendance(
    @Headers("Account-Selected") accountId: string,
    @Headers("Timezone") timezone: string,
    @Query() dto: BaseReportDto,
  ) {
    return this.reports.run<SegmentedTimeSeries>(
      "schedules.attendance",
      accountId,
      toReportParams(dto),
      timezone,
    );
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd chatfunnel-services && npm test -- schedules.controller`
Expected: PASS (2 testes).

---

### Task 3: Front — `ReportsV2Service.getSchedulesAttendance`

**Files:**
- Modify: `chatfunnel-front/src/views/reportsV2/composables/useReportsFilters.helpers.ts`
- Modify: `chatfunnel-front/src/common/services/ReportsV2Service.ts`
- Modify: `chatfunnel-front/src/common/services/__tests__/ReportsV2Service.spec.ts`

**Interfaces:**
- Produces: `ReportsV2Service.getSchedulesAttendance(filters: ReportsFilters): Promise<SegmentedTimeSeries>` — sempre expõe `.segments` (array, vazio se o backend devolver o shape flat de resultado vazio).

- [ ] **Step 1: Escrever o teste (falhando) do novo método do service**

Editar `chatfunnel-front/src/common/services/__tests__/ReportsV2Service.spec.ts` — inserir após o bloco `describe("getSchedulesVolume ...")` (linha 78, antes de `describe("getAgentsCost ...")`):

```typescript
  describe("getSchedulesAttendance (SegmentedTimeSeries por attendanceStatus)", () => {
    it("chama o endpoint /schedules/attendance e devolve os segmentos intactos", async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          granularity: "day",
          segments: [
            { segment: "SHOW", points: [{ date: "2026-05-01", value: 8 }] },
            { segment: "NO_SHOW", points: [{ date: "2026-05-01", value: 2 }] },
          ],
        },
      });

      const out = await ReportsV2Service.getSchedulesAttendance(baseFilters);

      expect(mockGet).toHaveBeenCalledWith(
        "/reports/v2/schedules/attendance",
        expect.objectContaining({ initialDate: "2026-05-01T00:00:00Z" })
      );
      expect(out.segments).toHaveLength(2);
      expect(out.segments.map((s) => s.segment).sort()).toEqual(["NO_SHOW", "SHOW"]);
    });

    it("normaliza resultado vazio (shape flat sem segments) para segments: []", async () => {
      mockGet.mockResolvedValueOnce({
        data: { granularity: "day", series: [] },
      });

      const out = await ReportsV2Service.getSchedulesAttendance(baseFilters);

      expect(out.segments).toEqual([]);
    });
  });

```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd chatfunnel-front && npx vitest run src/common/services/__tests__/ReportsV2Service.spec.ts`
Expected: FAIL — `ReportsV2Service.getSchedulesAttendance is not a function`.

- [ ] **Step 3: Adicionar `"schedules/attendance"` na whitelist de endpoints**

Editar `chatfunnel-front/src/views/reportsV2/composables/useReportsFilters.helpers.ts`:

Adicionar ao union type `ReportEndpoint` (logo após `| "schedules/volume"`, linha 87):

```typescript
  | "schedules/volume"
  | "schedules/attendance"
```

Adicionar ao `ENDPOINT_OPTIONAL` (logo após `"schedules/volume": [],`, linha 148):

```typescript
  "schedules/volume": [],
  "schedules/attendance": [],
```

- [ ] **Step 4: Implementar `getSchedulesAttendance`**

Editar `chatfunnel-front/src/common/services/ReportsV2Service.ts` — inserir logo após `getSchedulesVolume` (após a linha 357, dentro do bloco `// ---- Agendamentos ----`):

```typescript
  // Mantém a quebra por segmento (SHOW/NO_SHOW/PENDING) — quem consome decide
  // o que somar (ex.: AgendamentosTab soma SHOW/NO_SHOW pro donut, ignora PENDING).
  // Resultado vazio: shaper devolve TimeSeries flat (sem segments) — normaliza
  // pra sempre expor `segments` (ainda que vazio), como getCrmRevenue.
  getSchedulesAttendance: (filters: ReportsFilters): Promise<SegmentedTimeSeries> =>
    (
      NestApi.get()(
        `${REPORTS_V2_BASE}/schedules/attendance`,
        buildReportParams("schedules/attendance", filters)
      ) as Promise<AxiosResponse<SegmentedTimeSeries>>
    ).then((res) => ({ ...res.data, segments: res.data.segments ?? [] })),

```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `cd chatfunnel-front && npx vitest run src/common/services/__tests__/ReportsV2Service.spec.ts`
Expected: PASS (todos os testes do arquivo, incluindo os 2 novos).

---

### Task 4: Front — helper `sumSegment` em `utils/series.ts`

**Files:**
- Modify: `chatfunnel-front/src/views/reportsV2/utils/series.ts`
- Modify: `chatfunnel-front/src/views/reportsV2/utils/__tests__/series.spec.ts`

**Interfaces:**
- Produces: `sumSegment(data: SegmentedTimeSeries, segment: string): number` — soma todos os `points[].value` do segmento pedido, através de todas as datas; `0` se o segmento não existir.

- [ ] **Step 1: Escrever o teste (falhando)**

Editar `chatfunnel-front/src/views/reportsV2/utils/__tests__/series.spec.ts` para o conteúdo completo:

```typescript
import { describe, it, expect } from "vitest";
import { sumTimeSeries, sumSegment } from "../series";

describe("sumTimeSeries", () => {
  it("soma todos os pontos da série", () => {
    const total = sumTimeSeries({
      granularity: "day",
      series: [
        { date: "2026-06-01", value: 4 },
        { date: "2026-06-02", value: 6 },
        { date: "2026-06-03", value: 3 },
      ],
    });
    expect(total).toBe(13);
  });

  it("retorna 0 para série vazia", () => {
    expect(sumTimeSeries({ granularity: "day", series: [] })).toBe(0);
  });
});

describe("sumSegment", () => {
  const data = {
    granularity: "day" as const,
    segments: [
      {
        segment: "SHOW",
        points: [
          { date: "2026-06-01", value: 8 },
          { date: "2026-06-02", value: 5 },
        ],
      },
      { segment: "NO_SHOW", points: [{ date: "2026-06-01", value: 2 }] },
    ],
  };

  it("soma os pontos de todas as datas de um segmento específico", () => {
    expect(sumSegment(data, "SHOW")).toBe(13);
  });

  it("retorna 0 para um segmento ausente", () => {
    expect(sumSegment(data, "PENDING")).toBe(0);
  });

  it("retorna 0 quando não há segments (shape flat vazio)", () => {
    expect(sumSegment({ granularity: "day", series: [] } as never, "SHOW")).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/utils/__tests__/series.spec.ts`
Expected: FAIL — `sumSegment is not a function` (ou `not exported`).

- [ ] **Step 3: Implementar `sumSegment`**

Editar `chatfunnel-front/src/views/reportsV2/utils/series.ts` para o conteúdo completo:

```typescript
import type { SegmentedTimeSeries, TimeSeries } from "@chatfunnel/contracts";

// Soma todos os pontos de uma série temporal flat — total no período
// (ex.: total de agendamentos somando o volume diário).
export function sumTimeSeries(data: TimeSeries): number {
  return data.series.reduce((sum, p) => sum + p.value, 0);
}

// Soma todos os pontos de UM segmento específico dentro de uma série
// segmentada, através de todas as datas — total do segmento no período
// (ex.: total de "SHOW" dentro de schedules.attendance). 0 se o segmento
// não existir ou se a série vier no shape flat (sem `segments`).
export function sumSegment(data: SegmentedTimeSeries, segment: string): number {
  const target = data.segments?.find((s) => s.segment === segment);
  return target ? target.points.reduce((sum, p) => sum + p.value, 0) : 0;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/utils/__tests__/series.spec.ts`
Expected: PASS (5 testes).

---

### Task 5: Front — rótulos e cores SHOW/NO_SHOW/PENDING no `SegmentedTimeSeriesChart`

**Files:**
- Modify: `chatfunnel-front/src/views/reportsV2/components/primitives/echarts/segmentedTimeSeries.option.ts`
- Modify: `chatfunnel-front/src/views/reportsV2/components/primitives/echarts/__tests__/segmentedTimeSeries.option.spec.ts`

**Interfaces:**
- Produces: `buildSegmentedTimeSeriesOption` (já existente) agora rotula `SHOW` → "Compareceu" (verde), `NO_SHOW` → "Não compareceu" (vermelho), `PENDING` → "Pendente" (cinza), sem quebrar o comportamento existente (`WON`, `LOST`, `active`, `cancelled` etc.).

- [ ] **Step 1: Escrever os testes (falhando)**

Editar `chatfunnel-front/src/views/reportsV2/components/primitives/echarts/__tests__/segmentedTimeSeries.option.spec.ts` — inserir os 2 casos a seguir logo antes do último teste (`'não estoura quando o backend devolve o shape flat vazio...'`, linha 51):

```typescript
  it('rotula segmentos de comparecimento (SHOW/NO_SHOW/PENDING) em pt-BR', () => {
    const opt = buildSegmentedTimeSeriesOption({
      segments: [
        { segment: 'SHOW', points: [{ date: '2026-06-01', value: 8 }] },
        { segment: 'NO_SHOW', points: [{ date: '2026-06-01', value: 2 }] },
        { segment: 'PENDING', points: [{ date: '2026-06-01', value: 3 }] },
      ],
    } as never);
    const byName = opt.series.map((s: { name: string }) => s.name).sort();
    expect(byName).toEqual(['Compareceu', 'Não compareceu', 'Pendente']);
  });

  it('usa cores fixas (verde/vermelho/cinza) para SHOW/NO_SHOW/PENDING', () => {
    const opt = buildSegmentedTimeSeriesOption({
      segments: [
        { segment: 'SHOW', points: [{ date: '2026-06-01', value: 8 }] },
        { segment: 'NO_SHOW', points: [{ date: '2026-06-01', value: 2 }] },
      ],
    } as never);
    const show = opt.series.find((s: { name: string }) => s.name === 'Compareceu');
    const noShow = opt.series.find((s: { name: string }) => s.name === 'Não compareceu');
    expect(show.itemStyle.color).not.toBe(noShow.itemStyle.color);
  });

```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/components/primitives/echarts/__tests__/segmentedTimeSeries.option.spec.ts`
Expected: FAIL — `byName` traz `['NO_SHOW', 'PENDING', 'SHOW']` (raw, sem rótulo pt-BR) em vez dos labels esperados.

- [ ] **Step 3: Estender os mapas de cor e rótulo**

Editar `chatfunnel-front/src/views/reportsV2/components/primitives/echarts/segmentedTimeSeries.option.ts` — trocar os dois mapas (linhas 14-25 e 40-53) pelo conteúdo completo abaixo (import de `getMutedColor` já existe no arquivo, linha 9):

```typescript
const KNOWN_SEGMENT_COLOR: Record<string, () => string> = {
  WON: getGreenColor,
  LOST: getRedColor,
  opened: getBrandColor,
  closed: getInkColor,
  active: getGreenColor,
  cancelled: getRedColor,
  CONTACT: getBrandColor,
  HUMAN: getInkColor,
  BOT: getYellowColor,
  ASSISTANT: getBlueColor,
  SHOW: getGreenColor,
  NO_SHOW: getRedColor,
  PENDING: getMutedColor,
};
```

```typescript
const KNOWN_SEGMENT_LABEL: Record<string, string> = {
  WON: "Ganhos",
  LOST: "Perdidos",
  OPEN: "Aberto",
  opened: "Abertas",
  closed: "Fechadas",
  active: "Ativos",
  cancelled: "Cancelados",
  CONTACT: "Contato",
  HUMAN: "Humano",
  BOT: "Flow",
  ASSISTANT: "IA",
  direct: "Direto",
  SHOW: "Compareceu",
  NO_SHOW: "Não compareceu",
  PENDING: "Pendente",
};
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/components/primitives/echarts/__tests__/segmentedTimeSeries.option.spec.ts`
Expected: PASS (7 testes).

---

### Task 6: Front — `AttendanceDonut`, `reportInfo` e wiring em `AgendamentosTab.vue`

**Files:**
- Create: `chatfunnel-front/src/views/reportsV2/components/primitives/echarts/AttendanceDonut.vue`
- Modify: `chatfunnel-front/src/views/reportsV2/info/reportInfo.ts`
- Modify: `chatfunnel-front/src/views/reportsV2/tabs/AgendamentosTab.vue`
- Create: `chatfunnel-front/src/views/reportsV2/tabs/__tests__/AgendamentosTab.spec.ts`

**Interfaces:**
- Consumes: `ReportsV2Service.getSchedulesAttendance` (Task 3), `sumSegment` (Task 4), `buildChannelDonutOption`/`DonutSegment` de `channelDonut.option.ts` (já existe, genérico — não modificado).
- Produces: componente `AttendanceDonut` com props `{ show: number; noShow: number }`; chaves `"agendamentos.attendance"` e `"agendamentos.attendanceTotal"` em `REPORT_INFO`.

- [ ] **Step 1: Escrever o teste (falhando) da aba**

Criar `chatfunnel-front/src/views/reportsV2/tabs/__tests__/AgendamentosTab.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

const mockFilters = { initialDate: "2026-01-01", finalDate: "2026-01-31" };

vi.mock("../../composables/useReportsFilters", () => ({
  useReportsFilters: () => ({ filters: mockFilters }),
}));

const mockGetSchedulesVolume = vi.fn().mockResolvedValue({
  granularity: "day",
  series: [{ date: "2026-01-02", value: 7 }],
});
const mockGetSchedulesAttendance = vi.fn().mockResolvedValue({
  granularity: "day",
  segments: [
    { segment: "SHOW", points: [{ date: "2026-01-02", value: 8 }] },
    { segment: "NO_SHOW", points: [{ date: "2026-01-02", value: 2 }] },
    { segment: "PENDING", points: [{ date: "2026-01-02", value: 3 }] },
  ],
});

vi.mock("@services/index", () => ({
  ReportsV2Service: {
    getSchedulesVolume: (...a: unknown[]) => mockGetSchedulesVolume(...a),
    getSchedulesAttendance: (...a: unknown[]) => mockGetSchedulesAttendance(...a),
  },
}));

import AgendamentosTab from "../AgendamentosTab.vue";

function mountTab() {
  return mount(AgendamentosTab, {
    global: {
      stubs: {
        ReportSection: {
          template:
            '<section><slot v-if="!loading && !error && !empty" /><slot name="actions" /></section>',
          props: ["title", "loading", "error", "empty"],
        },
        BarSeriesChart: { template: "<div />", props: ["data", "label"] },
        SegmentedTimeSeriesChart: { template: "<div />", props: ["data"] },
        AttendanceDonut: {
          template: '<div class="attendance-donut">{{ show }}/{{ noShow }}</div>',
          props: ["show", "noShow"],
        },
      },
    },
  });
}

describe("AgendamentosTab", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dispara volume e attendance no mount", async () => {
    mountTab();
    await flushPromises();
    expect(mockGetSchedulesVolume).toHaveBeenCalledTimes(1);
    expect(mockGetSchedulesAttendance).toHaveBeenCalledTimes(1);
  });

  it("soma SHOW e NO_SHOW pro donut, ignorando PENDING", async () => {
    const wrapper = mountTab();
    await flushPromises();
    expect(wrapper.find(".attendance-donut").text()).toBe("8/2");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/tabs/__tests__/AgendamentosTab.spec.ts`
Expected: FAIL — `getSchedulesAttendance` não é chamado (aba ainda não busca esse dado) e `.attendance-donut` não existe no DOM.

- [ ] **Step 3: Criar `AttendanceDonut.vue`**

Criar `chatfunnel-front/src/views/reportsV2/components/primitives/echarts/AttendanceDonut.vue`:

```vue
<template>
  <div class="flex flex-col items-center gap-5 sm:flex-row sm:justify-center sm:gap-7">
    <div class="relative h-[180px] w-[180px] shrink-0" role="img" aria-label="Proporção de comparecimento">
      <VChart :option="option" autoresize />
      <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span class="typo-body-16-semibold text-gray-1000">{{ centralLabel }}</span>
        <span class="typo-body-10-regular text-gray-700">agendamentos</span>
      </div>
    </div>

    <ul class="flex w-full flex-col gap-2.5 sm:w-auto sm:min-w-44">
      <li v-for="seg in segments" :key="seg.displayLabel" class="flex items-center gap-2.5">
        <span class="size-2.5 shrink-0 rounded-full" :style="{ backgroundColor: seg.color }" />
        <span class="typo-body-12-semibold truncate text-gray-1000">{{ seg.displayLabel }}</span>
        <span class="typo-body-12-semibold ml-auto font-mono tabular-nums text-gray-1000">
          {{ formatNumber(seg.value) }}
        </span>
        <span class="typo-body-12-regular w-10 text-right font-mono tabular-nums text-gray-700">
          {{ formatPercent(seg.value) }}
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { getGreenColor, getRedColor } from '../../../charts/tokens'
import '../../../charts/echarts.config'
import { buildChannelDonutOption, type DonutSegment } from './channelDonut.option'

const props = defineProps<{ show: number; noShow: number }>()

const segments = computed<DonutSegment[]>(() => [
  { displayLabel: 'Compareceu', value: props.show, color: getGreenColor() },
  { displayLabel: 'Não compareceu', value: props.noShow, color: getRedColor() }
])

const total = computed(() => props.show + props.noShow)

const nf = new Intl.NumberFormat('pt-BR')
const pf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

function formatNumber(value: number): string {
  return nf.format(value)
}
function formatPercent(value: number): string {
  if (total.value <= 0) return '0%'
  return `${pf.format((value / total.value) * 100)}%`
}

const centralLabel = computed(() => nf.format(total.value))

const option = computed(() => buildChannelDonutOption(segments.value))
</script>
```

- [ ] **Step 4: Adicionar as entradas de `reportInfo`**

Editar `chatfunnel-front/src/views/reportsV2/info/reportInfo.ts` — trocar o bloco da seção Agendamentos (linhas 288-294) pelo conteúdo completo:

```typescript
  // — Seções do tab Agendamentos —
  "agendamentos.volume": {
    title: "Volume de agendamentos",
    description:
      "Quantidade de agendamentos pela data do compromisso, ao longo do período.",
    dataType: "periodo",
  },
  "agendamentos.attendance": {
    title: "Comparecimento por dia",
    description:
      "Evolução diária de agendamentos com comparecimento confirmado, não comparecimento e pendentes, pela data do compromisso.",
    dataType: "periodo",
  },
  "agendamentos.attendanceTotal": {
    title: "Comparecimento no período",
    description:
      "Proporção de agendamentos com comparecimento confirmado versus não comparecimento no período, excluindo os pendentes.",
    dataType: "periodo",
  },
```

- [ ] **Step 5: Atualizar `AgendamentosTab.vue`**

Editar `chatfunnel-front/src/views/reportsV2/tabs/AgendamentosTab.vue` para o conteúdo completo:

```vue
<template>
  <div class="flex flex-col gap-3">
    <ReportSection
      class="print:break-before-page"
      title="Volume de agendamentos"
      info-key="agendamentos.volume"
      :loading="volume.loading.value"
      :error="volume.error.value"
      :empty="!!volume.data.value && volume.data.value.series.length === 0"
    >
      <template #actions>
        <span class="typo-body-10-regular text-gray-700">
          Pela data do compromisso
        </span>
      </template>
      <BarSeriesChart :data="volume.data.value!" label="Agendamentos" />
    </ReportSection>

    <div class="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <ReportSection
        class="lg:col-span-2"
        title="Comparecimento por dia"
        info-key="agendamentos.attendance"
        :loading="attendance.loading.value"
        :error="attendance.error.value"
        :empty="!!attendance.data.value && attendance.data.value.segments.length === 0"
      >
        <SegmentedTimeSeriesChart :data="attendance.data.value!" />
      </ReportSection>
      <ReportSection
        title="Comparecimento no período"
        info-key="agendamentos.attendanceTotal"
        :loading="attendance.loading.value"
        :error="attendance.error.value"
        :empty="attendanceTotal === 0"
      >
        <div class="flex h-full w-full flex-col items-center justify-center">
          <AttendanceDonut :show="showTotal" :no-show="noShowTotal" />
        </div>
      </ReportSection>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { ReportsV2Service } from '@services/index'
import { useReportsFilters } from '../composables/useReportsFilters'
import { useReportQuery } from '../composables/useReportQuery'
import { sumSegment } from '../utils/series'
import ReportSection from '../components/shared/ReportSection.vue'
import BarSeriesChart from '../components/primitives/echarts/BarSeriesChart.vue'
import SegmentedTimeSeriesChart from '../components/primitives/echarts/SegmentedTimeSeriesChart.vue'
import AttendanceDonut from '../components/primitives/echarts/AttendanceDonut.vue'

const { filters } = useReportsFilters()

const volume = useReportQuery(() => ReportsV2Service.getSchedulesVolume({ ...filters }))
const attendance = useReportQuery(() => ReportsV2Service.getSchedulesAttendance({ ...filters }))

const showTotal = computed(() => (attendance.data.value ? sumSegment(attendance.data.value, 'SHOW') : 0))
const noShowTotal = computed(() => (attendance.data.value ? sumSegment(attendance.data.value, 'NO_SHOW') : 0))
const attendanceTotal = computed(() => showTotal.value + noShowTotal.value)

function reloadAll(): void {
  volume.execute()
  attendance.execute()
}

onMounted(reloadAll)
watch(() => [filters.initialDate, filters.finalDate], reloadAll)
</script>
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/tabs/__tests__/AgendamentosTab.spec.ts`
Expected: PASS (2 testes).

- [ ] **Step 7: Rodar toda a suíte do front tocada por este plano (regressão)**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2 src/common/services/__tests__/ReportsV2Service.spec.ts`
Expected: PASS — nenhum teste existente (`GeralTab`, `ChannelDonut` option, etc.) quebrado.

---

## Depois da implementação

- Rodar `npm run typecheck` no `chatfunnel-front` (o usuário roda manualmente — regra do workspace proíbe build automático).
- Testar visualmente no navegador: abrir Reports V2 → aba Agendamentos, confirmar que os dois novos gráficos renderizam com dado real (ou vazio, se a conta de teste não tiver `attendanceStatus` diferente de `PENDING` ainda).
- Commit e branch ficam a critério do usuário — não fazem parte deste plano.
