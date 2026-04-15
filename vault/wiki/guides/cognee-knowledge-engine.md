---
title: Cognee — Motor de Memoria IA (referencia futura)
description: Analise do Cognee como knowledge engine para o vault. Decisao atual: nao instalar, reavaliar quando vault escalar.
tags: [guides, tooling, ai, knowledge-base, referencia-futura]
related: ["[[code-review-graph]]"]
last_updated: 2026-04-12
---

# Cognee — Motor de Memoria IA

**Repo**: [topoteretes/cognee](https://github.com/topoteretes/cognee)
**Licenca**: Apache 2.0 (open source)
**Stars**: ~15k
**Status no ChatFunnel**: Referencia futura — nao instalado

## O que faz

Motor de memoria persistente para IA. Ingere documentos, extrai entidades e relacoes, monta knowledge graph + embeddings vetoriais, e permite busca hibrida (semantica + estrutural).

```
Documentos → add() → cognify() → Knowledge Graph + Embeddings
                                         ↓
                              search() ← Graph traversal + Vector similarity
```

## Armazenamento (3 camadas)

| Camada | Local (dev) | Producao |
|---|---|---|
| Relacional (metadata) | SQLite | PostgreSQL |
| Vetorial (embeddings) | LanceDB | Qdrant, Pinecone |
| Grafo (relacoes) | Kuzu | Neo4j |

## Integracoes relevantes

- **MCP nativo** — pode integrar com Claude Code como MCP server
- **CLI** — `cognee-cli` com UI local
- **Python SDK** — `pip install cognee`
- Suporta PostgreSQL (ja usamos no ChatFunnel)

## Por que NAO instalar agora (2026-04-12)

| O que Cognee daria | O que ja temos | Gap real |
|---|---|---|
| Busca semantica no vault | Grep + wikilinks Obsidian | Vault tem ~50 notas, grep resolve |
| Knowledge graph de conceitos | [[code-review-graph]] (10 repos, 10k+ nodes) | Codigo ja mapeado |
| Relacoes automaticas entre docs | Wikilinks manuais | Funciona pro tamanho atual |
| Embeddings pra retrieval | context-pack + hooks SessionStart | Suficiente pro volume |

**Custo de instalar**:
- Python + venv + LLM API calls pra embeddings ($$)
- Mais um servico pra manter
- Re-indexar a cada update do vault
- Tokens extras no inicio de sessao

## Quando reavaliar

- Vault crescer pra **centenas de notas** (ADRs acumulados, sessoes, tech notes)
- Entrar mais gente no time e KB precisar ser "descobrivel"
- Busca por keyword (grep) nao escalar mais
- Precisar de RAG sobre historico de conversas/decisoes

## Alternativa mais leve

Plugin **Smart Search** do Obsidian — busca semantica local com embeddings, sem infra extra. Funciona so dentro do Obsidian (nao no Claude Code).

## Outro uso possivel (produto)

Cognee pode ser usado como **feature do ChatFunnel** — memoria persistente para os agentes IA (Mastra), RAG sobre conversas dos clientes, base de conhecimento interna dos atendentes. Avaliar quando o roadmap de IA avancar.
