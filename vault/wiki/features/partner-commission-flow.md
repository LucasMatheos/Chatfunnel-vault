---
title: Fluxo de Vínculo e Comissão de Parceiros
description: Rastreio técnico do ID de parceiro desde a atribuição de afiliado até a transação de comissão no Partnero.
tags: [partners, partnero, payments, stripe, pagarme, commissions]
related: ["[[partners]]", "[[integration-gotchas]]"]
last_updated: 2026-09-02
---

# Fluxo de Vínculo e Comissão de Parceiros

## Regra de IDs

| Campo | Sistema | Significado | Uso correto |
|---|---|---|---|
| `Partners.id` | ChatFunnel | UUID local do parceiro | FK em `Users.partnerId`; busca local por `findById()` |
| `Partners.partnerId` | Partnero | ID externo do parceiro | `createCustomer()` e busca local a partir de payload do Partnero |
| `Users.partnerId` | ChatFunnel | UUID local de `Partners.id` | Identifica o parceiro de um comprador nas recorrências |
| `user.id` | ChatFunnel / Partnero | UUID local do usuário; key do customer remoto | `searchCustomer()` e `createTransaction()` no Partnero |

`Partners.id` e `Partners.partnerId` não são intercambiáveis.

## 1. Atribuição na primeira venda

### Entradas

- Cadastro com afiliado: `modules/users/commands/create_user/handler.ts` chama `createPartnerByAff(user, null, dto.aff, null, null)`.
- Checkout Stripe: `modules/stripe/commands/checkout/handler.ts` chama `createPartnerByAff(user, checkout.identifier, dto.aff, responsePayment?.transactionId, responsePayment?.value)`.

| Arquivo | Classe / função | Responsabilidade nesta etapa |
|---|---|---|
| `chatfunnel-services/src/modules/users/commands/create_user/handler.ts` | `CreateUserHandler.handler()` | Encaminha `dto.aff` no cadastro que cria trial, sem transação inicial. |
| `chatfunnel-services/src/modules/stripe/commands/checkout/handler.ts` | `StripeCheckoutHandler.handler()` | Encaminha `dto.aff`, cupom, ID e valor do pagamento do checkout. |
| `chatfunnel-services/src/core/payment/base.payment.api.ts` | `BasePaymentApi.createPartnerByAff()` | Centraliza a resolução e o vínculo do parceiro. |

### Resolução do parceiro

`BasePaymentApi.createPartnerByAff()` recebe o `aff` e/ou o identificador do checkout:

1. Com `aff`, consulta o Partnero por `searchPartner({ key: aff })`.
2. Usa o ID retornado pelo Partnero para `PartnersRepository.findByPartnerId()`: aqui a busca pelo campo externo é correta.
3. Sem resultado por `aff`, usa o cupom do checkout em `findByCoupon()`.
4. Sem parceiro local, registra `partner not found` e encerra o fluxo sem atribuição.

| Arquivo | Classe / função | Entrada de ID | Saída / responsabilidade |
|---|---|---|---|
| `chatfunnel-services/src/core/payment/base.payment.api.ts` | `BasePaymentApi.createPartnerByAff()` | `aff` e `checkoutIdentifier` | Orquestra as buscas e os efeitos da primeira venda. |
| `chatfunnel-services/src/core/apis/partners.api.ts` | `PartnersAPI.searchPartner()` | `aff` como `key` | Retorna o parceiro remoto, inclusive seu ID externo. |
| `chatfunnel-core/src/repositories/partners.repository.ts` | `PartnersRepository.findByPartnerId()` | ID externo `Partners.partnerId` | Resolve o registro local a partir da resposta do Partnero. |
| `chatfunnel-core/src/repositories/partners.repository.ts` | `PartnersRepository.findByCoupon()` | Identificador do cupom | Alternativa local quando não há parceiro por `aff`. |

### Criação remota, vínculo local e comissão inicial

Com um parceiro local resolvido:

1. `PartnersAPI.createCustomer(user.id, user.name, user.email, partner.partnerId)` cria/vincula o customer remoto. O quarto argumento é o ID externo do Partnero.
2. `UsersRepository.updatePartnerId(user.id, partner.id)` persiste o UUID local no FK `Users.partnerId`.
3. Quando há `paymentId`, `PartnersAPI.createTransaction(user.id, paymentId, value / 100)` cria a transação de comissão da primeira venda no Partnero.

O passo 2 é o vínculo que permite atribuir as recorrências futuras. O fluxo de correção atual troca a escrita equivocada de `partner.partnerId` por `partner.id`.

| Arquivo | Classe / função | ID usado | Responsabilidade |
|---|---|---|---|
| `chatfunnel-services/src/core/apis/partners.api.ts` | `PartnersAPI.createCustomer()` | `partner.partnerId` externo | Cria/vincula o customer remoto. |
| `chatfunnel-core/src/repositories/users.repository.ts` | `UsersRepository.updatePartnerId()` | `partner.id` UUID local | Persiste a FK `Users.partnerId`. |
| `chatfunnel-services/src/core/apis/partners.api.ts` | `PartnersAPI.createTransaction()` | `user.id` como customer key; `paymentId` como transaction key | Cria a comissão inicial. |

## 2. Comissão em cobranças recorrentes

