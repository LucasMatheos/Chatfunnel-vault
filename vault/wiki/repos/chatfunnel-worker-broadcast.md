---
title: chatfunnel-worker-broadcast
description: Referencia tecnica do worker de broadcast — BullMQ, envio em massa WhatsApp, rate limiting.
tags: [repos, worker, broadcast, bullmq, whatsapp]
related: ["[[chatfunnel-scheduler]]", "[[chatfunnel-core]]", "[[chatfunnel-services]]"]
last_updated: 2026-04-12
---

# chatfunnel-worker-broadcast

Worker de broadcast (envio em massa WhatsApp). **Node + TypeScript**, porta 3000 (API interna).

## Stack

- Node.js + TypeScript + Express
- BullMQ 5.x (consumer)
- ioredis 5.x (3 conexoes separadas)
- rate-limiter-flexible (rate limit distribuido)
- pino (logger)
- @chatfunnel/core (Prisma, DB models)
- Meta Graph API v19.0

## Estrutura

```
src/
├── index.ts                          # Express server + health + routes
├── env.ts                            # Variaveis de ambiente
├── api/
│   └── WhatsappApi.ts                # Client Meta Graph API v19.0
├── controllers/
│   └── broadcast.controller.ts       # POST dispatcher
├── routes/
│   └── broadcast.routes.ts           # POST /broadcasts/dispatch
├── services/
│   └── broadcast.service.ts          # Core logic + enqueue
├── queues/
│   ├── index.ts                      # QueueEvents listener (logs)
│   └── processors/
│       ├── sendMessage.processor.ts  # Worker: broadcast-send
│       └── databaseBatch.processor.ts # Worker: database-batch-writer-queue
├── schedulers/
│   └── databaseBatch.scheduler.ts    # Job repetitivo (embutido no batch processor)
└── types/
    └── global.d.ts
```

## Patterns & Convencoes

### Fluxo de dados

```
POST /broadcasts/dispatch
  → BroadcastService.enqueueBroadcast()
    → Fetch contatos PENDING em batches de 500
    → Enfileira cada contato na queue "broadcast-send"

sendMessage.processor (por job)
  → Rate limit distribuido (80 msgs/seg por canal)
  → Chama WhatsApp API (sendTemplate)
  → Grava resultado no Redis list "db-write-buffer"
  → Se rate limited: moveToDelayed() sem consumir attempt

databaseBatch.processor (a cada 5 segundos)
  → Pop ate 500 itens do "db-write-buffer"
  → Cria conversations faltantes
  → Batch insert messages + metadata em $transaction
  → Marca broadcast como finalizado quando todos processados
```

### 3 processos separados (dev)

```bash
npm run dev              # Express API (porta 9991 debug)
npm run worker           # sendMessage processor (porta 9992 debug)
npm run worker:batch     # databaseBatch processor (porta 9993 debug)
```

### Sem escrita direta no DB pelo worker

Todas as escritas vao pro Redis buffer → batch processor → Prisma transaction. Nunca escrita direta no DB durante envio de mensagem.

### Rate limiting distribuido

80 msgs/seg por canal, usando `rate-limiter-flexible` com Redis. No rate limit, job e movido pra delayed sem consumir attempt (pode reprocessar indefinidamente).

## Endpoints

| Metodo | Rota | Descricao |
|---|---|---|
| GET | `/health` | `{ status: "ok" }` |
| POST | `/broadcasts/dispatch` | Enfileira broadcast pra envio |

## Variaveis de ambiente

| Var | Default | Descricao |
|---|---|---|
| `PORT` | 3000 | Porta do Express |
| `REDIS_URL` | — | Conexao Redis (obrigatorio) |
| `DATABASE_URL` | — | Conexao PostgreSQL (obrigatorio) |
| `BROADCAST_MAX_CONCURRENCY` | 10 | Workers concorrentes |

## Gotchas

- Rate limit 80/s hardcoded em `channelThroughput` dentro do processor
- `BROADCAST_RATE_DELAY_MS` existe em `env.ts` mas **NAO e usada** — env var fantasma
- `conversations` chega serializado (string) — precisa de `JSON.parse`
- Rate limit nao consome attempt no retry — pode reprocessar infinitamente

Veja tambem: [[infrastructure-gotchas]], [[integration-gotchas]]
