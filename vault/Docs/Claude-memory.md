# Memória persistente entre sessões no Claude Code com um vault do Obsidian

## Objetivo e princípios de design

O problema central é que uma sessão nova do Claude Code começa com uma janela de contexto “limpa”, sem histórico de conversa anterior, o que força reexplicações constantes e aumenta o risco de inconsistências ao longo do tempo. citeturn11view1 Ao mesmo tempo, o Claude Code já foi desenhado para persistir informações por arquivos no sistema local (por exemplo: transcrições em JSONL para retomar sessões, instruções em `CLAUDE.md` e “auto memory” em Markdown). citeturn11view1turn5view0turn10view0

O **objetivo prático** deste desenho é criar uma camada de memória **entre sessões**, com estas propriedades:

- **Local-first e portátil**: dados em arquivos no disco (sem depender de um serviço externo para existir). Isso está alinhado com os princípios “local-first” (controle do usuário, preservação e operação offline). citeturn0search2turn0search6  
- **Auditável e editável por humanos**: tudo em Markdown e metadados em YAML (frontmatter), para leitura/edição direta e revisão por histórico (Git) se desejado. citeturn8search0turn1search0  
- **Baixo atrito operacional**: leitura automática do que importa no começo; escrita guiada no final; e mecanismos para reduzir “poluição” de contexto.

O **vault do Obsidian** é um encaixe natural porque ele armazena notas como **arquivos Markdown texto puro** dentro de um diretório local (“vault”), permite edição externa e atualiza o vault quando arquivos mudam fora do app. citeturn8search0turn8search16 Além disso, propriedades no Obsidian ficam em YAML no topo do arquivo, fáceis de parsear por scripts e fáceis de auditar. citeturn1search0

A chave de design aqui é: **memória não é sinônimo de “injetar tudo no contexto”**. O Claude Code tem janela de contexto finita; quando enche, há compactação/sumarização e parte do histórico perde detalhes. citeturn11view1turn11view0 Então, a arquitetura precisa de **camadas**: uma parte mínima sempre carregada (índices e regras), e detalhes acessados sob demanda (busca/leitura de notas específicas).

## Arquitetura prática recomendada

A arquitetura abaixo usa o próprio “modelo mental” que o Claude Code já emprega: **instruções persistentes + memória automática em Markdown + automações por hooks**. citeturn5view0turn12view0turn7view2 O vault do Obsidian vira o repositório central dessa memória.

### Componentes

**Camada de armazenamento (Obsidian Vault)**
- Diretório local com Markdown texto puro (“vault”). citeturn8search0  
- Metadados padronizados em YAML (frontmatter). citeturn1search0

**Camada de memória do Claude Code (filesystem-based)**
- `CLAUDE.md` (projeto/usuário/org): instruções persistentes carregadas no início da sessão. citeturn5view0turn11view1  
- `.claude/rules/*.md`: regras modulares, com opção de escopo por caminhos via frontmatter `paths:` (carrega apenas quando arquivos correspondentes entram em jogo). citeturn5view0turn11view0  
- **Auto memory**: diretório por projeto com `MEMORY.md` (índice conciso carregado toda sessão) e arquivos de tópico; tudo em Markdown editável. citeturn5view0turn10view0  
- Configuração via `settings.json` e hooks de ciclo de vida (SessionStart/SessionEnd etc.). citeturn7view0turn7view2

**Camada de orquestração (scripts + hooks)**
- Hooks `SessionStart` e `UserPromptSubmit` para **injetar contexto mínimo e relevante**, imprimindo texto em stdout (que vira contexto do Claude) ou usando `additionalContext`. citeturn12view0turn12view3  
- Hook `PostCompact` para salvar o resumo de compactação no vault (o evento fornece `compact_summary`). citeturn16search15turn11view0  
- Hook `SessionEnd` para “flush” rápido (com timeout curto por padrão). citeturn12view1turn16search15

**Camada de governança de conhecimento (índices, decisões, tarefas)**
- Um índice por projeto + registros de decisão (ADR) + backlog de tarefas + resumos de sessão.
- Uso intenso de links internos/backlinks para navegação e auditoria. citeturn14search28turn14search2

image_group{"layout":"carousel","aspect_ratio":"16:9","query":["Obsidian vault folder structure screenshot","Obsidian graph view screenshot","Claude Code terminal CLI screenshot"],"num_per_query":1}

