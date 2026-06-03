# Custom Fields Filter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a custom fields filter modal to the contacts list, allowing users to filter contacts by N custom field conditions (AND logic) without creating a segment.

**Architecture:** A new modal component reuses `MenuVariables` (filtered to custom fields only) and `StepConditionsLogicCondition.getConditionsForField()` from the broadcast system. The backend receives `customFieldFilters` in the existing POST body and builds EXISTS subqueries per condition. No schema changes needed.

**Tech Stack:** Vue 3 + Vuetify (existing ContactsList uses Vuetify), class-validator (NestJS DTO), Prisma raw SQL (repository)

**Spec:** `docs/superpowers/specs/2026-05-22-custom-fields-filter-design.md`

---

### Task 1: Backend — DTO + Types

**Files:**
- Modify: `chatfunnel-services/src/modules/contacts/dtos/get_contacts.dto.ts:1-84`
- Modify: `chatfunnel-core/src/services/contacts/types.ts:1-16`
- Modify: `chatfunnel-core/src/repositories/contacts.repository.ts:37-56`

- [ ] **Step 1: Add `CustomFieldFilterDto` class and `customFieldFilters` to `GetContactsBodyDto`**

In `chatfunnel-services/src/modules/contacts/dtos/get_contacts.dto.ts`, add the nested DTO class before `GetContactsBodyDto` and a new field at the end of the class:

```typescript
// Add these imports to the existing import from "class-validator":
// IsArray, ValidateNested are already imported
// Add import for Type (already imported from "class-transformer")

class CustomFieldFilterDto {
  @IsString()
  field: string;

  @IsString()
  logicCondition: string;

  @IsOptional()
  @IsString()
  value?: string;
}

// Inside GetContactsBodyDto, after filterEmailNull (line 83):
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomFieldFilterDto)
  customFieldFilters?: CustomFieldFilterDto[];
```

- [ ] **Step 2: Add `customFieldFilters` to `GetContactsBody` type**

In `chatfunnel-core/src/services/contacts/types.ts`, add to the `GetContactsBody` interface after `filterEmailNull`:

```typescript
  customFieldFilters?: Array<{
    field: string;
    logicCondition: string;
    value?: string;
  }>;
```

- [ ] **Step 3: Add `customFieldFilters` to `GetContactsOptions` interface**

In `chatfunnel-core/src/repositories/contacts.repository.ts` line 37-56, add to `GetContactsOptions` after `filterEmailNull`:

```typescript
  customFieldFilters?: Array<{
    field: string;
    logicCondition: string;
    value?: string;
  }>;
```

- [ ] **Step 4: Commit**

```
feat(contacts): add customFieldFilters to DTO and types
```

---

### Task 2: Backend — Handler passthrough

**Files:**
- Modify: `chatfunnel-core/src/services/contacts/handlers/get-contacts.handler.ts:23-88`

- [ ] **Step 1: Destructure `customFieldFilters` from body**

In `get-contacts.handler.ts` line 23-38, add `customFieldFilters` to the destructuring:

```typescript
    const {
      searchTerm,
      onlyWithPhone,
      tagIds,
      tagMode,
      Filter,
      pipelineId,
      initialPipelineDate,
      finalPipelineDate,
      leadsRange,
      sortField,
      sortOrder,
      segmentId,
      filterPhoneNull = false,
      filterEmailNull = false,
      customFieldFilters,        // ← add this line
    } = body;
```

- [ ] **Step 2: Pass `customFieldFilters` to repository options**

In the same file, line 69-88, add `customFieldFilters` to the options object:

```typescript
    const results = await this.contactsRepository.getContacts({
      accountId,
      segmentGroups,
      segmentConditionType,
      searchTerm,
      onlyWithPhone,
      tagIds,
      tagMode,
      Filter,
      pipelineId,
      initialPipelineDate,
      finalPipelineDate,
      leadsRange,
      sortField,
      sortOrder,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 10,
      filterPhoneNull,
      filterEmailNull,
      customFieldFilters,        // ← add this line
    } as GetContactsOptions);
```

- [ ] **Step 3: Commit**

