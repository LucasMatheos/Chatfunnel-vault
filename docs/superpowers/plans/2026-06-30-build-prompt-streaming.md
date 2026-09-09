# Build Prompt Streaming — Implementation Plan (rev 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar a construção do prompt em tempo real no modal — o XML aparece token a token enquanto o LLM gera.

**Architecture:** Generator no service → dois endpoints SSE no controller → `parseSseChunks` + `streamPost` no frontend → exibe em `PromptPreviewModal`.

**Constraints:**
- Backend: double quotes, semicolons; `winston` logger
- Frontend: sem semicolons, single quotes
- NEVER Vuetify em código novo — `Skeleton` de `@/components/ui/skeleton`
- NEVER npm SDK `openai` — OpenAI via `fetch` nativo
- Endpoints `build-prompt` e `rebuild-prompt` existentes **inalterados**
- Abort detection: `signal?.aborted` — SDK Anthropic lança `APIUserAbortError` com `.name === "Error"`, não `"AbortError"`

---

## Task 1: Backend — `buildPromptStream` no service

**File:** `chatfunnel-services/src/modules/agents-v2/prompt-build.service.ts`

- [ ] **Step 1: Confirmar constantes e métodos existentes**

```bash
cd chatfunnel-services && grep -n "PROMPT_ENGINEER_MAX_TOKENS\|PROMPT_ENGINEER_TEMPERATURE\|PROMPT_ENGINEER_SYSTEM\|PROMPT_ENGINEER_MODELS\|resolveProviderKey\|logUsage" src/modules/agents-v2/prompt-build.service.ts | head -15
```

Anote os nomes exatos — usados nos generators abaixo.

- [ ] **Step 2: Adicionar `callAnthropicStream` (private)**

Após o método `callAnthropic` existente. Versão final — não há "primeira versão" a escrever antes:

```typescript
private async *callAnthropicStream(
  apiKey: string,
  model: string,
  userContent: string,
  usage: { inputTokens: number; outputTokens: number; cacheCreation: number; cacheRead: number },
  signal?: AbortSignal,
): AsyncGenerator<string> {
  // Estado local por execução via objeto passado por referência — service é singleton
  // e campos de instância seriam sobrescritos por streams simultâneos
  let stopReason: string | undefined;
  const client = new Anthropic({ apiKey });
  const stream = client.messages.stream(
    {
      model,
      max_tokens: PROMPT_ENGINEER_MAX_TOKENS,
      temperature: PROMPT_ENGINEER_TEMPERATURE,
      system: [{ type: "text", text: PROMPT_ENGINEER_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userContent }],
    },
    { signal },
  );
  for await (const event of stream) {
    if (event.type === "message_start") {
      const u = event.message.usage;
      usage.inputTokens = u?.input_tokens ?? 0;
      usage.cacheCreation = (u as any)?.cache_creation_input_tokens ?? 0;
      usage.cacheRead = (u as any)?.cache_read_input_tokens ?? 0;
    } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    } else if (event.type === "message_delta") {
      usage.outputTokens = event.usage?.output_tokens ?? 0;
      stopReason = event.delta?.stop_reason ?? undefined;
    }
  }
  if (stopReason !== "end_turn") {
    throw new Error(`Prompt truncado (stop_reason="${stopReason ?? "none"}")`);
  }
}
```

- [ ] **Step 3: Adicionar `callOpenAIStream` (private)**

Após o método `callOpenAI` existente:

```typescript
private async *callOpenAIStream(
  apiKey: string,
  model: string,
  userContent: string,
  usage: { inputTokens: number; outputTokens: number },
  signal?: AbortSignal,
): AsyncGenerator<string> {
  let finishReason: string | undefined;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: PROMPT_ENGINEER_MAX_TOKENS,
      temperature: PROMPT_ENGINEER_TEMPERATURE,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: "system", content: PROMPT_ENGINEER_SYSTEM },
        { role: "user", content: userContent },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI ${response.status}: ${await response.text().catch(() => "")}`);
  }
  if (!response.body) throw new Error("OpenAI stream: response.body is null");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") break outer;
        try {
          const parsed = JSON.parse(payload);
          if (parsed.usage) {
            usage.inputTokens = parsed.usage.prompt_tokens ?? 0;
            usage.outputTokens = parsed.usage.completion_tokens ?? 0;
          }
          const choice = parsed.choices?.[0];
          if (choice?.finish_reason) finishReason = choice.finish_reason;
          if (choice?.delta?.content) yield choice.delta.content;
        } catch { /* linha malformada */ }
      }
    }
    // Processa fragmento remanescente no buffer
    buffer += decoder.decode();
    if (buffer.trim() && buffer.startsWith("data: ")) {
      try {
        const parsed = JSON.parse(buffer.slice(6).trim());
        if (parsed.usage) {
          usage.inputTokens = parsed.usage.prompt_tokens ?? 0;
          usage.outputTokens = parsed.usage.completion_tokens ?? 0;
        }
        const choice = parsed.choices?.[0];
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        if (choice?.delta?.content) yield choice.delta.content;
      } catch {}
    }
  } finally {
    reader.releaseLock();
  }
  if (finishReason !== "stop") {
    throw new Error(`Prompt truncado (finish_reason="${finishReason ?? "none"}")`);
  }
}
```

- [ ] **Step 4: Adicionar `buildPromptStream` (public)**

```typescript
async *buildPromptStream(
  formData: BuildPromptDto,
  accountId: string,
  signal?: AbortSignal,
  agentId?: string,
  operation: "build" | "rebuild" = "build",
): AsyncGenerator<string> {
  const { provider, apiKey } = await this.resolveProviderKey(accountId);
  const model = PROMPT_ENGINEER_MODELS[provider];
  const userContent = JSON.stringify(formData);
  const startedAt = Date.now();
  const usage = { inputTokens: 0, outputTokens: 0, cacheCreation: 0, cacheRead: 0 };

  const gen =
    provider === "ANTHROPIC"
      ? this.callAnthropicStream(apiKey, model, userContent, usage, signal)
      : this.callOpenAIStream(apiKey, model, userContent, usage, signal);

  try {
    for await (const chunk of gen) yield chunk;
    this.logUsage({
      accountId, agentId, operation, provider, model,
      inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
      cacheCreationTokens: usage.cacheCreation, cacheReadTokens: usage.cacheRead,
      durationMs: Date.now() - startedAt, isError: false,
    }).catch(() => {});
  } catch (err) {
    const isAbort = signal?.aborted ?? false; // APIUserAbortError.name === "Error", não "AbortError"
    this.logUsage({
      accountId, agentId, operation, provider, model,
      inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
      cacheCreationTokens: usage.cacheCreation, cacheReadTokens: usage.cacheRead,
      durationMs: Date.now() - startedAt, isError: !isAbort,
    }).catch(() => {});
    throw err;
  }
}
```

- [ ] **Step 5: Verificar diff**

```bash
cd chatfunnel-services && git diff src/modules/agents-v2/prompt-build.service.ts
```

---

## Task 2: Backend — dois endpoints SSE no controller

**File:** `chatfunnel-services/src/modules/agents-v2/agents-v2.controller.ts`

- [ ] **Step 1: Confirmar disponibilidade de `agentsV2Service.findOne` e `update`**

```bash
cd chatfunnel-services && grep -n "findOne\|update(" src/modules/agents-v2/agents-v2.service.ts | head -10
```

- [ ] **Step 2: Adicionar helper privado `streamToSse`**

Dentro da classe, antes dos novos endpoints. Usa listener nomeado para poder removê-lo no `finally` e evitar leak:

```typescript
private async streamToSse(
  res: Response,
  generator: AsyncGenerator<string>,
  abortController: AbortController,
  onSuccess?: (fullText: string) => Promise<void>,
): Promise<void> {
  // Listener nomeado para remoção garantida no finally
  const onClose = () => abortController.abort();
  res.on("close", onClose);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  // Desativa buffering do nginx — sem isso o proxy segura todos os chunks e
  // os envia de uma vez no final, anulando o efeito de streaming no browser
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let fullText = "";
  try {
    for await (const chunk of generator) {
      if (res.writableEnded) break;
      fullText += chunk;
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      // flush() força o Node a enviar o chunk pela rede imediatamente
      // (pode ser adicionado por middleware de compressão; opcional chaining é seguro)
      (res as any).flush?.();
    }
    if (onSuccess) await onSuccess(fullText);
    if (!res.writableEnded) res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    if (!abortController.signal.aborted) {
      this.logger.error(
        `[AgentsV2] stream error: ${(err as Error).message}`,
        (err as Error).stack,
      );
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: "Erro ao gerar prompt. Tente novamente." })}\n\n`);
      }
    }
  } finally {
    res.off("close", onClose); // remove listener — sem leak
    if (!res.writableEnded) res.end();
  }
}
```

