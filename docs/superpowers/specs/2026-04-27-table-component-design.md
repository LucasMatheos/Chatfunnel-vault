# Table Component — Design Spec

**Data:** 2026-04-27
**Stack:** Vue 3 + script setup + TypeScript, Tailwind CSS v4, shadcn-vue, Phosphor icons
**Local:** `chatfunnel-front/src/components/ui/table/`
**Mockup de referência:** `vault/prototipos/credenciais-unification.pen`
  - Frame `02 - Form Nova chave API` (card "Permissões") — origem do padrão
  - Frames `01 - Lista Credenciais` e `04 - Lista Credenciais (tab Tokens MCP)` — usos adicionais

---

## 1. Motivação

A frente do ChatFunnel está migrando de Vuetify/PrimeVue para shadcn-vue + Tailwind v4. Hoje toda tabela do produto usa `compact-table` (Vuetify legado), o que bloqueia novas telas que precisam de visual moderno e tokens próprios da marca.

Esta spec define o **componente Table** novo, dimensionado para cobrir três casos imediatos da feature **Credenciais** sem virar uma library genérica:

1. Tabela de **permissões** (checkbox + 2 colunas de texto) dentro de um card de form
2. Tabela de **chaves API** (checkbox + nome + permissões em chips + chave + expiração + status)
3. Tabela de **tokens MCP** (checkbox + nome + token + criado em + status)

Casos legados (`ContactsList`, `ModeratorsList`, etc.) **não são migrados nesta entrega** — ficam com `compact-table` até demandas próprias.

---

## 2. Objetivos e não-objetivos

### Objetivos
- Primitives shadcn-vue idiomáticos para `<Table>`/`<TableRow>`/`<TableCell>`
- Componente composto `DataTable` que orquestra colunas, dados, seleção, loading, empty
- Composable `useTableSelection` para estado de seleção (single/multi)
- Tokens visuais alinhados ao brand ChatFunnel
- Acessibilidade (ARIA roles, keyboard navigation)

### Não-objetivos
- Sort, filter, pagination (fora de escopo — adicionar quando a primeira tela pedir)
- Virtual scrolling (não há dataset grande nos casos atuais)
- Migração de telas legadas
- Storybook
- Server-side data fetching dentro do componente
- Drag-and-drop, cell editing, expandable rows

---

## 3. Estrutura de arquivos

```
chatfunnel-front/src/components/ui/table/
├── Table.vue                  # primitive: <table> wrapper
├── TableHeader.vue            # primitive: <thead> wrapper
├── TableBody.vue              # primitive: <tbody> wrapper
├── TableRow.vue               # primitive: <tr> wrapper
├── TableHead.vue              # primitive: <th> wrapper
├── TableCell.vue              # primitive: <td> wrapper
├── DataTable.vue              # composto: orquestrador
├── useTableSelection.ts       # composable de seleção
├── types.ts                   # DataTableColumn, DataTableProps
└── index.ts                   # re-exports
```

Decisão: **primitives e composto ficam juntos em `ui/table/`**. Primitives podem ser usados isoladamente para casos com layout especial; `DataTable` cobre 90% dos casos.

---

## 4. Primitives (Layer 1)

Wrappers finos sobre HTML semântico com Tailwind tokens.

### 4.1 `Table.vue`

```vue
<template>
  <div class="relative w-full overflow-auto">
    <table :class="cn('w-full caption-bottom typo-body-13-regular', $attrs.class as string)">
      <slot />
    </table>
  </div>
</template>

<script setup lang="ts">
import { cn } from '@/common/utils/cn'
defineOptions({ inheritAttrs: false })
</script>
```

### 4.2 `TableHeader.vue`

```vue
<template>
  <thead :class="cn('bg-gray-200 [&_tr]:border-b-0', $attrs.class as string)">
    <slot />
  </thead>
</template>
```

> Decisão de cor: `bg-gray-200` (off-white). Diferencia o header das células sem competir com o card que abriga a tabela.

### 4.3 `TableBody.vue`

```vue
<template>
  <tbody :class="cn('[&_tr:last-child]:border-0', $attrs.class as string)">
    <slot />
  </tbody>
</template>
```

### 4.4 `TableRow.vue`

```vue
<template>
  <tr
    :data-state="selected ? 'selected' : undefined"
    :class="
      cn(
        'border-b border-gray-400 transition-colors',
        clickable && 'cursor-pointer hover:bg-gray-200/60',
        'data-[state=selected]:bg-brand-100',
        $attrs.class as string,
      )
    "
  >
    <slot />
  </tr>
</template>

<script setup lang="ts">
import { cn } from '@/common/utils/cn'
defineProps<{ selected?: boolean; clickable?: boolean }>()
defineOptions({ inheritAttrs: false })
</script>
```

