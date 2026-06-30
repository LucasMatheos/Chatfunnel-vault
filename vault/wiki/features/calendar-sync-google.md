---
title: Calendar — Sincronização Google Calendar
description: Documento detalhado do processo completo de sincronização bidirecional entre o Google Calendar e o Chatfunnel — webhook push, cron de renovação, sync de migração, agendamento via IA e frontend em tempo real.
tags: [calendar, google-calendar, sync, webhook, oauth, socket, cron, ia-agendamento]
related: ["[[calendar]]", "[[calendar-avaliacao]]", "[[ai-agents]]"]
last_updated: 2026-06-25
---

# Calendar — Sincronização Google Calendar

Este documento descreve **o que acontece, em que ordem, e em que arquivo** para cada cenário de sincronização entre o Google Calendar e o Chatfunnel.

---

## Visão Geral: os 4 caminhos de dados

```
[Google Calendar] ──push──▶ POST /nest/calendar/webhook ──▶ HandleWebhookHandler
                                                                    │
                                                           upsertByGoogleEventId()
                                                                    │
                                                         [GoogleCalendarEvents DB]
                                                                    │
                                                       relay Socket.IO → Frontend

[Cron 6h] ──────────────────────────────────────────▶ WatchCalendarsHandler
                                                        (renova channels antes de expirar)

[Migração NATIVE→GOOGLE] ────────────────────────────▶ UpdateGoogleCalendarHandler
                                                        (sync bidirecional + watch inicial)

[IA via WhatsApp/Instagram] ──tool call──────────────▶ AgentCalendarToolExecutor
                                                        (cria evento no DB + Google)
```

---

## Mecanismo 1 — Webhook Push (tempo real)

### O que é

O Google envia uma notificação HTTP toda vez que um evento da agenda muda (criado, atualizado, cancelado). O Chatfunnel recebe essa notificação e sincroniza o banco.

### Pré-requisito: o Watch Channel

Para receber notificações, o Chatfunnel precisa registrar um **watch channel** no Google:

```
GoogleCalendarApiService.watchCalendar(calendarId, channelId, webhookUrl)
  → Google retorna: { resourceId, expiration (7 dias) }
  → Salvo no DB: GoogleCalendars.watchGoogleId, watchResourceId, watchExpiry
```

O Google só envia notificações para agendas que têm um watch ativo. Se o watch expirar, as notificações param silenciosamente.

### Fluxo completo

```
1. Google detecta mudança na agenda
   ↓
2. Google envia POST /nest/calendar/webhook
   Headers:
     x-goog-channel-id:     UUID do channel registrado
     x-goog-resource-state: "exists" | "sync" | "not_exists"
     x-goog-channel-token:  token secreto compartilhado
   ↓
3. CalendarController.handleWebhook()  [chatfunnel-services]
   — sem @UseGuards() — sem autenticação JWT
   ↓
4. CalendarService.handleWebhook()     [chatfunnel-services — wrapper puro]
   ↓
5. CoreCalendarService.handleWebhook() [chatfunnel-core facade]
   ↓
6. HandleWebhookHandler.execute(channelId, resourceState, channelToken)
   ↓
   [a] Valida token:
       channelToken !== process.env.GOOGLE_WEBHOOK_CHANNEL_TOKEN → abort
   ↓
   [b] Ignora handshake inicial:
       resourceState === 'sync' → return (Google envia isso ao criar o watch)
   ↓
   [c] Busca calendário afetado:
       GoogleCalendarsRepository.findAllWithCalendarId()
       → filtra: watchGoogleId === channelId
       → inclui: googleConnection (para OAuth)
   ↓
   [d] Autentica OAuth:
       GoogleCalendarApiService.getAuthenticatedClient(googleConnection)
       → se access_token expirado: chama Google para renovar
       → persiste novo token no DB (GoogleConnections)
   ↓
   [e] Lista eventos alterados do Google:
       googleCalendarApi.listEvents(calendarId, {
         timeMin: agora - 24h,
         timeMax: agora + 30 dias
       })
   ↓
   [f] Upsert de cada evento:
       para cada evento retornado:
         GoogleCalendarEventsRepository.upsertByGoogleEventId({
           googleEventId, accountId, googleCalendarId,
           title, description, startAt, endAt,
           meetingLink, isCancelled
         })
       → cria se não existe (por googleEventId)
       → atualiza se já existe
   ↓
   [g] Notifica frontend:
       POST {CHATFUNNEL_API_URL}/socket
       body: { type: 'calendar:updated', payload: { accountId } }
       → Express API faz relay para Socket.IO
       → Frontend escuta e chama loadEvents()
```

