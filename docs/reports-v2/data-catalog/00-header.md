# Reports V2 — Catálogo de Dados (aba por aba, gráfico por gráfico)

> Documento gerado a partir do código-fonte (não da spec). Para cada gráfico/card
> descreve: **o que é o dado**, **de onde vem** (tabelas Prisma), **como é o cálculo**
> e **qual a query de origem**. Fiel ao que está implementado — divergências entre
> código e spec estão marcadas explicitamente.

## Como ler este documento

O pipeline de um relatório atravessa três repositórios:

```
chatfunnel-front                     chatfunnel-services            chatfunnel-core
─────────────────                    ───────────────────            ───────────────
Tab .vue  → useReportQuery  ── HTTP ─→ reports.controller  ──→  orchestrator
(seção)     (service)                  reports.service            └─ catalog[id].query(repos, ...)
                                                                       └─ repository.<método>()  ← QUERY real (SQL/Prisma)
                                                                            └─ shaper           ← molda p/ o gráfico
```

- **`id` do report** (ex: `crm.revenue`) mora no *catalog* (`chatfunnel-core/src/reports/catalog/*.catalog.ts`)
  e aponta para (a) um **shaper** (tipo de gráfico) e (b) um **método do repository** (a query).
- **A query real** mora no repository (`chatfunnel-core/src/repositories/reports/*-reports.repository.ts`) —
  `$queryRaw` (SQL cru) ou chamada Prisma.
- **O cálculo** costuma ser dividido: agregação/join no repository + transformação final no **shaper**
  (ver seção "Visão geral" para o que cada shaper espera e produz).
- **As descrições user-facing** vêm de `chatfunnel-front/src/views/reportsV2/info/reportInfo.ts`.
- **Tipo de dado:** `período` reage ao filtro de datas; `estado atual` ignora a data (snapshot de agora);
  `últimos 30 dias` é fixo (superfície DashboardV2).

## Índice

- [Visão geral — arquitetura do pipeline de dados](#visão-geral--arquitetura-do-pipeline-de-dados)
- [Aba Geral](#aba-geral)
- [Aba Funil (CRM)](#aba-funil-crm)
- [Aba Contatos](#aba-contatos)
- [Aba Mensagens](#aba-mensagens)
- [Aba Colaboradores](#aba-colaboradores)
- [Aba Automações](#aba-automações)
- [Aba Broadcast](#aba-broadcast)
- [Aba Agendamentos](#aba-agendamentos)

## Divergências código × spec e gotchas (leia antes)

Achados que os relatórios abaixo detalham por gráfico, resumidos aqui:

1. **`cacheTtl` é hoje só metadado.** Todo o catálogo usa `900s`, mas o `CacheAdapter` chega ao
   orchestrator e **não é usado** — nenhuma leitura/gravação de cache acontece. O TTL documentado
   em cada card reflete a intenção, não um cache ativo.
2. **Granularidade sempre inferida.** No caminho HTTP, `toReportParams` não repassa
   `granularity`/`limit`/`cursor`; a granularidade é sempre decidida por `pickGranularity` a partir
   do intervalo de datas.
3. **Aba Geral ≠ DashboardV2.** Os arquivos `dashboard.catalog.ts`, `dashboard-reports.repository.ts`
   e `dashboard-periodic.handler.ts` pertencem à superfície **DashboardV2 (janela fixa de 30 dias)** e
   **não alimentam a aba Geral**. A aba Geral monta seus KPIs a partir de 4 endpoints reais
   (`contacts.by-channel`, `crm.funnel-overview`, `schedules.volume`, `intelligence.ai-hours-saved`).
4. **Dinheiro no CRM: divergência centavos × reais.** O backend retorna `amount` como `Int`. **Não há
   `/100` nem `centavosToReais` em `views/reportsV2/`** — `formatMetricValue('currency')` formata o
   `Int` cru como BRL. Se o valor for de fato centavos, a exibição está 100× inflada. Marcado em cada
   card monetário. *(Observação: contradiz a nota de projeto anterior — vale reconferir no runtime.)*
5. **Gráficos implementados mas comentados no template:**
   - **Funil:** o grid do "Resumo do funil" renderiza só 3 dos 8 cards (Ganhos/Perdidos/Receita do
     período); os outros 5 o backend produz mas o front não exibe. `crm.revenue-forecast` está
     consultado mas comentado no template.
   - **Colaboradores:** só 4 seções renderizam; Uso, Resolução, Satisfação, Custo-por-modelo e
     Custo-no-tempo estão prontos ponta-a-ponta mas comentados.
6. **Reports no catálogo mas fora da tela:** `contacts.growth` (R08) e `contacts.peak-hours` (R11)
   existem mas não são renderizados na aba Contatos.
7. **Premissas estimadas:** "Horas economizadas pela IA" usa `MINUTES_SAVED_PER_AI_MESSAGE = 2`
   (constante, a tornar configurável), contando `Messages.from IN ('ASSISTANT','BOT')`.
8. **Custo de IA em USD cru.** `agents.cost`/`agents.cost-by-model` vêm de `LlmUsageLogs.costUsd` em
   dólar, sem conversão — diferente da receita do CRM.
9. **Escopo multi-tenant.** Tabelas sem `accountId` direto (ex: `IGAutomationsExecutions`,
   `KanbanCards`) são escopadas por JOIN na tabela-pai (`IGAutomations`, `Kanbans`). Soft delete
   (`isDeleted`) aplicado nas queries.

---