### 4.5 `TableHead.vue`

```vue
<template>
  <th
    scope="col"
    :class="
      cn(
        'h-11 px-3 text-left align-middle typo-body-12-semibold text-gray-700',
        '[&:has([role=checkbox])]:w-11 [&:has([role=checkbox])]:px-0',
        $attrs.class as string,
      )
    "
  >
    <slot />
  </th>
</template>
```

### 4.6 `TableCell.vue`

```vue
<template>
  <td
    :class="
      cn(
        'h-14 px-3 align-middle text-gray-1000',
        '[&:has([role=checkbox])]:w-11 [&:has([role=checkbox])]:px-0',
        $attrs.class as string,
      )
    "
  >
    <slot />
  </td>
</template>
```

---

## 5. `DataTable.vue` (Layer 2 — orquestrador)

### 5.1 API pública

```ts
// types.ts
export type Align = 'left' | 'center' | 'right'

export interface DataTableColumn<T> {
  key: string
  label: string
  width?: number | string         // 240, '180px', 'fill'. default: fit-content
  align?: Align                   // default: 'left'
  cellClass?: string
  headClass?: string
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  selectable?: boolean
  loading?: boolean
  loadingRows?: number            // default: 5
  emptyTitle?: string             // default: 'Nada por aqui ainda'
  emptyDescription?: string
  emptyIcon?: Component           // default: PhInbox
  density?: 'compact' | 'comfortable'   // default: 'comfortable'
  rowClickable?: boolean          // se true, hover + cursor-pointer
}
```

### 5.2 Slots

| Slot | Props | Uso |
|---|---|---|
| `cell-{column.key}` | `{ row: T, index: number }` | Render customizado por coluna (preferido) |
| `empty` | — | Override completo do empty state |
| `empty-action` | — | CTA no empty (ex: "Criar primeira chave") |
| `row-actions` | `{ row: T }` | Coluna de ações renderizada à direita |

### 5.3 Eventos

| Evento | Payload | Quando |
|---|---|---|
| `update:selected` | `(string \| number)[]` | Mudança em seleção (v-model:selected) |
| `row-click` | `T` | Clique na linha (se `rowClickable`) |

### 5.4 Comportamentos built-in

**Seleção** (quando `selectable=true`):
- Coluna de checkbox como primeira (largura 44px, sem padding lateral)
- Header tem checkbox que reflete `all/none/indeterminate`
- v-model:selected expõe array de `rowKey(row)`
- Linha selecionada recebe `data-state=selected` → bg `brand-100`

**Loading** (quando `loading=true`):
- Renderiza N rows (`loadingRows`) de `<Skeleton>` espelhando as colunas (mesma altura, mesmas larguras)
- Mantém o header visível
- Esconde `rows` enquanto carrega

**Empty** (quando `!loading && rows.length === 0`):
- Centraliza ícone Phosphor (`PhInbox` default) + título + descrição + opcional CTA via slot `empty-action`
- Padding generoso (`py-16`)
- Texto em `text-gray-700`

**Density**:
- `comfortable` (default): row height 56px, padding x 12
- `compact`: row height 44px, padding x 12

### 5.5 Esqueleto de implementação

