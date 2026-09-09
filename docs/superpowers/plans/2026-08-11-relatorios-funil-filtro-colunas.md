# Filtro de colunas no gráfico do Funil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir ao usuário escolher, na seção "Conversão por etapa" da aba Funil (Reports V2), quais colunas do funil aparecem no gráfico, recalculando volumes/percentuais/conversão só com as etapas selecionadas, na ordem original do funil.

**Architecture:** 100% front-end (`chatfunnel-front`). `funnel.data.value.stages` já traz todas as colunas do pipeline com `total` cumulativo (independente de qualquer filtro de exibição). Um novo componente `FunnelColumnsFilter.vue` guarda a seleção; um `computed` em `FunilTab.vue` filtra o array de stages e recalcula `conversionFromPrevious` entre os vizinhos consecutivos do array já filtrado (mirror de uma linha do `funnel.shaper.ts` do core, que não é tocado). Nenhuma mudança em `chatfunnel-services`, `chatfunnel-core` ou `@chatfunnel/contracts`.

**Tech Stack:** Vue 3.5 `<script setup lang="ts">`, Tailwind v4 (tokens de escala), reka-ui (`Popover`), `@phosphor-icons/vue`, Vitest + `@vue/test-utils`.

## Global Constraints

- Nenhuma mudança em `chatfunnel-services`, `chatfunnel-core` ou `@chatfunnel/contracts` — filtro é puramente client-side (decisão da spec).
- Ícones: `@phosphor-icons/vue` apenas — nunca Lucide/FontAwesome/MDI.
- Estilo: tokens de escala (`bg-gray-100`, `text-gray-1000`, `border-gray-400`, `text-brand-600` etc.) — nunca tokens semânticos (`bg-background`, `text-foreground` etc.) em componentes próprios de `views/reportsV2`.
- `<script setup lang="ts">` em todo componente novo.
- Texto visível ao usuário em pt-BR com acentuação correta.
- Testes em `__tests__/` ao lado do arquivo (não `Component.spec.ts` irmão), usando `@vue/test-utils` (`mount`), mocks (`vi.mock`) declarados antes do import do SUT — convenção real já usada em `views/reportsV2/**`.
- Stub de `Popover`/`PopoverTrigger`/`PopoverContent` como `<div><slot /></div>` em qualquer teste que monte um componente com Popover — o portal do reka-ui não renderiza em happy-dom (gotcha confirmado em `InfoPopover.spec.ts`).
- Mínimo de 2 colunas selecionadas é obrigatório para exibir o gráfico (decisão da spec).

---

### Task 1: Componente `FunnelColumnsFilter.vue`

**Files:**
- Create: `chatfunnel-front/src/views/reportsV2/components/primitives/FunnelColumnsFilter.vue`
- Test: `chatfunnel-front/src/views/reportsV2/components/primitives/__tests__/FunnelColumnsFilter.spec.ts`

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces: componente Vue com `props: { options: Pick<FunnelStage, 'id' | 'name'>[], modelValue: string[] }` e `emits: { 'update:modelValue': [string[]] }`. `FunnelStage` vem de `@chatfunnel/contracts`. A Tarefa 2 consome este componente via `v-model="selectedColumnIds"` e `:options="funnelStages"` (onde `funnelStages: FunnelStage[]`, compatível estruturalmente com `Pick<FunnelStage, 'id' | 'name'>[]`).

- [ ] **Step 1: Escrever o teste (arquivo completo, ainda falhando — componente não existe)**