### Fluxo de dados em alto nível

1) **Antes da sessão**: o vault contém memória curada (projeto/usuário/decisões/tarefas) e também pode conter o diretório de auto memory do Claude Code (ou um link para ele). citeturn5view0turn8search0  

2) **Início da sessão**:
- Claude Code carrega `CLAUDE.md`/rules e auto memory a partir do disco no startup. citeturn5view0turn11view0  
- Um hook `SessionStart` gera um **Context Pack** pequeno (por exemplo: objetivo atual, tarefas abertas, decisões recentes) e injeta isso como contexto. citeturn12view0turn7view2  

3) **Durante a sessão**:
- Claude consulta detalhes sob demanda (lendo notas específicas quando necessário), em vez de despejar o vault inteiro na janela de contexto. Isso é coerente com o desenho do auto memory: `MEMORY.md` é só índice, e arquivos de tópico são lidos quando necessário. citeturn5view0  

4) **Final/compactação**:
- Quando houver ` /compact` (manual ou automático), o Claude Code substitui a conversa por um resumo estruturado; parte do conteúdo “startup” é reinjetado do disco conforme as regras do mecanismo. citeturn11view0turn11view1  
- O hook `PostCompact` salva o `compact_summary` como “Resumo de Sessão” no vault, e um hook/skill atualiza tarefas e decisões. citeturn16search15turn7view2  

5) **Encerramento**:
- No `SessionEnd`, um script faz limpeza/atualizações rápidas (ou registra “ponte de retomada”). citeturn12view1turn16search15  

## Estrutura do vault e tipos de memória

### Estrutura de pastas sugerida

A estrutura abaixo separa: (a) memória global do usuário, (b) memória por projeto, (c) registros de sessão e (d) automações/templates. Ela foi pensada para ser simples, “grepável”, e funcionar bem mesmo fora do Obsidian (apenas via filesystem). citeturn8search0turn14search3

```text
ObsidianVault/
  00_System/
    Templates/
      tpl.session.md
      tpl.decision-adr.md
      tpl.tech-note.md
      tpl.project-index.md
      tpl.user-profile.md
    Schemas/
      memory-types.md
    Automations/
      cc_context_pack.py
      cc_post_compact_to_obsidian.py
      cc_memory_triage.py

  10_User/
    user.profile.md
    user.preferences.md
    user.conventions.md

  20_Projects/
    proj.acme-api/
      project.index.md
      project.charter.md
      project.context.md
      tasks.backlog.md
      decisions/
        ADR-2026-04-01-auth-strategy.md
        ADR-2026-04-05-logging.md
      tech/
        tech.stack.md
        tech.env-dev.md
        tech.architecture.md
        tech.testing.md
      sessions/
        2026/
          2026-04-11.session.md
          2026-04-12.session.md
      claude/
        context-pack.md
        handoff.md

  90_Archive/
    proj.legacy-*/...
```

### Tipos de memória e “para que servem”

A ideia é manter **poucos tipos**, com responsabilidades claras, para evitar duplicação.

**Memória de usuário (global)**
- Preferências de comunicação, estilo de código, ferramentas, atalhos e “não faça X”.  
- No Claude Code, isso tem correspondência direta com instruções de usuário e regras globais. citeturn5view0turn10view0  

**Memória de projeto**
- “O que sempre é verdade” do projeto: arquitetura, comandos de build/teste, padrões e warnings recorrentes. O próprio Claude Code recomenda usar `CLAUDE.md` para o que você repetiria toda sessão. citeturn3view0turn11view1  

**Decisões tomadas (ADR)**
- Decisões significativas com contexto e consequências. É uma prática conhecida de documentação leve de arquitetura (“Architecture Decision Records”). citeturn14search0turn14search4  

**Contexto técnico**
- “Como funciona” e “como mexer”: stack, convenções de API, modelo de dados, setup local, observabilidade, testes, etc.  
- Bom candidato a notas por tópico (para leitura sob demanda), semelhante ao auto memory separar `debugging.md`, `api-conventions.md`, etc. citeturn5view0  

**Tarefas em aberto**
- Backlog prático com status, próximos passos, links para ADRs e sessões.  
- Pode ser mantido em um único arquivo por projeto para facilitar “scan” rápido (e também para facilitar injeção no Context Pack).  

