---
title: Credenciais Page — Design Spec
date: 2026-04-27
status: spec-draft
branch: refactory-main/mcp-token
related:
  - "../../../vault/wiki/features/credenciais-page.md"
  - "../../../vault/prototipos/credenciais-unification.pen"
  - "../specs/2026-04-27-table-component-design.md"
  - "../plans/2026-04-27-table-component.md"
tags: [spec, credentials, mcp, api-keys, configuration, chatfunnel-front]
---

# Credenciais Page — Design Spec

Substitui a tela legacy "Chaves API" e absorve o modal de Tokens MCP em uma única page `Credenciais` com 2 tabs (`api-keys`, `mcp-tokens`).

## Goal

1. Eliminar o modal de Tokens MCP em Integrações — token é credencial, pertence a "Credenciais".
2. Renomear sidebar "Chaves API" → "Credenciais", deixando claro que abrange ambos os tipos.
3. Padronizar UI: ambas as tabs usam o mesmo esqueleto (toolbar + DataTable + form em rota `/create` ou `/:id`).
4. Construir tudo do zero em `views/configuration/credentials/`. Não mover legacy — preservar para rollback manual.

## Out of scope

- Backend MCP (`tokenPrefix` na listagem) — fica pra outro momento; coluna "Token" da tab MCP **não existe** nesta entrega.
- Permissões dedicadas (`VIEW_CREDENTIALS`, etc.) — outro plano. Esta entrega **reusa** as permissões legacy: `VIEW_API_KEYS`, `ADD_API_KEY`, `EDIT_API_KEY` (módulo `CONFIGURATIONS`) para ambas as tabs.
- Migração de tokens MCP existentes (já estão no DB; só muda a UI de gestão).
- Storybook das pages.

## Decisões finais

| # | Decisão | Resposta |
|---|---------|----------|
| 1 | URL/rota | Path param: `/configuration/credentials/:tab` (`api-keys` \| `mcp-tokens`) |
| 2 | Verbos | `/create` para criação, `/:id` para update (api-keys somente — MCP não tem edit) |
| 3 | Localização | `views/configuration/credentials/` com subpastas `api-keys/` e `mcp-tokens/` |
| 4 | Service layer | Novo `CredentialsService.ts` agrupa APIKeys (delega `WhatsAppService.*`) + MCP (delega `McpService.*`). Uma camada só pra page. |
| 4a | Backend MCP | Reusa `McpService.createIntegrationToken / listIntegrationTokens / revokeIntegrationToken / health` — pronto |
| 4b | Backend APIKeys | Reusa `WhatsAppService.getAPIKeys / getAPIKeyById / saveAPIKey / deleteAPIKey` — pronto (legacy, endpoints `/accounts/apiKeys`) |
| 5 | Pós-criação MCP | Estado em `ref` interna (`createdToken`), sem param na URL. Refresh limpa. |
| 6 | Estrutura | Abordagem A — pastas por tipo |
| 7 | Legacy | NÃO move `whatsapp/APIKey.vue` nem `APIKeysList.vue`. Constrói do zero. |
| 8 | Rotas legacy | Removidas de `router/index.js:414-447`. Arquivos preservados. |
| 9 | Catálogos | `PERMISSIONS_CATALOG` e `EXPIRES_OPTIONS` espelham `whatsapp/APIKey.vue` |
| 10 | Step success | Sem step de "sucesso" no fluxo de criação — usa toast + redirect |
| 11 | Breadcrumb | Usa `@/components/ui/breadcrumb` (recém instalado) |
| 12 | Coluna Token MCP | **Não existe nesta entrega** — backend não retorna prefix. Lista mostra: Nome, Criado em, Último uso, Status, Ações |
| 13 | Permissões | Reusa legacy `VIEW_API_KEYS / ADD_API_KEY / EDIT_API_KEY` para ambas as tabs (módulo `CONFIGURATIONS`) |

## Mockups

`vault/prototipos/credenciais-unification.pen` — 4 frames travados:

