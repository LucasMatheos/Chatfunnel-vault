---
title: Frontend Gotchas
description: Armadilhas conhecidas do chatfunnel-front — componentes v2, build, HMR, atributos HTML.
tags: [gotcha, frontend, vue, vite]
severity: media
related: ["[[wiki/repos/chatfunnel-front|chatfunnel-front]]", "[[signup-profile-step]]", "[[credenciais-page]]"]
last_updated: 2026-04-30
---

# Frontend Gotchas

## InputText v2 nao repassa atributos HTML nativos

**Arquivo:** `src/components/v2/inputs/InputText.vue`

### O que acontece

Passar `maxlength`, `pattern`, `minlength`, `autofocus` etc. no uso do componente (`<input-text-v2 maxlength="100" />`) **nao tem efeito** no `<input>` interno. O atributo cai no `<div>` raiz via fallthrough e e ignorado.

### Por que

O template do componente envolve o input em um `<div class="form-group">`. Vue 3 aplica attrs do parent no elemento raiz — nesse caso o div. O `<input>` so recebe o que esta explicitamente bindado via `v-bind` ou props declaradas.

```vue
<!-- Componente -->
<div class="form-group">
  <input :type="..." :id="..." :placeholder="..." v-model="contents" />
  <!-- maxlength do parent cai aqui no div, nao no input -->
</div>
```

### Workaround

Declarar prop explicita + bindar no input interno:

```vue
<!-- no defineProps -->
maxlength: { type: [String, Number], default: null }

<!-- no template -->
<input :maxlength="maxlength" ... />
```

Validar tambem dentro de `validate()` para defesa dupla:
```js
if (props.maxlength && contents.value?.length > Number(props.maxlength)) {
  return `Maximo de ${props.maxlength} caracteres`
}
```

### Escopo

Mesmo problema em outros componentes v2 de `src/components/v2/inputs/` — todos envelopam o input/select nativo em wrapper div. Em codigo NOVO preferir `src/components/ui/` (shadcn-vue) que suporta fallthrough correto.

---

## SWC watch mode nao propaga class-validator decorators

**Repo:** `chatfunnel-services`

### O que acontece

Adicionar ou remover decorators de `class-validator` (ex: `@MaxLength`, `@IsEnum`) em DTOs com o `npm run start:dev` ja rodando **nao toma efeito** — o endpoint continua aceitando payloads invalidos.

### Por que

SWC compila o arquivo incrementalmente, mas `reflect-metadata` (usado pelo `class-validator`) depende da ordem de registro de decorators no startup. Hot reload nao reinicia o registro.

### Workaround

Ctrl+C e `npm run start:dev` novamente apos alterar decorators. Tests com `@nestjs/testing` nao tem esse problema porque criam container novo por suite.

---

## @chatfunnel/core consumers precisam de sync manual

**Script:** `sync-core.ps1` (Windows), `sync.sh` (Linux)

### O que acontece

Mudancas em `@chatfunnel/core/src/**` **nao aparecem** em consumers (`chatfunnel-services`, `chatfunnel-api` etc.) mesmo apos `npm run build` no core. O `node_modules/@chatfunnel/core/dist/` do consumer continua com a versao publicada do GitHub Packages registry.

### Por que

O pacote e resolvido via registry, nao via `file:` ou workspace. Sem publish, o consumer nao pega o dist local automaticamente.

### Workaround

Rodar `./sync-core.ps1` (ou `sync.sh`) na raiz do workspace. O script:
1. `npm run build` no core (prisma generate + tsc)
2. Copia `core/dist/*` e `core/prisma/schema.prisma` para `node_modules/@chatfunnel/core/` de services e api
3. Regenera Prisma Client no services apontando para o schema sincronizado

### Regra

**NUNCA editar manualmente** arquivos dentro de `node_modules/@chatfunnel/core/` de consumer. Sempre passar pelo build do core + sync (automatico ou manual via script).

---

## `chatfunnel-database` nao existe como repo

**Referencia:** CLAUDE.md menciona `chatfunnel-database/` como submodulo

### O que acontece