### Campos atualizados no upsert

| Campo | Fonte |
|---|---|
| `googleEventId` | `event.id` da API |
| `title` | `event.summary` |
| `description` | `event.description` |
| `startAt` | `event.start.dateTime` ou `event.start.date` |
| `endAt` | `event.end.dateTime` ou `event.end.date` |
| `meetingLink` | `event.htmlLink` |
| `isCancelled` | `event.status === 'cancelled'` |

> **O upsert é idempotente.** Processar o mesmo webhook duas vezes não cria duplicatas.

### Arquivo principal

```
chatfunnel-core/src/services/calendar/handlers/handle-webhook.handler.ts
```

---

## Mecanismo 2 — Cron de Renovação dos Watches (a cada 6h)

### O que é

O Google limita watches a **7 dias**. Se o watch expirar, o Chatfunnel para de receber notificações e o calendário fica dessincronizado silenciosamente. O cron garante que watches sejam renovados antes de expirar.

### Fluxo

```
@Cron('0 */6 * * *')  → a cada 6 horas
  ↓
CalendarService.renewWatches()  [chatfunnel-services]
  ↓
WatchCalendarsHandler.execute()  [chatfunnel-core]
  ↓
  [a] Carrega todas as agendas com calendarId definido
      → filtra: provider === 'GOOGLE' ou sem provider
  ↓
  [b] Para cada agenda, verifica:
      watchExpiry < agora + 24h ?
        → SIM: renovar
        → NÃO: pular
  ↓
  [c] Para o canal antigo no Google:
      GoogleCalendarApiService.stopWatchCalendar(watchGoogleId, watchResourceId)
      → erros são absorvidos (canal pode já ter expirado)
  ↓
  [d] Cria novo canal:
      channelId = novo UUID
      GoogleCalendarApiService.watchCalendar(calendarId, channelId, webhookUrl)
        → expiration = agora + 7 dias
  ↓
  [e] Salva no DB:
      GoogleCalendarsRepository.updateWatchFields(calendarId, {
        watchGoogleId: channelId,
        watchResourceId: response.resourceId,
        watchExpiry: response.expiration
      })
  ↓
  Retorna: { renewed: N, skipped: N, failed: N }
```

### Lógica de janela

| Parâmetro | Valor |
|---|---|
| Expiração do watch | 7 dias |
| Frequência do cron | 6 horas |
| Janela de antecipação | 24 horas |

O watch nunca fica sem cobertura: o cron verifica 4x por dia e renova com 24h de antecedência.

### Arquivos principais

```
chatfunnel-services/src/modules/calendar/services/calendar.service.ts  (cron)
chatfunnel-core/src/services/calendar/handlers/watch-calendars.handler.ts
```

---

## Mecanismo 3 — Sync Bidirecional na Migração

### O que é

Quando uma agenda muda de **NATIVE → GOOGLE** (ou troca de `calendarId`), o sistema faz um sync completo em dois sentidos para não perder eventos existentes.

### Trigger

`PUT /nest/google_calendars/:id` quando:
- A agenda não tinha `googleConnectionId` antes (era NATIVE)
- Ou o `calendarId` do Google mudou

### Fluxo

```
UpdateGoogleCalendarHandler.execute()
  ↓
  [a] Salva a atualização no DB primeiro
  ↓
  [b] Detecta migração:
      migratingToGoogle = (!tinhaGoogleConnection || calendarIdMudou)
  ↓
  [c] Dispara syncCalendar() em background (async, non-blocking)
  ↓
  syncCalendar():
    ↓
    [DB → Google] push de eventos existentes:
      busca GoogleCalendarEvents onde:
        - startAt >= hoje
        - startAt <= hoje + 1 ano
        - isCancelled = false
        - googleEventId = null (ainda não estão no Google)
      para cada um:
        GoogleCalendarApiService.createEvent(...)
        → salva googleEventId retornado no DB
    ↓
    [Google → DB] import de eventos do Google:
      GoogleCalendarApiService.listEvents(calendarId, { timeMin: hoje, timeMax: +1 ano })
      para cada evento não presente no DB (por googleEventId):
        GoogleCalendarEventsRepository.upsertByGoogleEventId(...)
    ↓
    [Setup watch] watchCalendar(calendarId, novoChannelId, webhookUrl)
      → salva watchGoogleId, watchResourceId, watchExpiry no DB
```

