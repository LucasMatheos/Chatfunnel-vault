---
title: Channels (Integracoes)
description: Como canais WhatsApp, Instagram e Messenger conectam ao ChatFunnel e processam mensagens.
tags: [features, channels, whatsapp, instagram, messenger]
related: ["[[message-flow]]", "[[broadcast]]"]
last_updated: 2026-04-05
---

# Channels (Integracoes)

Um **channel** (tabela `channels`) e um slot que uma conta aloca para conectar uma rede social. O campo `allocatedType` define o tipo ativo: `WHATSAPP`, `INSTAGRAM` ou `null` (vazio). Cada conta pode ter multiplos channels.

## Canais Suportados

| Canal | allocatedType | Login | API Graph |
|-------|--------------|-------|-----------|
| WhatsApp Business | `WHATSAPP` | Embedded Signup (Meta Business) | Cloud API v23.0 |
| Instagram | `INSTAGRAM` | OAuth (IG direto) ou via Facebook Page | Graph API v23.0 |
| Messenger | — | Via Facebook Page | Webhook recebido, envio nao implementado |

**Messenger** tem webhook handler registrado na API mas o handler apenas loga o payload e retorna 200 — sem processamento real.

## Conexao de Canal

### WhatsApp

1. Usuario faz Embedded Signup no front, recebe `code` OAuth da Meta
2. `WhatsappApi.getToken(code)` troca o code por um access token permanente
3. `WhatsappApi.subscribe(wabaId)` registra o app para receber webhooks
4. `WhatsappApi.register(phoneNumberId, pin)` registra o numero na Cloud API
5. `ChannelsRepository.linkWhatsApp()` salva `wppBusinessId`, `wppAccessToken`, `wppPhoneNumberId`, `wppPin` no channel

### Instagram

Dois fluxos de login (`igLoginType`):

- **PAGE**: via Facebook Page — `FacebookCommonApi.getPageMe()` + `getIGBusinessAccountLinkedOnPage()` + `subscribe()` com fields de messaging
- **INSTAGRAM**: OAuth direto — `InstagramApi.getMe()` + `getInstagramLongLivedAccessToken()` + `subscribe()` com mesmos fields

Ambos chamam `ChannelsRepository.linkIG()` ou `linkIGByOauth()` salvando `igBusinessId`, `igAccessToken`, `fbPageId`.

## Fluxo de Webhooks

```
Meta ──POST──> [Gateway (Go)] ──> NATS JetStream ──> [Worker] ──POST──> [chatfunnel-services]
                                                                              │
                                  [chatfunnel-api WebhookHandler] <───────────┘
```

1. **Gateway** (`chatfunnel-gateway`) recebe POST em `/whatsapp_hook` ou `/instagram_hook`
2. Se o channel ID esta em `INSIDER_CHANNEL_IDS`, replica para `HOMOLOG_URL`; senao publica no NATS
3. **Worker** consome do NATS e faz POST para `PROCESSOR_URL` (chatfunnel-services)
4. O payload chega no **WebhookHandler** da API (`commands/instagram/WebHookHandler/handler.js`)

O handler da API e **unificado**: WhatsApp webhook handler (`commands/whatsapp/WebhookHandler`) simplesmente delega para o handler do Instagram. A distincao e feita pelo campo `req.body.object` (`whatsapp_business_account` vs `instagram`).

### Validacao de Webhook

Cada canal tem um `WebhookValidator` que responde ao `hub.challenge` da Meta usando tokens de ambiente (`WHATSAPP_WEBHOOK_TOKEN`, etc.).

## Envio de Mensagens (Outbound)

### WhatsApp — Cloud API

`CloudApi` (`chatfunnel-core/src/meta/cloud.api.ts`) envia mensagens via `POST /{phoneNumberId}/messages`:

- `sendTextMessage()` — texto simples
- `sendMediaMessage()` — imagem, video, documento, audio
- `sendButtonsMessage()` — interactive buttons ou CTA URL
- `sendTemplate()` — template aprovado pela Meta (ver abaixo)
- `readMessage()` / `sendTyping()` — status de leitura e typing indicator

### Instagram

Envio via Facebook Graph API (`POST /{pageId}/messages`) — tratado pelo processador, nao pela `InstagramApi` do core (que so faz subscribe/getMe).

## WhatsApp Templates

Templates sao obrigatorios para iniciar conversa fora da janela de 24h.

**Entidades:**
- `WPPTemplates` — template legado (v1), criado via `commands/whatsapp/CreateTemplate`
- `WhatsappTemplates` — template v2, sincronizado com a Meta, com parametros e botoes

**Ciclo de vida:**
1. Criacao: salva no banco com status `PENDING`, envia para Meta via `CloudApi.createTemplate()`
2. Meta retorna `apiId` (ID do template na Meta) — salvo no registro
3. Status atualizado via webhook `message_template_status_update` → sync com chatfunnel-services
4. Edicao permitida apenas 1x a cada 24h se template ja aprovado

**Parametros:** templates suportam variaveis (`{{campo}}`) no header, body e botoes URL. O `CloudApi.sendTemplate()` resolve parametros via JSONPath contra dados do contato.

## Entidades-Chave

| Tabela | Descricao |
|--------|-----------|
| `channels` | Slot de canal — campos `wpp*` (WhatsApp) e `ig*` (Instagram) |
| `contactsChannels` | Vinculo contato-canal (por qual canal o contato conversa) |
| `WPPTemplates` | Templates WhatsApp v1 (legado) |
| `whatsappTemplates` | Templates WhatsApp v2 com parametros e botoes |
| `whatsappTemplatesParameters` | Parametros de template (header, body, button) |
| `whatsappTemplatesButtons` | Botoes de template (URL, quick_reply, phone) |
| `messages` | Mensagens enviadas/recebidas com status (SENT, DELIVERED, READ, ERROR) |
