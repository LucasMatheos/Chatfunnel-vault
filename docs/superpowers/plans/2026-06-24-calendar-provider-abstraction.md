# Calendar Provider Abstraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extrair a lógica `if (provider === 'NATIVE') / else (GOOGLE)` dos handlers do Calendar em classes de provider isoladas, tornando os handlers agnósticos de provider e permitindo adicionar novos providers (Outlook, Calendly) sem tocar nos handlers existentes.

**Architecture:** Criar uma interface `ICalendarProvider` com 3 métodos (`createEvent`, `updateEvent`, `deleteExternalEvent`). Implementar `NativeCalendarProvider` e `GoogleCalendarProvider`. Um `CalendarProviderFactory` estático recebe o objeto `cal` e retorna o provider correto. Os handlers passam a chamar `factory.create(cal, ...)` e delegam sem branching.

**Tech Stack:** TypeScript (strict: false, noImplicitAny: false), Jest + @swc/jest, Prisma (via repositórios), googleapis v148.

---

## Estado atual

Os arquivos abaixo possuem `if (isNative) / else` inline que será removido:

| Arquivo | Linha da bifurcação |
|---------|---------------------|
| `src/services/calendar/handlers/create-event.handler.ts` | L28–74 |
| `src/services/calendar/handlers/update-event.handler.ts` | L28–77 |
| `src/services/calendar/handlers/delete-event.handler.ts` | L21–36 |

---

## File Map

```
chatfunnel-core/src/services/calendar/
├── providers/                               ← CRIAR (diretório novo)
│   ├── calendar-provider.interface.ts       ← CRIAR — contrato ICalendarProvider
│   ├── native-calendar.provider.ts          ← CRIAR — lógica NATIVE
│   ├── google-calendar.provider.ts          ← CRIAR — lógica GOOGLE
│   └── calendar-provider.factory.ts         ← CRIAR — escolhe o provider pelo cal.provider
├── handlers/
│   ├── create-event.handler.ts              ← MODIFICAR — remover if/else, usar factory
│   ├── update-event.handler.ts              ← MODIFICAR — remover if/else, usar factory
│   └── delete-event.handler.ts              ← MODIFICAR — remover if/else, usar factory
└── (demais arquivos não mudam)

chatfunnel-core/src/services/calendar/providers/__tests__/
├── native-calendar.provider.test.ts         ← CRIAR — testes do provider nativo
└── google-calendar.provider.test.ts         ← CRIAR — testes do provider Google
```

---

## Task 1: Interface ICalendarProvider

**Files:**
- Create: `src/services/calendar/providers/calendar-provider.interface.ts`

- [ ] **Step 1.1: Criar o arquivo de interface**

```typescript
// src/services/calendar/providers/calendar-provider.interface.ts
import { CreateCalendarEventInput, UpdateCalendarEventInput } from '../types';

export interface ICalendarProvider {
  createEvent(cal: any, accountId: string, dto: CreateCalendarEventInput): Promise<any>;
  updateEvent(cal: any, evt: any, dto: UpdateCalendarEventInput): Promise<any>;
  /**
   * Deletes the event from the external provider (Google, etc.).
   * NATIVE provider is a noop. Throws on failure — caller decides if fatal.
   */
  deleteExternalEvent(cal: any, evt: any): Promise<void>;
}
```

- [ ] **Step 1.2: Verificar que compila**

```bash
cd chatfunnel-core
npx tsc --noEmit
```

Expected: sem erros.

---

## Task 2: NativeCalendarProvider

**Files:**
- Create: `src/services/calendar/providers/native-calendar.provider.ts`
- Create: `src/services/calendar/providers/__tests__/native-calendar.provider.test.ts`

- [ ] **Step 2.1: Escrever os testes (failing)**

