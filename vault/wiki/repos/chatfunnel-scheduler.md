---
title: chatfunnel-scheduler
description: Referencia tecnica do scheduler — API HTTP + worker BullMQ para tarefas agendadas.
tags: [repos, scheduler, bullmq, cron]
related: ["[[chatfunnel-core]]", "[[chatfunnel-worker-broadcast]]", "[[chatfunnel-api]]"]
last_updated: 2026-04-05
---

# chatfunnel-scheduler

Tarefas agendadas — API HTTP que recebe jobs + worker BullMQ que processa. **Node + TypeScript**, porta 3000.

## Stack

- Node.js + TypeScript
- BullMQ (producer + consumer)
- Porta 3000

## Estrutura

> TODO: documentar estrutura de pastas

## Patterns & Convencoes

> TODO: documentar patterns

## Gotchas

- `WorkerService` crasha o processo API se worker falhar — separar processos
- `WORKER_BROADCAST_URL` precisa de `/` no final (sem `/` gera URL invalida)
- `ioredis` vem como dependencia transitiva — nao esta no `package.json`
- 3 conexoes Redis no `sendMessage` processor (pode esgotar pool)

Veja tambem: [[infrastructure-gotchas]]
