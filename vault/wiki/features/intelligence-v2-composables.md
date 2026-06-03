---
type: feature
tags:
  - intelligence-v2
  - chatfunnel-front
  - composables
  - architecture
created: 2026-06-01
aliases:
  - Composables Intelligence V2
  - intelligenceV2 composables
---

# Intelligence V2 — Composables

Documentação técnica dos 4 composables que sustentam o chat Intelligence V2 no front. Cada um tem uma responsabilidade isolada e bem definida.

```
useResourceCache       ← cache provide/inject de envelopes (storage primitivo)
useIntelligenceChat    ← motor do chat: SSE streaming + reducer + paginação
useIntelligenceHistory ← lista lateral de conversas (CRUD do sidebar)
useHealthCheck         ← ping de saúde da API
```

Caminho: `chatfunnel-front/src/views/intelligenceV2/composables/`

Relacionado: [[intelligence-v2-arquitetura]] · [[intelligence-v2-resource-events-front-plan]] · [[intelligence-v2-fluxo-implementacao]] · [[intelligence-a2a-contratos]]

---

## 1. `useResourceCache.ts` — storage de resources A2A v2

**Função:** mapa em memória de `ResourceEnvelope` keyed por `envelopeId`. É um **primitivo de cache** — não fala com rede, não conhece o protocolo SSE; quem decide o que entra/sai é o `useIntelligenceChat`.

### Por que `provide/inject` em vez de Pinia store

A decisão (29-05) foi: o cache é **escopo de uma única view do chat**, não global. Se fosse Pinia, várias instâncias de chat compartilhariam estado e `clear` no carregamento apagaria dados de outra view. Com `provide/inject`:

```ts
const KEY: InjectionKey<ResourceCache> = Symbol("intelligence-v2:resource-cache")
```

O `IntelligenceV2View.vue` chama `provideResourceCache()` no `setup`, descendentes consomem via `useResourceCache()`.

### `freeze()` com `markRaw`

```ts
function freeze(envelope: ResourceEnvelope): ResourceEnvelope {
  return { ...envelope, data: markRaw(envelope.data as object) } as ResourceEnvelope
}
```

`markRaw` instrui o Vue a **não proxificar** o campo `data`. Envelopes podem ter listas de 50+ contatos/automações — proxy reativo recursivo seria caro e inútil (`envelope.data` é imutável após emissão). Aqui mora a otimização que destrava performance em conversas longas.

### API pública

| Método | O que faz | Quem chama |
|--------|-----------|-----------|
| `put(envelope)` | Insere/atualiza um envelope no Map por `envelopeId` | `useIntelligenceChat` no SSE `resource` |
| `putMany(items)` | Bulk: aceita `Record<id, envelope>` (do `/messages`) ou `ResourceEnvelope[]` | `loadConversation` e `loadOlderPage` |
| `get(envelopeId)` | Resolve um envelope para o `ContentBlockList` | `ContentBlockList.envelopesFor()` |
| `getByToolCall(toolCallId)` | Filtra envelopes de um tool específico | Não usado hoje — surface pública para render alternativo |
| `clear()` | Esvazia o Map | `loadConversation` (troca de conversa) e `resetChat` (nova conversa) |

### Edge case ainda não resolvido

O cache **não tem invalidação por mutação**. Se o usuário cria uma automação nova via tool, e depois pede "lista minhas automações", o resultado novo sobrescreve o antigo só porque o `envelopeId` é diferente. Mas se o servidor responder com **mesmo `envelopeId`** (replay), o dado novo entra no lugar. Conferir com servidor se o replay sempre re-emite — caso contrário, contatos editados ficam stale.

---

## 2. `useIntelligenceChat.ts` — núcleo do chat

É o maior, o mais crítico, e o que concentra a complexidade do A2A v2. Faz três coisas:

1. **Reducer** de SSE events → `messages: ChatMessage[]`
2. **Streaming** via `fetch` + `parseSseStream` async generator
3. **Paginação** do histórico de mensagens

### Estado interno (`ref`s)

