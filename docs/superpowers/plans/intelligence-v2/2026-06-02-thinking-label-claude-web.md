# Thinking Label Claude-Web-Aligned Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o `thinkingLabel` baseado em seed por uma label estável e alinhada à tool em execução, espelhando o comportamento do Claude web — e centralizar o registro de labels em `@chatfunnel/contracts` como single source of truth.

**Architecture:** Hoje o `AssistantMessage.vue` mostra uma label "thinking" sorteada por um hash fraco do conteúdo (8 strings rotativas, frequentemente travadas no mesmo índice por causa da seed). A solução tem três partes: (1) mover o mapa `TOOL_LABELS` que já existe em `chatfunnel-front/src/views/intelligenceV2/utils/tool-label.ts` para `chatfunnel-contracts/src/tools/labels.ts` (metadata da tool deveria viver com o `TOOL_REGISTRY`); (2) o front re-exporta da contracts pra não quebrar imports; (3) o `thinkingLabel` no `AssistantMessage.vue` passa a derivar do primeiro `tool_invocation` no `content[]` (se existir) ou cai num estático `"Pensando..."` (paridade Claude web).

**Tech Stack:** TypeScript, Zod 4, Vue 3 + Vite, Vitest, `@chatfunnel/contracts` (workspace package consumido via `dist/`).

> **Commits:** todos os commits são feitos manualmente pelo usuário. Não executar `git add` / `git commit` em nenhuma task.

---

## File Structure

**Files created:**
- `chatfunnel-contracts/src/tools/labels.ts` — mapa `TOOL_LABELS` + helpers `getToolLabel`, `getThinkingLabel`, constante `THINKING_LABEL`
- `chatfunnel-front/src/views/intelligenceV2/components/messages/AssistantMessage.spec.ts` — testes do thinking pill
- `chatfunnel-front/src/views/intelligenceV2/utils/tool-label.spec.ts` — teste de cobertura `TOOL_REGISTRY` × `TOOL_LABELS`

**Files modified:**
- `chatfunnel-contracts/src/tools/index.ts` — exporta `TOOL_LABELS`, `THINKING_LABEL`, `getToolLabel`, `getThinkingLabel`
- `chatfunnel-front/src/views/intelligenceV2/utils/tool-label.ts` — re-exporta da contracts (mantém API atual usada por `ToolCallCard.vue`)
- `chatfunnel-front/src/views/intelligenceV2/components/messages/AssistantMessage.vue` — remove `THINKING_LABELS` + seed; deriva label da primeira `tool_invocation`

**Files audited (read-only):**
- `chatfunnel-contracts/src/tools/registry.ts` — fonte da verdade dos nomes de tool (`TOOL_REGISTRY` keys + `RENDERABLE_TOOL_NAMES`)
- `chatfunnel-front/src/views/intelligenceV2/types/content-block.ts` — confirmar shape do bloco `tool_invocation` (campo `name: string`)

---

## Phase 1 — Move label registry to `@chatfunnel/contracts`

### Task 1: Criar `labels.ts` em contracts

**Files:**
- Create: `chatfunnel-contracts/src/tools/labels.ts`

- [ ] **Step 1: Criar o arquivo com o mapa e os helpers**

