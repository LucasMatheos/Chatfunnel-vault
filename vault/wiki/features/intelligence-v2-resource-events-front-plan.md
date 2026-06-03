---
title: Intelligence V2 - Plano de migracao do front para resource events
description: Plano de alteracoes no chatfunnel-front para consumir o protocolo A2A v2 com resource events, PersistedBlock e ResourceEnvelope.
tags: [features, intelligence, a2a, frontend, resource-events, migration]
related: ["[[intelligence-a2a-contratos]]", "[[intelligence-v2-arquitetura]]", "[[intelligence-v2-component-map]]", "[[intelligence-a2a-shapes]]"]
last_updated: 2026-05-28
revision: 2
---

# Intelligence V2 - Plano de migracao do front para resource events

## Contexto

O backend A2A foi refatorado para o protocolo v2 descrito em
`chatfunnel-services/docs/a2a/refatoracao-v2-resource-events.md`.

Antes, o front recebia eventos de ciclo de bloco: `block_start`,
`block_delta`, `block_stop`. A UI renderizava pares de blocos `tool_use` e
`tool_result`.

Agora, o protocolo v2 envia eventos semanticos:

- `text_delta`
- `text_end`
- `tool_invocation`
- `resource`
- `tool_status`
- `delegation_start`
- `delegation_end`
- `done`
- `error`
- `cancelled`

O resultado estruturado de uma tool nao vem mais como JSON dentro de
`tool_result.content`. Ele vem como `ResourceEnvelope` em evento SSE `resource`.
No historico persistido, a mensagem referencia esses dados por `resource_ref`.

## Estado atual do front

Branch analisada: `feature/intelligence-content-blocks`.

Observacao: o pedido mencionou `feature/intelligence-contracts-blocks`, mas o
repo local estava em `feature/intelligence-content-blocks`.

O modulo `src/views/intelligenceV2/` ainda esta majoritariamente no modelo
antigo:

- `utils/sse-parser.ts` filtra `block_start`, `block_delta`, `block_stop`.
- `composables/useIntelligenceChat.ts` monta mensagens por `index` de bloco.
- `types/content-block.ts` importa `A2aContentBlock` e `A2aToolResultPart`, que
  nao existem mais no contracts v2.
- `ContentBlockList.vue` procura pares `tool_use` + `tool_result`.
- `ToolCallCard.vue` renderiza `result.content`.
- `ToolResultParts.vue` decide componente a partir de `toolName` e partes
  `text/json/image/resource`.
- Nao existe `stores/resource-store.ts`.
- Nao existe `registry/resource.registry.ts`.
- `IntelligenceV2Service.ts` nao envia `X-A2A-Protocol-Version: 2`.
- `ConversationMessagesResponse` ainda nao tipa o `resources` agregado.

O `npm run typecheck` confirma o desalinhamento no modulo Intelligence:

- `A2aContentBlock` e `A2aToolResultPart` nao sao exports do contracts v2.
- `block_start`, `block_delta`, `block_stop` nao pertencem a `A2aSseEvent`.

Ha tambem erros de typecheck pre-existentes fora do modulo Intelligence.

## Contrato novo que o front deve seguir

### Request de chat

Toda chamada de stream deve enviar:

```http
X-A2A-Protocol-Version: 2
```

Usar as constantes do contracts:

```ts
import {
  A2A_PROTOCOL_VERSION,
  A2A_PROTOCOL_VERSION_HEADER,
} from "@chatfunnel/contracts/a2a";
```

### Eventos SSE

Usar `A2A_SSE_EVENT_TYPES` para validar eventos conhecidos:

```ts
import { A2A_SSE_EVENT_TYPES } from "@chatfunnel/contracts/a2a";
```

O parser deve retornar `A2aSseEvent`.

### Mensagens persistidas

O historico retorna `PersistedBlock[]`:

```ts
type PersistedBlock =
  | { type: "text"; text: string }
  | { type: "tool_invocation"; id: string; name: string; args: object; agent: string }
  | { type: "resource_ref"; envelopeId: string; kind: ResourceKind; id: string; toolCallId: string }
  | { type: "tool_status"; id: string; name: string; status: "ok" | "error"; message?: string }
  | { type: "delegation"; agent: string; parentToolUseId: string; args: object; children: PersistedBlock[] };
```

### Recursos

O recurso renderizavel e:

```ts
interface ResourceEnvelope {
  envelopeId: string;
  kind: ResourceKind;
  id: string;
  data: unknown;
  producedBy: {
    toolName: string;
    toolCallId: string;
    agent: string;
  };
  source: "fresh" | "replay";
  fetchedAt: number;
  schemaVersion: number;
}
```

O historico retorna tambem:

```ts
resources: Record<string, ResourceEnvelope>
```

Esse map deve hidratar o store local antes ou junto da renderizacao das
mensagens.

## Alteracoes por arquivo

### `src/common/services/IntelligenceV2Service.ts`

Alterar:

- importar constantes de `@chatfunnel/contracts/a2a`;
- tipar `ConversationMessagesResponse` com `page` e `resources`;
- opcionalmente validar se a response tambem veio com a versao esperada.

Shape atual (linhas 17-20):

```ts
export interface ConversationMessagesResponse {
  data: A2aPersistedMessage[];
  total: number;
}
```

Shape recomendado:

```ts
export interface ConversationMessagesResponse {
  data: A2aPersistedMessage[];
  total: number;
  page: number;
  resources: Record<string, ResourceEnvelope>;
}
```

> Observacao (mapeamento confirmado em 2026-05-29): o stream SSE tambem
> nasce neste service, em `streamChat(params, signal)`, linhas ~53-60,
> que faz `POST ${nestBaseUrl}/a2a/chat` lendo `response.body` como
> ReadableStream. Todos os requests A2A (stream e REST) compartilham o
> helper `authHeaders()` nas linhas ~28-33, entao o header
> `X-A2A-Protocol-Version: 2` deve ser adicionado uma unica vez la:
>
> ```ts
> function authHeaders(): Record<string, string> {
>   const authStore = useAuthStore();
>   return {
>     "Content-Type": "application/json",
>     Authorization: `Bearer ${authStore.token}`,
>     "Account-Selected": authStore.accountSelected || "",
>     [A2A_PROTOCOL_VERSION_HEADER]: A2A_PROTOCOL_VERSION,
>   };
> }
> ```
>
> Importar `A2A_PROTOCOL_VERSION_HEADER` e `A2A_PROTOCOL_VERSION` de
> `@chatfunnel/contracts/a2a` (ambos ja exportados, verificado em
> 2026-05-29).

### `src/views/intelligenceV2/types/content-block.ts`

Substituir o modelo antigo:

- remover `A2aContentBlock`;
- remover `A2aToolResultPart`;
- remover extracts de `tool_use` e `tool_result`;
- exportar `PersistedBlock`, `ResourceEnvelope`, `ResourceKind`.

Aliases uteis:

```ts
export type ContentBlock = PersistedBlock;
export type TextBlock = Extract<PersistedBlock, { type: "text" }>;
export type ToolInvocationBlock = Extract<PersistedBlock, { type: "tool_invocation" }>;
export type ResourceRefBlock = Extract<PersistedBlock, { type: "resource_ref" }>;
export type ToolStatusBlock = Extract<PersistedBlock, { type: "tool_status" }>;
export type DelegationBlock = Extract<PersistedBlock, { type: "delegation" }>;
```

### `src/views/intelligenceV2/types/message.ts`

Trocar `A2aContentBlock[]` por `PersistedBlock[]`.

`UserMessage` e `AssistantMessage` continuam iguais na UI, mudando apenas o
tipo de `content`.

### `src/views/intelligenceV2/types/sse-event.ts`

Remover tipos antigos:

- `SseBlockStartEvent`
- `SseBlockDeltaEvent`
- `SseBlockStopEvent`

Adicionar extracts novos, se necessario:

- `SseTextDeltaEvent`
- `SseToolInvocationEvent`
- `SseResourceEvent`
- `SseToolStatusEvent`
- `SseDelegationStartEvent`
- `SseDelegationEndEvent`