| Ref | Propósito |
|-----|-----------|
| `messages` | Array de mensagens renderizadas (user, assistant, status) |
| `isStreaming` | Bloqueia novo `send` enquanto stream ativo |
| `isCancelling` | Mostra spinner de "interrompendo" no UI |
| `isRestoringConversation` | Loading state ao trocar conversa (skeleton) |
| `sessionId` | UUID de sessão (regenerado a cada nova conversa); usado no header SSE |
| `conversationId` | ID da conversa persistida (vem do evento `done` ou `loadConversation`) |
| `lastUsage` | Métricas da última resposta (tokens, custo) |
| `throttle` | Estado de rate-limit do servidor (`429 + Retry-After`) |
| `oldestLoadedPage` / `hasOlderMessages` / `isLoadingOlderPage` | Paginação reversa (scroll-up) |

### Variáveis fora de `ref` (sem reatividade)

```ts
let abortController: AbortController | null = null
let cancelFallbackTimer: ReturnType<typeof setTimeout> | null = null
let throttleTimer: ReturnType<typeof setTimeout> | null = null
let pendingText = ""
let pendingTextTarget: TextBlock | null = null
let textFlushScheduled = false
```

Não precisam ser reativas — são **infra do composable**, não estado de UI. Manter fora do `ref` evita updates desnecessários.

### Batching de `text_delta` (otimização chave)

Tokens do LLM chegam em rajada (50–100/s). Cada `text_delta` reagiria como uma mutação Vue → re-render. Solução:

```ts
function scheduleTextFlush() {
  if (textFlushScheduled) return
  textFlushScheduled = true
  requestAnimationFrame(flushPendingText)
}
```

- Cada `text_delta` acumula em `pendingText` (string local, não-reativa).
- Marca um flush via `requestAnimationFrame` (~60Hz).
- No próximo frame, **uma única mutação** concatena tudo no `TextBlock`.

Resultado: 100 events/s viram **60 renders/s no pior caso**. Sem isso, a UI travaria em respostas longas.

### Reducer `handleEvent` — tradução SSE → blocks

Cada `event.type` aplica uma transformação no `assistant.content` (array de `PersistedBlock`):

| Event | Transformação |
|-------|---------------|
| `text_delta` | Acumula em `pendingText`, agenda flush |
| `text_end` | Força flush imediato, limpa target |
| `tool_invocation` | Push `ToolInvocationBlock` (vira chip) |
| `resource` | `cache.put(envelope)` + push `ResourceRefBlock` (referência leve com `envelopeId` + `toolCallId` pro `ContentBlockList` casar com o tool) |
| `tool_status` | Push `ToolStatusBlock` (success/error com mensagem) |
| `delegation_start/end` | **Ignorados na Fase 1** — Fase 3 vai renderizar agente aninhado |
| `done` | Salva `conversationId` (sticky pros próximos `send`) + `usage` + para o streaming |
| `error` | `synthesizeMissingToolStatuses` (fecha tools órfãos) + status message vermelho |
| `cancelled` | Mesmo do `error` mas com status cinza "Interrompido"; limpa timer de fallback |

**O `synthesizeMissingToolStatuses` resolve um problema sutil:** se o servidor aborta no meio, tools com `invocation` mas sem `status` ficariam eternamente em "running". A função varre os invocations não fechados e injeta `tool_status` sintético com `status: 'error', message: 'cancelled'` — garante que o chip pare de girar.

### `send(text)` — ciclo de vida de uma mensagem

1. Guard: rejeita se já streaming ou throttled.
2. Push user message + placeholder assistant message (vazio, será preenchido pelo reducer).
3. `AbortController` novo (per-message — não reutilizado entre sends).
4. POST via `IntelligenceV2Service.streamChat(...)`. Trata 3 cenários antes do stream:
   - **429**: ativa throttle, mostra mensagem, retira o assistant placeholder.
   - **Não-ok**: mostra erro HTTP, retira placeholder.
   - **Sem body**: idem.
5. `for await` no `parseSseStream(response.body)` — async generator que yielda eventos parseados.
6. `catch`: diferencia `AbortError` (cancelamento limpo) de `TypeError` (rede). Se assistant está vazio, remove placeholder; senão, fecha tools órfãos.
7. `finally`: limpeza determinística (controllers, timers, flush pendente). Sempre roda, mesmo em throw.

