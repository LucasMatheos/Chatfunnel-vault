---
title: Database Gotchas
description: Armadilhas relacionadas a Prisma, PostgreSQL, multi-tenancy, migrations, soft delete e repositories.
tags: [gotchas, prisma, postgresql, multi-tenancy, repositories]
severity: varies
related: ["[[infrastructure-gotchas]]", "[[integration-gotchas]]"]
last_updated: 2026-04-05
---

# Database Gotchas

## postinstall roda prisma generate

- **Repo:** chatfunnel-core
- **O que acontece:** Qualquer `npm install` no core dispara `prisma generate` automaticamente via hook postinstall.
- **Causa:** Script postinstall no package.json.
- **Workaround:** Se falhar, verificar se `prisma/schema.prisma` esta valido.

## Repositories que recebem queues no constructor

- **Repo:** chatfunnel-core
- **O que acontece:** `ContactsRepository`, `KanbanCardsRepository` e `TagsContactsRepository` disparam side-effects via `SystemActionsQueue` ao executar operacoes.
- **Causa:** Queues sao injetadas no constructor para disparar jobs automaticamente.

## agents.repository esta morto

- **Repo:** chatfunnel-core
- **O que acontece:** O arquivo ainda existe no disco mas foi substituido por `agents_v2.repository`. Export e import estao comentados.
- **Causa:** Migracao para agents v2.
- **Workaround:** Usar `agents_v2.repository`. Nao importar o antigo.

## Typo no nome do arquivo de repository

- **Repo:** chatfunnel-core
- **O que acontece:** `contacts_follow_up_scheduled.respository.ts` — "respository" em vez de "repository".
- **Causa:** Typo original nunca corrigido.
- **Workaround:** NAO renomear sem atualizar todos os imports em todos os consumers.

## ~9 repositories nao instanciados no container

- **Repo:** chatfunnel-core
- **O que acontece:** Repos como `agents_v2`, `a2a_conversations`, `moderators` sao exportados mas NAO instanciados em `createCoreServices()`.
- **Causa:** Foram adicionados depois e nunca registrados na factory.

## Raw SQL no batch processor

- **Repo:** chatfunnel-worker-broadcast
- **O que acontece:** `databaseBatch.processor.ts` usa `Prisma.sql` (raw SQL) para batch updates.
- **Causa:** Performance — batch updates via raw SQL sao mais rapidos.
- **Workaround:** Mudancas no schema Prisma NAO atualizam essas queries automaticamente — requer ajuste manual.

## strictNullChecks varia entre repos

- **Repo:** chatfunnel-services, chatfunnel-websocket
- **O que acontece:** `strictNullChecks: false` no services e websocket. Core tem `strictNullChecks: true`.
- **Causa:** Configuracoes divergentes de tsconfig.
- **Workaround:** Nao assumir null safety uniforme. Checar tsconfig do repo antes de codar.

## MongoDB ainda registrado mas e LEGACY

- **Repos:** chatfunnel-api, chatfunnel-services
- **O que acontece:** Mongoose ainda importado no app.module (services) e como dep (api).
- **Causa:** Migracao em andamento para Prisma/PostgreSQL.
- **Workaround:** NEVER usar MongoDB em codigo novo.

## accountId obrigatorio em toda query

- **Repos:** todos os backends
- **O que acontece:** Queries sem `accountId` retornam dados de outras contas (multi-tenancy quebrado).
- **Causa:** Isolamento por tenant via filtro manual.
- **Workaround:** ALWAYS passar `accountId` em toda query Prisma.
