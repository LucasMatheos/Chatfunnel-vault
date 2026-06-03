---
title: Intelligence (A2A) — Cobertura de Componentes (Shapes x Prototipo)
description: Matriz cruzando cada tool/evento documentado em shapes com o componente do prototipo Pencil — identifica gaps e propoe variacoes a desenhar.
tags: [features, intelligence, a2a, frontend, prototipo, gap-analysis]
related: ["[[intelligence-a2a]]", "[[intelligence-a2a-shapes]]", "[[intelligence-a2a-prototipo]]"]
last_updated: 2026-04-29
---

# Intelligence (A2A) — Cobertura de Componentes

> Cruza [[intelligence-a2a-shapes]] (o que o backend manda) com [[intelligence-a2a-prototipo]] (o que ja foi desenhado) para identificar lacunas. Itens com **status** `gap` precisam de variacao nova no `.pen`.

## Status (2026-04-29)

**P1+P2+P3 desenhados** no `intelligence-chat.pen` — componentes 18 a 36 (19 novos + 3 titulos de secao). Catalogo atualizado em [[intelligence-a2a-prototipo]] secao "Componentes adicionais — P1+P2+P3".

| Prioridade | Status | Componentes |
|------------|--------|-------------|
| P0 — UX scaffolding | nao iniciado (escopo fora do chat) | banner anthropic, cost footer, stop btn, cancelled inline, erro code-aware, slash menu |
| P1 — Discovery | **ok** | 18 channels, 19 kanbans, 20 moderators, 21 custom fields, 22 tags read-only |
| P2 — Operacoes | **ok** | 23 win, 24 lose, 25 assign, 26 list cards, 27 list templates, 28 search multi, 29 update field |
| P3 — Avancadas | **ok** | 30 template status, 31 buttons, 32 sync, 33 params, 34 draft, 35 flow nodes extras, 36 tag folders |

## 1. Eventos SSE e estados de protocolo

| Shape / Evento | Componente | Status |
|----------------|------------|--------|
| `text` (delta de texto AI) | 02 Resposta AI Texto | ok |
| `tool_start` (running) | 08 Loading / Skeleton | ok |
| `tool_result` (done) | varios cards 03/11..17 | ok |
| `tool_result` com `isError: true` | 16 Status (error block) | ok parcial — falta diferenciar `code` (NOT_FOUND, VALIDATION_ERROR, RATE_LIMIT, FORBIDDEN) |
| `cancelled` ({reason: user_requested}) | nenhum | **gap** |
| `error` ({message, cause}) | 16 Status (error block) | ok parcial — falta exibir `cause` (root cause Mastra) |
| `done` ({usage, costUsd, finishReason}) | nenhum | **gap** — rodape de turn com tokens/custo |

## 2. Tools por agente — cobertura

### Flow Agent (19 tools)

| Tool | Componente | Status |
|------|------------|--------|
| `create_trigger` | Artifact Panel (preview parcial) | ok parcial — sem step-progress |
| `add_step_message` | idem | ok parcial |
| `add_step_delay` | idem | ok parcial |
| `add_step_condition` | idem | **gap** — node de condicao no flow preview |
| `add_step_action` | idem | **gap** |
| `add_step_kanban` | idem | **gap** |
| `add_step_ab_test` | idem | **gap** |
| `add_step_follow_up` | Artifact Panel (Follow-up node) | ok |
| `add_step_run_automation` | nenhum | **gap** |
| `add_step_chat_action` | nenhum | **gap** |
| `build_automation` | 16 Status success + Artifact Panel | ok |
| `list_automations` | 12 Card de Automacao | ok |
| `get_automation` | 12 + Artifact Panel | ok |
| `toggle_automation` | 16 Status | ok |
| `rename_automation` | 16 Status | ok |
| `delete_automations` | 06 Confirmacao + 16 Status | ok |
| `get_draft` | nenhum | **gap** — preview de rascunho com diff vs publicado |
| `get_channels` | nenhum (so usado como discovery) | **gap** — chips compactos de canais |
| `get_tags` (read-only) | 15 (variante write) | **gap** — variante read-only |

### System Agent (13 tools)

