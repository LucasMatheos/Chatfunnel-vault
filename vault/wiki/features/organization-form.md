---
title: Organization Form (Criar Organizacao)
description: Wizard de criacao de nova organizacao — fluxo, steps, selecao de plano, integracao Stripe
tags: [feature, organization, billing, stripe, wizard]
related: ["[[crm-kanban]]", "[[channels]]"]
last_updated: 2026-04-06
---

# Organization Form

Wizard para criacao de nova organizacao. Acessado via card "Nova organizacao" na tela de selecao de orgs.

## Status

- **Legado:** `OrganizationForm/index.vue` — Vuetify, dialog 90%, 5 steps (maioria morto)
- **Novo (em design):** Spec em `docs/superpowers/specs/2026-04-06-organization-form-design.md`

## Fluxo (novo design)

### Step 1 — Dados

- Nome (obrigatorio), descricao (opcional), avatar (upload imagem)
- Mesma estrutura do `EditOrgDialog.vue`
- Founder member: pula Step 2, cria org direto

### Step 2 — Selecao de plano

- 4 plan cards Notion-style lado-a-lado
- Pattern "Tudo do X, mais:" para features incrementais
- Advanced destacado com badge "Mais escolhido"
- Period toggle (Mensal / Trimestral / Semestral / Anual)
- Lead quantity selector (tier de contatos)
- Link "Comparar todos os planos" abre modal nested com tabela categorizada

### Checkout

- Selecionar plano → `OrganizationService.createCheckoutSession()`
- Redirect para Stripe Checkout (externo)
- Retorno: valida sessao → cria org → sucesso

## Decisoes de design

| Decisao | Escolha | Motivo |
|---------|---------|--------|
| Dialog | Custom `max-w-[1100px]` | Acomoda 4 cards; `xl` (900px) estreito demais |
| Stepper | `StepperControl` horizontal | Padrao industria SaaS; ja existe no DS |
| Steps | 2 reais (Dados + Plano) | Loading/sucesso sao estados, nao steps |
| Plan cards | Notion-style | Pesquisa: Linear, Notion, Vercel, GitHub, Figma, Intercom |
| Comparacao | Modal nested sobre dialog | Nao polui o dialog principal |

## Componentes

```
OrganizationForm/
├── index.vue               # Dialog + stepper + step routing
├── components/
│   ├── OrgDataStep.vue     # Step 1: form dados
│   ├── PlanStep.vue        # Step 2: plan cards
│   ├── PlanCard.vue        # Card individual
│   └── PlanCompareDialog.vue  # Modal comparacao
└── composables/
    └── useCreateOrg.ts     # Estado + logica
```

## Arquivos relacionados

- `src/layout/OrganizationsLayout/index.vue` — layout pai, chama `showDialog()`
- `src/layout/OrganizationsLayout/components/EditOrgDialog.vue` — referencia visual
- `src/common/services/OrganizationService.js` — `createOrganization`, `createCheckoutSession`
- `src/common/enums/PlansEnum.js` — dados de planos e precos
- `src/components/ui/stepper/` — componente stepper do DS

## Tasks pendentes

- [ ] **Revisar pricing anual vs semestral no PlansEnum** — Advanced 5K: semestral R$ 3.997 (R$ 666/mês = 33%) e anual R$ 7.970 (R$ 664/mês = 33%) tem praticamente o mesmo desconto. Anual deveria ter desconto maior para incentivar compromisso de 12 meses. Verificar com produto/financeiro e ajustar `leadsCost` de todos os planos.
