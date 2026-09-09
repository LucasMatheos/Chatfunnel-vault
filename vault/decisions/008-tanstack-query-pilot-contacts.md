---
title: ADR — TanStack Query como piloto na lista de contatos
tags: [decisions, adr, frontend, tanstack-query, contacts]
date: 2026-08-25
status: active
related: ["[[wiki/repos/chatfunnel-front]]"]
---

# ADR: TanStack Query como piloto na lista de contatos

## Contexto

A lista de contatos controlava carregamento e atualização de dados remotos manualmente. O front já separa services HTTP da UI e precisa adotar cache de server state gradualmente.

## Decisão

- Registrar um `QueryClient` global com cache efêmero, uma tentativa de retry e refetch controlado.
- Usar `accountSelected` em todas as query keys de contatos.
- Manter `ContactsService` como única camada HTTP.
- Aplicar `keepPreviousData` para reter o cache durante paginação e refetch; a tabela exibe skeleton enquanto a busca está ativa.
- Invalidar o domínio `contacts` após mutações já existentes, sem migrá-las para `useMutation` neste piloto.

## Alternativas consideradas

- Manter refs e flags de loading manuais: não resolve cache nem requisições concorrentes.
- Migrar toda a tela e todas as mutações de uma vez: aumenta o risco em uma view legada e extensa.
- Persistir o cache em storage: não é necessário para o primeiro piloto e exige regras adicionais de expiração.

## Consequências

- A tabela exibe skeleton tanto na primeira abertura quanto nas atualizações posteriores.
- Novas queries devem seguir a mesma convenção de isolamento por conta e invalidação por domínio.
- O restante do front permanece em migração gradual.