**Resumo de sessões anteriores**
- Registro leve do que foi feito, fatos gerados, decisões, pendências e “como retomar”.  
- O Claude Code preserva transcrições em JSONL localmente, mas isso não é uma memória curada; é mais um log de execução. citeturn11view1turn10view0  

**Convenções e preferências**
- Convenções “da casa”: nomenclatura, padrões de commit, definição de pronto, etc.  
- No Claude Code, recomenda-se manter instruções concisas e sem contradição, porque instruções conflitantes podem levar o modelo a escolher uma delas “arbitrariamente”. citeturn3view0  

### Links e busca como “mecanismo de recuperação”

Para funcionar como memória viva, o vault precisa ser fácil de navegar:

- Links internos permitem criar rede entre backlog → sessão → ADR → nota técnica. citeturn14search28turn1search2  
- Backlinks ajudam a “ver impacto” de uma decisão (quais tarefas/sessões apontam para o ADR). citeturn14search2  
- Busca do Obsidian (core plugin) oferece operadores para filtrar e recuperar informação rapidamente. citeturn14search3  

## Esquemas de naming e templates Markdown

### Naming scheme recomendado

Um bom naming scheme precisa otimizar: ordenação cronológica, unicidade e previsibilidade.

- **Projetos**: `proj.<slug>/` (ex.: `proj.acme-api`, `proj.mobile-app`)  
- **Sessões**: `YYYY-MM-DD.session.md` (um por dia) ou `YYYY-MM-DD--HHmm.session.md` (se você quiser múltiplas sessões/dia).  
- **Decisões (ADR)**: `ADR-YYYY-MM-DD-<slug>.md` (ou numeração sequencial se preferir). ADRs são definidos como registros de decisão com contexto e consequências. citeturn14search0turn14search1  
- **Notas técnicas**: `tech.<topico>.md`  
- **Arquivos “operacionais do Claude”**: dentro de `claude/` (ex.: `context-pack.md`, `handoff.md`), para diferenciar de conhecimento mais permanente.

Sugestão importante: use sempre uma propriedade `id` (UUID curto) nos templates relevantes. Isso simplifica deduplicação/merge em automações.

### Templates Markdown (prontos para copiar)

Abaixo, templates com YAML frontmatter (“Properties”) porque o Obsidian armazena propriedades em YAML no topo do arquivo. citeturn1search0 Se você usar o plugin core de Templates, dá para inserir variáveis de data/hora automaticamente no momento da criação. citeturn1search1

#### Template de perfil do usuário

```markdown
---
type: user_profile
id: user-profile
created: {{date}} {{time}}
updated: {{date}} {{time}}
---

# Perfil do usuário

## Preferências de interação
- Tom: direto e pragmático
- Estrutura: sempre propor plano + passos executáveis
- Quando houver trade-off: explicitar riscos

## Preferências técnicas (cross-project)
- Linguagens/stack preferidas:
- Estilo de código:
- Padrões de testes:
- Convenções de commit:

## Restrições e alertas
- Nunca armazenar segredos em notas
- Sempre apontar comandos reproduzíveis
```

#### Template de índice do projeto

```markdown
---
type: project_index
project: proj.acme-api
id: proj.acme-api.index
created: {{date}} {{time}}
updated: {{date}} {{time}}
---

# Índice do projeto: ACME API

## Objetivo atual (1–3 linhas)
## Links essenciais
- [[project.charter]]
- [[project.context]]
- [[tasks.backlog]]
- Pasta ADR: [[decisions/]]
- Pasta sessões: [[sessions/]]
- Pasta tech: [[tech/]]
- Claude: [[claude/context-pack]] | [[claude/handoff]]

## “Sempre verdadeiro” (curto)
- Comando de teste:
- Como rodar local:
- Regras de PR:
```

#### Template de memória/contexto do projeto (curado)

```markdown
---
type: project_context
project: proj.acme-api
id: proj.acme-api.context
created: {{date}} {{time}}
updated: {{date}} {{time}}
---

# Contexto do projeto

## Arquitetura em 10 linhas
## Como desenvolver localmente
## Padrões
## Anti-padrões (erros recorrentes)
## Referências (links para tech notes e ADRs)
```

#### Template de tarefas em aberto (backlog)