| Frame | ID | Conteúdo |
|-------|----|---------|
| 01 | `tB9Ps` | Lista — tab Chaves API ativa |
| 02 | `eSjLf` | Form Nova chave API |
| 03 | `TrgKA` | Form Novo token MCP — estado pós-criação |
| 04 | `xbCwU` | Lista — tab Tokens MCP (server status strip + DataTable) |

## Rotas finais

```
/configuration/credentials                       → redirect → /credentials/api-keys
/configuration/credentials/api-keys              → CredentialsPage (tab api-keys, lista)
/configuration/credentials/api-keys/create       → CredentialsPage (tab api-keys, form)
/configuration/credentials/api-keys/:id          → CredentialsPage (tab api-keys, edit)
/configuration/credentials/mcp-tokens            → CredentialsPage (tab mcp-tokens, lista)
/configuration/credentials/mcp-tokens/create     → CredentialsPage (tab mcp-tokens, form + estado criado)
```

> **Nota arquitetural:** `CredentialsPage` é o wrapper. As rotas filhas decidem o que renderizar dentro do slot ativo da tab — lista ou form. Não usar `<RouterView>` aninhado profundo; ler `route.name` ou `route.params.id` no componente da tab para alternar lista vs form.

Rotas a remover de `chatfunnel-front/src/router/index.js:414-447`:
- `WhatsappAPIKeysList` (`api_keys`)
- `WhatsappAPIKeysCreate` (`api_keys/create`)
- `WhatsappAPIKeyPreview` (`api_keys/:id`)

Sidebar (`SideBarConfiguration.vue`):
- Item "Chaves API" renomeado para "Credenciais"
- `to` aponta para `/configuration/credentials/api-keys`
- Permissão de visibilidade: `VIEW_API_KEYS` (mesma de hoje)

## Estrutura de arquivos

```
chatfunnel-front/src/views/configuration/credentials/
  CredentialsPage.vue                # wrapper /credentials/:tab — header + breadcrumb + tabs
  composables/
    useCredentialsTabs.ts            # sincroniza tab ↔ URL (route.params.tab)
  api-keys/
    APIKeysList.vue                  # tab Chaves API (lista)
    APIKeyForm.vue                   # rota /create e /:id
    components/
      APIKeysTable.vue               # DataTable da lista
      APIKeyPermissions.vue          # checkbox table com PERMISSIONS_CATALOG
    constants.ts                     # PERMISSIONS_CATALOG, EXPIRES_OPTIONS (espelha legacy)
  services/
    CredentialsService.ts            # nova camada — delega WhatsAppService (APIKeys) + McpService
    __tests__/
      APIKeysList.spec.ts
      APIKeyForm.spec.ts
      APIKeyPermissions.spec.ts
  mcp-tokens/
    McpTokensList.vue                # tab Tokens MCP (lista)
    McpTokenForm.vue                 # rota /create + estado criado
    components/
      McpTokensTable.vue             # DataTable da lista (sem coluna token)
      McpServerStatus.vue            # strip de status (chama health no mount)
      McpConnectionGuide.vue         # tabs Claude Code/ChatGPT/Claude/Cursor/API + code blocks
    __tests__/
      McpTokensList.spec.ts
      McpTokenForm.spec.ts
      McpConnectionGuide.spec.ts
  __tests__/
    CredentialsPage.spec.ts
```

Arquivos a editar:
- `src/router/index.js` — adiciona rotas novas, remove legacy
- `src/components/sidebar/SideBarConfiguration.vue` — renomeia label e ajusta `to`

Legacy preservado (não tocar):
- `src/views/configuration/whatsapp/APIKey.vue`
- `src/views/configuration/whatsapp/APIKeysList.vue`
- `src/views/configuration/integrations/components/ConfigureMcp/**`

> Nota: o modal de Tokens MCP em Integrações continua funcional até a próxima entrega remover. O usuário verá os tokens em ambos os lugares temporariamente — aceitável durante rollout.

## CredentialsService (nova camada)

Localização: `chatfunnel-front/src/views/configuration/credentials/services/CredentialsService.ts`