```ts
// chatfunnel-contracts/src/tools/labels.ts
//
// Human-friendly Portuguese labels for every renderable tool name.
//
// Lives in @chatfunnel/contracts because the label is metadata of the tool
// (same family as `archetype` and `resources` already in TOOL_REGISTRY) — both
// frontend (ToolCallCard, AssistantMessage thinking pill) and backend (logs,
// traces) should agree on what to call each tool.
//
// Exhaustive coverage is enforced by the unit test in chatfunnel-front (see
// tool-label.spec.ts) so this map cannot silently drift from TOOL_REGISTRY.

export const TOOL_LABELS: Record<string, string> = {
  // Protocol-level (A2A v2 replay/cache)
  present_resource: "Recuperando dados",

  // A2A Agents (Mastra meta-tools)
  "agent-systemAgent": "Consultando sistema",
  "agent-flowAgent": "Montando automação",
  "agent-templateAgent": "Gerenciando templates",
  "agent-crmAgent": "Operando CRM",
  "agent-contactsAgent": "Buscando contatos",

  // Discovery
  get_channels: "Canais conectados",
  get_tags: "Tags",
  get_kanbans: "Pipelines",
  get_moderators: "Membros da equipe",
  get_custom_fields: "Campos personalizados",
  get_agents_v2: "Agentes de IA",
  get_assistants: "Assistentes",
  list_medias: "Mídias",

  // Contacts
  search_contacts: "Busca de contatos",
  get_contact: "Detalhes do contato",
  get_contact_messages: "Mensagens do contato",
  update_contact: "Contato atualizado",
  add_contact_tag: "Tag adicionada",
  remove_contact_tag: "Tag removida",
  update_contact_field: "Campo atualizado",

  // Automations
  list_automations: "Automações",
  get_automation: "Detalhes da automação",
  get_draft: "Rascunho da automação",
  build_automation: "Automação criada",
  create_trigger: "Trigger criado",
  toggle_automation: "Automação alternada",
  rename_automation: "Automação renomeada",
  delete_automations: "Automações excluídas",
  add_step_message: "Passo de mensagem",
  add_step_delay: "Passo de delay",
  add_step_condition: "Passo de condição",
  add_step_action: "Passo de ação",
  add_step_kanban: "Passo de kanban",
  add_step_ab_test: "Teste A/B",
  add_step_follow_up: "Follow-up",
  add_step_run_automation: "Executar automação",
  add_step_chat_action: "Ação de chat",

  // Templates
  list_templates: "Templates",
  get_template: "Detalhes do template",
  get_template_status: "Status do template",
  get_template_buttons: "Botões do template",
  create_template: "Template criado",
  update_template: "Template atualizado",
  delete_templates: "Templates excluídos",
  sync_templates: "Templates sincronizados",
  configure_template_params: "Parâmetros configurados",

  // CRM
  list_kanban_cards: "Cards do pipeline",
  create_kanban_card: "Card criado",
  move_kanban_card: "Card movido",
  win_kanban_card: "Card ganho",
  lose_kanban_card: "Card perdido",
  assign_card_moderator: "Responsável atribuído",

  // Tags
  create_tag: "Tag criada",
  update_tag: "Tag atualizada",
  delete_tag: "Tag excluída",
  list_tag_folders: "Pastas de tags",
  create_tag_folder: "Pasta criada",
  delete_tag_folder: "Pasta excluída",
};

/**
 * Returns a human-friendly Portuguese label for a tool name.
 *
 * Falls back to the raw `toolName` with underscores replaced by spaces so
 * unknown tools still render readably (defensive against schema drift between
 * TOOL_REGISTRY and this map).
 */
export function getToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? toolName.replace(/_/g, " ");
}

/**
 * Static label for the assistant "thinking" pill — shown while a message has
 * no visible content yet (no streamed text, no tool blocks).
 */
export const THINKING_LABEL = "Pensando...";

/**
 * Tool-aware variant: if `toolName` is provided (e.g. the first queued
 * tool_invocation already exists in the message), returns its label suffixed
 * with an ellipsis to signal in-progress — mirrors Claude web's "Searching…"
 * behavior. Otherwise returns the generic THINKING_LABEL.
 */
export function getThinkingLabel(toolName?: string | null): string {
  if (!toolName) return THINKING_LABEL;
  const base = getToolLabel(toolName);
  return base.endsWith("...") ? base : `${base}...`;
}
```

- [ ] **Step 2: Verificar TypeScript compila**

Run:
```bash
cd chatfunnel-contracts && npx tsc --noEmit
```
Expected: zero errors.

---

### Task 2: Exportar `labels` de `tools/index.ts`

**Files:**
- Modify: `chatfunnel-contracts/src/tools/index.ts` (apêndice — adicionar bloco abaixo do export atual do `registry`)

- [ ] **Step 1: Adicionar bloco de export ao fim do arquivo**

Acrescentar (logo após o bloco `export { TOOL_REGISTRY, ... } from "./registry";`):

```ts
export {
  TOOL_LABELS,
  THINKING_LABEL,
  getToolLabel,
  getThinkingLabel,
} from "./labels";
```

- [ ] **Step 2: Build da contracts**

