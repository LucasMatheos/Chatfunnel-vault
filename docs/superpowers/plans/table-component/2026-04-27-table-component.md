# Table Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement shadcn-vue Table primitives + DataTable orchestrator + useTableSelection composable in `chatfunnel-front/src/components/ui/table/` per the spec at `docs/superpowers/specs/2026-04-27-table-component-design.md`.

**Architecture:** Six thin primitives over native `<table>`/`<tr>`/`<td>` (matching shadcn-vue convention used in existing `card/`, `dialog/`, `checkbox/` folders). One composed `DataTable.vue` covering selectable/loading/empty/density/clickable. One composable `useTableSelection.ts` for selection state. All Vue 3 + script setup + TypeScript, Tailwind v4 with project tokens, Phosphor icons.

**Tech Stack:** Vue 3.5, TypeScript, Tailwind CSS v4, Reka UI primitives (already in deps via `reka-ui`), shadcn-vue conventions, Phosphor icons (`@phosphor-icons/vue`), Vitest + `@testing-library/vue` + happy-dom.

---

## File Structure

```
chatfunnel-front/src/components/ui/table/
├── Table.vue
├── TableHeader.vue
├── TableBody.vue
├── TableRow.vue
├── TableHead.vue
├── TableCell.vue
├── DataTable.vue
├── useTableSelection.ts
├── types.ts
├── index.ts
└── __tests__/
    ├── useTableSelection.spec.ts
    ├── Table.spec.ts
    ├── TableRow.spec.ts
    └── DataTable.spec.ts
```

**Conventions followed (verified in existing `ui/` folders):**
- `cn()` from `@/common/utils/cn` for class merging
- `defineProps<{ class?: HTMLAttributes['class'] }>()` for class passthrough
- `<script setup lang="ts">` with `data-slot` attribute on root
- Named exports via `index.ts`
- Tests in `__tests__/*.spec.ts` co-located in component folder

---

## Task 1: Types and skeleton index

**Files:**
- Create: `chatfunnel-front/src/components/ui/table/types.ts`
- Create: `chatfunnel-front/src/components/ui/table/index.ts`

- [ ] **Step 1: Create types.ts**

```ts
// chatfunnel-front/src/components/ui/table/types.ts
import type { Component } from 'vue'

export type Align = 'left' | 'center' | 'right'

export interface DataTableColumn<T = unknown> {
  key: string
  label: string
  width?: number | string | 'fill'
  align?: Align
  cellClass?: string
  headClass?: string
}

export interface DataTableEmptyAction {
  label: string
  onClick: () => void
}

export interface DataTableProps<T = unknown> {
  columns: DataTableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  selected?: (string | number)[]
  selectable?: boolean
  loading?: boolean
  loadingRows?: number
  emptyTitle?: string
  emptyDescription?: string
  emptyIcon?: Component
  density?: 'compact' | 'comfortable'
  rowClickable?: boolean
}
```

- [ ] **Step 2: Create empty index.ts**

```ts
// chatfunnel-front/src/components/ui/table/index.ts
export type { Align, DataTableColumn, DataTableEmptyAction, DataTableProps } from './types'
```

- [ ] **Step 3: Verify typecheck**

Run: `cd chatfunnel-front && npm run typecheck`
Expected: PASS (no new errors).

- [ ] **Step 4: Commit**

```bash
git add chatfunnel-front/src/components/ui/table/types.ts chatfunnel-front/src/components/ui/table/index.ts
git commit -m "feat(ui/table): scaffold types and index"
```

---

## Task 2: useTableSelection — selected, isSelected, toggleRow

**Files:**
- Create: `chatfunnel-front/src/components/ui/table/useTableSelection.ts`
- Create: `chatfunnel-front/src/components/ui/table/__tests__/useTableSelection.spec.ts`

- [ ] **Step 1: Write failing test**

```ts
// chatfunnel-front/src/components/ui/table/__tests__/useTableSelection.spec.ts
import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useTableSelection } from '../useTableSelection'

interface Row { id: number; name: string }
const sample: Row[] = [
  { id: 1, name: 'A' },
  { id: 2, name: 'B' },
  { id: 3, name: 'C' },
]

describe('useTableSelection', () => {
  it('starts empty and reports nothing selected', () => {
    const rows = ref<Row[]>([...sample])
    const sel = useTableSelection(rows, (r) => r.id)
    expect(sel.selected.value).toEqual([])
    expect(sel.isSelected(1)).toBe(false)
  })

  it('toggles a single row on and off', () => {
    const rows = ref<Row[]>([...sample])
    const sel = useTableSelection(rows, (r) => r.id)
    sel.toggleRow(2)
    expect(sel.selected.value).toEqual([2])
    expect(sel.isSelected(2)).toBe(true)
    sel.toggleRow(2)
    expect(sel.selected.value).toEqual([])
    expect(sel.isSelected(2)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd chatfunnel-front && npm run test:run -- useTableSelection`
Expected: FAIL with "Cannot find module '../useTableSelection'".

- [ ] **Step 3: Implement minimal composable**

```ts
// chatfunnel-front/src/components/ui/table/useTableSelection.ts
import { computed, ref, type Ref } from 'vue'

export function useTableSelection<T>(
  rows: Ref<T[]>,
  rowKey: (row: T) => string | number,
) {
  const selected = ref<(string | number)[]>([])

  const selectedSet = computed(() => new Set(selected.value))
  const isSelected = (id: string | number) => selectedSet.value.has(id)

  const toggleRow = (id: string | number) => {
    const idx = selected.value.indexOf(id)
    if (idx === -1) selected.value.push(id)
    else selected.value.splice(idx, 1)
  }

  return { selected, isSelected, toggleRow, _rows: rows, _rowKey: rowKey }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd chatfunnel-front && npm run test:run -- useTableSelection`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add chatfunnel-front/src/components/ui/table/useTableSelection.ts chatfunnel-front/src/components/ui/table/__tests__/useTableSelection.spec.ts
