---
title: Analise Tecnica do Modulo de Chat
description: Mapeamento cross-repo completo do chat — front (livechat), NestJS, Express, WebSocket, Core, Prisma
tags: [analysis, chat, livechat, architecture]
related: ["[[livechat]]", "[[message-flow]]", "[[realtime-communication]]"]
last_updated: 2026-05-15
---

# Analise Tecnica do Modulo de Chat

**Data:** 2026-05-15
**Escopo:** Front (livechat) + Backend (services, api, websocket, core, database)

---

## Visao Geral

O modulo de chat e o coracao do ChatFunnel. Ele conecta **6 repositorios** e abrange:
- ~8.800 linhas no frontend (Vue 3)
- ~22 command handlers no NestJS
- ~10 queues no Express
- 8 modelos Prisma dedicados
- WebSocket real-time via Socket.IO

```
[Browser/LiveChat]
       |
       |-- HTTP --> [chatfunnel-services :3200] (NestJS - endpoints /chats/*)
       |                    |
       |                    +-- @chatfunnel/core (repositories, Prisma)
       |
       |-- HTTP --> [chatfunnel-api :3001] (Express - /api/contacts/*, /api/socket)
       |                    |
       |                    |-- @chatfunnel/core
       |                    +-- Bull queues (follow-up, broadcast, assistant)
       |
       +-- WS ----> [chatfunnel-websocket :10000] (Socket.IO)
                        |
                        |-- broadcast event: add-message, moderators-updated
                        +-- @chatfunnel/core (ChatModeratorsRepository)
```

---

## Frontend — chatfunnel-front/src/views/livechat/

### Rotas

| Path | Name | Descricao |
|------|------|-----------|
| `/livechat` | LiveChatScreen | Tela principal do chat |
| `/livechat/:channelId/:chatId?` | LiveChatScreenId | Chat com canal/contato selecionado |

Meta: `module: "CHAT"`, `requiresAuth: true`, `hideNotificationSound: true`

### Arvore de Componentes (~8.800 linhas)

```
LiveChatScreen.vue (93 loc) — Provider de contexto (channel, contact, loading)
+-- SideBarFilters/index.vue (527 loc) — Filtros laterais
+-- ListContacts/index.vue (616 loc) — Lista de contatos
|   +-- ContactItem/index.vue — Item individual
|   |   +-- LastMessage.vue (130 loc) — Preview ultima mensagem
|   +-- ContactModeratorsMerge.vue (67 loc) — Merge de moderadores
+-- ChatMessages/index.vue (467 loc) — Orquestrador de mensagens
    +-- HeaderChat.vue (164 loc) — Cabecalho do chat
    +-- HeaderChatCrm.vue — Variante CRM
    +-- FollowUpAlert.vue — Alerta de follow-up
    +-- ContactBubble/index.vue (100 loc) — Bolha recebida
    |   +-- TextBallon.vue
    |   +-- MediaBallon.vue (139 loc)
    |   +-- TemplateBallon.vue
    |   +-- InteractiveBallon.vue
    |   +-- ButtonBallon.vue
    |   +-- ContactsBallon.vue (80 loc)
    |   +-- ReactionBallon.vue
    |   +-- Answer.vue (102 loc) — Reply/citacao
    |   +-- UnsupportedBallon.vue
    |   +-- TranscriptionModal.vue
    |   +-- instagram/ (7 componentes)
    +-- SentBubble/index.vue (242 loc) — Bolha enviada
    |   +-- TextBallon.vue
    |   +-- MediaBallon.vue (247 loc)
    |   +-- TemplateBallon.vue (170 loc)
    |   +-- TemplateV2Ballon.vue (143 loc)
    |   +-- InteractiveBallon.vue
    |   +-- StickNote.vue
    |   +-- InteractiveActions/ (Buttons, Link)
    |   +-- instagram/ (7 componentes)
    +-- FooterChat/index.vue (377 loc) — Area de input
    |   +-- InputChat.vue (182 loc) — Campo de texto
    |   +-- InputFile.vue (130 loc) — Upload de arquivo
    |   +-- InputAudio.vue (163 loc) — Audio (legado)
    |   +-- InputAudio2.vue (220 loc) — Audio v2
    |   +-- InputVoice.vue (615 loc) — Gravacao de voz
    |   +-- PreviewFile.vue (67 loc)
    |   +-- ReplyStickNotes/index.vue
    |   +-- Tools/index.vue (78 loc)
    |       +-- MovePipeline.vue (147 loc)
    |       +-- RunAutomation.vue (144 loc)
    |       +-- SendTemplateModal.vue (147 loc)
    |       +-- FastMessagesModal/index.vue (227 loc)
    |           +-- FastMessageMenu.vue (143 loc)
    +-- SideBarDetails/index.vue (556 loc) — Painel de detalhes
        +-- ContactInfo.vue (121 loc)
        +-- CustomFields.vue (113 loc)
        +-- FolderInput.vue (101 loc)
        +-- KanbanInfo.vue (264 loc)
        +-- GoogleCalendarEvents.vue (226 loc)
        +-- GoogleCalendarEventModal.vue (341 loc)
        +-- Card.vue — Secao colapsavel
        +-- PropertiesLabel.vue
```

