---
title: Onboarding Flow
description: Jornada do novo usuario desde signup ate o dashboard, com onboarding V2 via chat interativo.
tags: [onboarding, signup, auth, organization, channels]
related: ["[[organization-form]]", "[[channels]]", "[[automations]]", "[[signup-profile-step]]"]
last_updated: 2026-04-13
---

# Onboarding Flow

Jornada completa de um novo usuario no ChatFunnel.

> Guia tecnico detalhado: [[onboarding-flow-guide]]

## Fluxo

```
/signup → /select → /organization-onboarding → Dashboard
```

| Fase | O que acontece | Condicao de saida |
|------|---------------|-------------------|
| Signup | Cria conta, verifica email, preenche perfil ([[signup-profile-step]]) e survey | `currentSignUpStep == "DONE"` |
| Selecao de Org | Lista orgs ou cria nova (com plano via Stripe) | `organizationData.id` existe |
| Onboarding V2 | Chat interativo com 3 milestones | `hasAnsweredInitialForm == true` |
| Dashboard | Acesso livre ao app | — |

## Onboarding V2 — Milestones

| Milestone | O que faz | Pode pular? |
|-----------|----------|-------------|
| Organizacao | Coleta nome, descricao, logo | Nao |
| Canais | Conecta WhatsApp e/ou Instagram via OAuth | Sim |
| Template | Seleciona template de automacao | Sim |

Ao finalizar, o usuario escolhe pra onde ir: Dashboard, Flows, Convidar equipe ou Configurar canais.

## Versoes

- **V2** (atual): Chat interativo em `/organization-onboarding` — UX conversacional
- **V1** (legacy): Stepper vertical em `/organization-onboarding-v1` — mantido como fallback

## Founder Members

Founders pulam a selecao de plano e pagamento Stripe. A criacao da org e direta sem checkout.