```vue
<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead v-if="selectable">
          <Checkbox
            role="checkbox"
            :model-value="selection.isAllSelected.value"
            :indeterminate="selection.isIndeterminate.value"
            @update:model-value="selection.toggleAll"
            aria-label="Selecionar todas as linhas"
          />
        </TableHead>
        <TableHead
          v-for="col in columns"
          :key="col.key"
          :style="widthStyle(col)"
          :class="[alignClass(col.align), col.headClass]"
        >
          {{ col.label }}
        </TableHead>
      </TableRow>
    </TableHeader>

    <TableBody>
      <template v-if="loading">
        <TableRow v-for="i in loadingRows" :key="`sk-${i}`">
          <TableCell v-if="selectable"><Skeleton class="size-4 rounded-cf-sm" /></TableCell>
          <TableCell
            v-for="col in columns"
            :key="col.key"
            :style="widthStyle(col)"
          >
            <Skeleton class="h-4 w-3/4 rounded-cf-sm" />
          </TableCell>
        </TableRow>
      </template>

      <template v-else-if="rows.length === 0">
        <TableRow>
          <TableCell :colspan="totalCols" class="h-auto">
            <slot name="empty">
              <div class="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <component :is="emptyIcon ?? PhInbox" :size="40" class="text-gray-600" />
                <div class="flex flex-col gap-1">
                  <p class="typo-body-14-bold text-gray-1000">{{ emptyTitle }}</p>
                  <p class="typo-body-13-regular text-gray-700">{{ emptyDescription }}</p>
                </div>
                <slot name="empty-action" />
              </div>
            </slot>
          </TableCell>
        </TableRow>
      </template>

      <template v-else>
        <TableRow
          v-for="(row, index) in rows"
          :key="rowKey(row)"
          :selected="selection.isSelected(rowKey(row))"
          :clickable="rowClickable"
          @click="emit('row-click', row)"
        >
          <TableCell v-if="selectable" @click.stop>
            <Checkbox
              role="checkbox"
              :model-value="selection.isSelected(rowKey(row))"
              @update:model-value="selection.toggleRow(rowKey(row))"
              :aria-label="`Selecionar linha ${index + 1}`"
            />
          </TableCell>
          <TableCell
            v-for="col in columns"
            :key="col.key"
            :style="widthStyle(col)"
            :class="[alignClass(col.align), col.cellClass]"
          >
            <slot
              :name="`cell-${col.key}`"
              :row="row"
              :index="index"
            >
              {{ (row as Record<string, unknown>)[col.key] }}
            </slot>
          </TableCell>
        </TableRow>
      </template>
    </TableBody>
  </Table>
</template>
```

### 5.6 Largura de colunas

| `width` value | Tradução |
|---|---|
| `number` | `style="width: ${n}px; min-width: ${n}px"` |
| `string` ('180px', '20%') | `style="width: ${s}; min-width: ${s}"` |
| `'fill'` | `style="width: 100%"` (uma única coluna deve ser fill) |
| `undefined` | sem style — célula ajusta ao conteúdo |

---

## 6. `useTableSelection<T>` (composable)

```ts
import { computed, ref, type Ref } from 'vue'

export function useTableSelection<T>(
  rows: Ref<T[]>,
  rowKey: (row: T) => string | number,
) {
  const selected = ref<(string | number)[]>([])

  const selectedSet = computed(() => new Set(selected.value))

  const isSelected = (id: string | number) => selectedSet.value.has(id)

  const isAllSelected = computed(
    () => rows.value.length > 0 && selected.value.length === rows.value.length,
  )

  const isIndeterminate = computed(
    () => selected.value.length > 0 && !isAllSelected.value,
  )

  const toggleRow = (id: string | number) => {
    const idx = selected.value.indexOf(id)
    if (idx === -1) selected.value.push(id)
    else selected.value.splice(idx, 1)
  }

  const toggleAll = () => {
    selected.value = isAllSelected.value
      ? []
      : rows.value.map(rowKey)
  }

  const reset = () => {
    selected.value = []
  }

  return {
    selected,
    isSelected,
    isAllSelected,
    isIndeterminate,
    toggleRow,
    toggleAll,
    reset,
  }
}
```

`DataTable` instancia o composable internamente. Quando o pai passa `v-model:selected`, o composable sincroniza com o modelValue (via `watch`).

---

## 7. Acessibilidade

- `<table>` semântico com `<thead>`, `<tbody>`, `<tr>`, `<th scope="col">`, `<td>`
- Checkbox com `role="checkbox"`, `aria-checked`, `aria-label` por linha
- `aria-busy="true"` em `<table>` durante loading
- `data-state="selected"` em rows selecionadas (acessável via CSS e screen readers)
- Foco visível: `focus-visible:outline-2 focus-visible:outline-brand-500 focus-visible:outline-offset-2` em rows clicáveis
- Tab order: header checkbox → header cells (não focáveis) → row checkboxes → row content (se houver `<a>` ou `<button>`)

---

## 8. Iconografia

Toda iconografia interna usa **Phosphor Icons** (`@phosphor-icons/vue`):

| Uso | Ícone |
|---|---|
| Empty state default | `PhInbox` |
| Loading (não mostra ícone — usa Skeleton) | — |
| Sort indicators (futuro) | `PhCaretUpDown`, `PhCaretUp`, `PhCaretDown` |

Consumidores que renderizam ícones em células também devem usar Phosphor por consistência.

---

## 9. Testes

Vitest + `@testing-library/vue` em arquivos co-localizados (`DataTable.spec.ts`, `useTableSelection.spec.ts`).