### `src/views/intelligenceV2/utils/sse-parser.ts`

Trocar `VALID_EVENTS` manual por `A2A_SSE_EVENT_TYPES`.

Remover logs especificos de `block_start` e `block_delta`, porque esses eventos
nao existem no v2.

O parser deve apenas:

1. acumular buffer;
2. separar por `\n\n`;
3. extrair `event:` e `data:`;
4. descartar evento fora de `A2A_SSE_EVENT_TYPES`;
5. retornar `{ type, data } as A2aSseEvent`.

### `src/views/intelligenceV2/composables/useResourceCache.ts`

Criar cache local de envelopes com escopo da view (nao Pinia, nao
modulo-global). O ciclo de vida deve seguir a montagem da Intelligence V2 e
ser descartado ao desmontar.

Responsabilidades:

- guardar `ResourceEnvelope` por `envelopeId`;
- deduplicar reemissoes (`fresh` / `replay`);
- resolver um `resource_ref` para envelope;
- hidratar em lote via `resources` do historico;
- limpar ao trocar de conversa.

Padrao recomendado: `provide` no componente raiz da view e `inject` nos
descendentes (`useIntelligenceChat`, `ToolCallCard`, `ResourceRenderer`).
Vue 3 trata `Map` como colecao reativa nativa, entao `ref(new Map())` basta.

```ts
// composables/useResourceCache.ts
import { ref, provide, inject, type InjectionKey } from "vue";
import type { ResourceEnvelope } from "../types/content-block";

export interface ResourceCache {
  put(envelope: ResourceEnvelope): void;
  putMany(items: Record<string, ResourceEnvelope> | ResourceEnvelope[]): void;
  get(envelopeId: string): ResourceEnvelope | undefined;
  getByToolCall(toolCallId: string): ResourceEnvelope[];
  clear(): void;
}

const KEY: InjectionKey<ResourceCache> = Symbol("intelligence-v2:resource-cache");

export function provideResourceCache(): ResourceCache {
  const envelopes = ref(new Map<string, ResourceEnvelope>());

  const cache: ResourceCache = {
    put(envelope) {
      envelopes.value.set(envelope.envelopeId, envelope);
    },
    putMany(items) {
      const entries = Array.isArray(items)
        ? items.map((e) => [e.envelopeId, e] as const)
        : Object.entries(items);
      for (const [id, envelope] of entries) {
        envelopes.value.set(id, envelope);
      }
    },
    get(envelopeId) {
      return envelopes.value.get(envelopeId);
    },
    getByToolCall(toolCallId) {
      return [...envelopes.value.values()].filter(
        (e) => e.producedBy.toolCallId === toolCallId,
      );
    },
    clear() {
      envelopes.value.clear();
    },
  };

  provide(KEY, cache);
  return cache;
}

export function useResourceCache(): ResourceCache {
  const cache = inject(KEY);
  if (!cache) {
    throw new Error("useResourceCache deve ser usado dentro da Intelligence V2");
  }
  return cache;
}
```

Pontos de uso:

- `IntelligenceV2View.vue` (raiz da view): chama `provideResourceCache()`
  uma vez no `setup`.
- `useIntelligenceChat()`: chama `useResourceCache()`; handler de `resource`
  chama `cache.put(envelope)`; `loadConversation` chama `cache.clear()`
  seguido de `cache.putMany(res.data.resources)`.
- `ToolCallCard.vue`: `useResourceCache().getByToolCall(toolCallId)` para
  listar envelopes da invocacao.
- `ResourceRenderer.vue`: `useResourceCache().get(envelopeId)` para
  resolver `resource_ref`.

Por que nao Pinia nem modulo-global:

- `defineStore` e `const state = ref()` no topo do modulo viram singletons
  app-wide e sobrevivem a navegacao fora da Intelligence V2.
- `envelopeId` so faz sentido dentro da conversa que o produziu — nao ha
  reuso cross-conversation, entao cache global so guarda lixo.