`CLAUDE.md` da raiz do workspace referencia `chatfunnel-database/` para schema Prisma, mas **o repo nao existe** localmente nem no workspace.

### Realidade

O schema Prisma vive em `chatfunnel-core/prisma/schema.prisma`. O `@chatfunnel/core` e o unico pacote que toca Prisma — consumers usam `PrismaClient` importado de `@chatfunnel/core/database`.

### Workaround

Tratar `chatfunnel-database/` no CLAUDE.md como placeholder historico ou atualizar o doc. Toda mudanca de schema vai em `chatfunnel-core`.

---

## Dialog aninhado com `:modal="false"` fica invisivel

**Arquivos de referencia:** `src/views/agents/AgentsForm/components/modals/AutomationsConfigDialog.vue`, `AutomationBuilderDialog.vue`

### O que acontece

Dialog interno aberto de dentro de outro Dialog (shadcn-vue / reka-ui) usando `:modal="false"` renderiza no DOM mas fica **invisivel e nao-clicavel**. `document.querySelectorAll('[role="dialog"]').length` sobe (ex: 1 -> 2) confirmando que o conteudo existe, mas nada aparece na tela.

### Por que

Quando o dialog externo abre em modo modal (default), reka-ui aplica globalmente:

1. `pointer-events: none` no `<body>` — so o portal do modal ativo fica interativo
2. Registra o dialog no seu stack interno de modais

O dialog interno com `:modal="false"`:

- Nao entra no stack do reka-ui
- Nao renderiza `DialogOverlay` proprio (reka-ui so renderiza overlay quando modal=true)
- O `DialogContent` e teleportado ao `<body>` como sibling do portal externo
- Herda o `pointer-events: none` propagado pelo modal externo
- Fica visualmente atras do overlay opaco (`bg-black/80` em `z-[9999]`) do externo

Resultado: existe no DOM mas e inalcancavel.

### Fix

Deixar o dialog interno como modal tambem. O reka-ui gerencia nested modals via stack LIFO: o overlay do interno empilha por cima do externo, ESC fecha o de cima primeiro, dismiss do externo nao fecha o interno.

```vue
<!-- Errado -->
<Dialog v-model:open="isOpen" :modal="false">

<!-- Certo -->
<Dialog v-model:open="isOpen">
```

Para evitar que clicar no overlay do interno feche o externo por engano, o externo deve condicionar o `close-on-overlay`:

```vue
<DialogControl :close-on-overlay="!builderIsOpen" ... />
```

Onde `builderIsOpen = computed(() => !!builderRef.value?.isOpen)`.

### Nao resolve com z-index

Tentar bumpar z-index do `DialogContent` interno (ex: `z-[100000]!`) **nao resolve** porque o bloqueio vem do `pointer-events: none` no body, nao apenas de stacking. A raiz e o modal mode, nao CSS.

---

## `vue-i18n` `d()` retorna string vazia sem `datetimeFormats`

**Repo:** `chatfunnel-front`
**Arquivos de referencia:** `src/views/configuration/credentials/api-keys/components/APIKeysTable.vue`, `src/views/configuration/credentials/mcp-tokens/components/McpTokensTable.vue`

### O que acontece

Usar `{{ d(new Date(row.expiresAt), 'short') }}` no template (ou `d()` do composable `useI18n`) **retorna string vazia** — a célula renderiza em branco, sem warning no console.

### Por que

`d()` (date formatter do `vue-i18n`) requer `datetimeFormats` configurado por locale na criacao do `i18n`. O projeto so configura `messages` (traducoes) e `numberFormats`, sem `datetimeFormats`. Sem o formato `short` registrado para `pt-BR`, o `d()` faz fallback silencioso para `''`.

### Workaround

Usar formatacao nativa em vez de `d()`:

```ts
// Opcao 1: Intl.DateTimeFormat (sem dep extra)
const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR").format(new Date(iso));

// Opcao 2: date-fns + locale ptBR (quando precisa de formato custom)
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const formatDate = (iso: string) =>
  format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR });
```

### Alternativa (nao adotada)

