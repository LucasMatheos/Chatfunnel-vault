# Auditoria e Adequação do Vault ao Padrão LLM Wiki (Karpathy)

> **Para o Claude Code:** Este documento é a sua tarefa completa. Leia tudo, audite o vault atual, e aplique as mudanças necessárias automaticamente. Não me peça aprovação para cada passo — execute o plano e, ao final, me entregue um relatório do que foi feito.

---

## Contexto

Este vault Obsidian já existe e tem conteúdo, mas **não foi construído seguindo o padrão LLM Wiki de Andrej Karpathy**. Seu trabalho é auditá-lo, identificar lacunas, e refatorá-lo para seguir o padrão — preservando todo o conteúdo existente.

O vault é **multi-domínio** (vários temas convivem no mesmo vault). A estrutura precisa acomodar isso sem virar bagunça.

**Referência do padrão:** https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f

---

## Princípios não-negociáveis do padrão Karpathy

1. **Compilação, não recuperação.** O wiki é um artefato persistente que cresce e se cruza com o tempo. Não é RAG — não re-derivamos conhecimento a cada query.
2. **Separação raw/wiki.** Material-fonte vai em `raw/` (imutável). Páginas compiladas vão em `wiki/` (mantidas pelo LLM).
3. **O LLM mantém o wiki, o humano escolhe fontes e faz perguntas.** Eu não edito páginas wiki manualmente (ou raramente).
4. **Markdown puro + wikilinks.** Sem dependência de plugin proprietário para a estrutura central.
5. **Três operações:** `ingest`, `query`, `lint`.
6. **Append-only no log, immutável no raw, vivo no wiki.**

---

## Fase 1 — Auditoria (faça primeiro, sem modificar nada)

Antes de mudar qualquer coisa, escaneie o vault e produza um diagnóstico interno (você não precisa me mostrar agora — use para planejar). Verifique:

### 1.1 Estrutura de pastas
- [ ] Existe pasta `raw/` para material-fonte?
- [ ] Existe pasta `wiki/` para páginas compiladas?
- [ ] Existe `CLAUDE.md` na raiz com as regras do agente?
- [ ] Existe `wiki/index.md` (sumário global)?
- [ ] Existe `wiki/log.md` (log append-only)?
- [ ] Como o conteúdo atual está organizado? Liste as pastas top-level e quantos arquivos cada uma tem.

### 1.2 Conteúdo
- [ ] Quantos arquivos `.md` existem no total?
- [ ] Há mistura de fontes brutas (artigos colados, transcrições) com notas sintetizadas no mesmo lugar?
- [ ] Há frontmatter YAML padronizado nos arquivos? Qual schema?
- [ ] Quantos arquivos têm wikilinks `[[...]]`? Quantos estão órfãos (sem nenhum link entrando ou saindo)?
- [ ] Há tags? Estão consistentes ou explodidas?

### 1.3 Domínios
- Identifique os 3–7 domínios temáticos principais a partir do conteúdo existente. Liste-os.
- Para cada domínio, conte quantos arquivos pertencem a ele.

### 1.4 Saúde
- [ ] Links quebrados (apontando para arquivos inexistentes)
- [ ] Arquivos duplicados ou quase-duplicados
- [ ] Arquivos vazios ou stubs abandonados
- [ ] Imagens externas (URLs) que deveriam estar locais

---

## Fase 2 — Estrutura-alvo (multi-domínio)

Reorganize o vault para esta estrutura. Se já existir parte dela, integre — não recrie do zero.

```
vault/
├── CLAUDE.md                    ← regras operacionais (você cria)
├── README.md                    ← visão geral pra humanos
├── raw/                         ← material-fonte imutável
│   ├── <dominio-1>/
│   │   └── YYYY-MM-DD-titulo-fonte.md
│   ├── <dominio-2>/
│   └── ...
├── wiki/                        ← páginas compiladas (LLM mantém)
│   ├── index.md                 ← sumário global de todos os domínios
│   ├── log.md                   ← log append-only de operações
│   ├── <dominio-1>/
│   │   ├── _index.md            ← sub-índice do domínio
│   │   └── <conceito>.md
│   ├── <dominio-2>/
│   └── ...
└── attachments/                 ← imagens, PDFs originais, anexos
    └── <dominio>/
```

