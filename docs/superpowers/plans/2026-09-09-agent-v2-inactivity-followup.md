# Agent V2 Inactivity Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Executar no Agente V2 a automação configurada em `lifecycleAutomations.inactivityFollowup.onNoReply` após o período configurado sem uma nova mensagem do contato.

**Architecture:** Reutilizar a fila já implantada `automationAssistantFollowUpQueue`, adicionando um payload discriminado `source: "AGENT_V2"` para preservar integralmente o comportamento legado. O V2 terá um coordenador Redis por sessão para rotacionar gerações do timer, um serviço pequeno para persistir/agendar/cancelar follow-ups e um ramo próprio no worker que valida conta, sessão e atendimento antes de despachar a automação pelo `systemActionsQueue`.

**Tech Stack:** TypeScript e JavaScript no `chatfunnel-api`, Redis, Prisma, scheduler HTTP/BullMQ existente, Jest; NestJS/TypeScript/Jest no `chatfunnel-services` apenas para remover o aviso de migração obsoleto.

**Spec:** `vault/wiki/features/automations.md`, seção “Delays e Follow-Ups”, complementada pelo comportamento legado em `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/fragments/HandlerAssistant.js:3157` e pelo contrato atual da UI em `chatfunnel-front/src/views/agents/AgentsForm/components/modals/AutomationsConfigDialog.vue:70`.

## Global Constraints

- Não criar outra fila no scheduler: usar `automationAssistantFollowUpQueue` para manter compatibilidade com `CancelFollowUp.js` e evitar rollout coordenado de infraestrutura.
- Não alterar schema Prisma nem gerar/aplicar migration; `ContactsFollowUpScheduled` já possui os campos necessários.
- Toda consulta nova deve ser isolada por `accountId`; modelos sem `accountId` direto devem ser filtrados por relações com `Contacts`, `Channels` ou `Agents`.
- Toda consulta nova a entidades com soft delete deve exigir `isDeleted: false`.
- O primeiro escopo suporta somente `onNoReply`, que é o comportamento exposto atualmente pela UI do Agente V2.
- `onReply` legado, alteração do editor Vue e refatoração geral do worker V1 ficam fora do escopo.
- O timer de follow-up é independente de `agent.duration/unit` e de `expireAgentQueue`; não aplicar o bloqueio por objetivos usado na expiração da sessão.
- Não executar `npm test` no `chatfunnel-api`, pois o script chama `pretest` e realiza build. O usuário executa `npm run build:processor` manualmente quando quiser atualizar `dist/`; depois os testes focados usam `rtk npx jest`.
- Não executar build, banco real, migration, commit ou push automaticamente.
- Não incluir o texto das mensagens ou payloads completos do contato nos novos logs.

---

## Current Behavior and Root Cause

O Assistant V1 chama `_createFollowupJob()` na primeira interação e em cada nova mensagem. O método cancela o job anterior, grava `ContactsFollowUpScheduled` e agenda `AutomationAssistantFollowUpQueue`. Quando o worker vence, ele verifica se o contato ainda está sendo atendido pelo mesmo assistant e despacha `onNoReply.automationId`.

O Agente V2 declara `inactivityFollowup` no tipo de `LifecycleAutomations`, mas `handleLifecycleAutomations()` aceita apenas eventos imediatos. O fluxo atual agenda somente `expireAgentQueue`, baseado em `agent.duration/unit`, e o comentário em `HandlerAgent.ts:2209` registra explicitamente que a fila atrasada do follow-up não foi implementada.

Não devemos copiar literalmente o legado porque ele:

- envia `assistant` e `automationContext` inteiros no job;
- consulta a última mensagem somente por `contactId`, sem `channelId`, `accountId` ou `isDeleted`;
- reutiliza um único `jobId`, deixando uma janela em que um job antigo já ativo pode continuar;
- atribui automações a `assistantId`, enquanto o V2 usa `agentId`;
- não produz logs estruturados suficientes para depuração do ciclo completo.

## Desired Runtime Sequence

```text
Mensagem inbound do contato
  -> HandlerAgent encontra/cria AgentSession
  -> AgentInactivityFollowupScheduler.schedule(...)
       -> gera jobId único para esta geração
       -> Redis troca atomicamente geração atual da sessão
       -> cancela/marca CANCELED a geração anterior
       -> cria ContactsFollowUpScheduled PENDING
       -> agenda automationAssistantFollowUpQueue
  -> processamento normal do agente continua

Job vence
  -> AutomationAssistantFollowUpWorker detecta source=AGENT_V2
  -> valida geração Redis ainda atual
  -> valida sessão + agente + contato + canal + servedByAssistantId
  -> reivindica atomicamente a geração Redis
  -> despacha onNoReply pelo systemActionsQueue com ranBy.agentId
  -> marca ContactsFollowUpScheduled como UNANSWER

Nova mensagem antes do vencimento
  -> nova geração substitui a anterior no Redis
  -> job anterior é cancelado e registro fica CANCELED

Sessão encerrada
  -> geração Redis é removida
  -> job pendente é cancelado e registro fica CANCELED
```

