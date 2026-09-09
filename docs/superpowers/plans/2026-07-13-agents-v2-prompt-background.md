# Agents V2 — Geração de prompt em background (creation mode BASIC) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a geração do prompt do modo BASIC assíncrona — o usuário salva, volta pra listagem, e o card mostra "Construindo/Atualizando" enquanto um worker gera o prompt em background e avisa o front por websocket.

**Architecture:** No `create`/`update` (BASIC) o `agents-v2.service` persiste o agente com `promptStatus = BUILDING` e enfileira um job BullMQ; retorna na hora. Um `@Processor` no próprio `chatfunnel-services` consome o job, chama `PromptBuildService.buildPrompt`, grava `systemPrompt` + `promptStatus = READY` (ou `FAILED`) e emite um evento websocket via `global.signalR`. O front (`AgentsList`) assina o evento e atualiza o card in-place; `AgentCard` renderiza os estados e desabilita o card em BUILDING.

**Tech Stack:** NestJS 10 + `@nestjs/bullmq` + BullMQ (services), Prisma (core), Vue 3 + Socket.IO client (front).

## Global Constraints

- **Migrations:** só `prisma migrate dev --create-only` no `chatfunnel-core`; NUNCA `db push`/`migrate deploy`. Aplicação da migration e build/sync do `@chatfunnel/core` são **manuais, feitos pelo usuário** (não editar `node_modules/@chatfunnel/core`).
- **Multi-tenancy:** todo acesso a agente passa `accountId`.
- **Services:** double quotes + semicolons (Prettier); logging via winston `Logger` do Nest, nunca `console.log`; DTOs com `class-validator`; rotas literais antes de `:id`; prefixo global `/nest`.
- **Front:** Tailwind tokens + design system existente; strings user-facing em pt-BR acentuado; ícones `@phosphor-icons/vue`; sem `try/catch` local em chamadas Axios (interceptor global trata erro).
- **Enum novo:** `AgentPromptStatusEnum { BUILDING READY FAILED }`, default `READY` (protege linhas legadas e ADVANCED).
- **Nomes canônicos** (usados entre tasks):
  - Fila BullMQ: `"agent-prompt-queue"` — module dedicado em `modules/queues/` (padrão do projeto: `ResumeAssistantQueueModule`).
  - Producer: `AgentQueueService.scheduleBuildPrompt({ agentId, accountId })` — estende `BaseQueueService`, cujo `addJob` fixa `jobId = name = agentId`. No BullMQ, um `add` com `jobId` já existente é **ignorado** (não substitui o job anterior) — inclusive quando o job está retido em completed/failed pelo `removeOnComplete:100`/`removeOnFail:50` do `forRoot`. Por isso o producer faz `cancelJob(agentId)` antes de enfileirar, senão save→rebuild vira no-op. Não há job-name separado.
  - Job data: `AgentPromptJobData = { agentId: string; accountId: string }`.
  - Evento websocket: emitido pela classe **`AgentSocket`** (`@chatfunnel/core/sockets`, padrão `KanbanSocket`/`ChatSocket`) — `new AgentSocket(global.signalR, accountId).promptStatus(agentId, status, error?)`. Na prática o `BaseSocket.emitSocket` gera `emit("broadcast", { to: accountId, payload: { type: "prompt-status", payload: { agentId, status, error } } })` — note o payload **aninhado** (`{ type, payload }`), como todo evento que passa pelo dispatcher central. `status ∈ "BUILDING" | "READY" | "FAILED"`. **`to` é o `accountId`** (não canal estático) — é assim que o `chatfunnel-websocket` roteia (`io.sockets.emit(data.to, data.payload)`) e como o front escuta: um único `signalR.socket.on(accountId)` no `App.vue` faz `switch (evt.type)` e reemite `evt.payload` pro `eventBus`. Escopo por conta sai de graça (o `agentId` não vaza pra outras contas).

---

## Ordem de execução

Tasks 1–2 são no `chatfunnel-core` e têm **passos manuais do usuário** (migration + build do core) — o worker não roda sem isso. Tasks 3–6 no `chatfunnel-services`. Tasks 7–9 no `chatfunnel-front` (Task 9 tem um ajuste de backend acoplado). Task 10 é verificação manual. Front pode começar em paralelo assim que o contrato do evento (Global Constraints) estiver fixado, mas os testes ponta-a-ponta dependem do backend.

---

### Task 1: Schema — enum + coluna `promptStatus` (chatfunnel-core)

**Files:**
- Modify: `chatfunnel-core/prisma/schema.prisma` (enum `AgentCreationModeEnum` ~linha 3051; model `Agents` campo após `hasAudioResponse` ~linha 3086)

**Interfaces:**
- Produces: enum `AgentPromptStatusEnum` e campo `Agents.promptStatus: AgentPromptStatusEnum @default(READY)` — consumidos pelas Tasks 2–6.

- [x] **Step 1: Adicionar o enum** logo abaixo de `AgentCreationModeEnum`:

```prisma
enum AgentPromptStatusEnum {
  BUILDING
  READY
  FAILED
}
```

- [x] **Step 2: Adicionar o campo** no model `Agents`, imediatamente após a linha `hasAudioResponse     Boolean                 @default(false)`:

```prisma
  promptStatus         AgentPromptStatusEnum   @default(READY)
```

---

### Task 2: Tipo `AgentListItem` inclui `promptStatus` (chatfunnel-core)

O `findMany` usa `select` explícito, então o campo precisa ser exposto no tipo de retorno da listagem.

**Files:**
- Modify: tipo `AgentListItem` em `chatfunnel-core` (arquivo em `src/repositories/…` que define `AgentListItem`; procurar `export type AgentListItem` / `export interface AgentListItem`)

**Interfaces:**
- Consumes: enum `AgentPromptStatusEnum` (Task 1).
- Produces: `AgentListItem.promptStatus: AgentPromptStatusEnum` — consumido pela Task 4 (select) e Task 8 (front tipo).

