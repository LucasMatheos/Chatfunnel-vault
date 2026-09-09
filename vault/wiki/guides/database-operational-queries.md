---
title: Consultas operacionais do banco
description: Queries SQL reutilizaveis para consultas operacionais no PostgreSQL.
tags: [database, sql, operations, accounts]
related: ["[[chatfunnel-core]]", "[[database-architecture]]", "[[chatfunnel-queries-catalog]]"]
last_updated: 2026-07-01
---

# Consultas operacionais do banco

## Contas com plano Pro

Busca contas ativas do plano Pro comercial, armazenado no campo `Accounts.plan` com o valor `PREMIUM`, incluindo nome e e-mail do usuario proprietario.

```sql
SELECT
  u.email AS "Email Usuario",
  a.name AS "Nome Conta",
  a.email AS "Email Conta",
  a.plan AS "Plano",
  a.idd,
  a.ddd,
  a.phone,
  a."paymentPeriod",
  a."inCanceling"
FROM "Accounts" a
INNER JOIN "Users" u ON u.id = a."userId"
WHERE a.plan = 'PREMIUM'
  AND a."isDeleted" = false
  AND a."isCanceled" = false
  AND u."isDeleted" = false;
```

> `PREMIUM` e diferente dos valores `PRO1000`, `PRO5000` e `PRO10000` definidos no enum `PlansEnum`. Para buscar esses planos tecnicos, o filtro precisa ser alterado explicitamente.

## Exportacao de usuarios cadastrados

Exporta uma linha por usuario cadastrado usando somente a tabela `Users`. Usuarios ativos aparecem primeiro; dentro de cada status, os cadastros com inicio de trial mais recente aparecem primeiro.

```sql
SELECT
  u.name AS "Nome",
  u.email AS "E-mail",
  u.phone AS "Telefone",
  CASE
    WHEN u."subscriptionStatus" = 'CANCELED'
      OR u."isDeleted" = true
    THEN 'Cancelado'
    ELSE 'Ativo'
  END AS "Status",
  u."trialBeginDate" AS "Data de Entrada",
  u."subscriptionStatus"::text AS "Status Detalhado",
  u."paymentPeriod"::text AS "Periodicidade",
  u."trialExpireDate" AS "Fim do Trial",
  u."lastDatePayment" AS "Ultimo Pagamento",
  u."nextDatePayment" AS "Proximo Pagamento",
  u.verified AS "E-mail Verificado",
  u."utmSource" AS "Origem",
  u."utmCampaign" AS "Campanha",
  u.segment AS "Segmento",
  u."companySize" AS "Tamanho da Empresa",
  COALESCE(u.document, u."cpfCnpj") AS "Documento",
  u.id AS "ID do Usuario"
FROM "Users" u
ORDER BY
  CASE
    WHEN u."subscriptionStatus" = 'CANCELED'
      OR u."isDeleted" = true
    THEN 1
    ELSE 0
  END ASC,
  u."trialBeginDate" DESC NULLS LAST;
```

- A consulta inclui usuarios removidos por soft delete e os classifica como cancelados.
- `Users` nao possui o campo de plano. O plano pertence a `Accounts` e exige `JOIN`.
- `Users` nao possui `createdAt`; `trialBeginDate` e usado como aproximacao da data de entrada.
- O status resumido considera `TRIALING`, `OVERDUE` e `PAUSED` como ativos. Use `Status Detalhado` para diferencia-los.
- Cada usuario aparece somente uma vez.