git commit -m "feat(ui/table): add useTableSelection with toggleRow"
```

---

## Task 3: useTableSelection — toggleAll, isAllSelected, isIndeterminate, reset

**Files:**
- Modify: `chatfunnel-front/src/components/ui/table/useTableSelection.ts`
- Modify: `chatfunnel-front/src/components/ui/table/__tests__/useTableSelection.spec.ts`

- [ ] **Step 1: Add failing tests**

Append inside the `describe` block in `useTableSelection.spec.ts`:

```ts
  it('toggleAll selects every row when none are selected', () => {
    const rows = ref<Row[]>([...sample])
    const sel = useTableSelection(rows, (r) => r.id)
    sel.toggleAll()
    expect(sel.selected.value).toEqual([1, 2, 3])
    expect(sel.isAllSelected.value).toBe(true)
    expect(sel.isIndeterminate.value).toBe(false)
  })

  it('toggleAll clears selection when all are selected', () => {
    const rows = ref<Row[]>([...sample])
    const sel = useTableSelection(rows, (r) => r.id)
    sel.toggleAll()
    sel.toggleAll()
    expect(sel.selected.value).toEqual([])
    expect(sel.isAllSelected.value).toBe(false)
  })

  it('reports indeterminate when some rows are selected', () => {
    const rows = ref<Row[]>([...sample])
    const sel = useTableSelection(rows, (r) => r.id)
    sel.toggleRow(1)
    expect(sel.isAllSelected.value).toBe(false)
    expect(sel.isIndeterminate.value).toBe(true)
  })

  it('reset clears the selection', () => {
    const rows = ref<Row[]>([...sample])
    const sel = useTableSelection(rows, (r) => r.id)
    sel.toggleRow(1)
    sel.toggleRow(2)
    sel.reset()
    expect(sel.selected.value).toEqual([])
  })

  it('isAllSelected is false when rows are empty', () => {
    const rows = ref<Row[]>([])
    const sel = useTableSelection(rows, (r) => r.id)
    expect(sel.isAllSelected.value).toBe(false)
  })
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd chatfunnel-front && npm run test:run -- useTableSelection`
Expected: FAIL ("isAllSelected is undefined", etc.).

- [ ] **Step 3: Extend composable**

Replace the body of `useTableSelection.ts`:

```ts
// chatfunnel-front/src/components/ui/table/useTableSelection.ts
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
    selected.value = isAllSelected.value ? [] : rows.value.map(rowKey)
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

- [ ] **Step 4: Run tests to verify pass**

Run: `cd chatfunnel-front && npm run test:run -- useTableSelection`
Expected: PASS (7/7).

- [ ] **Step 5: Commit**

```bash
git add chatfunnel-front/src/components/ui/table/useTableSelection.ts chatfunnel-front/src/components/ui/table/__tests__/useTableSelection.spec.ts
git commit -m "feat(ui/table): toggleAll, isAllSelected, isIndeterminate, reset"
```

---

## Task 4: Table primitive

**Files:**
- Create: `chatfunnel-front/src/components/ui/table/Table.vue`
- Create: `chatfunnel-front/src/components/ui/table/__tests__/Table.spec.ts`
- Modify: `chatfunnel-front/src/components/ui/table/index.ts`

- [ ] **Step 1: Write failing test**

```ts
// chatfunnel-front/src/components/ui/table/__tests__/Table.spec.ts
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/vue'
import Table from '../Table.vue'

describe('Table', () => {
  it('renders a table element wrapped in a scroll container', () => {
    const { container } = render(Table, { slots: { default: '<tbody><tr><td>x</td></tr></tbody>' } })
    const wrapper = container.querySelector('div')
    const table = container.querySelector('table')
    expect(wrapper).not.toBeNull()
    expect(table).not.toBeNull()
    expect(wrapper?.className).toContain('overflow-auto')
    expect(table?.className).toContain('w-full')
  })

  it('merges class prop into table element', () => {
    const { container } = render(Table, { props: { class: 'custom-class' } })
    const table = container.querySelector('table')
    expect(table?.className).toContain('custom-class')
  })
})
```

- [ ] **Step 2: Verify failure**

Run: `cd chatfunnel-front && npm run test:run -- Table.spec`
Expected: FAIL ("Cannot find module '../Table.vue'").

- [ ] **Step 3: Implement Table.vue**

```vue
<!-- chatfunnel-front/src/components/ui/table/Table.vue -->
<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/common/utils/cn'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <div data-slot="table-container" class="relative w-full overflow-auto">
    <table
      data-slot="table"
      :class="cn('w-full caption-bottom typo-body-13-regular', props.class)"
    >
      <slot />
    </table>
  </div>
</template>
```

- [ ] **Step 4: Update index.ts**

Replace contents of `index.ts`:

```ts
export type { Align, DataTableColumn, DataTableEmptyAction, DataTableProps } from './types'
export { default as Table } from './Table.vue'
```

- [ ] **Step 5: Verify pass**

Run: `cd chatfunnel-front && npm run test:run -- Table.spec`
Expected: PASS (2/2).

- [ ] **Step 6: Commit**

```bash
git add chatfunnel-front/src/components/ui/table/Table.vue chatfunnel-front/src/components/ui/table/__tests__/Table.spec.ts chatfunnel-front/src/components/ui/table/index.ts
git commit -m "feat(ui/table): add Table primitive"
```

---

## Task 5: TableHeader and TableBody primitives

**Files:**
- Create: `chatfunnel-front/src/components/ui/table/TableHeader.vue`
- Create: `chatfunnel-front/src/components/ui/table/TableBody.vue`
- Modify: `chatfunnel-front/src/components/ui/table/__tests__/Table.spec.ts`
- Modify: `chatfunnel-front/src/components/ui/table/index.ts`

- [ ] **Step 1: Add failing tests for TableHeader and TableBody**

Append to `Table.spec.ts`:

```ts
import TableHeader from '../TableHeader.vue'
import TableBody from '../TableBody.vue'

describe('TableHeader', () => {
  it('renders a thead with bg-gray-200', () => {
    const { container } = render(TableHeader)
    const thead = container.querySelector('thead')
    expect(thead).not.toBeNull()
    expect(thead?.className).toContain('bg-gray-200')
  })
})

describe('TableBody', () => {
  it('renders a tbody', () => {
    const { container } = render(TableBody)
    const tbody = container.querySelector('tbody')
    expect(tbody).not.toBeNull()
  })
})
```

- [ ] **Step 2: Verify failure**

Run: `cd chatfunnel-front && npm run test:run -- Table.spec`
Expected: FAIL ("Cannot find module '../TableHeader.vue'", "Cannot find module '../TableBody.vue'").

- [ ] **Step 3: Implement TableHeader.vue**

```vue
<!-- chatfunnel-front/src/components/ui/table/TableHeader.vue -->
<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/common/utils/cn'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <thead
    data-slot="table-header"
    :class="cn('bg-gray-200 [&_tr]:border-b-0', props.class)"
  >
    <slot />
  </thead>
</template>
```

- [ ] **Step 4: Implement TableBody.vue**

```vue
<!-- chatfunnel-front/src/components/ui/table/TableBody.vue -->
<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/common/utils/cn'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <tbody
    data-slot="table-body"
    :class="cn('[&_tr:last-child]:border-0', props.class)"
  >
    <slot />
  </tbody>
</template>
```

- [ ] **Step 5: Update index.ts**

Replace contents of `index.ts`:

```ts
export type { Align, DataTableColumn, DataTableEmptyAction, DataTableProps } from './types'
export { default as Table } from './Table.vue'
export { default as TableHeader } from './TableHeader.vue'
export { default as TableBody } from './TableBody.vue'
```

- [ ] **Step 6: Verify pass**

Run: `cd chatfunnel-front && npm run test:run -- Table.spec`
Expected: PASS (4/4).

- [ ] **Step 7: Commit**

```bash
git add chatfunnel-front/src/components/ui/table/TableHeader.vue chatfunnel-front/src/components/ui/table/TableBody.vue chatfunnel-front/src/components/ui/table/__tests__/Table.spec.ts chatfunnel-front/src/components/ui/table/index.ts
git commit -m "feat(ui/table): add TableHeader and TableBody primitives"
```

---

## Task 6: TableRow primitive (selected, clickable variants)

**Files:**
- Create: `chatfunnel-front/src/components/ui/table/TableRow.vue`
- Create: `chatfunnel-front/src/components/ui/table/__tests__/TableRow.spec.ts`
- Modify: `chatfunnel-front/src/components/ui/table/index.ts`

- [ ] **Step 1: Write failing tests**

```ts
// chatfunnel-front/src/components/ui/table/__tests__/TableRow.spec.ts
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/vue'
import TableRow from '../TableRow.vue'

describe('TableRow', () => {
  it('renders a tr with default border classes', () => {
    const { container } = render(TableRow)
    const tr = container.querySelector('tr')
    expect(tr).not.toBeNull()
    expect(tr?.className).toContain('border-b')
    expect(tr?.className).toContain('border-gray-400')
  })

  it('exposes data-state="selected" when selected prop is true', () => {
    const { container } = render(TableRow, { props: { selected: true } })
    const tr = container.querySelector('tr')
    expect(tr?.getAttribute('data-state')).toBe('selected')
  })

  it('does not set data-state when selected is false', () => {
    const { container } = render(TableRow, { props: { selected: false } })
    const tr = container.querySelector('tr')
    expect(tr?.getAttribute('data-state')).toBeNull()
  })

  it('adds cursor-pointer and hover class when clickable', () => {
    const { container } = render(TableRow, { props: { clickable: true } })
    const tr = container.querySelector('tr')
    expect(tr?.className).toContain('cursor-pointer')
    expect(tr?.className).toContain('hover:bg-gray-200/60')
  })
})
```

- [ ] **Step 2: Verify failure**

Run: `cd chatfunnel-front && npm run test:run -- TableRow`
Expected: FAIL ("Cannot find module '../TableRow.vue'").

- [ ] **Step 3: Implement TableRow.vue**

```vue
<!-- chatfunnel-front/src/components/ui/table/TableRow.vue -->
<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/common/utils/cn'

const props = defineProps<{
  class?: HTMLAttributes['class']
  selected?: boolean
  clickable?: boolean
}>()
</script>

<template>
  <tr
    data-slot="table-row"
    :data-state="props.selected ? 'selected' : undefined"
    :class="
      cn(
        'border-b border-gray-400 transition-colors',
        props.clickable && 'cursor-pointer hover:bg-gray-200/60',
        'data-[state=selected]:bg-brand-100',
        props.class,
      )
    "
  >
    <slot />
  </tr>
</template>
```

- [ ] **Step 4: Update index.ts**

Replace contents of `index.ts`:

```ts
export type { Align, DataTableColumn, DataTableEmptyAction, DataTableProps } from './types'
export { default as Table } from './Table.vue'
export { default as TableHeader } from './TableHeader.vue'
export { default as TableBody } from './TableBody.vue'
export { default as TableRow } from './TableRow.vue'
```

- [ ] **Step 5: Verify pass**

Run: `cd chatfunnel-front && npm run test:run -- TableRow`
Expected: PASS (4/4).

- [ ] **Step 6: Commit**

```bash
git add chatfunnel-front/src/components/ui/table/TableRow.vue chatfunnel-front/src/components/ui/table/__tests__/TableRow.spec.ts chatfunnel-front/src/components/ui/table/index.ts
git commit -m "feat(ui/table): add TableRow with selected and clickable variants"
```

---

## Task 7: TableHead and TableCell primitives

**Files:**
- Create: `chatfunnel-front/src/components/ui/table/TableHead.vue`
- Create: `chatfunnel-front/src/components/ui/table/TableCell.vue`
- Modify: `chatfunnel-front/src/components/ui/table/__tests__/Table.spec.ts`
- Modify: `chatfunnel-front/src/components/ui/table/index.ts`

- [ ] **Step 1: Add failing tests**

Append to `Table.spec.ts`:

```ts
import TableHead from '../TableHead.vue'
import TableCell from '../TableCell.vue'

describe('TableHead', () => {
  it('renders a th with scope=col and header typography', () => {
    const { container } = render(TableHead, { slots: { default: 'Nome' } })
    const th = container.querySelector('th')
    expect(th).not.toBeNull()
    expect(th?.getAttribute('scope')).toBe('col')
    expect(th?.className).toContain('typo-body-12-semibold')
    expect(th?.className).toContain('text-gray-700')
    expect(th?.textContent).toBe('Nome')
  })
})

describe('TableCell', () => {
  it('renders a td with body typography', () => {
    const { container } = render(TableCell, { slots: { default: 'value' } })
    const td = container.querySelector('td')
    expect(td).not.toBeNull()
    expect(td?.className).toContain('text-gray-1000')
    expect(td?.textContent).toBe('value')
  })
})
```

- [ ] **Step 2: Verify failure**

Run: `cd chatfunnel-front && npm run test:run -- Table.spec`
Expected: FAIL ("Cannot find module '../TableHead.vue'", "Cannot find module '../TableCell.vue'").

- [ ] **Step 3: Implement TableHead.vue**

```vue
<!-- chatfunnel-front/src/components/ui/table/TableHead.vue -->
<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/common/utils/cn'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <th
    data-slot="table-head"
    scope="col"
    :class="
      cn(
        'h-11 px-3 text-left align-middle typo-body-12-semibold text-gray-700',
        '[&:has([role=checkbox])]:w-11 [&:has([role=checkbox])]:px-0',
        props.class,
      )
    "
  >
    <slot />
  </th>
</template>
```

- [ ] **Step 4: Implement TableCell.vue**

```vue
<!-- chatfunnel-front/src/components/ui/table/TableCell.vue -->
<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/common/utils/cn'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <td
    data-slot="table-cell"
    :class="
      cn(
        'h-14 px-3 align-middle text-gray-1000 typo-body-13-regular',
        '[&:has([role=checkbox])]:w-11 [&:has([role=checkbox])]:px-0',
        props.class,
      )
    "
  >
    <slot />
  </td>
</template>
```

