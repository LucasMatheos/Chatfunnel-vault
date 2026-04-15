# User Segment Field + Expanded Job Titles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar o campo `segment` (Segmento de Atuação) ao perfil do usuário no fluxo de signup e expandir a lista de `jobTitle` (Cargo) com 13 novas opções, propagando a mudança por toda a stack (Prisma → @chatfunnel/core → NestJS services → Vue front).

**Architecture:** Mudança vertical em 4 camadas: (1) schema Prisma ganha coluna `segment String?` em `Users`; (2) `@chatfunnel/core` ganha novo parâmetro em `UsersRepository.updatePerfilAnswer`; (3) `chatfunnel-services` aceita `segment` no DTO e repassa ao handler; (4) front já está pronto, só precisa verificação e testes. `jobTitle` permanece `String?` — não vira enum — a lista é validada apenas no front.

**Tech Stack:** Prisma, PostgreSQL, NestJS 10 + class-validator, TypeScript, Vue 3 + Vite, `@chatfunnel/core` (lib interna versionada via npm).

---

## File Structure

**Criados:**
- `chatfunnel-database/prisma/migrations/<timestamp>_add_user_segment/migration.sql` — migration SQL `--create-only`

**Modificados:**
- `chatfunnel-database/prisma/schema.prisma` — adicionar `segment String?` em `model Users`
- `chatfunnel-core/src/repositories/users.repository.ts` — novo parâmetro `segment` em `updatePerfilAnswer`
- `chatfunnel-core/package.json` — bump version para `1.0.5-dev.16`
- `chatfunnel-services/package.json` — atualizar `@chatfunnel/core` para `1.0.5-dev.16`
- `chatfunnel-services/src/modules/users/commands/update_perfil_answer/dto.ts` — adicionar campo `segment`
- `chatfunnel-services/src/modules/users/commands/update_perfil_answer/handler.ts:59-66` — passar `dto.segment` ao repository
- `chatfunnel-front/src/views/auth/components/SignUpSteps/components/ProfileStep.vue` — já está pronto (select + state + options), apenas verificação

**Responsabilidade por camada:**
- **Schema:** fonte da verdade da coluna no banco
- **Core repository:** persistência (única lib que toca Prisma)
- **DTO:** validação de entrada HTTP (class-validator)
- **Handler:** orquestração + regras de negócio (Stripe tax ID, etc.)
- **Front:** UX, coleta e envio do payload

---

### Task 1: Adicionar coluna `segment` no schema Prisma

**Files:**
- Modify: `chatfunnel-database/prisma/schema.prisma` (model `Users`)
- Create: `chatfunnel-database/prisma/migrations/<timestamp>_add_user_segment/migration.sql`

- [ ] **Step 1: Localizar o model `Users` no schema**

Run:
```bash
grep -n "^model Users " chatfunnel-database/prisma/schema.prisma
```
Expected: retorna a linha inicial do bloco `model Users { ... }`.

- [ ] **Step 2: Adicionar campo `segment` logo abaixo de `companySize`**

No bloco `model Users`, adicionar:

```prisma
  companySize String?
  segment     String?
```

Manter exatamente o mesmo padrão (opcional, sem default) que `jobTitle` e `companySize`.

- [ ] **Step 3: Gerar a migration sem aplicar**

Run:
```bash
cd chatfunnel-database
npx prisma migrate dev --create-only --name add_user_segment
```
Expected: criar pasta `prisma/migrations/<timestamp>_add_user_segment/` com `migration.sql` contendo:
```sql
ALTER TABLE "users" ADD COLUMN "segment" TEXT;
```

> ⚠️ Regra do projeto: NUNCA rodar `prisma db push` ou `prisma migrate deploy`. Apenas `--create-only`.

- [ ] **Step 4: Revisar SQL gerado**

Run:
```bash
cat chatfunnel-database/prisma/migrations/*_add_user_segment/migration.sql
```
Expected: uma única linha `ALTER TABLE "users" ADD COLUMN "segment" TEXT;` (nome da tabela pode ser camelCase se o schema usar `@@map`).

- [ ] **Step 5: Regenerar Prisma Client**

Run:
```bash
cd chatfunnel-database
npx prisma generate
```
Expected: `Generated Prisma Client` sem erros.

- [ ] **Step 6: Commit**

```bash
cd chatfunnel-database
git checkout -b feature/user-segment
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add segment column to users table"
```

---

### Task 2: Atualizar `@chatfunnel/core` repository

**Files:**
- Modify: `chatfunnel-core/src/repositories/users.repository.ts` (método `updatePerfilAnswer`)
- Modify: `chatfunnel-core/package.json` (version)