| Tool | Componente | Status |
|------|------------|--------|
| `get_custom_fields` | nenhum | **gap** — chips/lista de custom fields |
| `get_tags` | 15 read-only | **gap** |
| `get_channels` | idem | **gap** |
| `get_kanbans` | nenhum | **gap** — lista boards com colunas |
| `get_assistants` | 17 Card Agente | ok |
| `get_moderators` | nenhum | **gap** — lista moderadores com avatars |
| `get_agents_v2` | 17 Card Agente | ok |
| `create_tag` | 15 + 16 | ok |
| `update_tag` | 15 + 16 | ok |
| `delete_tag` | 06 + 16 | ok |
| `list_tag_folders` | nenhum | **gap** — folder tree |
| `create_tag_folder` | 16 | ok parcial |
| `delete_tag_folder` | 06 + 16 | ok |

### Template Agent (10 tools)

| Tool | Componente | Status |
|------|------------|--------|
| `list_templates` | nenhum (tabela 04 generica funciona) | **gap** — variante com badges de status (APPROVED/PENDING/REJECTED/PAUSED) |
| `get_template` | 13 Card Template | ok |
| `get_template_status` | nenhum | **gap** — bloco compacto com status + reason + quality_score |
| `get_template_buttons` | nenhum | **gap** — lista QUICK_REPLY buttons |
| `create_template` | 13 + 16 | ok |
| `update_template` | 13 + 16 | ok |
| `delete_templates` | 06 + 16 | ok |
| `sync_templates` | nenhum | **gap** — progress sync (X de Y, contadores) |
| `configure_template_params` | nenhum | **gap** — mapping variables -> internal fields |
| `get_channels` | (ver System) | **gap** |

### CRM Agent (8 tools)

| Tool | Componente | Status |
|------|------------|--------|
| `get_kanbans` | (ver System) | **gap** |
| `get_moderators` | (ver System) | **gap** |
| `create_kanban_card` | 14 Card de Kanban | ok |
| `move_kanban_card` | 14 (status update) | ok |
| `win_kanban_card` | nenhum | **gap** — variante celebrativa (badge "WON" + valor) |
| `lose_kanban_card` | nenhum | **gap** — variante com motivo (loss reason) |
| `assign_card_moderator` | nenhum | **gap** — atribuicao com avatar |
| `list_kanban_cards` | tabela 04 generica | **gap** — variante kanban-style (cards stacked por coluna) |

### Contacts Agent (6 tools)

| Tool | Componente | Status |
|------|------------|--------|
| `add_contact_tag` | 15 (added chip) | ok |
| `remove_contact_tag` | 15 (removed chip) | ok |
| `get_custom_fields` | (ver System) | **gap** |
| `search_contacts` | 11 (single) | **gap** — variante multi-result (lista paginada) |
| `get_contact` | 11 Card Contato | ok |
| `update_contact_field` | nenhum | **gap** — diff de campo (antes -> depois) |

## 3. Erros e estados especiais

| Cenario | Componente | Status |
|---------|------------|--------|
| `anthropicKey` ausente (400) | nenhum | **gap** — banner persistente com CTA para [[credenciais-page]] |
| `403 Access denied` | nenhum | **gap** — toast/inline |
| `404 Conversation not found` | nenhum | **gap** — empty state especifico |
| `500 Internal server error` | 16 error block | ok |
| `429 Rate limit` (10/min) | nenhum | **gap** — toast com cooldown countdown |
| Mastra tool-error (cause chain) | 16 | ok parcial — falta exibir `cause` |
| Stream cancelado pelo user | nenhum | **gap** — marker inline "Cancelado pelo usuario" |
| Stream timeout (`llmStreamTimeoutMs`) | 16 | ok parcial |
| Circuit breaker MCP aberto | 16 | ok parcial |

## 4. Funcionalidades transversais

| Funcionalidade | Componente | Status |
|----------------|------------|--------|
| Slash command menu (`/`) | mencionado, nao desenhado | **gap** — popover com lista de comandos |
| Markdown rendering parcial (cod block ainda nao fechado) | 02/05 | ok parcial — verificar streaming behavior |
| Copy button em mensagens AI | nenhum | **gap** — icone copiar no hover |
| Citation/source markers | nenhum | **gap** — opcional, se agente retornar refs |
| Cost/usage footer | nenhum | **gap** — pequeno rodape "X tokens · $Y · Zs" |
| Stop/abort button durante streaming | input area atual | **gap** — variante do send btn em modo "parar" |
| Retry mensagem | nenhum | **gap** — botao "tentar novamente" em mensagens com erro |
| Edit user message | nenhum | **gap** — opcional |
| Regenerate response | nenhum | **gap** — opcional |

