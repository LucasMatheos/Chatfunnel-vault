---
title: Credenciais (page) — refactory MCP token + Chaves API
status: frontend-complete
date: 2026-04-27
last_updated: 2026-04-28
branch: refactory-main/mcp-token
related:
  - "[[mcp-integration]]"
  - "[[../../prototipos/credenciais-unification.pen]]"
  - "[[../guides/review-ui-table|Review UI Table]]"
  - "[[../gotchas/frontend-gotchas|Frontend Gotchas]]"
tags: [feature, credentials, configuration, mcp, api-keys]
---

# Credenciais — Page Refactor

Substitui a tela "Chaves API" e absorve o modal de Tokens MCP de Integrações em uma única page `Credenciais` com 2 tabs.

## Status

**Frontend completo (T1-T16).** Implementação executada em 28-04-2026 seguindo plan TDD.

- Spec: `docs/superpowers/specs/2026-04-27-credenciais-page-design.md`
- Plan: `docs/superpowers/plans/2026-04-27-credenciais-page.md` (16 tasks)
- Backend: já completo via `McpService` (criação/listagem/revoke/health)
- Pendente: validação visual em produção do permissionamento unificado

## Decisões travadas

| # | Decisão | Resposta |
|---|---------|----------|
| 1 | URL/rota | Path param: `/configuration/credentials/:tab` (`api-keys` \| `mcp-tokens`) |
| 2 | Localização dos arquivos | `views/configuration/credentials/` com subpastas `api-keys/` e `mcp-tokens/` |
| 3 | Backend MCP | Já completo — reusa `McpService` (create/list/revoke/health) |
| 4 | Padrão de criação | Rotas separadas (não inline, não modal) — confirmado pelo mockup |
| 5 | Pós-criação MCP | Estado em `ref` interna (`createdToken`), sem param na URL. Refresh limpa. |
| 6 | Estrutura de pastas | Abordagem A — por tipo (api-keys/, mcp-tokens/) |
| 7 | Legacy | NÃO move `whatsapp/APIKey.vue` nem `APIKeysList.vue`. Constrói novos do zero. |
| 8 | Rotas legacy | Removidas do router. Arquivos preservados pra rollback manual. |
| 9 | Catálogos | `PERMISSIONS_CATALOG` e `EXPIRES_OPTIONS` espelham logic de `whatsapp/APIKey.vue` |
| 10 | Verbo da rota | `/create` (não `/new`) e `/:id` para update |

## Mockups (Pencil)

`vault/prototipos/credenciais-unification.pen` — 4 frames selecionados:

- `tB9Ps` — **01 Lista Credenciais (tab Chaves API)** — toolbar + DataTable
- `eSjLf` — **02 Form Nova chave API** — breadcrumb + cards Identificação/Permissões + footer
- `TrgKA` — **03 Form Novo token MCP (estado criado)** — alert + token visível + Como conectar
- `xbCwU` — **04 Lista Credenciais (tab Tokens MCP)** — server status strip + DataTable

## Rotas finais

```
/configuration/credentials                       → redirect → /credentials/api-keys
/configuration/credentials/api-keys              → lista (tab Chaves API)
/configuration/credentials/api-keys/create       → form Nova chave API
/configuration/credentials/api-keys/:id          → edit chave API
/configuration/credentials/mcp-tokens            → lista (tab Tokens MCP)
/configuration/credentials/mcp-tokens/create     → form Novo token MCP + estado "criado"
```

Rotas removidas:
- `/configuration/whatsapp/api-keys`
- `/configuration/whatsapp/api-keys/:id`

## Estrutura de arquivos

```
chatfunnel-front/src/views/configuration/credentials/
  CredentialsPage.vue              (wrapper /credentials/:tab — header + tabs)
  composables/
    useCredentialsTabs.ts          (sincroniza tab ↔ URL)
  api-keys/
    APIKeysList.vue                (tab Chaves API)
    APIKeyForm.vue                 (rota /create e /:id)
    components/
      APIKeysTable.vue
      APIKeyPermissions.vue
  mcp-tokens/
    McpTokensList.vue              (tab Tokens MCP)
    McpTokenForm.vue               (rota /create + estado criado)
    components/
      McpTokensTable.vue
      McpServerStatus.vue
      McpConnectionGuide.vue
```