- [ ] **Step 1: Localizar o método `updatePerfilAnswer` no repository**

Run:
```bash
grep -n "updatePerfilAnswer" chatfunnel-core/src/repositories/users.repository.ts
```
Expected: retorna a assinatura `async updatePerfilAnswer(...)`.

- [ ] **Step 2: Alterar a assinatura para aceitar `segment`**

Substituir o método por:

```ts
async updatePerfilAnswer(
  userId: string,
  name: string,
  phone: string,
  cpfCnpj: string,
  jobTitle: string,
  companySize: string,
  segment: string,
): Promise<Users> {
  return this.prisma.users.update({
    where: { id: userId },
    data: {
      name,
      phone,
      ddd: "",
      cpfCnpj,
      jobTitle,
      companySize,
      segment,
      perfilFormAnswered: true,
    },
  });
}
```

> Manter os campos existentes exatamente como estão — apenas adicionar `segment` como último parâmetro e no `data`.

- [ ] **Step 3: Rebuild do core**

Run:
```bash
cd chatfunnel-core
npm run build
```
Expected: build completa sem erros de tipo (o tipo `Users` já terá `segment?: string | null` após `prisma generate`).

- [ ] **Step 4: Bump version**

Editar `chatfunnel-core/package.json`:
```json
"version": "1.0.5-dev.16"
```

- [ ] **Step 5: Commit + publish**

```bash
cd chatfunnel-core
git checkout -b feature/user-segment
git add src/repositories/users.repository.ts package.json
git commit -m "feat: accept segment parameter in updatePerfilAnswer"
npm publish
```
Expected: pacote `@chatfunnel/core@1.0.5-dev.16` publicado no registry interno.

---

### Task 3: Atualizar dependência do core no chatfunnel-services

**Files:**
- Modify: `chatfunnel-services/package.json`
- Modify: `chatfunnel-services/package-lock.json`

- [ ] **Step 1: Atualizar dependência**

Run:
```bash
cd chatfunnel-services
npm install @chatfunnel/core@1.0.5-dev.16
```
Expected: `package.json` atualizado para `"@chatfunnel/core": "1.0.5-dev.16"` e lockfile regenerado.

- [ ] **Step 2: Verificar que o tipo novo aparece**

Run:
```bash
grep -n "updatePerfilAnswer" node_modules/@chatfunnel/core/dist/repositories/users.repository.d.ts
```
Expected:
```
updatePerfilAnswer(userId: string, name: string, phone: string, cpfCnpj: string, jobTitle: string, companySize: string, segment: string): Promise<Users>;
```

Se a assinatura ainda tiver 6 parâmetros, o publish do Task 2 não propagou — reinstalar limpando cache: `npm install @chatfunnel/core@1.0.5-dev.16 --force`.

- [ ] **Step 3: Commit**

```bash
cd chatfunnel-services
git checkout -b feature/user-segment
git add package.json package-lock.json
git commit -m "chore: bump @chatfunnel/core to 1.0.5-dev.16"
```

---

### Task 4: Adicionar campo `segment` no DTO

**Files:**
- Modify: `chatfunnel-services/src/modules/users/commands/update_perfil_answer/dto.ts`
- Test: `chatfunnel-services/src/modules/users/commands/update_perfil_answer/dto.spec.ts` (criar)

- [ ] **Step 1: Escrever teste falhando do DTO**

Criar `chatfunnel-services/src/modules/users/commands/update_perfil_answer/dto.spec.ts`:

```ts
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { UpdatePerfilAnswerDto } from "./dto";

describe("UpdatePerfilAnswerDto", () => {
  it("accepts segment as optional string", async () => {
    const dto = plainToInstance(UpdatePerfilAnswerDto, {
      name: "John",
      segment: "SOFTWARE_SAAS",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.segment).toBe("SOFTWARE_SAAS");
  });

  it("accepts payload without segment", async () => {
    const dto = plainToInstance(UpdatePerfilAnswerDto, { name: "John" });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects non-string segment", async () => {
    const dto = plainToInstance(UpdatePerfilAnswerDto, {
      name: "John",
      segment: 123,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "segment")).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar teste para garantir que falha**

Run:
```bash
cd chatfunnel-services
npx jest src/modules/users/commands/update_perfil_answer/dto.spec.ts
```
Expected: FAIL — `dto.segment` undefined porque o campo ainda não existe no DTO.

- [ ] **Step 3: Adicionar `segment` ao DTO**

Em `chatfunnel-services/src/modules/users/commands/update_perfil_answer/dto.ts`, adicionar antes do fechamento da classe:

```ts
  @ApiProperty()
  @IsString()
  @IsOptional()
  segment: string;
