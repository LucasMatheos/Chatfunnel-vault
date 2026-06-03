---
tipo: review
escopo: chatfunnel-front/src/components/ui/table
data: 2026-04-27
last_updated: 2026-04-28
related: ["[[../features/credenciais-page|Credenciais Page]]"]
---

# Review UI/UX — components/ui/table

Avaliacao com base no UI/UX Pro Max (Quick Reference §1–§10) e nas regras `chatfunnel-front` + `10-frontend-design-quality.md`.

Arquivos: `Table.vue`, `TableHeader.vue`, `TableHead.vue`, `TableBody.vue`, `TableRow.vue`, `TableCell.vue`, `DataTable.vue`, `useTableSelection.ts`, `types.ts`.

## TL;DR

Base shadcn esta solida e tipada, com selection composable e empty/loading/density bem desenhados. Faltam **acessibilidade de teclado em rows clicaveis**, **estilo visual do estado `selected`** (atributo seteado mas sem CSS), **overflow horizontal em mobile**, e capacidades essenciais de uma DataTable de producao (sort, paginacao, virtualizacao, sticky header).

---

## 1. Acessibilidade (CRITICAL)

### Bugs

- **`data-state="selected"` sem estilo visual** — `TableRow.vue` seta o atributo mas nenhum seletor CSS o estiliza. Linha selecionada nao muda de cor; so o checkbox indica selecao. (`color-not-only`, `state-clarity`)
- **`rowClickable` nao e teclado-acessivel** — `<tr>` recebe `cursor-pointer` + `@click` mas nao tem `tabindex="0"`, `role="button"`, nem handler de `Enter`/`Space`. Usuarios de teclado/leitor de tela nao conseguem ativar a linha. (`keyboard-nav`, `focus-states`)
- **Sem `:focus-visible`** em `TableRow` clicavel — falta anel de foco. (`focus-states`)

### Pontos positivos

- `<th scope="col">` correto em `TableHead.vue:11`.
- `aria-label` nos checkboxes (header e linha) com mensagens em pt-BR.
- `@click.stop` no cell de checkbox (`DataTable.vue:179`) evita disparar `row-click`.

### Risco menor

- `role="checkbox"` forcado no `<Checkbox>` (`DataTable.vue:116, 181`) — o `Checkbox` da Reka UI ja entrega o role correto, redundante e potencialmente conflitante com `aria-checked` indeterminate.

---

## 2. Touch & Interaction (CRITICAL)

- Cabecalho `h-11` (44px); Cells `h-14` (56px) — tap targets suficientes.
- Header checkbox cell tem `[&:has([role=checkbox])]:w-11 :px-0` — area total 44x44, mas o checkbox interno e ~16px. Como o `<th>`/`<td>` nao e interativo, o tap real depende do tamanho do `<Checkbox>`. Avaliar `hitSlop` ou `flex items-center justify-center` no cell para centralizar.
- `cursor-pointer` aparece apenas com `clickable`.
- Sem feedback `:active` (regra `10-frontend-design-quality.md`: `scale-95` ou `-translate-y-px` em interativos).

---

## 3. Performance (HIGH)

- **Sem virtualizacao**. `vue3-virtual-scroller` ja esta no `package.json` mas o `DataTable` renderiza todas as rows. Para listas 50+ a regra `virtualize-lists` aplica.
- `headerCheckboxState`, `widthStyle`, `densityCellClass` sao baratos.
- `selectedSet` em `useTableSelection.ts:9` usa `Set` para O(1) lookup.
- `watch(props.selected, …, { deep: true })` em conjunto com `watch(selection.selected, … deep: true)` cria potencial loop; o guard de igualdade na linha 71 quebra o ciclo, mas a comparacao por `every` posicional falha se a ordem mudar (re-emite snapshots iguais por conteudo). Considerar comparar por `Set`.

---

## 4. Style Selection (HIGH)