Configurar `datetimeFormats` no `createI18n({ datetimeFormats: { 'pt-BR': { short: {...} } } })`. Nao foi feito porque o projeto ja consolidou em `Intl`/`date-fns` nas tabelas existentes — adicionar `datetimeFormats` agora exige mapear todos os formatos usados no codebase.

---

## `overflow-y: auto` aninhado empurra icones do rail da Sidebar em altura ≤900px

**Repo:** `chatfunnel-front`
**Arquivos de referencia:** `src/layout/components/SideBar/index.vue`, `src/layout/components/SideBar/components/MenuSidebar.vue`

### O que acontece

Em telas com altura ≤ 900px (MacBook 13"), os icones da sidebar em modo **rail** (colapsada) ficam empurrados para a direita, decentralizados em relacao ao container de 68px.

### Por que

Dois containers com `overflow-y: auto` aninhados:
- `.sidebar-inner--floating` (em `SideBar/index.vue`)
- `<v-list>` (em `MenuSidebar.vue`)

Quando o conteudo ultrapassa a viewport, o `<v-list>` interno renderiza scrollbar nativa (~5px), que ocupa espaco dentro do rail de 68px e empurra horizontalmente os icones.

### Fix

`overflow-y` agora e condicional ao estado da sidebar (`rail` injetado via `provide` em `SideBar/index.vue`):

```vue
<v-list
  :style="{ overflowY: rail ? 'hidden' : 'auto' }"
  ...
/>
```

- `rail` aberto: `auto` — scroll aparece quando conteudo passa.
- `rail` colapsado: `hidden` — nenhuma scrollbar para empurrar icones.

### Tentativas que nao resolveram

- Trocar para `overflow: visible` em rail: scroll desaparecia mesmo com sidebar aberta (perdia funcionalidade).
- Forcar largura fixa nos icones: scrollbar ainda renderizava por tras, criando deslocamento visual nos hovers.

---

## MCP `list_kanban_cards` muda shape conforme parametros

**Tool:** `list_kanban_cards` em `chatfunnel-mcp/src/mcp/tools/crm.tools.ts`

### O que acontece

Mesma tool retorna shapes **diferentes** dependendo se passa `columnId` ou nao:

```ts
// SEM columnId
{ kanban: { columns: [{ /* SEM cards */ }] } }

// COM columnId
{ kanban: { columns: [{ /* COM cards[] */ }] }, kanbans: [{ /* meta duplicada */ }] }
```

### Por que

O handler do MCP carrega cards apenas quando filtro de coluna esta presente, e adiciona um array `kanbans[]` no root como meta auxiliar. Comportamento parece ser otimizacao de payload em listas grandes, mas vira shape condicional na pratica.

### Workaround

Pra carregar kanban inteiro com cards, frontend precisa fazer **N+1 calls** (1 por coluna). Nao tem endpoint que retorna kanban completo de uma vez. Coalesce defensivo:

```ts
const cards = response?.kanban?.columns?.[i]?.cards ?? [];
```

### Pendente

Confirmar com backend se eh design intencional ou bug. Se for design, vale documentar no MCP tool description que cards so vem com `columnId`.

---

## MCP `get_template_buttons` exige `templateInternalId` (UUID), nao Meta ID

**Tool:** `get_template_buttons`

### O que acontece

Outras tools de template (`get_template`, `get_template_status`) usam `templateId` (Meta numeric string). `get_template_buttons` usa `templateInternalId` (UUID interno do banco). Passar Meta ID retorna erro de validacao.

### Por que

Inconsistencia historica do MCP — tools mais novas usam internal ID, antigas usam Meta. Frontend precisa fazer lookup via `list_templates` pra pegar `internalId` antes de chamar a tool.

### Workaround

```ts
const tpl = templates.find(t => t.id === metaId);
const internalId = tpl?.internalId;
if (!internalId) throw new Error("Template nao sincronizado");
await getTemplateButtons({ channelId, templateInternalId: internalId });
```

### Tool name engana adicionalmente

`get_template_buttons` retorna **APENAS** botoes `QUICK_REPLY`. Templates com `URL`/`PHONE_NUMBER`/`COPY_CODE` retornam erro de dominio: `"Template has no QUICK_REPLY buttons — TEMPLATE trigger only works with QUICK_REPLY buttons."` Tratar como `get_quick_reply_buttons` mentalmente.

---

## MCP retorna `firstName`/`lastName` com `lastName: ""` (nao `null`)

**Tool:** `get_contact`

### O que acontece

Quando o contato tem nome com 1 palavra so (`"Vinicius"`), o MCP retorna:

```json
{ "name": "Vinicius", "firstName": "Vinicius", "lastName": "" }
```

`lastName` eh **string vazia**, nao `null`. Componentes que checam `lastName ?? ''` ficam OK, mas `lastName === null` ou `if (lastName)` quebram a logica.

### Workaround

Sempre tratar `lastName` como `string` e usar `lastName.trim() === ''` pra detectar ausencia:

```ts
const hasLastName = contact.lastName?.trim() !== '';
const fullName = hasLastName ? `${contact.firstName} ${contact.lastName}` : contact.firstName;
```

---

## MCP tem TYPO em campo de prod — `instagramFollowBusinnes`

**Tool:** `get_contact`

### O que acontece

Campo de retorno do MCP eh `instagramFollowBusinnes` (sem segundo `s`). Nome correto seria `instagramFollowBusiness`. Bug confirmado em producao 2026-04-30.

### Workaround

Tipar a interface com o nome errado pra match com a API atual, e adicionar comment apontando o typo:

```ts
interface ContactFull {
  /** @TODO: Backend tem typo — campo deveria ser `instagramFollowBusiness` */
  instagramFollowBusinnes: boolean;
  // ...
}
```

### Coordenacao backend+frontend

Renomear vai precisar de migracao coordenada — alterar o campo no Prisma + select no MCP + interface no front + qualquer consumer simultaneamente. Por enquanto, viver com o typo.

---

## MCP `search_contacts` tem `tags: string[]`, mas `get_contact` tem `TagsContacts: []`

**Tools:** `search_contacts` vs `get_contact`

### O que acontece

A mesma propriedade conceitual ("tags do contato") aparece com **shape diferente** entre as duas tools:

```ts
// search_contacts
{ tags: ["jhghjgkj"] }   // string[] — nomes plain

// get_contact
{ TagsContacts: [] }      // PascalCase! Shape diferente — array de objetos junction
```

### Por que

`TagsContacts` eh o nome da tabela junction Prisma vazando como nome de campo no JSON. Inconsistencia interna do MCP — alguns endpoints sanitizam, outros vazam o schema.

### Implicacoes

1. **API leak menor**: o nome da junction table fica exposto, ajuda em schema enumeration
2. **Frontend gotcha**: nao da pra reusar componente entre os dois endpoints — precisa adapter
3. **Naming inconsistente** com `customFields` (camelCase) que aparece no mesmo response do `get_contact`

### Workaround temporario

Adapter explicito por tool no frontend:

```ts
const normalizeTags = (raw: SearchContact | ContactFull): string[] => {
  if (Array.isArray((raw as SearchContact).tags)) {
    return (raw as SearchContact).tags;
  }
  return ((raw as ContactFull).TagsContacts ?? []).map(t => t.name);
};
```

---

## MCP templates: naming hibrido snake_case + camelCase no mesmo objeto

**Tools:** `list_templates`, `get_template`

### O que acontece

Resposta mistura snake_case (campos espelhados da Meta API) com camelCase (campos nossos):

```json
{
  "parameter_format": "POSITIONAL",
  "is_primary_device_delivery_only": false,
  "components": [{ "type": "BODY", "example": { "body_text": [["Joao"]] } }],
  "wasSynced": true,
  "needsConfiguration": false,
  "internalId": "f8e633c9-..."
}
```

### Por que

Backend reflete o JSON da Graph API direto (snake) e adiciona campos de controle interno em camel. Sem normalizacao na saida.

### Workaround

Usar mapper explicito no frontend pra normalizar tudo pra camelCase antes de entrar no store:

```ts
const normalizeTemplate = (raw: any) => ({
  parameterFormat: raw.parameter_format,
  isPrimaryDeviceDeliveryOnly: raw.is_primary_device_delivery_only,
  components: raw.components?.map(c => ({
    type: c.type,
    example: c.example ? { bodyText: c.example.body_text } : undefined,
  })),
  wasSynced: raw.wasSynced,
});
```

---

## MCP `get_template.buttons[]` eh redundante com `components[type=BUTTONS].buttons[]` mas com fields diferentes

**Tool:** `get_template`

### O que acontece

A mesma lista de botoes aparece em **dois lugares** do mesmo response, com **fields diferentes**:

```json
{
  "components": [
    { "type": "BUTTONS", "buttons": [{ "type": "URL", "text": "Visitar", "url": "..." }] }
  ],
  "buttons": [
    { "id": "df6cc2d8-...", "whatsappTemplateId": "...", "type": "URL", "url": "...", "index": 0 }
  ]
}
```

`buttons[]` root **nao tem `text`** — so URL + IDs nossos. `components[].buttons[]` tem `text` mas nao tem ID.

### Por que

`components[].buttons[]` espelha o shape da Meta API (com `text`). `buttons[]` root eh o que o frontend precisa pra editar (com `id` UUID). Redundancia historica.

### Gotcha critico

Pra renderizar o botao na UI completa (com texto + edicao), precisa fazer **join entre os dois arrays**:

```ts
const buttons = response.buttons.map(b => {
  const meta = response.components
    .find(c => c.type === 'BUTTONS')?.buttons
    .find(m => m.url === b.url);
  return { ...b, text: meta?.text ?? '(sem texto)' };
});
```

Match por URL eh fragil — se 2 botoes tiverem mesma URL com textos diferentes, vira bug. Idealmente backend deveria fazer o merge.

---

## MCP templates: sync com Meta nao eh automatico

**Tool:** `sync_templates`

### O que acontece

Alterar template no UI do ChatFunnel (adicionar botao QUICK_REPLY, mudar texto) **nao reflete no MCP imediatamente**. Tools como `get_template_buttons` continuam retornando estado antigo ate o user rodar `sync_templates` manualmente.

### Por que

`sync_templates` puxa o estado atual da Meta Graph API e atualiza o cache do MCP. Sem ela, MCP serve a ultima sincronizacao.

### Implicacoes pro front

UI que faz inline-edit de template **deve** chamar `sync_templates` apos cada save bem-sucedido pra garantir que tools subsequentes (especialmente `get_template_buttons` em `add_step_message` com TEMPLATE trigger) vejam o estado novo.

```ts
async function saveTemplate(templateId: string, payload: TemplatePayload) {
  await api.patch(`/templates/${templateId}`, payload);
  await mcpClient.callTool('sync_templates', { channelId });
}
```

### Sintoma de bug

Step `add_step_message` configurado com template recem-editado nao mostra os QUICK_REPLY buttons novos no dropdown de "Disparar quando clicar em..." mesmo apos save. Causa = falta de sync.

## MCP CRM write tools fazem silent-fail (mutacao persiste apesar do erro)

### O que acontece

Todas as 5 write tools de CRM (`create_kanban_card`, `move_kanban_card`, `win_kanban_card`, `lose_kanban_card`, `assign_card_moderator`) retornam `INTERNAL_ERROR` mas a mutacao **persiste no banco**:

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "type": "internal",
    "message": "Cannot read properties of undefined (reading 'emit')"
  }
}
```

Apesar do erro, o card foi criado / movido / marcado WON/LOST / atribuido. Confirmado em sessao 2026-05-04 com 6 reproducoes em prod (audit 4.11 elevado a CRITICA).

### Por que

Pipeline do handler MCP eh `validate → DB commit → emit (BREAK) → throw`. O `socket.emit('cardCreated', ...)` quebra com `socket = undefined` apos o commit no banco, e a exception propaga ao client. A mutacao ja aconteceu mas o cliente recebe 500.

### Implicacao critica

Frontend que confia em `error.code === "INTERNAL_ERROR"` pra fazer rollback de UI ou retry **vai double-write ou divergir estado** com banco. Patterns inseguros:

```ts
// Ruim: assume que erro = mutacao nao aconteceu
try {
  await mcpClient.callTool('create_kanban_card', payload)
  showSuccess()
} catch (e) {
  showError() // mas o card EXISTE no banco
  rollbackOptimisticUI() // fica fora de sync
}

