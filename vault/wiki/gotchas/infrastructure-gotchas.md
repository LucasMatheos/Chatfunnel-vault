---
title: Infrastructure Gotchas
description: Armadilhas relacionadas a Docker, portas, env vars, Redis, filas, CORS, body limits, module-alias, SWC, tokens e secrets.
tags: [gotchas, docker, redis, bullmq, bull, nats, env, module-alias]
severity: varies
related: ["[[database-gotchas]]", "[[integration-gotchas]]"]
last_updated: 2026-04-05
---

# Infrastructure Gotchas

## Bull vs BullMQ — APIs diferentes
**Repos:** chatfunnel-api (Bull), chatfunnel-services/worker-broadcast/scheduler (BullMQ). APIs sao incompativeis. API e mais antiga e nunca migrou.

## Queues do core comunicam via HTTP, nao BullMQ direto
**Repo:** chatfunnel-core. `BaseQueue` faz POST para o chatfunnel-scheduler. Nao enfileira direto no Redis.

## NATS no gateway com MaxDeliver: 5
**Repo:** chatfunnel-gateway (Go). Consumer NATS tem backoff progressivo (10s, 30s, 60s, 120s). Apos 5 tentativas a mensagem e descartada. `msg.Term()` para erros nao-retriaveis (4xx exceto 429).

## Body limits divergentes
**Repos:** chatfunnel-api (5mb), chatfunnel-services (200mb), chatfunnel-external-api (5mb). Uploads grandes falham na API/external-api se nao usarem S3 direto.

## module-alias deve ser o PRIMEIRO require
**Repos:** chatfunnel-api, chatfunnel-external-api. Aliases nao resolvem se `module-alias/register` nao for o primeiro require — patcha `Module._resolveFilename`.

## SWC nao bloqueia build com erros de tipo
**Repo:** chatfunnel-services. Build passa mesmo com erros TypeScript. Rodar typecheck separado.

## .npmrc com token GHCR em texto plano
**Repo:** chatfunnel-websocket (e outros que consomem @chatfunnel/core). Token exposto precisa ser substituido por `${GHCR_TOKEN}`.

## .env commitado com secrets
**Repo:** chatfunnel-api. `.env` esta no git com secrets de dev. Falta de .gitignore adequado.

## WorkerService crasha o processo API do scheduler
**Repo:** chatfunnel-scheduler. `WorkerService` faz throw no constructor se `WORKER_SERVICE_URL` ou `WORKER_SERVICE_SECRET` estiverem vazias. Como e importado em module-level via `BaseQueue`, o processo da API tambem crasha. **Workaround:** definir as envs em TODOS os ambientes.

## WORKER_BROADCAST_URL precisa de / no final
**Repo:** chatfunnel-scheduler. Sem `/` gera URL invalida (ex: `http://host:3000broadcasts/dispatch`).

## ioredis via dependencia transitiva no scheduler
**Repo:** chatfunnel-scheduler. `ioredis` vem do `bullmq`, nao esta no package.json. Update do bullmq pode quebrar.

## 3 conexoes Redis no sendMessage processor
**Repo:** chatfunnel-worker-broadcast. Uma para BullMQ (`maxRetriesPerRequest: null`), uma para rpush, uma para rate limiter. Nao misturar.

## Rate limit 80/s hardcoded no broadcast
**Repo:** chatfunnel-worker-broadcast. Valor em `channelThroughput` dentro do processor. `BROADCAST_RATE_DELAY_MS` existe em env.ts mas NAO e usada — env var fantasma.

## Prefixos de rota divergentes
**Repos:** chatfunnel-api (`/api/`), chatfunnel-services (`/nest/`), chatfunnel-external-api (`/v1/`, sem prefixo global). Front usa `Api` e `NestApi` com base paths distintos.

## Build output do front e dist2/
**Repo:** chatfunnel-front. Build gera `dist2/`, nao `dist/`. Configurado no vite.config.mjs.

## PWA cache pode causar stale content
**Repo:** chatfunnel-front. Service worker (vite-plugin-pwa) pode servir conteudo antigo em dev.
