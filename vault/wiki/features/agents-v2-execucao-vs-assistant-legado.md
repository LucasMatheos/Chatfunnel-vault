---
title: Agents V2 vs Assistant Legado — Fluxo de Execução
description: Passo a passo comparado de como uma mensagem do contato chega até a resposta entregue, nos dois sistemas de IA conversacional do chatfunnel-api.
tags: [feature, agents-v2, assistant-legado, ai-agents, execution-flow, comparison]
related: ["[[ai-agents]]", "[[agents-v2-creation-mode]]", "[[agents-v2-prompt-build]]", "[[openai-sdk-map]]", "[[mcp-integration]]", "[[agents-v2-assistant-execution-gotchas]]"]
last_updated: 2026-08-10
---

# Agents V2 vs Assistant Legado — Fluxo de Execução

Os dois sistemas coexistem em `chatfunnel-api` — **não é migração exclusiva**. A mesma
conta, ou até a mesma automação, pode ter steps V2 e steps legados ao mesmo tempo. A
bifurcação é sempre por **step de automação** (`agentId` → V2, `assistantId` → legado),
decidida no momento em que o step foi configurado no builder.

## 0. Onde a bifurcação acontece

- `fragments/HandlerIGAutomation.js:361-425` (`_handleAssistant`/`_sendCommentResponse`)
  — comentário de automação (Instagram): `trigger.answerAgentId` → V2, senão
  `trigger.answerAssistantId` → legado.
- `fragments/HandlerIGAutomation.js:2120-2180` — step tipo `ASSISTANT`: `step.agentId`
  setado → V2 (`createHandlerAgent`, despacho por `step.assistantType`:
  `START_ASSISTANT`/`BLOCK_ASSISTANT`/`STOP_ASSISTANT`); senão → legado
  (`HandlerAssistant` + `step.assistantId` + `account.openaiKey`).
- `handleActiveAgentSession.js:17-47` — intercepta **antes** do trigger-matching: se já
  existe `AgentSession` ativa (V2) pro contato+canal, vai direto pro V2 e aborta o
  pipeline. O legado não tem sessão dedicada — retoma via linha em
  `iGAutomationsStepsInProgress` (`getPendentStepContext.js:10-31`).
- `createHandlerAgent.ts:14-29` — dentro do V2, escolhe `AnthropicHandlerAgent` vs
  `OpenAIHandlerAgent` por `agent.providerType`.

---

## 1. Fluxo Agents V2

