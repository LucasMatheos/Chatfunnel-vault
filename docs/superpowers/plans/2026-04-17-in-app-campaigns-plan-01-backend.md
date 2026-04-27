# In-app Campaigns — Plan 1: Backend (DB + NestJS)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shippar o backend completo do módulo In-app Campaigns (DB + NestJS module em `chatfunnel-services`), exposto por API e testável via Postman/curl antes de qualquer código frontend.

**Architecture:** 3 tabelas Prisma (`in_app_campaigns`, `in_app_campaign_user_states`, `in_app_campaign_response_values`), módulo NestJS em `chatfunnel-services/src/modules/in-app-campaigns/` com 5 services (campaign, eligibility, delivery, response, report), 2 controllers (admin + user), DTOs tipados com class-validator (incluindo discriminated union para eventos).

**Tech Stack:** NestJS, Prisma, PostgreSQL, class-validator, Jest, TypeScript, BullMQ (só v1.1, não no MVP).

**Spec base:** `docs/superpowers/specs/2026-04-17-in-app-campaigns-design.md`

**Plans relacionados (a escrever depois):**
- Plan 2: Frontend runtime (orchestrator, modal, form renderer, 9 field components).
- Plan 3: Admin UI (listagem, editor, form builder, reports, export).

---

## Convenções do projeto a respeitar

- **Repo**: toda feature nova em `chatfunnel-services` (nunca `chatfunnel-api`).
- **Prisma schema**: `chatfunnel-core/prisma/schema.prisma`. Migrations em `chatfunnel-core/prisma/migrations/`.
- **Migrations**: `npx prisma migrate dev --create-only --name <name>` (NUNCA `prisma db push` ou `migrate deploy`).
- **Multi-tenancy**: toda query filtra `accountId`. Nunca confiar em `accountId` do body; extrair do JWT.
- **Soft delete**: usar `isDeleted: boolean` nas tabelas (além de `archivedAt` que é estado de domínio).
- **Naming Prisma**: models em PascalCase (`InAppCampaign`), campos camelCase (`accountId`), mapping `@@map("in_app_campaigns")` snake_case no banco.
- **Testes**: `npm test` (Jest). Arquivos `*.spec.ts` junto ao código.
- **Commits**: criar branch `feature/in-app-campaigns-backend`. Nunca amend; sempre commits novos. Sem `Co-Authored-By`.

---

## File Structure

```
chatfunnel-core/prisma/schema.prisma                                            # estender com 3 models
chatfunnel-core/prisma/migrations/YYYYMMDDHHMMSS_in_app_campaigns/migration.sql # migration --create-only

chatfunnel-services/src/modules/in-app-campaigns/
  in-app-campaigns.module.ts
  controllers/
    in-app-campaigns-admin.controller.ts
    in-app-campaigns-user.controller.ts
  services/
    campaign.service.ts          (+ campaign.service.spec.ts)
    eligibility.service.ts       (+ eligibility.service.spec.ts)
    delivery.service.ts          (+ delivery.service.spec.ts)
    response.service.ts          (+ response.service.spec.ts)
    report.service.ts            (+ report.service.spec.ts)
  dto/
    form-schema.dto.ts
    create-campaign.dto.ts
    update-campaign.dto.ts
    patch-status.dto.ts
    targeting.dto.ts
    campaign-event.dto.ts        (discriminator por `type`)
    submit-answers.dto.ts
    list-campaigns-query.dto.ts
  validators/
    form-schema.validator.ts     (+ form-schema.validator.spec.ts)
    answers.validator.ts         (+ answers.validator.spec.ts)
    invariants.validator.ts      (+ invariants.validator.spec.ts)
  repositories/
    in-app-campaign.repository.ts
    in-app-campaign-user-state.repository.ts
    in-app-campaign-response-value.repository.ts
  types/
    index.ts                     (enums: FrequencyMode, ResolutionMode, CampaignStatus, etc.)

chatfunnel-services/src/app.module.ts                                           # registrar o novo módulo
chatfunnel-services/test/in-app-campaigns.e2e-spec.ts                           # e2e full-loop
```

---

## Task 1: Criar branch e estrutura de pastas

**Files:**
- Create: `chatfunnel-services/src/modules/in-app-campaigns/` (diretório vazio)

- [ ] **Step 1: Criar branch**

```bash
cd D:/Code/4-Vinicius/Chatfunnel/chatfunnel-services
git checkout -b feature/in-app-campaigns-backend
```

- [ ] **Step 2: Criar esqueleto de diretórios**

```bash
mkdir -p src/modules/in-app-campaigns/{controllers,services,dto,validators,repositories,types}
```

- [ ] **Step 3: Commit (branch vazia marca ponto de partida)**

```bash
git add -A
git status
# nada a commitar (diretórios vazios não são trackeados) — tudo bem, pula commit
```

---

## Task 2: Criar types / enums compartilhados

**Files:**
- Create: `chatfunnel-services/src/modules/in-app-campaigns/types/index.ts`

- [ ] **Step 1: Escrever os enums**

```ts
// src/modules/in-app-campaigns/types/index.ts

export enum FrequencyMode {
  ShowOnce = 'showOnce',
  UntilDismissed = 'untilDismissed',
  UntilCompleted = 'untilCompleted',
}

export enum ResolutionMode {
  DismissOrComplete = 'dismiss_or_complete',
  CompleteOnly = 'complete_only',
}

export enum CampaignStatus {
  Draft = 'draft',
  Active = 'active',
  Paused = 'paused',
  Archived = 'archived',
}

export enum TargetMode {
  All = 'all',
  Filter = 'filter',
}

export enum UserStateStatus {
  Shown = 'shown',
  Dismissed = 'dismissed',
  Completed = 'completed',
}

export enum FieldType {
  Text = 'text',
  Textarea = 'textarea',
  Email = 'email',
  Number = 'number',
  Select = 'select',
  Radio = 'radio',
  Checkbox = 'checkbox',
  Rating = 'rating',
  Hidden = 'hidden',
}

export type CampaignEventType = 'shown' | 'dismissed' | 'submitted';
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/in-app-campaigns/types/index.ts
git commit -m "feat(in-app-campaigns): add shared enums and types"
```

---

## Task 3: Prisma schema — 3 novos models

**Files:**
- Modify: `chatfunnel-core/prisma/schema.prisma` (adicionar models no fim do arquivo)

- [ ] **Step 1: Abrir o schema e adicionar os models**

Append no final de `chatfunnel-core/prisma/schema.prisma`:

```prisma
model InAppCampaign {
  id              String    @id @default(uuid()) @db.Uuid
  title           String
  description     String?
  formSchema      Json      @map("form_schema")
  frequencyMode   String    @map("frequency_mode")          // FrequencyMode
  resolutionMode  String    @map("resolution_mode")         // ResolutionMode
  startAt         DateTime? @map("start_at") @db.Timestamptz
  endAt           DateTime? @map("end_at") @db.Timestamptz
  status          String                                     // CampaignStatus
  targetMode      String    @map("target_mode")             // TargetMode
  targetPlans     String[]  @map("target_plans")
  targetOrgIds    String[]  @map("target_org_ids") @db.Uuid
  targetUserRoles String[]  @map("target_user_roles")
  firstShownAt    DateTime? @map("first_shown_at") @db.Timestamptz
  createdBy       String    @map("created_by") @db.Uuid
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime  @updatedAt @map("updated_at") @db.Timestamptz
  archivedAt      DateTime? @map("archived_at") @db.Timestamptz
  isDeleted       Boolean   @default(false) @map("is_deleted")

  userStates     InAppCampaignUserState[]
  responseValues InAppCampaignResponseValue[]

  @@index([status, startAt, endAt])
  @@index([targetPlans], type: Gin)
  @@index([targetOrgIds], type: Gin)
  @@index([targetUserRoles], type: Gin)
  @@index([archivedAt])
  @@index([isDeleted])
  @@map("in_app_campaigns")
}

model InAppCampaignUserState {
  id             String    @id @default(uuid()) @db.Uuid
  campaignId     String    @map("campaign_id") @db.Uuid
  userId         String    @map("user_id") @db.Uuid
  accountId      String    @map("account_id") @db.Uuid
  status         String                                       // UserStateStatus
  firstShownAt   DateTime  @map("first_shown_at") @db.Timestamptz
  lastShownAt    DateTime  @map("last_shown_at") @db.Timestamptz
  timesShown     Int       @default(1) @map("times_shown")
  dismissedAt    DateTime? @map("dismissed_at") @db.Timestamptz
  completedAt    DateTime? @map("completed_at") @db.Timestamptz
  submittedAt    DateTime? @map("submitted_at") @db.Timestamptz

  campaign       InAppCampaign                @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  responseValues InAppCampaignResponseValue[]

  @@unique([campaignId, userId])
  @@index([campaignId, status])
  @@index([userId, status])
  @@map("in_app_campaign_user_states")
}

model InAppCampaignResponseValue {
  id           String   @id @default(uuid()) @db.Uuid
  userStateId  String   @map("user_state_id") @db.Uuid
  campaignId   String   @map("campaign_id") @db.Uuid
  accountId    String   @map("account_id") @db.Uuid
  fieldKey     String   @map("field_key")
  fieldType    String   @map("field_type")                    // FieldType
  valueText    String?  @map("value_text")
  valueNumber  Decimal? @map("value_number") @db.Decimal
  valueBool    Boolean? @map("value_bool")
  valueJson    Json?    @map("value_json")
  submittedAt  DateTime @map("submitted_at") @db.Timestamptz
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz

  userState    InAppCampaignUserState @relation(fields: [userStateId], references: [id], onDelete: Cascade)
  campaign     InAppCampaign          @relation(fields: [campaignId], references: [id], onDelete: Cascade)

  @@index([campaignId, fieldKey, valueText])
  @@index([campaignId, fieldKey, valueNumber])
  @@index([campaignId, accountId, fieldKey])
  @@index([userStateId])
  @@index([submittedAt])
  @@map("in_app_campaign_response_values")
}
```

- [ ] **Step 2: Gerar migration (--create-only, SEM aplicar)**

```bash
cd D:/Code/4-Vinicius/Chatfunnel/chatfunnel-core
npx prisma migrate dev --create-only --name in_app_campaigns
```

Expected: novo diretório `prisma/migrations/YYYYMMDDHHMMSS_in_app_campaigns/migration.sql` criado; **nada aplicado ao banco ainda**.

- [ ] **Step 3: Inspecionar o SQL gerado**

Abrir `chatfunnel-core/prisma/migrations/*_in_app_campaigns/migration.sql` e confirmar:
- CREATE TABLE para as 3 tabelas.
- UNIQUE em `(campaign_id, user_id)`.
- CREATE INDEX GIN em `target_plans`, `target_org_ids`, `target_user_roles`.
- FKs com CASCADE.

Se algum index GIN faltar, adicionar manualmente no SQL (Prisma às vezes não gera GIN corretamente):

```sql
CREATE INDEX "in_app_campaigns_target_plans_idx" ON "in_app_campaigns" USING GIN ("target_plans");
CREATE INDEX "in_app_campaigns_target_org_ids_idx" ON "in_app_campaigns" USING GIN ("target_org_ids");
CREATE INDEX "in_app_campaigns_target_user_roles_idx" ON "in_app_campaigns" USING GIN ("target_user_roles");
```