- [x] **Step 1: Localizar a definição**

Run:
```bash
grep -rn "AgentListItem" chatfunnel-core/src
```
Expected: encontra o `export`/`type` de `AgentListItem`.

- [x] **Step 2: Adicionar o campo** ao tipo (mesmo estilo dos campos existentes como `creationMode`), ex.:

```typescript
  promptStatus: AgentPromptStatusEnum;
```
Garantir o import do enum a partir do client Prisma no topo do arquivo, seguindo como `AgentCreationModeEnum` já é importado ali.

- [ ] **Step 3: Build/sync do core — comando do usuário**

Run (fluxo manual padrão do usuário para publicar o `@chatfunnel/core`).
Expected: `chatfunnel-services` passa a enxergar `AgentListItem.promptStatus` sem editar `node_modules`.

---

### Task 3: Fila BullMQ — module dedicado + producer service (chatfunnel-services)

Segue o padrão de fila do projeto (`src/modules/queues/`): um **module dedicado** que registra a fila + producer service, um **producer service** que estende `BaseQueueService`, e (na Task 5) o **processor** em `queues/processors/`. Referência viva: `ResumeAssistantQueueModule` + `AssistantQueueService` + `assistant.processor.ts`. O service é nomeado pelo **domínio** (`AgentQueueService`, como `AssistantQueueService`) — não pelo job; queue/module/processor mantêm o nome do job (`agent-prompt-queue`), igual ao par `resume-assistant-queue`/`AssistantQueueService`.

**Files:**
- Create: `chatfunnel-services/src/modules/queues/services/agent_queue.service.ts` — service por **domínio** do agente (igual `assistant_queue.service.ts`), não por job; `scheduleBuildPrompt` é o 1º método
- Create: `chatfunnel-services/src/modules/queues/modules/agent_prompt_queue.module.ts`
- Modify: `chatfunnel-services/src/modules/agents-v2/agents-v2.module.ts` (importar `AgentPromptQueueModule`)
- Confirm: `chatfunnel-services/src/app.module.ts` (`BullModule.forRoot` já existe — não duplicar)

**Interfaces:**
- Produces: `AgentQueueService.scheduleBuildPrompt({ agentId, accountId }): Promise<Job>` (dedup por `jobId=agentId` via `BaseQueueService.addJob`) e tipo `AgentPromptJobData` — consumidos por Task 4 (producer no service) e Task 5 (processor + registro no module).

- [ ] **Step 1: Criar o producer service** (mesmo formato de `AssistantQueueService`, que faz `this.addJob(blacklistId, { … }, { delay })`)

`chatfunnel-services/src/modules/queues/services/agent_queue.service.ts`:
```typescript
import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue, Job } from "bullmq";
import { BaseQueueService } from "./base_queue_.service";

export interface AgentPromptJobData {
  agentId: string;
  accountId: string;
}

@Injectable()
export class AgentQueueService extends BaseQueueService {
  constructor(@InjectQueue("agent-prompt-queue") queue: Queue) {
    super(queue);
  }

  /**
   * Enfileira a geração de prompt em background (modo BASIC).
   *
   * `addJob` (BaseQueueService) fixa `jobId = agentId`. No BullMQ, adicionar
   * um job com `jobId` que ainda existe — waiting/delayed/active OU retido em
   * completed/failed pelo `removeOnComplete:100`/`removeOnFail:50` do `forRoot`
   * global — é IGNORADO (não substitui o anterior). Como save→rebuild reusa o
   * mesmo `agentId`, removemos o job anterior antes de enfileirar; sem isso o
   * rebuild após a 1ª build vira no-op. `cancelJob` já engole erro/ausência.
   *
   * ponytail: se houver uma build ATIVA no momento, `job.remove()` falha e o
   * novo add é ignorado — o formData recém-salvo só entra na próxima build.
   * Janela ~1-3s; aceitável. Trocar por `removeOnComplete:true` na fila se virar problema.
   */
  async scheduleBuildPrompt(data: AgentPromptJobData): Promise<Job> {
    await this.cancelJob(data.agentId);
    return this.addJob(data.agentId, data);
  }
}
```

- [ ] **Step 2: Criar o queue module** (mesmo formato de `ResumeAssistantQueueModule`)

`chatfunnel-services/src/modules/queues/modules/agent_prompt_queue.module.ts`:
```typescript
import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { AgentQueueService } from "../services/agent_queue.service";

@Module({
  imports: [
    BullModule.registerQueue({
      name: "agent-prompt-queue",
      // retry só; removeOnComplete/removeOnFail herdam o forRoot global (100/50)
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      },
    }),
  ],
  providers: [AgentQueueService],
  exports: [AgentQueueService],
})
export class AgentPromptQueueModule {}
```
> `attempts`/`backoff` são necessários: o processor (Task 5) usa `job.opts.attempts` para marcar `FAILED` só na última tentativa. O **processor e suas deps são adicionados a este module na Task 5** — aqui ele registra só a fila + producer, mantendo o build verde.

- [ ] **Step 3: Importar o queue module no `agents-v2.module.ts`**
```typescript
import { AgentPromptQueueModule } from "../queues/modules/agent_prompt_queue.module";
```
```typescript
  imports: [ConfigModule, AgentPromptQueueModule],
```

- [ ] **Step 4: Confirmar infra global do Bull**

Run:
```bash
grep -n "BullModule.forRoot" chatfunnel-services/src/app.module.ts
```
Expected: já existe (`connection: { url: process.env.REDIS_URL }`, `defaultJobOptions: { removeOnComplete: 100, removeOnFail: 50 }`). Se não existir, adicionar antes de prosseguir.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: compila (o processor é adicionado na Task 5).

---

### Task 4: `create`/`update` — set status + enfileirar (chatfunnel-services)

