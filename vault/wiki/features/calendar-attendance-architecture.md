---
title: Calendar — Show, No-show e Cancelamento
description: Arquitetura proposta para registrar presença em agendamentos e cancelar eventos pelo menu de contexto do calendário.
tags: [calendar, attendance, show, no-show, google-calendar, architecture]
related: ["[[calendar]]", "[[calendar-sync-google]]", "[[calendar-permissions]]"]
last_updated: 2026-07-23
---

# Calendar — Show, No-show e Cancelamento

## Objetivo

Adicionar um menu de contexto ao evento do calendário com três ações:

- **Compareceu:** registra o agendamento como `SHOW`.
- **Não compareceu:** registra o agendamento como `NO_SHOW`.
- **Cancelar:** remove o evento da agenda visível, cancela os efeitos internos e, quando a agenda for Google, exclui também o evento no Google Calendar.

Esta proposta corresponde à Task #101 do módulo Calendar.

## Decisões principais

1. **Presença e cancelamento são conceitos diferentes.**
   - Presença descreve o resultado do atendimento.
   - Cancelamento descreve o ciclo de vida do evento.
2. **Show/no-show é metadado interno do ChatFunnel.**
   - Não altera título, descrição ou status do evento no Google.
   - Não deve ser sobrescrito por sincronizações recebidas do Google.
3. **Cancelamento continua sendo soft delete local.**
   - O registro permanece no banco com `isCancelled: true`.
   - O evento deixa de aparecer porque a listagem filtra cancelados.
   - Em agendas Google, a exclusão também é enviada à Google Calendar API.
4. **Toda operação é multi-tenant:** leituras e escritas usam `id + accountId`.
5. **A API é a fonte de verdade:** o frontend só confirma a mudança após resposta do backend.

## Estado de domínio

### Presença

Criar um enum explícito:

```prisma
enum CalendarEventAttendanceStatus {
  PENDING
  SHOW
  NO_SHOW
}
```

Adicionar em `GoogleCalendarEvents`:

```prisma
attendanceStatus     CalendarEventAttendanceStatus @default(PENDING)
attendanceRecordedAt DateTime?
attendanceRecordedBy String?                       @db.Uuid
```

`attendanceRecordedBy` registra o usuário/moderador que realizou a ação. Se houver relação Prisma, usar `onDelete: SetNull`.

### Cancelamento

Reutilizar:

```prisma
isCancelled Boolean   @default(false)
cancelledAt DateTime?
```

Recomenda-se acrescentar `cancelledBy String? @db.Uuid`.

O cancelamento não deve fazer parte de `attendanceStatus`. Isso evita usar `NO_SHOW` para um evento cancelado antes de acontecer.

### Auditoria recomendada

Manter um snapshot no evento e um histórico:

```prisma
model GoogleCalendarEventAttendanceHistory {
  id              String                        @id @default(uuid()) @db.Uuid
  accountId       String                        @db.Uuid
  calendarEventId String                        @db.Uuid
  previousStatus  CalendarEventAttendanceStatus
  newStatus       CalendarEventAttendanceStatus
  changedBy       String?                       @db.Uuid
  createdAt       DateTime                      @default(now())
}
```

O snapshot facilita filtros e relatórios; o histórico preserva auditoria.

## Regras de negócio

### Marcar presença

- Apenas eventos não cancelados recebem `SHOW` ou `NO_SHOW`.
- O evento precisa pertencer ao `accountId` selecionado.
- A ação exige permissão específica.
- Recomendação: permitir marcação somente a partir de `startAt`.
- Repetir o mesmo status deve ser idempotente.
- Trocar `SHOW ↔ NO_SHOW` é permitido e gera histórico.
- Um evento cancelado nunca volta a ativo por uma ação de presença.

### Cancelar evento

- Exige confirmação visual.
- Reutiliza o endpoint de cancelamento existente.
- Em agenda `NATIVE`, executa soft delete local.
- Em agenda `GOOGLE`, exclui no Google e depois executa soft delete local.
- Cancela lembretes pendentes relacionados ao evento.
- Não aparece como opção para evento já cancelado.