- [ ] **Step 4: Aplicar migration em dev e gerar client**

```bash
cd D:/Code/4-Vinicius/Chatfunnel/chatfunnel-core
npx prisma migrate dev              # aplica todas as pendentes em dev
npx prisma generate                 # regenera @prisma/client
```

Expected: migration aplicada; `node_modules/.prisma/client` regenerado com os novos tipos.

- [ ] **Step 5: Validar em `psql` (opcional mas recomendado)**

```bash
psql $DATABASE_URL -c "\d in_app_campaigns"
psql $DATABASE_URL -c "\d in_app_campaign_user_states"
psql $DATABASE_URL -c "\d in_app_campaign_response_values"
```

Expected: 3 tabelas listadas com as colunas/indexes descritos na spec §7.

- [ ] **Step 6: Build do chatfunnel-core**

```bash
cd D:/Code/4-Vinicius/Chatfunnel/chatfunnel-core
npm run build
```

Expected: build OK; o core compila com os novos models.

- [ ] **Step 7: Commit**

```bash
cd D:/Code/4-Vinicius/Chatfunnel/chatfunnel-core
git add prisma/schema.prisma prisma/migrations/*_in_app_campaigns
git commit -m "feat(db): add in_app_campaigns schema with user states and response values"
```

---

## Task 4: Estrutura do módulo NestJS (esqueleto)

**Files:**
- Create: `chatfunnel-services/src/modules/in-app-campaigns/in-app-campaigns.module.ts`
- Modify: `chatfunnel-services/src/app.module.ts`

- [ ] **Step 1: Criar módulo esqueleto**

```ts
// src/modules/in-app-campaigns/in-app-campaigns.module.ts
import { Module } from '@nestjs/common';

@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class InAppCampaignsModule {}
```

- [ ] **Step 2: Registrar em app.module.ts**

Abrir `chatfunnel-services/src/app.module.ts`, importar e adicionar em `imports`:

```ts
import { InAppCampaignsModule } from './modules/in-app-campaigns/in-app-campaigns.module';

@Module({
  imports: [
    // ... existentes
    InAppCampaignsModule,
  ],
  // ...
})
export class AppModule {}
```

- [ ] **Step 3: Verificar build do services**

```bash
cd D:/Code/4-Vinicius/Chatfunnel/chatfunnel-services
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/modules/in-app-campaigns/in-app-campaigns.module.ts src/app.module.ts
git commit -m "feat(in-app-campaigns): scaffold empty NestJS module"
```

---

## Task 5: DTO base — FormSchema e FormField

**Files:**
- Create: `chatfunnel-services/src/modules/in-app-campaigns/dto/form-schema.dto.ts`

- [ ] **Step 1: Escrever os DTOs aninhados**

```ts
// src/modules/in-app-campaigns/dto/form-schema.dto.ts
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { FieldType } from '../types';

export class FormFieldValidationDto {
  @IsOptional() @IsNumber() min?: number;
  @IsOptional() @IsNumber() max?: number;
  @IsOptional() @IsString() regex?: string;
  @IsOptional() @IsString() message?: string;
}

export class FormFieldOptionDto {
  @IsString() @MinLength(1) value!: string;    // estável
  @IsString() @MinLength(1) label!: string;    // cosmético
}

export class FormFieldDto {
  @IsString() @MinLength(1) key!: string;

  @IsEnum(FieldType) type!: FieldType;

  @IsString() @MinLength(1) label!: string;

  @IsOptional() @IsString() helpText?: string;

  @IsOptional() @IsBoolean() required?: boolean;

  @IsOptional() @ValidateNested() @Type(() => FormFieldValidationDto)
  validation?: FormFieldValidationDto;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => FormFieldOptionDto)
  options?: FormFieldOptionDto[];

  @IsOptional() @IsString() prefill?: string;  // userId | accountId | userEmail | ...
}

export class FormSchemaDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => FormFieldDto)
  fields!: FormFieldDto[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/in-app-campaigns/dto/form-schema.dto.ts
git commit -m "feat(in-app-campaigns): add FormSchema DTOs with class-validator"
```

---

## Task 6: Custom validator — `form-schema.validator.ts`

**Files:**
- Create: `chatfunnel-services/src/modules/in-app-campaigns/validators/form-schema.validator.ts`
- Create: `chatfunnel-services/src/modules/in-app-campaigns/validators/form-schema.validator.spec.ts`

- [ ] **Step 1: Escrever testes primeiro**

```ts
// src/modules/in-app-campaigns/validators/form-schema.validator.spec.ts
import { FieldType } from '../types';
import { FormSchemaDto } from '../dto/form-schema.dto';
import { validateFormSchema, FormSchemaError } from './form-schema.validator';

function schema(fields: Partial<FormSchemaDto['fields'][number]>[]): FormSchemaDto {
  return { fields: fields as FormSchemaDto['fields'] };
}

describe('validateFormSchema', () => {
  it('accepts a minimal valid schema', () => {
    const s = schema([{ key: 'name', type: FieldType.Text, label: 'Nome' }]);
    expect(() => validateFormSchema(s)).not.toThrow();
  });

  it('rejects duplicate field keys', () => {
    const s = schema([
      { key: 'a', type: FieldType.Text, label: 'A' },
      { key: 'a', type: FieldType.Text, label: 'A2' },
    ]);
    expect(() => validateFormSchema(s)).toThrow(FormSchemaError);
  });

  it('requires options on select/radio/checkbox', () => {
    const s = schema([{ key: 'x', type: FieldType.Select, label: 'X' }]);
    expect(() => validateFormSchema(s)).toThrow(FormSchemaError);
  });

  it('rejects duplicate option values in the same field', () => {
    const s = schema([{
      key: 'x', type: FieldType.Select, label: 'X',
      options: [{ value: 'a', label: 'A' }, { value: 'a', label: 'B' }],
    }]);
    expect(() => validateFormSchema(s)).toThrow(FormSchemaError);
  });

  it('rejects prefill on non-hidden field', () => {
    const s = schema([{ key: 'x', type: FieldType.Text, label: 'X', prefill: 'userId' }]);
    expect(() => validateFormSchema(s)).toThrow(FormSchemaError);
  });

  it('accepts prefill on hidden', () => {
    const s = schema([{ key: 'uid', type: FieldType.Hidden, label: 'UID', prefill: 'userId' }]);
    expect(() => validateFormSchema(s)).not.toThrow();
  });
});
```

- [ ] **Step 2: Rodar teste (deve falhar)**

```bash
cd D:/Code/4-Vinicius/Chatfunnel/chatfunnel-services
npx jest src/modules/in-app-campaigns/validators/form-schema.validator.spec.ts
```

Expected: FAIL — arquivo `form-schema.validator.ts` ainda não existe.

- [ ] **Step 3: Implementar o validator mínimo pra passar**

```ts
// src/modules/in-app-campaigns/validators/form-schema.validator.ts
import { FieldType } from '../types';
import { FormSchemaDto } from '../dto/form-schema.dto';

export class FormSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormSchemaError';
  }
}

const TYPES_WITH_OPTIONS = new Set<FieldType>([FieldType.Select, FieldType.Radio, FieldType.Checkbox]);

export function validateFormSchema(schema: FormSchemaDto): void {
  if (!schema.fields || schema.fields.length === 0) {
    throw new FormSchemaError('form must have at least one field');
  }

  const seenKeys = new Set<string>();
  for (const field of schema.fields) {
    if (seenKeys.has(field.key)) {
      throw new FormSchemaError(`duplicate field key: ${field.key}`);
    }
    seenKeys.add(field.key);

    if (TYPES_WITH_OPTIONS.has(field.type)) {
      if (!field.options || field.options.length === 0) {
        throw new FormSchemaError(`field ${field.key} requires options`);
      }
      const seenValues = new Set<string>();
      for (const opt of field.options) {
        if (seenValues.has(opt.value)) {
          throw new FormSchemaError(`duplicate option value in ${field.key}: ${opt.value}`);
        }
        seenValues.add(opt.value);
      }
    }

    if (field.prefill && field.type !== FieldType.Hidden) {
      throw new FormSchemaError(`prefill only allowed on hidden fields (field ${field.key})`);
    }
  }
}
```

- [ ] **Step 4: Rodar teste (deve passar)**

```bash
npx jest src/modules/in-app-campaigns/validators/form-schema.validator.spec.ts
```

Expected: PASS todos os 6 testes.

- [ ] **Step 5: Commit**

```bash
git add src/modules/in-app-campaigns/validators/form-schema.validator.{ts,spec.ts}
git commit -m "feat(in-app-campaigns): add form-schema validator with duplicate key/option checks"
```

---

## Task 7: Invariants validator — combinações de modes + datas

**Files:**
- Create: `chatfunnel-services/src/modules/in-app-campaigns/validators/invariants.validator.ts`
- Create: `chatfunnel-services/src/modules/in-app-campaigns/validators/invariants.validator.spec.ts`

- [ ] **Step 1: Escrever testes**

```ts
// src/modules/in-app-campaigns/validators/invariants.validator.spec.ts
import { FrequencyMode, ResolutionMode } from '../types';
import { validateCampaignInvariants, InvariantError } from './invariants.validator';

describe('validateCampaignInvariants', () => {
  const base = {
    frequencyMode: FrequencyMode.ShowOnce,
    resolutionMode: ResolutionMode.DismissOrComplete,
    startAt: null as Date | null,
    endAt: null as Date | null,
  };

  it('passes for valid combinations', () => {
    expect(() => validateCampaignInvariants({
      ...base, frequencyMode: FrequencyMode.UntilDismissed, resolutionMode: ResolutionMode.DismissOrComplete,
    })).not.toThrow();
  });

  it('rejects untilDismissed + complete_only', () => {
    expect(() => validateCampaignInvariants({
      ...base, frequencyMode: FrequencyMode.UntilDismissed, resolutionMode: ResolutionMode.CompleteOnly,
    })).toThrow(InvariantError);
  });

  it('rejects complete_only with anything other than showOnce/untilCompleted', () => {
    expect(() => validateCampaignInvariants({
      ...base, frequencyMode: FrequencyMode.UntilDismissed, resolutionMode: ResolutionMode.CompleteOnly,
    })).toThrow(InvariantError);
  });

  it('accepts complete_only + showOnce', () => {
    expect(() => validateCampaignInvariants({
      ...base, resolutionMode: ResolutionMode.CompleteOnly, frequencyMode: FrequencyMode.ShowOnce,
    })).not.toThrow();
  });

  it('accepts complete_only + untilCompleted', () => {
    expect(() => validateCampaignInvariants({
      ...base, resolutionMode: ResolutionMode.CompleteOnly, frequencyMode: FrequencyMode.UntilCompleted,
    })).not.toThrow();
  });

  it('rejects startAt >= endAt', () => {
    expect(() => validateCampaignInvariants({
      ...base, startAt: new Date('2026-02-01'), endAt: new Date('2026-01-01'),
    })).toThrow(InvariantError);
  });

  it('allows null startAt or endAt', () => {
    expect(() => validateCampaignInvariants({ ...base, startAt: new Date(), endAt: null })).not.toThrow();
    expect(() => validateCampaignInvariants({ ...base, startAt: null, endAt: new Date() })).not.toThrow();
  });
});
```

