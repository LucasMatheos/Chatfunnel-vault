---
title: Integration Gotchas
description: Armadilhas relacionadas a Socket.IO, Meta webhooks, comunicacao inter-servico, auth, Mastra, agentes IA e WhatsApp API.
tags: [gotchas, socket-io, meta, webhooks, auth, mastra, whatsapp]
severity: varies
related: ["[[database-gotchas]]", "[[infrastructure-gotchas]]"]
last_updated: 2026-04-05
---

# Integration Gotchas

## Socket.IO broadcast para TODOS — sem rooms
**Repo:** chatfunnel-websocket. `io.sockets.emit()` envia para TODOS os clients conectados. Nao usa rooms — filtro e feito no client.

## moderadorsId com typo no payload
**Repo:** chatfunnel-websocket. Campo `moderadorsId` (falta um "e") e o nome real no payload de `add-message`. Typo propagado para front e back. NAO renomear sem alinhar websocket + frontend simultaneamente.

## Meta webhook verification (hub.challenge)
**Repo:** chatfunnel-gateway. GET em `/instagram_hook` e `/whatsapp_hook` deve retornar `hub.challenge` para verificacao Meta.

## NatsClient e singleton — nao criar extras
**Repo:** chatfunnel-gateway. `GetNatsClient()` sempre retorna mesma instancia via `sync.Once`.

## Mastra monkey-patch no JSON.parse
**Repo:** chatfunnel-services. `main.ts` tem monkey-patch de `JSON.parse` para contornar bug do Mastra @1.7.0. Remover quando atualizar Mastra.

## Prompts .md sao assets copiados pelo nest-cli
**Repo:** chatfunnel-services. Prompts em `a2a/prompts/` e `agents-v2/prompts/` sao copiados como assets (`watchAssets: true`). Novo prompt .md deve ser registrado no nest-cli.json.

## EventBus emit e sequencial
**Repo:** chatfunnel-core. Handlers sao awaited um por vez. Um handler lento bloqueia os seguintes.

## Meta APIs usam env vars diretamente
**Repo:** chatfunnel-core. `process.env.CLIENT_ID` etc. Nao passam por config/container.

## CacheAdapter tem fallback no-op
**Repo:** chatfunnel-core. Sem adapter de cache em `createCoreServices()`, cria dummy que retorna null/void. Services perdem caching silenciosamente.

## Auth por query param na external-api
**Repo:** chatfunnel-external-api. Auth e por `?apikey=` query param, nao header JWT como nos outros servicos.

## withInsiderFallback depende de env critica
**Repo:** chatfunnel-external-api. Sem `CALLBACK_EXTERNAL_API_URL`, o fallback de proxy quebra silenciosamente.

## global.signalR pode ser stub silencioso
**Repo:** chatfunnel-external-api. Se `WEBSOCKET_URL` nao estiver setada, `global.signalR` vira stub que nao emite nada — eventos de real-time somem sem erro.

## Webhook frill usa express.raw()
**Repo:** chatfunnel-services. `/webhooks/frill/update_frill_notification` usa `express.raw()`. Novos webhooks com raw body precisam de tratamento similar no main.ts.

## conversations chega serializado no broadcast worker
**Repo:** chatfunnel-worker-broadcast. Map de conversations vem do job como objeto plain (BullMQ serializa como JSON). **Workaround:** `new Map(Object.entries(...))`.

## Meta Graph API v19.0 hardcoded
**Repo:** chatfunnel-worker-broadcast. Versao fixa no `WhatsappApi.ts`. Atualizar manualmente quando a versao da API mudar.

## Rate limit nao consome attempt no broadcast
**Repo:** chatfunnel-worker-broadcast. `sendMessage.processor` usa `moveToDelayed` + `DelayedError` para rate limit sem gastar tentativas. Design intencional.