### `cancel()` — dois níveis

```ts
async function cancel() {
  // 1. Tenta cancelamento limpo via servidor
  await IntelligenceV2Service.cancelStream(sessionId.value)
  // 2. Fallback: se 3s passarem e o stream ainda não fechou, abort local
  cancelFallbackTimer = setTimeout(() => {
    if (isStreaming.value) {
      abortController?.abort()
      // ...
    }
  }, 3000)
}
```

Cancelamento via servidor permite o backend emitir o evento `cancelled` (que dispara `synthesizeMissingToolStatuses` no front). O fallback de 3s cobre o caso de servidor não responder — mata o fetch local na unha.

### `loadConversation(id)` — restauração de histórico

Estratégia: **probe + jump**. Mensagens vêm ASC do backend, então `page=1` é a mais antiga e a UI quer mostrar a mais recente:

```ts
const probe = await getMessages(id, { page: 1, limit: 1 })  // só pra ler `total`
const lastPage = Math.ceil(total / 50)
const res = await getMessages(id, { page: lastPage, limit: 50 })
```

Dois requests: um barato (1 mensagem só, pra `total`), outro com a última página completa. `cache.putMany(payload.resources)` re-hidrata o cache **antes** de `messages.value` mudar — garante que `ResourceRefBlock`s não fiquem com cache miss quando renderizarem.

### `loadOlderPage()` — scroll-up infinito

Decremento de `oldestLoadedPage`, busca, **prepende** no array. Retorna `older.length` para o caller (`ChatColumn.vue`) saber **quantas mensagens foram prepended** e ancorar o scroll na primeira mensagem nova — sem isso, o conteúdo "salta" para cima durante o load.

Guards contra concorrência (`isLoadingOlderPage`), contra `page <= 1` (retorna 0), contra conversa sem ID.

### O parâmetro `externalCache` — pegadinha do Vue

```ts
export function useIntelligenceChat(externalCache?: ResourceCache) {
  const cache = externalCache ?? useResourceCache()
}
```

**Por quê:** o `IntelligenceV2View.vue` chama `provideResourceCache()` no mesmo `setup` que chama `useIntelligenceChat()`. O `inject` do Vue **não vê o `provide` do mesmo componente** — só vê o `provide` de ancestrais. Então o composable aceita opcionalmente o cache passado por argumento.

Componentes descendentes (`ContentBlockList`, etc.) usam `useResourceCache()` normalmente porque eles são descendentes do view.

---

## 3. `useIntelligenceHistory.ts` — lista de conversas no sidebar

Bem mais simples. Gerencia a sidebar esquerda do chat: lista, deleta, navega entre conversas.

### Estado

- `conversations: ConversationPreview[]` — preview leve (id, título, updatedAt, count) para o sidebar
- `loading: boolean` — skeleton state do sidebar
- `activeConversationId: string | null` — qual conversa está aberta agora (vira selected no UI)

### Métodos

| Método | Função |
|--------|--------|
| `loadConversations()` | GET `/conversations?page=1&limit=50` — primeira página com 50 conversas. **Não pagina hoje** — limite hardcoded |
| `deleteConversation(id)` | DELETE no backend + filtra do array local. Se a conversa deletada era a ativa, limpa `activeConversationId` |
| `addOrUpdateConversation(preview)` | Idempotente: atualiza in-place se existe, senão `unshift` no topo. **Chamado quando o chat emite `done` com novo `conversationId`** — assim a conversa nova aparece sem reload |
| `setActive(id)` | Apenas atualiza o ref do ativo |

### Limitação atual

Sem paginação real (max 50 conversas no sidebar). Se um usuário tem 200, as 150 mais antigas não aparecem. Não é bug — é dívida controlada esperando demanda real.

### Tratamento de erros silencioso

```ts
} catch {
  // NestApi interceptor handles error toast
}
```

Convenção do projeto: interceptor do Axios global mostra toast vermelho com a mensagem da API. Não duplicar aqui.

---

