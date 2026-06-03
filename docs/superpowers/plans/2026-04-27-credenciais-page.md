# Credenciais Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir page `Credenciais` com 2 tabs (`api-keys` + `mcp-tokens`) substituindo a tela legacy "Chaves API" e absorvendo o modal MCP de Integrações.

**Architecture:** Page wrapper (`CredentialsPage.vue`) com tabs sincronizadas via path param (`/configuration/credentials/:tab`). Cada tab tem sua própria pasta com lista, form e sub-componentes. Service layer dedicado (`CredentialsService.ts`) delega para `WhatsAppService` (APIKeys legacy) e `McpService` (MCP). Legacy preservado para rollback.

**Tech Stack:** Vue 3.5 + `<script setup lang="ts">` + Tailwind v4 + shadcn-vue (incluindo `breadcrumb` recém instalado e o `DataTable` novo) + VeeValidate + Zod + Vitest + `@testing-library/vue` (happy-dom) + Phosphor icons.

**Spec:** `docs/superpowers/specs/2026-04-27-credenciais-page-design.md`

---

## File Structure

### Created files

```
chatfunnel-front/src/views/configuration/credentials/
  CredentialsPage.vue                       # Wrapper /credentials/:tab — header + breadcrumb + tabs
  composables/
    useCredentialsTabs.ts                   # Sincroniza tab ↔ URL
  services/
    CredentialsService.ts                   # Delega WhatsAppService + McpService
  api-keys/
    APIKeysList.vue                         # Tab Chaves API (lista)
    APIKeyForm.vue                          # Rota /create e /:id
    constants.ts                            # PERMISSIONS_CATALOG, EXPIRES_OPTIONS
    components/
      APIKeysTable.vue                      # DataTable da lista
      APIKeyPermissions.vue                 # Checkbox table com PERMISSIONS_CATALOG
    __tests__/
      APIKeysList.spec.ts
      APIKeyForm.spec.ts
      APIKeyPermissions.spec.ts
  mcp-tokens/
    McpTokensList.vue
    McpTokenForm.vue
    components/
      McpTokensTable.vue                    # DataTable da lista (sem coluna token)
      McpServerStatus.vue                   # Strip status (chama health)
      McpConnectionGuide.vue                # Tabs Claude Code/ChatGPT/Claude/Cursor/API
    __tests__/
      McpTokensList.spec.ts
      McpTokenForm.spec.ts
      McpConnectionGuide.spec.ts
  __tests__/
    CredentialsPage.spec.ts
```

### Modified files

- `chatfunnel-front/src/router/index.js` — adiciona rotas novas, remove legacy (`api_keys` block:414-447)
- `chatfunnel-front/src/components/sidebar/SideBarConfiguration.vue` — renomeia label "Chaves API" → "Credenciais" + ajusta `to`

### Preserved (não tocar)

- `chatfunnel-front/src/views/configuration/whatsapp/APIKey.vue`
- `chatfunnel-front/src/views/configuration/whatsapp/APIKeysList.vue`
- `chatfunnel-front/src/views/configuration/integrations/components/ConfigureMcp/**`

---

## Task Order (dependency-aware)

```
T1 CredentialsService ────────────────────┐
T2 useCredentialsTabs ──────────┐         │
T3 constants ───────┐           │         │
                    ▼           │         │
T4 APIKeyPermissions            │         │
                                │         │
T5 APIKeysTable ◄───────────────┼─────────┤
T6 APIKeysList ◄────────────────┼─────────┤
T7 APIKeyForm ◄─────────────────┼─────────┤
T8 McpServerStatus ◄────────────┼─────────┤
T9 McpConnectionGuide           │         │
T10 McpTokensTable ◄────────────┼─────────┤
T11 McpTokensList ◄─────────────┼─────────┤
T12 McpTokenForm ◄──────────────┼─────────┘
T13 CredentialsPage ◄───────────┘
T14 Router (rotas novas + remove legacy)
T15 Sidebar (rename label)
T16 Integration check (typecheck + tests + lint + manual smoke)
```

---

### Task 1: CredentialsService (service layer)

**Files:**
- Create: `chatfunnel-front/src/views/configuration/credentials/services/CredentialsService.ts`
- Test: `chatfunnel-front/src/views/configuration/credentials/services/__tests__/CredentialsService.spec.ts`

- [ ] **Step 1: Read legacy `WhatsAppService.saveAPIKey` to confirm payload shape**

Run: read `chatfunnel-front/src/common/services/WhatsAppService.js` lines 51-63 e arquivo `chatfunnel-front/src/views/configuration/whatsapp/APIKey.vue` (especialmente `submit` / `save` / `data()`) para extrair a forma exata do payload (`name`, `permissions: Array<{type}>`, `expiresIn`).

Anote o shape — vai ser usado na interface `APIKeyForm` deste task e nos forms (T7).

- [ ] **Step 2: Write the failing test**

```ts
// chatfunnel-front/src/views/configuration/credentials/services/__tests__/CredentialsService.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@services/WhatsAppService', () => ({
  WhatsAppService: {
    getAPIKeys: vi.fn(),
    getAPIKeyById: vi.fn(),
    saveAPIKey: vi.fn(),
    deleteAPIKey: vi.fn()
  }
}))

vi.mock('@services/McpService', () => ({
  default: {
    listIntegrationTokens: vi.fn(),
    createIntegrationToken: vi.fn(),
    revokeIntegrationToken: vi.fn(),
    health: vi.fn()
  }
}))

import { WhatsAppService } from '@services/WhatsAppService'
import McpService from '@services/McpService'
import { CredentialsService } from '../CredentialsService'

describe('CredentialsService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('apiKeys', () => {
    it('list delegates to WhatsAppService.getAPIKeys', () => {
      CredentialsService.apiKeys.list()
      expect(WhatsAppService.getAPIKeys).toHaveBeenCalledOnce()
    })

    it('getById delegates to WhatsAppService.getAPIKeyById', () => {
      CredentialsService.apiKeys.getById('abc-123')
      expect(WhatsAppService.getAPIKeyById).toHaveBeenCalledWith('abc-123')
    })

    it('save delegates to WhatsAppService.saveAPIKey with form payload', () => {
      const form = { name: 'Test', permissions: [{ type: 'READ' }], expiresIn: '30d' }
      CredentialsService.apiKeys.save(form)
      expect(WhatsAppService.saveAPIKey).toHaveBeenCalledWith(form)
    })

    it('delete delegates to WhatsAppService.deleteAPIKey with array of ids', () => {
      CredentialsService.apiKeys.delete(['id-1', 'id-2'])
      expect(WhatsAppService.deleteAPIKey).toHaveBeenCalledWith(['id-1', 'id-2'])
    })
  })

  describe('mcp', () => {
    it('list delegates to McpService.listIntegrationTokens', () => {
      CredentialsService.mcp.list()
      expect(McpService.listIntegrationTokens).toHaveBeenCalledOnce()
    })

    it('create delegates to McpService.createIntegrationToken with name', () => {
      CredentialsService.mcp.create('Claude Code')
      expect(McpService.createIntegrationToken).toHaveBeenCalledWith('Claude Code')
    })

    it('revoke delegates to McpService.revokeIntegrationToken with id', () => {
      CredentialsService.mcp.revoke('token-1')
      expect(McpService.revokeIntegrationToken).toHaveBeenCalledWith('token-1')
    })

    it('health delegates to McpService.health', () => {
      CredentialsService.mcp.health()
      expect(McpService.health).toHaveBeenCalledOnce()
    })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd chatfunnel-front && npx vitest run src/views/configuration/credentials/services`
Expected: FAIL with "Cannot find module '../CredentialsService'"

- [ ] **Step 4: Implement CredentialsService**

```ts
// chatfunnel-front/src/views/configuration/credentials/services/CredentialsService.ts
import { WhatsAppService } from '@services/WhatsAppService'
import McpService from '@services/McpService'

export interface APIKeyPermission {
  type: string
}

export interface APIKey {
  id: string
  name: string
  permissions: APIKeyPermission[]
  expiresAt: string | null
  isActive: boolean
  apiKey?: string
}

export interface APIKeyForm {
  id?: string
  name: string
  permissions: APIKeyPermission[]
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

- [ ] **Step 5: Run test to verify it passes**

Run: `cd chatfunnel-front && npx vitest run src/views/configuration/credentials/services`
Expected: PASS (8 tests)

- [ ] **Step 6: Typecheck**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit -p tsconfig.app.json 2>&1 | grep "credentials/services"`
Expected: nenhum erro relacionado a `credentials/services`

- [ ] **Step 7: Commit**

```bash
cd chatfunnel-front
git add src/views/configuration/credentials/services/
git commit -m "feat(credentials): add CredentialsService delegating to WhatsAppService and McpService"
```

---

### Task 2: useCredentialsTabs composable

**Files:**
- Create: `chatfunnel-front/src/views/configuration/credentials/composables/useCredentialsTabs.ts`
- Test: `chatfunnel-front/src/views/configuration/credentials/composables/__tests__/useCredentialsTabs.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// chatfunnel-front/src/views/configuration/credentials/composables/__tests__/useCredentialsTabs.spec.ts
import { describe, it, expect } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { render, fireEvent } from '@testing-library/vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import { useCredentialsTabs, CREDENTIALS_TABS } from '../useCredentialsTabs'

const Probe = defineComponent({
  setup() {
    const tabs = useCredentialsTabs()
    return { tabs }
  },
  template: `
    <div>
      <span data-testid="active">{{ tabs.activeTab.value }}</span>
      <span data-testid="is-valid">{{ tabs.isValidTab.value }}</span>
      <button data-testid="switch-mcp" @click="tabs.switchTo('mcp-tokens')">go-mcp</button>
    </div>
  `
})

const setup = async (initialPath: string) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/configuration/credentials', redirect: '/configuration/credentials/api-keys' },
      { path: '/configuration/credentials/:tab', name: 'CredentialsTab', component: Probe },
      { path: '/configuration/credentials/:tab/create', name: 'CredentialsTabCreate', component: Probe }
    ]
  })
  await router.push(initialPath)
  await router.isReady()
  const utils = render(Probe, { global: { plugins: [router] } })
  return { ...utils, router }
}

describe('useCredentialsTabs', () => {
  it('exposes the catalog of tabs', () => {
    expect(CREDENTIALS_TABS).toEqual(['api-keys', 'mcp-tokens'])
  })

  it('activeTab reflects route.params.tab', async () => {
    const { getByTestId } = await setup('/configuration/credentials/mcp-tokens')
    expect(getByTestId('active').textContent).toBe('mcp-tokens')
    expect(getByTestId('is-valid').textContent).toBe('true')
  })

  it('isValidTab is false for unknown tab values', async () => {
    const { getByTestId } = await setup('/configuration/credentials/banana')
    expect(getByTestId('is-valid').textContent).toBe('false')
  })

  it('switchTo navigates to the tab list route preserving CredentialsTab name', async () => {
    const { getByTestId, router } = await setup('/configuration/credentials/api-keys')
    await fireEvent.click(getByTestId('switch-mcp'))
    await nextTick()
    expect(router.currentRoute.value.name).toBe('CredentialsTab')
    expect(router.currentRoute.value.params.tab).toBe('mcp-tokens')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd chatfunnel-front && npx vitest run src/views/configuration/credentials/composables`
