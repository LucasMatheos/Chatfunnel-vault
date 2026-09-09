# Anthropic Structured Outputs no Agente V2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o `AnthropicHandlerAgent` (runtime real do Agente V2 no `chatfunnel-api`) usar `output_config.format` (Structured Outputs da Anthropic) para garantir, a nível de API, que a resposta bate com o envelope `{ messages: [...] }` — eliminando a classe de bug em que o Claude gera JSON malformado/incompleto e a conversa cai no fallback de texto puro.

**Architecture:** Um JSON Schema derivado do tipo `StructuredItem` (já definido em `structuredResponse.ts`) é passado em `output_config.format` na chamada `messages.stream(...)` do `AnthropicHandlerAgent`, condicionado a `options.responseFormat === "JSON"` — mesmo gate que o `OpenAIHandlerAgent` já usa para `response_format`. O prompt textual (`buildStructuredResponsePrompt`) e o parser com fallback (`parseStructuredResponse` + `jsonrepair`) permanecem intactos: o schema garante *forma*, não conteúdo, recusa do modelo, nem truncamento por `max_tokens`.

**Tech Stack:** TypeScript (subpasta `agents-v2/`, compilada via `tsc` antes dos testes), `@anthropic-ai/sdk@0.82.0` (já suporta `output_config` nativamente, sem upgrade), Jest.

## Global Constraints

