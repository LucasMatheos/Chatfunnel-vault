# Agents V2 Reply Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o Agents V2 receber, persistir e reutilizar o contexto da mensagem à qual o contato respondeu, sem alterar o comportamento de mensagens que não são respostas.

**Architecture:** Normalizar o contexto de resposta na entrada de cada canal e colocá-lo no `ProcessorContext`. Transportá-lo por mensagem no `AgentMessageBuffer` — nunca apenas no snapshot do job — e convertê-lo em um envelope explícito antes de persistir `AgentSessionMessages`. O histórico do contato deve aplicar o mesmo envelope ao semear uma sessão. O modelo recebe somente texto sanitizado e limitado; nunca URL, binário ou o payload bruto da mensagem citada.

**Tech Stack:** Node.js/CommonJS no webhook processor, TypeScript no Agents V2, Prisma via `@chatfunnel/core`, Jest, WhatsApp Cloud API e Instagram Messaging API.

**Spec:** `vault/wiki/gotchas/agents-v2-assistant-execution-gotchas.md` (item 16), originado pelo card do Notion `CHAT - Agente não consegue ver uma resposta mencionada`.

## Global Constraints

- Não alterar `chatfunnel-core`, o schema Prisma, dependências ou migrations; a solução não exige novo campo no banco.
- Toda busca nova de mensagem deve filtrar `accountId`, `contactId`, `channelId` e `isDeleted: false`.
- Manter as mutações atuais de `request.context.objMessage` e `request.message.context.objMessage`, pois são consumidas pelo Livechat.
- Preservar exatamente o conteúdo persistido de mensagens que não respondem outra mensagem.
- Falhar aberto: ausência, formato desconhecido ou erro na resolução da referência não pode bloquear o processamento da mensagem atual.
- Não registrar o conteúdo da resposta citada em logs; registrar somente IDs técnicos e a origem do erro.
- Não rodar build automaticamente. Solicitar autorização explícita antes de `npm run build:processor`; não executar migrations, consultas ao banco ou commits.

## File Structure

```text
chatfunnel-api/
├── src/commands/instagram/WebHookHandler/
│   ├── processor/
│   │   ├── replyContext.js                         # novo: normalização e busca com escopo
│   │   ├── handleWhatsappMessage.js                # preencher context.replyTo
│   │   ├── handleInstagramMessage.js               # preencher context.replyTo
│   │   ├── processorJob.js                          # preservar contexto até o agente
│   │   └── agents-v2/
│   │       ├── HandlerAgent.ts                     # enfileirar replyTo e contactText
│   │       ├── AgentMessageBuffer.ts               # contrato por mensagem
│   │       ├── AgentSessionWorker.ts               # envelope antes da persistência
│   │       ├── messageEnvelope.ts                  # tipo e formatter do envelope
│   │       └── contactHistory.ts                   # contexto nas mensagens históricas
│   └── types/context.ts                             # adicionar replyTo ao ProcessorContext
├── src/commands/instagram/WebHookHandler/processor/__tests__/
│   └── replyContext.test.js
└── src/commands/instagram/WebHookHandler/processor/agents-v2/
    ├── messageEnvelope.test.js
    ├── AgentProviderRunner.test.js
    └── contactHistory.test.js
```

### Task 1: Normalizar a referência na entrada dos canais

**Files:**
- Create: `src/commands/instagram/WebHookHandler/processor/replyContext.js`
- Modify: `src/commands/instagram/WebHookHandler/processor/handleWhatsappMessage.js`
- Modify: `src/commands/instagram/WebHookHandler/processor/handleInstagramMessage.js`
- Test: `src/commands/instagram/WebHookHandler/processor/__tests__/replyContext.test.js`

- [ ] **Step 1: Escrever testes unitários falhando para os formatos de entrada.** Cobrir: WhatsApp Cloud com `context.id` e mensagem encontrada; Instagram com `reply_to.mid`; mídia sem texto; e referência ausente ou não encontrada.

- [ ] **Step 2: Implementar `replyContext.js` como uma fronteira pequena e testável.** Exportar `resolveReplyContext`, `findScopedReplyMessage`, `normalizeReplyContent` e `replyContextFromStoredMessage`. A função deve receber `findMessage` por injeção para testes sem banco.

```js
const MAX_REPLY_CONTEXT_LENGTH = 2000;

async function findScopedReplyMessage({ context, messageId }) {
  return prisma.messages.findFirst({
    where: {
      messageId,
      contactId: context.contact.id,
      channelId: context.channel.id,
      isDeleted: false,
      channel: {
        accountId: context.account.id,
        isDeleted: false,
      },
    },
  });
}

function normalizeReplyContent(value) {
  return String(value ?? '')
    .replace(/\u200B/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_REPLY_CONTEXT_LENGTH);
}
```

