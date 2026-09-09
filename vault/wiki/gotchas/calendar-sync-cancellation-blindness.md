---
title: Sync do Google Calendar não reflete cancelamento/exclusão (evento fantasma)
description: Cancelar/deletar evento no Google não remove do banco — a cópia local vira fantasma. Nenhum caminho de sync detecta ausência.
tags: [gotcha, calendar, google-calendar, sync]
severity: alta
related: ["[[calendar]]"]
last_updated: 2026-07-16
---

# Sync do Google Calendar não reflete cancelamento/exclusão

## O que acontece

Eventos do Google ficam copiados no banco (`GoogleCalendarEvents`) pro app não consultar o Google toda hora. Quando um evento é **cancelado/deletado no Google**, a cópia local **não é removida nem marcada `isCancelled`** — continua aparecendo no app indefinidamente (evento fantasma).

Exemplo: agenda com "Reunião A" e "Almoço B" → cancela A no Google → próximo sync recebe só B, salva B, e a linha de A fica intacta no banco (`isCancelled=false`).

## Por que

Todos os caminhos de sync só reagem à **presença**, nunca à **ausência**:

```
para cada evento QUE VEIO do Google: salva no banco
```

Falta a pergunta inversa:

```
para cada evento QUE ESTÁ no banco: ainda existe no Google? não → marca isCancelled
```

O `if (gEvt.status === "cancelled") continue` existe mas é **código morto na prática**: `listEvents` (core `google-calendar-api.service.ts`) usa `singleEvents: true` e **não passa `showDeleted`** (default `false`), então o Google **nem envia** os cancelados na lista — eles somem, não chegam com `status: 'cancelled'`.

Vale pros dois caminhos de import:
- **Backfill:** `chatfunnel-services/src/modules/google_calendars/services/calendar-sync.service.ts` → `importGoogleToLocal` (só cria/atualiza o que veio).
- **Webhook (tempo real):** `@chatfunnel/core` → `HandleWebhookHandler` (re-lista janela [-1d,+30d] e faz upsert do que veio; nunca detecta ausência).

## Workaround / correção recomendada

**Reconciliação por ausência** no `syncAndWatch` (ele já carrega os dois lados — `dbEvents` + `googleEvents`, o webhook do core nem carrega o banco):

```ts
// 4ª fase, após o import
for (const evt of ctx.dbEvents) {
  if (!evt.googleEventId || evt.isCancelled) continue
  if (ctx.googleIdsInGoogle.has(evt.googleEventId)) continue
  await repo.updateById(evt.id, { isCancelled: true }) // sumiu do Google → cancelado
}
```

**Dois guards obrigatórios** (senão vira bug pior — cancela evento válido):

1. **Só quando `googleListSucceeded`** — se a listagem falhou, ausência é sinal falso (cancelaria tudo). Mesma lógica do push.
2. **Só quando a lista NÃO foi truncada** (`googleEvents.length < 250`) — `listEvents` tem `maxResults: 250` sem paginação; acima disso, eventos além do teto parecem ausentes e seriam **falsamente cancelados**. A reconciliação depende de paginar o `listEvents` no core pra valer em agenda de qualquer tamanho.

## Escopo da correção

- **Backfill** (`calendar-sync.service.ts`, repo services): dá pra fazer com segurança com os 2 guards.
- **Webhook** (`HandleWebhookHandler`, `@chatfunnel/core`): mesma cegueira, mas mora no core — corrigir na fonte (não patchar `node_modules/@chatfunnel/core`).
- **Raiz:** paginar `listEvents` no core destrava a reconciliação e conserta o truncamento silencioso dos 250.

## Status

Diagnosticado 2026-07-16, **não corrigido**. Refactor prévio do `calendar-sync.service.ts` (orquestrador + `loadContext`/`pushLocalToGoogle`/`importGoogleToLocal`/`registerWatch`) deixou o ponto de extensão pronto pra 4ª fase de reconciliação.
