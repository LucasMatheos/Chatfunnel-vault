---
title: chatfunnel-worker-broadcast
description: Referencia tecnica do worker de broadcast — BullMQ, envio em massa WhatsApp, rate limiting.
tags: [repos, worker, broadcast, bullmq, whatsapp]
related: ["[[chatfunnel-scheduler]]", "[[chatfunnel-core]]", "[[chatfunnel-services]]"]
last_updated: 2026-04-05
---

# chatfunnel-worker-broadcast

Worker de broadcast (envio em massa WhatsApp). **Node + TypeScript**, sem porta exposta.

## Stack

- Node.js + TypeScript
- BullMQ (consumer)

## Estrutura

> TODO: documentar estrutura de pastas

## Patterns & Convencoes

> TODO: documentar patterns

## Gotchas

- Rate limit 80/s hardcoded em `channelThroughput` dentro do processor
- `BROADCAST_RATE_DELAY_MS` existe em `env.ts` mas **NAO e usada** — env var fantasma
- `conversations` chega serializado (string) — precisa de `JSON.parse`
- Rate limit nao consome attempt no retry — pode reprocessar infinitamente

Veja tambem: [[infrastructure-gotchas]], [[integration-gotchas]]