- `getMessages` ja devolve o `resources` completo a cada abertura de
  conversa, logo o front nao precisa preservar nada entre visitas.
- Acumular envelopes de N conversas sem politica de evicao vira leak (ex:
  500 conversas, dezenas de envelopes cada).
- Nao ha consumidor fora da arvore da view que precise reagir a mudancas
  do cache.

Quando reavaliar e mover para Pinia:

- painel lateral fora da arvore da view consumindo envelopes da conversa;
- pre-carregamento de varias conversas em paralelo;
- sincronizacao cross-tab dos envelopes.

Nenhum desses esta no plano atual.

### `src/views/intelligenceV2/components/messages/AssistantMessage.vue`

Linha 43 hoje testa `b.type === 'tool_result'` e `b.subThread`. Esses campos
desaparecem no v2.

Trocar a heuristica de "tem conteudo para renderizar" para considerar os blocos
do v2:

- `text` com texto nao vazio;
- `tool_invocation` (sempre renderiza, mesmo sem `resource_ref` ainda);
- `resource_ref`;
- `tool_status`;
- `delegation` com `children` nao vazio.

### `src/views/intelligenceV2/registry/tool-result.registry.ts`

Esse registry hoje mapeia `toolName -> archetype -> component`. No v2 o eixo
muda para `ResourceKind`.

Decisao recomendada:

- nao apagar o arquivo enquanto houver consumidores ativos;
- criar `resource.registry.ts` em paralelo (novo eixo, ver secao abaixo);
- migrar consumidores um a um para o novo registry;
- remover `tool-result.registry.ts` ao final da Fase 2.

Se houver metadado util (ex: rotulo amigavel de tool, icone) que so existia no
registry antigo, mover para `tool-catalog.registry.ts` (que e por `toolName` e
permanece valido como metadado auxiliar).

### `src/views/intelligenceV2/registry/resource.registry.ts`

Criar registry por `ResourceKind`, nao por `toolName`.

Motivo: no v2, duas tools diferentes podem produzir o mesmo tipo de recurso. Ex:
`list_automations` e `get_automation` produzem `kind: "automation"`.

Mapa recomendado:

| Kind | Renderer inicial |
|------|------------------|
| `automation` | renderer reaproveitando `AutomationList` ou `ListResult` |
| `template` | renderer reaproveitando `TemplateList` |
| `kanban_card` | renderer reaproveitando `KanbanCardList` |
| `contact` | `ContactResult` |
| `tag`, `tag_folder`, `custom_field`, `channel`, `moderator`, `assistant`, `agent_v2`, `media`, `kanban_board` | `DiscoveryChips` |
| `automation_draft`, `template_status`, `template_buttons`, `contact_messages` | `GenericJsonResult` |

Fallback: `GenericJsonResult`.

### `src/views/intelligenceV2/composables/useIntelligenceChat.ts`

Reescrever a state machine dos eventos.

Eventos:

- `text_delta`: criar/continuar bloco `text`;
- `text_end`: fechar run de texto;
- `tool_invocation`: adicionar bloco `tool_invocation`;
- `resource`: salvar envelope no `ResourceStore` e adicionar bloco
  `resource_ref`;
- `tool_status`: adicionar bloco `tool_status`;
- `delegation_start`: iniciar estado de delegacao, se a UI for renderizar
  sub-thread;
- `delegation_end`: fechar estado de delegacao;
- `done`: setar `conversationId`, `lastUsage`, `isStreaming = false`;
- `error`: encerrar tool pendente com `tool_status` sintetico de erro, se
  necessario;
- `cancelled`: encerrar tools pendentes e stream.

Detalhe importante: `resource` events podem chegar antes de `tool_status`.
Portanto o card da tool deve poder estar em estado `running` enquanto ja mostra
recursos parciais.

### `loadConversation`

Hoje o reload so transforma `msg.content` em mensagens locais.

Novo fluxo:

1. chamar `getMessages`;
2. hidratar `ResourceStore` com `res.data.resources`;
3. mapear `A2aPersistedMessage.content` como `PersistedBlock[]`;
4. renderizar `resource_ref` resolvendo pelo store.