## 4. `useHealthCheck.ts` — pulse da API

Mais simples ainda. Poll a cada **5 minutos** no `GET /health` do serviço de Intelligence:

```ts
const POLL_INTERVAL_MS = 5 * 60 * 1000
```

Retorna `status: 'ok' | 'offline' | ...` (tipos em `types/session.ts`). UI usa pra mostrar bolinha verde/vermelha indicando se o backend está vivo.

`onMounted` dispara `check()` imediato + arma o interval. `onUnmounted` limpa. **Padrão clássico** Vue — nada notável.

### Por que 5 minutos

Health check existe pra mostrar "serviço offline" caso o backend caia entre conversas — não é um keepalive. Polling agressivo (ex: 30s) só gera tráfego sem ganho de UX. Se cair durante um `send`, o erro já vem pelo `streamChat` e o `status` pode ficar "ok" um pouco mais — não importa, o erro é mais imediato.

---

## Como tudo se conecta no `IntelligenceV2View.vue`

```
IntelligenceV2View.vue (setup)
├─ provideResourceCache() → cache (provide)
├─ useIntelligenceChat(cache) → motor do chat
├─ useIntelligenceHistory() → sidebar
└─ useHealthCheck() → pulse

Descendentes (ChatColumn, ConversationsSidebar, AssistantMessage,
              ContentBlockList, ToolCallCard, ResourceRenderer)
├─ useResourceCache() → inject — leitura/escrita no Map
└─ Recebem props com pieces do useIntelligenceChat/History
```

### Fluxo de uma busca de contatos (end-to-end)

1. User digita "busca lucas" → `chat.send("busca lucas")`
2. Push assistant placeholder + POST stream
3. SSE `tool_invocation` `present_resource` → push `ToolInvocationBlock` no assistant
4. SSE `resource × N` → `cache.put(envelope)` × N + push `ResourceRefBlock × N`
5. `ContentBlockList` re-renderiza: vê `tool_invocation` + N `resource_ref`s com mesmo `toolCallId`, agrupa, passa pro `ToolCallCard`
6. `ToolCallCard` chama `envelopesFor(refs)` → `cache.get(envelopeId)` × N → array de envelopes
7. `ResourceRenderer` agrupa por `kind: "contact"` → registry → `ContactResult` com `{ contacts: [...] }`
8. SSE `tool_status ok` → chip vira verde
9. SSE `text_delta` × M → batched no `requestAnimationFrame` → uma render por frame
10. SSE `done` → `conversationId` salvo, `history.addOrUpdateConversation` é chamado externamente, streaming para

Esse encadeamento é a razão de o cache **precisar ser populado ANTES** do `resource_ref` block existir — ordem garantida porque ambos ocorrem no mesmo case `"resource"` do reducer, na mesma microtask.

---

## Decisões de design (resumo)

| Decisão | Motivo |
|---------|--------|
| Cache via `provide/inject` em vez de Pinia | Escopo de uma view — não global |
| `markRaw` no `envelope.data` | Listas grandes não precisam de reatividade recursiva |
| Batching de `text_delta` com `requestAnimationFrame` | LLM emite 50–100 tokens/s — sem batch, UI trava |
| `synthesizeMissingToolStatuses` em erro/cancel | Evita tools órfãos eternamente "running" |
| `cancel()` em dois níveis (servidor + abort local 3s) | Cancelamento limpo via servidor, fallback se servidor não responder |
| Probe + jump na restauração | Backend serve ASC, UI quer DESC — 2 requests barato |
| `loadOlderPage` retorna count | Caller precisa ancorar scroll no prepend |
| `externalCache` opcional | Vue `inject` não vê `provide` do mesmo componente |

---

## Próximos passos / dívidas

- **Invalidação do cache**: confirmar com servidor se replay sempre re-emite envelopes editados. Caso contrário, criar estratégia de TTL ou invalidação por evento.
- **Paginação real do sidebar**: limite hardcoded em 50 conversas — quando algum usuário passar disso, implementar scroll-up igual ao do chat.
- **Fase 3 — delegação aninhada**: `delegation_start/end` hoje ignorados; precisam render de agente filho expandível.
