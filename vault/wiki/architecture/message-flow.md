---
title: Message Flow — Fluxo de Mensagens End-to-End
description: Como uma mensagem viaja do WhatsApp/Instagram ate o dashboard do operador
tags: [architecture, message-flow, whatsapp, instagram, gateway, services, websocket]
related: ["[[queue-architecture]]", "[[realtime-communication]]", "[[multi-tenancy]]"]
last_updated: 2026-04-05
---

# Message Flow

Fluxo completo de uma mensagem recebida de um contato ate aparecer no livechat do operador.

## Diagrama

```
[Meta (WhatsApp/Instagram)]
         │ webhook POST
         ▼
[Gateway (Go)]
         │ decide: insider channel?
         ├─ SIM → proxy HTTP para HOMOLOG_URL
         └─ NAO → publish NATS JetStream (GATEWAY.REQUESTS)
                    │
                    ▼
         [Gateway Worker (Go)]
                    │ consume NATS → POST para PROCESSOR_URL
                    ▼
[Services (NestJS) :3200]
         │ /nest/webhooks/...
         │ processa: identifica contato, account, canal
         │ executa logica de negocio (automacoes, agentes IA, filas)
         │ persiste mensagem no PostgreSQL via Prisma
         │ emite evento Socket.IO via chatfunnel-websocket
         ▼
[WebSocket (Socket.IO) :10000]
         │ broadcast para TODOS os clients conectados
         ▼
[Front (Vue) :5173]
         │ recebe evento `add-message`
         │ atualiza store Pinia + UI do livechat
         ▼
[Operador ve a mensagem no dashboard]
```

## Detalhes por Etapa

### 1. Meta envia webhook

- WhatsApp Cloud API ou Instagram Messaging API envia POST
- Payload contem mensagem, contato, canal, timestamp
- Pode ser mensagem de texto, midia, template response, etc.

### 2. Gateway (Go) recebe

- Rota: `POST /whatsapp_hook` ou `POST /instagram_hook`
- `gateway.go` verifica se o `channelId` e insider (`INSIDER_CHANNEL_IDS`)
- Se insider: proxy HTTP para `HOMOLOG_URL` (ambiente de testes)
- Se nao: publica no NATS stream `GATEWAY.REQUESTS`
- Responde 200 para a Meta imediatamente (nao bloqueia)

### 3. Gateway Worker consome NATS

- Consumer `worker` le de `GATEWAY.REQUESTS`
- Faz POST para `PROCESSOR_URL` (chatfunnel-services)
- Retry com backoff: 10s, 30s, 60s, 120s (MaxDeliver: 5)
- 4xx (exceto 429): `msg.Term()` (descarta, nao retriavel)
- 5xx ou 429: backoff automatico do NATS

### 4. Services (NestJS) processa

- Modulo `webhooks/` recebe o payload
- Identifica contato e account via numero/canal
- Persiste mensagem no PostgreSQL (`@chatfunnel/core` repositories)
- Dispara logica de negocio:
  - Automacoes: verifica triggers ativos para o contato
  - Agentes IA: se tem agente ativo, processa via Anthropic/Mastra
  - Filas: agenda jobs via BullMQ se necessario
- Emite evento para o WebSocket server

### 5. WebSocket broadcast

- Services faz `emit` via Socket.IO client para o WebSocket server
- WebSocket server faz `io.sockets.emit('add-message', payload)` para TODOS os clients
- Payload inclui `moderadorsId` (com typo — nao renomear) dos moderadores do contato
- Filtragem por account/permissao e feita no client (front)

### 6. Front recebe e exibe

- Socket.IO client no Vue recebe evento `add-message`
- Atualiza store Pinia com a nova mensagem
- UI do livechat re-renderiza
- Notificacao sonora/visual se aplicavel

## Fluxo de Resposta (operador → contato)

```
[Operador digita no livechat]
         │ HTTP POST
         ▼
[API (Express) :3001]
         │ /api/chats/send-message (ou similar)
         │ valida JWT + accountId
         │ persiste mensagem no PostgreSQL
         │ chama Meta Cloud API (via @chatfunnel/core meta/)
         ▼
[Meta (WhatsApp/Instagram)]
         │ entrega para o contato
```

- A resposta vai direto pela API Express (nao pelo Gateway)
- Meta Cloud API e chamada via `@chatfunnel/core/meta` (whatsapp.api.ts, instagram.api.ts)
- O WebSocket tambem e notificado para atualizar outros operadores conectados
