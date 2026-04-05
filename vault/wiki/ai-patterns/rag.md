---
title: RAG — Retrieval Augmented Generation
description: Enriquecer respostas dos agentes IA com conhecimento externo (FAQs, catalogos, docs do cliente)
tags: [ai, rag, knowledge-base, claude-api, embeddings]
related: ["[[tool-use-agents]]", "[[prompt-caching]]"]
last_updated: 2026-04-05
---

# RAG — Retrieval Augmented Generation

Referencia: [claude-cookbooks/capabilities/retrieval_augmented_generation](https://github.com/anthropics/claude-cookbooks/tree/main/capabilities/retrieval_augmented_generation)

## O que e

Pattern onde, antes de chamar o Claude, o sistema busca documentos relevantes em uma base de conhecimento e os injeta no prompt como contexto. O modelo responde com base nesse contexto, reduzindo alucinacoes.

```
Mensagem do contato
    ↓
[Buscar docs relevantes no vector DB]
    ↓
[Montar prompt: system + docs + mensagem]
    ↓
[Claude gera resposta baseada nos docs]
    ↓
Resposta ao contato
```

## Aplicacao no ChatFunnel

### Knowledge Base por Account

Cada conta (account) do ChatFunnel pode ter sua propria knowledge base:
- FAQs do negocio
- Catalogo de produtos/servicos
- Politicas (troca, devolucao, garantia)
- Horarios de funcionamento
- Informacoes de contato

O agente IA busca nesses docs antes de responder, garantindo respostas precisas e atualizadas.

### Fluxo no chatfunnel-services

```
1. Contato envia mensagem
2. chatfunnel-services recebe via fila (BullMQ)
3. Embedding da mensagem (Voyage AI ou similar)
4. Busca top-K docs similares no vector store
5. Monta prompt: system + docs encontrados + historico + mensagem
6. Chama Claude com prompt enriquecido
7. Retorna resposta ao contato
```

## Estrategias de Retrieval

| Estrategia | Quando usar |
|-----------|-------------|
| **Semantic search** (embeddings) | Base grande, perguntas variadas |
| **Keyword search** (full-text) | Base pequena, termos especificos |
| **Hybrid** (semantic + keyword) | Melhor acuracia geral |
| **Tool-based** (Claude decide buscar) | Quando nem sempre precisa de contexto |

### Tool-based RAG (recomendado)

Em vez de sempre buscar docs, definir uma tool `search_knowledge_base` e deixar o Claude decidir quando precisa consultar:

```typescript
{
  name: "search_knowledge_base",
  description: "Busca informacoes na base de conhecimento da empresa. Usar quando o contato perguntar sobre produtos, precos, politicas, horarios ou qualquer informacao especifica do negocio.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Pergunta ou termos para buscar na base"
      }
    },
    required: ["query"]
  }
}
```

Vantagem: economiza tokens quando a conversa nao precisa de contexto externo (ex: saudacoes, perguntas genericas).

## Boas Praticas

- **Chunk size** — documentos divididos em chunks de 300-500 tokens
- **Overlap** — 50-100 tokens de overlap entre chunks para manter contexto
- **Metadata** — incluir titulo, secao, data no chunk para o Claude citar a fonte
- **Top-K** — retornar 3-5 docs mais relevantes (nao sobrecarregar o prompt)
- **Threshold** — descartar docs com similaridade baixa (< 0.7)
- **Cache** — [[prompt-caching]] no system prompt + tools; docs variam por mensagem
- **accountId** — SEMPRE filtrar docs pelo accountId (multi-tenancy)

## Stack sugerida

- **Embeddings:** Voyage AI (recomendado pela Anthropic) ou OpenAI ada-002
- **Vector store:** pgvector (ja temos PostgreSQL) ou Pinecone
- **Chunking:** LangChain text splitters ou implementacao custom
