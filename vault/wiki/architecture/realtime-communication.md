---
title: Realtime Communication — WebSocket e Eventos
description: Como o sistema comunica em tempo real com o frontend via Socket.IO
tags: [architecture, websocket, socket-io, realtime, livechat]
related: ["[[message-flow]]", "[[multi-tenancy]]", "[[auth-flow]]"]
last_updated: 2026-04-05
---

# Realtime Communication

O ChatFunnel usa Socket.IO para comunicacao em tempo real entre backend e frontend.

## Componentes

| Componente | Tipo | Papel |
|------------|------|-------|
| `chatfunnel-websocket` :10000 | Socket.IO **server** | Hub central de broadcast |
| `chatfunnel-api` (SignalWebsocket.js) | Socket.IO **client** | Emite eventos do API para o hub |
| `chatfunnel-services` | Socket.IO **client** | Emite eventos do Services para o hub |
| `chatfunnel-external-api` (`global.signalR`) | Socket.IO **client** | Emite eventos da external API |
| `chatfunnel-front` (socket.js) | Socket.IO **client** | Recebe eventos no browser |

## Fluxo

```
[API/Services/External] ──emit──→ [WebSocket Server :10000] ──broadcast──→ [Todos os Fronts conectados]
```

### Detalhes

1. Backend (API, Services ou External) cria um Socket.IO **client** conectado ao WebSocket server
2. Emite evento `broadcast` com `{ to: "event-name", payload: {...} }`
3. WebSocket server recebe e faz `io.sockets.emit(to, payload)` para TODOS os clients
4. Frontend recebe o evento e atualiza a UI

IMPORTANT: **Nao usa rooms.** Todo broadcast vai para todos os clients conectados. A filtragem por account/permissao e feita no frontend.

## Eventos Principais

| Evento | Origem | Descricao |
|--------|--------|-----------|
| `add-message` | API/Services | Nova mensagem recebida/enviada |
| `updated-chat` | API/Services | Chat atualizado (status, assignee) |
| `visualize-chat` | API | Chat visualizado pelo operador |
| `livechat` | API/Services | Eventos do livechat (typing, online) |
| `kanban` | API/Services | Atualizacao de cards no CRM |
| `moderators-updated` | Services | Moderadores de um contato mudaram |

## Processamento Especial no WebSocket Server

O `chatfunnel-websocket` nao e apenas um relay — faz processamento em dois eventos:

### `add-message`
- Valida `contactId` como UUID — se invalido, faz `return` (broadcast NAO acontece)
- Busca moderadores do contato no banco (Prisma)
- Injeta `moderadorsId` (com typo — campo real) no payload
- Emite para todos os clients

### `moderators-updated`
- Se `moderatorsIds` existe e tem length > 0:
  - Valida UUIDs — se invalidos, faz `return` (broadcast NAO acontece)
  - Chama `setTransferModerator` no banco
  - Se `setTransferModerator` falha (catch), o broadcast AINDA acontece
- Se `moderatorsIds` nao existe ou length = 0: broadcast acontece normalmente

## Frontend (Vue)

- Conexao via `socket.io-client`
- Eventos recebidos atualizam Pinia stores
- Master/Slave pattern entre abas:
  - Tab master sincroniza mensagens e cache via IndexedDB
  - Tabs slave leem do cache — reduz chamadas API

## Gotchas

- `global.signalR` no chatfunnel-external-api e um Socket.IO client, nao server
- Se o WebSocket server estiver fora, mensagens nao aparecem em realtime mas nao se perdem (estao no banco)
- O campo `moderadorsId` tem typo historico — NAO renomear sem alinhar todos os repos
- WebSocket server NAO tem auth — qualquer client na rede pode conectar e receber todos os broadcasts
