# Reports V2 — Fase F0 (Esqueleto) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o esqueleto do `ReportsV2Module` no `chatfunnel-services`: helper de timezone, DTO base, orchestrator vazio, controller dummy com endpoint de ping — tudo registrado no `app.module.ts`, sem nenhum engine ou relatório real ainda. Os **shapes de saída** (wire contracts) ficam no pacote `@chatfunnel/contracts` (consumido por front e back), conforme a convenção do projeto.

**Architecture:** Módulo NestJS novo em paralelo ao `ReportsModule` legado. Engines/handlers virão na F1+. F0 entrega só a casca: schemas Zod compartilhados em `@chatfunnel/contracts/endpoints` (`TimeSeries`, `FunnelData`, `HeatmapData`, `Ranking`, `AgingData`, `MetricCard`, `Dashboard`, `ReportPayload`), helpers reusáveis no services e um endpoint `/reports/v2/ping` que devolve um payload `TimeSeries` mockado para o front validar o formato.

**Tech Stack:**
- `chatfunnel-contracts`: Zod (única dep permitida pelo ESLint), TypeScript estrito, tipos via `z.infer`.
- `chatfunnel-services`: NestJS 10, TypeScript estrito (zero `any`), class-validator + class-transformer (inputs), moment-timezone (já em uso), ioredis via `RedisService` global, Jest + ts-jest.

**Branch:** `feature/reports-v2` (já criada, sem commits ainda).

**Especificação base:**
- `docs/superpowers/specs/2026-05-28-relatorios-v2-arquitetura.md`
- `docs/superpowers/specs/2026-05-24-relatorios-design.md`
- `vault/wiki/features/reports-v2-arquitetura.md`

---

## File Structure

```
chatfunnel-contracts/src/endpoints/
└── reports.contracts.ts                              # Zod: TimeSeries, FunnelData, HeatmapData, Ranking,
                                                     #      AgingData, MetricCard, Dashboard, ReportPayload
                                                     #      + GetReportsV2PingResponse

chatfunnel-services/src/modules/reports-v2/
├── reports-v2.module.ts                              # registra controller + providers
├── core/
│   ├── period.helper.ts                              # fixTimezone + normalização de range
│   └── period.helper.spec.ts
├── dtos/
│   └── base-report.dto.ts                            # initialDate, finalDate, channelId?, moderatorId?
├── orchestrator/
│   ├── report.orchestrator.ts                        # registry vazio, lança NotFound para id desconhecido
│   └── report.orchestrator.spec.ts
└── controllers/
    └── ping.controller.ts                            # GET /reports/v2/ping → TimeSeries mockada
```

**Modificações:**
- `chatfunnel-contracts/src/endpoints/index.ts` — re-export do novo `reports.contracts.ts`.
- `chatfunnel-services/package.json` — bump da dep `@chatfunnel/contracts` para a versão `dev` publicada na Task 1.
- `chatfunnel-services/src/app.module.ts` — adicionar `ReportsV2Module` na lista de imports.

**Convenções herdadas do legado (`src/modules/reports/`):**
- DTOs com `@ApiProperty` + `class-validator` + `@Transform`
- Controller usa `@Headers("Account-Selected")`, `@Headers("Timezone")`, `@UseGuards(AuthGuard("jwt"))`, `@ApiBearerAuth()`
- `RedisService` (global) já oferece `get<T>(key)`, `set(key, value, ttl)`, `del(key)` com JSON serialization automática
- `moment.utc(...).format("YYYY-MM-DD HH:mm:ss")` + `moment.tz(string, timezone)` é o padrão de timezone

---

## Task 1: Shapes de saída padronizados em `@chatfunnel/contracts/endpoints/reports`

Schemas Zod compartilhados entre front e back. Vivem no `chatfunnel-contracts` (pure schema, única dep `zod`). Define o contrato de todos os relatórios V2 + a response do `/reports/v2/ping`. Sem TDD dedicado (Zod já valida sua própria forma); a integração é exercitada pela Task 6+7.