Código-fonte: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/`.

### 1.1 Buffer + debounce (agrupar rajada em um turno)

`HandlerAgent.execute()` (`HandlerAgent.ts:359-469`):
1. `isContactAgentBlocked` (`agentBlockGuard.ts:9-21`) e `isWithinServiceHours`
   (`serviceHours.ts`) — abortam se bloqueado / fora do horário.
2. Resolve a sessão (`existingSession` ou `findOrCreateSession`).
3. `session.ignoreMessages` (pausada por loop) → aborta **sem** enfileirar a mensagem
   (ver gotcha #3).
4. `session.awaitingRating` → desvia pra `handleRatingResponse()`. `exitWord` →
   `terminateSession`.
5. `agentMessageBuffer.enqueue` (`redis/AgentMessageBuffer.ts:50-54`, RPUSH+EXPIRE em
   `agent:msgs:<sessionId>`).
6. Se `agentSessionLock.isHeld(sessionId)` → só loga (o worker em execução vai
   reprocessar). Senão → `scheduleDebounce`.
7. `scheduleDebounce` → `agentDebounce.trySchedule` (`redis/AgentDebounce.ts:28-33`, TTL
   15s): já havia debounce ativo → `rescheduleProcessSessionJob` (janela deslizante);
   senão → `addProcessSessionJob` (`queue/AgentSessionQueue.ts:49-58`, `delay:10_000`,
   `jobId: process_<sessionId>` — BullMQ deduplica por esse ID).

Efeito: N mensagens rápidas do contato disparam **uma** chamada ao LLM, 10s após a
última mensagem da rajada.

### 1.2 Fila e worker

`AgentSessionWorker.processSessionJob` (`queue/AgentSessionWorker.ts:62-423`, BullMQ,
concorrência 50):
1. Carrega `agent`+`session`, instancia o handler do provider certo.
2. Checa `agentSessionCancel.isCancelled` + `isContactAgentBlocked` **antes** de
   qualquer trabalho (cobre a race "StopAssistant chegou antes da sessão existir").
3. Checa `isWithinServiceHours` de novo, adquire `agentSessionLock`, limpa o debounce.
4. Loop `while(true)` até `MAX_PROCESSING_ITERATIONS` (10, env
   `AGENT_LOOP_MAX_ITERATIONS`):
   - `agentMessageBuffer.consumeAll` (Lua LRANGE+DEL atômico) — vazio → `break`.
   - Persiste cada mensagem como `USER`, roda `agentLoopDetector.recordMessage` (loop
     bot-a-bot → `pauseForLoop` + `break`).
   - Dispara automações `firstInteraction`/`everyMessage`.
   - `getAugmentedSystemPrompt` + `buildLLMMessages` → refresh do lock → `callLLM`.
   - Erro não-retryable (400/401/403) → `agent.errorMessage` + `UnrecoverableError`;
     qualquer outro erro → BullMQ re-tenta (3x, backoff 5s→10s→20s).
   - `finishReason === "tool_use"` → `executeToolLoop`.
   - Re-checa sessão ainda ativa/não cancelada antes de persistir/enviar a resposta.
   - Persiste como `ASSISTANT` e chama **`sendResponseToContact`**.
   - Objetivo concluído → `onObjectiveComplete` + arma expiração + `break`.
   - `checkAndRelease` (Lua atômico): buffer vazio → libera lock e sai; chegaram
     mensagens durante o processamento → mantém o lock e repete o `while` (sem
     re-agendar via fila).
5. `finally` libera o lock incondicionalmente. Evento `"failed"` (retries esgotados)
   libera o lock, manda `agent.errorMessage`, `terminateSession({endReason:"INTERRUPTED"})`.

### 1.3 Lock e cancelamento

- `redis/AgentSessionLock.ts` — `SET NX EX` + Lua compare-and-* pra nunca
  liberar/renovar um lock que já expirou e foi retomado por outro worker.
- **"Encerrar" vs "Encerrar e bloquear"** (`StopAssistant.js:88-161`) — já unificado
  entre os dois sistemas: consulta se existe sessão V2 ativa; se sim,
  `agentSessionCancel.markCancelled` + `terminateSession({endReason:"INTERRUPTED"})`;
  senão cai no legado (`handlerAssistant.expireAssistant`). "Bloquear" seta
  `contactsChannels.blockedAgent=true` nos dois casos.
- `AgentLoopDetector.ts` — contador deslizante por sessão (threshold padrão 15
  msgs/300s) contra loop bot-a-bot; `pauseForLoop`/`resumeLoop`
  (`HandlerAgent.ts:1828-1888`) implementam o botão "Continuar atendimento".

### 1.4 Núcleo `HandlerAgent.ts`

- `getAugmentedSystemPrompt` (`:1634-1689`): `buildAntiPromptLeakPrompt` (guardrail
  fixo) + `<exact instructions>` (prompt do dono do agente) + blocos condicionais
  (DATA_MAPPING, HUMAN_HANDOFF, OBJECTIVES, `buildStructuredResponsePrompt` se
  `responseFormat==="JSON"`, `available-images`).
- `sendResponseToContact` (`:849-880`) — despacha pra `dispatchStructuredResponse`
  (JSON) ou `sendTextChunks` (texto puro). Fix recente: `{"messages":[]}` (envelope
  válido vazio) não deve cair no fallback de texto — ver [[agents-v2-assistant-execution-gotchas]].
- `sendTextChunks` (`:896-1003`): `sanitizeMarkdown` → `splitMessage` → chunk a chunk,
  com delay adaptativo + indicador "digitando".
- `dispatchStructuredResponse` (`:1109-1176`): despacha item a item
  (text/image/link/button/buttons/audio).
- `persistOutgoingMessage` é **fire-and-forget** em todos os pontos de envio (sem
  `await` — ver gotcha #5).

### 1.5 Providers

Contrato comum (`buildLLMMessages`, `callLLM`, `executeToolLoop`, `parseApiError`,
`injectReferenceFiles`), `MAX_TOOL_ITERATIONS=10` hardcoded e duplicado nos dois
arquivos.

- **Anthropic** (`providers/AnthropicHandlerAgent.ts`): `system` como parâmetro
  separado; streaming só quando há `preparedFiles` (limite de 10min da API não-stream);
  tool results num único `role:"user"` com blocos `tool_result`; prompt caching
  (`cache_control:{type:"ephemeral"}`).
- **OpenAI** (`providers/OpenAIHandlerAgent.ts`): sempre não-streaming;
  `response_format:{type:"json_object"}`; tool results em `role:"tool"` nativo; upload
  de PDFs pra Files API com fallback silencioso pra base64.
- Ambos chamam `AgentToolExecutor.ts:44-181` — roteamento por nome: MCP (`mcp__...`) →
  automação → calendário → data mapping → human handoff → objetivo (signal-only) →
  `externalQueries` (HTTP configurável).

### 1.6 MCP tools

- Descoberta (`tools/mcp/mcpToolDiscovery.ts`): cacheada no Redis por `connectionId`
  (TTL 300s), manager efêmero só pro `listTools`.
- Execução: manager separado, vivo durante todo o `executeToolLoop` de um turno (reuso
  de conexão entre chamadas do mesmo turno), descartado no `finally`.
- Suporta `bearer`/`oauth`/`none`, fallback HTTP→SSE, lock Redis por conexão pra
  serializar refresh de OAuth token. Ver [[mcp-integration]].

---

## 2. Fluxo Assistant Legado (OpenAI Assistants API)

Código-fonte: `HandlerAssistant.js`, `common/utils/Assistant.js`,
`commands/assistant/*`, `commands/workers/Expire*Worker.js`.

### 2.1 Entrada e debounce

- `HandlerAssistant.execute(assistantId, ...)` (`HandlerAssistant.js:1633`) — checa
  `contactsChannels.blockedAgent`, busca thread existente
  (`findAndSetRunningThread:128-140`, uma linha em `openaiAssistantsThreads` por
  `contactId`+`channelId`). Aborta se `runningThread.ignoreMessages` (retry em
  andamento).
- Verifica expiração (`_isExpired():3116-3129`) — thread mais velha que
  `assistant.duration` ou trocou de assistant → `expireAssistant` + reprocessa via novo
  POST pro próprio gateway (com guarda contra loop infinito).
- **Sem thread** (`firstInteraction`): cria thread OpenAI já populada com histórico (até
  30 msgs, se `useHistory`) + dados do contato como 1ª mensagem. Persiste em
  `openaiAssistantsThreads`, agenda job de expiração (BullMQ,
  `_getAssistantDelay():3108-3114`). Resposta roda em Promise fire-and-forget.
- **Com thread**: empilha em debounce Redis (`_pushDebounceMessage:2090`) e agenda
  **`setTimeout(...,10000)` em memória do processo** (`:2110`) — não achei mecanismo de
  recuperação se o processo reiniciar nesses 10s (ver gotcha #4).

### 2.2 Ciclo de vida do run (`handleResponse`, `HandlerAssistant.js:458-648`)

1. Drena run anterior ativo na mesma thread — polling a cada 100ms, até 3min
   (`runs.list`); timeout → retorna `undefined` silenciosamente.
2. Adiciona mensagem do contato na thread (`threads.messages.create`) — pula em retry.
3. Cria o run (`threads.runs.create`). Falha na criação → manda
   `assistant.errorMessage` pro contato, retorna `null`.
4. Novo polling (100ms, até 3min). `status === "requires_action"` →
   `handleAssistantFunctions` (tool calls) → `submitToolOutputsAndPoll`.
5. Run não `"completed"`: `rate_limit_exceeded` → alerta admin + `errorMessage` pro
   contato; senão, 1ª falha → `handleRetryFailedRun` (recria thread do zero com
   histórico, `ignoreMessages:true` durante o retry); 2ª falha → loga "already retried"
   e retorna `null` **sem avisar o contato** (ver gotcha #3 do legado).
6. Sucesso: busca mensagem da thread filtrando por `run_id`.

### 2.3 Function/tool calling

`handleAssistantFunctions` (`:320-456`) — casos hardcoded pra Google Calendar
(`get/create/cancel/search_google_calendar_*`) + `default` delega pra
`HandlerAssistantFunctions` (funções HTTP customizadas do usuário). Não há roteamento
nativo tipo MCP — é tudo hardcoded ou HTTP genérico.

### 2.4 Entrega da resposta

- `handleJsonAssistantMessage` → `parseAssistantMessage` (`:2270-2325`): se assistant
  tem arquivos anexados (`hasJsonResponse===false`), tenta detectar JSON inline em
  texto solto via regex; senão parseia como JSON puro (`sanitizeAssistantJSON` +
  fallback `jsonrepair`) — **mesmo design de envelope** que inspirou o
  `structuredResponse.ts` do Agents V2 (`{"messages":[...]}` ou array bruto). Falha no
  parse → fallback de texto puro.
- Despacha por tipo (`text`/`image`/`link`/`button`/`buttons`) — mensagens de texto
  adjacentes a `buttons` são usadas como legenda, não mandadas soltas.
- Cada envio persiste via `createMessage` e emite `global.signalR.emit` (canal
  realtime **próprio**, diferente do Socket.IO usado no resto do produto).

### 2.5 Expiração/cleanup

- `ExpireAssistantWorker.js` — reconstrói `HandlerAssistant` do payload do job BullMQ e
  chama `expireAssistant({onDelete})`.
- `expireAssistant()` (`HandlerAssistant.js:2855-2999`) — desmarca `servedByAssistant`,
  roda automação `endSession`, manda `finalMessage` opcional, apaga linha de
  `openaiAssistantsThreads` — **mas o delete da thread real na OpenAI está comentado**
  (código morto, `:2940-2942`) — threads nunca são deletadas na conta OpenAI por esse
  caminho.
- `ExpireAssistantCommentWorker.js` (threads de **comentário** do Instagram) — esse sim
  chama `openai.beta.threads.del()`, engolindo erro em `catch{}`.

### 2.6 Gestão / realtime

- `Assistant.js` centraliza `buildOpenaiObject` (tools, `response_format:"json_object"`
  só quando não há arquivos) e `buildInstructions` (mesmo formato JSON de resposta que
  o V2 herdou). Limites de plano hardcoded (1/5/20 assistants por STARTER/PREMIUM/
  ADVANCED, com bypass hardcoded pra uma conta específica).
- `AssistantWebsocket.js` — Socket.IO **separado**, porta própria, só pra testar
  assistant no builder — atualmente com `return` logo na conexão, desativando toda a
  lógica (ver gotcha #2 do legado — não fica claro se é intencional).

---

## 3. Comparação lado a lado

| Aspecto | Agents V2 | Assistant Legado |
|---|---|---|
| Agrupamento de rajada | Redis (buffer) + BullMQ (debounce/delay job), sobrevive restart | Redis (buffer) + `setTimeout` **em memória do processo** — não sobrevive restart |
| Concorrência por sessão | `AgentSessionLock` (Redis, `SET NX EX` + Lua) | Nenhum lock dedicado — depende do polling de `runs.list` pra evitar 2 runs simultâneos na mesma thread |
| Formato de resposta | JSON estruturado nativo (mesmo design do legado) | JSON estruturado (design original) ou texto puro |
| Tool calling | Nativo por provider (Anthropic/OpenAI) + MCP + tools internas | Hardcoded (Google Calendar) + HTTP genérico via `HandlerAssistantFunctions` |
| Anti-loop bot-a-bot | `AgentLoopDetector.ts` dedicado | Não encontrado nenhum mecanismo equivalente |
| Controle "Encerrar"/"bloquear" | Unificado em `StopAssistant.js` | Unificado em `StopAssistant.js` (mesmo endpoint) |
| Expiração de sessão | BullMQ job configurável | BullMQ job + thread OpenAI (delete comentado num dos dois workers de expiração) |
| Realtime | Socket.IO do produto | `global.signalR` (canal próprio) + socket dedicado de teste (desativado) |
| MCP | Nativo (`tools/mcp/`) | Não existe |

## 4. Gotchas

Lista completa de bugs/pontos frágeis encontrados na leitura do código:
[[agents-v2-assistant-execution-gotchas]].