- Repo `chatfunnel-api` é **JavaScript puro** no geral, mas `agents-v2/` já é uma exceção existente em TypeScript, compilada via `npm run build:processor` (`tsc -p tsconfig.build.json`) antes dos testes (`pretest` no `package.json`) — não criar `.ts` fora dessa pasta, mas dentro dela é o padrão já estabelecido.
- ALWAYS use `require()`/module aliases nos arquivos `.test.js` (ex.: `@root/dist/processor/agents-v2/...`), nunca paths relativos — é o padrão dos testes existentes (`providerTemperature.test.js`).
- **NEVER rode `npm test` ou qualquer variante de build automaticamente.** `npm test` dispara `pretest → build:processor` (tsc), e a regra do projeto é rodar build só quando o usuário pedir explicitamente. Cada step de verificação abaixo deve ser **pedido ao usuário para rodar e colar o output** — não executado diretamente pelo agente.
- **NEVER faça commit automaticamente.** Cada "step de commit" deste plano vira um "step de stage" (`git add`) — o usuário comita quando quiser.
- ALWAYS passe `accountId`/multi-tenancy e soft delete em código de acesso a banco — não se aplica a este plano (nenhuma query nova).
- Manter `buildStructuredResponsePrompt` e `parseStructuredResponse`/`sanitizeStructuredJSON` sem alteração de comportamento — o schema é uma camada adicional, não uma substituição.

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/structuredResponse.ts` | Modificar | Adicionar `buildStructuredResponseSchema(audioEnabled)` — JSON Schema derivado de `StructuredItem`, fonte única da verdade junto com `buildStructuredResponsePrompt`. |
| `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/structuredResponse.test.js` | Modificar | Testes do schema: shape correto por variante, e o cruzamento schema↔runtime que o code review pediu (todo item aceito pelo schema também é aceito por `normalizeItem`, e o caso `{type:"image"}`/`{type:"link"}` sem dado continua rejeitado). |
| `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/HandlerAgent.ts:1663` | Modificar | `canRespondWithAudio()` passa de `private` para `protected` — precisa ser chamável de `AnthropicHandlerAgent`, que estende `HandlerAgent`. |
| `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/providers/AnthropicHandlerAgent.ts:172-203` | Modificar | `callLLM` passa a setar `request.output_config` quando `options.responseFormat === "JSON"`. |
| `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/outputConfig.test.js` | Criar | Teste de integração leve (mock do client Anthropic) confirmando que `output_config` é enviado só quando `responseFormat === "JSON"`. |

---

### Task 1: JSON Schema derivado de `StructuredItem`

**Files:**
- Modify: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/structuredResponse.ts`
- Test: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/structuredResponse.test.js`

**Interfaces:**
- Consumes: nada de tasks anteriores (task inicial).
- Produces: `export function buildStructuredResponseSchema(audioEnabled = false): Record<string, unknown>` — usado pela Task 2 dentro de `AnthropicHandlerAgent.callLLM`.

- [ ] **Step 1: Escrever os testes que falham primeiro**

Adicionar ao final de `structuredResponse.test.js` (antes do fechamento do arquivo), importando a nova função no topo junto das existentes:

```js
const {
  parseStructuredResponse,
  sanitizeStructuredJSON,
  buildStructuredResponsePrompt,
  buildStructuredResponseSchema,
} = require("@root/dist/processor/agents-v2/structuredResponse");
```

E o novo `describe` (sem reimplementar um interpretador de JSON Schema: os testes de shape por variante já provam estruturalmente o `anyOf`/`required`; o cross-check com o runtime usa `parseStructuredResponse` direto, que é o consumidor real do schema):

```js
describe("buildStructuredResponseSchema", () => {
  function findVariant(schema, type) {
    return schema.properties.messages.items.anyOf.find(
      (v) => v.properties.type.const === type,
    );
  }

  test("top level requires messages and forbids extra keys", () => {
    const schema = buildStructuredResponseSchema();
    expect(schema.required).toEqual(["messages"]);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.messages.type).toBe("array");
  });

  test("omits the audio variant by default", () => {
    const schema = buildStructuredResponseSchema();
    expect(findVariant(schema, "audio")).toBeUndefined();
  });

  test("includes the audio variant when audioEnabled is true", () => {
    const schema = buildStructuredResponseSchema(true);
    const audio = findVariant(schema, "audio");
    expect(audio).toBeDefined();
    expect(audio.required).toEqual(["type", "data"]);
  });

  // Prova estrutural direta do bug que o code review pegou: sem este anyOf,
  // { "type": "image" } sozinho bateria com { required: ["type"] } e passaria.
  test("image variant requires at least one of data/url/id", () => {
    const schema = buildStructuredResponseSchema();
    const image = findVariant(schema, "image");
    expect(image.required).toEqual(["type"]);
    expect(image.anyOf).toEqual(
      expect.arrayContaining([
        { required: ["data"] },
        { required: ["url"] },
        { required: ["id"] },
      ]),
    );
  });

  test("link variant requires at least one of url/data", () => {
    const schema = buildStructuredResponseSchema();
    const link = findVariant(schema, "link");
    expect(link.required).toEqual(["type"]);
    expect(link.anyOf).toEqual(
      expect.arrayContaining([{ required: ["url"] }, { required: ["data"] }]),
    );
  });

  // Cross-check pedido no code review: tudo que o schema aceita como shape
  // mínimo (já provado acima) também precisa ser aceito pelo parser em
  // runtime — senão o schema libera algo que normalizeItem() descartaria.
  test.each([
    { type: "image", url: "https://x/a.jpg" },
    { type: "image", id: "IMG-001" },
    { type: "image", data: "https://x/b.jpg" },
    { type: "link", url: "https://x" },
    { type: "link", data: "https://x" },
    { type: "button", data: { text: "Comprar", url: "https://x" } },
    { type: "buttons", data: [{ text: "Opção", url: "https://x" }] },
    { type: "text", data: "oi" },
  ])("schema-minimal item %o is accepted by the runtime parser", (item) => {
    const result = parseStructuredResponse(JSON.stringify({ messages: [item] }));
    expect(result).not.toBeNull();
    expect(result.messages).toHaveLength(1);
  });

  test("audio item is accepted by the parser (audioEnabled path)", () => {
    const result = parseStructuredResponse(
      JSON.stringify({ messages: [{ type: "audio", data: "oi falado" }] }),
    );
    expect(result.messages).toEqual([{ type: "audio", data: "oi falado" }]);
  });

  test("type-only image/link (the bug this schema's anyOf fixes) is rejected by the parser", () => {
    const raw = JSON.stringify({ messages: [{ type: "image" }, { type: "link" }] });
    expect(parseStructuredResponse(raw)).toBeNull();
  });

  // O schema garante ESTRUTURA (chaves certas, união discriminada), não
  // VALIDADE SEMÂNTICA — a doc da Anthropic não trata `minLength` como
  // garantia forte, então não apostamos nisso. Estes itens passariam em
  // qualquer validador de JSON Schema real, mas continuam sendo descartados
  // pelo parser (normalizeItem), que é o backstop pra conteúdo vazio/em branco.
  test.each([
    { type: "text", data: " " },
    { type: "image", url: "" },
    { type: "link", url: "" },
    { type: "buttons", data: [] },
    { type: "audio", data: " " },
  ])("blank/empty %o passes schema-level shape but is rejected by the parser", (item) => {
    expect(parseStructuredResponse(JSON.stringify({ messages: [item] }))).toBeNull();
  });
});
```

- [ ] **Step 2: Pedir ao usuário para rodar e confirmar que falha**

Pedir para o usuário rodar:
```bash
npm test -- structuredResponse.test.js
```
Esperado: falha em todos os testes de `buildStructuredResponseSchema` com `buildStructuredResponseSchema is not a function` (a função ainda não existe).

- [ ] **Step 3: Implementar `buildStructuredResponseSchema`**

Em `structuredResponse.ts`, adicionar logo antes de `buildStructuredResponsePrompt` (que hoje começa na linha 229):

```ts
/**
 * JSON Schema for the `output_config.format` parameter (Anthropic Structured
 * Outputs) — mirrors StructuredItem's per-variant required fields. This
 * guarantees the response's *structure* (right keys, right nesting, the
 * discriminated union enforced) — it does NOT guarantee semantic validity.
 * A blank string (" "), an empty "buttons" array, or an empty "url"/"data"
 * on image/link all satisfy this schema but are still rejected by
 * normalizeItem() at runtime. Anthropic's structured-outputs docs don't
 * treat `minLength` as a strong guarantee, so we don't lean on it here —
 * parseStructuredResponse's parser/fallback stays the real backstop for
 * empty/blank content. `audioEnabled` mirrors buildStructuredResponsePrompt's
 * gate: only advertise the "audio" type when the agent can actually speak.
 */
