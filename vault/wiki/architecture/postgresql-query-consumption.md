---
title: Consumo de Queries PostgreSQL
description: Diagnóstico histórico de pg_stat_statements e prioridades de otimização.
tags: [architecture, postgresql, performance, observability]
related: ["[[database-architecture]]", "[[multi-tenancy]]"]
last_updated: 2026-08-31
---

# Consumo de Queries PostgreSQL

## Snapshot analisado

- A consulta de Tags com contadores representa **24,98%** do tempo total: 11.458 chamadas, 36.668.494 ms acumulados e 3.200 ms de média.
- A métrica de idade de cards do Kanban possui a maior latência individual: 71 chamadas, 166.264 ms de média e pico de 2.668.457 ms.
- Métricas de mensagens e consultas de Livechat (`ContactsChannels`) são os próximos maiores consumidores.
- Os dados de `pg_stat_statements` são históricos desde o último reset ou reinício da extensão.

## Hipóteses e direção

- A agregação de `TagsContacts` parece ocorrer antes de restringir `Tags.accountId`, processando relações de outras contas sem necessidade.
- O cálculo de idade no Kanban executa um `MAX(createdAt)` correlacionado por card no histórico e tende a degradar com seu crescimento.
- Toda otimização deve preservar `accountId` e soft delete.

## Próximos passos seguros

1. Coletar `EXPLAIN (VERBOSE, SETTINGS)` das duas consultas prioritárias com parâmetros representativos.
2. Corrigir o escopo da agregação de Tags antes do `GROUP BY` e validar índices por `tagId`.
3. Avaliar reescrita e índice composto para `KanbanCardsHistory` por card, coluna, ação e data.
4. Medir novamente `total_ms`, `mean_ms` e `calls` após uma janela comparável.

## Documento detalhado

- [Análise de Consumo PostgreSQL — Queries Prioritárias](https://app.notion.com/p/3cdb25238ec28194a2d1c91548bed9a1?pvs=204)
