# Filtro de colunas no gráfico do Funil (Reports V2) — Design

**Data:** 2026-08-11
**Escopo:** aba Funil, seção "Conversão por etapa" — `chatfunnel-front` apenas
**Status:** aprovado (brainstorming)
**Referência:** Notion Task #61 — "[RELATORIOS] Permitir selecionar colunas no gráfico do funil"

## Problema

Na aba **Funil** dos Relatórios, a seção "Conversão por etapa" sempre exibe **todas** as
colunas do funil selecionado. Em funis com muitas etapas, o usuário pode querer analisar
só um recorte da jornada (ex: só **Início → Agendado → Call feita**, ignorando etapas
intermediárias), sem perder a comparação de conversão entre as etapas que sobraram.

## Decisão de arquitetura: 100% front-end

Investigação do cálculo atual (`chatfunnel-core/src/repositories/reports/crm-reports.repository.ts`
função `funnelFromHistory`, apesar do nome não usa histórico): para cada coluna, `total` é
cumulativo — "quantos cards estão nessa etapa ou em qualquer etapa posterior" — calculado
sobre **todas** as colunas do pipeline, independente de qualquer filtro. Esse valor não
muda dependendo de quais colunas o usuário decide visualizar.

O único campo derivado é `conversionFromPrevious` (`funnel.shaper.ts`):

```ts
if (i > 0) {
  const prev = rows[i - 1].total;
  if (prev > 0) stage.conversionFromPrevious = r.total / prev;
}
```

Ou seja: uma divisão entre os `total` de dois vizinhos **consecutivos no array recebido**.
Como o front já recebe `total` de todas as etapas (mesmo as que não vai exibir), consegue
recalcular essa mesma fração para o array filtrado sem depender do backend.

**Conclusão:** o filtro de colunas é implementado inteiramente em `chatfunnel-front`,
filtrando e re-derivando `FunnelData` no cliente. Nenhuma mudança em `chatfunnel-services`,
`chatfunnel-core` ou `@chatfunnel/contracts`.

Trade-off aceito: a fórmula do `conversionFromPrevious` fica duplicada (uma linha) entre o
shaper do core e o front. Baixo risco — é a definição de taxa de conversão, não muda
independente dos totais. Payload sempre traz todas as colunas (irrelevante, funis são
pequenos).

## Solução

### Fonte das opções do filtro

`funnel.data.value.stages` (não filtrado) já contém **todas** as colunas do pipeline,
na ordem certa, incluindo colunas com `total: 0` — é a mesma fonte que alimentaria um
fetch a `KanbanService.getById`, então **não há fetch adicional**. As opções do filtro
vêm direto de `{ id, name }` de cada stage.

### Componente novo: `FunnelColumnsFilter.vue`

`chatfunnel-front/src/views/reportsV2/components/primitives/FunnelColumnsFilter.vue`

Reaproveita o padrão visual de `views/crm/components/CrmTagSelect.vue` (Popover + trigger
com chip resumindo a seleção + lista de botões com `PhCheck`), mas em `<script setup
lang="ts">` (padrão do restante do `reportsV2`, diferente do `CrmTagSelect.vue` que é JS).

```ts
interface FunnelColumnOption {
  id: string
  name: string
}

defineProps<{
  options: FunnelColumnOption[]
  modelValue: string[]
}>()
defineEmits<{ 'update:modelValue': [string[]] }>()
```

- Trigger: `Popover` + `PopoverTrigger as-child` com `<button>` mostrando
  `"{n} de {total} etapas"` (ou nome da única etapa quando `n === 1`) + `PhCaretDown`.
- Conteúdo: lista de `<button>` (um por `option`, na ordem recebida — que já é a ordem do
  funil), cada um com `PhCheck` quando `option.id` está em `modelValue`. Clique dá toggle
  (adiciona/remove do array, sem permitir esvaziar para 0 — ver guarda de mínimo abaixo).
- Sem busca (`InputControl` de busca do `CrmTagSelect` fica de fora — funis têm poucas
  colunas, YAGNI).

### Lógica em `FunilTab.vue`

Estado novo, ao lado de `mode`:

```ts
const selectedColumnIds = ref<string[]>([])
const initializedForPipeline = ref<string | null>(null)
```

Um único `watch(() => funnel.data.value)`:

- Se `filters.pipelineId !== initializedForPipeline.value`: seleciona **todas** as colunas
  (default) e marca `initializedForPipeline.value = filters.pipelineId` — cobre "trocar de
  funil" e a carga inicial.
- Senão (mesmo pipeline, dado só recarregou por período/etc.): apenas **remove** da seleção
  ids que não existem mais nas stages atuais (coluna apagada) — preserva a escolha do
  usuário.

Dado filtrado + conversões recalculadas (mirror do shaper):