export function buildStructuredResponseSchema(
  audioEnabled = false,
): Record<string, unknown> {
  const variants: Record<string, unknown>[] = [
    {
      type: "object",
      properties: { type: { const: "text" }, data: { type: "string" } },
      required: ["type", "data"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { const: "image" },
        data: { type: "string" },
        url: { type: "string" },
        id: { type: "string" },
        caption: { type: "string" },
      },
      required: ["type"],
      anyOf: [{ required: ["data"] }, { required: ["url"] }, { required: ["id"] }],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { const: "link" },
        data: { type: "string" },
        url: { type: "string" },
      },
      required: ["type"],
      anyOf: [{ required: ["url"] }, { required: ["data"] }],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { const: "button" },
        data: {
          type: "object",
          properties: { text: { type: "string" }, url: { type: "string" } },
          required: ["text", "url"],
          additionalProperties: false,
        },
      },
      required: ["type", "data"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { const: "buttons" },
        data: {
          type: "array",
          items: {
            type: "object",
            properties: { text: { type: "string" }, url: { type: "string" } },
            required: ["text", "url"],
            additionalProperties: false,
          },
        },
      },
      required: ["type", "data"],
      additionalProperties: false,
    },
  ];

  if (audioEnabled) {
    variants.push({
      type: "object",
      properties: { type: { const: "audio" }, data: { type: "string" } },
      required: ["type", "data"],
      additionalProperties: false,
    });
  }

  return {
    type: "object",
    properties: {
      messages: { type: "array", items: { anyOf: variants } },
    },
    required: ["messages"],
    additionalProperties: false,
  };
}
```

- [ ] **Step 4: Pedir ao usuário para rodar e confirmar que passa**

```bash
npm test -- structuredResponse.test.js
```
Esperado: todos os testes de `buildStructuredResponseSchema` (incluindo os `test.each`) em verde.

- [ ] **Step 5: Stage (sem commit)**

```bash
git add chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/structuredResponse.ts chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/structuredResponse.test.js
```
Não commitar — o usuário comita quando quiser.

---

### Task 2: Ligar `output_config` no `AnthropicHandlerAgent`

**Files:**
- Modify: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/HandlerAgent.ts:1663`
- Modify: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/providers/AnthropicHandlerAgent.ts`
- Test: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/outputConfig.test.js` (novo arquivo)

