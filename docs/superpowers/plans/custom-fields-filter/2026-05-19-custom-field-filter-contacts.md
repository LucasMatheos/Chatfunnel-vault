# Filtro de Campos Personalizados na Lista de Contatos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir filtrar contatos por valores de campos personalizados no menu de filtros da lista de contatos.

**Architecture:** Reutiliza `buildGroupConditions()` de `contact_segments.repository.ts` que já gera EXISTS subqueries para custom fields. O frontend envia um array de condições no mesmo formato que segmentos usam. O backend converte essas condições em WHERE clauses adicionais na CTE `FilteredContacts`.

**Tech Stack:** Vue 3 + Vuetify (UI existente do filtro), TypeScript, Prisma raw SQL, class-validator (NestJS DTOs)

---

## File Map

| Ação | Arquivo | Responsabilidade |
|------|---------|-----------------|
| Modify | `chatfunnel-core/src/services/contacts/types.ts:1-16` | Adicionar `customFieldFilters` ao `GetContactsBody` |
| Modify | `chatfunnel-core/src/repositories/contacts.repository.ts:37-56` | Adicionar `customFieldFilters` ao `GetContactsOptions` |
| Modify | `chatfunnel-core/src/repositories/contacts.repository.ts:127-319` | Gerar WHERE clauses via `buildGroupConditions()` |
| Modify | `chatfunnel-core/src/services/contacts/handlers/get-contacts.handler.ts:23-88` | Passar `customFieldFilters` do body para o repository |
| Modify | `chatfunnel-services/src/modules/contacts/dtos/get_contacts.dto.ts:18-84` | Validar `customFieldFilters` com class-validator |
| Modify | `chatfunnel-front/src/views/contacts/ContactsList.vue:238-298` | UI do filtro no v-menu |
| Modify | `chatfunnel-front/src/views/contacts/ContactsList.vue:650-684` | Estado reativo dos filtros |
| Modify | `chatfunnel-front/src/views/contacts/ContactsList.vue:754-791` | Enviar filtros no `listContacts()` |

---

### Task 1: Adicionar `customFieldFilters` aos tipos do Core

**Files:**
- Modify: `chatfunnel-core/src/services/contacts/types.ts:1-16`
- Modify: `chatfunnel-core/src/repositories/contacts.repository.ts:37-56`

- [ ] **Step 1: Adicionar campo ao `GetContactsBody`**

Em `chatfunnel-core/src/services/contacts/types.ts`, adicionar o campo `customFieldFilters`:

```typescript
export interface GetContactsBody {
  searchTerm?: string;
  onlyWithPhone?: boolean;
  tagIds?: string[];
  tagMode?: string;
  Filter?: string;
  pipelineId?: string;
  initialPipelineDate?: string;
  finalPipelineDate?: string;
  leadsRange?: number;
  sortField?: string;
  sortOrder?: number;
  segmentId?: string;
  filterPhoneNull?: boolean;
  filterEmailNull?: boolean;
  customFieldFilters?: Array<{
    field: string;
    logicCondition: string;
    value?: string;
  }>;
}
```

- [ ] **Step 2: Adicionar campo ao `GetContactsOptions`**

Em `chatfunnel-core/src/repositories/contacts.repository.ts`, adicionar na interface `GetContactsOptions` (linha ~56, antes do `}`):

```typescript
export interface GetContactsOptions {
  accountId: string;
  segmentGroups?: any[];
  segmentConditionType?: StepConditionsTypesEnum;
  searchTerm?: string;
  onlyWithPhone?: boolean;
  Filter?: string;
  pipelineId?: string;
  initialPipelineDate?: string;
  finalPipelineDate?: string;
  tagIds?: string[];
  tagMode?: string;
  sortField?: string;
  sortOrder?: number;
  page: number;
  pageSize: number;
  leadsRange?: number;
  filterPhoneNull: boolean;
  filterEmailNull: boolean;
  customFieldFilters?: Array<{
    field: string;
    logicCondition: string;
    value?: string;
  }>;
}
```

---

### Task 2: Gerar WHERE clauses no repository