## File Structure

- Create `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/redis/AgentInactivityFollowupState.ts`: ponte Redis responsável somente por geração atual, troca atômica e compare-and-delete.
- Create `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/redis/AgentInactivityFollowupState.test.js`: testes unitários dos scripts Redis.
- Create `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/inactivity/AgentInactivityFollowupScheduler.ts`: conversão de duração e orquestração de Redis, Prisma e fila.
- Create `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/inactivity/AgentInactivityFollowupScheduler.test.js`: testes de agendamento, reagendamento, compensação e cancelamento.
- Modify `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/redis/index.ts`: exportar o novo estado Redis.
- Modify `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/HandlerAgent.ts`: integrar schedule/cancel ao ciclo da sessão.
- Create `chatfunnel-api/src/commands/workers/AutomationAssistantFollowUpWorker.test.js`: preservar V1 e cobrir o ramo V2.
- Modify `chatfunnel-api/src/commands/workers/AutomationAssistantFollowUpWorker.js`: separar handlers V1/V2 sem mudar a rota/fila.
- Modify `chatfunnel-services/src/modules/agents-v2/migration/helpers/assistant-to-agent-payload.ts`: parar de emitir o warning de funcionalidade não suportada.
- Modify `chatfunnel-services/src/modules/agents-v2/migration/helpers/assistant-to-agent-payload.spec.ts`: atualizar a expectativa da migração.
- Modify `vault/wiki/features/automations.md`: documentar o follow-up do Agente V2 e a proteção por geração.

---

### Task 1: Estado Redis da geração ativa

**Files:**
- Create: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/redis/AgentInactivityFollowupState.ts`
- Create: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/redis/AgentInactivityFollowupState.test.js`
- Modify: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/redis/index.ts:1`

**Interfaces:**
- Consumes: `redis.client.sendCommand()` de `@redisAPI`.
- Produces: `replace(sessionId, jobId, ttlSeconds)`, `isCurrent(sessionId, jobId)`, `claim(sessionId, jobId)` e `clear(sessionId)` no singleton `agentInactivityFollowupState`.

- [ ] **Step 1: Escrever os testes falhando para troca e reivindicação da geração**

Criar o teste usando o mesmo padrão dos outros primitivos Redis do V2:

```js
jest.mock("@redisAPI", () => ({
  client: {
    sendCommand: jest.fn(),
  },
}));

const redis = require("@redisAPI");
const {
  agentInactivityFollowupState,
} = require("@root/dist/processor/agents-v2/redis/AgentInactivityFollowupState");

beforeEach(() => jest.clearAllMocks());

describe("agentInactivityFollowupState", () => {
  it("atomically replaces the current job and returns the previous job id", async () => {
    redis.client.sendCommand.mockResolvedValue("old-job");

    await expect(
      agentInactivityFollowupState.replace("session-1", "new-job", 4200),
    ).resolves.toBe("old-job");

    expect(redis.client.sendCommand).toHaveBeenCalledWith([
      "SET",
      "agent:inactivity-followup:session-1",
      "new-job",
      "EX",
      "4200",
      "GET",
    ]);
  });

  it("reports whether a job is the current generation", async () => {
    redis.client.sendCommand.mockResolvedValue("job-2");
    await expect(
      agentInactivityFollowupState.isCurrent("session-1", "job-2"),
    ).resolves.toBe(true);
  });

  it("claims only the matching generation", async () => {
    redis.client.sendCommand.mockResolvedValue(1);
    await expect(
      agentInactivityFollowupState.claim("session-1", "job-2"),
    ).resolves.toBe(true);
  });

  it("clears and returns the current generation", async () => {
    redis.client.sendCommand.mockResolvedValue("job-2");
    await expect(
      agentInactivityFollowupState.clear("session-1"),
    ).resolves.toBe("job-2");
  });
});
```

- [ ] **Step 2: Validar a falha depois do build manual do processor**

Pré-requisito executado pelo usuário em `chatfunnel-api/`:

```powershell
npm run build:processor
```

Comando focado do agente:

```powershell
rtk npx jest src/commands/instagram/WebHookHandler/processor/agents-v2/redis/AgentInactivityFollowupState.test.js --runInBand
```

Expected: FAIL porque o módulo `AgentInactivityFollowupState` ainda não existe.

- [ ] **Step 3: Implementar a troca atômica e os scripts compare-and-delete**

Usar uma chave por sessão e TTL informado pelo agendador:

```ts
import redis = require("@redisAPI");

const PREFIX = "agent:inactivity-followup:";

const CLAIM_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  redis.call("DEL", KEYS[1])
  return 1