**Interfaces:**
- Consumes: `buildStructuredResponseSchema(audioEnabled?: boolean): Record<string, unknown>` da Task 1; `protected canRespondWithAudio(): boolean` (visibilidade alterada nesta task).
- Produces: nenhuma interface nova para tasks futuras — esta é a última task do plano.

- [ ] **Step 1: Escrever o teste que falha primeiro**

Criar `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/outputConfig.test.js`:

```js
const {
  AnthropicHandlerAgent,
} = require("@root/dist/processor/agents-v2/providers/AnthropicHandlerAgent");

function baseAnthropicHandler() {
  const handler = Object.create(AnthropicHandlerAgent.prototype);
  handler.preparedFiles = [];
  handler.resolveNonHttpsAttachments = jest.fn().mockResolvedValue(undefined);
  handler.buildToolDefinitions = jest.fn().mockReturnValue([]);
  handler.addLog = jest.fn();
  handler.logLlmUsage = jest.fn().mockResolvedValue(undefined);
  handler.canRespondWithAudio = jest.fn().mockReturnValue(false);
  return handler;
}

function mockStreamingClient() {
  const finalMessage = jest.fn().mockResolvedValue({
    content: [{ type: "text", text: "ok" }],
    stop_reason: "end_turn",
    usage: { input_tokens: 1, output_tokens: 1 },
  });
  const stream = jest.fn().mockReturnValue({ finalMessage });
  return { stream, client: { messages: { stream } } };
}

test("sets output_config.format to a json_schema when responseFormat is JSON", async () => {
  const handler = baseAnthropicHandler();
  const { stream, client } = mockStreamingClient();
  handler.getClient = jest.fn().mockReturnValue(client);

  await handler.callLLM(
    [{ role: "user", content: "hello" }],
    { model: "test-model", temperature: 0.7, responseFormat: "JSON", tools: [] },
  );

  const request = stream.mock.calls[0][0];
  expect(request.output_config.format.type).toBe("json_schema");
  expect(request.output_config.format.schema.properties.messages).toBeDefined();
});

test("omits output_config when responseFormat is TEXT", async () => {
  const handler = baseAnthropicHandler();
  const { stream, client } = mockStreamingClient();
  handler.getClient = jest.fn().mockReturnValue(client);

  await handler.callLLM(
    [{ role: "user", content: "hello" }],
    { model: "test-model", temperature: 0.7, responseFormat: "TEXT", tools: [] },
  );

  const request = stream.mock.calls[0][0];
  expect(request.output_config).toBeUndefined();
});

test("passes canRespondWithAudio() into the schema's audio gate", async () => {
  const handler = baseAnthropicHandler();
  handler.canRespondWithAudio = jest.fn().mockReturnValue(true);
  const { stream, client } = mockStreamingClient();
  handler.getClient = jest.fn().mockReturnValue(client);

  await handler.callLLM(
    [{ role: "user", content: "hello" }],
    { model: "test-model", temperature: 0.7, responseFormat: "JSON", tools: [] },
  );

  const request = stream.mock.calls[0][0];
  const variants = request.output_config.format.schema.properties.messages.items.anyOf;
  expect(variants.some((v) => v.properties.type.const === "audio")).toBe(true);
});
```

- [ ] **Step 2: Pedir ao usuário para rodar e confirmar que falha**

