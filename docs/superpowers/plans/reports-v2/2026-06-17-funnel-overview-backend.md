# Resumo do funil — backend (`crm.funnel-overview`)

> Aba **Funil** → 1º bloco "Resumo do funil". Hoje servido por mock
> (`getFunnelOverview` → `mockFunnelOverview`). Este plano substitui o mock por um
> endpoint real, espelhando o padrão do special handler `dashboard.summary`.

## Contrato

Payload = `Dashboard` (`{ cards: Record<string, MetricCard> }`). O front renderiza
**um `MetricCard` por entrada**, usando a `key` como label
(`FunilTab.vue`: `v-for (metric, key) in cards → <MetricCard :label="key" :metric="metric" />`).

→ Backend devolve as 4 keys já em pt-BR (iguais ao mock) para zerar mudança de label no front.

### Os 8 cards

Ganhos, Perdidos e Receita têm **duas visões** (cards separados): `(total)` acumulado
desde o início (sem `delta`) e `(período)` recortado pelo range (com `delta` vs período anterior).
Todos vivem dentro do bloco "Resumo do funil".

| key (= label) | `format` | Tipo | Definição |
|---|---|---|---|
| **Leads no funil** | `number` | snapshot | `COUNT(status = 'OPEN')` atual no funil. **Ignora o range**. Sem `delta`. |
| **Ganhos (total)** | `number` | acumulado | `COUNT(WON)` de toda a vida do pipeline. **Ignora o range**. Sem `delta`. |
| **Ganhos (período)** | `number` | fluxo | `COUNT(WON)` com `statusOportunityUpdatedAt` no período. Com `delta`. |
| **Perdidos (total)** | `number` | acumulado | `COUNT(LOST)` de toda a vida. **Ignora o range**. Sem `delta`. |
| **Perdidos (período)** | `number` | fluxo | `COUNT(LOST)` no período. Com `delta`. |
| **Receita do funil (total)** | `currency` | acumulado | `SUM(amount)` onde `status = 'WON'` — receita ganha de toda a vida. **Centavos**, **ignora o range**. Sem `delta`. |
| **Receita do funil (período)** | `currency` | fluxo | `SUM(amount WON)` com `statusOportunityUpdatedAt` no período — receita realizada. **Centavos**. Com `delta`. |
| **Potencial do funil (WON + OPEN)** | `currency` | acumulado | `SUM(amount)` onde `status IN ('OPEN','WON')` — receita ganha + em aberto (cru, **não ponderado**). **Centavos**, **ignora o range**. Sem `delta`. |

**Decisões de produto (2026-06-17):**
- "Receita do funil" (total e período) = apenas cards **WON** (total = toda a vida, período = no range).
- "Potencial do funil" = WON + OPEN cru (sem peso de etapa). É **distinto** da seção
  "Previsão de receita" no rodapé do `FunilTab`, que usa `crm.revenue-forecast` (forecast
  **ponderado** pela posição da etapa) e permanece como está.
- "Leads no funil" = estado atual do funil (snapshot), não fluxo do período.
- Ganhos/Perdidos/Receita exibem acumulado **e** período (cards separados); só o período tem delta.
- Consequência: cards `(total)`/snapshot **não têm delta** (o `metricCardShaper` já omite
  `delta` quando `previousValue` é `null` — basta não passar `previousValue`).
  No `MetricCard` do front, ausência de delta deixa o fundo neutro (cards com delta têm fundo verde/vermelho).
- ⚠️ Observação: "Receita do funil (período)" (WON no período) coincide com a seção
  "Receita ganha" (`crm.revenue-card`) que já existe no `FunilTab`. Redundância aceita
  de propósito (resumo consolidado). Se incomodar, remover um dos dois depois.

## Onde implementar (espelhar `dashboard.summary`)

É **special handler** (agrega 4 métricas num payload), não report de catálogo.

### 1. `chatfunnel-core/src/repositories/reports/crm-reports.repository.ts`
Novo método `funnelOverviewMetrics(accountId, params, tz)` → objeto com acumulados +
recortes de período:
```ts
{
  leads: number;                 // snapshot COUNT(OPEN)
  wonTotal: number;              // COUNT(WON) all-time
  lostTotal: number;             // COUNT(LOST) all-time
  revenueWonTotal: number;       // SUM(amount) status = WON, all-time, centavos
  potentialTotal: number;        // SUM(amount) status IN (OPEN,WON), all-time, centavos
  won:     { current: number; previous: number };   // COUNT(WON) no período
  lost:    { current: number; previous: number };   // COUNT(LOST) no período
  revenue: { current: number; previous: number };   // SUM(amount WON) no período, centavos
}
```

- `normalizeRange(initialDate, finalDate, tz)` → `{ start, end }`.
- Período anterior p/ delta dos cards `(período)` (padrão `revenueWonCard`):
  `durationMs = end-start; prevStart = start - durationMs; prevEnd = start - 1`.
