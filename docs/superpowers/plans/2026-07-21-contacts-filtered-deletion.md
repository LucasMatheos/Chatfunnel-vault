# Exclusão de Contatos Filtrados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Excluir todos os contatos correspondentes aos filtros ativos da listagem (não só a página atual), com confirmação textual e barra de progresso, seguindo o mesmo padrão do `delete-all` legado — porém com paridade total de filtro.

**Architecture:** Novo endpoint SSE em `chatfunnel-services` (`POST /nest/contacts/delete-filtered`) que faz soft-delete em lotes. A paridade de filtro vem de reaproveitar o `getContacts` do `chatfunnel-core` (que já aceita o filtro completo e retorna `id`+`photo`): o loop pede sempre a página 1 (`pageSize` 500), apaga o lote, e a próxima volta traz o próximo lote porque os apagados saem do filtro `isDeleted = false`. Progresso via SSE consumido pelo `NestApi.streamPost` já existente no front. Sem fila, sem entidade de job, sem migration.

**Tech Stack:** NestJS 10 + class-validator (services), TypeScript + Prisma raw SQL (core), Vue 3 `<script setup>` + Vitest (front), Jest (core/services), AWS SDK v3 S3.

**Spec de referência:** `vault/wiki/features/contacts-filtered-deletion-plan.md`

## Global Constraints

- **Soft delete sempre:** `isDeleted: true` + `deletedAt`. Nunca hard delete. `where` exige `isDeleted: false` (repetível).
- **Multi-tenancy:** `accountId` em toda query, obtido do header de auth — nunca do body.
- **Core é sincronizado manualmente pelo usuário:** alterações em `chatfunnel-core/src` só chegam ao `chatfunnel-services` depois que o usuário rebuilda/publica/bumpa o pacote `@chatfunnel/core`. NUNCA editar `node_modules/@chatfunnel/core`. Tasks de core (1–3) são testadas no repo core isoladamente; tasks de services (4–6) só rodam end-to-end após o sync.
- **Confirmação textual:** a palavra é exatamente `excluir contatos` (minúsculas, trim). Já é a palavra usada pelo modal atual.
- **Strings user-facing em pt-BR acentuado.**
- **Git:** este plano NÃO inclui passos de commit nem troca de branch — versionamento fica a cargo do usuário.
- **Estilo por repo:** services/core = double quotes + semicolons; front = single quote + **sem** semicolon (Prettier do front: `"semi": false`).
- **Services:** class-validator para DTO; rotas literais antes de parametrizadas; winston, não `console.log`.

---

### Task 1: `softDeleteMany` no ContactsRepository (core)

**Files:**
- Modify: `chatfunnel-core/src/repositories/contacts.repository.ts` (adicionar método perto de `inactivateContacts`, ~linha 1069)
- Test: `chatfunnel-core/src/repositories/__tests__/contacts.softDeleteMany.spec.ts` (criar)

**Interfaces:**
- Produces: `ContactsRepository.softDeleteMany(accountId: string, contactIds: string[]): Promise<{ count: number }>`

- [ ] **Step 1: Escrever o teste que falha**

Criar `chatfunnel-core/src/repositories/__tests__/contacts.softDeleteMany.spec.ts`:

```typescript
import { ContactsRepository } from "../contacts.repository";

describe("ContactsRepository.softDeleteMany", () => {
  it("marca isDeleted=true/deletedAt exigindo isDeleted=false e o accountId", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const prisma = { contacts: { updateMany } } as any;
    const repo = new ContactsRepository(prisma);

    const result = await repo.softDeleteMany("acc-1", ["c1", "c2"]);

    expect(updateMany).toHaveBeenCalledTimes(1);
    const arg = updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      id: { in: ["c1", "c2"] },
      accountId: "acc-1",
      isDeleted: false,
    });
    expect(arg.data.isDeleted).toBe(true);
    expect(arg.data.deletedAt).toBeInstanceOf(Date);
    expect(result).toEqual({ count: 2 });
  });

  it("não chama o banco quando a lista de ids está vazia", async () => {
    const updateMany = jest.fn();
    const prisma = { contacts: { updateMany } } as any;
    const repo = new ContactsRepository(prisma);

    const result = await repo.softDeleteMany("acc-1", []);

    expect(updateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ count: 0 });
  });
});
```