Expected: FAIL with "Cannot find module '../useCredentialsTabs'"

- [ ] **Step 3: Implement composable**

```ts
// chatfunnel-front/src/views/configuration/credentials/composables/useCredentialsTabs.ts
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export const CREDENTIALS_TABS = ['api-keys', 'mcp-tokens'] as const
export type CredentialsTab = typeof CREDENTIALS_TABS[number]

const isCredentialsTab = (value: unknown): value is CredentialsTab =>
  typeof value === 'string' && (CREDENTIALS_TABS as readonly string[]).includes(value)

export function useCredentialsTabs() {
  const route = useRoute()
  const router = useRouter()

  const activeTab = computed<CredentialsTab>(() => {
    const raw = route.params.tab
    return isCredentialsTab(raw) ? raw : 'api-keys'
  })

  const isValidTab = computed(() => isCredentialsTab(route.params.tab))

  const switchTo = (tab: CredentialsTab) => {
    router.push({ name: 'CredentialsTab', params: { tab } })
  }

  return { activeTab, isValidTab, switchTo }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd chatfunnel-front && npx vitest run src/views/configuration/credentials/composables`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd chatfunnel-front
git add src/views/configuration/credentials/composables/
git commit -m "feat(credentials): add useCredentialsTabs composable for tab/URL sync"
```

---

### Task 3: api-keys constants (PERMISSIONS_CATALOG + EXPIRES_OPTIONS)

**Files:**
- Read (legacy reference): `chatfunnel-front/src/views/configuration/whatsapp/APIKey.vue`
- Create: `chatfunnel-front/src/views/configuration/credentials/api-keys/constants.ts`

- [ ] **Step 1: Extract from legacy `whatsapp/APIKey.vue`**

Read the legacy file completely. Find:
- The list of permissions options (probably an array with `{ type, ... }` items, or i18n keys at `enums.WhatsAppApiPermissionsEnum.<TYPE>.name`)
- The expires-in options (likely `30d`, `60d`, `90d`, `never`)

Write down the exact values — they must match what the backend accepts.

- [ ] **Step 2: Write the constants file**

```ts
// chatfunnel-front/src/views/configuration/credentials/api-keys/constants.ts
import type { APIKeyPermission } from '../services/CredentialsService'

/**
 * Espelha o catálogo legacy de `whatsapp/APIKey.vue`.
 * O `type` é o valor enviado ao backend; o `i18nKey` é a label exibida via vue-i18n.
 */
export interface PermissionCatalogEntry {
  type: string
  i18nKey: string
}

export const PERMISSIONS_CATALOG: readonly PermissionCatalogEntry[] = Object.freeze([
  // ⚠️ Substituir pelos valores extraídos no Step 1 — exemplo de formato:
  // { type: 'VIEW_CONTACTS', i18nKey: 'enums.WhatsAppApiPermissionsEnum.VIEW_CONTACTS.name' },
  // ...
])

export interface ExpiresOption {
  value: string
  i18nKey: string
}

export const EXPIRES_OPTIONS: readonly ExpiresOption[] = Object.freeze([
  // ⚠️ Substituir pelos valores extraídos no Step 1 — exemplo:
  // { value: '30d', i18nKey: 'credentials.expiresIn.30d' },
  // { value: 'never', i18nKey: 'credentials.expiresIn.never' },
])

export const EXPIRES_OPTIONS_VALUES = EXPIRES_OPTIONS.map((o) => o.value)

export const buildEmptyAPIKeyPermissions = (): APIKeyPermission[] => []
```

> **Importante:** os arrays acima ficam vazios apenas no template. **Você DEVE preencher** com os valores do legacy antes de prosseguir — caso contrário o form não terá opções e os testes de `APIKeyPermissions` falharão.

- [ ] **Step 3: Typecheck**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit -p tsconfig.app.json 2>&1 | grep "credentials/api-keys/constants"`
Expected: nenhum erro

- [ ] **Step 4: Commit**

```bash
cd chatfunnel-front
git add src/views/configuration/credentials/api-keys/constants.ts
git commit -m "feat(credentials): add api-keys constants mirroring whatsapp/APIKey.vue legacy"
```

---

### Task 4: APIKeyPermissions component (checkbox table)

**Files:**
- Create: `chatfunnel-front/src/views/configuration/credentials/api-keys/components/APIKeyPermissions.vue`
- Test: `chatfunnel-front/src/views/configuration/credentials/api-keys/__tests__/APIKeyPermissions.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// chatfunnel-front/src/views/configuration/credentials/api-keys/__tests__/APIKeyPermissions.spec.ts
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

vi.mock('../constants', () => ({
  PERMISSIONS_CATALOG: [
    { type: 'READ', i18nKey: 'perm.read' },
    { type: 'WRITE', i18nKey: 'perm.write' },
    { type: 'ADMIN', i18nKey: 'perm.admin' }
  ]
}))

import APIKeyPermissions from '../components/APIKeyPermissions.vue'

const renderComponent = (modelValue: Array<{ type: string }> = []) =>
  render(APIKeyPermissions, {
    props: { modelValue },
    global: { stubs: { Card: { template: '<div><slot /></div>' } } }
  })

describe('APIKeyPermissions', () => {
  it('renders one row per permission in the catalog', () => {
    renderComponent()
    expect(screen.getByText('perm.read')).toBeTruthy()
    expect(screen.getByText('perm.write')).toBeTruthy()
    expect(screen.getByText('perm.admin')).toBeTruthy()
  })

  it('counter badge starts at 0 when modelValue is empty', () => {
    const { getByTestId } = renderComponent()
    expect(getByTestId('permissions-counter').textContent).toContain('0')
  })

  it('counter badge reflects modelValue length', () => {
    const { getByTestId } = renderComponent([{ type: 'READ' }, { type: 'ADMIN' }])
    expect(getByTestId('permissions-counter').textContent).toContain('2')
  })

  it('toggling a checkbox emits update:modelValue with the new array', async () => {
    const { emitted, getByLabelText } = renderComponent()
    await fireEvent.click(getByLabelText('perm.write'))
    const events = emitted()['update:modelValue']
    expect(events).toBeDefined()
    expect(events[0][0]).toEqual([{ type: 'WRITE' }])
  })

  it('toggling an already-selected checkbox removes it from the array', async () => {
    const { emitted, getByLabelText } = renderComponent([{ type: 'READ' }])
    await fireEvent.click(getByLabelText('perm.read'))
    expect(emitted()['update:modelValue'][0][0]).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd chatfunnel-front && npx vitest run src/views/configuration/credentials/api-keys/__tests__/APIKeyPermissions`
Expected: FAIL with "Cannot find module '../components/APIKeyPermissions.vue'"

- [ ] **Step 3: Implement component**

```vue
<!-- chatfunnel-front/src/views/configuration/credentials/api-keys/components/APIKeyPermissions.vue -->
<template>
  <Card class="p-6">
    <header class="flex items-start justify-between gap-4">
      <div>
        <h3 class="typo-heading-3">{{ t('credentials.permissions.title') }}</h3>
        <p class="typo-body text-gray-700">
          {{ t('credentials.permissions.subtitle') }}
        </p>
      </div>
      <Badge data-testid="permissions-counter" tone="brand">
        {{ modelValue.length }} / {{ PERMISSIONS_CATALOG.length }}
      </Badge>
    </header>

    <ul class="mt-6 divide-y divide-gray-300">
      <li
        v-for="entry in PERMISSIONS_CATALOG"
        :key="entry.type"
        class="flex items-center gap-3 py-3"
      >
        <Checkbox
          :id="`perm-${entry.type}`"
          :model-value="isChecked(entry.type)"
          @update:model-value="toggle(entry.type, $event)"
        />
        <label :for="`perm-${entry.type}`" class="cursor-pointer">
          {{ t(entry.i18nKey) }}
        </label>
      </li>
    </ul>
  </Card>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { PERMISSIONS_CATALOG } from '../constants'
import type { APIKeyPermission } from '../../services/CredentialsService'

const props = defineProps<{ modelValue: APIKeyPermission[] }>()
const emit = defineEmits<{ 'update:modelValue': [APIKeyPermission[]] }>()

const { t } = useI18n()

const isChecked = (type: string) => props.modelValue.some((p) => p.type === type)

const toggle = (type: string, checked: boolean) => {
  const next = checked
    ? [...props.modelValue, { type }]
    : props.modelValue.filter((p) => p.type !== type)
  emit('update:modelValue', next)
}
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd chatfunnel-front && npx vitest run src/views/configuration/credentials/api-keys/__tests__/APIKeyPermissions`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd chatfunnel-front
git add src/views/configuration/credentials/api-keys/components/APIKeyPermissions.vue \
        src/views/configuration/credentials/api-keys/__tests__/APIKeyPermissions.spec.ts
git commit -m "feat(credentials): add APIKeyPermissions checkbox table with counter badge"
```

---

### Task 5: APIKeysTable component (DataTable wrapper)

**Files:**
- Create: `chatfunnel-front/src/views/configuration/credentials/api-keys/components/APIKeysTable.vue`

> **Nota:** componente fino — apenas configura colunas e propaga eventos do `DataTable`. Sem teste isolado; coberto pelos testes de `APIKeysList`.

- [ ] **Step 1: Implement component**

```vue
<!-- chatfunnel-front/src/views/configuration/credentials/api-keys/components/APIKeysTable.vue -->
<template>
  <DataTable
    v-model:selected="selectedModel"
    :items="items"
    :loading="loading"
    :columns="columns"
    selectable
    row-clickable
    :empty-title="emptyTitle"
    :empty-description="emptyDescription"
    @row-click="(row: APIKey) => emit('rowClick', row)"
  >
    <template #cell:isActive="{ row }">
      <Badge :tone="row.isActive ? 'success' : 'danger'">
        {{ row.isActive ? t('credentials.status.active') : t('credentials.status.expired') }}
      </Badge>
    </template>

    <template #cell:permissionsCount="{ row }">
      <Badge tone="neutral">{{ row.permissions.length }}</Badge>
    </template>

    <template #cell:expiresAt="{ row }">
      <span>{{ row.expiresAt ? formatDate(row.expiresAt) : t('credentials.expiresIn.never') }}</span>
    </template>

    <template #cell:actions="{ row }">
      <div class="flex items-center gap-1" @click.stop>
        <Button
          v-if="row.apiKey"
          size="icon-sm"
          variant="icon"
          :aria-label="t('credentials.actions.copy')"
          @click="copy(row.apiKey!)"
        >
          <PhCopy :size="16" />
        </Button>
        <Button
          size="icon-sm"
          variant="icon"
          tone="danger"
          :aria-label="t('credentials.actions.delete')"
          @click="emit('delete', row.id)"
        >
          <PhTrash :size="16" />
        </Button>
      </div>
    </template>
  </DataTable>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCopy, PhTrash } from '@phosphor-icons/vue'
