---
title: Broadcast (Disparo em massa WhatsApp)
description: Envio de mensagens em massa via templates aprovados do WhatsApp para listas segmentadas de contatos.
tags: [features, broadcast, whatsapp]
related: ["[[queue-architecture]]", "[[contacts]]"]
last_updated: 2026-04-05
---

# Broadcast

Broadcast e a feature de disparo em massa de mensagens WhatsApp. Permite enviar um template aprovado pela Meta para uma lista segmentada de contatos, com agendamento opcional e rastreamento de status por contato.

## Visao geral do fluxo

1. Operador acessa a tela **Broadcasts** (aba "Disparos") e clica em "Realizar disparo"
2. Preenche o formulario: nome, canal WhatsApp, template, selecao de contatos, agendamento
3. API cria o registro `BroadcastMessage` com os contatos vinculados e enfileira o job
4. Worker consome a fila, envia cada mensagem via Meta Graph API com rate limiting
5. Resultados sao bufferizados no Redis e persistidos em lote no banco a cada 5s
6. Operador acompanha status (pendente, finalizado, cancelado) na listagem

## Selecao de contatos

Dois modos de selecao (`selectionType`):

- **CONDITIONS** — filtros dinamicos por grupos de condicoes. Campos suportados: nome, telefone, email, Instagram, tags, custom fields. Operadores: equals, contains, starts_with, DDD, exists, comparacoes numericas. Grupos sao combinados com OR; condicoes dentro de um grupo com AND. Contatos duplicados (mesmo telefone normalizado) sao deduplicados mantendo o mais recente.
- **IMPORT** — upload de arquivo (CSV) com contatos. O sistema importa e vincula ao broadcast.

## Templates WhatsApp

O operador seleciona um template da aba "Modelos de mensagens". Templates sao sincronizados da Meta via botao "Sincronizar modelos". Apenas templates com status `APPROVED` na Meta podem ser usados. O template e validado em tempo real na criacao do broadcast (consulta a Cloud API).

Templates suportam parametros dinamicos (variaveis por contato) e botoes.

## Agendamento

Dois modos (`scheduleType`):

- **IMMEDIATELY** — disparo inicia 10 segundos apos criacao
- **SCHEDULED** — disparo inicia na data/hora agendada (com timezone do operador). Minimo 1 minuto no futuro.

O delay e implementado via Bull queue (job com delay calculado).

## Pipeline de envio

O envio e processado pelo `chatfunnel-worker-broadcast`:

1. **Enfileiramento** — `BroadcastService` busca contatos PENDENT em batches de 500 e cria um job por contato na fila `broadcast-send` (BullMQ)
2. **Rate limiting** — cada canal tem limite de 80 msg/s (hardcoded). Usa `RateLimiterRedis` distribuido. Quando atinge o limite, o job e reagendado via `moveToDelayed` sem consumir tentativas
3. **Envio** — `WhatsappApi.SendTemplate` envia via Meta Graph API v19.0
4. **Buffer** — resultado (sucesso/erro) vai para lista Redis `db-write-buffer` via `rpush`
5. **Persistencia** — worker de batch le o buffer a cada 5s e escreve no banco em `$transaction`
6. **Finalizacao** — quando todos os contatos saem de PENDENT, o broadcast e marcado como `finished`

Cada job tem 5 tentativas com backoff exponencial (3s base). Rate limit delays nao consomem tentativas.

## Status de contato

Cada `BroadcastMessageContacts` tem um `status`:

| Status | Significado |
|--------|-------------|
| `PENDENT` | Aguardando envio/entrega |
| `SUCCESS` | Mensagem entregue |
| `ERROR` | Falha no envio (erro salvo em `errorMessage`) |

## Acoes do operador

- **Cancelar** — cancela um broadcast pendente (remove job da fila, marca `isCancelled`)
- **Arquivar** — oculta da listagem padrao (filtro `isArchived`)
- **Exportar CSV** — exporta contatos com nome, telefone, status e mensagem de erro
- **Filtrar listagem** — por nome, tipo de agendamento, status (pendente/finalizado/cancelado), arquivados

## Tags e permissoes

Na criacao, o operador pode associar tags ao broadcast. As tags sao aplicadas a todos os [[contacts]] do disparo, permitindo segmentacao futura. Permissoes: `BROADCAST.SEND_BROADCAST`, `BROADCAST.VIEW_TEMPLATES`, `BROADCAST.ADD_TEMPLATE`.

## Entidades principais

`BroadcastMessage`, `BroadcastMessageContacts` (status individual), `BroadcastMessageTags`, `WhatsappTemplates` (com parametros e botoes), `Channels` (canal WhatsApp).
