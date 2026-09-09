---
title: Graphify — tutorial de uso
description: Operação dos knowledge graphs locais e do grafo global dos repos ChatFunnel.
tags: [ai-pattern, knowledge-graph, tooling]
created: 2026-04-20
last_updated: 2026-07-14
status: ativo
replaces: code-review-graph
---

# Graphify — tutorial de uso

Knowledge graph on-device dos 12 repos do ChatFunnel. Substitui o `code-review-graph` arquivado.

## Instalação

```text
D:/Code/4-Vinicius/Chatfunnel/graphify-test/.venv/Scripts/graphify.exe
```

- Pacote: `graphifyy 0.9.15` (PyPI, MIT).
- Extras instalados: `sql`, necessário para as migrations do `chatfunnel-core`.
- Ambiente isolado: `graphify-test/.venv/`.

## Artefatos por repo

Cada sub-repo possui `graphify-out/`, ignorado pelo Git:

| Arquivo | Finalidade |
|---------|------------|
| `GRAPH_REPORT.md` | God nodes, communities, conexões e gaps |
| `graph.json` | Grafo consultado pelo CLI |
| `graph.html` | Visualização D3 para grafos com até 5.000 nós |
| `GRAPH_TREE.html` | Visualização alternativa para grafos grandes; usada no Front |
| `.graphify_analysis.json` | Metadados da extração e análise |

O `chatfunnel-front` possui mais de 11 mil nós e excede o limite padrão do `graph.html`; usar `GRAPH_TREE.html`, `GRAPH_REPORT.md` ou consultas CLI.

## Rebuild completo

A versão `0.9.0` alterou os IDs para incluir o caminho completo do arquivo. Grafos anteriores precisam de rebuild limpo; `update --force` pode preservar nós legados de extrações antigas.

```powershell
Remove-Item graphify-out -Recurse -Force
gf extract . --code-only
gf cluster-only . --no-label
```

Para o `chatfunnel-mcp`, a detecção pela raiz não classificou o corpus corretamente. O rebuild validado usa:

```powershell
gf extract src --code-only --out .
gf cluster-only . --no-label
```

## Workflow diário

Depois de editar código em um repo:

```powershell
gf update .
```

- Incremental e local, sem custo de API.
- Atualiza `graph.json`, relatório e visualização quando aplicável.
- Após grandes deleções ou refactors, usar `gf update . --force`.

## Exploração

```powershell
gf query "send whatsapp message broadcast" --budget 800
gf explain "Gateway()"
gf path "main()" "processMessage()"
gf affected "ContactsService" --depth 2
```

Ordem recomendada:

1. `GRAPH_REPORT.md` para visão arquitetural.
2. `query` para localizar conceitos.
3. `explain` para vizinhança de um nó.
4. `path` para cadeias entre nós.
5. Grep/Read apenas para conteúdo literal e leitura in loco.

## Grafo global

Os 12 grafos também estão registrados localmente em:

```text
C:/Users/lucas/.graphify/global-graph.json
```

Consultar relações cross-repo:

```powershell
gf global list
gf query "front AgentsV2Service services controller" `
  --graph C:/Users/lucas/.graphify/global-graph.json
```

Os IDs globais recebem namespace, por exemplo `chatfunnel-front::<local_id>`, e cada nó mantém o campo `repo`.

Para atualizar o registro após rebuild de um repo:

```powershell
gf global add graphify-out/graph.json --as chatfunnel-front
```

Trocar o valor de `--as` pelo nome do repo atual.

## Atalho recomendado

```powershell
function gf { & "D:\Code\4-Vinicius\Chatfunnel\graphify-test\.venv\Scripts\graphify.exe" @args }
```

## Decisões operacionais

- Manter um grafo isolado por repo e um grafo global local para consultas cross-repo.
- Não commitar `graphify-out/`; cada dev gera os artefatos localmente.
- Usar `.gitignore` como filtro do Graphify. Evitar `.graphifyignore` parcial, pois ela substitui o fallback da `.gitignore` e pode deixar de excluir secrets ou builds.
- Não instalar hooks por padrão. O fluxo continua manual com `gf update .` após alterações.
- Usar `--code-only` no rebuild determinístico; docs e mídia exigem uma etapa semântica separada.

## Cobertura validada em 2026-07-14

- 12 repos registrados no grafo global.
- Aproximadamente 25 mil nós e 40 mil relações globais.
- Parser SQL ativo para migrations do Core e Services.
- `chatfunnel-mobile`, `chatfunnel-websocket` e `chatfunnel-mcp` agora possuem cobertura normal do código.

## Links

- Repo upstream: [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify)
- Pacote: [graphifyy no PyPI](https://pypi.org/project/graphifyy/)
- Relacionado: [[llm-wiki-compiler]]
