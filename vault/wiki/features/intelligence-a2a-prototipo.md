---
title: Intelligence (A2A) — Especificacao do Prototipo (Pencil)
description: Recuperacao da estrutura do prototipo intelligence-chat.pen — layout, tokens, componentes de mensagem e copy de referencia para guiar a construcao do front.
tags: [features, intelligence, a2a, frontend, prototipo, design]
related: ["[[intelligence-a2a]]", "[[intelligence-a2a-shapes]]"]
last_updated: 2026-04-29
---

# Intelligence (A2A) — Especificacao do Prototipo

> Fonte: `vault/prototipos/intelligence-chat.pen` (Pencil). Esta pagina extrai as decisoes de design ja tomadas — usar como brief para a implementacao.

## Frames de nivel superior

| Tipo | Nome | Dimensoes | Proposito |
|------|------|-----------|-----------|
| Tela | `Intelligence Chat - Full Page` | 1440 x 1200 | Layout principal 3-pane com artifact |
| Tela | `Intelligence Chat - Empty State` | 1440 x 900 | Hero + suggestion cards + input centralizado |
| Tela | `Intelligence Chat - Card V1 (Glassmorphism)` | 1440 x 900 | Variante de empty state |
| Tela | `Intelligence Chat - Card V2 (Bold Modern)` | 1440 x 900 | Variante de empty state |
| Componente | `01..10` | 600 x auto | Tipos genericos de mensagem |
| Componente | `11..17` | 600 x auto | Tipos especificos por tool MCP |
| Componente | `18..19a-d` | 600 x auto | Voice recording (overlay, button, bar, processing, bubble) |

## Layout principal — 3 paneis

```
┌────────────┬─┬───────────────────────────┬──────────────────┐
│ Sidebar    │ │ Chat Area                 │ Artifact Panel   │
│ Conversas  │ │ Header + Messages + Input │ Preview do arte- │
│ 260px      │D│ fill                      │ fato gerado      │
│            │ │                           │ 480px            │
└────────────┴─┴───────────────────────────┴──────────────────┘
       260   1                                      480
```

- **Sidebar:** 260px, fill `$--gray-100`, padding `[20, 16]`, gap 12
- **Divider:** 1px, fill `$--gray-400`
- **Chat Area:** fill_container, layout vertical (header / messages / input)
- **Artifact Panel:** 480px, fill `$--gray-200`, padding 20, gap 16 — slide-out opcional para previews (flow, template, agente)

## Design tokens usados

Todos os componentes referenciam variaveis do tema (provavelmente vindas de [[brand-guidelines]]).

### Cores (variaveis Pencil)
- **Backgrounds:** `$--gray-100` (cards/superficies), `$--gray-200` (canvas/artifact panel), `$--gray-300` (skeletons), `$--gray-400` (dividers/borders), `$--gray-500` (icones secundarios)
- **Brand:** `$--brand-100` (chips de sucesso ativos, fundos de avatar), `$--brand-400` (stroke ativo), `$--brand-500` (botoes primarios, avatar AI, send btn)
- **Tipografia:** `$--font-primary`, `$--font-secondary`, `$--font-muted`, `$--font-white`
- **Sombra:** `$--shadow-purple` — usada como outer shadow blur 24, offset (0, 2)
- **Estados:** `$--green-500`, `$--red-500`, `$--amber-500`, `$--amber-bg`, `$--user-bubble-bg`
- **Cores literais (devem virar tokens):**
  - `#E8F5E9` — verde claro (template card bg, agent icon, success fills secundarios)
  - `#FFF3E0` — laranja claro (delay icon, attention soft)
  - `#FFE7E7` — vermelho claro (tag removida, error block)
  - `#E2FBEF` — verde mais saturado (success block do status)
  - `#15803D` — verde 700 (texto de sucesso)
  - `#B91C1C` — vermelho 700 (texto de erro)
  - `#78350F` — amber 900 (texto de aviso)

### Tipografia
- Familia: **Figtree** (todas as instancias)
- Tamanhos observados: 11 (labels/hints), 13 (texto secundario), 14 (mensagem), 15 (artifact title), 16 (sidebar title), 28 (hero title empty state), 32 (canvas titles)
- Pesos: 400 normal, 500 (item inativo), 600 (label/conv ativo), 700 (titulos)
- `lineHeight` quando explicito: 1.5 ou 1.6