```ts
const filteredFunnel = computed<FunnelData>(() => {
  const stages = funnel.data.value?.stages ?? []
  const selected = stages.filter((s) => selectedColumnIds.value.includes(s.id))
  return {
    stages: selected.map((stage, i) => {
      if (i === 0) return { ...stage, conversionFromPrevious: undefined }
      const prevTotal = selected[i - 1].total
      return {
        ...stage,
        conversionFromPrevious: prevTotal > 0 ? stage.total / prevTotal : undefined
      }
    })
  }
})
```

`<FunnelChart :data="filteredFunnel" :mode="mode" />` passa a receber `filteredFunnel` em
vez de `funnel.data.value!`. `FunnelChartV2.vue` não muda — já é genérico sobre qualquer
array de stages (modo absoluto recalcula `%` a partir do `total` da primeira stage do
array recebido).

### Posicionamento na UI

Dentro do `<ReportSection title="Conversão por etapa">`, no slot `#actions` já existente
(hoje só tem os `Tabs` Absoluto/Relativo). Os dois controles convivem lado a lado num
`<div class="flex items-center gap-2">`:

```
<template #actions>
  <div class="flex items-center gap-2">
    <FunnelColumnsFilter v-model="selectedColumnIds" :options="columnOptions" />
    <Tabs v-model="mode">...</Tabs>
  </div>
</template>
```

`ReportSection.vue` não precisa mudar.

### Guarda de mínimo (seleção insuficiente)

- Mínimo válido: **2 colunas** (card pede conversão entre etapas — com 1 só não há o que
  comparar).
- `FunnelColumnsFilter` não deixa desmarcar a penúltima opção restante quando já há 2
  selecionadas (toggle de uma delas fica sem efeito) — impede o usuário de chegar a 0 ou 1
  pela própria UI.
- Ainda assim, `FunilTab.vue` guarda o caso (coluna apagada reduz a seleção abaixo de 2 via
  o `watch` de prune): quando `selectedColumnIds.value.length < 2`, a seção renderiza um
  estado vazio ("Selecione ao menos 2 etapas para comparar") no lugar do `FunnelChart`, em
  vez de chamar o componente com um array insuficiente.

## Fora de escopo

- Persistir a seleção de colunas na URL/query string — os demais filtros da barra global
  (`useReportsFilters`) usam isso, mas como esse filtro é local à seção, fica como estado
  do componente (`ref`), sem deep-link. Reavaliar se pedirem link compartilhável.
- Enviar `columnIds` para o backend — não há necessidade, o cálculo é local.
- Mudar `funnel.shaper.ts` / `crm-reports.repository.ts` / contratos — intocados.
- Atualizar o texto do informativo (`funil.funnel` em `reportInfo.ts`) mencionando o novo
  filtro — nice-to-have, não bloqueia a entrega.

## Critérios de aceite (do card) → como são satisfeitos

| Critério | Como é satisfeito |
|---|---|
| Filtro lista só as colunas do funil selecionado | Opções derivam de `funnel.data.value.stages`, já escopado ao pipeline |
| Seleciona/desmarca múltiplas colunas | `FunnelColumnsFilter` (toggle por botão) |
| Gráfico exibe só as selecionadas | `filteredFunnel` computed filtra antes de passar ao `FunnelChart` |
| Ordem original do funil | Filtro preserva a ordem do array de `stages` (já vem ordenado) |
| Quantidades/percentuais recalculados | `total` já é o valor real da etapa; `%` absoluto recalcula sozinho a partir do 1º item do array filtrado; `conversionFromPrevious` recalculado no `computed` |
| Pular colunas intermediárias sem impedir comparação | Consequência direta de filtrar antes de recalcular `conversionFromPrevious` entre vizinhos do array já filtrado |
| Trocar funil atualiza opções e remove incompatíveis | `watch` com `initializedForPipeline` |
| Filtros de período/responsável continuam funcionando junto | Não são afetados — o filtro de colunas atua só na camada de apresentação, depois que `funnel.data.value` já respeitou os demais filtros |
| Estado vazio/insuficiente não gera gráfico inválido | Guarda de mínimo (2 colunas) com estado vazio dedicado |
| Consulta respeita a conta e não mistura dados | Não há consulta nova — mesma query de sempre, já escopada por `accountId` |

## Testes

Seguindo a convenção real do diretório (`__tests__/`, `@vue/test-utils`, mock dos
services antes do import do SUT):

- `FunnelColumnsFilter.spec.ts`: renderiza opções na ordem recebida; toggle
  adiciona/remove do `modelValue`; bloqueia desmarcar quando restariam menos de 2
  selecionadas; stub de `Popover`/`PopoverTrigger`/`PopoverContent` como
  `<div><slot /></div>` (gotcha conhecido — portal do reka-ui não renderiza em happy-dom).
- `FunilTab.spec.ts` (arquivo já existe, estender): ao trocar `pipelineId`, seleção volta
  para "todas"; ao remover uma coluna do mock de `stages`, seleção previamente marcada
  perde o id removido; com seleção `< 2`, renderiza estado vazio em vez de `FunnelChart`;
  `conversionFromPrevious` recalculado bate com o esperado para uma seleção que pula uma
  etapa intermediária (caso do exemplo do card: Início → Agendado → Call feita).
