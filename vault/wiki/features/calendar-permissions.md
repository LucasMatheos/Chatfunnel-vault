---
title: Calendar Permissions
description: Sistema de permissoes granulares para o modulo Calendario — controla acesso a eventos, filtros, cores e configuracoes.
tags: [permissions, calendar, front]
related: ["[[calendar]]", "[[permissions]]"]
last_updated: 2026-04-08
---

# Calendar Permissions

## Visao Geral

O modulo `CALENDAR` possui 7 permissoes granulares que controlam cada acao do calendario. Segue o mesmo padrao de `PermissionsFactory` dos demais modulos (CRM, BROADCAST, etc.).

## Permissoes

| Permissao | O que controla |
|-----------|----------------|
| `ADD_EVENT` | Criar eventos — botao "Agendar evento", click na grid, selecao de intervalo |
| `EDIT_EVENT` | Editar eventos existentes — campos do dialog ficam read-only sem essa permissao |
| `DELETE_EVENT` | Excluir eventos — botao "Excluir" no dialog |
| `MOVE_EVENT` | Arrastar e redimensionar eventos na grid (drag & drop) |
| `FILTER_BY_COLLABORATOR_CALENDAR` | Filtrar eventos por colaborador na sidebar (checkboxes) |
| `CHANGE_COLLABORATOR_COLOR` | Alterar a cor do colaborador no calendario (color picker) |
| `CONFIGURE_GOOGLE_CALENDAR` | Acessar configuracoes de integracao Google Calendar (botao engrenagem) |

## Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `src/views/configuration/permissions/PermissionsFactory.js` | Adicionadas 8 permissoes ao array `CALENDAR` |
| `src/views/calendar/index.vue` | Importa `usePermissions`, passa props de permissao para filhos, guarda `editable`/`selectable` do FullCalendar e handlers de click |
| `src/views/calendar/components/CalendarToolbar.vue` | Props `canAddEvent`/`canConfigure`, `v-if` nos botoes |
| `src/views/calendar/components/CollaboratorsList.vue` | Props `canFilter`/`canChangeColor`, esconde checkbox e color picker conforme permissao |
| `src/views/calendar/components/EventDialog.vue` | Props `canEdit`/`canDelete`, computed `isReadOnly`, desabilita campos e esconde botoes |

## Como funciona

### Padrao de propagacao

```
index.vue (usePermissions → hasPermission)
  ├── CalendarToolbar    → canAddEvent, canConfigure
  ├── CollaboratorsList  → canFilter, canChangeColor
  └── EventDialog        → canEdit, canDelete
```

O `index.vue` tambem guarda diretamente:
- `editable` do FullCalendar → `MOVE_EVENT`
- `selectable` do FullCalendar → `ADD_EVENT`
- `handleDateClick`, `handleSelect`, `openCreateDialog` → early return se `!ADD_EVENT`

### Comportamento sem permissao

- **Sem `ADD_EVENT`**: botao "Agendar evento" desaparece, click na grid nao abre dialog, selecao de intervalo desabilitada
- **Sem `EDIT_EVENT`**: dialog abre em modo read-only (campos disabled), botao "Salvar" desaparece, "Cancelar" vira "Fechar"
- **Sem `DELETE_EVENT`**: botao "Excluir" desaparece do dialog
- **Sem `MOVE_EVENT`**: drag & drop e resize desabilitados no FullCalendar
- **Sem `FILTER_BY_COLLABORATOR_CALENDAR`**: checkboxes desaparecem, lista vira somente leitura
- **Sem `CHANGE_COLLABORATOR_COLOR`**: color picker substituido por dot estatico com a cor atual
- **Sem `CONFIGURE_GOOGLE_CALENDAR`**: botao engrenagem desaparece da toolbar