### Desconexão do Google

Se a agenda for desconectada do Google:
```
stopWatch():
  GoogleCalendarApiService.stopWatchCalendar(watchGoogleId, watchResourceId)
  GoogleCalendarsRepository.clearWatchFields(calendarId)
  → watchGoogleId, watchResourceId, watchExpiry setados para null
```

### Arquivo principal

```
chatfunnel-services/src/modules/google_calendars/commands/update/handler.ts
```

---

## Mecanismo 4 — Agendamento via IA

### O que é

Quando um agente de IA (via WhatsApp/Instagram) faz um agendamento, ele escreve diretamente no banco e opcionalmente cria o evento no Google Calendar.

### Fluxo

```
Mensagem WhatsApp/Instagram chega
  ↓
chatfunnel-api webhook processor
  ↓
AgentSessionWorker (BullMQ)
  ↓
LLM retorna tool call:
  {
    name: "create_google_calendar_event",
    arguments: { date, email, googleCalendarId? }
  }
  ↓
AgentToolExecutor → AgentCalendarToolExecutor.createEvent()
  ↓
  [a] Resolve qual calendário usar:
      - SPECIFIC: lê Redis key "selected_calendar:{contactId}" (TTL 24h)
      - UNIFIED: usa todos os calendários do agente
  ↓
  [b] Verifica disponibilidade:
      - NATIVE: query no DB por eventos no range
      - GOOGLE: Google Calendar API listEvents()
      → calcula slots livres respeitando availableSlots (horários por dia da semana)
  ↓
  [c] Valida o slot pedido:
      slot encontrado na lista de disponíveis?
        → NÃO: retorna erro + próximos 50 slots disponíveis
  ↓
  [d] Detecta reagendamento:
      eventsRepo.findRecentCancelledByContact(contactId, 24h)
        → isReschedule = true se encontrado
  ↓
  [e] Cria evento no DB:
      GoogleCalendarEventsRepository.createNative({
        googleCalendarId, contactId, agentId, conversationId,
        accountId, email,
        title: processTemplate(agent.eventTitle),
        description: processTemplate(agent.eventDescription),
        startAt, endAt,
        eventKey: `scheduling:{email}:{date.toISOString()}:calendar_data`,
        isReschedule, isCancelled: false
      })
  ↓
  [f] Se GOOGLE: cria no Google Calendar também:
      GoogleCalendarApiService.createEvent(calendarId, {
        summary: title, description,
        start: { dateTime: startAt },
        end: { dateTime: endAt },
        attendees: [{ email }],
        conferenceData: { createRequest: ... }  ← Google Meet
      })
      → salva googleEventId e meetingLink no registro criado
  ↓
  [g] Agenda lembretes:
      para cada reminder configurado no agente:
        insere GoogleCalendarEventScheduledReminders
        enqueue BullMQ job com delay calculado
  ↓
  [h] Notifica assinantes:
      se cal.notifyOnCreation === true:
        envia email para GoogleCalendarSubscribers
  ↓
  Retorna ao LLM: { status: true, message, eventId, link }
```

### O que é salvo no banco (`GoogleCalendarEvents`)

| Campo | NATIVE | GOOGLE |
|---|---|---|
| `id` | UUID auto | UUID auto |
| `googleEventId` | `null` | ID do Google Calendar |
| `eventKey` | `scheduling:{email}:{date}:calendar_data` | idem |
| `accountId` | ✓ | ✓ |
| `googleCalendarId` | ✓ | ✓ |
| `contactId` | ✓ | ✓ |
| `agentId` | ✓ | ✓ |
| `conversationId` | ✓ | ✓ |
| `email` | ✓ | ✓ |
| `title` | template processado | template processado |
| `description` | template processado | template processado |
| `startAt` | ✓ | ✓ |
| `endAt` | `startAt + slotDuration` | `startAt + slotDuration` |
| `meetingLink` | `null` | link Google Meet |
| `isReschedule` | se cancelou nas últimas 24h | idem |
| `isCancelled` | `false` | `false` |

### Arquivo principal

```
chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/tools/calendar/AgentCalendarToolExecutor.ts
```