- [ ] **Step 2: Rodar (FAIL esperado)**

```bash
npx jest src/modules/in-app-campaigns/validators/invariants.validator.spec.ts
```

Expected: FAIL — module não existe.

- [ ] **Step 3: Implementar**

```ts
// src/modules/in-app-campaigns/validators/invariants.validator.ts
import { FrequencyMode, ResolutionMode } from '../types';

export class InvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvariantError';
  }
}

export interface InvariantInput {
  frequencyMode: FrequencyMode;
  resolutionMode: ResolutionMode;
  startAt: Date | null;
  endAt: Date | null;
}

export function validateCampaignInvariants(input: InvariantInput): void {
  const { frequencyMode, resolutionMode, startAt, endAt } = input;

  if (frequencyMode === FrequencyMode.UntilDismissed && resolutionMode !== ResolutionMode.DismissOrComplete) {
    throw new InvariantError('untilDismissed requires resolution_mode = dismiss_or_complete');
  }

  if (resolutionMode === ResolutionMode.CompleteOnly) {
    const allowed = new Set<FrequencyMode>([FrequencyMode.ShowOnce, FrequencyMode.UntilCompleted]);
    if (!allowed.has(frequencyMode)) {
      throw new InvariantError('complete_only requires frequency_mode in {showOnce, untilCompleted}');
    }
  }

  if (startAt !== null && endAt !== null && startAt.getTime() >= endAt.getTime()) {
    throw new InvariantError('startAt must be before endAt');
  }
}
```

- [ ] **Step 4: Rodar (PASS)**

```bash
npx jest src/modules/in-app-campaigns/validators/invariants.validator.spec.ts
```

Expected: PASS 7 testes.

- [ ] **Step 5: Commit**

```bash
git add src/modules/in-app-campaigns/validators/invariants.validator.{ts,spec.ts}
git commit -m "feat(in-app-campaigns): add invariants validator for mode combinations and dates"
```

---

## Task 8: DTOs — CreateCampaignDto, UpdateCampaignDto, TargetingDto

**Files:**
- Create: `chatfunnel-services/src/modules/in-app-campaigns/dto/targeting.dto.ts`
- Create: `chatfunnel-services/src/modules/in-app-campaigns/dto/create-campaign.dto.ts`
- Create: `chatfunnel-services/src/modules/in-app-campaigns/dto/update-campaign.dto.ts`
- Create: `chatfunnel-services/src/modules/in-app-campaigns/dto/patch-status.dto.ts`

- [ ] **Step 1: TargetingDto**

```ts
// src/modules/in-app-campaigns/dto/targeting.dto.ts
import { IsArray, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { TargetMode } from '../types';

export class TargetingDto {
  @IsEnum(TargetMode) mode!: TargetMode;

  @IsOptional() @IsArray() @IsString({ each: true })
  plans?: string[];

  @IsOptional() @IsArray() @IsUUID('all', { each: true })
  orgIds?: string[];

  @IsOptional() @IsArray() @IsString({ each: true })
  userRoles?: string[];
}
```

- [ ] **Step 2: CreateCampaignDto**

```ts
// src/modules/in-app-campaigns/dto/create-campaign.dto.ts
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { FrequencyMode, ResolutionMode } from '../types';
import { FormSchemaDto } from './form-schema.dto';
import { TargetingDto } from './targeting.dto';

export class CreateCampaignDto {
  @IsString() @MinLength(1) title!: string;

  @IsOptional() @IsString() description?: string;

  @ValidateNested() @Type(() => FormSchemaDto) formSchema!: FormSchemaDto;

  @IsEnum(FrequencyMode) frequencyMode!: FrequencyMode;
  @IsEnum(ResolutionMode) resolutionMode!: ResolutionMode;

  @IsOptional() @IsDate() @Type(() => Date) startAt?: Date;
  @IsOptional() @IsDate() @Type(() => Date) endAt?: Date;

  @ValidateNested() @Type(() => TargetingDto) targeting!: TargetingDto;
}
```

- [ ] **Step 3: UpdateCampaignDto (Partial de Create)**

```ts
// src/modules/in-app-campaigns/dto/update-campaign.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateCampaignDto } from './create-campaign.dto';

export class UpdateCampaignDto extends PartialType(CreateCampaignDto) {}
```

- [ ] **Step 4: PatchStatusDto**

```ts
// src/modules/in-app-campaigns/dto/patch-status.dto.ts
import { IsEnum } from 'class-validator';
import { CampaignStatus } from '../types';

export class PatchStatusDto {
  @IsEnum(CampaignStatus) status!: CampaignStatus;
}
```

- [ ] **Step 5: Build check**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/in-app-campaigns/dto/{targeting,create-campaign,update-campaign,patch-status}.dto.ts
git commit -m "feat(in-app-campaigns): add create/update/status DTOs with targeting"
```

---

## Task 9: Repositórios (Prisma wrappers)

**Files:**
- Create: `chatfunnel-services/src/modules/in-app-campaigns/repositories/in-app-campaign.repository.ts`
- Create: `chatfunnel-services/src/modules/in-app-campaigns/repositories/in-app-campaign-user-state.repository.ts`
- Create: `chatfunnel-services/src/modules/in-app-campaigns/repositories/in-app-campaign-response-value.repository.ts`

- [ ] **Step 1: CampaignRepository (CRUD puro Prisma)**

```ts
// src/modules/in-app-campaigns/repositories/in-app-campaign.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { InAppCampaign, Prisma } from '@prisma/client';

@Injectable()
export class InAppCampaignRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.InAppCampaignCreateInput): Promise<InAppCampaign> {
    return this.prisma.inAppCampaign.create({ data });
  }

  findById(id: string): Promise<InAppCampaign | null> {
    return this.prisma.inAppCampaign.findUnique({ where: { id } });
  }

  findActive(): Promise<InAppCampaign[]> {
    const now = new Date();
    return this.prisma.inAppCampaign.findMany({
      where: {
        status: 'active',
        isDeleted: false,
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gt: now } }] },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  list(filter: Prisma.InAppCampaignWhereInput, skip = 0, take = 50): Promise<{ rows: InAppCampaign[]; total: number }> {
    return this.prisma.$transaction(async (tx) => {
      const [rows, total] = await Promise.all([
        tx.inAppCampaign.findMany({ where: filter, skip, take, orderBy: { createdAt: 'desc' } }),
        tx.inAppCampaign.count({ where: filter }),
      ]);
      return { rows, total };
    });
  }

  update(id: string, data: Prisma.InAppCampaignUpdateInput): Promise<InAppCampaign> {
    return this.prisma.inAppCampaign.update({ where: { id }, data });
  }

  markFirstShownIfNeeded(id: string, when: Date): Promise<Prisma.BatchPayload> {
    return this.prisma.inAppCampaign.updateMany({
      where: { id, firstShownAt: null },
      data: { firstShownAt: when },
    });
  }
}
```

- [ ] **Step 2: UserStateRepository**

```ts
// src/modules/in-app-campaigns/repositories/in-app-campaign-user-state.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { InAppCampaignUserState, Prisma } from '@prisma/client';

@Injectable()
export class InAppCampaignUserStateRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByCampaignAndUser(campaignId: string, userId: string): Promise<InAppCampaignUserState | null> {
    return this.prisma.inAppCampaignUserState.findUnique({
      where: { campaignId_userId: { campaignId, userId } },
    });
  }

  upsertShown(args: { campaignId: string; userId: string; accountId: string; now: Date }): Promise<{ state: InAppCampaignUserState; wasInsert: boolean }> {
    const { campaignId, userId, accountId, now } = args;
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.inAppCampaignUserState.findUnique({ where: { campaignId_userId: { campaignId, userId } } });
      if (existing) {
        const state = await tx.inAppCampaignUserState.update({
          where: { campaignId_userId: { campaignId, userId } },
          data: { lastShownAt: now, timesShown: { increment: 1 } },
        });
        return { state, wasInsert: false };
      }
      const state = await tx.inAppCampaignUserState.create({
        data: {
          campaignId, userId, accountId, status: 'shown',
          firstShownAt: now, lastShownAt: now, timesShown: 1,
        },
      });
      return { state, wasInsert: true };
    });
  }

  markDismissed(campaignId: string, userId: string, now: Date): Promise<InAppCampaignUserState> {
    return this.prisma.inAppCampaignUserState.update({
      where: { campaignId_userId: { campaignId, userId } },
      data: { status: 'dismissed', dismissedAt: now },
    });
  }

  markCompleted(tx: Prisma.TransactionClient, campaignId: string, userId: string, now: Date): Promise<InAppCampaignUserState> {
    return tx.inAppCampaignUserState.update({
      where: { campaignId_userId: { campaignId, userId } },
      data: { status: 'completed', completedAt: now, submittedAt: now },
    });
  }
}
```

- [ ] **Step 3: ResponseValueRepository**

```ts
// src/modules/in-app-campaigns/repositories/in-app-campaign-response-value.repository.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class InAppCampaignResponseValueRepository {
  constructor(private readonly prisma: PrismaService) {}

  bulkInsert(tx: Prisma.TransactionClient, rows: Prisma.InAppCampaignResponseValueCreateManyInput[]): Promise<Prisma.BatchPayload> {
    return tx.inAppCampaignResponseValue.createMany({ data: rows });
  }

  countByFieldValue(campaignId: string, fieldKey: string): Promise<{ value: string; count: number }[]> {
    return this.prisma.inAppCampaignResponseValue
      .groupBy({
        by: ['valueText'],
        where: { campaignId, fieldKey, valueText: { not: null } },
        _count: { _all: true },
      })
      .then((rows) => rows.map((r) => ({ value: r.valueText as string, count: r._count._all })));
  }
}
```

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/in-app-campaigns/repositories/*.ts
git commit -m "feat(in-app-campaigns): add Prisma repositories for campaigns, user states, responses"
```

---

## Task 10: CampaignService (CRUD + invariantes + imutabilidade)

**Files:**
- Create: `chatfunnel-services/src/modules/in-app-campaigns/services/campaign.service.ts`
- Create: `chatfunnel-services/src/modules/in-app-campaigns/services/campaign.service.spec.ts`

- [ ] **Step 1: Escrever testes (comportamentos chave)**