> Verifique o construtor real de `ContactsRepository` — se ele exigir uma queue além do `prisma`, ajuste a instanciação do mock para `new ContactsRepository(prisma, queueMock)`.

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd chatfunnel-core && npx jest contacts.softDeleteMany -t softDeleteMany`
Expected: FAIL — `repo.softDeleteMany is not a function`

- [ ] **Step 3: Implementar o método**

Em `chatfunnel-core/src/repositories/contacts.repository.ts`, logo antes de `inactivateContacts`:

```typescript
  async softDeleteMany(
    accountId: string,
    contactIds: string[],
  ): Promise<{ count: number }> {
    if (contactIds.length === 0) return { count: 0 };
    return this.prisma.contacts.updateMany({
      where: { id: { in: contactIds }, accountId, isDeleted: false },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd chatfunnel-core && npx jest contacts.softDeleteMany`
Expected: PASS (2 testes)

---

### Task 2: `DeleteFilteredContactsHandler` (core)

**Files:**
- Create: `chatfunnel-core/src/services/contacts/handlers/delete-filtered-contacts.handler.ts`
- Test: `chatfunnel-core/src/services/contacts/handlers/delete-filtered-contacts.handler.spec.ts`

**Interfaces:**
- Consumes: `ContactsRepository.getContacts(options)` (retorna linhas com `id`, `photo`, `totalCount`) e `ContactsRepository.softDeleteMany` (Task 1).
- Produces:
  ```typescript
  type DeleteFilteredProgress = { processed: number; total: number };
  class DeleteFilteredContactsHandler {
    constructor(contactsRepository: ContactsRepository);
    execute(
      accountId: string,
      body: GetContactsBody,
      opts?: { batchSize?: number; onProgress?: (p: DeleteFilteredProgress) => void | Promise<void> },
    ): Promise<{ deleted: number; photos: string[] }>;
  }
  ```

- [ ] **Step 1: Escrever o teste que falha**

Criar `delete-filtered-contacts.handler.spec.ts`:

```typescript
import { ContactsRepository } from "../../../repositories/contacts.repository";
import { DeleteFilteredContactsHandler } from "./delete-filtered-contacts.handler";

describe("DeleteFilteredContactsHandler", () => {
  it("apaga em lotes chamando sempre page 1 até esvaziar e coleta fotos", async () => {
    // 1º lote: 2 contatos (total 3), 2º lote: 1 contato, 3º lote: vazio
    const getContacts = jest
      .fn()
      .mockResolvedValueOnce([
        { id: "c1", photo: "p1", totalCount: 3 },
        { id: "c2", photo: null, totalCount: 3 },
      ])
      .mockResolvedValueOnce([{ id: "c3", photo: "p3", totalCount: 1 }])
      .mockResolvedValueOnce([]);
    const softDeleteMany = jest.fn().mockResolvedValue({ count: 2 });
    const repo = { getContacts, softDeleteMany } as unknown as ContactsRepository;

    const progress: any[] = [];
    const handler = new DeleteFilteredContactsHandler(repo);
    const result = await handler.execute("acc-1", {}, {
      batchSize: 2,
      onProgress: (p) => { progress.push(p); },
    });

    // page sempre 1, pageSize = batchSize
    expect(getContacts).toHaveBeenCalledTimes(3);
    for (const call of getContacts.mock.calls) {
      expect(call[0].page).toBe(1);
      expect(call[0].pageSize).toBe(2);
      expect(call[0].accountId).toBe("acc-1");
    }
    expect(softDeleteMany.mock.calls[0][1]).toEqual(["c1", "c2"]);
    expect(softDeleteMany.mock.calls[1][1]).toEqual(["c3"]);
    expect(result.deleted).toBe(3);
    expect(result.photos).toEqual(["p1", "p3"]); // null filtrado
    // total é fixado no 1º lote (3), processed cresce
    expect(progress).toEqual([
      { processed: 2, total: 3 },
      { processed: 3, total: 3 },
    ]);
  });

  it("encerra sem apagar quando não há contatos", async () => {
    const getContacts = jest.fn().mockResolvedValue([]);
    const softDeleteMany = jest.fn();
    const repo = { getContacts, softDeleteMany } as unknown as ContactsRepository;

    const result = await new DeleteFilteredContactsHandler(repo).execute("acc-1", {});

    expect(softDeleteMany).not.toHaveBeenCalled();
    expect(result).toEqual({ deleted: 0, photos: [] });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd chatfunnel-core && npx jest delete-filtered-contacts`
Expected: FAIL — módulo não encontrado / classe indefinida

- [ ] **Step 3: Implementar o handler**

Criar `delete-filtered-contacts.handler.ts`:

```typescript
import {
  ContactsRepository,
  GetContactsOptions,
} from "../../../repositories/contacts.repository";
import { GetContactsBody } from "../types";

export type DeleteFilteredProgress = { processed: number; total: number };

const DEFAULT_BATCH_SIZE = 500;

export class DeleteFilteredContactsHandler {
  constructor(private readonly contactsRepository: ContactsRepository) {}

  async execute(
    accountId: string,
    body: GetContactsBody,
    opts: {
      batchSize?: number;
      onProgress?: (p: DeleteFilteredProgress) => void | Promise<void>;
    } = {},
  ): Promise<{ deleted: number; photos: string[] }> {
    const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
    const photos: string[] = [];
    let processed = 0;
    let total = 0;
    let firstBatch = true;

    // page fixa em 1: contatos apagados saem do filtro isDeleted=false,
    // então page 1 sempre traz o próximo lote pendente (cursor implícito).
    while (true) {
      const rows: any[] = await this.contactsRepository.getContacts({
        ...body,
        accountId,
        page: 1,
        pageSize: batchSize,
      } as GetContactsOptions);

      if (rows.length === 0) break;

      if (firstBatch) {
        total = rows.length > 0 ? Number(rows[0].totalCount) : 0;
        firstBatch = false;
      }

      const ids = rows.map((r) => r.id);
      for (const r of rows) if (r.photo) photos.push(r.photo);

      await this.contactsRepository.softDeleteMany(accountId, ids);
      processed += ids.length;

      if (opts.onProgress) {
        await opts.onProgress({ processed, total: Math.max(total, processed) });
      }

      if (rows.length < batchSize) break;
    }

    return { deleted: processed, photos };
  }
}
```

> `getContacts` recebe o filtro completo (`GetContactsBody`) já com `timezone` incluído pela camada services. Chamar o repository direto (não o `GetContactsHandler`) já evita o custo do ranking/cache — o ranking é responsabilidade do handler, não do repository.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd chatfunnel-core && npx jest delete-filtered-contacts`
Expected: PASS (2 testes)

---

### Task 3: Expor `deleteFilteredContacts` no core `ContactsService`

**Files:**
- Modify: `chatfunnel-core/src/services/contacts/contacts.service.ts` (adicionar método + import)

**Interfaces:**
- Consumes: `DeleteFilteredContactsHandler` (Task 2)
- Produces: `ContactsService.deleteFilteredContacts(accountId, body, opts?): Promise<{ deleted: number; photos: string[] }>`

- [ ] **Step 1: Adicionar o import**

No topo de `contacts.service.ts`, junto aos outros handlers:

```typescript
import {
  DeleteFilteredContactsHandler,
  DeleteFilteredProgress,
} from "./handlers/delete-filtered-contacts.handler";
```

- [ ] **Step 2: Adicionar o método**

Dentro da classe `ContactsService`, após `getContacts`:

```typescript
  deleteFilteredContacts(
    accountId: string,
    body: GetContactsBody,
    opts: {
      batchSize?: number;
      onProgress?: (p: DeleteFilteredProgress) => void | Promise<void>;
    } = {},
  ): Promise<{ deleted: number; photos: string[] }> {
    return new DeleteFilteredContactsHandler(this.contactsRepository).execute(
      accountId,
      body,
      opts,
    );
  }
```

- [ ] **Step 3: Build do core (garante que compila)**

Run: `cd chatfunnel-core && npm run build`
Expected: build sem erros de tipo

- [ ] **Step 4: CHECKPOINT — sync do core (ação do usuário)**

Peça ao usuário para rebuildar/publicar/bumpar o `@chatfunnel/core` e atualizar a versão no `chatfunnel-services`. As tasks 4–6 dependem disso. **Não editar `node_modules`.**

---

### Task 4: Implementar `delete` no S3StorageAdapter (services)

**Files:**
- Modify: `chatfunnel-services/src/adapters/s3-storage.adapter.ts:34-36` (substituir o stub `delete`)
- Test: `chatfunnel-services/src/adapters/s3-storage.adapter.spec.ts` (criar)

**Interfaces:**
- Produces: `S3StorageAdapter.delete(bucket: string, key: string): Promise<void>` — key-based, mesmo estilo do `upload` (usa `DeleteObjectCommand`).

- [ ] **Step 1: Escrever o teste que falha**

Criar `s3-storage.adapter.spec.ts`:

```typescript
import { S3StorageAdapter } from "./s3-storage.adapter";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

describe("S3StorageAdapter.delete", () => {
  it("envia DeleteObjectCommand com bucket e key", async () => {
    const adapter = new S3StorageAdapter();
    const send = jest.fn().mockResolvedValue({});
    (adapter as any).s3Client = { send };

    await adapter.delete("meu-bucket", "acc/pic.png");

    expect(send).toHaveBeenCalledTimes(1);
    const cmd = send.mock.calls[0][0];
    expect(cmd).toBeInstanceOf(DeleteObjectCommand);
    expect(cmd.input).toEqual({ Bucket: "meu-bucket", Key: "acc/pic.png" });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd chatfunnel-services && npx jest s3-storage.adapter`
Expected: FAIL — `send` não chamado (delete é stub vazio)

- [ ] **Step 3: Implementar (mesmo estilo do `upload`)**

Atualizar o import na linha 2 e o método `delete`:

```typescript
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
```

```typescript
  async delete(bucket: string, key: string): Promise<void> {
    await this.s3Client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key }),
    );
  }
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd chatfunnel-services && npx jest s3-storage.adapter`
Expected: PASS

---

### Task 5: `deleteFilteredContacts` no services `ContactsService`

**Files:**
- Modify: `chatfunnel-services/src/modules/contacts/services/contacts.service.ts` (guardar `accountsRepository` + adapter S3, adicionar método)
- Modify: `chatfunnel-services/src/modules/contacts/contacts.module.ts` (registrar `S3StorageAdapter` como provider)
- Test: `chatfunnel-services/src/modules/contacts/services/contacts.delete-filtered.spec.ts` (criar)

**Interfaces:**
- Consumes: core `coreService.deleteFilteredContacts` (Task 3), `AccountsRepository.verifyContactsLimitById` (herdado do core, já existe), `S3StorageAdapter.delete` (Task 4)
- Produces:
  ```typescript
  ContactsService.deleteFilteredContacts(
    accountId: string,
    body: GetContactsBodyDto & { timezone?: string },
    onProgress: (p: { processed: number; total: number }) => void,
  ): Promise<{ deleted: number }>;
  ```

- [ ] **Step 1: Registrar o adapter no módulo**

Em `contacts.module.ts`, adicionar ao array `providers`:

```typescript
import { S3StorageAdapter } from "src/adapters/s3-storage.adapter";
```
```typescript
    S3StorageAdapter,
```

- [ ] **Step 2: Escrever o teste que falha**

Criar `contacts.delete-filtered.spec.ts`:

```typescript
import { ContactsService } from "./contacts.service";

describe("ContactsService.deleteFilteredContacts (services)", () => {
  function build(coreDelete: any) {
    const service: any = Object.create(ContactsService.prototype);
    service.coreService = { deleteFilteredContacts: coreDelete };
    service.accountsRepository = { verifyContactsLimitById: jest.fn().mockResolvedValue(undefined) };
    service.s3 = { delete: jest.fn().mockResolvedValue(undefined) };
    return service;
  }

  it("repassa filtro/timezone ao core, apaga fotos no S3 e recalcula o limite", async () => {
    const coreDelete = jest.fn().mockResolvedValue({ deleted: 3, photos: ["p1", "p2"] });
    const service = build(coreDelete);
    const onProgress = jest.fn();

    const out = await service.deleteFilteredContacts(
      "acc-1",
      { searchTerm: "joão", timezone: "America/Sao_Paulo" },
      onProgress,
    );

    expect(coreDelete).toHaveBeenCalledWith(
      "acc-1",
      { searchTerm: "joão", timezone: "America/Sao_Paulo" },
      expect.objectContaining({ onProgress }),
    );
    expect(service.s3.delete).toHaveBeenCalledTimes(2);
    expect(service.accountsRepository.verifyContactsLimitById).toHaveBeenCalledWith("acc-1");
    expect(out).toEqual({ deleted: 3 });
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `cd chatfunnel-services && npx jest contacts.delete-filtered`
Expected: FAIL — `deleteFilteredContacts is not a function`

- [ ] **Step 4: Implementar (guardar deps + método)**

Em `contacts.service.ts`: adicionar import do adapter e do DTO, guardar `accountsRepository`/`s3` no construtor (hoje só monta `this.coreService`). Manter a montagem existente do `coreService` intacta.

```typescript
import { S3StorageAdapter } from "src/adapters/s3-storage.adapter";
import { GetContactsBodyDto } from "../dtos/get_contacts.dto";
```

No construtor, guardar as duas dependências (adicionar `private readonly s3: S3StorageAdapter` como novo parâmetro e persistir `accountsRepository`):

```typescript
  constructor(
    contactsRepository: ContactsRepository,
    segmentsRepository: ContactSegmentsRepository,
    redis: RedisService,
    tagsRepository: TagsRepository,
    tagsContactsRepository: TagsContactsRepository,
    customFieldsContactsRepository: CustomFieldsContactsRepository,
    contactInactiveHistoryRepository: ContactInactiveHistoryRepository,
    private readonly accountsRepository: AccountsRepository,
    private readonly s3: S3StorageAdapter,
  ) {
    this.coreService = new CoreContactsService(
      contactsRepository,
      segmentsRepository,
      redis,
      tagsRepository,
      tagsContactsRepository,
      customFieldsContactsRepository,
      contactInactiveHistoryRepository,
      accountsRepository,
    );
  }
```

Adicionar o método (a limpeza de fotos e o recálculo de limite ficam na camada services, onde `s3` e `accountsRepository` estão disponíveis de forma limpa):

```typescript
  async deleteFilteredContacts(
    accountId: string,
    body: GetContactsBodyDto & { timezone?: string },
    onProgress: (p: { processed: number; total: number }) => void,
  ): Promise<{ deleted: number }> {
    const { deleted, photos } = await this.coreService.deleteFilteredContacts(
      accountId,
      body,
      { onProgress },
    );

    // photos vêm como URL completa (mesmo formato que o adapter.upload gera).
    // Normaliza URL -> key na borda; o adapter segue key-based (bucket, key).
    const bucket = process.env.S3_BUCKET;
    const prefix = `https://s3.${process.env.S3_REGION}.amazonaws.com/${bucket}/`;
    const chunkSize = 50;
    for (let i = 0; i < photos.length; i += chunkSize) {
      const chunk = photos.slice(i, i + chunkSize);
      await Promise.allSettled(
        chunk.map((photo) => this.s3.delete(bucket, photo.replace(prefix, ""))),
      );
    }

    await this.accountsRepository.verifyContactsLimitById(accountId);
    return { deleted };
  }
```

> `Promise.allSettled` para uma falha de foto não abortar a exclusão (paridade com o legado, que loga e segue). A normalização URL→key fica no chamador (borda), mantendo o adapter com contrato key-based simétrico ao `upload`.

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `cd chatfunnel-services && npx jest contacts.delete-filtered`
Expected: PASS

---

### Task 6: Endpoint SSE `POST /contacts/delete-filtered` (services)

**Files:**
- Create: `chatfunnel-services/src/modules/contacts/dtos/delete_filtered_contacts.dto.ts`
- Modify: `chatfunnel-services/src/modules/contacts/controllers/contacts.controller.ts` (nova rota, ANTES das rotas parametrizadas)
- Test: `chatfunnel-services/src/modules/contacts/controllers/contacts.controller.spec.ts` (criar)

**Interfaces:**
- Consumes: `ContactsService.deleteFilteredContacts` (Task 5)
- Contrato SSE (compatível com `NestApi.streamPost` do front): frames `data: {"chunk": <0-100>}\n\n` por lote, `data: {"done": true}\n\n` ao final, `data: {"error": "<msg>"}\n\n` em falha.

- [ ] **Step 1: Criar o DTO (reusa o filtro da listagem + confirmação)**

`delete_filtered_contacts.dto.ts`:

```typescript
import { IsString } from "class-validator";
import { GetContactsBodyDto } from "./get_contacts.dto";

export class DeleteFilteredContactsBodyDto extends GetContactsBodyDto {
  @IsString()
  confirmation: string;
}
```

- [ ] **Step 2: Escrever o teste que falha**

Criar `contacts.controller.spec.ts`:

```typescript
import { ContactsController } from "./contacts.controller";

describe("ContactsController.deleteFilteredContacts", () => {
  function mockRes() {
    return {
      writeHead: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    } as any;
  }

  it("recusa com erro quando a confirmação não bate", async () => {
    const service = { deleteFilteredContacts: jest.fn() } as any;
    const controller = new ContactsController(service);
    const res = mockRes();

    await controller.deleteFilteredContacts(
      { confirmation: "errado" } as any,
      "acc-1",
      "America/Sao_Paulo",
      res,
    );

    expect(service.deleteFilteredContacts).not.toHaveBeenCalled();
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"error"'));
    expect(res.end).toHaveBeenCalled();
  });

  it("faz stream de progresso e emite done ao concluir", async () => {
    const service = {
      deleteFilteredContacts: jest.fn(async (_a: any, _b: any, onProgress: any) => {
        onProgress({ processed: 5, total: 10 });
        onProgress({ processed: 10, total: 10 });
        return { deleted: 10 };
      }),
    } as any;
    const controller = new ContactsController(service);
    const res = mockRes();

    await controller.deleteFilteredContacts(
      { confirmation: "excluir contatos", searchTerm: "x" } as any,
      "acc-1",
      "America/Sao_Paulo",
      res,
    );

    const written = res.write.mock.calls.map((c: any[]) => c[0]).join("");
    expect(written).toContain('"chunk":50');
    expect(written).toContain('"chunk":100');
    expect(written).toContain('"done":true');
    expect(res.end).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `cd chatfunnel-services && npx jest contacts.controller`
Expected: FAIL — `deleteFilteredContacts` não existe no controller

- [ ] **Step 4: Implementar a rota**

Em `contacts.controller.ts`: adicionar imports e a rota **antes** das rotas `:contactId` (rotas literais primeiro). Usa `@Res()` cru (Express) para escrever frames SSE — mesmo padrão do `delete-all` legado, mas com auth por header via guards já aplicados na classe.

```typescript
import { Res } from "@nestjs/common";
import { Response } from "express";
import { DeleteFilteredContactsBodyDto } from "../dtos/delete_filtered_contacts.dto";
```

```typescript
  @Post("delete-filtered")
  async deleteFilteredContacts(
    @Body() body: DeleteFilteredContactsBodyDto,
    @Headers("Account-Selected") accountId: string,
    @Headers("Timezone") timezone: string,
    @Res() res: Response,
  ): Promise<void> {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const send = (payload: Record<string, unknown>) =>
      res.write(`data: ${JSON.stringify(payload)}\n\n`);

    if (body.confirmation?.trim().toLowerCase() !== "excluir contatos") {
      send({ error: "Confirmação inválida." });
      return res.end();
    }

    try {
      const { confirmation, ...filters } = body;
      await this.contactsService.deleteFilteredContacts(
        accountId,
        { ...filters, timezone },
        ({ processed, total }) => {
          const progress =
            total > 0 ? Math.round((processed / total) * 100) : 100;
          send({ chunk: Math.min(progress, 100) });
        },
      );
      send({ done: true });
    } catch (err) {
      send({ error: "Erro ao excluir os contatos." });
    } finally {
      res.end();
    }
  }
```

> `@Res()` desativa o auto-response do Nest, mas o `ValidationPipe` global ainda valida o `@Body()` antes do handler; confirmação/filtros inválidos retornam 400 e o `streamPost` do front trata via `!res.ok`.

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `cd chatfunnel-services && npx jest contacts.controller`
Expected: PASS (2 testes)

---

### Task 7: Método no `ContactsService` do front

**Files:**
- Modify: `chatfunnel-front/src/common/services/ContactsService.js` (adicionar método após `deleteContacts`, ~linha 19)

**Interfaces:**
- Consumes: `NestApi.streamPost(path, body, onChunk, onDone, onError)` (já existe em `src/common/api/index.js`)
- Produces: `ContactsService.deleteFilteredContacts(filters, onChunk, onDone, onError): { abort }`

- [ ] **Step 1: (import já existe)**

O arquivo já importa `{ Api, NestApi }` na linha 1 — nenhuma mudança de import necessária.

- [ ] **Step 2: Adicionar o método**

Após a linha `deleteContacts: ...`:

```javascript
  deleteFilteredContacts: (filters, onChunk, onDone, onError) =>
    NestApi.streamPost('contacts/delete-filtered', filters, onChunk, onDone, onError),
```

> Sem semicolon no front (Prettier `semi: false`); use a vírgula do objeto. `streamPost` retorna `{ abort }` de forma síncrona.

- [ ] **Step 3: Verificar format**

Run: `cd chatfunnel-front && npx prettier --check src/common/services/ContactsService.js`
Expected: sem diferenças (ou rode `--write` e confira o diff)

---

### Task 8: Filtro completo ao abrir o modal (`ContactsList.vue`)

**Files:**
- Modify: `chatfunnel-front/src/views/contactsv2/ContactsList.vue:942-951` (`handleOpenModalDeleteAllContacts`)

**Interfaces:**
- Produces: objeto `search` com o mesmo shape de `listContacts` (Task 9 consome no modal).

- [ ] **Step 1: Substituir o corpo de `handleOpenModalDeleteAllContacts`**

Trocar a montagem parcial atual (que só copia `Filter/segmentId/searchTerm/tagIds`) pela montagem completa, espelhando `listContacts` (linhas 641-663):

```javascript
const handleOpenModalDeleteAllContacts = () => {
  const search = {}
  const filter = route.query?.Filter

  if (filter) search.Filter = filter
  if (selectedSegment.value) search.segmentId = selectedSegment.value
  if (searchTerm.value) search.searchTerm = searchTerm.value
  if (tagSearch.value.length) {
    search.tagIds = tagSearch.value.map((e) => e.id)
    search.tagMode = tagFilterMode.value
  }
  if (pipeline.value) search.pipelineId = pipeline.value
  if (initialPipelineDate.value) search.initialPipelineDate = initialPipelineDate.value
  if (finalPipelineDate.value) search.finalPipelineDate = finalPipelineDate.value
  if (isActiveFilter.value) search.isActiveFilter = isActiveFilter.value
  if (filterPhoneNull.value) search.filterPhoneNull = true
  if (filterEmailNull.value) search.filterEmailNull = true
  if (customFieldFilters.value.length) {
    search.customFieldFilters = customFieldFilters.value.map((c) => ({
      field: c.field,
      logicCondition: c.logicCondition,
      value: c.value
    }))
  }

  modalDeleteAllContacts.value.showDialog(search)
}
```

> É o mesmo bloco de `listContacts`. Se o executor quiser DRY, pode extrair um `buildContactFilter()` local e usar nos dois lugares — opcional, não obrigatório.

- [ ] **Step 2: Verificar format**

Run: `cd chatfunnel-front && npx prettier --check src/views/contactsv2/ContactsList.vue`
Expected: sem diferenças

---

### Task 9: Modal usa `streamPost` + preview com filtro completo (`DeleteAllContactsModal.vue`)

**Files:**
- Modify: `chatfunnel-front/src/views/contactsv2/components/DeleteAllContactsModal.vue`

**Interfaces:**
- Consumes: `ContactsService.deleteFilteredContacts` (Task 7); `search` completo vindo do `showDialog` (Task 8).

- [ ] **Step 1: Preview repassa o filtro completo**

Substituir `listContacts()` (linhas 118-127) para repassar o `search` inteiro em vez de só `Filter/searchTerm/tagIds`:

```javascript
const listContacts = () => {
  ContactsService.listContacts({ ...search.value }, 1, 1).then((response) => {
    quantityContacts.value = response.data.quantity
  })
}
```

- [ ] **Step 2: Trocar o `EventSource` por `streamPost`**

Substituir `handleDeleteAllContacts` (linhas 129-163) inteiro:

```javascript
const abortRef = ref(null)

const handleDeleteAllContacts = () => {
  loading.value = true
  progress.value = 0

  const filters = { ...search.value, confirmation: eraseWord.value.trim().toLowerCase() }

  abortRef.value = ContactsService.deleteFilteredContacts(
    filters,
    (chunk) => {
      progress.value = typeof chunk === 'number' ? chunk : (chunk?.progress ?? progress.value)
    },
    () => {
      loading.value = false
      showToastSuccess('Todos os contatos foram excluídos com sucesso!')
      emit('update-list')
      isOpen.value = false
    },
    () => {
      loading.value = false
      showToastError('Ocorreu um erro ao excluir os contatos!')
    }
  )
}
```

- [ ] **Step 3: Remover dependências não usadas**

Remover o import/uso de `useAuthStore` e do `authStore` se não forem mais usados após retirar o `EventSource` (o `streamPost` já injeta token/account internamente). Verificar o restante do `<script setup>` antes de remover.

- [ ] **Step 4: Rodar os testes do front (regressão) e format**

Run: `cd chatfunnel-front && npm run test:run -- src/common/api`
Expected: PASS (garante que `parseSseChunks`/`streamPost` seguem íntegros)

Run: `cd chatfunnel-front && npx prettier --check src/views/contactsv2/components/DeleteAllContactsModal.vue`
Expected: sem diferenças

---

### Task 10: Verificação manual end-to-end

**Files:** nenhum (validação)

- [ ] **Step 1: Subir os serviços**

Run (terminais separados): `cd chatfunnel-services && npm run start:dev` e `cd chatfunnel-front && npm run dev`

- [ ] **Step 2: Comparar preview × exclusão**

Na listagem de Contatos: aplicar filtros variados (tag OR/NOT, segmento, custom field, pipeline+datas, inativos). Abrir "Excluir todos os contatos". Confirmar que o número do preview bate com `quantity` da listagem para o mesmo filtro.

- [ ] **Step 3: Executar a exclusão**

Digitar `excluir contatos`, confirmar. Verificar: barra de progresso avança, toast de sucesso, lista atualiza, e a contagem/limite da conta é recalculada. Repetir com um filtro que retorne 0 (deve concluir sem erro).

- [ ] **Step 4: Checar acentuação e ausência de erros no console.**

---

### Task 11 (opcional, pós-validação): Depreciar o `delete-all` legado

**Files:**
- Modify: `chatfunnel-api/src/routes/ContactsRoutes.js` (remover a rota `GET /contacts/delete-all`)
- Delete: `chatfunnel-api/src/commands/contacts/DeleteAllContacts.js`
- Modify: `chatfunnel-api/src/commands/contacts/index.js` (remover o registro `DeleteAllContacts`)

- [ ] **Step 1:** Confirmar via grep que nenhum outro consumidor usa `delete-all` além do modal já migrado.

Run: `grep -rn "delete-all" chatfunnel-front/src chatfunnel-api/src`
Expected: apenas o teste `ContactsRoutes.test.js` e a rota a remover.

- [ ] **Step 2:** Remover rota + command + registro + teste correspondente. Rodar `cd chatfunnel-api && npm test`.

---

## Self-Review

**Spec coverage** (vs `vault/wiki/features/contacts-filtered-deletion-plan.md`):
- Paridade de filtro → Tasks 2/8/9 (reusa `getContacts` + envia filtro completo). ✓
- Soft-delete em lote → Tasks 1/2. ✓
- Progresso (mesmo padrão SSE) → Tasks 6/9 via `streamPost`. ✓
- Limpeza de fotos S3 → Tasks 4/5. ✓
- Recálculo de limite → Task 5. ✓
- Confirmação textual → Tasks 6/9. ✓
- Sem fila/entidade/migration/preview → não implementado (por design). ✓
- Depreciação do legado → Task 11. ✓

**Placeholder scan:** nenhum TODO/"handle edge cases" — todo passo com código/comando concreto. ✓

**Type consistency:** `softDeleteMany(accountId, ids)` (Task 1) usado igual em Tasks 2/5; `deleteFilteredContacts` retorna `{ deleted, photos }` no core (Tasks 2/3) e `{ deleted }` no services (Task 5); contrato SSE `{chunk}/{done}/{error}` idêntico entre Task 6 (backend) e Task 9 (front, via `streamPost`). ✓

**Riscos conhecidos:**
- Construtor de `ContactsRepository` (core) pode exigir uma queue além do `prisma` — ajustar mocks nas Tasks 1/2 conforme a assinatura real.
- `getContacts` do repository recebe `page/pageSize` diretamente (não passa por `GetContactsHandler`), então o ranking/cache não é acionado — confirmado no código do repository.
- Sequência obrigatória: Tasks 1–3 (core) → sync manual do usuário → Tasks 4–6 (services). Não pular o checkpoint da Task 3 (agora Step 4).
