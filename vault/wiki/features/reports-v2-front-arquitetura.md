---
title: Reports v2 — Arquitetura do Front
description: Arquitetura do front da tela unica de Relatorios V2 no chatfunnel-front. Tela unica com 5 abas fixas (rotas aninhadas), 7 primitivos visuais reutilizaveis, filtros via composable + querystring e Chart.js como unica lib de grafico (Funil e Heatmap custom).
tags: [features, reports, reportsV2, front, vue, arquitetura, plano]
related: ["[[reports-v2-arquitetura]]", "[[contacts-utm-fields]]", "[[intelligence-v2-arquitetura]]", "[[crm-kanban]]", "[[automations]]"]
last_updated: 2026-06-23
status: 45-relatorios-integrados-aguardando-revisao
---

# Reports v2 — Arquitetura do Front

> Contraparte de front do [[reports-v2-arquitetura]] (backend). Define como o `chatfunnel-front` consome o `ReportsV2Module` e estrutura a tela unica de Relatorios.
>
> Cruza:
> - **Escopo por aba** (`docs/superpowers/specs/2026-06-03-relatorios-v2-escopo-por-aba.md`) — objetivo, componentes, metricas e filtros por aba
> - **Plano de implementacao por fatias** (`docs/superpowers/plans/reports-v2/2026-06-03-relatorios-v2-implementacao-por-fatias.md`) — sequencia de execucao por repo
> - **Decisoes de produto** (`docs/superpowers/specs/2026-06-03-relatorios-v2-decisoes-e-backlog.md`) — tela unica, 5 abas
>
> **Estado:** branch `feature/reports-v2` ativa em front/services/contracts. No front existe so o legado `src/views/reports/DashboardReport.vue` (intacto). A tela V2 sera criada em `src/views/reportsV2/`.

---

## 1. Principios que ditam a estrutura

1. **Tela unica, 5 abas fixas** — um shell + um componente por aba.
2. **Composicao por poucos primitivos reutilizaveis** — os 7 blocos do spec sao a base; cada aba so *compoe*. E o espelho no front do "engine + catalog" do backend.
3. **Filtros globais + contextuais** — estado de filtro mora em um lugar so (composable), abas leem dele.
4. **Tipos vem do `@chatfunnel/contracts`** — front nunca redeclara shape (`DashboardOverviewResponse`, `TimeSeries`, `HeatmapData`, etc.).
5. **Nao tocar no legado** — `DashboardReport.vue` fica intacto; criar `reportsV2/` (regra V2 suffix, nunca alterar legado).
6. **Sem catch local** — interceptors do Axios tratam erro globalmente; composable so expoe estado.
7. **pt-BR acentuado** em todas as strings user-facing.

---

## 2. Decisoes (definidas em 2026-06-05)

| Tema | Decisao | Por que |
|---|---|---|
| Navegacao entre abas | **Rotas aninhadas** (`children`) | Deep-link por aba, back/forward, alinhado ao padrao das outras views |
| Estado de filtros | **Composable + querystring** (`useReportsFilters`) | Leve, sem store global; filtros sobrevivem via URL e deep-link ja carrega periodo/UTM |
| Lib de graficos | **Chart.js 4 + vue-chartjs 5** (ja instalados), com Funil e Heatmap custom | Uma unica lib de chart; evita plugins mal mantidos |
| Funil MVP sem backend | **Mocks locais no `ReportsV2Service`** para overview, funil, etapas e motivos de perda | Permite evoluir a UX da aba Funil enquanto `/reports/v2/crm/*` ainda nao esta disponivel |
| Shape temporario de tabela | **`ComparisonTableData` fica em tipos UI locais** ate o contrato definitivo existir | `@chatfunnel/contracts` ainda tem `FunnelData` basico e `Ranking`, mas nao tem `ComparisonTable` nem absoluto/relativo formal |

---

## 3. Lib de graficos: Chart.js + 2 custom

`chart.js@4.4.1` e `vue-chartjs@5.3.2` ja estao no `package.json` e **sem uso ainda** no codigo.

Cobertura contra os 7 primitivos:

