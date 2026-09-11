# Agent V2 Inactivity Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Executar no Agente V2 a automação configurada em `lifecycleAutomations.inactivityFollowup.onNoReply` após o período configurado sem uma nova mensagem do contato.

**Architecture:** Reutilizar `automationAssistantFollowUpQueue` com um payload discriminado por `source: "AGENT_V2"`. `ContactsFollowUpScheduled` será a única fonte de verdade da geração: cada job terá ID único, uma nova mensagem cancelará registros `PENDING` anteriores da mesma sessão e o worker só disparará após reivindicar atomicamente seu registro com `PENDING -> UNANSWER`. Não haverá estado adicional em Redis.

**Tech Stack:** TypeScript e JavaScript no `chatfunnel-api`, Prisma, scheduler HTTP/BullMQ existente, Winston e Jest.

**Spec:** `vault/wiki/features/automations.md`, seção “Delays e Follow-Ups”, complementada pelo comportamento legado em `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/fragments/HandlerAssistant.js:3157` e pelo contrato atual da UI em `chatfunnel-front/src/views/agents/AgentsForm/components/modals/AutomationsConfigDialog.vue:70`.

## Global Constraints

- Não criar outra fila: usar `automationAssistantFollowUpQueue` para preservar o scheduler e `CancelFollowUp.js`.
- Não criar estado Redis, script Lua, schema Prisma ou migration.
- Toda consulta nova deve ser isolada por `accountId`; modelos sem `accountId` direto devem ser filtrados pelas relações com `Contacts`, `Channels` ou `Agents`.
- Toda consulta nova a entidades com soft delete deve exigir `isDeleted: false`.
- O primeiro escopo suporta somente `onNoReply`, comportamento atualmente exposto pela UI do Agente V2.
- `onReply` legado, alteração do editor Vue, migração V1 → V2 e refatoração geral do worker V1 ficam fora do escopo.
- O timer de follow-up é independente de `agent.duration/unit` e de `expireAgentQueue`; não aplicar o bloqueio por objetivos usado na expiração da sessão.
- Não executar `npm test` no `chatfunnel-api`, pois o script executa build no `pretest`.
- Não executar build, banco real ou migration automaticamente. O usuário executa `npm run build:processor` uma vez após todas as mudanças TypeScript.
- Não incluir texto de mensagens nem payloads completos do contato nos novos logs.
- Logs novos devem ser JSON estruturado no nível raiz, com `event`, `component`, `stage`, `status` e IDs de correlação consultáveis individualmente no Grafana.
- Erros devem expor `errorName`, `errorCode`, `errorMessage` e `errorStack`; nunca serializar o objeto de request, payload do job ou mensagem do contato.

---

## Current Behavior and Root Cause

O Assistant V1 chama `_createFollowupJob()` na primeira interação e em cada nova mensagem. Ele cancela o job anterior, grava `ContactsFollowUpScheduled` e agenda `AutomationAssistantFollowUpQueue`. Quando o worker vence, verifica se o contato continua atendido pelo mesmo assistant e despacha `onNoReply.automationId`.

O Agente V2 já declara `inactivityFollowup` em `LifecycleAutomations`, mas `handleLifecycleAutomations()` trata somente eventos imediatos. O fluxo atual agenda apenas `expireAgentQueue`, baseado em `agent.duration/unit`; portanto nenhuma fila é criada para o follow-up de inatividade.

Não copiar o payload legado inteiro. O V2 deve enviar somente os IDs necessários, validar novamente o contexto no worker e usar `agentId` em `ranBy`.

## Concurrency Model

`ContactsFollowUpScheduled.typeAnswer` controla se um job ainda pode executar:

- `PENDING`: job elegível para reivindicação.
- `CANCELED`: job substituído, encerrado, inválido ou cujo enqueue/dispatch falhou.
- `UNANSWER`: job reivindicado e enviado para `systemActionsQueue`.