import { DataTable } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAlerts } from '@/common/composables/AlertsComposable'
import type { APIKey } from '../../services/CredentialsService'

const props = defineProps<{
  items: APIKey[]
  loading?: boolean
  selected: string[]
  emptyTitle: string
  emptyDescription: string
}>()
const emit = defineEmits<{
  'update:selected': [string[]]
  rowClick: [APIKey]
  delete: [string]
}>()

const { t, d } = useI18n()
const { showToastSuccess } = useAlerts()

const selectedModel = computed({
  get: () => props.selected,
  set: (value) => emit('update:selected', value)
})

const columns = [
  { key: 'name', label: 'credentials.columns.name' },
  { key: 'permissionsCount', label: 'credentials.columns.permissions' },
  { key: 'expiresAt', label: 'credentials.columns.expiresAt' },
  { key: 'isActive', label: 'credentials.columns.status' },
  { key: 'actions', label: '', align: 'right' as const }
].map((c) => ({ ...c, label: c.label ? t(c.label) : '' }))

const formatDate = (iso: string) => d(new Date(iso), 'short')

const copy = async (value: string) => {
  await navigator.clipboard.writeText(value)
  showToastSuccess(t('credentials.toast.copied'))
}
</script>
```

- [ ] **Step 2: Typecheck**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit -p tsconfig.app.json 2>&1 | grep "APIKeysTable"`
Expected: nenhum erro

- [ ] **Step 3: Commit**

```bash
cd chatfunnel-front
git add src/views/configuration/credentials/api-keys/components/APIKeysTable.vue
git commit -m "feat(credentials): add APIKeysTable wrapping DataTable with API key columns"
```

---

### Task 6: APIKeysList view (lista da tab)

**Files:**
- Create: `chatfunnel-front/src/views/configuration/credentials/api-keys/APIKeysList.vue`
- Test: `chatfunnel-front/src/views/configuration/credentials/api-keys/__tests__/APIKeysList.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// chatfunnel-front/src/views/configuration/credentials/api-keys/__tests__/APIKeysList.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen, waitFor } from '@testing-library/vue'
import { createRouter, createMemoryHistory } from 'vue-router'

const list = vi.fn()
const remove = vi.fn()
vi.mock('../../services/CredentialsService', () => ({
  CredentialsService: { apiKeys: { list, delete: remove } }
}))

const showDialogConfirmation = vi.fn()
const showToastSuccess = vi.fn()
vi.mock('@/common/composables/AlertsComposable', () => ({
  useAlerts: () => ({ showDialogConfirmation, showToastSuccess })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, d: (v: Date) => v.toISOString() })
}))

import APIKeysList from '../APIKeysList.vue'

const fakeKeys = [
  { id: '1', name: 'Production', permissions: [{ type: 'READ' }], expiresAt: null, isActive: true, apiKey: 'ck_xxx' },
  { id: '2', name: 'Staging', permissions: [], expiresAt: null, isActive: false, apiKey: 'ck_yyy' }
]

const setup = async () => {
  list.mockResolvedValue({ data: fakeKeys })
  remove.mockResolvedValue({ data: undefined })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/configuration/credentials/api-keys', name: 'CredentialsTab', component: APIKeysList },
      { path: '/configuration/credentials/api-keys/create', name: 'CredentialsTabCreate', component: { template: '<div />' } },
      { path: '/configuration/credentials/api-keys/:id', name: 'CredentialsTabEdit', component: { template: '<div />' } }
    ]
  })
  await router.push('/configuration/credentials/api-keys')
  await router.isReady()
  const utils = render(APIKeysList, { global: { plugins: [router] } })
  await waitFor(() => expect(list).toHaveBeenCalled())
  return { ...utils, router }
}

describe('APIKeysList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads and renders the list of api keys', async () => {
    await setup()
    expect(await screen.findByText('Production')).toBeTruthy()
    expect(screen.getByText('Staging')).toBeTruthy()
  })

  it('filters by name when typing in the search input', async () => {
    await setup()
    const search = screen.getByPlaceholderText('credentials.search.placeholder')
    await fireEvent.update(search, 'Prod')
    expect(screen.getByText('Production')).toBeTruthy()
    expect(screen.queryByText('Staging')).toBeNull()
  })

  it('clicking + Nova chave navigates to /create', async () => {
    const { router } = await setup()
    await fireEvent.click(screen.getByRole('button', { name: 'credentials.actions.create' }))
    expect(router.currentRoute.value.name).toBe('CredentialsTabCreate')
  })

  it('bulk delete asks for confirmation and calls service when confirmed', async () => {
    showDialogConfirmation.mockResolvedValue({ isConfirmed: true })
    await setup()
    const checkboxes = screen.getAllByRole('checkbox')
    await fireEvent.click(checkboxes[1]) // [0] is select-all
    await fireEvent.click(screen.getByRole('button', { name: 'credentials.actions.deleteSelected' }))
    await waitFor(() => {
      expect(showDialogConfirmation).toHaveBeenCalled()
      expect(remove).toHaveBeenCalledWith(['1'])
      expect(showToastSuccess).toHaveBeenCalled()
    })
  })

  it('bulk delete does NOT call service when user cancels', async () => {
    showDialogConfirmation.mockResolvedValue({ isConfirmed: false })
    await setup()
    const checkboxes = screen.getAllByRole('checkbox')
    await fireEvent.click(checkboxes[1])
    await fireEvent.click(screen.getByRole('button', { name: 'credentials.actions.deleteSelected' }))
    await waitFor(() => expect(showDialogConfirmation).toHaveBeenCalled())
    expect(remove).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd chatfunnel-front && npx vitest run src/views/configuration/credentials/api-keys/__tests__/APIKeysList`
Expected: FAIL with "Cannot find module '../APIKeysList.vue'"

- [ ] **Step 3: Implement view**

```vue
<!-- chatfunnel-front/src/views/configuration/credentials/api-keys/APIKeysList.vue -->
<template>
  <section class="flex flex-col gap-4">
    <header class="flex items-center gap-3">
      <Input
        v-model="search"
        :placeholder="t('credentials.search.placeholder')"
        class="max-w-md"
      >
        <template #icon-left>
          <PhMagnifyingGlass :size="16" />
        </template>
      </Input>

      <div class="ml-auto flex items-center gap-2">
        <Button
          v-if="selectedIds.length > 0"
          variant="outline"
          tone="danger"
          @click="handleBulkDelete"
        >
          <PhTrash :size="16" />
          {{ t('credentials.actions.deleteSelected') }}
        </Button>
        <Button tone="primary" @click="goToCreate">
          <PhPlus :size="16" />
          {{ t('credentials.actions.create') }}
        </Button>
      </div>
    </header>

    <APIKeysTable
      v-model:selected="selectedIds"
      :items="filteredItems"
      :loading="isLoading"
      :empty-title="emptyTitle"
      :empty-description="emptyDescription"
      @row-click="goToEdit"
      @delete="handleSingleDelete"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhMagnifyingGlass, PhPlus, PhTrash } from '@phosphor-icons/vue'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAlerts } from '@/common/composables/AlertsComposable'
import { CredentialsService, type APIKey } from '../services/CredentialsService'
import APIKeysTable from './components/APIKeysTable.vue'

const { t } = useI18n()
const router = useRouter()
const { showDialogConfirmation, showToastSuccess } = useAlerts()

const items = ref<APIKey[]>([])
const isLoading = ref(false)
const search = ref('')
const selectedIds = ref<string[]>([])

const filteredItems = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter((i) => i.name.toLowerCase().includes(q))
})

const emptyTitle = computed(() =>
  search.value
    ? t('credentials.empty.searchTitle', { query: search.value })
    : t('credentials.empty.apiKeys.title')
)

const emptyDescription = computed(() =>
  search.value ? '' : t('credentials.empty.apiKeys.description')
)

const fetch = async () => {
  isLoading.value = true
  try {
    const { data } = await CredentialsService.apiKeys.list()
    items.value = data
  } finally {
    isLoading.value = false
  }
}

const goToCreate = () => router.push({ name: 'CredentialsTabCreate', params: { tab: 'api-keys' } })
const goToEdit = (row: APIKey) =>
  router.push({ name: 'CredentialsTabEdit', params: { tab: 'api-keys', id: row.id } })

const deleteIds = async (ids: string[]) => {
  const result = await showDialogConfirmation(
    t('credentials.confirm.deleteApiKeys', { count: ids.length })
  )
  if (!result?.isConfirmed) return
  await CredentialsService.apiKeys.delete(ids)
  showToastSuccess(t('credentials.toast.deleted'))
  selectedIds.value = []
  await fetch()
}

const handleBulkDelete = () => deleteIds(selectedIds.value)
const handleSingleDelete = (id: string) => deleteIds([id])

onMounted(fetch)
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd chatfunnel-front && npx vitest run src/views/configuration/credentials/api-keys/__tests__/APIKeysList`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd chatfunnel-front
git add src/views/configuration/credentials/api-keys/APIKeysList.vue \
        src/views/configuration/credentials/api-keys/__tests__/APIKeysList.spec.ts
git commit -m "feat(credentials): add APIKeysList view with search and bulk delete"
```

---

### Task 7: APIKeyForm view

**Files:**
- Create: `chatfunnel-front/src/views/configuration/credentials/api-keys/APIKeyForm.vue`
- Test: `chatfunnel-front/src/views/configuration/credentials/api-keys/__tests__/APIKeyForm.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// chatfunnel-front/src/views/configuration/credentials/api-keys/__tests__/APIKeyForm.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen, waitFor } from '@testing-library/vue'
import { createRouter, createMemoryHistory } from 'vue-router'

