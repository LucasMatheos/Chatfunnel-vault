---
title: Livechat
description: Tela de atendimento em tempo real onde operadores conversam com contatos via canais conectados (WhatsApp, Instagram, etc).
tags: [features, livechat, chat]
related: ["[[message-flow]]", "[[realtime-communication]]", "[[contacts]]"]
last_updated: 2026-04-05
---

# Livechat

O Livechat e a tela principal de atendimento do ChatFunnel. Permite que operadores (moderadores) visualizem, respondam e gerenciem conversas em tempo real com contatos de canais conectados (WhatsApp, Instagram, etc).

## O que e

- Interface de chat ao vivo estilo "inbox" com tres paineis lado a lado
- Painel esquerdo: **SideBarFilters** — seletor de canal, filtros de caixa de entrada, pastas
- Painel central: **ListContacts** — lista de contatos do canal selecionado, com busca e scroll infinito
- Painel direito: **ChatMessages** — conversa aberta com header, historico de mensagens e input de resposta
- Sidebar lateral direita: **SideBarDetails** — detalhes do contato, responsavel, pasta, campos customizados, follow-ups, eventos Google Calendar

## Filtros de Caixa de Entrada

A sidebar de filtros oferece os seguintes modos de visualizacao (enum `FilterType`):

| Filtro | Descricao |
|--------|-----------|
| `my-inbox` | Conversas atribuidas ao operador logado |
| `all-inbox` | Todas as conversas atribuidas a qualquer operador |
| `unassigned-inbox` | Conversas sem operador atribuido |
| `all-chats` | Todas as conversas (default) |
| `handled-by-ai` | Conversas atendidas por agente de IA |
| `ai-blocked` | Conversas com agentes de IA bloqueados |
| `awaiting-service` | Conversas com transferencia pendente |
| `isArchived` | Conversas arquivadas |

- Filtros sao controlados via query params na rota (`?filter=my-inbox&folder=no-folder`)
- Visibilidade de filtros depende de permissoes: `FILTER_BY_COLLABORATOR_CHAT`, `FILTER_BY_NO_COLLABORATOR_CHAT`
- Contadores por filtro sao carregados via `ChatService.getCounterByChannelId`
- Tambem ha filtro **"Conversas nao lidas"** (badge laranja) com toggle `onlyUnread`

## Pastas (Folders)

- Operadores organizam contatos em pastas personalizadas
- CRUD completo: criar, renomear, deletar pasta
- Cada contato pode ser movido para uma pasta via SideBarDetails
- Filtros especiais: "Todas as pastas", "Sem categoria"

## Atribuicao de Conversas (Moderadores)

- Cada conversa pode ter um ou mais **moderadores** (operadores responsaveis)
- Atribuicao feita via SideBarDetails com `ChatService.updateContactChannelModerators`
- **Transferencia**: um operador pode transferir a conversa para outro via `ChatService.transferModerator`
- Conversas transferidas aparecem com destaque visual (fundo laranja, chip "Atendimento transferido")
- Ao clicar numa conversa transferida para o operador logado, a transferencia e aceita automaticamente

## Atendimento por IA

- Conversas podem ser atendidas por agentes de IA (exibem chip "IA" na lista)
- Operador pode bloquear/desbloquear IA para um contato (blacklist) via `ChatService.createUpdateContactBlackList`
- Quando a IA solicita atendimento humano, aparece badge `aiRequestedHuman`
- Status verificado via `ChatService.serveByAssistant`

## Entidades Principais

- **Contact**: pessoa que conversa no canal (nome, foto, instagramId/telefone)
- **Channel**: canal conectado (WhatsApp, Instagram, etc) — cada livechat opera dentro de um canal
- **Message**: mensagem individual com `from` (CONTACT ou HUMAN), `payload`, `sentAt`, `createdAt`
- **ContactChannel**: relacao entre contato e canal, contem moderadores, pasta, status de arquivamento, visualizacao

## Fluxo de Mensagens

1. Operador seleciona canal no seletor (SideBarFilters)
2. Lista de contatos e carregada via `ChatService.listContactsByChannelId` (paginada, 50 por pagina, scroll infinito)
3. Ao clicar num contato, mensagens sao carregadas via `ChatService.getMessages` (paginadas por `lastMemId`)
4. Operador digita resposta no FooterChat, enviada via `ChatService.sendMessage` (suporta multipart/form-data para midia)
5. Mensagem enviada e adicionada localmente ao array de mensagens (otimistic update)
6. Operador pode marcar como lida (`visualizeChat`), arquivar/desarquivar, marcar como nao lida

## Comunicacao em Tempo Real

- Frontend conecta ao **SignalWebsocket** (:10000) via Socket.IO (`SignalR` wrapper)
- Escuta eventos no canal `{accountId}` com tipos:
  - `add-message` — nova mensagem recebida
  - `updated-chat` — chat atualizado (moderador, pasta, etc)
  - `visualize-chat` — chat visualizado
  - `livechat` — atualizacao geral da lista
  - `followup-updated` — follow-up agendado alterado
- Backend emite via `ChatSocketClass` que usa `BaseSocketClass.emitSocket` → `signalR.emit("broadcast", { to: accountId, payload })`
- Frontend recebe via `eventBus` (mitt) que distribui para os componentes interessados
- Contadores da sidebar sao atualizados com debounce de 10s apos nova mensagem

## Permissoes Relevantes

| Permissao | Controla |
|-----------|----------|
| `CHAT.VIEW_CHAT` | Visualizar mensagens da conversa |
| `CHAT.ADD_MODERATOR` | Atribuir/alterar moderador |
| `CHAT.MOVE_FOLDER` | Mover contato entre pastas |
| `CHAT.FILTER_BY_COLLABORATOR_CHAT` | Ver filtro "Atribuidas" |
| `CHAT.FILTER_BY_NO_COLLABORATOR_CHAT` | Ver filtro "Nao atribuido" e "Todas" |
| `CONTACTS.VIEW_CONTACT` | Ver detalhes e campos do contato |

## Funcionalidades Complementares

- **Respostas rapidas** (fast messages): templates de texto reutilizaveis, CRUD via `ChatService.getChatFastMessages`
- **Follow-ups agendados**: exibidos no SideBarDetails, com status PENDING/DONE e opcao de cancelar
- **Eventos Google Calendar**: listados no painel de detalhes do contato
- **Notificacoes do browser**: permissao solicitada ao abrir o livechat
- **Typing indicator**: `ChatService.sendTyping` para mostrar que o operador esta digitando
- **Sync de mensagens**: `ChatService.syncMessages` para sincronizar mensagens entre sessoes