Cada geração usa `agent-v2-inactivity-${sessionId}-${crypto.randomUUID()}`. Para reagendar ou encerrar, buscar somente registros `PENDING` cujo `jobId` começa com `agent-v2-inactivity-${sessionId}-`, sempre com `contactId`, `channelId`, conta e soft delete no filtro. Marcar esses IDs como `CANCELED` antes de chamar `cancelJob()` evita que um job já entregue continue elegível.

No worker, a reivindicação é um único `updateMany` filtrado por `jobId`, `PENDING`, contato, canal e conta. A automação só é despachada quando `count === 1`. Assim, reagendamento e cancelamento manual permanecem visíveis ao worker sem uma segunda fonte de verdade.

A janela entre a reivindicação no banco e o enqueue em `systemActionsQueue` continua best-effort, assim como na infraestrutura atual. Exactly-once distribuído fica fora do escopo.

## Desired Runtime Sequence

```text
Mensagem inbound válida
  -> HandlerAgent encontra/cria AgentSession
  -> scheduleInactivityFollowup(...)
       -> marca gerações PENDING anteriores da sessão como CANCELED
       -> tenta cancelar os jobs anteriores na fila
       -> cria ContactsFollowUpScheduled PENDING com jobId único
       -> agenda automationAssistantFollowUpQueue
  -> processamento normal do agente continua

Job vence
  -> AutomationAssistantFollowUpWorker detecta source=AGENT_V2
  -> valida payload, sessão, conta, contato, canal e ownership
  -> tenta atualizar seu registro PENDING para UNANSWER
  -> count=0: encerra sem disparar
  -> count=1: despacha onNoReply pelo systemActionsQueue com ranBy.agentId

Nova mensagem antes do vencimento
  -> registro anterior passa para CANCELED
  -> novo registro PENDING e novo job substituem a geração anterior

Sessão encerrada
  -> registros PENDING da sessão passam para CANCELED
  -> respectivos jobs são cancelados na fila
```

## File Structure

- Modify `chatfunnel-api/src/class/LoggerClass.js`: adicionar emissão de eventos com metadados JSON no nível raiz sem alterar `info()`, `error()`, `gpt()` ou `agent()`.
- Create `chatfunnel-api/src/class/LoggerClass.test.js`: garantir campos estruturados e serialização segura de `Error`.
- Modify `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/types/externals.d.ts`: declarar a nova API `Logger.event()` para o processor TypeScript.
- Create `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/inactivity/AgentInactivityFollowupScheduler.ts`: funções de duração, agendamento, reagendamento e cancelamento usando Prisma e a fila existente.
- Create `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/inactivity/AgentInactivityFollowupScheduler.test.js`: testes unitários do agendador.
- Modify `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/HandlerAgent.ts`: integrar schedule/cancel ao ciclo da sessão.
- Modify `chatfunnel-api/src/commands/workers/AutomationAssistantFollowUpWorker.js`: preservar o caminho V1 e adicionar o processamento V2.
- Create `chatfunnel-api/src/commands/workers/AutomationAssistantFollowUpWorker.test.js`: regressão V1 e cenários V2.
- Modify `vault/wiki/features/automations.md`: documentar o comportamento e a reivindicação pelo banco.

---

### Task 1: Emitir eventos estruturados pelo logger existente

