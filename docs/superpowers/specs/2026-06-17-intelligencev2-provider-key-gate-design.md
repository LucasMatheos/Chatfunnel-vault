# IntelligenceV2 — Gate de chave de provedor (Anthropic/OpenAI)

**Data:** 2026-06-17
**Repo:** `chatfunnel-front`
**Status:** Design aprovado — pronto para plano de implementação

## Problema

Ao acessar a página `IntelligenceV2View.vue`, é preciso verificar se o usuário tem
 alguma chave de API cadastrada (Anthropic **ou** OpenAI). Caso não tenha nenhuma,
um modal deve abrir para que ele cadastre uma das duas. O IntelligenceV2 roda sobre
Claude, mas qualquer uma das duas chaves satisfaz a verificação.

## Decisões

| Tema | Decisão |
|------|---------|
| Provedor oferecido | Chooser **Anthropic OU OpenAI** (usuário escolhe qual cadastrar) |
| Bloqueio | **Bloqueante estrito** — sem X, sem clique-fora, sem Esc |
| Base do modal | `DialogControl` (shadcn) com nova prop `hideClose` + `closeOnOverlay=false` + `closeOnEscape=false` |
| Validação OpenAI | Apenas prefixo `sk-` (cobre `sk-`, `sk-proj-`, etc.) |
| Validação Anthropic | Prefixo `sk-ant-` (igual ao `ConfigureClaude.vue` existente) |
| Legado | **Não tocar** no `ConfigureOpenai.vue` (Vuetify). Criar componente novo. |

### Nova prop `hideClose` no `DialogControl`

Hoje o `DialogControl` sempre renderiza o `<DialogClose/>` (X) no header, sem prop
para ocultá-lo. Vamos adicionar uma prop `hideClose?: boolean` (default `false`) que
condiciona o render do `<DialogClose/>` (`v-if="!hideClose"`). Mudança
retrocompatível: com o default `false`, o comportamento atual de todos os consumidores
é preservado. Com `hideClose` + `closeOnOverlay=false` + `closeOnEscape=false`, o
modal fica **totalmente bloqueado** (sem nenhuma saída além de cadastrar a chave).

## Fatos do código (verificados)

- **Estado da conta** (`authStore.account`, store legado JS): expõe
  `hasAnthropic: boolean`, `anthropicKey: string`, `hasOpenAI: boolean`,
  `openaiKey: string`. **Atenção ao casing:** `hasAnthropic` vs `hasOpenAI`.
- **Services** (`@/common/services` → `AccountsService`):
  - `updateAnthropic(key)` → `NestApi.post('/organizations/anthropic_key', { apiKey })`
  - `updateOpenAI(key)` → `Api.post('/accounts/openai/key', { apiKey })`
- **`refreshToken()`** (`@/common/utils/helpers`): atualiza o token e o
  `authStore.account` reativamente — é o que faz `hasAnthropic`/`hasOpenAI` virarem
  `true` após salvar (padrão já usado em `ConfigureClaude.vue:183`).
- **Referência de modal limpo:** `ConfigureClaude.vue`
  (`views/configuration/integrations/components/`) — `DialogControl` + `VeeInput`
  + Zod + `refreshToken`. Reaproveitar o padrão visual e de save.
- **Brands:** `@/assets/brands/claude.png` (existe). Imagem OpenAI:
  `@/assets/images/openai.png` (usada no `ConfigureOpenai.vue` de assistants).

## Arquitetura & Componentes

### 0. Prop `hideClose` no `DialogControl.vue`
`src/components/ui/dialog/DialogControl.vue`

- Adicionar `hideClose?: boolean` à interface `Props`, com default `false` em
  `withDefaults`.
- No template, trocar `<DialogClose/>` por `<DialogClose v-if="!hideClose"/>`.
- Retrocompatível: nenhum consumidor existente passa a prop → comportamento inalterado.

### 1. Composable `useProviderKeyGate.ts`
`src/views/intelligenceV2/composables/useProviderKeyGate.ts`

- Lê `authStore.account` reativo.
- `hasProviderKey = computed(() => !!(account?.hasAnthropic || account?.hasOpenAI))`.
- Expõe:
  - `isGateOpen: Ref<boolean>`
  - `checkGate()`: se `!hasProviderKey.value`, seta `isGateOpen = true`.
