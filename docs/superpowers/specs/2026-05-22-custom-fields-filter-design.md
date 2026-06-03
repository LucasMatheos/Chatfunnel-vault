# Filtro de Campos Personalizados na Listagem de Contatos

**Data:** 2026-05-22
**Status:** Aprovado

## Contexto

A listagem de contatos (`ContactsList.vue`) possui filtros diretos para tags, pipeline, lead score, phone/email null e segmentos. Para filtrar por campos personalizados, o usuario precisa criar um segmento — fluxo indireto e lento para filtragens ad-hoc.

O broadcast de WhatsApp (`BroadcastForm.vue`) ja possui um condition builder com suporte a custom fields, usando `MenuVariables` + `StepConditionsLogicConditionEnum` + `handleConditionsLogicOptions()`. Esse pattern sera reutilizado.

## Decisoes de Design

| Decisao | Escolha | Alternativa descartada |
|---------|---------|----------------------|
| Escopo de campos | Somente custom fields | Todos os campos (sistema + tags + custom) |
| Logica entre condicoes | AND (todas devem ser satisfeitas) | Grupos OR como no broadcast |
| Contagem em tempo real | Nao — aplica e ve na tabela | Preview de count com debounce |
| Indicador de filtro ativo | Badge com count no botao | Chips individuais na barra |
| Abordagem tecnica | Reaproveitar componentes do broadcast | Componente novo / refactor do builder |

## UI

### Botao na barra de filtros

Posicao: apos tag filter mode, antes dos checkboxes phone/email.

- **Inativo:** `v-btn` outlined — "Campos personalizados"
- **Ativo:** "Campos personalizados (N)" — cor primary, N = quantidade de condicoes

### Modal (`CustomFieldsFilterModal.vue`)

`v-dialog` max-width 700px.

**Header:** "Filtrar por campos personalizados" + botao fechar (X)

**Body:** Lista de condicoes. Cada condicao e uma row com 3 colunas:

1. `MenuVariables` (type="select") — filtrado para mostrar somente custom fields (sem sistema, sem tags)
2. `input-select` (width ~250px) — operador, via `handleConditionsLogicOptions()`
3. `input-text` (flex-fill) — valor, type dinamico baseado no campo

Acima de cada condicao: chip "Condicao #N". Botao deletar a direita.

**Footer:**
- "Adicionar condicao" (outlined, mdi-plus)
- Separador
- "Limpar" (text) + "Aplicar" (primary filled)

### Fluxo

1. Usuario clica no botao → abre modal
2. Modal inicia com 1 condicao vazia (ou condicoes previamente aplicadas)
3. Preenche campo + operador + valor, adiciona mais se quiser
4. "Aplicar" → fecha modal, `listContacts()` roda com filtros
5. Botao mostra "(N)"
6. "Limpar" → remove todas condicoes, reaplica filtro

## Backend

### DTO — `GetContactsBodyDto`

Novo campo opcional:

```typescript
@IsOptional()
@IsArray()
@ValidateNested({ each: true })
@Type(() => CustomFieldFilterDto)
customFieldFilters?: CustomFieldFilterDto[];

class CustomFieldFilterDto {
  @IsString()
  field: string; // formato "customFields.'Nome do Campo'"

  @IsString()
  logicCondition: string; // EQUALS, NOT_EQUALS, CONTAINS_VALUE, etc.

  @IsOptional()
  @IsString()
  value?: string; // opcional para NOT_EXISTS
}
```

### Handler — `get-contacts.handler.ts`

Repassa `customFieldFilters` para `GetContactsOptions`. Sem logica adicional.

### Repository — `contacts.repository.ts`

Para cada condicao, adiciona WHERE com EXISTS subquery:

```sql
AND EXISTS (
  SELECT 1 FROM "CustomFieldsContacts" cfc
  JOIN "CustomFields" cf ON cf.id = cfc."customFieldId"
  WHERE cfc."contactId" = c.id
    AND cf."name" = ${fieldName}
    AND cfc."value" ${operador} ${value}
)
```

Mapeamento de operadores:

| Operador | SQL |
|----------|-----|
| EQUALS | `= value` |
| NOT_EQUALS | `!= value` |
| CONTAINS_VALUE | `ILIKE '%value%'` |
| NOT_CONTAINS_VALUE | `NOT ILIKE '%value%'` |
| STARTS_WITH | `ILIKE 'value%'` |
| NOT_EXISTS | subquery invertida com NOT EXISTS |
| GREATER | `> value` |
| LESS | `< value` |

Usa EXISTS ao inves de JOIN para evitar duplicacao de rows.

## Integracao Frontend → Backend

### State

```typescript
const customFieldFilters = ref<Array<{
  id: string;
  field: string;
  logicCondition: string;
  value: string;
}>>([]);
```

### `listContacts()`

```typescript
if (customFieldFilters.value.length) {
  search.customFieldFilters = customFieldFilters.value.map(c => ({
    field: c.field,
    logicCondition: c.logicCondition,
    value: c.value
  }));
}
```

### Componente do modal

**Arquivo:** `chatfunnel-front/src/views/contacts/components/modal/CustomFieldsFilterModal.vue`

**Props:**
- `modelValue: boolean` — v-model para abrir/fechar
- `filters: Array` — condicoes atuais para popular ao reabrir

**Emits:**
- `update:modelValue` — fechar
- `apply` — array de condicoes

### Persistencia

Refs reativos — persistem enquanto componente montado. Sem localStorage. Mesmo comportamento dos outros filtros.

## Escopo

### Inclui

- Modal de filtro com N condicoes AND
- Botao com badge de contagem na barra de filtros
- DTO `customFieldFilters` no backend
- WHERE clauses EXISTS no repositorio
- Reutilizacao de MenuVariables, handleConditionsLogicOptions, StepConditionsLogicConditionEnum

### Nao inclui

- Grupos OR (usuario usa Segmentos para logica complexa)
- Contagem em tempo real no modal
- Coluna `type` no modelo CustomFields (tipo inferido pela logica existente)
- Novos operadores alem dos existentes
- Persistencia em URL ou localStorage

## Riscos

| Risco | Mitigacao |
|-------|-----------|
| Performance com muitas condicoes | EXISTS subquery indexavel; unique constraint [customFieldId, contactId] |
| MenuVariables acoplado ao broadcast | Usa como componente sem alterar; filtra campos via categoria |
| Campo deletado com filtro ativo | Condicao retorna 0 resultados sem erro |

## Arquivos Tocados

| Arquivo | Alteracao |
|---------|-----------|
| `chatfunnel-front/src/views/contacts/ContactsList.vue` | Botao + ref + integracao listContacts() |
| `chatfunnel-front/src/views/contacts/components/modal/CustomFieldsFilterModal.vue` | **Novo** |
| `chatfunnel-services/src/modules/contacts/dtos/get_contacts.dto.ts` | Campo customFieldFilters |
| `chatfunnel-core/src/services/contacts/handlers/get-contacts.handler.ts` | Repassar filtros |
| `chatfunnel-core/src/repositories/contacts.repository.ts` | WHERE clauses EXISTS |
