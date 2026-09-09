# Plano: Filtro de eventos por sobreposição (overlap) de intervalos

**Data:** 2026-07-16
**Autor:** Lucas + Claude
**Supersede:** Task 4 de `docs/superpowers/plans/2026-07-15-calendar-google-sync-delivery-1.md` (a abordagem de override no subclass do services foi descartada — ver "Decisão de arquitetura").
**Relacionado:** `vault/wiki/gotchas/calendar-sync-cancellation-blindness.md`

---

## 1. Problema

Eventos do Google Calendar que **atravessam a borda** da janela consultada não aparecem.

**Exemplo do usuário:** evento começa domingo e termina terça → não aparece na segunda-feira quando se consulta a semana (seg–dom).

Sintoma visível: buracos no grid semanal do FullCalendar. Sintoma oculto (mais grave): double-booking na checagem de disponibilidade.

---

## 2. Causa raiz

`chatfunnel-core/src/repositories/google_calendar_events.repository.ts:118` filtra por **containment** (evento inteiramente dentro da janela):

```ts
where: {
  accountId,
  isCancelled: false,
  startAt: { gte: startAt },   // ❌ início do evento >= início da janela
  endAt:   { lte: endAt },     // ❌ fim do evento    <= fim da janela
  ...
}
```

Um evento com `startAt` **antes** da janela é reprovado no `gte` → descartado, mesmo que aconteça durante a janela.

### Semântica correta: sobreposição semiaberta

Dois intervalos `[evStart, evEnd)` e `[winStart, winEnd)` se sobrepõem sse:

```
evStart < winEnd  AND  evEnd > winStart
```

Em Prisma:

```ts
startAt: { lt: endAt },   // ✅
endAt:   { gt: startAt }, // ✅
```

**Por que `lt`/`gt` (estrito) e não `lte`/`gte`:** o FullCalendar envia `end` **exclusivo** (a semana seg 00:00 → próx. seg 00:00). Com `lt`/`gt`, um evento que termina exatamente às 00:00 de segunda não vaza para a semana anterior, e um que começa 00:00 de segunda não vaza para a próxima. É a fronteira correta para intervalos semiabertos.

---

## 3. Blast radius — 3 callers, o fix corrige 2 bugs

Todos passam pela mesma assinatura `findManyByAccountIdAndDateRange(accountId, startAt, endAt, googleCalendarIds?)`:

| Caller | Arquivo | Efeito hoje (containment) | Com overlap |
|--------|---------|---------------------------|-------------|
| Listagem da semana (FullCalendar) | `chatfunnel-core` → `services/calendar/handlers/list-events.handler.ts` | **eventos que cruzam a borda somem** (bug relatado) | ✅ aparecem |
| Checagem de disponibilidade | `chatfunnel-core` → `services/calendar/handlers/check-availability.handler.ts` | **double-booking**: evento 13–15h não é achado ao checar slot 14–16h → diz "livre" estando ocupado | ✅ conflito detectado |
| Backfill do sync | `chatfunnel-services/src/modules/google_calendars/services/calendar-sync.service.ts:79` | irrelevante — dedup por `googleEventId`, janela [hoje, +1ano] | inofensivo |

`check-availability.handler.ts` trata **qualquer** evento retornado como conflito (`conflicts.length > 0 → indisponível`). Com containment, conflitos parciais escapam → **é um bug latente de agendamento duplo**, corrigido de brinde.

---

## 4. Decisão de arquitetura: corrigir na FONTE do core

**Descartado:** override do método no subclass do services (`chatfunnel-services/.../google_calendar_events.repository.ts`), que era a proposta da Task 4 original.

**Motivo:** o override **duplicaria** a query inteira (where + include + orderBy) e corrigiria só o services, deixando uma cópia divergente que pode se descolar do schema. Manutenção pior.

**Escolhido:** corrigir direto em `chatfunnel-core/src/repositories/google_calendar_events.repository.ts`. Um único ponto de verdade; todos os consumers herdam ao atualizar a versão.

**Regra do workspace (respeitada):** proibido editar `node_modules/@chatfunnel/core` de qualquer consumer. **Permitido** editar `chatfunnel-core/src/**` e rebuildar. O **publish + bump de versão + `npm install` nos consumers é manual, feito pelo usuário** (Vinicius) — o agente não sincroniza nada em `node_modules`.

---

## 5. Mudança (diff exato)

**Arquivo:** `chatfunnel-core/src/repositories/google_calendar_events.repository.ts`

Só o bloco `where` muda; `include` e `orderBy` permanecem idênticos:

```diff
   async findManyByAccountIdAndDateRange(
     accountId: string,
     startAt: Date,
     endAt: Date,
     googleCalendarIds?: string[],
   ): Promise<any[]> {
     return this.prisma.googleCalendarEvents.findMany({
       where: {
         accountId,
         isCancelled: false,
-        startAt: { gte: startAt },
-        endAt: { lte: endAt },
+        // Sobreposição semiaberta: traz eventos que cruzam as bordas da janela
+        // (ex.: começa domingo, termina terça → aparece na segunda). lt/gt casa
+        // com o `end` EXCLUSIVO do FullCalendar. Antes usava containment (gte/lte),
+        // que descartava eventos parcialmente dentro da janela.
+        startAt: { lt: endAt },
+        endAt: { gt: startAt },
         ...(googleCalendarIds?.length
           ? { googleCalendarId: { in: googleCalendarIds } }
           : {}),
       },
       include: {
         googleCalendar: {
           include: {
             user: {
               select: { id: true, name: true, email: true, photo: true },
             },
           },
         },
       },
       orderBy: { startAt: "asc" },
     });
   }
```