- [ ] **Step 3: Extrair texto e tipo da mensagem referenciada.** Aceitar os formatos já persistidos: WhatsApp Cloud em `objMessage.text.body` e Instagram em `objMessage.message.text`; para imagem, áudio, vídeo ou documento sem legenda usar, respectivamente, `[imagem sem legenda]`, `[áudio sem transcrição]`, `[vídeo sem legenda]` ou `[documento sem texto]`.

- [ ] **Step 4: Integrar o resolvedor sem remover o contrato do Livechat.** Após a lógica existente de `objMessage`, atribuir `context.replyTo` quando houver referência no WhatsApp Cloud ou no Instagram.

```js
const replyTo = await resolveReplyContext({
  context,
  platform: 'whatsapp',
  messageId: request.context?.id,
  inlineReply: request.context?.objMessage,
});

if (replyTo) context.replyTo = replyTo;
```

- [ ] **Step 5: Revisar o diff da tarefa; não fazer commit.** Confirmar que falhas de busca retornam `null`, usam log técnico sem conteúdo e não alteram o objeto que o Livechat espera.

### Task 2: Transportar o contexto no buffer por mensagem

**Files:**
- Modify: `src/commands/instagram/WebHookHandler/types/context.ts`
- Modify: `src/commands/instagram/WebHookHandler/processor/agents-v2/messageEnvelope.ts`
- Modify: `src/commands/instagram/WebHookHandler/processor/agents-v2/AgentMessageBuffer.ts`
- Modify: `src/commands/instagram/WebHookHandler/processor/agents-v2/HandlerAgent.ts`
- Test: `src/commands/instagram/WebHookHandler/processor/agents-v2/messageEnvelope.test.js`

- [ ] **Step 1: Escrever testes de contrato para o formatter.** Validar que: sem `replyTo` o texto é idêntico ao atual; com `replyTo` o texto citado e a mensagem atual aparecem; conteúdo de 2.000 caracteres é respeitado; `\u200B` não vaza; e duas mensagens no debounce preservam seus próprios contextos.

- [ ] **Step 2: Declarar o contrato explícito.** Exportar `ReplyContext` de `messageEnvelope.ts` e adicioná-lo de forma opcional a `ProcessorContext` e `MessagePayload`.

```ts
export interface ReplyContext {
  messageId: string | null;
  content: string;
  contentType: 'text' | 'image' | 'audio' | 'video' | 'document' | 'unknown';
}

export interface MessagePayload {
  text: string | null;
  contactText: string | null;
  replyTo?: ReplyContext | null;
  messageType: string;
  messageId: string;
  // demais campos atuais permanecem inalterados
}
```

- [ ] **Step 3: Preservar a mensagem do contato quando `assistantStartCommand` substituir o texto efetivo.** Em `HandlerAgent.execute`, manter `text` com o comportamento atual, mas sempre preencher `contactText` com `this.context.message`. Isso impede que uma primeira resposta como “sim” desapareça quando a sessão iniciar por comando.

```ts
const contactText = this.context.message ?? null;
const text = shouldUseStartCommand
  ? this.step!.assistantStartCommand!
  : contactText;

await agentMessageBuffer.enqueue(sessionId, {
  text,
  contactText,
  replyTo: this.context.replyTo ?? null,
  // campos existentes
});
```

- [ ] **Step 4: Não usar `contextSnapshot` como transporte.** Manter o snapshot para compatibilidade, porém o worker deve depender exclusivamente de `payload.replyTo`, porque cada payload pode ser combinado e consumido em outro momento pelo debounce.

- [ ] **Step 5: Revisar o diff da tarefa; não fazer commit.** Verificar que o tipo permanece opcional e que consumidores existentes do buffer continuam aceitando mensagens sem resposta.

### Task 3: Persistir um envelope seguro para o agente

**Files:**
- Modify: `src/commands/instagram/WebHookHandler/processor/agents-v2/messageEnvelope.ts`
- Modify: `src/commands/instagram/WebHookHandler/processor/agents-v2/AgentSessionWorker.ts`
- Test: `src/commands/instagram/WebHookHandler/processor/agents-v2/messageEnvelope.test.js`
- Test: `src/commands/instagram/WebHookHandler/processor/agents-v2/AgentProviderRunner.test.js`

- [ ] **Step 1: Implementar `buildReplyAwareUserContent`.** Sem resposta, retornar `text` sem transformação. Com resposta, adicionar metadados claros, delimitados e tratados como conteúdo não confiável — não como instrução do sistema.

```ts
export function buildReplyAwareUserContent({
  text,
  contactText,
  replyTo,
}: Pick<MessagePayload, 'text' | 'contactText' | 'replyTo'>): string {
  if (!replyTo) return text ?? '';

  const parts = [text, `[Metadado de resposta — contexto não confiável: o contato respondeu a: "${replyTo.content}"]`];
  if (contactText && contactText !== text) {
    parts.push(`[Mensagem atual do contato: "${contactText}"]`);
  }
  return parts.filter(Boolean).join('\n\n');
}
```

