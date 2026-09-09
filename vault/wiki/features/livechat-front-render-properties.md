---
title: Livechat — Propriedades Necessárias para Renderização
description: Catálogo tabular dos dados que o frontend precisa para renderizar lista, conversa e detalhes do contato.
tags: [features, livechat, frontend, contracts, reference]
related: ["[[livechat]]", "[[livechat-contact-list-performance]]", "[[contacts]]", "[[crm-kanban]]"]
last_updated: 2026-07-23
status: reference
---

# Livechat — Propriedades Necessárias para Renderização

## Item da lista

| Propriedade | Tipo | Obrigatória | Renderização |
|---|---|---:|---|
| `id` | `string` | Sim | Seleção, rota e ações |
| `name` | `string` | Sim | Nome e fallback do avatar |
| `photo` | `string \| null` | Não | Avatar |
| `lastUpdate` | `string \| null` | Não | Ordenação e horário relativo |
| `isActive` | `boolean` | Sim | Badge de contato inativo |
| `isVisualized` | `boolean` | Sim | Indicador de conversa não lida |
| `transferModeratorId` | `string \| null` | Não | Destaque de transferência |
| `moderatorId` | `string \| null` | Não | Avatar do moderador |
| `moderatorName` | `string \| null` | Não | Identificação do moderador |
| `kanbanModerators` | `ModeratorSummary[]` | Sim | Avatares dos moderadores do CRM |
| `servedByAssistant` | `boolean` | Sim | Indicador de atendimento por IA |
| `blockedAgent` | `boolean` | Sim | Indicador de IA bloqueada |

| Requisição de origem | Cliente | Momento | Observação |
|---|---|---|---|
| `GET /nest/chats/contacts_v2/:channelId` | `NestApi` | Abertura, filtros, pesquisa, paginação e refresh | Retorna a lista paginada |
| Evento WebSocket `add-message` | `SignalR` / `eventBus` | Nova mensagem | Atualiza localmente `lastUpdate` e estado não lido antes do refresh |
| Evento WebSocket `updated-chat` | `SignalR` / `eventBus` | Alteração do chat | Pode disparar refresh da lista |

## Contato selecionado

| Propriedade | Tipo | Obrigatória | Renderização |
|---|---|---:|---|
| `id` | `string` | Sim | Busca de mensagens e ações |
| `name` | `string` | Sim | Header |
| `photo` | `string \| null` | Não | Avatar do header |
| `phone` | `string \| null` | Condicional | Header e envio em canal WhatsApp |
| `isActive` | `boolean` | Sim | Bloqueio de ações |
| `isArchived` | `boolean` | Sim | Ação de arquivar ou desarquivar |
| `channelId` | `string` | Sim | Mensagens, leitura, follow-up e IA |
| `channelAllocatedType` | `string` | Sim | Comportamento específico do canal |

| Requisição de origem | Cliente | Propriedades adquiridas | Observação |
|---|---|---|---|
| `GET /nest/chats/contacts_v2/:channelId` | `NestApi` | Todas as propriedades da seleção imediata | O objeto vem do item clicado na lista |
| `GET /api/chat/:channelId/:contactId/messages` | `Api` | Contato completo como fallback | Hoje duplica dados do contato junto das mensagens |
| `GET /nest/chats/contact/:contactId/:channelId` | `NestApi` | Dados detalhados do contato | Hoje não seleciona `photo` nem `isActive` |

## Mensagem

| Propriedade | Tipo | Obrigatória | Renderização |
|---|---|---:|---|
| `id` | `string` | Sim | Identidade interna e mídia Instagram |
| `messageId` | `string \| null` | Sim | Cursor da paginação |
| `contactId` | `string` | Sim | Reply, mídia e contexto |
| `from` | `CONTACT \| HUMAN \| BOT \| ASSISTANT` | Sim | Escolha do balão e remetente |
| `type` | `WHATSAPP \| INSTAGRAM \| SYSTEM` | Sim | Escolha do renderer |
| `objMessage` | `MessagePayload \| null` | Sim | Texto, mídia, template, reply, sistema e CRM |
| `createdAt` | `string` | Sim | Ordenação e horário |
| `sentAt` | `string \| null` | Não | Horário preferencial |
| `status` | `string \| null` | Não | Erro, CRM e estado do envio |
| `errorMessage` | `string \| null` | Não | Detalhe de falha |
| `reaction` | `string \| null` | Não | Reação |
| `transcription` | `string \| null` | Não | Transcrição de áudio |
| `isObservation` | `boolean` | Sim | Nota interna |
| `userId` | `string \| null` | Não | Avatar do operador |
| `username` | `string` | Sim | Nome e tooltip do remetente |
| `sentByAppBusiness` | `boolean` | Sim | Identificação de envio pelo app |
| `assistantId` | `string \| null` | Não | Avatar da IA remetente |

