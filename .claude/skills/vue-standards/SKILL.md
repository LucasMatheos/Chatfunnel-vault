---
name: vue-standards
description: Padroes arquiteturais Vue 3 para chatfunnel-front — composables, stores, script setup ordering, performance, organizacao por feature. Complementa o CLAUDE.md (design system) com regras de arquitetura.
trigger: Quando escrever ou modificar componentes Vue, composables, stores ou services no chatfunnel-front/
---

# Vue Standards — Arquitetura & Patterns

Skill complementar ao `CLAUDE.md` do chatfunnel-front. O CLAUDE.md cobre **design system, componentes e styling**. Esta skill cobre **arquitetura, composables, stores, performance e organizacao**.

> **Referencia base**: `vault/Docs/best-pretices-vue.md` e `vault/Docs/vue-gap-analysis.md`

---

## Checklist rapido (todo novo codigo Vue)

Antes de commitar, valide:

- [ ] `<script setup lang="ts">` com ordem interna padronizada (ver referencia)
- [ ] Logica reutilizavel extraida em composable `use*` (nao duplicada entre componentes)
- [ ] Store Pinia so para estado **realmente global** (auth, tema, preferencias)
- [ ] Dados de API **nao** persistidos em store como cache — usar composable ou futuramente TanStack Query
- [ ] Props estaveis em listas (passar valor resolvido, nao objeto global)
- [ ] `shallowRef`/`markRaw` somente com justificativa de performance medida
- [ ] Deep watch e excecao — preferir fontes especificas via getter
- [ ] Computed nao cria objetos novos desnecessariamente
- [ ] Novos arquivos `.ts` (nunca `.js`)

---

## 1. Ordem interna do `<script setup>`

ALWAYS seguir esta ordem dentro de `<script setup lang="ts">`:

```vue
<script setup lang="ts">
// 1. Imports
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ContactsService } from '@services/ContactsService'
import type { Contact } from './types'

// 2. Tipos locais (se nao justificam arquivo proprio)
interface Props { ... }

// 3. Props, Emits, Model
const props = defineProps<Props>()
const emit = defineEmits<{ update: [value: string] }>()

// 4. Stores e composables
const authStore = useAuthStore()
const router = useRouter()
const { data, loading } = useContacts()

// 5. Estado local (ref, reactive)
const searchQuery = ref('')
const isEditing = ref(false)

// 6. Computed
const filteredItems = computed(() => ...)

// 7. Funcoes / handlers
function handleSave() { ... }
function handleCancel() { ... }

// 8. Watchers
watch(searchQuery, (val) => { ... })

// 9. Lifecycle
onMounted(() => { ... })

// 10. Expose (raro)
defineExpose({ ... })
</script>
```

**Por que**: `<script setup>` remove a estrutura rigida do Options API. Sem convencao, cada arquivo vira "snowflake". Esta ordem segue o fluxo logico: dependencias → definicao → estado → derivados → comportamento → efeitos.

---

## 2. Composables — quando e como

### Quando extrair um composable

- Logica usada em **2+ componentes** (reuso real)
- Logica complexa que **polui** o componente (>30 linhas de orquestracao)
- **Regra de negocio** que nao e apresentacao (validacao, calculo, transformacao)
- Integracao com **APIs do browser** (clipboard, geolocation, media)

### Quando NAO extrair

- Logica usada em **1 componente** e com <15 linhas — manter inline
- Apenas para "parecer organizado" — composable sem reuso e overhead

### Convencoes

```ts
// ALWAYS: prefixo use*, retornar objeto com nomes claros
export function useContactFilters(contacts: Ref<Contact[]>) {
  const searchQuery = ref('')
  const statusFilter = ref<string | null>(null)

  const filtered = computed(() =>
    contacts.value
      .filter(c => matchesSearch(c, searchQuery.value))
      .filter(c => !statusFilter.value || c.status === statusFilter.value)
  )

  function resetFilters() {
    searchQuery.value = ''
    statusFilter.value = null
  }

  return {
    searchQuery,
    statusFilter,
    filtered,
    resetFilters
  }
}
```

### Anti-patterns

- **NEVER** usar estado no escopo do modulo (fora da funcao) sem intencao de singleton
- **NEVER** criar composable que so faz `return { ...store }` — use o store direto
- **NEVER** criar composable "god" com 10+ refs — quebrar em composables menores

### Onde colocar

| Escopo | Local |
|--------|-------|
| Compartilhado entre features | `src/common/composables/` |
| Especifico de uma feature | `src/views/{feature}/composables/` |
| Especifico de um componente complexo | `ComponentName/composables/` |

---

## 3. Disciplina de Stores (Pinia)

### O que vai no store

