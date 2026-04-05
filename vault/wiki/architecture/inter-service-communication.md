---
title: Inter-Service Communication
description: Mapa completo de como os servicos se comunicam — HTTP, NATS, Socket.IO, Redis
tags: [architecture, inter-service, communication, http, nats, socket-io]
related: ["[[message-flow]]", "[[auth-flow]]", "[[queue-architecture]]", "[[realtime-communication]]"]
last_updated: 2026-04-05
---

# Inter-Service Communication

## Servicos e Portas

| Servico | Stack | Porta | Funcao |
|---------|-------|-------|--------|
| chatfunnel-front | Vue 3 + Vite | 5173 | Dashboard, livechat, CRM |
| chatfunnel-api | Express + JS | 3001 | API principal (REST) |
| chatfunnel-services | NestJS + TS | 3200 | Processamento, IA, integracoes |
| chatfunnel-external-api | Express + JS | 3002 | API publica (integracoes externas) |
| chatfunnel-gateway | Go | env PORT | Webhook receiver + NATS publisher |
| chatfunnel-websocket | Socket.IO + TS | 10000 | Hub de broadcast realtime |
| chatfunnel-scheduler | Express + TS | 3000 | API de agendamento + worker BullMQ |
| chatfunnel-worker-broadcast | Express + TS | env PORT | Envio de broadcast WhatsApp |
| chatfunnel-core | TS lib | — | Lib compartilhada (Prisma, queues, meta) |

## Matriz de Comunicacao

| De | Para | Protocolo | Rota/Canal | Auth |
|----|------|-----------|------------|------|
| Front | API | HTTP | `/api/*` :3001 | JWT Bearer header |
| Front | Services | HTTP | `/nest/*` :3200 | JWT Bearer header |
| Front | WebSocket | Socket.IO | `/ws` :10000 | Nenhuma |
| Meta (webhook) | Gateway | HTTP | `POST /whatsapp_hook`, `/instagram_hook` | hub.challenge (verificacao Meta) |
| Gateway API | NATS | NATS JetStream | Stream `GATEWAY`, subject `GATEWAY.REQUESTS` | Nenhuma (rede interna) |
| Gateway Worker | Services | HTTP | `POST PROCESSOR_URL` :3200 | Nenhuma (rede interna) |
| Services | API | HTTP | `/api/*` :3001 | `x-internal-secret` → `VerifyServicesSecret` |
| Services | WebSocket | Socket.IO client | `broadcast` event :10000 | Nenhuma (rede interna) |
| API | WebSocket | Socket.IO client | `broadcast` event :10000 | Nenhuma (rede interna) |
| External API | WebSocket | Socket.IO client | `broadcast` event :10000 via `global.signalR` | Nenhuma (rede interna) |
| Core (via qualquer servico) | Scheduler | HTTP | `POST /:queueName/schedule` :3000 | `x-internal-secret` header |
| Scheduler Worker | Services | HTTP | `POST WORKER_SERVICE_URL/workers/{queueName}` :3200 | `x-internal-secret` header |
| Scheduler Worker | Worker Broadcast | HTTP | `POST WORKER_BROADCAST_URL/broadcasts/dispatch` | Nenhuma (POST direto sem secret) |
| API/Services | Meta | HTTP | Meta Cloud API (WhatsApp, Instagram, Facebook) | Token Meta por canal |
| Todos os backends | PostgreSQL | TCP | Prisma Client | Connection string |
| Todos os backends | Redis | TCP | ioredis / redis client | Connection string |

## Diagrama de Fluxo

```
[Meta] ──webhook──→ [Gateway :PORT] ──NATS──→ [Gateway Worker] ──HTTP──→ [Services :3200]
                                                                              │
                    ┌─────────HTTP (x-internal-secret)────────────────────────┘
                    ▼
              [API :3001] ──Socket.IO──→ [WebSocket :10000] ──broadcast──→ [Front :5173]
                    ▲                          ▲        ▲
                    │                          │        │
              [External API :3002]─Socket.IO───┘        │
                                                        │
              [Services :3200]──────Socket.IO────────────┘
                    │
                    │──HTTP──→ [Scheduler :3000] ──BullMQ/Redis──→ [Scheduler Worker]
                                                                        │
                                                          ┌─────────────┼──────────────┐
                                                          ▼             ▼              ▼
                                                   [Services]   [Worker Broadcast]  (outras filas)
```

## Protocolos por Tipo

### HTTP (sincrono)
- Front → API/Services: chamadas REST com JWT
- Gateway Worker → Services: entrega de webhooks processados
- Services → API: chamadas inter-servico com `x-internal-secret`
- Core → Scheduler: agendamento de jobs via `BaseQueue.scheduleJob()`
- Scheduler Worker → Services/Worker Broadcast: despacho de jobs prontos

### NATS JetStream (mensageria)
- Gateway API → Gateway Worker: stream `GATEWAY`, consumer `worker`, MaxDeliver: 5, backoff progressivo (10s/30s/60s/120s)

### Socket.IO (realtime)
- API, Services, External API → WebSocket Server → Front: broadcast sem rooms, filtragem no client. Ver [[realtime-communication]].

### Redis (compartilhado)
- BullMQ: filas no Scheduler e Worker Broadcast
- Bull: 12 filas no API (lib diferente do BullMQ). Ver [[queue-architecture]].
- Cache, pub/sub, locks: usado por todos os backends via `@chatfunnel/core/redis`

## Auth Inter-servico — Resumo

| Mecanismo | Onde |
|-----------|------|
| JWT Bearer | Front → API, Front → Services |
| API key query param (`?apikey=`) | Clientes externos → External API |
| `x-internal-secret` header | Core → Scheduler, Scheduler → Services |
| `VerifyServicesSecret` middleware | Services → API |
| `VerifyWorkerSecret` middleware | Workers → API |
| Sem auth (rede Docker) | Gateway Worker → Services, * → WebSocket, Scheduler API |

Detalhes completos em [[auth-flow]].
