---
title: Text-to-SQL — Consultas em Linguagem Natural
description: Usar Claude para converter perguntas em linguagem natural para queries SQL no PostgreSQL do ChatFunnel
tags: [ai, text-to-sql, reports, claude-api, postgresql]
related: ["[[rag]]", "[[prompt-caching]]"]
last_updated: 2026-04-05
---

# Text-to-SQL — Consultas em Linguagem Natural

Referencia: [claude-cookbooks/capabilities/text_to_sql](https://github.com/anthropics/claude-cookbooks/tree/main/capabilities/text_to_sql)

## O que e

Gerar queries SQL a partir de perguntas em linguagem natural. O Claude recebe o schema do banco e a pergunta, e retorna a query.

## Aplicacao no ChatFunnel

Interface de relatorios onde o usuario pergunta:
- "Quantos atendimentos tivemos ontem?"
- "Qual o tempo medio de resposta por operador?"
- "Quais contatos nao responderam nos ultimos 7 dias?"
- "Top 10 motivos de contato este mes"

## Arquitetura

```
Pergunta do usuario
    ↓
[System prompt com schema do banco + regras]
    ↓
[Claude gera SQL]
    ↓
[Validar SQL (sanitizar, read-only)]
    ↓
[Executar no PostgreSQL (READ ONLY)]
    ↓
[Formatar resultado para o usuario]
```

## Implementacao

```typescript
const generateSQL = async (question: string) => {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    system: `Voce e um assistente que gera queries PostgreSQL.
Schema relevante:
${databaseSchema}

Regras:
- APENAS SELECT (nunca INSERT, UPDATE, DELETE)
- SEMPRE filtrar por "accountId" = $1
- Usar aspas duplas para nomes de coluna com camelCase
- Responda APENAS com a query SQL, sem explicacao`,
    messages: [{ role: "user", content: question }]
  })
  return response.content[0].text
}
```

## Seguranca (CRITICO)

- **READ-ONLY** — conexao com usuario de banco read-only, sem permissao de escrita
- **Sanitizar** — validar que a query e SELECT antes de executar
- **accountId obrigatorio** — SEMPRE injetar filtro de accountId (multi-tenancy)
- **Timeout** — limitar tempo de execucao da query (ex: 5 segundos)
- **Whitelist de tabelas** — so permitir queries nas tabelas do modulo de reports
- **Rate limit** — limitar quantidade de queries por usuario/minuto

## Tecnicas do Cookbook

- **Self-improvement** — se a query falhar, devolver o erro para o Claude corrigir
- **RAG de exemplos** — manter exemplos de perguntas → SQL para few-shot
- **Schema pruning** — enviar apenas tabelas/colunas relevantes (nao o schema inteiro)

## Onde integrar

- **chatfunnel-front** — interface de reports com input de linguagem natural
- **chatfunnel-services** — endpoint que recebe pergunta, gera SQL, executa, retorna
- **Futuro** — chatbot admin que responde perguntas sobre metricas via WhatsApp
