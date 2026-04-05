---
title: ADR-005 — Multi-tenancy via accountId em toda query
tags: [decisions, adr, security, multi-tenancy, database]
date: 2026-04-05
status: active
related: ["[[multi-tenancy]]", "[[database-architecture]]"]
---

# ADR-005: Multi-tenancy via accountId em toda query

## Contexto

O ChatFunnel e SaaS multi-tenant. Multiplas empresas compartilham a mesma infraestrutura e banco de dados. Dados de um cliente nunca podem ser acessiveis por outro.

## Decisao

Usar **row-level isolation via `accountId`** em toda tabela e toda query ao banco. Nao usar schemas separados nem bancos separados por tenant.

## Alternativas consideradas

- **Banco separado por tenant** — descartado pelo custo operacional (centenas de bancos) e complexidade de migrations
- **Schema separado por tenant** — descartado pela complexidade de Prisma com schemas dinamicos
- **Row-level security (RLS) do PostgreSQL** — considerado mas nao adotado; o filtro e feito na aplicacao via repositories

## Consequencias

- **Positivas:** Simplicidade operacional (um banco, um schema, um deploy), migrations unificadas, queries simples com WHERE accountId
- **Negativas:** Uma query sem accountId pode vazar dados — e o bug mais perigoso do sistema; performance pode degradar com volume (indices em accountId sao criticos)
- **Regra:** ALWAYS passe accountId em toda query. ALWAYS use soft delete (isDeleted: true). Guards/middlewares validam accountId em toda request.