## 5. Resumo dos gaps por prioridade

### P0 — bloqueadores de UX (devem entrar na primeira versao)

1. **Banner `anthropicKey` ausente** — sem isso, a feature fica indisponivel sem feedback claro
2. **Cost/usage footer** — operador precisa ver quanto cada turn custou
3. **Stop/abort button** durante streaming — UX basica
4. **Cancelled state inline** — feedback visual quando user cancela
5. **Erro `code`-aware** — diferenciar NOT_FOUND, RATE_LIMIT, VALIDATION (cores/icones distintos)
6. **Slash command menu** — input ja preve, falta desenhar

### P1 — discovery tools faltantes (chamadas em maioria dos workflows)

7. **`get_channels`** — chips de canais (WhatsApp icone, Instagram icone)
8. **`get_kanbans`** — lista boards + colunas
9. **`get_moderators`** — lista com avatars
10. **`get_custom_fields`** — chips/lista
11. **`get_tags` read-only** — variante sem add/remove

### P2 — operacoes especificas comuns

12. **`win_kanban_card`** — celebrativa (verde + WON badge + valor)
13. **`lose_kanban_card`** — com loss reason (motivo)
14. **`assign_card_moderator`** — atribuicao com avatar
15. **`list_kanban_cards`** — kanban-style (cards stacked)
16. **`list_templates`** — badges de status (APPROVED/PENDING/REJECTED)
17. **`search_contacts`** — multi-result (variante de 11)
18. **`update_contact_field`** — diff antes/depois

### P3 — operacoes avancadas

19. **`get_template_status`** — bloco compacto (status + rejected_reason + quality_score)
20. **`get_template_buttons`** — lista QUICK_REPLY
21. **`sync_templates`** — progress
22. **`configure_template_params`** — mapping
23. **`get_draft`** — preview com diff
24. **`add_step_*` faltantes** — nodes do flow preview (condition, ab_test, action, run_automation, chat_action, kanban)
25. **Tag folders tree**

## 6. Specs propostas para os P0 + P1

### Banner `anthropicKey` ausente (P0)

- **Trigger:** GET conta com `anthropicKey === null` antes de abrir o chat
- **Layout:** banner topo da Chat Area, full-width, fill `$--amber-bg`, stroke esquerda 3px `$--amber-500`, padding `[12, 16]`
- **Conteudo:**
  - Icon `warning` 16px amber-500
  - Texto: "Configure sua chave da Anthropic para usar a Intelligence"
  - Botao secundario "Ir para credenciais" (link para [[credenciais-page]])

### Cost/usage footer (P0)

- **Trigger:** evento `done` recebido
- **Layout:** linha discreta abaixo da ultima mensagem AI (ou no card de status), 11/normal font-muted
- **Conteudo:** `1.247 tokens · $0.0034 · 4.2s`
  - Icone phosphor `lightning` opcional
  - Tooltip: detalhamento por step (`usage.steps[]`)

### Stop/abort button (P0)

- **Trigger:** `streaming === true`
- **Layout:** substitui o Send btn no input area
- **Visual:** 36x36 radius 10, fill `$--gray-200` (era brand-500), icon `square` (parar) preto
- **Acao:** dispara `POST /a2a/chat/:sessionId/cancel` + `abortController.abort()`

### Cancelled state inline (P0)

- **Trigger:** evento `cancelled` recebido
- **Layout:** badge inline ao final da ultima mensagem AI, padding `[4, 10]`, radius 9999, fill `$--gray-200`
- **Conteudo:** icone `slash` 12px + texto 11/500 "Cancelado pelo usuario"

### Erro `code`-aware (P0)