```
feat(contacts): pass customFieldFilters through handler
```

---

### Task 3: Backend — Repository SQL

**Files:**
- Modify: `chatfunnel-core/src/repositories/contacts.repository.ts:127-319`

- [ ] **Step 1: Destructure `customFieldFilters` in `getContacts`**

In line 128-147, add to the destructuring:

```typescript
    const {
      accountId,
      segmentGroups,
      segmentConditionType,
      searchTerm,
      onlyWithPhone,
      Filter,
      pipelineId,
      initialPipelineDate,
      finalPipelineDate,
      tagIds,
      tagMode,
      sortField,
      sortOrder,
      page,
      pageSize,
      leadsRange,
      filterPhoneNull,
      filterEmailNull,
      customFieldFilters,        // ← add this line
    } = options;
```

- [ ] **Step 2: Build custom field WHERE clauses**

After the tag filter logic (after line 251, before the main query at line 253), add:

```typescript
    if (customFieldFilters && customFieldFilters.length > 0) {
      for (const filter of customFieldFilters) {
        const fieldName = filter.field.replace(/^customFields\.'(.+)'$/, "$1");

        if (filter.logicCondition === "NOT_EXISTS") {
          whereClauses.push(Prisma.sql`
            NOT EXISTS (
              SELECT 1 FROM "CustomFieldsContacts" cfc_f
              JOIN "CustomFields" cf_f ON cf_f.id = cfc_f."customFieldId"
              WHERE cfc_f."contactId" = c.id
                AND cf_f."name" = ${fieldName}
                AND cfc_f."value" IS NOT NULL
                AND cfc_f."value" <> ''
            )
          `);
          continue;
        }

        let valueCondition: Prisma.Sql;
        switch (filter.logicCondition) {
          case "EQUALS":
            valueCondition = Prisma.sql`cfc_f."value" = ${filter.value ?? ""}`;
            break;
          case "NOT_EQUALS":
            valueCondition = Prisma.sql`cfc_f."value" != ${filter.value ?? ""}`;
            break;
          case "CONTAINS_VALUE":
            valueCondition = Prisma.sql`cfc_f."value" ILIKE ${"%" + (filter.value ?? "") + "%"}`;
            break;
          case "NOT_CONTAINS_VALUE":
            valueCondition = Prisma.sql`cfc_f."value" NOT ILIKE ${"%" + (filter.value ?? "") + "%"}`;
            break;
          case "STARTS_WITH":
            valueCondition = Prisma.sql`cfc_f."value" ILIKE ${(filter.value ?? "") + "%"}`;
            break;
          case "GREATER":
            valueCondition = Prisma.sql`cfc_f."value" > ${filter.value ?? ""}`;
            break;
          case "LESS":
            valueCondition = Prisma.sql`cfc_f."value" < ${filter.value ?? ""}`;
            break;
          default:
            valueCondition = Prisma.sql`cfc_f."value" = ${filter.value ?? ""}`;
        }

        whereClauses.push(Prisma.sql`
          EXISTS (
            SELECT 1 FROM "CustomFieldsContacts" cfc_f
            JOIN "CustomFields" cf_f ON cf_f.id = cfc_f."customFieldId"
            WHERE cfc_f."contactId" = c.id
              AND cf_f."name" = ${fieldName}
              AND ${valueCondition}
          )
        `);
      }
    }
```

- [ ] **Step 3: Verify build compiles**

Run from `chatfunnel-core/`:
```bash
npx tsc --noEmit
```
Expected: no errors related to customFieldFilters.

- [ ] **Step 4: Commit**

```
feat(contacts): add EXISTS subqueries for custom field filtering
```

---

### Task 4: Frontend — Modal component

**Files:**
- Create: `chatfunnel-front/src/views/contacts/components/modal/CustomFieldsFilterModal.vue`

- [ ] **Step 1: Create the modal component**