```ts
// src/modules/in-app-campaigns/services/campaign.service.spec.ts
import { Test } from '@nestjs/testing';
import { CampaignService } from './campaign.service';
import { InAppCampaignRepository } from '../repositories/in-app-campaign.repository';
import { FrequencyMode, ResolutionMode, TargetMode, CampaignStatus, FieldType } from '../types';
import { BadRequestException, ConflictException } from '@nestjs/common';

const mockRepo = () => ({
  create: jest.fn(), findById: jest.fn(), update: jest.fn(), list: jest.fn(),
  findActive: jest.fn(), markFirstShownIfNeeded: jest.fn(),
});

const baseDto = () => ({
  title: 'Test', description: 'd',
  formSchema: { fields: [{ key: 'a', type: FieldType.Text, label: 'A' }] },
  frequencyMode: FrequencyMode.ShowOnce,
  resolutionMode: ResolutionMode.DismissOrComplete,
  targeting: { mode: TargetMode.All },
});

describe('CampaignService', () => {
  let service: CampaignService;
  let repo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    repo = mockRepo();
    const mod = await Test.createTestingModule({
      providers: [
        CampaignService,
        { provide: InAppCampaignRepository, useValue: repo },
      ],
    }).compile();
    service = mod.get(CampaignService);
  });

  it('creates a draft campaign', async () => {
    repo.create.mockResolvedValue({ id: 'uuid-1' });
    const res = await service.create(baseDto(), 'admin-uuid');
    expect(res).toEqual({ id: 'uuid-1' });
    expect(repo.create).toHaveBeenCalled();
  });

  it('rejects create with invalid invariant combination', async () => {
    const dto = { ...baseDto(), frequencyMode: FrequencyMode.UntilDismissed, resolutionMode: ResolutionMode.CompleteOnly };
    await expect(service.create(dto as any, 'admin')).rejects.toThrow(BadRequestException);
  });

  it('rejects update of structural field when firstShownAt is set', async () => {
    repo.findById.mockResolvedValue({ id: '1', firstShownAt: new Date(), formSchema: { fields: [{ key: 'a', type: 'text', label: 'A' }] } });
    await expect(service.update('1', {
      formSchema: { fields: [{ key: 'b', type: FieldType.Text, label: 'B' }] },
    } as any)).rejects.toThrow(ConflictException);
  });

  it('allows cosmetic update after firstShownAt', async () => {
    repo.findById.mockResolvedValue({ id: '1', firstShownAt: new Date(), formSchema: { fields: [{ key: 'a', type: 'text', label: 'A' }] }, title: 'old' });
    repo.update.mockResolvedValue({ id: '1', title: 'new' });
    const res = await service.update('1', { title: 'new' } as any);
    expect(res.title).toBe('new');
  });

  it('prevents status transition to active without valid form_schema', async () => {
    repo.findById.mockResolvedValue({ id: '1', status: 'draft', formSchema: { fields: [] } });
    await expect(service.updateStatus('1', CampaignStatus.Active)).rejects.toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2: Rodar (FAIL)**

```bash
npx jest src/modules/in-app-campaigns/services/campaign.service.spec.ts
```

Expected: FAIL (no service).

- [ ] **Step 3: Implementar CampaignService**

```ts
// src/modules/in-app-campaigns/services/campaign.service.ts
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InAppCampaign } from '@prisma/client';
import { InAppCampaignRepository } from '../repositories/in-app-campaign.repository';
import { CreateCampaignDto } from '../dto/create-campaign.dto';
import { UpdateCampaignDto } from '../dto/update-campaign.dto';
import { CampaignStatus, FrequencyMode, ResolutionMode, TargetMode } from '../types';
import { validateFormSchema, FormSchemaError } from '../validators/form-schema.validator';
import { validateCampaignInvariants, InvariantError } from '../validators/invariants.validator';

@Injectable()
export class CampaignService {
  constructor(private readonly repo: InAppCampaignRepository) {}

  async create(dto: CreateCampaignDto, createdBy: string): Promise<InAppCampaign> {
    this.validateForCreate(dto);
    return this.repo.create({
      title: dto.title,
      description: dto.description ?? null,
      formSchema: dto.formSchema as any,
      frequencyMode: dto.frequencyMode,
      resolutionMode: dto.resolutionMode,
      startAt: dto.startAt ?? null,
      endAt: dto.endAt ?? null,
      status: CampaignStatus.Draft,
      targetMode: dto.targeting.mode,
      targetPlans: dto.targeting.plans ?? [],
      targetOrgIds: dto.targeting.orgIds ?? [],
      targetUserRoles: dto.targeting.userRoles ?? [],
      createdBy,
    });
  }

  async update(id: string, dto: UpdateCampaignDto): Promise<InAppCampaign> {
    const existing = await this.requireExisting(id);
    const isLocked = existing.firstShownAt !== null;

    if (isLocked && dto.formSchema) {
      this.assertCosmeticFormChange(existing.formSchema as any, dto.formSchema);
    } else if (dto.formSchema) {
      try { validateFormSchema(dto.formSchema as any); }
      catch (e) { if (e instanceof FormSchemaError) throw new BadRequestException(e.message); throw e; }
    }

    if (dto.frequencyMode || dto.resolutionMode || dto.startAt || dto.endAt) {
      const merged = {
        frequencyMode: (dto.frequencyMode ?? existing.frequencyMode) as FrequencyMode,
        resolutionMode: (dto.resolutionMode ?? existing.resolutionMode) as ResolutionMode,
        startAt: dto.startAt !== undefined ? (dto.startAt as Date | null) : existing.startAt,
        endAt: dto.endAt !== undefined ? (dto.endAt as Date | null) : existing.endAt,
      };
      try { validateCampaignInvariants(merged); }
      catch (e) { if (e instanceof InvariantError) throw new BadRequestException(e.message); throw e; }
    }

    const patch: any = {};
    for (const key of ['title', 'description', 'startAt', 'endAt', 'frequencyMode', 'resolutionMode'] as const) {
      if ((dto as any)[key] !== undefined) (patch as any)[key] = (dto as any)[key];
    }
    if (dto.targeting) {
      patch.targetMode = dto.targeting.mode;
      patch.targetPlans = dto.targeting.plans ?? [];
      patch.targetOrgIds = dto.targeting.orgIds ?? [];
      patch.targetUserRoles = dto.targeting.userRoles ?? [];
    }
    if (dto.formSchema) patch.formSchema = dto.formSchema as any;

    return this.repo.update(id, patch);
  }

  async updateStatus(id: string, status: CampaignStatus): Promise<InAppCampaign> {
    const existing = await this.requireExisting(id);
    if (status === CampaignStatus.Active) {
      try { validateFormSchema(existing.formSchema as any); }
      catch (e) { if (e instanceof FormSchemaError) throw new BadRequestException(e.message); throw e; }
    }
    if (status === CampaignStatus.Archived) {
      return this.repo.update(id, { status, archivedAt: new Date() });
    }
    return this.repo.update(id, { status });
  }

  async duplicate(id: string, createdBy: string): Promise<InAppCampaign> {
    const original = await this.requireExisting(id);
    return this.repo.create({
      title: `${original.title} (cópia)`,
      description: original.description,
      formSchema: original.formSchema as any,
      frequencyMode: original.frequencyMode,
      resolutionMode: original.resolutionMode,
      startAt: null,
      endAt: null,
      status: CampaignStatus.Draft,
      targetMode: original.targetMode,
      targetPlans: original.targetPlans,
      targetOrgIds: original.targetOrgIds,
      targetUserRoles: original.targetUserRoles,
      createdBy,
    });
  }

  private validateForCreate(dto: CreateCampaignDto): void {
    try { validateFormSchema(dto.formSchema); }
    catch (e) { if (e instanceof FormSchemaError) throw new BadRequestException(e.message); throw e; }
    try {
      validateCampaignInvariants({
        frequencyMode: dto.frequencyMode,
        resolutionMode: dto.resolutionMode,
        startAt: dto.startAt ?? null,
        endAt: dto.endAt ?? null,
      });
    } catch (e) { if (e instanceof InvariantError) throw new BadRequestException(e.message); throw e; }
  }

  private async requireExisting(id: string): Promise<InAppCampaign> {
    const existing = await this.repo.findById(id);
    if (!existing || existing.isDeleted) throw new NotFoundException(`campaign ${id} not found`);
    return existing;
  }

  private assertCosmeticFormChange(oldSchema: any, newSchema: any): void {
    const oldFields = oldSchema.fields as any[];
    const newFields = newSchema.fields as any[];

    if (oldFields.length !== newFields.length) {
      throw new ConflictException('cannot add/remove fields after first_shown_at');
    }
    for (let i = 0; i < oldFields.length; i++) {
      const o = oldFields[i], n = newFields[i];
      if (o.key !== n.key) throw new ConflictException(`cannot change field.key (${o.key} -> ${n.key})`);
      if (o.type !== n.type) throw new ConflictException(`cannot change field.type (${o.key})`);
      if (JSON.stringify(o.validation) !== JSON.stringify(n.validation)) {
        throw new ConflictException(`cannot change validation rules (${o.key})`);
      }
      if (o.options || n.options) {
        const oOpts = o.options || [], nOpts = n.options || [];
        if (oOpts.length !== nOpts.length) throw new ConflictException(`cannot add/remove options in ${o.key}`);
        for (let j = 0; j < oOpts.length; j++) {
          if (oOpts[j].value !== nOpts[j].value) {
            throw new ConflictException(`cannot change option.value in ${o.key}`);
          }
        }
      }
    }
  }
}
```

- [ ] **Step 4: Rodar (PASS)**

```bash
npx jest src/modules/in-app-campaigns/services/campaign.service.spec.ts
```

Expected: 5 testes PASS.

- [ ] **Step 5: Registrar no módulo**

Abrir `src/modules/in-app-campaigns/in-app-campaigns.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { CampaignService } from './services/campaign.service';
import { InAppCampaignRepository } from './repositories/in-app-campaign.repository';
import { InAppCampaignUserStateRepository } from './repositories/in-app-campaign-user-state.repository';
import { InAppCampaignResponseValueRepository } from './repositories/in-app-campaign-response-value.repository';

@Module({
  imports: [PrismaModule],
  providers: [
    CampaignService,
    InAppCampaignRepository,
    InAppCampaignUserStateRepository,
    InAppCampaignResponseValueRepository,
  ],
  exports: [CampaignService],
})
export class InAppCampaignsModule {}
```

- [ ] **Step 6: Build e commit**

```bash
npm run build
git add src/modules/in-app-campaigns/services/campaign.service.{ts,spec.ts} src/modules/in-app-campaigns/in-app-campaigns.module.ts
git commit -m "feat(in-app-campaigns): implement CampaignService with create/update/status/duplicate and immutability checks"
```

---

## Task 11: EligibilityService (`/pending`)

**Files:**
- Create: `chatfunnel-services/src/modules/in-app-campaigns/services/eligibility.service.ts`
- Create: `chatfunnel-services/src/modules/in-app-campaigns/services/eligibility.service.spec.ts`

- [ ] **Step 1: Escrever testes (focados em filtro de frequência e targeting)**

```ts
// src/modules/in-app-campaigns/services/eligibility.service.spec.ts
import { Test } from '@nestjs/testing';
import { EligibilityService } from './eligibility.service';
import { PrismaService } from '../../../database/prisma/prisma.service';

describe('EligibilityService', () => {
  let service: EligibilityService;
  let prisma: { $queryRaw: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRaw: jest.fn() };
    const mod = await Test.createTestingModule({
      providers: [EligibilityService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(EligibilityService);
  });

  it('calls raw query with user context', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    await service.getPending({ userId: 'u1', accountId: 'a1', accountPlan: 'pro', userRole: 'owner' });
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it('returns rows shaped for the frontend', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'c1', title: 'T', description: 'd',
        form_schema: { fields: [] },
        resolution_mode: 'dismiss_or_complete',
        frequency_mode: 'showOnce',
      },
    ]);
    const out = await service.getPending({ userId: 'u1', accountId: 'a1', accountPlan: 'pro', userRole: 'owner' });
    expect(out).toEqual({
      campaigns: [
        { id: 'c1', title: 'T', description: 'd', formSchema: { fields: [] }, resolutionMode: 'dismiss_or_complete', frequencyMode: 'showOnce' },
      ],
    });
  });
});
```

- [ ] **Step 2: Rodar (FAIL)**

```bash
npx jest src/modules/in-app-campaigns/services/eligibility.service.spec.ts
```

- [ ] **Step 3: Implementar**

```ts
// src/modules/in-app-campaigns/services/eligibility.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';

