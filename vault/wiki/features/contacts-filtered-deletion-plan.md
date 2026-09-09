---
title: Exclusão de Contatos Filtrados — Plano de Implementação
description: Excluir os contatos correspondentes aos filtros ativos da listagem, com paridade total de filtro, reaproveitando o padrão do endpoint legado de exclusão.
tags: [features, contacts, implementation-plan]
related: ["[[contacts]]"]
last_updated: 2026-07-21
---

# Exclusão de Contatos Filtrados — Plano de Implementação

## Objetivo

Excluir **todos** os contatos que correspondem aos filtros ativos da listagem
(não só a página atual), com confirmação textual. O bloqueador atual é
**paridade de filtro**: a exclusão precisa enxergar exatamente o mesmo recorte
que a listagem mostra.

## Estado atual (o que já existe)

- **Modal**: `DeleteAllContactsModal.vue` — botão em "Opções" → modal →
  digitar `excluir contatos` → barra de progresso via SSE. Já pronto.
- **Endpoint legado**: `GET /contacts/delete-all` (Express, `DeleteAllContacts.js`).
  SSE, soft-delete em lote (cursor, batch 100), desbloqueio de limite de conta,
  limpeza de fotos no S3. Padrão bom.
- **Preview**: o próprio modal já chama `listContacts(..., 1, 1)` e usa
  `response.data.quantity` para mostrar "N contato(s) serão excluídos". **Não
  precisa de endpoint de preview.**

## O problema real

O endpoint legado só entende `searchTerm`, `onlyWithPhone`, `tagIds` (só modo
`AND` via `= ALL`) e `filter` (pasta). **Ignora** `segmentId`, `pipelineId`,
datas de pipeline, `isActiveFilter`, `filterPhoneNull/EmailNull`,
`customFieldFilters` e `tagMode` `OR`/`NOT`.

Além disso o front só repassa `Filter/segmentId/searchTerm/tagIds` em
`handleOpenModalDeleteAllContacts`, enquanto `listContacts` monta o filtro
completo.

Resultado: o que é excluído **não bate** com o que o usuário filtrou.

## Decisão de arquitetura

Implementar o novo endpoint em **chatfunnel-services** (NestJS), não estender o
Express. Motivo: a listagem e todo o motor de filtro já vivem em
`@chatfunnel/core` (`ContactsRepository.getContacts`). Reimplementar o filtro em
JS no Express duplicaria SQL complexo (segment builder, custom fields, modos de
tag) com risco de divergência. Ficar no services garante paridade e respeita a
regra "features novas vão no services".

**Paridade sem duplicar SQL**: `GetContactsHandler` já resolve `segmentId` e
encaminha o filtro completo ao `ContactsRepository.getContacts`, que retorna
`id` **e** `photo` por contato. O worker de exclusão chama esse handler com
`includeTopRanking: false`, sempre na página 1, e vai apagando. Assim preserva
os filtros de segmento sem executar ranking/cache ou duplicar SQL.

## Backend (chatfunnel-services + core)

Padrão idêntico ao legado (SSE + lote + progresso + fotos + limite), porém
reusando o filtro do core.

### 1. Core — `ContactsService.deleteFilteredContacts`

Novo método orquestrador (em `chatfunnel-core/src/services/contacts/`),
opcionalmente via handler `delete-filtered-contacts.handler.ts`:

```
deleteFilteredContacts(accountId, body, { onProgress }) => { deleted, photos }
```

Lógica (mesmo espírito do cursor do legado, mas sem cursor):

1. `GetContactsHandler.execute(accountId, body, { page: 1, pageSize: 500 },
   { includeTopRanking: false })` → retorna `contacts` (com `id`, `photo`) e
   `quantity` (total), inclusive quando o filtro contém `segmentId`.
2. Se `quantity === 0`, encerra.
3. Soft-delete do lote: `contactsRepository.softDeleteMany(accountId, ids)`
   (`updateMany` com `{ isDeleted: true, deletedAt }`, exigindo
   `isDeleted: false` no where → repetível).
4. Acumula as `photo` keys do lote.
5. `onProgress(processed, total)`.
6. Repete a partir do passo 1 (contatos apagados saem do filtro `isDeleted =
   false`, então page 1 sempre traz o próximo lote pendente) até esvaziar.
7. Ao terminar: `accountsRepository.verifyContactsLimitById(accountId)` para
   recalcular/desbloquear o limite (mesmo método já usado em
   `inactivate/activateContacts`).

Adicionar em `ContactsRepository` apenas o que faltar:
`softDeleteMany(accountId, ids)` (updateMany simples).

> `includeTopRanking: false` para não pagar o cache/ranking a cada lote.

