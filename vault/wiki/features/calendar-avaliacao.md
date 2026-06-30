---
title: Calendar — Avaliação e Melhorias
description: Análise crítica da arquitetura atual do módulo Calendar, pontos fortes, fragilidades e roadmap de melhorias priorizadas.
tags: [calendar, arquitetura, avaliacao, melhorias, refactor]
related: ["[[calendar]]", "[[calendar-permissions]]"]
last_updated: 2026-06-24
---

# Calendar — Avaliação e Melhorias

> **Documento complementar a [[calendar]].**
> Este artigo não descreve o que existe — descreve o que funciona bem, o que é frágil, e o que vale mudar.

---

## O que é o módulo (resumo executivo)

O Calendar é o módulo de agendamento do ChatFunnel. Ele permite que a conta crie **agendas** e **eventos**, com suporte a dois modos de operação:

- **Nativo (NATIVE):** eventos vivem apenas no banco. Simples, sem dependência externa.
- **Google Calendar (GOOGLE):** eventos são espelhados na Google Calendar API via OAuth. Mudanças feitas diretamente no Google Calendar do usuário são sincronizadas de volta para o ChatFunnel via **webhook push**.

Além de agendamentos manuais, o módulo suporta **agendamento via IA** — agentes podem criar eventos automaticamente em agendas configuradas, com distribuição de carga entre múltiplas agendas via `AssistantGoogleCalendars.distributionPercentage`.

A stack é: **FullCalendar (Vue 3)** no front → **NestJS** como gateway → **handlers isolados no core** → **PostgreSQL via Prisma**.

---

## Nota geral: 6/10

Funciona bem para o caso atual e a estrutura interna do backend é sólida. As fragilidades estão concentradas em três áreas: **resiliência** (falhas silenciosas), **estado no front** (sem store) e **extensibilidade** (lógica de provider hardcoded).

---

## O que está bem feito

### Handler pattern no core

Cada operação é um arquivo isolado:

```
chatfunnel-core/src/services/calendar/handlers/
  create-event.handler.ts
  update-event.handler.ts
  delete-event.handler.ts
  list-events.handler.ts
  handle-webhook.handler.ts
  watch-calendars.handler.ts
```

**Por que é bom:** fácil de encontrar, fácil de testar unitariamente, sem acoplamento entre operações. É o padrão certo para lógica de negócio com múltiplos fluxos condicionais.

### NestJS service como delegador puro

O `CalendarService` do NestJS não tem lógica — só repassa para o core. Isso mantém o core agnóstico de framework e reutilizável por outros pontos de entrada (ex: workers, CLI).

### Soft delete consistente

Eventos nunca são deletados fisicamente — apenas `isCancelled: true`. Isso é correto para um módulo de agendamento: lembretes agendados, histórico de interações com contatos e auditoria dependem do evento existir mesmo após cancelamento.

### Permissões granulares

Cada ação tem uma permissão separada (`ADD_CALENDAR_EVENT`, `MOVE_CALENDAR_EVENT`, `CONFIGURE_CALENDAR`, etc.). O front bloqueia a UI com precisão — não é um flag binário "tem acesso ao calendar ou não".

### Renovação automática de watch channels

O cron `0 */6 * * *` renova os watches do Google antes que expirem. Sem isso, o webhook push pararia de funcionar silenciosamente depois de alguns dias.

---

## Problemas sérios

### 1. Webhook sem autenticação — risco de segurança

**O que acontece:** `POST /nest/calendar/webhook` não usa `AuthGuard`. A única proteção é validar o header `x-goog-channel-token` contra `GOOGLE_WEBHOOK_CHANNEL_TOKEN`.

**Por que é arriscado:** qualquer pessoa com acesso a esse token pode:
- Acionar sincronização em massa de eventos de qualquer conta
- Causar um número elevado de chamadas à Google Calendar API (rate limit)
- Fazer o servidor processar payloads arbitrários

**O que mudar:**
```typescript
// Adicionar rate limiting por IP
@UseGuards(RateLimitGuard)
// Validar que a origem é o IP range oficial do Google
// https://www.gstatic.com/ipranges/goog.json
@Post('webhook')
async handleWebhook(@Headers() headers, @Body() body) { ... }
```
No mínimo, adicionar `throttler` com limite apertado (ex: 60 req/min por IP).

---

### 2. Falha silenciosa no relay de socket

**O que acontece:** após processar o webhook, o `HandleWebhookHandler` notifica o front via:

```
HandleWebhookHandler
  └─ POST {CHATFUNNEL_API_URL}/socket  →  { accountId, type: 'calendar:updated' }
```

