# CreateCardModalV2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor CreateCardModal step 1 (contact info) from Vuetify to shadcn-vue, creating CreateCardModalV2 alongside the original for rollback safety.

**Architecture:** Composable-driven state (`useCreateCardForm.ts`) shared via typed `InjectionKey`. Shell uses `DialogControl` + `StepperControl`. Step 1 splits into `Tabs` with `ExistingContactTab` and `NewContactTab`. New reusable `InputPhone` component in `ui/`.

**Tech Stack:** Vue 3 + `<script setup lang="ts">`, shadcn-vue (Dialog, Stepper, Tabs, Popover, Button, Input), VeeValidate + Zod, intl-tel-input, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-05-12-create-card-modal-v2-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `src/common/keys/createCardForm.ts` | Typed InjectionKey for form state |
| Create | `src/views/crm/components/CreateCardModalV2/composables/useCreateCardForm.ts` | Form state, reset, save logic |
| Create | `src/views/crm/components/CreateCardModalV2/index.vue` | Dialog + Stepper + actions shell |
| Create | `src/views/crm/components/CreateCardModalV2/components/index.ts` | Barrel exports |
| Create | `src/views/crm/components/CreateCardModalV2/components/ContactForm.vue` | Tabs container |
| Create | `src/views/crm/components/CreateCardModalV2/components/ExistingContactTab.vue` | Autocomplete + disabled fields |
| Create | `src/views/crm/components/CreateCardModalV2/components/NewContactTab.vue` | VeeValidate form |
| Create | `src/views/crm/components/CreateCardModalV2/components/InputContactExist.vue` | Migrated autocomplete (Popover) |
| Create | `src/components/ui/input-phone/InputPhone.vue` | Flag selector + masked phone |
| Create | `src/components/ui/input-phone/index.ts` | Export |
| Modify | `src/views/crm/components/KanbanColumn.vue:135` | Import swap to V2 |

---

### Task 1: Injection Key + Form State Types

**Files:**
- Create: `src/common/keys/createCardForm.ts`
- Modify: `src/common/keys/index.js` → rename to `index.ts`, re-export

- [ ] **Step 1: Create the injection key file**

```typescript
// src/common/keys/createCardForm.ts
import type { InjectionKey, Ref } from 'vue'

export interface Column {
  id: number
  name: string
  position: number
}

export interface Moderator {
  user: {
    id: number
    name: string
    photo?: string
  }
}

export interface CreateCardFormState {
  kanbanId: number | null
  contactId: number | null
  name: string
  phone: string
  email: string
  columnId: number | null
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  description: string
  columns: Column[]
  moderators: Moderator[]
  idd: string
  ddd: string
  isNewContact: boolean
}

export const CREATE_CARD_FORM_KEY: InjectionKey<Ref<CreateCardFormState>> = Symbol('createCardForm')
```

- [ ] **Step 2: Update the keys barrel export**

Rename `src/common/keys/index.js` to `src/common/keys/index.ts` and add the new export:

```typescript
// src/common/keys/index.ts
export const HAS_PERMISSION = Symbol('hasPermissionModerator')
export { CREATE_CARD_FORM_KEY } from './createCardForm'
export type { CreateCardFormState, Column, Moderator } from './createCardForm'
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `keys/`

- [ ] **Step 4: Commit**

```bash
git add src/common/keys/createCardForm.ts src/common/keys/index.ts
git commit -m "feat(crm): add typed InjectionKey for CreateCardForm state"
```

---

### Task 2: useCreateCardForm Composable

**Files:**
- Create: `src/views/crm/components/CreateCardModalV2/composables/useCreateCardForm.ts`

- [ ] **Step 1: Create the composable**

```typescript
// src/views/crm/components/CreateCardModalV2/composables/useCreateCardForm.ts
import { ref, computed } from 'vue'
import { cloneDeep } from 'lodash'
import { KanbanService } from '@/common/services'
import { useAlerts } from '@/common/composables/AlertsComposable'
import type { CreateCardFormState } from '@/common/keys/createCardForm'

