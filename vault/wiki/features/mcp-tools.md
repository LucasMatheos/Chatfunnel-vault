---
title: MCP Tools — Aprofundamento
description: Como o servidor MCP funciona por dentro — bootstrap, auth, sessoes, rate limiting e (foco) o mecanismo de registro e execucao das tools.
tags: [mcp, tools, architecture, nestjs, deep-dive]
related: ["[[mcp-integration]]", "[[chatfunnel-mcp]]", "[[chatfunnel-core]]", "[[automations]]", "[[multi-tenancy]]"]
last_updated: 2026-07-21
---

# MCP Tools — Aprofundamento

Aprofundamento tecnico de **como o `chatfunnel-mcp` funciona por dentro**, etapa a etapa, com foco no mecanismo das **tools**. Para auth/tokens/UI ver [[mcp-integration]]; para stack/estrutura ver [[chatfunnel-mcp]].

## Ideia central: 100% cola

O repo **nao tem regra de negocio**. Ele e uma camada de traducao entre o protocolo MCP e o `@chatfunnel/core`. Toda inteligencia (Prisma, repositories, services de dominio) vive no core. O valor do repo e:

1. Falar o protocolo MCP (JSON-RPC 2.0 sobre HTTP)
2. Autenticar e isolar por `accountId` (ver [[multi-tenancy]])
3. Gerenciar sessao (memoria + Redis) e rate limiting
4. Expor cada operacao como uma **tool** com contrato Zod

```
Agente IA (Claude / GPT / SDK)
    | JSON-RPC sobre HTTP (POST /mcp)
    v
McpController --> McpServerService  (auth -> sessao -> rate limit -> auditoria)
                       |
                       v
                 McpServer (SDK) + tools registradas POR SESSAO (getAuth grudado)
                       |
                       v
                 services locais finos (tags/contacts/reports/...) -- sempre com accountId
                       |
                       v
                 @chatfunnel/core (Prisma, repositories, regra de negocio real)
```

## As duas camadas do repo

- **Camada MCP/transporte** (`src/mcp/`) — protocolo, auth, sessao, rate limit, registro/execucao das tools.
- **Camada de dominio** (`src/tags/`, `src/contacts/`, `src/reports/`, ...) — cada pasta e um modulo Nest com um service **fino** que envelopa o service equivalente do core.

Exemplo do padrao "wrapper fino" (`tags.service.ts`):

```ts
constructor(prisma: PrismaService) {
  this.coreService = new CoreTagsService(new TagsRepository(prisma), ...);
}
createTag(accountId, name, folderId) {
  return this.coreService.createTag(accountId, { name, folderId }); // so delega
}
```

`AutomationBuilderService` (`src/mcp/services/automation-builder.service.ts`) e o extremo disso: `extends Base {}` do core, sem corpo.

## Fluxo de uma requisicao (todas as etapas)

### 0. Bootstrap
`main.ts` sobe o Nest na porta **8000**, habilita CORS (expondo os headers `mcp-session-id` e `mcp-protocol-version`). `app.module.ts` importa `Config`, `Database` (Prisma), `Redis`, `SignalR` e o `McpAutomationModule` — este ultimo importa TODOS os modulos de dominio e declara os providers do MCP.

### 1. Controller (`mcp.controller.ts`)
Tudo entra em `/mcp`. Dois grupos:

- **Gestao de token** (REST): `POST /mcp/token`, `POST|GET|DELETE /mcp/integration-tokens`, `GET /mcp/health`.
- **Protocolo MCP**: `POST /mcp` (`handlePost`), `GET /mcp` (SSE, `handleGet`), `DELETE /mcp` (`handleDelete`) — repassados ao `McpServerService`.