```markdown
---
type: task_backlog
project: proj.acme-api
id: proj.acme-api.backlog
created: {{date}} {{time}}
updated: {{date}} {{time}}
---

# Backlog

## Agora (próximas 3–7)
- [ ] Tarefa A — link: [[sessions/2026/2026-04-12.session]]  
- [ ] Tarefa B — depende de: [[decisions/ADR-2026-04-05-logging]]

## Em seguida
- [ ] ...

## Bloqueios
- [ ] ...

## Definição de pronto
- Testes passam
- Linters passam
- Notas atualizadas (ADR/tech/session)
```

#### Template de resumo de sessão

```markdown
---
type: session_summary
project: proj.acme-api
id: session.{{date}}
date: {{date}}
created: {{date}} {{time}}
updated: {{date}} {{time}}
---

# Sessão {{date}}

## Objetivo da sessão
## O que mudou (fatos verificáveis)
- Mudança 1:
- Mudança 2:

## Decisões tomadas
- [[decisions/ADR-YYYY-MM-DD-...]] (status: proposta/aceita)

## Pendências / próximos passos
- [ ] ...

## Handoff (como retomar em 60–120s)
1) Rodar ...
2) Abrir arquivo ...
3) Validar ...
```

#### Template de decisão (ADR minimalista)

Este template segue o espírito dos ADRs: contexto → decisão → consequências. citeturn14search0turn14search5

```markdown
---
type: decision_adr
project: proj.acme-api
id: adr.{{date}}.slug
date: {{date}}
status: proposed  # proposed | accepted | superseded | rejected
supersedes:
superseded_by:
---

# ADR: <título curto>

## Contexto
## Decisão
## Consequências
## Alternativas consideradas
## Links
- Sessão: [[sessions/2026/2026-04-12.session]]
- Tech: [[tech/tech.architecture]]
```

#### Template de nota técnica

```markdown
---
type: tech_note
project: proj.acme-api
id: tech.slug
created: {{date}} {{time}}
updated: {{date}} {{time}}
tags: [tech]
---

# <título>

## TL;DR
## Detalhes
## Comandos úteis
## Pitfalls
## Links relacionados
```

## Leitura, atualização e compactação de memória dentro do Claude Code

### Como ler memória relevante no início da sessão

O Claude Code já carrega automaticamente, no início, uma combinação de:
- `CLAUDE.md` (projeto/usuário/org) e regras `.claude/rules/` (algumas sempre, outras condicionalmente),  
- auto memory (índice `MEMORY.md` + arquivos de tópico sob demanda). citeturn5view0turn11view0turn11view1  

Pontos críticos do mecanismo (para desenhar bem o vault):

- O auto memory carrega **apenas as primeiras 200 linhas ou 25KB de `MEMORY.md`** no startup; o resto não entra automaticamente. citeturn5view0  
- `CLAUDE.md` é carregado “em cheio” e consome tokens; o próprio guia recomenda manter conciso (ex.: alvo <200 linhas por arquivo) para melhorar aderência. citeturn3view0  
- Regras com `paths:` podem ser **perdidas temporariamente após compaction** até que um arquivo correspondente seja lido novamente. citeturn11view0  

**Arquitetura de leitura recomendada**
1) **Memória sempre carregada (mínima)**  
   - Um `CLAUDE.md` curto (no repo) com: comandos essenciais, convenções e “contratos” do projeto.  
   - Um `context-pack.md` (no vault) com 30–120 linhas no máximo: “agora, pendências, decisões recentes, como retomar”.

2) **Memória carregada sob demanda**  
   - ADRs e notas técnicas grandes ficam fora do startup; são lidas quando o trabalho exigir (ou quando um hook detectar palavras-chave e injetar só o trecho necessário).

3) **Injeção inteligente via hooks**  
   - Use hook `SessionStart` para injetar um Context Pack montado por script. Qualquer stdout vira contexto; ou use `hookSpecificOutput.additionalContext`. citeturn12view0turn12view3  
   - Use `UserPromptSubmit` para injetar contexto *apenas quando a pergunta exigir*, reduzindo “ruído” de contexto. citeturn12view3  

### Como atualizar memória ao final da sessão

Há três formas complementares, cada uma adequada para um tipo de memória:

- **Auto memory**: quando você pede explicitamente “lembre disso” (ou corrige preferências repetidas), o Claude salva no diretório de auto memory, que é Markdown editável e auditável via `/memory`. citeturn5view0turn3view0  
- **Atualização de `CLAUDE.md`**: o guia recomenda adicionar quando o Claude repete erros, quando você repete correções ou quando um novo teammate precisaria do mesmo contexto. citeturn3view0  
- **Resumo curado de sessão + backlog + ADR**: isso deve ir para o vault, mas não precisa estar todo no startup. Aqui, a melhor prática é: “resumo de sessão curto” + links para detalhes.

