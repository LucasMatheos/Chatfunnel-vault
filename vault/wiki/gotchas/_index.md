---
title: Gotchas Index
description: Indice de armadilhas, bugs conhecidos, comportamentos inesperados e workarounds do sistema.
last_updated: 2026-04-13
---

# Gotchas

Coisas que nao sao obvias, que custaram tempo pra descobrir, e que alguem vai pisar de novo se nao estiver documentado.

| Tema | Artigo | Destaques |
|------|--------|-----------|
| Prisma, PostgreSQL, multi-tenancy, repositories | [[database-gotchas]] | postinstall prisma generate, repos mortos, typo no filename, raw SQL no batch |
| Docker, portas, env vars, Redis, filas, SWC, tokens | [[infrastructure-gotchas]] | Bull vs BullMQ, WorkerService crasha API, .npmrc com token, 3 conexoes Redis |
| Socket.IO, Meta, Mastra, auth, WhatsApp API | [[integration-gotchas]] | broadcast sem rooms, moderadorsId typo, Mastra monkey-patch, Meta API hardcoded |
| Vue v2 components, SWC watch, core sync, chatfunnel-database | [[frontend-gotchas]] | InputText v2 nao repassa maxlength, SWC nao recarrega decorators, sync manual do core, chatfunnel-database nao existe |