Criar `chatfunnel-front/src/views/reportsV2/components/primitives/__tests__/FunnelColumnsFilter.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import FunnelColumnsFilter from "../FunnelColumnsFilter.vue";

const popoverStubs = {
  Popover: { template: "<div><slot /></div>" },
  PopoverTrigger: { template: "<div><slot /></div>" },
  PopoverContent: { template: "<div><slot /></div>" },
};

const OPTIONS = [
  { id: "a", name: "Início" },
  { id: "b", name: "Em agendamento" },
  { id: "c", name: "Agendado" },
  { id: "d", name: "Call feita" },
];

function mountFilter(modelValue: string[]) {
  return mount(FunnelColumnsFilter, {
    props: { options: OPTIONS, modelValue },
    global: { stubs: popoverStubs },
  });
}

describe("FunnelColumnsFilter", () => {
  it("renderiza as opções na ordem recebida", () => {
    const wrapper = mountFilter(["a", "b", "c", "d"]);
    const buttons = wrapper.findAll("button");
    const optionButtons = buttons.filter((b) =>
      OPTIONS.some((o) => b.text().includes(o.name))
    );
    expect(optionButtons.map((b) => b.text())).toEqual([
      "Início",
      "Em agendamento",
      "Agendado",
      "Call feita",
    ]);
  });

  it("emite update:modelValue adicionando o id ao marcar uma opção", async () => {
    const wrapper = mountFilter(["a", "b"]);
    const target = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Agendado") && !b.text().includes("Em"))!;
    await target.trigger("click");
    expect(wrapper.emitted("update:modelValue")?.[0][0]).toEqual(["a", "b", "c"]);
  });

  it("emite update:modelValue removendo o id ao desmarcar, quando restam >= 2", async () => {
    const wrapper = mountFilter(["a", "b", "c"]);
    const target = wrapper.findAll("button").find((b) => b.text().includes("Início"))!;
    await target.trigger("click");
    expect(wrapper.emitted("update:modelValue")?.[0][0]).toEqual(["b", "c"]);
  });

  it("bloqueia desmarcar quando restariam menos de 2 selecionadas", async () => {
    const wrapper = mountFilter(["a", "b"]);
    const target = wrapper.findAll("button").find((b) => b.text().includes("Início"))!;
    await target.trigger("click");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it('mostra "{n} de {total} etapas" quando há mais de 1 selecionada', () => {
    const wrapper = mountFilter(["a", "b"]);
    expect(wrapper.text()).toContain("2 de 4 etapas");
  });

  it("mostra o nome da etapa quando só 1 está selecionada", () => {
    const wrapper = mountFilter(["c"]);
    expect(wrapper.text()).toContain("Agendado");
    expect(wrapper.text()).not.toContain("de 4 etapas");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha (componente não existe)**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/components/primitives/__tests__/FunnelColumnsFilter.spec.ts`
Expected: FAIL — `Failed to resolve import "../FunnelColumnsFilter.vue"`.

- [ ] **Step 3: Implementar o componente**

Criar `chatfunnel-front/src/views/reportsV2/components/primitives/FunnelColumnsFilter.vue`:

```vue
<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="flex h-8 items-center gap-1.5 rounded-cf-lg border bg-gray-100 px-3 typo-body-12-regular text-gray-800 transition-colors"
        :class="open ? 'border-brand-400 ring-1 ring-brand-400' : 'border-gray-400 hover:border-gray-500'"
      >
        {{ triggerLabel }}
        <PhCaretDown :size="14" class="text-gray-500" />
      </button>
    </PopoverTrigger>

    <PopoverContent
      align="end"
      class="z-[100001] flex max-h-[320px] w-[220px] flex-col gap-1 overflow-y-auto rounded-cf-lg border border-gray-300 bg-gray-100 p-2 shadow-sombra-2"
    >
      <button
        v-for="option in options"
        :key="option.id"
        type="button"
        class="rounded-cf-sm flex w-full items-center gap-2 px-2 py-2 text-left typo-body-14-regular transition-colors hover:bg-gray-300"
        :class="isSelected(option.id) ? 'text-brand-600' : 'text-gray-800'"
        @click="toggle(option.id)"
      >
        <span class="flex-1 truncate">{{ option.name }}</span>
        <PhCheck v-if="isSelected(option.id)" :size="14" class="shrink-0 text-brand-500" />
      </button>
    </PopoverContent>
  </Popover>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { FunnelStage } from '@chatfunnel/contracts'
import { PhCaretDown, PhCheck } from '@phosphor-icons/vue'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'

const props = defineProps<{
  options: Pick<FunnelStage, 'id' | 'name'>[]
  modelValue: string[]
}>()

const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const open = ref(false)

const triggerLabel = computed(() => {
  if (props.modelValue.length === 1) {
    const only = props.options.find((o) => o.id === props.modelValue[0])
    return only?.name ?? '1 etapa'
  }
  return `${props.modelValue.length} de ${props.options.length} etapas`
})

function isSelected(id: string): boolean {
  return props.modelValue.includes(id)
}

// Nunca deixa a seleção cair abaixo de 2 (mínimo necessário para exibir conversão).
function toggle(id: string): void {
  const selected = isSelected(id)
  if (selected && props.modelValue.length <= 2) return
  const next = selected
    ? props.modelValue.filter((v) => v !== id)
    : [...props.modelValue, id]
  emit('update:modelValue', next)
}
</script>
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/components/primitives/__tests__/FunnelColumnsFilter.spec.ts`
Expected: PASS (6 testes).

