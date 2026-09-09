---
title: ADR — Cache compartilhado da lista de canais
tags: [decisions, adr, frontend, channels, tanstack-query]
date: 2026-08-25
status: active
related: ["[[wiki/repos/chatfunnel-front]]", "[[decisions/008-tanstack-query-pilot-contacts]]"]
last_updated: 2026-09-08
---

# ADR: Cache compartilhado da lista de canais

## Contexto

O endpoint `organizations/channels` era consultado diretamente por componentes de automações, livechat, contatos, CRM, configurações, relatórios e onboarding. Uma mesma navegação podia repetir a requisição para a mesma conta.

## Decisão

- Centralizar o acesso cacheado em `src/common/composables/queries/useChannelsQuery.ts`.
- Usar a key `organizations/channels/{accountId}`, resolvendo `accountSelected` quando a conta não for informada explicitamente.
- Manter os dados frescos por cinco minutos e compartilhar requisições concorrentes pelo `QueryClient`.
- Oferecer API reativa para código novo e `fetchChannels()` para migração incremental dos componentes legados.
- Invalidar a key após vincular, desvincular, sincronizar ou atualizar permissões de canais.

## Alternativas consideradas

- Cachear no Pinia: mistura server state com estado global de cliente e exige sincronização manual.
- Cachear dentro do service HTTP: oculta expiração e invalidação da camada que gerencia server state.

## Consequências

- Consumidores da mesma conta reutilizam a lista em cache e chamadas simultâneas são deduplicadas.
- Consultas administrativas com `accountId` explícito ficam isoladas da conta selecionada.
- Novas mutações de canais devem chamar `invalidateChannelsQuery()` antes de recarregar consumidores.

## Atualização 2026-09-08

- A API compartilhada inclui `useChannelsCache()`, `captureChannelsCache()`, `fetchChannels()`, `refreshChannels()` e `invalidateChannelsQuery()`, além de `useChannelsQuery()` para leituras reativas.
- A identidade usada no request é a mesma da key em cache; handlers de mutação capturam essa identidade antes do request para invalidar a conta que realmente sofreu a alteração.
- `refreshChannels()` cancela uma leitura anterior da mesma key antes de buscar novamente, impedindo que uma resposta pré-mutação satisfaça o refresh forçado.
- Os 16 consumidores ativos foram migrados para a fonte compartilhada; filtros de apresentação permanecem locais a cada consumidor.
- Username, foto e WPP settings também invalidam a key, junto de vínculo, desvínculo, sincronização, permissões e quantidade.
- Em desconexão em lote, cada unlink bem-sucedido invalida a key mesmo que outro unlink falhe.
- A autorização do `accountId` explícito no backend e os tokens retornados no payload permanecem riscos fora do escopo.
