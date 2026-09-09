# Coluna "Ganhos" no funil (Reports V2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma coluna sintética "Ganhos" ao final do gráfico "Conversão por etapa" (aba Funil de `reportsV2`), reaproveitando o card "Ganhos (período)" que a mesma tela já busca — sem alterar backend, core ou contratos.

**Architecture:** `FunilTab.vue` já busca `overview` (endpoint `crm/funnel-overview`, card `"Ganhos (período)"`) e `funnel` (endpoint `crm/funnel`, array de `FunnelStage`) para o mesmo `pipelineId`/período. O computed `funnelStages` passa a anexar uma entrada sintética `{ id: 'ganhos', name: 'Ganhos', total }` ao array de etapas reais, lida do card do overview. Como `FunnelColumnsFilter`, `filteredFunnel` e `FunnelChartV2` já operam de forma genérica sobre o array `stages` (loop, sem hardcode de índice/quantidade), a coluna extra passa a existir no filtro, na seleção default, no cálculo de `conversionFromPrevious` e no gráfico sem tocar nesses três arquivos.

**Tech Stack:** Vue 3 `<script setup lang="ts">`, Vitest + `@vue/test-utils`, `@chatfunnel/contracts` (tipos `FunnelStage`/`FunnelData`, inalterados).

## Global Constraints

- Sem alterações em `chatfunnel-core`, `chatfunnel-services` ou `chatfunnel-contracts` — o dado de "Ganhos" já existe no front via `overview.data.value.cards['Ganhos (período)']`, no mesmo escopo (`pipelineId`, `initialDate`/`finalDate`) do funil.
- "Ganhos" entra no `FunnelColumnsFilter` como uma opção toggleável igual às demais etapas (decisão do usuário) — não é uma coluna fixa fora do filtro.
- A % de conversão da coluna "Ganhos" usa exatamente a mesma lógica hoje aplicada a qualquer etapa (`conversionFromPrevious` calculado em `filteredFunnel`, exibido por `FunnelChartV2.vue` conforme o toggle Absoluto/Relativo já existente) — nenhuma lógica nova de percentual.
- Cor da coluna "Ganhos" segue o gradiente automático (`getFunnelGradient()`) — nenhuma cor fixa/hardcoded.
- Label da coluna: `"Ganhos"` (sem "(período)").
- Prettier do repo: sem `;`, aspas simples, sem trailing comma (`.prettierrc.json`).
- Texto visível ao usuário em pt-BR com acentuação correta.
- Criação de branch e commit são feitas manualmente pelo usuário — fora do escopo dos steps deste plano.

---

## File Structure

- Modify: `chatfunnel-front/src/views/reportsV2/tabs/FunilTab.vue` — único arquivo de produção alterado. `FunnelColumnsFilter.vue`, `FunnelChartV2.vue`, `tokens.ts` e os contratos permanecem intactos porque já operam genericamente sobre o array `stages`.
- Modify: `chatfunnel-front/src/views/reportsV2/tabs/__tests__/FunilTab.spec.ts` — atualizar expectativas dos testes existentes (a seleção default passa a incluir `'ganhos'`) e adicionar os testes novos da coluna sintética.

## Task 1: Coluna sintética "Ganhos" em `FunilTab.vue`

**Files:**
- Modify: `chatfunnel-front/src/views/reportsV2/tabs/FunilTab.vue:209-250`
- Test: `chatfunnel-front/src/views/reportsV2/tabs/__tests__/FunilTab.spec.ts`

**Interfaces:**
- Consumes: `overview.data.value?.cards['Ganhos (período)']` (tipo `MetricCard | undefined`, campo `.value: number`) já produzido por `ReportsV2Service.getFunnelOverview` (`chatfunnel-front/src/common/services/ReportsV2Service.ts:128-143`); `funnel.data.value?.stages` (tipo `FunnelStage[]`) já produzido por `ReportsV2Service.getFunnel` (`ReportsV2Service.ts:145-151`).
- Produces: `funnelStages` (computed `FunnelStage[]`) passa a incluir a entrada `{ id: 'ganhos', name: 'Ganhos', total: number }` como último elemento sempre que `funnel.data.value.stages` não estiver vazio. Nenhuma outra assinatura muda — `filteredFunnel`, o `watch(funnelStages, ...)` e o template (`FunnelColumnsFilter`, `FunnelChart`) continuam consumindo `funnelStages`/`filteredFunnel` do mesmo jeito.

- [ ] **Step 1: Escrever o teste que falha — coluna "Ganhos" aparece ao final, com total do card do overview, selecionada por padrão**

Em `chatfunnel-front/src/views/reportsV2/tabs/__tests__/FunilTab.spec.ts`, dentro do `describe("FunilTab — filtro de colunas do funil", ...)` (depois do teste `"seleciona todas as colunas por padrão ao carregar"`, linha 160), adicionar:

```ts
it('inclui uma coluna sintética "Ganhos" ao final, com total do card do overview, selecionada por padrão', async () => {
  mockGetFunnel.mockResolvedValue({ stages: STAGES });
  mockGetFunnelOverview.mockResolvedValue({
    cards: { "Ganhos (período)": { value: 23, format: "number" } },
  });
  const wrapper = mountTab();
  await flushPromises();

  const filter = wrapper.findComponent({ name: "FunnelColumnsFilter" });
  expect(filter.props("modelValue")).toEqual([
    "s1",
    "s2",
    "s3",
    "s4",
    "ganhos",
  ]);

  const chart = wrapper.findComponent({ name: "FunnelChart" });
  const stages = JSON.parse(chart.attributes("data-stages")!);
  expect(stages[4]).toEqual({
    id: "ganhos",
    name: "Ganhos",
    total: 23,
    conversionFromPrevious: 2.3,
  });
});
```

(`conversionFromPrevious` = `ganhos.total / s4.total` = `23 / 10` = `2.3`, seguindo a mesma fórmula já aplicada a qualquer etapa em `filteredFunnel`.)

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/tabs/__tests__/FunilTab.spec.ts -t "inclui uma coluna sintética"`
Expected: FAIL — `modelValue` recebido é `["s1","s2","s3","s4"]` (sem `"ganhos"`), coluna sintética ainda não existe.

- [ ] **Step 3: Implementar a coluna sintética**

Em `chatfunnel-front/src/views/reportsV2/tabs/FunilTab.vue`, substituir o bloco das linhas 209-221:

```ts
const { filters } = useReportsFilters()
const mode = ref<FunnelMode>('absolute')
const selectedColumnIds = ref<string[]>([])
const initializedForPipeline = ref<string | null>(null)

const overview = useReportQuery(() =>
  ReportsV2Service.getFunnelOverview({ ...filters })
)
const funnel = useReportQuery(() =>
  ReportsV2Service.getFunnel({ ...filters })
)

const funnelStages = computed(() => funnel.data.value?.stages ?? [])
```

por:

```ts
const { filters } = useReportsFilters()
const mode = ref<FunnelMode>('absolute')
const selectedColumnIds = ref<string[]>([])
const initializedForPipeline = ref<string | null>(null)

// Id da coluna sintética "Ganhos" — nunca colide com um id real de KanbanColumns (cuid).
const GANHOS_STAGE_ID = 'ganhos'
const GANHOS_CARD_KEY = 'Ganhos (período)'

const overview = useReportQuery(() =>
  ReportsV2Service.getFunnelOverview({ ...filters })
)
const funnel = useReportQuery(() =>
  ReportsV2Service.getFunnel({ ...filters })
)

// Etapas reais do pipeline + coluna sintética "Ganhos" (não vem do funil, vem do
// card "Ganhos (período)" do overview — mesmo pipelineId/período). Entra no
// filtro e na seleção default junto com as demais, sempre por último no array.
const funnelStages = computed(() => {
  const stages = funnel.data.value?.stages ?? []
  if (!stages.length) return []
  const ganhosTotal = overview.data.value?.cards[GANHOS_CARD_KEY]?.value ?? 0
  return [...stages, { id: GANHOS_STAGE_ID, name: 'Ganhos', total: ganhosTotal }]
})
```

Também atualizar o comentário das linhas 223-226 (imediatamente acima de `filteredFunnel`), que hoje diz "calculado no core sobre TODAS as colunas do pipeline", para deixar explícito que a etapa sintética é excluída dessa premissa:

```ts
// total é cumulativo por posição, calculado no core sobre TODAS as colunas do
// pipeline (exceto a sintética "Ganhos", que vem do overview) — não muda com
// a seleção. Só o array e o conversionFromPrevious (fração entre vizinhos
// consecutivos, mirror de funnel.shaper.ts no core) precisam ser recalculados
// para o recorte selecionado.
```

Nenhuma outra linha do arquivo muda: `filteredFunnel`, o `watch(funnelStages, ...)` e o `<template>` continuam iguais — todos já operam sobre `funnelStages` de forma genérica.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/tabs/__tests__/FunilTab.spec.ts -t "inclui uma coluna sintética"`
Expected: PASS

- [ ] **Step 5: Atualizar os testes existentes que assumiam seleção default sem "Ganhos"**

Este passo é necessário porque a mudança do Step 3 altera um comportamento coberto por testes já existentes (a seleção default agora inclui `'ganhos'`). Em `FunilTab.spec.ts`:

1. No teste `"seleciona todas as colunas por padrão ao carregar"` (linha 153), trocar a expectativa:

```ts
it("seleciona todas as colunas por padrão ao carregar", async () => {
  mockGetFunnel.mockResolvedValue({ stages: STAGES });
  const wrapper = mountTab();
  await flushPromises();

  const filter = wrapper.findComponent({ name: "FunnelColumnsFilter" });
  expect(filter.props("modelValue")).toEqual([
    "s1",
    "s2",
    "s3",
    "s4",
    "ganhos",
  ]);
});
```

