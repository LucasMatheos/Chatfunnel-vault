---
title: chatfunnel-gateway
description: Referencia tecnica do API Gateway em Go — proxy, routing, NATS messaging.
tags: [repos, gateway, go, nats]
related: ["[[chatfunnel-external-api]]", "[[chatfunnel-api]]", "[[chatfunnel-services]]"]
last_updated: 2026-04-05
---

# chatfunnel-gateway

API Gateway. **Go**, sem porta fixa exposta.

## Stack

- Go
- NATS para messaging

## Estrutura

> TODO: documentar estrutura de pastas (`cmd/`, etc.)

## Patterns & Convencoes

> TODO: documentar patterns

## Gotchas

- NATS com `MaxDeliver: 5` — mensagem e descartada apos 5 tentativas
- NatsClient e singleton — nao criar instancias extras

Veja tambem: [[infrastructure-gotchas]]