**Files:**
- Modify: `chatfunnel-api/src/class/LoggerClass.js:1`
- Create: `chatfunnel-api/src/class/LoggerClass.test.js`
- Modify: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/types/externals.d.ts:10`

**Interfaces:**
- Consumes: instância Winston já criada por `LoggerClass` com `format.json()`.
- Produces: `logger.event(level, event, fields, error?)` com metadados no nível raiz do JSON.

- [ ] **Step 1: Escrever o teste do evento estruturado**

Mockar `winston.createLogger()` e verificar que o wrapper envia um único objeto ao Winston:

```js
it("emits queryable metadata and normalized error fields", () => {
  const error = Object.assign(new Error("scheduler unavailable"), {
    code: "ECONNRESET",
  });

  logger.event(
    "error",
    "agent_v2_inactivity_followup.failed",
    {
      component: "scheduler",
      stage: "schedule_queue",
      status: "failed",
      accountId: "account-1",
      sessionId: "session-1",
      jobId: "job-1",
    },
    error,
  );

  expect(winstonLogger.log).toHaveBeenCalledWith({
    level: "error",
    message: "agent_v2_inactivity_followup.failed",
    event: "agent_v2_inactivity_followup.failed",
    component: "scheduler",
    stage: "schedule_queue",
    status: "failed",
    accountId: "account-1",
    sessionId: "session-1",
    jobId: "job-1",
    errorName: "Error",
    errorCode: "ECONNRESET",
    errorMessage: "scheduler unavailable",
    errorStack: expect.any(String),
  });
});
```

- [ ] **Step 2: Implementar `Logger.event()` sem alterar APIs existentes**

Adicionar somente o método necessário:

```js
event(level, event, fields = {}, error) {
  const errorFields = error
    ? error instanceof Error
      ? {
          errorName: error.name,
          errorCode: error.code,
          errorMessage: error.message,
          errorStack: error.stack,
        }
      : { errorMessage: String(error) }
    : {};

  this.logger.log({
    ...fields,
    ...errorFields,
    level,
    message: event,
    event,
  });
}
```

Não modificar o comportamento de `fmt()` ou dos métodos existentes.

- [ ] **Step 3: Declarar a API para TypeScript**

```ts
event(
  level: "info" | "error",
  event: string,
  fields?: Record<string, unknown>,
  error?: unknown,
): void;
```

---

### Task 2: Agendar e cancelar pelo estado persistido

**Files:**
- Create: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/inactivity/AgentInactivityFollowupScheduler.ts`
- Create: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/inactivity/AgentInactivityFollowupScheduler.test.js`

**Interfaces:**
- Consumes: `prisma.contactsFollowUpScheduled`, `AutomationAssistantFollowUpQueue`, `Logger.event()` e `inactivityFollowup.onNoReply`.
- Produces: `computeInactivityDelayMs(config)`, `scheduleInactivityFollowup(input)` e `cancelInactivityFollowup(input)`.

- [ ] **Step 1: Escrever os testes do agendador**

Mockar `@database`, `@queues` e `@logger` no padrão Jest existente. Cobrir:

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

Adicionar testes que confirmem:

- configuração inválida retorna `false` sem acessar Prisma ou fila;
- agendamento cria um job V2 com ID único e payload mínimo;
- reagendamento marca somente gerações `PENDING` da mesma sessão como `CANCELED` e tenta cancelar seus jobs;
- falha de `addJob()` marca a nova geração como `CANCELED`;
- encerramento cancela todas as gerações `PENDING` encontradas para a sessão.
- sucesso e falha emitem eventos estruturados com `stage`, IDs de correlação e erro normalizado.

- [ ] **Step 2: Implementar contratos e conversão de duração**

Usar tipos apenas para os dados realmente consumidos:

```ts
interface InactivityFollowupConfig {
  timeValue: number;
  timeUnit: string;
  onNoReply?: { automationId?: string | null };
}

interface FollowupIdentity {
  sessionId: string;
  accountId: string;
  contactId: string;
  channelId: string;
}