const DEFAULT_STATE: CreateCardFormState = {
  kanbanId: null,
  contactId: null,
  name: '',
  phone: '',
  email: '',
  columnId: null,
  priority: 'LOW',
  description: '',
  columns: [],
  moderators: [],
  idd: '55',
  ddd: '',
  isNewContact: false,
}

export function useCreateCardForm() {
  const { showToastSuccess } = useAlerts()
  const formState = ref<CreateCardFormState>({ ...DEFAULT_STATE })
  const isSaving = ref(false)

  const phoneNumber = computed(() => {
    const { idd, ddd, phone } = formState.value
    if (idd && ddd) return `${idd}${ddd}${phone}`
    return phone
  })

  function resetForm(kanban: { id: number; name: string; columns: any[] }, columnId: number) {
    formState.value = {
      ...DEFAULT_STATE,
      kanbanId: kanban.id,
      columnId,
      columns: kanban.columns,
      idd: '55',
    }
  }

  function handleSelectContact(contact: {
    id: number
    name: string
    phone?: string
    email?: string
  }) {
    formState.value.contactId = contact.id
    formState.value.name = contact.name
    formState.value.phone = contact.phone ?? ''
    formState.value.email = contact.email ?? ''
  }

  async function handleSave(emit: (event: 'update-list-cards') => void) {
    if (formState.value.idd !== '' && formState.value.ddd !== '') {
      formState.value.phone = phoneNumber.value
    }

    const form = cloneDeep(formState.value) as any
    form.moderators = formState.value.moderators.map((e) => e.user.id)
    delete form.columns

    isSaving.value = true
    try {
      await KanbanService.createCard(formState.value.kanbanId, form)
      showToastSuccess('Card criado com sucesso!')
      emit('update-list-cards')
      return true
    } finally {
      isSaving.value = false
    }
  }

  return {
    formState,
    isSaving,
    phoneNumber,
    resetForm,
    handleSelectContact,
    handleSave,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `useCreateCardForm`

- [ ] **Step 3: Commit**

```bash
git add src/views/crm/components/CreateCardModalV2/composables/useCreateCardForm.ts
git commit -m "feat(crm): add useCreateCardForm composable with typed state"
```

---

### Task 3: InputPhone Reusable Component

**Files:**
- Create: `src/components/ui/input-phone/InputPhone.vue`
- Create: `src/components/ui/input-phone/index.ts`

- [ ] **Step 1: Create the index barrel**

```typescript
// src/components/ui/input-phone/index.ts
export { default as InputPhone } from './InputPhone.vue'
```

- [ ] **Step 2: Create InputPhone.vue**

```vue
<!-- src/components/ui/input-phone/InputPhone.vue -->
<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import intlTelInput from 'intl-tel-input'
import 'intl-tel-input/build/css/intlTelInput.css'

type Props = {
  idd?: string
  ddd?: string
  phone?: string
  disabled?: boolean
  placeholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  idd: '55',
  ddd: '',
  phone: '',
  disabled: false,
  placeholder: '(00) 00000-0000',
})

const emit = defineEmits<{
  'update:idd': [value: string]
  'update:ddd': [value: string]
  'update:phone': [value: string]
}>()

const phoneInputRef = ref<HTMLInputElement | null>(null)
let itiInstance: any = null

const displayValue = computed(() => {
  const ddd = props.ddd
  const phone = props.phone
  if (!ddd && !phone) return ''
  if (ddd && phone) return `(${ddd}) ${formatPhone(phone)}`
  if (phone) return formatPhone(phone)
  return ddd
})

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length <= 4) return digits
  if (digits.length <= 8) return `${digits.slice(0, 4)}-${digits.slice(4)}`
  return `${digits.slice(0, 5)}-${digits.slice(5, 9)}`
}

function parseInput(raw: string) {
  const digits = raw.replace(/\D/g, '')

  if (digits.length <= 2) {
    emit('update:ddd', digits)
    emit('update:phone', '')
  } else {
    emit('update:ddd', digits.slice(0, 2))
    emit('update:phone', digits.slice(2, 13))
  }
}

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement
  const raw = target.value
  parseInput(raw)
}

function handleCountryChange() {
  if (!itiInstance) return
  const countryData = itiInstance.getSelectedCountryData()
  if (countryData?.dialCode) {
    emit('update:idd', countryData.dialCode)
  }
}

onMounted(() => {
  if (!phoneInputRef.value) return

  itiInstance = intlTelInput(phoneInputRef.value, {
    initialCountry: 'br',
    separateDialCode: false,
    showFlags: true,
    showSelectedDialCode: false,
    containerClass: 'iti--phone-input',
    dropdownContainer: document.body,
    countryOrder: ['br', 'us', 'pt', 'ar', 'co', 'mx'],
  })

  phoneInputRef.value.addEventListener('countrychange', handleCountryChange)

  // Sync initial country from idd prop
  if (props.idd && props.idd !== '55') {
    itiInstance.setCountry(props.idd)
  }
})

onBeforeUnmount(() => {
  if (itiInstance) {
    phoneInputRef.value?.removeEventListener('countrychange', handleCountryChange)
    itiInstance.destroy()
  }
})

watch(
  () => props.idd,
  (newIdd) => {
    if (!itiInstance || !newIdd) return
    const currentData = itiInstance.getSelectedCountryData()
    if (currentData?.dialCode !== newIdd) {
      // intl-tel-input expects ISO2 code, not dial code — best-effort sync
    }
  }
)
</script>

<template>
  <div
    class="flex items-center rounded-cf-md border border-gray-400 bg-white transition-colors focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100"
    :class="{ 'opacity-60 pointer-events-none bg-gray-200': disabled }"
  >
    <input
      ref="phoneInputRef"
      type="tel"
      :value="displayValue"
      :placeholder="placeholder"
      :disabled="disabled"
      class="w-full bg-transparent px-3 py-2.5 text-sm text-gray-1000 outline-none placeholder:text-gray-500"
      @input="handleInput"
    />
  </div>
</template>

<style>
/* intl-tel-input flag container styling */
.iti--phone-input {
  width: 100%;
  display: flex;
}
.iti--phone-input .iti__flag-container {
  position: relative;
}
.iti--phone-input .iti__selected-flag {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px 0 12px;
  border-right: 1px solid oklch(0.87 0 0);
  background: oklch(0.97 0 0);
  border-radius: 12px 0 0 12px;
  cursor: pointer;
}
.iti--phone-input .iti__selected-flag:hover {
  background: oklch(0.94 0 0);
}
.iti--phone-input input {
  padding-left: 12px !important;
}
</style>
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `input-phone`

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/input-phone/
git commit -m "feat(ui): add InputPhone component with flag selector and mask"
```

---

### Task 4: InputContactExist Migration (Popover)

**Files:**
- Create: `src/views/crm/components/CreateCardModalV2/components/InputContactExist.vue`

- [ ] **Step 1: Create the migrated component**

```vue
<!-- src/views/crm/components/CreateCardModalV2/components/InputContactExist.vue -->
<script setup lang="ts">
import { ref, watch } from 'vue'
import { debounce } from 'lodash'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { InputControl } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import ContactsService from '@services/ContactsService'
import AvatarFallback from '@/components/avatar/AvatarFallback.vue'
import { PhMagnifyingGlass, PhEnvelope, PhPhone } from '@phosphor-icons/vue'

interface Contact {
  id: number
  name: string
  email?: string
  phone?: string
  photo?: string
}

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:contact': [contact: Contact]
}>()

watch(
  () => props.modelValue,
  (newValue) => {
    searchTerm.value = newValue ?? ''
  }
)

const isOpen = ref(false)
const searchTerm = ref('')
const filteredContacts = ref<Contact[]>([])
const loading = ref(true)

function listContacts(currentPage = 1, pageSize = 50) {
  loading.value = true
  isOpen.value = true
  ContactsService.listContacts({ searchTerm: searchTerm.value }, currentPage, pageSize)
    .then((response: any) => {
      filteredContacts.value = response.data.contacts
    })
    .finally(() => {
      loading.value = false
    })
}

const handleDebounceFilter = debounce(() => listContacts(), 300)

function handleChooseContact(contact: Contact) {
  searchTerm.value = contact.name
  emit('update:contact', contact)
  isOpen.value = false
}

function handleInputClick() {
  listContacts(1, 50)
}

function handleInput(value: string | number) {
  searchTerm.value = String(value)
  handleDebounceFilter()
}
</script>

<template>
  <Popover v-model:open="isOpen">
    <PopoverTrigger as-child>
      <InputControl
        :model-value="searchTerm"
        placeholder="Pesquisar contato na lista"
        :show-status-icon="false"
        @update:model-value="handleInput"
        @click="handleInputClick"
      >
        <template #left>
          <PhMagnifyingGlass :size="16" class="text-gray-600 shrink-0" />
        </template>
      </InputControl>
    </PopoverTrigger>

    <PopoverContent
      align="start"
      :side-offset="4"
      class="w-[var(--reka-popover-trigger-width)] max-h-[250px] overflow-y-auto p-0"
    >
      <!-- Loading -->
      <div
        v-if="loading"
        class="flex items-center justify-center gap-2 p-4"
      >
        <span class="typo-body-14-regular text-gray-600">Buscando contatos</span>
        <Spinner class="size-5" />
      </div>

      <!-- Empty -->
      <div
        v-else-if="filteredContacts.length === 0"
        class="p-4 text-center"
      >
        <span class="typo-body-14-regular text-gray-600">Nenhum contato encontrado</span>
      </div>

      <!-- Results -->
      <div v-else class="flex flex-col">
        <button
          v-for="contact in filteredContacts"
          :key="contact.id"
          type="button"
          class="flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-200"
          @click.stop.prevent="handleChooseContact(contact)"
        >
          <div class="size-9 shrink-0 overflow-hidden rounded-full">
            <AvatarFallback :src="contact.photo" />
          </div>
          <div class="flex flex-col gap-0.5 overflow-hidden">
            <span class="typo-body-14-semibold text-gray-1000 truncate">{{ contact.name }}</span>
            <div class="flex items-center gap-3">
              <span
                v-if="contact.email"
                class="flex items-center gap-1 typo-body-12-regular text-gray-600 truncate"
              >
                <PhEnvelope :size="14" class="shrink-0" />
                {{ contact.email }}
              </span>
              <span
                v-if="contact.phone"
                class="flex items-center gap-1 typo-body-12-regular text-gray-600 truncate"
              >
                <PhPhone :size="14" class="shrink-0" />
                {{ contact.phone }}
              </span>
            </div>
          </div>
        </button>
      </div>
    </PopoverContent>
  </Popover>
</template>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `InputContactExist`

- [ ] **Step 3: Commit**

```bash
git add src/views/crm/components/CreateCardModalV2/components/InputContactExist.vue
git commit -m "feat(crm): migrate InputContactExist from v-menu to Popover shadcn"
```

---

### Task 5: ExistingContactTab

**Files:**
- Create: `src/views/crm/components/CreateCardModalV2/components/ExistingContactTab.vue`

- [ ] **Step 1: Create the component**

```vue
<!-- src/views/crm/components/CreateCardModalV2/components/ExistingContactTab.vue -->
<script setup lang="ts">
import { inject } from 'vue'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'
import { CREATE_CARD_FORM_KEY } from '@/common/keys/createCardForm'
import { InputControl } from '@/components/ui/input'
import { Field, FieldLabel, FieldError } from '@/components/ui/field'
import InputContactExist from './InputContactExist.vue'

const formState = inject(CREATE_CARD_FORM_KEY)!

const schema = toTypedSchema(
  z.object({
    contactId: z.number({ required_error: 'Selecione um contato' }),
    name: z.string().min(1, 'Selecione um contato'),
  })
)

const { validate, resetForm, setFieldValue, errors } = useForm({
  validationSchema: schema,
  initialValues: {
    contactId: undefined as number | undefined,
    name: '',
  },
})

function handleChooseContact(contact: { id: number; name: string; phone?: string; email?: string }) {
  formState.value.contactId = contact.id
  formState.value.name = contact.name
  formState.value.phone = contact.phone ?? ''
  formState.value.email = contact.email ?? ''

  setFieldValue('contactId', contact.id)
  setFieldValue('name', contact.name)
}

defineExpose({ validate, resetForm })
</script>

<template>
  <div class="flex flex-col gap-5 pt-6">
    <!-- Nome / Busca -->
    <Field :data-invalid="!!errors.contactId">
      <FieldLabel>Nome</FieldLabel>
      <InputContactExist
        :model-value="formState.name"
        @update:contact="handleChooseContact"
      />
      <FieldError :errors="errors.contactId ? [errors.contactId] : []" />
    </Field>

    <!-- Telefone + Email (grid 2 cols) -->
    <div class="grid grid-cols-2 gap-4">
      <Field>
        <FieldLabel>Telefone</FieldLabel>
        <InputControl
          :model-value="formState.phone"
          disabled
          :show-status-icon="false"
          placeholder="Telefone do contato"
        />
      </Field>

      <Field>
        <FieldLabel>Email</FieldLabel>
        <InputControl
          :model-value="formState.email"
          disabled
          :show-status-icon="false"
          placeholder="Email do contato"
        />
      </Field>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/views/crm/components/CreateCardModalV2/components/ExistingContactTab.vue
git commit -m "feat(crm): add ExistingContactTab with autocomplete and validation"
```

---

### Task 6: NewContactTab

**Files:**
- Create: `src/views/crm/components/CreateCardModalV2/components/NewContactTab.vue`

- [ ] **Step 1: Create the component**

```vue
<!-- src/views/crm/components/CreateCardModalV2/components/NewContactTab.vue -->
<script setup lang="ts">
import { inject, watch } from 'vue'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'
import { CREATE_CARD_FORM_KEY } from '@/common/keys/createCardForm'
import VeeInput from '@/components/ui/input/VeeInput.vue'
import { InputPhone } from '@/components/ui/input-phone'
import { Field, FieldLabel, FieldError } from '@/components/ui/field'

const formState = inject(CREATE_CARD_FORM_KEY)!

const schema = toTypedSchema(
  z
    .object({
      name: z.string().min(1, 'Nome e obrigatorio'),
      phone: z.string().optional(),
      email: z.string().email('Email invalido').optional().or(z.literal('')),
    })
    .refine((data) => data.phone || data.email, {
      message: 'Informe pelo menos telefone ou email',
      path: ['phone'],
    })
)

const { validate, resetForm, errors, setFieldValue } = useForm({
  validationSchema: schema,
  initialValues: {
    name: '',
    phone: '',
    email: '',
  },
})

// Sync VeeValidate fields -> formState
watch(
  () => formState.value.name,
  (v) => setFieldValue('name', v)
)

function handleNameInput(value: string) {
  formState.value.name = value
}

function handleIddUpdate(value: string) {
  formState.value.idd = value
}

function handleDddUpdate(value: string) {
  formState.value.ddd = value
  setFieldValue('phone', `${formState.value.ddd}${formState.value.phone}`)
}

function handlePhoneUpdate(value: string) {
  formState.value.phone = value
  setFieldValue('phone', `${formState.value.ddd}${value}`)
}

function handleEmailInput(value: string) {
  formState.value.email = value
  setFieldValue('email', value)
}

defineExpose({ validate, resetForm })
</script>

<template>
  <div class="flex flex-col gap-5 pt-6">
    <!-- Nome -->
    <VeeInput
      name="name"
      label="Nome"
      placeholder="Nome do contato"
      @update:model-value="handleNameInput"
    />

    <!-- Telefone + Email (grid 2 cols) -->
    <div class="grid grid-cols-2 gap-4">
      <Field :data-invalid="!!errors.phone">
        <FieldLabel>Telefone</FieldLabel>
        <InputPhone
          :idd="formState.idd"
          :ddd="formState.ddd"
          :phone="formState.phone"
          @update:idd="handleIddUpdate"
          @update:ddd="handleDddUpdate"
          @update:phone="handlePhoneUpdate"
        />
        <FieldError :errors="errors.phone ? [errors.phone] : []" />
      </Field>

      <VeeInput
        name="email"
        label="Email"
        placeholder="email@exemplo.com"
        type="email"
        @update:model-value="handleEmailInput"
      />
    </div>
  </div>
</template>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/views/crm/components/CreateCardModalV2/components/NewContactTab.vue
git commit -m "feat(crm): add NewContactTab with VeeValidate + Zod + InputPhone"
```

---

### Task 7: ContactForm (Tabs Container)

**Files:**
- Create: `src/views/crm/components/CreateCardModalV2/components/ContactForm.vue`

- [ ] **Step 1: Create the component**

```vue
<!-- src/views/crm/components/CreateCardModalV2/components/ContactForm.vue -->
<script setup lang="ts">
import { ref, inject, watch } from 'vue'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CREATE_CARD_FORM_KEY } from '@/common/keys/createCardForm'
import ExistingContactTab from './ExistingContactTab.vue'
import NewContactTab from './NewContactTab.vue'

const formState = inject(CREATE_CARD_FORM_KEY)!

const activeTab = ref<'existing' | 'new'>('existing')
const existingTabRef = ref<InstanceType<typeof ExistingContactTab> | null>(null)
const newTabRef = ref<InstanceType<typeof NewContactTab> | null>(null)

watch(activeTab, (tab) => {
  formState.value.isNewContact = tab === 'new'
  formState.value.contactId = null
  formState.value.name = ''
  formState.value.phone = ''
  formState.value.email = ''
  formState.value.ddd = ''

  // Reset validation on the tab we're leaving
  if (tab === 'existing') {
    newTabRef.value?.resetForm()
  } else {
    existingTabRef.value?.resetForm()
  }
})

async function validate(): Promise<boolean> {
  if (activeTab.value === 'existing') {
    const result = await existingTabRef.value?.validate()
    return result?.valid ?? false
  } else {
    const result = await newTabRef.value?.validate()
    return result?.valid ?? false
  }
}

defineExpose({ validate })
</script>

<template>
  <Tabs v-model="activeTab" class="w-full">
    <TabsList class="w-full">
      <TabsTrigger value="existing" class="flex-1">
        Contato existente
      </TabsTrigger>
      <TabsTrigger value="new" class="flex-1">
        Novo contato
      </TabsTrigger>
    </TabsList>

    <TabsContent value="existing">
      <ExistingContactTab ref="existingTabRef" />
    </TabsContent>

    <TabsContent value="new">
      <NewContactTab ref="newTabRef" />
    </TabsContent>
  </Tabs>
</template>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/views/crm/components/CreateCardModalV2/components/ContactForm.vue
git commit -m "feat(crm): add ContactForm with Tabs (existing/new contact)"
```

---

### Task 8: Barrel Export + index.vue Shell

**Files:**
- Create: `src/views/crm/components/CreateCardModalV2/components/index.ts`
- Create: `src/views/crm/components/CreateCardModalV2/index.vue`

- [ ] **Step 1: Create barrel export**

```typescript
// src/views/crm/components/CreateCardModalV2/components/index.ts
export { default as ContactForm } from './ContactForm.vue'
export { default as ExistingContactTab } from './ExistingContactTab.vue'
export { default as NewContactTab } from './NewContactTab.vue'
export { default as InputContactExist } from './InputContactExist.vue'
```

- [ ] **Step 2: Create index.vue (shell)**

```vue
<!-- src/views/crm/components/CreateCardModalV2/index.vue -->
<script setup lang="ts">
import { ref, provide } from 'vue'
import { DialogControl } from '@/components/ui/dialog'
import { StepperControl } from '@/components/ui/stepper'
import type { StepConfig } from '@/components/ui/stepper'
import { Button } from '@/components/ui/button'
import { ContactForm } from './components'
import KanbanForm from '@/views/crm/components/CreateCardModal/components/KanbanForm.vue'
import { useCreateCardForm } from './composables/useCreateCardForm'
import { CREATE_CARD_FORM_KEY } from '@/common/keys/createCardForm'

const { formState, isSaving, resetForm, handleSave } = useCreateCardForm()
provide(CREATE_CARD_FORM_KEY, formState)

const emit = defineEmits<{
  'update-list-cards': []
}>()

const isOpen = ref(false)
const step = ref(1)
const kanbanName = ref('')
const contactFormRef = ref<InstanceType<typeof ContactForm> | null>(null)

const steps: StepConfig[] = [
  { title: 'Informacoes do contato' },
  { title: 'Configuracao no pipeline' },
]

function showDialog(kanban: { id: number; name: string; columns: any[] }, columnId: number) {
  kanbanName.value = kanban.name
  resetForm(kanban, columnId)
  step.value = 1
  isOpen.value = true
}

function closeDialog() {
  isOpen.value = false
}

async function handleNext() {
  const valid = await contactFormRef.value?.validate()
  if (valid) {
    step.value = 2
  }
}

async function handleSaveClick() {
  const closed = await handleSave(emit)
  if (closed) {
    closeDialog()
  }
}

defineExpose({ showDialog, closeDialog })
</script>

<template>
  <DialogControl
    v-model:open="isOpen"
    title="Adicionar oportunidade"
    :subtitle="`Pipeline: ${kanbanName}`"
    size="xl"
    :close-on-overlay="false"
    :close-on-escape="false"
    :has-actions="true"
  >
    <div class="flex flex-col gap-6">
      <!-- Stepper -->
      <StepperControl
        v-model="step"
        :steps="steps"
      />

      <!-- Step content -->
      <ContactForm v-show="step === 1" ref="contactFormRef" />
      <KanbanForm v-show="step === 2" />
    </div>

    <template #actions>
      <div class="flex items-center justify-end gap-3">
        <Button variant="outline" tone="dark" @click="closeDialog">
          Fechar
        </Button>

        <template v-if="step === 1">
          <Button tone="primary" @click="handleNext">
            Proximo
          </Button>
        </template>

        <template v-if="step === 2">
          <Button variant="outline" tone="dark" @click="step = 1">
            Voltar
          </Button>
          <Button tone="primary" :disabled="isSaving" @click="handleSaveClick">
            {{ isSaving ? 'Salvando...' : 'Salvar' }}
          </Button>
        </template>
      </div>
    </template>
  </DialogControl>
</template>
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add src/views/crm/components/CreateCardModalV2/
git commit -m "feat(crm): add CreateCardModalV2 shell with Dialog + Stepper"
```

---

### Task 9: Integration — Swap Import in KanbanColumn

**Files:**
- Modify: `src/views/crm/components/KanbanColumn.vue:135`

- [ ] **Step 1: Update the import**

In `src/views/crm/components/KanbanColumn.vue`, change line 135:

```typescript
// Before:
import CreateCardModal from "@/views/crm/components/CreateCardModal/index.vue";

// After:
import CreateCardModal from "@/views/crm/components/CreateCardModalV2/index.vue";
```

No other changes needed — the component exposes the same `showDialog` / `closeDialog` API and emits `update-list-cards`.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Start dev server and test manually**

Run: `cd chatfunnel-front && npm run dev`

Test checklist:
1. Open CRM Kanban view
2. Click "+" on any column to open CreateCardModalV2
3. Verify Dialog opens with stepper showing step 1 active
4. **Tab "Contato existente":** type a name, see autocomplete dropdown, select a contact, verify phone/email fill and are disabled
5. **Tab "Novo contato":** type name, use InputPhone with flag, type email
6. Click "Proximo" without filling required fields — verify validation errors appear
7. Fill valid data, click "Proximo" — verify step 2 (KanbanForm) appears
8. Click "Voltar" — verify returns to step 1 with data preserved
9. Complete step 2 and click "Salvar" — verify card is created and dialog closes
10. Verify "Fechar" button closes without saving

- [ ] **Step 4: Commit**

```bash
git add src/views/crm/components/KanbanColumn.vue
git commit -m "feat(crm): swap KanbanColumn to use CreateCardModalV2"
```
