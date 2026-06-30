# Tags — Ver Flows (Frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar opção "Ver Flows" no menu de cada tag que abre um modal listando as automações vinculadas, com navegação direta para edição do flow.

**Architecture:** O `TagsService.js` ganha o método `getTagAutomations`. Um novo componente `TagAutomationsModal.vue` encapsula todo o estado e UI do modal (DialogControl + skeleton + lista navegável). O `ContactsManageTags.vue` recebe o item de menu, monta o modal e corrige o mapping de contagem de automações que quebrou após o fix do backend.

**Tech Stack:** Vue 3 `<script setup lang="ts">`, Tailwind v4 (tokens de escala), shadcn-vue (`DialogControl`, `Skeleton`), `lucide-vue-next`, `vue-router`.

---

## Mapa de Arquivos

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| `chatfunnel-front/src/common/services/TagsService.js` | Modificar | Adicionar `getTagAutomations(tagId)` |
| `chatfunnel-front/src/views/contacts/components/modal/TagAutomationsModal.vue` | Criar | Modal completo: loading, lista de flows, empty state, navegação |
| `chatfunnel-front/src/views/contacts/ContactsManageTags.vue` | Modificar | Fix mapping de automações + item de menu "Ver Flows" + montar modal |

---

### Task 1: Criar branch no frontend e adicionar `getTagAutomations` ao TagsService

**Files:**
- Modify: `chatfunnel-front/src/common/services/TagsService.js`

- [ ] **Step 1: Criar branch `feature/tags-automations` no `chatfunnel-front`**

```bash
cd chatfunnel-front
git checkout release
git checkout -b feature/tags-automations
```

- [ ] **Step 2: Adicionar método `getTagAutomations` ao TagsService**

Substituir o conteúdo completo de `chatfunnel-front/src/common/services/TagsService.js`:

```js
import { NestApi } from "@/common/api";

const TagsService = {
  listTags: (params) => NestApi.get()("/tags", params),
  createFolder: (name) => NestApi.post()("/tags/folder", { name: name }),
  createTag: (tag) => NestApi.post()("/tags", tag),
  deleteTag: (tagId) => NestApi.delete()(`/tags/${tagId}`),
  getFolders: () => NestApi.get()("/tags/folder"),
  updateTagFolder: (tagId, folderId) =>
    NestApi.put()("/tags/folder", {
      tagId: tagId,
      folderId: folderId,
    }),
  UpdateFolderName: (id, name) => NestApi.put()(`/tags/folder/${id}`, { name: name }),
  deleteFolder: (id) => NestApi.delete()(`/tags/folder/${id}`),
  deleteManyTags: (ids) => NestApi.delete()(`/tags/many`, { tagsIds: ids }),
  getTagAutomations: (tagId) => NestApi.get()(`/tags/${tagId}/automations`),
};

export default TagsService;
```

- [ ] **Step 3: Commit**

```bash
cd chatfunnel-front
git add src/common/services/TagsService.js
git commit -m "feat(tags): add getTagAutomations service method"
```

---

### Task 2: Criar `TagAutomationsModal.vue`

**Files:**
- Create: `chatfunnel-front/src/views/contacts/components/modal/TagAutomationsModal.vue`

**Contexto:**
- `DialogControl` aceita `v-model:open`, `title`, `subtitle`, `size`
- `Skeleton` espelha o layout real (linhas de altura `h-10`)
- Cada flow item: `bg-gray-100 hover:bg-gray-200` (tokens de escala, nunca semânticos)
- Navegação: `router.push({ name: 'AutomationEdit', params: { id: flow.id } })` fecha o modal e abre o flow
- `defineExpose({ show })` — pai chama `flowsModal.value.show(tagId, tagName)`

- [ ] **Step 1: Criar o arquivo do modal**