**Files:**
- Modify: `chatfunnel-core/src/repositories/contacts.repository.ts:127-319`

- [ ] **Step 1: Adicionar `buildGroupConditions` ao import**

No topo de `contacts.repository.ts`, o import de `buildSegmentQuery` já existe (linha 11). Adicionar `buildGroupConditions`:

```typescript
import { buildSegmentQuery, buildGroupConditions } from "./contact_segments.repository";
```

Também importar `StepConditionsLogicConditionEnum` — verificar se já vem do import de `@prisma/client` na linha 4-5. Se não, adicionar:

```typescript
import {
  Contacts,
  Prisma,
  StepConditionsLogicConditionEnum,
  StepConditionsTypesEnum,
  TriggerTypesEnum,
} from "@prisma/client";
```

- [ ] **Step 2: Desestruturar `customFieldFilters` no `getContacts()`**

No método `getContacts()` (linha ~128), adicionar `customFieldFilters` ao destructuring:

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
  customFieldFilters,
} = options;
```

- [ ] **Step 3: Gerar WHERE clauses para custom fields**

Logo após o bloco de `filterEmailNull` (depois da linha ~197), antes do bloco de `Filter` (linha ~199), adicionar:

```typescript
if (customFieldFilters && customFieldFilters.length > 0) {
  const cfConditions = customFieldFilters.map((f) => ({
    field: f.field,
    logicCondition: f.logicCondition as StepConditionsLogicConditionEnum,
    value: f.value,
  }));
  const cfClauses = buildGroupConditions(cfConditions, accountId);
  whereClauses.push(...cfClauses);
}
```

Isso reutiliza exatamente a mesma lógica que segmentos usam — `buildGroupConditions` já gera EXISTS subqueries para campos com prefixo `customFields.'...'`.

---

### Task 3: Passar `customFieldFilters` pelo handler

**Files:**
- Modify: `chatfunnel-core/src/services/contacts/handlers/get-contacts.handler.ts:23-88`

- [ ] **Step 1: Desestruturar do body e passar ao repository**

No `GetContactsHandler.execute()`, adicionar `customFieldFilters` ao destructuring do `body` (linha ~23):

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
  customFieldFilters,
} = body;
```

E na chamada `this.contactsRepository.getContacts()` (linha ~69), adicionar ao objeto:

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
  customFieldFilters,
} as GetContactsOptions);
```

---

### Task 4: Validar no DTO do NestJS

**Files:**
- Modify: `chatfunnel-services/src/modules/contacts/dtos/get_contacts.dto.ts:18-84`

- [ ] **Step 1: Criar DTO aninhado para as condições**

Adicionar imports necessários e a classe de item ANTES de `GetContactsBodyDto`:

```typescript
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Max,
  Min,
  ArrayMaxSize,
  ValidateIf,
  ValidateNested,
  Matches,
} from "class-validator";

class CustomFieldFilterItemDto {
  @IsString()
  @Matches(/^customFields\.'[^']+'$/)
  field: string;

  @IsString()
  @IsIn([
    "EQUALS",
    "NOT_EQUALS",
    "CONTAINS_ANY",
    "CONTAINS_VALUE",
    "NOT_CONTAINS_VALUE",
    "STARTS_WITH",
    "EXISTS",
    "NOT_EXISTS",
    "DOES_NOT_EXIST",
    "GREATER",
    "LESS",
    "GREATER_OR_EQUALS",
    "LESS_OR_EQUALS",
  ])
  logicCondition: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  value?: string;
}
```

- [ ] **Step 2: Adicionar campo ao `GetContactsBodyDto`**

Dentro da classe `GetContactsBodyDto`, após `filterEmailNull` (linha ~84), adicionar:

```typescript
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CustomFieldFilterItemDto)
  customFieldFilters?: CustomFieldFilterItemDto[];