```

O arquivo final deve ficar:
```ts
import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsOptional, IsBoolean } from "class-validator";

export class UpdatePerfilAnswerDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  phone: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  cpfCnpj: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  jobTitle: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  companySize: string;

  @ApiProperty()
  @IsBoolean()
  @IsOptional()
  isForeigner: boolean;

  @ApiProperty()
  @IsString()
  @IsOptional()
  segment: string;
}
```

- [ ] **Step 4: Rodar testes para confirmar que passam**

Run:
```bash
cd chatfunnel-services
npx jest src/modules/users/commands/update_perfil_answer/dto.spec.ts
```
Expected: PASS (3 specs).

- [ ] **Step 5: Commit**

```bash
cd chatfunnel-services
git add src/modules/users/commands/update_perfil_answer/dto.ts src/modules/users/commands/update_perfil_answer/dto.spec.ts
git commit -m "feat(users): accept segment in UpdatePerfilAnswerDto"
```

---

### Task 5: Passar `segment` do handler para o repository

**Files:**
- Modify: `chatfunnel-services/src/modules/users/commands/update_perfil_answer/handler.ts:59-66`
- Test: `chatfunnel-services/src/modules/users/commands/update_perfil_answer/handler.spec.ts` (criar)

- [ ] **Step 1: Escrever teste falhando do handler**

Criar `chatfunnel-services/src/modules/users/commands/update_perfil_answer/handler.spec.ts`:

```ts
import { UpdatePerfilAnswerHandler } from "./handler";

describe("UpdatePerfilAnswerHandler", () => {
  const makeUser = (overrides: any = {}) => ({
    id: "user-1",
    isFree: true,
    ...overrides,
  });

  it("forwards segment to repository", async () => {
    const usersRepo = {
      findById: jest.fn().mockResolvedValue(makeUser()),
      updatePerfilAnswer: jest.fn().mockResolvedValue(undefined),
    } as any;
    const accountsRepo = {} as any;
    const stripeApi = {} as any;

    const handler = new UpdatePerfilAnswerHandler(
      usersRepo,
      accountsRepo,
      stripeApi,
    );

    await handler.handler("user-1", {
      name: "John",
      phone: "11999999999",
      cpfCnpj: "",
      jobTitle: "OWNER_CEO",
      companySize: "MYSELF",
      isForeigner: true,
      segment: "SOFTWARE_SAAS",
    } as any);

    expect(usersRepo.updatePerfilAnswer).toHaveBeenCalledWith(
      "user-1",
      "John",
      "11999999999",
      "",
      "OWNER_CEO",
      "MYSELF",
      "SOFTWARE_SAAS",
    );
  });
});
```

- [ ] **Step 2: Rodar teste para garantir que falha**

Run:
```bash
cd chatfunnel-services
npx jest src/modules/users/commands/update_perfil_answer/handler.spec.ts
```
Expected: FAIL — `updatePerfilAnswer` foi chamado com 6 argumentos (sem `segment`).

- [ ] **Step 3: Atualizar chamada no handler**

Em `chatfunnel-services/src/modules/users/commands/update_perfil_answer/handler.ts`, substituir o bloco das linhas 59-66:

```ts
    await this.usersRepository.updatePerfilAnswer(
      userId,
      dto.name,
      dto.phone,
      dto.cpfCnpj,
      dto.jobTitle,
      dto.companySize,
      dto.segment,
    );
```

- [ ] **Step 4: Rodar teste para confirmar que passa**

Run:
```bash
cd chatfunnel-services
npx jest src/modules/users/commands/update_perfil_answer/handler.spec.ts
```
Expected: PASS.

- [ ] **Step 5: Rodar typecheck e lint**

Run:
```bash
cd chatfunnel-services
npm run lint
```
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
cd chatfunnel-services
git add src/modules/users/commands/update_perfil_answer/handler.ts src/modules/users/commands/update_perfil_answer/handler.spec.ts
git commit -m "feat(users): persist segment via updatePerfilAnswer handler"
```

---

### Task 6: Verificar e testar front end-to-end

**Files:**
- Inspect: `chatfunnel-front/src/views/auth/components/SignUpSteps/components/ProfileStep.vue`

- [ ] **Step 1: Confirmar que o front já manda `segment`**

Run:
```bash
grep -n "segment" chatfunnel-front/src/views/auth/components/SignUpSteps/components/ProfileStep.vue
```
Expected: múltiplas ocorrências — `form.segment`, `:options="segments"`, array `segments` com 22 entries.

Se faltar qualquer uma, revisitar ProfileStep.vue para:
1. `form` ter `segment: null`
2. `<input-select-v2 v-model="form.segment" :options="segments" />` renderizando
3. Array `segments` com 22 opções declarado no `<script setup>`