- [ ] **Step 5: Update index.ts**

Replace contents of `index.ts`:

```ts
export type { Align, DataTableColumn, DataTableEmptyAction, DataTableProps } from './types'
export { default as Table } from './Table.vue'
export { default as TableHeader } from './TableHeader.vue'
export { default as TableBody } from './TableBody.vue'
export { default as TableRow } from './TableRow.vue'
export { default as TableHead } from './TableHead.vue'
export { default as TableCell } from './TableCell.vue'
```

- [ ] **Step 6: Verify pass**

Run: `cd chatfunnel-front && npm run test:run -- Table.spec`
Expected: PASS (6/6).

- [ ] **Step 7: Commit**

```bash
git add chatfunnel-front/src/components/ui/table/TableHead.vue chatfunnel-front/src/components/ui/table/TableCell.vue chatfunnel-front/src/components/ui/table/__tests__/Table.spec.ts chatfunnel-front/src/components/ui/table/index.ts
git commit -m "feat(ui/table): add TableHead and TableCell primitives"
```

---

## Task 8: DataTable basic render (columns + rows + default cell)

**Files:**
- Create: `chatfunnel-front/src/components/ui/table/DataTable.vue`
- Create: `chatfunnel-front/src/components/ui/table/__tests__/DataTable.spec.ts`
- Modify: `chatfunnel-front/src/components/ui/table/index.ts`

- [ ] **Step 1: Write failing test**

```ts
// chatfunnel-front/src/components/ui/table/__tests__/DataTable.spec.ts
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/vue'
import DataTable from '../DataTable.vue'
import type { DataTableColumn } from '../types'

interface Row { id: number; name: string; email: string }

const rows: Row[] = [
  { id: 1, name: 'Ana Lima',    email: 'ana@x.com' },
  { id: 2, name: 'Bruno Cruz',  email: 'bruno@x.com' },
]
const columns: DataTableColumn<Row>[] = [
  { key: 'name',  label: 'Nome' },
  { key: 'email', label: 'E-mail' },
]

describe('DataTable basic render', () => {
  it('renders one header row and one data row per item', () => {
    const { container } = render(DataTable, {
      props: { columns, rows, rowKey: (r: Row) => r.id },
    })
    const headerRow = container.querySelectorAll('thead tr')
    const bodyRows = container.querySelectorAll('tbody tr')
    expect(headerRow.length).toBe(1)
    expect(bodyRows.length).toBe(2)
  })

  it('renders column labels in the header', () => {
    const { container, getByText } = render(DataTable, {
      props: { columns, rows, rowKey: (r: Row) => r.id },
    })
    expect(getByText('Nome')).not.toBeNull()
    expect(getByText('E-mail')).not.toBeNull()
    expect(container.querySelectorAll('thead th').length).toBe(2)
  })

  it('renders cell text from column key by default', () => {
    const { getByText } = render(DataTable, {
      props: { columns, rows, rowKey: (r: Row) => r.id },
    })
    expect(getByText('Ana Lima')).not.toBeNull()
    expect(getByText('bruno@x.com')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Verify failure**

Run: `cd chatfunnel-front && npm run test:run -- DataTable`
Expected: FAIL ("Cannot find module '../DataTable.vue'").

- [ ] **Step 3: Implement DataTable.vue (basic version)**

```vue
<!-- chatfunnel-front/src/components/ui/table/DataTable.vue -->
<script setup lang="ts" generic="T">
import { computed } from 'vue'
import Table from './Table.vue'
import TableHeader from './TableHeader.vue'
import TableBody from './TableBody.vue'
import TableRow from './TableRow.vue'
import TableHead from './TableHead.vue'
import TableCell from './TableCell.vue'
import type { DataTableColumn } from './types'

const props = withDefaults(
  defineProps<{
    columns: DataTableColumn<T>[]
    rows: T[]
    rowKey: (row: T) => string | number
  }>(),
  {},
)

defineSlots<{
  [key: `cell-${string}`]: (scope: { row: T; index: number }) => unknown
}>()

const widthStyle = (col: DataTableColumn<T>) => {
  if (col.width === undefined) return undefined
  if (col.width === 'fill') return { width: '100%' }
  const v = typeof col.width === 'number' ? `${col.width}px` : col.width
  return { width: v, minWidth: v }
}

const alignClass = (align?: 'left' | 'center' | 'right') => {
  if (align === 'center') return 'text-center'
  if (align === 'right') return 'text-right'
  return 'text-left'
}

const cellValue = (row: T, key: string) =>
  (row as Record<string, unknown>)[key] ?? ''
</script>

<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead
          v-for="col in props.columns"
          :key="col.key"
          :style="widthStyle(col)"
          :class="[alignClass(col.align), col.headClass]"
        >
          {{ col.label }}
        </TableHead>
      </TableRow>
    </TableHeader>

    <TableBody>
      <TableRow
        v-for="(row, index) in props.rows"
        :key="props.rowKey(row)"
      >
        <TableCell
          v-for="col in props.columns"
          :key="col.key"
          :style="widthStyle(col)"
          :class="[alignClass(col.align), col.cellClass]"
        >
          <slot :name="`cell-${col.key}`" :row="row" :index="index">
            {{ cellValue(row, col.key) }}
          </slot>
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>
</template>
```

- [ ] **Step 4: Update index.ts**

Append to `index.ts`:

```ts
export { default as DataTable } from './DataTable.vue'
```

Final `index.ts` contents:

```ts
export type { Align, DataTableColumn, DataTableEmptyAction, DataTableProps } from './types'
export { default as Table } from './Table.vue'
export { default as TableHeader } from './TableHeader.vue'
export { default as TableBody } from './TableBody.vue'
export { default as TableRow } from './TableRow.vue'
export { default as TableHead } from './TableHead.vue'
export { default as TableCell } from './TableCell.vue'
export { default as DataTable } from './DataTable.vue'
export { useTableSelection } from './useTableSelection'
```

- [ ] **Step 5: Verify pass**

Run: `cd chatfunnel-front && npm run test:run -- DataTable`
Expected: PASS (3/3).

- [ ] **Step 6: Commit**

```bash
git add chatfunnel-front/src/components/ui/table/DataTable.vue chatfunnel-front/src/components/ui/table/__tests__/DataTable.spec.ts chatfunnel-front/src/components/ui/table/index.ts
git commit -m "feat(ui/table): add DataTable with column-driven render"
```

---

## Task 9: DataTable selectable + v-model:selected

**Files:**
- Modify: `chatfunnel-front/src/components/ui/table/DataTable.vue`
- Modify: `chatfunnel-front/src/components/ui/table/__tests__/DataTable.spec.ts`

- [ ] **Step 1: Add failing tests**

Append to `DataTable.spec.ts`:

```ts
import { fireEvent } from '@testing-library/vue'

