---
title: Guia de Teste — Calendar Permissions
description: Passo a passo para testar manualmente cada permissao do modulo Calendario.
tags: [testing, permissions, calendar, guide]
related: ["[[calendar-permissions]]"]
last_updated: 2026-04-08
---

# Guia de Teste — Calendar Permissions

## Pre-requisitos

1. Ter dois usuarios: um **admin** (todas as permissoes) e um **restrito** (sem permissoes de calendario)
2. Ir em **Configuracoes → Permissoes** e localizar o modulo **CALENDAR**
3. Para cada teste, habilitar APENAS a permissao indicada para o usuario restrito

## Teste 1 — ADD_EVENT

**Permissao:** `ADD_EVENT`

### 2a. Botao "Agendar evento"

| Passo | Acao | Esperado |
|-------|------|----------|
| 1 | Desabilitar `ADD_EVENT` | Botao "Agendar evento" NAO aparece na toolbar |
| 2 | Habilitar `ADD_EVENT` | Botao aparece e abre o dialog de criacao |

### 2b. Click na grid

| Passo | Acao | Esperado |
|-------|------|----------|
| 1 | Desabilitar `ADD_EVENT`, clicar em um horario vazio na grid | Nada acontece — dialog NAO abre |
| 2 | Habilitar `ADD_EVENT`, clicar em um horario vazio | Dialog abre com horario pre-preenchido |

### 2c. Selecao de intervalo (drag na grid)

| Passo | Acao | Esperado |
|-------|------|----------|
| 1 | Desabilitar `ADD_EVENT`, tentar arrastar para selecionar intervalo na grid | Selecao NAO e possivel (cursor normal) |
| 2 | Habilitar `ADD_EVENT`, arrastar para selecionar intervalo | Dialog abre com inicio/fim do intervalo selecionado |

---

## Teste 2 — EDIT_EVENT

**Permissao:** `EDIT_EVENT`

> Pre-requisito: ter pelo menos 1 evento criado

| Passo | Acao | Esperado |
|-------|------|----------|
| 1 | Desabilitar `EDIT_EVENT`, clicar em um evento existente | Dialog abre em modo **read-only**: todos os campos desabilitados (cinza), botao "Salvar" NAO aparece, botao diz "Fechar" em vez de "Cancelar" |
| 2 | Verificar que os dados do evento sao visiveis | Titulo, colaborador, datas e descricao aparecem (apenas nao editaveis) |
| 3 | Habilitar `EDIT_EVENT`, clicar no mesmo evento | Campos habilitados, botao "Salvar" aparece, botao diz "Cancelar" |
| 4 | Editar o titulo e salvar | Toast "Evento atualizado com sucesso" |

---

## Teste 3 — DELETE_EVENT

**Permissao:** `DELETE_EVENT`

> Pre-requisito: ter pelo menos 1 evento criado

| Passo | Acao | Esperado |
|-------|------|----------|
| 1 | Desabilitar `DELETE_EVENT`, clicar em um evento existente | Dialog abre, botao "Excluir" NAO aparece |
| 2 | Habilitar `DELETE_EVENT`, clicar no mesmo evento | Botao "Excluir" aparece no canto inferior esquerdo (vermelho) |
| 3 | Clicar em "Excluir" | Confirmacao aparece, ao confirmar: toast "Evento excluido com sucesso" |

---

## Teste 4 — MOVE_EVENT

**Permissao:** `MOVE_EVENT`

> Pre-requisito: ter pelo menos 1 evento criado

### 5a. Drag & drop (mover evento)

| Passo | Acao | Esperado |
|-------|------|----------|
| 1 | Desabilitar `MOVE_EVENT`, tentar arrastar um evento para outro horario | Evento NAO e arrastavel (cursor normal) |
| 2 | Habilitar `MOVE_EVENT`, arrastar o evento para outro horario | Evento move para o novo horario, persiste apos reload |

### 5b. Resize (redimensionar duracao)

| Passo | Acao | Esperado |
|-------|------|----------|
| 1 | Desabilitar `MOVE_EVENT`, tentar arrastar a borda inferior de um evento | Nao redimensiona |
| 2 | Habilitar `MOVE_EVENT`, arrastar a borda inferior | Evento redimensiona, nova duracao persiste |

---

## Teste 5 — FILTER_BY_COLLABORATOR_CALENDAR

**Permissao:** `FILTER_BY_COLLABORATOR_CALENDAR`

| Passo | Acao | Esperado |
|-------|------|----------|
| 1 | Desabilitar `FILTER_BY_COLLABORATOR_CALENDAR` | Sidebar mostra lista de colaboradores SEM checkboxes, nao e clicavel |
| 2 | Habilitar `FILTER_BY_COLLABORATOR_CALENDAR` | Checkboxes aparecem, clicar num colaborador filtra os eventos no calendario |
| 3 | Desmarcar todos os colaboradores | Nenhum evento aparece na grid |
| 4 | Marcar apenas um colaborador | Somente eventos daquele colaborador aparecem |

---

## Teste 6 — CHANGE_COLLABORATOR_COLOR

**Permissao:** `CHANGE_COLLABORATOR_COLOR`

| Passo | Acao | Esperado |
|-------|------|----------|
| 1 | Desabilitar `CHANGE_COLLABORATOR_COLOR` | Ao lado do nome do colaborador aparece um **dot estatico** com a cor atual (sem dropdown) |
| 2 | Habilitar `CHANGE_COLLABORATOR_COLOR` | Aparece o **color picker** clicavel |
| 3 | Clicar no color picker, escolher outra cor | Cor muda, eventos do colaborador mudam de cor na grid |

---

## Teste 7 — CONFIGURE_GOOGLE_CALENDAR

**Permissao:** `CONFIGURE_GOOGLE_CALENDAR`

| Passo | Acao | Esperado |
|-------|------|----------|
| 1 | Desabilitar `CONFIGURE_GOOGLE_CALENDAR` | Botao de engrenagem (gear) NAO aparece na toolbar |
| 2 | Habilitar `CONFIGURE_GOOGLE_CALENDAR` | Botao aparece ao lado de "Agendar evento" |
| 3 | Clicar no botao | Dialog de configuracao do Google Calendar abre |

---

## Combinacoes importantes

| Cenario | Permissoes ativas | Comportamento |
|---------|-------------------|---------------|
| Somente visualizar | nenhuma individual (apenas acesso ao modulo) | Ve o calendario e eventos, nao pode fazer nada |
| Operador basico | `ADD_EVENT` + `EDIT_EVENT` + `DELETE_EVENT` | CRUD completo de eventos, sem drag/drop, sem filtro, sem config |
| Operador completo | todas | Acesso total |
| Gestor sem config | todas exceto `CONFIGURE_GOOGLE_CALENDAR` | Faz tudo menos alterar integracao Google |