end
return 0
`;

const CLEAR_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if current then
  redis.call("DEL", KEYS[1])
end
return current
`;

class AgentInactivityFollowupState {
  private key(sessionId: string): string {
    return `${PREFIX}${sessionId}`;
  }

  async replace(
    sessionId: string,
    jobId: string,
    ttlSeconds: number,
  ): Promise<string | null> {
    return (await redis.client.sendCommand([
      "SET",
      this.key(sessionId),
      jobId,
      "EX",
      String(ttlSeconds),
      "GET",
    ])) as string | null;
  }

  async isCurrent(sessionId: string, jobId: string): Promise<boolean> {
    const current = await redis.client.sendCommand(["GET", this.key(sessionId)]);
    return current === jobId;
  }

  async claim(sessionId: string, jobId: string): Promise<boolean> {
    const result = await redis.client.sendCommand([
      "EVAL",
      CLAIM_SCRIPT,
      "1",
      this.key(sessionId),
      jobId,
    ]);
    return result === 1;
  }

  async clear(sessionId: string): Promise<string | null> {
    return (await redis.client.sendCommand([
      "EVAL",
      CLEAR_SCRIPT,
      "1",
      this.key(sessionId),
    ])) as string | null;
  }
}

export const agentInactivityFollowupState =
  new AgentInactivityFollowupState();
```

Exportar pelo barrel:

```ts
export { agentInactivityFollowupState } from "./AgentInactivityFollowupState";
```

- [ ] **Step 4: Rodar novamente o teste focado**

Após o usuário atualizar `dist/` manualmente:

```powershell
rtk npx jest src/commands/instagram/WebHookHandler/processor/agents-v2/redis/AgentInactivityFollowupState.test.js --runInBand
```

Expected: PASS nos quatro cenários.

- [ ] **Step 5: Revisar o checkpoint sem commit**

```powershell
rtk git diff --check
rtk git diff -- src/commands/instagram/WebHookHandler/processor/agents-v2/redis
```

Expected: nenhum erro de whitespace; não criar commit sem pedido explícito.

---

### Task 2: Agendador V2 isolado e testável

**Files:**
- Create: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/inactivity/AgentInactivityFollowupScheduler.ts`
- Create: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/inactivity/AgentInactivityFollowupScheduler.test.js`

**Interfaces:**
- Consumes: `agentInactivityFollowupState`, `prisma.contactsFollowUpScheduled`, `AutomationAssistantFollowUpQueue` e configuração `onNoReply`.
- Produces: `computeInactivityDelayMs(config)`, `schedule(input)` e `cancel(input)` no singleton `agentInactivityFollowupScheduler`.

- [ ] **Step 1: Escrever testes de conversão de duração**

Cobrir unidades aceitas e valores inválidos:

```js
describe("computeInactivityDelayMs", () => {
  it.each([
    [1, "SECONDS", 1_000],
    [2, "MINUTES", 120_000],
    [3, "HOURS", 10_800_000],
    [2, "DAYS", 172_800_000],
  ])("converts %s %s", (timeValue, timeUnit, expected) => {
    expect(computeInactivityDelayMs({ timeValue, timeUnit })).toBe(expected);
  });

  it.each([
    [{ timeValue: 0, timeUnit: "MINUTES" }],
    [{ timeValue: -1, timeUnit: "MINUTES" }],
    [{ timeValue: 1, timeUnit: "WEEKS" }],
  ])("rejects invalid config %#", (config) => {
    expect(computeInactivityDelayMs(config)).toBeNull();
  });
});
```

- [ ] **Step 2: Escrever testes de agendamento e reagendamento**

Injetar dependências no construtor para evitar Redis, scheduler ou banco reais:

```js
const state = {
  replace: jest.fn(),
  claim: jest.fn(),
  clear: jest.fn(),
};
const queue = {
  addJob: jest.fn(),
  cancelJob: jest.fn(),
};
const prisma = {
  contactsFollowUpScheduled: {
    create: jest.fn(),
    updateMany: jest.fn(),
  },
};
const logger = { info: jest.fn(), error: jest.fn() };

it("creates and queues a V2 job with a unique generation", async () => {
  state.replace.mockResolvedValue(null);
  queue.addJob.mockResolvedValue({ id: "queued" });

  await expect(scheduler.schedule(validInput)).resolves.toBe(true);

  expect(queue.addJob).toHaveBeenCalledWith(
    expect.stringMatching(/^agent-v2-inactivity-session-1-/),
    expect.objectContaining({
      source: "AGENT_V2",
      sessionId: "session-1",
      agentId: "agent-1",
      accountId: "account-1",
      automationId: "automation-1",
    }),
    600_000,
  );
});

