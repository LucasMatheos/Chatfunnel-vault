---
title: OpenAI SDK — Mapa de Uso Cross-Repo
description: Mapeamento completo de todos os pontos onde o SDK da OpenAI é instanciado ou referenciado no codebase.
tags: [openai, sdk, ai-agents, assistants, a2a, cross-repo]
related: ["[[ai-agents]]", "[[intelligence-a2a]]", "[[mcp-integration]]"]
last_updated: 2026-06-24
---

# OpenAI SDK — Mapa de Uso Cross-Repo

Levantamento de todos os arquivos que importam ou instanciam o SDK `openai` (oficial) e `@ai-sdk/openai` (Vercel AI SDK).

A chave OpenAI é sempre por conta (`account.openaiKey`), nunca global de ambiente.

---

## Repos com uso direto do SDK

### `chatfunnel-services` (TypeScript)

Dois SDKs em uso — `openai` oficial e `@ai-sdk/openai` (Vercel).

#### SDK `openai` — agents-v2

| Arquivo | Linha | O que faz |
|---------|-------|-----------|
| `modules/agents-v2/adapters/openai.provider.ts` | L1, L42 | Provider principal — `new OpenAI({ apiKey })`, wraps chat completions |
| `modules/agents-v2/adapters/provider.factory.ts` | L2, L33 | Fábrica que instancia `OpenAIProvider` por tipo |
| `modules/agents-v2/prompt-build.service.ts` | L8, L216 | `new OpenAI({ apiKey })` — build e test de prompts |
| `modules/agents-v2/services/ai-models.service.ts` | L2, L73 | `new OpenAI({ apiKey })` — lista modelos disponíveis da conta |

Arquivos de suporte (sem `new OpenAI`):
- `adapters/ai-provider.interface.ts` — interface de provider
- `database/repositories/openai_assistants.repository.ts` — repo Prisma dos assistants
- `database/repositories/openai_assistant_threads.repository.ts` — repo Prisma das threads

#### SDK `@ai-sdk/openai` — módulo A2A

| Arquivo | Linha | O que faz |
|---------|-------|-----------|
| `modules/a2a/services/a2a-agent.service.ts` | L15 | `createOpenAI(...)` — provider do Vercel AI SDK para o A2A |
| `modules/a2a/services/provider-resolver.ts` | — | Resolve qual provider usar por configuração |

> O módulo A2A **não está em produção** ainda. Ver [[intelligence-a2a]].

---

### `chatfunnel-api` (JavaScript legado)

SDK `openai` via `require('openai')`. Cada handler instancia o cliente localmente com `account.openaiKey`.

#### Gestão da chave OpenAI

| Arquivo | O que faz |
|---------|-----------|
| `commands/accounts/PostOpenaiKey/handler.js` | Salva, valida e deleta a chave OpenAI da conta (3x `new OpenAI`) |
| `commands/accounts/GetOpenaiModels.js` | Lista modelos disponíveis para a conta |
| `commands/accounts/DeleteChannel.js` | Import presente, usado na limpeza ao deletar canal |

#### CRUD de Assistants

| Arquivo | O que faz |
|---------|-----------|
| `commands/assistant/CreateAssistant/handler.js` | Cria assistant na OpenAI |
| `commands/assistant/UpdateAssistant/handler.js` | Atualiza assistant |
| `commands/assistant/DeleteAssistant/handler.js` | Deleta assistant |
| `commands/assistant/ImportAssistant.js` | Importa assistant existente da OpenAI |
| `commands/assistant/UploadAssistantFiles.js` | Upload de arquivos para o assistant |
| `commands/assistant/DeleteAssistantFiles.js` | Remove arquivos do assistant |

#### Webhook / Runtime

| Arquivo | O que faz |
|---------|-----------|
| `class/S3Class.js` | `new OpenAI(...)` — transcrição de áudio via Whisper |
| `commands/instagram/WebHookHandler/processor/fragments/HandlerAssistant.js` | Handler principal do assistant no webhook do Instagram (legado) |
| `commands/instagram/WebHookHandler/processor/agents-v2/providers/OpenAIHandlerAgent.ts` | Provider agents-v2 dentro do webhook handler |

---

## Repos com referências (sem SDK direto)

### `chatfunnel-core` (TypeScript)

Não instancia o SDK. Contém a camada de dados dos assistants:

- `repositories/openai_assistants.repository.ts` — CRUD de assistants no banco
- `repositories/openai_assistant_threads.repository.ts` — CRUD de threads no banco
- `services/assistants/assistants.service.ts` — serviço de domínio
- `services/assistants/handlers/list-assistants.handler.ts` — handler de listagem

### `chatfunnel-mcp` (TypeScript)

- `src/assistants/assistants.service.ts` — serviço de assistants exposto via MCP

---

## Repos **sem** uso de OpenAI

`chatfunnel-front`, `chatfunnel-gateway`, `chatfunnel-scheduler`, `chatfunnel-websocket`, `chatfunnel-worker-broadcast`, `chatfunnel-contracts`

---

## Padrão de instanciação

```ts
// services (TypeScript)
import OpenAI from 'openai';
const client = new OpenAI({ apiKey }); // apiKey vem de account.openaiKey

// api (JavaScript)
const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: account.openaiKey });
```

Não existe cliente singleton global — cada handler/service instancia o cliente com a chave da conta no momento da chamada.

---

## Observações

- `chatfunnel-services` tem **dois SDKs**: `openai` (agents-v2) e `@ai-sdk/openai` (a2a). São independentes.
- O Vercel AI SDK (`@ai-sdk/openai`) só existe no módulo A2A — ainda em desenvolvimento.
- A gestão da chave por conta (multi-tenant) está em `PostOpenaiKey` na API.
- Não há centralização do cliente OpenAI — pode ser extraído para `chatfunnel-core` futuramente.
