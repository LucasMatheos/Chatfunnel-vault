---
title: upsert de GoogleCalendarEvents não escopava por conta (googleEventId global)
description: upsertByGoogleEventId chaveava só por googleEventId; conta B compartilhando a mesma agenda Google podia sobrescrever o evento da conta A.
tags: [gotcha, calendar, google-calendar, multi-tenancy, prisma]
severity: media
related: ["[[calendar]]", "[[calendar-sync-cancellation-blindness]]", "[[database-gotchas]]"]
last_updated: 2026-07-17
---

# upsert de GoogleCalendarEvents não escopava por conta

## O que acontece

`GoogleCalendarEventsRepository.upsertByGoogleEventId` (core) fazia:

```ts
this.prisma.googleCalendarEvents.upsert({
  where: { googleEventId },   // só googleEventId — SEM accountId
  create: data,               // create tem accountId
  update: { title, description, startAt, endAt, meetingLink, isCancelled },
                              // update NÃO mexe em accountId
})
```

O `where` decidia create vs update **só pelo `googleEventId`**, que era `@unique` **global**. Se duas contas (tenants) diferentes conectam a **mesma agenda Google compartilhada**, o mesmo `googleEventId` aparece nas duas. O resync/import da conta B acha a linha da conta A e roda o `update`: sobrescreve título/datas/link. O `accountId` da linha continua o da conta A (o update não o toca) — o que vaza é o **conteúdo**, não a posse.

Isso viola a regra de multi-tenancy do projeto ("toda query filtra por `accountId`"). O isolamento dependia de `googleEventId` ser único entre contas, o que **não** é garantido com agenda compartilhada.

## Por que

- `googleEventId String? @unique` no schema → unicidade global.
- `upsert` do Prisma exige um localizador **único** no `where`; com unique global, o único localizador possível era `googleEventId` sozinho, sem como incluir `accountId`.
- Herdado do fluxo legado `importGoogleToLocal`; o resync manual (2026-07-16) só reexpôs o mesmo `upsert`.

## Correção aplicada (staged — pendente migration)

`chatfunnel-core`, em 2026-07-17:

1. **Schema** (`prisma/schema.prisma`, modelo `GoogleCalendarEvents`):
   - `googleEventId String? @unique` → `googleEventId String?`
   - adicionado `@@unique([accountId, googleCalendarId, googleEventId])` (mantido `@@index([googleEventId])`).
2. **Repo** (`src/repositories/google_calendar_events.repository.ts`, `upsertByGoogleEventId`):
   - `where: { googleEventId }` → `where: { accountId_googleCalendarId_googleEventId: { accountId: data.accountId, googleCalendarId: data.googleCalendarId ?? null, googleEventId } }` (assinatura do método inalterada).

### Por que a agenda (`googleCalendarId`) entra na chave

O Google **compartilha o mesmo `event id`** entre cópias de um evento em agendas diferentes (organizador + convidados). Se uma conta tem duas agendas conectadas (ex.: "Mateus" e "Letícia") e o evento é compartilhado entre elas, o mesmo `googleEventId` chega pelas duas.

- Com chave `(accountId, googleEventId)`: colapsaria em 1 row → o evento apareceria em **só uma** agenda no módulo (a 1ª sincronizada; o `update` não troca `googleCalendarId`).
- Com chave `(accountId, googleCalendarId, googleEventId)`: 1 row **por agenda** → o evento compartilhado aparece nas **duas** agendas. Resolve multi-tenancy **e** multi-agenda.

Decisão do usuário (2026-07-17): aparecer nas duas agendas.

## Follow-up PENDENTE (não rodado — decisão do usuário)

O código está **staged**: não compila nem funciona até rodar, na ordem:

1. `prisma migrate dev --create-only` (no `chatfunnel-core`) — gera o SQL (dropa unique antigo de `googleEventId`, cria o composto). Revisar antes de aplicar.
2. `npm run prisma:generate` — regenera o client com o input composto `accountId_googleEventId` (sem isso o `tsc` do core quebra no `where` novo).
3. Rebuild do core (`tsc`) + `sync-core.ps1` para os consumers.
4. Aplicar a migration no banco.

**Notas:**
- Migration é segura quanto a dados: como `googleEventId` já era `@unique` global, não há duplicatas `(accountId, googleEventId)` — sem colisão na criação do composto.
- Eventos nativos (`googleEventId` null) seguem podendo ter vários por conta — no Postgres NULLs são distintos num unique. Comportamento idêntico ao anterior.
- Runtime: o `upsert` com chave composta só funciona **após** a constraint existir no banco (passo 4); antes disso falha — por isso 1-4 andam juntos.
