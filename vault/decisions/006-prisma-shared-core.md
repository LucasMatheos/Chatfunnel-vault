---
title: ADR-006 — Schema Prisma compartilhado via @chatfunnel/core
tags: [decisions, adr, database, prisma, core]
date: 2026-04-05
status: active
related: ["[[database-architecture]]", "[[inter-service-communication]]"]
---

# ADR-006: Schema Prisma compartilhado via @chatfunnel/core

## Contexto

Multiplos servicos (API, Services, WebSocket, Workers) precisam acessar o mesmo banco PostgreSQL com o mesmo schema. Manter schemas separados ou duplicados seria insustentavel.

## Decisao

O schema Prisma fica no **@chatfunnel/core** (pacote npm privado no GitHub Packages). Todos os consumers importam o PrismaClient e os repositories via `@chatfunnel/core/database` e `@chatfunnel/core/repositories`.

## Alternativas consideradas

- **Git submodule** (chatfunnel-database) — foi a abordagem original, migrado para o core por simplicidade
- **Schema duplicado em cada repo** — descartado por impossibilidade de manter sincronizado
- **ORM diferente por servico** — descartado pela inconsistencia e overhead

## Consequencias

- **Positivas:** Uma fonte de verdade para schema + repositories + queues, versionamento via npm, `postinstall` auto-gera o Prisma client
- **Negativas:** Mudanca no schema exige publicar nova versao do core e atualizar todos os consumers; migrations so podem ser geradas com `--create-only` e aplicadas via CI
- **Regra:** NEVER altere o schema sem migration `--create-only`. NEVER rode `prisma db push` ou `prisma migrate deploy` manualmente.