Para automatizar a escrita no vault, use:
- Hook `PostCompact` para capturar `compact_summary` e gravar em `sessions/YYYY/YYYY-MM-DD.session.md`. citeturn16search15turn11view0  
- Hook `SessionEnd` para gravar um “handoff.md” rápido, mas lembrando que `SessionEnd` tem timeout curto por padrão (configurável por variável de ambiente). citeturn12view1turn16search15  

### Como resumir contexto longo sem degradar qualidade

O Claude Code já faz auto-compaction: limpa outputs antigos, e se necessário sumariza a conversa; dá para orientar o que preservar com instruções de compactação e até colocar “Compact instructions” no `CLAUDE.md`. citeturn11view1turn13search4  

Recomendação prática para não “perder inteligência”:

- **Resumo em camadas** (inspirado em arquiteturas de memória por níveis):  
  - Camada 1: Context Pack (sempre carregado)  
  - Camada 2: Resumos de sessão (curtos, por data)  
  - Camada 3: ADRs e tech notes (detalhes)  
  Esse tipo de separação por níveis é coerente com sistemas de agentes que defendem “tiers” de memória para lidar com limites de contexto. citeturn8search1  

- **Heurística de recuperação por relevância/recência/importância**:  
  Em vez de sempre carregar tudo, recupere memórias baseadas em relevância do pedido atual, recência e importância (um padrão explicitamente usado em arquiteturas de agentes com memória). citeturn8search11turn8search3  

- **Subagentes para “leitura pesada”**:  
  Subagentes operam com janela de contexto separada e retornam apenas um resumo, mantendo sua sessão principal enxuta. citeturn11view0turn11view1  

### Como evitar duplicação e contradição

O risco de um vault virar “enciclopédia contraditória” é real. O Claude Code inclusive alerta que instruções conflitantes podem reduzir consistência e levar a escolhas arbitrárias. citeturn3view0  

Medidas concretas:

- **Índice como “fonte de verdade”**: `project.index.md` deve apontar para os documentos canônicos (contexto, backlog, ADR log).  
- **ADR como mecanismo formal de mudança**: decisões antigas viram `superseded` e apontam para a nova (campos `superseded_by`). citeturn14search0turn14search5  
- **Propriedade `updated` obrigatória**: ajuda triagem automática (“o que está velho?”). Propriedades ficam em YAML e são fáceis de varrer por script. citeturn1search0  
- **Escopo por caminhos em rules**: use `.claude/rules/` com `paths:` para evitar que regras irrelevantes carreguem sempre. citeturn5view0turn11view0  
- **Excluir instruções irrelevantes em monorepos**: `claudeMdExcludes` ajuda a impedir que `CLAUDE.md` de outras áreas sejam carregados. citeturn5view0  

## Fluxo operacional completo e automações locais

### Fluxo operacional completo (exemplo)

**Preparação inicial (uma vez por projeto)**
1) Criar `20_Projects/proj.<slug>/` no vault e gerar: `project.index.md`, `project.context.md`, `tasks.backlog.md`. citeturn8search0turn1search1  
2) No repositório, manter um `CLAUDE.md` curto e estável (idealmente versionado junto do código). O Claude Code usa isso como memória persistente do projeto. citeturn3view0turn11view1  
3) Configurar hooks (local ou user scope) para montar/injetar Context Pack e registrar compactions. Hooks rodam em eventos do ciclo de vida, incluindo `SessionStart`, `UserPromptSubmit`, `PostCompact` e `SessionEnd`. citeturn7view2turn12view0turn16search15  

**Início da sessão**
1) Você entra no repo e inicia ou retoma: `claude --continue` / `claude --resume` (quando aplicável). citeturn11view1  
2) Claude Code carrega `CLAUDE.md` + auto memory do disco no startup. citeturn11view0turn5view0  
3) Hook `SessionStart` injeta:
   - objetivo atual do projeto,
   - tarefas “Agora”,
   - decisões recentes,
   - handoff (como retomar). citeturn12view0turn12view3  