Variantes do bloco 16 error:
| `code` | Icone | Stroke esquerda | Cor texto | Acao |
|--------|-------|-----------------|-----------|------|
| `NOT_FOUND` | `magnifying-glass-minus` | gray-500 | gray-700 | "Verificar entrada" |
| `VALIDATION_ERROR` | `warning-circle` | amber-500 | amber-900 | "Corrigir e tentar de novo" |
| `FORBIDDEN` | `lock` | red-500 | red-700 | "Pedir permissao" |
| `RATE_LIMIT` | `clock-clockwise` | amber-500 | amber-900 | countdown `details.retryAfterSeconds` |
| `EXTERNAL_API_ERROR` | `cloud-warning` | red-500 | red-700 | "Tentar novamente" |
| `INTERNAL_ERROR` | `bug` | red-500 | red-700 | "Reportar erro" |

### Slash command menu (P0)

- **Trigger:** usuario digita `/` no input
- **Layout:** popover acima do input, 320w, radius 12, fill `$--gray-100`, stroke `$--gray-400`, shadow purple
- **Conteudo:** lista de comandos
  - Cada item: icon 16 + nome bold + descricao 11 muted
  - Comandos exemplo:
    - `/criar-flow` — Cria uma automacao
    - `/criar-template` — Cria template WhatsApp
    - `/listar-contatos` — Buscar contatos
    - `/listar-automacoes` — Ver automacoes ativas
    - `/criar-card` — Adicionar card no kanban
    - `/criar-tag` — Nova tag
- **Atalhos:** ↑↓ navega, Enter seleciona, Esc fecha

### Chips de canais — `get_channels` (P1)

- **Layout:** wrap de chips inline, gap 8
- **Visual por canal:**
  - WhatsApp: fill `#E8F5E9`, icon `whatsapp-logo` 14, texto 13/500 verde
  - Instagram: fill `#FCE4F4`, icon `instagram-logo` 14, texto 13/500 rosa
- **Cada chip:** padding `[6, 12]`, radius 9999, gap 6 — exibe nome + status (badge dot verde/cinza)

### Lista de kanbans — `get_kanbans` (P1)

- **Layout:** cards verticais, gap 12
- **Cada card:**
  - Header: nome do board + count "5 colunas"
  - Body: chips horizontais com nome de cada coluna (radius 9999, fill gray-200, padding `[4, 10]`)
- Reuso da estrutura de 12 Card de Automacao adaptada

### Lista de moderadores — `get_moderators` (P1)

- **Layout:** lista vertical, gap 8
- **Cada item:**
  - Avatar circular 32x32 (fill brand-100 + iniciais OU foto)
  - Nome 14/500 + email 11/normal muted
  - Badge `pending` opcional (radius 9999, fill amber-bg, texto amber-900)

### Custom fields — `get_custom_fields` (P1)

- **Layout:** lista vertical, gap 6
- **Cada item:** pill horizontal com nome + tipo (TEXT/NUMBER/DATE etc.) em badge cinza
- Versao chips compacta para inclusao inline em outros cards

### Tags read-only — `get_tags` variante (P1)

- Reuso de 15 mas sem chips adicionada/removida — apenas existentes
- Cada chip: padding `[0, 12]`, radius 9999, fill `$--brand-100`, texto 13/500 brand-700, alto 30
- Header opcional: "Tags da conta" + contador

## 7. Proximos passos

1. **Validar prioridade** — confirmar com produto se P0/P1 cobre primeira versao
2. **Desenhar P0** no `.pen` — 6 componentes (banner, cost footer, stop btn, cancelled, erros code-aware, slash menu)
3. **Desenhar P1** no `.pen` — 5 componentes de discovery
4. **Atualizar [[intelligence-a2a-prototipo]]** com os novos componentes (numerar 18+)
5. **P2/P3** ficam para fase 2 — manter como backlog visual

## 8. Decisoes pendentes

1. **Posicao do cost footer** — abaixo da mensagem ou rodape global do turn?
2. **Slash menu** — somente predefinidos ou tambem aceita free-text apos `/`?
3. **Erros** — toast (efemero) vs inline (persistente)? Para erro de tool, inline faz sentido; para 429, toast e melhor
4. **Anthropic banner** — persiste sempre ou pode ser dispensado? Sugestao: persiste ate `anthropicKey !== null`
5. **Stop btn animation** — fade ou substituicao instantanea?
