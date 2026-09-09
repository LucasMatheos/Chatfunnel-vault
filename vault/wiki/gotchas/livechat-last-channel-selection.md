---
title: Livechat pode apagar o ultimo canal na montagem
description: O v-model inicial vazio de ListContacts nao pode sobrescrever o canal persistido no authStore.
tags: [gotcha, frontend, livechat, pinia]
severity: media
related: ["[[livechat]]", "[[chatfunnel-front]]"]
last_updated: 2026-09-08
---

# Livechat pode apagar o ultimo canal na montagem

## O que acontece
- Em `/livechat` sem `channelId` na URL, o `LiveChatTopBar` restaura `authStore.lastChannelSelectedId`.
- `ListContacts` recebe o `v-model:channel` inicial como `null` e nao deve limpar essa selecao.

## Por que
- O watcher imediato de `props.channel` era executado apos a restauracao e atribuía `null` a `channelSelectedId`.

## Workaround
- Sincronizar `props.channel` apenas quando houver um ID valido; a rota explicita continua sendo aplicada no `onMounted`.
- Fontes: `chatfunnel-front/src/views/livechatv2/components/ListContacts/index.vue` e `chatfunnel-front/src/views/livechatv2/components/LiveChatTopBar.vue`.