---

### Task 2: Integrar o filtro em `FunilTab.vue`

**Files:**
- Modify: `chatfunnel-front/src/views/reportsV2/tabs/FunilTab.vue:24-45` (template da seção "Conversão por etapa") e bloco `<script setup>` (imports, estado, computeds)
- Test: `chatfunnel-front/src/views/reportsV2/tabs/__tests__/FunilTab.spec.ts` (estender)

**Interfaces:**
- Consumes: `FunnelColumnsFilter.vue` (Tarefa 1) — `props: { options, modelValue }`, `emits: 'update:modelValue'`.
- Produces: nada consumido por tarefas futuras (última tarefa do plano).

- [ ] **Step 1: Escrever os testes novos em `FunilTab.spec.ts` (ainda falhando)**

Adicionar ao final do arquivo `chatfunnel-front/src/views/reportsV2/tabs/__tests__/FunilTab.spec.ts` (depois do `describe` existente, mesmo arquivo — os mocks do topo já cobrem `ReportsV2Service.getFunnel`). Primeiro, ajustar o stub de `FunnelChart` no `mountTab()` para expor as props recebidas (necessário para os testes de recálculo abaixo) — trocar:

```ts
FunnelChart: { template: "<div />", props: ["data", "mode"] },
```

por:

```ts
FunnelChart: {
  template: '<div :data-stages="JSON.stringify(data.stages)" />',
  props: ["data", "mode"],
},
```

Também adicionar o stub que falta (o componente novo, senão o mount tenta renderizar o `Popover` real):

```ts
FunnelColumnsFilter: {
  template: "<div />",
  props: ["options", "modelValue"],
  emits: ["update:modelValue"],
},
```

Depois, adicionar o novo bloco de testes:

