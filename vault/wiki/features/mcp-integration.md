---
title: MCP Integration
description: Servidor MCP do ChatFunnel — autenticacao, tokens, sessoes, tools, rate limiting e fluxo do usuario.
tags: [mcp, integration, frontend, api, auth, tokens]
related: ["[[channels]]", "[[automations]]", "[[chatfunnel-mcp]]", "[[crm-kanban]]", "[[contacts]]"]
last_updated: 2026-04-06
---

# MCP Integration

Servidor que implementa o **Model Context Protocol** — permite que LLMs (Claude, GPT, etc.) interajam com o ChatFunnel via tools padronizadas.

## Arquitetura

```
Cliente (Claude Desktop / GPT / SDK)
        |
        | JSON-RPC 2.0 via HTTP
        v
  MCP Server :8000 (NestJS)
        |
        | @chatfunnel/core
        v
  PostgreSQL + Redis
```

- **Wrapper fino** sobre `@chatfunnel/core` — usa os mesmos repositories e services que a API principal
- Toda operacao e scoped por `accountId` (multi-tenancy)
- Sessoes persistem no Redis (30 min TTL)

## Autenticacao

Dois tipos de token:

| Token | Vida util | Escopo | Uso |
|-------|-----------|--------|-----|
| **MCP JWT** | 15 min (configuravel) | Usuario (multi-account) | Sessoes do frontend, temporario |
| **Integration Token** (`mcp_live_...`) | Ilimitado ou com data | 1 account fixo | Integracoes externas, Claude Desktop |

### MCP JWT

- Gerado via `POST /mcp/token` passando o JWT do frontend no header `Authorization`
- Retorna token curto com lista de accounts do usuario
- Payload: `{ sub: userId, purpose: "mcp_access", accounts: [...], exp }`
- Assinado com `MCP_JWT_SECRET` (HS256)
- Precisa do header `Account-Selected` em requests subsequentes

### Integration Token

- Gerado via `POST /mcp/integration-tokens` (precisa de JWT valido + `Account-Selected`)
- Formato: `mcp_live_` + 32 bytes hex aleatorios
- **Mostrado uma unica vez** ao usuario — no banco so salva o hash SHA256
- Nao precisa de `Account-Selected` (account fixo no token)
- Pode ter `expiresAt` opcional
- Revogavel via `DELETE /mcp/integration-tokens/:id`

### Fluxo de validacao

```
Request com Authorization: Bearer <token>
  |
  +-- Comeca com "mcp_live_"? -> Hash + lookup no banco -> verifica revoked/expired
  +-- Senao -> Verifica como MCP JWT (signature, issuer, audience, purpose)
  +-- Fallback -> Legacy frontend JWT (se MCP_ALLOW_LEGACY_FRONTEND_JWT=true)
```

## Endpoints HTTP

| Metodo | Path | Descricao |
|--------|------|-----------|
| POST | `/mcp/token` | Trocar app JWT por MCP JWT de curta duracao |
| POST | `/mcp/integration-tokens` | Criar integration token |
| GET | `/mcp/integration-tokens` | Listar tokens do account |
| DELETE | `/mcp/integration-tokens/:id` | Revogar token |
| GET | `/mcp/health` | Health check / sessoes ativas |
| POST | `/mcp` | Inicializar sessao + tool calls (JSON-RPC) |
| GET | `/mcp` | SSE stream para respostas |
| DELETE | `/mcp` | Encerrar sessao |

## Tools Registradas (50+)

### Discovery (consulta de dados)

- `get_custom_fields` — campos customizados (usados em fluxos INPUT)
- `get_tags` — todas as tags do account
- `get_channels` — canais Instagram/WhatsApp conectados
- `get_kanbans` — boards com colunas
- `get_assistants` — assistentes IA
- `get_moderators` — membros da equipe

### Builder (construcao de automacoes)

- `create_trigger` — define gatilho (DM, comentario, story reaction, etc.)
- `add_step_message` — envia mensagem (texto, delay, input, midia, botoes)
- `add_step_delay` — espera (duracao fixa, ate data, horario restrito)
- `add_step_condition` — branch condicional com multiplas rotas
- `add_step_action` — add/remove tags, HTTP request, assistente IA, opt-in
- `add_step_kanban` — acoes CRM (add/mover card, atribuir moderador, win/lose)
- `add_step_ab_test` — teste A/B com percentuais e branches
- `add_step_follow_up` — follow-up com delay
- `add_step_run_automation` — chamar outra automacao
- `add_step_chat_action` — atribuir/remover moderador da conversa
- `build_automation` — cria/atualiza automacao a partir de trigger + steps

### Management (ciclo de vida)

- `list_automations`, `get_automation`, `toggle_automation`, `rename_automation`, `delete_automations`, `get_draft`

### Tags

- `create_tag`, `update_tag`, `delete_tag`, `list_tag_folders`, `create_tag_folder`, `delete_tag_folder`, `add_contact_tag`, `remove_contact_tag`

### Contacts

- `search_contacts` — busca por nome, telefone, email, tag, channel (paginado)
- `get_contact` — detalhes completos
- `update_contact_field` — atualiza campo customizado