Sem mudança de schema Prisma, sem migration.

---

## 6. Passos (TDD)

Rodar tudo dentro de `chatfunnel-core`. Runner: **Jest + @swc/jest** (já configurado). Padrão de spec de repo: `src/repositories/tags_contacts.repository.spec.ts` (prisma mock + assert em `findMany.mock.calls[0][0].where`).

### Step 1 — Teste que falha

Criar `chatfunnel-core/src/repositories/google_calendar_events.repository.spec.ts`:

```ts
import { GoogleCalendarEventsRepository } from "./google_calendar_events.repository";

describe("GoogleCalendarEventsRepository.findManyByAccountIdAndDateRange", () => {
  const makeRepo = () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma: any = { googleCalendarEvents: { findMany } };
    return { repo: new GoogleCalendarEventsRepository(prisma), findMany };
  };

  it("usa where de sobreposição semiaberta (startAt<fim, endAt>início), não containment", async () => {
    const { repo, findMany } = makeRepo();
    const start = new Date("2026-07-13T00:00:00Z");
    const end = new Date("2026-07-20T00:00:00Z");

    await repo.findManyByAccountIdAndDateRange("acc-1", start, end);

    const where = findMany.mock.calls[0][0].where;
    expect(where.startAt).toEqual({ lt: end });
    expect(where.endAt).toEqual({ gt: start });
    expect(where.accountId).toBe("acc-1");
    expect(where.isCancelled).toBe(false);
    expect(where.googleCalendarId).toBeUndefined();
  });

  it("aplica filtro de googleCalendarId quando ids são passados", async () => {
    const { repo, findMany } = makeRepo();
    await repo.findManyByAccountIdAndDateRange(
      "acc-1",
      new Date("2026-07-13T00:00:00Z"),
      new Date("2026-07-20T00:00:00Z"),
      ["cal-1", "cal-2"],
    );
    const where = findMany.mock.calls[0][0].where;
    expect(where.googleCalendarId).toEqual({ in: ["cal-1", "cal-2"] });
  });
});
```

### Step 2 — Confirmar que falha

```bash
cd chatfunnel-core && npx jest src/repositories/google_calendar_events.repository.spec.ts
```
Esperado: **FAIL** — hoje é `startAt: { gte }` / `endAt: { lte }`.

### Step 3 — Aplicar o fix

Editar `where` conforme o diff da Seção 5.

### Step 4 — Confirmar que passa

```bash
cd chatfunnel-core && npx jest src/repositories/google_calendar_events.repository.spec.ts
```
Esperado: **PASS** (2 testes).

### Step 5 — Regressão do check-availability (comportamento de negócio muda)

O fix passa a **rejeitar mais slots** (corretamente). Adicionar spec cobrindo conflito parcial em `services/calendar/handlers/check-availability.handler.ts` — mockar `findManyByAccountIdAndDateRange` retornando um evento parcialmente sobreposto e um caso sem sobreposição, e assertar `available` false/true respectivamente. (Se o padrão de teste de handler não existir no core, criar seguindo o estilo dos `__tests__` de reports.)

### Step 6 — Build do core

```bash
cd chatfunnel-core && npm run build   # prisma generate + tsc
```
Esperado: build verde (tsc sem erro).

### Step 7 — Publish + sync (MANUAL, pelo usuário)

- Bump de versão em `chatfunnel-core/package.json` (atual `1.0.34` → `1.0.35`).
- `npm publish` (GitHub Packages).
- Nos consumers que renderizam calendário/agendam (`chatfunnel-services` no mínimo; conferir `api`/`scheduler`/`worker-broadcast` se consomem calendar): atualizar a dependência e `npm install`.
- ⚠ O agente **não** faz este passo nem toca em `node_modules`.

### Step 8 — Verificação funcional

- FullCalendar: criar evento domingo→terça, abrir a semana da segunda → deve aparecer.
- Disponibilidade: com evento 13–15h, checar slot 14–16h → deve retornar indisponível.

---

## 7. Rollback

Reverter o bloco `where` para `gte`/`lte` e republicar o core. Sem migration para desfazer. Baixo risco.

---

## 8. Notas e riscos

- **Sem migration / sem mudança de schema** — só lógica de query.
- **Índice:** a query filtra por `accountId + startAt + endAt (+ googleCalendarId)`. A mudança de operador não altera a estratégia de índice; se já havia performance aceitável com containment, overlap é equivalente. Índice composto é otimização à parte, fora do escopo.
- **Timezone:** `startAt`/`endAt` são `DateTime` (UTC no banco). O fix é agnóstico a fuso — a conversão acontece na borda (front/handler), não aqui.
- **Backfill do sync** (`calendar-sync.service.ts`): não requer mudança; passa a usar overlap automaticamente ao atualizar o core (inofensivo para o dedup).
- **Consumers desatualizados** continuam com containment até o `npm install` — comportamento inconsistente entre serviços durante a janela de rollout. Coordenar o deploy.

---

## 9. Checklist

- [ ] Step 1: spec falhando criado
- [ ] Step 2: confirmado FAIL
- [ ] Step 3: fix aplicado (where overlap)
- [ ] Step 4: confirmado PASS
- [ ] Step 5: regressão check-availability
- [ ] Step 6: `npm run build` verde no core
- [ ] Step 7: **(usuário)** bump + publish + install nos consumers
- [ ] Step 8: verificação funcional (semana + disponibilidade)