```ts
describe("FunilTab — filtro de colunas do funil", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFilters.pipelineId = "k1";
    mockFilters.initialDate = "2026-01-01";
    mockFilters.finalDate = "2026-01-31";
  });

  const STAGES = [
    { id: "s1", name: "Início", total: 100 },
    { id: "s2", name: "Em agendamento", total: 60 },
    { id: "s3", name: "Agendado", total: 40 },
    { id: "s4", name: "Call feita", total: 10 },
  ];

  it("seleciona todas as colunas por padrão ao carregar", async () => {
    mockGetFunnel.mockResolvedValue({ stages: STAGES });
    const wrapper = mountTab();
    await flushPromises();

    const filter = wrapper.findComponent({ name: "FunnelColumnsFilter" });
    expect(filter.props("modelValue")).toEqual(["s1", "s2", "s3", "s4"]);
  });

  it("recalcula conversionFromPrevious ao pular uma coluna intermediária", async () => {
    mockGetFunnel.mockResolvedValue({ stages: STAGES });
    const wrapper = mountTab();
    await flushPromises();

    const filter = wrapper.findComponent({ name: "FunnelColumnsFilter" });
    await filter.vm.$emit("update:modelValue", ["s1", "s3", "s4"]);
    await flushPromises();

    const chart = wrapper.findComponent({ name: "FunnelChart" });
    const stages = JSON.parse(chart.attributes("data-stages")!);
    expect(stages).toEqual([
      { id: "s1", name: "Início", total: 100, conversionFromPrevious: undefined },
      { id: "s3", name: "Agendado", total: 40, conversionFromPrevious: 0.4 },
      { id: "s4", name: "Call feita", total: 10, conversionFromPrevious: 0.25 },
    ]);
  });

  it("mostra estado vazio quando a seleção fica com menos de 2 colunas", async () => {
    mockGetFunnel.mockResolvedValue({ stages: STAGES });
    const wrapper = mountTab();
    await flushPromises();

    const filter = wrapper.findComponent({ name: "FunnelColumnsFilter" });
    await filter.vm.$emit("update:modelValue", ["s1"]);
    await flushPromises();

    expect(wrapper.text()).toContain("Selecione ao menos 2 etapas para comparar");
    expect(wrapper.findComponent({ name: "FunnelChart" }).exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar os testes novos e confirmar que falham**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/tabs/__tests__/FunilTab.spec.ts -t "filtro de colunas"`
Expected: FAIL — `findComponent({ name: "FunnelColumnsFilter" })` não encontra nada (componente ainda não está integrado no template).

- [ ] **Step 3: Integrar no template de `FunilTab.vue`**

Em `chatfunnel-front/src/views/reportsV2/tabs/FunilTab.vue`, substituir o bloco (linhas 24-45):

```vue
    <ReportSection
      title="Conversão por etapa"
      info-key="funil.funnel"
      :loading="funnel.loading.value"
      :error="funnel.error.value"
      :empty="!!funnel.data.value && funnel.data.value.stages.length === 0"
    >
      <template #actions>
        <Tabs v-model="mode">
          <TabsList class="h-auto gap-1 border-0 bg-gray-200 p-1">
            <TabsTrigger value="absolute" :class="ACTIVE_TAB_TRIGGER_CLASS">
              Absoluto
            </TabsTrigger>
            <TabsTrigger value="relative" :class="ACTIVE_TAB_TRIGGER_CLASS">
              Relativo
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </template>

      <FunnelChart :data="funnel.data.value!" :mode="mode" />
    </ReportSection>
```

por:

```vue
    <ReportSection
      title="Conversão por etapa"
      info-key="funil.funnel"
      :loading="funnel.loading.value"
      :error="funnel.error.value"
      :empty="!!funnel.data.value && funnel.data.value.stages.length === 0"
    >
      <template #actions>
        <div class="flex items-center gap-2">
          <FunnelColumnsFilter
            v-if="funnelStages.length"
            v-model="selectedColumnIds"
            :options="funnelStages"
          />
          <Tabs v-model="mode">
            <TabsList class="h-auto gap-1 border-0 bg-gray-200 p-1">
              <TabsTrigger value="absolute" :class="ACTIVE_TAB_TRIGGER_CLASS">
                Absoluto
              </TabsTrigger>
              <TabsTrigger value="relative" :class="ACTIVE_TAB_TRIGGER_CLASS">
                Relativo
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </template>

      <p
        v-if="selectedColumnIds.length < 2"
        class="typo-body-12-regular text-gray-1000 py-6 text-center"
      >
        Selecione ao menos 2 etapas para comparar.
      </p>
      <FunnelChart v-else :data="filteredFunnel" :mode="mode" />
    </ReportSection>
```

- [ ] **Step 4: Adicionar import, estado e computeds no `<script setup>`**

Trocar a linha de import de tipos dos contracts (linha 135):

```ts
import type { MetricCard as MetricCardData } from '@chatfunnel/contracts'
```

por:

```ts
import type { MetricCard as MetricCardData, FunnelData } from '@chatfunnel/contracts'
```

