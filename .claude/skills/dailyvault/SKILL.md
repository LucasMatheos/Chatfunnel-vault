---
name: dailyvault
description: Consolida notas brutas do dia (vault/diary/raw/) em uma daily note Obsidian formatada. Use sempre que o usuario pedir para consolidar o dia, gerar resumo diario, ver worklog, ver o que foi feito hoje, montar daily, processar raw notes, ou qualquer variacao como "o que eu fiz hoje". Tambem ativa com /dailyvault. Funciona mesmo quando o usuario nao usa a palavra "daily" — se mencionou "resumo do dia", "o que rolou hoje", "meu progresso", use esta skill.
user_invocable: true
---

# Consolidar Daily do Dia

Transforma as notas brutas de tracking (geradas automaticamente por hooks) em uma daily consolidada para o vault Obsidian. A daily e um relatorio conciso do dia — o que foi feito, decisoes tomadas, bloqueios, e proximos passos.

## Passo 1 — Resolver data e localizar o raw

Se o usuario passou uma data (ex: `06-04-2026`, `06/04/2026`, `6 de abril`), use-a. Caso contrario:

```bash
date +%d-%m-%Y
```

Normalize para `DD-MM-AAAA` (com hifens). O raw fica em:

```
vault/diary/raw/{DD-MM-AAAA}.md
```

Se nao existir, informe:
> Nao encontrei notas brutas para {data}. Os hooks de tracking criam notas quando voce trabalha no projeto. Verifique `.claude/settings.json`.

Pare — nao gere daily vazia.

## Passo 2 — Entender o formato do raw

O raw e gerado automaticamente por hooks. Cada entrada e separada por `---` e segue esta estrutura (nem todos os campos estarao presentes):

```markdown
### HH:MM                          ← Horario da atividade

**Contexto:**                       ← Dialogo que levou ao pedido (opcional)
> **[HH:MM] Eu:** mensagem         ← O que o usuario disse
> **[HH:MM] Claude:** resposta     ← O que o assistente respondeu

**Tipo:** conversa                  ← Tipo da entrada (opcional, "conversa" = sem edits)

**Pedido:** o que foi pedido        ← A tarefa solicitada

**Resultado:** o que foi feito      ← Descricao do resultado

**Projeto:** nome-do-repo           ← Repo/projeto afetado (ex: chatfunnel-front)

**Arquivos:**                       ← Lista de arquivos modificados
- `caminho/do/arquivo`

**Comandos:**                       ← Comandos bash significativos (git, npm, etc.)
- `git commit -m "feat: ..."`

**Relacionado:**                    ← Wikilinks ja gerados pelo hook
- [[NomeDoLink]]
```

### Campos importantes

| Campo | Presente? | Uso na daily |
|-------|-----------|-------------|
| `### HH:MM` | Sempre | Horario da atividade |
| `**Tipo:**` | As vezes | "conversa" = turno sem edits (brainstorm, analise, decisao) |
| `**Pedido:**` | Quase sempre | O que o usuario quis fazer — base pra "O que fiz" |
| `**Resultado:**` | Quase sempre | O que foi feito — complementa "O que fiz" |
| `**Contexto:**` | As vezes | Dialogo pre-pedido — fonte de decisoes e contexto |
| `**Projeto:**` | Quase sempre | Qual repo/area — agrupa na secao Relacionado |
| `**Arquivos:**` | Quase sempre | Arquivos tocados — vai pra secao Arquivos |
| `**Comandos:**` | As vezes | Comandos bash significativos (git, npm, build) |
| `**Relacionado:**` | As vezes | Wikilinks prontos — preservar como estao |

### Particularidades

- O campo `**Contexto:**` contem o dialogo real entre usuario e Claude. E ouro para extrair decisoes ("optamos por X", "melhor usar Y"), bloqueios ("nao consegui", "deu erro"), e proximos passos ("depois faco X", "falta implementar Y").
- Wikilinks em `**Relacionado:**` agora apontam para notas reais (ex: `[[wiki/repos/chatfunnel-front|chatfunnel-front]]`). Preserve o formato com alias.
- O `**Projeto:**` as vezes e o nome do repo (ex: `chatfunnel-front`), as vezes e generico (ex: `chatfunnel`, `vault`). Normalize para o mais especifico disponivel.
- Entradas sem `**Pedido:**` podem ter apenas `**Contexto:**` — sao conversas exploratorias. Ainda vale incluir se algo relevante foi discutido.
- Entradas com `**Tipo:** conversa` sao turnos sem edits de arquivo (brainstorms, analises, decisoes). Trate-as como atividades de conversa/analise na secao "O que fiz".
- Entradas com `**Comandos:**` contém comandos bash significativos (git commit, npm run build, etc.). Mencione-os na atividade correspondente se relevantes.

## Passo 3 — Consolidar

### Template da daily

```markdown
---
date: {AAAA-MM-DD}
type: daily
tags:
  - daily
  - diary
  - {projeto-1}
  - {projeto-2}
aliases:
  - Daily {DD-MM-AAAA}
---

# Daily — {DD-MM-AAAA}

## Resumo
{2-4 frases. Narrativa do dia — que temas dominaram, o que avancou, o que ficou pendente. Linguagem direta.}

## Relacionado
{Wikilinks para notas REAIS do vault. Um por linha com bullet.}
- [[wiki/repos/chatfunnel-front|chatfunnel-front]]
- [[wiki/features/mcp-integration|MCP Integration]]

## O que fiz
{Lista cronologica. Formato: `- **HH:MM** — Descricao curta _(projeto)_`}

> [!tip] Decisoes
> {Decisoes extraidas do contexto/resultado. Se nenhuma: _Sem decisoes registradas._}

> [!warning] Bloqueios
> {Impedimentos encontrados. Se nenhum: _Sem bloqueios._}

> [!todo] Proximos passos
> {Acoes futuras explicitas. Se nenhum: _Sem proximos passos definidos._}

## Arquivos modificados
{Lista agrupada por projeto, com wikilinks para repos. Se nenhum: _Sem arquivos relevantes._}
```