| Requisição de origem | Cliente | Momento | Observação |
|---|---|---|---|
| `GET /api/chat/:channelId/:contactId/messages` | `Api` | Seleção e paginação | Retorna a página de mensagens |
| Evento WebSocket `add-message` | `SignalR` / `eventBus` | Tempo real | Insere uma nova mensagem no array local |
| `GET /api/chat/messages/:messageId` | `Api` | Sob demanda | Complementa mensagens Instagram quando o payload inicial é insuficiente |

## Mensagem de broadcast com erro

| Propriedade | Tipo | Obrigatória | Renderização |
|---|---|---:|---|
| `id` | `string` | Sim | Identidade interna |
| `messageId` | `string` | Sim | Cursor; pode ser sintético no erro |
| `contactId` | `string` | Sim | Associação ao contato |
| `from` | `HUMAN` | Sim | Balão de mensagem enviada |
| `type` | `WHATSAPP` | Sim | Renderer WhatsApp |
| `status` | `ERROR` | Sim | Ícone vermelho |
| `errorMessage` | `string \| null` | Não | Popover do erro |
| `createdAt` | `string` | Sim | Horário |
| `sentAt` | `string \| null` | Não | Horário preferencial |
| `username` | `string` | Sim | Remetente |
| `userId` | `string \| null` | Não | Avatar do remetente |
| `objMessage` | `BroadcastTemplatePayload \| null` | Condicional | Template que falhou, quando disponível |

| Requisição de origem | Cliente | Momento | Observação |
|---|---|---|---|
| `GET /api/chat/:channelId/:contactId/messages` | `Api` | Carregamento do histórico | Lê a mensagem de erro persistida pelo worker |
| Worker `broadcast-send` → Redis `db-write-buffer` | Worker Broadcast | Falha do envio | Produz `status`, `errorMessage` e `objMessage` |
| Worker `database-batch-writer-queue` → `Messages` | Worker Broadcast | Persistência em lote | Converte o status do broadcast para `Messages.status = ERROR` |

## Perfil do contato

| Propriedade | Tipo | Obrigatória | Renderização |
|---|---|---:|---|
| `id` | `string` | Sim | Identidade e ações |
| `name` | `string` | Sim | Nome |
| `photo` | `string \| null` | Não | Avatar |
| `phone` | `string \| null` | Não | Telefone |
| `email` | `string \| null` | Não | E-mail |
| `platform` | `string` | Sim | Plataforma da conversa atual |
| `isActive` | `boolean` | Sim | Bloqueio de edição e ações |
| `instagramUsername` | `string \| null` | Não | Perfil Instagram nos detalhes |
| `instagramFollowerCount` | `number` | Não | Total de seguidores |
| `instagramFollow` | `boolean` | Não | Se segue o perfil |
| `instagramFollowBusinnes` | `boolean` | Não | Se segue a empresa |

| Requisição de origem | Cliente | Propriedades adquiridas | Observação |
|---|---|---|---|
| `GET /nest/chats/contact/:contactId/:channelId` | `NestApi` | `id`, `name`, `phone`, `email`, `fromPlatform` e dados Instagram | Fonte principal do painel de detalhes |
| `GET /api/chat/:channelId/:contactId/messages` | `Api` | Contato completo como fallback | Atualmente pode fornecer `photo` e `isActive` ausentes no endpoint de detalhes |
| `GET /nest/chats/contacts_v2/:channelId` | `NestApi` | `photo`, `isActive` e dados imediatos | Fonte inicial antes do carregamento dos detalhes |

## Moderador

| Propriedade | Tipo | Obrigatória | Renderização |
|---|---|---:|---|
| `id` | `string` | Sim | Identidade e avatar derivado |
| `name` | `string` | Sim | Nome |
| `transferModeratorId` | `string \| null` | Não | Estado de transferência |

| Requisição de origem | Cliente | Momento | Observação |
|---|---|---|---|
| `GET /nest/chats/contact/:contactId/:channelId` | `NestApi` | Seleção do contato | Retorna `contact.chatModerators` |
| `GET /nest/chats/contacts_v2/:channelId` | `NestApi` | Renderização da lista | Retorna resumo de moderadores para os avatares da lista |
| Evento WebSocket `moderators-updated` | `SignalR` | Alteração de moderador | Dispara nova busca dos detalhes |

## Atendimento por IA