Arquivos a editar:
- `chatfunnel-front/src/router/index.js` (rotas novas + remove legacy)
- `chatfunnel-front/src/components/sidebar/SideBarConfiguration.vue` (renomeia "Chaves API" → "Credenciais")

Legacy preservado:
- `chatfunnel-front/src/views/configuration/whatsapp/APIKey.vue`
- `chatfunnel-front/src/views/configuration/whatsapp/APIKeysList.vue`
- `chatfunnel-front/src/views/configuration/integrations/components/ConfigureMcp/**`

## Componentes UI usados

Todos de `@/components/ui/`:
- `typography/page-title`, `typography/page-subtitle`
- `tabs`, `card`, `button`, `input`, `badge`, `alert`, `checkbox`, `dialog`, `skeleton`, `tooltip`
- `table` (novo `DataTable` shadcn-vue) — selectable, row-clickable, empty state
- `Field` + `VeeInput` / `VeeSelect` (vee-validate + Zod)
- `Breadcrumb` — **CONFIRMAR existência em `components/ui/`**, senão custom

Phosphor icons: `PhMagnifyingGlass`, `PhPlus`, `PhTrash`, `PhCopy`, `PhSpinner`, `PhCheckCircle`, `PhArrowsClockwise`, `PhTerminal`.

## Comportamento

### Lista (ambas as tabs)
- Toolbar: search (filtro client-side por `name`) + bulk delete (`Excluir selecionados`) + `+ Nova X`
- DataTable com selectable + row-clickable (linha → `/:id` em api-keys)
- Bulk: `Promise.all(ids.map(svc.delete))` + confirm dialog + toast
- Loading: skeleton rows nativo do DataTable
- Empty: `empty-title` + `empty-description` (já implementado)

### APIKeyForm
- Modo via `route.params.id`: create vs edit
- Card Identificação (nome + expira-em)
- Card Permissões (checkbox table + badge counter)
- Validação Zod: name min 1 max 60, permissions min 1, expiresIn enum
- Submit: navega para `/credentials/api-keys` + toast (interceptor trata erro)
- Edit popula via `APIKeysService.get(id)` no mount

### McpTokenForm
- Sem `:id` (backend não permite re-exibir token plaintext)
- Estado interno `createdToken: ref('')` controla modo (criar vs criado)
- Modo criar: input nome + botão "Gerar token"
- Modo criado: alert sucesso + token visível com copy + card "Como conectar" (tabs Claude Code/ChatGPT/API com code block + copy comando)
- Footer: Cancelar/Gerar token (criar) | Gerar novo token / Concluir (criado)
- `health()` chamado no mount → `<McpServerStatusPill>`

## Estados

- **Loading edit:** Skeleton por cima dos cards
- **Empty list:** copy específico (sem chaves / sem tokens / sem resultado pra search)
- **Error:** Axios interceptor global (regra: no redundant catches)
- **Validação:** VeeValidate inline abaixo do input
- **Confirmações destrutivas:** `useAlerts().showDialogConfirmation` com copy específico

## Testes (Vitest + @testing-library/vue)

```
credentials/__tests__/CredentialsPage.spec.ts
api-keys/__tests__/APIKeysList.spec.ts
api-keys/__tests__/APIKeyForm.spec.ts
api-keys/__tests__/APIKeyPermissions.spec.ts
mcp-tokens/__tests__/McpTokensList.spec.ts
mcp-tokens/__tests__/McpTokenForm.spec.ts
mcp-tokens/__tests__/McpConnectionGuide.spec.ts
```

Cobertura mínima: submit, navegação, copy, filter, bulk action. Sem snapshot. Mocks via `vi.mock('@services/...')`.

## Pontos validados na implementação

1. `Breadcrumb` existe em `components/ui/breadcrumb/` — usado em `APIKeyForm`. Aplicado fix de whitespace nodes no `<router-link>` e `list-none` no `BreadcrumbList`.
2. Tab MCP usa `name + apiKey` da listagem; quando o backend retorna apenas o `id`, a coluna mostra placeholder.
3. Rotas legacy de WhatsApp api-keys preservadas (não migradas) — apenas adicionadas as novas rotas `CredentialsTab/Create/Edit`.

