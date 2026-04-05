---
name: obsidian-vault
description: Gerencia o vault Obsidian do ChatFunnel — navega indices, cria/edita wikis, processa raw, mantem wikilinks e grafo de conhecimento. Ativa quando mencionar vault, wiki, knowledge base, obsidian, documentar, raw, daily, gotcha, decisao, ADR.
---

# Obsidian Vault — ChatFunnel Knowledge Base

Skill para gerenciar o vault Obsidian em `vault/`.

## Quando ativar

- Usuario menciona: vault, wiki, obsidian, documentar, knowledge base, raw, daily, gotcha, decisao, ADR
- Apos implementar/modificar feature — atualizar wiki correspondente
- Apos descobrir comportamento inesperado — criar gotcha
- Apos tomar decisao arquitetural — criar ADR em decisions/
- Quando houver conteudo novo em `vault/raw/` — oferecer processamento

## Navegacao

Sempre seguir: **Master Index → Topic Index → Artigo** (max 3 leituras).

```
vault/_index.md                    → Ponto de entrada
vault/wiki/features/_index.md      → Indice de features
vault/wiki/architecture/_index.md  → Indice de arquitetura
vault/wiki/layers/_index.md        → Indice de camadas tecnicas
vault/wiki/gotchas/_index.md       → Indice de gotchas
vault/decisions/                   → ADRs
vault/diary/                       → Daily notes
vault/raw/                         → Staging area
```

## Criar artigo wiki

1. Criar arquivo em `vault/wiki/{secao}/{nome}.md`
2. Usar frontmatter:
```markdown
---
title: Nome do Artigo
description: Uma linha
tags: [tag1, tag2]
related: ["[[outro-artigo]]"]
last_updated: YYYY-MM-DD
---
```
3. Usar `[[wikilinks]]` para conectar artigos relacionados
4. Atualizar `_index.md` da secao com nova entrada na tabela
5. Atualizar `vault/_index.md` se criar secao nova

## Criar gotcha

```markdown
---
title: Descricao curta do problema
description: O que acontece e por que e inesperado
tags: [gotcha, area-afetada]
severity: alta|media|baixa
related: ["[[feature-afetada]]"]
last_updated: YYYY-MM-DD
---

# Titulo

## O que acontece
Descricao do comportamento inesperado.

## Por que
Causa raiz.

## Workaround
Como contornar.
```

## Criar ADR (decisao)

```markdown
---
title: ADR — Titulo da Decisao
tags: [decisions, adr, area]
date: YYYY-MM-DD
status: active|superseded|deprecated
related: ["[[feature-relacionada]]"]
---

# ADR: Titulo

## Contexto
Por que essa decisao foi necessaria.

## Decisao
O que foi decidido.

## Alternativas consideradas
O que mais foi avaliado.

## Consequencias
Positivas e negativas.
```

## Processar raw → wiki

Quando houver arquivos em `vault/raw/` (exceto `.tracking-*.tmp` e `diary/`):

1. Ler o conteudo bruto
2. Identificar temas e secao do wiki (features, architecture, layers, gotchas)
3. Criar artigos estruturados com wikilinks
4. Atualizar indices
5. Perguntar ao usuario se pode remover o raw original

## Regras

- NUNCA adivinhar informacao — se nao sei, nao documento
- SEMPRE usar wikilinks para conectar artigos
- SEMPRE atualizar indices ao criar/remover artigos
- SEMPRE atualizar `last_updated` ao editar artigos
- Artigos devem ser concisos — preferir bullet points a paragrafos longos
- Nao duplicar informacao que esta no codigo — referenciar o arquivo fonte
