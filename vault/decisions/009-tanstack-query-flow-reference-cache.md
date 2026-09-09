---
title: ADR — Cache de referências do Flow com TanStack Query
tags: [decisions, adr, frontend, automations, tanstack-query]
date: 2026-08-25
status: active
related: ["[[wiki/repos/chatfunnel-front]]", "[[decisions/008-tanstack-query-pilot-contacts]]"]
---

# ADR: Cache de referências do Flow com TanStack Query

## Contexto

O canvas de automações monta diversos componentes que consultavam tags, campos personalizados e detalhes de pipeline/automação de forma independente. Isso repetia chamadas para o mesmo dado dentro da mesma conta.

## Decisão

- Centralizar as query keys e os composables em `src/views/automations/composables/useAutomationReferenceQueries.ts`.
- Incluir `accountSelected` em cada key e também o identificador do recurso nos detalhes.
- Aplicar `staleTime` de cinco minutos para referências e detalhes usados apenas para exibição no canvas.
- Usar `useKanbanDetailQuery()` tanto nos gatilhos quanto no card de ação de Kanban, para compartilhar uma única busca por `accountId` e `kanbanId`.
- Atualizar otimisticamente o cache de tags após criar uma tag no seletor.
- Manter operações de gravação e consultas dependentes de formulário fora desta primeira migração.

## Alternativas consideradas

- Preservar caches locais por componente: mantém requisições repetidas e não compartilha resultados.
- Persistir cache em storage: adiciona regras de expiração e isolamento sem necessidade para o editor aberto.

## Consequências

- Instâncias do Flow na mesma conta reutilizam tags, campos personalizados e detalhes já carregados.
- Trocar de conta cria um namespace de cache separado e evita exibir referências de outra conta.
- Mutações que alterarem referências precisam invalidar ou atualizar a query key correspondente.

## Implementação

- Em 2026-09-04, o cache de tags foi entregue em `chatfunnel-front/src/views/automations/composables/useTagsQuery.ts`.
- `TagsPicker`, `TagFilterInput` usado pela ação de tags e `useConditionFields` compartilham a key `['tags', accountId]`.
- A criação de tag atualiza imediatamente a entrada da conta no `QueryClient`.

## Validação

- HARs de 2026-08-25 confirmaram uma única chamada de Kanban por carregamento, eliminando a repetição observada anteriormente.
- Recarregamentos completos ainda executam as queries porque o cache do TanStack Query é mantido em memória; a validação de reutilização deve navegar entre rotas sem atualizar o navegador, dentro dos cinco minutos de `staleTime`.
- A chamada de tags permaneceu em aproximadamente 3 s, com mais de 2,8 s em espera pelo servidor nos dois cenários. O cache HTTP não reduz esse gargalo inicial; uma resposta simplificada para o Flow é a próxima oportunidade de otimização.
- O HAR de navegação do editor para a lista e de volta não registrou chamadas para tags, campos personalizados, canais nem Kanban, confirmando o reaproveitamento do cache do TanStack Query na navegação SPA.