**Files:**
- Create: `chatfunnel-contracts/src/endpoints/reports.contracts.ts`
- Modify: `chatfunnel-contracts/src/endpoints/index.ts`

- [ ] **Step 1: Criar `reports.contracts.ts`**

```ts
// chatfunnel-contracts/src/endpoints/reports.contracts.ts
import { z } from "zod";

// ----- primitivos -----

export const Granularity = z.enum(["day", "week", "month"]);
export type Granularity = z.infer<typeof Granularity>;

export const TimeSeriesPoint = z.object({
  date: z.string(),
  value: z.number(),
  label: z.string().optional(),
});
export type TimeSeriesPoint = z.infer<typeof TimeSeriesPoint>;

// ----- shapes de saída -----

export const TimeSeries = z.object({
  series: z.array(TimeSeriesPoint),
  granularity: Granularity,
});
export type TimeSeries = z.infer<typeof TimeSeries>;

export const FunnelStage = z.object({
  id: z.string(),
  name: z.string(),
  total: z.number(),
  conversionFromPrevious: z.number().optional(),
});
export type FunnelStage = z.infer<typeof FunnelStage>;

export const FunnelData = z.object({
  stages: z.array(FunnelStage),
});
export type FunnelData = z.infer<typeof FunnelData>;

export const HeatmapCell = z.object({
  day: z.union([
    z.literal(0), z.literal(1), z.literal(2), z.literal(3),
    z.literal(4), z.literal(5), z.literal(6),
  ]),
  hour: z.number().int().min(0).max(23),
  value: z.number(),
});
export type HeatmapCell = z.infer<typeof HeatmapCell>;

export const HeatmapData = z.object({
  cells: z.array(HeatmapCell),
  max: z.number(),
});
export type HeatmapData = z.infer<typeof HeatmapData>;

export const RankingEntry = z.object({
  id: z.string(),
  label: z.string(),
  value: z.number(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type RankingEntry = z.infer<typeof RankingEntry>;

export const Ranking = z.object({
  entries: z.array(RankingEntry),
  total: z.number(),
});
export type Ranking = z.infer<typeof Ranking>;

export const AgingBucket = z.object({
  label: z.string(),
  range: z.tuple([z.number(), z.number().nullable()]),
  count: z.number(),
});
export type AgingBucket = z.infer<typeof AgingBucket>;

export const AgingData = z.object({
  buckets: z.array(AgingBucket),
});
export type AgingData = z.infer<typeof AgingData>;

export const MetricCardFormat = z.enum(["number", "currency", "percentage", "duration"]);
export type MetricCardFormat = z.infer<typeof MetricCardFormat>;

export const MetricCardDelta = z.object({
  absolute: z.number(),
  percentage: z.number(),
});
export type MetricCardDelta = z.infer<typeof MetricCardDelta>;

export const MetricCard = z.object({
  value: z.number(),
  format: MetricCardFormat.optional(),
  delta: MetricCardDelta.optional(),
  sparkline: z.array(TimeSeriesPoint).optional(),
});
export type MetricCard = z.infer<typeof MetricCard>;

export const Dashboard = z.object({
  cards: z.record(z.string(), MetricCard),
});
export type Dashboard = z.infer<typeof Dashboard>;

export const ReportPayload = z.union([
  TimeSeries,
  FunnelData,
  HeatmapData,
  Ranking,
  AgingData,
  MetricCard,
  Dashboard,
]);
export type ReportPayload = z.infer<typeof ReportPayload>;

// ----- GET /reports/v2/ping -----

export const GetReportsV2PingResponse = TimeSeries.extend({
  meta: z.object({
    accountId: z.string(),
    timezone: z.string(),
  }),
});
export type GetReportsV2PingResponse = z.infer<typeof GetReportsV2PingResponse>;
```

- [ ] **Step 2: Re-export no barrel do subpath**

Edit `chatfunnel-contracts/src/endpoints/index.ts` — adicionar ao final:

```ts
export * from "./reports.contracts";
```

(Manter o bloco de comentário existente da convenção intacto.)