Agrupa as chamadas de ambas as tabs em uma API tipada. Não duplica lógica — delega para os services existentes (`WhatsAppService`, `McpService`).

```ts
import { WhatsAppService } from "@services/WhatsAppService"
import McpService, {
  type McpIntegrationToken,
  type McpIntegrationTokenCreated,
  type McpHealthResponse
} from "@services/McpService"

export interface APIKey {
  id: string
  name: string
  permissions: Array<{ type: string }>
  expiresAt: string | null
  isActive: boolean
  apiKey?: string
}

export interface APIKeyForm {
  id?: string
  name: string
  permissions: Array<{ type: string }>
  expiresIn: string
}

export const CredentialsService = {
  apiKeys: {
    list: () => WhatsAppService.getAPIKeys(),
    getById: (id: string) => WhatsAppService.getAPIKeyById(id),
    save: (form: APIKeyForm) => WhatsAppService.saveAPIKey(form),
    delete: (ids: string[]) => WhatsAppService.deleteAPIKey(ids)
  },
  mcp: {
    list: () => McpService.listIntegrationTokens(),
    create: (name: string) => McpService.createIntegrationToken(name),
    revoke: (id: string) => McpService.revokeIntegrationToken(id),
    health: () => McpService.health()
  }
}
```

> **Nota:** types do MCP já existem em `McpService.ts`. Os de APIKey são novos — confirmar formato real do payload `WhatsAppService.saveAPIKey` no plan (ler `whatsapp/APIKey.vue` para extrair shape).

## Componentes UI usados

Todos de `@/components/ui/`:

| Componente | Uso |
|-----------|-----|
| `typography/PageTitle`, `typography/PageSubtitle` | Header da page |
| `breadcrumb` (recém instalado) | Trail no form: Credenciais > Chaves API > Nova chave |
| `tabs` | Switcher api-keys ↔ mcp-tokens |
| `card` | Containers de Identificação, Permissões, Server status, Connection guide |
| `button` | Ações primárias e secundárias |
| `input`, `inputControl` | Campos sem validação |
| `field`, `VeeInput`, `VeeSelect`, `VeeCheckbox` | Campos com validação (form) |
| `badge` | Status (Ativo/Expirada/Revogado), counter de permissões |
| `alert` | Estado pós-criação MCP ("Token criado") |
| `checkbox` | Tabela de permissões |
| `dialog` | Confirmação destrutiva (delete/revoke) |
| `skeleton` | Loading state nos cards e linhas da tabela |
| `tooltip` | Helpers contextuais (ex: ícone copy, último uso) |
| `table/DataTable` (novo, recém implementado) | Listas — selectable, row-clickable, empty state |

Phosphor icons: `PhMagnifyingGlass`, `PhPlus`, `PhTrash`, `PhCopy`, `PhSpinner`, `PhCheckCircle`, `PhArrowsClockwise`, `PhTerminal`, `PhKey`, `PhTray`.

## Comportamento

### CredentialsPage.vue (wrapper)

- Header: `PageTitle "Credenciais"` + `PageSubtitle "Gerencie chaves de API e tokens MCP da sua conta"`
- Tabs (`@/components/ui/tabs`):
  - `value` lido de `route.params.tab` via `useCredentialsTabs`
  - Troca de tab → `router.push({ name, params: { tab: novoValor } })`
  - Cada tab renderiza:
    - Lista quando `route.name === 'CredentialsTab'`
    - Form quando `route.name === 'CredentialsTabCreate'` ou `'CredentialsTabEdit'`
- Breadcrumb visível apenas em rotas de form

### Lista — APIKeysList.vue

- **Toolbar:**
  - `Input` com `PhMagnifyingGlass` (filtro client-side por `name`, debounce 200ms)
  - `Button outline danger` "Excluir selecionados" (visível quando `selectedIds.length > 0`)
  - `Button primary` "+ Nova chave"
