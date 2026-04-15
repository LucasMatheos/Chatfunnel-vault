---
title: Architecture Index
description: Indice de documentos sobre arquitetura do sistema — fluxos, integracao entre servicos, decisoes de design.
last_updated: 2026-04-12
---

# Architecture

Documentos sobre como o sistema funciona como um todo — fluxos de dados, comunicacao entre servicos, padroes adotados.

| Topico | Artigo | Descricao |
|--------|--------|-----------|
| Message Flow | [[message-flow]] | Fluxo end-to-end: Meta webhook → Gateway → Services → WebSocket → Front |
| Queue Architecture | [[queue-architecture]] | NATS (Gateway), Bull (API), BullMQ (Services/Workers/Scheduler) |
| Realtime Communication | [[realtime-communication]] | Socket.IO: server, clients, eventos, broadcast sem rooms |
| Multi-tenancy | [[multi-tenancy]] | Isolamento por accountId em toda query — regra mais critica |
| Auth Flow | [[auth-flow]] | JWT, API keys, inter-service auth, permissoes |
| Inter-Service Communication | [[inter-service-communication]] | Mapa completo: quem chama quem, protocolo, auth, portas |
| AI Agents | [[ai-agents-architecture]] | Modulos a2a (Intelligence) e agents-v2 (conversacional), Mastra, tool calling |
| Database Architecture | [[database-architecture]] | Schema Prisma compartilhado, entidades principais, repositories, migrations |
| Deployment | [[deployment-architecture]] | Docker, Traefik, Jenkins CI/CD, healthchecks, graceful shutdown |
| Error Handling | [[error-handling]] | DomainErrors, exception filters, createRoute, HandlerError (Go) |
