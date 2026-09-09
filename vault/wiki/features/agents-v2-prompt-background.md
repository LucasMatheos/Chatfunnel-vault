---
title: Agents V2 — Geração de Prompt em Background (modo BASIC)
description: Fluxo assíncrono de geração do system prompt via fila BullMQ + websocket, com estados do card (Construindo/Pronto/Falhou) e retry manual.
tags: [agents-v2, background-job, websocket, bullmq, feature]
related: ["[[agents-v2-prompt-build]]", "[[agents-v2-creation-mode]]", "[[ai-agents]]"]
last_updated: 2026-07-13
---

# Agents V2 — Geração de Prompt em Background (modo BASIC)

No modo **BASIC**, o system prompt do agente é gerado por LLM a partir dos 14 campos do formulário. Antes isso era síncrono (SSE/streaming, bloqueando o save). Agora é **assíncrono**: o usuário salva, volta pra listagem na hora, e o card mostra "Construindo/Atualizando" enquanto um worker gera o prompt em background e avisa o front por websocket.

O modo **ADVANCED** (prompt escrito à mão) continua `READY` na hora — não enfileira nada.

## Visão geral do fluxo

```
[AgentsForm] save ──► POST /agents-v2 (create/update)
                          │  promptStatus = BUILDING + enfileira job
                          ▼
                    [BullMQ: agent-prompt-queue]  (jobId = agentId, attempts:1)
                          ▼
                    [AgentPromptProcessor.process]
                          │  PromptBuildService.buildPrompt (Anthropic/OpenAI)
                          ├─ ok    → update(systemPrompt, READY)  + emit READY
                          └─ erro  → update(FAILED)               + emit FAILED(error)
                          ▼
                    [AgentSocket → global.signalR] emit("broadcast", {to: accountId, payload})
                          ▼
                    [chatfunnel-websocket] io.sockets.emit(accountId, payload)
                          ▼
                    [App.vue] socket.on(accountId) → switch(evt.type) → eventBus.emit("prompt-status")
                          ▼
                    [AgentsList] eventBus.on("prompt-status") → atualiza card in-place + toast
                          ▼
                    [AgentCard] BUILDING=blur+spinner | FAILED=retry | READY=normal
```

## Passo a passo

### 1. Front — salvar (não espera o prompt)
`chatfunnel-front/src/views/agents/AgentsForm/index.vue` → `handleSave`:
- valida, chama `AgentsV2Service.createAgentV2` / `updateAgentV2`,
- mostra **toast info** ("Criando agente" / "Atualizando agente") — não "sucesso", porque nesse instante o agente ainda está `BUILDING`,
- navega pra `AgentsList` sem aguardar a geração.

### 2. Backend — service seta status + enfileira
`chatfunnel-services/.../agents-v2.service.ts`:
- `create`/`update`: se `creationMode === BASIC` → `promptStatus = BUILDING` e `enqueuePromptBuild(agentId, accountId)`; se `ADVANCED` → `READY`, sem fila.
- `enqueuePromptBuild` → `AgentQueueService.scheduleBuildPrompt({ agentId, accountId })`.

### 3. Fila BullMQ
`modules/queues/services/agent_queue.service.ts` (`AgentQueueService extends BaseQueueService`):
- `jobId = name = agentId` (dedup). No BullMQ, `add` com `jobId` existente é **ignorado** — por isso `scheduleBuildPrompt` faz `cancelJob(agentId)` **antes** de `addJob`, senão save→rebuild vira no-op.
- `defaultJobOptions: { attempts: 1 }` — **sem auto-retry** (decisão de projeto). O retry é manual pelo usuário.

### 4. Processor
`modules/queues/processors/agent_prompt.processor.ts` (`@Processor("agent-prompt-queue")`, `WorkerHost`):
- `findById(agentId, accountId)`; se o agente sumiu → skip (sem throw).
- `PromptBuildService.buildPrompt(formData, accountId, agentId, "rebuild")`.
- **Sucesso** → `update({ systemPrompt, promptStatus: READY })` + `emitStatus(READY)`.
- **Erro** → `update({ promptStatus: FAILED })` + `emitStatus(FAILED, message)` + `throw` (registra no failed set, sem retry).

### 5. Emit — classe `AgentSocket` (core)
`chatfunnel-core/src/sockets/agent.socket.ts` (padrão de `KanbanSocket`/`ChatSocket`):
- `new AgentSocket(global.signalR, accountId).promptStatus(agentId, status, error)`.
- `BaseSocket.emitSocket` gera: `signalR.emit("broadcast", { to: accountId, payload: { type: "prompt-status", payload: { agentId, status, error } } })` — payload **aninhado** (`{type, payload}`).
- `global.signalR` é o **socket.io client** do services, configurado pelo `SignalRService` (requer env `WEBSOCKET_URL`; sem ela vira stub no-op).