export interface EligibilityUserContext {
  userId: string;
  accountId: string;
  accountPlan: string;
  userRole: string;
}

export interface PendingCampaignDto {
  id: string;
  title: string;
  description: string | null;
  formSchema: unknown;
  resolutionMode: string;
  frequencyMode: string;
}

@Injectable()
export class EligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  async getPending(ctx: EligibilityUserContext): Promise<{ campaigns: PendingCampaignDto[] }> {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT c.id, c.title, c.description, c.form_schema, c.resolution_mode, c.frequency_mode, c.created_at
      FROM in_app_campaigns c
      LEFT JOIN in_app_campaign_user_states us
        ON us.campaign_id = c.id AND us.user_id = ${ctx.userId}::uuid
      WHERE c.status = 'active'
        AND c.is_deleted = false
        AND (c.start_at IS NULL OR c.start_at <= NOW())
        AND (c.end_at   IS NULL OR c.end_at   > NOW())
        AND (
          c.target_mode = 'all'
          OR (
            (c.target_plans      = '{}'::text[]  OR ${ctx.accountPlan}   = ANY(c.target_plans))
            AND (c.target_org_ids   = '{}'::uuid[]   OR ${ctx.accountId}::uuid = ANY(c.target_org_ids))
            AND (c.target_user_roles= '{}'::text[]   OR ${ctx.userRole}    = ANY(c.target_user_roles))
          )
        )
        AND (
          (c.frequency_mode = 'showOnce'       AND us.id IS NULL)
          OR (c.frequency_mode = 'untilDismissed' AND (us.id IS NULL OR us.status = 'shown'))
          OR (c.frequency_mode = 'untilCompleted' AND (us.id IS NULL OR us.status <> 'completed'))
        )
      ORDER BY c.created_at DESC
    `);

    return {
      campaigns: rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description ?? null,
        formSchema: r.form_schema,
        resolutionMode: r.resolution_mode,
        frequencyMode: r.frequency_mode,
      })),
    };
  }
}
```

- [ ] **Step 4: Registrar no módulo + rodar testes**

Adicionar `EligibilityService` em `providers` e `exports` do `in-app-campaigns.module.ts`. Depois:

```bash
npx jest src/modules/in-app-campaigns/services/eligibility.service.spec.ts
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/in-app-campaigns/services/eligibility.service.{ts,spec.ts} src/modules/in-app-campaigns/in-app-campaigns.module.ts
git commit -m "feat(in-app-campaigns): add EligibilityService with raw SQL matching and frequency filtering"
```

---

## Task 12: DeliveryService (shown + dismissed)

**Files:**
- Create: `chatfunnel-services/src/modules/in-app-campaigns/services/delivery.service.ts`
- Create: `chatfunnel-services/src/modules/in-app-campaigns/services/delivery.service.spec.ts`

- [ ] **Step 1: Testes**

```ts
// src/modules/in-app-campaigns/services/delivery.service.spec.ts
import { Test } from '@nestjs/testing';
import { DeliveryService } from './delivery.service';
import { InAppCampaignUserStateRepository } from '../repositories/in-app-campaign-user-state.repository';
import { InAppCampaignRepository } from '../repositories/in-app-campaign.repository';
import { ConflictException } from '@nestjs/common';

const makeRepos = () => ({
  states: {
    upsertShown: jest.fn(), markDismissed: jest.fn(), findByCampaignAndUser: jest.fn(),
  } as any,
  campaigns: {
    findById: jest.fn(), markFirstShownIfNeeded: jest.fn(),
  } as any,
});

describe('DeliveryService', () => {
  let service: DeliveryService;
  let repos: ReturnType<typeof makeRepos>;

  beforeEach(async () => {
    repos = makeRepos();
    const mod = await Test.createTestingModule({
      providers: [
        DeliveryService,
        { provide: InAppCampaignUserStateRepository, useValue: repos.states },
        { provide: InAppCampaignRepository, useValue: repos.campaigns },
      ],
    }).compile();
    service = mod.get(DeliveryService);
  });

  it('records shown and updates first_shown_at on first insert', async () => {
    repos.states.upsertShown.mockResolvedValue({ state: { id: 's' }, wasInsert: true });
    await service.recordShown({ campaignId: 'c1', userId: 'u1', accountId: 'a1' });
    expect(repos.campaigns.markFirstShownIfNeeded).toHaveBeenCalledWith('c1', expect.any(Date));
  });

  it('does not touch first_shown_at when not first insert', async () => {
    repos.states.upsertShown.mockResolvedValue({ state: { id: 's' }, wasInsert: false });
    await service.recordShown({ campaignId: 'c1', userId: 'u1', accountId: 'a1' });
    expect(repos.campaigns.markFirstShownIfNeeded).not.toHaveBeenCalled();
  });

  it('rejects dismiss when resolution_mode is complete_only', async () => {
    repos.campaigns.findById.mockResolvedValue({ id: 'c1', resolutionMode: 'complete_only' });
    await expect(service.recordDismissed({ campaignId: 'c1', userId: 'u1' })).rejects.toThrow(ConflictException);
  });

  it('is no-op when already completed', async () => {
    repos.campaigns.findById.mockResolvedValue({ id: 'c1', resolutionMode: 'dismiss_or_complete' });
    repos.states.findByCampaignAndUser.mockResolvedValue({ status: 'completed' });
    await service.recordDismissed({ campaignId: 'c1', userId: 'u1' });
    expect(repos.states.markDismissed).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar (FAIL)**

```bash
npx jest src/modules/in-app-campaigns/services/delivery.service.spec.ts
```

- [ ] **Step 3: Implementar**

```ts
// src/modules/in-app-campaigns/services/delivery.service.ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InAppCampaignRepository } from '../repositories/in-app-campaign.repository';
import { InAppCampaignUserStateRepository } from '../repositories/in-app-campaign-user-state.repository';
import { ResolutionMode, UserStateStatus } from '../types';

@Injectable()
export class DeliveryService {
  constructor(
    private readonly states: InAppCampaignUserStateRepository,
    private readonly campaigns: InAppCampaignRepository,
  ) {}

  async recordShown(input: { campaignId: string; userId: string; accountId: string }): Promise<void> {
    const now = new Date();
    const { wasInsert } = await this.states.upsertShown({ ...input, now });
    if (wasInsert) {
      await this.campaigns.markFirstShownIfNeeded(input.campaignId, now);
    }
  }

  async recordDismissed(input: { campaignId: string; userId: string }): Promise<void> {
    const campaign = await this.campaigns.findById(input.campaignId);
    if (!campaign) throw new NotFoundException(`campaign ${input.campaignId} not found`);
    if (campaign.resolutionMode === ResolutionMode.CompleteOnly) {
      throw new ConflictException('campaign does not allow dismiss (resolution_mode=complete_only)');
    }
    const existing = await this.states.findByCampaignAndUser(input.campaignId, input.userId);
    if (!existing || existing.status === UserStateStatus.Completed || existing.status === UserStateStatus.Dismissed) {
      return;
    }
    await this.states.markDismissed(input.campaignId, input.userId, new Date());
  }
}
```

- [ ] **Step 4: Registrar + rodar**

Adicionar `DeliveryService` nos providers/exports do módulo. Rodar testes:

```bash
npx jest src/modules/in-app-campaigns/services/delivery.service.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/in-app-campaigns/services/delivery.service.{ts,spec.ts} src/modules/in-app-campaigns/in-app-campaigns.module.ts
git commit -m "feat(in-app-campaigns): add DeliveryService for shown and dismissed events"
```

---

## Task 13: Answers validator (submit payload vs form_schema)

**Files:**
- Create: `chatfunnel-services/src/modules/in-app-campaigns/validators/answers.validator.ts`
- Create: `chatfunnel-services/src/modules/in-app-campaigns/validators/answers.validator.spec.ts`

- [ ] **Step 1: Testes**

```ts
// src/modules/in-app-campaigns/validators/answers.validator.spec.ts
import { FieldType } from '../types';
import { FormSchemaDto } from '../dto/form-schema.dto';
import { validateAnswers, AnswersError } from './answers.validator';

function schema(fields: any[]): FormSchemaDto { return { fields }; }

describe('validateAnswers', () => {
  it('rejects missing required field', () => {
    const s = schema([{ key: 'n', type: FieldType.Text, label: 'N', required: true }]);
    expect(() => validateAnswers(s, {})).toThrow(AnswersError);
  });

  it('rejects type mismatch (text expected, got number)', () => {
    const s = schema([{ key: 'n', type: FieldType.Text, label: 'N' }]);
    expect(() => validateAnswers(s, { n: 42 })).toThrow(AnswersError);
  });

  it('accepts valid select value (in options)', () => {
    const s = schema([{ key: 'x', type: FieldType.Select, label: 'X', options: [{ value: 'a', label: 'A' }] }]);
    expect(() => validateAnswers(s, { x: 'a' })).not.toThrow();
  });

  it('rejects select value not in options', () => {
    const s = schema([{ key: 'x', type: FieldType.Select, label: 'X', options: [{ value: 'a', label: 'A' }] }]);
    expect(() => validateAnswers(s, { x: 'z' })).toThrow(AnswersError);
  });

  it('accepts checkbox array', () => {
    const s = schema([{ key: 'x', type: FieldType.Checkbox, label: 'X', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }]);
    expect(() => validateAnswers(s, { x: ['a', 'b'] })).not.toThrow();
  });

  it('rejects checkbox with unknown option', () => {
    const s = schema([{ key: 'x', type: FieldType.Checkbox, label: 'X', options: [{ value: 'a', label: 'A' }] }]);
    expect(() => validateAnswers(s, { x: ['a', 'z'] })).toThrow(AnswersError);
  });

  it('validates rating as number', () => {
    const s = schema([{ key: 'r', type: FieldType.Rating, label: 'R', validation: { min: 0, max: 10 } }]);
    expect(() => validateAnswers(s, { r: 11 })).toThrow(AnswersError);
    expect(() => validateAnswers(s, { r: 7 })).not.toThrow();
  });

  it('validates regex on text', () => {
    const s = schema([{ key: 'e', type: FieldType.Email, label: 'E', validation: { regex: '^[^@]+@[^@]+$' } }]);
    expect(() => validateAnswers(s, { e: 'bad' })).toThrow(AnswersError);
    expect(() => validateAnswers(s, { e: 'a@b' })).not.toThrow();
  });
});
```

- [ ] **Step 2: Rodar (FAIL)**

```bash
npx jest src/modules/in-app-campaigns/validators/answers.validator.spec.ts
```

- [ ] **Step 3: Implementar**

```ts
// src/modules/in-app-campaigns/validators/answers.validator.ts
import { FieldType } from '../types';
import { FormSchemaDto } from '../dto/form-schema.dto';

export class AnswersError extends Error {
  constructor(message: string) { super(message); this.name = 'AnswersError'; }
}

export type Answers = Record<string, string | number | boolean | string[] | undefined | null>;

export function validateAnswers(schema: FormSchemaDto, answers: Answers): void {
  for (const field of schema.fields) {
    const value = answers[field.key];

    if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
      if (field.required) throw new AnswersError(`missing required field: ${field.key}`);
      continue;
    }

    switch (field.type) {
      case FieldType.Text:
      case FieldType.Textarea:
      case FieldType.Email:
      case FieldType.Hidden: {
        if (typeof value !== 'string') throw new AnswersError(`${field.key} must be string`);
        if (field.validation?.min !== undefined && value.length < field.validation.min) throw new AnswersError(`${field.key} too short`);
        if (field.validation?.max !== undefined && value.length > field.validation.max) throw new AnswersError(`${field.key} too long`);
        if (field.validation?.regex && !new RegExp(field.validation.regex).test(value)) throw new AnswersError(`${field.key} invalid format`);
        break;
      }
      case FieldType.Number:
      case FieldType.Rating: {
        if (typeof value !== 'number' || Number.isNaN(value)) throw new AnswersError(`${field.key} must be number`);
        if (field.validation?.min !== undefined && value < field.validation.min) throw new AnswersError(`${field.key} below min`);
        if (field.validation?.max !== undefined && value > field.validation.max) throw new AnswersError(`${field.key} above max`);
        break;
      }
      case FieldType.Select:
      case FieldType.Radio: {
        if (typeof value !== 'string') throw new AnswersError(`${field.key} must be string`);
        const allowed = new Set((field.options ?? []).map((o) => o.value));
        if (!allowed.has(value)) throw new AnswersError(`${field.key} value not in options`);
        break;
      }
      case FieldType.Checkbox: {
        if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
          throw new AnswersError(`${field.key} must be string[]`);
        }
        const allowed = new Set((field.options ?? []).map((o) => o.value));
        for (const v of value) if (!allowed.has(v)) throw new AnswersError(`${field.key} invalid option: ${v}`);
        break;
      }
    }
  }
}
```

- [ ] **Step 4: Rodar (PASS) + commit**

```bash
npx jest src/modules/in-app-campaigns/validators/answers.validator.spec.ts
git add src/modules/in-app-campaigns/validators/answers.validator.{ts,spec.ts}
git commit -m "feat(in-app-campaigns): add answers validator for submit payload vs form_schema"
```

---

## Task 14: ResponseService (submitted)

**Files:**
- Create: `chatfunnel-services/src/modules/in-app-campaigns/services/response.service.ts`
- Create: `chatfunnel-services/src/modules/in-app-campaigns/services/response.service.spec.ts`

- [ ] **Step 1: Testes**

```ts
// src/modules/in-app-campaigns/services/response.service.spec.ts
import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ResponseService } from './response.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { InAppCampaignRepository } from '../repositories/in-app-campaign.repository';