---

## Fluxo de OAuth

Toda chamada à Google Calendar API passa por:

```
GoogleCalendarApiService.getAuthenticatedClient(googleConnection)
  ↓
  OAuth2Client.setCredentials({
    access_token, refresh_token, expiry_date
  })
  ↓
  Se access_token expirado:
    OAuth2Client.refreshAccessToken()
    → salva novo access_token + expiry_date no DB (GoogleConnections)
  ↓
  Retorna cliente autenticado pronto para uso
```

O refresh é transparente e automático. O token atualizado é sempre persistido de volta.

---

## Frontend — Atualização em Tempo Real

```
HandleWebhookHandler.execute()
  ↓
  POST {CHATFUNNEL_API_URL}/socket
  body: { type: 'calendar:updated', payload: { accountId } }
  ↓
  chatfunnel-api Express → emite Socket.IO para room accountId
  ↓
  chatfunnel-front/src/views/calendar/index.vue
  → escuta evento 'calendar:updated'
  → chama loadEvents() → FullCalendar re-renderiza
```

> **Atenção:** o relay `POST /socket` não tem retry. Se a API Express estiver fora, o frontend não atualiza em tempo real — mas o banco já está correto. Na próxima vez que o usuário abrir o calendário, os dados estarão atualizados.

---

## Tabelas do Banco Envolvidas

| Tabela | Papel |
|---|---|
| `GoogleCalendars` | Agenda — config, watch fields, provider, availableSlots |
| `GoogleCalendarEvents` | Eventos — criados por IA, por humano ou sincronizados do Google |
| `GoogleCalendarEventScheduledReminders` | Lembretes agendados por evento |
| `GoogleCalendarSubscribers` | Emails notificados na criação de eventos |
| `GoogleCalendarAvailableSlots` | Janelas de disponibilidade por dia da semana |
| `GoogleConnections` | Credenciais OAuth por conta |

---

## Gotchas e Riscos

| Situação | Impacto |
|---|---|
| Watch expirado sem renovação | Google para de enviar webhooks silenciosamente — sem fallback de polling |
| `CHATFUNNEL_API_URL/socket` fora do ar | Usuário não vê atualização em tempo real, mas dado está correto no banco |
| Webhook sem rate limiting / IP whitelist | Endpoint público protegido só por token estático |
| `NATIVE` sem `googleConnectionId` | Nunca deve chamar a Google API — checar sempre `provider === 'GOOGLE' && googleConnectionId != null` |
| Dois stacks paralelos (AgentCalendarToolExecutor + HandlerAssistantGoogleCalendar.js) | Lógica de provider replicada — inconsistência: API path checa `!cal.provider`, IA path checa `!cal.googleConnectionId` |
| Cancelamento é sempre soft delete | Queries de listagem devem sempre filtrar `isCancelled: false` |

---

## Arquivos-Chave por Camada

```
chatfunnel-services/
  src/modules/calendar/
    controllers/calendar.controller.ts        ← POST /nest/calendar/webhook (sem auth)
    services/calendar.service.ts              ← @Cron('0 */6 * * *')
  src/modules/google_calendars/
    commands/update/handler.ts                ← sync migração NATIVE→GOOGLE

chatfunnel-core/
  src/services/calendar/
    handlers/
      handle-webhook.handler.ts               ← recebe webhook, upsert, relay socket
      watch-calendars.handler.ts              ← renova watch channels
      create-event.handler.ts                 ← path humano (NestJS UI)
    providers/
      calendar-provider.factory.ts            ← NATIVE vs GOOGLE decision (path humano)
      native-calendar.provider.ts
      google-calendar.provider.ts
    google-calendar-api.service.ts            ← OAuth, listEvents, watchCalendar, createEvent

  src/repositories/
    google_calendar_events.repository.ts      ← upsertByGoogleEventId, createNative, markCancelled
    google_calendars.repository.ts            ← updateWatchFields, clearWatchFields, findAllWithCalendarId

chatfunnel-api/
  src/commands/instagram/WebHookHandler/processor/agents-v2/tools/calendar/
    AgentCalendarToolExecutor.ts              ← path IA (create, cancel, getSlots, search)
  src/commands/instagram/WebHookHandler/processor/fragments/
    HandlerAssistantGoogleCalendar.js         ← legacy OpenAI assistants (mesmo comportamento, JS)
```
