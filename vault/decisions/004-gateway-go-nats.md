---
title: ADR-004 — Gateway em Go com NATS JetStream
tags: [decisions, adr, gateway, go, nats]
date: 2026-04-05
status: active
related: ["[[message-flow]]", "[[inter-service-communication]]"]
---

# ADR-004: Gateway em Go com NATS JetStream

## Contexto

Os webhooks da Meta (WhatsApp e Instagram) precisam de resposta rapida (< 5s) e processamento confiavel. O volume de mensagens pode ser alto e picos sao imprevisíveis.

## Decisao

Criar o **chatfunnel-gateway** em Go com chi router. Webhooks sao recebidos, respondidos imediatamente (200 OK), e o payload e publicado no **NATS JetStream**. Um worker Go consome e encaminha para o chatfunnel-services via HTTP.

## Alternativas consideradas

- **Processar webhooks direto no Express/NestJS** — descartado pelo risco de timeout (Meta exige resposta rapida) e acoplamento
- **RabbitMQ** — descartado por complexidade operacional; NATS e mais leve e nativo Go
- **Redis Streams** — descartado por ja usar Redis para cache/filas; separar concerns
- **Gateway em Node** — descartado pela vantagem de performance do Go para I/O intensivo

## Consequencias

- **Positivas:** Resposta sub-milissegundo para Meta, retry com backoff nativo do NATS (10s/30s/60s/120s), MaxDeliver: 5, isolamento total do processamento
- **Negativas:** Unico repo Go no workspace (curva de aprendizado), NATS como dependencia extra de infra
- **Regra:** Canais insider sao replicados para HOMOLOG_URL em vez de ir para o NATS