```vue
<template>
  <DialogControl
    v-model:open="isOpen"
    title="Flows vinculados"
    :subtitle="tagName"
    size="sm"
  >
    <div v-if="isLoading" class="flex flex-col gap-3">
      <Skeleton class="h-10 w-full rounded-lg" />
      <Skeleton class="h-10 w-full rounded-lg" />
      <Skeleton class="h-10 w-full rounded-lg" />
    </div>

    <p
      v-else-if="flows.length === 0"
      class="py-6 text-center typo-body-14-regular text-gray-600"
    >
      Nenhum flow vinculado a esta tag.
    </p>

    <ul v-else class="flex flex-col gap-1">
      <li
        v-for="flow in flows"
        :key="flow.id"
        class="flex cursor-pointer items-center justify-between rounded-lg bg-gray-100 px-3 py-2.5 transition-colors hover:bg-gray-200"
        @click="goToFlow(flow.id)"
      >
        <span class="truncate typo-body-14-medium text-gray-900">{{ flow.name }}</span>
        <ArrowRight class="ml-2 size-4 shrink-0 text-gray-500" />
      </li>
    </ul>
  </DialogControl>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight } from 'lucide-vue-next'
import { DialogControl } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import TagsService from '@services/TagsService'

const router = useRouter()

const isOpen = ref(false)
const isLoading = ref(false)
const tagName = ref('')
const flows = ref<{ id: string; name: string }[]>([])

async function show(tagId: string, name: string) {
  tagName.value = name
  isOpen.value = true
  isLoading.value = true
  flows.value = []
  try {
    const res = await TagsService.getTagAutomations(tagId)
    flows.value = res.data
  } finally {
    isLoading.value = false
  }
}

function goToFlow(flowId: string) {
  isOpen.value = false
  router.push({ name: 'AutomationEdit', params: { id: flowId } })
}

defineExpose({ show })
</script>
```

- [ ] **Step 2: Commit**

```bash
cd chatfunnel-front
git add src/views/contacts/components/modal/TagAutomationsModal.vue
git commit -m "feat(tags): add TagAutomationsModal component"
```

---

### Task 3: Atualizar `ContactsManageTags.vue`

**Files:**
- Modify: `chatfunnel-front/src/views/contacts/ContactsManageTags.vue`

**3 mudanças neste arquivo:**
1. Import + ref do novo modal
2. Fix do mapping de `automations` e `canBeDeleted` (quebrado pelo fix do backend)
3. Item de menu "Ver Flows" + tag `<TagAutomationsModal>` no template

- [ ] **Step 1: Adicionar import do modal no script**

Após `import TagsModal from "./components/modal/TagsModal.vue"` (linha 135), adicionar:

```js
import TagAutomationsModal from './components/modal/TagAutomationsModal.vue'
```

- [ ] **Step 2: Adicionar ref do modal no script**

Após `const renameTagModal = ref(null)` (linha 148), adicionar:

```js
const flowsModal = ref(null)
```

- [ ] **Step 3: Corrigir mapping de automações no `ListTags`**

Localizar o `.map()` dentro de `ListTags` (~linha 213). Substituir as duas linhas `canBeDeleted` e `automations`:

```js
tags.value.data = foldersSeparator(
  response.data.map((item) => ({
    id: item.id,
    name: item.name,
    folder: item.folder ? item.folder.name : null,
    system: !item.accountId,
    canBeDeleted: !(item._count.actions + item._count.triggers) && item.accountId,
    isChecked: false,
    contacts: item._count.tagsContacts,
    automations: item._count.actions + item._count.triggers,
  })),
)
```

- [ ] **Step 4: Adicionar item de menu "Ver Flows" no template**

Após o `v-list-item` de "Ver contatos" (linha ~114), adicionar:

```html
<v-list-item
    prepend-icon="mdi-lightning-bolt-outline"
    title="Ver Flows"
    @click.stop="flowsModal.show(row.item.id, row.item.name)"
/>
```

- [ ] **Step 5: Montar o modal no template**

Após `<RenameTagModal ref="renameTagModal" @update-list-tags="ListTags"/>` (linha ~125), adicionar:

```html
<TagAutomationsModal ref="flowsModal" />
```

- [ ] **Step 6: Commit**

```bash
cd chatfunnel-front
git add src/views/contacts/ContactsManageTags.vue
git commit -m "feat(tags): add Ver Flows menu item and fix automations count mapping"
```