```typescript
// src/services/calendar/providers/__tests__/native-calendar.provider.test.ts
import { NativeCalendarProvider } from '../native-calendar.provider';

const mockEventsRepo = () => ({
  createNative: jest.fn(),
  updateById: jest.fn(),
});

describe('NativeCalendarProvider', () => {
  describe('createEvent', () => {
    it('chama createNative com os dados corretos e um eventKey UUID', async () => {
      const repo = mockEventsRepo();
      repo.createNative.mockResolvedValue({
        id: 'evt-1', title: 'Reunião', description: '',
        startAt: new Date('2026-06-24T10:00:00Z'),
        endAt: new Date('2026-06-24T11:00:00Z'),
        googleEventId: null, meetingLink: null,
      });

      const provider = new NativeCalendarProvider(repo as any);
      const cal = { id: 'cal-1' };
      const dto = { title: 'Reunião', start: '2026-06-24T10:00:00Z', end: '2026-06-24T11:00:00Z', collaboratorId: 'cal-1' };

      await provider.createEvent(cal, 'acc-1', dto);

      expect(repo.createNative).toHaveBeenCalledWith(expect.objectContaining({
        googleCalendarId: 'cal-1',
        accountId: 'acc-1',
        title: 'Reunião',
        description: '',
      }));

      const call = repo.createNative.mock.calls[0][0];
      // UUID v4 format
      expect(call.eventKey).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('usa string vazia quando description é undefined', async () => {
      const repo = mockEventsRepo();
      repo.createNative.mockResolvedValue({
        id: 'evt-1', title: 'Test', description: '',
        startAt: new Date(), endAt: new Date(), googleEventId: null, meetingLink: null,
      });

      const provider = new NativeCalendarProvider(repo as any);
      await provider.createEvent({ id: 'cal-1' }, 'acc-1', {
        title: 'Test', start: '2026-06-24T10:00:00Z', end: '2026-06-24T11:00:00Z', collaboratorId: 'cal-1',
      });

      expect(repo.createNative).toHaveBeenCalledWith(expect.objectContaining({ description: '' }));
    });
  });

  describe('updateEvent', () => {
    it('chama updateById com os novos valores', async () => {
      const repo = mockEventsRepo();
      const existingEvt = {
        id: 'evt-1', title: 'Antigo', description: 'desc',
        startAt: new Date('2026-06-24T10:00:00Z'),
        endAt: new Date('2026-06-24T11:00:00Z'),
      };
      repo.updateById.mockResolvedValue({ ...existingEvt, title: 'Novo' });

      const provider = new NativeCalendarProvider(repo as any);
      await provider.updateEvent({}, existingEvt, { title: 'Novo' });

      expect(repo.updateById).toHaveBeenCalledWith('evt-1', expect.objectContaining({
        title: 'Novo',
        description: 'desc',
        startAt: existingEvt.startAt,
        endAt: existingEvt.endAt,
      }));
    });
  });

  describe('deleteExternalEvent', () => {
    it('é noop — não lança e não chama nada', async () => {
      const repo = mockEventsRepo();
      const provider = new NativeCalendarProvider(repo as any);

      await expect(provider.deleteExternalEvent({}, {})).resolves.toBeUndefined();
      expect(repo.createNative).not.toHaveBeenCalled();
      expect(repo.updateById).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2.2: Rodar os testes — esperar FAIL**

```bash
cd chatfunnel-core
npx jest src/services/calendar/providers/__tests__/native-calendar.provider.test.ts --no-coverage
```

Expected: `Cannot find module '../native-calendar.provider'`

- [ ] **Step 2.3: Implementar NativeCalendarProvider**

```typescript
// src/services/calendar/providers/native-calendar.provider.ts
import { v4 as uuidv4 } from 'uuid';
import { GoogleCalendarEventsRepository } from '../../../repositories/google_calendar_events.repository';
import { CreateCalendarEventInput, UpdateCalendarEventInput } from '../types';
import { ICalendarProvider } from './calendar-provider.interface';

export class NativeCalendarProvider implements ICalendarProvider {
  constructor(
    private readonly googleCalendarEventsRepository: GoogleCalendarEventsRepository,
  ) {}

  async createEvent(cal: any, accountId: string, dto: CreateCalendarEventInput): Promise<any> {
    return this.googleCalendarEventsRepository.createNative({
      eventKey: uuidv4(),
      accountId,
      googleCalendarId: cal.id,
      title: dto.title,
      description: dto.description ?? '',
      startAt: new Date(dto.start),
      endAt: new Date(dto.end),
    });
  }