- [ ] **Step 3: Adicionar `POST build-prompt-stream`**

Antes de qualquer rota `@Get(':id')` (NestJS resolve literais antes de params):

```typescript
@Post("build-prompt-stream")
async buildPromptStream(
  @Req() req: Request,
  @Res() res: Response,
  @Body() dto: BuildPromptDto,
) {
  const accountId = req.headers["account-selected"] as string;
  if (!accountId?.trim()) return res.status(401).json({ error: "Missing Account-Selected" });
  const ctrl = new AbortController();
  const gen = this.promptBuildService.buildPromptStream(dto, accountId, ctrl.signal);
  await this.streamToSse(res, gen, ctrl);
}
```

- [ ] **Step 4: Adicionar `POST :id/rebuild-prompt-stream`**

Logo após `build-prompt-stream`:

```typescript
@Post(":id/rebuild-prompt-stream")
async rebuildPromptStream(
  @Req() req: Request,
  @Res() res: Response,
  @Param("id") agentId: string,
  @Body() dto: RebuildPromptDto,
) {
  const accountId = req.headers["account-selected"] as string;
  if (!accountId?.trim()) return res.status(401).json({ error: "Missing Account-Selected" });

  // Merge com formData existente — mesma lógica do rebuildPrompt síncrono
  const existing = await this.agentsV2Service.findOne(agentId, accountId);
  const merged: BuildPromptDto = { ...(existing.formData as object), ...dto } as BuildPromptDto;

  const ctrl = new AbortController();
  const gen = this.promptBuildService.buildPromptStream(
    merged, accountId, ctrl.signal, agentId, "rebuild",
  );
  await this.streamToSse(res, gen, ctrl, async (fullText) => {
    await this.agentsV2Service.update(agentId, accountId, {
      systemPrompt: fullText,
      formData: merged as unknown as Record<string, unknown>,
    });
  });
}
```

- [ ] **Step 5: Verificar diff**

```bash
cd chatfunnel-services && git diff src/modules/agents-v2/agents-v2.controller.ts
```

---

## Task 3: Frontend — `parseSseChunks`, `streamPost` e AgentsV2Service

**Files:**
- Modify: `chatfunnel-front/src/common/api/index.js`
- Modify: `chatfunnel-front/src/common/services/AgentsV2Service.js`

- [ ] **Step 1: Adicionar `parseSseChunks` exportado em `index.js`**

Logo após os imports existentes (função pura, exportada para ser testável):

```javascript
/**
 * Parseia um buffer SSE acumulado, retornando eventos completos e o fragmento restante.
 * Suporta \n\n e \r\n\r\n como separadores de evento (RFC 8895).
 * Exportado para teste unitário — usado internamente por streamPost.
 */
export function parseSseChunks(buf) {
  const events = []
  const parts = buf.split(/\r?\n\r?\n/)
  const remaining = parts.pop() ?? ''
  for (const part of parts) {
    const dataLine = part.split(/\r?\n/).find(l => l.startsWith('data: '))
    if (!dataLine) continue
    try { events.push(JSON.parse(dataLine.slice(6).trim())) } catch { /* malformada */ }
  }
  return { events, remaining }
}
```

- [ ] **Step 2: Adicionar `streamPost` antes de `class BaseApi`**