### Guia de consolidacao

**Resumo** — Nao e lista, e narrativa. "Foquei na migracao do OrganizationForm e configuracao do MCP" e melhor que listar cada entrada. Mencione o arco do dia.

**O que fiz** — Cronologico, conciso. Agrupe entradas muito proximas sobre o mesmo tema (3 entradas consecutivas sobre MCP viram 1 linha). Formato:
```
- **07:25** — Implementou McpService.ts com 5 metodos _(chatfunnel-front)_
- **07:53** — Brainstorm do IntegrationsCard novo design system _(chatfunnel)_
- **08:03** — Criou ConfigureMcp.vue com novo DS _(chatfunnel-front)_
```

**Decisoes** — Extraia do `**Contexto:**` e `**Resultado:**`. Sinais: "optamos por", "melhor usar", "decidimos", "vamos com", "escolhemos". Exemplo do raw:
> `> **[07:55] Claude:** Recomendo a **B — Header com Ícone**`
> `> **[07:55] Eu:** SIm`

Isso e uma decisao: "Aprovado design B (Header com Icone) para IntegrationsCard".

**Bloqueios** — Algo que impediu progresso. Sinais: "nao funcionou", "erro", "Unknown skill", "travou". Do raw:
> `> **[07:05] Eu:** Unknown skill: codex:setup`

Isso e um bloqueio: "Plugin codex nao carregou apos instalacao — precisou recarregar sessao".

**Proximos passos** — Acoes futuras explicitas. Sinais: "depois faco", "falta implementar", "proximo", "pendente". Do raw:
> `**Pedido:** salva isso como task no vault [...] vou precisar fazer a integracao do mcp primeiro`

Isso e proximo passo: "Implementar integracao MCP antes de alterar IntegrationsCard".

**Arquivos modificados** — Agrupe por projeto com wikilink para o repo:
```
### [[wiki/repos/chatfunnel-front|chatfunnel-front]]
- `src/common/services/McpService.ts`
- `src/views/configuration/integrations/IntegrationsScreen.vue`

### [[wiki/repos/chatfunnel-mcp|chatfunnel-mcp]]
- `src/main.ts`
```

### Wikilinks e Tags

O raw agora gera dois tipos de referencia:
- **`**Relacionado:**`** — wikilinks para notas reais do vault (ex: `[[wiki/repos/chatfunnel-front|chatfunnel-front]]`)
- **`**Tags:**`** — hashtags para categorias sem nota (ex: `#brainstorm`, `#configuration`)

Na daily:
- **Secao "Relacionado"**: use APENAS wikilinks para notas que existem no vault. Consulte `vault/wiki/` para validar. Mapeamento dos repos:
  - `chatfunnel-front` → `[[wiki/repos/chatfunnel-front|chatfunnel-front]]`
  - `chatfunnel-api` → `[[wiki/repos/chatfunnel-api|chatfunnel-api]]`
  - `chatfunnel-services` → `[[wiki/repos/chatfunnel-services|chatfunnel-services]]`
  - `chatfunnel-mcp` → `[[wiki/repos/chatfunnel-mcp|chatfunnel-mcp]]`
  - Features: `[[wiki/features/mcp-integration|MCP Integration]]`, `[[wiki/features/organization-form|Organization Form]]`, etc.
- **Frontmatter tags**: adicione tags dos projetos tocados (ex: `chatfunnel-front`, `brainstorm`)
- **NUNCA** crie wikilinks para notas que nao existem — isso polui o graph view do Obsidian com ghost nodes

## Passo 4 — Escrever

Caminho: `vault/diary/{DD-MM-AAAA}-daily.md`

**Arquivo novo** — escreva completo.

**Arquivo existente** (usuario rodou `/dailyvault` antes no mesmo dia):
1. Leia a daily existente
2. Identifique entradas ja processadas (pelo horario em "O que fiz")
3. Adicione apenas novas entradas, preserve edicoes manuais
4. Atualize o Resumo se novas entradas mudarem significativamente o arco do dia
5. Nunca duplique atividades, arquivos ou wikilinks

A versao humana sempre tem prioridade — se o usuario editou um texto, preserve a edicao.

## Passo 5 — Reportar

Informe:
- Caminho do arquivo
- Entradas processadas (total e novas se merge)
- Projetos tocados
- Decisoes encontradas (se houver)
- Inconsistencias (nomes diferentes para mesmo projeto, entradas sem pedido, etc.)

## Regras

- **Fidelidade** — so use o que esta no raw. Secao vazia = o dia nao teve aquilo. Nao preencha com suposicoes.
- **Consistencia** — normalize nomes de projeto (escolha o mais especifico). Mencione inconsistencias.
- **7 secoes obrigatorias** — todas presentes, mesmo com placeholder.
- **Naming** — raw: `DD-MM-AAAA.md`, daily: `DD-MM-AAAA-daily.md`.
