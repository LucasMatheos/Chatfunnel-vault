---
title: Repos Index
description: Indice de todos os repositorios do ChatFunnel com referencia tecnica especifica de cada um.
last_updated: 2026-04-06
---

# Repos

Referencia tecnica por repositorio. Cada artigo cobre stack, estrutura, patterns, convencoes e gotchas especificos do repo.

| Repo | Artigo | Stack | Porta | Descricao |
|------|--------|-------|-------|-----------|
| chatfunnel-front | [[chatfunnel-front]] | Vue 3 + Vite + TS | 5173 | Dashboard, editor de funis, livechat, CRM |
| chatfunnel-api | [[chatfunnel-api]] | Express + JS | 3001 | API principal (REST) |
| chatfunnel-services | [[chatfunnel-services]] | NestJS + TS | 3200 | Processamento, integracoes, agentes IA, filas |
| chatfunnel-external-api | [[chatfunnel-external-api]] | Express + JS | 3002 | API publica para integracoes externas |
| chatfunnel-gateway | [[chatfunnel-gateway]] | Go | — | API Gateway (proxy/routing) |
| chatfunnel-websocket | [[chatfunnel-websocket]] | Node + TS | 10000 | WebSocket server (Socket.IO) |
| chatfunnel-worker-broadcast | [[chatfunnel-worker-broadcast]] | Node + TS | — | Worker de broadcast (filas BullMQ) |
| chatfunnel-scheduler | [[chatfunnel-scheduler]] | Node + TS | 3000 | Tarefas agendadas (API + worker) |
| chatfunnel-core | [[chatfunnel-core]] | TS | — | Lib compartilhada (Prisma, repositories, queues, Redis, Meta APIs) |
| chatfunnel-mcp | [[chatfunnel-mcp]] | NestJS + TS | 8000 | Servidor MCP (Model Context Protocol) para LLMs |

## Veja tambem

- [[wiki/architecture/_index|Architecture]] — fluxos e decisoes que envolvem multiplos repos
- [[wiki/features/_index|Features]] — documentacao end-to-end de cada feature (cross-repo)
- [[wiki/gotchas/_index|Gotchas]] — armadilhas cross-repo (infra, integracao, database)
