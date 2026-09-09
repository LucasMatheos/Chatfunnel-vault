# Persistência de `closedColumnId` no KanbanCards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistir, no card do Kanban, a coluna em que ele estava no momento em que atingiu um status terminal (`WON` ou `LOST`), num campo dedicado `closedColumnId` que não é sobrescrito por movimentações posteriores.

**Architecture:** Um único campo escalar `closedColumnId` (FK nullable para `KanbanColumns`, `ON DELETE SET NULL`) no model `KanbanCards`. A escrita acontece dentro de `KanbanCardsRepository.changeStatusOportunity` — que já trata WON e LOST no mesmo caminho. Em transição terminal grava a coluna atual do card; ao reabrir (`OPEN`) limpa o campo. **Consumo por relatórios está FORA do escopo deste plano — é outra atividade.**

**Tech Stack:** TypeScript, Prisma (PostgreSQL), Jest + @swc/jest (unit tests com mock de PrismaClient).

## Global Constraints

- **Repo alvo:** `chatfunnel-core` (sub-repo com git próprio). Nada de editar `node_modules/@chatfunnel/core` nos consumidores.
- **Branch e commits são manuais do usuário** — o plano não cria branch nem commita. O engenheiro só edita arquivos e roda os unit tests; versionamento fica a cargo do usuário.
- **PROIBIDO rodar migrations/DB:** nunca executar `prisma migrate dev`, `prisma migrate deploy`, `prisma db push`, `prisma db execute` nem conectar ao banco. **A migration é SEMPRE manual do usuário** — o engenheiro/subagente NÃO escreve o arquivo `.sql` nem cria o diretório de migration. Tanto a criação do arquivo quanto a aplicação no deploy são feitas pelo usuário.
- **Build/generate/publish do core é manual do usuário.** O engenheiro edita `src/` e `prisma/schema.prisma` e roda apenas os unit tests (que usam mock, não precisam de `prisma generate`). `npx prisma generate` (codegen, sem DB) e `npm run build` são passos do USUÁRIO, sinalizados no fim.
- **Campo escalar único** `closedColumnId String? @db.Uuid`, FK `ON DELETE SET NULL`. Decisão de produto já tomada: **um** campo (não `wonColumnId`+`lostColumnId`); `statusOportunity` desambigua WON vs LOST.
- **Comentários e strings em pt-BR** com acentuação correta.
- `changeStatusOportunity` **não altera** `columnId` do card — logo a `columnId` lida após o `updateMany` ainda é a coluna de fechamento.

---

## File Structure

- `chatfunnel-core/prisma/schema.prisma` — model `KanbanCards` (novo campo + relação) e model `KanbanColumns` (back-relations nomeadas). Responsável pelo contrato de dados.
- `chatfunnel-core/src/repositories/kanban_cards.repository.ts` — método `changeStatusOportunity`: lógica de escrita do `closedColumnId`.
- `chatfunnel-core/src/repositories/kanban_cards.closed-column.spec.ts` — unit test da lógica de escrita (novo arquivo).

---

## Task 1: Schema + migration do campo `closedColumnId`

**Files:**
- Modify: `chatfunnel-core/prisma/schema.prisma` (model `KanbanCards` ~2385-2414 e model `KanbanColumns` ~2364-2383)

> A migration `.sql` correspondente é criada MANUALMENTE pelo usuário — fora do escopo do engenheiro/subagente.

**Interfaces:**
- Produces: coluna `KanbanCards.closedColumnId` (UUID nullable) + relação Prisma `closedColumn` / back-relation `closedCards`. A Task 2 escreve nesse campo via `data: { closedColumnId: ... }`.

- [ ] **Step 1: Nomear a relação existente entre `KanbanCards` e `KanbanColumns`**

Adicionar um segundo relacionamento entre os mesmos dois models exige nome explícito em AMBOS. No model `KanbanCards`, trocar a linha da relação `column`:

De:
```prisma
  column                    KanbanColumns                   @relation(fields: [columnId], references: [id], onDelete: Cascade)
```
Para:
```prisma
  column                    KanbanColumns                   @relation("cardColumn", fields: [columnId], references: [id], onDelete: Cascade)
```

- [ ] **Step 2: Adicionar o campo `closedColumnId` + relação no model `KanbanCards`**

Logo após a linha `amount ... @default(0)` (antes do bloco de índice `// partial indexes ...`), inserir:

```prisma
  // Coluna em que o card estava ao atingir status terminal (WON/LOST). Não é
  // sobrescrita por movimentações posteriores; limpa ao reabrir (OPEN).
  closedColumnId            String?                         @db.Uuid
  closedColumn              KanbanColumns?                  @relation("closedColumnCards", fields: [closedColumnId], references: [id], onDelete: SetNull)
```

