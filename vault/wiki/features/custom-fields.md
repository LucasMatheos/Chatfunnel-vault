---
title: Custom Fields
description: Sistema de campos personalizados de contatos — diferenciacao entre campos nativos (sistema) e campos criados pelo usuario.
tags: [feature, contacts, custom-fields, database]
related: ["[[contacts]]", "[[automations]]"]
last_updated: 2026-04-13
---

# Custom Fields

Sistema de campos associados a contatos. Divide-se em dois tipos:

- **Nativos (sistema)**: 5 campos fixos com UUIDs reservados no formato `00000000-0000-0000-0000-000000000XXX`. Mapeiam colunas diretas da tabela `Contacts`.
- **Custom (usuario)**: criados por cada conta, armazenados em `CustomFieldsContacts` (tabela junction).

## Campos nativos

| ID | Nome (PT-BR) | Coluna em `Contacts` |
|---|---|---|
| `00000000-0000-0000-0000-000000000001` | E-mail | `email` |
| `00000000-0000-0000-0000-000000000002` | Telefone | `phone` |
| `00000000-0000-0000-0000-000000000003` | Nome completo | `name` |
| `00000000-0000-0000-0000-000000000004` | Primeiro nome | `firstName` |
| `00000000-0000-0000-0000-000000000005` | Sobrenome | `lastName` |
| `00000000-0000-0000-0000-000000000006` | utm_source | `utmSource` |
| `00000000-0000-0000-0000-000000000007` | utm_medium | `utmMedium` |
| `00000000-0000-0000-0000-000000000008` | utm_campaign | `utmCampaign` |
| `00000000-0000-0000-0000-000000000009` | utm_term | `utmTerm` |
| `00000000-0000-0000-0000-000000000010` | utm_content | `utmContent` |
| `00000000-0000-0000-0000-000000000011` | last_schedule_link | `lastScheduleLink` |
| `00000000-0000-0000-0000-000000000012` | last_schedule_date | `lastScheduleDate` (DateTime) |

Todos tem `accountId = NULL` no banco (diferenciador primario).

## Schema (Prisma)

`chatfunnel-core/prisma/schema.prisma`:

- `CustomFields` — `accountId String?` (NULL para nativos, populado para custom).
- `CustomFieldsContacts` — junction `customFieldId + contactId`, armazena `value`. So usado para custom fields.
- `Contacts` — possui colunas diretas (`name`, `firstName`, `lastName`, `email`, `phone`) que sao os "destinos" dos nativos.

### Migrations relevantes

- `20231213051112_adicionar_custom_fields` — criou tabelas (accountId NOT NULL originalmente).
- `20240108213014_custom_fields_fixed` — tornou `accountId` nullable, inseriu Email (#1) e Phone (#2).
- `20240826133737_add_new_custom_fields` — inseriu Name (#3), FirstName (#4), LastName (#5).
- `add_utm_and_last_schedule_native_fields` — adicionou 7 colunas em `Contacts` (utmSource/Medium/Campaign/Term/Content, lastScheduleLink, lastScheduleDate) + INSERTs #6–#12 em `CustomFields`.

## Pattern de identificacao

Usado em todo o codigo (front e back):

```ts
const isNative = fieldId.includes("00000000-0000-0000-0000-")
```

## Comportamento de escrita

`chatfunnel-api/src/commands/instagram/WebHookHandler/processor/fragments/BaseHandler.js` (metodo `_addInfoToCustomField`):

- Se ID e nativo → `prisma.contacts.update({ data: { <coluna> } })` diretamente na tabela `Contacts`.
  - `#1 Email` — coluna `email` (lowercased).
  - `#2 Telefone` — coluna `phone`; passa por `FormatPhoneHelper.formatPhone()` e e skipado se `platform === "whatsapp"`.
  - `#3 Nome completo` — split em `firstName` + `lastName`, escreve os 3.
  - `#4 firstName` / `#5 lastName` — reconstroem o `name` completo.
  - `#6–#10 UTMs` — escrita direta em `utmSource|utmMedium|utmCampaign|utmTerm|utmContent`.
  - `#11 last_schedule_link` — `lastScheduleLink` (string).
  - `#12 last_schedule_date` — `lastScheduleDate` (DateTime); parse via `new Date(info)`, skip se invalido.
- Se ID e custom → cria/atualiza registro em `CustomFieldsContacts`.

## Comportamento de leitura / listagem

`chatfunnel-core/src/services/custom_fields/handlers/get-custom-fields.handler.ts:40-49`:

| Filter | Where |
|--------|-------|
| `"Sistema"` | `{ accountId: null }` |
| `"Sem Categoria"` | `{ accountId, folderId: null }` |
| `"Todos os Campos"` | `{ OR: [{ accountId: null }, { accountId }] }` |
| nome da pasta | `{ accountId, folder: { name } }` |

Nomes de pasta reservados (nao permitidos ao usuario): `"Todos os Campos"`, `"Sem Categoria"`, `"Sistema"` — ver `create-folder.handler.ts:6`.

## Comportamento em cópia de automations

`chatfunnel-core/src/services/automations/handlers/build-automation.handler.ts:992`:

```ts
private async createCustomField(id: string, state: any) {
  if (id.includes("00000000-0000-0000-0000-")) return id; // native: passa direto
  // custom: recria para a conta de destino
}
```

Nativos sao reusados cross-account; custom sao recriados no destino.

## Frontend

- `chatfunnel-front/src/components/shadcn-custom/input-text-tag/useContactFields.ts:48-74` — system fields hardcoded (alem dos 5 UUIDs, inclui `instagramUsername`, etc. que sao propriedades diretas de `Contacts` **sem ID UUID**).
- `chatfunnel-front/src/components/inputs/InputCustomFields.vue` — categoriza em "Campos do Sistema" vs "Campos Personalizados" via `isSystem: e.id.includes('00000000-...')`.
- `chatfunnel-front/src/components/buttons/MenuVariables.vue` — filtra nativos dos menus de variaveis.
- `chatfunnel-front/src/views/contacts/ContactsManageCustomFields.vue` — UI de gestao, usuario so mexe em custom (nao pode deletar nativos).

## Distribuicao entre repos

- **chatfunnel-core** — schema, migrations, repositories, handlers, logica de filtro nativo vs custom.
- **chatfunnel-services** — wrapper NestJS (`CustomFieldsController`, `CustomFieldsService`).
- **chatfunnel-api** — `BaseHandler.js` webhook Instagram escreve diretamente em `Contacts` quando detecta ID nativo.
- **chatfunnel-mcp** — wrapper para MCP clients listarem campos.
- **chatfunnel-front** — Vue components, composables, filtros.

## Gotchas

- Frontend "system fields" ≠ "native custom fields". Os 5 UUIDs sao **registros reais** em `CustomFields` com `accountId NULL`. Outros "system fields" na UI (ex: `instagramUsername`) sao propriedades diretas de `Contacts` sem ID nativo no banco.
- Ao copiar uma automation entre contas, usar o pattern `id.includes("00000000-0000-0000-0000-")` para preservar refs nativas — NUNCA tentar recriar esses IDs.
- Telefone nativo (`#2`) nao e escrito quando `platform === "whatsapp"` (o numero ja vem da plataforma, nao pode ser sobrescrito pelo webhook).
- `accountId NULL` significa "pertence ao sistema, nao a uma conta" — todas as queries custom sempre filtram por `accountId` do tenant, os nativos precisam ser explicitamente incluidos com `OR`.