- `watch(hasProviderKey)`: quando vira `true`, seta `isGateOpen = false` (fecha o
  modal automaticamente após o save + `refreshToken`).

### 2. Componente `ProviderKeySetupModal.vue`
`src/views/intelligenceV2/components/setup/ProviderKeySetupModal.vue`

- Base: `DialogControl` com `hide-close`, `:close-on-overlay="false"` e
  `:close-on-escape="false"`, `v-model:open` → totalmente bloqueado.
- Estado interno `step: 'choose' | 'form'` e `provider: 'anthropic' | 'openai' | null`.
- **Passo `choose`:** dois cards clicáveis (Anthropic / OpenAI) com a brand de cada;
  selecionar define `provider` e vai para `form`.
- **Passo `form`:**
  - `VeeInput` com toggle show/hide (padrão do `ConfigureClaude.vue`).
  - Validação Zod condicionada ao `provider`:
    - `anthropic`: `.trim().min(1).startsWith('sk-ant-', ...)`
    - `openai`: `.trim().min(1).startsWith('sk-', ...)`
  - Botão "Voltar" → volta para `choose`.
  - Botão "Salvar chave" → chama `AccountsService.updateAnthropic|updateOpenAI`
    conforme `provider`, depois `await refreshToken()`.
- Sem `try/catch` local: o interceptor Axios global trata o erro/toast. Usar apenas
  `finally` para resetar `isSaving`.
- Não há estado de sucesso persistente: o gate fecha sozinho via watch do composable
  quando `hasProviderKey` vira `true`.

### 3. Wiring em `IntelligenceV2View.vue`
- Importar `useProviderKeyGate` e `ProviderKeySetupModal`.
- No `onMounted`, após `await loadConversations()`, chamar `checkGate()`.
- No template, adicionar `<ProviderKeySetupModal v-model:open="isGateOpen" />`.

## Fluxo de dados

```
onMounted → loadConversations() → checkGate()
   └ hasProviderKey == false → isGateOpen = true
        → usuário escolhe provedor (choose → form)
        → preenche chave → Salvar
        → AccountsService.update{Anthropic|OpenAI}(key)
        → await refreshToken()
        → authStore.account atualiza → hasProviderKey == true
        → watch fecha o gate → chat liberado
```

## Erros & edge cases

- **Falha no save:** interceptor Axios global exibe o toast; sem catch local
  (apenas `finally` reseta `isSaving`).
- **Conta já tem uma das chaves:** `checkGate()` não abre o modal.
- **Sem chave + tentativa de uso do chat:** overlay do modal bloqueia totalmente
  (sem X, sem clique-fora, sem Esc) — única saída é cadastrar a chave.
- **Casing:** sempre `hasOpenAI` (não `hasOpenai`) ao ler do account.

## Conformidade com CLAUDE.md (front)

- `<script setup lang="ts">`, ordem `<template>` → `<script>` → `<style>`.
- Componentes `ui/` (shadcn): `DialogControl`, `VeeInput`, `Button`.
- Tokens de escala (`bg-gray-100`, `text-gray-1000`, `bg-brand-500`...) — nunca
  semânticos nem hex hardcoded.
- pt-BR acentuado em todas as strings user-facing.
- Sem catch redundante (interceptor global).

## Testes

- `DialogControl`: com `hideClose`, o `<DialogClose/>` não é renderizado; sem a prop
  (default), continua renderizando (retrocompatibilidade).
- `useProviderKeyGate.spec.ts`:
  - abre o gate quando `hasAnthropic` e `hasOpenAI` são `false`;
  - permanece fechado quando uma das chaves existe;
  - fecha o gate quando `hasProviderKey` passa de `false` → `true`.
- `ProviderKeySetupModal.spec.ts`:
  - render do passo `choose` com os dois provedores;
  - navegação `choose → form → voltar`;
  - validação de prefixo (`sk-ant-` para Anthropic, `sk-` para OpenAI);
  - chama o service correto conforme o provedor selecionado.

## Fora de escopo

- Refatorar/substituir os `ConfigureOpenai.vue` legados (Vuetify).
- Alterar endpoints de backend.