| Primitivo | Chart.js | Abordagem |
|---|---|---|
| `TimeSeriesChart` | ✅ Excelente | `<Line>` canvas, performatico com milhares de pontos |
| `MetricCard` (sparkline) | ✅ | mini-line opcional dentro do card |
| `RankingList` | CSS | barras em CSS puro — mais leve/bonito que chart |
| `ComparisonTable` | — | tabela |
| `EventFeed` | — | lista |
| `Heatmap` (hora x dia) | ⚠️ nao-nativo | **CSS Grid 24x7** custom (~40 linhas) em vez de `chartjs-chart-matrix` |
| `FunnelChart` | ⚠️ nao-nativo | **SVG/CSS custom** — aba core, precisa de visao absoluta + relativa |

**Regra:** Chart.js para tudo que e serie/barra; Funil e Heatmap como componentes custom enxutos. Sem dependencia nova. Defaults do Chart.js sao sem graca — aplicar brand tokens uma vez em `charts/chart.config.ts` (cores, fonte, grid, tooltip) e todos herdam.

---

## 4. Estrutura de pastas

```
chatfunnel-front/src/views/reportsV2/
├── ReportsV2View.vue                  # shell: header + <ReportsFilterBar> + <router-view> (abas como children)
│
├── tabs/                              # cada uma e uma rota child de /reports
│   ├── GeralTab.vue
│   ├── AutomacoesTab.vue
│   ├── FunilTab.vue
│   ├── AgendamentosTab.vue            # empty-state ate a Fatia 6
│   └── ColaboradoresTab.vue
│
├── components/
│   ├── primitives/                    # os 7 blocos do spec — burros, props tipadas
│   │   ├── MetricCard.vue
│   │   ├── TimeSeriesChart.vue        # vue-chartjs <Line>
│   │   ├── RankingList.vue            # CSS (barras)
│   │   ├── Heatmap.vue                # CSS Grid 24x7 custom
│   │   ├── FunnelChart.vue            # SVG/CSS custom
│   │   ├── EventFeed.vue
│   │   └── ComparisonTable.vue
│   ├── filters/
│   │   ├── ReportsFilterBar.vue       # periodo + origem + utm* (global)
│   │   └── ContextFilter.vue          # canal/funil/agente/automacao (por aba)
│   └── shared/
│       ├── ReportSection.vue          # titulo + slots loading/erro/empty
│       └── ReportSkeleton.vue
│
├── composables/
│   ├── useReportsFilters.ts           # estado dos filtros + sync querystring
│   └── useReportQuery.ts              # fetch generico → {data, loading, error}
│
├── api/
│   └── reportsV2.api.ts               # NestApi → /nest/reports/v2/*, tipado via @chatfunnel/contracts
│
├── charts/
│   └── chart.config.ts                # registro Chart.js + tema brand global (1 lugar)
│
├── types/
│   └── reportsV2.ui.ts                # tipos so-de-UI (TabKey etc.); dados vem dos contracts
│
└── routes.ts                          # /reports com children: geral|automacoes|funil|agendamentos|colaboradores
```

---

## 5. Camadas e fluxo de dados

```
ReportsV2View (shell)
  ├─ ReportsFilterBar ──► useReportsFilters (estado unico de filtros, sync querystring)
  └─ <router-view> (aba ativa)
        ├─ le filtros do composable
        ├─ useReportQuery(reportsV2.api.getX, params)
        │     └─ reportsV2.api ──► NestApi ──► GET /nest/reports/v2/...
        │            └─ tipo de retorno = z.infer do @chatfunnel/contracts
        └─ passa data para os primitives (MetricCard, FunnelChart, ...)
```

**Decisoes-chave embutidas:**

- **Abas finas, primitivos burros.** Toda logica de fetch/transform fica em composables; a aba so orquestra e o primitivo so renderiza.
- **`useReportQuery` unico** evita repetir loading/error em cada aba (respeita "sem catch redundante" — erro borbulha pro interceptor).
- **Filtros centralizados** em `useReportsFilters` (sync querystring) para troca de aba preservar periodo/origem/UTM.
- **Contracts como fonte de verdade de tipos.**
- **Agendamentos como empty-state** ate a Fatia 6 (status `COMPARECEU`/`NO_SHOW` no schema — ver [[contacts-utm-fields]] e secao 11.3 de [[reports-v2-arquitetura]]).

---

## 6. Roteamento

```
/reports                → redirect /reports/geral
/reports/geral          → GeralTab
/reports/funil          → FunilTab
/reports/automacoes     → AutomacoesTab
/reports/agendamentos   → AgendamentosTab
/reports/colaboradores  → ColaboradoresTab
```

