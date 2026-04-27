---
tags: [ai-pattern, knowledge-graph, tooling]
created: 2026-04-20
status: ativo
replaces: code-review-graph
---

# Graphify — tutorial de uso

Knowledge graph on-device para os 9 repos do ChatFunnel. Substitui o `code-review-graph` (arquivado em `_archive/`).

## Onde está instalado

```
D:/Code/4-Vinicius/Chatfunnel/graphify-test/.venv/Scripts/graphify.exe
```

Pacote: `graphifyy 0.4.23` (PyPI, MIT). Python venv isolado em `graphify-test/`.

## O que cada repo tem

Depois do build, cada sub-repo ganha uma pasta `graphify-out/` (está no `.gitignore`):

| Arquivo | Para quê |
|---------|----------|
| `GRAPH_REPORT.md` | Resumo legível: god nodes, communities, surprising connections, knowledge gaps |
| `graph.json` | Grafo completo (nodes + edges) — consumido pelos comandos CLI |
| `graph.html` | Visualização interativa D3 (abre no browser) |
| `cache/` | Cache interno de AST (não mexer) |

## Workflow diário

### 1. Após editar código num repo

```bash
cd chatfunnel-front   # ou qualquer repo
"D:/Code/4-Vinicius/Chatfunnel/graphify-test/.venv/Scripts/graphify.exe" update .
```

- Build incremental (1-10s dependendo do tamanho)
- Sem LLM, sem custo de API
- Atualiza `graph.json`, `graph.html`, `GRAPH_REPORT.md`

### 2. Explorar um repo desconhecido

Abra primeiro o `graphify-out/GRAPH_REPORT.md`. Ele te dá:
- **God nodes** (os mais conectados — suas abstrações centrais)
- **Communities** (clusters naturais de código)
- **Surprising connections** (dependências não-óbvias)
- **Knowledge gaps** (nodes isolados — suspeita de código morto ou edges faltando)

### 3. Buscar por conceito

```bash
"$GF" query "send whatsapp message broadcast" --budget 800
```

BFS traversal do grafo. Retorna nodes com `file:line` ordenados por relevância.

Opções:
- `--dfs` — DFS em vez de BFS
- `--budget N` — cap em tokens (default 2000)

### 4. Entender um node específico

```bash
"$GF" explain "Gateway()"
```

Mostra o node + todas as edges (calls, called-by, contains). Útil pra entender o "vizinhança" antes de abrir o arquivo.

### 5. Caminho entre dois nodes

```bash
"$GF" path "main()" "processMessage()"
```

Shortest path — ótimo pra rastrear call chains.

### 6. Visualização interativa

Abra `graphify-out/graph.html` no browser. D3 force-directed, clicável, colorido por community.

## Como o Claude Code usa

Cada sub-repo tem seção `## graphify` no seu `CLAUDE.md` que diz:
1. Antes de responder questões arquiteturais, ler `graphify-out/GRAPH_REPORT.md`
2. Se `graphify-out/wiki/index.md` existir, navegar por ele em vez dos arquivos crus
3. Depois de editar código, rodar `graphify update .`

Ou seja: o Claude **já é orientado automaticamente** a consultar o grafo antes do Grep/Read.

## Atalho recomendado

Para não digitar o path completo toda vez, adicione ao seu shell:

```bash
# Git Bash / WSL
alias gf='/d/Code/4-Vinicius/Chatfunnel/graphify-test/.venv/Scripts/graphify.exe'

# PowerShell (em $PROFILE)
function gf { & "D:\Code\4-Vinicius\Chatfunnel\graphify-test\.venv\Scripts\graphify.exe" @args }
```

Depois é só: `gf update .`, `gf query "..."`, etc.

## Comandos completos

| Comando | O que faz |
|---------|-----------|
| `gf update <path>` | Rebuild incremental do grafo |
| `gf watch <path>` | Rebuild automático ao detectar mudança de arquivo |
| `gf query "<q>"` | BFS traversal |
| `gf explain "<node>"` | Vizinhança de um node |
| `gf path "A" "B"` | Caminho mais curto |
| `gf cluster-only <path>` | Re-roda Leiden sem reparse (muda comunidades) |
| `gf add <url>` | Adiciona URL ao grafo (fetch + parse) |
| `gf benchmark` | Mede token reduction vs full-corpus |
| `gf hook install` | Instala git hooks (post-commit/post-checkout rebuildam) |

## Gotchas

- **Cada repo tem seu grafo isolado** — não há registry multi-repo. Para dependências cross-repo, consulte o `GRAPH_REPORT.md` de cada um separadamente.
- **`chatfunnel-websocket` só tem 10 nodes** — suspeita de que algum layout de pastas está fora do padrão. Se for usar esse repo seriamente, investigar `graphify-out/cache/` pra ver o que foi ignorado.
- **86% EXTRACTED, 14% INFERRED** — edges inferidas têm confidence 0.8, boas pra navegação mas não confiáveis pra refactor automático.
- **Não commitar `graphify-out/`** — já está no `.gitignore` dos 9 repos. Cada dev roda `gf update` localmente.

## Quando cair em Grep/Read

O grafo não é substituto completo. Use Grep/Read quando precisar de:
- Texto literal dentro de strings (ex: mensagens de erro, URLs)
- Comentários e docstrings
- Config/JSON/YAML (grafo só cobre código)
- Leitura completa de um arquivo (o grafo dá nodes + linhas, mas não o conteúdo)

## Links

- Repo upstream: [safishamsi/graphify](https://github.com/safishamsi/graphify)
- Site: [graphifylabs.ai](https://graphifylabs.ai)
- Archive do CRG (predecessor): `_archive/code-review-graph-2026-04-20/`