### CRM / Kanban

- `create_kanban_card`, `move_kanban_card`, `win_kanban_card`, `lose_kanban_card`, `assign_card_moderator`, `list_kanban_cards`

### Templates

- Gestao de templates de mensagem

## Sessoes

- **Criacao:** `POST /mcp` com `method: "initialize"` → recebe `mcp-session-id` no header
- **Storage dual:** in-memory (fast path) + Redis (persistencia, TTL 30 min)
- **Reconexao:** se o processo reiniciar, sessao e recriada a partir do Redis
- **Encerramento:** `DELETE /mcp` ou expiracao automatica

## Rate Limiting

| Limite | Default | Janela |
|--------|---------|--------|
| Tool calls por sessao | 60 | 60s |
| Tool calls por account | 300 | 60s |
| Sessoes simultaneas | 5 | — |
| Criacao de sessoes | 10 | 60s |

- Implementado com Lua scripts no Redis (atomico, fail-closed)
- Retorna HTTP 429 com `Retry-After` header

## Fluxo do Usuario (passo a passo)

1. **Gerar token** — No painel de integracoes, usuario clica "Gerar Token MCP"
2. **Copiar token** — O `mcp_live_xxx` e exibido uma unica vez
3. **Configurar cliente** — Cola o token no Claude Desktop, Cursor, ou SDK
4. **Sessao automatica** — O cliente MCP inicializa sessao automaticamente
5. **Usar tools** — O LLM lista e chama tools conforme necessidade
6. **Renovar/revogar** — Usuario pode revogar token a qualquer momento no painel

## Frontend Service

`chatfunnel-front/src/common/services/McpService.ts` — usa `MCPApi` (aponta para `VITE_MCP_BASE_API`).

Metodos: `exchangeToken`, `health`, `createIntegrationToken`, `listIntegrationTokens`, `revokeIntegrationToken`.

Tipos exportados: `McpTokenResponse`, `McpHealthResponse`, `McpIntegrationToken`, `McpIntegrationTokenCreated`.

## Status

- [x] Backend MCP server completo (auth, sessoes, tools, rate limiting)
- [x] McpService.ts criado no frontend (`src/common/services/McpService.ts`)
- [x] Modal ConfigureMcp implementado (split panel, paleta ChatFunnel)
- [x] CORS habilitado no MCP server (`app.enableCors()` em main.ts)
- [x] Card MCP adicionado na IntegrationsScreen (com `onConfigure` pattern)
- [x] Skeleton component criado (`src/components/ui/skeleton/`)
- [x] AlertDialog imperativo (`useAlertDialog` + `AlertDialogProvider` em App.vue)
- [x] McpConnectionGuide — modal com tabs (ChatGPT, Claude Code, Cursor, API direta)
- [x] TabUnderline component criado (`src/components/shadcn-custom/tab-underline/`)
- [x] Token list com Badge "Revogado", sort (ativos primeiro), truncate, search
- [x] `showDialogConfirmation` integrado no revoke (substituiu SweetAlert2)
- [ ] Resolver auth "Selected account is not allowed by token" — verificar JWT_SECRET e DATABASE_URL do MCP
- [ ] Redesign do IntegrationsCard (migrar Vuetify → shadcn)

## Code Review — Pendencias (2026-04-06)

Issues levantadas no code review que precisam ser corrigidas:

### Criticas

- **C1** — `v-html` no McpSidebar (`step.text`) — vetor XSS se steps vierem de API no futuro. Substituir por rendering estruturado
- **C2** — `navigator.clipboard.writeText` sem try/catch em `index.vue` e `McpConnectionGuide.vue` — pode falhar em non-HTTPS ou sem foco

### Importantes

- **I1** — `VITE_URL_MCP_INSTRUCTION` so existe em `.env.local` — outros envs ficam `undefined`. Adicionar em `.env.dev`, `.env.staging`, `.env.production`
- **I2** — `truncatedToken` computed nao trunca nada — renomear para `tokenOrPlaceholder`
- **I3** — `copied` state compartilhado entre tabs no McpConnectionGuide — checkmark aparece em todas as tabs. Usar `copiedType` por comando
- **I4** — `handleCreateToken` e `handleRevokeToken` sem catch — erro silencioso pro usuario. Adicionar `showToastError`
- **I5** — z-index `999999999999999` no AlertDialog excede limite 32-bit CSS (max `2147483647`). Definir escala de z-index
- **I6** — Export `./McpService.ts` no barrel (`index.js`) usa extensao `.ts` — inconsistente com outros `.js`

### Sugestoes

- Lazy-load `McpConnectionGuide` com `defineAsyncComponent`
- Token list: distinguir empty state de erro de API (estado `error` separado)
- TabUnderline: adicionar CVA variants no `index.ts` para consistencia com design system
- McpSidebar: `health.sessions` e `health.uptime` sao recebidos mas nao renderizados (removidos?)

---

## Brainstorm: Redesign IntegrationsCard

Decisao: **Abordagem B — Header com Icone** (aprovada 2026-04-06).

### Design