  async updateEvent(cal: any, evt: any, dto: UpdateCalendarEventInput): Promise<any> {
    return this.googleCalendarEventsRepository.updateById(evt.id, {
      title: dto.title ?? evt.title,
      description: dto.description ?? evt.description,
      startAt: dto.start ? new Date(dto.start) : evt.startAt,
      endAt: dto.end ? new Date(dto.end) : evt.endAt,
    });
  }

  async deleteExternalEvent(_cal: any, _evt: any): Promise<void> {
    // noop — NATIVE events have no external system to notify
  }
}
```

- [ ] **Step 2.4: Rodar os testes — esperar PASS**

```bash
npx jest src/services/calendar/providers/__tests__/native-calendar.provider.test.ts --no-coverage
```

Expected: `3 passed`

---

## Task 3: GoogleCalendarProvider

**Files:**
- Create: `src/services/calendar/providers/google-calendar.provider.ts`
- Create: `src/services/calendar/providers/__tests__/google-calendar.provider.test.ts`

- [ ] **Step 3.1: Escrever os testes (failing)**

```typescript
// src/services/calendar/providers/__tests__/google-calendar.provider.test.ts
import { GoogleCalendarProvider } from '../google-calendar.provider';
import { ValidationError } from '../../../../errors/domain-errors';

const mockEventsRepo = () => ({
  upsertByGoogleEventId: jest.fn(),
});

const mockConnectionsRepo = () => ({});

const mockGoogleApi = () => ({
  getAuthenticatedClient: jest.fn().mockResolvedValue('auth-client'),
  createEvent: jest.fn(),
  updateEvent: jest.fn(),
  deleteEvent: jest.fn(),
});

const calGoogle = {
  id: 'cal-1',
  calendarId: 'primary@google.com',
  provider: 'GOOGLE',
  googleConnection: { id: 'conn-1', tokens: { access_token: 'tok' } },
};