`ReportsV2View.vue` segura o filtro global e o `<router-view>`; cada child le os filtros via `useReportsFilters` (que vivem na querystring, entao deep-link ja carrega periodo/UTM corretos).

---

## 7. Filtros (do spec — secao 2.2 do escopo por aba)

**Globais:** periodo, origem, `utmSource`, `utmMedium`, `utmCampaign`.

**Contextuais por aba:** funil selecionado, agente/colaborador, canal, automacao.

> Dependencia: filtros por origem/UTM dependem da propagacao dos campos UTM em core/api/front — ver [[contacts-utm-fields]]. Entra como Fatia 5 (cross-repo).

---

## 8. Mapeamento com o plano por fatias

| Fatia | Aba | Componentes front que nascem |
|---|---|---|
| 1 — Dashboard MVP | Geral | shell + tabs + `MetricCard`, `TimeSeriesChart`, `Heatmap` |
| 2 — Funil MVP | Funil | `FunnelChart`, `ComparisonTable` |
| 3 — Automacoes MVP | Flows/Automacoes | `RankingList` (reuso de TimeSeries/cards) |
| 4 — Colaboradores MVP | Agentes/Colaboradores | reuso de Ranking + Comparison |
| 5 — UTM filters | (transversal) | `ReportsFilterBar` ganha origem/UTM |
| 6 — Schedules | Agendamentos | sai do empty-state |

Ordem recomendada (plano): Dashboard → Funil → Automacoes → Colaboradores → UTM filters → Schedules.

---

## 9. Integracao com Intelligence

Tudo que for componente fixo da tela deve reutilizar shapes que possam ser consumidos depois pela Intelligence (secao 2.4 do escopo). Por isso os tipos vivem em `@chatfunnel/contracts` e nao no front — ver [[intelligence-v2-arquitetura]].

---

## 10. Novos relatorios (adendo backend) — plano + status 2026-06-09

> O dev backend mandou `docs/superpowers/plans/reports-v2/RELATORIOS-V2-NOVOS-RELATORIOS.md`: **11 relatorios adicionais** (5 CRM + 6 Contatos/Leads) sobre os 7 ja integrados. Plano de integracao do front: **`docs/superpowers/plans/2026-06-09-reports-v2-novos-relatorios-front.md`**.

**Os 11 (id → payload → primitive):**

| Relatorio | Payload | Render | Aba |
|---|---|---|---|
| `crm.revenue` (receita no tempo, WON/LOST) | `SegmentedTimeSeries` | `SegmentedTimeSeriesChart` (novo) | Funil |
| `crm.sales-velocity` (ciclo) | `AgingData` | `AgingChart` | Funil |
| `crm.stage-time` (tempo medio/etapa, dias) | `Ranking` | `RankingList` (`days`) | Funil |
| `crm.performance-by-seller` (+meta won/lost/winRate) | `Ranking`+`meta` | `ComparisonTable` (+prop `firstColumnLabel`) | Funil |
| `crm.revenue-forecast` (snapshot, sem delta) | `MetricCard` | `MetricCard` | Geral + Funil |
| `contacts.by-channel` / `by-tag` | `Ranking` | `RankingList` | Contatos |
| `contacts.inactivity` (snapshot, 6 faixas) | `AgingData` | `AgingChart` | Contatos |
| `contacts.utm-source` / `utm-medium` / `utm-campaign` | `Ranking` | `RankingList` | Contatos |

**Decisoes fechadas (2026-06-09):**
- **Escala monetaria:** `crm.revenue`, `performance-by-seller`, `revenue-forecast` chegam como `amount` cru (centavos). Front **divide por 100** na borda do service (helper `centavosToReais`, mesma regra de `getRevenueCard`). ⚠️ confirmar com time de dados se os 3 sao mesmo centavos.
- **`performance-by-seller`:** receita por vendedor **visivel para todos** (sem gate por papel nesta entrega).
- **Faseamento:** por primitive → telas (infra, depois telas CRM, depois aba Contatos).
- **Granularidade** de `crm.revenue`: nao enviada (backend auto-default); seletor fica como follow-up.
- **Zero mudanca em `@chatfunnel/contracts`** — os 4 payloads ja existem.