### Geometria
- **Corner radius:** 6 (slash command badge), 8 (botoes pequenos, conv items, search box), 10 (cards medios, input pill), 12 (cards de conteudo, success/error blocks), 16 (containers de mensagem, input principal), 9999 (pills, avatars circulares)
- **Padding:** mensagens `24`, cards internos `[14, 16]`, conv items `[10, 12]`, input box `[0, 6, 0, 16]`
- **Sombras:** quase universal — `outer / blur 24 / color $--shadow-purple / offset (0, 2)`

### Iconografia
Fonte: **phosphor**. Icones encontrados:
- `plus` (new chat), `magnifying-glass` (search), `lightning` (avatar AI em todas as mensagens — identidade visual do agent), `arrow-down` (connectors no flow), `pencil-simple` (editar), `circle-notch` (loading spinner)

## Sidebar de conversas

Estrutura, top-down:
1. **Header** — `Conversas` (16/700) + botao "+" 32x32 `$--brand-500`, radius 8, com icon `plus` branco
2. **Search box** — 36px alto, fill `$--gray-200`, radius 8, padding `[0, 12]`, gap 8 — icon `magnifying-glass` + placeholder "Buscar conversas..." (font-muted 13)
3. **Grupo "Hoje"** — label 11/600 font-muted
4. **Conv items** — radius 8, padding `[10, 12]`, layout vertical gap 4
   - Ativo: fill `$--user-bubble-bg`, titulo 13/600
   - Inativo: sem fill, titulo 13/500
   - Subtitulo: 11/normal font-muted (ex: "Ha 5 minutos", "Ha 2 horas")
5. **Grupo "Ontem"** — mesmo padrao

Conversas-mock (para semear o front com strings reais):
- "Criar flow de boas-vindas" — Ha 5 minutos *(ativo)*
- "Relatorio de contatos ativos" — Ha 2 horas
- "Configurar agente de vendas" — Ontem
- "Listar leads do funil principal" — 2 dias atras
- "Automacao de follow-up" — 3 dias atras

## Chat Area

### Header (56px)
- **Esquerda:** avatar 32 circular `$--brand-500` + bloco titulo (provavelmente nome do agent + status)
- **Direita:** botao Settings 32x32 radius 8

Divider 1px abaixo.

### Messages Container
- Padding 24, gap **20** entre mensagens
- Sequencia exemplificada no prototipo: User -> AI texto -> User2 -> AI Tabela -> AI Confirmacao -> Suggestions

### Input Area (rodape)
- Outer: padding `[16, 24, 20, 24]`, gap 10, fill `$--gray-100`
- **Input Box** (48px alto, radius 16, fill `$--gray-100`, stroke `$--gray-400` 1px, shadow purple):
  - Attach btn 32x32 radius 8
  - Slash command badge: radius 6, fill `$--gray-200`, padding `[0, 8]`, alto 24
  - Placeholder: "Mensagem para o ChatFunnel..."
  - Send btn 36x36 radius 10 fill `$--brand-500`
- **Hint** (centralizado, 11/normal font-muted): `Enter para enviar · Shift+Enter para nova linha · / para comandos`

## Empty State

Centro vertical, gap 32. Estrutura:
1. **Hero** (gap 16, vertical):
   - Avatar 56x56 circular `$--brand-500`
   - Titulo: "Como posso ajudar?" — 28/700 centralizado
   - Subtitulo (420w, line-height 1.5): `Pergunte qualquer coisa sobre seu workspace, crie flows,\nagentes, relatorios e muito mais.`
2. **Suggestion Cards** (4 cards lado a lado, gap 12, cada 160w):
   - Card - Flow
   - Card - Report
   - Card - Contacts
   - Card - Agent

   Padrao: radius 12, fill `$--gray-100`, stroke `$--gray-400`, shadow purple, padding 16, layout vertical gap 10
3. **Input Wrapper** (720w, gap 10): mesmo input box do estado cheio + hint abaixo

## Catalogo de componentes de mensagem

Padrao base inspirado no componente `ChatMessage.vue` do onboarding-v2:

- **Mensagens user:** bubble alinhado a direita, fill `$--brand-500`, texto branco, radius assimetrico `[14, 4, 14, 14]` (cauda no canto superior-direito), padding `[12, 16]`, layout horizontal com timestamp inline (10/normal `#FFFFFF80`) alinhado ao final. Sem avatar.
- **Mensagens AI:** avatar 28x28 circular `$--brand-500` com icon `lightning` branco + bloco de conteudo em bubble branco (`#FFFFFF`) com `border 1px $--gray-400`, radius assimetrico `[4, 14, 14, 14]` (cauda no canto superior-esquerdo), padding `[12, 16]`, timestamp 10/normal font-muted alinhado a direita no rodape da bubble.
- **Animacao de entrada:** `slide-up 8px + fade-in 0.3s cubic-bezier(0.4, 0, 0.2, 1)` — mesma do onboarding.

### Genericos (01–10)

| # | Nome | Decisoes-chave |
|---|------|----------------|
| 01 | Mensagem do Usuario | Bubble alinhado a direita (`justifyContent: end`), fill `$--brand-500`, texto `$--font-white`, radius assimetrico `[14, 4, 14, 14]`, padding `[12, 16]`, timestamp inline 10px `#FFFFFF80` |
| 02 | Resposta AI Texto | Avatar + bubble branca com border `$--gray-400` 1px, radius `[4, 14, 14, 14]`, texto 14/normal line-height 1.6, timestamp 10px font-muted no rodape |
| 03 | Card de Acao | Texto introdutorio + card horizontal: icon colorido 36x36 (ex: agent `#FFF3E0`) + info bloco + botao 32 fill brand-500 |
| 04 | Tabela Inline | Tabela compacta dentro da bolha — ideal para `list_automations`, `list_kanban_cards`, `search_contacts` |
| 05 | Code Block | Codigo monoespacado dentro de `$--code-bg` |
| 06 | Confirmacao de Acao | Card amber: fill `$--amber-bg`, stroke esquerda 3px `$--amber-500`, descricao em `#78350F`, botoes "Confirmar" / "Cancelar" |
| 07 | Grafico Inline | Renderizar serie temporal/barras dentro da bolha |
| 08 | Loading / Skeleton | Spinner `circle-notch` 14px brand-500 + label "Analisando contatos..." (13/500 brand-500) + 4 barras skeleton fill `$--gray-300`, larguras decrescentes (fill / 360 / 280 / 200) |
| 09 | Chips de Sugestao | 2 linhas de chips, gap 8 entre chips |
| 10 | Imagem / Media | Imagem com bordas e meta text |

### MCP-especificos (11–17)

| # | Nome | Tool MCP relacionada | Padrao visual |
|---|------|---------------------|---------------|
| 11 | Card de Contato | `get_contact`, `search_contacts` | Card com header (avatar + nome + meta) + divider + lista de detalhes |
| 12 | Card de Automacao | `list_automations`, `get_automation` | Multi-card vertical, cada um com header (nome + status) + linha de triggers |
| 13 | Card Template WhatsApp | `get_template`, `create_template` | Card 320w fill `#E8F5E9` simulando bubble do WhatsApp: header bold, body com `{{1}}` placeholders, footer cinza, divider, botoes (QUICK_REPLY) — abaixo: badges category + lang |
| 14 | Card de Kanban | `move_kanban_card`, `create_kanban_card` | Card com top (status + valor) + divider + detalhes (contato, coluna, prioridade) |
| 15 | Lista de Tags | `add_contact_tag`, `remove_contact_tag` | Chips pill (radius 9999, padding `[0, 12]`, alto 30): existentes (`$--brand-100` ou `#E8F5E9`), **adicionada** (`$--brand-100` + stroke `$--brand-400`), **removida** (`#FFE7E7` + stroke `$--red-500`) |
| 16 | Status de Execucao | `build_automation`, `delete_*`, erros | Dois blocos: **success** fill `#E2FBEF` + stroke esquerda 3px `$--green-500` (descricao em `#15803D`); **error** fill `#FFE7E7` + stroke esquerda 3px `$--red-500` (descricao em `#B91C1C`). Cada um com row de botoes de acao |
| 17 | Card Agente/Assistente | `get_agents_v2`, `get_assistants` | Cards horizontais: icon 40x40 fill por tipo (`#E8F5E9` IA, `#FFF3E0` humano) + info + botao outline `$--brand-500` |

### Voice (18, 19a-d) — input por audio