**Casos mínimos:**
- Renderiza header + N rows com dados corretos
- `selectable=true` mostra coluna de checkbox e dispara `update:selected`
- Toggle "all" seleciona/desseleciona todas
- Estado `loading=true` mostra N skeletons e esconde dados
- Estado vazio mostra empty default e CTA via slot
- Slot `cell-{key}` substitui o render padrão
- `rowClickable` adiciona cursor-pointer e dispara `row-click`
- `useTableSelection` cobertura: toggleRow, toggleAll, isAllSelected, isIndeterminate, reset

---

## 10. Migração / coexistência

- **Não tocar em `compact-table`** existente
- Novas telas que precisem de tabela usam `DataTable`
- Quando uma tela legada precisar de evolução, migra naquele PR (não nesse)

---

## 11. Exemplo de composição (Card + DataTable)

Para reforçar a fronteira: **a Table não controla card, header, badge ou ações em volta**. Tudo isso é composição na view consumidora, usando primitives já existentes em `ui/card/` e `ui/badge/`.

Exemplo canônico — `ApiKeyPermissionsTable.vue` (caso do frame `02 - Form Nova chave API`, card "Permissões"):

```vue
<template>
  <Card class="overflow-hidden rounded-cf-xl border-gray-400">
    <CardHeader class="flex flex-row items-start justify-between gap-4">
      <div class="flex flex-col gap-1">
        <CardTitle class="typo-body-16-bold text-gray-1000">Permissões</CardTitle>
        <CardDescription class="typo-body-13-regular text-gray-700">
          Selecione quais recursos da API esta chave pode acessar.
        </CardDescription>
      </div>
      <Badge v-if="selected.length" tone="brand" variant="soft">
        {{ selected.length }}
        {{ selected.length === 1 ? 'selecionada' : 'selecionadas' }}
      </Badge>
    </CardHeader>

    <DataTable
      :columns="columns"
      :rows="permissions"
      :row-key="(r) => r.id"
      v-model:selected="selected"
      selectable
    />
  </Card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { WhatsAppApiPermissionsEnum } from '@/common/enums'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataTable, type DataTableColumn } from '@/components/ui/table'

interface PermissionRow {
  id: string
  name: string
  description: string
}

const props = defineProps<{ modelValue: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const selected = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const { t } = useI18n()
const enumInst = new WhatsAppApiPermissionsEnum()

const permissions = computed<PermissionRow[]>(() =>
  enumInst.getClaims.map((p) => ({
    id: p,
    name: t(`enums.WhatsAppApiPermissionsEnum.${p}.name`),
    description: t(`enums.WhatsAppApiPermissionsEnum.${p}.description`),
  })),
)

const columns: DataTableColumn<PermissionRow>[] = [
  { key: 'name', label: 'Permissão', width: 240 },
  { key: 'description', label: 'Descrição' },
]
</script>
```

Mesma idéia para `ApiKeysTable.vue` (Card + toolbar com search e botões + DataTable com slots customizados nas células `permissions`, `apiKey`, `expiresAt`, `isActive`) e `McpTokensTable.vue` (Card + strip de status do servidor + DataTable). Em todos os casos, **a Table só recebe `columns`, `rows`, `rowKey`** — o resto é responsabilidade da view.

### O que pertence a quem

| Responsabilidade | Componente |
|---|---|
| `<table>`, `<tr>`, `<td>`, header bg, hover, seleção, loading, empty | `Table` / `DataTable` |
| Card wrapper (`rounded-cf-xl`, border, overflow-hidden) | `Card` (já existe) |
| Card title, description, action area | `CardHeader` + `CardTitle` + `CardDescription` |
| Badge contador, status pill no header | `Badge` (já existe) |
| Toolbar de busca/filtro/ações em massa | View consumidora |
| Strip de informação contextual (ex: "Servidor MCP online") | View consumidora |
| Render de célula custom (chip, botão, link) | Slot `cell-{key}` na view consumidora |

---

## 12. Aceite

- [ ] 6 primitives (`Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`) criados em `ui/table/`
- [ ] `DataTable.vue` cobre selectable, loading, empty, density, slot por coluna
- [ ] `useTableSelection.ts` testado e exportado
- [ ] Tipos exportados em `types.ts` e re-exportados via `index.ts`
- [ ] `npm run typecheck` verde
- [ ] `npm run lint` verde
- [ ] `npm test` verde com todos os casos de §9
- [ ] Visual bate com o frame `02 - Form Nova chave API` (card Permissões) do `.pen` — verificação manual

---

## 13. Referências

- Mockup `.pen`: `vault/prototipos/credenciais-unification.pen`
- Brand tokens: `chatfunnel-front/src/assets/tailwind/`
- Brand guidelines skill: `.claude/skills/brand-guidelines/SKILL.md`
- shadcn-vue Table: https://www.shadcn-vue.com/docs/components/table
