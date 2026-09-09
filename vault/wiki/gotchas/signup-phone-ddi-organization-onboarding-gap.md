---
title: Signup sem DDI e onboarding sem dados organizacionais
description: O signup salva telefone nacional sem DDI e o onboarding atual nao coleta dados completos da organizacao.
tags: [gotcha, signup, onboarding, phone, organization]
severity: media
related: ["[[onboarding-flow]]", "[[signup-profile-step]]", "[[organization-form]]"]
last_updated: 2026-08-28
---

# Signup sem DDI e onboarding sem dados organizacionais

## O que acontece

- O `ProfileStep.vue` aceita apenas telefone nacional (`(XX) XXXXX-XXXX`) e envia somente os digitos; o DDI nunca e coletado.
- O onboarding V2 e os fluxos legados de criacao coletam apenas nome, descricao e logo da organizacao. Os demais dados exibidos em "Minha Organizacao" nao sao preenchidos nessa jornada.

## Por que

- `ProfileStep.vue` aplica a mascara nacional e remove caracteres nao numericos antes de chamar `PUT /nest/users/perfil_answer`.
- `onboarding-v2/index.vue` persiste apenas `name`, `description` e opcionalmente `file` em `POST /nest/organizations/update`.

## Workaround

- Registros existentes podem ser atualizados em "Meu perfil", que atualmente envia DDI + DDD + numero.
- Dados empresariais podem ser preenchidos em "Minha Organizacao"; essa tela chama `POST /nest/organizations/update_info`.

## Correcao esperada

- Definir o telefone como E.164 no signup, incluindo seletor de pais/DDI e migracao/backfill apenas se aprovado.
- Decidir quais dados empresariais pertencem ao onboarding e incluir os campos no mesmo contrato de "Minha Organizacao".