```vue
<template>
  <v-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" max-width="700">
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between">
        <span>Filtrar por campos personalizados</span>
        <v-btn icon="mdi-close" variant="text" size="small" @click="$emit('update:modelValue', false)" />
      </v-card-title>
      <v-divider />
      <v-card-text>
        <div v-if="localFilters.length === 0" class="text-center text-grey py-4">
          Nenhuma condição adicionada
        </div>
        <template v-for="(condition, index) in localFilters" :key="condition.id">
          <v-chip size="small" class="mb-2" :class="{ 'mt-4': index > 0 }">
            Condição #{{ index + 1 }}
          </v-chip>
          <div class="d-flex align-center ga-2">
            <MenuVariables
              type="select"
              v-model:value="condition.field"
              :hasCurrentMessage="false"
              :onlyCustomFields="true"
            />
            <input-select
              style="width: 250px; min-width: 250px"
              label="Comparação lógica"
              v-model:value="condition.logicCondition"
              :options="getLogicOptions(condition).dropDown"
            />
            <input-text
              v-if="getLogicOptions(condition).type !== 'boolean' && condition.logicCondition !== 'NOT_EXISTS'"
              class="flex-fill"
              label="Valor"
              v-model:value="condition.value"
              :type="getLogicOptions(condition).type"
            />
            <v-btn icon="mdi-delete-outline" variant="text" size="small" color="error" @click="removeCondition(index)" />
          </div>
        </template>
      </v-card-text>
      <v-divider />
      <v-card-actions class="d-flex justify-space-between pa-4">
        <v-btn variant="outlined" prepend-icon="mdi-plus" @click="addCondition">
          Adicionar condição
        </v-btn>
        <div class="d-flex ga-2">
          <v-btn variant="text" @click="handleClear">Limpar</v-btn>
          <v-btn variant="flat" color="cf-primary" @click="handleApply">Aplicar</v-btn>
        </div>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import MenuVariables from '@/components/buttons/MenuVariables.vue'
import InputSelect from '@/components/inputs/InputSelect.vue'
import InputText from '@/components/inputs/InputText.vue'
import StepConditionsLogicCondition from '@/common/enums/StepConditionsLogicConditionEnum'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  filters: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:modelValue', 'apply'])

const localFilters = ref([])

watch(() => props.modelValue, (open) => {
  if (open) {
    localFilters.value = props.filters.length > 0
      ? props.filters.map((f) => ({ ...f }))
      : [createCondition()]
  }
})

const createCondition = () => ({
  id: crypto.randomUUID(),
  field: '',
  logicCondition: '',
  value: ''
})

const addCondition = () => {
  localFilters.value.push(createCondition())
}

const removeCondition = (index) => {
  localFilters.value.splice(index, 1)
}

const getLogicOptions = (condition) => {
  if (!condition.field) return { dropDown: [], type: 'text' }
  const options = StepConditionsLogicCondition.getConditionsForField(condition.field)
  if (!options.logicConditions.includes(condition.logicCondition)) {
    condition.logicCondition = options.logicConditions[0]
  }
  return options
}

const handleApply = () => {
  const validFilters = localFilters.value.filter((c) => c.field && c.logicCondition)
  emit('apply', validFilters)
  emit('update:modelValue', false)
}

const handleClear = () => {
  localFilters.value = [createCondition()]
  emit('apply', [])
  emit('update:modelValue', false)
}
</script>
```

- [ ] **Step 2: Commit**

```
feat(contacts): create CustomFieldsFilterModal component
```

---

### Task 5: Frontend — `MenuVariables` prop to filter only custom fields

**Files:**
- Modify: `chatfunnel-front/src/components/buttons/MenuVariables.vue`

- [ ] **Step 1: Add `onlyCustomFields` prop and computed filter**

Add a new prop to the props definition:

```javascript
onlyCustomFields: { type: Boolean, default: false }
```

Add a computed that filters the field list:

```javascript
const filteredContactFields = computed(() => {
  if (props.onlyCustomFields) {
    return contactFields.value.filter((f) => f.category === 'customFields')
  }
  return contactFields.value
})
```

Then replace `contactFields` with `filteredContactFields` in the template iteration where the field list is rendered.

- [ ] **Step 2: Verify existing broadcast usage is unaffected**

Confirm `BroadcastForm.vue` does NOT pass `onlyCustomFields`, so it defaults to `false` — no behavior change.

