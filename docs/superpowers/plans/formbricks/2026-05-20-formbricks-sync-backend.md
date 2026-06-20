# Formbricks Survey Sync — Backend Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Receber webhook do Formbricks (`responseFinished`), persistir `userId + surveyId` no PostgreSQL, e expor endpoint autenticado para o frontend consultar quais surveys o usuário já respondeu.

**Architecture:** Novo módulo `FormbricksModule` no chatfunnel-services com dois endpoints: webhook público (recebe do Formbricks) e query autenticada (retorna surveys respondidas por userId do JWT).

**Tech Stack:** NestJS 10, Prisma, PostgreSQL, class-validator

---

## Contexto Técnico

### Payload do webhook Formbricks (`responseFinished`)

```json
{
  "event": "responseFinished",
  "webhookId": "wh-xxx",
  "data": {
    "id": "resp-abc123",
    "surveyId": "survey-xyz789",
    "finished": true,
    "data": {
      "userIdCf": "user-abc123",
      "email": "user@example.com",
      "organizationId": "org-def456"
    }
  }
}
```

O `userIdCf` vem dos `hiddenFields` enviados pelo frontend via `formbricks.track("page_view", { hiddenFields })`.

### Endpoints

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `POST` | `/nest/formbricks/webhook` | `@Public()` | Recebe webhook do Formbricks |
| `GET` | `/nest/formbricks/answered-surveys` | JWT | Retorna `string[]` de surveyIds respondidos |

---

## File Structure

### Criar

| Arquivo | Responsabilidade |
|---------|-----------------|
| `chatfunnel-services/src/modules/formbricks/formbricks.module.ts` | NestJS module |
| `chatfunnel-services/src/modules/formbricks/controllers/formbricks.controller.ts` | Webhook + query endpoints |
| `chatfunnel-services/src/modules/formbricks/services/formbricks.service.ts` | Lógica de persistência |

### Modificar

| Arquivo | Mudança |
|---------|---------|
| `chatfunnel-core/prisma/schema.prisma` | Novo model `FormbricksSurveyAnswer` |
| `chatfunnel-services/src/app.module.ts` | Registrar `FormbricksModule` |

---

## Task 1: Database — Model FormbricksSurveyAnswer

**Files:**
- Modify: `chatfunnel-core/prisma/schema.prisma`

- [ ] **Step 1: Adicionar model ao schema Prisma**

No final do arquivo `chatfunnel-core/prisma/schema.prisma`, adicionar:

```prisma
model FormbricksSurveyAnswer {
  id         String   @id @default(cuid())
  userId     String
  surveyId   String
  responseId String?
  answeredAt DateTime @default(now())
  isDeleted  Boolean  @default(false)

  @@unique([userId, surveyId])
  @@index([userId])
  @@map("formbricks_survey_answers")
}
```

> **Nota:** Este model é user-level (não tenant-level), por isso não tem `accountId`. O controle de surveys respondidas é por usuário da plataforma, independente de qual conta está selecionada.

- [ ] **Step 2: Criar migration (--create-only)**

```bash
cd chatfunnel-core
npx prisma migrate dev --name add_formbricks_survey_answers --create-only
```

**NÃO rodar `prisma migrate deploy`** — apenas criar o arquivo SQL para review.

- [ ] **Step 3: Verificar SQL gerado**

Abrir o arquivo em `chatfunnel-core/prisma/migrations/XXXXXXXX_add_formbricks_survey_answers/migration.sql` e confirmar que contém:

```sql
CREATE TABLE "formbricks_survey_answers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "responseId" TEXT,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "formbricks_survey_answers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "formbricks_survey_answers_userId_surveyId_key" ON "formbricks_survey_answers"("userId", "surveyId");
CREATE INDEX "formbricks_survey_answers_userId_idx" ON "formbricks_survey_answers"("userId");
```

- [ ] **Step 4: Rebuild chatfunnel-core**

```bash
cd chatfunnel-core
npm run build
```

- [ ] **Step 5: Commit**

```bash
cd chatfunnel-core
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add FormbricksSurveyAnswer model for survey response tracking"
```

---

## Task 2: Módulo Formbricks (chatfunnel-services)

**Files:**
- Create: `chatfunnel-services/src/modules/formbricks/formbricks.module.ts`
- Create: `chatfunnel-services/src/modules/formbricks/controllers/formbricks.controller.ts`
- Create: `chatfunnel-services/src/modules/formbricks/services/formbricks.service.ts`
- Modify: `chatfunnel-services/src/app.module.ts`

- [ ] **Step 1: Criar service**

Criar `chatfunnel-services/src/modules/formbricks/services/formbricks.service.ts`:

```typescript
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";

@Injectable()
export class FormbricksService {
  private readonly logger = new Logger(FormbricksService.name);

  constructor(private readonly prisma: PrismaService) {}

  async saveAnswer(userId: string, surveyId: string, responseId?: string) {
    const existing = await this.prisma.formbricksSurveyAnswer.findUnique({
      where: { userId_surveyId: { userId, surveyId } },
    });

    if (existing) {
      this.logger.log(`Survey ${surveyId} already answered by user ${userId}`);
      return existing;
    }

    const answer = await this.prisma.formbricksSurveyAnswer.create({
      data: { userId, surveyId, responseId },
    });

    this.logger.log(`Saved survey answer: user=${userId} survey=${surveyId}`);
    return answer;
  }

  async getAnsweredSurveyIds(userId: string): Promise<string[]> {
    const answers = await this.prisma.formbricksSurveyAnswer.findMany({
      where: { userId, isDeleted: false },
      select: { surveyId: true },
    });

    return answers.map((a) => a.surveyId);
  }
}
```