const getById = vi.fn()
const save = vi.fn()
vi.mock('../../services/CredentialsService', () => ({
  CredentialsService: { apiKeys: { getById, save } }
}))

const showToastSuccess = vi.fn()
vi.mock('@/common/composables/AlertsComposable', () => ({
  useAlerts: () => ({ showToastSuccess })
}))

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

vi.mock('../constants', () => ({
  PERMISSIONS_CATALOG: [{ type: 'READ', i18nKey: 'perm.read' }],
  EXPIRES_OPTIONS: [{ value: '30d', i18nKey: 'expires.30d' }],
  EXPIRES_OPTIONS_VALUES: ['30d']
}))

import APIKeyForm from '../APIKeyForm.vue'

const setup = async (
  routeName: 'CredentialsTabCreate' | 'CredentialsTabEdit',
  params: Record<string, string> = {}
) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/configuration/credentials/api-keys', name: 'CredentialsTab', component: { template: '<div />' } },
      { path: '/configuration/credentials/api-keys/create', name: 'CredentialsTabCreate', component: APIKeyForm },
      { path: '/configuration/credentials/api-keys/:id', name: 'CredentialsTabEdit', component: APIKeyForm, props: true }
    ]
  })
  await router.push({ name: routeName, params: { tab: 'api-keys', ...params } })
  await router.isReady()
  const utils = render(APIKeyForm, { global: { plugins: [router] } })
  return { ...utils, router }
}

describe('APIKeyForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('create mode: submits the form and redirects to the list', async () => {
    save.mockResolvedValue({ data: { id: 'new-1' } })
    const { router } = await setup('CredentialsTabCreate')

    await fireEvent.update(screen.getByLabelText('credentials.fields.name'), 'My Key')
    await fireEvent.click(screen.getByLabelText('perm.read'))
    await fireEvent.click(screen.getByRole('button', { name: 'credentials.actions.save' }))

    await waitFor(() => {
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'My Key', permissions: [{ type: 'READ' }] })
      )
      expect(showToastSuccess).toHaveBeenCalled()
      expect(router.currentRoute.value.name).toBe('CredentialsTab')
    })
  })

  it('edit mode: fetches the key and pre-fills the form', async () => {
    getById.mockResolvedValue({
      data: { id: 'k-1', name: 'Existing', permissions: [{ type: 'READ' }], expiresIn: '30d' }
    })
    save.mockResolvedValue({ data: {} })
    await setup('CredentialsTabEdit', { id: 'k-1' })

    await waitFor(() => expect(getById).toHaveBeenCalledWith('k-1'))
    await waitFor(() =>
      expect((screen.getByLabelText('credentials.fields.name') as HTMLInputElement).value).toBe('Existing')
    )
  })

  it('validation blocks submit when name is empty', async () => {
    await setup('CredentialsTabCreate')
    await fireEvent.click(screen.getByLabelText('perm.read'))
    await fireEvent.click(screen.getByRole('button', { name: 'credentials.actions.save' }))
    await waitFor(() => expect(save).not.toHaveBeenCalled())
  })

  it('validation blocks submit when no permissions selected', async () => {
    await setup('CredentialsTabCreate')
    await fireEvent.update(screen.getByLabelText('credentials.fields.name'), 'X')
    await fireEvent.click(screen.getByRole('button', { name: 'credentials.actions.save' }))
    await waitFor(() => expect(save).not.toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd chatfunnel-front && npx vitest run src/views/configuration/credentials/api-keys/__tests__/APIKeyForm`
Expected: FAIL with "Cannot find module '../APIKeyForm.vue'"

- [ ] **Step 3: Implement view**

```vue
<!-- chatfunnel-front/src/views/configuration/credentials/api-keys/APIKeyForm.vue -->
<template>
  <section class="flex flex-col gap-6">
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink to="/configuration/credentials/api-keys">
            {{ t('credentials.title') }}
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink to="/configuration/credentials/api-keys">
            {{ t('credentials.tabs.apiKeys') }}
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>
            {{ isEdit ? t('credentials.form.editTitle') : t('credentials.form.createTitle') }}
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>

    <form class="flex flex-col gap-6" @submit.prevent="handleSubmit">
      <Card class="flex flex-col gap-4 p-6">
        <h3 class="typo-heading-3">{{ t('credentials.form.identification') }}</h3>
        <Field name="name" :label="t('credentials.fields.name')">
          <VeeInput name="name" :placeholder="t('credentials.fields.namePlaceholder')" />
        </Field>
        <Field name="expiresIn" :label="t('credentials.fields.expiresIn')">
          <VeeSelect name="expiresIn" :options="expiresOptions" />
        </Field>
      </Card>

      <APIKeyPermissions v-model="permissions" />
      <p v-if="permissionsError" class="text-sm text-danger">{{ permissionsError }}</p>

      <footer class="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" @click="cancel">
          {{ t('credentials.actions.cancel') }}
        </Button>
        <Button type="submit" tone="primary" :disabled="isSubmitting">
          {{ t('credentials.actions.save') }}
        </Button>
      </footer>
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import VeeInput from '@/components/v2/inputs/VeeInput.vue'
import VeeSelect from '@/components/v2/inputs/VeeSelect.vue'
import { useAlerts } from '@/common/composables/AlertsComposable'
import {
  CredentialsService,
  type APIKeyForm as APIKeyFormPayload,
  type APIKeyPermission
} from '../services/CredentialsService'
import { EXPIRES_OPTIONS, EXPIRES_OPTIONS_VALUES } from './constants'
import APIKeyPermissions from './components/APIKeyPermissions.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { showToastSuccess } = useAlerts()

const isEdit = computed(() => !!route.params.id)
const permissions = ref<APIKeyPermission[]>([])
const permissionsError = ref('')

const expiresOptions = EXPIRES_OPTIONS.map((o) => ({ value: o.value, label: t(o.i18nKey) }))

const schema = toTypedSchema(
  z.object({
    name: z.string().min(1, t('credentials.errors.name.required')).max(60),
    expiresIn: z.enum(EXPIRES_OPTIONS_VALUES as [string, ...string[]])
  })
)

const { handleSubmit: vvSubmit, setValues, isSubmitting } = useForm({
  validationSchema: schema,
  initialValues: { name: '', expiresIn: EXPIRES_OPTIONS_VALUES[0] }
})

const handleSubmit = vvSubmit(async (values) => {
  if (permissions.value.length === 0) {
    permissionsError.value = t('credentials.errors.permissions.required')
    return
  }
  permissionsError.value = ''

  const payload: APIKeyFormPayload = {
    ...(isEdit.value ? { id: route.params.id as string } : {}),
    name: values.name,
    permissions: permissions.value,
    expiresIn: values.expiresIn
  }

  await CredentialsService.apiKeys.save(payload)
  showToastSuccess(
    isEdit.value ? t('credentials.toast.updated') : t('credentials.toast.created')
  )
  router.push({ name: 'CredentialsTab', params: { tab: 'api-keys' } })
})

const cancel = () => router.push({ name: 'CredentialsTab', params: { tab: 'api-keys' } })

onMounted(async () => {
  if (!isEdit.value) return
  const { data } = await CredentialsService.apiKeys.getById(route.params.id as string)
  setValues({ name: data.name, expiresIn: (data as any).expiresIn ?? EXPIRES_OPTIONS_VALUES[0] })
  permissions.value = data.permissions ?? []
})
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd chatfunnel-front && npx vitest run src/views/configuration/credentials/api-keys/__tests__/APIKeyForm`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd chatfunnel-front
git add src/views/configuration/credentials/api-keys/APIKeyForm.vue \
        src/views/configuration/credentials/api-keys/__tests__/APIKeyForm.spec.ts
git commit -m "feat(credentials): add APIKeyForm with VeeValidate+Zod and create/edit modes"
```

---

### Task 8: McpServerStatus component

**Files:**
- Create: `chatfunnel-front/src/views/configuration/credentials/mcp-tokens/components/McpServerStatus.vue`
- Test: `chatfunnel-front/src/views/configuration/credentials/mcp-tokens/__tests__/McpServerStatus.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// chatfunnel-front/src/views/configuration/credentials/mcp-tokens/__tests__/McpServerStatus.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/vue'

const health = vi.fn()
vi.mock('../../services/CredentialsService', () => ({
  CredentialsService: { mcp: { health } }
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

import McpServerStatus from '../components/McpServerStatus.vue'

describe('McpServerStatus', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows online state when health resolves with status ok', async () => {
    health.mockResolvedValue({ data: { status: 'ok' } })
    render(McpServerStatus)
    await waitFor(() =>
      expect(screen.getByText('credentials.mcp.serverOnline')).toBeTruthy()
    )
  })

  it('shows offline state when health rejects', async () => {
    health.mockRejectedValue(new Error('boom'))
    render(McpServerStatus)
    await waitFor(() =>
      expect(screen.getByText('credentials.mcp.serverOffline')).toBeTruthy()
    )
  })

  it('shows offline state when status is not "ok"', async () => {
    health.mockResolvedValue({ data: { status: 'down' } })
    render(McpServerStatus)
    await waitFor(() =>
      expect(screen.getByText('credentials.mcp.serverOffline')).toBeTruthy()
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd chatfunnel-front && npx vitest run src/views/configuration/credentials/mcp-tokens/__tests__/McpServerStatus`
Expected: FAIL with "Cannot find module '../components/McpServerStatus.vue'"

- [ ] **Step 3: Implement component**

```vue
<!-- chatfunnel-front/src/views/configuration/credentials/mcp-tokens/components/McpServerStatus.vue -->
<template>
  <div
    class="flex items-center gap-3 rounded-cf-lg border border-gray-400 bg-gray-200 px-4 py-3"
    :data-state="state"
  >
    <span
      class="flex h-8 w-8 items-center justify-center rounded-full"
      :class="state === 'online' ? 'bg-brand-100 text-brand-700' : 'bg-warning-100 text-warning-700'"
    >
      <PhCheckCircle v-if="state === 'online'" :size="18" />
      <PhWarning v-else :size="18" />
    </span>
    <div class="flex flex-col">
      <span class="typo-body-strong">
        {{ state === 'online' ? t('credentials.mcp.serverOnline') : t('credentials.mcp.serverOffline') }}
      </span>
      <span v-if="meta" class="typo-caption text-gray-700">
        {{ meta }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheckCircle, PhWarning } from '@phosphor-icons/vue'
import { CredentialsService } from '../../services/CredentialsService'

const { t } = useI18n()
const state = ref<'loading' | 'online' | 'offline'>('loading')
const activeSessions = ref<number | null>(null)
const uptimeSeconds = ref<number | null>(null)

const meta = computed(() => {
  if (state.value !== 'online') return ''
  const parts: string[] = []
  if (activeSessions.value !== null)
    parts.push(t('credentials.mcp.activeSessions', { count: activeSessions.value }))
  if (uptimeSeconds.value !== null)
    parts.push(t('credentials.mcp.uptime', { seconds: uptimeSeconds.value }))
  return parts.join(' · ')
})

onMounted(async () => {
  try {
    const { data } = await CredentialsService.mcp.health()
    if (data.status === 'ok') {
      state.value = 'online'
      activeSessions.value = data.activeSessions ?? null
      uptimeSeconds.value = data.uptimeSeconds ?? null
    } else {
      state.value = 'offline'
    }
  } catch {
    state.value = 'offline'
  }
})
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd chatfunnel-front && npx vitest run src/views/configuration/credentials/mcp-tokens/__tests__/McpServerStatus`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
cd chatfunnel-front
git add src/views/configuration/credentials/mcp-tokens/components/McpServerStatus.vue \
        src/views/configuration/credentials/mcp-tokens/__tests__/McpServerStatus.spec.ts
git commit -m "feat(credentials): add McpServerStatus strip showing health-based state"
```

---

### Task 9: McpConnectionGuide component

**Files:**
- Create: `chatfunnel-front/src/views/configuration/credentials/mcp-tokens/components/McpConnectionGuide.vue`
- Test: `chatfunnel-front/src/views/configuration/credentials/mcp-tokens/__tests__/McpConnectionGuide.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// chatfunnel-front/src/views/configuration/credentials/mcp-tokens/__tests__/McpConnectionGuide.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
const showToastSuccess = vi.fn()
vi.mock('@/common/composables/AlertsComposable', () => ({
  useAlerts: () => ({ showToastSuccess })
}))

import McpConnectionGuide from '../components/McpConnectionGuide.vue'

describe('McpConnectionGuide', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) }
    })
  })

  it('renders Claude Code as the active tab by default', () => {
    render(McpConnectionGuide, { props: { token: 'cf_mcp_xxx' } })
    const claudeCodeTab = screen.getByRole('tab', { name: /Claude Code/i })
    expect(claudeCodeTab.getAttribute('aria-selected')).toBe('true')
  })

  it('renders all five clients as tabs', () => {
    render(McpConnectionGuide, { props: { token: 'cf_mcp_xxx' } })
    expect(screen.getByRole('tab', { name: /Claude Code/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /ChatGPT/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /^Claude$/ })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Cursor/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /API/i })).toBeTruthy()
  })

  it('switching to ChatGPT shows the correct command snippet', async () => {
    render(McpConnectionGuide, { props: { token: 'cf_mcp_xxx' } })
    await fireEvent.click(screen.getByRole('tab', { name: /ChatGPT/i }))
    await waitFor(() => {
      expect(screen.getByTestId('command-block').textContent).toContain('cf_mcp_xxx')
    })
  })

  it('clicking copy button writes the snippet to clipboard and shows toast', async () => {
    render(McpConnectionGuide, { props: { token: 'cf_mcp_xxx' } })
    await fireEvent.click(screen.getByRole('button', { name: 'credentials.actions.copy' }))
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled()
      expect(showToastSuccess).toHaveBeenCalled()
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd chatfunnel-front && npx vitest run src/views/configuration/credentials/mcp-tokens/__tests__/McpConnectionGuide`
Expected: FAIL with "Cannot find module '../components/McpConnectionGuide.vue'"

- [ ] **Step 3: Implement component**

```vue
<!-- chatfunnel-front/src/views/configuration/credentials/mcp-tokens/components/McpConnectionGuide.vue -->
<template>
  <Card class="p-6">
    <h3 class="typo-heading-3">{{ t('credentials.mcp.guide.title') }}</h3>
    <p class="typo-body text-gray-700">{{ t('credentials.mcp.guide.subtitle') }}</p>

    <Tabs v-model:model-value="activeClient" class="mt-4">
      <TabsList>
        <TabsTrigger
          v-for="client in CLIENTS"
          :key="client.id"
          :value="client.id"
        >
          <component :is="client.icon" :size="16" />
          {{ client.label }}
        </TabsTrigger>
      </TabsList>

      <TabsContent
        v-for="client in CLIENTS"
        :key="client.id"
        :value="client.id"
      >
        <ol class="list-decimal pl-5 typo-body">
          <li>{{ t('credentials.mcp.guide.step1') }}</li>
          <li>{{ t('credentials.mcp.guide.step2', { client: client.label }) }}</li>
        </ol>

        <div class="mt-3 flex items-start gap-2">
          <pre
            data-testid="command-block"
            class="flex-1 overflow-auto rounded-cf-lg bg-gray-1000 px-4 py-3 text-sm text-gray-100"
          >{{ buildSnippet(client.id) }}</pre>
          <Button
            size="icon-md"
            variant="icon"
            :aria-label="t('credentials.actions.copy')"
            @click="copySnippet(client.id)"
          >
            <PhCopy :size="16" />
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  </Card>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhTerminal, PhRobot, PhBrain, PhCursorClick, PhCode, PhCopy } from '@phosphor-icons/vue'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useAlerts } from '@/common/composables/AlertsComposable'