> **Nota:** o `findMany` que a listagem usa mora no **core** (`chatfunnel-core/src/repositories/agents_v2.repository.ts`), não no wrapper de 11 linhas do services (que só faz `extends Base`). Esse `select` **já expõe** `promptStatus: true` no fonte do core e no core instalado no services — logo a Task 4 é **services-only**, sem edição de repositório.

**Files:**
- Modify: `chatfunnel-services/src/modules/agents-v2/agents-v2.service.ts`
- Test: `chatfunnel-services/src/modules/agents-v2/agents-v2.service.spec.ts`

**Interfaces:**
- Consumes: `AgentQueueService.scheduleBuildPrompt` (Task 3); `AgentPromptStatusEnum` de `@chatfunnel/core/database` (Task 1, já sincronizado no core).
- Produces: `create`/`update` do `AgentsV2Service` com efeito colateral de enfileiramento para BASIC; helper privado `enqueuePromptBuild(agentId, accountId)` (reusado pela Task 9).

- [ ] **Step 1: Escrever o teste que falha**

Em `agents-v2.service.spec.ts`, montar o service com repo e fila mockados. Testes:
```typescript
import { Test } from "@nestjs/testing";
import {
  AgentCreationModeEnum,
  AgentPromptStatusEnum,
} from "@chatfunnel/core/database";
import { AgentsV2Service } from "./agents-v2.service";
import { AgentsV2Repository } from "src/database/repositories/agents_v2.repository";
import { WhatsappTemplatesRepository } from "src/database/repositories/whatsapp_templates.repository";
import { AgentQueueService } from "../queues/services/agent_queue.service";

describe("AgentsV2Service background prompt", () => {
  const queueService = { scheduleBuildPrompt: jest.fn() };
  const repo = {
    createWithRelations: jest.fn(async (d) => ({ id: "a1", ...d })),
    updateWithRelations: jest.fn(async () => ({ id: "a1" })),
    findById: jest.fn(async () => ({
      id: "a1",
      enabledTools: [],
      providerType: "OPENAI",
      model: "gpt",
      creationMode: AgentCreationModeEnum.BASIC,
    })),
  };
  let service: AgentsV2Service;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AgentsV2Service,
        { provide: AgentsV2Repository, useValue: repo },
        { provide: WhatsappTemplatesRepository, useValue: { findByMetaId: jest.fn() } },
        { provide: AgentQueueService, useValue: queueService },
      ],
    }).compile();
    service = moduleRef.get(AgentsV2Service);
  });

  it("BASIC create → promptStatus BUILDING + enqueue", async () => {
    await service.create("acc1", { creationMode: AgentCreationModeEnum.BASIC, providerType: "OPENAI", model: "gpt" } as any);
    const passed = repo.createWithRelations.mock.calls[0][0];
    expect(passed.promptStatus).toBe(AgentPromptStatusEnum.BUILDING);
    expect(queueService.scheduleBuildPrompt).toHaveBeenCalledWith({
      agentId: "a1",
      accountId: "acc1",
    });
  });

  it("ADVANCED create → promptStatus READY + no enqueue", async () => {
    await service.create("acc1", { creationMode: AgentCreationModeEnum.ADVANCED, systemPrompt: "x", providerType: "OPENAI", model: "gpt" } as any);
    const passed = repo.createWithRelations.mock.calls[0][0];
    expect(passed.promptStatus).toBe(AgentPromptStatusEnum.READY);
    expect(queueService.scheduleBuildPrompt).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar o teste (deve falhar)**

Run: `npm test -- agents-v2.service`
Expected: FAIL — service ainda não injeta a fila nem seta `promptStatus`.

- [ ] **Step 3: Injetar a fila e aplicar a lógica no service**

Topo do `agents-v2.service.ts`. `AgentCreationModeEnum` já é importado de `@chatfunnel/core/database` — adicionar `AgentPromptStatusEnum` na **mesma** linha (mesma fonte, padrão do arquivo p/ enums), e o producer:
```typescript
import {
  AgentCreationModeEnum,
  AgentPromptStatusEnum,
} from "@chatfunnel/core/database";
import { AgentQueueService } from "../queues/services/agent_queue.service";
```

Construtor (adicionar param — injeta o producer, não a `Queue` direto):
```typescript
  constructor(
    private readonly agentsV2Repository: AgentsV2Repository,
    private readonly whatsappTemplatesRepository: WhatsappTemplatesRepository,
    private readonly agentPromptQueue: AgentQueueService,
  ) {}
```
> `AgentQueueService` é injetável aqui porque `agents-v2.module.ts` importa `AgentPromptQueueModule` (Task 3), que o exporta.

Helper privado no fim da classe:
```typescript
  private async enqueuePromptBuild(agentId: string, accountId: string): Promise<void> {
    await this.agentPromptQueue.scheduleBuildPrompt({ agentId, accountId });
  }
```
No `create`, substituir as duas últimas linhas (`const data = …; return …`) por:
```typescript
    const isBasic = dto.creationMode === AgentCreationModeEnum.BASIC;

    await this.resolveCalendarReminderTemplateIds(dto, accountId);
    const data = buildAgentCreateInput(dto, accountId);
    data.promptStatus = isBasic
      ? AgentPromptStatusEnum.BUILDING
      : AgentPromptStatusEnum.READY;

    const agent = await this.agentsV2Repository.createWithRelations(data);
    if (isBasic) await this.enqueuePromptBuild(agent.id, accountId);
    return agent;