### Regras da reorganização

- **Não delete nada sem antes mover/copiar.** Se um arquivo não tem destino claro, coloque em `wiki/_inbox/` para revisão posterior.
- **Conteúdo bruto colado (artigos copiados, transcrições, prints de conversa) → `raw/<dominio>/`** com nome no formato `YYYY-MM-DD-titulo-curto.md`.
- **Notas sintetizadas, conceitos, resumos próprios → `wiki/<dominio>/`** com nome em kebab-case do conceito (ex.: `compilacao-vs-recuperacao.md`).
- **Mantenha os wikilinks funcionando.** Se renomear/mover, atualize todas as referências `[[...]]` em todo o vault.
- **Imagens e anexos → `attachments/<dominio>/`.** Atualize os caminhos.

---

## Fase 3 — Arquivos canônicos a criar

### 3.1 `CLAUDE.md` (na raiz)

Crie com este conteúdo, adaptando a lista de domínios para os que você identificar na auditoria:

```markdown
# CLAUDE.md — Regras do LLM Wiki

Este vault segue o padrão LLM Wiki de Andrej Karpathy.
Você é o agente que mantém o wiki. Eu sou o humano que escolhe fontes e faz perguntas.

## Domínios ativos
- <dominio-1>: <descrição curta>
- <dominio-2>: <descrição curta>
- ...

## Operações

### /ingest <caminho-ou-url>
1. Ler a fonte.
2. Salvar versão limpa em `raw/<dominio>/YYYY-MM-DD-<slug>.md` com frontmatter.
3. Identificar conceitos, entidades, claims.
4. Atualizar páginas existentes em `wiki/<dominio>/` ou criar novas.
5. Criar wikilinks bidirecionais com páginas relacionadas.
6. Marcar contradições explicitamente quando uma fonte conflita com o que já está no wiki.
7. Atualizar `wiki/<dominio>/_index.md` e `wiki/index.md` se necessário.
8. Adicionar entrada em `wiki/log.md`.

### /query <pergunta>
1. Ler `wiki/index.md` e o `_index.md` do(s) domínio(s) relevante(s).
2. Ler páginas wiki relevantes (NÃO os raws, salvo se a wiki for insuficiente).
3. Responder citando as páginas wiki como fonte ([[link]]).
4. Se a resposta não estiver no wiki, dizer explicitamente "isso ainda não está compilado" e oferecer ingerir uma fonte.

### /lint
1. Detectar wikilinks quebrados.
2. Detectar páginas órfãs (sem entrada nem saída).
3. Detectar duplicatas e quase-duplicatas (mesmo conceito em páginas diferentes).
4. Detectar contradições não marcadas.
5. Detectar páginas-stub (muito curtas, sem substância).
6. Verificar se `index.md` e `_index.md` refletem o conteúdo real.
7. Gerar relatório em `wiki/log.md` com data e propor correções.

## Frontmatter padrão para páginas `wiki/`
\`\`\`yaml
---
title: <título>
domain: <dominio>
type: concept | entity | summary | claim | person | event
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources: ["[[raw/<dominio>/YYYY-MM-DD-fonte]]"]
status: stub | draft | mature
tags: []
---
\`\`\`

## Frontmatter padrão para arquivos `raw/`
\`\`\`yaml
---
title: <título original>
domain: <dominio>
ingested: YYYY-MM-DD
source_url: <url ou "manual">
source_type: article | transcript | book-chapter | note | conversation
ingested_into: ["[[wiki/<dominio>/<pagina>]]"]
---
\`\`\`

## Regras absolutas
- NÃO edite arquivos em `raw/` depois de criados (são imutáveis).
- NÃO delete páginas wiki sem registrar em `log.md` o motivo.
- SEMPRE prefira atualizar uma página existente a criar uma nova sobre o mesmo conceito.
- SEMPRE crie wikilinks bidirecionais.
- SEMPRE preserve o histórico no `log.md` (append-only).
- Quando o usuário fizer uma pergunta sem comando, assuma `/query`.
```