```javascript
/**
 * POST SSE via fetch nativo. Retorna { abort } sincronamente antes de qualquer I/O.
 * Usa parseSseChunks para suportar \r\n\r\n e processar buffer final.
 */
const streamPost = function (url, body, onChunk, onDone, onError) {
  const ctrl = new AbortController()

  ;(async () => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${useAuthStore().token}`,
          'Account-Selected': useAuthStore().accountSelected,
          'Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        body: JSON.stringify(body)
      })

      if (!res.ok) {
        if (res.status === 401) { logoutExpiredToken(); onError(new Error('Sessão expirada')); return }
        onError(new Error(`HTTP ${res.status}`)); return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      const dispatch = (events) => {
        for (const ev of events) {
          if (ev.done) { onDone(); return true }
          if (ev.error) { onError(new Error(ev.error)); return true }
          if (ev.chunk != null) onChunk(ev.chunk)
        }
        return false
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const { events, remaining } = parseSseChunks(buf)
        buf = remaining
        if (dispatch(events)) { reader.releaseLock(); return }
      }

      // Processa fragmento remanescente após fim do stream
      buf += decoder.decode()
      if (buf.trim()) {
        const { events } = parseSseChunks(buf + '\n\n')
        if (dispatch(events)) { reader.releaseLock(); return }
      }

      reader.releaseLock()
      onDone()
    } catch (err) {
      if (err?.name !== 'AbortError') onError(err instanceof Error ? err : new Error(String(err)))
    }
  })()

  return { abort: () => ctrl.abort() }
}
```

- [ ] **Step 3: Expor em `NestApi`**

Dentro de `class NestApi extends BaseApi`:

```javascript
static streamPost(path, body, onChunk, onDone, onError) {
  setUpAxios(import.meta.env.VITE_NEST_BASE_API, true)
  return streamPost(`${import.meta.env.VITE_NEST_BASE_API}${path}`, body, onChunk, onDone, onError)
}
```

- [ ] **Step 4: Adicionar métodos em `AgentsV2Service.js`**

Após `rebuildPrompt`:

```javascript
buildPromptStream(formData, onChunk, onDone, onError) {
  return NestApi.streamPost('/agents-v2/build-prompt-stream', formData, onChunk, onDone, onError)
},

rebuildPromptStream(agentId, formData, onChunk, onDone, onError) {
  return NestApi.streamPost(`/agents-v2/${agentId}/rebuild-prompt-stream`, formData, onChunk, onDone, onError)
},
```

- [ ] **Step 5: Verificar diffs**

```bash
cd chatfunnel-front && git diff src/common/api/index.js src/common/services/AgentsV2Service.js
```

---

## Task 4: Frontend — AgentsForm e PromptPreviewModal

**Files:**
- Modify: `chatfunnel-front/src/views/agents/AgentsForm/index.vue`
- Modify: `chatfunnel-front/src/views/agents/AgentsForm/components/PromptPreviewModal.vue`

### AgentsForm

- [ ] **Step 1: Substituir as três refs (linhas 258–260)**

Localizar:
```typescript
const isBuildingPrompt = ref(false);
const showPromptModal = ref(false);
const generatedPrompt = ref('');
```

Substituir por:
```typescript
const isStreaming = ref(false)
const showPromptModal = ref(false)
const generatedPrompt = ref('')

// Contador de execução — callbacks de stream antigo checam o runId e retornam cedo
// quando um novo stream já foi iniciado (ex: "Reconstruir" clicado duas vezes)
let streamRunId = 0
let streamAbort: (() => void) | null = null

