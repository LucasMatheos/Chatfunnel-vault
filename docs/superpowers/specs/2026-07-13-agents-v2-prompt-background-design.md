# Agents V2 — Geração de prompt em background (creation mode BASIC)

- **Data:** 2026-07-13
- **Status:** Aprovado (aguardando review do spec)
- **Contexto anterior:** [[docs/AgentsV2/front-creationmode-tasks.md]], [[docs/AgentsV2/backend-creationmode-tasks.md]], `vault/wiki/features/agents-v2-creation-mode.md`

## Problema

Hoje, ao salvar um agente V2 no modo **BASIC**, o front chama `buildPromptStream` (SSE), mostra o
prompt gerado num modal e o usuário **espera** o streaming terminar antes de confirmar o salvamento.
Isso trava o usuário numa operação que depende de latência de LLM.

## Objetivo

Tornar a geração de prompt do BASIC **assíncrona**: o usuário salva, volta imediatamente para a
listagem, e o card do agente exibe um status de loading ("Construindo" / "Atualizando") enquanto a
geração roda em background. Ao terminar, um evento websocket avisa o front, que atualiza o card
in-place. O modo ADVANCED (usuário escreve o prompt) salva direto, pronto.

## Escopo (decisões fechadas)

1. **Só BASIC vai para background.** ADVANCED salva direto com status pronto — não entra na fila,
   não mostra loading.
2. **Status persistido** numa coluna do agente (`promptStatus`), não só em memória — sobrevive a F5.
3. **Falha:** status `FAILED` + botão "Tentar novamente" no card (reenfileira). BullMQ faz retry
   automático com backoff antes de marcar FAILED.
4. **SSE removido:** os endpoints `build-prompt-stream` e `:id/rebuild-prompt-stream` e os métodos
   `*Stream` do `PromptBuildService` saem. Background substitui toda a geração. Não há mais preview
   síncrono / botão "Acesse o prompt".
5. **Worker** roda no `chatfunnel-services` (serviço de filas + dono do `PromptBuildService`).
6. **Card não fica clicável durante BUILDING** (desabilitado); só o "Tentar novamente" do estado
   FAILED é interativo.

## Fluxo (data flow)

```
[Front] salva agente BASIC (create/update via REST)
   │
   ▼
[services] create/update:
   • persiste agente com promptStatus = BUILDING
   • enfileira job BullMQ { agentId, accountId, op }
   • RETORNA o agente já (sem esperar)
   │
   ▼
[Front] recebe agente (BUILDING) → navega pra listagem → card em loading (desabilitado)
   │
[services · worker] processa job:
   • PromptBuildService.buildPrompt() (não-stream, texto completo)
   • update: systemPrompt + promptStatus = READY
   • publica no Redis → websocket server → front (evento scopeado ao account)
   │  (falha após N tentativas → promptStatus = FAILED + evento)
   ▼
[Front] handler websocket atualiza o card in-place (READY / FAILED)
   • FAILED → botão "Tentar novamente" → POST /agents-v2/:id/rebuild-prompt
```

**ADVANCED:** salva direto com `promptStatus = READY`; não enfileira.

## Componentes

### chatfunnel-core
- `schema.prisma`: novo enum `AgentPromptStatus { BUILDING READY FAILED }` + coluna `promptStatus`
  na tabela de agents-v2 (default coerente: `READY` para linhas legadas/ADVANCED).
- Migration `--create-only` (regra do repo — nunca `db push`/`migrate deploy`).
- `findMany`/`findOne`/`findOneWithRelations` já retornam a row inteira → `promptStatus` vem de graça.

### chatfunnel-services (módulo `agents-v2`)
- `create`: BASIC → `promptStatus: BUILDING` + enfileira job; ADVANCED → `promptStatus: READY`.
- `update`: BASIC → volta a `BUILDING` + reenfileira; ADVANCED → mantém READY.
- **Processor BullMQ** (`agent-prompt.processor.ts`): consome o job, chama
  `PromptBuildService.buildPrompt()`, persiste `systemPrompt` + status, emite websocket.
  - **Guard de corrida:** só grava se o job ainda for o mais recente para aquele agente
    (comparar por timestamp/versão do enfileiramento) — evita que um job antigo sobrescreva
    o resultado de uma edição posterior.
- **Endpoint retry** `POST /agents-v2/:id/rebuild-prompt`: status → BUILDING + reenfileira.
- **Remover:** rotas `build-prompt-stream`, `:id/rebuild-prompt-stream` (controller) e os métodos
  `*Stream` do `PromptBuildService`. Consolidar num `buildPrompt()` síncrono que retorna o texto
  completo (já existe uma versão não-stream a reaproveitar).
- **Emit websocket:** publica no Redis pub/sub (mesmo bridge usado por CRM/livechat), evento
  `agent-v2:prompt-status` com payload `{ agentId, status }`, **scopeado à room do account**
  (multi-tenancy — nunca vazar cross-account).

### chatfunnel-front
- `AgentsForm/index.vue`: `handleSave` → só `createAgentV2`/`updateAgentV2` → navega pra lista.
  Remove todo o streaming, `startStream`, o modal de confirmação de prompt e refs relacionadas.
- `AgentsV2Service`: remove métodos de stream; adiciona `rebuildPrompt(id)`.
- `AgentCard.vue`: renderiza `promptStatus`:
  - `BUILDING` → spinner + label "Construindo" / "Atualizando"; **card desabilitado**.
  - `FAILED` → estado de erro + botão "Tentar novamente" (único elemento interativo).
  - `READY` → card normal.
  - **Label heurística (sem coluna extra):** se o agente nunca teve prompt (`systemPrompt` vazio)
    → "Construindo"; se já tinha (edição BASIC) → "Atualizando".
- Store da listagem: assina `agent-v2:prompt-status` e atualiza o agente in-place; desinscreve no
  unmount (`socket.offCustom`).
- i18n: strings dos estados (`enums`/labels).

## Edge cases
- **Editar durante BUILDING:** novo save reenfileira; o processor descarta resultado de job
  obsoleto (guard por status/timestamp).
- **F5 durante BUILDING:** card lê `promptStatus` persistido → continua "Construindo". ✅
- **Execução do agente enquanto BUILDING:** runtime do agents-v2 ainda não implementado — fora de
  escopo; quando existir, bloquear execução se `promptStatus != READY`.

## Testes (mínimos)
- **Processor:** sucesso grava `systemPrompt` + `READY`; falha após retries → `FAILED`; job
  obsoleto é descartado pelo guard.
- **Service:** BASIC create/update → `BUILDING` + enqueue; ADVANCED → `READY` sem enqueue.
- **Front:** `AgentCard` renderiza os 3 estados (incluindo desabilitado em BUILDING); handler de
  websocket atualiza o agente in-place na listagem.

## Fora de escopo
- Runtime de execução do agente com tools/imagens (ainda não implementado no agents-v2; roda no
  `chatfunnel-api`).
- Preview/edição manual do prompt sob demanda (o antigo "Acesse o prompt").