- [ ] **Step 3: Commit**

```
feat(menu-variables): add onlyCustomFields prop for filtering
```

---

### Task 6: Frontend — Integrate modal into ContactsList

**Files:**
- Modify: `chatfunnel-front/src/views/contacts/ContactsList.vue`

- [ ] **Step 1: Import modal and add state**

In the `<script>` section, add the import near other modal imports:

```javascript
import CustomFieldsFilterModal from './components/modal/CustomFieldsFilterModal.vue'
```

Near the other filter refs (`searchTerm`, `tagSearch`, `tagFilterMode`, etc.), add:

```javascript
const customFieldFilters = ref([])
const showCustomFieldsModal = ref(false)
```

Add the handler function near `handleFilter`:

```javascript
const handleApplyCustomFieldFilters = (filters) => {
  customFieldFilters.value = filters
  handleFilter()
}
```

- [ ] **Step 2: Add button in the filter panel template**

Inside the filter `v-card` (the `v-menu` that opens on filter click), after the tag filter mode `input-select` (line 237) and before the checkboxes div (line 238), add:

```vue
                      <div class="v-col-12">
                        <v-btn
                          variant="outlined"
                          block
                          prepend-icon="mdi-filter-cog-outline"
                          :color="customFieldFilters.length > 0 ? 'cf-primary' : undefined"
                          @click="showCustomFieldsModal = true"
                        >
                          {{ customFieldFilters.length > 0
                            ? `Campos personalizados (${customFieldFilters.length})`
                            : 'Campos personalizados'
                          }}
                        </v-btn>
                      </div>
```

- [ ] **Step 3: Add modal component in template**

At the end of the template (before closing `</div>` of the root element), add:

```vue
    <CustomFieldsFilterModal
      v-model="showCustomFieldsModal"
      :filters="customFieldFilters"
      @apply="handleApplyCustomFieldFilters"
    />
```

- [ ] **Step 4: Include customFieldFilters in the listContacts search payload**

In the `listContacts` function (line 754-791), after the `finalPipelineDate` check (line 774) and before `isLoadingList.value = true` (line 775), add:

```javascript
  if (customFieldFilters.value.length) {
    search.customFieldFilters = customFieldFilters.value.map((c) => ({
      field: c.field,
      logicCondition: c.logicCondition,
      value: c.value
    }))
  }
```

- [ ] **Step 5: Add custom fields chip in the active filters bar**

In the chips section at the top (around line 80-96, near the tag chips), after the tag chips `v-for`, add:

```vue
          <custom-chip
              v-if="customFieldFilters.length > 0"
              class="ml-1"
              closable
              label="Campos personalizados"
              :value="`${customFieldFilters.length} filtro(s)`"
              @handle-close="handleApplyCustomFieldFilters([])"
          />
```

- [ ] **Step 6: Verify dev server runs and filter works**

Run from `chatfunnel-front/`:
```bash
npm run dev
```

Open `http://localhost:5173`, navigate to Contacts, open filter panel, click "Campos personalizados" button, add a condition, apply, verify the table reloads.

- [ ] **Step 7: Commit**

```
feat(contacts): integrate custom fields filter modal in contacts list
```

---

### Task 7: Manual verification

- [ ] **Step 1: Test happy path**

1. Open contacts list
2. Click filter button → click "Campos personalizados"
3. Select a custom field from the dropdown
4. Select operator "EQUALS"
5. Type a value
6. Click "Aplicar"
7. Verify: table reloads with filtered results, button shows "(1)", chip appears

- [ ] **Step 2: Test multiple conditions**

1. Open modal again (previous condition should be pre-filled)
2. Click "Adicionar condição"
3. Fill second condition with different field
4. Apply
5. Verify: button shows "(2)", results are AND-filtered

- [ ] **Step 3: Test clear**

1. Open modal
2. Click "Limpar"
3. Verify: filters reset, button text returns to "Campos personalizados", chip disappears, table shows all contacts

- [ ] **Step 4: Test with other filters combined**

1. Apply a tag filter AND a custom field filter simultaneously
2. Verify both filters work together (AND logic between all filters)