- [ ] **Step 3: Build e lint local do contracts**

Run: `cd chatfunnel-contracts && npm run build && npm run lint`
Expected: `dist/` gerado limpo; ESLint sem violações (em especial nenhum `no-restricted-imports`, que bloqueia deps além do `zod`).

> **Manual (fora do escopo deste plano):**
> - Disponibilizar o pacote no `chatfunnel-services` para teste local (`npm link`, `file:../chatfunnel-contracts`, ou similar).
> - Posteriormente, publish via Jenkins (`branch dev` → tag npm `dev`) e bump da dep no `services/package.json` quando F0 estiver validado.
>
> As próximas tasks assumem que `import type { ... } from "@chatfunnel/contracts/endpoints"` já resolve dentro do `chatfunnel-services`.

---

## Task 2: Helper de timezone e normalização de período (`period.helper.ts`)

Centraliza o que hoje está duplicado em cada handler legado (`fixTimezone`). TDD.

**Files:**
- Create: `chatfunnel-services/src/modules/reports-v2/core/period.helper.ts`
- Test: `chatfunnel-services/src/modules/reports-v2/core/period.helper.spec.ts`

- [ ] **Step 1: Escrever o spec falhando**

```ts
// src/modules/reports-v2/core/period.helper.spec.ts
import { fixTimezone, normalizeRange, DEFAULT_TIMEZONE } from "./period.helper";

describe("period.helper", () => {
  describe("fixTimezone", () => {
    it("retorna moment no timezone informado preservando o relógio UTC", () => {
      const utc = new Date("2026-01-15T10:00:00Z");
      const result = fixTimezone(utc, "America/Sao_Paulo");

      expect(result.format("YYYY-MM-DD HH:mm:ss")).toBe("2026-01-15 10:00:00");
      expect(result.tz()).toBe("America/Sao_Paulo");
    });

    it("usa America/Sao_Paulo como default quando timezone não é informado", () => {
      const utc = new Date("2026-01-15T10:00:00Z");
      const result = fixTimezone(utc);

      expect(result.tz()).toBe(DEFAULT_TIMEZONE);
      expect(DEFAULT_TIMEZONE).toBe("America/Sao_Paulo");
    });
  });

  describe("normalizeRange", () => {
    it("converte initialDate em começo do dia (00:00:00) no timezone", () => {
      const initial = new Date("2026-01-15T00:00:00Z");
      const final = new Date("2026-01-20T00:00:00Z");

      const { start, end } = normalizeRange(initial, final, "America/Sao_Paulo");

      expect(start.toISOString()).toBe("2026-01-15T00:00:00.000Z");
      expect(end.toISOString()).toBe("2026-01-20T23:59:59.000Z");
    });

    it("lança erro quando initialDate é posterior a finalDate", () => {
      const initial = new Date("2026-01-20T00:00:00Z");
      const final = new Date("2026-01-15T00:00:00Z");

      expect(() => normalizeRange(initial, final, "America/Sao_Paulo")).toThrow(
        /initialDate.*posterior.*finalDate/i,
      );
    });
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `cd chatfunnel-services && npx jest src/modules/reports-v2/core/period.helper.spec.ts`
Expected: FAIL — `Cannot find module './period.helper'`.

- [ ] **Step 3: Implementar o helper**

```ts
// src/modules/reports-v2/core/period.helper.ts
import moment from "moment-timezone";

export const DEFAULT_TIMEZONE = "America/Sao_Paulo";

export function fixTimezone(
  utcDate: Date,
  timezone: string = DEFAULT_TIMEZONE,
): moment.Moment {
  const dateStringWithoutZone = moment.utc(utcDate).format("YYYY-MM-DD HH:mm:ss");
  return moment.tz(dateStringWithoutZone, timezone);
}

export type NormalizedRange = {
  start: Date;
  end: Date;
};