const props = defineProps<{ token: string }>()

const { t } = useI18n()
const { showToastSuccess } = useAlerts()

type ClientId = 'claude-code' | 'chatgpt' | 'claude' | 'cursor' | 'api'

const CLIENTS: ReadonlyArray<{ id: ClientId; label: string; icon: any }> = [
  { id: 'claude-code', label: 'Claude Code', icon: PhTerminal },
  { id: 'chatgpt', label: 'ChatGPT', icon: PhRobot },
  { id: 'claude', label: 'Claude', icon: PhBrain },
  { id: 'cursor', label: 'Cursor', icon: PhCursorClick },
  { id: 'api', label: 'API', icon: PhCode }
]

const activeClient = ref<ClientId>('claude-code')

const buildSnippet = (id: ClientId): string => {
  const url = `${window.location.origin}/mcp`
  switch (id) {
    case 'claude-code':
      return `claude mcp add chatfunnel --transport http --url ${url} --header "Authorization: Bearer ${props.token}"`
    case 'chatgpt':
      return `# Cole nas Custom Connections do ChatGPT\nURL: ${url}\nAuthorization: Bearer ${props.token}`
    case 'claude':
      return `# claude_desktop_config.json\n{\n  "mcpServers": {\n    "chatfunnel": {\n      "url": "${url}",\n      "headers": { "Authorization": "Bearer ${props.token}" }\n    }\n  }\n}`
    case 'cursor':
      return `# .cursor/mcp.json\n{\n  "mcpServers": {\n    "chatfunnel": {\n      "url": "${url}",\n      "headers": { "Authorization": "Bearer ${props.token}" }\n    }\n  }\n}`
    case 'api':
      return `curl -H "Authorization: Bearer ${props.token}" ${url}`
  }
}

const copySnippet = async (id: ClientId) => {
  await navigator.clipboard.writeText(buildSnippet(id))
  showToastSuccess(t('credentials.toast.copied'))
}
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd chatfunnel-front && npx vitest run src/views/configuration/credentials/mcp-tokens/__tests__/McpConnectionGuide`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd chatfunnel-front
git add src/views/configuration/credentials/mcp-tokens/components/McpConnectionGuide.vue \
        src/views/configuration/credentials/mcp-tokens/__tests__/McpConnectionGuide.spec.ts
git commit -m "feat(credentials): add McpConnectionGuide with 5 client tabs and copy"
```

---

### Task 10: McpTokensTable component

**Files:**
- Create: `chatfunnel-front/src/views/configuration/credentials/mcp-tokens/components/McpTokensTable.vue`

> Componente fino — coberto pelos testes de `McpTokensList`.

- [ ] **Step 1: Implement component**

```vue
<!-- chatfunnel-front/src/views/configuration/credentials/mcp-tokens/components/McpTokensTable.vue -->
<template>
  <DataTable
    v-model:selected="selectedModel"
    :items="items"
    :loading="loading"
    :columns="columns"
    selectable
    :empty-title="emptyTitle"
    :empty-description="emptyDescription"
  >
    <template #cell:status="{ row }">
      <Badge :tone="row.revokedAt ? 'danger' : 'success'">
        {{ row.revokedAt ? t('credentials.status.revoked') : t('credentials.status.active') }}
      </Badge>
    </template>

    <template #cell:createdAt="{ row }">
      <span>{{ formatDate(row.createdAt) }}</span>
    </template>

    <template #cell:lastUsedAt="{ row }">
      <span>{{ row.lastUsedAt ? formatDate(row.lastUsedAt) : '—' }}</span>
    </template>

    <template #cell:actions="{ row }">
      <div class="flex items-center justify-end" @click.stop>
        <Button
          size="icon-sm"
          variant="icon"
          tone="danger"
          :aria-label="t('credentials.actions.revoke')"
          @click="emit('revoke', row.id)"
        >
          <PhTrash :size="16" />
        </Button>
      </div>
    </template>
  </DataTable>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhTrash } from '@phosphor-icons/vue'
import { DataTable } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { McpIntegrationToken } from '@services/McpService'

const props = defineProps<{
  items: McpIntegrationToken[]
  loading?: boolean
  selected: string[]
  emptyTitle: string
  emptyDescription: string
}>()
const emit = defineEmits<{
  'update:selected': [string[]]
  revoke: [string]
}>()

const { t, d } = useI18n()

const selectedModel = computed({
  get: () => props.selected,
  set: (v) => emit('update:selected', v)
})

const columns = [
  { key: 'name', label: t('credentials.columns.name') },
  { key: 'createdAt', label: t('credentials.columns.createdAt') },
  { key: 'lastUsedAt', label: t('credentials.columns.lastUsedAt') },
  { key: 'status', label: t('credentials.columns.status') },
  { key: 'actions', label: '', align: 'right' as const }
]

const formatDate = (iso: string) => d(new Date(iso), 'short')
</script>
```

- [ ] **Step 2: Typecheck**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit -p tsconfig.app.json 2>&1 | grep "McpTokensTable"`
Expected: nenhum erro

- [ ] **Step 3: Commit**

```bash
cd chatfunnel-front
git add src/views/configuration/credentials/mcp-tokens/components/McpTokensTable.vue
git commit -m "feat(credentials): add McpTokensTable wrapping DataTable (no token column)"
```

---

### Task 11: McpTokensList view

**Files:**
- Create: `chatfunnel-front/src/views/configuration/credentials/mcp-tokens/McpTokensList.vue`
- Test: `chatfunnel-front/src/views/configuration/credentials/mcp-tokens/__tests__/McpTokensList.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// chatfunnel-front/src/views/configuration/credentials/mcp-tokens/__tests__/McpTokensList.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen, waitFor } from '@testing-library/vue'
import { createRouter, createMemoryHistory } from 'vue-router'