### `src/views/intelligenceV2/components/messages/ContentBlockList.vue`

Trocar agrupamento antigo:

- remover logica de `tool_use` + `tool_result`;
- remover `promoteSubThread` baseado em `subThread`;
- agrupar por `tool_invocation.id`.

Modelo de render:

1. `text` vira markdown;
2. `tool_invocation` abre um item de tool;
3. `resource_ref` com mesmo `toolCallId` entra como recurso dessa tool;
4. `tool_status` fecha o item e define `ok/error`;
5. `delegation` renderiza um bloco expansivel com `children`.

### `src/views/intelligenceV2/components/messages/ToolCallCard.vue`

Alterar props.

Antes:

```ts
use: A2aToolUseBlock
result?: A2aToolResultBlock
```

Depois:

```ts
invocation: ToolInvocationBlock
status?: ToolStatusBlock
resources: ResourceEnvelope[]
```

Status:

- sem `status`: `running`;
- `status.status === "ok"`: `done`;
- `status.status === "error"`: `error`;
- cancelamento local pode ser representado por `tool_status` sintetico.

### `src/views/intelligenceV2/components/messages/tool-results/ToolResultParts.vue`

Esse componente e acoplado ao v1 (`A2aToolResultPart`). Substituir por um
renderer de envelopes, por exemplo:

- `ResourceRenderer.vue`
- `ResourceGroupRenderer.vue`

Props sugeridas:

```ts
resources: ResourceEnvelope[];
status?: ToolStatusBlock;
```

O renderer:

1. agrupa por `kind`;
2. resolve componente em `resource.registry.ts`;
3. passa `envelopes` ou `data` para o componente;
4. usa `GenericJsonResult` se nao houver renderer especifico.

### Componentes de resultado existentes

Os componentes atuais nao precisam ser descartados. Eles precisam de uma camada
adaptadora.

Componentes provavelmente reaproveitaveis:

- `AutomationList.vue`
- `TemplateList.vue`
- `KanbanCardList.vue`
- `ChannelList.vue`
- `ListResult.vue`
- `ContactResult.vue`
- `AgentResult.vue`
- `DiscoveryChips.vue`
- `GenericJsonResult.vue`
- `DetailCard.vue`
- `ActionResult.vue`
- `BuildSummary.vue`
- `ToolResultFallback.vue`

Decisao por componente (definir antes da Fase 2):

| Componente | Destino no v2 |
|------------|---------------|
| `AutomationList.vue` | renderer de `kind: "automation"` |
| `TemplateList.vue` | renderer de `kind: "template"` |
| `KanbanCardList.vue` | renderer de `kind: "kanban_card"` |
| `ChannelList.vue` | renderer de `kind: "channel"` quando vier lista |
| `ListResult.vue` | renderer generico de listagens (fallback por archetype `list`) |
| `ContactResult.vue` | renderer de `kind: "contact"` |
| `AgentResult.vue` | renderer de `kind: "agent_v2"` |
| `DiscoveryChips.vue` | renderer de kinds curtos (tags, folders, custom fields, etc.) |
| `GenericJsonResult.vue` | fallback final |
| `DetailCard.vue` | renderer de envelope unico (qualquer kind, modo detalhe) |
| `ActionResult.vue` | render de `tool_status` sem resource associado |
| `BuildSummary.vue` | renderer de `kind: "automation_draft"` ou status de build |
| `ToolResultFallback.vue` | fallback quando schemaVersion desconhecida |

O ajuste principal e a entrada dos dados:

- antes: payload agregado de `tool_result.content[].data`;
- agora: `ResourceEnvelope[]`, onde cada envelope carrega `data` de uma entidade.

Exemplo:

```ts
const rows = resources.map((resource) => resource.data);
```

Quando uma tool nao produz resource renderizavel, ela deve renderizar apenas o
`tool_status.message` ou um card simples de sucesso/erro.

## Duvida: da para aproveitar o archetype atual?

Sim, mas nao como fonte primaria.

