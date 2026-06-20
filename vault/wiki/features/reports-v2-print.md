---
title: Reports v2 — Relatório Imprimível
description: Feature de impressão/exportação dos relatórios v2 — seleção de abas via modal, impressão total ou parcial.
tags: [feature, reports, front, print, export]
related: ["[[reports-v2-front-arquitetura]]", "[[reports-v2-arquitetura]]"]
status: em-brainstorm
last_updated: 2026-06-09
---

# Reports v2 — Relatório Imprimível

Botão **Imprimir** que gera um relatório printável (HTML → impressão / "Salvar como PDF") com os gráficos das abas de [[reports-v2-front-arquitetura]].

## Decisão — Seleção de escopo

**Opção escolhida: modal com checkboxes de abas.**

Ao clicar em **Imprimir**, abre um modal onde o usuário marca quais abas quer no relatório:

- Geral
- Funil
- Flows / Automações
- Agendamentos
- Agentes / Colaboradores

A partir dessa seleção o usuário consegue gerar:

- **Relatório completo** — todas as abas marcadas.
- **Relatório parcial** — apenas as abas que escolher.

Por padrão, atalhos como "marcar todas" / "desmarcar todas" facilitam o caso geral vs. parcial.

### Por que esta opção

- Dá controle de escopo (parcial vs. completo) sem multiplicar botões na UI.
- Acomoda relatórios sob medida (ex.: só Funil + Agendamentos para uma reunião específica).

### Alternativas descartadas

- **Dois botões fixos** ("aba atual" / "tudo") — mais simples, mas sem escolha granular de abas.
- **Sempre relatório completo** — sem controle de escopo.

## Restrição técnica conhecida

`ReportsV2View.vue` usa `<router-view />`: **apenas a aba ativa fica montada por vez**. Cada aba busca seus próprios dados no `onMounted` via `useReportQuery`, reagindo ao range de datas do `useReportsFilters`.

→ Imprimir abas não-ativas exige **orquestrar a busca de dados das abas selecionadas** antes de renderizar o documento de impressão. Abordagem de implementação ainda em definição.

## Em aberto (brainstorm em andamento)

- Mecanismo de geração (print CSS + `window.print()` vs. documento HTML standalone vs. lib de PDF).
- Layout do documento impresso (cabeçalho com período/logo/timestamp, quebras de página por aba).
- Como orquestrar o fetch das abas não-montadas.