const list = vi.fn()
const revoke = vi.fn()
const health = vi.fn()
vi.mock('../../services/CredentialsService', () => ({
  CredentialsService: { mcp: { list, revoke, health } }
}))

const showDialogConfirmation = vi.fn()
const showToastSuccess = vi.fn()
vi.mock('@/common/composables/AlertsComposable', () => ({
  useAlerts: () => ({ showDialogConfirmation, showToastSuccess })
}))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, d: (v: Date) => v.toISOString() })
}))

import McpTokensList from '../McpTokensList.vue'

const tokens = [
  { id: 't-1', name: 'Claude Code', createdAt: '2026-04-01T10:00:00Z', lastUsedAt: null, revokedAt: null },
  { id: 't-2', name: 'Cursor',       createdAt: '2026-04-15T10:00:00Z', lastUsedAt: '2026-04-20T10:00:00Z', revokedAt: null }
]

const setup = async () => {
  list.mockResolvedValue({ data: tokens })
  health.mockResolvedValue({ data: { status: 'ok' } })
  revoke.mockResolvedValue({ data: undefined })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/configuration/credentials/mcp-tokens', name: 'CredentialsTab', component: McpTokensList },
      { path: '/configuration/credentials/mcp-tokens/create', name: 'CredentialsTabCreate', component: { template: '<div />' } }
    ]
  })
  await router.push('/configuration/credentials/mcp-tokens')
  await router.isReady()
  const utils = render(McpTokensList, { global: { plugins: [router] } })
  await waitFor(() => expect(list).toHaveBeenCalled())
  return { ...utils, router }
}

describe('McpTokensList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads tokens and shows server status strip', async () => {
    await setup()
    expect(await screen.findByText('Claude Code')).toBeTruthy()
    expect(screen.getByText('Cursor')).toBeTruthy()
    await waitFor(() => expect(health).toHaveBeenCalled())
  })

  it('filters by name when typing in search', async () => {
    await setup()
    await fireEvent.update(screen.getByPlaceholderText('credentials.search.placeholder'), 'cursor')
    expect(screen.getByText('Cursor')).toBeTruthy()
    expect(screen.queryByText('Claude Code')).toBeNull()
  })

  it('clicking + Novo token navigates to /create', async () => {
    const { router } = await setup()
    await fireEvent.click(screen.getByRole('button', { name: 'credentials.actions.createMcp' }))
    expect(router.currentRoute.value.name).toBe('CredentialsTabCreate')
  })

  it('bulk revoke confirms and calls service per id', async () => {
    showDialogConfirmation.mockResolvedValue({ isConfirmed: true })
    await setup()
    const checkboxes = screen.getAllByRole('checkbox')
    await fireEvent.click(checkboxes[1])
    await fireEvent.click(checkboxes[2])
    await fireEvent.click(screen.getByRole('button', { name: 'credentials.actions.revokeSelected' }))
    await waitFor(() => {
      expect(revoke).toHaveBeenCalledWith('t-1')
      expect(revoke).toHaveBeenCalledWith('t-2')
      expect(showToastSuccess).toHaveBeenCalled()
    })
  })

  it('bulk revoke is a no-op when user cancels', async () => {
    showDialogConfirmation.mockResolvedValue({ isConfirmed: false })
    await setup()
    const checkboxes = screen.getAllByRole('checkbox')
    await fireEvent.click(checkboxes[1])
    await fireEvent.click(screen.getByRole('button', { name: 'credentials.actions.revokeSelected' }))
    await waitFor(() => expect(showDialogConfirmation).toHaveBeenCalled())
    expect(revoke).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd chatfunnel-front && npx vitest run src/views/configuration/credentials/mcp-tokens/__tests__/McpTokensList`
Expected: FAIL with "Cannot find module '../McpTokensList.vue'"

- [ ] **Step 3: Implement view**

```vue
<!-- chatfunnel-front/src/views/configuration/credentials/mcp-tokens/McpTokensList.vue -->
<template>
  <section class="flex flex-col gap-4">
    <McpServerStatus />

    <header class="flex items-center gap-3">
      <Input
        v-model="search"
        :placeholder="t('credentials.search.placeholder')"
        class="max-w-md"
      >
        <template #icon-left>
          <PhMagnifyingGlass :size="16" />
        </template>
      </Input>

      <div class="ml-auto flex items-center gap-2">
        <Button
          v-if="selectedIds.length > 0"
          variant="outline"
          tone="danger"
          @click="handleBulkRevoke"
        >
          <PhTrash :size="16" />
          {{ t('credentials.actions.revokeSelected') }}
        </Button>
        <Button tone="primary" @click="goToCreate">
          <PhPlus :size="16" />
          {{ t('credentials.actions.createMcp') }}
        </Button>
      </div>
    </header>

    <McpTokensTable
      v-model:selected="selectedIds"
      :items="filteredItems"
      :loading="isLoading"
      :empty-title="emptyTitle"
      :empty-description="emptyDescription"
      @revoke="handleSingleRevoke"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhMagnifyingGlass, PhPlus, PhTrash } from '@phosphor-icons/vue'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAlerts } from '@/common/composables/AlertsComposable'
import { CredentialsService } from '../services/CredentialsService'
import type { McpIntegrationToken } from '@services/McpService'
import McpTokensTable from './components/McpTokensTable.vue'
import McpServerStatus from './components/McpServerStatus.vue'

const { t } = useI18n()
const router = useRouter()
const { showDialogConfirmation, showToastSuccess } = useAlerts()

const items = ref<McpIntegrationToken[]>([])
const isLoading = ref(false)
const search = ref('')
const selectedIds = ref<string[]>([])

const filteredItems = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter((i) => i.name.toLowerCase().includes(q))
})

const emptyTitle = computed(() =>
  search.value
    ? t('credentials.empty.searchTitle', { query: search.value })
    : t('credentials.empty.mcpTokens.title')
)

const emptyDescription = computed(() =>
  search.value ? '' : t('credentials.empty.mcpTokens.description')
)

const fetch = async () => {
  isLoading.value = true
  try {
    const { data } = await CredentialsService.mcp.list()
    items.value = data
  } finally {
    isLoading.value = false
  }
}

const goToCreate = () =>
  router.push({ name: 'CredentialsTabCreate', params: { tab: 'mcp-tokens' } })

const revokeIds = async (ids: string[]) => {
  const result = await showDialogConfirmation(
    t('credentials.confirm.revokeTokens', { count: ids.length })
  )
  if (!result?.isConfirmed) return
  await Promise.all(ids.map((id) => CredentialsService.mcp.revoke(id)))
  showToastSuccess(t('credentials.toast.revoked'))
  selectedIds.value = []
  await fetch()
}

const handleBulkRevoke = () => revokeIds(selectedIds.value)
const handleSingleRevoke = (id: string) => revokeIds([id])

onMounted(fetch)
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd chatfunnel-front && npx vitest run src/views/configuration/credentials/mcp-tokens/__tests__/McpTokensList`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd chatfunnel-front
git add src/views/configuration/credentials/mcp-tokens/McpTokensList.vue \
        src/views/configuration/credentials/mcp-tokens/__tests__/McpTokensList.spec.ts
git commit -m "feat(credentials): add McpTokensList with status strip and bulk revoke"
```

---

### Task 12: McpTokenForm view

**Files:**
- Create: `chatfunnel-front/src/views/configuration/credentials/mcp-tokens/McpTokenForm.vue`
- Test: `chatfunnel-front/src/views/configuration/credentials/mcp-tokens/__tests__/McpTokenForm.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// chatfunnel-front/src/views/configuration/credentials/mcp-tokens/__tests__/McpTokenForm.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen, waitFor } from '@testing-library/vue'
import { createRouter, createMemoryHistory } from 'vue-router'

const create = vi.fn()
vi.mock('../../services/CredentialsService', () => ({
  CredentialsService: { mcp: { create } }
}))

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const showToastSuccess = vi.fn()
vi.mock('@/common/composables/AlertsComposable', () => ({
  useAlerts: () => ({ showToastSuccess })
}))

import McpTokenForm from '../McpTokenForm.vue'

const setup = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/configuration/credentials/mcp-tokens', name: 'CredentialsTab', component: { template: '<div />' } },
      { path: '/configuration/credentials/mcp-tokens/create', name: 'CredentialsTabCreate', component: McpTokenForm }
    ]
  })
  await router.push({ name: 'CredentialsTabCreate', params: { tab: 'mcp-tokens' } })
  await router.isReady()
  const utils = render(McpTokenForm, { global: { plugins: [router] } })
  return { ...utils, router }
}

describe('McpTokenForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  })

  it('create mode: submits and switches to "criado" state showing the token', async () => {
    create.mockResolvedValue({ data: { id: 't-1', name: 'My Token', token: 'cf_mcp_secret' } })
    await setup()
    await fireEvent.update(screen.getByLabelText('credentials.fields.name'), 'My Token')
    await fireEvent.click(screen.getByRole('button', { name: 'credentials.actions.generate' }))
    await waitFor(() => {
      expect(create).toHaveBeenCalledWith('My Token')
      expect(screen.getByText('credentials.mcp.tokenCreatedAlert')).toBeTruthy()
      expect(screen.getByDisplayValue('cf_mcp_secret')).toBeTruthy()
    })
  })

  it('"Gerar novo token" resets state back to create mode', async () => {
    create.mockResolvedValue({ data: { id: 't-1', name: 'X', token: 'cf_mcp_y' } })
    await setup()
    await fireEvent.update(screen.getByLabelText('credentials.fields.name'), 'X')
    await fireEvent.click(screen.getByRole('button', { name: 'credentials.actions.generate' }))
    await waitFor(() => screen.getByText('credentials.mcp.tokenCreatedAlert'))
    await fireEvent.click(screen.getByRole('button', { name: 'credentials.actions.generateNew' }))
    expect(screen.queryByText('credentials.mcp.tokenCreatedAlert')).toBeNull()
    expect(screen.getByLabelText('credentials.fields.name')).toBeTruthy()
  })

  it('Concluir navigates back to the list after token created', async () => {
    create.mockResolvedValue({ data: { id: 't-1', name: 'X', token: 'cf_mcp_y' } })
    const { router } = await setup()
    await fireEvent.update(screen.getByLabelText('credentials.fields.name'), 'X')
    await fireEvent.click(screen.getByRole('button', { name: 'credentials.actions.generate' }))
    await waitFor(() => screen.getByText('credentials.mcp.tokenCreatedAlert'))
    await fireEvent.click(screen.getByRole('button', { name: 'credentials.actions.done' }))
    expect(router.currentRoute.value.name).toBe('CredentialsTab')
  })

  it('validation blocks submit when name is empty', async () => {
    await setup()
    await fireEvent.click(screen.getByRole('button', { name: 'credentials.actions.generate' }))
    await waitFor(() => expect(create).not.toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd chatfunnel-front && npx vitest run src/views/configuration/credentials/mcp-tokens/__tests__/McpTokenForm`
