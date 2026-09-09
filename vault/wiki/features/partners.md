---
title: Sistema de Parceiros (Partnero)
description: Programa de afiliados/revenda do ChatFunnel, integrado com a plataforma externa Partnero (partnero.com) para rastrear comissoes.
tags: [partners, partnero, billing, pagar-me, stripe, webhooks]
related: ["[[integration-gotchas]]"]
last_updated: 2026-08-27
---

# Sistema de Parceiros (Partnero)

ChatFunnel roda um programa de afiliados/revenda usando a plataforma externa
**Partnero** (`partnero.com`) como sistema de registro de parceiros e calculo
de comissao. Nao ha UI propria de "parceiros" no ChatFunnel — o parceiro
gerencia tudo pelo painel do Partnero; o ChatFunnel so alimenta essa
plataforma via API/webhooks quando um cliente indicado paga.

## Onde vive no codigo

| Repo | Gateway de pagamento | Arquivos |
|------|----------------------|----------|
| `chatfunnel-api` | Pagar.me | `src/common/apis/PartnersAPI.js` (client REST p/ `api.partnero.com`), `src/commands/users/PartnerWebhook.js` (recebe webhooks do Partnero), `src/common/jobs/PaymentJob.js` (cron de cobranca recorrente — lanca a comissao), `src/commands/payment/Checkout/handler.js` (primeiro pagamento) |
| `chatfunnel-services` | Stripe | `src/core/apis/partners.api.ts` (mesmo client, versao TS), `src/database/repositories/partners.repository.ts`, `src/modules/stripe/commands/webhook/handler.ts` (reage a `charge.succeeded` / `charge.refunded` / `charge.dispute.created`) |

Ferramenta manual de correcao: `chatfunnel-api/scripts/partnero-cli.js` — CLI
para criar/corrigir clientes e transacoes no Partnero na mao. E o unico
mecanismo de reconciliacao que existe hoje (nao ha job automatico).

Modelo de dados (Prisma, schema fora deste monorepo): tabela `partners` com
`partners.partnerId` (ID no Partnero) e `users.partnerId` (FK vinculando o
cliente ao parceiro que o indicou).

## Fluxo

1. Parceiro se cadastra no Partnero → webhook `partner.created` chega em
   `PartnerWebhook.js`, cria o registro local e o cupom/link de afiliado.
2. Cliente compra via link (`?aff=`) ou cupom de parceiro → no checkout o
   comprador e vinculado ao parceiro: local (`users.partnerId`) e remoto
   (`CreateCustomer` na API do Partnero).
3. A cada pagamento, a comissao e lancada no Partnero — por dois caminhos
   diferentes dependendo do gateway:
   - **Pagar.me** (`PaymentJob.js`, cron de cobranca recorrente): chama
     `CreateTransaction` sem passar a data real do pagamento — a data
     registrada no Partnero e a hora em que o cron rodou, nao a do pagamento.
   - **Stripe** (`stripe/webhook/handler.ts`): faz `searchCustomer` no
     Partnero antes de lancar a transacao. Se o customer nao e encontrado,
     a funcao so da `return` — sem log de erro, sem alerta.

Ver [[integration-gotchas]] para os problemas conhecidos desse fluxo
(comissao que nunca chega, atraso de semanas).