- Visual condiz com shadcn-vue + tokens `gray-*`/`typo-*`.
- **Borda artificial via `TableBody`** — pinta `bg-gray-100` em todos os `<td>` e cria borda esquerda/direita/`rounded-b` no ultimo `<tr>`. Conflitos:
  - rows 0 (empty state ocupa um `<tr>` unico) → primeiro = ultimo, ganha `rounded-bl + rounded-br` simultaneo, mas tambem `border-l + border-r` sem arredondar topo → cantos superiores quadrados em estado vazio.
  - loading skeleton — mesmo problema.
- Falta arredondamento superior (`rounded-t`) — header nao casa com o body arredondado embaixo.
- Sem sombra/elevation. Em dashboards densos OK (regra: preferir `border` a card), mas confirmar com brand-guidelines.

---

## 5. Layout & Responsive (HIGH)

- `Table.vue` envolve com `<div class="relative w-full">` mas **sem `overflow-x-auto`**. Em mobile, colunas com `width` fixo causam overflow lateral da pagina inteira. (`horizontal-scroll`)
- **Sem `sticky` no header** — em listas longas o `<thead>` rola junto com o body, perde contexto. Adicionar `sticky top-0 bg-white z-10` em `TableHead`.
- Sem estrategia mobile alternativa (cards/list view). Documentar quando NAO usar tabela em mobile.

---

## 6. Typography & Color (MEDIUM)

- Tokens `typo-body-12-semibold`/`typo-body-13-regular` corretos.
- **Numeros**: `cellValue()` retorna conteudo cru. Falta utilidade `tabular-nums`/`font-mono` para colunas numericas (regra `number-tabular` + frontend-design-quality).
- **Truncation**: nao ha estrategia. Conteudo longo quebra linha sem aviso. Adicionar prop `truncate?: boolean` por coluna com `whitespace-nowrap overflow-hidden text-ellipsis` + tooltip.
- Cor `text-gray-700` em header e `text-gray-1000` em body — verificar contraste 4.5:1 contra `gray-100`.

---

## 7. Animation (MEDIUM)

- `transition-colors` no `TableRow`, duracao default ~150ms ok.
- Sem `prefers-reduced-motion` (token global ja deve cobrir, mas confirmar).

---

## 8. Forms & Feedback (MEDIUM)

- **Loading skeleton** espelha layout (regra projeto OK).
- **Empty state** com `PhTray` + titulo + descricao + slot `empty-action` — bem feito.
- Falta **error state** — `DataTable` nao expoe prop `error` nem slot. Hoje quem consome trata fora; documentar ou adicionar.

---

## 9. Navigation Patterns (HIGH)

- N/A — componente atomico.

---

## 10. Charts & Data (LOW) — capacidades ausentes para DataTable de producao

| Feature | Status | Prioridade |
|---|---|---|
| Sort por coluna | ausente | Alta |
| Paginacao server/client | ausente | Alta |
| Virtualizacao | ausente (lib disponivel) | Media |
| Sticky header | ausente | Alta |
| Sticky column (left) | ausente | Baixa |
| Resizable columns | ausente | Baixa |
| Filtro por coluna | ausente | Media |
| Bulk actions bar (quando selected.length > 0) | ausente | Media |
| Ordenacao estavel via `aria-sort` | ausente | Alta (a11y) |
| Export CSV | ausente | Baixa |

---

## Bugs/issues priorizados

**P0 (bug)**
1. `data-state="selected"` sem CSS — selecao invisivel.
2. `rowClickable` sem suporte a teclado/foco.

**P1 (a11y/responsive)**
3. Falta `overflow-x-auto` no wrapper.
4. Falta sticky header.
5. Sem `:focus-visible` em rows clicaveis.

**P2 (capacidade)**
6. Sem sort/`aria-sort`.
7. Sem paginacao.
8. Sem virtualizacao (lib ja existe).
9. Sem error state.
10. Sem truncation por coluna + tooltip.

**P3 (polish)**
11. `border + rounded` artificiais no `TableBody` quebram em empty/loading.
12. `role="checkbox"` redundante nos `<Checkbox>`.
13. Comparacao posicional em `watch(selection.selected)` pode re-emitir desnecessariamente.

---

## Sugestoes pontuais

- `TableRow.vue` quando `clickable`:
  - `tabindex="0"`, `role="button"`, `@keydown.enter.prevent`/`@keydown.space.prevent` chamando o handler.
  - classes `data-[state=selected]:bg-cf-teal/10 focus-visible:ring-2 focus-visible:ring-cf-teal/40`.
