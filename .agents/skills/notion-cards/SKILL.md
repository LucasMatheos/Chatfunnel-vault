---
name: notion-cards
description: >-
  Cria e atualiza cards/tasks no board Notion "ChatFunnel | Tasks V2" via MCP do
  Notion, roteando o card para a visão correta (Tasks / Bug / Suporte) pelas
  propriedades de tipo. Use SEMPRE que o usuário pedir para "criar/abrir uma
  task no Notion", registrar um bug, abrir um card de suporte, anotar uma
  atividade/demanda, mover um card de status, ou adicionar PR/link/contexto a um
  card existente — mesmo que ele não diga "Notion" explicitamente, desde que o
  contexto seja o board de tarefas do ChatFunnel.
---

# Notion Cards — ChatFunnel Tasks V2

## Como o board funciona (leia antes de criar)

**Não existem databases separados para task, bug e suporte.** Existe **um único
database** — `ChatFunnel | Tasks V2` — e o "tipo" do card é definido por
**propriedades**. As boards de Bug e Suporte são apenas *views filtradas* do
mesmo database. Então "criar um bug" = criar um card no Tasks V2 com as
propriedades de tipo certas, para ele aparecer na view de Bug.

Constantes do destino (verificadas no workspace Grupo Vuk OS®):

- **Database:** `ChatFunnel | Tasks V2`
- **Page/DB id:** `8012f8f4-dcbf-4ce2-80bc-f9fc8031e7ee`
- **Data source (para query SQL):** `collection://25dec25c-ba40-4cff-8cdf-a03df2df0720`

> Existe um database legado `ChatFunnel | Tasks` (`26bb2523-8ec2-8179-8c6d-d4e5f3becd63`).
> **Não usar** — todo card novo vai para o **Tasks V2**, salvo pedido explícito.

## Roteamento por tipo

Duas propriedades definem em qual view o card aparece. Preencher conforme a natureza do pedido:

- **`Tipo`** (select, valores: `BUG`, `SUPORTE`) — só existe para BUG e SUPORTE.
- **`Tipo de Demanda`** (multi-select: `SUPORTE`, `BUG`, `FRONT-END`, `BACK-END`, `INFRAESTRUTURA`, `ADMINISTRATIVO`, `MELHORIA`).

As views filtram assim:
- **ChatFunnel - Bug** → `Tipo de Demanda` contém `BUG`.
- **ChatFunnel - Suporte** → `Tipo = SUPORTE` **ou** `Tipo de Demanda` contém `SUPORTE`.
- **ChatFunnel - Tasks** → tudo (board principal).

Regra prática ao criar:

| Pedido do usuário | `Tipo` | `Tipo de Demanda` |
|-------------------|--------|-------------------|
| "é um bug", "está quebrado", "erro em X" | `BUG` | `["BUG"]` (+ camada: `FRONT-END`/`BACK-END` se souber) |
| "suporte", "cliente pediu", "chamado" | `SUPORTE` | `["SUPORTE"]` |
| feature/ajuste no front | *(vazio)* | `["FRONT-END"]` |
| feature/ajuste no back | *(vazio)* | `["BACK-END"]` |
| melhoria/refino | *(vazio)* | `["MELHORIA"]` |
| infra/deploy/performance de infra | *(vazio)* | `["INFRAESTRUTURA"]` |
| tarefa administrativa | *(vazio)* | `["ADMINISTRATIVO"]` |

Se o tipo não for óbvio pelo pedido, **perguntar** em vez de chutar — cair na
view errada é o erro mais caro aqui. Um card pode ter mais de uma camada em
`Tipo de Demanda` (ex.: `["BUG", "FRONT-END"]`).

## Propriedades do database

Mapear só o que o pedido fornecer; não inventar valores.

- **`Task name`** (title) — título curto começando por verbo quando for atividade
  (ex.: "Corrigir duplicação de quebra de linha no bloco de mensagem WhatsApp").
- **`Status`** (status) — vocabulário exato:
  `Aguardando Inicio`, `Ativ. aprov. em weekly`, `Planejamento técnico`,
  `Em Andamento`, `Desenv. concluído(Review)`, `Bloqueadas`,
  `[PR] Publicada em DEV`, `Publicada na INSIDER`, `[DEPLOY] Publicada em PROD`,
  `Concluidas`.
  **Default de card novo: `Aguardando Inicio`** (atenção: sem acento em "Inicio",
  é o nome real da opção).
- **`Prioridade`** (select): `🔥 - Urgente/Critico`, `⚠️ - Alto`, `🗓️ - Médio`,
  `🗄️ - Baixo`. Mapear "urgente/crítico"→🔥, "alta"→⚠️, "média"→🗓️, "baixa"→🗄️.
- **`Esforço`** (select, story points): `1`, `2`, `3`, `5`, `8`, `13`, `21`. Só se pedido.
- **`Motivo de Bloqueio`** (select): `Aguardando Back`, `Aguardando Front`,
  `Retorno do cliente`, `Aguardando outra task`, `Reescrever task`, `UX`, `Outro`.
  Preencher só quando `Status = Bloqueadas`.
- **`Responsável`** / **`Atribuir`** (person) — só setar se o usuário indicar a
  pessoa; resolver o id via `notion-get-users`. Sem indicação, deixar vazio.
- **`Task ID`** é auto-incremento (read-only) — nunca tentar setar.

## Workflow

1. Confirmar que há tool MCP do Notion na sessão (`notion-create-pages`,
   `notion-update-page`, `notion-fetch`). Se não houver, montar o payload e
   avisar objetivamente que falta o MCP.
2. Interpretar o pedido: título, descrição, tipo (→ tabela de roteamento),
   prioridade, status, links/PRs, responsável, prazo.
3. Criar o card com `notion-create-pages` no database `Tasks V2` (id acima),
   preenchendo `Task name`, `Status`, `Tipo`/`Tipo de Demanda` e o que mais o
   pedido fornecer. Corpo em pt-BR acentuado.
4. Retornar **título, tipo/view, status e URL** do card.

Para **atualizar** (mover status, anexar PR/contexto): localizar o card
(`notion-search` no database ou id fornecido), depois `notion-update-page` para
propriedades e blocos para conteúdo. Não duplicar card existente.

## Corpo do card

Para cards com contexto, estruturar assim (omitir seções vazias — não inventar
critérios de aceite para uma task trivial):

```markdown
## Contexto
- ...

## Tarefa
- ...

## Critérios de aceite
- ...

## Links
- PR: ...
```

Se o pedido referenciar "isso", "o que a gente fez" ou "as alterações",
consultar o contexto recente da sessão antes de criar — não inventar resumo.

## Regras de ambiguidade e falha

- Título + tipo claros → criar direto, sem perguntar.
- Tipo ambíguo (não dá pra saber se é bug, suporte ou feature) → perguntar antes.
- Status pedido que não existe no vocabulário → usar o mais próximo e mencionar
  no corpo; na dúvida, `Aguardando Inicio`.
- **Sem MCP Notion:** informar e oferecer o payload pronto para criação manual.
- **Sem permissão / database não compartilhado:** pedir para compartilhar o DB
  com a integração; não usar scraping de browser como alternativa.
- **Erro parcial:** reportar o que foi criado e o que faltou aplicar.
- Nunca inventar ids de página/database, usuários ou opções de propriedade.
