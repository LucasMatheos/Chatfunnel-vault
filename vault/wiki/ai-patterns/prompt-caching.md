---
title: Prompt Caching
description: Tecnicas para cachear system prompts e tools na API Claude, reduzindo custo e latencia
tags: [ai, prompt-caching, claude-api, otimizacao]
related: ["[[tool-use-agents]]"]
last_updated: 2026-04-05
---

# Prompt Caching

Referencia: [Anthropic Docs — Prompt Caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)

## O que e

Mecanismo da API Claude que permite cachear partes do prompt entre requests. Conteudo cacheado custa ~90% menos em tokens de input e reduz latencia (sem reprocessamento).

## Por que importa para o ChatFunnel

Os agentes IA do ChatFunnel fazem muitas chamadas com:
- **System prompt identico** entre mensagens do mesmo agente
- **Tools identicas** entre todas as conversas de um agente
- **Contexto de knowledge base** que muda raramente

Sem caching, cada mensagem reprocessa todo esse conteudo. Com caching, so paga pelo que mudou (a mensagem nova).

## Como funciona

### Automatico (recomendado para multi-turn)

```typescript
const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  cache_control: { type: "ephemeral" },  // ← top-level
  system: agentSystemPrompt,
  tools: agentTools,
  messages: conversationHistory
})
```

O SDK automaticamente cacheia tudo ate o ultimo bloco cacheavel. Em conversas multi-turn, o historico anterior vira cache e so a mensagem nova e processada.

### Explicito (controle granular)

```typescript
const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  system: [
    {
      type: "text",
      text: systemPromptLongo,
      cache_control: { type: "ephemeral" }  // ← cache no system
    }
  ],
  tools: toolsComCacheNoUltimo,
  messages: conversationHistory
})
```

## Economia estimada

| Cenario | Sem cache | Com cache | Economia |
|---------|-----------|-----------|----------|
| System prompt 2k tokens × 50 msgs | 100k tokens input | ~10k tokens input | ~90% |
| Tools 1k tokens × 50 msgs | 50k tokens input | ~5k tokens input | ~90% |
| KB context 5k tokens × 50 msgs | 250k tokens input | ~25k tokens input | ~90% |

## Boas Praticas

- **Conteudo estavel no inicio** — system prompt e tools no comeco do request
- **Automatic caching para chat** — usar `cache_control` top-level em conversas multi-turn
- **Minimo 1024 tokens** para cache ser efetivo (overhead do cache)
- **TTL de 5 minutos** — cache expira apos 5 min sem uso; em chat ativo isso nao e problema
- **Monitorar cache hits** — response inclui `cache_creation_input_tokens` e `cache_read_input_tokens`

## Onde aplicar no ChatFunnel

1. **chatfunnel-services** — chamadas dos agentes IA (system prompt + tools + KB context)
2. **chatfunnel-api** — se usar Claude para classificacao/summarization de mensagens
3. **Qualquer endpoint** que chame a API Claude repetidamente com contexto estavel