Run:
```bash
cd chatfunnel-contracts && npm run build
```
Expected: gera `dist/tools/labels.js`, `dist/esm/tools/labels.js`, `dist/tools/labels.d.ts`. Verificar:
```bash
ls chatfunnel-contracts/dist/tools/labels.js chatfunnel-contracts/dist/esm/tools/labels.js chatfunnel-contracts/dist/tools/labels.d.ts
```
Expected: 3 caminhos listados sem erro.

> **Nota sobre sync para o front:** o consumo de `@chatfunnel/contracts` pelo front é sincronizado manualmente (ver memory `feedback_no_core_nodemodules_edit`). Antes de prosseguir pra Task 3, **PARE e peça ao usuário pra sincronizar `chatfunnel-contracts/dist/` em `chatfunnel-front/node_modules/@chatfunnel/contracts/dist/`** (ou rodar o procedimento que ele já usa). Não tocar em `node_modules/` automaticamente.

---

### Task 3: Re-exportar de `chatfunnel-front/.../tool-label.ts`

**Files:**
- Modify: `chatfunnel-front/src/views/intelligenceV2/utils/tool-label.ts` (substituição inteira)

- [ ] **Step 1: Substituir conteúdo inteiro por re-export**

```ts
// chatfunnel-front/src/views/intelligenceV2/utils/tool-label.ts
//
// Re-export from @chatfunnel/contracts so the frontend never owns the label
// table. Local imports (`import { getToolLabel } from '../../utils/tool-label'`)
// continue to work unchanged — the symbol just resolves through contracts.

export {
  TOOL_LABELS,
  THINKING_LABEL,
  getToolLabel,
  getThinkingLabel,
} from "@chatfunnel/contracts/tools";
```

- [ ] **Step 2: Type-check do front**

Run:
```bash
cd chatfunnel-front && npx vue-tsc --noEmit
```
Expected: zero errors. (`ToolCallCard.vue` continua importando `getToolLabel` do path local — não é tocado.)

- [ ] **Step 3: Rodar specs existentes em intelligenceV2 (regressão)**

Run:
```bash
cd chatfunnel-front && npm run test:run -- intelligenceV2
```
Expected: PASS para os specs existentes (`tool-results/DetailCard.spec.ts`, `tool-results/KanbanCardList.spec.ts`).

---

## Phase 2 — Replace seed-based thinking label

### Task 4: Confirmar shape do bloco `tool_invocation`

**Files:**
- Read-only: `chatfunnel-front/src/views/intelligenceV2/types/content-block.ts`

- [ ] **Step 1: Inspecionar o tipo**

Abrir o arquivo e localizar o membro `tool_invocation` do discriminated union. Confirmar:
- O `type` literal é exatamente `'tool_invocation'`
- O campo do nome da tool é `name: string` (e não `toolName`, `tool`, etc.)

Se o nome do campo for diferente, **anotar o nome real e ajustar Tasks 5 e 6 substituindo `.name` pelo campo correto antes de continuar**. Não tocar no código de tipo.

- [ ] **Step 2: Sem commit**

Nenhuma alteração nesta task. É só verificação.

---

### Task 5: Escrever specs falhando em `AssistantMessage.spec.ts`

**Files:**
- Create: `chatfunnel-front/src/views/intelligenceV2/components/messages/AssistantMessage.spec.ts`

- [ ] **Step 1: Criar o spec com 4 cenários**

```ts
// chatfunnel-front/src/views/intelligenceV2/components/messages/AssistantMessage.spec.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AssistantMessage from './AssistantMessage.vue'
import type { AssistantMessage as AssistantMessageType } from '../../types/message'

function makeMessage(content: AssistantMessageType['content']): AssistantMessageType {
  return {
    id: 'msg_test',
    role: 'assistant',
    createdAt: new Date().toISOString(),
    content,
  } as AssistantMessageType
}

describe('AssistantMessage thinking pill', () => {
  it('shows the static "Pensando..." label when content is empty', () => {
    const wrapper = mount(AssistantMessage, {
      props: { message: makeMessage([]) },
    })
    expect(wrapper.text()).toContain('Pensando...')
  })

  it('shows the static "Pensando..." label when the only block is an empty text', () => {
    const wrapper = mount(AssistantMessage, {
      props: {
        message: makeMessage([{ type: 'text', text: '' } as never]),
      },
    })
    expect(wrapper.text()).toContain('Pensando...')
  })

  it('hides the thinking pill when the first block is a tool_invocation', () => {
    const wrapper = mount(AssistantMessage, {
      props: {
        message: makeMessage([
          { type: 'tool_invocation', id: 'tu_1', name: 'search_contacts', input: {} } as never,
        ]),
      },
    })
    // tool_invocation makes hasVisibleContent true, so the Card with
    // ContentBlockList renders and the thinking pill is gone.
    expect(wrapper.text()).not.toContain('Pensando...')
  })

  it('does not re-shuffle the label across re-renders of the same empty message', async () => {
    const message = makeMessage([])
    const wrapper = mount(AssistantMessage, { props: { message } })
    const first = wrapper.text()
    await wrapper.setProps({ message: { ...message } })
    const second = wrapper.text()
    expect(first).toBe(second)
    expect(first).toContain('Pensando...')
  })
})
```