- Multi-tenant + soft delete:
  `JOIN "Kanbans" k ON kc."kanbanId" = k."id" WHERE k."accountId" = ${accountId}::uuid AND k."isDeleted" = false AND kc."isDeleted" = false`.
- Filtro de pipeline **opcional**: `AND kc."kanbanId" = ${params.pipelineId}::uuid` quando presente
  (≠ `funnelFromHistory`, que **exige** pipelineId — aqui sem pipelineId agrega todos os pipelines da conta).
- **Acumulados** (`leads`, `wonTotal`, `lostTotal`, `revenueWonTotal`, `potentialTotal`):
  `COUNT/SUM FILTER` por `statusOportunity`, **sem filtro de data**.
- **Período** (`won`, `lost`, `revenue`): `COUNT/SUM FILTER` por `statusOportunity` +
  `statusOportunityUpdatedAt BETWEEN`, duas janelas (current `start..end` e previous `prevStart..prevEnd`).
- Tudo numa query só (vários `FILTER` na mesma varredura de `KanbanCards`).

### 2. `chatfunnel-core/src/reports/handlers/crm-funnel-overview.handler.ts`
`SpecialReportHandler<Dashboard>`, `id: "crm.funnel-overview"`. Monta os cards via
`metricCardShaper.shape([{ value, previousValue?, format }])`:
```ts
cards: {
  "Leads no funil":               metricCardShaper.shape([{ value: m.leads,           format: "number" }]),   // snapshot, sem delta
  "Ganhos (total)":               metricCardShaper.shape([{ value: m.wonTotal,        format: "number" }]),   // acumulado, sem delta
  "Ganhos (período)":             metricCardShaper.shape([{ value: m.won.current,     previousValue: m.won.previous,     format: "number" }]),
  "Perdidos (total)":             metricCardShaper.shape([{ value: m.lostTotal,       format: "number" }]),   // acumulado, sem delta
  "Perdidos (período)":           metricCardShaper.shape([{ value: m.lost.current,    previousValue: m.lost.previous,    format: "number" }]),
  "Receita do funil (total)":     metricCardShaper.shape([{ value: m.revenueWonTotal, format: "currency" }]), // WON all-time, centavos, sem delta
  "Receita do funil (período)":   metricCardShaper.shape([{ value: m.revenue.current, previousValue: m.revenue.previous, format: "currency" }]), // WON no período, centavos
  "Potencial do funil (WON + OPEN)": metricCardShaper.shape([{ value: m.potentialTotal, format: "currency" }]), // WON+OPEN all-time, centavos, sem delta
}
```
> Ordem das keys = ordem de render no grid (o `v-for` preserva a ordem de inserção do objeto).

### 3. `chatfunnel-core/src/reports/handlers/index.ts`
`specials.set(crmFunnelOverviewHandler.id, crmFunnelOverviewHandler)` + re-export.

### 4. `chatfunnel-services/src/modules/reports-v2/controllers/crm.controller.ts`
```ts
@Get("funnel-overview")
@UseGuards(AuthGuard("jwt")) @ApiBearerAuth()
funnelOverview(@Headers("Account-Selected") accountId: string, @Headers("Timezone") timezone: string, @Query() dto: BaseReportDto) {
  return this.reports.run<Dashboard>("crm.funnel-overview", accountId, toReportParams(dto), timezone);
}
```

## Front (wiring — V2, sem tocar legado)

- `chatfunnel-front/src/views/reportsV2/composables/useReportsFilters.helpers.ts`:
  add `"crm/funnel-overview"` ao tipo `ReportEndpoint` e `ENDPOINT_OPTIONAL["crm/funnel-overview"] = ["pipelineId"]`.
- `chatfunnel-front/src/common/services/ReportsV2Service.ts`: trocar `getFunnelOverview`
  de mock → chamada real `NestApi.get()(\`${REPORTS_V2_BASE}/crm/funnel-overview\`, buildReportParams("crm/funnel-overview", filters))`,
  **normalizando todo card com `format === "currency"`** (os dois "Receita do funil") com
  `normalizeCurrencyCard` (centavos→reais) — um loop sobre `cards`, não hardcode por key,
  já que agora há 2 cards de moeda. Mesma ideia do `getDashboardOverview` com `wonRevenue`.
- Remover `mockFunnelOverview` de `funnel.mocks.ts` após o swap.

## Build / verificação

- `chatfunnel-core` precisa ser buildado e publicado/sincronizado para os consumers
  (`chatfunnel-services`) enxergarem o novo handler — não editar `node_modules/@chatfunnel/core`.
- Testes: seguir `crm.controller.spec.ts` + specs de shaper/handler existentes.
- Front: `npm run typecheck` + ajustar `FunilTab.spec.ts` se referenciar o mock.