interface ScheduleInput extends FollowupIdentity {
  agentId: string;
  automationChain: string[];
  config: InactivityFollowupConfig;
}
```

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

- [ ] **Step 3: Implementar um helper interno de cancelamento**

Criar uma função interna que:

1. busque registros `PENDING` pelo prefixo da sessão, contato, canal, conta e soft delete;
2. retorne imediatamente quando nenhum registro for encontrado;
3. atualize somente os IDs encontrados ainda em `PENDING` para `CANCELED`, preenchendo `finishedAt`;
4. chame `AutomationAssistantFollowUpQueue.cancelJob(jobId)` para cada registro encontrado.

Filtro obrigatório:

```ts
const wherePending = {
  jobId: { startsWith: `agent-v2-inactivity-${input.sessionId}-` },
  contactId: input.contactId,
  channelId: input.channelId,
  typeAnswer: FollowUpScheduledTypeAnswer.PENDING,
  contact: { accountId: input.accountId, isDeleted: false },
  channel: { accountId: input.accountId, isDeleted: false },
};
```

- [ ] **Step 4: Implementar `scheduleInactivityFollowup()`**

O método deve:

1. validar `automationId`, IDs e duração;
2. chamar o helper de cancelamento para invalidar gerações anteriores;
3. gerar `jobId` com `crypto.randomUUID()`;
4. criar `ContactsFollowUpScheduled` como `PENDING`;
5. agendar a fila com payload mínimo;
6. se `addJob()` retornar `null` ou lançar, marcar esse `jobId` como `CANCELED`, logar sem payload e retornar `false`.

Payload V2:

```ts
{
  source: "AGENT_V2",
  jobId,
  sessionId: input.sessionId,
  agentId: input.agentId,
  accountId: input.accountId,
  contactId: input.contactId,
  channelId: input.channelId,
  automationId,
  automationChain: input.automationChain,
}
```

- [ ] **Step 5: Implementar `cancelInactivityFollowup()`**

Reutilizar o helper interno com `sessionId`, `accountId`, `contactId` e `channelId`. Não criar classe, singleton, estado Redis ou abstração adicional.

- [ ] **Step 6: Instrumentar o agendador**

Manter uma variável local `stage` antes de cada chamada externa e emitir:

| `event` | Nível | Quando emitir | Campos adicionais |
|---|---|---|---|
| `agent_v2_inactivity_followup.scheduled` | `info` | registro persistido e job aceito pela fila | `component: "scheduler"`, `stage: "schedule_queue"`, `status: "succeeded"`, `delayMs` |
| `agent_v2_inactivity_followup.canceled` | `info` | geração invalidada | `component: "scheduler"`, `stage: "cancel_previous"`, `status: "succeeded"`, `reason`: `RESCHEDULED`, `SESSION_TERMINATED` ou `ENQUEUE_FAILED` |
| `agent_v2_inactivity_followup.failed` | `error` | exceção ou retorno `null` | `component: "scheduler"`, `status: "failed"`, `stage` exato e campos `error*` quando houver exceção |

Todos incluem `accountId`, `sessionId`, `jobId`, `agentId`, `automationId`, `contactId` e `channelId` quando disponíveis. Não registrar configuração completa nem payload da fila.

---

### Task 3: Integrar ao ciclo de vida do `HandlerAgent`

**Files:**
- Modify: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/HandlerAgent.ts:10`
- Modify: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/HandlerAgent.ts:489`
- Modify: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/HandlerAgent.ts:937`
- Modify: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/HandlerAgent.ts:2396`

**Interfaces:**
- Consumes: `scheduleInactivityFollowup(input)` e `cancelInactivityFollowup(input)` da Task 2.
- Produces: chamadas protegidas nos pontos de entrada e encerramento da sessão.

- [ ] **Step 1: Adicionar wrappers protegidos no handler**

```ts
protected async scheduleConfiguredInactivityFollowup(): Promise<void> {
  if (!this.session || !this.agent) return;
  if (!this.session.contactId || !this.session.channelId) return;

  const lifecycle = this.agent.lifecycleAutomations as LifecycleAutomations | null;
  const config = lifecycle?.inactivityFollowup;
  if (!config?.onNoReply?.automationId) return;

  await scheduleInactivityFollowup({
    sessionId: this.session.id,
    agentId: this.agent.id,
    accountId: this.agent.accountId,
    contactId: this.session.contactId,
    channelId: this.session.channelId,
    automationChain: this.context.automationChain ?? [],
    config,
  });
}
```

Criar o wrapper de cancelamento com a mesma identidade, sem `agentId`, `automationChain` ou configuração.

- [ ] **Step 2: Rearmar depois da validação de exit word**

Em `execute()`, chamar `scheduleConfiguredInactivityFollowup()` depois do retorno de exit word e antes da lógica de expiração:

```ts
if (this.isExitWord(payload.text)) {
  await this.terminateSession({ endReason: "EXIT_WORD" });
  return;
}