### 2. Services — endpoint SSE

`ContactsController` (services), reaproveitando o **mesmo DTO** da listagem
(`GetContactsBodyDto`) → paridade de validação de filtro de graça:

```
GET /nest/contacts/delete-filtered   (SSE, @Sse())
```

- Confirmação: exigir `confirmation === "excluir contatos"` (query/param); se
  não bater, emite `error` e encerra.
- `accountId` e `userId` vêm do header de auth (guards atuais).
- Emite eventos SSE `{ progress, status, processed, total }` a cada lote;
  `status: "complete"` no fim; `status: "error"` em falha.
- Após soft-delete, limpar fotos no S3 em chunks (igual ao legado; adapter S3 já
  disponível no services), reportando progresso.

> **Auth em SSE**: `EventSource` não envia headers. Manter o padrão do legado —
> `Authorization` e `Account-Selected` na query string — e um guard que aceita
> o token pela query nessa rota. Não é ideal, mas é o padrão já existente e o
> escopo é "mesmo padrão de lá".

## Front (chatfunnel-front)

Mínimo. O modal já existe.

1. `handleOpenModalDeleteAllContacts` (`ContactsList.vue`): montar o **filtro
   completo**, idêntico ao que `listContacts` monta (incluir `tagMode`,
   `pipelineId`, datas, `isActiveFilter`, `filterPhoneNull/EmailNull`,
   `customFieldFilters`, `segmentId`). Passar esse objeto para
   `modalDeleteAllContacts.showDialog(search)`.
2. `DeleteAllContactsModal.vue`:
   - `listContacts()` interno já repassa o filtro para o preview de `quantity` —
     ampliar para repassar o filtro completo (hoje só copia
     `Filter/searchTerm/tagIds`).
   - `handleDeleteAllContacts()`: apontar o `EventSource` para o novo endpoint
     do NestApi (`/nest/contacts/delete-filtered`) e serializar o filtro
     completo na query. Manter a barra de progresso (mesmo formato de evento).
3. Adicionar `ContactsService.deleteFilteredContacts` no service (URL do novo
   endpoint) mantendo o padrão de serviços.

## Atualização de escopo (2026-07-21)

- `DeleteAllContactsModal.vue` e a ação **Excluir todos os contatos** mantêm o
  fluxo legado `delete-all` sem mudanças.
- A exclusão filtrada é uma ação separada no menu, **Excluir contatos
  filtrados**, com o componente `DeleteFilteredContactsModal.vue`.
- Apenas o modal novo envia o filtro completo ao endpoint
  `contacts/delete-filtered` e consome o progresso por `NestApi.streamPost`.
- O endpoint é `POST /nest/contacts/delete-filtered`, recebe a confirmação no
  body e emite frames SSE `{ chunk }`, `{ done }` ou `{ error }`.
- O core faz o soft-delete em lotes via `softDeleteMany(accountId, ids)` e o
  services remove as fotos no S3 em chunks, sem abortar a exclusão por falhas
  individuais de arquivo; ao final, recalcula o limite da conta.

## Fora de escopo (versão 1)

- Fila BullMQ / worker dedicado.
- Entidade de job (`ContactDeletionJobs`) e migration.
- Endpoint de preview separado (a listagem já dá `quantity`).
- Idempotency key, feature flag, snapshot imutável de IDs.
- Cancelamento após início.

Todos vêm do plano anterior (Codex) e não são necessários: a UI, o soft-delete
em lote, o progresso, o desbloqueio de limite e a limpeza de fotos já existem no
padrão legado; o único gap era paridade de filtro.

## Depreciação

Após validar o novo endpoint, remover `GET /contacts/delete-all`
(`DeleteAllContacts.js`) e sua rota no Express.

## Testes

- Preview (`quantity` da listagem) e total excluído batem para o mesmo filtro.
- Tags nos modos `AND`/`OR`/`NOT`, segmento, custom fields, pipeline + datas
  (timezone), ativos/inativos e phone/email null são respeitados — herdado por
  reusar `getContacts`.
- Nenhuma operação toca contatos de outro `accountId`.
- Reexecução de um lote não duplica efeito (where exige `isDeleted: false`).
- Limite da conta é recalculado ao final.

## Repositórios afetados

| Repositório | Responsabilidade |
|---|---|
| `chatfunnel-core` | `deleteFilteredContacts` (orquestra paginando `getContacts`) + `softDeleteMany` no repository |
| `chatfunnel-services` | Endpoint SSE `delete-filtered` reusando `GetContactsBodyDto` + limpeza S3 |
| `chatfunnel-front` | Filtro completo no modal + `EventSource` apontando pro novo endpoint |
