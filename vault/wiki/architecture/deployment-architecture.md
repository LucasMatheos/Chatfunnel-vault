---
title: Deployment Architecture
description: Docker, Docker Compose, CI/CD, healthchecks e graceful shutdown dos servicos
tags: [architecture, deployment, docker, jenkins, ci-cd]
related: ["[[message-flow]]", "[[auth-flow]]"]
last_updated: 2026-04-05
---

# Deployment Architecture

## Containerizacao

Todos os servicos rodam via Docker Compose em uma rede externa compartilhada chamada `chatfunnel`. Imagens sao publicadas no **GitHub Container Registry** (`ghcr.io/viniciusteider/`).

Apenas dois repos tem Dockerfile proprio na raiz:

| Repo | Base image | Notas |
|------|-----------|-------|
| chatfunnel-gateway | `golang:1.25.1-alpine` (multi-stage) | Gera dois binarios: `api` e `worker` (targets separados) |
| chatfunnel-external-api | `node:24-bookworm-slim` (multi-stage) | Usa `--mount=type=secret` para token GHCR no npm install |

Os demais repos (api, services, front, websocket, worker-broadcast, scheduler) referenciam `dockerfile` nos docker-compose mas o build esta comentado — em producao usam imagens pre-built do GHCR.

## Docker Compose — Rede e Servicos

Todos os `docker-compose.yml` declaram `name: chatfunnel-docker` e usam a rede externa `chatfunnel`. Env files ficam em `../envs/` (fora dos repos): `secrets.env` + um `.env` especifico por servico.

| Repo | Containers | Porta interna |
|------|-----------|---------------|
| chatfunnel-api | `front-api`, `flow-worker` | 3000 |
| chatfunnel-services | `nest` | 3200 |
| chatfunnel-front | `frontend` | 80 |
| chatfunnel-gateway | `gateway-api`, `gateway-worker` | 3000 |
| chatfunnel-websocket | `websocket` | 10000 |
| chatfunnel-worker-broadcast | `broadcast-api`, `broadcast-batch-worker`, `broadcast-send-worker` | — |
| chatfunnel-scheduler | `scheduler-api`, `scheduler-worker` | — |
| chatfunnel-external-api | `external-api` | 3000 |

Workers do broadcast e scheduler usam `command:` para rodar entrypoints diferentes a partir da mesma imagem. Workers com jobs longos tem `stop_grace_period: 60s`.

## Reverse Proxy — Traefik

Servicos com endpoints HTTP usam labels Traefik para roteamento. Pattern: `Host(SUBDOMINIO.chatfunnel.com.br)` + `PathPrefix` opcional.

| Servico | Regra | Prioridade | Porta |
|---------|-------|-----------|-------|
| front-api | `Host + PathPrefix(/api)` | 30 | 3000 |
| nest (services) | `Host + PathPrefix(/nest)` | 20 | 3200 |
| frontend | `Host` (catch-all) | 1 | 80 |
| gateway-api | `Host` | — | 3000 |
| websocket | `Host + PathPrefix(/ws)` | — | 10000 |
| external-api | `Host` | 30 | 3000 |

O `SUBDOMINIO` e substituido por ambiente (dev/insider/app). Websocket tem sticky session via cookie `ws_sticky`.

Todos os servicos expoe routers HTTP e HTTPS (entrypoints `web` e `websecure`).

## Logging

Todos os containers usam driver **GELF** apontando para `udp://172.18.0.1:12201`, com tag unica por servico (ex: `chatfunnel-front-api`, `chatfunnel-nest`).

## CI/CD — Jenkins

Todos os repos tem `Jenkinsfile` com o mesmo pattern: shared library `pipelineLogic` + switch por branch.

### Ambientes

| Branch | Host | Subdominio | Environment |
|--------|------|-----------|-------------|
| `dev` | `18.188.147.83` | `dev` | dev |
| `release` | `3.128.172.142` | `insider` | stage |
| `main` | `3.142.123.130` | `app` | main |

A maioria dos repos usa `pipelineLogic()` da shared library. O `chatfunnel-front` passa `buildEnv` adicional (dev/release/production) para o build do Vite.

### Excecao: Websocket (main)

O websocket na branch `main` tem pipeline customizado que faz deploy para **GKE** (Google Kubernetes Engine) em vez de VM:

1. Checkout com submodulos
2. Build Docker com tag `{shortCommit}-{buildNum}`
3. Push para **Google Artifact Registry** (`us-central1-docker.pkg.dev`)
4. Rolling update via `kubectl set image` no cluster `chatfunnel-cluster`

## Kubernetes (Gateway + Websocket em producao)

O gateway tem manifests k8s completos:

- **Deployment** com readiness/liveness probes (tcpSocket na porta 3000)
- **HPA** (HorizontalPodAutoscaler): 1-10 replicas, target CPU 75%
- **ConfigMap** com envs (PORT, NATS_URL, PROCESSOR_URL)
- **Service** tipo LoadBalancer

Gateway worker tambem tem HPA (1-10 replicas, CPU 75%) mas sem probes.

## Healthchecks

| Servico | Endpoint | Detalhes |
|---------|----------|----------|
| chatfunnel-api | `GET /api/health` | Via createRoute |
| chatfunnel-services | `GET /health` | Excluido do prefixo `/nest` |
| chatfunnel-gateway | `GET /health` | JSON |
| chatfunnel-websocket | `GET /health` | Retorna 200 "ok" |
| chatfunnel-scheduler | `GET /health` | Via Express |
| chatfunnel-external-api | `GET /health` | Via app.js |
| chatfunnel-front | Comentado no compose | `wget -qO- http://localhost:80` (desativado) |

## Graceful Shutdown

Todos os servicos Node escutam `SIGTERM` e `SIGINT`:

- **chatfunnel-api**: `ServerBase` fecha server, Redis, Prisma, Bull queues
- **chatfunnel-services**: NestJS lifecycle hooks (`onModuleDestroy`)
- **chatfunnel-gateway**: Go `signal.NotifyContext` com timeout 5s + NATS close; worker drena semaforo
- **chatfunnel-external-api**: Fecha server + Prisma disconnect
- **chatfunnel-worker-broadcast/scheduler**: `stop_grace_period: 60s` no compose para workers com jobs longos