```

---

### Task 5: Build do Core e verificação

**Files:**
- Build: `chatfunnel-core/`
- Build: `chatfunnel-services/`

- [ ] **Step 1: Compilar o core**

```bash
cd chatfunnel-core && npm run build
```

Expected: Build sucesso sem erros de tipo. O output vai para `dist/`.

- [ ] **Step 2: Verificar que o services compila**

```bash
cd chatfunnel-services && npm run build
```

Expected: Build sucesso. O DTO novo é validado pelo SWC compiler.

---

### Task 6: Estado reativo e envio no frontend

**Files:**
- Modify: `chatfunnel-front/src/views/contacts/ContactsList.vue:650-684` (estado)
- Modify: `chatfunnel-front/src/views/contacts/ContactsList.vue:754-791` (envio)

- [ ] **Step 1: Importar `AccountsService` e adicionar estado**

Verificar se `AccountsService` já está importado no `ContactsList.vue`. Se não, adicionar ao import de services existente.

Após `const filterEmailNull = ref(false);` (linha ~684), adicionar:

```javascript
const customFieldFilters = ref([]);
const availableCustomFields = ref([]);

const loadCustomFields = () => {
  AccountsService.listAccountCustomField().then((res) => {
    availableCustomFields.value = res.data
      .filter((e) => !e.id.includes('00000000-0000-0000-0000-'))
      .map((e) => ({
        id: e.id,
        name: e.name,
        field: `customFields.'${e.name}'`,
      }));
  });
};
```

- [ ] **Step 2: Adicionar helpers para gerenciar filtros**

Após `loadCustomFields`, adicionar:

```javascript
const customFieldOperators = [
  { value: 'EQUALS', text: 'Igual a' },
  { value: 'NOT_EQUALS', text: 'Diferente de' },
  { value: 'CONTAINS_VALUE', text: 'Contém' },
  { value: 'NOT_CONTAINS_VALUE', text: 'Não contém' },
  { value: 'STARTS_WITH', text: 'Começa com' },
  { value: 'EXISTS', text: 'Preenchido' },
  { value: 'DOES_NOT_EXIST', text: 'Não preenchido' },
];

const addCustomFieldFilter = () => {
  customFieldFilters.value.push({
    field: null,
    logicCondition: 'EQUALS',
    value: '',
  });
};

const removeCustomFieldFilter = (index) => {
  customFieldFilters.value.splice(index, 1);
  handleDebounceFilter();
};

