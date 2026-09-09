---
title: Catalogo de queries — vault/chatfunnel_queries
description: O que cada query da pasta chatfunnel_queries faz — metricas de contas, faturamento, exports CSV e scripts de suporte manual.
tags: [database, sql, operations, accounts, billing, export]
related: ["[[database-operational-queries]]", "[[database-architecture]]"]
last_updated: 2026-08-24
---

# Catalogo de queries — `vault/chatfunnel_queries/`

Pasta com 14 arquivos SQL (sem extensao) usados em operacoes manuais no PostgreSQL de producao: contagem de contas, estimativa de faturamento, exports CSV (via `COPY ... TO STDOUT`) e correcoes pontuais de Stripe.

## Conceitos comuns

Quase todas as queries repetem o mesmo vocabulario de filtros:

- **Conta normal**: `u.isDeleted = false` + `a.isDeleted = false` + `u.isFree = false` + `u.founderMember = false` + `u.typeClient <> 'FOUNDER'`
- **Conta ativa (pagante)**: conta normal + `nextDatePayment > NOW()` + `isCanceled = false` + `inCanceling = false` + `subscriptionStatus = 'ACTIVE'` + `planLeads > 500`
- **Conta em trial**: `trialExpireDate > NOW()` + `planLeads = 500` + `isCanceled = false` — ou seja, **trial e identificado por `planLeads = 500`**, nao por um campo de status
- **Founder**: `u.founderMember = true OR u.typeClient = 'FOUNDER'`; a vigencia usa `Users.nextDatePayment` (nao `Accounts`)
- `planLeads` e `Int?` no Prisma; os literais `'500'` nas queries sao coagidos para inteiro (comparacao numerica, sem risco lexicografico)
- Nomes comerciais dos planos: `STARTER` = lite, `PREMIUM` = pro, `ADVANCED` = advanced

## Metricas de contas (contagens)

| Arquivo | O que conta |
|---------|-------------|
| `canceled_accounts` | Contas normais canceladas nos ultimos 30 dias (`isCanceled = true AND canceledAt > NOW() - 30d`) |
| `in_canceling_accounts` | Contas normais que pediram cancelamento mas ainda estao ativas (`inCanceling = true`, `isCanceled = false`, status `ACTIVE`) |
| `founders_accounts` | Founders ativos — usa so a tabela `Users`, sem JOIN com `Accounts` |
| `relevant_accounts` | "Base relevante": contas normais **ativas** OU **em trial** OU **em cancelamento (ultimos 7 dias)** OU **canceladas (ultimos 7 dias)**, mais founders ativos. E o numero agregado de acompanhamento da base |

## Exports CSV (`COPY ... TO STDOUT WITH CSV HEADER`)

### `active_accounts`
Exporta nome, e-mail e telefone (`idd || ddd || phone`) das contas ativas. Tem um `SELECT COUNT` comentado no topo para virar contagem. **Atencao:** a versao salva esta com filtro extra `plan = 'ADVANCED'` — foi adaptada para um export especifico; remover essa linha para obter todas as contas ativas.

### `trial_accounts`
Exporta contas em trial: nome, e-mail, telefone, data de termino do trial, data de criacao e plano ja traduzido para o nome comercial (pro/lite/advanced).

### `first_payments`
Contas cujo **primeiro pagamento** (`MIN(Payments.datePayment)` por conta) ocorreu a partir de 2026-01-01 e que continuam ativas. Inclui nome/e-mail do parceiro (`Partners` via `Users.partnerId`) — serve para apurar novos clientes e comissao de afiliados. Ajustar a data de corte a cada uso.

### `survey_form`
Exporta as respostas do formulario de onboarding (`Users.surveyForm`, JSON armazenado como texto escapado): limpa as barras invertidas com `regexp_replace`, extrai o array `useCases` como lista separada por virgula e junta com perfil do usuario (documento, `companySize`, `jobTitle`).