### Services Consumidos (HTTP)

| Service | API | Endpoints Principais |
|---------|-----|----------------------|
| ChatService | Api (:3001) + NestApi (:3200) | listContacts, getMessages, sendMessage, folders, fastMessages, followUp, typing, transfer |
| ContactsService | Api (:3001) | CRUD contatos, tags, follow-up |
| KanbanService | NestApi (:3200) | Pipeline, cards |
| AccountsService | Api (:3001) | Block/unblock assistant |
| AutomationService | NestApi (:3200) | Trigger automacoes |
| WhatsAppService | NestApi (:3200) | Templates WhatsApp |

### WebSocket (Socket.IO)

Importado de `src/views/crm/socket.js`, conecta em `:10000/ws`.

Eventos monitorados:
- `contact-detail:${contactId}` — atualizacao de detalhes do contato
- `contact-list:${accountId}` — atualizacao da lista de contatos
- Mensagens em real-time
- Typing indicators
- Mudancas no kanban

### State Management

- `useAuthStore()` — dados do usuario/conta (Pinia)
- `useThemeStore()` — dark/light mode
- `provide/inject` — contexto do LiveChatScreen para filhos (channel, contact, loading)
- **Nao tem store dedicada para chat** — estado local nos componentes

### Composables Utilizados

- `useAlerts()` — toasts
- `useHelpers()` — utilidades
- `useMarkdown()` — renderizacao markdown
- `useResponsive()` — mobile/desktop
- `usePermissions()` — controle de permissoes

---

## Backend — chatfunnel-services (NestJS)

### Modulo: src/modules/chat/

