# Reports V2 — Implementacao por Fatias

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Executar Relatorios V2 em fatias entregaveis, seguindo a nova direcao de produto: tela unica com 5 abas, foco inicial em `Geral`, `Funil`, `Flows / Automacoes` e `Colaboradores`, sem tentar completar o catalogo inteiro antes da primeira entrega de valor.

**Architecture:** Manter `ReportsV2Module` em `chatfunnel-services` como backend principal, com `engines + catalogo declarativo + specials`. O front consome payloads padronizados do `@chatfunnel/contracts`. Filtros de atribuicao e o dominio de `Agendamentos` entram como fatias separadas, porque dependem de modelagem e gaps cross-repo.

**Tech Stack:**
- `chatfunnel-contracts`: Zod + `z.infer` para shapes compartilhados
- `chatfunnel-services`: NestJS 10 + Prisma + class-validator
- `chatfunnel-front`: Vue 3 + Vite + TypeScript
- `chatfunnel-core`: repositories/filtros compartilhados quando necessario

**Branch base:** `feature/reports-v2`

**Documentos base:**
- `docs/superpowers/specs/2026-05-28-relatorios-v2-arquitetura.md`
- `docs/superpowers/specs/2026-06-03-relatorios-v2-decisoes-e-backlog.md`
- `docs/superpowers/specs/2026-06-03-relatorios-v2-escopo-por-aba.md`
- `docs/superpowers/specs/2026-06-03-relatorios-v2-mapping-tecnico-por-aba.md`
- `vault/wiki/features/reports-v2-arquitetura.md`

---

## Ordem recomendada

1. `Dashboard MVP`
2. `Funil MVP`
3. `Automacoes MVP`
4. `Colaboradores MVP`
5. `UTM filters cross-repo`
6. `Schedules data model`

> `Agendamentos` nao entra antes da Fatia 6 porque hoje a fonte de dados e o status de comparecimento ainda nao estao fechados.

---

## Fatia 1 — Dashboard MVP

**Objetivo:** Entregar a primeira aba navegavel de Relatorios com leitura executiva basica.

**Repos afetados:**
- `chatfunnel-contracts`
- `chatfunnel-services`
- `chatfunnel-front`

**Endpoints:**
- `GET /nest/reports/v2/dashboard/overview`
- `GET /nest/reports/v2/dashboard/leads-series`
- `GET /nest/reports/v2/dashboard/activity-heatmap`

**Contracts:**
- `DashboardOverviewResponse`
- `TimeSeries`
- `HeatmapData`
- opcionalmente `EventFeedItem[]` se o feed de eventos entrar agora

**Back-end (`chatfunnel-services`):**
- [ ] Criar/ajustar controller `dashboard.controller.ts`
- [ ] Adicionar configs de catalog necessarias para `overview`, `leads-series`, `activity-heatmap`
- [ ] Implementar ou compor primitives com `MetricCardEngine`, `TimeSeriesEngine`, `HeatmapEngine`
- [ ] Definir provider/orchestracao para `overview` cross-domain
- [ ] Garantir filtros: `initialDate`, `finalDate`, `channelId?`

**Front (`chatfunnel-front`):**
- [ ] Criar rota da tela de Relatorios
- [ ] Criar shell com tabs fixas
- [ ] Implementar aba `Geral`
- [ ] Consumir `overview`, `leads-series`, `activity-heatmap`
- [ ] Renderizar cards, serie temporal e heatmap com placeholders/loading/erro

**Riscos principais:**
- consolidacao cross-domain no `overview`
- definicao do heatmap: entrada de leads vs mensagens
- shape de eventos recentes, caso tente entrar nesta fatia

**Criterio de aceite:**
- aba `Geral` renderiza dados reais
- endpoints retornam `200`
- cards, serie temporal e heatmap funcionam com filtro de periodo
- sem dependencia da Intelligence

---

## Fatia 2 — Funil MVP

**Objetivo:** Entregar a aba central do produto com leitura absoluta e relativa do funil.

**Repos afetados:**
- `chatfunnel-contracts`
- `chatfunnel-services`
- `chatfunnel-front`

**Endpoints:**
- `GET /nest/reports/v2/crm/funnel-overview`
- `GET /nest/reports/v2/crm/funnel`
- `GET /nest/reports/v2/crm/loss-reasons`
- opcional `GET /nest/reports/v2/crm/stage-counts`

