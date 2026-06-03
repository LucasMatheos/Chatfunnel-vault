# CreateCardModalV2 — Spec de Refatoracao

**Data:** 2026-05-12
**Escopo:** Step 1 (Informacoes do contato) + shell do modal. Step 2 (KanbanForm) intocado.
**Abordagem:** Composable de estado + sub-componentes limpos (Abordagem A)

---

## 1. Objetivo

Refatorar o `CreateCardModal` de Vuetify (default-dialog, v-stepper, v-form, v-btn) para shadcn-vue (Dialog, StepperControl, Tabs, Button), seguindo o padrao do projeto para codigo novo. O componente original permanece intocado em `CreateCardModal/` para rollback.

## 2. Estrutura de Arquivos

```
src/views/crm/components/CreateCardModalV2/
  index.vue                          # Dialog + StepperControl + actions (shell)
  components/
    ContactForm.vue                  # Tabs container (existente | novo)
    ExistingContactTab.vue           # Busca autocomplete + campos disabled
    NewContactTab.vue                # Inputs com VeeValidate + Zod
    KanbanForm.vue                   # Wrapper que re-exporta o KanbanForm original
    InputContactExist.vue            # Migrado: Popover shadcn (substitui v-menu)
    index.ts                         # Barrel exports
  composables/
    useCreateCardForm.ts             # Estado typed do form + actions

src/common/keys/
  createCardForm.ts                  # InjectionKey<Ref<CreateCardFormState>>

src/components/ui/input-phone/
  InputPhone.vue                     # Bandeira (intl-tel-input) + mascara DDD/phone
  index.ts                           # Export + CVA variants
```

## 3. Componentes

### 3.1 index.vue (Shell)

**Responsabilidade:** Orquestra dialog, stepper, estado global do form e acoes (fechar, proximo, voltar, salvar).

**Componentes shadcn utilizados:**
- `DialogControl` (size `xl`, persistent — `closeOnOverlay: false`, `closeOnEscape: false`)
- `StepperControl` com 2 steps: "Informacoes do contato", "Configuracao no pipeline"
- `Button` (tone `dark` para fechar/voltar, tone `primary` para proximo/salvar)

**Props:** nenhuma (mesmo contrato do original)
**Emits:** `update-list-cards` (mesmo contrato do original)
**Expose:** `showDialog(kanban, columnId)`, `closeDialog()` (mesmo contrato do original)

**Comportamento:**
- `showDialog` chama `resetForm()` do composable e abre o dialog via `v-model:open`
- Botao "Proximo" chama `validate()` do VeeValidate no ContactForm antes de avancar
- Botao "Salvar" chama `handleSave()` do composable
- O step ativo e controlado por `v-model` no `StepperControl`

### 3.2 ContactForm.vue (Tabs container)

**Responsabilidade:** Renderiza `Tabs` shadcn com duas tabs.

