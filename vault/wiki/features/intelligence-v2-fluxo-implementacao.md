# Intelligence V2 — Fluxo de implementacao (A2A v2)

> Levantamento de tudo que foi alterado no front pra migrar do protocolo A2A v1 (eventos `block_*` + pares `tool_use`/`tool_result`) pro A2A v2 (eventos semanticos + `ResourceEnvelope`).
> Branch: `feature/intelligence-content-blocks`. Plano de execucao: `docs/superpowers/plans/2026-05-28-intelligence-v2-front-resource-events.md`.
> Documentos relacionados: [[intelligence-v2-arquitetura]] (estrutura final), [[intelligence-v2-component-map]] (catalogo), [[intelligence-v2-resource-events-front-plan]] (spec).

## 1. Visao geral do fluxo

O usuario digita uma mensagem -> o front faz POST pro servidor -> o servidor responde via SSE (Server-Sent Events, stream de eventos) -> o front interpreta cada evento e atualiza a UI em tempo real.

```
Browser                            chatfunnel-services
  |                                       |
  | POST /a2a/chat                        |
  | ------------------------------------> |
  |   X-A2A-Protocol-Version: 2           |
  |                                       |
  |   SSE stream                          |
  | <------------------------------------ |
  |                                       |
  |  text_delta "Ola, "                   |
  |  text_delta "vou listar"              |
  |  text_end                             |
  |  tool_invocation list_automations     |
  |  resource  envelope(automation:abc)   |
  |  resource  envelope(automation:def)   |
  |  tool_status ok                       |
  |  done                                 |
  |                                       |
```

A mudanca central do v1 pro v2: **dados de mundo (automacoes, contatos, tags) viram `ResourceEnvelope` com identidade propria (`envelopeId`)**. O front guarda envelopes num store local — o mesmo envelope pode ser reapresentado depois sem rebusca (mecanismo de cache via `present_resource`).

## 2. Camadas e por que cada arquivo mudou

### 2.1 Tipos (contrato)

Importam tipos canonicos de `@chatfunnel/contracts/a2a`. So aliases — nao tem logica.

| Arquivo | Por que mudou |
|---|---|
| `types/content-block.ts` | Trocou `A2aContentBlock` v1 por `PersistedBlock` v2. Cada bloco persistido em mensagem agora e um de: `text`, `tool_invocation`, `resource_ref`, `tool_status`, `delegation`. |
| `types/message.ts` | `UserMessage.content` e `AssistantMessage.content` viraram `PersistedBlock[]`. |
| `types/sse-event.ts` | Extracts do union `A2aSseEvent` v2 (`text_delta`, `text_end`, `tool_invocation`, `resource`, `tool_status`, `delegation_start`, `delegation_end`, `done`, `error`, `cancelled`). |

### 2.2 Parser SSE (le o stream)

| Arquivo | Por que mudou |
|---|---|
| `utils/sse-parser.ts` | Reescrito pra validar tipo de evento contra `A2A_SSE_EVENT_TYPES` (whitelist do contrato). Eventos desconhecidos sao descartados — protocolo e fail-soft. |

### 2.3 Servico HTTP

| Arquivo | Por que mudou |
|---|---|
| `common/services/IntelligenceV2Service.ts` | Adicionou header `X-A2A-Protocol-Version: 2` em `streamChat`. Tipou `ConversationMessagesResponse.resources` (mapa `envelopeId -> ResourceEnvelope` retornado pelo historico). |

### 2.4 Store de envelopes (coracao do cache)

| Arquivo | Por que mudou |
|---|---|
| `composables/useResourceCache.ts` | NOVO. Composable que mantem um `Map<envelopeId, ResourceEnvelope>` em memoria. Implementa dedupe last-write-wins (replay sobrescreve fresh) e lookup por `toolCallId`. |

### 2.5 State machine (composable principal)

| Arquivo | Por que mudou |
|---|---|
| `composables/useIntelligenceChat.ts` | Reducer reescrito do zero. Cada evento SSE entra em `_applyEvent` e gera um `PersistedBlock` na mensagem corrente, ou grava envelope no store. `loadConversation` hidrata o store com `res.resources` do historico (replay). |

### 2.6 Registry (dispatch por kind)

| Arquivo | Por que mudou |
|---|---|
| `registry/resource.registry.ts` | NOVO. Mapa `ResourceKind -> { component, extractData }`. O eixo de despacho deixou de ser `toolName` (v1) e passou a ser `kind` (v2). Razao: duas tools que produzem o mesmo kind (`list_automations` e `get_automation` ambos produzem `automation`) reusam o mesmo componente. |

### 2.7 Componentes de mensagem (UI principal)

| Arquivo | Por que mudou |
|---|---|
| `components/messages/ContentBlockList.vue` | Agrupa `tool_invocation` + `resource_ref` + `tool_status` que compartilham o mesmo `tool_invocation.id`, e renderiza um `ToolCallCard` por grupo. |
| `components/messages/ToolCallCard.vue` | Props novas: `invocation` + `status` + `resources`. Decide o estado visual (`running` / `done` / `error` / `cancelled`) a partir do `tool_status`. Quando tem resources, delega pro `ResourceRenderer`. |
| `components/messages/ResourceRenderer.vue` | NOVO. Recebe `ResourceEnvelope[]`, agrupa por `kind`, resolve o componente via `resolveRenderer` do registry e renderiza com `extractData`. |
| `components/messages/AssistantMessage.vue` | Heuristica `hasContent` atualizada pra reconhecer os tipos v2 (text, tool_invocation, resource_ref, tool_status, delegation). |