**Lacunas resolvidas / a resolver:**
- Aba **"Contatos / Leads" nao existia** — nasce na Fatia 3 (rota `/reports/contatos` + nav).
- `RankingList` deixou de ser CSS-only teorico: agora e **componente real reutilizavel** que substituiu o markup inline de "Motivos de perda" no `FunilTab` (DRY); suporta `valueFormat` `number|currency|percentage|days` e preserva a ordem recebida (stage-time mantem ordem do funil).

**Status de implementacao:**
- ✅ **Fatia 1 (infra)** — `formatDays`, cores `getGreenColor`/`getRedColor`, `RankingList`, `SegmentedTimeSeriesChart`, whitelist das 11 rotas em `buildReportParams`, 11 metodos no `ReportsV2Service` + `centavosToReais`. **112 testes passando, typecheck sem regressao. Sem commit.**
- ⬜ **Fatia 2 (telas CRM)** — Task 7 (`firstColumnLabel`), Task 8 (4 secoes no `FunilTab`), Task 9 (card previsao na `GeralTab`).
- ⬜ **Fatia 3 (aba Contatos)** — Task 10 (rota+nav+placeholder), Task 11 (6 relatorios).

> Nota: o mapa de fatias da secao 8 acima e do plano ANTIGO (Dashboard→Funil→Automacoes...). Este adendo dos 11 relatorios novos segue o plano proprio de 2026-06-09 (fatias por primitive). Ver tambem [[contacts-utm-fields]] (origem dos campos UTM consumidos por `contacts.utm-*`).

---

## 11. Integracao completa — 27 relatorios novos (2026-06-10)

> Doc do backend: `docs/superpowers/plans/RELATORIOS-V2-COMPLETO.md` (45 relatorios). Plano executado: `docs/superpowers/plans/reports-v2/2026-06-10-reports-v2-front-novos-relatorios.md` (13 tasks, TDD). **Cobertura: 43/45** — `dashboard.metric` e `dashboard.periodic-summary` ficaram fora por decisao (YAGNI).

**Status: implementado, NAO commitado** — branch `feature/reports-v2-novos-relatorios` (criada de `feature/reports-v2`), 28 arquivos na working tree aguardando revisao do usuario (prevista 2026-06-11).