it("cancels and marks the previous generation before scheduling the new one", async () => {
  state.replace.mockResolvedValue("old-job");
  queue.addJob.mockResolvedValue({ id: "queued" });

  await scheduler.schedule(validInput);

  expect(queue.cancelJob).toHaveBeenCalledWith("old-job");
  expect(prisma.contactsFollowUpScheduled.updateMany).toHaveBeenCalledWith({
    where: expect.objectContaining({
      jobId: "old-job",
      typeAnswer: "PENDING",
      contact: { accountId: "account-1", isDeleted: false },
      channel: { accountId: "account-1", isDeleted: false },
    }),
    data: expect.objectContaining({ typeAnswer: "CANCELED" }),
  });
});
```

- [ ] **Step 3: Escrever testes de compensação e cancelamento**

```js
it("cancels the persisted record when scheduler enqueue fails", async () => {
  state.replace.mockResolvedValue(null);
  state.claim.mockResolvedValue(true);
  queue.addJob.mockResolvedValue(null);

  await expect(scheduler.schedule(validInput)).resolves.toBe(false);

  expect(state.claim).toHaveBeenCalledWith(
    "session-1",
    expect.stringMatching(/^agent-v2-inactivity-session-1-/),
  );
  expect(prisma.contactsFollowUpScheduled.updateMany).toHaveBeenLastCalledWith({
    where: expect.objectContaining({ typeAnswer: "PENDING" }),
    data: expect.objectContaining({ typeAnswer: "CANCELED" }),
  });
});

it("clears, cancels and marks the current job on session termination", async () => {
  state.clear.mockResolvedValue("current-job");

  await scheduler.cancel({
    sessionId: "session-1",
    accountId: "account-1",
  });

  expect(queue.cancelJob).toHaveBeenCalledWith("current-job");
  expect(prisma.contactsFollowUpScheduled.updateMany).toHaveBeenCalledWith({
    where: expect.objectContaining({
      jobId: "current-job",
      typeAnswer: "PENDING",
      contact: { accountId: "account-1", isDeleted: false },
      channel: { accountId: "account-1", isDeleted: false },
    }),
    data: expect.objectContaining({ typeAnswer: "CANCELED" }),
  });
});
```

- [ ] **Step 4: Implementar contratos, conversão e payload mínimo**

Definir contratos explícitos:

```ts
export interface InactivityFollowupConfig {
  timeValue: number;
  timeUnit: string;
  onNoReply: { automationId: string | null };
}

export interface ScheduleAgentInactivityFollowupInput {
  sessionId: string;
  agentId: string;
  agentName: string;
  accountId: string;
  contactId: string;
  channelId: string;
  automationChain: string[];
  config: InactivityFollowupConfig;
}

export interface AgentV2InactivityFollowupJob {
  source: "AGENT_V2";
  jobId: string;
  scheduledAt: string;
  sessionId: string;
  agentId: string;
  agentName: string;
  accountId: string;
  contactId: string;
  channelId: string;
  automationId: string;
  automationChain: string[];
}
```

Implementar a conversão sem `moment`, porque duração relativa não depende de timezone:

```ts
export function computeInactivityDelayMs(
  config: Pick<InactivityFollowupConfig, "timeValue" | "timeUnit">,
): number | null {
  if (!Number.isFinite(config.timeValue) || config.timeValue <= 0) return null;

  const multiplier = {
    SECONDS: 1_000,
    MINUTES: 60_000,
    HOURS: 3_600_000,
    DAYS: 86_400_000,
  }[config.timeUnit.toUpperCase()];

  return multiplier ? config.timeValue * multiplier : null;
}
```

- [ ] **Step 5: Implementar `schedule()` com compensação best-effort**

O método deve:

1. retornar `false` se `automationId`, contato, canal ou duração forem inválidos;
2. gerar `jobId` com `crypto.randomUUID()` sem `:`, evitando restrições do BullMQ;
3. usar TTL Redis de `ceil(delay / 1000) + 3600`;
4. trocar a geração antes de cancelar a anterior;
5. atualizar o registro anterior com filtros relacionais de conta e soft delete;
6. criar o novo `ContactsFollowUpScheduled`;
7. chamar `AutomationAssistantFollowUpQueue.addJob(jobId, payload, delay)`;
8. se o enqueue retornar `null`, reivindicar/remover a geração criada, marcar o registro como `CANCELED`, registrar erro e retornar `false`.

Trecho central esperado:

```ts
const jobId = `agent-v2-inactivity-${input.sessionId}-${crypto.randomUUID()}`;
const scheduledAt = new Date();
const ttlSeconds = Math.ceil(delay / 1000) + 3600;
const previousJobId = await this.state.replace(
  input.sessionId,
  jobId,
  ttlSeconds,
);

if (previousJobId) {
  await this.queue.cancelJob(previousJobId);
  await this.markCanceled(previousJobId, input.accountId);
}

await this.prisma.contactsFollowUpScheduled.create({
  data: {
    contactId: input.contactId,
    channelId: input.channelId,
    jobId,
    scheduleDate: new Date(scheduledAt.getTime() + delay),
  },
});