Se a API Express estiver down ou `CHATFUNNEL_API_URL` não estiver configurado, o código faz `console.error` e segue em frente. O usuário não vê os eventos atualizados até dar F5.

**Por que é sério:** numa feature de agendamento, o usuário que acabou de confirmar uma reunião no Google espera ver a confirmação aparecer em tempo real. Falha silenciosa aqui parece um bug — o evento some e não volta.

**O que mudar:**
```typescript
// Adicionar retry com backoff exponencial
async notifyFrontend(accountId: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await this.httpService.post(`${process.env.CHATFUNNEL_API_URL}/socket`, {
        accountId,
        type: 'calendar:updated',
      }).toPromise();
      return;
    } catch (err) {
      this.logger.warn(`Socket relay attempt ${attempt + 1} failed`, err.message);
      await sleep(200 * 2 ** attempt); // 200ms, 400ms, 800ms
    }
  }
  this.logger.error('Socket relay failed after 3 attempts', { accountId });
}
```

---

### 3. Todo o estado vive no `index.vue`

**O que acontece:** não há Pinia store para o Calendar. Eventos, colaboradores e loading state vivem exclusivamente no componente `index.vue`.

**Consequências:**
- Navegar para outra rota destrói o estado → ao voltar, faz fetch completo de novo
- Impossível acessar dados do calendar de outro componente (ex: widget de próximos eventos no Dashboard) sem re-fetch
- Difícil testar o comportamento do estado isolado do componente visual

**O que mudar:** criar `stores/calendar.ts`:

```typescript
export const useCalendarStore = defineStore('calendar', () => {
  const events = ref<CalendarEvent[]>([])
  const collaborators = ref<Collaborator[]>([])
  const selectedCollaboratorIds = ref<string[]>(
    JSON.parse(localStorage.getItem(`calendar_selected_collaborators_${accountId}`) ?? '[]')
  )

  async function loadEvents(startDate: string, endDate: string) { ... }
  async function loadCollaborators() { ... }
  async function createEvent(payload: CreateEventPayload) { ... }
  async function deleteEvent(id: string) { ... }

  return { events, collaborators, selectedCollaboratorIds, loadEvents, ... }
})
```

O `index.vue` fica responsável só pela renderização e pelos event handlers do FullCalendar.

---

## Fragilidades estruturais

### 4. Dual provider sem abstração

**O que acontece:** a lógica de `NATIVE` vs `GOOGLE` está espalhada como `if/else` em cada handler:

```typescript
// create-event.handler.ts
if (calendar.provider === 'NATIVE') {
  await this.eventsRepo.create({ ...payload, eventKey: uuid() });
} else {
  const googleEvent = await this.googleApi.createEvent(...);
  await this.eventsRepo.upsertByGoogleEventId(googleEvent.id, ...);
}
```

**Por que cresce mal:** adicionar um terceiro provider (Outlook, Calendly) exige editar todos os handlers. O comportamento de cada provider está diluído em vários arquivos.

**O que mudar:** extrair uma interface de provider:

```typescript
interface ICalendarProvider {
  createEvent(payload: CreateEventPayload): Promise<CalendarEvent>
  updateEvent(id: string, payload: UpdateEventPayload): Promise<CalendarEvent>
  deleteEvent(id: string): Promise<void>
}

class NativeCalendarProvider implements ICalendarProvider { ... }
class GoogleCalendarProvider implements ICalendarProvider { ... }

// Handler fica agnóstico de provider
const provider = CalendarProviderFactory.create(calendar)
const event = await provider.createEvent(payload)
```

---

### 5. `CalendarService.js` é JavaScript puro

**O que acontece:** o único service do front para o Calendar não tem tipos. Qualquer parâmetro errado só explode em runtime.

```javascript
// CalendarService.js — sem tipos
static async createEvent(payload) {
  return Api.post('/nest/calendar/events', payload)
}
```

**O que mudar:** renomear para `.ts` e tipar com os contratos do backend:

```typescript
import type { CreateCalendarEventDto, CalendarEvent } from '@/types/calendar'

static async createEvent(payload: CreateCalendarEventDto): Promise<CalendarEvent> {
  return Api.post('/nest/calendar/events', payload)
}
```

---

### 6. Race condition no drag-and-drop

**O que acontece:** `handleEventDragStop` usa `setTimeout(50ms)` para decidir se abre o `EventDialog`. O `handleEventDrop` cancela isso setando `preDragEventStart = null`.

```javascript
// index.vue — frágil
handleEventDragStop(info) {
  setTimeout(() => {
    if (this.preDragEventStart !== null) {
      this.openEventDialog(info.event) // abre dialog se não foi um drop real
    }
  }, 50)
},
handleEventDrop(info) {
  this.preDragEventStart = null // cancela o dialog
  this.updateEvent(info.event)
}
```