- **DataTable:**
  - Colunas: Nome, Permissões (badge counter), Expira em, Status (badge Ativo/Expirada), Ações (Copy + Trash)
  - `selectable` + `row-clickable` (clique na linha → `/api-keys/:id`)
  - `empty-title` "Nenhuma chave criada" + `empty-description` "Crie sua primeira chave de API para integrar serviços externos"
  - Empty state filtrado: "Nenhuma chave encontrada para '{search}'"
- **Loading:** skeleton rows nativos do DataTable
- **Bulk delete:** `useAlerts().showDialogConfirmation("Excluir N chaves? Esta ação não pode ser desfeita")` → `CredentialsService.apiKeys.delete(ids)` (bulk built-in via `WhatsAppService.deleteAPIKey`) → toast sucesso → refetch
- **Copy:** clipboard API + toast "Token copiado"

### Lista — McpTokensList.vue

- **Toolbar idêntica** (search + bulk + "+ Novo token MCP")
- **Server status strip** (`McpServerStatus.vue`):
  - Chama `McpService.health()` no mount
  - Estado online: ícone `PhCheckCircle` brand-100/700 + texto "Servidor MCP online"
  - Estado offline: tom warning + "Servidor MCP indisponível"
- **DataTable:**
  - Colunas: Nome, Criado em, Último uso, Status (Ativo/Revogado), Ações (Trash)
  - **Sem coluna Token** (backend não retorna prefix — fora de escopo)
  - `selectable`, **sem** `row-clickable` (não há detalhe pra abrir; MCP só cria + revoga)
  - Empty: "Nenhum token MCP criado" + "Tokens MCP permitem que ferramentas externas (Claude Code, ChatGPT, Cursor) acessem seus dados"
- **Bulk revoke:** `useAlerts().showDialogConfirmation("Revogar N tokens? Esta ação não pode ser desfeita")` + `Promise.all(ids.map((id) => CredentialsService.mcp.revoke(id)))` (não há bulk no backend MCP; loop client-side)

### Form — APIKeyForm.vue

- **Modo via `route.params.id`:** undefined = create, presente = edit
- **Breadcrumb:** Credenciais > Chaves API > {Nova chave | Editar chave}
- **Card Identificação:** `VeeInput` nome (max 60), `VeeSelect` "Expira em" (`EXPIRES_OPTIONS`)
- **Card Permissões:** `APIKeyPermissions.vue`:
  - Header com título + subtítulo + badge counter (componente externo à Table — fora do `DataTable`, decisão do dia 27)
  - Tabela de checkboxes com `PERMISSIONS_CATALOG`
- **Validação Zod:**
  ```ts
  z.object({
    name: z.string().min(1, "Nome obrigatório").max(60),
    permissions: z.array(z.string()).min(1, "Selecione ao menos 1 permissão"),
    expiresIn: z.enum([...EXPIRES_OPTIONS_VALUES])
  })
  ```
- **Submit:** `CredentialsService.apiKeys.save(form)` (delega `WhatsAppService.saveAPIKey` — POST se sem `form.id`, PUT se com)
  - create → toast "Chave criada" → `router.push("/credentials/api-keys")`
  - edit → toast "Chave atualizada" → idem
  - Erro: tratado pelo Axios interceptor global (regra: no redundant catches)
- **Edit popula** via `CredentialsService.apiKeys.getById(id)` no `onMounted` → reset do form

### Form — McpTokenForm.vue

- **Sem `:id`** (backend não permite re-exibir token plaintext)
- **Estado interno:** `const createdToken = ref<McpIntegrationTokenCreated | null>(null)`
  - `null` → modo "criar"
  - preenchido → modo "criado"
- **Breadcrumb:** Credenciais > Tokens MCP > {Novo token | Token criado}
- **Modo criar:**
  - `VeeInput` nome (obrigatório, max 60)
  - Footer: `Button outline` "Cancelar" (volta pra lista) + `Button primary` "Gerar token"
  - Submit: `CredentialsService.mcp.create(name)` (delega `McpService.createIntegrationToken`) → atribui resposta a `createdToken`