### `export_pipe`
Export de oportunidades **perdidas** de um kanban especifico (kanbanId hardcoded) desde 2025-10-01: contato, etapa, data de criacao (ajustada `- INTERVAL '3 hours'` para horario de Brasilia), status traduzido, moderador, motivo/mensagem de perda e todos os comentarios do card agregados com `STRING_AGG` (HTML e entities removidos via regex). Trocar o `kanbanId`, o status e a data conforme o pedido.

## Faturamento

### `faturamento`
Estimativa de receita do mes corrente. CTE agrupa contas ativas por `plan` + `planLeads` + `paymentPeriod` e aplica uma **tabela de precos hardcoded** (STARTER/PREMIUM/ADVANCED x faixa de leads x MONTHLY/QUARTERLY/SEMIANNUAL/YEARLY). Filtra contas com `nextDatePayment` dentro do mes corrente (`> NOW()` e `<= inicio do proximo mes`). Segunda query no mesmo arquivo soma o total geral (mesmo CASE duplicado).

Pontos de atencao:
- Os precos estao **duplicados no arquivo** (CTE + query de total) — ao atualizar preco, atualizar nos dois lugares
- Combinacoes plan/leads/periodo fora da tabela caem no `ELSE 0.00` e somem silenciosamente do faturamento
- A primeira query faz `JOIN "Payments"` (exige ao menos um pagamento); a query de total nao — os numeros podem divergir levemente
- E uma **estimativa por tabela de preco**, nao o valor real cobrado no Stripe

## Analises por conta (IA / templates)

### `terms_consent_records`
Consulta o histórico de consentimentos de `TERMS_OF_USE` e `CONTRACT_TERMS` de uma lista de e-mails. Retorna usuário, documento, ação (`ACCEPTED`, `REJECTED` ou `WITHDRAWN`), data, IP e metadata. Mantém na saída e-mails que não possuem usuário ou registro de aceite; substituir os valores da CTE `clientes` antes de usar.

### `stats`
Bloco de 5 queries sobre agendamentos dos agentes IA (`OpenaiAssistants` + `GoogleCalendarEvents`), com accountId/assistantId e datas hardcoded:
1. Agendamentos por agente de uma conta (com filtro de data)
2. Agendamentos de um agente especifico
3. Listagem de agentes por conta
4. Taxa de conversao: conversas finalizadas pelo assistant (`Conversations.finishedBy = 'ASSISTANT'`) vs agendamentos criados
5. Agendamentos cancelados (`isCancelled = true`)

Ha um TODO no fim: criar flag de **reagendamento** no banco (hoje nao e distinguivel de um novo agendamento).

### `query_osx`
Metricas por template WhatsApp de uma conta especifica: para cada template (`Messages.objMessage->'template'`, tipo `template_v2`), conta envios, respostas do contato apos o envio e eventos de calendario criados apos o envio. **Caveat:** a atribuicao e frouxa — qualquer mensagem/evento do contato **posterior** ao envio conta como engajamento daquele template, entao um mesmo reply/evento pode ser contado para mais de um template enviado antes dele. Bom para ranking relativo, nao para numeros absolutos.

## Scripts de suporte manual (nao sao consultas reutilizaveis)

### `join`
Scratchpad de suporte: lookup de usuario + conta + canais por e-mail, um `UPDATE` de `stripeCustomerId` para um usuario especifico e um `INSERT` de canal comentado. **Contem UPDATE com IDs hardcoded — nunca executar o arquivo inteiro.**

### `update_stripe_subscription`
Template (todo comentado) de `UPDATE "Accounts"` para reativar/corrigir manualmente uma assinatura Stripe: seta `stripeSubscriptionId`, `plan`, `planLeads`, `subscriptionStatus`, `channelsSubscriptionStatus`, `nextDatePayment` e `isCanceled = false` para um account id especifico. Preencher os valores e descomentar a cada uso.

## Regras de uso

- Sao queries de **leitura/operacao manual** direto no banco — os UPDATEs (`join`, `update_stripe_subscription`) sao excecoes pontuais e exigem revisao antes de executar
- Varias tem IDs, datas e filtros hardcoded do ultimo uso — sempre revisar os parametros antes de rodar
- Nao ha filtro `accountId` generico porque sao queries administrativas cross-tenant (rodadas pelo time interno, nao pela aplicacao)