describe('DataTable selectable', () => {
  it('renders a checkbox column when selectable=true', () => {
    const { container } = render(DataTable, {
      props: { columns, rows, rowKey: (r: Row) => r.id, selectable: true },
    })
    const headCheckboxes = container.querySelectorAll('thead [role=checkbox]')
    const rowCheckboxes = container.querySelectorAll('tbody [role=checkbox]')
    expect(headCheckboxes.length).toBe(1)
    expect(rowCheckboxes.length).toBe(2)
  })

  it('emits update:selected when a row checkbox is toggled', async () => {
    const { container, emitted } = render(DataTable, {
      props: { columns, rows, rowKey: (r: Row) => r.id, selectable: true, selected: [] },
    })
    const firstRowCheckbox = container.querySelector('tbody [role=checkbox]') as HTMLElement
    await fireEvent.click(firstRowCheckbox)
    const events = emitted('update:selected') as unknown[][]
    expect(events.length).toBeGreaterThan(0)
    expect(events[events.length - 1][0]).toEqual([1])
  })

  it('emits update:selected with all ids when header checkbox is toggled', async () => {
    const { container, emitted } = render(DataTable, {
      props: { columns, rows, rowKey: (r: Row) => r.id, selectable: true, selected: [] },
    })
    const headCheckbox = container.querySelector('thead [role=checkbox]') as HTMLElement
    await fireEvent.click(headCheckbox)
    const events = emitted('update:selected') as unknown[][]
    expect(events[events.length - 1][0]).toEqual([1, 2])
  })

  it('marks selected rows with data-state=selected', () => {
    const { container } = render(DataTable, {
      props: { columns, rows, rowKey: (r: Row) => r.id, selectable: true, selected: [2] },
    })
    const bodyRows = container.querySelectorAll('tbody tr')
    expect(bodyRows[0].getAttribute('data-state')).toBeNull()
    expect(bodyRows[1].getAttribute('data-state')).toBe('selected')
  })
})
```

- [ ] **Step 2: Verify failure**

Run: `cd chatfunnel-front && npm run test:run -- DataTable`
Expected: FAIL (no checkboxes rendered).

- [ ] **Step 3: Extend DataTable.vue with selection**

Replace `<script setup>` block of `DataTable.vue`:

```vue
<script setup lang="ts" generic="T">
import { computed, toRef, watch } from 'vue'
import Table from './Table.vue'
import TableHeader from './TableHeader.vue'
import TableBody from './TableBody.vue'
import TableRow from './TableRow.vue'
import TableHead from './TableHead.vue'
import TableCell from './TableCell.vue'
import { Checkbox } from '@/components/ui/checkbox'
import { useTableSelection } from './useTableSelection'
import type { DataTableColumn } from './types'

const props = withDefaults(
  defineProps<{
    columns: DataTableColumn<T>[]
    rows: T[]
    rowKey: (row: T) => string | number
    selectable?: boolean
    selected?: (string | number)[]
  }>(),
  { selectable: false, selected: () => [] },
)

const emit = defineEmits<{
  'update:selected': [(string | number)[]]
}>()

defineSlots<{
  [key: `cell-${string}`]: (scope: { row: T; index: number }) => unknown
}>()

const rowsRef = toRef(props, 'rows')
const selection = useTableSelection<T>(rowsRef, (row) => props.rowKey(row))

watch(
  () => props.selected,
  (next) => {
    selection.selected.value = [...(next ?? [])]
  },
  { immediate: true, deep: true },
)

watch(
  selection.selected,
  (next) => {
    const a = props.selected ?? []
    const b = next
    if (a.length === b.length && a.every((v, i) => v === b[i])) return
    emit('update:selected', [...next])
  },
  { deep: true },
)

const widthStyle = (col: DataTableColumn<T>) => {
  if (col.width === undefined) return undefined
  if (col.width === 'fill') return { width: '100%' }
  const v = typeof col.width === 'number' ? `${col.width}px` : col.width
  return { width: v, minWidth: v }
}

const alignClass = (align?: 'left' | 'center' | 'right') => {
  if (align === 'center') return 'text-center'
  if (align === 'right') return 'text-right'
  return 'text-left'
}

const cellValue = (row: T, key: string) =>
  (row as Record<string, unknown>)[key] ?? ''

const headerCheckboxState = computed<boolean | 'indeterminate'>(() => {
  if (selection.isAllSelected.value) return true
  if (selection.isIndeterminate.value) return 'indeterminate'
  return false
})

const onHeaderToggle = () => selection.toggleAll()
const onRowToggle = (id: string | number) => selection.toggleRow(id)
</script>
```

Replace `<template>` block of `DataTable.vue`:

```vue
<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead v-if="props.selectable">
          <Checkbox
            role="checkbox"
            :checked="headerCheckboxState"
            aria-label="Selecionar todas as linhas"
            @update:model-value="onHeaderToggle"
          />
        </TableHead>
        <TableHead
          v-for="col in props.columns"
          :key="col.key"
          :style="widthStyle(col)"
          :class="[alignClass(col.align), col.headClass]"
        >
          {{ col.label }}
        </TableHead>
      </TableRow>
    </TableHeader>

    <TableBody>
      <TableRow
        v-for="(row, index) in props.rows"
        :key="props.rowKey(row)"
        :selected="selection.isSelected(props.rowKey(row))"
      >
        <TableCell v-if="props.selectable" @click.stop>
          <Checkbox
            role="checkbox"
            :checked="selection.isSelected(props.rowKey(row))"
            :aria-label="`Selecionar linha ${index + 1}`"
            @update:model-value="onRowToggle(props.rowKey(row))"
          />
        </TableCell>
        <TableCell
          v-for="col in props.columns"
          :key="col.key"
          :style="widthStyle(col)"
          :class="[alignClass(col.align), col.cellClass]"
        >
          <slot :name="`cell-${col.key}`" :row="row" :index="index">
            {{ cellValue(row, col.key) }}
          </slot>
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>
</template>
```

- [ ] **Step 4: Verify pass**

Run: `cd chatfunnel-front && npm run test:run -- DataTable`
Expected: PASS (7/7 — 3 from Task 8 + 4 new).

- [ ] **Step 5: Commit**

```bash
git add chatfunnel-front/src/components/ui/table/DataTable.vue chatfunnel-front/src/components/ui/table/__tests__/DataTable.spec.ts
git commit -m "feat(ui/table): add selection with v-model:selected"
```

---

## Task 10: DataTable loading state

**Files:**
- Modify: `chatfunnel-front/src/components/ui/table/DataTable.vue`
- Modify: `chatfunnel-front/src/components/ui/table/__tests__/DataTable.spec.ts`

- [ ] **Step 1: Add failing tests**

Append to `DataTable.spec.ts`:

```ts
describe('DataTable loading', () => {
  it('renders skeleton rows when loading=true', () => {
    const { container } = render(DataTable, {
      props: { columns, rows, rowKey: (r: Row) => r.id, loading: true, loadingRows: 4 },
    })
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]')
    const dataRows = container.querySelectorAll('tbody tr')
    expect(skeletons.length).toBeGreaterThanOrEqual(4)
    expect(dataRows.length).toBe(4)
  })

  it('uses 5 skeleton rows by default', () => {
    const { container } = render(DataTable, {
      props: { columns, rows, rowKey: (r: Row) => r.id, loading: true },
    })
    const dataRows = container.querySelectorAll('tbody tr')
    expect(dataRows.length).toBe(5)
  })

  it('does not render real data rows while loading', () => {
    const { queryByText } = render(DataTable, {
      props: { columns, rows, rowKey: (r: Row) => r.id, loading: true },
    })
    expect(queryByText('Ana Lima')).toBeNull()
  })
})
```

- [ ] **Step 2: Verify failure**

Run: `cd chatfunnel-front && npm run test:run -- DataTable`
Expected: FAIL (real data rendered, no skeletons).

- [ ] **Step 3: Add Skeleton import and loading branch**

In `DataTable.vue`, add to imports inside `<script setup>`:

```ts
import { Skeleton } from '@/components/ui/skeleton'
```

Add to props (inside the `withDefaults(defineProps<...>(), {...})`):

```ts
    loading?: boolean
    loadingRows?: number