Expected: FAIL with "Cannot find module '../McpTokenForm.vue'"

- [ ] **Step 3: Implement view**

```vue
<!-- chatfunnel-front/src/views/configuration/credentials/mcp-tokens/McpTokenForm.vue -->
<template>
  <section class="flex flex-col gap-6">
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink to="/configuration/credentials/api-keys">
            {{ t('credentials.title') }}
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink to="/configuration/credentials/mcp-tokens">
            {{ t('credentials.tabs.mcpTokens') }}
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>
            {{ createdToken ? t('credentials.mcp.tokenCreatedTitle') : t('credentials.mcp.newTokenTitle') }}
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>

    <form v-if="!createdToken" class="flex flex-col gap-6" @submit.prevent="handleSubmit">
      <Card class="flex flex-col gap-4 p-6">
        <h3 class="typo-heading-3">{{ t('credentials.mcp.identification') }}</h3>
        <Field name="name" :label="t('credentials.fields.name')">
          <VeeInput name="name" :placeholder="t('credentials.fields.mcpNamePlaceholder')" />
        </Field>
      </Card>

      <footer class="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" @click="cancel">
          {{ t('credentials.actions.cancel') }}
        </Button>
        <Button type="submit" tone="primary" :disabled="isSubmitting">
          {{ t('credentials.actions.generate') }}
        </Button>
      </footer>
    </form>

    <template v-else>
      <Alert tone="success">
        <strong>{{ t('credentials.mcp.tokenCreatedAlert') }}</strong>
        <p>{{ t('credentials.mcp.tokenCreatedDescription') }}</p>
      </Alert>

      <Card class="flex flex-col gap-3 p-6">
        <label class="typo-body-strong">{{ t('credentials.mcp.yourToken') }}</label>
        <div class="flex items-center gap-2">
          <Input :model-value="createdToken.token" readonly class="font-mono" />
          <Button
            size="icon-md"
            variant="icon"
            :aria-label="t('credentials.actions.copy')"
            @click="copyToken"
          >
            <PhCopy :size="16" />
          </Button>
        </div>
      </Card>

      <McpConnectionGuide :token="createdToken.token" />

      <footer class="flex items-center justify-end gap-2">
        <Button variant="outline" @click="resetForm">
          {{ t('credentials.actions.generateNew') }}
        </Button>
        <Button tone="primary" @click="finish">
          {{ t('credentials.actions.done') }}
        </Button>
      </footer>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'
import { PhCopy } from '@phosphor-icons/vue'
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import VeeInput from '@/components/v2/inputs/VeeInput.vue'
import { useAlerts } from '@/common/composables/AlertsComposable'
import { CredentialsService } from '../services/CredentialsService'
import type { McpIntegrationTokenCreated } from '@services/McpService'
import McpConnectionGuide from './components/McpConnectionGuide.vue'

const { t } = useI18n()
const router = useRouter()
const { showToastSuccess } = useAlerts()

const createdToken = ref<McpIntegrationTokenCreated | null>(null)

const schema = toTypedSchema(
  z.object({ name: z.string().min(1, t('credentials.errors.name.required')).max(60) })
)

const { handleSubmit: vvSubmit, resetForm: vvReset, isSubmitting } = useForm({
  validationSchema: schema,
  initialValues: { name: '' }
})

const handleSubmit = vvSubmit(async (values) => {
  const { data } = await CredentialsService.mcp.create(values.name)
  createdToken.value = data
})

const copyToken = async () => {
  if (!createdToken.value) return
  await navigator.clipboard.writeText(createdToken.value.token)
  showToastSuccess(t('credentials.toast.copied'))
}

const resetForm = () => {
  createdToken.value = null
  vvReset()
}

const cancel = () => router.push({ name: 'CredentialsTab', params: { tab: 'mcp-tokens' } })
const finish = () => router.push({ name: 'CredentialsTab', params: { tab: 'mcp-tokens' } })
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd chatfunnel-front && npx vitest run src/views/configuration/credentials/mcp-tokens/__tests__/McpTokenForm`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd chatfunnel-front
git add src/views/configuration/credentials/mcp-tokens/McpTokenForm.vue \
        src/views/configuration/credentials/mcp-tokens/__tests__/McpTokenForm.spec.ts
git commit -m "feat(credentials): add McpTokenForm with create→created two-state flow"
```

---

### Task 13: CredentialsPage wrapper

**Files:**
- Create: `chatfunnel-front/src/views/configuration/credentials/CredentialsPage.vue`
- Test: `chatfunnel-front/src/views/configuration/credentials/__tests__/CredentialsPage.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// chatfunnel-front/src/views/configuration/credentials/__tests__/CredentialsPage.spec.ts
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, screen, waitFor } from '@testing-library/vue'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('../api-keys/APIKeysList.vue', () => ({
  default: { name: 'APIKeysListStub', template: '<div data-testid="api-keys-list" />' }
}))
vi.mock('../api-keys/APIKeyForm.vue', () => ({
  default: { name: 'APIKeyFormStub', template: '<div data-testid="api-key-form" />' }
}))
vi.mock('../mcp-tokens/McpTokensList.vue', () => ({
  default: { name: 'McpTokensListStub', template: '<div data-testid="mcp-tokens-list" />' }
}))
vi.mock('../mcp-tokens/McpTokenForm.vue', () => ({
  default: { name: 'McpTokenFormStub', template: '<div data-testid="mcp-token-form" />' }
}))

import CredentialsPage from '../CredentialsPage.vue'

const setup = async (path: string) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/configuration/credentials', redirect: '/configuration/credentials/api-keys' },
      { path: '/configuration/credentials/:tab', name: 'CredentialsTab', component: CredentialsPage },
      { path: '/configuration/credentials/:tab/create', name: 'CredentialsTabCreate', component: CredentialsPage },
      { path: '/configuration/credentials/:tab/:id', name: 'CredentialsTabEdit', component: CredentialsPage }
    ]
  })
  await router.push(path)
  await router.isReady()
  return { ...render(CredentialsPage, { global: { plugins: [router] } }), router }
}