export function normalizeRange(
  initialDate: Date,
  finalDate: Date,
  timezone: string = DEFAULT_TIMEZONE,
): NormalizedRange {
  if (initialDate.getTime() > finalDate.getTime()) {
    throw new Error("initialDate não pode ser posterior a finalDate");
  }

  const start = fixTimezone(initialDate, timezone).toDate();
  const end = fixTimezone(finalDate, timezone)
    .add(23, "hours")
    .add(59, "minutes")
    .add(59, "seconds")
    .toDate();

  return { start, end };
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `cd chatfunnel-services && npx jest src/modules/reports-v2/core/period.helper.spec.ts`
Expected: PASS — 4 testes.

---

> **Task 3 (Cache service) — adiada para fase posterior.** F0 entrega requisição direta, sem camada de cache. Quando voltar, ela ocupa este slot com `ReportCacheService` (wrapper Redis + hash determinístico da DTO).

---

## Task 4: DTO base (`base-report.dto.ts`)

Define os campos compartilhados por todos os relatórios. Sem TDD dedicado — decorators de validação são testados implicitamente via integração na Task 7.

**Files:**
- Create: `chatfunnel-services/src/modules/reports-v2/dtos/base-report.dto.ts`

- [ ] **Step 1: Criar a DTO**

```ts
// src/modules/reports-v2/dtos/base-report.dto.ts
import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsDate, IsOptional, IsUUID } from "class-validator";

export class BaseReportDto {
  @ApiProperty({
    description: "Data inicial do período (ISO 8601)",
    example: "2026-01-01T00:00:00Z",
    required: false,
  })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => (value ? new Date(value) : value))
  initialDate?: Date;

  @ApiProperty({
    description: "Data final do período (ISO 8601)",
    example: "2026-01-31T23:59:59Z",
    required: false,
  })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => (value ? new Date(value) : value))
  finalDate?: Date;

  @ApiProperty({
    description: "ID do canal para filtrar",
    example: "123e4567-e89b-12d3-a456-426614174000",
    required: false,
  })
  @IsOptional()
  @IsUUID()
  channelId?: string;

  @ApiProperty({
    description: "ID do moderador para filtrar",
    example: "123e4567-e89b-12d3-a456-426614174000",
    required: false,
  })
  @IsOptional()
  @IsUUID()
  moderatorId?: string;
}
```

- [ ] **Step 2: Garantir que compila**

Run: `cd chatfunnel-services && npx tsc --noEmit -p tsconfig.json`
Expected: sem erros.

---

## Task 5: Orchestrator vazio (`report.orchestrator.ts`)

Esqueleto que vai receber engines/specials nas próximas fases. F0 entrega o orchestrator com `registry` vazio que lança `NotFoundException` para qualquer `reportId` desconhecido. TDD.

**Files:**
- Create: `chatfunnel-services/src/modules/reports-v2/orchestrator/report.orchestrator.ts`
- Test: `chatfunnel-services/src/modules/reports-v2/orchestrator/report.orchestrator.spec.ts`

- [ ] **Step 1: Escrever o spec falhando**

```ts
// src/modules/reports-v2/orchestrator/report.orchestrator.spec.ts
import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ReportOrchestrator } from "./report.orchestrator";

describe("ReportOrchestrator", () => {
  let orchestrator: ReportOrchestrator;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportOrchestrator],
    }).compile();

    orchestrator = module.get(ReportOrchestrator);
  });

  it("lança NotFoundException para reportId desconhecido", async () => {
    await expect(
      orchestrator.run("inexistente", "acc-1", {}, "America/Sao_Paulo"),
    ).rejects.toThrow(NotFoundException);
  });

  it("mensagem da exception contém o reportId pedido", async () => {
    await expect(
      orchestrator.run("crm.inventado", "acc-1", {}, "America/Sao_Paulo"),
    ).rejects.toThrow(/crm\.inventado/);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `cd chatfunnel-services && npx jest src/modules/reports-v2/orchestrator/report.orchestrator.spec.ts`
Expected: FAIL — `Cannot find module './report.orchestrator'`.

- [ ] **Step 3: Implementar o orchestrator**

```ts
// src/modules/reports-v2/orchestrator/report.orchestrator.ts
import { Injectable, NotFoundException } from "@nestjs/common";
import type { ReportPayload } from "@chatfunnel/contracts/endpoints";
import { BaseReportDto } from "../dtos/base-report.dto";

export type ReportRegistry = Map<string, unknown>;

@Injectable()
export class ReportOrchestrator {
  private readonly registry: ReportRegistry = new Map();

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
    void accountId;
    void dto;
    void timezone;
    throw new NotFoundException(
      `Relatório "${reportId}" registrado, mas nenhum engine disponível em F0`,
    );
  }
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `cd chatfunnel-services && npx jest src/modules/reports-v2/orchestrator/report.orchestrator.spec.ts`
Expected: PASS — 2 testes.

---

## Task 6: Controller dummy + módulo (`ping.controller.ts`, `reports-v2.module.ts`)

Cria endpoint `GET /reports/v2/ping` que devolve um payload `TimeSeries` mockado — serve como validação de shape para o front antes de qualquer relatório real chegar. Cria o módulo NestJS amarrando providers e o controller.

**Files:**
- Create: `chatfunnel-services/src/modules/reports-v2/controllers/ping.controller.ts`
- Create: `chatfunnel-services/src/modules/reports-v2/reports-v2.module.ts`

- [ ] **Step 1: Criar o controller**

```ts
// src/modules/reports-v2/controllers/ping.controller.ts
import { Controller, Get, Headers, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { GetReportsV2PingResponse } from "@chatfunnel/contracts/endpoints";
import { DEFAULT_TIMEZONE } from "../core/period.helper";

@ApiTags("Relatórios V2 — Health")
@Controller("reports/v2")
export class PingController {
  @Get("ping")
  @UseGuards(AuthGuard("jwt"))
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Endpoint de health-check do módulo Reports V2",
    description:
      "Retorna um payload TimeSeries mockado para validar o shape de saída no front. Não consulta banco.",
  })
  ping(
    @Headers("Account-Selected") accountId: string,
    @Headers("Timezone") timezone: string,
  ): GetReportsV2PingResponse {
    return {
      series: [
        { date: "2026-01-01", value: 10 },
        { date: "2026-01-02", value: 15 },
        { date: "2026-01-03", value: 12 },
      ],
      granularity: "day",
      meta: {
        accountId: accountId ?? "unknown",
        timezone: timezone ?? DEFAULT_TIMEZONE,
      },
    };
  }
}
```

- [ ] **Step 2: Criar o módulo**

```ts
// src/modules/reports-v2/reports-v2.module.ts
import { Module } from "@nestjs/common";
import { PingController } from "./controllers/ping.controller";
import { ReportOrchestrator } from "./orchestrator/report.orchestrator";

@Module({
  imports: [],
  controllers: [PingController],
  providers: [ReportOrchestrator],
  exports: [ReportOrchestrator],
})
export class ReportsV2Module {}
```

- [ ] **Step 3: Garantir que compila**

Run: `cd chatfunnel-services && npx tsc --noEmit -p tsconfig.json`
Expected: sem erros.

---

## Task 7: Registrar `ReportsV2Module` no `app.module.ts`

**Files:**
- Modify: `chatfunnel-services/src/app.module.ts`

- [ ] **Step 1: Adicionar import e entrada na lista de módulos**

No topo do arquivo, junto dos outros imports de modules:

```ts
import { ReportsV2Module } from "./modules/reports-v2/reports-v2.module";
```

E na lista `imports: [...]` do `@Module`, adicionar logo após `ReportsModule`:

```ts
    ReportsModule,
    ReportsV2Module,
```

- [ ] **Step 2: Garantir que compila**

Run: `cd chatfunnel-services && npx tsc --noEmit -p tsconfig.json`
Expected: sem erros.

- [ ] **Step 3: Subir o app e verificar a rota**

Run: `cd chatfunnel-services && npm run start:dev`

Em outro terminal:

```bash
# Sem JWT: deve dar 401 (significa que a rota existe e o guard está ativo)
curl -i http://localhost:3200/reports/v2/ping
```

Expected: `HTTP/1.1 401 Unauthorized` (rota registrada, AuthGuard rejeitando).

Com JWT válido (substituir `$TOKEN` por um token de teste do ambiente local):

```bash
curl -s http://localhost:3200/reports/v2/ping \
  -H "Authorization: Bearer $TOKEN" \
  -H "Account-Selected: <accountId-de-teste>" \
  -H "Timezone: America/Sao_Paulo"
```

Expected (200 OK):

```json
{
  "series": [
    { "date": "2026-01-01", "value": 10 },
    { "date": "2026-01-02", "value": 15 },
    { "date": "2026-01-03", "value": 12 }
  ],
  "granularity": "day",
  "meta": {
    "accountId": "<accountId-de-teste>",
    "timezone": "America/Sao_Paulo"
  }
}
```

Encerrar o `start:dev` (Ctrl+C).

---

## Task 8: Smoke test full suite + validação final

Garantir que F0 não quebrou nada do que já existia.

- [ ] **Step 1: Rodar todos os testes do módulo reports-v2**

Run: `cd chatfunnel-services && npx jest src/modules/reports-v2`
Expected: PASS — 6 testes (Task 2: 4, Task 5: 2).

- [ ] **Step 2: Rodar a suite completa do projeto**

Run: `cd chatfunnel-services && npm test`
Expected: todos os specs verdes. Se algum spec não-relacionado falhar, **NÃO** é regressão de F0 — registrar no commit message mas seguir.

- [ ] **Step 3: Build de produção**

Run: `cd chatfunnel-services && npm run build`
Expected: build limpo, sem erros TypeScript.

- [ ] **Step 4: Atualizar o vault**

Modify: `vault/wiki/features/reports-v2-arquitetura.md` — alterar `status: plano-pre-implementacao` para `status: f0-em-implementacao` no frontmatter, e na seção 9 marcar Fase 0 como concluída:

```markdown
### Fase 0 — Esqueleto (1 dia) ✅ concluida em 2026-06-01

- [x] `reports-v2.module.ts` registrado em `app.module.ts`
- [x] Shapes em `@chatfunnel/contracts/endpoints/reports.contracts.ts`, helper `core/period.helper.ts`
- [x] `dtos/base-report.dto.ts`
- [x] `orchestrator/report.orchestrator.ts` (sem nenhum engine ainda)
- [x] 1 endpoint dummy retornando shape de teste — `GET /reports/v2/ping`
```

---

## Critérios de aceitação de F0

1. `chatfunnel-contracts/src/endpoints/reports.contracts.ts` criado e re-exportado em `endpoints/index.ts`; `npm run build && npm run lint` no contracts limpos.
2. Pacote `@chatfunnel/contracts` disponível para o `chatfunnel-services` (via `npm link`, `file:..`, ou versão publicada — a definir pelo usuário antes do publish oficial).
3. `GET /reports/v2/ping` responde 401 sem JWT e 200 com JWT válido, devolvendo o payload `TimeSeries` mockado, tipado como `GetReportsV2PingResponse`.
4. `npx jest src/modules/reports-v2` passa com pelo menos 6 testes verdes.
5. `npx tsc --noEmit` e `npm run build` rodam sem erros tanto no `chatfunnel-contracts` quanto no `chatfunnel-services`.
6. Nenhum arquivo do `ReportsModule` legado foi modificado.
7. Nenhum tipo de shape de relatório vive dentro do `chatfunnel-services` — todos são importados de `@chatfunnel/contracts/endpoints`.
8. `vault/wiki/features/reports-v2-arquitetura.md` marca F0 como concluída.

> Commits, branches, push e publish são responsabilidade manual do usuário — este plano cobre só as mudanças de arquivos e validações.

---

## Próximos passos (fora desta F0)

- F1 — engines + 1 relatório por padrão (TimeSeries, Ranking, Heatmap, Funnel, Aging, MetricCard)
- Front: consumir `/reports/v2/ping` em um stub de página para validar o shape antes de F1
- Migration de indexes compostos (paralelo, F4 do spec)