watch(showPromptModal, (open) => {
  if (!open && streamAbort) {
    streamRunId++    // invalida callbacks já enfileirados ANTES do abort — sem isso,
    streamAbort()    // um onChunk em voo veria myRunId === streamRunId e escreveria no prompt
    streamAbort = null
    isStreaming.value = false
  }
})
```

- [ ] **Step 2: Adicionar `startStream`**

Logo após o bloco do Step 1:

```typescript
function startStream(agentId?: string) {
  streamAbort?.()                    // cancela stream anterior
  const myRunId = ++streamRunId      // callbacks antigos veem myRunId !== streamRunId

  isStreaming.value = true
  generatedPrompt.value = ''

  const onChunk = (chunk: string) => {
    if (myRunId !== streamRunId) return   // descarta chunk de stream cancelada
    generatedPrompt.value += chunk
  }
  const onDone = () => {
    if (myRunId !== streamRunId) return
    isStreaming.value = false
    streamAbort = null
  }
  const onError = (err: Error) => {
    if (myRunId !== streamRunId) return
    isStreaming.value = false
    streamAbort = null
    showToastError(err?.message ?? 'Erro ao gerar prompt')
    showPromptModal.value = false
  }

  const handle = agentId
    ? AgentsV2Service.rebuildPromptStream(agentId, buildPromptData(), onChunk, onDone, onError)
    : AgentsV2Service.buildPromptStream(buildPromptData(), onChunk, onDone, onError)

  streamAbort = () => handle.abort()
}
```

- [ ] **Step 3: Substituir `handleGoToPrompt`, `handleSave`, `handleRebuild`**

```typescript
const handleGoToPrompt = async () => {
  showPromptModal.value = true
  if (!generatedPrompt.value) startStream()
}

const handleSave = async () => {
  if (!values.name) return showToastError('Nome do agente é obrigatório')
  if (!values.model) return showToastError('Modelo é obrigatório')
  if (toolsStepRef.value?.hasUnconfiguredTools) {
    currentStep.value = 5; markStepError(5)
    return showToastError('Todas as ferramentas adicionadas precisam estar configuradas')
  }
  if (values.duration !== null && values.duration !== undefined &&
      (!Number.isInteger(values.duration) || values.duration < 1)) {
    return showToastError('Duração deve ser um inteiro maior ou igual a 1')
  }
  showPromptModal.value = true
  startStream(isEditMode.value ? props.id : undefined)
}

const handleRebuild = () => {
  startStream(isEditMode.value ? props.id : undefined)
}
```

- [ ] **Step 4: Substituir `isBuildingPrompt` no template**

```bash
cd chatfunnel-front && grep -n "isBuildingPrompt" src/views/agents/AgentsForm/index.vue
```

Substituir todas as ocorrências no template e no `<script>` por `isStreaming`.

- [ ] **Step 5: Adicionar `onBeforeUnmount`**

Adicionar ao import existente de `vue` (`onBeforeUnmount`) e:

```typescript
onBeforeUnmount(() => { streamRunId++; streamAbort?.() })
```

### PromptPreviewModal

- [ ] **Step 6: Substituir `v-progress-circular` por `Skeleton`**

Adicionar import:
```javascript
import { Skeleton } from '@/components/ui/skeleton'
```

Localizar bloco com `v-progress-circular` e substituir:
```html
<div v-if="loading && !localPrompt" class="flex flex-col gap-3 p-1">
  <Skeleton class="h-4 w-3/4" />
  <Skeleton class="h-4 w-full" />
  <Skeleton class="h-4 w-5/6" />
  <Skeleton class="h-4 w-full" />
  <Skeleton class="h-4 w-2/3" />
  <span class="typo-body-12-regular text-gray-500 mt-1">Gerando prompt...</span>
</div>
```

- [ ] **Step 7: Adicionar cursor piscante**

Localizar `<pre v-else-if="!isEditMode" ...>{{ localPrompt }}</pre>` e adicionar cursor:
```html
<pre v-else-if="!isEditMode" class="prompt-preview">{{ localPrompt }}<span
  v-if="loading"
  class="streaming-cursor text-brand-500"
>▋</span></pre>
```

Em `<style scoped>`:
```css
.streaming-cursor {
  display: inline-block;
  margin-left: 2px;
  animation: blink 1s step-end infinite;
}
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
```

- [ ] **Step 8: Proteger `watch` de props.prompt**

```javascript
watch(() => props.prompt, (newPrompt) => {
  if (!isEditMode.value) localPrompt.value = newPrompt
})
```

- [ ] **Step 9: Adicionar confirmação ao fechar o modal durante o streaming**

Quando o usuário clica no X (ou pressiona Escape) enquanto `props.loading === true`, exibir um overlay de confirmação dentro do modal em vez de fechá-lo imediatamente.

Adicionar import de `Button`:
```javascript
import { Button } from '@/components/ui/button'
```

Adicionar estado e handler em `<script setup>`:
```javascript
const showCancelConfirm = ref(false)

