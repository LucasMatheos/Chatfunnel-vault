---
type: context_pack
description: Resumo compacto do estado atual do projeto — injetado automaticamente no inicio de cada sessao via hook SessionStart.
updated: 2026-04-14
auto_updated: true
---

# Context Pack — ChatFunnel

## Objetivo atual

Migrar UI para shadcn-vue + Tailwind v4 e estabilizar arquitetura do frontend.
Prototipagem do fluxo de pagamento/upgrade em andamento.

## Tarefas ativas

- [ ] Prototipar modal de upgrade (payment flow) — design pencil em andamento
- [ ] Validar skill vue-standards em feature real
- [ ] Alinhar VueUse versions (core 14 vs components 12)
- [ ] Migrar stores .js para .ts (auth, design, theme)
- [x] Campo "Segmento de Atuacao" + roles expandidas no sign-up (ProfileStep.vue + backend DTO + migration)
- [x] Fix DialogForm.vue — enum ADD_CARD removido, fallback para acoes desconhecidas
- [x] Scrollbar do SideBar — cor brand-200, hover brand-100, width 3px
- [x] CRM KanbanColumn — loading no CreateCardModal + confirm delete via showDialogConfirmation (shadcn)
- [ ] Integrar chaves Clarity/Sentry/Amplitude via .env (branch integration/clarity-sentry-amplitude)
- [ ] Custom fields nativos UTM (7 campos no schema, falta: api handler update, core filtros, front CardModal/FilterKanban) — ver [[contacts-utm-fields]]


## Decisoes recentes (ADRs ativos)

- ADR-001: shadcn-vue como design system — `decisions/001-shadcn-vue-design-system.md`
- ADR-002: NestJS services separado — `decisions/002-nestjs-services-separado.md`
- ADR-003: Mastra para agentes IA — `decisions/003-mastra-agentes-ia.md`
- ADR-004: Gateway Go + NATS — `decisions/004-gateway-go-nats.md`
- ADR-005: Multi-tenancy por accountId — `decisions/005-multi-tenancy-accountid.md`
- ADR-006: Prisma shared core — `decisions/006-prisma-shared-core.md`

## Gotchas ativos

- VueUse major mismatch: `@vueuse/core` ~14.2 vs `@vueuse/components` ~12.4
- Stores e services sao `.js` (legacy) — novos DEVEM ser `.ts`
- Build output do front e `dist2/` (nao `dist/`)
- Vuetify/PrimeVue sao legacy — NUNCA usar em codigo novo
- SCSS legacy existe — preferir Tailwind para codigo novo
- Modais de confirmacao: priorizar shadcn (showDialogConfirmation) sobre sweetalert/outros
- Scrollbar em componentes Vue: pseudo-elementos ::-webkit-scrollbar nao funcionam com scoped styles
- InputText maxlength: o componente v2 agora suporta truncamento nativo

## Skills disponiveis

**Projeto ChatFunnel:**
- `vue-standards` — arquitetura Vue (composables, stores, performance)
- `pencil-design` — prototipagem com Pencil.dev
- `brand-guidelines` — cores, tipografia, tokens ChatFunnel
- `obsidian-vault` — navegar e manter o vault
- `dailyvault` — consolidar notas brutas do dia

**Tecnicas gerais:**
- `output-enforcement` — impede outputs truncados e placeholders
- `claude-api` — patterns Anthropic SDK
- `postgresql-table-design` — design de schemas PostgreSQL
- `security-best-practices` — review de seguranca
- `tailwind-design-system` — design systems com Tailwind v4
- `typescript-advanced-types` — tipos avancados TypeScript
- `prompt-engineering-patterns` — tecnicas de prompt engineering

## Navegacao rapida

- Master index: `vault/_index.md`
- Gap analysis Vue: `vault/Docs/vue-gap-analysis.md`
- Repos wiki: `vault/wiki/repos/_index.md`
- Features wiki: `vault/wiki/features/_index.md`
- Guides: `vault/wiki/guides/_index.md`
