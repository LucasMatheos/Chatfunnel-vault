---
title: Tutorial — Construindo um Vault de Conhecimento para um Projeto de Software
description: Passo a passo para montar uma knowledge base em Obsidian estilo ChatFunnel — estrutura, convencoes, fluxo de trabalho e integracao com Claude Code
tags: [tutorial, vault, obsidian, onboarding]
last_updated: 2026-04-15
---

# Tutorial — Construindo um Vault de Conhecimento

Este guia mostra, na ordem, como montar do zero um vault Obsidian igual ao que usamos no ChatFunnel. O objetivo e criar uma knowledge base **viva** que:

- Documenta features cross-repo, gotchas e decisoes (nao so o que o codigo ja diz).
- Serve de memoria entre sessoes de IA (Claude Code consulta antes de implementar).
- Permite navegar por grafo e links, nao por busca textual.

---

## 1. Por que um vault e nao um Notion/Confluence

- **Markdown local** — versionado no git junto do codigo, sem lock-in.
- **Wikilinks + grafo** — conexoes entre artigos emergem visualmente.
- **Offline-first** — funciona sem internet, busca instantanea.
- **Consumo por IA** — Claude le markdown nativo, zero parsing.

---

## 2. Ferramentas

1. [Obsidian](https://obsidian.md) — gratuito, desktop.
2. Plugins da comunidade (Settings > Community Plugins):
   - **Excalidraw** — diagramas editaveis versionados.
   - **Dataview** — queries SQL-like em notas.
   - **Omnisearch** — busca fuzzy forte.
   - **Mind Map** — visualizar heading trees.
   - **Icon Folder** — icones por pasta.
3. Plugins core (Settings > Core Plugins): Graph View, Backlinks, Daily Notes, Templates, Properties, Canvas.

---

## 3. Estrutura de pastas

Crie a pasta `vault/` na raiz do repo e dentro dela:

```
vault/
├── _index.md              ← Master Index (Claude le primeiro)
├── wiki/
│   ├── repos/             ← 1 artigo por repositorio (stack, patterns, gotchas do repo)
│   ├── features/          ← 1 artigo por feature de produto (cross-repo, end-to-end)
│   ├── architecture/      ← Fluxos e decisoes que envolvem varios repos
│   ├── gotchas/           ← Armadilhas cross-repo (infra, DB, integracao)
│   ├── ai-patterns/       ← Patterns de IA (tool use, RAG, classification)
│   ├── guides/            ← Guias passo a passo de implementacao
│   └── diagrams/          ← Excalidraw + Mermaid
├── decisions/             ← ADRs numerados: 001-*, 002-*, ...
├── diary/                 ← Daily notes (YYYY-MM-DD-daily.md)
├── diary/raw/             ← Notas brutas do dia — consolidadas depois
├── raw/                   ← Staging: cole aqui qualquer info solta
├── claude/
│   ├── context-pack.md    ← Estado atual injetado no SessionStart do Claude
│   └── handoff.md         ← Como retomar o trabalho (atualizado fim de sessao)
└── Excalidraw/            ← Canvas visuais
```

**Regra de ouro:** cada pasta tem um `_index.md` com tabela listando os artigos.

---

## 4. Frontmatter padrao

Todo artigo comeca com YAML:

```markdown
---
title: Nome do Artigo
description: Uma linha que explica o conteudo
tags: [area, tipo]
related: ["[[outro-artigo]]"]
last_updated: 2026-04-15
---

# Titulo

Conteudo em bullet points.
```

Para **gotcha** adicione `severity: alta|media|baixa`. Para **ADR** adicione `status: active|superseded|deprecated` e `date`.

---

## 5. Wikilinks e indices

- Conecte artigos com `[[nome-do-arquivo]]` — Obsidian gera grafo automatico.
- Use `[[path/arquivo|Texto exibido]]` para renomear o link.
- O `_index.md` de cada pasta e **obrigatorio** — lista todos os artigos da secao em tabela.
- O `vault/_index.md` e o ponto de entrada que aponta pros indices das secoes.

---

## 6. Fluxo de trabalho

### Capturar (rapido)
Durante o dia, jogue tudo em `vault/raw/` ou `vault/diary/raw/` sem se preocupar com formato.

### Processar (no fim do dia)
1. Leia os raws.
2. Identifique tema → escolha secao (`repos`, `features`, etc.).
3. Crie artigo estruturado com frontmatter + wikilinks.
4. Atualize o `_index.md` da secao.
5. Delete o raw (agora ja esta consolidado).

### Documentar decisoes
Toda escolha arquitetural vira ADR em `decisions/NNN-titulo.md` com: **Contexto, Decisao, Alternativas, Consequencias**.

### Daily notes
`vault/diary/DD-MM-AAAA-daily.md` — registro do que aconteceu no dia. Util para rastrear decisoes informais e bugs encontrados.

---

## 7. Integracao com Claude Code

Este e o diferencial. Dois arquivos em `vault/claude/`:

- **`context-pack.md`** — snapshot do estado atual (sprints, blockers, stack changes). E injetado no SessionStart para a IA ja comecar com contexto.
- **`handoff.md`** — atualizado ao final de cada sessao: "onde paramos, o que falta, proximo passo".

No `CLAUDE.md` do repo, adicione:

```markdown
## Knowledge Base
O vault Obsidian em `vault/` e a knowledge base do projeto.
- ALWAYS consulte o vault antes de implementar features.
- ALWAYS atualize o vault apos descobrir gotchas ou tomar decisoes.
```

Opcional: skill `obsidian-vault` em `.claude/skills/` para a IA seguir as convencoes automaticamente.

---

## 8. Regras de manutencao

- **NUNCA duplicar** informacao que ja esta no codigo — referenciar o arquivo fonte.
- **NUNCA adivinhar** — se nao sabe, nao documente.
- **SEMPRE** atualizar `last_updated` ao editar um artigo.
- **SEMPRE** atualizar o `_index.md` ao criar/remover artigos.
- **SEMPRE** preferir bullet points a paragrafos longos.

---

## 9. Checklist do primeiro dia

- [ ] Instalar Obsidian e abrir a pasta `vault/`.
- [ ] Instalar os 5 plugins listados em [Ferramentas](#2-ferramentas).
- [ ] Criar `_index.md` mestre e `_index.md` em cada secao do wiki.
- [ ] Criar 1 artigo de `repos/` para o repo principal.
- [ ] Criar 1 ADR (`decisions/001-stack-escolhida.md`) explicando por que a stack atual.
- [ ] Criar `claude/context-pack.md` com o estado atual do projeto.
- [ ] Commitar o vault junto do codigo.

---

## 10. Como medir que funciona

- Voce abre o grafo (Ctrl+G) e ve clusters — features conectadas aos repos, gotchas conectados as features.
- Um dev novo consegue responder "por que essa escolha?" lendo o ADR, nao perguntando.
- A IA (Claude Code) nao refaz perguntas que ja foram respondidas em sessoes anteriores.
- O `raw/` esta quase sempre vazio — sinal de que o processamento nao esta atrasado.

---

**Proximos passos:** comecar pela estrutura de pastas + 3 artigos seed (1 repo, 1 feature, 1 ADR). O resto cresce organicamente conforme o projeto evolui.