### 6. WebSocket server
`chatfunnel-websocket`: recebe `"broadcast"` e faz `io.sockets.emit(data.to, data.payload)` — emite um evento **cujo nome é o `accountId`** pra todos os sockets (sem rooms; filtro no client).

### 7. Front — dispatcher central (`App.vue`)
Um único `signalR.socket.on(accountId, evt => switch(evt.type))` reemite cada tipo pro `eventBus`:
```js
case "prompt-status":
  eventBus.emit("prompt-status", evt.payload); // { agentId, status, error }
```

### 8. Front — `AgentsList`
`eventBus.on("prompt-status", onPromptStatus)` (e `off` no `onUnmounted`):
- acha o agente por `id`, atualiza `promptStatus` + flag `__wasReady` in-place,
- **toast**: `READY` → sucesso ("Agente criado/atualizado com sucesso"); `FAILED` → erro (usa `payload.error`).

### 9. Front — `AgentCard`
Computeds sobre `promptStatus`:
- `BUILDING` → overlay com **blur + spinner + "Construindo…"/"Atualizando…"** (bloqueia o card via `z-10`),
- `FAILED` → "Falha ao gerar o prompt" + botão **"Tentar novamente"** (`emit('rebuild')`),
- `READY` → botão "Editar" normal.

`__wasReady` distingue "Construindo…" (criação) de "Atualizando…" (edição de um agente que já estava `READY`).

### 10. Retry manual
`AgentsList.handleRebuildAgent(id)` → BUILDING otimista + `AgentsV2Service.rebuildPrompt(id, {})` → `POST /agents-v2/:id/rebuild-prompt` → `enqueueRebuild` (valida ownership, seta BUILDING, reenfileira). Volta ao passo 4.

## Contrato do evento

```jsonc
// no fio (chatfunnel-websocket → front), evento nomeado = accountId
{
  "type": "prompt-status",
  "payload": { "agentId": "uuid", "status": "READY|FAILED|BUILDING", "error": "string?" }
}
```
`status` `BUILDING` na prática é setado no banco (create/update/rebuild) e otimista no front; o websocket carrega principalmente `READY`/`FAILED`.

## Persistência
`Agents.promptStatus: AgentPromptStatusEnum { BUILDING, READY, FAILED }` (`@default(READY)` — protege legado e ADVANCED). Exposto no `select` do `findMany` (core) → a lista reflete o estado após F5.

## Gotchas (aprendidos na integração)

- **`WEBSOCKET_URL` no services** — sem ela, `SignalRService` instala stub no-op e **nenhum** emit do services sai (nem READY nem FAILED). Este foi o primeiro feature a emitir socket **a partir do services** (kanban/livechat emitem da `chatfunnel-api`).
- **`VITE_WS` do front tem que apontar pro mesmo ws server** que o services emite. Front em `wss://app...` (prod) + services em `localhost:10000` = broadcast nunca cruza.
- **`to: accountId`, não canal estático** — o front escuta no evento nomeado `accountId` (`App.vue`). Emitir `to: "agents-v2"` não chega em ninguém.
- **Payload aninhado `{type, payload}`** — o `App.vue` reemite `evt.payload`; se o emit fosse flat (`{type, agentId, status}`), o front receberia `undefined`.
- **HMR não recria o listener** — editar o `switch` do `App.vue` exige **hard reload** (o `initializeSignalR` não re-roda no HMR).
- **`AgentSocket` vive no core** — mudanças exigem rebuild+sync manual do `@chatfunnel/core`.
- **`temperature` deprecated** — modelos novos da Anthropic rejeitam o param no `callAnthropic`; foi removido (usa default da API).

## Arquivos-chave

| Camada | Arquivo |
|--------|---------|
| Front form | `chatfunnel-front/src/views/agents/AgentsForm/index.vue` |
| Front lista | `chatfunnel-front/src/views/agents/AgentsList/index.vue` |
| Front card | `.../AgentsList/components/AgentCard/AgentCard.vue` |
| Front dispatcher | `chatfunnel-front/src/App.vue` |
| Service | `chatfunnel-services/src/modules/agents-v2/agents-v2.service.ts` |
| Producer | `.../modules/queues/services/agent_queue.service.ts` |
| Processor | `.../modules/queues/processors/agent_prompt.processor.ts` |
| Build LLM | `.../modules/agents-v2/prompt-build.service.ts` |
| Socket (core) | `chatfunnel-core/src/sockets/agent.socket.ts` |
| WS server | `chatfunnel-websocket/src/index.ts` |
