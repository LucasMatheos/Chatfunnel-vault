---
title: Classification — Intent Detection e Categorizacao
description: Usar Claude para classificar mensagens, detectar intencao, categorizar leads e rotear atendimentos
tags: [ai, classification, intent-detection, claude-api]
related: ["[[tool-use-agents]]", "[[content-moderation]]"]
last_updated: 2026-04-05
---

# Classification — Intent Detection e Categorizacao

Referencia: [claude-cookbooks/capabilities/classification](https://github.com/anthropics/claude-cookbooks/tree/main/capabilities/classification)

## O que e

Usar Claude para classificar texto em categorias predefinidas. Especialmente util quando:
- Regras de negocio sao complexas e dificeis de codificar com regex/ML tradicional
- Existem poucos dados de treinamento (few-shot ou zero-shot)
- As categorias mudam com frequencia

## Aplicacoes no ChatFunnel

### 1. Intent Detection (mensagens recebidas)
Classificar a intencao do contato para routing automatico:
- `purchase_intent` — quer comprar/contratar
- `support_request` — precisa de ajuda/suporte
- `complaint` — reclamacao
- `information` — quer informacoes gerais
- `human_request` — quer falar com humano
- `greeting` — saudacao/inicio de conversa

### 2. Categorizacao de Leads
Classificar leads por temperatura/qualificacao:
- `hot` — pronto para comprar
- `warm` — interessado, precisa de nurturing
- `cold` — apenas pesquisando
- `unqualified` — fora do perfil

### 3. Routing por Departamento
Direcionar o atendimento para o departamento correto:
- Vendas, Suporte, Financeiro, Tecnico

### 4. Sentiment Analysis
Detectar sentimento para priorizar atendimentos urgentes/negativos.

## Pattern de Implementacao

```typescript
const classifyMessage = async (message: string, categories: string[]) => {
  const response = await client.messages.create({
    model: "claude-haiku-4-5",  // Haiku: rapido e barato para classificacao
    max_tokens: 50,
    system: `Voce e um classificador de mensagens. Responda APENAS com uma das categorias: ${categories.join(", ")}. Sem explicacao.`,
    messages: [{ role: "user", content: message }]
  })
  return response.content[0].text.trim()
}

// Uso
const intent = await classifyMessage(
  "Quero cancelar minha assinatura",
  ["purchase_intent", "support_request", "complaint", "cancellation", "information"]
)
// → "cancellation"
```

## Boas Praticas

- **Usar Haiku** para classificacao — e rapido (~200ms) e barato
- **Categorias claras e mutuamente exclusivas** — evitar ambiguidade
- **Few-shot examples** — incluir 2-3 exemplos no system prompt melhora acuracia
- **Structured output** — pedir JSON para facilitar parsing
- **Fallback** — ter categoria "other/unknown" para casos nao mapeados
- **Avaliar com Promptfoo** — o cookbook inclui scripts de avaliacao para medir acuracia
- **Cachear system prompt** — se classificar muitas mensagens, usar [[prompt-caching]]

## Integracao com Automacoes

A classificacao pode alimentar o engine de automacoes do ChatFunnel:
- Trigger `message_classified` → acao baseada na categoria
- Ex: intent=`cancellation` → transferir para retencao automaticamente
- Ex: sentiment=`negative` → priorizar na fila do livechat