- [ ] **Step 2: Rodar teste e confirmar que falha**

Run:
```bash
cd chatfunnel-front && npm run test:run -- AssistantMessage.spec.ts
```
Expected: FAIL — testes 1, 2 e 4 esperam exatamente `"Pensando..."` mas o componente atual renderiza uma string da rotação aleatória (`"Pensando..."` aparece só com `seed === 0`; cenário 2 produz seed `1 + "text".length = 5` → `"Processando..."`).

---

### Task 6: Implementar `AssistantMessage.vue` com label estática + tool-aware

**Files:**
- Modify: `chatfunnel-front/src/views/intelligenceV2/components/messages/AssistantMessage.vue` (substituir o bloco `<script setup lang="ts">` inteiro; `<template>` permanece exatamente igual)

- [ ] **Step 1: Substituir o `<script setup>` inteiro**

Trocar o conteúdo entre `<script setup lang="ts">` e `</script>` por:

```ts
import { computed } from 'vue'
import { PhCircleNotch } from '@phosphor-icons/vue'
import { Card } from '@/components/ui/card'
import { getThinkingLabel } from '../../utils/tool-label'
import ContentBlockList from './ContentBlockList.vue'
import type { AssistantMessage } from '../../types/message'

const props = defineProps<{ message: AssistantMessage }>()

const hasVisibleContent = computed(() => {
  return props.message.content.some((b) => {
    if (b.type === 'text') return b.text.length > 0
    if (b.type === 'tool_invocation') return true
    if (b.type === 'resource_ref') return true
    if (b.type === 'tool_status') return true
    if (b.type === 'delegation') return b.children.length > 0
    return false
  })
})

// Claude-web-aligned: while we have no visible content, show a static
// "Pensando..." pill. If a tool_invocation is already queued but no other
// content has rendered (race during fast streaming), surface that tool's
// label — same source of truth as ToolCallCard's header.
const thinkingLabel = computed(() => {
  const firstTool = props.message.content.find(
    (b): b is Extract<typeof b, { type: 'tool_invocation' }> =>
      b.type === 'tool_invocation',
  )
  return getThinkingLabel(firstTool?.name)
})
```

- [ ] **Step 2: Rodar os specs do thinking pill e confirmar que passam**

Run:
```bash
cd chatfunnel-front && npm run test:run -- AssistantMessage.spec.ts
```
Expected: PASS — 4 testes verdes.

- [ ] **Step 3: Rodar suite intelligenceV2 inteira (não-regressão)**

Run:
```bash
cd chatfunnel-front && npm run test:run -- intelligenceV2
```
Expected: PASS para todos os specs em `intelligenceV2/`.

- [ ] **Step 4: Type-check global**

Run:
```bash
cd chatfunnel-front && npx vue-tsc --noEmit
```
Expected: zero errors.

---

## Phase 3 — Coverage audit

### Task 7: Teste de cobertura `TOOL_REGISTRY` × `TOOL_LABELS`

**Files:**
- Create: `chatfunnel-front/src/views/intelligenceV2/utils/tool-label.spec.ts`

- [ ] **Step 1: Escrever o spec**