```bash
npm test -- outputConfig.test.js
```
Esperado: falha porque `request.output_config` é `undefined` mesmo com `responseFormat: "JSON"` (feature ainda não implementada).

- [ ] **Step 3: Tornar `canRespondWithAudio()` acessível à subclasse**

Em `HandlerAgent.ts:1663`, trocar:
```ts
  private canRespondWithAudio(): boolean {
```
por:
```ts
  protected canRespondWithAudio(): boolean {
```

- [ ] **Step 4: Implementar o wiring em `AnthropicHandlerAgent.callLLM`**

Em `AnthropicHandlerAgent.ts`, adicionar o import no topo (junto dos demais imports de `../`):
```ts
import { buildStructuredResponseSchema } from "../structuredResponse";
```

E, logo depois do bloco `if (tools.length > 0) { request.tools = tools; }` (linhas 201-203 hoje), adicionar:
```ts
    if (options.responseFormat === "JSON") {
      request.output_config = {
        format: {
          type: "json_schema",
          schema: buildStructuredResponseSchema(this.canRespondWithAudio()),
        },
      };
    }
```

- [ ] **Step 5: Pedir ao usuário para rodar e confirmar que passa**

```bash
npm test -- outputConfig.test.js
```
Esperado: os 3 testes em verde.

- [ ] **Step 6: Rodar a suíte completa de `agents-v2` para garantir que nada quebrou**

Pedir ao usuário para rodar:
```bash
npm test
```
Esperado: todos os testes existentes continuam verdes, incluindo `structuredResponse.test.js` (Task 1) e os testes de `HandlerAgent`/`OpenAIHandlerAgent` que não devem ser afetados pela mudança de visibilidade de `canRespondWithAudio` (chamadas internas em `HandlerAgent.ts:1724` e `:1960` continuam válidas — `protected` inclui o próprio escopo da classe).

- [ ] **Step 7: Stage (sem commit)**

```bash
git add chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/HandlerAgent.ts chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/providers/AnthropicHandlerAgent.ts chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/outputConfig.test.js
```
Não commitar — o usuário comita quando quiser.

---

## Validação manual (pós-implementação, fora do escopo de testes automatizados)

Como builds e deploys são sempre manuais neste projeto:
1. O usuário roda `npm run dev` no `chatfunnel-api`.
2. Aciona uma conversa em um agente com `responseFormat: JSON` no provider Anthropic.
3. Confere no log `LLM REQUEST`/`LLM RESPONSE` (emitido por `addLog("callLLM", ...)`) que a resposta não passa mais pelo log `"responseFormat=JSON but parse failed; falling back to plain text"` (`HandlerAgent.ts:1106`).
4. **Confere o efeito no prompt cache** (a doc da Anthropic avisa: mudar `output_config.format` invalida o cache daquela conversa — só na chamada que introduz/muda o schema):
   - Na **primeira** mensagem da sessão após essa mudança entrar em produção, o log `"prompt caching — input=... cache_read=... cache_creation=..."` (só aparece quando `cacheRead > 0 || cacheCreation > 0`, ver `AnthropicHandlerAgent.ts:266-271`) deve mostrar `cache_creation > 0` — é o cache antigo sendo invalidado e recriado com o novo prefixo (que agora inclui o schema).
   - Na **segunda mensagem em diante da mesma sessão** (schema idêntico, não muda mais), o mesmo log deve voltar a mostrar `cache_read > 0` — confirmando que o cache normal voltou a funcionar e a mudança não deixou a sessão permanentemente sem cache.

## Fora do escopo deste plano

- `chatfunnel-services/src/modules/agents-v2/adapters/anthropic.provider.ts` — adapter paralelo, não usado pelo fluxo real (`chatfunnel-api`), mesmo problema mas código não plugado. Não mexer a menos que seja pedido.
- Adicionar `strict: true`/`response_format` com JSON Schema no lado OpenAI — o `OpenAIHandlerAgent` já garante JSON sintático via `json_object`; endurecer o shape também lá é uma melhoria separada, não pedida.
