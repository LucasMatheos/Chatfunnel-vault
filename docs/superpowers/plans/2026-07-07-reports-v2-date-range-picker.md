# Reports V2 — Filtro de Data com Presets (Date Range Picker) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar task-by-task. Steps usam checkbox (`- [ ]`).

**Goal:** Substituir os dois `InputDateControl` (Início/Fim) do `ReportsFilterBar` por um único date range picker no padrão Meta/GA: coluna de presets (Hoje, Ontem, Últimos 7 dias, Este mês, Últimos 6 meses, Este ano, Desde o início) + dois calendários lado a lado com highlight do intervalo, dentro de um popover.

**Architecture:** Componente novo, contrato inalterado. O picker emite o mesmo patch `{ initialDate, finalDate }` (ISO `yyyy-mm-dd`) que o `ReportsFilterBar` já espera — `useReportsFilters` e todo o resto do Reports V2 não mudam. Segue a regra V2: cria-se componente novo, o `InputDateControl` legado fica intacto.

**Tech Stack:** Vue 3.5 `<script setup lang="ts">`, Tailwind v4 + shadcn-vue (Reka UI), `@phosphor-icons/vue`, `@internationalized/date` (já em uso no filtro), Vitest + happy-dom.

---

## Global Constraints

Herdadas de `chatfunnel-front/CLAUDE.md` e `.claude/rules/10-frontend-design-quality.md`:

- **Ícones:** SOMENTE `@phosphor-icons/vue`.
- **Tokens de cor:** em `views/reportsV2` usar ESCALA (`bg-gray-100`, `text-gray-1000`, `bg-brand-500`) — NUNCA semânticos (`bg-background`, `bg-card`). Sem hex/rgba fora dos tokens.
- **Datas:** SEMPRE `@internationalized/date` (`CalendarDate`, `today`, `parseDate`) — NUNCA `Date` nativo para cálculo de presets (evita bug de timezone).
- **Texto user-facing:** pt-BR acentuado.
- **SFC:** `<script setup lang="ts">`, ordem `<template>` → `<script>` → `<style>`.
- **Testes:** Vitest + happy-dom, `*.spec.ts` junto ao componente. Popover reka em teste → stub de Trigger/Content (ver `reference_reka_popover_test_happydom`).
- **Git:** nunca commitar sem pedido; nunca `Co-Authored-By`; trabalhar em branch.
- **Prettier:** sem `;`, aspas simples, `printWidth 100`, sem trailing comma.

---

## Decisão de backend — piso do preset "Desde o início" (createdAt da conta)

**Investigado nesta sessão (2026-07-07):**

- O auth store (`chatfunnel-front/src/stores/auth.js`) **não** guarda a data de criação da conta.
- `organizationData` recebe o objeto inteiro de `GET /organizations/:id` (`setOrganizationData(res.data)`), populado após login e re-buscado via `updateAccountList()`.
- O DTO `getById/response.ts` (chatfunnel-services) **não expõe** `createdAt`.
- O modelo Prisma `Organization` **tem** `createdAt DateTime @default(now())` (schema linha 125).

**Decisão (caminho lazy):** NÃO adicionar claim no JWT nem mexer em login/refresh token. Basta expor `createdAt` no endpoint que já existe — o campo flui sozinho pro `organizationData` do store.

- [ ] **Backend:** `chatfunnel-services/src/modules/organizations/commands/getById/response.ts` — adicionar `createdAt: Date;` na classe e `this.createdAt = data.createdAt` no constructor.
- [ ] **Verificar:** se `accountsRepository.findByIdAndUserModerator` usa `select:` explícito no Prisma, incluir `createdAt` lá também. Se usa `include`/sem select, já vem por padrão.
- [ ] **Front:** o preset "Desde o início" lê `authStore.account?.createdAt`. Fallback se ausente: `parseDate('2020-01-01')`. `// ponytail: piso 2020 se conta sem createdAt`

---

