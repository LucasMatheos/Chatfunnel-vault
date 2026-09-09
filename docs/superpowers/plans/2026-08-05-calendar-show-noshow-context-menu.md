# Calendar Show/No-show + Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a moderator mark a calendar event as "Compareceu" (SHOW) or "Não compareceu" (NO_SHOW), and let them do that — plus delete the event — from a right-click context menu on the calendar, without opening the edit dialog.

**Architecture:** MVP scope (Approach A from the design discussion, chat history, no separate spec file was written since the user approved inline and asked to jump straight to the plan). New `attendanceStatus` enum + two audit scalar fields directly on `GoogleCalendarEvents` (no separate history table — YAGNI until real auditing need appears). A dedicated `PATCH /calendar/events/:id/attendance` endpoint (kept separate from the generic event-update endpoint, which syncs title/description/dates to Google — presence is ChatFunnel-only metadata and must never be touched by Google sync). `ListEventsHandler` exposes the new fields so the frontend never needs a separate single-event fetch. On the frontend, a new `EventContextMenu.vue` popover-based menu is attached to each FullCalendar event via native `contextmenu` DOM events (FullCalendar's `eventDidMount`/`eventWillUnmount` hooks), reusing the existing `Popover`/`PopoverAnchor` pattern already used by `InputContactExist.vue` (no `DropdownMenu` anchor primitive is wrapped in this codebase, so this avoids adding new plumbing for that).

**Tech Stack:** NestJS 10 + Prisma (`chatfunnel-core`, `chatfunnel-services`), Vue 3 `<script setup>` + FullCalendar v6 + Reka UI Popover (`chatfunnel-front`), Jest (`@swc/jest`) for backend unit tests.

## Global Constraints

- NEVER run any Prisma CLI command yourself (`migrate dev`, `migrate deploy`, `db push`, `generate`, `format`, etc.) — edit `schema.prisma` only, then STOP and have the user run the migration.
- NEVER run `npm run build` or any build command automatically — the user builds manually.
- ALWAYS scope every calendar query by `accountId` (multi-tenancy).
- ALWAYS use `@phosphor-icons/vue` for icons — never Lucide/FontAwesome/MDI.
- ALWAYS use Tailwind utility classes, no scoped `<style>` for layout, no hardcoded colors — use scale tokens (`bg-gray-100`, `text-gray-1000`, `text-green-500`, `text-red-500`) since `EventContextMenu.vue` is a project-owned component, not a `ui/` base component.
- Attendance is ChatFunnel-only metadata: it must never be written to the Google Calendar event itself, and the Google webhook sync path must never overwrite `attendanceStatus`/`attendanceRecordedAt`/`attendanceRecordedBy` (this plan does not touch the webhook handler because it never writes those fields — just don't add them there).

---

### Task 1: Schema — attendance enum + fields on `GoogleCalendarEvents`

**Files:**
- Modify: `chatfunnel-core/prisma/schema.prisma`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: Prisma enum `CalendarEventAttendanceStatus` with values `PENDING | SHOW | NO_SHOW`; fields `GoogleCalendarEvents.attendanceStatus` (default `PENDING`), `GoogleCalendarEvents.attendanceRecordedAt` (nullable `DateTime`), `GoogleCalendarEvents.attendanceRecordedBy` (nullable `String @db.Uuid`, plain scalar — no Prisma relation, ponytail: skip the relation, nobody needs to query "all events a user marked" yet; add a relation to `Users` later if that need shows up). All later tasks read/write these three fields plus the enum values `'SHOW'` / `'NO_SHOW'` as plain string literals (not by importing the generated Prisma enum type — keeps `chatfunnel-core`'s hand-written `types.ts` interfaces decoupled from whether `prisma generate` has already run).

- [ ] **Step 1: Add the enum**

Open `chatfunnel-core/prisma/schema.prisma` and find `enum StatusEventScheduledReminderEnum` (around line 1805, right after the `GoogleCalendarEvents` model). Add the new enum right before it:

```prisma
enum CalendarEventAttendanceStatus {
  PENDING
  SHOW
  NO_SHOW
}

enum StatusEventScheduledReminderEnum {
  PENDING
  SENT
  ERROR
  CANCELED
```

(Only add the new enum block above — leave `StatusEventScheduledReminderEnum` and everything after it untouched.)

- [ ] **Step 2: Add the fields to `GoogleCalendarEvents`**

In the same file, find the `GoogleCalendarEvents` model (around line 1768) and locate this block:

```prisma
  isCancelled        Boolean                                 @default(false)
  cancelledAt        DateTime?
  createdAt          DateTime                                @default(now())
  scheduledReminders GoogleCalendarEventScheduledReminders[]

  @@unique([accountId, googleCalendarId, googleEventId])
  @@index([googleEventId])
  @@index([eventKey])
  @@index([contactId])
}
```

Replace it with:

```prisma
  isCancelled        Boolean                                 @default(false)
  cancelledAt        DateTime?
  createdAt          DateTime                                @default(now())
  scheduledReminders GoogleCalendarEventScheduledReminders[]

  attendanceStatus     CalendarEventAttendanceStatus @default(PENDING)
  attendanceRecordedAt DateTime?
  attendanceRecordedBy String?                       @db.Uuid

  @@unique([accountId, googleCalendarId, googleEventId])
  @@index([googleEventId])
  @@index([eventKey])
  @@index([contactId])
}
```

- [ ] **Step 3: STOP — do not run any Prisma command**

Per the project's hard rule, do not run `npx prisma migrate dev`, `db push`, or `generate` yourself. Tell the user the schema is ready and ask them to run, in `chatfunnel-core/`:

```bash
npx prisma migrate dev --name add_calendar_event_attendance
```

Wait for the user to confirm this succeeded (this also regenerates the Prisma Client, which Tasks 2–6 depend on for the new field/enum types to exist) before starting Task 2.

---

### Task 2: Repository — `updateAttendance()`

**Files:**
- Modify: `chatfunnel-core/src/repositories/google_calendar_events.repository.ts`
- Test: `chatfunnel-core/src/repositories/google_calendar_events.repository.spec.ts` (new file)

**Interfaces:**
- Consumes: `attendanceStatus`/`attendanceRecordedAt`/`attendanceRecordedBy` fields from Task 1.
- Produces: `GoogleCalendarEventsRepository.updateAttendance(id: string, data: { attendanceStatus: 'SHOW' | 'NO_SHOW'; attendanceRecordedAt: Date; attendanceRecordedBy: string }): Promise<GoogleCalendarEvents>` — used by Task 4's handler.

- [ ] **Step 1: Write the failing test**

Create `chatfunnel-core/src/repositories/google_calendar_events.repository.spec.ts`:

```ts
import { GoogleCalendarEventsRepository } from './google_calendar_events.repository';

describe('GoogleCalendarEventsRepository.updateAttendance', () => {
  it('calls prisma.googleCalendarEvents.update with the attendance fields', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'evt-1', attendanceStatus: 'SHOW' });
    const prisma = { googleCalendarEvents: { update } } as any;
    const repo = new GoogleCalendarEventsRepository(prisma);

    const recordedAt = new Date('2026-08-05T12:00:00.000Z');
    await repo.updateAttendance('evt-1', {
      attendanceStatus: 'SHOW',
      attendanceRecordedAt: recordedAt,
      attendanceRecordedBy: 'user-1',
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'evt-1' },
      data: {
        attendanceStatus: 'SHOW',
        attendanceRecordedAt: recordedAt,
        attendanceRecordedBy: 'user-1',
      },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `chatfunnel-core/`): `npm test -- google_calendar_events.repository.spec.ts`
Expected: FAIL with `repo.updateAttendance is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `chatfunnel-core/src/repositories/google_calendar_events.repository.ts`, add this method right after `updateById` (which ends around line 187):

```ts
  async updateAttendance(
    id: string,
    data: {
      attendanceStatus: 'SHOW' | 'NO_SHOW';
      attendanceRecordedAt: Date;
      attendanceRecordedBy: string;
    },
  ): Promise<GoogleCalendarEvents> {
    return this.prisma.googleCalendarEvents.update({
      where: { id },
      data: {
        attendanceStatus: data.attendanceStatus,
        attendanceRecordedAt: data.attendanceRecordedAt,
        attendanceRecordedBy: data.attendanceRecordedBy,
      },
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- google_calendar_events.repository.spec.ts`
Expected: PASS

---

### Task 3: Types — attendance input type

**Files:**
- Modify: `chatfunnel-core/src/services/calendar/types.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `EventAttendanceStatusInput = 'SHOW' | 'NO_SHOW'` — consumed by Task 4's handler and Task 5's facade.

- [ ] **Step 1: Add the type**

In `chatfunnel-core/src/services/calendar/types.ts`, add at the end of the file:

```ts
export type EventAttendanceStatusInput = 'SHOW' | 'NO_SHOW';
```

(No test — this is a type-only alias, nothing to run.)

---

### Task 4: Handler — `UpdateEventAttendanceHandler`

**Files:**
- Create: `chatfunnel-core/src/services/calendar/handlers/update-event-attendance.handler.ts`
- Test: `chatfunnel-core/src/services/calendar/handlers/update-event-attendance.handler.spec.ts`

**Interfaces:**
- Consumes: `GoogleCalendarEventsRepository.findByIdAndAccountId(id, accountId)` (existing method, returns event with `isCancelled`, `startAt`, `attendanceStatus` etc. or `null`); `GoogleCalendarEventsRepository.updateAttendance(...)` from Task 2; `EventAttendanceStatusInput` from Task 3; `ValidationError`/`NotFoundError` from `chatfunnel-core/src/errors/domain-errors`.
- Produces: `UpdateEventAttendanceHandler.execute(accountId: string, id: string, actorUserId: string, status: EventAttendanceStatusInput): Promise<{ id: string; attendanceStatus: string; attendanceRecordedAt: string | null; attendanceRecordedBy: string | null }>` — used by Task 5's facade.

- [ ] **Step 1: Write the failing tests**

Create `chatfunnel-core/src/services/calendar/handlers/update-event-attendance.handler.spec.ts`:

```ts
import { UpdateEventAttendanceHandler } from './update-event-attendance.handler';

const makeEvent = (overrides: Record<string, any> = {}) => ({
  id: 'evt-1',
  accountId: 'acc-1',
  isCancelled: false,
  startAt: new Date('2020-01-01T00:00:00.000Z'), // in the past by default
  attendanceStatus: 'PENDING',
  ...overrides,
});

function makeDeps(overrides: {
  findByIdAndAccountId?: jest.Mock;
  updateAttendance?: jest.Mock;
} = {}) {
  const googleCalendarEventsRepository = {
    findByIdAndAccountId: overrides.findByIdAndAccountId ?? jest.fn().mockResolvedValue(makeEvent()),
    updateAttendance: overrides.updateAttendance ?? jest.fn().mockResolvedValue({
      id: 'evt-1',
      attendanceStatus: 'SHOW',
      attendanceRecordedAt: new Date('2026-08-05T12:00:00.000Z'),
      attendanceRecordedBy: 'user-1',
    }),
  } as any;

  return { googleCalendarEventsRepository };
}

describe('UpdateEventAttendanceHandler', () => {
  it('evento não encontrado → NotFoundError', async () => {
    const deps = makeDeps({ findByIdAndAccountId: jest.fn().mockResolvedValue(null) });
    const handler = new UpdateEventAttendanceHandler(deps.googleCalendarEventsRepository);

    await expect(handler.execute('acc-1', 'evt-1', 'user-1', 'SHOW')).rejects.toThrow(
      'Evento não encontrado.',
    );
  });

  it('evento cancelado → ValidationError, updateAttendance não é chamado', async () => {
    const updateAttendance = jest.fn();
    const deps = makeDeps({
      findByIdAndAccountId: jest.fn().mockResolvedValue(makeEvent({ isCancelled: true })),
      updateAttendance,
    });
    const handler = new UpdateEventAttendanceHandler(deps.googleCalendarEventsRepository);

    await expect(handler.execute('acc-1', 'evt-1', 'user-1', 'SHOW')).rejects.toThrow(
      'Evento cancelado não pode receber presença.',
    );
    expect(updateAttendance).not.toHaveBeenCalled();
  });

  it('evento no futuro → ValidationError, updateAttendance não é chamado', async () => {
    const updateAttendance = jest.fn();
    const deps = makeDeps({
      findByIdAndAccountId: jest.fn().mockResolvedValue(
        makeEvent({ startAt: new Date(Date.now() + 60 * 60 * 1000) }),
      ),
      updateAttendance,
    });
    const handler = new UpdateEventAttendanceHandler(deps.googleCalendarEventsRepository);

    await expect(handler.execute('acc-1', 'evt-1', 'user-1', 'SHOW')).rejects.toThrow(
      'Só é possível registrar presença após o início do evento.',
    );
    expect(updateAttendance).not.toHaveBeenCalled();
  });

  it('evento passado e não cancelado → grava presença e retorna estado atualizado', async () => {
    const updateAttendance = jest.fn().mockResolvedValue({
      id: 'evt-1',
      attendanceStatus: 'NO_SHOW',
      attendanceRecordedAt: new Date('2026-08-05T12:00:00.000Z'),
      attendanceRecordedBy: 'user-1',
    });
    const deps = makeDeps({ updateAttendance });
    const handler = new UpdateEventAttendanceHandler(deps.googleCalendarEventsRepository);

    const result = await handler.execute('acc-1', 'evt-1', 'user-1', 'NO_SHOW');

    expect(updateAttendance).toHaveBeenCalledWith('evt-1', {
      attendanceStatus: 'NO_SHOW',
      attendanceRecordedAt: expect.any(Date),
      attendanceRecordedBy: 'user-1',
    });
    expect(result).toEqual({
      id: 'evt-1',
      attendanceStatus: 'NO_SHOW',
      attendanceRecordedAt: '2026-08-05T12:00:00.000Z',
      attendanceRecordedBy: 'user-1',
    });
  });

  it('repetir o mesmo status é idempotente (não lança erro)', async () => {
    const deps = makeDeps({
      findByIdAndAccountId: jest.fn().mockResolvedValue(makeEvent({ attendanceStatus: 'SHOW' })),
    });
    const handler = new UpdateEventAttendanceHandler(deps.googleCalendarEventsRepository);

    await expect(handler.execute('acc-1', 'evt-1', 'user-1', 'SHOW')).resolves.toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- update-event-attendance.handler.spec.ts` (from `chatfunnel-core/`)
Expected: FAIL — `Cannot find module './update-event-attendance.handler'`.

- [ ] **Step 3: Write minimal implementation**

Create `chatfunnel-core/src/services/calendar/handlers/update-event-attendance.handler.ts`:

```ts
import { GoogleCalendarEventsRepository } from '../../../repositories/google_calendar_events.repository';
import { ValidationError, NotFoundError } from '../../../errors/domain-errors';
import { EventAttendanceStatusInput } from '../types';

export class UpdateEventAttendanceHandler {
  constructor(
    private readonly googleCalendarEventsRepository: GoogleCalendarEventsRepository,
  ) {}

  async execute(
    accountId: string,
    id: string,
    actorUserId: string,
    status: EventAttendanceStatusInput,
  ): Promise<{
    id: string;
    attendanceStatus: string;
    attendanceRecordedAt: string | null;
    attendanceRecordedBy: string | null;
  }> {
    const evt = await this.googleCalendarEventsRepository.findByIdAndAccountId(id, accountId);
    if (!evt) throw new NotFoundError('Evento não encontrado.');

    if ((evt as any).isCancelled) {
      throw new ValidationError('Evento cancelado não pode receber presença.');
    }

    if (evt.startAt && new Date(evt.startAt) > new Date()) {
      throw new ValidationError('Só é possível registrar presença após o início do evento.');
    }

    const updated = await this.googleCalendarEventsRepository.updateAttendance(id, {
      attendanceStatus: status,
      attendanceRecordedAt: new Date(),
      attendanceRecordedBy: actorUserId,
    });

    return {
      id: updated.id,
      attendanceStatus: updated.attendanceStatus,
      attendanceRecordedAt: updated.attendanceRecordedAt?.toISOString() ?? null,
      attendanceRecordedBy: updated.attendanceRecordedBy ?? null,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- update-event-attendance.handler.spec.ts`
Expected: PASS (5 tests)

---

### Task 5: Facade — `calendar.service.ts` (core)

**Files:**
- Modify: `chatfunnel-core/src/services/calendar/calendar.service.ts`

**Interfaces:**
- Consumes: `UpdateEventAttendanceHandler` from Task 4; `EventAttendanceStatusInput` from Task 3.
- Produces: `CalendarService.updateEventAttendance(accountId: string, id: string, actorUserId: string, status: EventAttendanceStatusInput)` — used by Task 9's NestJS facade.

- [ ] **Step 1: Add the import**

In `chatfunnel-core/src/services/calendar/calendar.service.ts`, add to the imports at the top:

```ts
import { UpdateEventAttendanceHandler } from './handlers/update-event-attendance.handler';
```

And add `EventAttendanceStatusInput` to the existing `types` import block:

```ts
import {
  ListCalendarEventsInput,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
  EventAttendanceStatusInput,
} from './types';
```

- [ ] **Step 2: Add the facade method**

Add this method to the `CalendarService` class, right after `updateEvent(...)`:

```ts
  updateEventAttendance(
    accountId: string,
    id: string,
    actorUserId: string,
    status: EventAttendanceStatusInput,
  ) {
    return new UpdateEventAttendanceHandler(
      this.googleCalendarEventsRepository,
    ).execute(accountId, id, actorUserId, status);
  }
```

- [ ] **Step 3: Run existing calendar tests to make sure nothing broke**

Run (from `chatfunnel-core/`): `npm test -- calendar`
Expected: PASS (all existing calendar specs, including the new ones from Task 2 and Task 4)

---

### Task 6: Listing — include attendance in `ListEventsHandler`

**Files:**
- Modify: `chatfunnel-core/src/services/calendar/handlers/list-events.handler.ts`

**Interfaces:**
- Consumes: `evt.attendanceStatus` / `evt.attendanceRecordedAt` fields from Task 1 (already returned by the existing `findManyByAccountIdAndDateRange` query — no repository change needed, Prisma returns all scalar columns by default).
- Produces: `extendedProps.attendanceStatus: 'PENDING' | 'SHOW' | 'NO_SHOW'` and `extendedProps.attendanceRecordedAt: string | null` on every event returned by `GET /calendar/events` — consumed by Task 12's frontend `EventContextMenu.vue` (to decide which buttons to show) and Task 11's context-menu wiring.

- [ ] **Step 1: Add the fields to `extendedProps`**

In `chatfunnel-core/src/services/calendar/handlers/list-events.handler.ts`, find the `extendedProps` object inside the `events.map(...)` call (it currently ends with `contact: evt.contact ? {...} : null,`). Add two more fields:

```ts
        extendedProps: {
          collaboratorId: cal?.id ?? null,
          collaboratorName: cal?.user?.name ?? '',
          description: evt.description ?? '',
          googleEventId: evt.googleEventId,
          meetingLink: evt.meetingLink ?? null,
          contactId: evt.contactId ?? null,
          contact: evt.contact
            ? {
                id: evt.contact.id,
                name: evt.contact.name,
                phone: evt.contact.phone,
                email: evt.contact.email,
                photo: evt.contact.photo,
              }
            : null,
          attendanceStatus: evt.attendanceStatus ?? 'PENDING',
          attendanceRecordedAt: evt.attendanceRecordedAt?.toISOString() ?? null,
        },
```

(No dedicated test file exists for this handler today — this is a small additive mapping change consistent with the existing untested pattern in this file. If you want a test here, mirror the style from Task 4's spec: mock the two repositories, assert `extendedProps.attendanceStatus` on the returned array.)

---

### Task 7: DTO — `UpdateCalendarEventAttendanceDto`

**Files:**
- Create: `chatfunnel-services/src/modules/calendar/dto/update-calendar-event-attendance.dto.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `UpdateCalendarEventAttendanceDto { status: 'SHOW' | 'NO_SHOW' }`, validated by `class-validator` — consumed by Task 8's controller route.

- [ ] **Step 1: Create the DTO**

```ts
import { IsIn } from 'class-validator';

export class UpdateCalendarEventAttendanceDto {
  @IsIn(['SHOW', 'NO_SHOW'])
  status: 'SHOW' | 'NO_SHOW';
}
```

---

### Task 8: Controller — `PATCH /calendar/events/:id/attendance`

**Files:**
- Modify: `chatfunnel-services/src/modules/calendar/controllers/calendar.controller.ts`

**Interfaces:**
- Consumes: `UpdateCalendarEventAttendanceDto` from Task 7; `CalendarService.updateEventAttendance(...)` from Task 9 (defined in this same task's sibling file — see Task 9, written right after this one so the controller compiles).
- Produces: HTTP route `PATCH /nest/calendar/events/:id/attendance` (header `Account-Selected`, JWT + `ModeratorAuthGuard`) — consumed by Task 10's frontend service call.

- [ ] **Step 1: Add imports**

In `chatfunnel-services/src/modules/calendar/controllers/calendar.controller.ts`, update the `@nestjs/common` import to add `Req`:

```ts
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  HttpCode,
  UseGuards,
  Req,
} from '@nestjs/common';
```

Add below the existing imports:

```ts
import { Request as ExpressRequest } from 'express';
import { UpdateCalendarEventAttendanceDto } from '../dto/update-calendar-event-attendance.dto';
```

- [ ] **Step 2: Add the route**

Add this method right after `updateEvent(...)` and before `deleteEvent(...)`:

```ts
  @Patch('/events/:id/attendance')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), ModeratorAuthGuard)
  async updateEventAttendance(
    @Headers('Account-Selected') accountId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCalendarEventAttendanceDto,
    @Req() req: ExpressRequest,
  ) {
    const actorUserId = (req.user as any).userId;
    return this.calendarService.updateEventAttendance(accountId, id, actorUserId, dto.status);
  }
```

(No controller spec exists today for this file, consistent with the rest of the module — the behavior is covered by Task 4's handler tests. Manual verification happens in Task 13.)

---

### Task 9: Facade — `services/calendar.service.ts` (NestJS)

**Files:**
- Modify: `chatfunnel-services/src/modules/calendar/services/calendar.service.ts`

**Interfaces:**
- Consumes: `this.coreService.updateEventAttendance(...)` from Task 5.
- Produces: `CalendarService.updateEventAttendance(accountId: string, id: string, actorUserId: string, status: 'SHOW' | 'NO_SHOW')` — consumed by Task 8's controller.

- [ ] **Step 1: Add the delegator method**

In `chatfunnel-services/src/modules/calendar/services/calendar.service.ts`, add this method right after `updateEvent(...)`:

```ts
  updateEventAttendance(
    accountId: string,
    id: string,
    actorUserId: string,
    status: "SHOW" | "NO_SHOW",
  ) {
    return this.coreService.updateEventAttendance(accountId, id, actorUserId, status);
  }
```

- [ ] **Step 2: Update the existing constructor spec mock if it breaks**

Run: `npm test -- calendar.service.spec.ts` (from `chatfunnel-services/`)
Expected: PASS — this task doesn't change the constructor, only adds a method, so the existing `new CalendarService({} as any, {} as any, {} as any, {} as any)` mock in `calendar.service.spec.ts` keeps working unchanged.

---

### Task 10: Frontend service — `CalendarService.js`

**Files:**
- Modify: `chatfunnel-front/src/common/services/CalendarService.js`

**Interfaces:**
- Consumes: `PATCH /nest/calendar/events/:id/attendance` route from Task 8.
- Produces: `CalendarService.updateAttendance(eventId: string, status: 'SHOW' | 'NO_SHOW'): Promise` — consumed by Task 12's `index.vue` wiring.

- [ ] **Step 1: Add the method**

In `chatfunnel-front/src/common/services/CalendarService.js`, add this line right after `updateEvent`:

```js
  updateAttendance: (eventId, status) =>
    NestApi.patch()(`/calendar/events/${eventId}/attendance`, { status }, false),
```

---

### Task 11: Frontend component — `EventContextMenu.vue`

**Files:**
- Create: `chatfunnel-front/src/views/calendar/components/EventContextMenu.vue`
- Modify: `chatfunnel-front/src/views/calendar/components/index.js`

**Interfaces:**
- Consumes: `Popover`/`PopoverAnchor`/`PopoverContent` from `@/components/ui/popover` (same components already used by `chatfunnel-front/src/views/crm/components/CreateCardModalV2/components/InputContactExist.vue`); `PhCheckCircle`/`PhXCircle`/`PhTrash` from `@phosphor-icons/vue`.
- Produces: component with props `modelValue: boolean`, `x: number`, `y: number`, `event: { id, title, start, extendedProps: { attendanceStatus } } | null`, `canMarkAttendance: boolean`, `canDelete: boolean`; emits `update:modelValue`, `mark-show`, `mark-no-show`, `delete` — consumed by Task 12's `index.vue`.

- [ ] **Step 1: Create the component**

```vue
<template>
  <Popover v-model:open="isOpen">
    <PopoverAnchor as-child>
      <div class="fixed pointer-events-none" :style="anchorStyle"/>
    </PopoverAnchor>

    <PopoverContent
        align="start"
        :side-offset="4"
        class="z-[999999999999] w-52 p-1"
        @open-auto-focus.prevent
    >
      <button
          v-if="canMarkAttendance && hasStarted"
          type="button"
          class="flex w-full items-center gap-2 rounded-cf-md px-3 py-2 text-left typo-body-14-regular text-gray-1000 transition-colors hover:bg-gray-200"
          @click="handleAction('mark-show')"
      >
        <PhCheckCircle :size="16" class="shrink-0 text-green-500"/>
        Compareceu
      </button>

      <button
          v-if="canMarkAttendance && hasStarted"
          type="button"
          class="flex w-full items-center gap-2 rounded-cf-md px-3 py-2 text-left typo-body-14-regular text-gray-1000 transition-colors hover:bg-gray-200"
          @click="handleAction('mark-no-show')"
      >
        <PhXCircle :size="16" class="shrink-0 text-red-500"/>
        Não compareceu
      </button>

      <div v-if="canMarkAttendance && hasStarted && canDelete" class="my-1 h-px bg-gray-300"/>

      <button
          v-if="canDelete"
          type="button"
          class="flex w-full items-center gap-2 rounded-cf-md px-3 py-2 text-left typo-body-14-regular text-red-500 transition-colors hover:bg-gray-200"
          @click="handleAction('delete')"
      >
        <PhTrash :size="16" class="shrink-0"/>
        Excluir evento
      </button>
    </PopoverContent>
  </Popover>
</template>

<script setup>
import {computed} from 'vue'
import {Popover, PopoverAnchor, PopoverContent} from '@/components/ui/popover'
import {PhCheckCircle, PhXCircle, PhTrash} from '@phosphor-icons/vue'

const props = defineProps({
  modelValue: {type: Boolean, default: false},
  x: {type: Number, default: 0},
  y: {type: Number, default: 0},
  event: {type: Object, default: null},
  canMarkAttendance: {type: Boolean, default: false},
  canDelete: {type: Boolean, default: false},
})

const emit = defineEmits(['update:modelValue', 'mark-show', 'mark-no-show', 'delete'])

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const anchorStyle = computed(() => ({
  left: `${props.x}px`,
  top: `${props.y}px`,
  width: '1px',
  height: '1px',
}))

const hasStarted = computed(() => {
  if (!props.event?.start) return false
  return new Date(props.event.start) <= new Date()
})

const handleAction = (action) => {
  isOpen.value = false
  emit(action)
}
</script>
```

- [ ] **Step 2: Export it from the barrel**

In `chatfunnel-front/src/views/calendar/components/index.js`, add:

```js
export { default as EventContextMenu } from "./EventContextMenu.vue";
```

- [ ] **Step 3: Manual smoke check**

Run `npm run dev` in `chatfunnel-front/` (only if you're already running dev servers — otherwise skip and rely on Task 13's full manual QA, which covers this component in context). Not required to complete this task; Task 13 is where this component gets exercised end-to-end.

---

### Task 12: Frontend wiring — `index.vue`

**Files:**
- Modify: `chatfunnel-front/src/views/calendar/index.vue`

**Interfaces:**
- Consumes: `EventContextMenu` from Task 11; `CalendarService.updateAttendance(...)` from Task 10; `CalendarService.deleteEvent(...)` (existing); `hasPermission('CALENDAR', 'EDIT_EVENT')` / `hasPermission('CALENDAR', 'DELETE_EVENT')` (existing, already used for `EventDialog`'s `can-edit`/`can-delete` props); `useAlerts()`'s `showDialogConfirmation` (existing, already used inside `EventDialog.vue`).
- Produces: nothing consumed elsewhere — this is the final wiring task.

- [ ] **Step 1: Import the new component and add `showDialogConfirmation`**

Change:

```js
import {CalendarToolbar, EventDialog} from './components'
```

to:

```js
import {CalendarToolbar, EventDialog, EventContextMenu} from './components'
```

Change:

```js
const {showToastSuccess, showToastError} = useAlerts()
```

to:

```js
const {showToastSuccess, showToastError, showDialogConfirmation} = useAlerts()
```

- [ ] **Step 2: Add context-menu state**

Add this near the other `ref` declarations (right after `const selectedEvent = ref(null)`):

```js
const contextMenu = ref({open: false, x: 0, y: 0, event: null})
```

- [ ] **Step 3: Add the context-menu event handler and FullCalendar hooks**

Add this function near `handleEventClick` (right after it):

```js
const handleEventContextMenu = (fcEvent, domEvent) => {
  domEvent.preventDefault()
  contextMenu.value = {
    open: true,
    x: domEvent.clientX,
    y: domEvent.clientY,
    event: {
      id: fcEvent.id,
      title: fcEvent.title,
      start: fcEvent.start,
      extendedProps: {...fcEvent.extendedProps},
    },
  }
}
```

In `calendarOptions`, add two hooks right after `eventClick: handleEventClick,`:

```js
  eventClick: handleEventClick,
  eventDidMount: (info) => {
    const listener = (domEvent) => handleEventContextMenu(info.event, domEvent)
    info.el.addEventListener('contextmenu', listener)
    info.el._contextMenuListener = listener
  },
  eventWillUnmount: (info) => {
    if (info.el._contextMenuListener) {
      info.el.removeEventListener('contextmenu', info.el._contextMenuListener)
      delete info.el._contextMenuListener
    }
  },
  dateClick: handleDateClick,
```

- [ ] **Step 4: Close the menu on view/date navigation**

Find:

```js
const handleDatesSet = () => loadEvents()
```

Replace with:

```js
const handleDatesSet = () => {
  contextMenu.value.open = false
  loadEvents()
}
```

- [ ] **Step 5: Add the mark-attendance and context-menu-delete handlers**

Add these two functions right after `handleDeleteEvent`:

```js
const handleMarkAttendance = async (status) => {
  const eventId = contextMenu.value.event?.id
  if (!eventId) return
  try {
    await CalendarService.updateAttendance(eventId, status)
    showToastSuccess(status === 'SHOW' ? 'Presença registrada.' : 'Falta registrada.')
    await loadEvents()
  } catch (e) {
    showToastError(parseApiError(e))
  }
}

const handleContextMenuDelete = async () => {
  const eventId = contextMenu.value.event?.id
  if (!eventId) return
  const result = await showDialogConfirmation('Tem certeza que deseja excluir este evento?')
  if (result.isConfirmed) await handleDeleteEvent(eventId)
}
```

- [ ] **Step 6: Mount the component in the template**

In the `<template>`, right after the closing tag of `<EventDialog ... />` (around line 85), add:

```html
    <EventContextMenu
        v-model="contextMenu.open"
        :x="contextMenu.x"
        :y="contextMenu.y"
        :event="contextMenu.event"
        :can-mark-attendance="hasPermission('CALENDAR', 'EDIT_EVENT')"
        :can-delete="hasPermission('CALENDAR', 'DELETE_EVENT')"
        @mark-show="handleMarkAttendance('SHOW')"
        @mark-no-show="handleMarkAttendance('NO_SHOW')"
        @delete="handleContextMenuDelete"
    />
```

---

### Task 13: Manual end-to-end verification

**Files:** none (verification only — no code change).

**Interfaces:**
- Consumes: everything from Tasks 1–12, running together.
- Produces: confidence the feature works before considering it done. (No automated e2e test is added here — driving a real right-click + Reka Popover interaction through Vitest/happy-dom is disproportionate effort for this MVP; ponytail: skip, add a Playwright e2e spec later if this flow proves flaky in practice.)

- [ ] **Step 1: Start the stack**

Start `chatfunnel-services` (`npm run start:dev`, port 3200) and `chatfunnel-front` (`npm run dev`, port 5173). Do not run any build command — dev servers only.

- [ ] **Step 2: Verify right-click menu on a past event**

Log in, go to `/calendar`, find (or create, via the existing "Agendar evento" button) an event whose start time is in the past. Right-click it. Expected: browser context menu does NOT appear; a small popover appears at the cursor with "Compareceu", "Não compareceu", a divider, and "Excluir evento".

- [ ] **Step 3: Verify right-click menu on a future event**

Right-click an event whose start time is in the future. Expected: popover shows only "Excluir evento" (no attendance options).

- [ ] **Step 4: Mark as SHOW**

On the past event, click "Compareceu". Expected: menu closes immediately, a success toast appears, the event list reloads without error. Re-open the context menu on the same event — Expected: no error, still allowed to click "Compareceu" or "Não compareceu" again (idempotent).

- [ ] **Step 5: Mark as NO_SHOW**

On the same event, click "Não compareceu". Expected: success toast, no error.

- [ ] **Step 6: Verify cancelled/future guards via API errors**

Using the browser devtools network tab (or curl with a valid session), try `PATCH /nest/calendar/events/:id/attendance` with `{"status":"SHOW"}` against a future event's id. Expected: `400` with message `Só é possível registrar presença após o início do evento.`

- [ ] **Step 7: Verify delete from the context menu**

Right-click any event and choose "Excluir evento". Expected: confirmation dialog appears ("Tem certeza que deseja excluir este evento?"); confirming removes the event from the calendar and shows a success toast; cancelling leaves the event untouched.

- [ ] **Step 8: Verify menu closes on navigation**

Open the context menu, then switch the calendar view (week/month toggle) or navigate to a different week without clicking a menu item. Expected: the popover closes.

- [ ] **Step 9: Verify Google-sync isolation**

If you have a Google-connected calendar available for testing, mark an event SHOW/NO_SHOW, then trigger the existing webhook sync path (or wait for the next natural sync) and reload the calendar. Expected: `attendanceStatus` is unchanged — the webhook handler was not touched by this plan and never writes these fields.

- [ ] **Step 10: Verify persistence end-to-end (added after final review — Issue 1 below made the UI write-only until fixed)**

After clicking "Compareceu", open devtools → Network → find the subsequent `GET /nest/calendar/events` call → confirm the event's `extendedProps.attendanceStatus === "SHOW"` and `attendanceRecordedAt` is non-null. Repeat for "Não compareceu" and confirm `"NO_SHOW"`. Also confirm the small check icon now appears next to whichever button matches the current status when you re-open the menu on that event.

- [ ] **Step 11: Verify the audit column**

Confirm `attendanceRecordedBy` in the `PATCH` response equals the logged-in user's id. This is the one seam no automated test covers.

- [ ] **Step 12: Verify background/blocked-hours events don't open a dead menu**

Right-click a greyed-out blocked-hours background region on a past day (visible when exactly one collaborator's agenda is selected). Expected: either the native browser context menu appears, or nothing happens — the ChatFunnel popover must NOT open with dead buttons.

- [ ] **Step 13: Verify partial-permission users don't see an empty popover**

Log in as (or simulate) a moderator with `EDIT_EVENT` but not `DELETE_EVENT`, right-click a **future** event. Expected: no popover opens (no action would be available) — not an empty box.

- [ ] **Step 14: Verify menu re-targeting**

Right-click event A, then — without clicking a menu item — right-click event B. Then click "Compareceu". Expected: event B is marked, not A.

---

## Post-Implementation: Final Whole-Branch Review + Fixes

After all 12 tasks were implemented and individually reviewed/approved, a final whole-branch review (across `chatfunnel-core`, `chatfunnel-services`, `chatfunnel-front` together, most capable model) was run before considering the feature done. Verdict: **"Ready to merge? With fixes"** — no Critical issues, cross-repo contract and security (JWT-sourced `actorUserId`, `ModeratorAuthGuard` account binding, no IDOR) were confirmed sound end-to-end.

Four issues were raised and fixed:

1. **Write-only UI (Important).** Nothing ever displayed `attendanceStatus` after marking it — `EventContextMenu.vue` didn't consume the field Task 6 already exposed. **Fix:** added a `currentStatus` computed and a small check icon next to whichever button (`Compareceu`/`Não compareceu`) matches the event's current status.
2. **Dead menu on background/blocked-hours events (Important).** `blockedBackgroundEvents` entries have no `id`, but `eventDidMount` still attached the `contextmenu` listener to them, opening a menu where every button silently no-op'd. **Fix:** `handleEventContextMenu` now returns immediately if `!fcEvent.id`.
3. **Empty popover for partial permissions (Important).** A user with only `EDIT_EVENT` right-clicking a future event (or a user with neither permission) got an empty popover. **Fix:** `handleEventContextMenu` now computes whether any action would be available and returns before `preventDefault()` if not, letting the native browser menu show instead.
4. **`updateAttendance` not `accountId`-scoped (Important).** `GoogleCalendarEventsRepository.updateAttendance` used `where: { id }` only — unexploitable today because the handler validates ownership via `findByIdAndAccountId` first, but it violated this plan's own multi-tenancy constraint and left a tenant-unsafe primitive on a shared repository. **Fix:** switched to `updateMany({ where: { id, accountId } })` + a `NotFoundError` throw on zero rows affected + a follow-up `findUniqueOrThrow` for the return value (Prisma's `update()` requires a unique field in `where`, and there's no compound unique on `(id, accountId)`, hence `updateMany`). Updated the call site in `UpdateEventAttendanceHandler` and both affected test files (repository spec gained a second test for the zero-rows case; handler spec's two `updateAttendance` call assertions gained the `accountId` argument).

Three Minor findings were noted but deliberately left as-is (consistent with this plan's existing pattern of flagging known trade-offs rather than gold-plating): `actorUserId`'s `as any` cast (matches the codebase's existing `moderator_auth.guard.ts` convention), the value-set duplicated across 6 files (accepted for a 2-value enum, see Self-Review Notes below), and `attendanceRecordedBy` having no FK relation (deliberate per Task 1).

Task 13's checklist above was amended with Steps 10-14 to specifically exercise all four fixes, since none of them were covered by the existing automated test suite.

## Self-Review Notes

- **Spec coverage:** every element from the approved chat discussion (enum+fields, dedicated PATCH endpoint, no history table, list handler exposing status, reused `EDIT_EVENT`/`DELETE_EVENT` permissions, EventDialog left untouched, right-click context menu via `eventDidMount`/`eventWillUnmount`, delete added to that same menu) has a task.
- **Placeholder scan:** no TBD/TODO; every step has literal code or an exact command.
- **Type consistency:** `EventAttendanceStatusInput` (Task 3) is the type used by Task 4's handler, Task 5's facade, and Task 9's delegator; `attendanceStatus`/`attendanceRecordedAt`/`attendanceRecordedBy` field names match across Tasks 1, 2, 4, 6. `CalendarService.updateEventAttendance` signature is identical across Task 5 (core) and Task 9 (NestJS) except for the `this.coreService` delegation.
- **Scope:** deliberately excludes the vault's Fase 3 (colored badges/indicators on calendar tiles) and the audit history table — both flagged as later, separable work if the team asks for them.