- [ ] **Step 3: Adicionar as back-relations nomeadas no model `KanbanColumns`**

De:
```prisma
  cards             KanbanCards[]
```
Para:
```prisma
  cards             KanbanCards[]        @relation("cardColumn")
  closedCards       KanbanCards[]        @relation("closedColumnCards")
```

- [ ] **Step 4: Validar o schema (sem tocar no banco)**

Run: `cd chatfunnel-core && npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀` (nenhum erro de relação ambígua). Se acusar relação faltando nome, revisar Steps 1 e 3.

> NÃO rodar `prisma migrate`/`db push`/`generate` aqui — validação é DB-free.

> **Migration:** o engenheiro/subagente PARA por aqui na Task 1. A escrita do arquivo `migration.sql` (DDL da coluna + FK) e sua aplicação são MANUAIS do usuário — ver "Passos do USUÁRIO" no fim. O DDL de referência (para o usuário) é:
>
> ```sql
> ALTER TABLE "KanbanCards" ADD COLUMN "closedColumnId" UUID;
> ALTER TABLE "KanbanCards" ADD CONSTRAINT "KanbanCards_closedColumnId_fkey" FOREIGN KEY ("closedColumnId") REFERENCES "KanbanColumns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
> ```

---

## Task 2: Gravar `closedColumnId` em `changeStatusOportunity`

**Files:**
- Modify: `chatfunnel-core/src/repositories/kanban_cards.repository.ts:991-1009` (bloco `updateMany` + `findMany` dentro de `changeStatusOportunity`)
- Test: `chatfunnel-core/src/repositories/kanban_cards.closed-column.spec.ts` (criar)

**Interfaces:**
- Consumes: campo `KanbanCards.closedColumnId` (Task 1).
- Consumes: `changeStatusOportunity(cardsIds: string[], status: KanbanCardsStatusOportunityEnum, lossReason?, user?, accountId?): Promise<void>` — assinatura **não muda**.
- Produces: comportamento observável — em `WON`/`LOST` chama `prisma.kanbanCards.update({ where: { id }, data: { closedColumnId: <columnId atual> } })` por card; em `OPEN` inclui `closedColumnId: null` no `updateMany` em lote e não faz update per-card.

- [ ] **Step 1: Escrever o teste que falha**

Criar `chatfunnel-core/src/repositories/kanban_cards.closed-column.spec.ts`:

```ts
import { KanbanCardsRepository } from "./kanban_cards.repository";
import { KanbanCardsStatusOportunityEnum } from "@prisma/client";

function makePrismaMock(overrides: any = {}): any {
  return {
    kanbanCards: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([
        { id: "card-1", columnId: "col-1", kanbanId: "k-1", contact: {} },
      ]),
      ...overrides.kanbanCards,
    },
  };
}

describe("KanbanCardsRepository.changeStatusOportunity - closedColumnId", () => {
  const originalSignalR = (global as any).signalR;

  afterEach(() => {
    (global as any).signalR = originalSignalR;
    jest.restoreAllMocks();
  });

  it("grava closedColumnId com a coluna atual ao marcar LOST", async () => {
    const prisma = makePrismaMock();
    const repo = new KanbanCardsRepository(prisma);
    (repo as any).executeAutomations = jest.fn();

    await repo.changeStatusOportunity(
      ["card-1"],
      KanbanCardsStatusOportunityEnum.LOST,
      {},
      null,
      null,
    );

    expect(prisma.kanbanCards.update).toHaveBeenCalledWith({
      where: { id: "card-1" },
      data: { closedColumnId: "col-1" },
    });
    expect(
      prisma.kanbanCards.updateMany.mock.calls[0][0].data,
    ).not.toHaveProperty("closedColumnId");
  });

  it("limpa closedColumnId (null) ao reabrir (OPEN) e não faz update per-card", async () => {
    const prisma = makePrismaMock();
    const repo = new KanbanCardsRepository(prisma);
    (repo as any).executeAutomations = jest.fn();

    await repo.changeStatusOportunity(
      ["card-1"],
      KanbanCardsStatusOportunityEnum.OPEN,
      {},
      null,
      null,
    );

    expect(prisma.kanbanCards.updateMany.mock.calls[0][0].data).toMatchObject({
      closedColumnId: null,
    });
    expect(prisma.kanbanCards.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd chatfunnel-core && npx jest kanban_cards.closed-column`
Expected: FAIL — o primeiro teste falha porque `prisma.kanbanCards.update` não é chamado (lógica ainda não existe); o segundo falha porque `data` do `updateMany` não contém `closedColumnId`.

- [ ] **Step 3: Implementar a lógica mínima**