await this.scheduleConfiguredInactivityFollowup();

if (!this.agentHasObjectives() || this.session.objectiveCompletedAt) {
  await this.scheduleExpiration();
}
```

- [ ] **Step 3: Cancelar durante toda terminação de sessão**

Em `terminateSession()`, chamar o wrapper de cancelamento antes dos retornos especiais de rating e junto de `cancelExpiration()`.

- [ ] **Step 4: Atualizar o comentário interno**

Remover a observação de que o follow-up não está implementado e registrar que ele é agendado separadamente e processado por `AutomationAssistantFollowUpWorker`.

Não adicionar teste que apenas replique os argumentos esperados. A integração será coberta pela regressão focada do fluxo V2 na Task 5.

---

### Task 4: Processar o payload V2 no worker existente

**Files:**
- Modify: `chatfunnel-api/src/commands/workers/AutomationAssistantFollowUpWorker.js:1`
- Create: `chatfunnel-api/src/commands/workers/AutomationAssistantFollowUpWorker.test.js`

**Interfaces:**
- Consumes: payload V2 da Task 2, Prisma, `systemActionsQueue` e `Logger.event()` da Task 1.
- Produces: `processLegacyFollowup(body)` e `processAgentV2Followup(body)`, selecionados por `body.source`.

- [ ] **Step 1: Escrever os testes do worker**

Cobrir os seguintes comportamentos:

- payload sem `source` continua executando o fluxo V1 e usa `ranBy.assistantId`;
- payload V2 inválido não consulta nem despacha;
- sessão inexistente, conta divergente, entidade deletada ou ownership alterado marca o registro como `CANCELED` e não despacha;
- claim com `count: 0` trata o job como obsoleto e não despacha;
- claim com `count: 1` envia `onNoReply` com `ranBy.agentId` e nome carregado da relação `agent`;
- falha ou retorno `null` de `systemActionsQueue.addJob()` muda `UNANSWER` para `CANCELED`.

O teste do claim deve exigir o filtro completo:

```js
expect(prisma.contactsFollowUpScheduled.updateMany).toHaveBeenCalledWith({
  where: {
    jobId: agentV2Body.jobId,
    contactId: agentV2Body.contactId,
    channelId: agentV2Body.channelId,
    typeAnswer: "PENDING",
    contact: { accountId: agentV2Body.accountId, isDeleted: false },
    channel: { accountId: agentV2Body.accountId, isDeleted: false },
  },
  data: {
    typeAnswer: "UNANSWER",
    finishedAt: expect.any(Date),
  },
});
```

- [ ] **Step 2: Preservar o fluxo legado em uma função própria**

Mover o corpo atual para `processLegacyFollowup(body)` sem alterar consultas, payload ou semântica. O export responde HTTP 200 e escolhe o ramo:

```js
if (req.body?.source === "AGENT_V2") {
  return await processAgentV2Followup(req.body);
}
return await processLegacyFollowup(req.body);
```

- [ ] **Step 3: Implementar validação V2**

Validar strings não vazias para `jobId`, `sessionId`, `agentId`, `accountId`, `contactId`, `channelId` e `automationId`.

Buscar a sessão com agente, contato e canal limitados à conta e não deletados. Selecionar também `agent.name`, evitando transportar `agentName` no job. Em seguida validar `ContactsChannels.servedByAssistant === true` e `servedByAssistantId === agentId` com os mesmos filtros de conta e soft delete.

Se qualquer validação falhar, marcar somente o `jobId` ainda `PENDING` como `CANCELED` e retornar.

- [ ] **Step 4: Reivindicar e despachar uma vez**

Depois de todas as validações, executar o `updateMany` atômico `PENDING -> UNANSWER`. Continuar somente quando `count === 1`.

Despachar:

```js
await systemActionsQueue.addJob({
  object: "system",
  automationChain: body.automationChain ?? [],
  data: {
    automationId: body.automationId,
    contactId: body.contactId,
    channelId: body.channelId,
    accountId: body.accountId,
    ranBy: {
      agentId: body.agentId,
      agentName: session.agent.name,
      automationId: null,
      automationName: null,
    },
  },
});
```

Se o enqueue retornar `null` ou lançar, atualizar esse registro de `UNANSWER` para `CANCELED` e registrar erro.

- [ ] **Step 5: Instrumentar o worker com eventos estruturados**

Usar `Logger.event()` no worker. Todo evento deve incluir, quando disponível:

```js
{
  component: "worker",
  stage: "validate" | "load_session" | "validate_ownership" | "claim" |
    "dispatch",
  status: "started" | "succeeded" | "skipped" | "failed",
  accountId,
  sessionId,
  jobId,
  agentId,
  automationId,
  contactId,
  channelId,
}
```

Eventos obrigatórios:

| `event` | Nível | Quando emitir | Campos adicionais |
|---|---|---|---|
| `agent_v2_inactivity_followup.worker_received` | `info` | início do ramo V2 | nenhum |
| `agent_v2_inactivity_followup.skipped` | `info` | execução encerrada sem dispatch | `reason`: `INVALID_PAYLOAD`, `INVALID_SESSION`, `OWNERSHIP_CHANGED` ou `STALE_JOB` |
| `agent_v2_inactivity_followup.claimed` | `info` | transição `PENDING -> UNANSWER` efetuada | nenhum |
| `agent_v2_inactivity_followup.dispatched` | `info` | `systemActionsQueue` aceitou o job | nenhum |
| `agent_v2_inactivity_followup.failed` | `error` | exceção ou retorno `null` | `stage` exato e campos `error*` quando houver exceção |

Manter uma variável local `stage` antes de cada operação externa. O `catch` emite `failed` com a última etapa atribuída, permitindo identificar se o erro ocorreu na validação, consulta da sessão, ownership, claim ou dispatch.

Adicionar expectativas nos testes do agendador e worker para pelo menos um evento de sucesso, um `skipped` e um `failed`, verificando campos de correlação e `stage`.

---

### Task 5: Documentar e validar o fluxo completo

**Files:**
- Modify: `vault/wiki/features/automations.md:67`
- Review: todos os arquivos das Tasks 1–4.

**Interfaces:**
- Consumes: comportamento implementado nas Tasks 1–4.
- Produces: documentação operacional e evidência dos testes focados.

- [ ] **Step 1: Atualizar a knowledge base**

Documentar:

```markdown
### Follow-up de inatividade do Agente V2