| # | Nome | Padrao |
|---|------|--------|
| 18 | Voice Recording Overlay | Card 600w, body alinhado centro com fill `$--code-bg`, padding `[36, 24, 72, 24]`, gap 20 — provavelmente waveform animada |
| 19a | Mic Button States | Linha de botoes em estados (idle / hover / recording / processing) |
| 19b | Inline Recording Bar | Pill 52px, radius 20, stroke `$--red-500` 1.5, padding `[0, 6, 0, 16]` — mic dot + waveform inline |
| 19c | Processing State | Pill 48px, radius 16, fill `$--gray-200`, stroke `$--gray-400`, padding `[0, 16]` |
| 19d | Voice Message Bubble | Bubble do usuario com player de audio embutido, alinhado a direita |

## Artifact Panel — preview de saida

Lado direito (480px). Renderizado quando o agente produz um artefato relevante (flow, template, agente). Estrutura:

1. **Header** (space-between):
   - Bloco titulo: "Preview" 15/700 + subtitulo dinamico (ex: "Flow: Boas-vindas WhatsApp") 12/normal font-muted
   - Acoes: openFullBtn 28x28, closeBtn 28x28
2. **Conteudo** (radius 12, fill `$--gray-100`, stroke `$--gray-400`, shadow purple, padding `[24, 20]`)
   - No exemplo: 4 nodes de flow encadeados via icones `arrow-down`
   - Cada node: header com icon 32x32 colorido por tipo + info bloco
     - Start: fill `$--brand-100`, stroke `$--brand-400` 2px
     - Message: fill `#E8F5E9`
     - Delay: fill `#FFF3E0`
     - Follow-up: fill `#E8F5E9`
3. **Footer** (acoes, justifyContent end):
   - "Editar flow" (fill `$--brand-500`, texto branco, icon `pencil-simple`)
   - "Ativar flow" (outline `$--brand-500`)

> Quando construir, generalizar para outros artefatos: trocar conteudo do panel por preview do template (preview WhatsApp), do agente (form de configs), do contato (perfil), etc.

## Copy de referencia para semear o front

Sucesso (componente 16):
> "Boas-vindas WhatsApp" — 3 etapas, 1 trigger (DM WhatsApp). Automacao ativada automaticamente.

Erro (componente 16):
> O template "promo_black_friday" esta sendo usado por 2 automacoes ativas. Desative as automacoes antes de excluir.

Confirmacao destrutiva (componente 06):
> Vou excluir o flow "Promocao Black Friday". Essa acao nao pode ser desfeita.
> Flow "Promocao Black Friday" sera removido permanentemente, incluindo 3 automacoes vinculadas e 127 contatos no funil.

Loading (componente 08):
> Analisando contatos...

Tags (componente 15) — texto introdutorio:
> Tags do contato Maria Lima atualizadas:

Template (componente 13) — exemplo:
- Header: `📢 Promocao Especial!`
- Body: `Ola {{1}}, temos uma oferta exclusiva para voce! Desconto de 30% no plano Pro ate sexta-feira. Nao perca!`
- Footer: `ChatFunnel · Responda SAIR para cancelar`

## Mapeamento prototipo → SSE/MCP

Cruzando com [[intelligence-a2a-shapes]]:

| Componente Pencil | Evento SSE / Tool result | Quando renderizar |
|-------------------|--------------------------|-------------------|
| 01 User Message | mensagem persistida `role: "user"` | sempre |
| 02 AI Texto | acumular `event: text` deltas | resposta texto puro sem tools |
| 03/13/17 Cards de acao | `tool_result` de `create_template`, `create_kanban_card`, `get_assistants` | apos `tool_result` parsear JSON e mapear por `name` |
| 04 Tabela inline | `tool_result` de `list_*` ou `search_contacts` | dataset > 3 itens |
| 06 Confirmacao | UX-only — antes de chamar `delete_*` | client side, antes do POST |
| 08 Loading | `tool_start` recebido sem `tool_result` ainda | enquanto status === "running" |
| 09 Chips | empty state ou apos `done` (proximo passo sugerido) | inicio de conversa, fim de turn |
| 11 Contato | `tool_result` de `get_contact` ou `search_contacts` (1 item) | resultado singular |
| 12 Automacao | `tool_result` de `list_automations` ou `get_automation` | listagem ou detail |
| 14 Kanban | `tool_result` de `move_kanban_card`, `win/lose_kanban_card`, `create_kanban_card` | confirmacao de operacao |
| 15 Tags | `tool_result` de `add_contact_tag` ou `remove_contact_tag` | mostrar diff visualmente |
| 16 Status (success/error) | `event: done` com tools sem erro / com `isError: true` ou `event: error` | feedback final do turn |
| 18-19 Voice | input do usuario (transcricao Speech-to-Text antes do POST) | feature opcional |
| Artifact Panel | qualquer flow gerado por `build_automation` | abrir on-demand quando agent produzir um arte |

