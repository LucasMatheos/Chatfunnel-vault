---
title: API Layer (Express)
description: Referencia tecnica da API Express — command pattern, createRoute, filas Bull, middlewares, module aliases.
tags: [layers, api, express, commands, bull]
related: ["[[services-layer]]", "[[core-layer]]", "[[frontend-layer]]"]
last_updated: 2026-04-05
---

# API Layer (Express)

API principal do ChatFunnel. **JavaScript puro** (CommonJS), porta 3001, prefixo `/api/`.

## Estrutura

```
src/
  app.js              # Express setup (CORS, bodyParser 5mb, routes em /api/)
  prisma.js           # Prisma client instance
  routes/             # 22 route files — usam createRoute()
  commands/            # 22 modulos de dominio — logica de negocio
  middlewares/         # Auth e validacao (VerifyJWT, VerifyAccountSelected, etc.)
  class/queues/       # 12 filas Bull + BaseQueue
  class/sockets/      # Socket.IO emitters (Chat, Kanban)
  common/apis/        # Clients externos (Facebook, Redis, Cloud, Payment, etc.)
  common/crons/       # Cron jobs (node-cron)
  common/services/    # Services compartilhados
  common/utils/       # Utilitarios (inclui createRoute)
```

## Command Pattern

Logica de negocio fica em `commands/`, organizada por dominio (22 modulos). Routes nunca contem logica — apenas chamam commands.

- Commands recebem dados puros (nao `req`/`res`)
- Retornam resultado ou fazem `throw` de erro
- Importados via alias `@commands/dominio/NomeCommand`

## createRoute()

**NUNCA** usar `router.get/post` diretamente. Toda rota usa o helper:

```js
createRoute(router, method, path, controller, options)
```

| Opcao | Default | Descricao |
|-------|---------|-----------|
| `useAuth` | `true` | Aplica `VerifyJWT` |
| `hasValidation` | `false` | Ativa `express-validator` |
| `useAccountSelected` | `false` | Aplica `VerifyAccountSelected` (multi-tenancy) |
| `useAdminAuth` | `false` | Aplica `VerifyAdmin` |
| `mids` | `[]` | Middlewares extras |

## Como adicionar uma rota nova

1. Criar command em `src/commands/<dominio>/NomeCommand.js`
2. Criar/editar route em `src/routes/<dominio>.js` usando `createRoute()`
3. Importar via aliases (`@commands`, `@database`, etc.)
4. Se precisar de validacao, usar `express-validator` com `hasValidation: true`

## Module Aliases

27 aliases via `module-alias` — **obrigatorio** usar em vez de paths relativos. Principais:

| Alias | Caminho |
|-------|---------|
| `@commands` | `src/commands/` |
| `@database` | `src/prisma.js` |
| `@middlewares` | `src/middlewares/index.js` |
| `@queues` | `src/class/queues/index.js` |
| `@sockets` | `src/class/sockets/index.js` |
| `@utils` | `src/common/utils/index.js` |
| `@logger` | `src/class/LoggerClass.js` |

IMPORTANTE: `module-alias/register` deve ser o **primeiro** require em qualquer entrypoint.

## Middlewares

| Middleware | Proposito |
|------------|-----------|
| `VerifyJWT` | Auth principal (aplicado via `createRoute`) |
| `VerifyAccountSelected` | Multi-tenancy guard |
| `VerifyAdmin` | Admin-only |
| `VerifyServicesSecret` | Inter-service auth (chamadas do [[services-layer]]) |
| `VerifyWorkerSecret` | Worker auth |
| `AuthorizeApikey` | API key auth |

## Bull Queues

12 filas usando **Bull** (nao BullMQ — API diferente do [[services-layer]]). Classes em `class/queues/`, todas herdam `BaseQueue`. Importadas via `@queues`.

## Socket.IO

Emitters em `class/sockets/` — `ChatSocket` e `KanbanSocket`. Importados via `@sockets`. Usados para real-time no [[frontend-layer]].

## Entrypoints

O repo tem multiplos servers independentes: `ServerFrontend.js` (principal, porta 3001), `ServerWebhookN1/N2.js`, `ServerWorkerBull.js`. Todos instanciam `ServerBase.js` (init DB, Redis, metrics, crons, shutdown).