- **Modo criado:**
  - `Alert success` "Token criado com sucesso! Copie agora — não será mostrado novamente."
  - Token visível (mono) + botão `PhCopy`
  - Card "Como conectar" (`McpConnectionGuide.vue`):
    - Tabs: Claude Code | ChatGPT | Claude | Cursor | API
    - Claude Code é a tab inicial ativa (decisão do dia 27)
    - Cada tab: code block com comando pronto + botão copy + step text "1. Copie o comando 2. Cole no terminal/config"
  - Footer: `Button outline` "Gerar novo token" (reseta `createdToken = null`) + `Button primary` "Concluir" (volta pra lista)
- **`useCanLeave` guard:** se `createdToken` existe e usuário não viu/copiou, dialog "Tem certeza? O token não pode ser recuperado depois"

## Estados

| Estado | Tratamento |
|--------|-----------|
| Loading lista | Skeleton rows do DataTable (já implementado) |
| Loading edit | Skeleton dentro dos cards (espelha layout final) |
| Empty natural | `empty-title` + `empty-description` específicos por tab |
| Empty filtrado | Variante "Nenhum resultado para '{search}'" |
| Error | Axios interceptor global (toast); sem try/catch local |
| Validação | VeeValidate inline abaixo do input via `Field` |
| Confirmação destrutiva | `useAlerts().showDialogConfirmation` |
| MCP server offline | Strip warning visível; ainda permite criar token (backend valida) |

## Testes

`Vitest` + `@testing-library/vue` (happy-dom). Sem snapshots. Mocks via `vi.mock("@services/...")`.

**Cobertura mínima por arquivo:**

| Arquivo | Casos |
|---------|-------|
| `CredentialsPage.spec.ts` | Renderiza tab correta por param; troca de tab atualiza URL; redirect raiz → api-keys |
| `APIKeysList.spec.ts` | Lista, filtra por search, bulk delete confirma e chama service, click linha navega pra edit |
| `APIKeyForm.spec.ts` | Cria com payload válido; edit popula via get; validação dispara; redireciona após submit |
| `APIKeyPermissions.spec.ts` | Toggle individual atualiza counter; counter reflete length |
| `McpTokensList.spec.ts` | Lista, filtra, bulk revoke chama service, server status strip mostra estado |
| `McpTokenForm.spec.ts` | Modo criar → submit gera token; modo criado mostra alert + copy; "Gerar novo" reseta estado |
| `McpConnectionGuide.spec.ts` | Tab Claude Code default; switch tab mostra comando correto; copy chama clipboard |

## Spec self-review (concluído 2026-04-28)

- [x] Sem placeholders TBD não resolvidos no escopo desta entrega
- [x] Sem contradições entre seções (rotas vs estrutura, comportamento vs estados)
- [x] Backend MCP confirmado — `McpService` em `chatfunnel-front/src/common/services/McpService.ts:30-47` tem todos os métodos usados
- [x] APIKeys não tem service dedicado; vai por `WhatsAppService` (`getAPIKeys / getAPIKeyById / saveAPIKey / deleteAPIKey` — endpoints `/accounts/apiKeys`). Resolução: criar `CredentialsService.ts` que delega (decisão #4)
- [x] `useAlerts` confirmado em `chatfunnel-front/src/common/composables/AlertsComposable.js:22`. Métodos relevantes: `showDialogConfirmation(message, options?)`, `showToastSuccess(message)`, `showToastError(message)`. Spec ajustado para a assinatura real (`message: string`, não objeto)

**Pendências menores pro plan resolver:**
- Shape exato do payload `WhatsAppService.saveAPIKey` (ler `whatsapp/APIKey.vue` para extrair)
- Valores exatos de `PERMISSIONS_CATALOG` e `EXPIRES_OPTIONS` do legacy

## Próximo passo

1. User valida este spec
2. Invocar `superpowers:writing-plans` → produz `docs/superpowers/plans/2026-04-27-credenciais-page.md` com tarefas T1..Tn, dependencies, e gates de teste
3. Atualizar `vault/wiki/features/credenciais-page.md` apontando pra este spec