- Token de autenticacao, dados do usuario logado, permissoes
- Preferencias persistidas (tema, idioma, sidebar state)
- Estado compartilhado entre features **que nao e derivavel de API**

### O que NAO vai no store

- Cache de API (lista de contatos, mensagens, dashboards) — usar composable com fetch local ou futuramente TanStack Query
- Estado de formulario — manter local no componente/composable
- Estado de UI temporario (modais, tooltips, hover) — manter local
- Flags de loading/error de uma unica tela — composable

### Regra pratica

> "Se so uma tela usa esse dado, nao e estado global."

### Stores novos ALWAYS em TypeScript

```ts
// stores/design.ts (nao .js)
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useDesignStore = defineStore('design', () => {
  const sidebarCollapsed = ref(false)

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  return { sidebarCollapsed, toggleSidebar }
})
```

---

## 4. Performance — patterns consolidados

### Sempre aplicar

- **Route-level lazy loading** — ja adotado, manter 100%
- **Props estaveis em listas**: passar booleano resolvido, nao objeto global

```vue
<!-- BOM: cada item recebe boolean ja resolvido -->
<ContactItem
  v-for="contact in contacts"
  :key="contact.id"
  :contact="contact"
  :is-selected="contact.id === selectedId"
/>

<!-- RUIM: passa selectedId para todos, todos re-renderizam -->
<ContactItem
  v-for="contact in contacts"
  :key="contact.id"
  :contact="contact"
  :selected-id="selectedId"
/>
```

### Aplicar com medicao (nao como default)

- `v-memo` / `v-once` — somente com profiling que justifique
- `shallowRef` / `shallowReactive` — somente para estruturas grandes e imutaveis
- `markRaw` — somente para instancias de libs que nao devem ser reativas
- `manual chunks` no Vite — somente quando bundle analysis mostra problema

### Computed

- NEVER criar objeto novo a cada execucao sem necessidade
- Aproveitar **computed stability** (Vue 3.4+) — se o valor nao mudou, nao triggera dependentes

### Watch

- **Deep watch e excecao** — preferir getter especifico
- Lembrar de cleanup em watchers async (race conditions)

```ts
// BOM: observa campo especifico
watch(() => props.contactId, async (id) => { ... })

// RUIM: deep watch no objeto inteiro
watch(props, () => { ... }, { deep: true })
```

---

## 5. Organizacao por feature (para codigo novo)

Para **features novas** ou **refactors grandes**, preferir co-localizacao:

```
src/views/{feature}/
  index.vue                 # Pagina principal (route component)
  components/
    FeatureList.vue
    FeatureCard.vue
  composables/
    useFeatureState.ts
    useFeatureFilters.ts
  types/
    feature.ts
```

**Nao mover** codigo legacy para essa estrutura proativamente — apenas adotar em codigo novo.

Para **estado compartilhado** entre features, manter em `src/common/composables/` ou `src/stores/`.

---

## 6. TypeScript — patterns no Vue

### Props tipadas

```ts
// Preferir interface explicita
interface Props {
  contact: Contact
  isEditing?: boolean
  onSave?: (data: Contact) => void
}
const props = withDefaults(defineProps<Props>(), {
  isEditing: false
})
```

### Emits tipados

```ts
const emit = defineEmits<{
  save: [data: Contact]
  cancel: []
  'update:modelValue': [value: string]
}>()
```

### Refs tipados quando nao inferivel

```ts
const items = ref<Contact[]>([])
const selectedId = ref<string | null>(null)
```

### Template refs

```ts
const inputRef = useTemplateRef<HTMLInputElement>('inputRef')
```

---

## 7. Testing patterns

- **Testar interface publica**: props, events, slots, DOM renderizado
- **NAO testar** implementacao interna (refs, computed, metodos privados)
- **Spec file junto ao componente**: `ComponentName.spec.ts`
- **Composables sao funcoes**: testar como funcoes puras quando possivel

```ts
// Composable test
import { useContactFilters } from './useContactFilters'

test('filtra por busca', () => {
  const contacts = ref([{ name: 'Ana' }, { name: 'Bruno' }])
  const { searchQuery, filtered } = useContactFilters(contacts)

  searchQuery.value = 'ana'
  expect(filtered.value).toHaveLength(1)
})
```

---

## Referencia rapida — onde encontrar mais

| Tema | Arquivo |
|------|---------|
| Design system, componentes, CVA | `chatfunnel-front/CLAUDE.md` |
| Tokens, spacing, shadows | `.claude/rules/design-system.md` |
| Gap analysis completo | `vault/Docs/vue-gap-analysis.md` |
| Best practices original | `vault/Docs/best-pretices-vue.md` |
