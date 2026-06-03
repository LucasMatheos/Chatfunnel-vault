---
title: chatfunnel-contracts
description: Referencia tecnica do pacote de contratos — Zod schemas, TOOL_REGISTRY, A2A types, transports.
tags: [repo, contracts, zod, typescript, schemas]
related: ["[[chatfunnel-mcp]]", "[[chatfunnel-services]]", "[[chatfunnel-front]]", "[[chatfunnel-core]]", "[[intelligence-a2a]]"]
last_updated: 2026-05-25
---

# chatfunnel-contracts

Single source of truth para todos os wire contracts do ecossistema ChatFunnel. Pacote "pure schema" que exporta apenas validacoes Zod e tipos TypeScript — zero logica runtime.

## Stack

- **Linguagem:** TypeScript 5.1.3
- **Schema:** Zod 4.3.6 (unica dependencia)
- **Build:** tsc (CommonJS, ES2023)
- **Registry:** GitHub Packages (@chatfunnel/contracts)
- **CI/CD:** Jenkins (versionamento automatico por branch)

## Estrutura

```
src/
  index.ts                       # Barrel export raiz (re-exporta tudo)
  a2a/
    index.ts                     # Exports A2A
    types.ts                     # Content blocks, messages, SSE events
  endpoints/
    index.ts                     # Contratos REST (template — vazio)
  queues/
    index.ts                     # Payloads de jobs cross-service (template — vazio)
  shared/
    index.ts                     # Primitivos compartilhados — paginacao, branded IDs (template — vazio)
  sockets/
    index.ts                     # Contratos Socket.IO (template — vazio)
  tools/
    index.ts                     # Barrel export tools
    registry.ts                  # TOOL_REGISTRY + validateToolOutput
    builder.contracts.ts         # Automation builder (triggers, steps, flows)
    contacts.contracts.ts        # Operacoes de contatos
    crm.contracts.ts             # Operacoes de kanban cards
    discovery.contracts.ts       # Discovery (channels, tags, fields, kanbans, assistants)
    management.contracts.ts      # Gerenciamento de automacoes
    tag.contracts.ts             # CRUD de tags
    template.contracts.ts        # Templates WhatsApp
  webhooks/
    index.ts                     # Payloads internos de webhook (template — vazio)
```

## Transports

O pacote organiza contratos por metodo de comunicacao:

| Transport | Pasta | Status | Descricao |
|-----------|-------|--------|-----------|
| Tools (MCP/A2A) | `tools/` | **populado** | ~60 tools com input/output Zod shapes |
| A2A Protocol | `a2a/` | **populado** | Content blocks, SSE events, messages |
| REST Endpoints | `endpoints/` | template | Convencao: `<Verb><Resource>Body` / `Response` |
| Socket.IO Events | `sockets/` | template | Convencao: `<EventName>Payload` + `EVENT_<NAME>` |
| Webhooks | `webhooks/` | template | Convencao: `<Producer>.contracts.ts` |
| Queues (BullMQ) | `queues/` | template | Convencao: `<QueueName>JobData` |
| Shared Primitives | `shared/` | template | Paginacao, branded IDs, etc. |

## TOOL_REGISTRY

Mapa central de todas as tools MCP. Cada entrada tem `input` e `output` como `ZodRawShape`:

```typescript
import { TOOL_REGISTRY } from "@chatfunnel/contracts/tools";

// Registro direto no MCP SDK
for (const [name, contract] of Object.entries(TOOL_REGISTRY)) {
  server.registerTool(name, {
    inputSchema: z.object(contract.input),
    outputSchema: z.object(contract.output),
  });
}
```

### Dominios de tools

| Dominio | Arquivo | Exemplos |
|---------|---------|----------|
| Contacts | `contacts.contracts.ts` | search_contacts, get_contact, update_contact_field |
| Discovery | `discovery.contracts.ts` | get_channels, get_tags, get_kanbans, get_moderators, get_agents_v2 |
| Tags | `tag.contracts.ts` | create_tag, add_contact_tag, list_tag_folders |
| Templates | `template.contracts.ts` | list_templates, create_template, sync_templates |
| CRM/Kanban | `crm.contracts.ts` | create_kanban_card, move_kanban_card, win_kanban_card |
| Management | `management.contracts.ts` | list_automations, toggle_automation, get_draft |
| Builder | `builder.contracts.ts` | create_trigger, add_step_message, build_automation |

## A2A Types

Tipos do protocolo Assistant-to-Agent (Intelligence chat):

| Tipo | Descricao |
|------|-----------|
| `A2aContentBlock` | Union discriminada: text, tool_use, tool_result |
| `A2aToolResultPart` | Conteudo de resultado: text, json, image, resource |
| `A2aChatMessage` | Mensagem in-memory (id, role, content, timestamp) |
| `A2aPersistedMessage` | Mensagem salva (conversationId, createdAt) |
| `A2aTokenUsage` | Metricas de tokens (inputTokens, outputTokens, costUsd) |
| `A2aBlockStartEventData` | SSE: inicio de bloco |
| `A2aBlockDeltaEventData` | SSE: delta de bloco |
| `A2aBlockStopEventData` | SSE: fim de bloco |
| `A2aDoneEventData` | SSE: stream completo |

## Consumidores

| Repo | Como usa |
|------|----------|
| **chatfunnel-mcp** | Registra tools via `TOOL_REGISTRY` com inputSchema/outputSchema |
| **chatfunnel-services** | Valida `structuredContent` contra output schemas no boundary SSE |
| **chatfunnel-front** | Importa tipos inferidos para renderers tipados por toolName |
| **chatfunnel-websocket** | (futuro) Contratos de eventos Socket.IO |

## Versionamento

| Branch | Tag npm | Exemplo |
|--------|---------|---------|
| `main` | `latest` | `1.0.1` |
| `release` | `release` | `1.0.1-rc.42` |
| `dev` | `dev` | `1.0.1-dev.42` |

## Imports

```typescript
// Subpath exports (tree-shakeable)
import { search_contacts } from "@chatfunnel/contracts/tools";
import { A2aContentBlock } from "@chatfunnel/contracts/a2a";

// Barrel (backward compatible)
import { search_contacts, A2aContentBlock } from "@chatfunnel/contracts";
```

## Regra de pureza

**Unica dependencia permitida: Zod.** ESLint bloqueia imports de `@chatfunnel/*`, `@prisma/*`, `@nestjs/*`, `express`, `fs`, `path`, `crypto`, `child_process`. Isso garante que o pacote e seguro para uso no browser.

## Comandos

```bash
npm run build   # Compila src/ → dist/ via tsc
npm run dev     # Watch mode
npm publish     # Publica (prepublishOnly roda build automaticamente)
```

## Veja tambem

- [[mcp-integration]] — feature MCP que consome TOOL_REGISTRY
- [[intelligence-a2a]] — feature A2A que usa os tipos de protocolo
- [[chatfunnel-mcp]] — servidor MCP que registra as tools