## Variantes alternativas de empty state

`NYm9j` (Card V1 Glassmorphism) e `lmj7h` (Card V2 Bold Modern) sao explorations diferentes do mesmo layout 1440x900 com sidebar + chat empty. Decisao final: avaliar qual aderencia melhor com [[brand-guidelines]] antes de implementar.

## Pontos de atencao

1. **Avatar `lightning`** e a identidade visual unica do agent — manter consistente em todos os tipos de mensagem AI
2. **Shadow purple universal** — todos os cards e o input usam a mesma shadow; nao misturar shadows neutras
3. **Cores literais (`#E8F5E9` etc.)** ainda nao sao tokens — antes de codar, alinhar com brand-guidelines/tailwind tokens existentes
4. **Empty state** ja preve 4 entry points (Flow / Report / Contacts / Agent) — implementar como CTAs com prompts pre-preenchidos
5. **Slash commands** (`/`) estao previstos no input — sera necessario um menu suspenso de comandos rapidos (ex: `/listar contatos`, `/criar flow`)
6. **Voice input** esta no escopo do prototipo — verificar com produto se entra na primeira versao ou em fase posterior
7. **Artifact panel** colapsavel — precisa de animacao de slide e estado vazio quando nao ha artefato

## Componentes adicionais — P1+P2+P3 (18-36)

Variacoes adicionadas em 2026-04-29 cobrindo gaps identificados em [[intelligence-a2a-cobertura]]. Todas seguem o padrao base (600w, fill gray-100, radius 16, padding 24, shadow purple) com avatar 28 brand-500 + `lightning` icon.

### P1 — Discovery (5)

| # | Nome | Tool MCP | Padrao visual |
|---|------|----------|---------------|
| 18 | Chips de Canais | `get_channels` | Chips horizontais por tipo (WhatsApp `#E8F5E9` + verde, Instagram `#FCE4F4` + rosa) com dot de status (verde/cinza) |
| 19 | Lista de Kanbans | `get_kanbans` | Cards verticais por board: header (nome + count) + chips horizontais com colunas (`$--gray-200`) |
| 20 | Lista de Moderadores | `get_moderators` | Cards horizontais: avatar circular `$--brand-100` com iniciais `$--brand-700` + nome + email + badge `pendente` (`$--amber-bg`) |
| 21 | Custom Fields | `get_custom_fields` | Lista vertical: pill horizontal com icon (`text-aa`/`hash`/`calendar`/`caret-circle-down`) + nome + badge tipo (TEXT/NUMBER/DATE/SELECT) |
| 22 | Tags Read-only | `get_tags` (read) | Variante de 15 sem add/remove — apenas chips `$--brand-100` existentes + contador |

### P2 — Operacoes especificas (7)

| # | Nome | Tool MCP | Padrao visual |
|---|------|----------|---------------|
| 23 | Card Ganho | `win_kanban_card` | Card celebrativa: fill `#E2FBEF`, stroke esquerda 3px `$--green-500`, icon `trophy`, badge "WON" `$--green-500`, valor + comissao em `#15803D` |
| 24 | Card Perdido | `lose_kanban_card` | Card vermelho: fill `#FFE7E7`, stroke esquerda 3px `$--red-500`, icon `x-circle`, badge "LOST", motivo em pill branca + tempo no funil |
| 25 | Atribuicao | `assign_card_moderator` | Card neutro com header (nome + coluna) + divider + linha "Atribuido a:" + chip `$--brand-100` com avatar 24 brand-500 + iniciais |
| 26 | Cards do Kanban | `list_kanban_cards` | Multi-card stacked verticais: header (titulo + valor R$ em `$--brand-700`) + linha (avatar 18 + responsavel · dias) — fallback `user` cinza quando sem responsavel |
| 27 | Lista de Templates | `list_templates` | Pills horizontais com nome + badge de status colorido: APPROVED (verde `#E2FBEF`/`#15803D`), PENDING (amber), REJECTED (vermelho), PAUSED (cinza) |
| 28 | Busca de Contatos Multi | `search_contacts` | Variante de 11 com multiplos resultados: avatar `$--brand-100` + iniciais + nome + telefone/email + footer "Pagina X de Y · N resultados" |
| 29 | Atualizacao de Campo | `update_contact_field` | Header: icon do tipo + nome do campo + badge do tipo. Diff: linha vermelha (icon `minus`, texto strikethrough `#B91C1C`) + linha verde (icon `plus`, novo valor `#15803D`) |

