# Relatórios V2 — Integração Front ↔ Backend Real (Design)

> **Data:** 2026-06-08
> **Repo alvo:** `chatfunnel-front` (branch `feature/reports` no back já completa)
> **Escopo:** trocar mocks pelos endpoints REST reais de Relatórios V2 onde o backend
> já entrega, e construir a UI faltante para `crm/revenue-card` e `crm/aging`.

---

## 1. Contexto

O backend de Relatórios V2 está **completo e commitado** (branch `feature/reports` nos 4 repos:
core, contracts, services, mcp). Expõe **7 endpoints REST** em `/nest/reports/v2/*`. O front
(`src/views/reportsV2/`) já tem o scaffold das telas, porém rodando **100% em mocks**
(`USE_REPORTS_V2_MOCKS = true` em `ReportsV2Service.ts`), e foi desenhado contra paths/shapes
que divergem do backend real.

Esta entrega integra o que o backend **já entrega** e deixa explicitamente em mock (sinalizado)
o que ainda é follow-up do backend.

### Endpoints reais disponíveis

| Endpoint | Payload | Uso nesta entrega |
|---|---|---|
| `GET /nest/reports/v2/contacts/growth` | `TimeSeries` | Geral — "Entrada de leads" |
| `GET /nest/reports/v2/contacts/peak-hours` | `HeatmapData` | Geral — "Atividade por horário" |
| `GET /nest/reports/v2/general/feed` | `EventFeed` | Geral — feed de eventos |
| `GET /nest/reports/v2/crm/funnel` | `FunnelData` | Funil — gráfico (exige `pipelineId`) |
| `GET /nest/reports/v2/crm/loss-reasons` | `Ranking` | Funil — "Motivos de perda" |
| `GET /nest/reports/v2/crm/revenue-card` | `MetricCard` | Funil — **componente novo** |
| `GET /nest/reports/v2/crm/aging` | `AgingData` | Funil — **componente novo** |

---

## 2. Decisões tomadas

1. **Blocos sem backend ficam em mock, sinalizados.** Os 3 blocos que dependem de
   `Dashboard` composto / `ComparisonTableData` (não emitidos pelo back) permanecem em mock,
   com selo visual "dados de exemplo":
   - Geral → grid "Visão geral" (cards)
   - Funil → grid "Resumo do funil" (cards)
   - Funil → tabela "Etapas" (`stage-counts`)
2. **Componentes novos (Receita + Aging) ficam ambos na aba Funil.** A aba Geral não recebe
   card real solto, evitando misturar real + mock na mesma tela.
3. **Correções de convenção seguem o contrato** (`@chatfunnel/contracts`), sem perguntar:
   funil em fração `0..1`; heatmap com `0 = segunda`.

---

## 3. Mudanças por arquivo

### 3.1 `src/common/services/ReportsV2Service.ts`

- **Flag de mock vira por-método**, não global. Os métodos com backend real chamam a API;
  os 3 bloqueados continuam servindo mock.
- **Corrigir paths reais:**
  - `getLeadsSeries`: `/dashboard/leads-series` → `/contacts/growth`
  - `getActivityHeatmap`: `/dashboard/activity-heatmap` → `/contacts/peak-hours`
  - `getEventFeed`: `/dashboard/events` → `/general/feed`
  - `getFunnel`, `getFunnelLossReasons`: já corretos.
- **Métodos novos:** `getRevenueCard(filters) → MetricCard`, `getAging(filters) → AgingData`.
- **Mantém em mock:** `getDashboardOverview`, `getFunnelOverview`, `getFunnelStageCounts`.
- **Whitelist de params por endpoint** (ver 3.2).

### 3.2 Montagem de query params (evitar `400` do `ValidationPipe` estrito)

O backend usa `forbidNonWhitelisted: true` → qualquer param desconhecido = `400`.
O front hoje espalha `{...filters}` (inclui `origin/utmSource/utmMedium/utmCampaign`), o que
quebraria. Solução: um helper que extrai do estado de filtros **apenas** os params aceitos por
cada rota, e converte datas para **ISO 8601 completo**:

- `initialDate` → `<yyyy-mm-dd>T00:00:00Z`
- `finalDate` → `<yyyy-mm-dd>T23:59:59Z`

| Endpoint | Params enviados |
|---|---|
| `contacts/growth` | `initialDate`, `finalDate` |
| `contacts/peak-hours` | `initialDate`, `finalDate`, `channelId?` |
| `crm/funnel` | `initialDate`, `finalDate`, `pipelineId` (obrigatório) |
| `crm/loss-reasons` | `initialDate`, `finalDate`, `pipelineId?` |
| `crm/revenue-card` | `initialDate`, `finalDate`, `pipelineId?` |
| `crm/aging` | `initialDate`, `finalDate`, `pipelineId?` (ignora período — snapshot "agora") |
| `general/feed` | `initialDate`, `finalDate`, `limit?`, `cursor?` |

UTM/origem **não são enviados** (segmentação é follow-up do back).

### 3.3 Correções de convenção

- **`FunnelChart.vue`**: `conversionFromPrevious` chega como fração `0..1`. Multiplicar por 100
  ao computar o modo "relativo" (ou normalizar no service). O mock atual usa `0..100` — alinhar
  o mock à fração `0..1` para refletir o real, mantendo o componente como fonte de verdade da
  exibição em %.
- **`utils/heatmap.ts` + `Heatmap.vue`**: contrato é `0 = segunda … 6 = domingo`. Ajustar o
  rótulo das linhas para iniciar em **Segunda** (hoje assume `0 = domingo`). A matriz densa 7×24
  continua indexando por `cell.day`; só os labels mudam.

