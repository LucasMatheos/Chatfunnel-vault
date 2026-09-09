---
title: Database Gotchas
description: Armadilhas relacionadas a Prisma, PostgreSQL, multi-tenancy, migrations, soft delete e repositories.
tags: [gotchas, prisma, postgresql, multi-tenancy, repositories]
severity: varies
related: ["[[infrastructure-gotchas]]", "[[integration-gotchas]]"]
last_updated: 2026-08-06
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

## Atualizacao completa de Agents V2 excede o timeout padrao

- **Repo:** chatfunnel-core
- **O que acontece:** `AgentsV2Repository.updateWithRelations()` pode executar varios `deleteMany` antes do `update` aninhado e ultrapassar os 5 segundos padrao de uma interactive transaction do Prisma.
- **Sintoma:** `Transaction already closed: A query cannot be executed on an expired transaction`.
- **Workaround:** A transacao desse metodo usa timeout explicito de 30 segundos.

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

## onDelete: SetNull deixa linhas orfas que queries novas precisam filtrar

- **Repo:** chatfunnel-core
- **O que acontece:** A maioria das relacoes opcionais do schema usa `onDelete: SetNull` (dezenas de casos — ex: `GoogleCalendarEvents.googleCalendarId/contactId/assistantId/agentId/conversationId`, `contactId`/`channelId` em varias outras tabelas). Ao apagar o registro pai, a FK do filho vira `NULL` em vez de apagar ou cascatear o filho.
- **Causa:** Decisao deliberada e consistente no schema todo — preserva historico (ex: contato mantem registro de compromissos mesmo se a agenda for removida depois). Nao e bug isolado.
- **Armadilha:** Telas/queries que ja existem costumam filtrar orfaos implicitamente (ex: `WHERE fk IN (lista de pais vivos)` obtida de outra query). Uma query NOVA escrita direto contra a tabela filha (`WHERE accountId = ...`, sem passar pela lista de pais vivos) conta essas linhas orfas como se fossem validas.
- **Exemplo real:** `schedules.volume`/`schedules.attendance` (Reports V2) contavam `GoogleCalendarEvents` com `googleCalendarId = NULL` (agenda apagada, ver [[calendar-sync-google]] Mecanismo 5) como agendamentos reais.
- **Workaround:** Antes de escrever uma query nova sobre uma tabela com relacao opcional `SetNull`, checar se existe um consumidor ja funcionando (tela, outro relatorio) e replicar o filtro que ele ja aplica — geralmente `IS NOT NULL` na FK ou `IN (lista de pais vivos)`.