**Contracts:**
- evolucao de `FunnelData` para suportar:
  - `totalEntered`
  - `conversionAbsolute`
  - `conversionRelative`
  - `advancedFromPrevious`
- `Ranking` para motivos de perda
- `MetricCard[]` para KPIs do topo

**Back-end (`chatfunnel-services`):**
- [ ] Evoluir `FunnelEngine`
- [ ] Definir regra de negocio de `entrou no funil`
- [ ] Garantir filtro obrigatorio `pipelineId`
- [ ] Implementar `loss-reasons` via `RankingEngine`
- [ ] Cobrir queries pesadas com indexes previstos no spec base, se necessario

**Front (`chatfunnel-front`):**
- [ ] Implementar aba `Funil`
- [ ] Adicionar seletor de funil
- [ ] Adicionar toggle `Absoluto / Relativo`
- [ ] Renderizar funil visual + KPIs + motivos de perda

**Riscos principais:**
- performance em `KanbanCardsHistory`
- definicao de conversao entre etapas
- consistencia entre absoluto e relativo

**Criterio de aceite:**
- usuario consegue selecionar um funil e um periodo
- funil responde em modo absoluto e relativo
- motivos de perda aparecem no mesmo contexto
- payload e UX suportam futuras comparacoes por atribuicao

---

## Fatia 3 — Automacoes MVP

**Objetivo:** Entregar a aba `Flows / Automacoes` com volume e ranking basicos.

**Repos afetados:**
- `chatfunnel-contracts`
- `chatfunnel-services`
- `chatfunnel-front`

**Endpoints:**
- `GET /nest/reports/v2/automations/overview`
- `GET /nest/reports/v2/automations/executions-series`
- `GET /nest/reports/v2/automations/top`

**Contracts:**
- `MetricCard`
- `TimeSeries`
- `Ranking`

**Back-end (`chatfunnel-services`):**
- [ ] Criar `automations.controller.ts`
- [ ] Popular catalogo com blocos MVP de automacao
- [ ] Reaproveitar `TimeSeriesEngine` e `RankingEngine`
- [ ] Definir se `overview` e endpoint proprio ou mera agregacao de serie + ranking

**Front (`chatfunnel-front`):**
- [ ] Implementar aba `Flows / Automacoes`
- [ ] Exibir total de execucoes
- [ ] Exibir serie temporal
- [ ] Exibir top automacoes

**Riscos principais:**
- semantica de trigger nao deve entrar ainda
- evitar incluir sucesso/falha sem modelagem de status

**Criterio de aceite:**
- aba mostra total, serie temporal e ranking
- dados batem com execucoes reais do periodo
- sem dependencias de logs de erro ou status inexistentes

---

## Fatia 4 — Colaboradores MVP

**Objetivo:** Entregar a primeira visao operacional por pessoa, sem misturar IA.

**Repos afetados:**
- `chatfunnel-contracts`
- `chatfunnel-services`
- `chatfunnel-front`

**Endpoints:**
- `GET /nest/reports/v2/collaborators/response-time`
- `GET /nest/reports/v2/collaborators/workload`
- opcional `GET /nest/reports/v2/collaborators/overview`

**Contracts:**
- `Ranking`
- `TimeSeries` se houver historico por colaborador
- talvez `ComparisonTable` no futuro, mas nao necessario para MVP

**Back-end (`chatfunnel-services`):**
- [ ] Criar `collaborators.controller.ts`
- [ ] Implementar `response-time`
- [ ] Implementar `workload`
- [ ] Definir metrica principal do ranking do `overview`, se entrar

**Front (`chatfunnel-front`):**
- [ ] Implementar aba `Agentes / Colaboradores`
- [ ] Renderizar ranking de tempo de resposta
- [ ] Renderizar carga de trabalho
- [ ] Adicionar filtro por colaborador

**Riscos principais:**
- conceito de carga de trabalho precisa ser claro
- evitar misturar humanos com metricas de IA
- ownership de receita/conversao fica para depois

**Criterio de aceite:**
- aba mostra pelo menos tempo de resposta e carga de trabalho
- filtro por colaborador funciona
- leitura e claramente de colaborador humano

---

## Fatia 5 — UTM Filters Cross-Repo

**Objetivo:** Tornar os filtros de atribuicao reais e consistentes para relatorios.

**Repos afetados:**
- `chatfunnel-core`
- `chatfunnel-front`
- `chatfunnel-services`
- opcionalmente `chatfunnel-contracts` se forem criados DTOs/contratos adicionais

