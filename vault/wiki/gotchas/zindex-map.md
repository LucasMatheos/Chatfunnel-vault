---
title: Mapa de z-index — components/ui
description: Levantamento completo dos z-index hardcoded nos componentes ui/ do chatfunnel-front, com diagnóstico de inconsistências.
tags: [gotcha, frontend, z-index, dialog, popover, tailwind]
severity: media
related: ["[[frontend-gotchas]]", "[[chatfunnel-front]]"]
last_updated: 2026-06-29
---

# Mapa de z-index — components/ui

> Levantamento feito em 2026-06-29. Os valores são hardcoded (sem escala sistêmica) — a camada Dialog tem z-index variando de `1000` a `9999999999`. Qualquer overlay/popup dentro de um Dialog precisa atenção especial.

## Tabela de valores

| Componente | Arquivo | Elemento | z-index | Observação |
|---|---|---|---|---|
| **Dialog** | `Dialog.vue` | `DialogRoot` | `9999999999` | Reka root, provavelmente não renderiza o z-index |
| **Dialog** | `DialogContent.vue` | overlay (backdrop) | `99999999` | Sobrepõe tudo; overrideable via prop `overlayClass` |
| **Dialog** | `DialogContent.vue` (index.ts) | painel do conteúdo | `99999` | Classe base no `cva` variants |
| **Dialog** | `DialogBody.vue` | body scroll container | `99999` | Igual ao painel |
| **Dialog** | `DialogOverlay.vue` | overlay (versão antiga) | `1000` | Arquivo legado — usar `DialogContent` |
| **Dialog** | `DialogScrollContent.vue` | overlay | `1000` | Variante scroll |
| **Dialog** | `DialogScrollContent.vue` | painel | `1001` | Variante scroll |
| **AlertDialog** | `AlertDialogContent.vue` | overlay | `9999999` | Abaixo do Dialog overlay |
| **AlertDialog** | `index.ts` | conteúdo | `9999999` | Igual ao overlay |
| **DropdownMenu** | `index.ts` | conteúdo | `9999999` | Mesmo nível do AlertDialog |
| **DropdownMenu** | `DropdownMenuSubContent.vue` | sub-menu | `1000` | Inconsistente — muito baixo vs. o pai |
| **ColorPicker** | `ColorPicker.vue` | popover | `99999` | Funciona dentro de Dialog (abaixo do overlay) |
| **ColorPicker** | `ColorPickerDot.vue` | popover | `99999` | Idem |
| **Popover** | `PopoverContent.vue` | conteúdo | `50` | **Base shadcn — baixo demais para uso dentro de Dialog** |
| **Select** | `SelectContent.vue` | dropdown | `50` | Base shadcn — mesma situação do Popover |
| **Select** | `SelectControl.vue` | dropdown custom | `999999999999999999` | 18 dígitos — valor mais alto do codebase |
| **InputDate** | `InputDateControl.vue` | calendário popover | `999999999999` | 12 dígitos — padrão adotado para floats dentro de Dialog |
| **InputDateTime** | `InputDateTimeControl.vue` | calendário popover | `999999999999` | Idem |
| **InputPhone** | `InputPhone.vue` | dropdown de países | `999999` | 6 dígitos |
| **Tooltip** | `TooltipContent.vue` | tooltip | `1000` | Funciona acima de Vuetify (z-900) |
| **Tooltip** | `TooltipContent.vue` | seta do tooltip | `1000` | Idem |
| **Table** | `TableHead.vue` | cabeçalho sticky | `10` | Local, não conflita |
| **Calendar** | `CalendarCell.vue` | foco de célula | `20` | `focus-within`, local |

## Hierarquia real (ordem crescente)

```
z-10       → TableHead sticky
z-20       → CalendarCell focus
z-50       → PopoverContent base, SelectContent base  ← TOO LOW inside Dialog
z-[1000]   → DialogOverlay (legado), DialogScrollContent, DropdownMenuSubContent, Tooltip
z-[1001]   → DialogScrollContent painel
z-[99999]  → DialogContent painel (index.ts), DialogBody, ColorPicker
z-[999999] → InputPhone dropdown
z-[9999999]    → AlertDialog, DropdownMenu conteúdo
z-[99999999]   → DialogContent overlay (backdrop principal)
z-[9999999999] → Dialog root (provavelmente ineficaz em DialogRoot headless)
z-[999999999999]         → InputDate, InputDateTime  ← usar para floats dentro de Dialog
z-[999999999999999999]   → SelectControl             ← máximo atual
```

## Regra prática: float dentro de Dialog

Se um `Popover`, `Select` (base), `Combobox` ou outro float sumir dentro de um `<Dialog>`, adicione na classe do `*Content`:

```
z-[999999999999]
```

Esse é o valor adotado por `InputDateControl` e `InputDateTimeControl` — componentes que vivem frequentemente dentro de modais.

```vue
<!-- Correto — PopoverContent dentro de Dialog -->
<PopoverContent class="z-[999999999999] ...">
```

## Problemas conhecidos

**Popover e Select base são `z-50`** — o `PopoverContent.vue` e `SelectContent.vue` têm `z-50` como padrão herdado do shadcn. Dentro de um `Dialog` (overlay `z-[99999999]`) ficam invisíveis. Sempre sobrescrever via `class` no consumidor.

**`DropdownMenuSubContent` tem `z-[1000]` mas o pai é `z-[9999999]`** — sub-menus de dropdown ficam abaixo do conteúdo pai em certos contextos de stacking. Bug latente.

**Não existe escala sistêmica** — os valores foram adicionados ad-hoc ao longo do tempo. `SelectControl` chegou a `z-[999999999999999999]` (18 dígitos). Não há CSS custom property centralizando isso.

## Recomendação futura

Centralizar via CSS custom properties em `shadcn-vars.css`:

```css
@theme {
  --z-sticky: 10;
  --z-tooltip: 1000;
  --z-dropdown: 9999999;
  --z-dialog-overlay: 99999999;
  --z-float-in-dialog: 999999999999;
}
```

E referenciar com `z-[var(--z-float-in-dialog)]` em vez de hardcode.
