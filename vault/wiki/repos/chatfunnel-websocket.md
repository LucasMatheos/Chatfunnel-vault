---
title: chatfunnel-websocket
description: Referencia tecnica do WebSocket server — Socket.IO, real-time messaging, livechat, kanban events.
tags: [repos, websocket, socket-io, real-time]
related: ["[[chatfunnel-front]]", "[[chatfunnel-api]]"]
last_updated: 2026-04-05
---

# chatfunnel-websocket

WebSocket server. **Node + TypeScript**, porta 10000. Socket.IO para comunicacao real-time.

## Stack

- Node.js + TypeScript
- Socket.IO server
- Porta 10000

## Estrutura

> TODO: documentar estrutura de pastas

## Patterns & Convencoes

> TODO: documentar patterns

## Gotchas

- Socket.IO broadcast para TODOS — nao usa rooms para segmentacao (envia pra todos os clients conectados)

Veja tambem: [[integration-gotchas]]