**Escopo tecnico:**
- filtros por `origin`
- `utmSource`
- `utmMedium`
- `utmCampaign`

**Back-end / Core:**
- [ ] Revisar se `ReportsV2Module` filtra UTM direto via Prisma ou se deve reutilizar `chatfunnel-core`
- [ ] Fechar gap documentado em `chatfunnel-core/src/repositories/contacts.repository.ts`
- [ ] Normalizar conceito de `origin`

**Front (`chatfunnel-front`):**
- [ ] Adicionar filtros de atribuicao na tela de Relatorios
- [ ] Garantir persistencia e propagacao desses filtros entre abas

**Services (`chatfunnel-services`):**
- [ ] Evoluir `BaseReportDto` ou DTOs derivados com `origin?`, `utmSource?`, `utmMedium?`, `utmCampaign?`
- [ ] Aplicar filtros nos endpoints de `Geral`, `Funil` e `Automacoes` onde fizer sentido

**Riscos principais:**
- `origin` e `canal` nao sao a mesma coisa
- parte do gap esta fora do modulo de reports
- risco de implementar filtro em um repo e conceito diferente em outro

**Criterio de aceite:**
- filtros aparecem no front
- endpoints recebem e aplicam filtros coerentemente
- comparacoes por atribuicao funcionam ao menos em `Geral` e `Funil`

---

## Fatia 6 — Schedules Data Model

**Objetivo:** Desbloquear a futura aba `Agendamentos` com um modelo de dados confiavel.

**Repos afetados:**
- `chatfunnel-core`
- `chatfunnel-services`
- possivelmente `chatfunnel-api`
- possivelmente `chatfunnel-scheduler`
- `chatfunnel-front`

**Escopo tecnico:**
- definir entidade canonica de agendamento
- persistir status:
  - `COMPARECEU`
  - `NO_SHOW`
- unificar agenda interna e Google Calendar

**Back-end / Modelagem:**
- [ ] Identificar onde o agendamento vive hoje
- [ ] Definir source of truth
- [ ] Definir migration/modelo para status de comparecimento
- [ ] Definir como associar agendamento a contato, colaborador e origem
- [ ] Definir como calcular:
  - tempo ate agendamento
  - mensagens ate agendamento

**Front (`chatfunnel-front`):**
- [ ] Expor UI para marcar comparecimento / no-show
- [ ] Garantir que a marcacao funcione para agenda interna e Google Calendar

**Reports V2 (`chatfunnel-services`):**
- [ ] So depois da modelagem, criar `schedules.controller.ts`
- [ ] Implementar `overview`, `series`, `recent`, `attendance`, `no-show`

**Riscos principais:**
- esse bloqueio nao e do modulo de reports; e de modelagem de produto/dados
- alto risco de retrabalho se o relatorio nascer antes da entidade canonica

**Criterio de aceite:**
- existe modelo persistido para comparecimento/no-show
- o front consegue marcar status
- a futura aba `Agendamentos` deixa de estar `Blocked`

---

## Dependencias compartilhadas

- `chatfunnel-contracts/src/endpoints/reports.contracts.ts` deve continuar como source of truth dos shapes
- `ReportsV2Module` deve permanecer paralelo ao legado
- `cache` continua adiado ate o volume justificar
- indexes do spec base continuam recomendados para queries pesadas de CRM e mensagens

---

## Validacao por fatia

Cada fatia deve fechar com:

- [ ] endpoint(s) respondendo `200`
- [ ] shape validado pelo contract do `@chatfunnel/contracts`
- [ ] tela consumindo os dados reais
- [ ] loading e estado de erro no front
- [ ] smoke test do fluxo principal
- [ ] update do vault/documentacao

---

## Criterio de sucesso do plano

O plano esta bem executado quando:

1. a tela de Relatorios existe no front com tabs fixas
2. `Geral`, `Funil`, `Automacoes` e `Colaboradores` tem MVP utilizavel
3. filtros de atribuicao estao funcionais nas abas prioritarias
4. `Agendamentos` deixa de ser uma ideia solta e passa a ter modelagem propria
5. o catalogo de 34 relatorios continua servindo como biblioteca, sem forcar 34 telas

---

## Proximo passo depois deste plano

Se quiser seguir para execucao, o melhor proximo artefato e quebrar a `Fatia 1 — Dashboard MVP` em tasks operacionais por repo, no mesmo formato de `2026-06-01-reports-v2-f0-skeleton.md` e `2026-06-01-reports-v2-f1-engines.md`.