### 2. Auth (`services/mcp-auth.service.ts`)
3 modos (`McpAuthMode`): `mcp_jwt`, `integration_token`, `frontend_jwt` (legado). `extractAuth()` descobre pelo prefixo do token, valida e monta o **`McpAuthContext`** = `{ token, accountId, userId, authMode, allowedAccountIds }`. Sempre confere que a conta do header `account-selected` pertence ao usuario. Detalhes completos em [[mcp-integration]].

### 3. Sessao (`mcp-server.service.ts` + `services/mcp-session-store.service.ts`)
MCP e **stateful**: cliente chama `initialize`, recebe `mcp-session-id`, reusa. `handlePost` decide:

- **Local (memoria)** — caminho rapido: revalida headers (`assertSessionHeaders`) e usa o transport vivo.
- **So no Redis** (restart / outra instancia) — `recreateSession` reconstroi server+transport; **so aceita `initialize`**, senao devolve `SESSION_RESET`.
- **Nova** — autentica, gera `sessionId` (UUID), cria `McpServer` + transport, guarda em memoria (`Map`) e no Redis (`persistSession`, TTL idle 5min default via `MCP_SESSION_IDLE_TTL_SECONDS`).

`McpSessionStore` mantem duas camadas: `Map` em memoria (transport vivo) e Redis (metadados de auth para sobreviver a restart). Timer a cada 60s (`cleanupLocalSessions`) fecha transports locais cujo Redis ja expirou.

### 4. Rate limiting (`services/mcp-rate-limiter.service.ts`)
Antes de cada `tools/call` e antes de criar sessao. Tudo em Redis com **Lua scripts atomicos** e **fail-closed** (erro no Redis => rejeita com retry 5s).

| Limite | Env | Default | Janela |
|--------|-----|---------|--------|
| Tool calls por sessao | `MCP_RATE_LIMIT_TOOLS_PER_SESSION` | 60 | 60s |
| Tool calls por account | `MCP_RATE_LIMIT_TOOLS_PER_ACCOUNT` | 300 | 60s |
| Sessoes simultaneas | `MCP_RATE_LIMIT_MAX_SESSIONS` | 10 | — |
| Criacao de sessoes | `MCP_RATE_LIMIT_INIT_PER_ACCOUNT` | 10 | 60s |

Sutilezas:
- **Checagem sequencial** sessao->account (nao paralela) para nao inflar contador na dimensao que passou quando a outra rejeita; se account rejeita, faz `DECR` no contador da sessao.
- `CHECK_AND_INCREMENT_LUA` so incrementa se ainda abaixo do limite (retorna -1 se cheio).
- `RESERVE_SESSION_LUA` limpa sessoes mortas do set, checa o limite concorrente e reserva o slot atomicamente. **So funciona em Redis single-node** (usa chaves dinamicas `prefix..sid`), nao Cluster.
- Reserva do slot e feita antes de criar; se algo falhar depois, `rollbackSessionReservation` desfaz.

### 5. Execucao + auditoria (`handleRequestWithAudit`)
So `tools/call` passa por rate limit + auditoria; outros metodos (initialize, tools/list...) vao direto ao transport. Mede `durationMs`, `success`, e loga JSON estruturado `event: "mcp_tool_call"` (tool, accountId, userId, sessionId, duracao). Params vao em `logger.debug` (`mcp_tool_call_params`).

## O mecanismo das tools (foco)

### Onde nascem
Toda sessao nova chama `createServer(auth)` no `mcp-server.service.ts`, que instancia um `McpServer` e roda os `registerXxxTools(...)` de cada grupo:

```ts
private createServer(auth: McpAuthContext): McpServer {
  const server = new McpServer({ name: "chatfunnel-automation", version: "1.0.0" });
  const getAuth = () => auth;                         // <-- closure grudado na sessao
  registerDiscoveryTools(server, ...services, getAuth);
  registerBuilderTools(server, this.builder, this.automationsService, getAuth);
  registerManagementTools(server, this.automationsService, getAuth);
  registerTemplateTools(server, this.templatesService, getAuth);
  registerTagTools(server, this.tagsService, this.contactsService, getAuth);
  registerCrmTools(server, this.kanbanService, getAuth);
  registerContactsTools(server, this.contactsService, getAuth);
  registerReportsTools(server, this.reportsService, getAuth);
  return server;
}
```