function handleOpenChange(open: boolean) {
  if (!open && props.loading) {
    showCancelConfirm.value = true
    return
  }
  emit('update:open', open)
}
```

Substituir o atributo de binding do Dialog raiz (de `@update:open="$emit('update:open', $event)"` ou equivalente) por:
```html
<Dialog :open="open" @update:open="handleOpenChange">
```

Adicionar overlay de confirmação como **primeiro filho direto** de `<DialogContent>` (antes do restante do conteúdo):
```html
<div
  v-if="showCancelConfirm"
  class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-[inherit] bg-white p-6 text-center"
>
  <p class="text-sm font-medium text-gray-900">
    A construção do prompt está em andamento e será cancelada.
  </p>
  <div class="flex gap-3">
    <Button variant="outline" @click="showCancelConfirm = false">
      Continuar gerando
    </Button>
    <Button tone="danger" @click="showCancelConfirm = false; emit('update:open', false)">
      Cancelar geração
    </Button>
  </div>
</div>
```

> `DialogContent` já tem `position: relative` no shadcn-vue — o `absolute inset-0` cobre todo o conteúdo do modal sem vazar.
> Ao clicar em "Cancelar geração", o `emit('update:open', false)` propaga normalmente para o `watch(showPromptModal)` em `AgentsForm/index.vue`, que executa `streamRunId++` e `streamAbort()`.

- [ ] **Step 10: Verificar diffs**

```bash
cd chatfunnel-front && git diff src/views/agents/AgentsForm/index.vue src/views/agents/AgentsForm/components/PromptPreviewModal.vue
```

---

## Task 5: Testes mínimos

**Files:**
- Create: `chatfunnel-services/src/modules/agents-v2/prompt-build.service.spec.ts`
- Create: `chatfunnel-front/src/common/api/sse-parser.spec.ts`

### Backend (3 testes Jest)

- [ ] **Step 1: Criar `prompt-build.service.spec.ts`**

```typescript
import { Test } from "@nestjs/testing";
import { PromptBuildService } from "./prompt-build.service";
import { AgentsV2Service } from "./agents-v2.service";
import { AccountsRepository } from "src/database/repositories/accounts.repository";
import { LlmUsageLogsRepository } from "src/database/repositories/llm_usage_logs.repository";
import Anthropic from "@anthropic-ai/sdk";

jest.mock("@anthropic-ai/sdk");
const mockFetch = jest.fn();
global.fetch = mockFetch;

const ACCOUNT_ANT = { id: "acc-1", anthropicKey: "sk-ant" } as any;
const ACCOUNT_OAI = { id: "acc-1", openaiKey: "sk-oai" } as any;

async function buildService() {
  const module = await Test.createTestingModule({
    providers: [
      PromptBuildService,
      { provide: AgentsV2Service, useValue: {} },
      { provide: AccountsRepository, useValue: { findById: jest.fn() } },
      { provide: LlmUsageLogsRepository, useValue: { create: jest.fn().mockResolvedValue(null) } },
    ],
  }).compile();
  return {
    service: module.get(PromptBuildService),
    accounts: module.get(AccountsRepository) as jest.Mocked<AccountsRepository>,
    llm: module.get(LlmUsageLogsRepository) as jest.Mocked<LlmUsageLogsRepository>,
  };
}

