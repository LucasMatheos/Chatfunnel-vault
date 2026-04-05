---
title: Multi-tenancy — Isolamento por Account
description: Como o ChatFunnel isola dados entre contas usando accountId em toda query
tags: [architecture, multi-tenancy, security, accountId, prisma]
related: ["[[auth-flow]]", "[[message-flow]]"]
last_updated: 2026-04-05
---

# Multi-tenancy

O ChatFunnel e multi-tenant — multiplas empresas (accounts) compartilham a mesma infraestrutura. O isolamento e feito via `accountId` em toda query ao banco.

## Modelo

```
Organization (dona)
  └── Account (tenant)
        ├── Users (operadores)
        ├── Contacts (contatos/leads)
        ├── Chats (conversas)
        ├── Automations (automacoes)
        ├── Agents (agentes IA)
        ├── Kanban (pipeline CRM)
        ├── Broadcasts (envios em massa)
        └── ... (todos os dados)
```

- Uma Organization pode ter multiplas Accounts
- Cada Account e um tenant isolado
- Users pertencem a uma Account e tem permissoes

## Como o accountId flui

### 1. Frontend

- Apos login, o token JWT contem o `userId`
- O front armazena `accountSelected` no Pinia store `auth`
- Toda request HTTP envia o `accountId` como header ou parametro

### 2. API (Express)

```
Request HTTP
    ↓
[VerifyJWT] → extrai userId do token
    ↓
[VerifyAccountSelected] → extrai accountId do header/body
    ↓
[Command] → usa accountId em toda query Prisma
```

- Middleware `VerifyAccountSelected` garante que o request tem accountId
- Commands SEMPRE recebem accountId e passam para os repositories

### 3. Services (NestJS)

```
Request HTTP
    ↓
[JWT Guard] → extrai userId
    ↓
[AccountSelectedGuard] → extrai accountId
    ↓
[Controller → Service] → usa accountId em toda query
```

- Guard `AccountSelectedGuard` valida que o request tem accountId
- DTOs incluem accountId via decorator ou extraid do request

### 4. Banco (Prisma)

- A maioria das tabelas tem coluna `accountId` (FK para Account)
- TODA query de leitura filtra por `accountId`
- TODA query de escrita inclui `accountId`
- Soft delete: `isDeleted: true` (nunca hard delete)

## Regra de Ouro

**ALWAYS passe `accountId` em toda query ao banco.** Uma query sem `accountId` pode vazar dados entre tenants. Isso e a regra mais critica de seguranca do sistema.

## Excecoes

- Tabelas globais (Plans, SystemConfigs) nao tem accountId
- Rotas de auth (login, register) nao exigem accountId
- Rotas admin (com `VerifyAdmin`) podem acessar dados cross-account
- Webhooks da Meta: o accountId e resolvido no Services a partir do channelId/numero
- chatfunnel-gateway: nao tem conceito de accountId — apenas encaminha payloads
- chatfunnel-worker-broadcast: recebe `account` no payload do job de broadcast

## Gotchas

- Esquecer `accountId` numa query e o bug mais perigoso — expoe dados de outro cliente
- `@Public()` no Services desabilita auth MAS nao desabilita o accountId guard separadamente
- O chatfunnel-scheduler NAO tem auth — assume que so servicos internos acessam
- O chatfunnel-external-api usa API key por account (nao JWT) — o accountId vem da key