// Ruim: retry vai criar card duplicado
async function createWithRetry(payload, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try { return await mcpClient.callTool('create_kanban_card', payload) }
    catch { /* retry */ }
  }
}
```

### Workaround temporario (ate audit acao 17 + 24 fechar)

Apos qualquer erro `'emit'`, **NAO fazer rollback nem retry**. Em vez disso, verificar o estado real via `list_kanban_cards`:

```ts
async function safeCreateCard(payload) {
  try {
    return await mcpClient.callTool('create_kanban_card', payload)
  } catch (e) {
    if (e.message?.includes("'emit'")) {
      // Bug 4.11: mutacao provavelmente persistiu apesar do erro
      const cards = await mcpClient.callTool('list_kanban_cards', {
        kanbanId: payload.kanbanId,
        columnId: payload.columnId
      })
      const created = cards.kanban.columns[0].cards.find(
        c => c.contactId === payload.contactId && c.priority === payload.priority
      )
      if (created) return created // mutacao OK
    }
    throw e // erro real
  }
}
```

### Pendente

Hotfix `socket?.emit?.()` defensivo em todos os 5 handlers (audit acao 17). Snapshot tests obrigatorios pos-fix (audit acao 24).

## MCP `get_template_status` vs `get_template_buttons` — 2 IDs do mesmo template

### O que acontece

Tools sibling pra auditar o mesmo template esperam **IDs diferentes**:

| Tool | Param de ID | Tipo de ID esperado |
|---|---|---|
| `get_template` | `templateId` | Meta numeric string (`"1559135439076768"`) |
| `get_template_status` | `templateId` | Meta numeric string |
| `get_template_buttons` | `templateInternalId` | Internal UUID (`"02c03855-7b6b-49e2-8484-22239856ff57"`) |
| `update_template` / `delete_templates` | `templateId` | Meta numeric string |

Frontend que faz "audit completo" ou edicao de um template tem que enviar **2 IDs diferentes** em params separados.

### Por que

`list_templates.data[]` expoe ambos: `id` (Meta) + `internalId` (UUID interno). Tool de buttons foi implementada com referencia direta ao UUID interno (`prisma.template.findUnique({ where: { internalId } })`), enquanto as outras usam `id`. Inconsistencia historica.

### Workaround

Sempre que listar templates, capturar **ambos** os IDs e armazenar lado a lado:

```ts
type TemplateRef = {
  metaId: string         // pra get_template, get_template_status, update_template, delete_templates
  internalId: string     // pra get_template_buttons
}
```

### Pendente

Padronizar param name pra `templateId` em todos os tools, com handler resolvendo Meta ID OU UUID transparentemente. Audit nao tem acao pra isso ainda.

## MCP `get_template_buttons` rejeita templates sem QUICK_REPLY (naming engana)

### O que acontece

Tool retorna `VALIDATION_ERROR` se o template nao tem nenhum botao QUICK_REPLY:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "type": "domain",
    "message": "Template has no QUICK_REPLY buttons — TEMPLATE trigger only works with QUICK_REPLY buttons."
  }
}
```