**Carregamento de contexto (dinâmico)**
- Quando sua solicitação menciona um módulo/decisão, `UserPromptSubmit` busca notas relevantes (por tags/grep frontmatter) e injeta apenas o necessário. Isso é suportado porque o evento permite adicionar contexto antes do Claude processar o prompt. citeturn12view3  

**Trabalho ativo**
- Para tarefas grandes, o Claude pode usar subagentes para pesquisa e retornar apenas um resumo, reduzindo bloat de contexto. citeturn11view1turn11view0  
- Sempre que surgir uma regra repetida (“sempre rodar X”), adicionar em memória persistente (CLAUDE.md / rules / auto memory). O guia do Claude Code dá critérios claros de quando adicionar em `CLAUDE.md`. citeturn3view0  

**Salvamento de aprendizados**
- Se a sessão ficar longa, rodar `/compact` com instruções do que preservar (por exemplo: “foco em mudanças de API e exemplos de uso”). Claude Code dá suporte explícito a orientar a compactação. citeturn13search4turn11view1  
- Hook `PostCompact` pega o `compact_summary` e grava em `sessions/YYYY/YYYY-MM-DD.session.md`. citeturn16search15  

**Encerramento**
- Atualizar backlog e, se houve decisão, gerar ADR e marcar no resumo da sessão.  
- Hook `SessionEnd` faz “flush” rápido (por exemplo: atualizar `claude/handoff.md`). citeturn12view1turn16search15  

### Configuração de hooks (exemplo)