```
No `update`, substituir o bloco final (`const data = …; const enabledTools = …; return …`) por (o modo é imutável, usa `existing.creationMode`):
```typescript
    await this.resolveCalendarReminderTemplateIds(dto, accountId);
    const data = buildAgentUpdateInput(dto);
    const isBasic = existing.creationMode === AgentCreationModeEnum.BASIC;
    if (isBasic) data.promptStatus = AgentPromptStatusEnum.BUILDING;

    const enabledTools = dto.enabledTools ?? existing.enabledTools ?? [];
    const agent = await this.agentsV2Repository.updateWithRelations(id, data, enabledTools);
    if (isBasic) await this.enqueuePromptBuild(id, accountId);
    return agent;
```

- [ ] **Step 4: Rodar os testes (devem passar)**

Run: `npm test -- agents-v2.service`
Expected: PASS (2 testes).

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: compila.

---

### Task 5: Processor BullMQ — gera prompt, persiste, emite websocket (chatfunnel-services)

**Files:**
- Create: `chatfunnel-services/src/modules/queues/processors/agent_prompt.processor.ts`
- Modify: `chatfunnel-services/src/modules/queues/modules/agent_prompt_queue.module.ts` (registrar o processor + suas deps em `providers`)
- Test: `chatfunnel-services/src/modules/queues/processors/agent_prompt.processor.spec.ts`

> **Ordem:** faça a Task 6 (remoção do `rebuildPrompt` do `prompt-build.service.ts` e da dep `agentsV2Service` do construtor) **antes** deste Step 4. Enquanto `PromptBuildService` depender de `AgentsV2Service`, registrar o processor no `AgentPromptQueueModule` cria ciclo de módulos (queue → PromptBuildService → AgentsV2Service → AgentQueueService → queue). Sem essa dep, o `PromptBuildService` só precisa de `AccountsRepository` + `LlmUsageLogsRepository` (repos planos), e o queue module provê tudo sem importar o `AgentsV2Module` — igual ao `ResumeAssistantQueueModule`.

**Interfaces:**
- Consumes: fila `"agent-prompt-queue"`, `AgentPromptJobData` (Task 3); `PromptBuildService.buildPrompt(formData, accountId, agentId, "rebuild") → { prompt, metadata }`; `AgentsV2Repository.findById(id, accountId)`, `.update(id, data)`; `AgentPromptStatusEnum` (Task 1).
- Produces: efeito de gravar `systemPrompt` + `promptStatus` e emitir `broadcast`.

Referência viva do padrão: `src/modules/queues/processors/assistant.processor.ts` (mesmo `@Processor` + `WorkerHost`).

- [ ] **Step 1: Escrever o teste que falha**

`agent_prompt.processor.spec.ts`:
```typescript
import { AgentPromptStatusEnum } from "@chatfunnel/core/database";
import { AgentPromptProcessor } from "./agent_prompt.processor";

describe("AgentPromptProcessor", () => {
  const repo = {
    findById: jest.fn(),
    update: jest.fn(async () => ({})),
  };
  const promptBuild = { buildPrompt: jest.fn() };
  let proc: AgentPromptProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).signalR = { emit: jest.fn() };
    proc = new AgentPromptProcessor(repo as any, promptBuild as any);
  });

  const job = (data: any) => ({ data, attemptsMade: 0, opts: {} }) as any;

  it("READY on success: persists prompt + emits", async () => {
    repo.findById.mockResolvedValue({ id: "a1", formData: { role: "x" } });
    promptBuild.buildPrompt.mockResolvedValue({ prompt: "PROMPT", metadata: {} });

    await proc.process(job({ agentId: "a1", accountId: "acc1" }));

    expect(repo.update).toHaveBeenCalledWith("a1", {
      systemPrompt: "PROMPT",
      promptStatus: AgentPromptStatusEnum.READY,
    });
    expect((global as any).signalR.emit).toHaveBeenCalledWith("broadcast", {
      to: "agents-v2",
      payload: { type: "prompt-status", agentId: "a1", status: "READY" },
    });
  });

  it("agent gone: no update, no throw", async () => {
    repo.findById.mockResolvedValue(null);
    await expect(proc.process(job({ agentId: "a1", accountId: "acc1" }))).resolves.toBeUndefined();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("LLM throws on last attempt: marks FAILED, emits, rethrows", async () => {
    repo.findById.mockResolvedValue({ id: "a1", formData: {} });
    promptBuild.buildPrompt.mockRejectedValue(new Error("llm down"));

    await expect(proc.process(job({ agentId: "a1", accountId: "acc1" }))).rejects.toThrow("llm down");
    expect(repo.update).toHaveBeenCalledWith("a1", { promptStatus: AgentPromptStatusEnum.FAILED });
    expect((global as any).signalR.emit).toHaveBeenCalledWith("broadcast", {
      to: "agents-v2",
      payload: { type: "prompt-status", agentId: "a1", status: "FAILED" },
    });
  });
});
```

- [ ] **Step 2: Rodar o teste (deve falhar)**

Run: `npm test -- agent_prompt.processor`
Expected: FAIL — arquivo do processor não existe.

- [ ] **Step 3: Implementar o processor**

`agent_prompt.processor.ts`:
```typescript
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { AgentPromptStatusEnum } from "@chatfunnel/core/database";
import { AgentsV2Repository } from "src/database/repositories/agents_v2.repository";
import { PromptBuildService } from "../../agents-v2/prompt-build.service";
import { BuildPromptDto } from "../../agents-v2/dto/build-prompt.dto";
import { AgentPromptJobData } from "../services/agent_queue.service";

/**
 * Consome jobs de geração de prompt em background (modo BASIC).
 * Sucesso → grava systemPrompt + READY; falha → FAILED (na última tentativa).
 * Em ambos os casos emite `broadcast`/agents-v2 para o front atualizar o card.
 */
@Processor("agent-prompt-queue")
@Injectable()
export class AgentPromptProcessor extends WorkerHost {
  private readonly logger = new Logger(AgentPromptProcessor.name);

  constructor(
    private readonly agentsV2Repository: AgentsV2Repository,
    private readonly promptBuildService: PromptBuildService,
  ) {
    super();
  }

