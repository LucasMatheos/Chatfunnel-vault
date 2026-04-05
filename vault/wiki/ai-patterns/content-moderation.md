---
title: Content Moderation — Filtro de Conteudo
description: Usar Claude para filtrar e moderar conteudo de mensagens recebidas e enviadas
tags: [ai, moderation, safety, claude-api]
related: ["[[classification]]", "[[tool-use-agents]]"]
last_updated: 2026-04-05
---

# Content Moderation — Filtro de Conteudo

Referencia: [claude-cookbooks — building_moderation_filter](https://github.com/anthropics/claude-cookbooks/blob/main/anthropic_cookbook/misc/building_moderation_filter.ipynb)

## O que e

Usar Claude para analisar mensagens e detectar conteudo problematico antes de processar ou encaminhar.

## Aplicacao no ChatFunnel

### 1. Filtro de mensagens recebidas
- Detectar spam, phishing, conteudo ofensivo
- Proteger operadores de conteudo abusivo
- Alertar sobre tentativas de engenharia social

### 2. Filtro de mensagens enviadas (agentes IA)
- Garantir que o agente IA nao responda de forma inadequada
- Prevenir vazamento de dados sensiveis
- Garantir compliance com politicas do negocio

### 3. Filtro de conteudo de broadcast
- Validar templates antes do envio em massa
- Detectar conteudo que pode violar politicas do WhatsApp/Meta

## Implementacao

```typescript
interface ModerationResult {
  safe: boolean
  category: "safe" | "spam" | "offensive" | "phishing" | "sensitive_data" | "off_topic"
  confidence: number
  reason?: string
}

const moderateMessage = async (message: string): Promise<ModerationResult> => {
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 100,
    system: `Voce e um filtro de conteudo. Analise a mensagem e retorne JSON:
{"safe": boolean, "category": "safe"|"spam"|"offensive"|"phishing"|"sensitive_data"|"off_topic", "confidence": 0.0-1.0, "reason": "breve explicacao se unsafe"}
Responda APENAS com o JSON.`,
    messages: [{ role: "user", content: message }]
  })
  return JSON.parse(response.content[0].text)
}
```

## Camadas de Protecao

```
Mensagem recebida
    ↓
[1. Filtro rapido — regex/blocklist]     ← sem custo de API
    ↓
[2. Filtro Claude — analise semantica]   ← Haiku, ~200ms
    ↓
[3. Processamento normal]
```

- **Camada 1** pega o obvio (links maliciosos, palavras proibidas) sem custo
- **Camada 2** pega o sutil (sarcasmo, engenharia social, conteudo implicito)

## Boas Praticas

- **Haiku** — rapido e barato, suficiente para moderacao
- **Nao bloquear, flaggar** — marcar como suspeito e deixar operador decidir
- **Logs** — logar todas as decisoes de moderacao para auditoria
- **False positives** — ter mecanismo de override para operadores
- **Customizavel por account** — cada cliente pode ter regras diferentes
- **Cachear regras** — system prompt com regras e estavel → [[prompt-caching]]

## Onde integrar

| Ponto | Tipo | Modelo |
|-------|------|--------|
| Mensagem recebida (antes de processar) | Input filter | Haiku |
| Resposta do agente IA (antes de enviar) | Output filter | Haiku |
| Template de broadcast (antes de aprovar) | Content review | Sonnet |
