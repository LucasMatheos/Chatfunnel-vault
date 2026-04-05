---
title: Queue Architecture — Filas e Jobs Assincronos
description: Como as filas conectam os servicos — Bull na API, BullMQ no Services/Workers, NATS no Gateway
tags: [architecture, queues, bull, bullmq, nats, redis, scheduler]
related: ["[[message-flow]]", "[[multi-tenancy]]", "[[realtime-communication]]"]
last_updated: 2026-04-05
---

# Queue Architecture

O ChatFunnel usa 3 sistemas de filas diferentes, cada um com seu proposito.

## Visao Geral

| Sistema | Onde | Transport | Proposito |
|---------|------|-----------|-----------|
| **NATS JetStream** | chatfunnel-gateway (Go) | NATS server | Webhooks Meta → processor |
| **Bull** | chatfunnel-api (Express/JS) | Redis | 12 filas de automacoes, assistants, broadcasts |
| **BullMQ** | chatfunnel-services, scheduler, worker-broadcast | Redis | Jobs agendados, broadcast WhatsApp |

### Por que 3 sistemas?

- **NATS**: Gateway e Go, precisa de mensageria leve e confiavel. NATS e nativo Go.
- **Bull**: API e o servico mais antigo (JS puro). Bull era o padrao na epoca.
- **BullMQ**: Services e mais novo (NestJS/TS). BullMQ e a versao moderna do Bull.

## NATS JetStream (Gateway)

```
[Meta webhook] → [Gateway API] → NATS stream "GATEWAY" → [Gateway Worker] → HTTP POST → [Services]
```

- Stream: `GATEWAY`, subject: `GATEWAY.REQUESTS`
- Consumer: `worker` com MaxDeliver: 5, backoff: 10s/30s/60s/120s
- maxConcurrency: 50 (semaforo no worker)
- MaxAckPending: 200

## Bull (API)

12 filas em `chatfunnel-api/src/class/queues/`:

- `AutomationStepDelayQueue` — delay entre steps de automacao
- `AutomationStepFollowUpQueue` — follow-up de automacao
- `AutomationStepInputQueue` — aguarda input do contato
- `AutomationAssistantFollowUpQueue` — follow-up do assistente IA
- `BroadcastQueue` — disparo de broadcast
- `EventScheduledReminderQueue` — lembretes agendados
- `ExpireAssistantQueue` — expiracao de sessao de assistente
- `ExpireAssistantCommentQueue` — expiracao de comentario
- `ProcessHistoryQueue` — processamento de historico
- `RemoveAutomationBlacklistQueue` — remover blacklist
- `SystemActionsQueue` — acoes do sistema
- `TestQueue` — fila de teste

IMPORTANT: Usa `bull` (nao `bullmq`). API diferente.

## BullMQ (Services + Scheduler + Worker Broadcast)

### chatfunnel-scheduler (orquestrador)

O scheduler e o hub central de jobs agendados. Outros servicos agendam via HTTP:

```
[Qualquer servico] → POST /scheduler/:queueName/schedule → [Scheduler API]
                                                                │
                                                    Redis queue com delay
                                                                │
                                                    [Scheduler Worker] → POST para WORKER_SERVICE_URL
```

- 11 filas registradas (mesmos nomes do Bull na API + extras)
- API sem autenticacao — acesso via rede interna Docker
- `@chatfunnel/core` usa `BaseQueue.scheduleJob()` que faz HTTP para o scheduler

### chatfunnel-worker-broadcast

Pipeline de envio de mensagens WhatsApp em massa:

```
POST /broadcasts/dispatch
    ↓
[broadcast.service] busca contatos (batches de 500)
    ↓
[sendMessage processor] rate limit 80/s por canal (hardcoded)
    ↓
[Meta WhatsApp API] envia template
    ↓
[Redis buffer "db-write-buffer"] acumula resultados
    ↓
[databaseBatch processor] grava no PostgreSQL (batches de 500)
```

- 3 processos: API + worker (sendMessage) + worker:batch (databaseBatch + scheduler embutido)
- Rate limit de 80/s e hardcoded em `channelThroughput`, nao configuravel

## Fluxo de um Job Agendado (ex: delay de automacao)

```
1. chatfunnel-api processa mensagem
2. Automacao tem step com delay de 30min
3. API chama @chatfunnel/core BaseQueue.scheduleJob()
4. Core faz HTTP POST para chatfunnel-scheduler
5. Scheduler cria job no Redis com delay de 30min
6. Apos 30min, Scheduler Worker consome o job
7. Worker faz POST para chatfunnel-services (WORKER_SERVICE_URL)
8. Services processa o proximo step da automacao
```