const queued = await this.queue.addJob(
  jobId,
  {
    source: "AGENT_V2",
    jobId,
    scheduledAt: scheduledAt.toISOString(),
    sessionId: input.sessionId,
    agentId: input.agentId,
    agentName: input.agentName,
    accountId: input.accountId,
    contactId: input.contactId,
    channelId: input.channelId,
    automationId,
    automationChain: input.automationChain,
  },
  delay,
);
```

- [ ] **Step 6: Implementar `cancel()` e logs estruturados**

Usar `new Logger(accountId)` e mensagens estáveis:

```text
[AgentV2InactivityFollowup] scheduled session=... job=... automation=... delayMs=...
[AgentV2InactivityFollowup] rescheduled session=... previousJob=... newJob=...
[AgentV2InactivityFollowup] canceled session=... job=...
[AgentV2InactivityFollowup] schedule failed session=... job=...
```

Não serializar o payload completo.

- [ ] **Step 7: Rodar testes focados e revisar**

Após build manual do processor:

```powershell
rtk npx jest src/commands/instagram/WebHookHandler/processor/agents-v2/inactivity/AgentInactivityFollowupScheduler.test.js --runInBand
rtk git diff --check
```

Expected: testes PASS; nenhum acesso real a Redis, scheduler ou banco.

---

### Task 3: Integrar ao ciclo de vida do `HandlerAgent`

**Files:**
- Modify: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/HandlerAgent.ts:10`
- Modify: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/HandlerAgent.ts:489`
- Modify: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/HandlerAgent.ts:937`
- Modify: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/HandlerAgent.ts:2396`

**Interfaces:**
- Consumes: `agentInactivityFollowupScheduler.schedule()` e `.cancel()` da Task 2.
- Produces: `scheduleInactivityFollowup()` e `cancelInactivityFollowup()` protegidos no handler.

- [ ] **Step 1: Adicionar testes de integração do handler ao agendador**

No teste do agendador, adicionar uma seção de contrato para confirmar os argumentos que o handler deverá fornecer. Não instanciar providers nem fazer chamadas de LLM. A integração no handler será revisada por teste indireto existente do fluxo de sessão e por inspeção do diff, evitando um mock frágil da classe abstrata inteira.

Contrato esperado:

```ts
await agentInactivityFollowupScheduler.schedule({
  sessionId: this.session.id,
  agentId: this.agent.id,
  agentName: this.agent.name,
  accountId: this.agent.accountId,
  contactId: this.session.contactId,
  channelId: this.session.channelId,
  automationChain: this.context.automationChain ?? [],
  config: lifecycle.inactivityFollowup,
});
```

- [ ] **Step 2: Implementar `scheduleInactivityFollowup()`**

Adicionar próximo das operações de expiração, mas manter os dois conceitos separados:

```ts
protected async scheduleInactivityFollowup(): Promise<void> {
  if (!this.session || !this.agent) return;
  if (!this.session.contactId || !this.session.channelId) return;

  const lifecycle = this.agent
    .lifecycleAutomations as LifecycleAutomations | null;
  const config = lifecycle?.inactivityFollowup;
  if (!config?.onNoReply?.automationId) return;

  await agentInactivityFollowupScheduler.schedule({
    sessionId: this.session.id,
    agentId: this.agent.id,
    agentName: this.agent.name,
    accountId: this.agent.accountId,
    contactId: this.session.contactId,
    channelId: this.session.channelId,
    automationChain: this.context.automationChain ?? [],
    config,
  });
}
```

- [ ] **Step 3: Rearmar o timer para toda mensagem inbound válida**

Em `execute()`, chamar depois do tratamento de exit word e independentemente de objetivos:

```ts
if (this.isExitWord(payload.text)) {
  await this.terminateSession({ endReason: "EXIT_WORD" });
  return;
}

await this.scheduleInactivityFollowup();

