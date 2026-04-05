---
title: Database Architecture
description: Schema Prisma compartilhado, entidades principais, repositories, migrations
tags: [architecture, database, prisma, postgresql, repositories]
related: ["[[multi-tenancy]]", "[[message-flow]]"]
last_updated: 2026-04-05
---

# Database Architecture

PostgreSQL via Prisma, com schema compartilhado em `chatfunnel-core/prisma/schema.prisma` (~3031 linhas, 140 models, 477 migrations).

## Schema compartilhado via @chatfunnel/core

O schema vive em `chatfunnel-core/prisma/schema.prisma`. Todos os repos importam tipos e client via:

```typescript
import { PrismaClient, Accounts } from "@chatfunnel/core/database";
```

O modulo `database/index.ts` re-exporta tudo de `@prisma/client` + `JsonValue`/`InputJsonValue`.

## Entidades principais

### Nucleo (Users, Accounts, Contacts)

| Model | Descricao | Relacoes-chave |
|-------|-----------|----------------|
| **Users** | Usuario da plataforma (dono de conta, moderador) | → Accounts[], Contacts[], Payments[], Moderators[] |
| **Accounts** | Conta/workspace — unidade de [[multi-tenancy]] | → Channels[], Contacts[], IGAutomations[], Kanbans[], Tags[], Agents[] |
| **Contacts** | Lead/contato de um account | → Messages[], TagsContacts[], KanbanCards[], ContactsChannels[], AgentSessions[] |
| **Moderators** | Vincula User a Account como colaborador | userId + accountId |

### Canais e Mensagens

| Model | Descricao | Relacoes-chave |
|-------|-----------|----------------|
| **Channels** | Canal de comunicacao (IG, WPP, FB) por account | → ContactsChannels[], Messages[], Conversations[] |
| **ContactsChannels** | Vinculo contato ↔ canal (status do chat, atendimento) | contactId + channelId, flags: answeredChat, servedByAssistant, blockedAgent |
| **Messages** | Mensagem individual (from: CONTACT/BOT/ASSISTANT/HUMAN) | → Contact, Channel, Conversation?, Broadcast? |
| **Conversations** | Sessao de conversa (channel + contact, com inicio/fim) | → Messages[], Channel, Contact |

### Automacoes

| Model | Descricao | Relacoes-chave |
|-------|-----------|----------------|
| **IGAutomations** | Automacao (fluxo visual com steps e triggers) | → IGAutomationsTriggers[], IGAutomationsSteps[] |
| **IGAutomationsTriggers** | Gatilho que inicia a automacao (comentario, story, mensagem, etc.) | → Channel?, Tags[], conditions |
| **IGAutomationsSteps** | Step individual do fluxo (mensagem, acao, delay, etc.) | → MessageFlow[], Actions[] |
| **IGAutomationsStepsInProgress** | Step em execucao para um contato | contactId + stepId + channelId |
| **IGAutomationsExecutions** | Log de execucao de automacao | automationId + contactId |

### Assistentes e Agentes IA

| Model | Descricao | Relacoes-chave |
|-------|-----------|----------------|
| **OpenaiAssistants** | Assistente IA (legado, baseado em OpenAI Assistants API) | → Threads[], Fields[], Functions[], Ratings[] |
| **Agents** | Agente IA v2 (multi-provider: OpenAI, Anthropic) | → AgentSessions[], AgentExecutions[], AgentFields[], AgentAutomations[] |
| **AgentSessions** | Sessao de conversa do agente com contato | → AgentSessionMessages[] |
| **AgentSessionMessages** | Mensagem na sessao do agente (role, content, toolCalls) | sessionId |

### Kanban (CRM)

| Model | Descricao | Relacoes-chave |
|-------|-----------|----------------|
| **Kanbans** | Board kanban por account | → KanbanColumns[], KanbanCards[], KanbanMetadata[] |
| **KanbanColumns** | Coluna do board (posicao, cor, isDone) | → KanbanCards[] |
| **KanbanCards** | Card = contato no pipeline (status: OPEN/WON/LOST) | → Contact, Column, Moderators[], Tags[], Comments[] |
| **KanbanCardsHistory** | Historico de movimentacao de cards | oldColumn → newColumn |

### Broadcast

| Model | Descricao | Relacoes-chave |
|-------|-----------|----------------|
| **BroadcastMessage** | Campanha de broadcast (template WPP, condicoes, agendamento) | → BroadcastMessageContacts[], Channel?, Messages[] |
| **WhatsappTemplates** | Template WPP (HSM) aprovado pela Meta | → BroadcastMessage[] |

### Outros dominios relevantes

- **Tags** / **TagsContacts** — sistema de etiquetas por account
- **CustomFields** / **CustomFieldsContacts** — campos personalizados por account
- **Integrations** — integracoes externas (Hotmart, Stripe, ActiveCampaign, etc.)
- **GoogleCalendars** / **GoogleCalendarEvents** — agendamento via Google Calendar
- **ContactSegments** — segmentacao de contatos
- **LegalDocuments** / **ConsentRecords** — LGPD/compliance

## Multi-tenancy

Quase toda entidade tem `accountId` como FK obrigatoria. Ver [[multi-tenancy]] para detalhes.

- `Accounts` pertence a um `Users` (dono)
- `Moderators` vincula outros Users a uma Account
- Toda query DEVE filtrar por `accountId`

## Repository Pattern

~65 repositories em `chatfunnel-core/src/repositories/`. Cada um wrapa uma tabela Prisma:

- Recebe `PrismaClient` no constructor
- Alguns recebem tambem uma queue (ex: `ContactsRepository` recebe `SystemActionsQueue`)
- Instanciados via `createCoreServices()` em `container.ts`
- ~9 repos mais novos (agents_v2, a2a_*, agent_*) sao exportados mas NAO instanciados no container

**Import:**
```typescript
import { AccountsRepository } from "@chatfunnel/core/repositories";
```

## Migrations

- **477 migrations** acumuladas (desde inicio do projeto ate marco/2026)
- Geradas com `prisma migrate dev --create-only` — NUNCA aplicar manualmente
- Deploy automatizado via CI (`prisma migrate deploy`)
- `postinstall` roda `prisma generate` automaticamente

## Gotchas

- **agents.repository esta morto** — substituido por `agents_v2.repository`. Arquivo existe, export comentado
- **Typo no nome** — `contacts_follow_up_scheduled.respository.ts` (resp, nao rep). Nao renomear sem atualizar consumers
- **Prefixo IG nas automacoes** — models chamam `IGAutomations*` mas servem para todos os canais (WPP, FB, IG)
- **Soft delete** — maioria das entidades usa `isDeleted: Boolean @default(false)` em vez de delete fisico
- **UUIDs** — todas as PKs sao UUID v4 (`@default(uuid()) @db.Uuid`)