**Componentes shadcn utilizados:**
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` (instalar via `npx shadcn-vue@latest add tabs` se nao existir)

**Comportamento:**
- Tab "Contato existente" renderiza `ExistingContactTab`
- Tab "Novo contato" renderiza `NewContactTab`
- Ao trocar de tab, atualiza `formState.isNewContact` e reseta campos de contato (name, phone, email, contactId)
- Expoe `validate(): Promise<boolean>` que delega para a tab ativa

### 3.3 ExistingContactTab.vue

**Responsabilidade:** Busca de contato existente por autocomplete.

**Layout:**
- Campo "Nome" com icone de busca (InputContactExist migrado)
- Campos "Telefone" e "Email" em grid 2 colunas, preenchidos e disabled apos selecao

**Validacao (Zod):**
```typescript
const existingContactSchema = z.object({
  contactId: z.number({ required_error: 'Selecione um contato' }),
  name: z.string().min(1),
})
```

**Comportamento:**
- Injeta `formState` via `CREATE_CARD_FORM_KEY`
- Ao selecionar contato no autocomplete, preenche name, phone, email, contactId
- Campos telefone e email ficam `disabled` (read-only)

### 3.4 NewContactTab.vue

**Responsabilidade:** Formulario de criacao de novo contato.

**Layout:**
- `VeeInput` — Nome (obrigatorio)
- Grid 2 colunas: `InputPhone` (bandeira + mascara) | `VeeInput` — Email
- Erro inline por campo + erro global "Informe pelo menos telefone ou email"

**Validacao (Zod):**
```typescript
const newContactSchema = z.object({
  name: z.string().min(1, 'Nome e obrigatorio'),
  phone: z.string().optional(),
  email: z.string().email('Email invalido').optional().or(z.literal('')),
}).refine(
  (data) => data.phone || data.email,
  { message: 'Informe pelo menos telefone ou email', path: ['phone'] }
)
```

### 3.5 InputContactExist.vue (migrado)

**Responsabilidade:** Autocomplete de contatos existentes.

**Migracao:**
- `v-menu` → `Popover` (shadcn) com `PopoverTrigger` + `PopoverContent`
- `input-text` Vuetify → `InputControl` shadcn com icone de busca
- `v-list` / `v-list-item` → markup Tailwind (`div` com hover states)
- `v-progress-circular` → `Spinner` shadcn
- `v-alert` → texto simples com classe `text-gray-600`
- `AvatarFallback` permanece (componente custom, nao Vuetify)

**Logica mantida:** debounce 300ms, `ContactsService.listContacts`, dropdown com avatar + nome + email + phone.

### 3.6 KanbanForm.vue (wrapper)

**Responsabilidade:** Re-exporta o KanbanForm original para que o V2 importe internamente.

```vue
<script setup lang="ts">
// Re-export do KanbanForm original (step 2 intocado)
export { default } from '@/views/crm/components/CreateCardModal/components/KanbanForm.vue'
</script>
```

Alternativa: importar diretamente no `index.vue` do V2 sem wrapper. Decidir na implementacao.

## 4. Composable: useCreateCardForm

**Arquivo:** `composables/useCreateCardForm.ts`

### Interface de estado

```typescript
interface CreateCardFormState {
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
```

### API exposta

| Membro | Tipo | Descricao |
|--------|------|-----------|
| `formState` | `Ref<CreateCardFormState>` | Estado reativo do form |
| `resetForm(kanban, columnId)` | `function` | Inicializa estado com dados do kanban |
| `handleSelectContact(contact)` | `function` | Preenche campos do contato existente |
| `phoneNumber` | `ComputedRef<string>` | Monta `idd + ddd + phone` |
| `isSaving` | `Ref<boolean>` | Loading state do save |
| `handleSave(emit)` | `function` | Clona form, chama `KanbanService.createCard`, emite `update-list-cards` |

### Injection Key

```typescript
// src/common/keys/createCardForm.ts
import type { InjectionKey, Ref } from 'vue'
import type { CreateCardFormState } from '@/views/crm/components/CreateCardModalV2/composables/useCreateCardForm'

export const CREATE_CARD_FORM_KEY: InjectionKey<Ref<CreateCardFormState>> = Symbol('createCardForm')
```

## 5. InputPhone (componente reutilizavel)

**Caminho:** `src/components/ui/input-phone/`

### Props

| Prop | Tipo | Default | Descricao |
|------|------|---------|-----------|
| `idd` | `string` | `'55'` | Codigo do pais (DDI) |
| `ddd` | `string` | `''` | Codigo de area (DDD) |
| `phone` | `string` | `''` | Numero do telefone |
| `disabled` | `boolean` | `false` | Desabilita todos os campos |
| `placeholder` | `string` | `'(00) 00000-0000'` | Placeholder do campo |

### Emits

- `update:idd` — quando muda o pais (seletor de bandeira)
- `update:ddd` — quando muda o DDD
- `update:phone` — quando muda o telefone

### Comportamento

- Seletor de pais mostra bandeira + chevron (usa `intl-tel-input` que ja esta no package.json para dados de paises/bandeiras)
- Campo de texto com mascara `(XX) XXXXX-XXXX` para BR (adapta por pais)
- Internamente separa idd/ddd/phone para manter compatibilidade com o payload do `KanbanService.createCard`
- Segue CVA pattern do projeto para variants (se necessario no futuro)

## 6. Integracao

### Pontos de importacao a atualizar

| Arquivo | Mudanca |
|---------|---------|
| `src/views/crm/Kanban.vue` | Import `CreateCardModal` → `CreateCardModalV2` |
| `src/views/crm/components/KanbanColumn.vue` | Import `CreateCardModal` → `CreateCardModalV2` |
| `src/layout/OrganizationsLayout/FounderBillingDialog/index.vue` | Verificar se usa CreateCardModal (referencia encontrada no grep) |

### Contrato mantido

A API publica do componente nao muda:
- `defineExpose({ showDialog, closeDialog })`
- `defineEmits(['update-list-cards'])`
- `showDialog(kanban, columnId)` — mesma assinatura

Trocar o import e suficiente; nenhum chamador precisa mudar sua logica.

## 7. Dependencias shadcn-vue

**Ja disponiveis:** Dialog, DialogControl, StepperControl, Button, Popover, Input/InputControl, Separator, Spinner, Label

**A verificar/instalar:** Tabs (TabsList, TabsTrigger, TabsContent) — rodar `npx shadcn-vue@latest add tabs` se nao existir

## 8. Fora de escopo

- Step 2 (KanbanForm) — permanece Vuetify, migra em fase futura
- PropertiesLabel, StatusInput, ModeratorInput, PriorityInput — componentes compartilhados, migram separadamente
- Testes unitarios — fase futura
- Storybook stories — fase futura
