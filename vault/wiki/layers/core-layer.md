---
title: Core Layer (@chatfunnel/core)
description: Referencia tecnica da lib compartilhada — createCoreServices, repositories, queues via HTTP, Meta APIs, EventBus, adapters.
tags: [layers, core, prisma, repositories, queues, meta-api]
related: ["[[api-layer]]", "[[services-layer]]", "[[frontend-layer]]"]
last_updated: 2026-04-05
---

# Core Layer (@chatfunnel/core)

Biblioteca TypeScript compartilhada por todos os repos. Contem Prisma, repositories, services, queues, Meta APIs, eventos, sockets e errors.

## Subpath Exports

Cada subpath e um modulo independente:

```typescript
import { createCoreServices, DomainError, EventBus } from "@chatfunnel/core";
import { PrismaClient, Accounts } from "@chatfunnel/core/database";
import { AccountsRepository } from "@chatfunnel/core/repositories";
import { ContactsService } from "@chatfunnel/core/services";
import { BroadcastQueue, BaseQueue } from "@chatfunnel/core/queues";
import { RedisService } from "@chatfunnel/core/redis";
import { WhatsAppAPI } from "@chatfunnel/core/meta";
import { formatPhone } from "@chatfunnel/core/helpers";
import { BaseSocket, KanbanSocket } from "@chatfunnel/core/sockets";
```

## createCoreServices() — Factory Central

Entry point em `container.ts`. Todos os repos consumidores chamam no bootstrap:

```typescript
createCoreServices(config: CoreConfig) → { eventBus, queues, repositories, services }
```

`CoreConfig` recebe:
- `prisma` — PrismaClient
- `scheduler` — config do chatfunnel-scheduler (URL + secret)
- `adapters?` — `{ queue?, storage?, email?, cache? }` (opcionais, ports)

Se `cache` nao for passado, cria um **dummy no-op** (funciona mas sem caching).

## Repositories (~65)

Cada repository wrapa uma tabela Prisma:
- Recebe `PrismaClient` no constructor
- Alguns recebem tambem uma queue (ex: `ContactsRepository` recebe `SystemActionsQueue` para side-effects)
- Pattern: metodos async que chamam `this.prisma.<model>.*`

GOTCHA: ~9 repos mais novos (agents_v2, a2a_*, moderators) sao exportados mas **NAO instanciados** em `createCoreServices()`.

## Queues (HTTP para Scheduler)

Herdam `BaseQueue`. Comunicam com `chatfunnel-scheduler` via **HTTP** (nao BullMQ direto):

```
BaseQueue.scheduleJob() → POST chatfunnel-scheduler
                          header: x-internal-secret
```

Metodos: `scheduleJob()`, `cancelJob()`, `runNow()`. Cada fila define seu proprio `addJob()`. 12 filas concretas (broadcast, automations, assistants, etc.).

## Meta API Wrappers

Clients HTTP em `meta/` para APIs Meta:
- **WhatsApp** Cloud API
- **Instagram** API
- **Facebook** (Ads, Conversions, Common)

GOTCHA: Usam `process.env.*` diretamente — nao passam por config/container.

## EventBus

`EventBus` tipado por `DomainEvents`:
- Metodos: `on()`, `off()`, `emit()`
- Handlers sao executados **sequencialmente** (await) — um handler lento bloqueia os seguintes

## Adapters (Ports)

Interfaces puras em `adapters/`: `QueueAdapter`, `StorageAdapter`, `EmailAdapter`, `CacheAdapter`. Core nao tem implementacao concreta — implementacoes ficam nos repos consumidores.

## Sockets

`BaseSocket` recebe `SignalREmitter` e emite via `emitSocket()`. `KanbanSocket` extende com eventos de kanban.

## Prisma / Database

- Schema em `prisma/schema.prisma` (~3000 linhas, 400+ migrations)
- `database/index.ts` re-exporta `@prisma/client` + `JsonValue`/`InputJsonValue`
- Consumers importam tipos via `@chatfunnel/core/database`
- `postinstall` roda `prisma generate` automaticamente
- NUNCA alterar schema sem `prisma migrate dev --create-only`

## Errors

Hierarquia: `DomainError` (base), `NotFoundError`, `ValidationError`, `ConflictError`, `ForbiddenError`. Filtrados pelos [[services-layer]] filters.

## TypeScript Config

- Target: ES2023, Module: CommonJS
- `strict: false`, `strictNullChecks: true`, `noImplicitAny: false`
- `declarationMap: true` — permite Go to Definition ate o src do core

## Versioning

- [[api-layer]] consome `@chatfunnel/core@dev`
- [[services-layer]] consome `@chatfunnel/core@release`
