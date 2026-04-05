---
title: Frontend Layer (Vue 3)
description: Referencia tecnica do frontend Vue 3 — componentes, Pinia, services, composables, routing, forms, Socket.IO, design tokens.
tags: [layers, frontend, vue, tailwind, shadcn, pinia]
related: ["[[api-layer]]", "[[services-layer]]", "[[core-layer]]"]
last_updated: 2026-04-05
---

# Frontend Layer (Vue 3)

Dashboard do ChatFunnel. **Vue 3 + Vite + TypeScript**, porta 5173. PWA com service worker.

## Estrutura

```
src/
  views/             # 18+ modulos de pagina (livechat, crm, agents, etc.)
  components/
    ui/              # shadcn-vue (Reka UI) — PREFERIR para codigo novo
    shadcn-custom/   # Customizados sobre shadcn (ex: SystemBar)
    v2/              # Componentes custom v2 — evitar, migrar
    [dominio]/       # Legacy (Vuetify/PrimeVue) — NAO usar
  common/
    services/        # Camada HTTP (21 services estaticos)
    composables/     # Composables compartilhados (.js)
    api/             # Instancias Axios (Api :3001, NestApi :3200)
    models/          # TypeScript interfaces
    enums/           # Enums do dominio
    utils/           # cn(), event-bus, masks, helpers
  stores/            # Pinia stores (auth, design, theme) — .js
  assets/tailwind/   # Design tokens (OKLCH, tipografia, shadows)
  router/            # Vue Router config
  i18n/              # Internacionalizacao (pt-BR)
```

## Hierarquia de Componentes

```
Prioridade de uso (codigo novo → legacy):

1. src/components/ui/          ← shadcn-vue — USAR SEMPRE
2. src/components/shadcn-custom/ ← Customizados — quando necessario
3. src/components/v2/          ← Custom v2 — evitar, migrar
4. src/components/[dominio]/   ← Legacy — NAO usar
```

Arquitetura de camadas de um componente UI:

```
VeeInput, VeeSelect...    ← Validacao (vee-validate + Zod)
Input, Select, Button...  ← Visual (src/components/ui/)
Reka UI primitives        ← Primitiva (acessibilidade)
```

## Services (Camada HTTP)

21 services em `src/common/services/` — objetos com metodos estaticos. Import via `@services/`.

- **ALWAYS** usar services — nunca `axios` direto
- Duas instancias Axios: `Api` (Express :3001, [[api-layer]]) e `NestApi` (NestJS :3200, [[services-layer]])

## Pinia Stores

Stores em `src/stores/` (arquivos `.js`, legacy):

| Store | Proposito |
|-------|-----------|
| `auth` | Token, permissions |
| `design` | UI state |
| `theme` | Dark/light mode |

Usa `pinia-plugin-persistedstate` para persistencia.

## Composables

Logica reutilizavel em `src/common/composables/` (`.js`). Convencao: `use*()`.

## Routing

Vue Router em `src/router/`. 18+ modulos de views. Cada modulo de pagina fica em `src/views/<dominio>/`.

## Forms (VeeValidate + Zod)

- `vee-validate` para binding de campos e validacao
- `zod` para schemas de validacao
- `@vee-validate/zod` como bridge
- Componentes `Vee*` em `components/ui/` wrappam inputs com validacao

## Socket.IO

`socket.io-client` para real-time — mensagens, livechat, kanban. Conecta ao [[api-layer]] e ao websocket server (porta 10000).

## Design Tokens

Tokens em `src/assets/tailwind/`:

| Arquivo | Conteudo |
|---------|----------|
| `shadcn-vars.css` | CSS vars OKLCH — light/dark, radius, ring |
| `tokens-typography.css` | Font Figtree, pesos 400-700, classes `typo-*` |
| `tokens-shadows.css` | `sombra-1/2/3` — purple-tinted |
| `tailwind.css` | Entry point — importa todos os layers |

## Styling

- **Tailwind CSS v4** via `@tailwindcss/vite` (sem `tailwind.config`)
- `cn()` de `@/common/utils/cn` para merge de classes
- CVA (`class-variance-authority`) para variantes de componentes
- `!` no **final** da classe no Tailwind v4 (`shadow-none!`, nao `!shadow-none`)

## Path Aliases

```
@/         → src/
@services/ → src/common/services/
```

## Testes

- **Vitest** + `@testing-library/vue` — unit tests (happy-dom)
- **Playwright** — E2E tests
- **Storybook 10** — dev de componentes (porta 6006)
