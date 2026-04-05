---
title: ADR-002 — Separar NestJS Services do Express API
tags: [decisions, adr, backend, architecture]
date: 2026-04-05
status: active
related: ["[[inter-service-communication]]", "[[auth-flow]]"]
---

# ADR-002: Separar NestJS Services do Express API

## Contexto

A API Express original (chatfunnel-api) cresceu organicamente com muita logica de negocio misturada. JavaScript puro sem tipagem forte, Bull para filas, padroes inconsistentes.

## Decisao

Criar um novo servico **chatfunnel-services** em NestJS + TypeScript para funcionalidades novas e mais complexas (agentes IA, integrações, CRM avancado). A API Express continua para funcionalidades existentes.

## Alternativas consideradas

- **Reescrever a API Express inteira em NestJS** — descartado pelo risco e tempo; o sistema esta em producao
- **Adicionar TypeScript na API Express** — descartado porque o codebase JS e muito grande e o pattern de Commands nao mapeia bem para NestJS modules
- **Manter tudo no Express** — descartado pela falta de estrutura para features complexas (IA, MCP)

## Consequencias

- **Positivas:** TypeScript strict, NestJS modules/DI, Swagger automatico, melhor testabilidade, SWC para builds rapidos
- **Negativas:** Dois backends (portas 3001 e 3200), front precisa de duas instancias Axios (Api e NestApi), auth inter-servico via secrets
- **Regra:** Novas features complexas no Services, manutencao do existente na API
