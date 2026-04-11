---
title: chatfunnel-external-api
description: Referencia tecnica da API publica para integracoes externas — webhooks, API keys, routing via gateway.
tags: [repos, external-api, express, webhooks]
related: ["[[chatfunnel-gateway]]", "[[chatfunnel-api]]"]
last_updated: 2026-04-05
---

# chatfunnel-external-api

API publica para integracoes externas. **Express + JavaScript**, porta 3002.

## Stack

- Express + JavaScript
- Porta 3002

## Estrutura

> TODO: documentar estrutura de pastas

## Patterns & Convencoes

> TODO: documentar patterns

## Gotchas

- Auth por query param (nao header) em algumas rotas
- Meta webhook verification usa `hub.challenge` — retornar como plain text
- Webhook frill usa `express.raw()` — body nao e JSON

Veja tambem: [[chatfunnel-gateway]], [[integration-gotchas]]
