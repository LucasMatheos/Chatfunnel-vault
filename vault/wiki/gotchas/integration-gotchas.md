---
title: Integration Gotchas
description: Armadilhas relacionadas a Socket.IO, Meta webhooks, comunicacao inter-servico, auth, Mastra, agentes IA e WhatsApp API.
tags: [gotchas, socket-io, meta, webhooks, auth, mastra, whatsapp]
severity: varies
related: ["[[database-gotchas]]", "[[infrastructure-gotchas]]"]
last_updated: 2026-08-27
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

## Comissao de parceiro some silenciosamente se customer nao existe no Partnero
**Repo:** chatfunnel-services. `stripe/webhook/handler.ts` faz `searchCustomer` na API do Partnero antes de lancar a transacao de comissao; se nao encontra, so da `return` — sem log, sem alerta, sem fila de retry. Cliente vinculado ao parceiro sem "customer" previamente criado no Partnero (ex.: vinculo manual, compra sem `?aff=`) nunca gera comissao e ninguem percebe. Ver [[partners]].

## IDs local e externo de parceiro nao sao intercambiaveis
**Repos:** chatfunnel-services, chatfunnel-core. `Users.partnerId` e FK UUID para `Partners.id`; `Partners.partnerId` e o ID externo do Partnero. Fluxos de vinculo devem persistir o primeiro e chamadas ao Partnero devem usar o segundo. Em recorrencias, buscar o parceiro por `Partners.id`, nunca por `Partners.partnerId`. Erros de comissao devem usar o logger estruturado para stdout, com `userId`, `partnerId` e `paymentId`. Ver [[partners]].

## Data da comissao no Partnero e a do cron, nao a do pagamento
**Repo:** chatfunnel-api. `PaymentJob.js` (cobranca recorrente Pagar.me) chama `CreateTransaction` no Partnero sem passar a data real do pagamento — falha temporaria na API do Partnero so e logada via `console.error`/catch, sem retry, entao a comissao so aparece num ciclo de cron posterior (ou nunca, exigindo correcao manual via `scripts/partnero-cli.js`). Ver [[partners]].