### 3.2 `wiki/index.md`

Sumário global navegável. Liste todos os domínios com link para seus `_index.md`. Inclua estatísticas (nº de páginas por domínio, última atualização).

### 3.3 `wiki/log.md`

Append-only. Comece com:

```markdown
# Log de Operações

Registro append-only de todas as mutações do wiki.
Formato: `YYYY-MM-DD HH:MM | operação | descrição`

---

## YYYY-MM-DD HH:MM | bootstrap | Vault auditado e refatorado para padrão LLM Wiki
- <resumo do que mudou>
```

### 3.4 `wiki/<dominio>/_index.md` (um por domínio)

Sub-índice do domínio com lista das páginas, agrupadas por tipo (conceitos, pessoas, eventos, etc.).

---

## Fase 4 — Migração do conteúdo existente

Para cada arquivo `.md` atualmente no vault:

1. **Classifique:** é fonte bruta ou nota sintetizada?
   - Bruta = artigo colado, transcrição, screenshot textual, conversa salva → `raw/`
   - Sintetizada = conceito, resumo, mapa mental, definição própria → `wiki/`
   - Ambíguo → `wiki/_inbox/` para revisão

2. **Atribua domínio.** Use os domínios identificados na auditoria.

3. **Adicione frontmatter** seguindo os schemas do `CLAUDE.md`.

4. **Mova para o local correto** com nome padronizado.

5. **Atualize wikilinks** em todos os outros arquivos que referenciam este.

6. **Identifique conceitos extraíveis** das fontes brutas que ainda não viraram página wiki — crie-as.

---

## Fase 5 — Lint inicial

Depois da migração, rode um `/lint` completo e corrija o que for trivial automaticamente:

- Consertar wikilinks quebrados onde o destino é óbvio
- Mesclar duplicatas óbvias (mesma página com nomes diferentes)
- Adicionar wikilinks faltantes em conceitos que aparecem mencionados mas não linkados
- Marcar páginas-stub com `status: stub` no frontmatter

Coisas que **exigem julgamento** (não conserte sozinho, deixe relatado no log):
- Contradições reais entre fontes
- Decisão sobre fundir ou manter páginas similares
- Páginas que parecem fora de qualquer domínio existente

---

## Fase 6 — Relatório final

Ao terminar, me entregue:

1. **Resumo executivo** (5–10 linhas): o que estava errado, o que foi feito, estado final.
2. **Antes vs depois:** estrutura de pastas, contagens.
3. **Domínios identificados** e nº de páginas em cada.
4. **Pendências de julgamento humano** (a lista do final da Fase 5).
5. **Próximos 3 passos sugeridos** que eu deveria fazer manualmente para tirar mais valor do sistema.

---

## Restrições e tom

- Seja conservador: na dúvida entre mover ou deixar, mova para `_inbox/` e relate.
- Não invente conteúdo. Se uma página wiki precisa ser criada mas você não tem material suficiente, crie um stub com `status: stub` e link para as fontes que existem.
- Não use plugins proprietários do Obsidian na estrutura central — markdown puro + wikilinks.
- Preserve qualquer convenção pessoal minha que esteja funcionando bem (ex.: se eu tenho um padrão de tags consistente, mantenha).
- Faça commits git ao longo do processo, se houver repositório iniciado, com mensagens claras (`audit:`, `migrate:`, `lint:`).

Comece pela Fase 1 agora.
