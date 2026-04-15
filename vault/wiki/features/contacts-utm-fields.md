---
title: Contacts UTM & Scheduled Link Fields
description: 7 campos nativos no model Contacts para rastreamento UTM e agendamento — schema pronto, falta sync core/api/front.
tags: [contacts, utm, tracking, scheduled-links, in-progress]
related: ["[[contacts]]", "[[custom-fields]]", "[[crm-kanban]]"]
last_updated: 2026-04-14
---

# Contacts UTM & Scheduled Link Fields

## Objetivo

Adicionar campos nativos de rastreamento UTM e ultimo agendamento diretamente no model `Contacts`, eliminando a necessidade de custom fields manuais para esses dados.

## Campos adicionados ao schema

| Campo | Tipo | Finalidade |
|-------|------|-----------|
| `utmSource` | String? | Origem do trafego (google, facebook, etc.) |
| `utmMedium` | String? | Meio (cpc, email, social, etc.) |
| `utmCampaign` | String? | Nome da campanha |
| `utmTerm` | String? | Termo de busca paga |
| `utmContent` | String? | Variante do anuncio |
| `lastScheduleLink` | String? | URL do ultimo agendamento |
| `lastScheduleDate` | DateTime? | Data do ultimo agendamento |

**Localizacao no schema:** `chatfunnel-core/prisma/schema.prisma` linhas 572-578

## Migration

- **Arquivo:** `prisma/migrations/20260413192359_add_utm_and_last_schedule_native_fields/migration.sql`
- Adiciona 7 colunas na tabela Contacts
- Cria 7 registros system em `CustomField` (IDs `00000000-0000-0000-0000-000000000006` a `...000012`) para mapeamento UI

## Status por camada

### Feito

- [x] Schema Prisma com 7 campos
- [x] Migration criada
- [x] 7 CustomField system entries na migration
- [x] Variaveis de template no front (`MenuVariables.vue` + `useContactFields.ts`)
- [x] API retorna os campos no GET (findFirst sem select explicito)

### Falta

- [ ] **chatfunnel-api** `UpdateContactInfo/handler.js` — aceitar e salvar campos UTM/schedule no update
  - Hoje so aceita: `firstName`, `lastName`, `email`, `phone`, `instagramUsername`, `customFields`
  - Precisa: destructure UTM fields do `req.body` + incluir no `prisma.update()`
- [ ] **chatfunnel-core** `contacts.repository.ts` — adicionar filtros UTM no `getContacts()`
  - Metodo `getContacts()` filtra por: searchTerm, phone, email, instagram, tags, pipeline, dates, priority
  - Falta: filtro por utmSource, utmMedium, utmCampaign, utmTerm, utmContent
- [ ] **chatfunnel-core** `contacts_channels.repository.ts` — incluir UTM fields no select de `getContactChannelById()` (linhas ~65-95)
- [ ] **chatfunnel-front** `CardModal/index.vue` — exibir UTM + schedule no painel do contato
  - Hoje mostra: name, email, phone, instagram, tags, status, moderators, created date, priority, amount, custom fields
  - Falta: secao UTM + secao Schedule
- [ ] **chatfunnel-front** `FilterKanban.vue` — filtros por UTM (opcional, prioridade baixa)

## Prioridade de implementacao

1. **API handler** (desbloqueio de escrita) — `chatfunnel-api/UpdateContactInfo/handler.js`
2. **Core repository** (filtros) — `chatfunnel-core/src/repositories/contacts.repository.ts`
3. **Front CardModal** (exibicao) — `chatfunnel-front/src/views/crm/components/CardModal/index.vue`
4. **Front FilterKanban** (filtro) — `chatfunnel-front/src/views/crm/components/FilterKanban.vue` (pode ficar pra depois)

## Repos e branch

- **Branch:** `feature/contacts-utms` (em todos os repos)
- **Repos afetados:** chatfunnel-core, chatfunnel-api, chatfunnel-front