  async process(job: Job<AgentPromptJobData>): Promise<void> {
    const { agentId, accountId } = job.data;
    this.logger.log(
      `[AgentPrompt] build start agent=${agentId} attempt=${job.attemptsMade + 1}`,
    );

    const agent = await this.agentsV2Repository.findById(agentId, accountId);
    if (!agent) {
      // Agente removido antes do job rodar — nada a fazer.
      this.logger.warn(`[AgentPrompt] agent gone, skipping agent=${agentId}`);
      return;
    }

    try {
      const { prompt } = await this.promptBuildService.buildPrompt(
        (agent.formData ?? {}) as BuildPromptDto,
        accountId,
        agentId,
        "rebuild",
      );

      await this.agentsV2Repository.update(agentId, {
        systemPrompt: prompt,
        promptStatus: AgentPromptStatusEnum.READY,
      });
      this.emitStatus(agentId, "READY");
      this.logger.log(`[AgentPrompt] build done agent=${agentId}`);
    } catch (err) {
      const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isLastAttempt) {
        await this.agentsV2Repository.update(agentId, {
          promptStatus: AgentPromptStatusEnum.FAILED,
        });
        this.emitStatus(agentId, "FAILED");
      }
      this.logger.error(
        `[AgentPrompt] build error agent=${agentId}: ${(err as Error).message}`,
      );
      throw err; // deixa o BullMQ fazer retry/backoff
    }
  }

  private emitStatus(agentId: string, status: "READY" | "FAILED"): void {
    // Falha de websocket NÃO pode quebrar/retentar o build — só loga.
    // Mesmo padrão de update_chat_moderators/handler.ts.
    try {
      (global as any).signalR?.emit("broadcast", {
        to: "agents-v2",
        payload: { type: "prompt-status", agentId, status },
      });
    } catch (err) {
      this.logger.warn(
        `[AgentPrompt] websocket emit failed agent=${agentId}: ${(err as Error).message}`,
      );
    }
  }
}
```

- [ ] **Step 4: Registrar o processor no `AgentPromptQueueModule`**

Em `agent_prompt_queue.module.ts`, adicionar o processor e suas deps aos `providers` (o queue module declara os providers que o processor precisa, como faz o `ResumeAssistantQueueModule` com seus repos — sem importar `AgentsV2Module`, evitando ciclo):
```typescript
import { AgentPromptProcessor } from "../processors/agent_prompt.processor";
import { PromptBuildService } from "../../agents-v2/prompt-build.service";
import { AgentsV2Repository } from "src/database/repositories/agents_v2.repository";
import { AccountsRepository } from "src/database/repositories/accounts.repository";
import { LlmUsageLogsRepository } from "src/database/repositories/llm_usage_logs.repository";
import { PrismaService } from "src/database/prisma/prisma.service";
```
```typescript
  providers: [
    AgentQueueService,
    AgentPromptProcessor,
    PromptBuildService,
    AgentsV2Repository,
    AccountsRepository,
    LlmUsageLogsRepository,
    PrismaService,
  ],
```
> Depende da Task 6 já ter removido a dep `agentsV2Service` do `PromptBuildService` (ver nota de ordem acima). Se `npm run build` acusar dep faltando ao instanciar `PromptBuildService`, é sinal de que ainda há dep transitiva de `AgentsV2Service` — resolver na Task 6 antes.

- [ ] **Step 5: Rodar os testes (devem passar)**

Run: `npm test -- agent_prompt.processor`
Expected: PASS (3 testes).

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: compila.

---

### Task 6: Rebuild manual + remover geração síncrona por SSE + quebrar ciclo (chatfunnel-services)

**Files:**
- Modify: `chatfunnel-services/src/modules/agents-v2/agents-v2.service.ts` (novo `enqueueRebuild`)
- Modify: `chatfunnel-services/src/modules/agents-v2/agents-v2.controller.ts` (trocar corpo de `rebuildPrompt` + tirar o `@Body`; remover `buildPromptStream`, `rebuildPromptStream`, `streamToSse`)
- Modify: `chatfunnel-services/src/modules/agents-v2/prompt-build.service.ts` (remover `rebuildPrompt`, a dep `agentsV2Service` e o generator `buildPromptStream` + helpers de stream órfãos)
- Modify: `chatfunnel-services/src/modules/queues/modules/agent_prompt_queue.module.ts` (enxugar providers agora que a dep `agentsV2Service` some)

**Interfaces:**
- Consumes: `enqueuePromptBuild` (Task 4), `AgentPromptStatusEnum` (Task 1).
- Produces: `AgentsV2Service.enqueueRebuild(id, accountId): Promise<void>`; `POST /agents-v2/:id/rebuild-prompt` agora responde `202 { status: "BUILDING" }` e reenfileira (consumido pelo front na Task 9).

> **Sem auto-retry.** Já decidido e implementado: Task 3 usa `attempts: 1` e a Task 5 marca `FAILED` na hora + manda `error` no websocket. Aqui só entra o **retry manual**: card FAILED → usuário clica "Tentar novamente" → rota reenfileira. Nada de BullMQ retentando sozinho.

- [ ] **Step 1: Adicionar `enqueueRebuild` no service** (após o `update`):
```typescript
  /**
   * Reenfileira a geração de prompt para um agente existente (retry / rebuild).
   * Valida ownership (404 se não for da conta), volta a BUILDING e enfileira.
   */
  async enqueueRebuild(id: string, accountId: string): Promise<void> {
    await this.findOne(id, accountId);
    await this.agentsV2Repository.update(id, {
      promptStatus: AgentPromptStatusEnum.BUILDING,
    });
    await this.enqueuePromptBuild(id, accountId);
  }
```

- [ ] **Step 2: Trocar o corpo do `rebuildPrompt` do controller** (manter a rota e a validação de header) para reenfileirar em vez de gerar inline:
```typescript
    await this.agentsV2Service.enqueueRebuild(id, accountId);
    return res.status(HttpStatus.ACCEPTED).json({ status: "BUILDING" });