if (!this.agentHasObjectives() || this.session.objectiveCompletedAt) {
  await this.scheduleExpiration();
}
```

Essa ordem garante que exit words não criem follow-up e que agentes com objetivos também recebam o follow-up configurado antes da conclusão do objetivo.

- [ ] **Step 4: Cancelar o timer em toda terminação de sessão**

Adicionar antes de qualquer retorno especial de rating:

```ts
await this.cancelInactivityFollowup();
await this.cancelExpiration();
```

Implementar:

```ts
protected async cancelInactivityFollowup(): Promise<void> {
  if (!this.session || !this.agent) return;
  await agentInactivityFollowupScheduler.cancel({
    sessionId: this.session.id,
    accountId: this.agent.accountId,
  });
}
```

- [ ] **Step 5: Corrigir a documentação interna do handler**

Substituir o comentário “not yet implemented” por:

```ts
* inactivityFollowup is scheduled separately by scheduleInactivityFollowup()
* and dispatched by AutomationAssistantFollowUpWorker after the configured delay.
```

- [ ] **Step 6: Rodar os testes V2 não relacionados a provider**

Após build manual do processor:

```powershell
rtk npx jest src/commands/instagram/WebHookHandler/processor/agents-v2/redis/AgentInactivityFollowupState.test.js src/commands/instagram/WebHookHandler/processor/agents-v2/inactivity/AgentInactivityFollowupScheduler.test.js --runInBand
```

Expected: PASS e nenhum teste chama LLM, Meta ou banco.

---

### Task 4: Processar o payload V2 no worker existente

**Files:**
- Modify: `chatfunnel-api/src/commands/workers/AutomationAssistantFollowUpWorker.js:1`
- Create: `chatfunnel-api/src/commands/workers/AutomationAssistantFollowUpWorker.test.js`

**Interfaces:**
- Consumes: `AgentV2InactivityFollowupJob`, `agentInactivityFollowupState.claim()`, Prisma e `systemActionsQueue`.
- Produces: `processLegacyFollowup(body)` e `processAgentV2Followup(body)` selecionados por `body.source`.

- [ ] **Step 1: Escrever o teste que preserva o ramo legado**

```js
it("keeps legacy payloads on the existing assistant path", async () => {
  prisma.contactsChannels.findFirst.mockResolvedValue({ id: "cc-1" });
  prisma.messages.findFirst.mockResolvedValue(null);

  await worker(
    makeReq({ automationContext, inactivityFollowup, assistant }),
    makeRes(),
  );

  expect(prisma.messages.findFirst).toHaveBeenCalled();
  expect(systemActionsQueue.addJob).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        ranBy: expect.objectContaining({ assistantId: assistant.id }),
      }),
    }),
  );
});
```

- [ ] **Step 2: Escrever testes V2 para job obsoleto e sessão inválida**

```js
it("cancels a stale V2 generation without dispatching", async () => {
  state.claim.mockResolvedValue(false);

  await worker(makeReq(agentV2Body), makeRes());

  expect(systemActionsQueue.addJob).not.toHaveBeenCalled();
  expect(prisma.contactsFollowUpScheduled.updateMany).toHaveBeenCalledWith({
    where: expect.objectContaining({
      jobId: agentV2Body.jobId,
      typeAnswer: "PENDING",
    }),
    data: expect.objectContaining({ typeAnswer: "CANCELED" }),
  });
});

