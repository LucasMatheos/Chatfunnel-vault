---
title: chatfunnel-front
description: Referencia tecnica do frontend Vue 3 — componentes, Pinia, services, composables, routing, forms, Socket.IO, design tokens.
tags: [repos, frontend, vue, tailwind, shadcn, pinia, tanstack-query]
related: ["[[chatfunnel-api]]", "[[chatfunnel-services]]", "[[chatfunnel-core]]", "[[decisions/008-tanstack-query-pilot-contacts]]", "[[decisions/009-tanstack-query-flow-reference-cache]]", "[[decisions/010-tanstack-query-channels-cache]]"]
last_updated: 2026-08-25
---

# chatfunnel-front

Dashboard do ChatFunnel. **Vue 3 + Vite 6 + TypeScript**, porta 5173. PWA com service worker.

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
Prioridade de uso (codigo novo -> legacy):

1. src/components/ui/          <- shadcn-vue — USAR SEMPRE
2. src/components/shadcn-custom/ <- Customizados — quando necessario
3. src/components/v2/          <- Custom v2 — evitar, migrar
4. src/components/[dominio]/   <- Legacy — NAO usar
```

Arquitetura de camadas de um componente UI:

```
VeeInput, VeeSelect...    <- Validacao (vee-validate + Zod)
Input, Select, Button...  <- Visual (src/components/ui/)
Reka UI primitives        <- Primitiva (acessibilidade)
```

## Services (Camada HTTP)

21 services em `src/common/services/` — objetos com metodos estaticos. Import via `@services/`.

- **ALWAYS** usar services — nunca `axios` direto
- Duas instancias Axios: `Api` (Express :3001, [[chatfunnel-api]]) e `NestApi` (NestJS :3200, [[chatfunnel-services]])

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

## Server State

- `@tanstack/vue-query` gerencia dados remotos em adocao gradual; Pinia permanece para estado de cliente.
- As consultas usam `queryKey` com `accountSelected` para isolar o cache entre contas.
- Views continuam consumindo `src/common/services/`; nao chamam Axios diretamente.
- O piloto de contatos usa `keepPreviousData` para o cache e skeleton em cada busca ativa da tabela, incluindo paginação e refetch.
- O Flow reutiliza tags, campos personalizados e detalhes de automação/pipeline via `src/views/automations/composables/useAutomationReferenceQueries.ts`, com `staleTime` de cinco minutos.
- A lista `organizations/channels` é compartilhada entre features por `src/common/composables/useChannelsQuery.ts`, com key por conta e `staleTime` de cinco minutos.
- Mutações de canais invalidam `organizations/channels/{accountId}` antes de qualquer recarga dependente.
- A criação de tag no Flow atualiza a query de tags em cache; futuras mutações de referência devem invalidar a key do domínio.
- Mutações invalidam a chave de dominio correspondente. Veja [[decisions/008-tanstack-query-pilot-contacts]].

## Routing

Vue Router em `src/router/`. 18+ modulos de views. Cada modulo de pagina fica em `src/views/<dominio>/`.

### Dashboard

- `/dashboard` renderiza `src/views/dashboardV2/DashboardV2View.vue`.
- O Dashboard v2 reutiliza primitivos e explicacoes de [[reports-v2-front-arquitetura]].
- `FrameScreen` aplica layout sem padding pela rota `DashboardView`.

## Forms (VeeValidate + Zod)

- `vee-validate` para binding de campos e validacao
- `zod` para schemas de validacao
- `@vee-validate/zod` como bridge
- Componentes `Vee*` em `components/ui/` wrappam inputs com validacao

## Socket.IO

`socket.io-client` para real-time — mensagens, livechat, kanban. Conecta ao [[chatfunnel-api]] e ao [[chatfunnel-websocket]] (porta 10000).

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
@/         -> src/
@services/ -> src/common/services/
```

## Testes

- **Vitest** + `@testing-library/vue` — unit tests (happy-dom)
- **Playwright** — E2E tests
- **Storybook 10** — dev de componentes (porta 6006)

## Devtools

- `@tanstack/vue-query-devtools` e carregado dinamicamente em `src/App.vue` apenas em desenvolvimento; abre com as query keys, estados e dados em cache.
- TanStack Devtools e os plugins Vite sao dependencias de desenvolvimento; o shell e montado uma vez em `src/App.vue`.
- Os paineis `Pinia State` e `ChatFunnel Runtime` recebem eventos tipados de `src/devtools/client.ts`; eles exibem nomes de stores, chaves de estado, rota e flags permitidas de autenticacao, tema e carregamento, sem valores sensiveis.
- O plugin Vite mantem `removeDevtoolsOnBuild: true`.
- **Limitacao em 2026-08-21:** `@tanstack/devtools-vite@0.8.5` injeta source attributes apenas em JSX e nao reconhece `createApp()` como entry para console piping. No frontend Vue atual, essas duas capacidades aguardam suporte upstream ou adaptacao especifica.

## Gotchas

- Build output e `dist2/` (nao `dist/`)
- PWA cache (vite-plugin-pwa) pode servir conteudo antigo em dev

Veja tambem: [[infrastructure-gotchas]], [[integration-gotchas]]