**Controller:** `controllers/chats.controller.ts`

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/chats/contacts_v2/:channelId` | Lista contatos por canal (filtros) |
| POST | `/chats/contact/moderators` | Atualiza moderadores |
| GET | `/chats/contact/:contactId/:channelId?` | Detalhes do contato-canal |
| POST | `/chats/folder` | Cria pasta |
| GET | `/chats/folder/:channelId` | Lista pastas |
| PUT | `/chats/folder` | Atualiza pasta |
| DELETE | `/chats/folder/:folderId` | Deleta pasta |
| PUT | `/chats/folder/contact` | Move contato para pasta |
| GET | `/chats/fast-messages` | Lista respostas rapidas |
| POST | `/chats/fast-messages` | Cria resposta rapida |
| PUT | `/chats/fast-messages/:id` | Atualiza resposta rapida |
| DELETE | `/chats/fast-messages/:id` | Deleta resposta rapida |
| GET | `/chats/fast-messages/:id` | Busca resposta rapida por ID |
| GET | `/chats/counter_by_channel_id_v2/:channelId` | Metricas/contadores |
| GET | `/chats/sync_messages` | Sync mensagens da conta |
| GET | `/chats/follow_up_schedule/:channelId/:contactId` | Follow-ups agendados |
| GET | `/chats/served_by_assistant/:channelId/:contactId` | Check assistente ativo |
| POST | `/chats/blacklist_stop_assistant/:contactId/:channelId` | Bloquear assistente |
| DELETE | `/chats/blacklist_stop_assistant/:contactId/:channelId` | Desbloquear assistente |
| POST | `/chats/transfer_moderator/:contactId/:moderatorId` | Transferir moderador |
| GET | `/chats/events/:contactId` | Eventos Google Calendar |
| GET | `/chats/events/:contactId/:eventId` | Detalhes do evento |

### Command Handlers (22 handlers)

Cada handler segue o padrao: `handler.ts` + `dto.ts` + `response.ts`

**Fast Messages:**
- `create_chat_fast_message/`
- `update_chat_fast_message/`
- `delete_chat_fast_message/`
- `get_chat_fast_message_by_id/`
- `list_chat_fast_messages/`

**Pastas:**
- `create_contacts_folder/`
- `update_folder/`
- `update_contact_folder/`
- `delete_contacts_folder/`
- `list_folders/`

**Contatos/Chat:**
- `list_contacts_by_channelId/`
- `get_contact_channel_by_id/`
- `update_chat_moderators/`
- `update_contact_transfer_moderator/`
- `list_counter_by_channel_id/`
- `get_account_messages/`

**Follow-up/Assistente:**
- `list_follow_up_scheduled/`
- `get_served_by_assistant_contact/`
- `create_contact_blacklist_stop_assistant/`
- `delete_contact_black_list/`

**Calendar:**
- `list_google_calendar_events/`
- `get_event_by_id/`

### Dependencias do Modulo

- 13 repositories do `@chatfunnel/core`
- `ResumeAssistantQueueModule`

---

## Backend — chatfunnel-api (Express)

### Rotas Relacionadas a Chat

**ContactsRoutes.js:**
- `PUT /api/contacts` — atualizar contato
- `GET /api/contacts/folder` — listar pastas
- `PUT /api/contacts/folder` — mover contato
- `PUT /api/contacts/folder/:folderId` — renomear pasta
- `DELETE /api/contacts/folder/:folderId` — deletar pasta
- `POST /api/contacts/folder` — criar pasta
- `GET /api/contact/:contactId` — buscar contato
- `DELETE /api/contacts` — deletar contato
- `GET/POST/DELETE /api/contacts/:contactId/tags/:tagId` — tags

**SocketRoutes.js:**
- `POST /api/socket` — emitir evento socket (public, sem auth)

### Queues (Bull)

| Queue | Funcao |
|-------|--------|
| AutomationAssistantFollowUpQueue | Follow-up do assistente IA |
| AutomationStepDelayQueue | Delay em steps de automacao |
| AutomationStepFollowUpQueue | Follow-up em steps |
| AutomationStepInputQueue | Coleta de input |
| BroadcastQueue | Envio de broadcast |
| ExpireAssistantQueue | Expiracao do assistente |
| ExpireAssistantCommentQueue | Expiracao de comentario |
| ProcessHistoryQueue | Processamento de historico |
| RemoveAutomationBlacklistQueue | Remocao de blacklist |
| SystemActionsQueue | Acoes de sistema |

---

## Backend — chatfunnel-websocket (Socket.IO)

**Porta:** 10000, **Path:** `/ws`

**Eventos:**
- `broadcast` — handler principal
  - `add-message` — busca moderadores, injeta IDs, faz broadcast
  - `moderators-updated` — atualiza transfer moderator no DB, faz broadcast

**Repositorios usados:**
- `ChatModeratorsRepository.getModeratorsIdsByContactId()`
- `ChatModeratorsRepository.setTransferModerator()`

**Health:** `GET /health`

---

## Database — Modelos Prisma (chatfunnel-core)

| Modelo | Campos Principais | Descricao |
|--------|-------------------|-----------|
| `Contacts` | id, name, email, phone, instagramId, facebookId, whatsappId, utmParams | Contato master |
| `Messages` | id, messageId, contactId, from, type, status, content, metadata, channelId, assistantId, userId | Historico de mensagens |
| `ChatModerators` | contactId, moderatorId, transferModeratorId | Atribuicao de moderadores |
| `ChatFastMessages` | accountId, name, message | Templates de resposta rapida |
| `ContactsChannels` | contactId, channelId, platformIds, lastUpdate, visualization, archive, servedByAssistant | Bridge contato-canal |
| `ContactsFollowUpScheduled` | contactId, channelId, scheduleDate, status, canceledByUserId | Follow-ups agendados |
| `ContactsFolders` | accountId, name, order, color | Pastas de organizacao |
| `BlackList` | contactId, channelId, createdByUserId, reason | Contatos bloqueados |

### Repositories em chatfunnel-core/src/repositories/

- `messages.repository.ts` — CRUD mensagens
- `chat_fast_messages.repository.ts` — Respostas rapidas
- `chat_moderators.repository.ts` — Moderadores
- `contacts.repository.ts` — Contatos
- `contacts_channels.repository.ts` — Bridge contato-canal (filtros: answered, unread, unanswered)
- `contacts_folders.repository.ts` — Pastas
- `contacts_follow_up_scheduled.repository.ts` — Follow-ups
- `black_list.repository.ts` — Blacklist
- `channels.repository.ts` — Canais (WhatsApp, Instagram, Messenger)
- `contact_segments.repository.ts` — Segmentacao

---

## Matriz de Features Cross-Repo

| Feature | Front | Services | API | WS | Core |
|---------|-------|----------|-----|----|------|
| Listagem de contatos | ListContacts | list_contacts_by_channelId | — | contact-list event | contacts_channels.repository |
| Envio de mensagem | FooterChat/InputChat | — | sendMessage | add-message | messages.repository |
| Mensagens real-time | Socket listener | — | — | broadcast handler | ChatModeratorsRepository |
| Moderadores | HeaderChat | update_chat_moderators | — | moderators-updated | chat_moderators.repository |
| Pastas | SideBarFilters | create/update/delete_folder | ContactsRoutes | — | contacts_folders.repository |
| Respostas rapidas | FastMessagesModal | CRUD fast-messages | — | — | chat_fast_messages.repository |
| Follow-up | FollowUpAlert | list_follow_up_scheduled | — | — | contacts_follow_up_scheduled.repository |
| Assistente IA | SideBarDetails | served_by_assistant, blacklist | — | — | black_list.repository |
| Transferencia | HeaderChat | transfer_moderator | — | moderators-updated | chat_moderators.repository |
| Detalhes contato | SideBarDetails | get_contact_channel_by_id | — | contact-detail event | contacts.repository |
| Google Calendar | GoogleCalendarEvents | list/get events | — | — | — |
| Templates WhatsApp | SendTemplateModal | WhatsAppService | — | — | — |
| Automacoes | RunAutomation | AutomationService | queues | — | — |
| Pipeline/Kanban | MovePipeline, KanbanInfo | KanbanService | — | — | KanbanSocket |
| Upload media | InputFile, InputVoice | — | sendMessage | — | — |
| Multi-canal | SideBarFilters | contacts_v2/:channelId | — | — | channels.repository |
| Arquivamento | ListContacts | — | ArchiveContact | — | contacts_channels.repository |
| Tags | SideBarDetails | — | ContactsRoutes | — | contacts.repository |
| Custom fields | CustomFields | — | — | — | — |

---

## Padroes Arquiteturais

1. **Multi-Tenancy** — todo query filtra por `accountId`
2. **Soft Delete** — `isDeleted: true`, nunca hard delete
3. **Repository Pattern** — acesso ao DB via repositories tipados no core
4. **Command Handler** — NestJS usa handlers isolados por operacao
5. **Provide/Inject** — front usa provide no LiveChatScreen, inject nos filhos
6. **Dual API** — front consome Express (:3001) E NestJS (:3200) simultaneamente
7. **Bull/BullMQ** — Express usa Bull, Services usa BullMQ para jobs assincronos
8. **Socket Broadcast** — WebSocket server recebe via evento `broadcast`, redistribui para rooms

---

## Observacoes e Riscos

### Duplicacao de Responsabilidade
- **Pastas:** existem rotas tanto no Express (`ContactsRoutes`) quanto no NestJS (`chats.controller`). Possivel duplicacao ou migração incompleta.
- **Contatos:** CRUD dividido entre dois backends.

### Ausencia de Store Dedicada no Front
- O chat nao tem uma Pinia store dedicada. Estado vive em componentes via provide/inject e estado local. Isso dificulta:
  - Cache de mensagens entre navegacoes
  - Sincronizacao de estado entre abas
  - Debug de estado complexo

### Tipos Fracos no Frontend
- Maioria dos arquivos e `.js` (nao `.ts`). Sem interfaces/types dedicados para Message, Contact, Channel.
- Tipagem depende de runtime, sem validacao em compile-time.

### InputVoice.vue — Componente mais pesado (615 loc)
- Concentra logica de gravacao, upload e UI. Candidato a refatoracao.

### Versao do Core desalinhada entre repos
- API usa `@chatfunnel/core@1.0.7-rc.7`
- Services usa `@chatfunnel/core@1.0.8`
- WebSocket usa `dev`
- Risco de divergencia de schemas/repositories entre backends.
