---
title: ADR-001 — Migrar UI para shadcn-vue + Tailwind v4
tags: [decisions, adr, frontend, design-system]
date: 2026-04-05
status: active
related: ["[[livechat]]", "[[crm-kanban]]"]
---

# ADR-001: Migrar UI para shadcn-vue + Tailwind v4

## Contexto

O frontend usava Vuetify 3 e PrimeVue 3 como libs de componentes. Ambas sao opinadas, pesadas, e dificultar customizacao profunda. O design system precisava de mais controle sobre tokens, variantes e acessibilidade.

## Decisao

Adotar **shadcn-vue** (baseado em Reka UI) + **Tailwind CSS v4** + **CVA** como novo design system. Componentes base em `src/components/ui/`. Vuetify e PrimeVue permanecem como legacy — nao usar em codigo novo.

## Alternativas consideradas

- **Continuar com Vuetify** — descartado por falta de controle fino sobre tokens e dificuldade de customizacao
- **PrimeVue 4** — descartado por lock-in no ecossistema Prime e peso do bundle
- **Headless UI puro (Reka UI direto)** — descartado por falta de componentes pre-estilizados; shadcn-vue oferece o melhor dos dois mundos

## Consequencias

- **Positivas:** Controle total sobre design tokens (OKLCH), componentes acessiveis via Reka UI, CVA para variantes tipadas, bundle menor
- **Negativas:** Migracao gradual — dois sistemas coexistem (legacy Vuetify/PrimeVue + novo shadcn-vue), aumenta complexidade temporariamente
- **Regra:** NEVER usar Vuetify ou PrimeVue em codigo novo