const needsValue = (operator) => {
  return !['EXISTS', 'DOES_NOT_EXIST', 'CONTAINS_ANY'].includes(operator);
};
```

- [ ] **Step 3: Carregar custom fields no `onMounted`**

No `onMounted` existente (linha ~818), adicionar chamada:

```javascript
onMounted(async () => {
  await listUserTags();
  loadCustomFields(); // <-- adicionar esta linha
  // ... resto do onMounted existente
```

- [ ] **Step 4: Enviar filtros no `listContacts()`**

Na função `listContacts()` (linha ~760), após o bloco de `finalPipelineDate` (linha ~774), antes de `isLoadingList.value = true;` (linha ~775), adicionar:

```javascript
  if (customFieldFilters.value.length > 0) {
    const validFilters = customFieldFilters.value
      .filter((f) => f.field && f.logicCondition)
      .filter((f) => !needsValue(f.logicCondition) || (f.value && f.value.trim()))
      .map((f) => ({
        field: f.field,
        logicCondition: f.logicCondition,
        ...(needsValue(f.logicCondition) ? { value: f.value.trim() } : {}),
      }));
    if (validFilters.length > 0) {
      search.customFieldFilters = validFilters;
    }
  }
```

- [ ] **Step 5: Adicionar watcher para disparo automático**

Após a definição de `handleDebounceFilter` (linha ~816), adicionar watcher:

```javascript
watch(
  customFieldFilters,
  () => {
    handleDebounceFilter();
  },
  { deep: true }
);

watch(selectedSegment, () => {
  handleDebounceFilter();
});
```

Nota: verificar se `watch` já está importado de `vue`. Se não, adicionar ao import existente.

---

### Task 7: UI do filtro no menu

**Files:**
- Modify: `chatfunnel-front/src/views/contacts/ContactsList.vue:238-298` (template do v-menu)

- [ ] **Step 1: Adicionar seção de campos personalizados no v-menu desktop**

No template, dentro do `<v-card>` do filtro, APÓS o bloco de "Filtro pipeline" que termina no `</div>` da linha ~298, ANTES do `</v-card>` de fechamento (linha ~299), adicionar:

```html
                    <v-divider></v-divider>
                    <div class="bg-container-5">
                      <div class="px-4 py-2 d-flex align-center justify-space-between">
                        <span class="fw-bold">Campos personalizados</span>
                        <v-btn
                          size="x-small"
                          variant="text"
                          icon="mdi-plus"
                          @click="addCustomFieldFilter"
                        ></v-btn>
                      </div>
                      <div class="pa-4 pt-0" v-if="customFieldFilters.length > 0">
                        <div
                          v-for="(cf, index) in customFieldFilters"
                          :key="index"
                          class="v-row align-center mb-2"
                        >
                          <div class="v-col-5 py-1">
                            <v-autocomplete
                              variant="outlined"
                              density="compact"
                              hide-details
                              placeholder="Campo"
                              :items="availableCustomFields"
                              item-title="name"
                              item-value="field"
                              v-model="cf.field"
                            ></v-autocomplete>
                          </div>
                          <div class="v-col-4 py-1">
                            <v-autocomplete
                              variant="outlined"
                              density="compact"
                              hide-details
                              placeholder="Condição"
                              :items="customFieldOperators"
                              item-title="text"
                              item-value="value"
                              v-model="cf.logicCondition"
                            ></v-autocomplete>
                          </div>
                          <div class="v-col-2 py-1" v-if="needsValue(cf.logicCondition)">
                            <v-text-field
                              variant="outlined"
                              density="compact"
                              hide-details
                              placeholder="Valor"
                              v-model="cf.value"
                            ></v-text-field>
                          </div>
                          <div class="v-col-1 py-1">
                            <v-btn
                              icon="mdi-close"
                              size="x-small"
                              variant="text"
                              @click="removeCustomFieldFilter(index)"
                            ></v-btn>
                          </div>
                        </div>
                      </div>
                      <div
                        v-else
                        class="px-4 pb-4 text-caption text-medium-emphasis"
                      >
                        Clique em + para adicionar filtro por campo personalizado
                      </div>
                    </div>
```

- [ ] **Step 2: Adicionar a mesma seção no menu mobile**

O mesmo template de filtro está duplicado para mobile (linhas ~340-408). Aplicar o mesmo bloco HTML após a seção de pipeline no menu mobile, mantendo a mesma estrutura.

---

### Task 8: Verificação visual

- [ ] **Step 1: Iniciar dev server**

```bash
cd chatfunnel-front && npm run dev
```

- [ ] **Step 2: Testar caminho feliz**

1. Abrir o frontend no navegador
2. Navegar para Contatos
3. Clicar no botão de filtro (ícone funil)
4. Verificar que a seção "Campos personalizados" aparece com botão "+"
5. Clicar "+" — deve aparecer uma linha com: campo (autocomplete), condição (autocomplete), valor (text field), e botão X
6. Selecionar um campo personalizado, operador "Igual a", digitar um valor
7. Aguardar debounce (800ms) — a lista deve filtrar
8. Trocar operador para "Preenchido" — o campo de valor deve sumir
9. Clicar X — a linha deve sumir e a lista deve recarregar sem o filtro

- [ ] **Step 3: Testar edge cases**

1. Adicionar 2+ filtros simultâneos — ambos devem ser aplicados (AND)
2. Adicionar filtro sem selecionar campo — não deve ser enviado na request
3. Adicionar filtro com operador que precisa valor mas sem valor — não deve ser enviado
4. Combinar filtro de custom field com filtro de tags — ambos devem funcionar
5. Verificar no DevTools Network que o payload do POST `/nest/contacts` contém `customFieldFilters` com o formato correto

---

## Observação: Bug existente (fora do escopo)

`filterPhoneNull` e `filterEmailNull` são refs reativas no frontend (linha ~683-684) mas NÃO são incluídas no objeto `search` dentro de `listContacts()` (linhas 760-774). Elas disparam `handleDebounceFilter()` mas o valor nunca chega ao backend. Isso não faz parte do escopo desta task, mas vale investigar em separado.
