---
title: Code Review Graph — Knowledge Graph para Code Review
description: Como usar o code-review-graph para analise de impacto, blast radius e reviews mais inteligentes no ChatFunnel.
tags: [guides, tooling, code-review, mcp]
created: 2026-04-12
updated: 2026-04-14
---

# Code Review Graph

O **code-review-graph** e um knowledge graph local que indexa todo o codebase usando Tree-sitter e expoe ferramentas via MCP para o Claude Code. Em vez de reler o projeto inteiro a cada tarefa, o Claude consulta o graph e recebe apenas o contexto relevante.

**Repo**: [tirth8205/code-review-graph](https://github.com/tirth8205/code-review-graph)
**Versao instalada**: 2.3.2
**Tipo**: MCP Server (stdio) + CLI
**Linguagens**: 23 (JS, TS, TSX, Vue, Go, Python, Zig, PowerShell, Julia, Svelte, Rust, Java, C#, Ruby, Kotlin, Swift, PHP, Solidity, C/C++, Dart, R, Perl, Lua)

## Quem usa isso?

**O Claude usa. Voce nao precisa fazer nada.**

O graph e uma ferramenta interna do Claude Code. Ele roda em background como MCP server e o Claude consulta automaticamente quando precisa entender dependencias, blast radius ou contexto para reviews. Voce continua pedindo as coisas naturalmente — a diferenca e que as respostas ficam mais precisas.

### O que muda na pratica

| Sem graph | Com graph |
|---|---|
| Claude le arquivos um por um ate entender o impacto | Graph retorna blast radius em milissegundos |
| Voce diz "review esse PR" e ele le tudo | Ele le so os arquivos afetados + dependentes |
| Token context gastos em arquivos irrelevantes | ~6.8x reducao de tokens em reviews, ate 49x em tarefas diarias |
| Sem visao de dependencias cross-repo | Registry multi-repo com aliases |

## Arquitetura no ChatFunnel

```
Chatfunnel/                          # Workspace root
├── .mcp.json                        # MCP server config (python -m code_review_graph serve)
├── .code-review-graphignore         # Exclusoes globais
├── chatfunnel-front/
│   └── .code-review-graph/graph.db  # Graph do front (1012 files, 4299 nodes)
├── chatfunnel-api/
│   └── .code-review-graph/graph.db  # Graph da API (617 files, 1740 nodes)
├── chatfunnel-services/
│   └── .code-review-graph/graph.db  # Graph dos services (605 files, 2418 nodes)
└── ... (10 repos registrados)
```

Cada sub-repo tem seu proprio `graph.db`. Todos estao registrados no **multi-repo registry** com aliases curtos.

## Repos registrados

| Alias | Repo | Files | Nodes | Edges |
|---|---|---|---|---|
| `front` | chatfunnel-front | 1,012 | 4,299 | 20,987 |
| `services` | chatfunnel-services | 605 | 2,418 | 8,726 |
| `api` | chatfunnel-api | 617 | 1,740 | 7,481 |
| `core` | chatfunnel-core | 194 | 1,254 | 3,934 |
| `mcp` | chatfunnel-mcp | 68 | 390 | 2,530 |
| `gateway` | chatfunnel-gateway | 19 | 57 | 341 |
| `external-api` | chatfunnel-external-api | 56 | 83 | 198 |
| `worker-broadcast` | chatfunnel-worker-broadcast | 12 | 37 | 195 |
| `scheduler` | chatfunnel-scheduler | 6 | 25 | 81 |
| `websocket` | chatfunnel-websocket | 4 | 10 | 53 |

---

## Tutorial: Como usar

### 1. Pedir coisas naturalmente

Voce nao precisa saber os nomes das tools. So peca o que precisa e o Claude decide quando usar o graph:

| Voce pede... | O que acontece internamente |
|---|---|
| "Quais arquivos sao impactados se eu mudar o `ContactsService`?" | `get_impact_radius` — blast radius |
| "Review as mudancas do ultimo commit no chatfunnel-front" | `get_review_context` — contexto otimizado |
| "Encontre todas as funcoes que chamam `useAuthStore`" | `semantic_search_nodes` — busca estrutural |
| "Mostre o mapa de dependencias do modulo de pagamento" | `get_flow` — fluxo de dependencias |
| "Faz um pre-merge check da branch feature/payment-v2" | `detect_changes` + `get_impact_radius` |
| "Quero entender a arquitetura do chatfunnel-services" | `get_architecture_overview` |
| "Quais sao os hotspots arquiteturais do front?" | `get_hub_nodes` — nos mais conectados |
| "Onde estao os gargalos do chatfunnel-services?" | `get_bridge_nodes` — chokepoints |
| "Tem algo sem teste ou isolado no core?" | `get_knowledge_gaps` — lacunas estruturais |
| "Tem acoplamento inesperado entre repos?" | `get_surprising_connections` — coupling anomalo |
| "Gera perguntas de review para esse PR" | `get_suggested_questions` — review automatizado |
| "Navega as dependencias a partir do AuthController" | `traverse_graph` — BFS/DFS com token budget |

### 2. Slash Commands (atalhos)

| Comando | Descricao |
|---|---|
| `/code-review-graph:build-graph` | Build ou rebuild do graph |
| `/code-review-graph:review-delta` | Review das mudancas desde o ultimo commit |
| `/code-review-graph:review-pr` | Review completo de PR com blast-radius |

### 3. Analise de arquitetura (novo na v2.3.2)

As 6 novas tools de analise permitem entender a saude do codebase:

#### Hub Nodes — Hotspots arquiteturais
> "Quais sao os arquivos mais conectados do chatfunnel-front?"

Retorna os nos com mais conexoes — sao os que, se quebrarem, afetam mais coisas. Uteis para priorizar testes e reviews.

#### Bridge Nodes — Gargalos (chokepoints)
> "Onde estao os pontos de estrangulamento do chatfunnel-services?"

Usa betweenness centrality para encontrar nos que sao "pontes" entre comunidades. Se um bridge node quebra, partes do sistema ficam desconectadas.

#### Knowledge Gaps — Lacunas
> "Tem areas mal cobertas no chatfunnel-core?"

Identifica:
- Nos isolados (sem dependentes)
- Hotspots sem testes
- Comunidades muito finas (poucos membros)
- Fraquezas estruturais

#### Surprising Connections — Acoplamento anomalo
> "Tem dependencias estranhas entre modulos?"

Detecta edges inesperados:
- Cross-community (modulo A depende de algo interno do modulo B)
- Cross-language (Go chamando TypeScript, etc.)
- Periferia conectada a hub sem razao obvia

#### Suggested Questions — Perguntas de review automaticas
> "Gera perguntas de review para as mudancas desse PR"

Analisa o graph e gera perguntas priorizadas baseadas em bridges, hubs e surprises afetados pelas mudancas.

#### Traverse Graph — Navegacao livre
> "Navega 3 niveis de dependencia a partir do PaymentService"

BFS ou DFS a partir de qualquer no, com depth e token budget configuraveis. Util para explorar cadeias de dependencia sem estourar contexto.

### 4. Edge Confidence (novo na v2.3.2)

Cada edge (conexao) agora tem um nivel de confianca:

| Nivel | Significado | Exemplo |
|---|---|---|
| **EXTRACTED** | Parseado diretamente do codigo | `import { foo } from './bar'` |
| **INFERRED** | Deduzido por convencao | NestJS module importa service pelo nome |
| **AMBIGUOUS** | Possivel mas incerto | Dynamic import, string-based reference |

Quando o Claude reporta blast radius, edges ambiguos sao sinalizados para voce decidir se sao relevantes.

### 5. Export (novo na v2.3.2)

Exporte o graph em diferentes formatos:

```bash
# Visualizacao interativa no browser (D3.js)
cd chatfunnel-front && code-review-graph visualize

# GraphML para Gephi/yEd
cd chatfunnel-front && code-review-graph visualize --format graphml

# Neo4j Cypher queries
cd chatfunnel-front && code-review-graph visualize --format cypher

# Obsidian vault com wikilinks
cd chatfunnel-front && code-review-graph visualize --format obsidian

# SVG estatico
cd chatfunnel-front && code-review-graph visualize --format svg
```

### 6. Graph Diff (novo na v2.3.2)

Compare snapshots do graph ao longo do tempo para ver o que mudou:
- Novos nos e edges adicionados
- Nos e edges removidos
- Mudancas em comunidades

Util para entender como o codebase evoluiu entre releases ou sprints.

### 7. Memory Loop (novo na v2.3.2)

O graph pode persistir resultados de Q&A como markdown, que sao re-ingeridos no graph. Isso significa que perguntas feitas ao Claude sobre o codebase enriquecem o graph ao longo do tempo.

### 8. Token-Efficient Output (`detail_level`)

8 tools aceitam `detail_level="minimal"` para output ultra-compacto (80-150 tokens vs 500+). **40-60% reducao** no consumo de tokens. Tools afetadas:
- `query_graph`
- `get_impact_radius`
- `semantic_search_nodes`
- `detect_changes`
- `get_review_context`
- `list_communities`
- `list_flows`

---

## Grep vs Graph: qual a diferenca?

| | Grep | Graph |
|---|---|---|
| **O que faz** | Procura uma string nos arquivos | Analisa o grafo de imports/exports/chamadas |
| **Resultado** | Quem menciona o nome | Quem quebra se voce mudar |
| **Profundidade** | Superficial (1 nivel) | Profunda (N hops de dependencia) |
| **Exemplo** | `ContactsService` → 5 arquivos | `ContactsService` → 38 arquivos em cadeia |

O graph entende a estrutura do NestJS (modules importam modules, que injetam services, que chamam outros services). Grep so encontra texto.

---

## 28 MCP Tools — Referencia completa

| Tool | Descricao |
|---|---|
| `build_or_update_graph_tool` | Build ou update incremental do graph |
| `get_minimal_context_tool` | Contexto ultra-compacto (~100 tokens) — chamado primeiro |
| `get_impact_radius_tool` | Blast radius de arquivos alterados |
| `get_review_context_tool` | Contexto otimizado para review com resumo estrutural |
| `query_graph_tool` | Callers, callees, tests, imports, heranca |
| `traverse_graph_tool` | BFS/DFS a partir de qualquer no com token budget |
| `semantic_search_nodes_tool` | Busca entidades por nome ou semantica |
| `embed_graph_tool` | Embeddings vetoriais para busca semantica |
| `list_graph_stats_tool` | Estatisticas e saude do graph |
| `get_docs_section_tool` | Secoes de documentacao |
| `find_large_functions_tool` | Funcoes grandes (candidatas a refactor) |
| `get_flow_tool` | Fluxos de execucao a partir de entry points |
| `list_communities_tool` | Comunidades de codigo detectadas |
| `get_community_tool` | Detalhes de uma comunidade |
| `get_architecture_overview_tool` | Overview arquitetural via comunidades |
| `detect_changes_tool` | Analise de impacto risk-scored para review |
| `get_hub_nodes_tool` | Hotspots arquiteturais (mais conectados) |
| `get_bridge_nodes_tool` | Chokepoints via betweenness centrality |
| `get_knowledge_gaps_tool` | Fraquezas estruturais e hotspots sem teste |
| `get_surprising_connections_tool` | Acoplamento inesperado cross-community |
| `get_suggested_questions_tool` | Perguntas de review auto-geradas |
| `refactor_tool` | Preview de rename, dead code, sugestoes |
| `apply_refactor_tool` | Aplica refactoring previamente sugerido |
| `generate_wiki_tool` | Wiki markdown a partir de comunidades |
| `get_wiki_page_tool` | Pagina especifica da wiki gerada |
| `multi_repo_search_tool` | Busca cross-repo no registry |
| `register_repo_tool` | Registra repo no multi-repo registry |
| `list_repos_tool` | Lista repos registrados |

---

## CLI — Referencia completa

```bash
# Setup
code-review-graph install                      # Auto-detecta e configura todas as plataformas
code-review-graph install --platform claude-code  # Configura so o Claude Code

# Build e update
code-review-graph build            # Parse completo do codebase
code-review-graph update           # Update incremental (so arquivos alterados)
code-review-graph status           # Estatisticas do graph
code-review-graph watch            # Auto-update ao salvar arquivos

# Visualizacao e export
code-review-graph visualize                    # HTML interativo (D3.js)
code-review-graph visualize --format graphml   # Export GraphML
code-review-graph visualize --format svg       # Export SVG
code-review-graph visualize --format obsidian  # Export Obsidian vault
code-review-graph visualize --format cypher    # Export Neo4j Cypher

# Analise
code-review-graph wiki             # Gera wiki markdown das comunidades
code-review-graph detect-changes   # Analise de impacto risk-scored

# Multi-repo
code-review-graph register <path>  # Registra repo
code-review-graph unregister <id>  # Remove repo
code-review-graph repos            # Lista repos registrados

# Avaliacao
code-review-graph eval             # Benchmarks de avaliacao

# MCP server
code-review-graph serve            # Inicia MCP server (stdio)
```

---

## Manutencao do graph

### Quando atualizar

| Situacao | Comando |
|---|---|
| Alterou poucos arquivos | `code-review-graph update` (incremental) |
| Mudou branch com muitas diferencas | `code-review-graph build` (rebuild) |
| Adicionou novo sub-repo | `build` + `register` |
| Quer rebuild total de todos | Loop nos repos |

Ou simplesmente peca ao Claude: "Atualiza o graph do chatfunnel-front"

### Exclusoes (.code-review-graphignore)

O arquivo `.code-review-graphignore` na raiz define o que NAO e indexado:

- `node_modules/` — dependencias
- `dist/`, `dist2/` — build outputs
- `vault/` — knowledge base (markdown, nao codigo)
- `.claude/` — config do Claude Code
- Assets binarios (`.png`, `.svg`, `.woff`, etc.)
- `.env*` — variaveis de ambiente
- `package-lock.json`, `pnpm-lock.yaml` — lock files
- `*.pen` — arquivos Pencil (design)

### Troubleshooting

**MCP nao conecta apos restart:**
- Verificar `.mcp.json` — comando deve ser `python` com args `["-m", "code_review_graph", "serve"]`
- Testar manualmente: `python -m code_review_graph --version`

**Graph desatualizado:**
- Rodar `code-review-graph update` no repo afetado

**Poucos arquivos indexados:**
- O tool usa `git ls-files` — so indexa arquivos tracked pelo git
- Arquivos untracked nao aparecem no graph

**graph.db muito grande:**
- Normal para repos grandes. O front tem ~48MB. E local e rapido.

---

## Complementa (nao substitui)

| Ferramenta | Funcao |
|---|---|
| **code-review-graph** | Selecao de contexto — quais arquivos importam |
| **Skill code-review** | Logica de review — qualidade, patterns, best practices |
| **Skill vue-standards** | Patterns Vue especificos — composables, stores, performance |
| **ESLint + Prettier** | Linting e formatacao automaticos |
| **Vitest + Playwright** | Testes automatizados |

O graph alimenta contexto melhor para todas as outras ferramentas.