```

And update defaults:

```ts
  { selectable: false, selected: () => [], loading: false, loadingRows: 5 },
```

Replace the `<TableBody>` block in template with the loading-aware version:

```vue
    <TableBody>
      <template v-if="props.loading">
        <TableRow v-for="i in props.loadingRows" :key="`sk-${i}`">
          <TableCell v-if="props.selectable">
            <Skeleton class="size-4 rounded-cf-sm" />
          </TableCell>
          <TableCell
            v-for="col in props.columns"
            :key="col.key"
            :style="widthStyle(col)"
          >
            <Skeleton class="h-4 w-3/4 rounded-cf-sm" />
          </TableCell>
        </TableRow>
      </template>

      <template v-else>
        <TableRow
          v-for="(row, index) in props.rows"
          :key="props.rowKey(row)"
          :selected="selection.isSelected(props.rowKey(row))"
        >
          <TableCell v-if="props.selectable" @click.stop>
            <Checkbox
              role="checkbox"
              :checked="selection.isSelected(props.rowKey(row))"
              :aria-label="`Selecionar linha ${index + 1}`"
              @update:model-value="onRowToggle(props.rowKey(row))"
            />
          </TableCell>
          <TableCell
            v-for="col in props.columns"
            :key="col.key"
            :style="widthStyle(col)"
            :class="[alignClass(col.align), col.cellClass]"
          >
            <slot :name="`cell-${col.key}`" :row="row" :index="index">
              {{ cellValue(row, col.key) }}
            </slot>
          </TableCell>
        </TableRow>
      </template>
    </TableBody>
```

- [ ] **Step 4: Verify pass**

Run: `cd chatfunnel-front && npm run test:run -- DataTable`
Expected: PASS (10/10).

- [ ] **Step 5: Commit**

```bash
git add chatfunnel-front/src/components/ui/table/DataTable.vue chatfunnel-front/src/components/ui/table/__tests__/DataTable.spec.ts
git commit -m "feat(ui/table): add loading state with skeleton rows"
```

---

## Task 11: DataTable empty state (default + slot override)

**Files:**
- Modify: `chatfunnel-front/src/components/ui/table/DataTable.vue`
- Modify: `chatfunnel-front/src/components/ui/table/__tests__/DataTable.spec.ts`

- [ ] **Step 1: Add failing tests**

Append to `DataTable.spec.ts`:

```ts
import { h } from 'vue'

describe('DataTable empty', () => {
  it('renders default empty state when rows are empty', () => {
    const { getByText } = render(DataTable, {
      props: {
        columns,
        rows: [],
        rowKey: (r: Row) => r.id,
        emptyTitle: 'Nada por aqui ainda',
        emptyDescription: 'Crie sua primeira credencial.',
      },
    })
    expect(getByText('Nada por aqui ainda')).not.toBeNull()
    expect(getByText('Crie sua primeira credencial.')).not.toBeNull()
  })

  it('renders empty slot override when provided', () => {
    const { getByText, queryByText } = render(DataTable, {
      props: { columns, rows: [], rowKey: (r: Row) => r.id },
      slots: { empty: '<div>Customizado</div>' },
    })
    expect(getByText('Customizado')).not.toBeNull()
    expect(queryByText('Nada por aqui ainda')).toBeNull()
  })

  it('does not render data rows or empty when loading', () => {
    const { queryByText } = render(DataTable, {
      props: {
        columns,
        rows: [],
        rowKey: (r: Row) => r.id,
        loading: true,
        emptyTitle: 'Nada por aqui',
      },
    })
    expect(queryByText('Nada por aqui')).toBeNull()
  })
})
```

- [ ] **Step 2: Verify failure**

Run: `cd chatfunnel-front && npm run test:run -- DataTable`
Expected: FAIL (no empty state branch).

- [ ] **Step 3: Add empty state branch**

In `DataTable.vue` `<script setup>` add to imports:

```ts
import { PhInbox } from '@phosphor-icons/vue'
import type { Component } from 'vue'
```

Extend `defineProps`:

```ts
    emptyTitle?: string
    emptyDescription?: string
    emptyIcon?: Component
```

Update defaults:

```ts
  { selectable: false, selected: () => [], loading: false, loadingRows: 5, emptyTitle: 'Nada por aqui ainda', emptyDescription: '' },