### 3.4 Aba Geral (`tabs/GeralTab.vue`)

- "Entrada de leads" e "Atividade por horário": passam a consumir API real (via service).
- **Plugar `EventFeed.vue`** (já existe, hoje não renderizado) numa nova seção "Últimos eventos"
  consumindo `general/feed`.
- Grid "Visão geral": permanece mock + selo "dados de exemplo".

### 3.5 Aba Funil (`tabs/FunilTab.vue`)

- Gráfico de funil e "Motivos de perda": API real.
- **Nova seção "Receita ganha"**: reusa `MetricCard.vue`, consome `crm/revenue-card`.
  - **Conversão de moeda:** o backend manda `value` (e `delta.absolute`) em **centavos (Int)**.
    Converter para reais **dividindo por 100** na borda do `ReportsV2Service.getRevenueCard`
    (normaliza antes de entregar ao componente). O `MetricCard` permanece sem lógica de escala,
    apenas formata como `currency` (pt-BR).
- **Nova seção "Oportunidades paradas (aging)"**: componente novo `AgingChart.vue`.
- Grid "Resumo do funil" e tabela "Etapas": permanecem mock + selo.
- **`pipelineId` real (resolve o risco):** `pipelineId` = `kanbanId`. Substituir
  `mockPipelineOptions` pela lista real de kanbans e seguir o mesmo padrão do `Kanban.vue`
  (ver 3.9).

### 3.9 Seleção de pipeline real (`pipelineId` = `kanbanId`)

Reaproveitar a infra já existente do CRM, espelhando o `Kanban.vue:952-973`:

1. Listar kanbans via **`KanbanService.list()`** (`GET /accounts/kanbans` → `[{ id, name }]`)
   e popular o `<select>` de pipeline (substitui `mockPipelineOptions`).
2. **Seleção inicial:**
   - Se `authStore.getLastKanbanSelectedId` existe → usar esse id.
   - Senão → usar o **primeiro** da lista.
3. Ao trocar o pipeline no `<select>`, persistir com **`authStore.setLastKanbanSelectedId(id)`**
   (mantém consistência com a tela de CRM) e atualizar `filters.pipelineId`.
4. Encapsular essa lógica num composable `useDefaultPipeline()` em
   `views/reportsV2/composables/`, para o `FunilTab` consumir sem duplicar.

Assim o funil real (`crm/funnel`, que exige `pipelineId`) sempre tem um id válido na primeira
carga, sem `400`.

### 3.6 Componente novo `components/primitives/AgingChart.vue`

- Props: `data: AgingData`.
- Visual: barras horizontais por faixa (`<3d`, `3–7d`, `7–15d`, `>15d`), no mesmo padrão das
  barras de "Motivos de perda" (largura proporcional ao maior `count`).
- Sem `<style scoped>` para layout — Tailwind + tokens do brand.

### 3.7 Sinalização de mock (`components/shared/ReportSection.vue`)

- Nova prop opcional `mock?: boolean`. Quando `true`, renderiza um `Badge` discreto
  ("Dados de exemplo") no header da seção. Usar `Badge` de `@/components/ui`.

### 3.8 Paginação do feed

- MVP: primeira página (`limit` default 20). Se `hasMore`, botão "Carregar mais" que refaz a
  chamada com `cursor = nextCursor` e **concatena** os itens.

---

## 4. Componentização e padrões

- `<script setup lang="ts">`, ordem `<template>` → `<script>` → `<style>`.
- Shapes de dados **sempre** de `@chatfunnel/contracts`; só `reportsV2.ui.ts` para tipos de UI.
- HTTP só via `@services/` (`ReportsV2Service`); erros tratados pelo interceptor do Axios
  (sem catch redundante).
- Loading via `Skeleton` (já no `ReportSection`/`ReportSkeleton`).
- Componentes `ui/` shadcn-vue preferidos (`Badge`, `MetricCard` existente, etc.).
- Acentuação pt-BR correta em todo texto de tela.

---

## 5. Testes

- **Unit (Vitest)**: `AgingChart.vue` (render das 4 faixas, largura proporcional, empty state);
  helper de montagem de params (whitelist por endpoint + formato ISO das datas); ajuste de
  convenção do funil (0..1 → %) e do heatmap (0 = segunda).
- Reaproveitar os specs existentes dos primitives (`FunnelChart`, `Heatmap`, `EventFeed`,
  `MetricCard`) — ajustar expectativas onde a convenção mudou.

---

## 6. Riscos e dependências

- **`pipelineId` real:** ~~risco~~ **resolvido** — ver 3.9. Reaproveita `KanbanService.list()` +
  `authStore.getLastKanbanSelectedId`/`setLastKanbanSelectedId`, espelhando o `Kanban.vue`.
- **Escala de moeda (`revenue-card`):** o back avisa que `value` é `Int` cru (centavos vs reais
  indefinido). Confirmar com o time de dados antes de formatar; por ora, formatar como `currency`
  assumindo a unidade que o back documentar.
- **Deploy da branch:** os endpoints estão em `feature/reports`. O ambiente que o front aponta
  (services :3200) precisa estar rodando essa branch. (Usuário confirmou que as branches estão
  corretas.)

---

## 7. Fora de escopo

Dashboard composto (R35), `stage-counts` real, segmentação por UTM/origem (`SegmentedTimeSeries`),
abas Automações/Agendamentos/Colaboradores, Intelligence.