```
Remover a chamada a `this.promptBuildService.rebuildPrompt(...)`, o param `@Body() dto: RebuildPromptDto` (retry manual não usa body — o processor relê `formData`) e o import de `RebuildPromptDto` (fica órfão após remover também o `rebuildPromptStream` no Step 3).

- [ ] **Step 3: Remover as duas rotas SSE do controller** — apagar os métodos `buildPromptStream` e `rebuildPromptStream` inteiros, e o helper privado `streamToSse`. Manter `buildPrompt` (POST `build-prompt`).

- [ ] **Step 4: Remover o generator `buildPromptStream`** de `prompt-build.service.ts` e, se ficarem órfãos, `callAnthropicStream`/`callOpenAIStream`. Manter `buildPrompt` (usado pelo processor) e `estimateOpenAiMaxTokens` (ainda usado pelo `callOpenAI` não-stream). O método `rebuildPrompt` do service de prompt pode ser removido se não houver mais consumidor após o Step 2 — conferir no Step 6. **Ao remover `rebuildPrompt`, remover também a dependência `agentsV2Service` do construtor** (e seu import) — ela só é usada ali (linhas ~152/168). Isso desfaz o ciclo de módulos.

- [ ] **Step 5: Enxugar os providers do `agent_prompt_queue.module.ts`** — a Task 5 foi implementada com a dep ainda presente, então o module provê a cadeia inteira do `AgentsV2Service`. Sem a dep, o `PromptBuildService` precisa só de `AccountsRepository` + `LlmUsageLogsRepository`. Remover `AgentsV2Service` + `WhatsappTemplatesRepository` (e seus imports), deixando:
```typescript
  providers: [
    AgentQueueService,
    AgentPromptProcessor,
    PromptBuildService,
    AgentsV2Repository,
    AccountsRepository,
    LlmUsageLogsRepository,
  ],
```
Remover também o comentário `// ponytail:` que explicava a lista gorda.

- [ ] **Step 6: Verificar referências órfãs**

Run:
```bash
grep -rn "streamToSse\|buildPromptStream\|rebuildPromptStream\|rebuild-prompt-stream\|build-prompt-stream\|promptBuildService.rebuildPrompt\|RebuildPromptDto" chatfunnel-services/src
```
Expected: só a definição do `RebuildPromptDto` (o arquivo do DTO em si); nenhum uso restante. Se aparecer uso, tratar antes de seguir.

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: compila.

---

### Task 7: Front — remover streaming do form; salvar e voltar (chatfunnel-front)

**Files:**
- Modify: `chatfunnel-front/src/common/composables/AlertsComposable.js` (adicionar `showToastInfo` — hoje não existe)
- Modify: `chatfunnel-front/src/views/agents/AgentsForm/index.vue` (`handleSave` + remover `startStream`/`handleGoToPrompt`/`handleRebuild`/`handlePromptConfirm` e refs `isStreaming`/`showPromptModal`/`generatedPrompt` + o `watch` + o modal comentado do template)
- Modify: `chatfunnel-front/src/common/services/AgentsV2Service.js` (remover `buildPromptStream`/`rebuildPromptStream`; `rebuildPrompt` já existe)

**Interfaces:**
- Consumes: `AgentsV2Service.createAgentV2(data)`, `updateAgentV2(id, data)` (já existem); `useAlerts().showToastInfo` (novo).
- Produces: `handleSave` que persiste e navega pra listagem sem espera; toast **informativo** (não sucesso) "Criando agente"/"Atualizando agente".

> **Por que info, não sucesso:** ao salvar, o agente (modo BASIC) fica `BUILDING` — o prompt é gerado em background. "Agente criado com sucesso" seria mentira nesse instante. O toast é só um aviso de que foi enfileirado; o estado real (Pronto/Falhou) aparece no card via websocket (Task 8/9). Sem `showToastPromise` (que força um `success`).

- [ ] **Step 0: Adicionar `showToastInfo` na `AlertsComposable.js`** — hoje só existem success/error/warning. Espelhar os outros wrappers (usa `toast.info` do `vue-sonner`, já importado) e exportá-lo no return + adicionar no typedef `AlertsApi`:
```javascript
  /**
   * Exibe toast informativo (azul com ícone de info)
   * @param {string} message
   * @returns {void}
   * @example showToastInfo("Criando agente")
   */
  const showToastInfo = (message) =>
    toast.info(message, {
      duration: 5000,
    });
```

- [ ] **Step 1: Simplificar `handleSave`** — dobra o `handlePromptConfirm` pra dentro dele (some a indireção), salva direto e navega. Manter as validações inline que já existem no arquivo; trocar o `showToastPromise` por `showToastInfo`. `buildApiPayload` recebe o prompt (para ADVANCED = `values.systemPrompt`; em BASIC o backend regenera em background, então o valor é indiferente):

```typescript
const handleSave = async () => {
  if (!values.name) return showToastError('Nome do agente é obrigatório')
  if (!values.model) return showToastError('Modelo é obrigatório')
  if (toolsStepRef.value?.hasUnconfiguredTools) {
    currentStep.value = toolsStepIndex.value; markStepError(toolsStepIndex.value)
    return showToastError('Todas as ferramentas adicionadas precisam estar configuradas')
  }
  if (values.duration !== null && values.duration !== undefined &&
      (!Number.isInteger(values.duration) || values.duration < 1)) {
    return showToastError('Duração deve ser um inteiro maior ou igual a 1')
  }

  isLoading.value = true
  try {
    const payload = buildApiPayload(values.systemPrompt)
    if (isEditMode.value) {
      await AgentsV2Service.updateAgentV2(props.id!, payload)
      showToastInfo('Atualizando agente')
    } else {
      await AgentsV2Service.createAgentV2(payload)
      showToastInfo('Criando agente')
    }
    router.push({ name: 'AgentsList' })
  } finally {
    isLoading.value = false
  }
}
```
> Sem `try/catch` de erro local (interceptor global trata). O `finally` só desliga o `isLoading`. Atualizar o destructure `const { ... } = useAlerts()` para incluir `showToastInfo` e remover `showToastPromise` se ficar sem uso.

