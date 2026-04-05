---
title: ADR-003 — Adotar Mastra para agentes IA com memoria
tags: [decisions, adr, ai, agents, mastra]
date: 2026-04-05
status: active
related: ["[[ai-agents-architecture]]", "[[ai-agents]]"]
---

# ADR-003: Adotar Mastra para agentes IA com memoria

## Contexto

Os agentes IA do ChatFunnel precisavam de memoria persistente entre conversas, tool calling com MCP, e orquestracao multi-agente (A2A/Intelligence). O SDK da Anthropic sozinho nao oferece memoria nem orquestracao.

## Decisao

Adotar **Mastra** (`@mastra/core` + `@mastra/mcp` + `@mastra/memory` + `@mastra/pg`) para o modulo A2A (Intelligence). Manter o **Anthropic SDK direto** para agents-v2 (conversacionais simples). OpenAI como provider alternativo.

## Alternativas consideradas

- **LangChain** — descartado por ser muito opinado, bundle pesado, e abstrações demais para o caso de uso
- **Anthropic SDK puro para tudo** — descartado pela falta de memoria persistente e MCP nativo
- **Vercel AI SDK sozinho** — descartado por nao ter orquestracao multi-agente

## Consequencias

- **Positivas:** Memoria persistente em PostgreSQL, MCP tools nativos, orquestracao via meta-tools, working memory como scratchpad
- **Negativas:** Dependencia de lib relativamente nova (v1.7), monkey-patch de JSON.parse no main.ts para contornar bug, `@mastra/pg` adiciona outra conexao ao PostgreSQL
- **Regra:** Mastra para A2A (multi-agente com memoria), Anthropic SDK para agents-v2 (conversacional simples)