Em `chatfunnel-core/src/repositories/kanban_cards.repository.ts`, dentro de `changeStatusOportunity`, substituir o bloco atual:

```ts
    await this.prisma.kanbanCards.updateMany({
      where: { id: { in: cardsIds } },
      data: {
        statusOportunity: status,
        statusOportunityUpdatedAt: new Date(),
        lossReasonId: lossReason?.lossId ?? null,
        lossReasonMessage: lossReason?.message ?? null,
      },
    });

    const cards = await this.prisma.kanbanCards.findMany({
      where: {
        id: { in: cardsIds },
        isDeleted: false,
        column: { isDeleted: false },
        kanban: { isDeleted: false },
      },
      include: { contact: true },
    });
```

Por:

```ts
    const isTerminal = status !== KanbanCardsStatusOportunityEnum.OPEN;

    await this.prisma.kanbanCards.updateMany({
      where: { id: { in: cardsIds } },
      data: {
        statusOportunity: status,
        statusOportunityUpdatedAt: new Date(),
        lossReasonId: lossReason?.lossId ?? null,
        lossReasonMessage: lossReason?.message ?? null,
        // Ao reabrir (OPEN) limpa a coluna de fechamento; valor constante,
        // então cabe no updateMany em lote.
        ...(isTerminal ? {} : { closedColumnId: null }),
      },
    });

    const cards = await this.prisma.kanbanCards.findMany({
      where: {
        id: { in: cardsIds },
        isDeleted: false,
        column: { isDeleted: false },
        kanban: { isDeleted: false },
      },
      include: { contact: true },
    });

    // WON/LOST: grava a coluna atual de cada card como coluna de fechamento.
    // Per-card porque columnId varia entre cards e este método não altera
    // columnId — o valor lido aqui já é a coluna do momento do fechamento.
    if (isTerminal) {
      await Promise.all(
        cards.map((card) =>
          this.prisma.kanbanCards.update({
            where: { id: card.id },
            data: { closedColumnId: card.columnId },
          }),
        ),
      );
    }
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd chatfunnel-core && npx jest kanban_cards.closed-column`
Expected: PASS (2 passed).

---

## Passos do USUÁRIO (fora do escopo do engenheiro/subagente)

Estes NÃO são executados automaticamente — dependem de build/deploy manual do core:

1. Criar o arquivo de migration `prisma/migrations/<timestamp>_add_kanban_card_closed_column/migration.sql` com o DDL de referência da Task 1 (timestamp UTC `YYYYMMDDHHMMSS`, lexicograficamente posterior ao último existente).
2. `cd chatfunnel-core && npx prisma generate` (codegen, sem DB) para o Prisma Client conhecer `closedColumnId`.
3. `npm run build` do core.
4. Aplicar a migration no ambiente via pipeline normal de deploy (nunca `prisma migrate`/`db push` local contra o banco).
5. Republicar/sincronizar `@chatfunnel/core` para os consumidores (api/services) — manual.

---

## Self-Review

**1. Cobertura do escopo (persistência apenas):**
- Campo criado no schema Prisma (`KanbanCards`) → Task 1. Migration `.sql` é manual do usuário (Passos do USUÁRIO). ✅
- Preenchido com a coluna atual ao marcar WON/LOST → Task 2, Step 3 (bloco `isTerminal`). ✅
- Mover o card depois não altera o valor → garantido: só `changeStatusOportunity` escreve `closedColumnId`; `move-kanban-card.handler` toca apenas `columnId`. ✅
- Regra de reabertura (OPEN limpa) → Task 2 (`closedColumnId: null` no `updateMany`), coberta por teste. ✅
- Relatórios (`crm-funnel`, `crm-performance`, `dashboard-reports`) → **fora do escopo por decisão do usuário**; outra atividade. ✅ (declarado no Goal)

**2. Placeholders:** nenhum "TBD/TODO/etc." — todo código e SQL estão completos.

**3. Consistência de tipos/nomes:** campo `closedColumnId` idêntico em schema, migration (`"closedColumnId"`), lógica (`data: { closedColumnId }`) e testes. Relações `"cardColumn"` e `"closedColumnCards"` nomeadas nos dois lados (`KanbanCards` e `KanbanColumns`). Enum `KanbanCardsStatusOportunityEnum` usado como já importado no repositório (`@prisma/client`). Assinatura de `changeStatusOportunity` inalterada — nenhum caller (`change-kanban-card-status.handler.ts:37`) precisa mudar.

---

**Nota sobre decisão em aberto da task original:** os testes assumem "reabrir limpa `closedColumnId`". Se o time decidir manter o valor após reabrir, remover o spread `{ closedColumnId: null }` do `updateMany` e ajustar o segundo teste. Confirmar antes de executar a Task 2.