describe('GoogleCalendarProvider', () => {
  describe('createEvent', () => {
    it('lança ValidationError quando calendarId está ausente', async () => {
      const provider = new GoogleCalendarProvider(
        mockEventsRepo() as any,
        mockConnectionsRepo() as any,
        mockGoogleApi() as any,
      );

      await expect(
        provider.createEvent({ ...calGoogle, calendarId: null }, 'acc-1', {
          title: 'Test', start: '2026-06-24T10:00:00Z', end: '2026-06-24T11:00:00Z', collaboratorId: 'cal-1',
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('chama getAuthenticatedClient e createEvent na Google API', async () => {
      const eventsRepo = mockEventsRepo();
      const googleApi = mockGoogleApi();
      eventsRepo.upsertByGoogleEventId.mockResolvedValue({
        id: 'evt-1', googleEventId: 'g-evt-1', title: 'Reunião',
        description: '', startAt: new Date(), endAt: new Date(), meetingLink: null,
      });
      googleApi.createEvent.mockResolvedValue({ id: 'g-evt-1', hangoutLink: null });

      const provider = new GoogleCalendarProvider(
        eventsRepo as any,
        mockConnectionsRepo() as any,
        googleApi as any,
      );

      await provider.createEvent(calGoogle, 'acc-1', {
        title: 'Reunião', start: '2026-06-24T10:00:00Z', end: '2026-06-24T11:00:00Z', collaboratorId: 'cal-1',
      });

      expect(googleApi.getAuthenticatedClient).toHaveBeenCalledWith(
        calGoogle.googleConnection.tokens,
        calGoogle.googleConnection.id,
        expect.anything(),
      );
      expect(googleApi.createEvent).toHaveBeenCalledWith(
        'auth-client',
        'primary@google.com',
        expect.objectContaining({ summary: 'Reunião' }),
      );
      expect(eventsRepo.upsertByGoogleEventId).toHaveBeenCalledWith(
        'g-evt-1',
        expect.objectContaining({ googleEventId: 'g-evt-1', accountId: 'acc-1' }),
      );
    });
  });

  describe('deleteExternalEvent', () => {
    it('é noop quando calendarId está ausente', async () => {
      const googleApi = mockGoogleApi();
      const provider = new GoogleCalendarProvider(
        mockEventsRepo() as any, mockConnectionsRepo() as any, googleApi as any,
      );

      await provider.deleteExternalEvent({ ...calGoogle, calendarId: null }, { googleEventId: 'g-1' });

      expect(googleApi.deleteEvent).not.toHaveBeenCalled();
    });

    it('é noop quando googleEventId está ausente', async () => {
      const googleApi = mockGoogleApi();
      const provider = new GoogleCalendarProvider(
        mockEventsRepo() as any, mockConnectionsRepo() as any, googleApi as any,
      );

      await provider.deleteExternalEvent(calGoogle, { googleEventId: null });

      expect(googleApi.deleteEvent).not.toHaveBeenCalled();
    });

    it('chama deleteEvent na Google API', async () => {
      const googleApi = mockGoogleApi();
      googleApi.deleteEvent.mockResolvedValue(undefined);

      const provider = new GoogleCalendarProvider(
        mockEventsRepo() as any, mockConnectionsRepo() as any, googleApi as any,
      );

      await provider.deleteExternalEvent(calGoogle, { googleEventId: 'g-evt-1' });

      expect(googleApi.deleteEvent).toHaveBeenCalledWith('auth-client', 'primary@google.com', 'g-evt-1');
    });

    it('propaga o erro — não silencia', async () => {
      const googleApi = mockGoogleApi();
      googleApi.deleteEvent.mockRejectedValue(new Error('Google API down'));

      const provider = new GoogleCalendarProvider(
        mockEventsRepo() as any, mockConnectionsRepo() as any, googleApi as any,
      );

      await expect(
        provider.deleteExternalEvent(calGoogle, { googleEventId: 'g-1' }),
      ).rejects.toThrow('Google API down');
    });
  });
});
```

- [ ] **Step 3.2: Rodar os testes — esperar FAIL**

```bash
npx jest src/services/calendar/providers/__tests__/google-calendar.provider.test.ts --no-coverage
```

Expected: `Cannot find module '../google-calendar.provider'`

- [ ] **Step 3.3: Implementar GoogleCalendarProvider**

```typescript
// src/services/calendar/providers/google-calendar.provider.ts
import { GoogleCalendarEventsRepository } from '../../../repositories/google_calendar_events.repository';
import { GoogleConnectionsRepository } from '../../../repositories/google_connections.repository';
import { ValidationError } from '../../../errors/domain-errors';
import { GoogleCalendarApiService } from '../google-calendar-api.service';
import { CreateCalendarEventInput, UpdateCalendarEventInput } from '../types';
import { ICalendarProvider } from './calendar-provider.interface';

export class GoogleCalendarProvider implements ICalendarProvider {
  constructor(
    private readonly googleCalendarEventsRepository: GoogleCalendarEventsRepository,
    private readonly googleConnectionsRepository: GoogleConnectionsRepository,
    private readonly googleCalendarApiService: GoogleCalendarApiService,
  ) {}

  async createEvent(cal: any, accountId: string, dto: CreateCalendarEventInput): Promise<any> {
    if (!cal.calendarId) {
      throw new ValidationError('Calendário Google não configurado.');
    }

    const auth = await this.googleCalendarApiService.getAuthenticatedClient(
      cal.googleConnection.tokens,
      cal.googleConnection.id,
      this.googleConnectionsRepository,
    );

    const googleEvent = await this.googleCalendarApiService.createEvent(auth, cal.calendarId, {
      summary: dto.title,
      description: dto.description ?? '',
      start: { dateTime: new Date(dto.start).toISOString() },
      end: { dateTime: new Date(dto.end).toISOString() },
    });

    return this.googleCalendarEventsRepository.upsertByGoogleEventId(googleEvent.id!, {
      googleEventId: googleEvent.id,
      accountId,
      googleCalendarId: cal.id,
      title: dto.title,
      description: dto.description ?? '',
      startAt: new Date(dto.start),
      endAt: new Date(dto.end),
      meetingLink: googleEvent.hangoutLink ?? null,
    });
  }

  async updateEvent(cal: any, evt: any, dto: UpdateCalendarEventInput): Promise<any> {
    if (!cal.calendarId) {
      throw new ValidationError('Calendário Google não configurado.');
    }

    const auth = await this.googleCalendarApiService.getAuthenticatedClient(
      cal.googleConnection.tokens,
      cal.googleConnection.id,
      this.googleConnectionsRepository,
    );

    const patch: any = {};
    if (dto.title) patch.summary = dto.title;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.start) patch.start = { dateTime: new Date(dto.start).toISOString() };
    if (dto.end) patch.end = { dateTime: new Date(dto.end).toISOString() };

    await this.googleCalendarApiService.updateEvent(
      auth,
      cal.calendarId,
      evt.googleEventId!,
      patch,
    );

    return this.googleCalendarEventsRepository.upsertByGoogleEventId(evt.googleEventId!, {
      googleEventId: evt.googleEventId!,
      accountId: evt.accountId,
      googleCalendarId: cal.id,
      title: dto.title ?? evt.title,
      description: dto.description ?? evt.description,
      startAt: dto.start ? new Date(dto.start) : evt.startAt,
      endAt: dto.end ? new Date(dto.end) : evt.endAt,
      meetingLink: evt.meetingLink,
    });
  }

  async deleteExternalEvent(cal: any, evt: any): Promise<void> {
    if (!cal.calendarId || !evt.googleEventId) return;

    const auth = await this.googleCalendarApiService.getAuthenticatedClient(
      cal.googleConnection.tokens,
      cal.googleConnection.id,
      this.googleConnectionsRepository,
    );

    await this.googleCalendarApiService.deleteEvent(auth, cal.calendarId, evt.googleEventId);
  }
}
```

- [ ] **Step 3.4: Rodar os testes — esperar PASS**

```bash
npx jest src/services/calendar/providers/__tests__/google-calendar.provider.test.ts --no-coverage
```

Expected: `6 passed`

---

## Task 4: CalendarProviderFactory

**Files:**
- Create: `src/services/calendar/providers/calendar-provider.factory.ts`

Sem testes unitários — é puro `if/else` sobre enum. Validado pelos testes de integração dos handlers.

- [ ] **Step 4.1: Implementar a factory**

```typescript
// src/services/calendar/providers/calendar-provider.factory.ts
import { GoogleCalendarEventsRepository } from '../../../repositories/google_calendar_events.repository';
import { GoogleConnectionsRepository } from '../../../repositories/google_connections.repository';
import { GoogleCalendarApiService } from '../google-calendar-api.service';
import { ICalendarProvider } from './calendar-provider.interface';
import { NativeCalendarProvider } from './native-calendar.provider';
import { GoogleCalendarProvider } from './google-calendar.provider';

export class CalendarProviderFactory {
  static create(
    cal: any,
    googleCalendarEventsRepository: GoogleCalendarEventsRepository,
    googleConnectionsRepository: GoogleConnectionsRepository,
    googleCalendarApiService: GoogleCalendarApiService,
  ): ICalendarProvider {
    if (cal.provider === 'NATIVE' || !cal.provider) {
      return new NativeCalendarProvider(googleCalendarEventsRepository);
    }

    return new GoogleCalendarProvider(
      googleCalendarEventsRepository,
      googleConnectionsRepository,
      googleCalendarApiService,
    );
  }
}
```

---

## Task 5: Refatorar CreateEventHandler

**Files:**
- Modify: `src/services/calendar/handlers/create-event.handler.ts`

**O que muda:** remover `import { v4 as uuidv4 }`, remover `const isNative` e o bloco `if/else`. Adicionar import da factory. O construtor e a assinatura do `execute` não mudam.

- [ ] **Step 5.1: Substituir o handler completo**

```typescript
// src/services/calendar/handlers/create-event.handler.ts
import { GoogleCalendarsRepository } from '../../../repositories/google_calendars.repository';
import { GoogleCalendarEventsRepository } from '../../../repositories/google_calendar_events.repository';
import { GoogleConnectionsRepository } from '../../../repositories/google_connections.repository';
import { GoogleCalendarApiService } from '../google-calendar-api.service';
import { ValidationError } from '../../../errors/domain-errors';
import { CreateCalendarEventInput } from '../types';
import { CalendarProviderFactory } from '../providers/calendar-provider.factory';

export class CreateEventHandler {
  constructor(
    private readonly googleCalendarsRepository: GoogleCalendarsRepository,
    private readonly googleCalendarEventsRepository: GoogleCalendarEventsRepository,
    private readonly googleConnectionsRepository: GoogleConnectionsRepository,
    private readonly googleCalendarApiService: GoogleCalendarApiService,
  ) {}

  async execute(accountId: string, dto: CreateCalendarEventInput): Promise<any> {
    const cal = await this.googleCalendarsRepository.findByIdAndAccountId(
      dto.collaboratorId,
      accountId,
      { googleConnection: true, user: true },
    );

    if (!cal) {
      throw new ValidationError('Colaborador não possui agenda configurada.');
    }

    const provider = CalendarProviderFactory.create(
      cal,
      this.googleCalendarEventsRepository,
      this.googleConnectionsRepository,
      this.googleCalendarApiService,
    );

    const saved = await provider.createEvent(cal, accountId, dto);

    return {
      id: saved.id,
      title: saved.title,
      start: saved.startAt?.toISOString(),
      end: saved.endAt?.toISOString(),
      color: (cal as any).color ?? '#318988',
      extendedProps: {
        collaboratorId: cal.id,
        collaboratorName: (cal as any).user?.name ?? '',
        description: saved.description ?? '',
        googleEventId: saved.googleEventId,
        meetingLink: saved.meetingLink ?? null,
      },
    };
  }
}
```

- [ ] **Step 5.2: Checar tipos**

```bash
npx tsc --noEmit
```

Expected: sem erros.

---

## Task 6: Refatorar UpdateEventHandler

**Files:**
- Modify: `src/services/calendar/handlers/update-event.handler.ts`

**O que muda:** remover `import { ValidationError }` (não é mais usado aqui), remover `const isNative` e bloco `if/else`. Adicionar import da factory.

- [ ] **Step 6.1: Substituir o handler completo**

```typescript
// src/services/calendar/handlers/update-event.handler.ts
import { GoogleCalendarEventsRepository } from '../../../repositories/google_calendar_events.repository';
import { GoogleConnectionsRepository } from '../../../repositories/google_connections.repository';
import { GoogleCalendarApiService } from '../google-calendar-api.service';
import { NotFoundError } from '../../../errors/domain-errors';
import { UpdateCalendarEventInput } from '../types';
import { CalendarProviderFactory } from '../providers/calendar-provider.factory';

export class UpdateEventHandler {
  constructor(
    private readonly googleCalendarEventsRepository: GoogleCalendarEventsRepository,
    private readonly googleConnectionsRepository: GoogleConnectionsRepository,
    private readonly googleCalendarApiService: GoogleCalendarApiService,
  ) {}

  async execute(
    accountId: string,
    id: string,
    dto: UpdateCalendarEventInput,
  ): Promise<any> {
    const evt = await this.googleCalendarEventsRepository.findByIdAndAccountId(
      id,
      accountId,
    );
    if (!evt) throw new NotFoundError('Evento não encontrado.');

    const cal = (evt as any).googleCalendar;
    if (!cal) throw new NotFoundError('Calendário não encontrado.');

    const provider = CalendarProviderFactory.create(
      cal,
      this.googleCalendarEventsRepository,
      this.googleConnectionsRepository,
      this.googleCalendarApiService,
    );

    const updated = await provider.updateEvent(cal, evt, dto);

    return {
      id: updated.id,
      title: updated.title,
      start: updated.startAt?.toISOString(),
      end: updated.endAt?.toISOString(),
      color: cal.color ?? '#318988',
      extendedProps: {
        collaboratorId: cal.userId ?? null,
        collaboratorName: cal.user?.name ?? '',
        description: updated.description ?? '',
        googleEventId: updated.googleEventId,
        meetingLink: updated.meetingLink ?? null,
      },
    };
  }
}
```

- [ ] **Step 6.2: Checar tipos**

```bash
npx tsc --noEmit
```

Expected: sem erros.

---

## Task 7: Refatorar DeleteEventHandler

**Files:**
- Modify: `src/services/calendar/handlers/delete-event.handler.ts`

**O que muda:** substituir o `if (cal?.provider === 'GOOGLE' && ...)` com auth inline por `provider.deleteExternalEvent(cal, evt)`. O try/catch permanece no handler (decisão de não-fatal fica aqui, não no provider). O `markCancelled` continua sendo sempre chamado.

- [ ] **Step 7.1: Substituir o handler completo**

```typescript
// src/services/calendar/handlers/delete-event.handler.ts
import { GoogleCalendarEventsRepository } from '../../../repositories/google_calendar_events.repository';
import { GoogleConnectionsRepository } from '../../../repositories/google_connections.repository';
import { GoogleCalendarApiService } from '../google-calendar-api.service';
import { NotFoundError } from '../../../errors/domain-errors';
import { CalendarProviderFactory } from '../providers/calendar-provider.factory';

export class DeleteEventHandler {
  constructor(
    private readonly googleCalendarEventsRepository: GoogleCalendarEventsRepository,
    private readonly googleConnectionsRepository: GoogleConnectionsRepository,
    private readonly googleCalendarApiService: GoogleCalendarApiService,
  ) {}

  async execute(accountId: string, id: string): Promise<{ success: boolean }> {
    const evt = await this.googleCalendarEventsRepository.findByIdAndAccountId(
      id,
      accountId,
    );
    if (!evt) throw new NotFoundError('Evento não encontrado.');

    const cal = (evt as any).googleCalendar;

    if (cal) {
      const provider = CalendarProviderFactory.create(
        cal,
        this.googleCalendarEventsRepository,
        this.googleConnectionsRepository,
        this.googleCalendarApiService,
      );
      try {
        await provider.deleteExternalEvent(cal, evt);
      } catch (err) {
        console.error('Failed to delete event from external provider:', (err as any).message);
      }
    }

    await this.googleCalendarEventsRepository.markCancelled(id);
    return { success: true };
  }
}
```

- [ ] **Step 7.2: Checar tipos**

```bash
npx tsc --noEmit
```

Expected: sem erros.

---

## Task 8: Build completo + rodar todos os testes

- [ ] **Step 8.1: Build do core**

```bash
cd chatfunnel-core
npm run build
```

Expected: `prisma generate` completa, `tsc` sem erros, pasta `dist/` atualizada.

- [ ] **Step 8.2: Rodar todos os testes do calendário**

```bash
npx jest src/services/calendar/ --no-coverage
```

Expected: todos passam (mínimo 9: 3 do native + 6 do google).

---

## Checklist pós-implementação

- [ ] Nenhum `if (isNative)` / `if (provider === 'NATIVE')` restante nos 3 handlers
- [ ] Cada handler tem exatamente uma chamada para `CalendarProviderFactory.create(...)`
- [ ] `NativeCalendarProvider.deleteExternalEvent` é noop confirmado por teste
- [ ] `GoogleCalendarProvider.deleteExternalEvent` propaga erro — confirmado por teste
- [ ] `DeleteEventHandler` ainda usa try/catch ao redor de `deleteExternalEvent`
- [ ] `markCancelled` continua sendo chamado independente de provider
- [ ] Build do core passa sem erros de tipo

---

## Como adicionar um novo provider (referência futura)

```
1. Criar src/services/calendar/providers/outlook-calendar.provider.ts
   implementando ICalendarProvider

2. Adicionar no CalendarProviderFactory:
   } else if (cal.provider === 'OUTLOOK') {
     return new OutlookCalendarProvider(eventsRepo, connectionsRepo, outlookApi)
   }

3. Criar testes em __tests__/outlook-calendar.provider.test.ts

Nenhum handler (create/update/delete) precisa ser alterado.
```