const sampleSchema = {
  fields: [
    { key: 'n', type: 'text', label: 'N', required: true },
    { key: 'opts', type: 'checkbox', label: 'O', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
    { key: 'r', type: 'rating', label: 'R', validation: { min: 0, max: 10 } },
  ],
};

describe('ResponseService', () => {
  let service: ResponseService;
  let prisma: any;
  let repo: any;

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(async (cb: any) => cb({
        inAppCampaignUserState: { update: jest.fn().mockResolvedValue({ id: 's1' }), findUnique: jest.fn().mockResolvedValue({ id: 's1', status: 'shown' }) },
        inAppCampaignResponseValue: { createMany: jest.fn().mockResolvedValue({ count: 4 }) },
      })),
    };
    repo = { findById: jest.fn() };

    const mod = await Test.createTestingModule({
      providers: [
        ResponseService,
        { provide: PrismaService, useValue: prisma },
        { provide: InAppCampaignRepository, useValue: repo },
      ],
    }).compile();
    service = mod.get(ResponseService);
  });

  it('rejects when campaign not found', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.submit({ campaignId: 'c1', userId: 'u', accountId: 'a', answers: { n: 'x' } })).rejects.toThrow(NotFoundException);
  });

  it('rejects invalid answers payload', async () => {
    repo.findById.mockResolvedValue({ id: 'c1', formSchema: sampleSchema });
    await expect(service.submit({ campaignId: 'c1', userId: 'u', accountId: 'a', answers: {} })).rejects.toThrow(BadRequestException);
  });

  it('rejects duplicate submission (already completed)', async () => {
    repo.findById.mockResolvedValue({ id: 'c1', formSchema: sampleSchema });
    prisma.$transaction = jest.fn(async (cb: any) => cb({
      inAppCampaignUserState: { findUnique: jest.fn().mockResolvedValue({ id: 's1', status: 'completed' }) },
    }));
    await expect(service.submit({ campaignId: 'c1', userId: 'u', accountId: 'a', answers: { n: 'x', r: 5 } })).rejects.toThrow(ConflictException);
  });

  it('inserts one row per field; checkbox explodes into N rows', async () => {
    repo.findById.mockResolvedValue({ id: 'c1', formSchema: sampleSchema });
    let captured: any;
    prisma.$transaction = jest.fn(async (cb: any) => cb({
      inAppCampaignUserState: { findUnique: jest.fn().mockResolvedValue({ id: 's1', status: 'shown' }), update: jest.fn().mockResolvedValue({ id: 's1' }) },
      inAppCampaignResponseValue: { createMany: jest.fn(async (args: any) => { captured = args; return { count: args.data.length }; }) },
    }));
    await service.submit({ campaignId: 'c1', userId: 'u', accountId: 'a', answers: { n: 'hello', opts: ['a', 'b'], r: 9 } });
    expect(captured.data).toHaveLength(4); // 1 text + 2 checkbox + 1 rating
    expect(captured.data.filter((d: any) => d.fieldKey === 'opts')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Rodar (FAIL)**

```bash
npx jest src/modules/in-app-campaigns/services/response.service.spec.ts
```

- [ ] **Step 3: Implementar**

```ts
// src/modules/in-app-campaigns/services/response.service.ts
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { InAppCampaignRepository } from '../repositories/in-app-campaign.repository';
import { validateAnswers, AnswersError, Answers } from '../validators/answers.validator';
import { FieldType, UserStateStatus } from '../types';
import { FormSchemaDto } from '../dto/form-schema.dto';
import { Prisma } from '@prisma/client';

interface SubmitInput {
  campaignId: string;
  userId: string;
  accountId: string;
  answers: Answers;
}

@Injectable()
export class ResponseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: InAppCampaignRepository,
  ) {}

  async submit(input: SubmitInput): Promise<void> {
    const campaign = await this.repo.findById(input.campaignId);
    if (!campaign || campaign.isDeleted) throw new NotFoundException(`campaign ${input.campaignId} not found`);

    try { validateAnswers(campaign.formSchema as unknown as FormSchemaDto, input.answers); }
    catch (e) { if (e instanceof AnswersError) throw new BadRequestException(e.message); throw e; }

    const now = new Date();
    const rows = this.explode(campaign.id, input.accountId, campaign.formSchema as unknown as FormSchemaDto, input.answers, now);

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.inAppCampaignUserState.findUnique({
        where: { campaignId_userId: { campaignId: input.campaignId, userId: input.userId } },
      });
      if (existing?.status === UserStateStatus.Completed) {
        throw new ConflictException(`campaign ${input.campaignId} already completed by user`);
      }
      const userState = existing
        ? await tx.inAppCampaignUserState.update({
            where: { campaignId_userId: { campaignId: input.campaignId, userId: input.userId } },
            data: { status: UserStateStatus.Completed, completedAt: now, submittedAt: now },
          })
        : await tx.inAppCampaignUserState.create({
            data: {
              campaignId: input.campaignId, userId: input.userId, accountId: input.accountId,
              status: UserStateStatus.Completed, firstShownAt: now, lastShownAt: now, timesShown: 1,
              completedAt: now, submittedAt: now,
            },
          });

      const insertData: Prisma.InAppCampaignResponseValueCreateManyInput[] = rows.map((r) => ({ ...r, userStateId: userState.id }));
      if (insertData.length > 0) {
        await tx.inAppCampaignResponseValue.createMany({ data: insertData });
      }
    });
  }

  private explode(
    campaignId: string,
    accountId: string,
    schema: FormSchemaDto,
    answers: Answers,
    submittedAt: Date,
  ): Omit<Prisma.InAppCampaignResponseValueCreateManyInput, 'userStateId'>[] {
    const out: Omit<Prisma.InAppCampaignResponseValueCreateManyInput, 'userStateId'>[] = [];
    for (const field of schema.fields) {
      const val = answers[field.key];
      if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) continue;

      const base = { campaignId, accountId, fieldKey: field.key, fieldType: field.type, submittedAt };
      switch (field.type) {
        case FieldType.Text:
        case FieldType.Textarea:
        case FieldType.Email:
        case FieldType.Hidden:
        case FieldType.Select:
        case FieldType.Radio:
          out.push({ ...base, valueText: val as string });
          break;
        case FieldType.Number:
        case FieldType.Rating:
          out.push({ ...base, valueNumber: new Prisma.Decimal(val as number) });
          break;
        case FieldType.Checkbox:
          for (const v of val as string[]) out.push({ ...base, valueText: v });
          break;
      }
    }
    return out;
  }
}
```

- [ ] **Step 4: Registrar + testes**

Adicionar `ResponseService` em providers/exports do módulo. Rodar:

```bash
npx jest src/modules/in-app-campaigns/services/response.service.spec.ts
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/in-app-campaigns/services/response.service.{ts,spec.ts} src/modules/in-app-campaigns/in-app-campaigns.module.ts
git commit -m "feat(in-app-campaigns): add ResponseService with transactional submit and row-per-option explode"
```

---

## Task 15: ReportService

**Files:**
- Create: `chatfunnel-services/src/modules/in-app-campaigns/services/report.service.ts`
- Create: `chatfunnel-services/src/modules/in-app-campaigns/services/report.service.spec.ts`

- [ ] **Step 1: Testes**

```ts
// src/modules/in-app-campaigns/services/report.service.spec.ts
import { Test } from '@nestjs/testing';
import { ReportService } from './report.service';
import { PrismaService } from '../../../database/prisma/prisma.service';

describe('ReportService', () => {
  let service: ReportService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      inAppCampaignUserState: {
        count: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([
          { status: 'shown', _count: { _all: 3 } },
          { status: 'dismissed', _count: { _all: 1 } },
          { status: 'completed', _count: { _all: 5 } },
        ]),
      },
      inAppCampaignResponseValue: {
        groupBy: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(5),
      },
    };
    const mod = await Test.createTestingModule({
      providers: [ReportService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(ReportService);
  });

  it('aggregates totals per status', async () => {
    const res = await service.overview('c1');
    expect(res.shownTotal).toBe(3);
    expect(res.dismissedTotal).toBe(1);
    expect(res.completedTotal).toBe(5);
    expect(res.conversionRate).toBeCloseTo(5 / 9, 2);
  });
});
```

- [ ] **Step 2: Rodar (FAIL)**

```bash
npx jest src/modules/in-app-campaigns/services/report.service.spec.ts
```

- [ ] **Step 3: Implementar**

```ts
// src/modules/in-app-campaigns/services/report.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';

export interface CampaignOverview {
  shownTotal: number;
  dismissedTotal: number;
  completedTotal: number;
  submissionsTotal: number;
  conversionRate: number;
}

@Injectable()
export class ReportService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(campaignId: string): Promise<CampaignOverview> {
    const [grouped, submissions] = await Promise.all([
      this.prisma.inAppCampaignUserState.groupBy({
        by: ['status'], where: { campaignId }, _count: { _all: true },
      }),
      this.prisma.inAppCampaignUserState.count({ where: { campaignId, submittedAt: { not: null } } }),
    ]);
    const byStatus: Record<string, number> = {};
    for (const g of grouped as any[]) byStatus[g.status] = g._count._all;
    const shown = (byStatus.shown ?? 0) + (byStatus.dismissed ?? 0) + (byStatus.completed ?? 0);
    const completed = byStatus.completed ?? 0;
    return {
      shownTotal: byStatus.shown ?? 0,
      dismissedTotal: byStatus.dismissed ?? 0,
      completedTotal: completed,
      submissionsTotal: submissions,
      conversionRate: shown > 0 ? completed / shown : 0,
    };
  }

  async distribution(campaignId: string, fieldKey: string): Promise<{ value: string; count: number }[]> {
    const rows = await this.prisma.inAppCampaignResponseValue.groupBy({
      by: ['valueText'], where: { campaignId, fieldKey, valueText: { not: null } }, _count: { _all: true },
    });
    return (rows as any[]).map((r) => ({ value: r.valueText as string, count: r._count._all })).sort((a, b) => b.count - a.count);
  }
}
```

- [ ] **Step 4: Registrar + rodar**

Adicionar `ReportService` aos providers/exports. Rodar testes.

- [ ] **Step 5: Commit**

```bash
git add src/modules/in-app-campaigns/services/report.service.{ts,spec.ts} src/modules/in-app-campaigns/in-app-campaigns.module.ts
git commit -m "feat(in-app-campaigns): add ReportService for overview and distribution"
```

---

## Task 16: DTO campaign-event.dto.ts (discriminator)

**Files:**
- Create: `chatfunnel-services/src/modules/in-app-campaigns/dto/campaign-event.dto.ts`
- Create: `chatfunnel-services/src/modules/in-app-campaigns/dto/submit-answers.dto.ts`

- [ ] **Step 1: Implementar**

```ts
// src/modules/in-app-campaigns/dto/submit-answers.dto.ts
import { IsObject } from 'class-validator';

export class SubmitAnswersPayloadDto {
  @IsObject() answers!: Record<string, unknown>;
}
```

```ts
// src/modules/in-app-campaigns/dto/campaign-event.dto.ts
import { IsEnum, IsObject, IsOptional, ValidateIf } from 'class-validator';

export enum CampaignEventType {
  Shown = 'shown',
  Dismissed = 'dismissed',
  Submitted = 'submitted',
}

export class CampaignEventDto {
  @IsEnum(CampaignEventType) type!: CampaignEventType;

  @ValidateIf((o) => o.type === CampaignEventType.Submitted)
  @IsObject()
  answers?: Record<string, unknown>;
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/modules/in-app-campaigns/dto/campaign-event.dto.ts src/modules/in-app-campaigns/dto/submit-answers.dto.ts
git commit -m "feat(in-app-campaigns): add CampaignEvent DTO with discriminator"
```

---

## Task 17: User controller (`/in-app-campaigns`)

**Files:**
- Create: `chatfunnel-services/src/modules/in-app-campaigns/controllers/in-app-campaigns-user.controller.ts`

- [ ] **Step 1: Identificar o guard e user context decorator existentes**

Abrir `chatfunnel-services/src/guards/` e `src/modules/auth/` pra descobrir (1) o guard padrão que exige user autenticado e (2) o decorator que extrai `user` do request (provavelmente `@CurrentUser()` ou similar). Se não existir padrão óbvio, perguntar ao usuário; caso contrário, usar o existente.

- [ ] **Step 2: Implementar controller**

```ts
// src/modules/in-app-campaigns/controllers/in-app-campaigns-user.controller.ts
import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { EligibilityService } from '../services/eligibility.service';
import { DeliveryService } from '../services/delivery.service';
import { ResponseService } from '../services/response.service';
import { CampaignEventDto, CampaignEventType } from '../dto/campaign-event.dto';
// TODO: replace with the actual guard/decorator used by the project
// import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
// import { CurrentUser } from '../../auth/decorators/current-user.decorator';

interface RequestUser {
  id: string;
  accountId: string;
  accountPlan: string;
  role: string;
}

@Controller('in-app-campaigns')
// @UseGuards(JwtAuthGuard)
export class InAppCampaignsUserController {
  constructor(
    private readonly eligibility: EligibilityService,
    private readonly delivery: DeliveryService,
    private readonly response: ResponseService,
  ) {}

  @Get('pending')
  getPending(/* @CurrentUser() user: RequestUser */ user: RequestUser) {
    return this.eligibility.getPending({
      userId: user.id,
      accountId: user.accountId,
      accountPlan: user.accountPlan,
      userRole: user.role,
    });
  }

  @Post(':id/events')
  @HttpCode(HttpStatus.NO_CONTENT)
  async postEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CampaignEventDto,
    /* @CurrentUser() user: RequestUser */ user: RequestUser,
  ): Promise<void> {
    switch (dto.type) {
      case CampaignEventType.Shown:
        await this.delivery.recordShown({ campaignId: id, userId: user.id, accountId: user.accountId });
        return;
      case CampaignEventType.Dismissed:
        await this.delivery.recordDismissed({ campaignId: id, userId: user.id });
        return;
      case CampaignEventType.Submitted:
        await this.response.submit({ campaignId: id, userId: user.id, accountId: user.accountId, answers: dto.answers ?? {} });
        return;
    }
  }
}
```

- [ ] **Step 3: Registrar controller no módulo**

```ts
// in-app-campaigns.module.ts: adicionar em `controllers`
controllers: [InAppCampaignsUserController],
```

- [ ] **Step 4: Build + commit**

```bash
npm run build
git add src/modules/in-app-campaigns/controllers/in-app-campaigns-user.controller.ts src/modules/in-app-campaigns/in-app-campaigns.module.ts
git commit -m "feat(in-app-campaigns): add user-facing controller with pending and events endpoints"
```

---

## Task 18: Admin controller (CRUD + duplicate + report + export)

**Files:**
- Create: `chatfunnel-services/src/modules/in-app-campaigns/controllers/in-app-campaigns-admin.controller.ts`
- Create: `chatfunnel-services/src/modules/in-app-campaigns/dto/list-campaigns-query.dto.ts`

- [ ] **Step 1: ListCampaignsQueryDto**

```ts
// src/modules/in-app-campaigns/dto/list-campaigns-query.dto.ts
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CampaignStatus } from '../types';

export class ListCampaignsQueryDto {
  @IsOptional() @IsEnum(CampaignStatus) status?: CampaignStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) take?: number = 50;
}
```

- [ ] **Step 2: Admin controller**

```ts
// src/modules/in-app-campaigns/controllers/in-app-campaigns-admin.controller.ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CampaignService } from '../services/campaign.service';
import { ReportService } from '../services/report.service';
import { InAppCampaignRepository } from '../repositories/in-app-campaign.repository';
import { CreateCampaignDto } from '../dto/create-campaign.dto';
import { UpdateCampaignDto } from '../dto/update-campaign.dto';
import { PatchStatusDto } from '../dto/patch-status.dto';
import { ListCampaignsQueryDto } from '../dto/list-campaigns-query.dto';
// TODO: substituir pelo guard de admin/moderator real do projeto
// import { ModeratorAuthGuard } from '../../../guards/moderator_auth.guard';
// import { CurrentAdmin } from '../../auth/decorators/current-admin.decorator';

interface AdminUser { id: string }

@Controller('admin/in-app-campaigns')
// @UseGuards(ModeratorAuthGuard)
export class InAppCampaignsAdminController {
  constructor(
    private readonly campaigns: CampaignService,
    private readonly report: ReportService,
    private readonly repo: InAppCampaignRepository,
  ) {}

  @Get()
  async list(@Query() q: ListCampaignsQueryDto) {
    const where: any = { isDeleted: false };
    if (q.status) where.status = q.status;
    return this.repo.list(where, q.skip, q.take);
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return this.repo.findById(id);
  }

  @Post()
  async create(@Body() dto: CreateCampaignDto, /* @CurrentAdmin() admin: AdminUser */ admin: AdminUser) {
    return this.campaigns.create(dto, admin.id);
  }

  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCampaignDto) {
    return this.campaigns.update(id, dto);
  }

  @Patch(':id/status')
  async updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PatchStatusDto) {
    return this.campaigns.updateStatus(id, dto.status);
  }

  @Post(':id/duplicate')
  async duplicate(@Param('id', ParseUUIDPipe) id: string, /* @CurrentAdmin() admin: AdminUser */ admin: AdminUser) {
    return this.campaigns.duplicate(id, admin.id);
  }

  @Get(':id/report')
  async report(@Param('id', ParseUUIDPipe) id: string) {
    return this.report.overview(id);
  }

  @Get(':id/export')
  async export(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    // CSV stream — implementação mínima; pode migrar pra job assíncrono em v1.1
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="campaign_${id}.csv"`);
    // TODO: implementar CSV stream usando response_values joined com user_states
    // Placeholder: 501 até a implementação completa da export routine
    res.status(501).send('export not implemented yet');
  }
}
```

- [ ] **Step 3: Registrar admin controller no módulo**

- [ ] **Step 4: Build + commit**

```bash
npm run build
git add src/modules/in-app-campaigns/controllers/in-app-campaigns-admin.controller.ts src/modules/in-app-campaigns/dto/list-campaigns-query.dto.ts src/modules/in-app-campaigns/in-app-campaigns.module.ts
git commit -m "feat(in-app-campaigns): add admin controller with CRUD, status, duplicate, report endpoints (export stub)"
```

---

## Task 19: Resolver guards e decorators reais do projeto

> Esta task **depende de leitura do código existente**. O engenheiro precisa investigar qual guard/decorator já está em uso no `chatfunnel-services` e plugá-los nos controllers.

**Files:**
- Modify: `in-app-campaigns-user.controller.ts` (substituir `TODO` pelo guard real)
- Modify: `in-app-campaigns-admin.controller.ts` (idem)

- [ ] **Step 1: Localizar o guard de usuário logado**

```bash
grep -rn "UseGuards\|JwtAuthGuard\|AuthGuard" src/guards src/modules/auth 2>/dev/null | head -20
grep -rn "CurrentUser\|@User()" src/ 2>/dev/null | head -20
```

Anotar: caminho do guard, import path do decorator, shape do objeto user retornado (confirmar que traz `id`, `accountId`, `accountPlan`, `role` — se não trouxer `accountPlan`, ver como obter; pode ser via `accountService.findById(accountId)` dentro do controller).

- [ ] **Step 2: Localizar o guard de admin / moderator**

```bash
grep -rn "moderator_auth\|AdminGuard\|SuperAdmin" src/ 2>/dev/null | head -20
```

Usar o existente (ex: `ModeratorAuthGuard`) nos endpoints `/admin/*`.

- [ ] **Step 3: Plugar os guards e decorators**

Descomentar/imports nos dois controllers, remover os `TODO` comments, remover `RequestUser` / `AdminUser` locais e usar o tipo do projeto.

- [ ] **Step 4: Build + commit**

```bash
npm run build
git add src/modules/in-app-campaigns/controllers/*.ts
git commit -m "feat(in-app-campaigns): wire auth guards and current-user decorators"
```

---

## Task 20: Exception filter — mapear erros customizados para HTTP

Se `chatfunnel-services` já tem um `DomainError` filter, os `BadRequestException`, `ConflictException`, `NotFoundException` usados no código já se mapeiam 400/409/404 automaticamente pelo NestJS. Neste caso, esta task é **no-op** e pode ser pulada.

Se NÃO existir filter global adequado, adicionar um filter simples para `AnswersError` / `FormSchemaError` / `InvariantError` → `BadRequestException`. No código já convertemos tudo pra `BadRequestException` dentro dos services, então filter não é necessário.

- [ ] **Step 1: Rodar a suite completa pra garantir que erros viram respostas HTTP corretas**

```bash
npm test
```

Expected: todos os specs PASS.

---

## Task 21: E2E — fluxo completo

**Files:**
- Create: `chatfunnel-services/test/in-app-campaigns.e2e-spec.ts`

- [ ] **Step 1: Descobrir o pattern de e2e existente**

```bash
ls chatfunnel-services/test
cat chatfunnel-services/test/jest-e2e.json 2>/dev/null | head -20
```

Reutilizar o boot do app (`AppModule`) + supertest. Se `test/` estiver vazio, esta task cria o primeiro e2e — e nesse caso: `npm run test:e2e` precisa apontar para o config esperado.

- [ ] **Step 2: Escrever e2e (com DB isolado — test DB, não dev)**

```ts
// chatfunnel-services/test/in-app-campaigns.e2e-spec.ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma/prisma.service';

describe('In-app Campaigns (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.inAppCampaignResponseValue.deleteMany();
    await prisma.inAppCampaignUserState.deleteMany();
    await prisma.inAppCampaign.deleteMany();
    await app.close();
  });

  it('full loop: create → activate → pending → shown → submit', async () => {
    // 1. Criar campanha como admin (bypass guard via mock ou token de dev)
    const create = await request(app.getHttpServer())
      .post('/admin/in-app-campaigns')
      .set('Authorization', 'Bearer <ADMIN_TOKEN>') // substituir conforme setup real
      .send({
        title: 'NPS Test',
        formSchema: { fields: [{ key: 'score', type: 'rating', label: 'Nota', required: true, validation: { min: 0, max: 10 } }] },
        frequencyMode: 'showOnce',
        resolutionMode: 'dismiss_or_complete',
        targeting: { mode: 'all' },
      });
    expect(create.status).toBe(201);
    const id = create.body.id;

    // 2. Ativar
    const activate = await request(app.getHttpServer())
      .patch(`/admin/in-app-campaigns/${id}/status`)
      .set('Authorization', 'Bearer <ADMIN_TOKEN>')
      .send({ status: 'active' });
    expect(activate.status).toBe(200);

    // 3. /pending como user
    const pending = await request(app.getHttpServer())
      .get('/in-app-campaigns/pending')
      .set('Authorization', 'Bearer <USER_TOKEN>');
    expect(pending.status).toBe(200);
    expect(pending.body.campaigns.map((c: any) => c.id)).toContain(id);

    // 4. shown
    await request(app.getHttpServer())
      .post(`/in-app-campaigns/${id}/events`)
      .set('Authorization', 'Bearer <USER_TOKEN>')
      .send({ type: 'shown' })
      .expect(204);

    // 5. submitted
    await request(app.getHttpServer())
      .post(`/in-app-campaigns/${id}/events`)
      .set('Authorization', 'Bearer <USER_TOKEN>')
      .send({ type: 'submitted', answers: { score: 9 } })
      .expect(204);

    // 6. submit idempotente → 409
    await request(app.getHttpServer())
      .post(`/in-app-campaigns/${id}/events`)
      .set('Authorization', 'Bearer <USER_TOKEN>')
      .send({ type: 'submitted', answers: { score: 8 } })
      .expect(409);

    // 7. /pending não deve trazer mais (showOnce + já shown)
    const pending2 = await request(app.getHttpServer())
      .get('/in-app-campaigns/pending')
      .set('Authorization', 'Bearer <USER_TOKEN>');
    expect(pending2.body.campaigns.map((c: any) => c.id)).not.toContain(id);

    // 8. Report
    const report = await request(app.getHttpServer())
      .get(`/admin/in-app-campaigns/${id}/report`)
      .set('Authorization', 'Bearer <ADMIN_TOKEN>');
    expect(report.body.completedTotal).toBe(1);
    expect(report.body.submissionsTotal).toBe(1);
  });
});
```

> **Observação**: substituir `<ADMIN_TOKEN>` / `<USER_TOKEN>` conforme o setup existente de e2e do projeto. Se não houver setup de autenticação para testes, seguir o padrão de mock/stub de guard usado em outros e2e do `chatfunnel-services`. Se o projeto não tiver e2e ainda, documentar no PR que esta é a primeira suite e deixar configuração mínima.

- [ ] **Step 3: Rodar e2e**

```bash
npm run test:e2e
```

Expected: PASS (se auth está mockada/real-disponível) ou skip documentado.

- [ ] **Step 4: Commit**

```bash
git add test/in-app-campaigns.e2e-spec.ts
git commit -m "test(in-app-campaigns): add e2e covering full loop create/activate/pending/shown/submit/report"
```

---

## Task 22: Seed de desenvolvimento (campanha "hello world")

**Files:**
- Create: `chatfunnel-core/prisma/seeds/in-app-campaigns.seed.ts` (ou similar conforme o padrão de seed do projeto)

- [ ] **Step 1: Investigar padrão de seed existente**

```bash
ls chatfunnel-core/prisma/seeds 2>/dev/null
find chatfunnel-core -name "seed*" -type f 2>/dev/null | head -5
```

- [ ] **Step 2: Escrever seed**

```ts
// exemplo — adaptar ao pattern do projeto
import { PrismaClient } from '@prisma/client';

export async function seedInAppCampaigns(prisma: PrismaClient, adminId: string) {
  const existing = await prisma.inAppCampaign.findFirst({ where: { title: 'Hello Campaign' } });
  if (existing) return;
  await prisma.inAppCampaign.create({
    data: {
      title: 'Hello Campaign',
      description: 'Sua primeira campanha de teste',
      formSchema: {
        fields: [
          { key: 'name', type: 'text', label: 'Seu nome', required: true },
          { key: 'nps', type: 'rating', label: 'Nota de 0 a 10', required: true, validation: { min: 0, max: 10 } },
        ],
      },
      frequencyMode: 'showOnce',
      resolutionMode: 'dismiss_or_complete',
      status: 'active',
      targetMode: 'all',
      targetPlans: [],
      targetOrgIds: [],
      targetUserRoles: [],
      createdBy: adminId,
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add chatfunnel-core/prisma/seeds/in-app-campaigns.seed.ts
git commit -m "feat(in-app-campaigns): add seed with hello campaign for dev environment"
```

---

## Task 23: Smoke test manual (HTTP real)

- [ ] **Step 1: Subir o services local**

```bash
cd D:/Code/4-Vinicius/Chatfunnel/chatfunnel-services
npm run start:dev
```

- [ ] **Step 2: Criar campanha via curl/Postman**

```bash
curl -X POST http://localhost:3200/admin/in-app-campaigns \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Smoke",
    "formSchema": { "fields": [{ "key": "q", "type": "text", "label": "Pergunta", "required": true }] },
    "frequencyMode": "showOnce",
    "resolutionMode": "dismiss_or_complete",
    "targeting": { "mode": "all" }
  }'
```

Ativar:

```bash
curl -X PATCH http://localhost:3200/admin/in-app-campaigns/<ID>/status \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"status":"active"}'
```

Pegar pending como user:

```bash
curl http://localhost:3200/in-app-campaigns/pending \
  -H "Authorization: Bearer <USER_TOKEN>"
```

Expected: array com a campanha criada.

- [ ] **Step 2: Postar shown / submitted**

```bash
curl -X POST http://localhost:3200/in-app-campaigns/<ID>/events \
  -H "Authorization: Bearer <USER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"type":"shown"}'

curl -X POST http://localhost:3200/in-app-campaigns/<ID>/events \
  -H "Authorization: Bearer <USER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"type":"submitted","answers":{"q":"resposta 1"}}'
```

Verificar no banco:

```sql
SELECT * FROM in_app_campaign_user_states WHERE campaign_id = '<ID>';
SELECT * FROM in_app_campaign_response_values WHERE campaign_id = '<ID>';
```

- [ ] **Step 3: Documentar resultado**

Registrar no PR os comandos testados e outputs.

---

## Task 24: Abrir Pull Request

- [ ] **Step 1: Push da branch e abrir PR**

```bash
git push -u origin feature/in-app-campaigns-backend
gh pr create --title "feat(in-app-campaigns): backend module (DB + NestJS)" --body "$(cat <<'EOF'
## Summary
- 3 novas tabelas: in_app_campaigns, in_app_campaign_user_states, in_app_campaign_response_values
- Módulo NestJS in-app-campaigns em chatfunnel-services com 5 services, 2 controllers, DTOs tipados
- Cobertura de testes unitários + e2e do fluxo completo

## Test plan
- [ ] npm test (unit)
- [ ] npm run test:e2e
- [ ] Smoke manual (Task 23)
EOF
)"
```

---

## Spec coverage self-review

Mapeando cada seção do spec §4-17 para tasks deste plano:

| Spec | Task |
|---|---|
| §4.1 MVP: motor, form builder, campanhas, runtime, relatórios | T3-T18 cobrem backend; runtime+UI ficam para Plans 2/3 |
| §5 UX resolution/frequency | T7 (invariants), T12 (delivery enforcement) |
| §6 Domain model | T2 (types), T9 (repos) |
| §7 Schema | T3 (Prisma + migration) |
| §8 Invariants | T7, T10, T13 |
| §9 Eligibility | T11 |
| §10 API contracts | T17, T18 |
| §11 Arquitetura backend | T4, T9, T17, T18, T19 |
| §13 Reports | T15, T18 (endpoint) |
| §14 Imutabilidade | T10 (assertCosmeticFormChange) |
| §15 Riscos (complete_only bloqueio) | T18 status endpoint permite pausar sem login do usuário afetado |
| §17 Decisões abertas | Rate limit, audit log, gráfico lib — todos deferidos (Plans 2/3 ou v1.1) |

Gaps identificados e resolvidos inline:
- **Export CSV stub** (Task 18) — deixado como 501 no MVP; export real é decisão em aberto da spec §17 e pode ser fechado em follow-up.
- **Alerta `shown>10 && completed==0 após 10min`** (spec §15) — NÃO incluído no plano MVP; deveria ir num tópico v1.1 ou como monitoring via ferramenta externa. Documentar no PR.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-17-in-app-campaigns-plan-01-backend.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — dispatches a fresh subagent per task; I review between tasks; fast iteration; ideal para plano com 24 tasks.

**2. Inline Execution** — executa tasks nessa sessão mesmo com checkpoints.

**Which approach?**