Abaixo um exemplo de configuração (conceitual) em `.claude/settings.local.json` ou `~/.claude/settings.json`, usando hooks que o Claude Code executa em eventos de ciclo de vida. citeturn7view2turn7view0

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/ObsidianVault/00_System/Automations/cc_context_pack.py"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/ObsidianVault/00_System/Automations/cc_memory_triage.py"
          }
        ]
      }
    ],
    "PostCompact": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/ObsidianVault/00_System/Automations/cc_post_compact_to_obsidian.py"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/ObsidianVault/00_System/Automations/cc_handoff_flush.py"
          }
        ]
      }
    ]
  }
}
```

Notas importantes:
- Um hook `SessionStart` pode adicionar contexto imprimindo em stdout ou via `additionalContext` no JSON. citeturn12view0turn12view3  
- `SessionEnd` não tem “decision control” e tem timeout curto por padrão; se precisar mais tempo, há variável de ambiente para aumentar o limite. citeturn12view1turn16search15  

### Integrações possíveis (scripts, automações, agentes locais)

**Scripts filesystem-first**
- `rg`/`grep` em frontmatter e corpo para recuperar notas por `project`, `type`, tags e palavras-chave. A busca do Obsidian também resolve isso no app, mas script permite automação fora do app. citeturn14search3turn8search0  

**Plugin local no Obsidian (opcional)**
- Se você quiser um botão/command palette para “Exportar Context Pack”, dá para criar plugin usando o Vault API (ler/escrever arquivos dentro do vault). citeturn15search1turn15search20  

**MCP (opcional, para ir além do filesystem)**
- Claude Code suporta conectar ferramentas via Model Context Protocol (MCP) quando você está copiando dados para o chat repetidamente. Isso pode ser usado para integrar trackers, bancos, etc. citeturn15search0turn13search23  

## Comparação de abordagens, riscos e recomendação final

### Comparação de abordagens de memória no vault

**Um único arquivo de memória**
- Vantagens: simples, fácil de abrir, baixa fragmentação.
- Desvantagens: cresce rápido; vira “muro de texto”; aumenta custo de contexto se for carregado; e dificulta auditoria por tópico.

**Múltiplos arquivos por projeto (sem hierarquia)**
- Vantagens: modularidade, separa por assuntos (tech/decisions/sessions).
- Desvantagens: sem índice, vira “pasta caótica”; precisa disciplina de naming e links.

**Memória hierárquica (camadas)**
- Vantagens: otimiza contexto: topo conciso, detalhes sob demanda; combina bem com limites de janela de contexto e compaction. citeturn11view1turn8search1  
- Desvantagens: precisa um pouco mais de “governança” (índice e templates).

**Índice + notas detalhadas (recomendado)**
- Vantagens: é exatamente o padrão que o auto memory do Claude Code incentiva (um `MEMORY.md` conciso + arquivos de tópico). citeturn5view0  
- Também combina com ADRs (log de decisões) e com o Obsidian (links/backlinks). citeturn14search2turn14search0  

### Riscos e limitações (e mitigação)

**Crescimento excessivo do vault**
- Risco: mais arquivos = mais manutenção e mais dificuldade de achar “o que vale”.
- Mitigação: índice obrigatório por projeto; arquivar sessões antigas; manter “Agora” curto no backlog; e usar busca/links. citeturn14search3turn14search28  

**Contexto irrelevante sendo injetado**
- Risco: degrade de qualidade e custos; o Claude Code destaca que contexto é restrição primária e que compaction acontece quando o limite se aproxima. citeturn11view1turn13search4  
- Mitigação: Context Pack com limite de linhas; `UserPromptSubmit` para injetar só quando necessário. citeturn12view3turn12view0  

**Inconsistências entre notas**
- Risco: regras conflitantes reduzem aderência; o próprio guia aponta que conflitos podem fazer o Claude escolher “arbitrariamente”. citeturn3view0  
- Mitigação: ADR com status + supersede; índice canônico; auditoria periódica; `claudeMdExcludes` em monorepos. citeturn5view0  

**Sobrecarga de manutenção**
- Risco: se depender de “ritual manual” toda sessão, você para de fazer.
- Mitigação: hooks para captura automática (PostCompact), templates prontos, e “triage” semanal para promover memória temporária → permanente.

**Vazamento de informações sensíveis**
- Importante: o Claude Code guarda transcrições e dados de ferramentas em plaintext no disco; se um comando imprimir credenciais ou um `.env` for lido, isso pode acabar em transcrições. citeturn10view0  
- Mitigação: negar leitura de `.env` e padrões sensíveis via permission rules; reduzir retenção (`cleanupPeriodDays`) quando apropriado; e evitar sincronizar transcrições brutas. citeturn10view0turn9view0turn13search5  

### Recomendação final

A abordagem mais sólida para uso real é:

- **Vault como fonte de verdade** para memória curada (usuário/projeto/decisões/tarefas/sessões).
- **Memória do Claude Code alinhada ao vault**, usando:
  - `CLAUDE.md` curto para regras sempre válidas,  
  - `.claude/rules/` para modularidade e escopo por caminhos,  
  - auto memory para “lembretes” que o Claude aprende, mantendo `MEMORY.md` como índice conciso. citeturn5view0turn11view0turn11view1  
- **Hooks para automatizar**: injetar Context Pack no `SessionStart` e gravar resumos no `PostCompact`. citeturn12view0turn16search15turn16search1  

A escolha “índice + notas detalhadas” é a que melhor equilibra: simplicidade humana, auditabilidade e respeito aos limites de contexto.

### Entrega final

**Arquitetura recomendada**
- Camadas: (1) vault Obsidian (Markdown + YAML), (2) memória do Claude Code (`CLAUDE.md`, rules, auto memory), (3) automações (hooks + scripts), (4) governança (índices/ADRs/backlog). citeturn5view0turn7view2turn8search0  

**Estrutura do vault**
```text
ObsidianVault/
  00_System/Templates/
  00_System/Automations/
  10_User/
  20_Projects/proj.<slug>/{project.index,project.context,tasks.backlog,decisions/,tech/,sessions/,claude/}
  90_Archive/
```

**Template inicial mínimo viável**
- Comece com apenas três templates e três arquivos por projeto:
  - Templates: `tpl.project-index.md`, `tpl.session.md`, `tpl.decision-adr.md`
  - Arquivos: `project.index.md`, `tasks.backlog.md`, `sessions/YYYY/YYYY-MM-DD.session.md`

**Próximos passos para implementação**
1) Criar a árvore `20_Projects/proj.<slug>/` e gerar `project.index.md`, `tasks.backlog.md`, primeira `session.md`. citeturn1search1turn8search0  
2) No repo, criar `CLAUDE.md` curto com regras essenciais e (se desejar) um link/ponte para `claude/context-pack.md`. citeturn3view0turn11view1  
3) Configurar hooks `SessionStart` e `PostCompact` para (a) injetar Context Pack e (b) salvar `compact_summary` como sessão. citeturn12view0turn16search15turn16search1  
4) Rodar por 1 semana com triage semanal: promover itens repetidos para `CLAUDE.md`/rules/ADR; arquivar ruído; ajustar limites do Context Pack. citeturn3view0turn11view1