### Falha na exclusão do Google

O comportamento atual absorve o erro do Google e cancela localmente, podendo deixar o evento visível no Google e oculto no ChatFunnel.

Política recomendada:

1. Tentar excluir no Google.
2. Tratar `404` ou evento já cancelado como sucesso idempotente.
3. Em erro temporário, autenticação ou rate limit, não cancelar localmente e retornar erro.
4. Executar o soft delete local somente após sucesso ou confirmação de inexistência no Google.

Retry assíncrono com outbox pode ser uma evolução posterior.

## API proposta

### Registrar presença

```http
PATCH /nest/calendar/events/:id/attendance
```

Body:

```json
{
  "status": "SHOW"
}
```

Valores aceitos: `SHOW` e `NO_SHOW`.

Resposta:

```json
{
  "id": "event-id",
  "attendanceStatus": "SHOW",
  "attendanceRecordedAt": "2026-07-23T15:30:00.000Z",
  "attendanceRecordedBy": "user-id"
}
```

### Cancelar

Manter:

```http
DELETE /nest/calendar/events/:id
```

### Endpoint dedicado

Não reutilizar `PUT /events/:id`. O update atual edita título, descrição e horário, sincronizando esses dados com o Google. Presença possui autorização, validação e auditoria próprias.

## Backend

### `chatfunnel-services`

Adicionar:

- `UpdateCalendarEventAttendanceDto` com `@IsEnum(CalendarEventAttendanceStatus)`;
- `PATCH /calendar/events/:id/attendance` no `CalendarController`;
- método delegador no `CalendarService`;
- identificação do usuário autenticado para `attendanceRecordedBy`.

Manter `AuthGuard('jwt')`, `ModeratorAuthGuard` e `Account-Selected`.

### `chatfunnel-core`

Adicionar:

- `UpdateEventAttendanceHandler`;
- `updateEventAttendance()` na fachada `CalendarService`;
- método transacional no `GoogleCalendarEventsRepository`;
- histórico na mesma transação do update.

```text
PATCH attendance
  → validar DTO
  → resolver accountId e actorId
  → findByIdAndAccountId(id, accountId)
  → rejeitar evento inexistente ou cancelado
  → validar startAt
  → atualizar snapshot
  → inserir histórico
  → retornar estado atualizado
```

Toda query exposta pela API deve incluir `accountId`.

### Listagem

O `ListEventsHandler` deve incluir em `extendedProps`:

```ts
{
  attendanceStatus,
  attendanceRecordedAt,
  attendanceRecordedBy
}
```

Assim o frontend renderiza o indicador e monta o menu sem buscar detalhes adicionais.

### Webhook do Google

O webhook pode atualizar título, descrição, datas, meeting link e cancelamento externo. Não deve alterar:

- `attendanceStatus`;
- `attendanceRecordedAt`;
- `attendanceRecordedBy`.

Se o Google cancelar externamente, preservar o histórico de presença no registro local cancelado.

## Frontend

### Captura do botão direito

Usar hooks do FullCalendar:

- `eventDidMount`: adicionar listener `contextmenu`;
- `eventWillUnmount`: remover o listener;
- `preventDefault()`: impedir o menu do navegador.

O handler guarda evento e coordenadas `clientX/clientY`.

### Componente

Criar:

```text
views/calendar/components/EventContextMenu.vue
```

Responsabilidades:

- posicionar o menu;
- exibir apenas ações autorizadas;
- emitir `mark-show`, `mark-no-show` e `cancel`;
- fechar ao clicar fora, pressionar `Escape`, trocar de view ou recarregar;
- bloquear ações durante requisições.

Usar shadcn-vue, preferencialmente `DropdownMenu`, sem PrimeVue ou Vuetify.

### Fluxo de presença

```text
Botão direito
  → Compareceu ou Não compareceu
  → CalendarService.updateAttendance(id, status)
  → loadEvents()
  → toast
  → fechar menu
```

### Fluxo de cancelamento

