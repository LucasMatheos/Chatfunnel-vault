# Relatórios V2 — Camada visual premium (fatia Geral)

**Data:** 2026-06-15
**Status:** Design aprovado · pronto para plano de implementação
**Escopo desta entrega:** apenas a aba **Geral** do Relatórios V2, ponta a ponta.

## Problema

A página de relatórios é percebida como "sem vida": gráficos Chart.js crus (linha
fina, fill chapado, uma cor, animação padrão), sem hierarquia visual nem
interação. Não condiz com a visão de produto premium.

## Direção visual aprovada

Síntese validada no companion visual (mockup `premium-synthesis.html`):

- **Faixa de KPIs** no topo — números grandes tabulares + delta vs. período
  anterior + sparkline, em **teal mono** (sem arco-íris).
- **Gráfico-herói** com gradiente suave da brand, glow leve, linha que se
  *desenha* ao carregar, ponto de pico destacado e tooltip escura no hover.
- **Enquadramento editorial** — branco, respiro generoso, divisores finos no
  lugar de cards/bordas pesadas, seletor de período onde fizer sentido.

Princípio: premium se sustenta em 8 abas sem cansar. A "vida" vem de **movimento
+ interação + um único acento**, não de excesso de cor.

## Decisões

1. **Motor de gráficos:** migrar de Chart.js para `@unovis/vue` (já instalado no
   `package.json`, sem uso atual). Declarativo em Vue, com transições, crossfade,
   gradientes e tooltip/crosshair nativos.
2. **Migração drop-in:** reescrever apenas o *miolo* dos primitives, preservando
   props e tipos de `@chatfunnel/contracts`. Abas, services, composables e
   contratos **não mudam**.
3. **Escopo fatiado:** entregar só a aba Geral primeiro (cobre KPIs + barras +
   heatmap + feed), validar a direção com o time, depois propagar primitive a
   primitive. Alinha com o approach fatiado já usado no Reports V2.
4. **Funil fora de escopo:** `FunnelChartV2` usa lib dedicada (`funnel-graph-js`)
   já estilizada com a brand — permanece como está.

## Componentes afetados

| Componente | Mudança |
|---|---|
| `TimeSeriesChart.vue` | `VisXYContainer` + `VisArea` (gradiente brand + glow) + `VisLine` + `VisCrosshair` (tooltip) + draw-in. Mesma prop `data: TimeSeries`. |
| `BarSeriesChart.vue` | `VisGroupedBar` com cantos arredondados e rise-in escalonado. Mesma prop. |
| `SegmentedTimeSeriesChart.vue` | Áreas empilhadas com a paleta semântica existente (won/lost/bot/assistant). |
| `Heatmap.vue` | Mantém ou migra para grid Unovis — decisão no plano (baixo risco). |
| `MetricCard.vue` | Eleva o card: número grande tabular (já existe), delta (já existe) **+ renderizar `sparkline`** (campo já presente no contrato), teal mono. |
| `ReportSection.vue` | Respiro maior, divisores finos, seletor de período `7d/30d/90d` onde aplicável. Skeleton espelha layout. |
| `chart.config.ts` | Vira `chart.theme.ts` — tokens CSS viram config Unovis; helpers de cor (`getBrandColor` etc.) preservados. |
| `FunnelChartV2.vue` | **Sem mudança.** |

## Dados (sem mudança de contrato)

- `MetricCard` (contrato `reports.contracts.ts`) já expõe `delta?: MetricDelta` e
  `sparkline?: number[]`. O front passa a renderizar a sparkline.
- **Dependência de backend:** KPIs só "brilham" se o backend popular `delta` e
  `sparkline`. O front **degrada graciosamente** quando ausentes (sem sparkline,
  sem badge de delta) — não bloqueia a entrega.

## Movimento e acessibilidade

- Draw-in 1.6–1.8s ease-out no mount; hover com crosshair/tooltip.
- Respeitar `prefers-reduced-motion`: sem animação de entrada quando o usuário
  pediu menos movimento.
- Animar apenas `transform`/`opacity` (regra de performance do front).

## Restrições (CLAUDE.md do chatfunnel-front)

- Ordem SFC: `<template>` → `<script>` → `<style>`; `<script setup lang="ts">`.
- Tokens de **escala** (`bg-gray-100`, `text-brand-500`, `text-green-500`) —
  **nunca** semânticos (`bg-card`, `text-foreground`). Semânticos só em `ui/`.
- Sem CSS inline/`<style scoped>` para layout — Tailwind utilities + `cn()`.
- Loading com `Skeleton` espelhando o layout final — nunca spinner.
- Strings user-facing em pt-BR acentuado.
- Legado intacto: nada de quebrar usos de Chart.js fora dos relatórios.

## Riscos

- **Bundle:** Unovis adiciona peso — verificar tree-shaking (importar só os
  módulos usados) no plano.
- **Testes:** os `.spec.ts` dos primitives testam contrato de props (preservado).
  Validar que continuam verdes; ajustar asserts de DOM se necessário.

## Fora de escopo

- Outras 7 abas (Funil, Mensagens, Contatos, Colaboradores, Automações,
  Broadcast, Agendamentos) — propagação posterior.
- `FunnelChartV2` e mudanças de backend/contrato.

## Critérios de sucesso

- Aba Geral renderizada com o motor Unovis: KPIs com sparkline+delta, barras e
  série temporal com gradiente/glow/draw-in/tooltip, dentro das restrições do
  design system.
- `npm run typecheck`, `npm test` e `npm run lint` verdes.
- Chart.js removido dos imports da aba Geral (continua disponível p/ as demais
  até a propagação).