O Agente V2 reutiliza `AutomationAssistantFollowUpQueue` com jobs identificados
por `source: AGENT_V2`. Cada mensagem inbound cancela registros `PENDING`
anteriores da mesma sessão e cria uma geração com `jobId` único. O worker
valida sessão, conta, contato, canal e ownership, e só dispara a automação ao
alterar atomicamente o registro de `PENDING` para `UNANSWER`.

O timer é independente de `expireAgentQueue`. Encerrar a sessão cancela os
dois timers.

Os eventos são enviados como JSON estruturado pelo `Logger.event()`. O campo
`jobId` correlaciona agendamento, cancelamento, claim e dispatch; `stage`,
`status`, `reason` e os campos `error*` identificam falhas sem expor mensagens
ou payloads do contato.
```

- [ ] **Step 2: Atualizar o processor uma única vez**

Pré-requisito executado manualmente pelo usuário em `chatfunnel-api/`:

```powershell
npm run build:processor
```

Nenhum build deve ser executado pelo agente sem pedido explícito.

- [ ] **Step 3: Rodar a suíte focada da API**

Depois do build manual:

```powershell
rtk npx jest src/class/LoggerClass.test.js src/commands/instagram/WebHookHandler/processor/agents-v2/inactivity/AgentInactivityFollowupScheduler.test.js src/commands/workers/AutomationAssistantFollowUpWorker.test.js --runInBand
```

Expected: PASS para metadados estruturados, serialização de erro, conversão, agendamento, reagendamento, cancelamento, falhas de enqueue, compatibilidade V1, validação V2 e claim atômico.

- [ ] **Step 4: Rodar regressões de encerramento e roteamento V2**

```powershell
rtk npx jest src/commands/assistant/StopAssistant.test.js src/commands/instagram/WebHookHandler/processor/__tests__/handleServedByAgentV2.test.js --runInBand
```

Expected: PASS; encerramento continua limpando atendimento e mensagens continuam roteadas ao V2.

- [ ] **Step 5: Revisar o diff final**

```powershell
rtk git status --short
rtk git diff --check
rtk git diff
```

Expected: somente os arquivos listados; nenhuma migration, lockfile, artefato `dist/`, estado Redis, mudança no front ou no `chatfunnel-services`.

- [ ] **Step 6: Fazer smoke test manual**

Em ambiente com scheduler, configurar um Agente V2 com delay de um minuto:

1. enviar uma mensagem e confirmar `scheduled` seguido de `dispatched` após o prazo;
2. enviar uma segunda mensagem antes do prazo e confirmar que o primeiro `jobId` fica `CANCELED` e não dispara;
3. encerrar a sessão antes do prazo e confirmar que nenhum follow-up dispara;
4. cancelar pelo Livechat e confirmar que o worker encontra `count: 0` no claim.

No Grafana/Loki, após o seletor de ambiente, usar os campos JSON diretamente:

```logql
| json | jobId="agent-v2-inactivity-session-1-..."
| json | event="agent_v2_inactivity_followup.failed"
| json | component="worker" | stage="dispatch" | status="failed"
```

Para um `jobId`, deve ser possível reconstruir cronologicamente `scheduled`, eventual `canceled`, `worker_received`, `claimed` e `dispatched` ou `failed`.

## Acceptance Criteria

- Um Agente V2 com `onNoReply.automationId` mantém exatamente um registro `PENDING` por sessão.
- Cada mensagem inbound válida cancela a geração anterior e agenda uma nova com `jobId` único.
- O worker dispara somente quando consegue alterar seu registro de `PENDING` para `UNANSWER`.
- Cancelamento manual, sessão encerrada, conta divergente, contato/canal deletado ou ownership alterado impedem o disparo.
- O job corrente usa `ranBy.agentId` e o nome atual do agente carregado pelo worker.
- `ContactsFollowUpScheduled` permanece a única fonte de verdade do estado do follow-up.
- O Assistant V1 continua passando pelo ramo legado sem alteração comportamental.
- Logs são JSON estruturado, pesquisáveis por `event`, `component`, `stage`, `status`, `jobId`, IDs de negócio, `reason` e campos normalizados de erro.
- Um único `jobId` permite reconstruir no Grafana o ciclo desde o agendamento até cancelamento, descarte, dispatch ou falha.
- Nenhuma nova fila, chave Redis, migration, dependência, mudança no front ou alteração no `chatfunnel-services` é necessária.

## Rollout Order

1. Implantar `chatfunnel-api` com agendador e ramo V2 do worker no mesmo release.
2. Confirmar que o scheduler já possui `automationAssistantFollowUpQueue` e a rota atual registrada.
3. Executar smoke test com conta interna e delay de um minuto.
4. Monitorar logs `skipped`, `dispatched` e `failed`.

## Explicitly Out of Scope

- Implementar `inactivityFollowup.onReply` no Agente V2.
- Alterar ou corrigir débitos técnicos do Assistant V1.
- Criar uma fila `automationAgentFollowUpQueue`.
- Criar estado Redis para geração ou locks adicionais.
- Adicionar `agentId`, `sessionId` ou `sourceType` a `ContactsFollowUpScheduled`.
- Alterar editor, contratos MCP ou migração de agentes.
- Garantir entrega exactly-once entre PostgreSQL e scheduler.
- Executar build, migration ou banco real.