it("cancels when the scoped active session no longer exists", async () => {
  prisma.agentSessions.findFirst.mockResolvedValue(null);

  await worker(makeReq(agentV2Body), makeRes());

  expect(state.claim).not.toHaveBeenCalled();
  expect(systemActionsQueue.addJob).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Escrever o teste de isolamento por conta e soft delete**

```js
expect(prisma.agentSessions.findFirst).toHaveBeenCalledWith({
  where: {
    id: "session-1",
    agentId: "agent-1",
    contactId: "contact-1",
    channelId: "channel-1",
    agent: { accountId: "account-1", isDeleted: false },
    contact: { accountId: "account-1", isDeleted: false },
    channel: { accountId: "account-1", isDeleted: false },
  },
});

expect(prisma.contactsChannels.findFirst).toHaveBeenCalledWith({
  where: {
    contactId: "contact-1",
    channelId: "channel-1",
    servedByAssistant: true,
    servedByAssistantId: "agent-1",
    contact: { accountId: "account-1", isDeleted: false },
    channel: { accountId: "account-1", isDeleted: false },
  },
});
```

- [ ] **Step 4: Escrever o teste de disparo único com atribuição ao agente**

```js
it("claims the current generation and dispatches onNoReply as Agent V2", async () => {
  prisma.agentSessions.findFirst.mockResolvedValue({ id: "session-1" });
  prisma.contactsChannels.findFirst.mockResolvedValue({ id: "cc-1" });
  state.claim.mockResolvedValue(true);
  systemActionsQueue.addJob.mockResolvedValue({ id: "system-job" });

  await worker(makeReq(agentV2Body), makeRes());

  expect(systemActionsQueue.addJob).toHaveBeenCalledWith({
    object: "system",
    automationChain: agentV2Body.automationChain,
    data: {
      automationId: agentV2Body.automationId,
      contactId: agentV2Body.contactId,
      channelId: agentV2Body.channelId,
      accountId: agentV2Body.accountId,
      ranBy: {
        agentId: agentV2Body.agentId,
        agentName: agentV2Body.agentName,
        automationId: null,
        automationName: null,
      },
    },
  });
  expect(prisma.contactsFollowUpScheduled.updateMany).toHaveBeenCalledWith({
    where: expect.objectContaining({
      jobId: agentV2Body.jobId,
      typeAnswer: "PENDING",
    }),
    data: expect.objectContaining({ typeAnswer: "UNANSWER" }),
  });
});
```

- [ ] **Step 5: Separar o worker legado sem alterar sua lógica**

Refatorar o export para selecionar o ramo:

```js
module.exports = async function (req, res) {
  res.status(200).json({ status: true });

  try {
    if (req.body?.source === "AGENT_V2") {
      return await processAgentV2Followup(req.body);
    }
    return await processLegacyFollowup(req.body);
  } catch (error) {
    const accountId = req.body?.accountId;
    const logger = new Logger(accountId || "unknown");
    logger.error("[AutomationAssistantFollowUpWorker] failed", error);
  }
};
```

Mover o corpo atual para `processLegacyFollowup()` sem modificar consultas ou semântica nesta entrega.

- [ ] **Step 6: Implementar validação e claim do ramo V2**

Executar nesta ordem:

1. validar que todos os IDs obrigatórios são strings não vazias;
2. carregar sessão com agente/contato/canal limitados à conta e não deletados;
3. validar `ContactsChannels.servedByAssistant` e `servedByAssistantId`;
4. chamar `state.claim(sessionId, jobId)` imediatamente antes do dispatch;
5. se o claim falhar, marcar somente aquele `jobId` como `CANCELED`;
6. despachar o `ProcessorData` com `ranBy.agentId`;
7. se `addJob()` retornar job, marcar `UNANSWER`; se retornar `null`, marcar `CANCELED` e logar erro.

Não consultar `Messages`: uma nova mensagem válida já troca a geração Redis durante `HandlerAgent.execute()`. A geração atual é a fonte de verdade para inatividade no V2.

- [ ] **Step 7: Adicionar logs operacionais estáveis**

```text
[AgentV2InactivityFollowupWorker] stale session=... job=...
[AgentV2InactivityFollowupWorker] inactive session session=... job=...
[AgentV2InactivityFollowupWorker] assistant ownership changed session=... job=...
[AgentV2InactivityFollowupWorker] dispatched session=... job=... automation=...
[AgentV2InactivityFollowupWorker] dispatch failed session=... job=... automation=...
```

- [ ] **Step 8: Rodar o teste focado do worker**

```powershell
rtk npx jest src/commands/workers/AutomationAssistantFollowUpWorker.test.js --runInBand
```

Expected: PASS para compatibilidade V1, geração obsoleta, sessão inexistente, ownership alterado, isolamento por conta e dispatch V2.

---

### Task 5: Remover o warning obsoleto da migração V1 → V2

**Files:**
- Modify: `chatfunnel-services/src/modules/agents-v2/migration/helpers/assistant-to-agent-payload.ts:455`
- Modify: `chatfunnel-services/src/modules/agents-v2/migration/helpers/assistant-to-agent-payload.spec.ts:711`
- Keep: `chatfunnel-services/src/modules/agents-v2/migration/types/migration-report.ts:57`

**Interfaces:**
- Consumes: suporte runtime entregue nas Tasks 1–4.
- Produces: relatórios novos de migração sem `INACTIVITY_FOLLOWUP_UNSUPPORTED`.

- [ ] **Step 1: Alterar primeiro o teste para expressar o novo comportamento**

```ts
it('copies lifecycleAutomations without warning about inactivity follow-up', () => {
  const lifecycle = {
    endSession: { automationId: AUTOMATION },
    inactivityFollowup: {
      timeUnit: 'MINUTES',
      timeValue: 10,
      onReply: { automationId: null },
      onNoReply: { automationId: AUTOMATION },
    },
  }

  const { dto, issues } = mapAssistantToAgentPayload(
    buildAssistant({ lifecycleAutomations: lifecycle as never }),
    buildContext(),
  )

  expect(dto.lifecycleAutomations).toEqual(lifecycle)
  expect(codes(issues)).not.toContain(
    MigrationIssueCode.INACTIVITY_FOLLOWUP_UNSUPPORTED,
  )
})
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

```powershell
rtk npx jest src/modules/agents-v2/migration/helpers/assistant-to-agent-payload.spec.ts --runInBand
```

Expected: FAIL porque o mapper ainda adiciona o warning.

- [ ] **Step 3: Remover somente a emissão do warning e helper morto**

Remover o bloco `if (hasInactivityFollowup(...))` e remover `hasInactivityFollowup()` caso não reste outro uso. Manter o enum `INACTIVITY_FOLLOWUP_UNSUPPORTED` nesta entrega para não quebrar consumidores que ainda desserializem relatórios históricos.

- [ ] **Step 4: Rodar novamente o teste focado**

```powershell
rtk npx jest src/modules/agents-v2/migration/helpers/assistant-to-agent-payload.spec.ts --runInBand
```

Expected: PASS.

---

### Task 6: Documentação, observabilidade e validação integrada

**Files:**
- Modify: `vault/wiki/features/automations.md:67`
- Review: todos os arquivos das Tasks 1–5

**Interfaces:**
- Consumes: comportamento final implementado.
- Produces: documentação operacional e roteiro de verificação em Grafana.

- [ ] **Step 1: Atualizar a knowledge base**

Adicionar à seção de filas:

```markdown
### Follow-up de inatividade do Agente V2

O Agente V2 reutiliza `AutomationAssistantFollowUpQueue`, mas envia jobs com
`source: AGENT_V2`. Cada mensagem inbound cria uma geração única por sessão;
uma chave Redis invalida gerações anteriores e evita que um job atrasado
dispare depois de uma nova resposta. O worker valida sessão, conta, contato,
canal e `servedByAssistantId` antes de iniciar `onNoReply.automationId`.

O timer de follow-up é independente da expiração da sessão (`expireAgentQueue`).
Encerrar a sessão cancela ambos os timers.
```

- [ ] **Step 2: Rodar toda a suíte focada da API**

Depois que o usuário executar manualmente `npm run build:processor`:

```powershell
rtk npx jest src/commands/instagram/WebHookHandler/processor/agents-v2/redis/AgentInactivityFollowupState.test.js src/commands/instagram/WebHookHandler/processor/agents-v2/inactivity/AgentInactivityFollowupScheduler.test.js src/commands/workers/AutomationAssistantFollowUpWorker.test.js --runInBand
```

Expected: todos PASS.

- [ ] **Step 3: Rodar a regressão focada de encerramento e roteamento V2**

```powershell
rtk npx jest src/commands/assistant/StopAssistant.test.js src/commands/instagram/WebHookHandler/processor/__tests__/handleServedByAgentV2.test.js --runInBand
```

Expected: todos PASS; encerramento continua limpando atendimento e mensagens continuam sendo roteadas ao V2.

- [ ] **Step 4: Rodar o teste focado do Services**

```powershell
rtk npx jest src/modules/agents-v2/migration/helpers/assistant-to-agent-payload.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Revisar o diff final sem build ou commit automático**

Em cada repositório afetado:

```powershell
rtk git status --short
rtk git diff --check
rtk git diff
```

Expected: somente arquivos listados neste plano; nenhuma migration, lockfile, artefato `dist/` ou mudança do front.

- [ ] **Step 6: Verificar manualmente em ambiente com scheduler/Grafana**

Usar um agente V2 de teste com `timeValue: 1`, `timeUnit: MINUTES` e uma automação segura. Enviar uma mensagem e confirmar:

```text
[AgentV2InactivityFollowup] scheduled
[AgentV2InactivityFollowupWorker] dispatched
```

Enviar uma segunda mensagem antes do minuto e confirmar:

```text
[AgentV2InactivityFollowup] rescheduled
```

O primeiro `jobId` não pode produzir `dispatched`; somente a geração mais recente pode iniciar a automação.

## Acceptance Criteria

- Um agente V2 com `onNoReply.automationId` agenda exatamente um follow-up corrente por sessão.
- Cada mensagem inbound válida substitui a geração anterior.
- O job corrente dispara a automação configurada com `ranBy.agentId/agentName`.
- Jobs obsoletos, sessões encerradas, contatos/canais deletados ou ownership alterado não disparam automações.
- Encerrar a sessão cancela o follow-up pendente e a expiração da sessão.
- `ContactsFollowUpScheduled` reflete `PENDING`, `CANCELED` ou `UNANSWER` e continua compatível com o cancelamento do Livechat.
- O Assistant V1 continua passando pelo ramo legado sem alteração comportamental.
- A migração V1 → V2 deixa de informar incorretamente que o follow-up é unsupported.
- Logs permitem correlacionar `sessionId`, `jobId`, `agentId` e `automationId` no Grafana.
- Nenhuma nova fila, migration, dependência, alteração no front ou acesso a banco real é necessário.

## Rollout Order

1. Implantar `chatfunnel-api` com o ramo V2 do worker e o novo agendador no mesmo release.
2. Confirmar que o scheduler já possui `automationAssistantFollowUpQueue` e que a rota atual continua registrada.
3. Executar smoke test com uma conta interna e delay de um minuto.
4. Monitorar `schedule failed`, `stale` e `dispatch failed` no Grafana.
5. Implantar `chatfunnel-services` removendo o warning de migração somente depois que o runtime da API estiver ativo.

## Explicitly Out of Scope

- Implementar `inactivityFollowup.onReply` no Agente V2.
- Alterar o comportamento ou corrigir débitos técnicos do Assistant V1.
- Criar uma fila `automationAgentFollowUpQueue` nova.
- Adicionar colunas como `agentId`, `sessionId` ou `sourceType` a `ContactsFollowUpScheduled`.
- Alterar o editor ou contratos MCP de agentes.
- Garantir entrega exactly-once entre Redis, PostgreSQL e scheduler; a entrega usa geração Redis e compensação best-effort, coerentes com a infraestrutura atual.
- Executar build, migration, banco real, commit ou push.
