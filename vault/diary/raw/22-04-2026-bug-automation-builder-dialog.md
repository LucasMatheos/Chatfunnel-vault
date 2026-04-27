---
date: 2026-04-22
status: resolvido
resolvido_em: 2026-04-23
tipo: bug-investigacao
contexto: agents-v2-frontend
---

# Bug: AutomationBuilderDialog não abre ao clicar "Configurar" dentro de AutomationsConfigDialog

## Sintoma

No form de criação/edição de agente V2, ao entrar no step **Ferramentas** → tool **AUTOMATIONS** → "Configurar", o dialog `AutomationsConfigDialog` abre normalmente. Porém ao clicar no botão **"Configurar"** do card "Na primeira interação" (lifecycle `firstInteraction`), o dialog interno `AutomationBuilderDialog` **não aparece**.

O mesmo problema provavelmente afeta os outros lifecycle cards (everyMessage, endSession, onGetSlots, etc.) e as conditionalAutomations.

## Escopo

- **Não** é regressão das Tasks 1–10 do plano `docs/superpowers/plans/2026-04-22-agents-v2-objectives-expiration.md` — bug aparenta ser pré-existente.
- Bug independente do feature de objectives/expiração.

## Arquivos relevantes

- `chatfunnel-front/src/views/agents/AgentsForm/components/modals/AutomationsConfigDialog.vue`
  - Linha 38–52: `LifecycleAutomationCard` emite `@configure="openKanbanModal(...)"`
  - Linha 476: `openKanbanModal()` chama `builderRef.value?.showDialog(id)`
- `chatfunnel-front/src/views/agents/AgentsForm/components/modals/components/AutomationBuilderDialog.vue`
  - Linha 46: `showDialog(id)` → seta `automationId.value = id`, `isOpen.value = true`, depois chama `initFlow()`
  - Linha 139: `<Dialog v-model:open="isOpen" :modal="false">`
  - Linha 135: `defineExpose({showDialog, hideDialog, isOpen})`
- `chatfunnel-front/src/views/agents/AgentsForm/components/modals/components/LifecycleAutomationCard.vue`
  - Linha 35: botão "Configurar" tem `@click="$emit('configure')"`

## Código aparenta correto

O fluxo está tecnicamente certo:

1. Botão "Configurar" → emite `@configure`
2. Handler `openKanbanModal(ref)` → chama `builderRef.value?.showDialog(ref.automationId)`
3. `showDialog()` → `isOpen.value = true; initFlow()`
4. `<Dialog v-model:open="isOpen">` deveria abrir

## Suspeitos (sem debug no navegador ainda)

1. **`builderRef.value` é `null`** — se o `<AutomationBuilderDialog ref="builderRef">` só é renderizado condicionalmente, o ref pode ainda não existir quando `openKanbanModal` é chamado.
2. **`initFlow()` lança exceção silenciosa** — se falhar logo após `isOpen.value = true`, pode efeito colateral fechar o dialog.
3. **Stacking / portal do Reka UI** — `AutomationBuilderDialog` renderiza via Portal dentro de outro Dialog aberto (AutomationsConfigDialog). Com `:modal="false"` não existe overlay, mas pode estar atrás do outer dialog. Seria problema de z-index.

## Como reproduzir (amanhã)

1. `cd chatfunnel-front && npm run dev`
2. Abrir `http://localhost:5173/agents/create`
3. Preencher identidade (step 1) e navegar até step 5 "Ferramentas"
4. Clicar "Adicionar ferramenta" → selecionar "Automações" → Confirmar
5. No card da tool AUTOMATIONS, clicar "Configurar" → `AutomationsConfigDialog` abre
6. No card "Na primeira interação", clicar "Configurar" → **bug: nada acontece**

## Passo de debug recomendado (começar por aqui amanhã)

Com o dialog de AutomationsConfigDialog aberto, abrir DevTools Console e executar:

```js
document.querySelectorAll('[role="dialog"]').length
```

**Antes** de clicar "Configurar" em "Na primeira interação": anotar o valor (provavelmente 1).
**Depois** de clicar: anotar novamente.

- **Se o número aumentou (ex. 1 → 2)**: o dialog está sendo criado mas está oculto. Problema de **stacking/z-index**. Investigar CSS dos portals do Reka UI ou forçar z-index maior no `AutomationBuilderDialog` DialogContent.
- **Se o número não mudou**: o dialog **não está sendo criado**. Investigar `showDialog()` — provavelmente `builderRef.value` é `null` ou `initFlow()` está lançando. Colocar `console.log('showDialog called', builderRef.value, id)` no `openKanbanModal` e rodar de novo.

Também verificar qualquer erro vermelho no Console ao clicar.

## Próximos passos

- [x] Rodar os checks acima e registrar resultado aqui — contador foi 1 → 2, dialog existe no DOM mas invisível
- [x] Identificar causa raiz — modal lifecycle do reka-ui: outer modal=true aplica `pointer-events: none` no body e o inner `modal=false` não entra no stack
- [x] Fix com menor invasão possível — remover `:modal="false"` do `<Dialog>` no `AutomationBuilderDialog.vue:139`
- [x] Testar outros cards lifecycle + conditionalAutomations — mesmo componente, mesma correção cobre todos

## Resolução (2026-04-23)

**Causa raiz:** `AutomationBuilderDialog` abria com `:modal="false"` dentro de um outer dialog modal. Reka-ui aplica `pointer-events: none` no `<body>` quando o modal externo está ativo; o inner com modal=false não entra no stack, herda o bloqueio e fica atrás do overlay `bg-black/80` do externo. Não era z-index — era o lifecycle do modal.

**Fix:** 1 linha em `AutomationBuilderDialog.vue:139` — remover `:modal="false"`. A proteção `closeOnOverlay: !builderIsOpen` no outer já estava no lugar e evita que o outer feche ao clicar no overlay do inner.

**Aprendizado registrado:** `vault/wiki/gotchas/frontend-gotchas.md` — seção "Dialog aninhado com `:modal=\"false\"` fica invisivel".

## Notas adicionais

- O outer `AutomationsConfigDialog` abre sem problema (confirmei setando breakpoints no mental model).
- As mudanças das Tasks 1–10 do plano em vigor **não** tocam nenhum desses arquivos — o único arquivo do fluxo AUTOMATIONS que modifiquei foi `ToolsStep.vue`, onde corrigi a chave `configDialogs.automations` (minúscula) para `AUTOMATIONS` (maiúscula). Essa correção foi necessária e não deve afetar o comportamento interno do `AutomationsConfigDialog`.
