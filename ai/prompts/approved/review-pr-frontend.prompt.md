---
prompt_id: PRM-0002
status: approved
owner: lucas@grupovuk.com.br
purpose: Primeira revisão técnica de PR no chatfunnel-front antes da revisão humana
scope: chatfunnel-front
risk_level: medium
human_review_required: true
last_reviewed_at: 2026-04-23
version: 1
---

# Revisão de PR frontend

## Quando usar
- PR aberto em `chatfunnel-front/` tocando `src/views/`, `src/components/`, stores ou services
- Antes de pedir revisão humana, para pegar os óbvios

## Quando NÃO usar
- PRs de apenas config/lockfile/documentação
- PRs em `chatfunnel-front/src/components/[dominio-legacy]/` sem mudança de comportamento
- Como aprovação final (revisão humana continua obrigatória)

## Contexto obrigatório a carregar
- `chatfunnel-front/CLAUDE.md`
- `chatfunnel-front/.prettierrc.json`
- `chatfunnel-front/components.json`

## Entrada esperada
- Diff do PR (`git diff origin/main...HEAD`)
- Descrição do PR
- Lista de arquivos alterados

## Checklist de revisão (em ordem)

### 1. Padrões do projeto
- [ ] Componentes novos usam `<script setup lang="ts">`
- [ ] Ordem SFC correta: `<template>` → `<script>` → `<style>`
- [ ] Novos componentes em `src/components/ui/` ou `shadcn-custom/`, NÃO em `v2/` ou dominio legacy
- [ ] Nenhum import novo de Vuetify ou PrimeVue
- [ ] Nenhum `<style scoped>` para layout (só Tailwind)
- [ ] Classes Tailwind v4 com `!` no FINAL (`shadow-none!`)

### 2. Inputs e formulários
- [ ] Campos com validação usam `Vee*` (VeeInput, VeeSelect, VeeCheckbox)
- [ ] Campos sem validação usam `InputControl`, nunca `InputRoot` + `Input` separados
- [ ] Schema Zod em arquivo `.ts` separado do `.vue`

### 3. Componentização
- [ ] Componentes >150 linhas foram quebrados com Index Pattern
- [ ] Sub-componentes têm nomes descritivos (não `Header.vue` / `Content.vue` genéricos)
- [ ] `provide/inject` usa `InjectionKey<T>` tipada
- [ ] Props drilling >2 níveis virou composable ou provide/inject

### 4. Dados
- [ ] Chamadas HTTP via `@services/`, nunca `axios` direto
- [ ] Estado global em Pinia, estado de feature em composable
- [ ] Loading usa `Skeleton`, não spinner ou "Carregando..."

### 5. Testes e tipos
- [ ] Arquivos novos são `.ts` (não `.js`)
- [ ] `npm run typecheck` passa
- [ ] Mudanças de lógica têm teste Vitest ao lado

### 6. Gotchas do projeto
- [ ] Nenhum `!important` no formato antigo (`!shadow-none`)
- [ ] Nenhum import cruzado entre `@vueuse/core` e `@vueuse/components`
- [ ] Build output é `dist2/`, não `dist/`

## Saída esperada
Markdown estruturado em 4 seções:
1. **Bloqueadores** — bugs reais, violações de CLAUDE.md que precisam ser corrigidas
2. **Sugestões** — melhorias não-bloqueantes
3. **Lacunas de teste** — cenários não cobertos
4. **Dúvidas** — perguntas ao autor

## NÃO fazer
- Não aprovar o PR
- Não alterar lógica de autenticação, permissões ou multi-tenancy sem flag explícita
- Não especular sobre decisões de produto (deixar para o humano)

## Histórico
- v1 2026-04-23 criação inicial
