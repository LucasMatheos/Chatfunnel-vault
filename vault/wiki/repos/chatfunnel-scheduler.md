---
title: chatfunnel-scheduler
description: Referencia tecnica do scheduler — API HTTP + worker BullMQ para tarefas agendadas.
tags: [repos, scheduler, bullmq, cron]
related: ["[[chatfunnel-core]]", "[[chatfunnel-worker-broadcast]]", "[[chatfunnel-api]]"]
last_updated: 2026-04-12
---

# chatfunnel-scheduler

Tarefas agendadas — API HTTP que recebe jobs + worker BullMQ que processa. **Node + TypeScript**, porta 3000.

## Stack

- Node.js + TypeScript + Express
- BullMQ 5.x (producer + consumer)
- axios (HTTP client pro WorkerService)
- Porta 3000

## Estrutura

```
src/
├── index.ts                    # Express API (porta 3000)
├── worker.ts                   # Worker entry point (BullMQ processors)
├── routes/
│   └── scheduler.routes.ts     # REST endpoints para agendar jobs
├── queues/
│   ├── BaseQueue.ts            # Classe base (Queue + Worker)
│   └── queues.ts               # Registry das 11 queues
└── services/
    └── WorkerService.ts        # HTTP client para despachar jobs
```

## Queues (11)

| Queue | Descricao |
|---|---|
| `automationStepDelayQueue` | Steps de automacao com delay |
| `automationStepFollowUpQueue` | Follow-ups de automacao |
| `automationStepInputQueue` | Processamento de inputs |
| `broadcastQueue` | Despacho de broadcasts |
| `expireAssistantCommentQueue` | Expiracao de comentarios |
| `expireAssistantQueue` | Expiracao de assistentes |
| `processHistoryQueue` | Processamento de historico |
| `systemActionsQueue` | Acoes de sistema |
| `removeAutomationBlacklistQueue` | Limpeza de blacklist |
| `automationAssistantFollowUpQueue` | Follow-ups de assistente |
| `eventScheduledReminderQueue` | Lembretes de eventos |

## Patterns & Convencoes

### Dual Process Design

API e Worker sao processos **completamente separados** — compartilham apenas Redis.

```bash
npm run dev              # API (porta 3000, debug 9995)
npm run dev:worker       # Worker (debug 9996)
```

### Fluxo de dados

```
Outro servico → POST /:queueName/schedule { jobId, context, delay }
  → BaseQueue.addJob() → Redis
  
Worker (BullMQ)
  → BaseQueue.executeWorker()
  → WorkerService.send(queueName, context)
    → POST {WORKER_SERVICE_URL}/workers/{queueName}  (maioria)
    → POST {WORKER_BROADCAST_URL}/broadcasts/dispatch (broadcastQueue)
```

### Caso especial: broadcastQueue

`broadcastQueue` roteia pra URL diferente (`WORKER_BROADCAST_URL`) sem header de autenticacao. Todas as outras queues usam `WORKER_SERVICE_URL` com `x-internal-secret`.

### Endpoints

| Metodo | Rota | Descricao |
|---|---|---|
| GET | `/health` | `{ status: "ok" }` |
| POST | `/:queueName/schedule` | Agenda job com delay/retry |
| GET | `/jobs` | Status de todas as queues |
| DELETE | `/:queueName/:id` | Cancela job |
| POST | `/:queueName/:id/run` | Promove job delayed pra execucao imediata |

### Job options default

- Attempts: 3
- Backoff: fixed 10s
- Retencao: 100 completed, 50 failed

## Variaveis de ambiente

| Var | Default | Descricao |
|---|---|---|
| `PORT` | 3000 | Porta da API |
| `REDIS_URL` | redis://127.0.0.1:6379 | Conexao Redis |
| `WORKER_SERVICE_URL` | — | URL do chatfunnel-services (**obrigatorio**) |
| `WORKER_SERVICE_SECRET` | — | Secret pra header x-internal-secret (**obrigatorio**) |
| `WORKER_BROADCAST_URL` | — | URL do worker-broadcast (precisa de `/` no final) |

## Gotchas

- `WorkerService` crasha o processo API se worker falhar — separar processos
- `WORKER_BROADCAST_URL` precisa de `/` no final (sem `/` gera URL invalida)
- `ioredis` vem como dependencia transitiva — nao esta no `package.json`
- 3 conexoes Redis no `sendMessage` processor (pode esgotar pool)

Veja tambem: [[infrastructure-gotchas]]
