---
title: LLM Wiki Compiler (Karpathy Pattern)
description: Pattern de LLM como compilador de knowledge base — raw notes viram wiki estruturado automaticamente. Analise do projeto obsidian-llm-wiki-local e proposta de adaptacao pro vault ChatFunnel.
tags: [ai, patterns, knowledge-base, vault, research]
related: ["[[rag]]", "[[summarization]]", "[[classification]]"]
last_updated: 2026-04-17
source: https://github.com/kytmanov/obsidian-llm-wiki-local
---

# LLM Wiki Compiler

Pattern descrito por Andrej Karpathy em [The LLM Wiki](https://karpathy.ai/llmwiki): tratar notas brutas como **material-fonte**, nao como artefato final. O LLM compila as notas em wiki estruturado que cresce com o tempo.

> "The LLM doesn't just store what you tell it — it synthesizes, cross-references, and keeps everything current. You add raw material; it does the bookkeeping."

Implementacao de referencia: [`kytmanov/obsidian-llm-wiki-local`](https://github.com/kytmanov/obsidian-llm-wiki-local) (Python, MIT, 100% local via Ollama).

## Pipeline

```
raw/note.md
  │
  ▼ ingest (fast LLM 3B-8B)
  - le nota, extrai nomes de conceitos
  - escreve quality score + summary em state.db
  - cria wiki/sources/Note.md
  │
  ▼ compile (heavy LLM 7B-14B)
  - para cada conceito: agrega todas as raw notes que mencionam
  - injeta feedback de rejeicoes anteriores no prompt
  - gera artigo com [[wikilinks]] para conceitos relacionados
  - anota drafts com <!-- olw-auto: low-confidence --> se aplicavel
  - lanca em wiki/.drafts/
  │
  ▼ review
  - menu interativo: approve / reject / diff / edit
  - rejeicao armazena feedback para proximo compile
  - aprovacao strip anotacoes e publica em wiki/
  - git commit automatico
```

## Features-chave

- **Rejection feedback loop** — rejeitar draft com motivo injeta o motivo no proximo compile daquele conceito. Apos 5 rejeicoes sem approve, conceito e auto-bloqueado.
- **Selective recompile** — apos edicao de raw, so recompila conceitos ligados aquele source (nao o wiki inteiro).
- **Manual edit protection** — se artigo foi editado a mao, compile detecta e pula.
- **Source traceability** — cada artigo lista as raw notes que o geraram (backlinks).
- **Multi-language auto-detect** — ISO 639-1 por nota, artigo escrito no idioma predominante das sources.
- **Sem embeddings/vector DB** — usa `index.md` como routing layer. Simples ate ~100 notas.
- **SQLite** (`.olw/state.db`) guarda metadata, rejeicoes, conceitos bloqueados.
- **Provider-flexible** — Ollama (default), LM Studio, vLLM, Groq, Together, Azure OpenAI, qualquer endpoint OpenAI-compatible.

## Mapeamento para o vault ChatFunnel

| obsidian-llm-wiki | Vault atual | Status |
|---|---|---|
| `raw/*.md` | `vault/diary/raw/*.md` | existe (dumps diarios) |
| `wiki/Conceito.md` | `vault/wiki/features/`, `gotchas/`, `architecture/` | existe mas manual |
| `olw ingest` — extrai conceitos | Skill `dailyvault` consolida daily | parcial |
| `olw compile` — artigo por conceito | nao existe | faltando |
| Rejection feedback loop | nao existe | faltando |
| Selective recompile em file save | Hooks ja existem | poderia plugar |
| `state.db` + source traceability | so wikilinks manuais | faltando |

## Beneficios potenciais

1. **Automatizar o que hoje e manual** na skill `obsidian-vault` — leitura de raw, extracao de conceitos, criacao de wikilinks.
2. **Gotchas nao se perdem** — descoberta em sessao vai pro raw, pipeline extrai e cria/atualiza `gotchas/*.md` com source link.
3. **Knowledge compounding** — cada daily mencionando "StopAssistant" acumula em `wiki/features/stop-assistant.md` com backlinks para as sessoes.
4. **Controle de qualidade via rejection** — "muito generico, foca no fluxo BullMQ" converge drafts pro estilo do vault.
5. **Multi-language** resolve mistura PT/EN nas notas.

## Adaptacoes necessarias

- **Vocabulario fixo de conceitos** — o vault ja tem categorias (`features/`, `gotchas/`, `architecture/`, `repos/`, `ai-patterns/`). Extractor precisa classificar por secao, nao so por nome.
- **Frontmatter ChatFunnel** — prompt do compile precisa respeitar o padrao (`title`, `description`, `tags`, `related`, `last_updated`).
- **Integracao com `code-review-graph`** — compile poderia consultar o graph pra enriquecer artigos com callers/dependents reais. Diferencial enorme vs o projeto original.
- **Provider** — Ollama local (VRAM) ou Claude API via proxy OpenAI-compatible.
- **Complementar `dailyvault`, nao substituir** — daily continua consolidando; pipeline extrai conceitos dos dailies pra wiki.

## Riscos

- Dependencia de Ollama local ou API paga.
- Drafts ruins poluem `.drafts/` se nao houver revisao.
- State DB novo pra manter e versionar.
- Skill `obsidian-vault` atual cobre ~60% disso manualmente — ganho real aparece em escala (20+ raw files acumulados).

## Recomendacao

Prototipo seletivo, nao fork. Pegar 3 ideias-chave:

1. Pipeline `raw → draft → review` (sem sobrescrever wiki existente).
2. Rejection feedback injetado no prompt.
3. Source traceability via state DB (SQLite leve em `vault/.olw/`).

Plugar no vault existente sem quebrar estrutura. Validar com uma categoria primeiro (ex: `gotchas/`) antes de expandir.

## Referencias

- Karpathy — [The LLM Wiki](https://karpathy.ai/llmwiki)
- Repo — [kytmanov/obsidian-llm-wiki-local](https://github.com/kytmanov/obsidian-llm-wiki-local)
- Skill relacionada — `obsidian-vault` (gestao manual atual do vault)
- Skill relacionada — `dailyvault` (consolidacao de daily notes)