```ts
// chatfunnel-front/src/views/intelligenceV2/utils/tool-label.spec.ts
import { describe, it, expect } from 'vitest'
import {
  RENDERABLE_TOOL_NAMES,
  TOOL_REGISTRY,
  TOOL_LABELS,
  getToolLabel,
  getThinkingLabel,
  THINKING_LABEL,
} from '@chatfunnel/contracts/tools'

describe('tool label registry coverage', () => {
  it('every tool in TOOL_REGISTRY has an explicit entry in TOOL_LABELS', () => {
    const registryKeys = Object.keys(TOOL_REGISTRY)
    const missing = registryKeys.filter((k) => !(k in TOOL_LABELS))
    expect(missing).toEqual([])
  })

  it('every renderable tool name has an explicit entry in TOOL_LABELS', () => {
    const missing = RENDERABLE_TOOL_NAMES.filter((k) => !(k in TOOL_LABELS))
    expect(missing).toEqual([])
  })

  it('getToolLabel falls back gracefully for unknown tools', () => {
    expect(getToolLabel('unknown_tool_name')).toBe('unknown tool name')
  })

  it('getToolLabel returns the registry value for known tools', () => {
    expect(getToolLabel('get_kanbans')).toBe('Pipelines')
    expect(getToolLabel('agent-contactsAgent')).toBe('Buscando contatos')
  })

  it('getThinkingLabel returns THINKING_LABEL when no tool name is passed', () => {
    expect(getThinkingLabel(undefined)).toBe(THINKING_LABEL)
    expect(getThinkingLabel(null)).toBe(THINKING_LABEL)
  })

  it('getThinkingLabel appends ellipsis to the tool label when a name is passed', () => {
    expect(getThinkingLabel('get_kanbans')).toBe('Pipelines...')
    expect(getThinkingLabel('agent-contactsAgent')).toBe('Buscando contatos...')
  })
})
```

- [ ] **Step 2: Rodar o spec**

Run:
```bash
cd chatfunnel-front && npm run test:run -- tool-label.spec.ts
```
Expected: PASS se a Task 1 já cobriu todos os tools; **ou** FAIL listando os tool names ausentes (cenário esperado se algum tool novo foi adicionado à `TOOL_REGISTRY` depois da última atualização de `tool-label.ts` original).

- [ ] **Step 3 (condicional — só se Step 2 falhou): Backfill em `labels.ts`**

3.1. Pegar a lista `missing` do output do vitest. Para cada nome:
- Procurar o handler/contract correspondente em `chatfunnel-contracts/src/tools/<dominio>.contracts.ts` pra entender o que faz
- Procurar o tool na tabela de archetype/renderer em `vault/wiki/features/intelligence-v2-component-map.md` (já tem nomes em PT canônicos)
- Escolher label seguindo o padrão das seções existentes: substantivo pra discovery/list ("Pipelines", "Templates"), verbo no particípio passado pra `action` que confirma uma mutação ("Card criado", "Tag adicionada"), gerúndio pra meta-agents ("Buscando contatos")

3.2. Editar `chatfunnel-contracts/src/tools/labels.ts` adicionando as entradas no bloco apropriado por domínio (mantém o agrupamento existente).

3.3. Rebuild contracts:
```bash
cd chatfunnel-contracts && npm run build
```

3.4. **PARAR e pedir sync manual de `chatfunnel-contracts/dist/` → `chatfunnel-front/node_modules/@chatfunnel/contracts/dist/`**.

3.5. Re-rodar o spec:
```bash
cd chatfunnel-front && npm run test:run -- tool-label.spec.ts
```
Expected: PASS.

---

## Phase 4 — Final verification

### Task 8: Full verification

- [ ] **Step 1: Run full intelligenceV2 suite**

Run:
```bash
cd chatfunnel-front && npm run test:run -- intelligenceV2
```
Expected: ALL PASS.

- [ ] **Step 2: Run vue-tsc**

Run:
```bash
cd chatfunnel-front && npx vue-tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 3: Smoke manual no Dashboard**

3.1. Subir o dev server:
```bash
cd chatfunnel-front && npm run dev
```

3.2. Acessar `http://localhost:5173/intelligence-v2`.

3.3. Cenário A — pill estático: mandar "oi". Confirmar que durante o gap antes do primeiro token aparece `"Pensando..."` (e fica estável, sem trocar de string).

