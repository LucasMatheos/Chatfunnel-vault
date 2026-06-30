---
title: Dashboard v2
description: Visao geral operacional do ChatFunnel no front, usando os primitivos de Reports v2 e janela fixa dos ultimos 30 dias.
tags: [features, dashboard, front, vue, reportsV2]
related: ["[[reports-v2-front-arquitetura]]", "[[chatfunnel-front]]"]
last_updated: 2026-06-23
status: em-integracao
---

# Dashboard v2

Dashboard operacional em `chatfunnel-front/src/views/dashboardV2/`.

## Estado atual

- A rota principal `/dashboard` agora renderiza `DashboardV2View.vue` diretamente.
- A rota dedicada `dashboardV2Route` deixou de ser registrada em `src/router/index.js`.
- `FrameScreen` trata a rota como `DashboardView` para aplicar layout sem padding.
- A tela comunica explicitamente que os dados exibidos cobrem os **ultimos 30 dias**.

## Estrutura da tela

- `DashboardV2View.vue` orquestra quatro secoes:
  - Indicadores
  - Tendencias
  - Leads e Rankings
  - Atividade
- Cada secao usa `InfoPopover` para explicar contexto e dependencia temporal.
- Os cards e graficos reutilizam primitivos de [[reports-v2-front-arquitetura]]:
  - `MetricCard`
  - `BarSeriesChart`
  - `SegmentedTimeSeriesChart`
  - `ChannelDonut`
  - `Heatmap`
  - `RankingList`
  - `EventFeed`

## Fonte de explicacoes

- O Dashboard reutiliza `chatfunnel-front/src/views/reportsV2/info/reportInfo.ts`.
- Novas chaves `dashboard.*` documentam secoes fixas de ultimos 30 dias.
- Cards individuais usam chaves ja existentes de Reports v2 quando a metrica e compartilhada.

## Regras importantes

- `InfoPopover` agora distingue tres tipos de dado:
  - `periodo`: depende do periodo selecionado.
  - `estadoAtual`: snapshot atual, nao reage ao filtro de periodo.
  - `ultimos30dias`: janela fixa de 30 dias.
- O badge visual aparece apenas para `estadoAtual`.
- Para Dashboard v2, preferir reaproveitar `InfoPopover` e `REPORT_INFO` em vez de criar textos soltos em cada componente.

## Arquivos fonte

- `chatfunnel-front/src/router/index.js`
- `chatfunnel-front/src/layout/components/FrameScreen/index.vue`
- `chatfunnel-front/src/views/dashboardV2/DashboardV2View.vue`
- `chatfunnel-front/src/views/dashboardV2/components/KpiGrid.vue`
- `chatfunnel-front/src/views/reportsV2/info/reportInfo.ts`
- `chatfunnel-front/src/views/reportsV2/components/shared/InfoPopover.vue`
