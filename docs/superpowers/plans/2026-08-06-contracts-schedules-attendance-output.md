# Paridade `schedules.attendance` no catálogo de tools (chatfunnel-contracts) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a lacuna de paridade apontada em code review: `schedules.attendance` é o único id do catálogo de relatórios do core sem uma entrada correspondente no `TOOL_REGISTRY` de `chatfunnel-contracts` (todos os outros ~42 têm). Adiciona o output shape e a entrada do registry, espelhando exatamente o par já existente `SchedulesVolumeOutput`/`report_schedules_volume`.

**Architecture:** Puramente aditivo — um novo `export const SchedulesAttendanceOutput = SegmentedTimeSeries.shape` em `reports.contracts.ts`, mais uma entrada `report_schedules_attendance` em `registry.ts`. Nenhum shape novo (reaproveita `SegmentedTimeSeries`, já usado por `schedules.attendance` no core/services/front). Nenhuma lógica de runtime — `chatfunnel-contracts` é schema puro (Zod), sem código executável.

**Tech Stack:** TypeScript + Zod 4.

## Global Constraints

- `chatfunnel-contracts` é um pacote **publicado separadamente** (`npm.pkg.github.com`, `package.json:8`). Este plano só cobre a mudança de **source** no repo — não inclui `npm publish` nem o bump de versão da dependência `@chatfunnel/contracts` em `chatfunnel-core`/`chatfunnel-services`/`chatfunnel-front`. Publicar e propagar a versão nova é uma decisão separada, explícita, do usuário.
- Sem efeito funcional imediato: nem `schedules.volume` (que já tem a entrada completa) está exposto hoje como tool no `chatfunnel-mcp` — o `reports.tools.ts` de lá cura um subconjunto de 7 tools que não inclui nada de `schedules.*`. Este plano fecha a paridade do catálogo, não habilita uma tool nova.
- `chatfunnel-contracts` não tem suite de testes (`Glob **/*.spec.ts` retornou vazio) — a verificação deste plano é checagem de tipos (`tsc --noEmit`), não `npm test`.
- NEVER rodar `npm run build` automaticamente (regra do workspace) — o passo de verificação usa `npx tsc --noEmit` (typecheck puro, sem gerar artefatos em `dist/`), não o script `build` completo.
- Style: double quotes + semicolons (padrão já usado em `reports.contracts.ts` e `registry.ts`).

---

### Task 1: Adicionar `SchedulesAttendanceOutput` e a entrada `report_schedules_attendance`

**Files:**
- Modify: `chatfunnel-contracts/src/tools/reports.contracts.ts`
- Modify: `chatfunnel-contracts/src/tools/registry.ts`
- Modify: `chatfunnel-contracts/package.json` (bump de versão — ver Step 4)

**Interfaces:**
- Produces: `SchedulesAttendanceOutput` (export de `reports.contracts.ts`) — `ZodRawShape` idêntico a `SchedulesVolumeOutput` (ambos `SegmentedTimeSeries.shape`).
- Produces: `TOOL_REGISTRY.report_schedules_attendance = { input: reports.ReportToolInput, output: reports.SchedulesAttendanceOutput }`.
- Consumes: `SegmentedTimeSeries` (já importado em `reports.contracts.ts:4`, de `../endpoints/reports.contracts`) e `reports.ReportToolInput` (já definido em `reports.contracts.ts:23-40`) — nenhum import novo necessário.

- [ ] **Step 1: Adicionar o export do output shape**

Editar `chatfunnel-contracts/src/tools/reports.contracts.ts` — inserir a linha logo após `SchedulesVolumeOutput` (linha 75):

```typescript
export const SchedulesVolumeOutput = SegmentedTimeSeries.shape;
export const SchedulesAttendanceOutput = SegmentedTimeSeries.shape;
```

- [ ] **Step 2: Registrar a tool no `TOOL_REGISTRY`**

Editar `chatfunnel-contracts/src/tools/registry.ts` — inserir logo após `report_schedules_volume` (linhas 653-656):

```typescript
  report_schedules_volume: {
    input: reports.ReportToolInput,
    output: reports.SchedulesVolumeOutput,
  },
  report_schedules_attendance: {
    input: reports.ReportToolInput,
    output: reports.SchedulesAttendanceOutput,
  },
```

- [ ] **Step 3: Verificar tipos**

Run: `cd chatfunnel-contracts && npx tsc --noEmit`
Expected: sem erros (o `TOOL_REGISTRY` é um objeto literal tipado — uma entrada malformada ou um export ausente falha aqui).

- [ ] **Step 4: Bump de versão (patch)**

Editar `chatfunnel-contracts/package.json` — mudar `"version": "1.0.4"` para `"version": "1.0.5"` (mudança aditiva, sem breaking change — patch semver).

**Isto NÃO inclui `npm publish` nem atualizar a versão de `@chatfunnel/contracts` consumida por `chatfunnel-core` (`1.0.0`), `chatfunnel-services` (`1.0.0`) ou `chatfunnel-front` (`1.0.0-dev.7`).** Publicar o pacote e propagar a versão nova pros 3 consumidores é uma etapa manual e separada, a critério do usuário — fora do escopo deste plano.

---

## Depois da implementação

- Publicar a versão nova de `@chatfunnel/contracts` (`npm publish`, manual — fora deste plano).
- Bumpar `@chatfunnel/contracts` em `chatfunnel-core`, `chatfunnel-services` e `chatfunnel-front` e rodar `npm install` em cada um (manual, quando o usuário decidir propagar).
- Se algum dia `chatfunnel-mcp` decidir expor `schedules.*` como tools reais, `report_schedules_attendance` já vai estar pronto no registry pra isso — não requer trabalho adicional aqui.