Se o servidor demorar mais que 50ms para confirmar o drop (ou rejeitar), o dialog pode abrir sobre um evento em estado inconsistente.

**O que mudar:** usar uma flag de estado explícita, não tempo:

```typescript
const isDroppingEvent = ref(false)

function handleEventDrop(info) {
  isDroppingEvent.value = true
  updateEvent(info.event).finally(() => {
    isDroppingEvent.value = false
  })
}

function handleEventDragStop(info) {
  if (!isDroppingEvent.value) {
    openEventDialog(info.event)
  }
}
```

---

### 7. Watch channel: janela de risco em downtime

**O que acontece:** o cron roda a cada 6h e renova watches com menos de 24h de vida. Se o servidor ficar offline por mais de 6h seguidas, parte dos calendários perde o push do Google sem auto-recovery.

**O que mudar:** ao reiniciar o módulo, verificar e renovar watches expirados antes de aceitar tráfego:

```typescript
async onModuleInit() {
  await this.watchCalendarsHandler.renewExpiredWatches()  // força renovação no startup
  await this.assignMissingColors()
}
```

---

### 8. `onModuleInit` com query em todas as contas

**O que acontece:** na inicialização do `GoogleCalendarsService`, uma query busca todas as agendas sem cor em todas as contas e atribui cores. Em produção com muitas contas, isso aumenta o tempo de cold start do NestJS.

**O que mudar:** mover a atribuição de cor para o momento da criação da agenda (no handler de criação), não na inicialização do módulo. O `onModuleInit` passa a ser uma migração one-time protegida por feature flag.

---

## Roadmap priorizado

### Imediato — segurança e bugs em produção

| # | O que | Arquivo alvo | Por que agora |
|---|-------|-------------|---------------|
| 1 | Retry + log estruturado no relay de socket | `handle-webhook.handler.ts` | Falha silenciosa afeta UX em produção hoje |
| 2 | Rate limiting no endpoint de webhook | `calendar.controller.ts` | Risco de abuso com custo de implementação baixo |
| 3 | Renovação de watches no `onModuleInit` | `google_calendars.service.ts` | Downtime > 6h quebra sync sem recovery automático |

### Curto prazo — dívida técnica que cresce

| # | O que | Arquivo alvo | Por que |
|---|-------|-------------|---------|
| 4 | Criar `useCalendarStore` (Pinia) | `stores/calendar.ts` (novo) | Estado destruído a cada navegação; impossível compartilhar entre componentes |
| 5 | Tipar `CalendarService.js` → `.ts` | `common/services/CalendarService.js` | Único arquivo JS num projeto TS; ponto cego para refatorações |
| 6 | Corrigir race condition do drag-and-drop | `views/calendar/index.vue` | Bug latente que aparece em conexões lentas |

### Médio prazo — extensibilidade

| # | O que | Arquivo alvo | Por que |
|---|-------|-------------|---------|
| 7 | Interface `ICalendarProvider` + factory | `core/services/calendar/providers/` (novo) | Isola NATIVE/GOOGLE; permite adicionar Outlook sem tocar handlers existentes |
| 8 | Mover cor para handler de criação | `create-google-calendar.handler.ts` | Remove side effect no `onModuleInit`; melhora cold start |

---

## Resumo visual

```
BACKEND                              FRONTEND
┌──────────────────────────────┐    ┌──────────────────────────────┐
│ Handler pattern      ✓ bom   │    │ FullCalendar integrado ✓ bom │
│ NestJS delegador     ✓ bom   │    │ Permissões granulares  ✓ bom │
│ Soft delete          ✓ bom   │    │                              │
│ Cron de watch        ✓ bom   │    │ Sem Pinia store        ✗ dívida│
│                              │    │ CalendarService.js     △ sem tipos│
│ Webhook sem auth     ✗ risco │    │ Race condition drag    △ bug latente│
│ Relay socket mudo    ✗ bug   │    └──────────────────────────────┘
│ Dual provider if/else △ dívida│
│ Watch downtime risk  △ frágil│
└──────────────────────────────┘
```

---

## Referências

- Documento descritivo completo: [[calendar]]
- Permissões detalhadas: [[calendar-permissions]]
- Código frontend: `chatfunnel-front/src/views/calendar/`
- Handlers core: `chatfunnel-core/src/services/calendar/handlers/`
- Controller NestJS: `chatfunnel-services/src/modules/calendar/controllers/calendar.controller.ts`
- Webhook handler: `chatfunnel-core/src/services/calendar/handlers/handle-webhook.handler.ts`
- Schema Prisma: modelos `GoogleCalendars`, `GoogleCalendarEvents`