### Por que

Apesar do nome `get_template_buttons`, a tool eh **semanticamente** "get QUICK_REPLY buttons available for TEMPLATE trigger matching" — nao retorna URL/PHONE_NUMBER/COPY_CODE/OTP buttons. Eh uma helper especifica de configuracao de trigger TEMPLATE no builder de automacao, nao um getter generico de buttons.

### Implicacao

Frontend que renderiza preview de template **NAO** deve usar `get_template_buttons` pra carregar a lista de botoes — usar `get_template.components` (filtrar `type === "BUTTONS"`) pra ter shape completo de todos os tipos de botao.

`get_template_buttons` so deve ser chamada quando montar trigger `type: TEMPLATE` em `create_trigger` — pra preencher dropdown "Disparar quando clicar em..." (que so aceita QUICK_REPLY).

### Pattern educacional bom

A mensagem de erro **explica POR QUE falhou** + sugere o que funciona ("TEMPLATE trigger only works with QUICK_REPLY buttons"). Replicar esse padrao em outros handlers — vs `"errors.X.Y"` raw que vaza i18n key (audit 4.12).

## MCP `update_contact_field` tem 3 comportamentos no mesmo shape de input

### O que acontece

A tool tem o mesmo signature `{ contactId, fieldId, value }` mas comporta-se de 3 jeitos diferentes:

| Cenario | Operacao | Response |
|---|---|---|
| Row da junction nao existe | INSERT | `{ id, value, customFieldId, contactId }` |
| Row existe + value novo | UPDATE in-place | `{}` vazio |
| Row existe + `value: ""` | **DELETE da junction** | `{}` vazio |

Cliente nao distingue do response qual operacao aconteceu (UPDATE e DELETE retornam o mesmo `{}`).

### Por que

Handler usa logica `if (!value) prisma.field.delete() else prisma.field.upsert()`. String vazia (`""`) cai no branch DELETE.

### Implicacao critica

Frontend que faz `update_contact_field({ value: "" })` esperando "limpar valor" (manter null/empty) **PERDE A RELACAO INTEIRA**. Em `get_contact`, o customField some de `customFields[]` array. Re-renderizar o formulario com o valor "limpo" entao nao mostra o campo.

### Workaround

```ts
// Ruim: deleta a relacao
await mcpClient.callTool('update_contact_field', {
  contactId, fieldId, value: ""
})

// Aceitavel: define um placeholder explicito
await mcpClient.callTool('update_contact_field', {
  contactId, fieldId, value: "—"  // ou outro sentinel visivel
})

// Melhor: tratar empty na UI sem chamar a tool
if (newValue === "" && oldValue !== "") {
  // perguntar ao user se quer LIMPAR ou DELETAR a relacao
}
```