**O que mudou:**
- **8 abas** (rotas `mensagens` e `broadcast` novas): Geral, Funil, Contatos, Mensagens, Automacoes, Broadcast, Agendamentos, Colaboradores.
- Aba **Geral** consome `dashboard.summary` real (fim do `mockDashboard`); labels pt-BR via `DASHBOARD_CARD_LABELS`. So restam mockados overview/stage-counts do Funil (sem endpoint composto CRM).
- **Whitelist**: 25 endpoints novos em `ReportEndpoint`/`ENDPOINT_OPTIONAL`; UTM agora aceito em `contacts.growth`/`peak-hours`/`by-channel`/`growth-by-source` (testes legados atualizados — comportamento mudou de proposito).
- **Primitivos estendidos**: `formatUsd` (USD cru, NUNCA ÷100 — `agents.cost*`), `Heatmap` com `valueFormat="rate"` (fracao 0..1 do `best-send-time`), `SegmentedTimeSeriesChart` com mapa de cores/labels por segmento (`CONTACT`/`BOT`/`ASSISTANT`/`HUMAN`, `opened`/`closed`, `active`/`cancelled`, `direct`) + paleta por indice.
- **Tokens novos** `--color-yellow-500` (#D9A514) e `--color-blue-500` (#3B82F6) no `@theme` do `shadcn-theme.css` — nao existiam; getters `getYellowColor`/`getBlueColor` no `chart.config.ts`.
- **`useCustomFields`** (novo composable): carrega `/custom_fields`, filtra ids de sistema (prefixo `00000000-0000-0000-0000-`), guarda selecao p/ `contacts.by-custom-field` (query so roda com campo selecionado — evita 400).
- `normalizeCurrencyCard` DRY no service (revenue-card, forecast, dashboard.summary `wonRevenue` — centavos ÷100).

**Verificacao:** 127/127 testes do modulo verdes; suite completa 566 pass / 44 fail **pre-existentes** (provado via `git stash` — falham sem as mudancas); typecheck com 40 erros, todos baseline fora do modulo.

**Pendente (usuario):** smoke manual com services :3200 (receita em reais nao 100×, custos em `US$`, tooltip best-send-time em `%`, sem 400 no console) · confirmar com dev backend que `dashboard.summary.wonRevenue` e mesmo centavos · commits manuais.

---

## 12. Decisao de viz — "Distribuicao por tags" (2026-06-15) — A IMPLEMENTAR

> Pendente do usuario: implementar em **2026-06-16**. Decisao registrada antes da implementacao.

**Contexto:** a secao "Distribuicao por tags" (`contacts.by-tag`, payload `Ranking`) hoje renderiza via `RankingList` dentro de `ReportSection`. Avaliar se um grafico comunica melhor.

**Decisao: barra horizontal ordenada (Top-N + "Outros").** E a evolucao visual natural do `RankingList` — mesmo ranking, com a barra codificando magnitude.

**Por que nao pizza/donut/treemap:** um contato pode ter **varias tags**, entao a soma das contagens excede o total de contatos. Pizza/donut/treemap implicam parte-do-todo (soma = 100%) e **mentiriam** sobre as proporcoes. Barra horizontal mostra magnitude absoluta, sem falsa proporcao. Barra vertical foi descartada porque rotulos de tag sao textuais/variaveis e cortam ou giram 45°.

**Detalhes de implementacao:**
- **Lib = Chart.js** (`<Bar>` com `indexAxis: 'y'`), seguindo a regra do modulo (secao 3) — **NAO Unovis**. ⚠️ Correcao: a recomendacao verbal inicial citou Unovis `VisStackedBar` por engano; o modulo Reports V2 padronizou Chart.js + vue-chartjs.
- **Top-N + "Outros":** tags tem cauda longa — mostrar ~8–12 principais e agrupar o resto em "Outros". Manter o `RankingList` completo acessivel (ex. "ver todas").
- Cor unica `bg-brand-500` (tokens de escala, nao semanticos — ver [[reports-v2-arquitetura]] e memoria de scale tokens).
- Reusar o wrapper `ReportSection` (loading/error/empty) ja existente.
- Tema herda de `charts/chart.config.ts` (1 lugar).

**Quando NAO trocar:** se a secao mora em espaco lateral estreito ou a intencao e so "top tags rapidas", `RankingList` ja basta. A barra vale quando o objetivo e **comparacao visual de magnitude** entre tags.

---

## 13. Referencias

- Backend do modulo: [[reports-v2-arquitetura]]
- Dashboard que reaproveita primitivos e `InfoPopover`: [[dashboard-v2]]
- Escopo por aba: `docs/superpowers/specs/2026-06-03-relatorios-v2-escopo-por-aba.md`
- Plano por fatias: `docs/superpowers/plans/reports-v2/2026-06-03-relatorios-v2-implementacao-por-fatias.md`
- Mapping tecnico por aba: `docs/superpowers/specs/2026-06-03-relatorios-v2-mapping-tecnico-por-aba.md`
- Padroes Vue do projeto: skill `vue-standards`
- Branch ativa: `feature/reports-v2` (front, services, contracts)
- Legado intacto: `chatfunnel-front/src/views/reports/DashboardReport.vue`

## 14. InfoPopover e semantica temporal (2026-06-23)

`InfoPopover` passou a ser usado tambem fora da tela de Reports v2, no [[dashboard-v2]].

**Fonte de verdade:** `chatfunnel-front/src/views/reportsV2/info/reportInfo.ts`.

**Tipos de dado suportados:**

| Tipo | Significado | Label exibida |
|---|---|---|
| `periodo` | Respeita o periodo selecionado nos filtros | Depende do periodo selecionado |
| `estadoAtual` | Snapshot atual, sem dependencia de periodo | Estado atual, nao reage ao filtro de periodo |
| `ultimos30dias` | Janela fixa usada pelo Dashboard v2 | Ultimos 30 dias |

**Decisoes:**

- `tempoReal` foi substituido por `estadoAtual` para evitar confusao com atualizacao em tempo real.
- O badge visual aparece apenas quando `dataType === "estadoAtual"`.
- Icones do popover usam `@phosphor-icons/vue` (`PhInfo`, `PhClock`, `PhCrosshair`).
- Textos explicativos devem ser adicionados em `REPORT_INFO`, nao inline nos cards.
