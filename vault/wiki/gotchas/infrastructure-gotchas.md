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

## promtail-values.yaml existe mas nao e usado
**Repo:** chatfunnel-gateway. Ha um `promtail-values.yaml` na raiz do repo, mas o `readme` de infra (comandos `helm upgrade --install`) so instala `fluent-bit` (via `fluent-bit-values.yaml`) no namespace `observability`. O Promtail nunca e de fato instalado — e sobra de uma tentativa anterior. Pipeline de logs para o Grafana no cluster GKE `chatfunnel-cluster`: **Fluent Bit (DaemonSet, tail em `/var/log/containers/*.log`) → Loki (`loki-gateway.observability.svc.cluster.local`, storage S3 via MinIO, retencao 30 dias) → Grafana** (datasource `http://loki.observability.svc.cluster.local:3100`, query `{namespace=~".+"}`). Cobre gateway completo + websocket na `main`.

## Driver de logging do Docker Compose e misto (json-file vs gelf) — e json-file tambem cai no Grafana
**Repos:** todos os que rodam em VM via Docker Compose. Nem todos usam GELF — `chatfunnel-api`, `chatfunnel-services`, `chatfunnel-scheduler`, `chatfunnel-external-api` e `chatfunnel-front` usam driver `json-file`; so `chatfunnel-worker-broadcast` e `chatfunnel-gateway` (em VM) usam `gelf` (`udp://172.18.0.1:12201`, Graylog). Os logs dos servicos `json-file` aparecem no Grafana (confirmado com `nest` e com o `processor`/agentes-v2 do chatfunnel-api) — o mecanismo provavel e um Promtail/Fluent Bit direto na VM lendo `/var/lib/docker/containers/*/*.json.log`, mas essa peca nao esta em nenhum repo do workspace (inferencia, nao confirmado por arquivo). Ver [[deployment-architecture]].
