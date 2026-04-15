# Vue 3 Best Practices — Gap Analysis (chatfunnel-front)

**Data**: 2026-04-12
**Base**: `vault/Docs/best-pretices-vue.md` cruzado com estado real do `chatfunnel-front/`

## Stack atual vs recomendada

| Prática recomendada | Status | Detalhe |
|---|---|---|
| Vue 3.5+ `<script setup lang="ts">` | ✅ Adotado | 3.5.13 |
| Vite | ✅ | 5.2.0 |
| Pinia | ✅ | 2.1.7 + persistedstate |
| Vue Router + lazy loading | ✅ | 100% rotas lazy |
| TypeScript strict + vue-tsc | ✅ | `npm run typecheck` |
| ESLint + eslint-plugin-vue + Prettier | ✅ | Configurado |
| Vitest + Playwright | ✅ | Unit + E2E |
| VueUse | ✅ | core 14.2.1 + components 12.4.0 |
| Services separados da UI | ✅ | 23 services em `common/services/` |
| Base components (shadcn-vue) | ✅ | 22 componentes em `components/ui/` |
| VeeValidate + Zod | ✅ | Forms complexos |
| TanStack Query | ❌ | Não adotado |

## Gaps identificados

### 1. TanStack Query (Vue Query) — server state separado de client state

**Problema**: Pinia usado como cache de API (anti-pattern descrito na seção 7 do doc). `auth.store.js` (10.8KB) mistura token, userData, permissions, organizationData.

**Recomendação**: Adotar TanStack Query para server state em features novas. Cache automático, invalidação, background refetch, loading/error states de graça. Manter Pinia apenas para client state real (auth token, preferências UI, tema).

**Referência**: Seções 3 e 7 do doc — "separar server state de client state" e "evitar store como cache de API".

### 2. Stores em .js → migrar para .ts

**Problema**: Os 3 stores core (`auth.js`, `design.js`, `theme.js`) são JavaScript puro, sem tipagem.

**Recomendação**: Migrar para `.ts` com interfaces tipadas. Contratos claros entre UI ↔ store ↔ services.

**Referência**: Seção 6 — "TS em stores é quase obrigatório para projetos médios/grandes".

### 3. Organização por feature — parcialmente adotada

**Problema**: views/ organizadas por domínio (18+ módulos), mas composables e stores são centralizados em `common/`. Não há co-locação feature ↔ composables ↔ store ↔ api ↔ types.

**Recomendação**: Para features novas, adotar estrutura co-localizada:
```
features/{feature}/
  components/
  composables/
  store/
  api/
  types/
  index.ts
```

**Referência**: Seção 3 — "organização por feature/domínio em projetos grandes".

### 4. Poucos composables para o tamanho da app

**Problema**: 738 componentes mas apenas ~6 composables identificados. Provavelmente há lógica repetida.

**Candidatos para extração**: `usePermissions`, `usePagination`, `useDebounce`, `useFormState`, `useServerState`, `useWebSocket`, `useTableFilters`, `useSearchParams`.

**Referência**: Seção 2 — "composables são essenciais em apps médios/grandes".

### 5. ESLint preset — subir de essential para recommended

**Problema**: `plugin:vue/vue3-essential` é o preset mínimo. Não pega anti-patterns de naming, casing, props ordering.

**Recomendação**: Subir para `plugin:vue/vue3-strongly-recommended` ou `plugin:vue/vue3-recommended`.

**Referência**: Seção 6 — "calibrar regras para o domínio".

### 6. VueUse — mismatch de versão

**Problema**: `@vueuse/core` 14.2.1 vs `@vueuse/components` 12.4.0 — major version mismatch.

**Recomendação**: Alinhar ambos na mesma major version.

## Priorização

| Prioridade | Ação | Esforço | Retorno |
|---|---|---|---|
| **P0** | Alinhar versão VueUse | Baixo | Estabilidade |
| **P1** | Migrar stores para .ts | Médio | Tipagem, DX |
| **P1** | Subir ESLint preset | Baixo | Qualidade automática |
| **P2** | Adotar TanStack Query em features novas | Médio | Elimina cache manual |
| **P2** | Extrair mais composables das views | Médio | Reuso, testabilidade |
| **P3** | Reorganizar para features/ co-localizadas | Alto | Escala de time |

## Notas

- **Não mexer no legado** (Vuetify, PrimeVue) — migração gradual para shadcn-vue já em andamento
- **Regra V2**: criar versões novas, nunca alterar legacy (ver [[Claude-memory]])
- TanStack Query deve ser avaliado em uma feature piloto antes de adoção ampla