**Ponto-chave: `getAuth = () => auth` e um closure.** Cada sessao tem seu proprio `McpServer` com seu proprio auth grudado. Por isso o LLM **nunca passa `accountId`** — o handler puxa via `getAuth().accountId`. Isolamento multi-tenant garantido no servidor, nao pela confianca no cliente.

### Anatomia de uma tool
Cada arquivo `tools/*.ts` tem, por operacao: um tipo `Params` (inferido do Zod), um `handler` (funcao pura testavel) e uma chamada `server.registerTool`. Exemplo minimo (`tag.tools.ts`):

```ts
export async function createTagHandler(tagsService, getAuth, params) {
  try {
    const auth = getAuth();                                         // 1. conta da sessao
    const data = await tagsService.createTag(auth.accountId,        // 2. delega (-> core)
                                             params.name, params.folderId);
    return toMcpResult({ tag: data });                             // 3. envelope MCP
  } catch (error) {
    return formatMcpToolError(error);                              // 4. erro MCP padronizado
  }
}

server.registerTool(
  "create_tag",
  {
    description: "Create a new tag in the account. Returns the created tag with its UUID.",
    inputSchema: CreateTagInput,     // Zod de @chatfunnel/contracts
    outputSchema: CreateTagOutput,   // Zod de @chatfunnel/contracts
  },
  (params) => createTagHandler(tagsService, getAuth, params),
);
```

- **`description`** e o que o LLM le para decidir quando usar a tool. E prompt: costuma citar em que step/trigger o resultado se encaixa (ver descricoes em `discovery.tools.ts`).
- **`inputSchema`/`outputSchema`** vem de `@chatfunnel/contracts` (Zod) — validam args de entrada e o `structuredContent` de saida. O tipo TS sai de `z.infer<z.ZodObject<typeof XxxInput>>`.
- Handler e **funcao livre** (nao metodo) recebendo services + `getAuth` + params — por isso da pra testar sem subir o Nest (ver `*.tools.spec.ts` e `*.contracts.spec.ts`).

### Helpers compartilhados por toda tool
- **`toMcpResult(data)`** (`tools/mcp-result.util.ts`) — faz `JSON.stringify`/`parse` (round-trip) para normalizar `Date` do Prisma em string wire-safe antes do SDK validar contra o `outputSchema`, e retorna `{ structuredContent, content:[{type:"text"}] }`.
- **`wrap(key, data)`** (em `discovery.tools.ts`) — se `data` ja e objeto, usa; se e array/primitivo, embrulha em `{ [key]: data }`. Garante `structuredContent` como objeto.
- **`formatMcpToolError(error)`** (`errors/mcp-tool-error.ts`) — classifica a excecao e devolve `{ isError:true, structuredContent:{ error:{ code, type, message, details? } } }`:
  - `McpRateLimitError` -> `RATE_LIMIT` (+ `retryAfterSeconds`)
  - `DomainError` do core (codes `NOT_FOUND`/`VALIDATION_ERROR`/`CONFLICT`/`FORBIDDEN`) -> `domain`
  - Erro Axios (chamada a outra API) -> `EXTERNAL_API_ERROR` (extrai msg do `response.data`, trunca details > 2000 chars)
  - Prisma known error -> **`INTERNAL_ERROR` generico** (nao vaza detalhe do banco; loga no console)
  - Erro generico -> `INTERNAL_ERROR`
- **`formatMcpValidationError(msg)`** — atalho para erro de validacao feito na propria tool (ex.: no builder).