## FASE 1 — Componente base `ui/range-calendar` (shadcn wrapper)

O `reka-ui` já traz os primitivos `RangeCalendar*` (instalado, não usado). Falta só o wrapper shadcn — copiar o oficial do shadcn-vue, sem lógica nova.

- [ ] Criar `chatfunnel-front/src/components/ui/range-calendar/` com os wrappers (RangeCalendar, Cell, CellTrigger, Grid, Header, Heading, Prev/Next), espelhando o `ui/calendar/` já existente.
- [ ] `index.ts` exportando os componentes.
- [ ] Config: dois meses (`:number-of-months="2"`), `locale="pt-BR"`, `weekday-format="short"`.

## FASE 2 — Presets (lógica pura)

Presets são dados, não componente. Cada `getRange()` retorna `{ start: CalendarDate, end: CalendarDate }` via `@internationalized/date`.

- [ ] `composables/useDateRangePresets.ts` — lista `{ key, label, getRange() }`. Semântica confirmada com o usuário (hoje = 07/07/2026 como exemplo):
  - **Hoje** → `today()..today()` (start=end)
  - **Ontem** → `today().subtract({days:1})` (start=end)
  - **Últimos 7 dias** → `today().subtract({days:6})..today()` (7 dias, hoje incluso — NÃO today-7)
  - **Este mês** → primeiro dia do mês corrente `..today()` (até hoje, NÃO até o fim do mês — sem datas futuras)
  - **Último mês** → primeiro `..` último dia do mês anterior (ex.: 01/06..30/06). Mês inteiro. Derivar do `today().subtract({months:1})`: início `.set({day:1})`, fim `.set({day: <daysInMonth>})`.
  - **Últimos 6 meses** → `today().subtract({months:6})..today()`
  - **Este ano** → `today().set({month:1, day:1})..today()`
  - **Desde o início** → `accountCreatedAt..today()` (piso via decisão de backend acima)
- [ ] Helper `matchPreset(range)` — dado o range atual, retorna a `key` do preset correspondente (pra marcar o ativo) ou `null` (range custom).
- [ ] Teste: `useDateRangePresets.spec.ts` — asserts de cada `getRange()` com uma data fixa injetada (não usar `today()` real no teste).

## FASE 3 — `ReportsDateRangePicker.vue`

- [ ] Popover (reka, já no design system): botão-gatilho mostra o range formatado (`01 jun – 07 jul`); conteúdo = presets à esquerda + `RangeCalendar` à direita + rodapé `[Cancelar] [Aplicar]`.
- [ ] Props: `initialDate: string`, `finalDate: string`, `accountCreatedAt?: string`. Emits: `change: [{ initialDate, finalDate }]`.
- [ ] Estado rascunho interno; só emite no **Aplicar** (Cancelar descarta e fecha). Preset clicado preenche o rascunho e reflete no calendário.
- [ ] Formatação do label do gatilho em pt-BR.
- [ ] Teste: `ReportsDateRangePicker.spec.ts` — stub do Popover; verifica que Aplicar emite o patch correto e que preset "Hoje" preenche start=end.

## FASE 4 — Ligar no `ReportsFilterBar`

- [ ] Substituir os dois `<label>Início/Fim` + `InputDateControl` por um `<ReportsDateRangePicker>`, passando `initialDate`/`finalDate`/`accountCreatedAt` (via `useAuthStore().account?.createdAt`) e reemitindo o `change` como está.
- [ ] Ajustar `ReportsFilterBar.spec.ts` para o novo componente.
- [ ] Rodar `npx vitest run src/views/reportsV2` e `npm run typecheck`.

---

## Notas

- **Esforço:** ~1 dia (metade é polir popover + labels pt-BR).
- **Sem dependência nova:** tudo com `reka-ui` + `@internationalized/date` já instalados.
- **Contrato intacto:** `initialDate`/`finalDate` continuam ISO string; nenhum consumidor a jusante muda.
