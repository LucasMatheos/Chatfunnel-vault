---
title: Calendar
description: Módulo de agendamento — eventos nativos e sincronização bidirecional com Google Calendar, webhook push, cron de renovação de watches e notificação em tempo real.
tags: [calendar, google-calendar, webhook, socket, nest, vue]
related: ["[[calendar-permissions]]", "[[channels]]", "[[livechat]]"]
last_updated: 2026-06-24
---

# Calendar

## O que é

O módulo Calendar permite que cada conta crie e gerencie **agendas** (GoogleCalendars) e **eventos** (GoogleCalendarEvents). Cada agenda pode operar em dois modos:

| Provider | Comportamento |
|----------|---------------|
| `NATIVE` | Eventos armazenados apenas no banco. Sem integração externa. |
| `GOOGLE` | Eventos espelhados na Google Calendar API via OAuth. Mudanças externas (no Google Calendar do usuário) são sincronizadas de volta via webhook push. |

A distinção de provider existe em todos os handlers de CRUD. Qualquer nova operação precisa bifurcar entre os dois casos.

---

## Arquitetura em camadas

```
Browser (FullCalendar)
    │ Axios
    ▼
chatfunnel-services (NestJS :3200)
    │  CalendarController  /nest/calendar/*
    │  GoogleCalendarsController  /nest/google_calendars/*
    │  OrganizationsController (OAuth)  /nest/organizations/google_connection/*
    │
    │  CalendarService (delegador puro → core)
    ▼
chatfunnel-core
    │  CalendarService (fachada)
    │  Handlers:
    │    create-event.handler.ts
    │    update-event.handler.ts
    │    delete-event.handler.ts
    │    list-events.handler.ts
    │    list-collaborators.handler.ts
    │    handle-webhook.handler.ts   ← webhook Google
    │    watch-calendars.handler.ts  ← cron renewal
    ▼
PostgreSQL (via Prisma)
    GoogleCalendars, GoogleCalendarEvents, GoogleCalendarAvailableSlots,
    GoogleCalendarSubscribers, AssistantGoogleCalendars, GoogleConnections,
    GoogleCalendarEventScheduledReminders
```

---

## Frontend

**Localização:** `chatfunnel-front/src/views/calendar/`

### Componentes

| Arquivo | Papel |
|---------|-------|
| `index.vue` | Orquestrador — instancia FullCalendar, gerencia estado, escuta Socket.IO |
| `components/EventDialog.vue` | Dialog de criar / editar / excluir evento |
| `components/CalendarToolbar.vue` | Navegação de datas e troca de modo (Dia / Semana / Mês) |
| `components/CollaboratorsList.vue` | Lista de agendas com checkbox e seletor de cor |

**Service:** `src/common/services/CalendarService.js` — centraliza todos os Axios calls para `/nest/calendar/*`.

**Configuração de agendas:** aberta via botão "Settings" na toolbar, que chama `showDialog()` no componente `views/configuration/integrations/components/configureGoogleCalendars/index.vue`.

### Estado

Não há Pinia store para o Calendar. Todo o estado (eventos, colaboradores, loading) vive no `index.vue`. A única persistência entre navegações é o filtro de colaboradores visíveis, salvo em:

```
localStorage → chave: calendar_selected_collaborators_{accountId}
```

### Inicialização

```
onMounted
  └─ loadCollaborators()
       └─ CalendarService.listCollaborators()  →  GET /nest/calendar/collaborators
            └─ popula collaborators[]
                 └─ filtra por permissão FILTER_BY_COLLABORATOR_CALENDAR

FullCalendar renderiza → dispara datesSet
  └─ handleDatesSet()
       └─ loadEvents()
            └─ CalendarService.listEvents({ startDate, endDate })  →  GET /nest/calendar/events?startDate=...&endDate=...
```

### Permissões

Cada ação tem uma permissão separada verificada via `usePermissions().hasPermission('CALENDAR', action)`:

| Ação | Permissão |
|------|-----------|
| Criar evento | `ADD_CALENDAR_EVENT` |
| Editar evento | `EDIT_CALENDAR_EVENT` |
| Excluir evento | `DELETE_CALENDAR_EVENT` |
| Mover (drag-and-drop) | `MOVE_CALENDAR_EVENT` |
| Configurar agendas | `CONFIGURE_CALENDAR` |
| Filtrar por colaborador | `FILTER_BY_COLLABORATOR_CALENDAR` |

Ver [[calendar-permissions]] para o mapeamento completo de roles.

### Drag-and-drop e resize

- `handleEventDrop` chama `CalendarService.updateEvent(id, { start, end })` diretamente, sem abrir dialog.
- Em caso de erro na API, `info.revert()` desfaz a mudança visual no FullCalendar.
- `handleEventResize` segue o mesmo padrão.
- **Gotcha:** `handleEventDragStop` tem um timeout de 50ms que abre o EventDialog após qualquer drag. O `handleEventDrop` cancela esse comportamento via flag `preDragEventStart = null`. Se o drop falhar na API, o dialog pode abrir mesmo assim — ver [[#gotchas]].

---

## Endpoints

### Eventos — `/nest/calendar/*`

| Método | Path | Propósito |
|--------|------|-----------|
| `GET` | `/nest/calendar/collaborators` | Lista agendas configuradas da conta |
| `GET` | `/nest/calendar/events` | Lista eventos no range `startDate` / `endDate` |
| `POST` | `/nest/calendar/events` | Cria novo evento |
| `PUT` | `/nest/calendar/events/:id` | Atualiza evento (title, description, start, end) |
| `DELETE` | `/nest/calendar/events/:id` | Cancela evento (soft delete) |
| `POST` | `/nest/calendar/webhook` | Recebe push notification do Google Calendar (**sem JWT**) |
| `PATCH` | `/nest/calendar/calendars/:id/color` | Atualiza cor de uma agenda |
| `GET` | `/nest/calendar/availability` | Verifica disponibilidade em um intervalo |
| `POST` | `/nest/calendar/watch` | Força renovação manual de watch channels |

### Configuração de agendas — `/nest/google_calendars/*`

| Método | Path | Propósito |
|--------|------|-----------|
| `POST` | `/nest/google_calendars` | Cria configuração de agenda |
| `GET` | `/nest/google_calendars` | Lista todas as agendas da conta |
| `GET` | `/nest/google_calendars/:id` | Busca agenda por ID |
| `PUT` | `/nest/google_calendars/:id` | Atualiza configuração de agenda |
| `DELETE` | `/nest/google_calendars/:id` | Remove agenda |

### OAuth Google — `/nest/organizations/google_connection/*`

| Método | Path | Propósito |
|--------|------|-----------|
| `POST` | `/nest/organizations/google_connection/:type` | Cria conexão OAuth, retorna `authUrl` para redirect |
| `DELETE` | `/nest/organizations/google_connection/:id` | Remove conexão OAuth |
| `GET` | `/nest/organizations/google_connection/:type` | Lista conexões OAuth do tipo especificado |
| `GET` | `/nest/google_connection/:connectionId/:type/list` | Lista agendas disponíveis numa conexão |

---

## Fluxos principais

### Criar evento (provider NATIVE)

```
EventDialog → salvar
  └─ CalendarService.createEvent({ title, description, start, end, collaboratorId })
       └─ POST /nest/calendar/events
            └─ CreateEventHandler
                 └─ busca GoogleCalendars pelo collaboratorId
                 └─ provider === 'NATIVE'
                      └─ cria GoogleCalendarEvents com eventKey (UUID)
                 └─ retorna evento formatado para FullCalendar
  └─ front recarrega lista de eventos
```

### Criar evento (provider GOOGLE)

```
CreateEventHandler
  └─ provider === 'GOOGLE'
       └─ autentica via OAuth (GoogleCalendarApiService)
       └─ cria evento na Google Calendar API
       └─ upsertByGoogleEventId no banco local
  └─ retorna evento formatado
```

### Excluir evento

```
EventDialog → confirmar exclusão (SweetAlert2)
  └─ CalendarService.deleteEvent(id)  →  DELETE /nest/calendar/events/:id
       └─ DeleteEventHandler
            └─ se GOOGLE: tenta deletar na Google Calendar API (falha silenciosa)
            └─ markCancelled(id)  →  isCancelled: true  (soft delete)
```

**Nota:** eventos nunca são hard deletados. A query de listagem deve filtrar `isCancelled: true`.

### Webhook Google Calendar (push notification)

```
Google Calendar API
  └─ POST /nest/calendar/webhook
       └─ valida x-goog-channel-token contra GOOGLE_WEBHOOK_CHANNEL_TOKEN
       └─ ignora resource-state === 'sync'
       └─ identifica calendário pelo x-goog-channel-id (watchGoogleId)
       └─ busca eventos atualizados no Google API [now-24h, now+30d]
       └─ upsertByGoogleEventId para cada evento (cria ou atualiza no banco)
       └─ POST {CHATFUNNEL_API_URL}/socket → { accountId, type: 'calendar:updated' }
            └─ Socket.IO emite para a room accountId
                 └─ front escuta e chama loadEvents()
```

### Renovação de watch channels (cron)

```
@Cron('0 */6 * * *')  — a cada 6 horas
  └─ WatchCalendarsHandler
       └─ busca GoogleCalendars com watchExpiry < now + 24h
       └─ para cada agenda:
            └─ stop no watch channel antigo na Google API
            └─ cria novo UUID de canal
            └─ googleCalendarApiService.watchCalendar()
            └─ atualiza watchGoogleId, watchResourceId, watchExpiry no banco
```

---

## Modelos de dados

### `GoogleCalendars` — configuração de uma agenda

```prisma
model GoogleCalendars {
  id                   String
  accountId            String
  googleConnectionId   String?    // null = provider NATIVE
  provider             CalendarProviderEnum  // NATIVE | GOOGLE  (default: GOOGLE)
  name                 String
  calendarType         String     // LIST | ID
  calendarId           String?    // ID da agenda no Google
  limitType            String     // weeks | date
  weeksAhead           Int?
  specificDate         DateTime?
  userId               String     // responsável pela agenda
  notifyOnCreation     Boolean
  notifyOnCancellation Boolean
  color                String?
  watchGoogleId        String?    // ID do watch channel ativo
  watchResourceId      String?
  watchExpiry          DateTime?

  // relations
  subscribers          GoogleCalendarSubscribers[]
  availableSlots       GoogleCalendarAvailableSlots[]
  assistantCalendars   AssistantGoogleCalendars[]
  events               GoogleCalendarEvents[]
}
```

### `GoogleCalendarEvents` — um evento

```prisma
model GoogleCalendarEvents {
  id               String
  googleEventId    String?  @unique  // null para eventos NATIVE
  eventKey         String?           // UUID para eventos NATIVE
  accountId        String
  googleCalendarId String
  contactId        String?
  assistantId      String?
  agentId          String?
  conversationId   String?
  email            String?
  title            String
  description      String?
  startAt          DateTime
  endAt            DateTime
  meetingLink      String?
  isCancelled      Boolean  @default(false)
  cancelledAt      DateTime?
  createdAt        DateTime

  // relations
  scheduledReminders GoogleCalendarEventScheduledReminders[]
}
```

### `GoogleCalendarAvailableSlots` — horários disponíveis

```prisma
model GoogleCalendarAvailableSlots {
  id               String
  googleCalendarId String
  weekday          Int        // 0 = domingo, 6 = sábado
  startTime        String     // "09:00"
  endTime          String     // "18:00"
}
```

### `AssistantGoogleCalendars` — vinculação IA ↔ agenda

Vincula agentes de IA a agendas para agendamento automático com distribuição de carga:

```prisma
model AssistantGoogleCalendars {
  id                     String
  assistantId            String
  googleCalendarId       String
  distributionPercentage Int
}
```

---

## Tempo real (WebSocket)

| Canal (room) | Evento | Ação no front |
|--------------|--------|---------------|
| `accountId` | `{ type: 'calendar:updated' }` | Recarrega `loadEvents()` |

O `index.vue` registra o listener no `onMounted` e remove no `onUnmounted`. O evento é emitido pelo `HandleWebhookHandler` via relay HTTP → Socket.IO server.

---

## Dependências externas

| Pacote | Onde | Papel |
|--------|------|-------|
| `@fullcalendar/vue3` + plugins | front | Renderização do calendário visual |
| `googleapis` v148 | core | Google Calendar API client |
| `google-auth-library` | core | Autenticação OAuth |
| `@nestjs/schedule` | services | Cron de renovação de watches |
| `socket.io-client` v4.7.5 | front | Escuta eventos em tempo real |
| `date-fns` + `@internationalized/date` | front | Manipulação de datas |

---

## Gotchas

### 1. Webhook sem autenticação JWT

`POST /nest/calendar/webhook` não usa `AuthGuard`. A única proteção é o `GOOGLE_WEBHOOK_CHANNEL_TOKEN` nos headers. Qualquer requisição com o token correto aciona sincronização completa.

### 2. Socket relay via HTTP pode falhar silenciosamente

O `HandleWebhookHandler` notifica o front via `POST {CHATFUNNEL_API_URL}/socket`. Se `CHATFUNNEL_API_URL` não estiver configurado ou a API Express estiver down, o sync em tempo real falha com apenas `console.error` — sem relançamento de erro, sem retry.

### 3. `provider` default é GOOGLE, mas form cria NATIVE

O schema Prisma define `provider` default como `GOOGLE`. Porém o formulário de criação de agenda (`GoogleCalendarFormV2`) cria como `NATIVE` quando `useGoogleCalendar = false`, deixando `googleConnectionId: null`. A distinção não é óbvia olhando só o banco — verificar sempre o campo `googleConnectionId`.

### 4. Eventos nunca são hard deletados

`DeleteEventHandler` chama `markCancelled(id)` que seta `isCancelled: true`. Todo `listEvents` deve filtrar `WHERE isCancelled = false`, ou eventos cancelados reaparecem no calendário.

### 5. Race condition no drag-and-drop

`handleEventDragStop` dispara um `setTimeout(50ms)` que abre o `EventDialog`. O `handleEventDrop` cancela isso setando `preDragEventStart = null`. Se o drop falhar na API e o `revert()` for chamado, o timeout já pode ter disparado o dialog — o usuário vê um dialog de edição num evento que voltou ao estado anterior.

### 6. Watch channel window de 24h

O cron roda a cada 6h e renova watches que expiram em < 24h. Se o servidor ficar offline por mais de 6h consecutivas, calendários podem perder o push do Google sem auto-recovery — eventos externos não sincronizarão até a próxima renovação manual ou restart.

### 7. `onModuleInit` atribui cores na startup

`GoogleCalendarsService.onModuleInit()` busca todas as agendas sem cor e atribui automaticamente. Em contas com muitas agendas, isso pode causar lentidão na inicialização do módulo NestJS.

### 8. `googleEventId` é `@unique` mas nullable

Eventos NATIVE têm `googleEventId: null` — o Postgres trata múltiplos `null` como não-conflitantes com a constraint `@unique`. Eventos GOOGLE usam `googleEventId` como chave de upsert.

---

## Arquivos-chave

| Caminho | Papel |
|---------|-------|
| `chatfunnel-front/src/views/calendar/index.vue` | View principal |
| `chatfunnel-front/src/common/services/CalendarService.js` | Todos os calls de API |
| `chatfunnel-front/src/views/configuration/integrations/components/configureGoogleCalendars/index.vue` | Modal de configuração de agendas |
| `chatfunnel-front/src/views/configuration/integrations/components/configureGoogleCalendars/components/GoogleCalendarFormV2/index.vue` | Formulário de agenda |
| `chatfunnel-services/src/modules/calendar/controllers/calendar.controller.ts` | Controller NestJS `/nest/calendar/*` |
| `chatfunnel-services/src/modules/google_calendars/controllers/google_calendars.controller.ts` | Controller NestJS `/nest/google_calendars/*` |
| `chatfunnel-core/src/services/calendar/calendar.service.ts` | Fachada do core |
| `chatfunnel-core/src/services/calendar/handlers/create-event.handler.ts` | Lógica de criação |
| `chatfunnel-core/src/services/calendar/handlers/handle-webhook.handler.ts` | Sincronização via webhook |
| `chatfunnel-core/src/services/calendar/handlers/watch-calendars.handler.ts` | Renovação de watches |
