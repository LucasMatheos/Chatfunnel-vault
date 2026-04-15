---
title: Signup ProfileStep
description: Formulario de perfil do signup — nome, telefone, documento, cargo, segmento, tamanho da empresa.
tags: [signup, onboarding, profile, users]
related: ["[[onboarding-flow]]", "[[wiki/repos/chatfunnel-front|chatfunnel-front]]", "[[wiki/repos/chatfunnel-services|chatfunnel-services]]"]
last_updated: 2026-04-13
---

# Signup ProfileStep

Terceiro step do fluxo de signup (depois de Conta e Verificacao). Coleta dados pessoais e profissionais do usuario antes de ir pro dashboard/onboarding.

## Localizacao

- **Componente:** `chatfunnel-front/src/views/auth/components/SignUpSteps/components/ProfileStep.vue`
- **Endpoint:** `PUT /nest/users/perfil_answer`
- **DTO:** `chatfunnel-services/src/modules/users/commands/update_perfil_answer/dto.ts`
- **Handler:** `chatfunnel-services/src/modules/users/commands/update_perfil_answer/handler.ts`
- **Repository:** `chatfunnel-core/src/repositories/users.repository.ts` — metodo `updatePerfilAnswer`

## Campos do formulario

| Campo | Tipo | Obrigatorio | Validacao | Observacoes |
|-------|------|-------------|-----------|-------------|
| `name` | string | sim | `@IsString` | Nome completo |
| `phone` | string | sim | `@IsString @IsOptional` | Mascara `(XX) XXXXX-XXXX`, `phone.replace(/\D/g, "")` antes de enviar |
| `cpfCnpj` | string | sim (se BR) | `@IsString @IsOptional` | Mascara CPF/CNPJ, `.replace(/\D/g, "")` antes de enviar |
| `isForeigner` | boolean | nao | `@IsBoolean @IsOptional` | Se true, `cpfCnpj` vira "Documento internacional" sem mascara |
| `jobTitle` | string enum | sim | `@IsString @IsOptional` | Lista fechada (ver abaixo) |
| `segment` | string | sim | `@IsString @IsOptional @MaxLength(100)` | Enum OU texto livre se "OTHER" |
| `companySize` | string enum | sim | `@IsString @IsOptional` | `MYSELF`, `TWO_TO_TEN`, `ELEVEN_TO_FIFTY`, `FIFTY_PLUS` |

## Enum `jobTitle` (20 valores)

```
OWNER_CEO, PARTNER, CEO_PRESIDENT,
SALES_DIRECTOR, MARKETING_DIRECTOR, OTHER_DIRECTOR,
SALES_MANAGER, MARKETING_MANAGER, OTHER_MANAGER,
SALES_COORDINATOR, MARKETING_COORDINATOR, OTHER_COORDINATOR,
SALES_REP, SALES_ANALYST,
MARKETING, SALES, SUPPORT, DEVELOPER,
STUDENT, OTHER
```

## Enum `segment` (22 valores)

```
AGRIBUSINESS, MARKETING_AGENCY, GENERAL_COMMERCE, CONSULTING_TRAINING,
ECOMMERCE, EDUCATION, ENGINEERING_ARCHITECTURE, EVENTS_ENTERTAINMENT,
FINANCE_ACCOUNTING, GOVERNMENT, INDUSTRY, LEGAL,
DIGITAL_MARKETING, MEDIA_JOURNALISM, HUMAN_RESOURCES, HEALTH_AESTHETICS,
SERVICES, SOFTWARE_SAAS, TELECOMMUNICATIONS, IT_TECHNOLOGY,
RETAIL, OTHER
```

Quando `segment === "OTHER"`, o front exibe um `input-text-v2` livre (maxlength 100) e **o texto digitado sobrescreve `form.segment`** — single source of truth. Backend recebe enum string OU texto livre na mesma coluna `users.segment String?`.

## Fluxo de estado no front

```js
// Single source of truth
form.segment: string | null

// Display flag (nao enviado)
isSegmentOther: boolean

// Computed proxy pro select
segmentSelectValue = isSegmentOther ? "OTHER" : form.segment
// set: se OTHER, seta flag + limpa form.segment; senao desliga flag + salva enum
```

## Side effects do handler

- Se `!user.isFree && cpfCnpj && !isForeigner`:
  - Busca `account` alocada OU `moderatedAccount`
  - Se tem `stripeSubscriptionId`, valida documento com `DocumentHelper` e atualiza `tax_id` no Stripe Customer
- Sempre chama `usersRepository.updatePerfilAnswer()` que seta `perfilFormAnswered: true`

## Seguranca

- `@MaxLength(100)` em `segment` mitiga storage amplification e log poisoning
- `isForeigner` **confia no cliente** — risco documentado: usuario BR pode marcar estrangeiro e pular validacao Stripe. Mitigacao: cruzar com pais do IP no backend (nao implementado)
- `handleSkip` function existe no componente mas nao esta ligado a botao — se for religar, exigir validacao `name.length > 0` no backend