### 2.8 Componentes de resultado (folhas)

Cada componente abaixo recebe os dados ja extraidos do envelope pelo registry. Nao chamam mais o validador v1 (que foi removido). O servidor garante o shape via Zod antes de emitir o envelope.

- `AutomationList.vue`, `TemplateList.vue`, `KanbanCardList.vue`, `ChannelList.vue` — listas
- `ContactResult.vue` — modo single (`get_contact`) ou lista (`search_contacts`)
- `DiscoveryChips.vue` — kinds que viram chips (tag, tag_folder, custom_field, moderator, assistant, agent_v2, media, kanban_board)
- `AgentResult.vue` — reservado pra delegation (Fase 3)
- `GenericJsonResult.vue` — fallback pra kinds nao mapeados
- `BuildSummary.vue` — resumo de `automation_draft`
- `DetailCard.vue` — detalhe generico

### 2.9 Dead code removido (cleanup do v1)

Removidos nesta sessao porque tinham zero consumidores apos a migracao:

- `registry/tool-result.registry.ts` (v1, despachava por `toolName`)
- `components/messages/tool-results/ListResult.vue` (wrapper de listas v1)
- `components/messages/tool-results/ActionResult.vue` (wrapper de acoes v1)
- `components/messages/tool-results/ToolResultFallback.vue` (banner "Resultado fora do contrato")
- `utils/tool-output-validator.ts` + `.spec.ts` (validador Zod local — substituido pela validacao server-side)

### 2.10 Bug fix nesta sessao

| Arquivo | Por que mudou |
|---|---|
| `utils/tool-label.ts` | Adicionou entrada `present_resource: "Recuperando dados"`. O servidor emite `tool_invocation` com `name: "present_resource"` quando reapresenta envelopes do cache; sem entrada no `tool-label`, o chip mostrava o nome cru. |

## 3. Como ler o fluxo na pratica

Exemplo: usuario manda "Liste minhas automacoes".

1. **`ChatInput.vue`** dispara `sendMessage("Liste minhas automacoes")` do `useIntelligenceChat`.
2. **`useIntelligenceChat.sendMessage`** chama `IntelligenceV2Service.streamChat()`.
3. **`IntelligenceV2Service.streamChat`** abre POST com header `X-A2A-Protocol-Version: 2`. Servidor responde com stream SSE.
4. Loop de leitura usa **`parseSseChunk`** pra extrair eventos do buffer.
5. Cada evento entra em **`_applyEvent`**:
   - `text_delta "Aqui estao"` -> acrescenta a um bloco `text` aberto
   - `text_end` -> fecha o run de texto
   - `tool_invocation { id: tc-1, name: list_automations }` -> adiciona bloco `tool_invocation`
   - `resource { envelope: automation:abc }` -> grava no `useResourceCache` + adiciona bloco `resource_ref`
   - `resource { envelope: automation:def }` -> idem
   - `tool_status { id: tc-1, status: ok }` -> adiciona bloco `tool_status`
   - `done` -> seta `isStreaming = false`
6. **`ContentBlockList.vue`** ve os blocks e agrupa: 1 grupo `tool` com `invocation tc-1` + 2 `resource_ref` + `tool_status ok`.
7. Renderiza **`ToolCallCard`** com `invocation`, `status`, `resources` (resolvidos do store via `envelopeId`).
8. **`ToolCallCard`** mostra chip "Automacoes" verde + delega pro **`ResourceRenderer`**.
9. **`ResourceRenderer`** agrupa envelopes por `kind` (`automation`), chama `resolveRenderer('automation')`, recebe `{ component: AutomationList, extractData: wrap('automations') }`.
10. **`AutomationList.vue`** renderiza os 2 cards de automacao.

## 4. Como o cache (`present_resource`) entra

Em conversas longas, o agente pode querer mostrar de novo um envelope ja carregado. Em vez de rechamar a tool MCP (latencia + carga no banco), ele emite:

```
tool_invocation { id: tc-2, name: present_resource }
resource { envelope: automation:abc, source: "replay" }
tool_status { id: tc-2, status: ok }
```

O front trata identico ao caso normal — `useResourceCache.put()` faz last-write-wins (replay sobrescreve fresh), `ResourceRenderer` renderiza pela mesma rota. O chip do `tool_invocation` aparece com label "Recuperando dados" (gracas a entrada adicionada em `tool-label.ts`).

**Risco em aberto:** invalidacao de cache apos mutacao (criar automacao + listar de novo). Depende de o servidor decidir entre rechamar a tool ou reapresentar. Investigacao pendente em `chatfunnel-services`.

## 5. Out of scope (proximos planos)

- Renderizacao real de sub-thread em `delegation` (hoje e placeholder)
- Banner pra `schemaVersion` desconhecida
- Animacoes de estado parcial (skeleton refinado enquanto chega stream)
- Metricas de hit/miss no `useResourceCache`
- Estrategia de invalidacao de cache (mencionada em #4)

## 6. Estado atual (06/05/2026)

- Plano de execucao: Tasks 1-14 concluidas (incluindo Task 14 de cleanup nesta sessao).
- Smoke test (`docs/superpowers/plans/2026-05-29-intelligence-v2-fase2-smoke-test.md`): resultados ali sao STALE (foram capturados em estado intermediario do branch). Precisa ser re-rodado pra refletir o estado atual.
- Bug aberto: 2+ chips de `present_resource` aparecendo em respostas curtas (label corrigido, mas comportamento de fundo pode merecer investigacao no servidor).