- Icone 48x48 (`rounded-cf-xl`) com logo da marca
- Titulo + subtitulo (categoria) alinhados a esquerda
- Descricao abaixo
- Botoes outline usando tokens shadcn
- Green dot para indicar "configurado"

### Estados

1. **Sem chave** — botao "Configurar" outline
2. **Com chave** — green dot + botoes "Remover Chave" (danger) e "Configurar"
3. **Link externo** — botao "Abrir"
4. **Sem permissao** — opacity reduzida, botao desabilitado

## Brainstorm: Modal ConfigureMcp

Decisao: **Layout C — Split Panel** (aprovado 2026-04-06).

### Layout

Dialog `xl` (900px), dois paineis:

**Painel esquerdo (38%)** — fundo gradiente `brand-100 → green-100`:
- Logo + nome "Chatfunnel MCP"
- Steps 1-2-3 de como conectar (circulos brand-500)
- Card de status do servidor (online/offline, sessoes ativas, uptime) — usa `McpService.health()`

**Painel direito (62%)** — fundo branco:
- Header "Tokens de integracao" + DialogClose
- InputControl + Button "Criar token"
- Alerta success com token criado (exibido uma vez, botao copiar PhCopy)
- Input search com PhMagnifyingGlass (filtra tokens por nome)
- Skeleton loading (3 placeholders que espelham layout dos token items)
- Lista de tokens ativos com `max-h-64` scroll (nome, data, ultimo uso, botao revogar PhTrash)

### Paleta

Usa tokens do design system ChatFunnel:
- Brand: `brand-500` (#3CA1A1) — titulos, botoes, steps
- Gray: `gray-100` a `gray-1000` — textos, backgrounds
- Success: `green-100/200/700` — alerta token criado
- Destructive: `red-400` — botao revogar
- Shadow: `shadow-sombra-1` — inputs

### Componentes shadcn

- `Dialog`, `DialogContent` (size xl), `DialogClose`
- `Button` (default/primary para criar, outline/danger para revogar, icon/dark para copiar)
- `InputControl` (sem validacao)
- `Skeleton` (loading states)
- Icones Phosphor: `PhCheckCircle`, `PhCopy`, `PhKey`, `PhMagnifyingGlass`, `PhTrash`, `PhX`

### Componentizacao

```
ConfigureMcp/
  index.vue                 # Orquestra estado, Dialog, layout split
  components/
    McpSidebar.vue          # Painel esquerdo (logo, steps, health, botao "Ver instrucoes")
    McpTokenCreator.vue     # Input criar token + alerta token copiavel
    McpTokenList.vue        # Search, skeletons, empty state, lista com scroll + Badge revogado
    McpConnectionGuide.vue  # Modal instrucoes (DialogControl, TabUnderline, 4 clients)
```

- **index.vue** — estado, chamadas API, orquestracao, controla `guideOpen`
- **McpSidebar** — apresentacao pura, recebe `health`, emite `showGuide`
- **McpTokenCreator** — `v-model:name`, emite `create` e `copy`
- **McpTokenList** — search local, skeleton loading, sort (ativos primeiro), Badge revogado, truncate nome, emite `revoke`
- **McpConnectionGuide** — `DialogControl` com `TabUnderline` (ChatGPT, Claude Code, Cursor, API direta), comandos interpolados com token, botao copiar

### Gotchas

- IntegrationsCard usa `onConfigure` callback (nao `modal.value.showDialog()`) — Dialog shadcn e controlado por `v-model:open`
- CORS precisa estar habilitado no MCP server para requests do frontend
- O endpoint `/mcp/integration-tokens` requer JWT do frontend (nao aceita `mcp_live_*` tokens)

### Mockups

Salvos em `.superpowers/brainstorm/`:
- `2066-1775479797/card-approaches.html` — comparacao das 3 abordagens (A, B, C)
- `2066-1775479797/card-states.html` — 4 estados do card na abordagem B
- `557-1775485633/modal-layout.html` — comparacao 3 layouts (A, B, C)
- `557-1775485633/modal-split-v3.html` — mockup final aprovado
- `mcp-guide-modal/mockup-v2.html` — modal "Como conectar" por cima do ConfigureMcp

### Novos componentes criados

**TabUnderline** (`src/components/shadcn-custom/tab-underline/`):
- Pattern de composicao: `TabUnderline` > `TabUnderlineList` > `TabUnderlineItem` + `TabUnderlineContent`
- Provide/inject com `InjectionKey<TabUnderlineContext>`
- WAI-ARIA completo: `role="tablist/tab/tabpanel"`, `aria-selected`, `aria-controls`, `tabindex` roving
- Keyboard nav: ArrowLeft/Right, Home/End
- Props: `v-model`, `defaultValue`, `disabled`, `class`

**AlertDialog** (`src/components/ui/alert-dialog/`):
- `AlertDialog.vue` e `AlertDialogTrigger.vue` criados (wrappers Reka UI)
- `AlertDialogProvider.vue` montado no `App.vue` — renderiza o dialog global
- API imperativa via `useAlertDialog()`: `showConfirmation`, `showAlertSuccess`, `showAlertError`
- z-index acima de tudo (precisa corrigir para limite 32-bit)