describe("PromptBuildService.buildPromptStream", () => {
  // Teste 1: chunks Anthropic e usage real
  it("yields Anthropic chunks and logs real token usage", async () => {
    const { service, accounts, llm } = await buildService();
    accounts.findById.mockResolvedValue(ACCOUNT_ANT);

    const mockMessages = { stream: jest.fn().mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { type: "message_start", message: { usage: { input_tokens: 50, cache_creation_input_tokens: 10, cache_read_input_tokens: 5 } } };
        yield { type: "content_block_delta", delta: { type: "text_delta", text: "<id>Bot</id>" } };
        yield { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 20 } };
        yield { type: "message_stop" };
      },
    })};
    (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(
      () => ({ messages: mockMessages } as any),
    );

    const chunks: string[] = [];
    for await (const c of service.buildPromptStream({ name: "Bot" } as any, "acc-1")) chunks.push(c);

    expect(chunks).toEqual(["<id>Bot</id>"]);
    expect(llm.create).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokens: 50, outputTokens: 20, cacheCreationTokens: 10, cacheReadTokens: 5, isError: false }),
    );
  });

  // Teste 2: chunks OpenAI fragmentados entre reads + usage real
  it("reassembles fragmented OpenAI SSE and logs real token usage", async () => {
    const { service, accounts, llm } = await buildService();
    accounts.findById.mockResolvedValue(ACCOUNT_OAI);

    const enc = new TextEncoder();
    mockFetch.mockResolvedValue({
      ok: true, status: 200,
      body: { getReader: () => ({
        read: jest.fn()
          .mockResolvedValueOnce({ done: false, value: enc.encode('data: {"choices":[{"delta":{"con') })
          .mockResolvedValueOnce({ done: false, value: enc.encode('tent":"<ok>"}}]}\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":80,"completion_tokens":30}}\ndata: [DONE]\n') })
          .mockResolvedValue({ done: true, value: undefined }),
        releaseLock: jest.fn(),
      })},
    });

    const chunks: string[] = [];
    for await (const c of service.buildPromptStream({ name: "Bot", provider: "OPENAI" } as any, "acc-1")) chunks.push(c);

    expect(chunks).toEqual(["<ok>"]);
    expect(llm.create).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokens: 80, outputTokens: 30, isError: false }),
    );
  });

  // Teste 3: abort (APIUserAbortError.name === "Error") não loga isError:true
  it("does not log isError:true when signal is aborted", async () => {
    const { service, accounts, llm } = await buildService();
    accounts.findById.mockResolvedValue(ACCOUNT_ANT);

    const ctrl = new AbortController();
    (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(() => ({
      messages: {
        stream: jest.fn().mockReturnValue({
          [Symbol.asyncIterator]: async function* () {
            ctrl.abort(); // signal.aborted = true
            throw Object.assign(new Error("aborted"), { name: "Error" }); // APIUserAbortError
          },
        }),
      },
    } as any));

    await expect(async () => {
      for await (const _ of service.buildPromptStream({ name: "Bot" } as any, "acc-1", ctrl.signal)) {}
    }).rejects.toThrow();

    expect(llm.create).toHaveBeenCalledWith(expect.objectContaining({ isError: false }));
  });
});
```

- [ ] **Step 2: Rodar testes backend**

```bash
cd chatfunnel-services && npm test -- --testPathPattern=prompt-build.service.spec
```
Esperado: PASS (3 testes verdes)

### Frontend (1 teste Vitest para o parser)

- [ ] **Step 3: Criar `sse-parser.spec.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { parseSseChunks } from './index'

describe('parseSseChunks', () => {
  it('extrai eventos e retorna fragmento restante', () => {
    const buf = 'data: {"chunk":"ok"}\n\ndata: {"done"'
    const { events, remaining } = parseSseChunks(buf)
    expect(events).toEqual([{ chunk: 'ok' }])
    expect(remaining).toContain('"done"')
  })

  it('suporta \\r\\n\\r\\n como separador (CRLF)', () => {
    const buf = 'data: {"chunk":"a"}\r\n\r\ndata: {"done":true}\r\n\r\n'
    const { events } = parseSseChunks(buf)
    expect(events).toEqual([{ chunk: 'a' }, { done: true }])
  })
})
```

- [ ] **Step 4: Rodar testes frontend**

```bash
cd chatfunnel-front && npm test -- sse-parser.spec
```
Esperado: PASS (2 testes verdes)

---

## Teste manual final

- [ ] **Step 1: Subir serviços**

```bash
# Terminal 1
cd chatfunnel-services && npm run start:dev
# Terminal 2
cd chatfunnel-front && npm run dev
```

- [ ] **Step 2: Roteiro**

1. "Concluir" → modal abre com skeletons → XML aparece token a token com cursor ▋
2. Fechar modal durante stream → stream cancela sem erro no console
3. "Reconstruir" clicado duas vezes rápido → apenas um stream ativo, sem tokens misturados
4. Modo edição → "Reconstruir" → formData mesclado + systemPrompt persistidos