Adicionar o import do componente novo, junto aos outros imports de componentes (depois da linha `import MetricCard from '../components/primitives/MetricCard.vue'`):

```ts
import FunnelColumnsFilter from '../components/primitives/FunnelColumnsFilter.vue'
```

Adicionar, imediatamente depois de `const mode = ref<FunnelMode>('absolute')` (linha 196):

```ts
const selectedColumnIds = ref<string[]>([])
const initializedForPipeline = ref<string | undefined>(undefined)

const funnelStages = computed(() => funnel.data.value?.stages ?? [])

// total é cumulativo por posição, calculado no core sobre TODAS as colunas do
// pipeline — não muda com a seleção. Só o array e o conversionFromPrevious
// (fração entre vizinhos consecutivos, mirror de funnel.shaper.ts no core)
// precisam ser recalculados para o recorte selecionado.
const filteredFunnel = computed<FunnelData>(() => {
  const selected = funnelStages.value.filter((s) => selectedColumnIds.value.includes(s.id))
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

watch(funnelStages, (stages) => {
  if (!stages.length) return
  if (filters.pipelineId !== initializedForPipeline.value) {
    selectedColumnIds.value = stages.map((s) => s.id)
    initializedForPipeline.value = filters.pipelineId
    return
  }
  const validIds = new Set(stages.map((s) => s.id))
  selectedColumnIds.value = selectedColumnIds.value.filter((id) => validIds.has(id))
})
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2/tabs/__tests__/FunilTab.spec.ts`
Expected: PASS (todos os testes do arquivo, incluindo os pré-existentes e os 3 novos).

- [ ] **Step 6: Rodar a suíte completa do `reportsV2` para checar regressão**

Run: `cd chatfunnel-front && npx vitest run src/views/reportsV2`
Expected: PASS (nenhum teste pré-existente quebrado pela mudança de import/estado em `FunilTab.vue`).

---

## Self-Review

**Cobertura da spec:**
- "Fonte das opções do filtro" (sem fetch adicional) → Task 2 Step 4, `funnelStages` deriva de `funnel.data.value`, sem chamada a `KanbanService`. ✓
- Componente `FunnelColumnsFilter.vue` → Task 1. ✓
- Lógica de seleção padrão/reset/prune em `FunilTab.vue` → Task 2 Step 4, `watch(funnelStages, ...)`. ✓
- Recalcular `conversionFromPrevious` mirror do shaper → Task 2 Step 4, `filteredFunnel`. ✓
- Posicionamento no slot `#actions`, ao lado dos Tabs → Task 2 Step 3. ✓
- Guarda de mínimo (2 colunas) — bloqueio na UI e estado vazio → Task 1 (`toggle`) e Task 2 Step 3 (`<p v-if="selectedColumnIds.length < 2">`). ✓
- Critérios de aceite da tabela do spec → cobertos pelos testes de Task 1 (ordem, toggle, mínimo) e Task 2 (default all, reset/prune implícito no mesmo `watch`, recálculo de conversão, estado vazio). Reset explícito por troca de pipeline não tem um teste dedicado separado do "seleciona todas por padrão" — mesma branch de código, cobertura aceitável.
- "Fora de escopo" (persistência em URL, envio de `columnIds` ao backend, mudanças no core/shaper/contracts) → nenhuma tarefa toca nesses itens. ✓

**Placeholder scan:** nenhum "TBD"/"TODO"/"add validation" — todos os steps têm código completo.

**Consistência de tipos:** `FunnelColumnsFilter` prop `options: Pick<FunnelStage, 'id' | 'name'>[]` (Task 1) recebe `funnelStages` tipado como `FunnelStage[]` (Task 2) — compatível estruturalmente. `modelValue: string[]` (Task 1) ↔ `selectedColumnIds: Ref<string[]>` (Task 2) via `v-model`. `emits: 'update:modelValue': [string[]]` (Task 1) ↔ testado via `filter.vm.$emit("update:modelValue", [...])` (Task 2 Step 1). Nomes batem em todas as tarefas.