2. No teste `"remove da seleção uma coluna que deixou de existir, sem resetar tudo, quando o pipeline não mudou"` (linha 200), trocar as duas expectativas de `modelValue`:

```ts
let filter = wrapper.findComponent({ name: "FunnelColumnsFilter" });
expect(filter.props("modelValue")).toEqual([
  "s1",
  "s2",
  "s3",
  "s4",
  "ganhos",
]);

reactiveFilters.initialDate = "2026-02-01";
await flushPromises();

filter = wrapper.findComponent({ name: "FunnelColumnsFilter" });
expect(filter.props("modelValue")).toEqual(["s1", "s3", "s4", "ganhos"]);
```

Os demais testes do describe (`"recalcula conversionFromPrevious..."`, `"mostra estado vazio..."`, `"nao inclui conversionFromPrevious na 1a etapa..."`) emitem `update:modelValue` explicitamente sem `'ganhos'` — não precisam de alteração.

- [ ] **Step 6: Rodar toda a suíte do arquivo e confirmar que passa**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/tabs/__tests__/FunilTab.spec.ts`
Expected: PASS — todos os testes do arquivo, incluindo os dois ajustados no Step 5 e o novo do Step 1.

- [ ] **Step 7: Escrever o teste que falha — usuário pode desmarcar "Ganhos" pelo filtro mantendo as etapas reais**

Adicionar, na sequência do teste do Step 1:

```ts
it('permite desmarcar "Ganhos" pelo filtro, mantendo as etapas reais no gráfico', async () => {
  mockGetFunnel.mockResolvedValue({ stages: STAGES });
  mockGetFunnelOverview.mockResolvedValue({
    cards: { "Ganhos (período)": { value: 23, format: "number" } },
  });
  const wrapper = mountTab();
  await flushPromises();

  const filter = wrapper.findComponent({ name: "FunnelColumnsFilter" });
  await filter.vm.$emit("update:modelValue", ["s1", "s2", "s3", "s4"]);
  await flushPromises();

  const chart = wrapper.findComponent({ name: "FunnelChart" });
  const stages = JSON.parse(chart.attributes("data-stages")!);
  expect(stages).toHaveLength(4);
  expect(stages.some((s: { id: string }) => s.id === "ganhos")).toBe(false);
});
```

- [ ] **Step 8: Rodar o teste e confirmar o resultado**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/tabs/__tests__/FunilTab.spec.ts -t "permite desmarcar"`
Expected: PASS já na primeira execução — depois do Step 3, `filteredFunnel` já filtra por `selectedColumnIds` de forma genérica, então nenhuma implementação nova é necessária aqui. Se falhar, é sinal de que o Step 3 introduziu um caso especial indevido para `'ganhos'` — revisar antes de seguir.

- [ ] **Step 9: Rodar a suíte completa do arquivo novamente**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/tabs/__tests__/FunilTab.spec.ts`
Expected: PASS — todos os testes, incluindo os dois novos.

- [ ] **Step 10: Typecheck**

Run: `cd chatfunnel-front && npm run typecheck`
Expected: Sem erros novos introduzidos por `FunilTab.vue` (o literal `{ id: GANHOS_STAGE_ID, name: 'Ganhos', total: ganhosTotal }` é estruturalmente compatível com `FunnelStage`, que tem `conversionFromPrevious` opcional).

Branch e commit ficam a cargo do usuário, fora destes steps.

---

## Self-Review

**1. Cobertura do pedido:** "adicionar coluna Ganhos no final de cada funil escolhido" → Task 1 cobre: dado (overview, já existente), posição (último elemento do array, preservada em todo o pipeline de filtro/seleção/gráfico), filtro (entra no `FunnelColumnsFilter` como as demais etapas — confirmado com o usuário), % (reaproveita a lógica existente de `conversionFromPrevious` + toggle Absoluto/Relativo, sem lógica nova), cor (gradiente automático, sem hardcode).

**2. Placeholder scan:** nenhum "TBD"/"similar ao anterior" — todo código de teste e implementação está completo e literal.

**3. Consistência de tipos:** `GANHOS_STAGE_ID`/`GANHOS_CARD_KEY` são as únicas constantes novas, usadas de forma consistente entre o computed e os comentários; `funnelStages` mantém o tipo inferido `FunnelStage[]` em todos os pontos de uso (template, `filteredFunnel`, `watch`) — nenhuma renomeação de variável, nenhum novo parâmetro em função existente.

**Escopo explicitamente fora deste plano** (perguntar ao usuário se algum dia for necessário): mover o cálculo de "Ganhos" para o core (`funnelFromHistory`/`funnel.shaper.ts`) como etapa nativa do funil — hoje não é necessário porque o dado equivalente já existe no mesmo escopo via `crm/funnel-overview`.