> **Nota:** Verificar o import path do `PrismaService` — pode ser `../../../database/prisma.service` ou outro path dependendo dos aliases do projeto. Consultar outro module existente para confirmar.

- [ ] **Step 2: Criar controller**

Criar `chatfunnel-services/src/modules/formbricks/controllers/formbricks.controller.ts`:

```typescript
import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Logger,
  HttpCode,
} from "@nestjs/common";
import { Public } from "../../../public.decorator";
import { FormbricksService } from "../services/formbricks.service";

@Controller("formbricks")
export class FormbricksController {
  private readonly logger = new Logger(FormbricksController.name);

  constructor(private readonly formbricksService: FormbricksService) {}

  /**
   * Webhook chamado pelo Formbricks quando uma survey é respondida.
   * Rota pública — não requer autenticação.
   * POST /nest/formbricks/webhook
   */
  @Post("webhook")
  @Public()
  @HttpCode(200)
  async handleWebhook(@Body() body: any) {
    if (body.event !== "responseFinished") {
      this.logger.log(`Ignoring event: ${body.event}`);
      return { ok: true };
    }

    const surveyId = body.data?.surveyId;
    const responseId = body.data?.id;
    const userIdCf = body.data?.data?.userIdCf;

    if (!surveyId || !userIdCf) {
      this.logger.warn(
        `Webhook missing required fields: surveyId=${surveyId}, userIdCf=${userIdCf}`
      );
      return { ok: false, reason: "missing surveyId or userIdCf" };
    }

    await this.formbricksService.saveAnswer(userIdCf, surveyId, responseId);
    return { ok: true };
  }

  /**
   * Retorna IDs das surveys respondidas pelo usuário autenticado.
   * GET /nest/formbricks/answered-surveys
   */
  @Get("answered-surveys")
  async getAnsweredSurveys(@Req() req: any) {
    const userId = req.user?.userId;
    if (!userId) {
      return [];
    }

    return this.formbricksService.getAnsweredSurveyIds(userId);
  }
}
```

- [ ] **Step 3: Criar module**

Criar `chatfunnel-services/src/modules/formbricks/formbricks.module.ts`:

```typescript
import { Module } from "@nestjs/common";
import { FormbricksController } from "./controllers/formbricks.controller";
import { FormbricksService } from "./services/formbricks.service";
import { DatabaseModule } from "../../database/database.module";

@Module({
  imports: [DatabaseModule],
  controllers: [FormbricksController],
  providers: [FormbricksService],
})
export class FormbricksModule {}
```

> **Nota:** Verificar se o `DatabaseModule` (que exporta `PrismaService`) usa esse nome exato. Consultar outro module que importa Prisma para confirmar.

- [ ] **Step 4: Registrar module no app.module.ts**

Abrir `chatfunnel-services/src/app.module.ts` e adicionar:

```typescript
import { FormbricksModule } from "./modules/formbricks/formbricks.module";
```

E incluir `FormbricksModule` no array de `imports` do `@Module({})`.

- [ ] **Step 5: Verificar build**

```bash
cd chatfunnel-services
npm run build
```

- [ ] **Step 6: Testar webhook com curl**

Com o server rodando (`npm run dev`):

```bash
curl -X POST http://localhost:3200/nest/formbricks/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "responseFinished",
    "webhookId": "test",
    "data": {
      "id": "resp-test-123",
      "surveyId": "survey-test-123",
      "finished": true,
      "data": {
        "userIdCf": "user-test-123",
        "email": "test@example.com"
      }
    }
  }'
```

Expected: `{"ok":true}`

Verificar no banco: `SELECT * FROM formbricks_survey_answers;` deve ter 1 registro.

- [ ] **Step 7: Testar query com curl**

```bash
curl -X GET http://localhost:3200/nest/formbricks/answered-surveys \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

Expected: `["survey-test-123"]`

- [ ] **Step 8: Commit**

```bash
cd chatfunnel-services
git add src/modules/formbricks/ src/app.module.ts
git commit -m "feat: add formbricks module — webhook + answered-surveys endpoint"
```

---

## Task 3: Configurar Webhook no Formbricks Dashboard

- [ ] **Step 1: Acessar o dashboard do Formbricks**

Acessar `https://forms.chatfunnel.com.br` → Settings → Integrations → Webhooks

- [ ] **Step 2: Adicionar webhook**

Configurar:
- **URL**: `https://<API_URL>/nest/formbricks/webhook`
  - Dev: `https://dev.chatfunnel.com.br/nest/formbricks/webhook`
  - Production: `https://<prod-url>/nest/formbricks/webhook`
- **Triggers**: selecionar `responseFinished`
- **Surveys**: todas (ou selecionar as específicas)

- [ ] **Step 3: Testar webhook isolado**

1. Responder uma survey no Formbricks
2. Verificar logs do backend: webhook recebido e salvo
3. Consultar banco: `SELECT * FROM formbricks_survey_answers;`