```

Compute total columns count for `colspan`:

```ts
const totalCols = computed(
  () => props.columns.length + (props.selectable ? 1 : 0),
)
```

Extend `defineSlots`:

```ts
defineSlots<{
  empty?: () => unknown
  'empty-action'?: () => unknown
  [key: `cell-${string}`]: (scope: { row: T; index: number }) => unknown
}>()
```

In the template `<TableBody>`, add an empty-state branch between loading and data:

```vue
    <TableBody>
      <template v-if="props.loading">
        <!-- loading rows from Task 10, unchanged -->
        <TableRow v-for="i in props.loadingRows" :key="`sk-${i}`">
          <TableCell v-if="props.selectable">
            <Skeleton class="size-4 rounded-cf-sm" />
          </TableCell>
          <TableCell
            v-for="col in props.columns"
            :key="col.key"
            :style="widthStyle(col)"
          >
            <Skeleton class="h-4 w-3/4 rounded-cf-sm" />
          </TableCell>
        </TableRow>
      </template>

      <template v-else-if="props.rows.length === 0">
        <TableRow>
          <TableCell :colspan="totalCols" class="!h-auto">
            <slot name="empty">
              <div class="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <component
                  :is="props.emptyIcon ?? PhInbox"
                  :size="40"
                  class="text-gray-600"
                />
                <div class="flex flex-col gap-1">
                  <p class="typo-body-14-bold text-gray-1000">{{ props.emptyTitle }}</p>
                  <p v-if="props.emptyDescription" class="typo-body-13-regular text-gray-700">
                    {{ props.emptyDescription }}
                  </p>
                </div>
                <slot name="empty-action" />
              </div>
            </slot>
          </TableCell>
        </TableRow>
      </template>

      <template v-else>
        <!-- data rows from Task 10, unchanged -->
        <TableRow
          v-for="(row, index) in props.rows"
          :key="props.rowKey(row)"
          :selected="selection.isSelected(props.rowKey(row))"
        >
          <TableCell v-if="props.selectable" @click.stop>
            <Checkbox
              role="checkbox"
              :checked="selection.isSelected(props.rowKey(row))"
              :aria-label="`Selecionar linha ${index + 1}`"
              @update:model-value="onRowToggle(props.rowKey(row))"
            />
          </TableCell>
          <TableCell
            v-for="col in props.columns"
            :key="col.key"
            :style="widthStyle(col)"
            :class="[alignClass(col.align), col.cellClass]"
          >
            <slot :name="`cell-${col.key}`" :row="row" :index="index">
              {{ cellValue(row, col.key) }}
            </slot>
          </TableCell>
        </TableRow>
      </template>
    </TableBody>
```

Note: TableCell's height is locked to `h-14`. The empty state needs `!h-auto` to override (Tailwind v4 syntax — `!` at the end).

- [ ] **Step 4: Verify pass**

Run: `cd chatfunnel-front && npm run test:run -- DataTable`
Expected: PASS (13/13).

- [ ] **Step 5: Commit**

```bash
git add chatfunnel-front/src/components/ui/table/DataTable.vue chatfunnel-front/src/components/ui/table/__tests__/DataTable.spec.ts
git commit -m "feat(ui/table): add empty state with default and slot override"
```

---

## Task 12: DataTable rowClickable + density + row-click event

**Files:**
- Modify: `chatfunnel-front/src/components/ui/table/DataTable.vue`
- Modify: `chatfunnel-front/src/components/ui/table/__tests__/DataTable.spec.ts`

- [ ] **Step 1: Add failing tests**

Append to `DataTable.spec.ts`:

```ts
describe('DataTable rowClickable', () => {
  it('emits row-click with row payload when rowClickable=true', async () => {
    const { container, emitted } = render(DataTable, {
      props: { columns, rows, rowKey: (r: Row) => r.id, rowClickable: true },
    })
    const firstRow = container.querySelector('tbody tr') as HTMLElement
    await fireEvent.click(firstRow)
    const events = emitted('row-click') as unknown[][]
    expect(events.length).toBe(1)
    expect(events[0][0]).toEqual(rows[0])
  })

  it('does not emit row-click when rowClickable is false', async () => {
    const { container, emitted } = render(DataTable, {
      props: { columns, rows, rowKey: (r: Row) => r.id },
    })
    const firstRow = container.querySelector('tbody tr') as HTMLElement
    await fireEvent.click(firstRow)
    expect(emitted('row-click')).toBeUndefined()
  })

  it('applies compact row height when density=compact', () => {
    const { container } = render(DataTable, {
      props: { columns, rows, rowKey: (r: Row) => r.id, density: 'compact' },
    })
    const cells = container.querySelectorAll('tbody td')
    expect(cells[0].className).toContain('!h-11')
  })
})
```

- [ ] **Step 2: Verify failure**

Run: `cd chatfunnel-front && npm run test:run -- DataTable`
Expected: FAIL (no row-click emit, no density class).

- [ ] **Step 3: Extend DataTable**

In `DataTable.vue`, extend `defineProps`:

```ts
    rowClickable?: boolean
    density?: 'compact' | 'comfortable'
```

Update defaults:

```ts
  { selectable: false, selected: () => [], loading: false, loadingRows: 5, emptyTitle: 'Nada por aqui ainda', emptyDescription: '', rowClickable: false, density: 'comfortable' },
```

Extend `defineEmits`:

```ts
const emit = defineEmits<{
  'update:selected': [(string | number)[]]
  'row-click': [T]
}>()
```

Add row click handler and density class helper:

```ts
const onRowClick = (row: T) => {
  if (!props.rowClickable) return
  emit('row-click', row)
}

const densityCellClass = computed(() =>
  props.density === 'compact' ? '!h-11' : '',
)
```

Update the data row in `<template>` to bind `clickable`, click handler, and density class on cells:

```vue
        <TableRow
          v-for="(row, index) in props.rows"
          :key="props.rowKey(row)"
          :selected="selection.isSelected(props.rowKey(row))"
          :clickable="props.rowClickable"
          @click="onRowClick(row)"
        >
          <TableCell v-if="props.selectable" :class="densityCellClass" @click.stop>
            <Checkbox
              role="checkbox"
              :checked="selection.isSelected(props.rowKey(row))"
              :aria-label="`Selecionar linha ${index + 1}`"
              @update:model-value="onRowToggle(props.rowKey(row))"
            />
          </TableCell>
          <TableCell
            v-for="col in props.columns"
            :key="col.key"
            :style="widthStyle(col)"
            :class="[alignClass(col.align), col.cellClass, densityCellClass]"
          >
            <slot :name="`cell-${col.key}`" :row="row" :index="index">
              {{ cellValue(row, col.key) }}
            </slot>
          </TableCell>
        </TableRow>