- [ ] **Step 2: Remover `startStream`, `handlePromptConfirm` e o modal de confirmação de prompt** e seus refs (`generatedPrompt`, `showPromptModal`/similares) do `<script setup>` e do `<template>`.

- [ ] **Step 3: Remover os métodos de stream do `AgentsV2Service.js`** (`buildPromptStream`, `rebuildPromptStream`). Manter `rebuildPrompt(id, formData)`.

- [ ] **Step 4: Conferir referências órfãs**

Run:
```bash
grep -rn "buildPromptStream\|rebuildPromptStream\|showPromptModal\|generatedPrompt\|startStream" chatfunnel-front/src
```
Expected: sem resultados (fora de comentários).

- [ ] **Step 5: Build/typecheck**

Run: `npm run build`
Expected: compila.

---

### Task 8: Front — estados do card (BUILDING/READY/FAILED) (chatfunnel-front)

**Files:**
- Modify: `chatfunnel-front/src/views/agents/AgentsList/components/AgentCard/AgentCard.vue`
- Modify: `chatfunnel-front/src/i18n/ptbr/…` (se o card usar `t(...)`; senão texto literal pt-BR)

**Interfaces:**
- Consumes: `agent.promptStatus: "BUILDING" | "READY" | "FAILED"`; flag transiente `agent.__wasReady` (setado na Task 9).
- Produces: card desabilitado em BUILDING; emit `rebuild` (`emit("rebuild", agent.id)`) no botão "Tentar novamente".

- [ ] **Step 1: Adicionar campos à interface `Agent`** do card:
```typescript
  promptStatus?: 'BUILDING' | 'READY' | 'FAILED';
  __wasReady?: boolean;
```

- [ ] **Step 2: Computeds + handler** no `<script setup>`:
```typescript
const isBuilding = computed(() => props.agent.promptStatus === 'BUILDING');
const isFailed = computed(() => props.agent.promptStatus === 'FAILED');
const buildingLabel = computed(() =>
  props.agent.__wasReady ? 'Atualizando…' : 'Construindo…',
);
const handleRetry = () => emit('rebuild', props.agent.id);
```
> `__wasReady` marca transição READY→BUILDING (edição na sessão). Em load novo (F5) fica ausente → "Construindo…" — degradação aceitável (o agente está de fato sendo construído).

- [ ] **Step 3: Declarar o emit `rebuild`** junto aos emits existentes (`edit`, `menu`, `view-attendances`, `avatar-change`, `share`, `delete`).

- [ ] **Step 4: Renderizar os estados no template.** Na raiz do `Card`, desabilitar interação só em BUILDING; e trocar a área de ação:
```vue
<Card
  size="345px"
  class="relative items-center gap-8 px-8 py-6"
  :class="{ 'pointer-events-none opacity-60': isBuilding }"
>
```
Na área de ações (onde hoje fica o botão "Editar"):
```vue
<div v-if="isBuilding" class="flex items-center gap-2 text-gray-700 text-sm">
  <CircleNotch class="h-4 w-4 animate-spin" />
  {{ buildingLabel }}
</div>
<div v-else-if="isFailed" class="flex items-center gap-2">
  <span class="text-red-600 text-sm">Falha ao gerar o prompt</span>
  <Button size="small" variant="default" tone="primary" @click="handleRetry">
    Tentar novamente
  </Button>
</div>
<template v-else>
  <!-- botões normais existentes (Editar etc.) -->
</template>
```
Importar `CircleNotch` de `@phosphor-icons/vue`. Como o estado FAILED é `v-else-if` (não BUILDING), o `pointer-events-none` não o afeta — o botão de retry fica clicável.

- [ ] **Step 5: Build/typecheck**

Run: `npm run build`
Expected: compila.

---

### Task 9: Front — assinar `prompt-status` via eventBus, atualizar card in-place, retry (chatfunnel-front)

> **Arquitetura de socket (corrigida na revisão).** O front NÃO abre listener de socket por view. Existe um único `signalR.socket.on(accountId, evt => switch(evt.type))` no `App.vue` que reemite cada evento pro `eventBus` (`@/common/utils/event-bus.js`); as views consomem via `eventBus.on(type, handler)` (ex.: `channel-status`, `followup-updated`). No backend, cada domínio emite por uma **classe de socket do core** (`KanbanSocket`, `ChatSocket`) — para o agente criamos **`AgentSocket`** (`@chatfunnel/core/sockets/agent.socket.ts`). Por isso: (a) o backend emite via `new AgentSocket(global.signalR, accountId).promptStatus(...)` → `to: accountId` + shape aninhado (Step 1); (b) o `App.vue` ganha um `case "prompt-status"`; (c) o `AgentsList` só faz `eventBus.on/off`. O `import socket` + `socket.on` da versão anterior estava errado (o `socket.js` exporta uma **classe**, não a instância).

**Files:**
- Create: `chatfunnel-core/src/sockets/agent.socket.ts` — `AgentSocket extends BaseSocket`, método `promptStatus(agentId, status, error?)` (feito). Export em `sockets/index.ts` (feito). **Requer rebuild+sync manual do core** (fluxo do usuário) antes do services enxergar `AgentSocket`.
- Modify: `chatfunnel-services/src/modules/queues/processors/agent_prompt.processor.ts` (`emitStatus` passa a usar `AgentSocket`; ganha o param `accountId` do `job.data`)
- Modify: `chatfunnel-front/src/App.vue` (novo `case "prompt-status"` no `switch (evt.type)` do listener central)
- Modify: `chatfunnel-front/src/views/agents/AgentsList/index.vue`