```text
Botão direito
  → Cancelar
  → confirmação
  → CalendarService.deleteEvent(id)
  → excluir no Google quando aplicável
  → soft delete local
  → loadEvents()
  → toast
```

A confirmação deve informar que o evento será removido do ChatFunnel e do Google Calendar conectado.

### Indicadores

- `PENDING`: sem indicador.
- `SHOW`: badge ou ícone verde.
- `NO_SHOW`: badge ou ícone vermelho.

Não substituir a cor da agenda, que já identifica o colaborador.

## Permissões

Adicionar:

```text
MARK_EVENT_ATTENDANCE
```

| Ação | Permissão |
|---|---|
| Compareceu | `MARK_EVENT_ATTENDANCE` |
| Não compareceu | `MARK_EVENT_ATTENDANCE` |
| Cancelar | `DELETE_EVENT` |

Não reutilizar `EDIT_EVENT`, pois edição e registro do resultado são responsabilidades diferentes.

## Concorrência e idempotência

- Bloquear duplo clique no frontend.
- Repetir o mesmo status retorna sucesso sem duplicar histórico.
- Trocas reais de status criam histórico.
- `404` do Google durante cancelamento é sucesso idempotente.
- Presença e cancelamento concorrentes validam o estado dentro de transação.

## Lembretes

Ao cancelar:

- marcar lembretes `PENDING` como `CANCELED`;
- cancelar jobs agendados quando houver identificador;
- preservar lembretes já enviados;
- manter notificações de cancelamento configuradas na agenda.

Show e no-show não cancelam lembretes retroativamente.

## Métricas futuras

- taxa de comparecimento por agenda e colaborador;
- taxa de no-show por período;
- eventos ainda sem classificação;
- origem por agente, contato ou conversa;
- tempo entre o evento e o registro da presença.

As consultas devem sempre usar `accountId` e excluir cancelados das métricas de comparecimento.

## Arquivos impactados futuramente

### Front

- `chatfunnel-front/src/views/calendar/index.vue`
- `chatfunnel-front/src/views/calendar/components/EventContextMenu.vue`
- `chatfunnel-front/src/common/services/CalendarService.js`
- `chatfunnel-front/src/views/configuration/permissions/PermissionsFactory.js`

### Services

- `chatfunnel-services/src/modules/calendar/controllers/calendar.controller.ts`
- `chatfunnel-services/src/modules/calendar/services/calendar.service.ts`
- `chatfunnel-services/src/modules/calendar/dto/update-calendar-event-attendance.dto.ts`

### Core

- `chatfunnel-core/prisma/schema.prisma`
- `chatfunnel-core/src/services/calendar/calendar.service.ts`
- `chatfunnel-core/src/services/calendar/types.ts`
- `chatfunnel-core/src/services/calendar/handlers/update-event-attendance.handler.ts`
- `chatfunnel-core/src/services/calendar/handlers/delete-event.handler.ts`
- `chatfunnel-core/src/services/calendar/handlers/list-events.handler.ts`
- `chatfunnel-core/src/repositories/google_calendar_events.repository.ts`
- `chatfunnel-core/src/repositories/google_calendar_event_scheduled_reminders.repository.ts`

## Fases sugeridas

### Fase 1 — Persistência e API

- adicionar enum, campos e histórico;
- criar endpoint de presença;
- endurecer consistência do cancelamento Google;
- incluir presença na listagem.

### Fase 2 — Menu de contexto

- capturar botão direito;
- criar menu e confirmação;
- integrar permissões e feedback visual.

### Fase 3 — Indicadores e métricas

- exibir badges;
- adicionar filtros por presença;
- criar relatórios de show/no-show.

## Critérios arquiteturais de aceite

- Show e no-show persistem sem alterar o evento no Google.
- Cancelamento remove do Google antes do soft delete local.
- Eventos cancelados não aparecem na listagem.
- Sincronização Google não apaga presença registrada.
- Todas as queries usam `accountId`.
- Alterações de presença são auditáveis.
- Menu respeita permissões distintas.
- Repetição da mesma ação é idempotente.