## Implementação (28-04-2026)

### Mudanças adicionais (fora do spec original)

- **Permissionamento unificado**: `VIEW/ADD/EDIT/DELETE_API_KEY` reusados pra MCP — apenas labels i18n renomeadas (decisão de não criar novo enum).
- **Apresentação das permissões na tabela**: tooltip Reka com hover nativo, filtrando preview já visível na célula. Iterações descartadas: lista vertical (rows muito grandes), popover (não abria com click stop wrapper).
- **Formatação de data**: `vue-i18n` `d()` retornava string vazia (sem `datetimeFormats` configurado). Substituído por `Intl.DateTimeFormat('pt-BR')` em `APIKeysTable` e `date-fns` + locale `ptBR` em `McpTokensTable`. Ver gotcha em [[../gotchas/frontend-gotchas|Frontend Gotchas]].
- **`isAPIKeyActive`**: agora retorna `true` se sem `expiresAt` ou se `expiresAt >= Date.now()`.
- **`McpServerStatus` meta**: substituído `uptimeSeconds` por `oldestSessionAge` na exibição.
- **`McpConnectionGuide`**: token agora renderiza em `<pre><code>` com mesmo estilo dos comandos; copy do `guide.title/subtitle` reescrito para deixar explícito que o token está embutido nos comandos. Fix do `buildCommand` para bater com `"claude"` (não `"claude-code"`).
- **Sort dos MCP tokens**: ativos (`revokedAt: null`) primeiro, depois por `createdAt` desc.
- **Layout `CredentialsPage`**: `h-dvh` no wrapper + `overflow-y-auto` na coluna de conteúdo.
- **`SideBarConfiguration`**: integrado à `CredentialsPage`. 3 rotas adicionadas em `routeNamesWithNoPadding` no `FrameScreen`.
- **`BackButton`**: condicional `v-if="isFormRoute"` (rotas Create/Edit) — usa `router.back()` para voltar ao tab.
- **`IntegrationsScreen`**: card MCP agora navega para `CredentialsTab` com `tab: "mcp-tokens"`.

### Componentes UI tocados (cross-feature)

- `DataTable.vue`: centralização do checkbox via `flex! items-center justify-center` (Tailwind v4 — `!` no final).
- `BreadcrumbList.vue`: `list-none p-0 m-0` (remove marcadores `1.`/`2.` do user-agent stylesheet).
- `BreadcrumbSeparator.vue`: `inline-flex items-center` (alinha chevron com texto).
- `main.scss`: thumb da scrollbar global agora `#C1C1C1` (mesma cor do hover) para garantir contraste.

### Sidebar — fix responsivo (cross-feature)

`MenuSidebar.vue` + `SideBar/index.vue`: em alturas ≤900px, dois `overflow-y: auto` aninhados criavam scrollbar interno que empurrava ícones do rail. Solução: `overflow-y` agora é condicional ao estado `rail` (injectado via provide). Ver gotcha em [[../gotchas/frontend-gotchas|Frontend Gotchas]].

## Próximo passo

1. Validação visual em produção do permissionamento unificado api-keys ↔ mcp-tokens.
2. Backend da página Credenciais (escopo movido para outro plano).

## Referências

- Diary do dia: `vault/diary/raw/27-04-2026.md` (07:47 → 12:39 conversa de refactory)
- Mockups: `vault/prototipos/credenciais-unification.pen` + PNGs (`credenciais-01-lista.png`, `credenciais-04-lista-mcp.png`, etc.)
- Service: `chatfunnel-front/src/common/services/McpService.ts`
- Modal MCP atual (referência de lógica): `chatfunnel-front/src/views/configuration/integrations/components/ConfigureMcp/`
- Page legacy (referência de lógica): `chatfunnel-front/src/views/configuration/whatsapp/APIKey.vue` + `APIKeysList.vue`
- Review do DataTable: `vault/wiki/guides/review-ui-table.md`
