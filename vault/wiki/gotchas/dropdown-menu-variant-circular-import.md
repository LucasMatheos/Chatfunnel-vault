---
title: DropdownMenu não deve importar variantes pelo barrel
description: Importar variantes de index.ts em componentes reexportados cria um ciclo ESM e pode deixar a função indisponível no render.
tags: [gotcha, frontend, vue, reka-ui, dropdown-menu]
severity: media
related: ["[[repos/chatfunnel-front]]", "[[frontend-gotchas]]"]
last_updated: 2026-08-25
---

# DropdownMenu não deve importar variantes pelo barrel

## O que acontece

`DropdownMenuContent` lançava `TypeError: dropdownMenuContentVariants is not a function` ao abrir um menu.

## Por que

O componente importava a variante de `index.ts`, enquanto o mesmo arquivo reexportava o componente. O ciclo ESM podia expor o binding antes da inicialização da variante.

## Workaround

Manter variantes em `src/components/ui/dropdown-menu/variants.ts` e importá-las diretamente pelos componentes. O `index.ts` deve somente reexportar a API pública.