3.4. Cenário B — tool-aware: mandar "mostre meus pipelines". Confirmar que ao chegar o `block_start` do `tool_invocation` (mas antes do `tool_status` done) o `ToolCallCard` mostra header com label `"Operando CRM"` (delegação ao `agent-crmAgent`) e/ou `"Pipelines"` (chamada direta a `get_kanbans`). Confirmar que nenhuma das strings antigas (`"Analisando..."`, `"Pesquisando..."`, etc.) aparece em qualquer estado.

- [ ] **Step 4: Atualizar wiki**

Editar `vault/wiki/features/intelligence-v2-component-map.md` adicionando à seção `## 2. Anatomia do ToolCallCard` (ou criando seção nova `## 8. Thinking pill (AssistantMessage)`) uma nota:

```md
## 8. Thinking pill (AssistantMessage)

Enquanto `hasVisibleContent === false`, o `AssistantMessage.vue` renderiza um pill com label vinda de `getThinkingLabel(firstToolInvocation?.name)`:

- Sem `tool_invocation` na fila → `"Pensando..."` (constante `THINKING_LABEL` em `@chatfunnel/contracts/tools`)
- Com `tool_invocation[0].name = "X"` → `${getToolLabel("X")}...`

Fonte da verdade: `chatfunnel-contracts/src/tools/labels.ts` (`TOOL_LABELS` + `getToolLabel` + `getThinkingLabel`). O front re-exporta via `chatfunnel-front/src/views/intelligenceV2/utils/tool-label.ts` pra preservar imports relativos existentes.
```

Commits do plano todo são manuais (o usuário commita).

---

## Self-review checklist

**Spec coverage** (da proposta "Nível 2" da conversa que gerou o plano):
- ✅ Move label registry pra contracts → Tasks 1–3
- ✅ Helper `getToolLabel` exportado da contracts → Task 1
- ✅ `ToolCallCard.vue` continua usando label correta (via re-export) → coberto sem edit, validado em Task 3 Step 3
- ✅ `thinkingLabel` do `AssistantMessage.vue` passa a derivar do tool → Tasks 5–6
- ✅ Estabilidade entre re-renders (problema #2 do código original) → Task 5 Step 1 caso 4
- ✅ Cobertura exaustiva de `TOOL_REGISTRY` → Task 7

**Placeholder scan:** Sem TBDs, sem "implement later", sem "add error handling". Os steps condicionais (3.x da Task 7) detalham o procedimento completo, não delegam decisões.

**Type consistency:**
- `getToolLabel(toolName: string): string` — definido na Task 1 Step 1, usado na Task 3 Step 1 (re-export), Task 6 Step 1 (via `getThinkingLabel`), Task 7 Step 1 (testes).
- `getThinkingLabel(toolName?: string | null): string` — definido na Task 1 Step 1, usado na Task 6 Step 1 e Task 7 Step 1.
- `THINKING_LABEL: string` constante — definido na Task 1 Step 1, importado na Task 7 Step 1.
- `TOOL_LABELS: Record<string, string>` — definido na Task 1 Step 1, importado na Task 7 Step 1.
- Todos os identificadores aparecem em `index.ts` (Task 2 Step 1) e no re-export do front (Task 3 Step 1) com nomes idênticos.

---

## Risks & notes

- **Sync manual de `@chatfunnel/contracts`:** o front consome contracts via `node_modules` sincronizado manualmente (memory `feedback_no_core_nodemodules_edit`). Após qualquer mudança em `chatfunnel-contracts/dist/` (Tasks 2 e 3.3 da 7), **PARE e peça sync ao usuário** antes de rodar testes/typecheck do front.
- **Campo `name` em `tool_invocation`:** Task 4 valida isso antes de implementar. Se for outro nome, ajustar Tasks 5–6 (search por `.name` no spec e no `find` do thinkingLabel).
- **Ellipsis duplicado:** `getThinkingLabel` defensivamente checa `endsWith("...")` antes de concatenar — labels que terminam em "..." (nenhuma hoje) não viram "Coisa......".
- **`ToolCallCard.vue` intocado:** o card chama `getToolLabel(invocation.name)` por path local; depois do re-export da Task 3, o símbolo passa a vir da contracts sem alteração no card. Cobertura validada em Task 3 Step 3.
- **Specs antigos (`DetailCard.spec.ts`, `KanbanCardList.spec.ts`):** rodam intocados em Task 3 Step 3 e Task 8 Step 1 — qualquer regressão aborta a fase.