```

- [ ] **Step 4: Verify pass**

Run: `cd chatfunnel-front && npm run test:run -- DataTable`
Expected: PASS (16/16).

- [ ] **Step 5: Commit**

```bash
git add chatfunnel-front/src/components/ui/table/DataTable.vue chatfunnel-front/src/components/ui/table/__tests__/DataTable.spec.ts
git commit -m "feat(ui/table): add rowClickable event and density variant"
```

---

## Task 13: DataTable cell-{key} slot override

**Files:**
- Modify: `chatfunnel-front/src/components/ui/table/__tests__/DataTable.spec.ts`

The slot is already rendered (Task 8). Add an explicit test to lock behavior.

- [ ] **Step 1: Add failing-then-passing test**

Append to `DataTable.spec.ts`:

```ts
describe('DataTable cell slots', () => {
  it('renders cell-{key} slot override and exposes row+index', () => {
    const { container } = render(DataTable, {
      props: { columns, rows, rowKey: (r: Row) => r.id },
      slots: {
        'cell-name': '<template #cell-name="{ row, index }"><b data-test="custom-name">#{{ index }} {{ row.name }}</b></template>',
      },
    })
    const customs = container.querySelectorAll('[data-test="custom-name"]')
    expect(customs.length).toBe(2)
    expect(customs[0].textContent).toBe('#0 Ana Lima')
    expect(customs[1].textContent).toBe('#1 Bruno Cruz')
  })
})
```

- [ ] **Step 2: Run test**

Run: `cd chatfunnel-front && npm run test:run -- DataTable`
Expected: PASS (17/17). The slot already works from Task 8 — this test serves as a regression guard.

- [ ] **Step 3: Commit**

```bash
git add chatfunnel-front/src/components/ui/table/__tests__/DataTable.spec.ts
git commit -m "test(ui/table): lock cell-{key} slot contract"
```

---

## Task 14: Final integration sweep — typecheck, lint, full suite

**Files:**
- Verify only.

- [ ] **Step 1: Run typecheck**

Run: `cd chatfunnel-front && npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 2: Run lint**

Run: `cd chatfunnel-front && npm run lint`
Expected: PASS (no errors). If lint complains, fix inline (formatting only — no logic changes).

- [ ] **Step 3: Run full test suite**

Run: `cd chatfunnel-front && npm run test:run`
Expected: PASS (existing suite + 17 new tests).

- [ ] **Step 4: Visual sanity check**

Manually compare a quick prototype usage against the mockup frame `02 - Form Nova chave API` (card "Permissões") in `vault/prototipos/credenciais-unification.pen`. Build a temporary playground component:

```vue
<!-- chatfunnel-front/src/views/playground/TablePlayground.vue (temporary) -->
<script setup lang="ts">
import { ref } from 'vue'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataTable, type DataTableColumn } from '@/components/ui/table'

interface Row { id: string; name: string; description: string }
const rows: Row[] = [
  { id: 'msg', name: 'Mensagens', description: 'Enviar e receber mensagens em conversas existentes.' },
  { id: 'conv', name: 'Conversas', description: 'Listar e abrir conversas do livechat.' },
  { id: 'webhook', name: 'Webhooks', description: 'Receber notificações de eventos via webhooks.' },
]
const columns: DataTableColumn<Row>[] = [
  { key: 'name', label: 'Permissão', width: 240 },
  { key: 'description', label: 'Descrição' },
]
const selected = ref<(string | number)[]>(['msg', 'webhook'])
</script>

<template>
  <div class="p-10">
    <Card class="overflow-hidden rounded-cf-xl border-gray-400 p-0">
      <CardHeader class="flex flex-row items-start justify-between gap-4 border-b border-gray-400 p-6">
        <div class="flex flex-col gap-1">
          <CardTitle class="typo-body-16-bold text-gray-1000">Permissões</CardTitle>
          <CardDescription class="typo-body-13-regular text-gray-700">
            Selecione quais recursos da API esta chave pode acessar.
          </CardDescription>
        </div>
        <Badge v-if="selected.length" color="brand" hierarchy="agent" shape="pill" size="xs">
          {{ selected.length }}
          {{ selected.length === 1 ? 'selecionada' : 'selecionadas' }}
        </Badge>
      </CardHeader>
      <DataTable
        :columns="columns"
        :rows="rows"
        :row-key="(r) => r.id"
        v-model:selected="selected"
        selectable
      />
    </Card>
  </div>
</template>
```

Wire a temporary route in `chatfunnel-front/src/router/index.js` pointing to this playground (path: `/playground/table`), run `npm run dev`, and visually compare against the mockup PNG `vault/prototipos/credenciais-02-form-api-key.png`.

After visual confirmation, **delete** `TablePlayground.vue` and the temporary route — they are not part of the deliverable.

- [ ] **Step 5: Commit (only if any fixes were needed)**

If lint/typecheck required fixes, commit them:

```bash
git add chatfunnel-front/src/components/ui/table/
git commit -m "chore(ui/table): apply lint and typecheck fixes"
```

If no fixes were needed, no commit in this task.

---

## Self-Review

**Spec coverage check** (cross-reference against `docs/superpowers/specs/2026-04-27-table-component-design.md`):

| Spec section | Plan task |
|---|---|
| §3 file structure | Task 1 (types/index) + tasks 4-8 (primitives) + 8-13 (DataTable) |
| §4.1 Table | Task 4 |
| §4.2 TableHeader (`bg-gray-200`) | Task 5 |
| §4.3 TableBody | Task 5 |
| §4.4 TableRow (selected, clickable) | Task 6 |
| §4.5 TableHead (typography, checkbox col width) | Task 7 |
| §4.6 TableCell (typography, checkbox col width) | Task 7 |
| §5.1 DataTable API (props/types) | Task 1 (types) + tasks 8-12 (props gradually) |
| §5.2 slots (cell-{key}, empty, empty-action) | Task 8 (cell), Task 11 (empty/empty-action), Task 13 (lock cell slot) |
| §5.3 events (update:selected, row-click) | Task 9, Task 12 |
| §5.4 selection behavior | Task 9 |
| §5.4 loading | Task 10 |
| §5.4 empty | Task 11 |
| §5.4 density | Task 12 |
| §5.5 implementation skeleton | Tasks 8-12 implement progressively |
| §5.6 column width logic | Task 8 (`widthStyle` helper) |
| §6 useTableSelection | Tasks 2-3 |
| §7 accessibility (aria-label, scope=col, data-state) | Task 6, 7, 9 |
| §8 Phosphor icons (PhInbox empty) | Task 11 |
| §9 testing | Tasks 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13 |
| §10 no legacy migration | enforced by scope |
| §11 composition example | Task 14 (visual sanity playground uses Card + DataTable + Badge) |
| §12 acceptance | Task 14 |

No gaps detected.

**Placeholder scan:** No "TBD", "TODO", "implement later", "appropriate error handling", "similar to Task N", or undefined symbols. Every code step has actual code.

**Type consistency check:**
- `DataTableColumn<T>` defined in Task 1, used identically in Tasks 8-13.
- `useTableSelection` returns `selected, isSelected, isAllSelected, isIndeterminate, toggleRow, toggleAll, reset` — same names used in DataTable consumer (Tasks 9, 12).
- `selected` event payload `(string | number)[]` consistent across props, emit, and consumer wiring.
- `density` values `'compact' | 'comfortable'` match in spec, types, and Task 12.

No inconsistencies found.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-27-table-component.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