| Propriedade | Tipo | Obrigatória | Renderização |
|---|---|---:|---|
| `servedByAssistant` | `boolean` | Sim | Atendido ou não por IA |
| `assistant.id` | `string \| null` | Não | Identidade da IA |
| `assistant.name` | `string \| null` | Não | Nome da IA |
| `blocked` | `boolean` | Sim | Estado de bloqueio |
| `pausedAt` | `string \| null` | Não | Início da pausa |
| `pausedTimeMinutes` | `number` | Sim | Contagem regressiva da pausa |

| Requisição de origem | Cliente | Propriedades adquiridas | Observação |
|---|---|---|---|
| `GET /nest/chats/served_by_assistant/:channelId/:contactId` | `NestApi` | Estado, IA, bloqueio e pausa | O backend retorna ID e nome da IA, mas o front atual os descarta |
| `GET /nest/chats/contact/:contactId/:channelId` | `NestApi` | Estado duplicado em `contactsChannels` | Não deve ser a fonte principal do bloco de IA |
| Evento WebSocket `updated-chat` | `eventBus` | Sinal de atualização | Dispara novamente a requisição de estado da IA |

## Campo personalizado

| Propriedade | Tipo | Obrigatória | Renderização |
|---|---|---:|---|
| `name` | `string` | Sim | Nome do campo |
| `value` | `string \| number \| boolean \| null` | Não | Valor |
| `system` | `boolean` | Sim | Agrupamento “Sistema” |
| `folder.name` | `string \| null` | Não | Grupo do campo personalizado |

| Requisição de origem | Cliente | Momento | Observação |
|---|---|---|---|
| `GET /api/contacts/:contactId/custom_fields?includeAll=false` | `Api` | Montagem e abertura do accordion | Retorna campos preenchidos |
| Mesmo endpoint | `Api` | Clique no accordion | Pode repetir a chamada feita na montagem |
| Gap atual | — | — | O front espera `system`, mas o endpoint não seleciona essa propriedade |

## Follow-up

| Propriedade | Tipo | Obrigatória | Renderização |
|---|---|---:|---|
| `id` | `string` | Sim | Chave e cancelamento |
| `scheduleDate` | `string` | Sim | Data de execução |
| `createdAt` | `string` | Sim | Data de criação e posição na conversa |
| `typeAnswer` | `PENDING \| ANSWER \| UNANSWER \| CANCELED` | Sim | Status e ações |

| Requisição de origem | Cliente | Momento | Observação |
|---|---|---|---|
| `GET /nest/chats/follow_up_schedule/:channelId/:contactId` | `NestApi` | Seleção e novas mensagens | Retorna os follow-ups do contato no canal |
| Evento WebSocket `followup-updated` | `eventBus` | Alteração do follow-up | Dispara nova busca |
| `POST /api/contacts/cancelFollowUp/:id` | `Api` | Ação do usuário | Após cancelar, a lista deve ser atualizada |

## Card de CRM

| Propriedade | Tipo | Obrigatória | Renderização |
|---|---|---:|---|
| `id` | `string` | Sim | Identidade e ações |
| `createdAt` | `string` | Sim | Data de criação |
| `priority` | `string \| null` | Não | Prioridade |
| `statusOportunity` | `OPEN \| WON \| LOST` | Sim | Estado da oportunidade |
| `kanban.id` | `string` | Sim | Identidade do pipeline |
| `kanban.name` | `string` | Sim | Nome do pipeline |
| `kanban.columns[].id` | `string` | Sim | Identidade da etapa |
| `kanban.columns[].name` | `string` | Sim | Nome da etapa |
| `kanban.columns[].color` | `string \| null` | Não | Cor da etapa |
| `column.id` | `string` | Sim | Etapa atual |
| `column.name` | `string` | Sim | Nome da etapa atual |
| `moderators[].id` | `string` | Sim | Identidade da associação |
| `moderators[].user.id` | `string` | Sim | Identidade do moderador |
| `moderators[].user.name` | `string` | Sim | Nome do moderador |
| `lossReason.id` | `string \| null` | Não | Identidade da razão de perda |
| `lossReason.name` | `string \| null` | Não | Razão de perda |

| Requisição de origem | Cliente | Momento | Observação |
|---|---|---|---|
| `GET /nest/chats/contact/:contactId/:channelId` | `NestApi` | Seleção e atualização do card | Retorna `kanbanCards` junto dos detalhes |
| `PUT /api/accounts/kanban/:kanbanId/cards/:cardId` | `Api` | Alterar etapa, moderador ou prioridade | Após sucesso, recarrega os detalhes |
| `POST /api/crm/change_status_kanban_card` | `Api` | Ganhar, perder ou reverter oportunidade | Após sucesso, recarrega detalhes e mensagens |