describe('CredentialsPage', () => {
  it('renders APIKeysList for /api-keys', async () => {
    await setup('/configuration/credentials/api-keys')
    expect(screen.getByTestId('api-keys-list')).toBeTruthy()
  })

  it('renders APIKeyForm for /api-keys/create', async () => {
    await setup('/configuration/credentials/api-keys/create')
    expect(screen.getByTestId('api-key-form')).toBeTruthy()
  })

  it('renders APIKeyForm for /api-keys/:id (edit)', async () => {
    await setup('/configuration/credentials/api-keys/abc-123')
    expect(screen.getByTestId('api-key-form')).toBeTruthy()
  })

  it('renders McpTokensList for /mcp-tokens', async () => {
    await setup('/configuration/credentials/mcp-tokens')
    expect(screen.getByTestId('mcp-tokens-list')).toBeTruthy()
  })

  it('renders McpTokenForm for /mcp-tokens/create', async () => {
    await setup('/configuration/credentials/mcp-tokens/create')
    expect(screen.getByTestId('mcp-token-form')).toBeTruthy()
  })

  it('switching tab navigates to the other tab list', async () => {
    const { router } = await setup('/configuration/credentials/api-keys')
    await fireEvent.click(screen.getByRole('tab', { name: 'credentials.tabs.mcpTokens' }))
    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe('CredentialsTab')
      expect(router.currentRoute.value.params.tab).toBe('mcp-tokens')
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd chatfunnel-front && npx vitest run src/views/configuration/credentials/__tests__/CredentialsPage`
Expected: FAIL with "Cannot find module '../CredentialsPage.vue'"

- [ ] **Step 3: Implement view**

```vue
<!-- chatfunnel-front/src/views/configuration/credentials/CredentialsPage.vue -->
<template>
  <div class="flex flex-col gap-6 p-6">
    <header class="flex flex-col gap-1">
      <PageTitle>{{ t('credentials.title') }}</PageTitle>
      <PageSubtitle>{{ t('credentials.subtitle') }}</PageSubtitle>
    </header>

    <Tabs :model-value="activeTab" @update:model-value="onTabChange">
      <TabsList>
        <TabsTrigger value="api-keys">{{ t('credentials.tabs.apiKeys') }}</TabsTrigger>
        <TabsTrigger value="mcp-tokens">{{ t('credentials.tabs.mcpTokens') }}</TabsTrigger>
      </TabsList>

      <TabsContent value="api-keys">
        <APIKeyForm v-if="isApiKeysForm" />
        <APIKeysList v-else />
      </TabsContent>

      <TabsContent value="mcp-tokens">
        <McpTokenForm v-if="isMcpForm" />
        <McpTokensList v-else />
      </TabsContent>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PageTitle } from '@/components/ui/typography/page-title'
import { PageSubtitle } from '@/components/ui/typography/page-subtitle'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useCredentialsTabs, type CredentialsTab } from './composables/useCredentialsTabs'
import APIKeysList from './api-keys/APIKeysList.vue'
import APIKeyForm from './api-keys/APIKeyForm.vue'
import McpTokensList from './mcp-tokens/McpTokensList.vue'
import McpTokenForm from './mcp-tokens/McpTokenForm.vue'

const { t } = useI18n()
const route = useRoute()
const { activeTab, switchTo } = useCredentialsTabs()

const isFormRoute = computed(() =>
  route.name === 'CredentialsTabCreate' || route.name === 'CredentialsTabEdit'
)
const isApiKeysForm = computed(() => activeTab.value === 'api-keys' && isFormRoute.value)
const isMcpForm = computed(() => activeTab.value === 'mcp-tokens' && isFormRoute.value)

const onTabChange = (value: string | number) => {
  switchTo(value as CredentialsTab)
}
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd chatfunnel-front && npx vitest run src/views/configuration/credentials/__tests__/CredentialsPage`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
cd chatfunnel-front
git add src/views/configuration/credentials/CredentialsPage.vue \
        src/views/configuration/credentials/__tests__/CredentialsPage.spec.ts
git commit -m "feat(credentials): add CredentialsPage wrapper with tabs and form/list switch"
```

---

### Task 14: Router (add new + remove legacy)

**Files:**
- Modify: `chatfunnel-front/src/router/index.js` — adicionar rotas novas; remover bloco `api_keys` (linhas 414-447)

- [ ] **Step 1: Locate router blocks**

Open `chatfunnel-front/src/router/index.js` and find:
- O bloco `whatsapp` que contém os filhos `api_keys` (rotas a remover) — linhas ~414-447
- A pasta pai `/configuration` (onde os filhos vivem) — para adicionar `credentials` ao lado

- [ ] **Step 2: Remove legacy routes**

Delete o bloco completo dos 3 children `api_keys`:

```js
// REMOVER (linhas 414-447 aprox.):
{
  path: "api_keys",
  name: "WhatsappAPIKeysList",
  component: () => import("../views/configuration/whatsapp/APIKeysList.vue"),
  meta: { title: "ChatFunnel - Chaves API", module: "CONFIGURATIONS", permission: "VIEW_API_KEYS" },
},
{
  path: "api_keys/create",
  name: "WhatsappAPIKeysCreate",
  component: () => import("../views/configuration/whatsapp/APIKey.vue"),
  meta: { title: "ChatFunnel - Criar chave API", module: "CONFIGURATIONS", permission: "ADD_API_KEY" },
},
{
  path: "api_keys/:id",
  name: "WhatsappAPIKeyPreview",
  component: () => import("../views/configuration/whatsapp/APIKey.vue"),
  meta: { title: "ChatFunnel - Visualizar chave API", module: "CONFIGURATIONS", permission: "EDIT_API_KEY" },
  props: true,
},
```

- [ ] **Step 3: Add new credentials routes**

Dentro do mesmo array `children` que continha o bloco `whatsapp.api_keys` (provavelmente o array da rota `/configuration`), adicionar:

```js
{
  path: "credentials",
  redirect: "/configuration/credentials/api-keys",
},
{
  path: "credentials/:tab(api-keys|mcp-tokens)",
  name: "CredentialsTab",
  component: () => import("../views/configuration/credentials/CredentialsPage.vue"),
  props: true,
  meta: {
    title: "ChatFunnel - Credenciais",
    module: "CONFIGURATIONS",
    permission: "VIEW_API_KEYS",
  },
},
{
  path: "credentials/:tab(api-keys|mcp-tokens)/create",
  name: "CredentialsTabCreate",
  component: () => import("../views/configuration/credentials/CredentialsPage.vue"),
  props: true,
  meta: {
    title: "ChatFunnel - Nova credencial",
    module: "CONFIGURATIONS",
    permission: "ADD_API_KEY",
  },
},
{
  path: "credentials/:tab(api-keys|mcp-tokens)/:id",
  name: "CredentialsTabEdit",
  component: () => import("../views/configuration/credentials/CredentialsPage.vue"),
  props: true,
  meta: {
    title: "ChatFunnel - Editar credencial",
    module: "CONFIGURATIONS",
    permission: "EDIT_API_KEY",
  },
},
```

> A regex `(api-keys|mcp-tokens)` no `path` previne tab inválida via URL.

- [ ] **Step 4: Smoke test (manual)**

Run: `cd chatfunnel-front && npm run dev`

Em browser:
1. `http://localhost:5173/configuration/credentials` → redireciona para `/api-keys`
2. `http://localhost:5173/configuration/credentials/api-keys` → renderiza lista
3. `http://localhost:5173/configuration/credentials/mcp-tokens` → renderiza lista MCP
4. `http://localhost:5173/configuration/credentials/api-keys/create` → renderiza form
5. `http://localhost:5173/configuration/whatsapp/api_keys` → 404 (rota legacy removida)

- [ ] **Step 5: Run all tests**

Run: `cd chatfunnel-front && npx vitest run src/views/configuration/credentials`
Expected: PASS — todos os testes acumulados (~38 tests).

- [ ] **Step 6: Commit**

```bash
cd chatfunnel-front
git add src/router/index.js
git commit -m "feat(credentials): wire credentials routes and remove legacy api_keys routes"
```

---

### Task 15: Sidebar (rename "Chaves API" → "Credenciais")

**Files:**
- Modify: `chatfunnel-front/src/components/sidebar/SideBarConfiguration.vue`

- [ ] **Step 1: Locate the sidebar item**

Run: `grep -n "Chaves API\|api_keys\|VIEW_API_KEYS" chatfunnel-front/src/components/sidebar/SideBarConfiguration.vue`

Identifique o item da lista que aponta para `whatsapp/api_keys` ou tem label "Chaves API".

- [ ] **Step 2: Rename label and update path**

Mude:
- Label exibida: `"Chaves API"` → `"Credenciais"` (preferir chave i18n `credentials.title`)
- Destino: de `/configuration/whatsapp/api_keys` (ou rota nomeada `WhatsappAPIKeysList`) → `/configuration/credentials/api-keys` (ou rota nomeada `CredentialsTab` com `params: { tab: 'api-keys' }`)
- Permissão de visibilidade: manter `VIEW_API_KEYS`

- [ ] **Step 3: Update i18n if needed**

Se o label estava hardcoded, OK. Se vinha de uma chave i18n, adicione `credentials.title: "Credenciais"` no arquivo de locale (`src/i18n/pt-BR.*`).

- [ ] **Step 4: Smoke test (manual)**

Run: `cd chatfunnel-front && npm run dev`

1. Abrir sidebar de Configurações
2. Confirmar que o item agora se chama "Credenciais"
3. Click → navega para `/configuration/credentials/api-keys`

- [ ] **Step 5: Commit**

```bash
cd chatfunnel-front
git add src/components/sidebar/SideBarConfiguration.vue \
        src/i18n
git commit -m "feat(credentials): rename sidebar 'Chaves API' to 'Credenciais'"
```

---

### Task 16: Integration check (typecheck + tests + lint + manual smoke)

**Files:** nenhum — apenas validação.

- [ ] **Step 1: Run typecheck**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit -p tsconfig.app.json`
Expected: zero erros novos relacionados a `views/configuration/credentials`. Erros pré-existentes em outros arquivos podem persistir — confirme com baseline antes da feature.

- [ ] **Step 2: Run all credentials tests together**

Run: `cd chatfunnel-front && npx vitest run src/views/configuration/credentials`
Expected: PASS (~38 tests)

- [ ] **Step 3: Run full unit suite**

Run: `cd chatfunnel-front && npm run test:run`
Expected: PASS — verifica que nada quebrou em outros módulos.

- [ ] **Step 4: Lint**

Run: `cd chatfunnel-front && npm run lint -- --max-warnings 0 src/views/configuration/credentials`
Expected: zero erros e zero warnings nos arquivos novos.

- [ ] **Step 5: Build**

Run: `cd chatfunnel-front && npm run build-dev`
Expected: build conclui sem erros.

- [ ] **Step 6: Manual smoke test no browser**

Run: `cd chatfunnel-front && npm run dev`

Cenários a verificar:
1. Sidebar mostra "Credenciais" em Configurações
2. Click no item → carrega `/configuration/credentials/api-keys` com lista
3. Switch de tab para Tokens MCP → URL muda + lista MCP carrega
4. + Nova chave → form abre, breadcrumb correto, validação dispara em campos vazios
5. Submit cria chave → toast + volta pra lista
6. Click linha existente → form de edit popula
7. + Novo token MCP → form abre, gera token, alerta + tabs de cliente + copy funcionam
8. "Gerar novo token" reseta o formulário
9. Bulk delete (api-keys) e bulk revoke (mcp) confirmam dialog antes de chamar o service
10. URL `/configuration/whatsapp/api_keys` retorna 404 (legacy fora)
11. Modal MCP em Integrações continua funcionando (legacy preservado intencionalmente)

- [ ] **Step 7: Update graphify**

Run: `cd chatfunnel-front && /d/Code/4-Vinicius/Chatfunnel/graphify-test/.venv/Scripts/graphify.exe update .`
Expected: incremental rebuild conclui em <10s.

- [ ] **Step 8: Update vault status**

Editar `vault/wiki/features/credenciais-page.md` mudando o `status` do frontmatter para `implemented` e linkando o branch + commits.

- [ ] **Step 9: Final commit (apenas se algo mudou no Step 7-8)**

```bash
git add vault/wiki/features/credenciais-page.md
git commit -m "docs(credentials): mark feature as implemented in vault"
```

---

## Self-Review (autor do plano em 2026-04-28)

**Spec coverage:** Cada decisão #1-#13 do spec tem pelo menos uma task que a implementa:
- #1 (rota :tab), #2 (verbos), #6 (estrutura) → T13, T14
- #3 (localização), #6 (estrutura A) → T1-T13
- #4 (CredentialsService), #4a (MCP), #4b (APIKeys) → T1
- #5 (pós-criação ref) → T12
- #7 (não move legacy) → não há task tocando `whatsapp/`
- #8 (rotas legacy removidas) → T14
- #9 (catálogos espelham) → T3
- #10 (sem step success) → T12 (estado dual sem step)
- #11 (Breadcrumb) → T7, T12
- #12 (sem coluna Token MCP) → T10
- #13 (permissões legacy) → T14, T15

**Placeholder scan:** apenas o caso documentado em T3 (constants vazias até serem extraídas do legacy) — explicitamente marcado como **DEVE preencher antes de prosseguir**.

**Type consistency:** `APIKey`, `APIKeyForm`, `APIKeyPermission` definidos em T1 e usados consistentemente em T4-T7. `CredentialsTab` definido em T2 e usado em T13. `McpIntegrationToken` / `McpIntegrationTokenCreated` reusados de `McpService.ts`. `CredentialsService.apiKeys.{list,getById,save,delete}` e `CredentialsService.mcp.{list,create,revoke,health}` consistentes em T1, T6, T7, T11, T12.

---

## Pendências do plan a resolver durante T3 e T15

1. **T3:** ler `whatsapp/APIKey.vue` para extrair valores exatos de `PERMISSIONS_CATALOG` e `EXPIRES_OPTIONS`. **Crítico:** os arrays vazios no template falham os testes de `APIKeyPermissions`.
2. **T15:** localizar o arquivo de i18n correto (`src/i18n/pt-BR.*`) e adicionar as chaves `credentials.*` referenciadas em todos os componentes (~25 chaves). Pode ser feito em qualquer task antes do smoke test final, mas T15 é o gate natural.