### Grupos de tools
| Grupo | Arquivo | O que faz |
|-------|---------|-----------|
| Discovery | `discovery.tools.ts` | So leitura: `get_custom_fields`, `get_tags`, `get_channels`, `get_kanbans`, `get_assistants`, `get_moderators`, `list_medias`, `get_agents_v2` |
| Builder | `builder.tools.ts` | Monta automacoes (DSL, ver abaixo) |
| Management | `management.tools.ts` | Ciclo de vida: `list/get/toggle/rename/delete_automations`, `get_draft` |
| Template | `template.tools.ts` | Templates de mensagem |
| Tag | `tag.tools.ts` | CRUD de tags/folders + `add/remove_contact_tag` |
| CRM | `crm.tools.ts` | Cards de kanban (create/move/win/lose/assign/list) |
| Contacts | `contacts.tools.ts` | `search_contacts`, `get_contact`, `update_contact_field` |
| Reports | `reports.tools.ts` | Relatorios sobre `@chatfunnel/core/reports` |

### Caso especial: os builder tools (DSL em 2 fases)
Os `add_step_*` e `create_trigger` **NAO persistem nada**. Cada um so devolve um objeto de config marcado com **`_mcpType`** (ex.: `step_message`, `step_condition`, `trigger`). O LLM coleta esses fragmentos e passa todos de uma vez para **`build_automation`**, que:

1. Aceita `trigger` (um) ou `triggers` (varios) — senao `formatMcpValidationError`.
2. Valida roteamento de follow-up (`validateFollowUpRouting`): `answerStepIndex`/`unanswerStepIndex` tem que apontar para indices validos do array `steps`.
3. Propaga `platform` do trigger para steps de mensagem que nao definiram.
4. Chama `builder.buildFullPayload(name, triggers, stepConnections)` do core — que **gera UUIDs, calcula posicoes (auto-layout), encadeia `nextStepId`, preenche defaults**.
5. `resolveFollowUpRouting` troca os indices por UUIDs reais dos steps ja construidos.
6. Se veio `automationId` -> `updateAutomation`, senao `createAutomation` (ambos via `automationsService` -> core).
7. Retorna `{ success, automationId, stepCount, triggerCount, triggerTypes, message }`.

`add_step_condition` e `add_step_ab_test` geram `branchIds`/`variantIds` (via `builder.generateUUID()`) ja no add, para o LLM poder referenciar os branches no `build_automation`.

## Como adicionar uma tool nova
1. Definir `XxxInput`/`XxxOutput` (Zod) em **`@chatfunnel/contracts`**.
2. Expor o metodo no service de dominio local (que delega pro `@chatfunnel/core`); registrar o modulo em `mcp-automation.module.ts` se novo.
3. Escrever `handler` + `server.registerTool(...)` no arquivo de tools do grupo.
4. Chamar o `registerXxxTools` dentro de `createServer` (injetar o service no construtor do `McpServerService`).
5. Teste `.spec.ts` ao lado (padrao existente: um para contratos, um para handlers).

## Gotchas
- Sem `Account-Selected` no header, JWT auth falha (integration token nao precisa — conta fixa no token).
- `recreateSession` so aceita `initialize`; qualquer outro metodo apos restart => `SESSION_RESET`, cliente tem que re-inicializar.
- Rate limiter assume **Redis single-node** (Lua com chaves dinamicas) — nao migrar para Cluster sem reescrever.
- `formatMcpToolError` esconde detalhe de Prisma de proposito; para debugar, olhar o `console.error` do server.
- TTL de sessao aqui e **5min idle** (codigo) — o [[mcp-integration]] cita "30 min"; o valor real e `MCP_SESSION_IDLE_TTL_SECONDS` (default 300s).

## Veja tambem
- [[mcp-integration]] — auth, tokens, fluxo do usuario, frontend/UI
- [[chatfunnel-mcp]] — stack, estrutura de pastas, env vars
- [[automations]] — o dominio que os builder tools constroem