Hoje o archetype e:

```txt
toolName -> archetype -> component
```

Isso funcionava porque o resultado vinha preso ao `tool_result` daquela tool.
No v2, o dado renderizavel vem como `ResourceEnvelope` e o contrato explicita que
o front deve renderizar por `kind`, nao por `toolName`.

O modelo correto passa a ser:

```txt
ResourceKind -> renderer
```

Mesmo assim, a logica de archetype pode ser reaproveitada como camada interna:

```txt
ResourceKind -> archetype -> component
```

Exemplo:

```ts
const RESOURCE_RENDER_MAP = {
  automation: { archetype: "automation-list" },
  template: { archetype: "template-list" },
  kanban_card: { archetype: "kanban-list" },
  contact: { archetype: "contact" },
  channel: { archetype: "channel" },
  tag: { archetype: "discovery" },
  tag_folder: { archetype: "discovery" },
  custom_field: { archetype: "discovery" },
  automation_draft: { archetype: "generic" },
};
```

Ou seja:

- manter o conceito de archetype ajuda a reaproveitar componentes e estilos;
- nao manter `toolName` como chave principal;
- usar `toolName` apenas como metadado auxiliar (`envelope.producedBy.toolName`)
  quando um renderer precisar validar ou exibir origem.

## Estrategia recomendada

### Fase 1 - Compatibilizar contrato

- header `X-A2A-Protocol-Version`;
- parser SSE v2;
- tipos `PersistedBlock` / `ResourceEnvelope`;
- cache de envelopes via `useResourceCache` (provide/inject);
- historico com `resources`;
- itens indispensaveis de performance (paginacao, `markRaw`, batching de
  `text_delta`) — ver secao Performance.

Objetivo: stream e reload nao quebrarem.

### Fase 2 - Renderizar resources com adaptadores

- criar `resource.registry.ts`;
- trocar `ToolResultParts` por renderer de envelopes;
- adaptar componentes existentes para receber `ResourceEnvelope[]`.

Objetivo: manter a UI atual, mudando a origem dos dados.

### Fase 3 - Melhorar UX especifica

- cards especificos por `kind`;
- render de `delegation`;
- estados parciais enquanto tool ainda esta `running`;
- mensagens melhores para tools status-only;
- fallback visual para schemaVersion desconhecida.

## Performance em conversas longas

Cenario alvo: 300 mensagens, 60 invocacoes de tool, envelopes de ate 50
itens cada (ex: `list_automations`). Cinco gargalos diferentes, cada um
com sua estrategia. Implementar por ordem de prioridade — os tres
primeiros sao indispensaveis junto com a migracao de contrato; o resto
so depois do profiler mostrar dor real.

### 1. Paginacao do historico

A API ja devolve `page` e `total`. O front deve respeitar:

- abertura carrega ultima pagina (ex: 50 msgs);
- scroll-up dispara `loadPage(n+1)` via `useIntersectionObserver`;
- ao prepender mensagens antigas, ancorar scroll na primeira mensagem
  visivel antes do prepend e restaurar o offset depois (senao a tela
  "salta" e desorienta).

Maior ganho com menor esforco. Fazer antes de qualquer outra coisa.

### 2. `markRaw` no payload do envelope

`ResourceEnvelope` e imutavel apos emissao no v2. Nao ha motivo para Vue
rastrear cada propriedade de `data` — em envelopes grandes (lista de 50
automations) sao centenas de proxies inuteis.

```ts
import { markRaw } from "vue";

function put(envelope: ResourceEnvelope) {
  const frozen = { ...envelope, data: markRaw(envelope.data as object) };
  envelopes.value.set(envelope.envelopeId, frozen);
}
```

Aplicar no `put` e no `putMany` do `useResourceCache`.

### 3. Batching de `text_delta`

`text_delta` pode chegar dezenas de vezes por segundo durante o stream.
Render por evento trava a UI. Coalescer por frame:

```ts
let pendingText = "";
let scheduled = false;

function onTextDelta(chunk: string) {
  pendingText += chunk;
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    currentTextBlock.value.text += pendingText;
    pendingText = "";
    scheduled = false;
  });
}
```