### Pendente

Audit acao 29 (decidir se eh bug ou feature) + 30 (padronizar response com flag de operacao). Por enquanto, o frontend deve **evitar enviar `value: ""`** pra essa tool.

## MCP `update_template` partial-update DELETA components não enviados (silent data loss)

### O que acontece

Chamar `update_template` com payload parcial (so `body`, por exemplo) **apaga os outros components** do template no Meta-side.

**Cenario reproduzido em 2026-05-04 rodada 2** (template `_teste_intelligence_template` `1025027719871305`):

1. Template criado com HEADER + BODY + FOOTER + BUTTONS (1 QUICK_REPLY).
2. Update so com `body: { text: "novo texto" }`:
   ```ts
   await mcpClient.callTool('update_template', {
     channelId, templateId, body: { text: "Olá {{1}}, atualização do template intelligence." }
   })
   ```
3. Resposta: `{success: true, id}` (parecia OK).
4. **Pos-update via `get_template`**: `components[]` ficou **so com BODY**. HEADER/FOOTER/BUTTONS sumiram do Meta-side. Categoria mudou de UTILITY → MARKETING tambem.

### Por que

Handler do `update_template` faz **replace dos components Meta-side com o que vier no input**, NAO merge com estado anterior. Campos omitidos (header/footer/buttons) sao tratados como "remover", nao "preservar".

Adicionalmente, `category` tem default `MARKETING` no payload pra Meta quando omitido — handler nao busca o `category` atual antes de re-enviar.

### Implicacao critica

Frontend que faz "edit body inline", "edit footer inline", ou qualquer update parcial **destroi silenciosamente** os outros componentes. Templates UTILITY ficam degradados pra MARKETING. UI nao tem feedback do que sumiu.

Adicionalmente: apos o update, **`buttons[]` outer (banco interno) mantem o button antigo** mesmo que `components[type=BUTTONS]` tenha sumido do Meta-side. Estado **internamente divergente** — UI le banco interno, Meta dispara mensagem sem botao.

### Workaround obrigatorio (ate audit acao 35-37 fechar)

Sempre fetch state atual + re-enviar TODOS os components + `category`:

```ts
async function safeUpdateTemplateBody(
  templateId: string,
  channelId: string,
  newBodyText: string
) {
  // 1. Snapshot atual
  const current = await mcpClient.callTool('get_template', { templateId, channelId })

  // 2. Extrair todos os components atuais
  const components = current.data.components ?? []
  const headerComp = components.find(c => c.type === 'HEADER')
  const footerComp = components.find(c => c.type === 'FOOTER')
  const buttonsComp = components.find(c => c.type === 'BUTTONS')

  // 3. Re-enviar TUDO
  return mcpClient.callTool('update_template', {
    templateId,
    channelId,
    category: current.data.category,        // ← obrigatorio, senao vai pra MARKETING
    body: { text: newBodyText },
    ...(headerComp && {
      header: {
        format: headerComp.format,
        ...(headerComp.text && { text: headerComp.text }),
        ...(headerComp.example?.header_handle && { mediaUrl: headerComp.example.header_handle[0] }),
      }
    }),
    ...(footerComp && { footer: { text: footerComp.text } }),
    ...(buttonsComp && {
      buttons: buttonsComp.buttons.map(b => ({
        type: b.type,
        text: b.text,
        ...(b.url && { url: b.url }),
        ...(b.phone_number && { phoneNumber: b.phone_number }),
      }))
    }),
  })
}
```

### Status REJECTED nao volta pra PENDING

Bonus: apos `update_template` em template REJECTED, status **continua REJECTED** — Meta nao re-enfileirou aprovacao. Frontend que assume "edit reset status" estaria errado. Audit acao 38.

### Pendente

Audit acoes 35 (partial-update deletes), 36 (category default), 37 (buttons[] outer divergence), 38 (REJECTED nao re-enfileira). Hotfix priority CRITICA.

## MCP `configure_template_params` com `parameters: []` NAO eh wipe destrutivo (semantica defensiva)

### O que acontece

Chamar `configure_template_params` com `parameters: []` (array vazio) **NAO apaga as rows de parameters do template** — apenas **reseta** o campo `internalParameter` pra string vazia em todos os parameters existentes.

**Cenario reproduzido em 2026-05-04 rodada 2** (template `_teste_intelligence_template`):

1. Estado pre-call: `parameters[0]: { parameter: "1", internalParameter: "name", componentType: "BODY", componentFormat: "TEXT" }`
2. Chamada: `configure_template_params({ channelId, templateId, parameters: [] })`
3. Resposta: `{ configured: true, status: true }` (mesma envelope de sucesso, sem error)
4. Estado pos-call: `parameters[0]: { parameter: "1", internalParameter: "", componentType: "BODY", componentFormat: "TEXT" }` — estrutura mantida, **so o mapping foi resetado**.

### Por que

Logica do handler eh **upsert por `parameter` key**, nao replace do array inteiro:

```ts
for (const existing of template.parameters) {
  const found = input.find(p => p.parameter === existing.parameter)
  existing.internalParameter = found?.internalParameter ?? ""
}
```

Se `input` eh `[]`, todos os existing entram no branch "missing key → reset to empty".

### Implicacao positiva

Frontend pode usar `parameters: []` como **"reset to unconfigured state"** sem risco de perder estrutura/metadata do template:

```ts
// Util pra UI "limpar mapping antes de reconfigurar from scratch"
async function resetTemplateMapping(templateId, channelId) {
  await mcpClient.callTool('configure_template_params', {
    channelId,
    templateId,
    parameters: []
  })
  // Apos: needsConfiguration vira true, parameters[i].internalParameter = ""
  // Mas parameter "1", "2", "3" detectados do {{N}} no body continuam la
}
```

### Naming engana

Schema doc diz "Parameter mappings" pra `parameters[]`, mas semantica real eh **"upsert mapping by parameter key, missing keys reset to empty (NAO delete)"**. Doc deveria ser explicito.

### `needsConfiguration` flag dinamica

Bonus: `needsConfiguration` no `get_template` reflete imediatamente o estado pos-call:
- `true` quando algum `parameters[i].internalParameter === ""`
- `false` quando todos preenchidos

Util pra UI mostrar warning "este template precisa configuracao" sem precisar inspecionar cada `internalParameter` individualmente.

### Pendente

Audit acao 41 — documentar semantica explicita no schema do tool.