### P3 — Avancadas (7)

| # | Nome | Tool MCP | Padrao visual |
|---|------|----------|---------------|
| 30 | Status do Template | `get_template_status` | Card vermelho compacto: header (nome bold + badge status), grid 2 colunas (Categoria + Quality Score), bloco branco com motivo de rejeicao + icon `warning-circle` |
| 31 | Botoes Quick Reply | `get_template_buttons` | Lista pills `#E8F5E9` com stroke `#15803D`: badge circular com index (0/1/2 em verde) + texto + UUID truncado em mono cinza |
| 32 | Sync Templates Progress | `sync_templates` | Card com header (icon `circle-notch` + canal + contador "X / Y"), barra de progresso (`$--brand-500`), 3 metricas verticais: Aprovados (verde), Pendentes (amber), Rejeitados (vermelho) |
| 33 | Mapeamento de Variaveis | `configure_template_params` | Pills horizontais: badge `{{N}}` (`$--brand-100`) + arrow-right + icon do tipo + path do campo interno (ex: `contact.name`, `custom_fields.valor_compra`) |
| 34 | Rascunho Pendente | `get_draft` | Card amber stroke esquerda: header com icon `file-text` + nome + tempo, diff de 3 linhas (+/~/-, cores verde/amber/vermelho), footer com botoes "Descartar" (outline) + "Publicar" (solid amber) |
| 35 | Nodes Extras do Flow | `add_step_condition`, `add_step_ab_test`, `add_step_kanban`, `add_step_*` | Linhas com icon 32x32 colorido por tipo (`git-branch` roxo, `shuffle` amber, `kanban` verde) + nome + descricao da configuracao |
| 36 | Pastas de Tags | `list_tag_folders` | Tree estruturada: header pasta (icon `folder` + nome + count) + chips de tags filhas indentadas (28px). Fallback "Sem pasta:" para tags soltas |

### Decisoes visuais novas

- **Iconografia ampliada (phosphor):** `whatsapp-logo`, `instagram-logo`, `trophy`, `x-circle`, `text-aa`, `hash`, `calendar`, `caret-circle-down`, `user`, `arrow-right`, `chat-text`, `git-branch`, `shuffle`, `kanban`, `folder`, `file-text`, `minus`, `plus`, `warning-circle`
- **Cores literais reaproveitadas (devem virar tokens):** `#E8F5E9`/`#15803D` (verde claro/escuro), `#FFE7E7`/`#B91C1C` (vermelho claro/escuro), `#E2FBEF` (success forte), `#FCE4F4`/`#C026D3` (rosa Instagram), `#92400E` (amber escuro), `#EDE9FE`/`#7C3AED` (roxo condition), `#FEF3C7` (amber claro AB test), `#DCFCE7` (verde kanban), `#FFFFFF` (overlay branco em cards coloridos)
- **Padroes de status badge:** sempre radius 9999, padding `[2, 10]`, fill da cor primaria do estado, texto branco bold uppercase
- **Diffs sempre verticais** (linha removida acima, linha nova abaixo) — strikethrough no texto removido
- **Tabelas em chips** (em vez de tabela tradicional) quando lista cabe horizontalmente — melhora skim
- **Rate de status:** valores numericos grandes (18px/700) acima de label pequeno (11px/600) — usado em sync_templates

### Localizacao no canvas

- Titulos de secao: `(1700, 5300)` P1, `(1700, 6500)` P2, `(1700, 8100)` P3
- Componentes: 2 colunas `x=1700` (esquerda) e `x=2400` (direita), pares por linha
- Range Y: 5400 (P1 inicio) ate 9100 (P3 fim) — ~3700px de canvas adicionados

## Referencia

- Arquivo: `vault/prototipos/intelligence-chat.pen`
- Total de top-level frames: 30 originais + 22 novos (3 titulos + 19 componentes) = **52**
- Aberto via `pencil` MCP (`open_document` + `batch_get` + `batch_design`)
