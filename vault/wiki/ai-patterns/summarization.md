---
title: Summarization — Resumo de Conversas
description: Usar Claude para gerar resumos de conversas longas, util para operadores e historico de atendimento
tags: [ai, summarization, livechat, claude-api]
related: ["[[tool-use-agents]]", "[[prompt-caching]]"]
last_updated: 2026-04-05
---

# Summarization — Resumo de Conversas

Referencia: [claude-cookbooks/capabilities/summarization](https://github.com/anthropics/claude-cookbooks/tree/main/capabilities/summarization)

## O que e

Usar Claude para sintetizar conversas longas em resumos concisos. Pode ser aplicado em diferentes momentos e formatos.

## Aplicacoes no ChatFunnel

### 1. Resumo para operador (handoff)

Quando um agente IA transfere para um humano, gerar resumo do que foi discutido:

```typescript
const handoffSummary = await client.messages.create({
  model: "claude-haiku-4-5",
  max_tokens: 300,
  system: "Resuma a conversa abaixo em 3-5 bullet points para o operador que vai assumir o atendimento. Inclua: motivo do contato, o que ja foi tentado, e qual a expectativa do cliente.",
  messages: [{ role: "user", content: conversationHistory }]
})
```

### 2. Resumo pos-atendimento

Gerar resumo automatico ao fechar um chat para historico e CRM:
- O que o contato queria
- Como foi resolvido (ou nao)
- Proximos passos/follow-up

### 3. Resumo de conversas longas (compactacao)

Quando o historico de mensagens ultrapassa o limite de tokens, resumir mensagens antigas para manter contexto sem estourar o context window:

```typescript
// Ao atingir ~80% do context window:
const compactedHistory = await summarizeOlderMessages(messages.slice(0, -10))
// Usar: [resumo das msgs antigas] + [ultimas 10 msgs na integra]
```

### 4. Dashboard de reports

Gerar resumos agregados para gestores:
- "Resumo dos atendimentos do dia"
- "Principais reclamacoes da semana"
- "Temas mais frequentes"

## Tecnicas

### Extractive (rapido, barato)
Extrair as frases mais importantes da conversa. Bom para resumos curtos.

### Abstractive (melhor qualidade)
Claude reescreve um resumo original. Melhor para handoff e CRM.

### Hierarchical (conversas longas)
Dividir conversa em blocos → resumir cada bloco → resumir os resumos.

## Boas Praticas

- **Haiku para resumos simples** — rapido e barato para handoff e pos-atendimento
- **Sonnet para resumos analiticos** — quando precisa de insight (reports, tendencias)
- **Structured output** — pedir JSON com campos definidos (motivo, resolucao, sentimento)
- **Limitar tamanho** — definir max_tokens proporcional ao que se espera
- **Incluir instrucao de idioma** — "Resuma em portugues brasileiro"
- **Nao resumir conversas curtas** — se tem < 5 mensagens, nao precisa de resumo

## Onde integrar no ChatFunnel

| Trigger | Local | Modelo |
|---------|-------|--------|
| Transfer para humano | chatfunnel-services (agente IA) | Haiku |
| Chat fechado | chatfunnel-services (event listener) | Haiku |
| Compactacao de historico | chatfunnel-services (antes de chamar Claude) | Haiku |
| Report diario | chatfunnel-scheduler (job agendado) | Sonnet |