- `Table.vue` mudar wrapper para `class="relative w-full overflow-x-auto"`.
- `TableHead.vue` aceitar prop `sticky?: boolean` → `sticky top-0 bg-white z-10`.
- `DataTableColumn` extender com `sortable?`, `truncate?`, `numeric?`.
- Adicionar slot `error` analogo ao `empty`.

## Bom

- API tipada (`DataTableColumn<T>`, generics).
- `density` com `compact|comfortable`.
- Slots por coluna (`cell-${key}`) e por estado (`empty`, `empty-action`).
- `useTableSelection` desacoplado e testavel.
- Empty/loading defaults em pt-BR com acentos.

---

## Patterns aplicados (28-04-2026)

Padroes que surgiram durante a implementacao da [[../features/credenciais-page|Credenciais Page]] e ja estao em producao em `APIKeysTable.vue` / `McpTokensTable.vue`. Servem como referencia para outras tabelas.

### Centralizacao do checkbox (header + row)

`DataTable.vue` agora usa `flex! items-center justify-center` nas duas celulas do checkbox.

```vue
<!-- TableHead do header -->
<TableHead class="flex! items-center justify-center w-11 px-0">
  <Checkbox ... />
</TableHead>

<!-- TableCell de cada row -->
<TableCell class="flex! items-center justify-center w-11 px-0" @click.stop>
  <Checkbox ... />
</TableCell>
```

**Tailwind v4 detail**: o `!important` agora vai no FINAL do utilitario (`flex!`, nao `!flex`). Necessario porque `<th>`/`<td>` tem `display: table-cell` por default no user-agent — sem `!important` o flex nao prevalece.

### Coluna com lista de valores → tooltip Reka

Para coluna que renderiza lista (ex: permissoes), o pattern aprovado foi:
1. Mostrar inline na celula apenas as primeiras `N_PREVIEW` entradas (ex: 2-3).
2. Tooltip Reka com hover nativo expondo o restante (filtrar a preview ja visivel).
3. Sem `<ul>` — usar `flex flex-col gap-1` direto no `<TooltipContent>` (sem bullets).

Iteracoes descartadas durante o design:
- **Lista vertical inline**: rows ficaram grandes demais (50px+).
- **Popover (Reka)**: nao abria com `@click.stop` no `<button>` — wrappar em `<span @click.stop>` resolveu, mas hover ficou inferior a UX do tooltip.
- **Popover sem stop**: row-click disparava junto.

```vue
<template #cell-permissions="{ row }">
  <div class="flex items-center gap-1.5 min-w-0 max-w-full">
    <span v-for="perm in row.permissions.slice(0, PERMISSIONS_PREVIEW_COUNT)">...</span>
    <Tooltip v-if="row.permissions.length > PERMISSIONS_PREVIEW_COUNT">
      <TooltipTrigger as-child>
        <Badge>+{{ row.permissions.length - PERMISSIONS_PREVIEW_COUNT }}</Badge>
      </TooltipTrigger>
      <TooltipContent class="flex flex-col gap-1 list-none p-0">
        <span v-for="perm in row.permissions.slice(PERMISSIONS_PREVIEW_COUNT)">...</span>
      </TooltipContent>
    </Tooltip>
  </div>
</template>
```

### Fix scroll-x: `min-w-0 max-w-full` no flex container

Coluna com conteudo wide (lista de permissoes, datas longas) estourava o tamanho da tabela e gerava scroll horizontal global. Causa: filhos de `flex` tem `min-width: auto` por default — nao encolhem abaixo do tamanho intrinseco.

**Fix**: aplicar `min-w-0 max-w-full` no flex container interno da celula.

### Formatacao de data (NAO use `vue-i18n` `d()`)

`d()` retorna string vazia sem `datetimeFormats` configurado. Use:
- `Intl.DateTimeFormat('pt-BR').format(new Date(iso))` para formato simples
- `date-fns` + `ptBR` para formato custom

Ver gotcha em [[../gotchas/frontend-gotchas|Frontend Gotchas]].