`resource` e `tool_status` nao precisam batching (eventos raros).

### 4. Virtualizacao da lista de mensagens

Mesmo com paginacao, 50 mensagens com blocos variados sao centenas de
nos. Virtualizar a lista raiz quando profiler mostrar custo de patch
alto.

- `vue-virtual-scroller` (`DynamicScroller`) atende alturas variaveis.
- Nao virtualizar blocos dentro de uma mensagem — geralmente sao poucos.
- Usar `size-dependencies` ou `ResizeObserver` para medir (ex:
  `AutomationList` com 50 itens e alto, `text` curto e baixo).

### 5. Code-split por `ResourceKind`

```ts
const KIND_TO_RENDERER = {
  automation: defineAsyncComponent(() => import("./renderers/AutomationRenderer.vue")),
  template:   defineAsyncComponent(() => import("./renderers/TemplateRenderer.vue")),
  // ...
};
```

Reduz bundle inicial. Renderer baixa quando o kind aparece pela primeira
vez; chunk fica em cache para uso futuro.

### 6. Lazy mount com IntersectionObserver

Resource card so monta o renderer pesado quando entra na viewport. Antes
disso, skeleton com altura estimada para nao causar reflow.

```vue
<div ref="el" :style="{ minHeight: estimatedHeight + 'px' }">
  <ResourceRenderer v-if="isVisible" :envelope="..." />
  <ResourceSkeleton v-else />
</div>
```

Combina com virtualizacao: o que sai do viewport pode desmontar
novamente (trade-off entre custo de re-mount e memoria).

### 7. Eviction do cache ao descarregar paginas

Se a paginacao crescer (>5 paginas carregadas), envelopes de paginas
antigas se acumulam no `useResourceCache`. Politica simples: ao
descarregar uma pagina antiga do array de mensagens, varrer os
`resource_ref` daquelas mensagens e fazer `cache.delete(envelopeId)`.
Mantem o cache proporcional ao visivel.

### Ordem de implementacao

| Fase | Estrategias |
|------|-------------|
| Fase 1 | 1, 2, 3 — indispensaveis, fazer junto com migracao do contrato |
| Fase 3 (UX) | 4, 5, 6, 7 — quando profiler mostrar gargalo real |

### O que medir antes de otimizar 4-7

- DevTools Performance: gravar conversa real (200+ msgs), ver onde esta
  o tempo (parsing, patch, paint).
- Vue DevTools > Performance: contagem de componentes montados, tempo de
  patch por update.
- `console.time` em `loadConversation` desde request ate paint.

### O que provavelmente nao precisa

- Web Worker para parsing SSE (so se profiler mostrar parser bloqueando
  o thread principal).
- Service Worker para cache offline (escopo nao previsto).
- `shallowRef` no `useResourceCache` (o ganho de `markRaw` no `data`
  resolve 90% do custo; reatividade no Map em si e barata).

## Checklist de validacao

- Baseline de typecheck pre-migracao (2026-05-29, branch
  `feature/intelligence-content-blocks`): 50 erros totais — 19 dentro de
  `src/views/intelligenceV2/` (alvo) e 31 fora (pre-existentes, preservar).
  Snapshot completo:
  `docs/superpowers/plans/typecheck-baseline-2026-05-29.txt`.
- `npm run typecheck` apos migracao: 0 erros em `src/views/intelligenceV2`;
  os 31 erros fora do modulo devem permanecer iguais (nao introduzir nem
  corrigir nesta task).
- `npm test -- --run src/views/intelligenceV2` quando houver specs focadas.
- Stream com prompt "Liste minhas automacoes" deve mostrar:
  - `tool_invocation`;
  - um ou mais `resource`;
  - `tool_status`;
  - `done`.
- Reload da conversa deve renderizar os mesmos cards sem nova chamada MCP.
- `present_resource` deve reexibir envelopes com `source: "replay"`.
- Evento desconhecido deve ser ignorado pelo parser, nao quebrar o stream.

