---
title: chatfunnel-mcp
description: Referencia tecnica do servidor MCP — stack, estrutura, auth, sessoes, tools.
tags: [repo, mcp, nestjs, typescript]
related: ["[[mcp-integration]]", "[[chatfunnel-core]]", "[[chatfunnel-services]]"]
last_updated: 2026-04-06
---

# chatfunnel-mcp

Servidor MCP (Model Context Protocol) que expoe as funcionalidades do ChatFunnel para LLMs via JSON-RPC 2.0.

## Stack

- **Framework:** NestJS 11 + SWC
- **Protocolo:** MCP SDK 1.27.1
- **Database:** PostgreSQL via Prisma (compartilhado com @chatfunnel/core)
- **Cache/Sessoes:** Redis (ioredis 5.10.1)
- **Auth:** JWT (@nestjs/jwt 11.0.2)
- **Validacao:** Zod 4.3.6
- **Storage:** AWS S3
- **Porta:** 8000

## Estrutura

```
src/
  main.ts                           # Bootstrap (porta 8000)
  app.module.ts                     # Root module
  redis/                            # Redis module + constants
  database/                         # PrismaClient wrapper
  mcp/
    mcp.controller.ts               # Endpoints HTTP
    mcp-server.service.ts           # Logica principal MCP (~460 lines)
    mcp-automation.module.ts        # Module setup
    dto/                            # DTOs de request
    errors/                         # McpHttpError, McpRateLimitError, McpToolError
    guards/                         # AccountSelectedGuard
    services/
      mcp-auth.service.ts           # Auth (JWT + integration tokens, ~545 lines)
      mcp-session-store.service.ts  # Sessoes dual (memory + Redis)
      mcp-rate-limiter.service.ts   # Rate limiting com Lua scripts
      automation-builder.service.ts # Extends @chatfunnel/core
    schemas/                        # Zod schemas por grupo de tools
    tools/                          # Implementacao das tools por grupo
  agents/                           # Agent management
  automations/                      # Automation management
  templates/                        # Template management
  tags/                             # Tag management
  contacts/                         # Contact management
  channels/                         # Channel management
  kanban/                           # Kanban/CRM management
  assistants/                       # AI assistant management
  moderators/                       # Team moderator management
  custom-fields/                    # Custom field management
  adapters/
    s3-storage.adapter.ts           # S3 storage
```

## Dependencias de @chatfunnel/core

```typescript
import { AccountsRepository, McpTokensRepository } from "@chatfunnel/core/repositories";
import { PrismaClient } from "@chatfunnel/core/database";
import { AutomationBuilderService } from "@chatfunnel/core/services";
```

## Variaveis de ambiente

| Variavel | Default | Descricao |
|----------|---------|-----------|
| `PORT` | 8000 | Porta HTTP |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `REDIS_URL` | `redis://:@127.0.0.1:6379` | Redis |
| `JWT_SECRET` | — | Verifica JWTs do frontend |
| `MCP_JWT_SECRET` | — | Assina/verifica MCP JWTs |
| `MCP_JWT_ISSUER` | `chatfunnel-mcp` | JWT issuer claim |
| `MCP_JWT_AUDIENCE` | `mcp` | JWT audience claim |
| `MCP_JWT_TTL_SECONDS` | `900` | Vida util do MCP JWT (15 min) |
| `MCP_ALLOW_LEGACY_FRONTEND_JWT` | `false` | Permitir auth com JWT do frontend |

## Comandos

```bash
npm run dev     # Dev server (watch mode)
npm run build   # Build producao (SWC)
npm run start   # Start producao
```

## Veja tambem

- [[mcp-integration]] — documentacao completa da feature (auth, tools, rate limiting, fluxo do usuario)