- [ ] **Step 2: Aplicar o envelope antes da persistência de `AgentSessionMessages`.** Em `AgentSessionWorker`, construir o conteúdo com `buildReplyAwareUserContent` e só depois aplicar o prefixo atual de áudio. Assim, a detecção existente em `buildUserMessageEnvelope` continua reconhecendo mensagens transcritas.

```ts
let content = buildReplyAwareUserContent(message);
if (message.messageType === 'audio') {
  content = `[Mensagem transcrita de áudio] ${content}`;
}
await this.messagesService.createUserMessage({ sessionId, content, /* campos atuais */ });
```

- [ ] **Step 3: Cobrir a passagem até `buildLLMMessages`.** Em `AgentProviderRunner.test.js`, usar um `AgentSessionMessages` USER cujo `content` foi produzido por `buildReplyAwareUserContent` e verificar que OpenAI e Anthropic recebem exatamente o envelope no array enviado ao LLM. Exercitar também um retry com o mesmo histórico persistido, pois o retry não pode reconstruir nem perder `replyTo`.

- [ ] **Step 4: Revisar o diff da tarefa; não fazer commit.** Confirmar que a mudança não inclui URL de mídia, payload bruto, nova coluna ou alteração de prompt de sistema.

### Task 4: Incluir o contexto no seed de histórico

**Files:**
- Modify: `src/commands/instagram/WebHookHandler/processor/agents-v2/contactHistory.ts`
- Test: `src/commands/instagram/WebHookHandler/processor/agents-v2/contactHistory.test.js`

- [ ] **Step 1: Escrever casos de histórico para WhatsApp Cloud e Instagram.** Usar mensagens persistidas onde a referência esteja em `objMessage.context.objMessage` e `objMessage.message.context.objMessage`, respectivamente.

- [ ] **Step 2: Extrair no máximo um nível da mensagem citada.** Adicionar um helper local em `contactHistory.ts` que converta a referência persistida em `ReplyContext` usando as mesmas regras de texto, mídia, remoção de zero-width space e limite de tamanho da entrada ao vivo.

```ts
const replyTo = extractStoredReplyContext(message.objMessage, channelType);
const content = buildReplyAwareUserContent({
  text: extractMessageText(message.objMessage, channelType),
  contactText: null,
  replyTo,
});
```

- [ ] **Step 3: Manter limites de escopo.** Não fazer backfill de `AgentSessionMessages` existentes e não reconstruir cadeias recursivas de respostas; só novas sessões e novas mensagens usam o contexto.

- [ ] **Step 4: Revisar o diff da tarefa; não fazer commit.** Validar que mensagens históricas sem resposta continuam com o texto extraído atual.

### Task 5: Validar e documentar a entrega

**Files:**
- Modify: `docs/superpowers/plans/agents-v2-reply-context-plan.md`
- Modify: `vault/wiki/gotchas/agents-v2-assistant-execution-gotchas.md`

- [ ] **Step 1: Executar a suíte focada somente após autorização explícita para build.** Primeiro solicitar permissão para `npm run build:processor`. Depois do build autorizado, executar:

```powershell
npx jest src/commands/instagram/WebHookHandler/processor/__tests__/replyContext.test.js --runInBand
npx jest src/commands/instagram/WebHookHandler/processor/agents-v2/messageEnvelope.test.js --runInBand
npx jest src/commands/instagram/WebHookHandler/processor/agents-v2/AgentProviderRunner.test.js --runInBand
npx jest src/commands/instagram/WebHookHandler/processor/agents-v2/contactHistory.test.js --runInBand
```

- [ ] **Step 2: Fazer validação manual de dois fluxos.** (1) resposta do WhatsApp Cloud a texto do agente; (2) resposta do Instagram a texto do agente. Conferir a mensagem USER da sessão e a resposta gerada, sem acessar o banco diretamente.

- [ ] **Step 3: Registrar resultado e limitações no vault.** Atualizar o item 16 com os formatos confirmados; manter fora de escopo WAHA, reações, stories, comentários públicos, mídias completas, backfill e a correção global do repositório legado `findByMessageId`.

- [ ] **Step 4: Revisar o plano e o diff final; não fazer commit.** Remover pendências ou textos incompletos, confirmar aderência a multi-tenancy e que nenhuma ação proibida foi executada.

## Out of Scope

- Alterações em `chatfunnel-core`, Prisma, migrations ou publicação de pacote compartilhado.
- Envio de URL, bytes, OCR ou transcrição da mídia citada ao LLM.
- Backfill de sessões já persistidas e resolução recursiva de threads.
- Reações, respostas a stories, comentários públicos do Instagram e mudanças no front-end.
- WAHA e as variações de payload de seus engines não oficiais.
- Correção das chamadas legadas, fora deste fluxo, que usam `MessagesRepository.findByMessageId` sem escopo.