- [ ] **Step 2: Validar que `handleContinue` envia `segment` no payload**

O payload atual é `{ ...form.value, cpfCnpj: ..., phone: ... }`. Como `form.value.segment` existe, o spread já inclui. Nenhuma mudança necessária.

- [ ] **Step 3: Rodar typecheck do front**

Run:
```bash
cd chatfunnel-front
npm run typecheck
```
Expected: sem novos erros relacionados a `ProfileStep.vue`.

- [ ] **Step 4: Teste manual E2E**

Com services + front rodando localmente:
1. `cd chatfunnel-services && npm run start:dev`
2. `cd chatfunnel-front && npm run dev`
3. Abrir http://localhost:5173, ir para signup, completar até o ProfileStep
4. Preencher nome, telefone, CPF, selecionar Cargo e **Segmento de Atuação**, escolher tamanho da empresa, clicar Continuar
5. Verificar no DevTools Network que o payload do `PUT /nest/users/perfil_answer` contém `"segment": "SOFTWARE_SAAS"` (ou a opção escolhida)
6. Verificar resposta HTTP 200 (não 400 — se der 400 com `property segment should not exist`, significa que services não subiu com o DTO novo)
7. Consultar o banco:

```sql
SELECT name, "jobTitle", segment, "companySize"
FROM users
WHERE id = '<id-do-usuario-signup>';
```

Expected: a coluna `segment` contém o valor selecionado.

- [ ] **Step 5: Commit (se houver mudanças no front)**

Se houve ajustes em ProfileStep.vue durante a verificação:

```bash
cd chatfunnel-front
git checkout -b feature/user-segment
git add src/views/auth/components/SignUpSteps/components/ProfileStep.vue
git commit -m "feat(signup): add segment field to ProfileStep"
```

Se não houve mudanças, pular este step.

---

### Task 7: Documentação e PR

**Files:**
- No code — abrir PRs nos 4 repos tocados

- [ ] **Step 1: Abrir PR no `chatfunnel-database`**

Run:
```bash
cd chatfunnel-database
git push -u origin feature/user-segment
gh pr create --title "feat: add segment column to users" --body "Adds nullable segment String to Users model. Migration --create-only — DBA must apply."
```

- [ ] **Step 2: Abrir PR no `chatfunnel-core`**

Run:
```bash
cd chatfunnel-core
git push -u origin feature/user-segment
gh pr create --title "feat: accept segment in updatePerfilAnswer" --body "Adds segment parameter to UsersRepository.updatePerfilAnswer. Published as 1.0.5-dev.16."
```

- [ ] **Step 3: Abrir PR no `chatfunnel-services`**

Run:
```bash
cd chatfunnel-services
git push -u origin feature/user-segment
gh pr create --title "feat(users): accept segment in perfil_answer endpoint" --body "DTO + handler agora aceitam segment. Bump @chatfunnel/core para 1.0.5-dev.16. Requires schema migration already applied in prod."
```

- [ ] **Step 4: Abrir PR no `chatfunnel-front` (se houve alterações)**

Run:
```bash
cd chatfunnel-front
git push -u origin feature/user-segment
gh pr create --title "feat(signup): add segment select to ProfileStep" --body "Adds 'Qual seu Segmento de Atuação?' select with 22 options + expanded job titles (13 new roles). Depends on services PR."
```

---

## Ordem de Deploy (crítica)

Esta ordem é obrigatória para não derrubar o signup em produção:

1. **Migration do schema** aplicada no banco (task 1 mergeado + DBA roda)
2. **`@chatfunnel/core@1.0.5-dev.16`** publicado (task 2 mergeado)
3. **`chatfunnel-services`** deployado (tasks 3-5 mergeadas)
4. **`chatfunnel-front`** deployado (task 6 mergeada, se houve)

Se o front subir antes do services, o `ValidationPipe` (com `forbidNonWhitelisted: true`) vai rejeitar o request com HTTP 400 — `property segment should not exist`.

## Notas

- **Por que `String?` e não enum:** `jobTitle` já é `String?`, segue o padrão. Enum Postgres exige migração adicional sempre que adicionamos/renomeamos valor, e a lista ainda pode evoluir. Validação fica no front.
- **Por que não tocar em `handleSkip`:** `handleSkip` em `ProfileStep.vue:237` envia um payload vazio/omite campos. Como `segment` é `@IsOptional()`, não precisa de ajuste.
- **Diagnostics pré-existentes** no ProfileStep.vue (`Unresolved function or method replace()`, `Unused constant handleSkip`) não foram introduzidos por esta feature e ficam fora de escopo.