`StripePaymentApi` e `PagarmePaymentApi` verificam se `user.partnerId` está preenchido antes de chamar `BasePaymentApi.createPartnerTransaction()`.

1. O método recebe `user.partnerId`, portanto recebe o UUID local.
2. `PartnersRepository.findById(user.partnerId)` busca `Partners.id`.
3. Se o parceiro existe e está ativo, `PartnersAPI.createTransaction(userId, paymentId, value / 100)` registra a comissão no Partnero.

O fluxo anterior chamava `findByPartnerId(user.partnerId)`, comparando o UUID local com o ID externo e, por isso, nunca encontrava o parceiro.

| Arquivo | Classe / função | ID usado | Responsabilidade |
|---|---|---|---|
| `chatfunnel-services/src/core/payment/stripe.payment.api.ts` | `StripePaymentApi.pay()` | `user.partnerId` | Dispara comissão após pagamento Stripe bem-sucedido. |
| `chatfunnel-services/src/core/payment/pagarme.payment.api.ts` | `PagarmePaymentApi.pay()` | `user.partnerId` | Dispara comissão após pagamento Pagar.me confirmado. |
| `chatfunnel-services/src/core/payment/base.payment.api.ts` | `BasePaymentApi.createPartnerTransaction()` | UUID local | Busca o parceiro local e chama Partnero. |
| `chatfunnel-core/src/repositories/partners.repository.ts` | `PartnersRepository.findById()` | `Partners.id` UUID local | Encontra o parceiro correto para a recorrência. |
| `chatfunnel-services/src/core/apis/partners.api.ts` | `PartnersAPI.createTransaction()` | `userId`, `paymentId`, valor em reais | Registra a comissão remota. |

## 3. Caminho paralelo: webhook Stripe `charge.succeeded`

O webhook também pode registrar comissão diretamente no Partnero:

1. `StripeWebhookHandler.handler()` recebe `charge.succeeded` e chama `handleCreatePartnerTransaction(data.object)`.
2. O handler resolve a assinatura pelo customer Stripe e encontra a conta/usuário local.
3. Consulta o customer Partnero por `searchCustomer({ key: account.user.id })`.
4. Se o customer remoto não existe, registra `Partner customer not found` com `stage: searchCustomer` e retorna sem criar transação.
5. Se existe, cria a transação com `createTransaction(account.user.id, chargeId, amount / 100)`.
6. Se `account.user.partnerId` está vazio, usa `partnerCustomer.partner` (ID externo vindo do Partnero) em `findByPartnerId()` e então conecta o UUID local `partner.id` ao usuário.

Nesse último passo, `findByPartnerId()` é correto porque a entrada vem do Partnero. No fluxo de recorrência da seção 2, a entrada vem de `Users.partnerId`, portanto deve usar `findById()`.

| Arquivo | Classe / função | ID usado | Responsabilidade |
|---|---|---|---|
| `chatfunnel-services/src/modules/stripe/commands/webhook/handler.ts` | `StripeWebhookHandler.handler()` | Evento `charge.succeeded` | Inicia o caminho de comissão pelo webhook. |
| `chatfunnel-services/src/modules/stripe/commands/webhook/handler.ts` | `StripeWebhookHandler.handleCreatePartnerTransaction()` | `charge.customer`, `charge.id`, `account.user.id` | Resolve conta, busca customer e cria transação no Partnero. |
| `chatfunnel-services/src/core/apis/partners.api.ts` | `PartnersAPI.searchCustomer()` | `account.user.id` como key | Verifica se o customer remoto existe. |
| `chatfunnel-services/src/core/apis/partners.api.ts` | `PartnersAPI.createTransaction()` | `account.user.id`, `charge.id` | Registra a comissão do charge Stripe. |
| `chatfunnel-core/src/repositories/partners.repository.ts` | `PartnersRepository.findByPartnerId()` | `partnerCustomer.partner` externo | Converte o parceiro do payload remoto em parceiro local. |
| `chatfunnel-core/src/repositories/users.repository.ts` | `UsersRepository.update()` | `partner.id` UUID local | Vincula localmente um usuário que já tinha customer remoto. |

## Observabilidade e limites atuais

- `BasePaymentApi` registra em Winston JSON no contexto `BasePaymentApi` a ausência de parceiro (`warn`) e falhas da primeira venda/recorrência (`error`), incluindo IDs, valor, erro e stack quando aplicável.
- Na primeira venda, o campo `stage` identifica `resolve-partner`, `create-customer`, `persist-local-link` ou `create-initial-transaction`; os logs não serializam o objeto completo de usuário.
- O webhook Stripe usa o contexto `StripeWebhookHandler` e registra o estágio atual em falhas de busca, customer remoto e transação.
- Customer remoto ausente não é recriado automaticamente: o handler registra e retorna. Isso evita atribuir comissão sem uma origem de parceiro confiável, mas exige investigação/reconciliação separada para históricos.

## Fontes de código

- `chatfunnel-core/prisma/schema.prisma`
- `chatfunnel-core/src/repositories/partners.repository.ts`
- `chatfunnel-services/src/core/payment/base.payment.api.ts`
- `chatfunnel-services/src/core/payment/stripe.payment.api.ts`
- `chatfunnel-services/src/core/payment/pagarme.payment.api.ts`
- `chatfunnel-services/src/modules/stripe/commands/webhook/handler.ts`