**Interfaces:**
- Consumes: `AgentSocket.promptStatus` (core); `eventBus.on("prompt-status", cb)` / `eventBus.off(...)` de `@/common/utils/event-bus.js`; o handler recebe `evt.payload` = `{ agentId, status, error }` (o dado interno; `App.vue` já desembrulha `evt.type`/`evt.payload`); `AgentsV2Service.rebuildPrompt(id, {})`; emit `rebuild` do `AgentCard` (Task 8).
- Produces: `agents.value` atualizado in-place; handler `handleRebuildAgent`.

- [ ] **Step 1: Backend — emitir via `AgentSocket`** no `agent_prompt.processor.ts`. Trocar o `global.signalR.emit(...)` cru por `new AgentSocket(global.signalR, accountId).promptStatus(agentId, status, error)`; `emitStatus` ganha o param `accountId` (vem do `job.data`). Manter o `try/catch` que só loga (falha de socket não pode quebrar o build). Importar `AgentSocket` de `@chatfunnel/core/sockets`. Rodar `npm run build` no services **após** o rebuild+sync do core.
```typescript
import { AgentSocket } from "@chatfunnel/core/sockets";
// ...
private emitStatus(
  agentId: string,
  accountId: string,
  status: "READY" | "FAILED",
  error?: string,
): void {
  try {
    new AgentSocket(global.signalR, accountId).promptStatus(agentId, status, error);
  } catch (err) {
    this.logger.warn(
      `[AgentPrompt] websocket emit failed agent=${agentId}: ${(err as Error).message}`,
    );
  }
}
```
> As chamadas no `process` passam a `this.emitStatus(agentId, accountId, "READY")` / `this.emitStatus(agentId, accountId, "FAILED", message)`.

- [ ] **Step 2: `App.vue` — rotear pro eventBus.** No `switch (evt.type)` do listener `signalR.socket.on(accountId, ...)`, junto de `channel-status`/`followup-updated`:
```javascript
      case "prompt-status":
        eventBus.emit("prompt-status", evt.payload);
        break;
```

- [ ] **Step 3: `AgentsList` — handler + subscribe/unsubscribe.** Importar `eventBus` e `onUnmounted` (o `onMounted` já é importado):
```typescript
import { eventBus } from '@/common/utils/event-bus.js'

function onPromptStatus(payload: any) {
  const i = agents.value.findIndex((a: any) => a.id === payload?.agentId)
  if (i === -1) return // agente não está na lista atual → ignora
  const prev = agents.value[i]
  agents.value[i] = {
    ...prev,
    promptStatus: payload.status,
    __wasReady:
      payload.status === 'BUILDING'
        ? prev.promptStatus === 'READY' || prev.__wasReady
        : prev.__wasReady
  }
}

onMounted(() => eventBus.on('prompt-status', onPromptStatus))
onUnmounted(() => eventBus.off('prompt-status', onPromptStatus))
```
> Já existe um `onMounted(() => fetchAgents())` — juntar o `eventBus.on` nele ou adicionar um segundo `onMounted` (ambos rodam). O filtro `i === -1` já dá o escopo por lista; o `to: accountId` do backend garante o escopo por conta.

- [ ] **Step 4: Handler de retry** (otimista + reenfileira no back):
```typescript
async function handleRebuildAgent(id: string) {
  const i = agents.value.findIndex((a: any) => a.id === id)
  if (i !== -1) {
    agents.value[i] = { ...agents.value[i], promptStatus: 'BUILDING', __wasReady: true }
  }
  await AgentsV2Service.rebuildPrompt(id, {})
}
```

- [ ] **Step 5: Ligar o `@rebuild`** no `<AgentCard>` do template (junto dos outros `@edit`/`@delete`):
```vue
      @rebuild="handleRebuildAgent"
```

- [ ] **Step 6: Build/typecheck**

Run: `npm run build`
Expected: compila (services e front).

---

### Task 10: Verificação ponta-a-ponta (manual)

**Files:** nenhum (validação).

- [ ] **Step 1:** Subir services (`npm run start:dev`), websocket, e front (`npm run dev`) com Redis rodando.
- [ ] **Step 2:** Criar agente BASIC → retorno imediato para a listagem e card em "Construindo…" (desabilitado).
- [ ] **Step 3:** Aguardar o job → card vira READY sem refresh (websocket). Conferir no banco `promptStatus=READY` e `systemPrompt` preenchido.
- [ ] **Step 4:** Editar um agente BASIC → card "Atualizando…" e depois READY.
- [ ] **Step 5:** F5 durante o build → card continua "Construindo…" (status persistido).
- [ ] **Step 6:** Forçar falha (ex.: API key inválida) → após retries, card FAILED com "Tentar novamente"; clicar → volta a BUILDING → READY.
- [ ] **Step 7:** Criar agente ADVANCED → salva pronto (READY), sem loading.

---

## Notas de cobertura vs spec

- Escopo BASIC-only (ADVANCED READY): Tasks 4, 5, 10.
- Status persistido (`promptStatus`): Tasks 1, 2, 4.
- Falha → FAILED + retry: Tasks 5, 6, 8, 9.
- SSE removido: Tasks 6, 7.
- Worker no services: Tasks 3, 5.
- Card não-clicável em BUILDING: Task 8.
- Websocket account-scoped: o backend emite `to: accountId`, então o `chatfunnel-websocket` (`io.sockets.emit(data.to, payload)`) entrega só aos sockets que escutam aquele `accountId` — o mesmo listener central do `App.vue`. O `agentId` **não** vaza pra outras contas. O filtro client-side por "agente presente na minha lista" (Task 9) é só um segundo guard-rail dentro da conta.
```
