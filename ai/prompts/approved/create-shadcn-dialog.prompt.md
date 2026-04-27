---
prompt_id: PRM-0003
status: approved
owner: lucas@grupovuk.com.br
purpose: Criar modal/dialog seguindo padrão shadcn-vue + Index Pattern do projeto
scope: chatfunnel-front
risk_level: low
human_review_required: true
last_reviewed_at: 2026-04-23
version: 1
---

# Criar dialog shadcn-vue

## Quando usar
- Novo modal de configuração, confirmação ou formulário
- Substituir modal legacy Vuetify por shadcn-vue

## Quando NÃO usar
- Mensagens simples (use `toast` via `vue-sonner`)
- Confirmações triviais (use `Dialog` inline no componente pai sem criar arquivo)
- SweetAlert2 existente que funciona — não mexer sem pedido explícito

## Contexto obrigatório a carregar
- `chatfunnel-front/src/components/ui/dialog/` (componentes base disponíveis)
- Um dialog de referência já migrado, ex: `src/views/agents/AgentsForm/components/modals/ObjectivesConfigDialog.vue`

## Entrada esperada
- Nome do dialog (PascalCase, sufixo `Dialog` ou `Modal`)
- Propósito (confirmação, form, detalhe, etc.)
- Props e eventos esperados
- Campos do form (se houver) — seguir prompt PRM-0001 para Zod

## Saída esperada (Index Pattern se >150 linhas)

```
<NomeDoDialog>/
  index.vue                    # Orquestra estado + Dialog wrapper
  components/
    <NomeSecao>.vue            # Sub-sections descritivas
  composables/
    use<Nome>State.ts          # Estado compartilhado (se necessário)
  validation.ts                # Schema Zod (se form)
  validation.spec.ts           # Testes do schema
```

Para dialogs simples (<150 linhas), arquivo único `.vue`.

## Regras
- Base: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter` de `@/components/ui/dialog`
- Controle de abertura via `v-model:open` (não `show`/`visible`)
- Props tipadas com `defineProps<{ ... }>()`
- Emits tipados com `defineEmits<{ ... }>()`
- Botões via `Button` com `variant` e `tone` corretos (primary/danger/outline)
- Fechar no sucesso via `emit('update:open', false)` + `emit('saved', payload)`
- Loading no botão de submit (`Skeleton` se dialog carrega dados do backend)
- Sem `<style scoped>` — só Tailwind
- Título em pt-BR, curto (max 6 palavras)

## Estrutura mínima do template
```vue
<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[520px]">
      <DialogHeader>
        <DialogTitle>Título curto</DialogTitle>
      </DialogHeader>

      <!-- conteúdo -->

      <DialogFooter>
        <Button variant="outline" @click="$emit('update:open', false)">Cancelar</Button>
        <Button :disabled="!canSubmit" :loading="isSaving" @click="handleSubmit">Salvar</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
```

## Critérios de revisão humana
- UX: fluxo de cancelamento não perde dados acidentalmente
- A11y: foco inicial em campo certo, ESC fecha, Enter submete quando apropriado
- Estado: dialog reseta form ao fechar (evitar dados vazados entre aberturas)

## Histórico
- v1 2026-04-23 criação inicial
