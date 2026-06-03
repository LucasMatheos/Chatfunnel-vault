# Relatorios V2 — Mapping Tecnico por Aba

**Data:** 2026-06-03
**Status:** Draft
**Autor:** Codex + Lucas
**Baseado em:**
- `docs/superpowers/specs/2026-05-28-relatorios-v2-arquitetura.md`
- `docs/superpowers/specs/2026-06-03-relatorios-v2-decisoes-e-backlog.md`
- `docs/superpowers/specs/2026-06-03-relatorios-v2-escopo-por-aba.md`

---

## 1. Objetivo

Mapear cada aba da tela de Relatorios V2 para:

- endpoint V2 candidato
- primitive visual esperada
- tabelas/entidades envolvidas
- risco tecnico principal
- dependencias abertas
- status de entrega

Status usados neste documento:

- `MVP` — pode entrar na primeira entrega da tela
- `P2` — importante, mas pode entrar depois do MVP
- `Blocked` — depende de modelagem ou fonte de dados ainda inexistente/incompleta

---

## 2. Convencoes de endpoint

Para manter consistencia com `ReportsV2Module`, a proposta e:

- cada aba tem um endpoint `overview`
- blocos mais pesados ou reaproveitaveis podem ter endpoints dedicados
- todos os endpoints usam os mesmos filtros base sempre que fizer sentido

Padrao sugerido:

- `/nest/reports/v2/dashboard/*`
- `/nest/reports/v2/automations/*`
- `/nest/reports/v2/crm/*`
- `/nest/reports/v2/schedules/*`
- `/nest/reports/v2/collaborators/*`

---

## 3. Aba Geral

### 3.1 Endpoint principal

- `GET /nest/reports/v2/dashboard/overview`

### 3.2 Blocos

| Bloco | Endpoint candidato | Primitive | Tabelas / entidades | Risco principal | Dependencias | Status |
|---|---|---|---|---|---|---|
| KPIs principais | `/dashboard/overview` | `MetricCard[]` | `Contacts`, `KanbanCards`, `Messages`, fonte de agendamentos | consolidacao cross-domain | fechar conceito de cada KPI | `MVP` |
| Entrada de leads por dia | `/dashboard/leads-series` | `TimeSeries` | `Contacts` | timezone e granularidade | nenhuma extra | `MVP` |
| Leads por origem | `/dashboard/leads-by-origin` | `Ranking` ou donut payload | `Contacts`, `ContactsChannels` | definicao de `origem` | padronizar origem vs canal vs UTM | `P2` |
| Heatmap de fluxo | `/dashboard/activity-heatmap` | `Heatmap` | `Messages` ou `Contacts` | alto volume de dados | decidir se mede entrada de leads ou mensagens | `MVP` |
| Eventos recentes | `/dashboard/recent-events` | `EventFeed` | multiplas fontes | agregacao cross-domain | definir esquema canonico de evento | `P2` |
| Horas economizadas pela IA | `/dashboard/ai-time-saved` | `MetricCard` | `AgentSessions`, `LlmUsageLogs` ou derivado | formula de negocio indefinida | definir calculo oficial | `Blocked` |

### 3.3 Observacoes tecnicas

- `overview` pode orquestrar varios providers internos em vez de tentar resolver tudo num unico SQL.
- `EventFeed` merece shape proprio em `chart-data.types.ts` ou modulo equivalente.

---

## 4. Aba Flows / Automacoes

### 4.1 Endpoint principal

- `GET /nest/reports/v2/automations/overview`

### 4.2 Blocos

| Bloco | Endpoint candidato | Primitive | Tabelas / entidades | Risco principal | Dependencias | Status |
|---|---|---|---|---|---|---|
| Total de execucoes | `/automations/overview` | `MetricCard` | `IGAutomationsExecutions` | baixo | nenhuma extra | `MVP` |
| Serie temporal de execucoes | `/automations/executions-series` | `TimeSeries` | `IGAutomationsExecutions` | medio, volume historico | nenhuma extra | `MVP` |
| Top automacoes | `/automations/top` | `Ranking` | `IGAutomations`, `IGAutomationsExecutions` | baixo | nenhuma extra | `MVP` |
| Efetividade por trigger | `/automations/triggers` | `Ranking` | `IGAutomationsTriggers`, `IGAutomationsExecutions` | join e semantica do trigger | confirmar consistencia do `triggerId` | `P2` |
| Eventos recentes | `/automations/recent-events` | `EventFeed` | `IGAutomationsExecutions` ou logs | dados de evento insuficientes | definir granularidade e texto do evento | `P2` |
| Cards de automacoes recentes | `/automations/recent-runs` | `List<Card>` | `IGAutomations`, `IGAutomationsExecutions` | baixo | definir shape de card | `P2` |

### 4.3 Observacoes tecnicas

- Os blocos MVP reaproveitam diretamente `R21`, `R23` e `R25`.
- Nao incluir sucesso/falha na F1, porque o proprio catalogo ja marcou isso como inviavel sem novos campos de status.

---

## 5. Aba Funil

### 5.1 Endpoint principal

- `GET /nest/reports/v2/crm/funnel-overview`

### 5.2 Blocos

| Bloco | Endpoint candidato | Primitive | Tabelas / entidades | Risco principal | Dependencias | Status |
|---|---|---|---|---|---|---|
| KPI de entrada, ganhos e perdas | `/crm/funnel-overview` | `MetricCard[]` | `KanbanCards`, `KanbanCardsHistory` | definicao de entrada no funil | fechar regra de negocio | `MVP` |
| Funil visual absoluto/relativo | `/crm/funnel` | `FunnelData` estendido | `KanbanCards`, `KanbanCardsHistory`, `KanbanColumns` | logica de conversao e performance | shape com absoluto + relativo | `MVP` |
| Quantidade por etapa | `/crm/stage-counts` | `Ranking` ou tabela | `KanbanCards`, `KanbanColumns` | baixo | nenhuma extra | `MVP` |
| Avanco entre etapas | `/crm/stage-transitions` | `FunnelData` ou tabela | `KanbanCardsHistory` | historico pesado | indexes e definicao de transicao | `MVP` |
| Motivos de perda | `/crm/loss-reasons` | `Ranking` | `KanbanCards`, `KanbanLossesReasons` | baixo | nenhuma extra | `MVP` |
| Receita do funil | `/crm/revenue` | `TimeSeries` + cards | `KanbanCards`, `Kanbans` | timezone e data de status | nenhuma extra | `P2` |
| Performance por colaborador | `/crm/collaborators` | `Ranking` | `KanbanCardsModerators`, `KanbanCards` | ambiguidade de ownership | definir owner do card | `P2` |

### 5.3 Observacoes tecnicas

- `FunnelData` atual do spec deve evoluir para suportar `conversionAbsolute`, `conversionRelative` e `advancedFromPrevious`.
- Aqui existe o melhor candidato para a primeira validacao real do `FunnelEngine`.

---

## 6. Aba Agendamentos

### 6.1 Endpoint principal

- `GET /nest/reports/v2/schedules/overview`

### 6.2 Blocos

| Bloco | Endpoint candidato | Primitive | Tabelas / entidades | Risco principal | Dependencias | Status |
|---|---|---|---|---|---|---|
| Total de agendamentos | `/schedules/overview` | `MetricCard` | agenda interna + Google Calendar | fonte ainda nao canonica | definir entidade fonte | `P2` |
| Serie temporal de agendamentos | `/schedules/series` | `TimeSeries` | agenda interna + Google Calendar | unificacao entre fontes | definir date source | `P2` |
| Ultimos agendamentos | `/schedules/recent` | `List<Card>` | agenda interna + Google Calendar | shape heterogeneo | normalizar campos basicos | `P2` |
| Comparecimento | `/schedules/attendance` | `MetricCard` | agenda interna + Google Calendar | status nao persistido hoje | modelar `COMPARECEU` | `Blocked` |
| No-show | `/schedules/no-show` | `MetricCard` ou `Ranking` | agenda interna + Google Calendar | status nao persistido hoje | modelar `NO_SHOW` | `Blocked` |
| Tempo ate agendamento | `/schedules/time-to-schedule` | `TimeSeries` ou `MetricCard` | agenda + `Contacts` + possivel `Messages` | regra de origem do tempo | definir marco inicial | `Blocked` |
| Mensagens ate agendamento | `/schedules/messages-until-booking` | `MetricCard` ou histograma | agenda + `Messages` + `Conversations` | calculo caro e ambiguo | definir janela e unidade | `Blocked` |
| Comparativo por origem/UTM | `/schedules/by-attribution` | `ComparisonTable` | agenda + `Contacts` | filtros UTM incompletos | fechar gap core/front | `Blocked` |

### 6.3 Observacoes tecnicas

- `Schedules` deve nascer como dominio novo no `ReportsV2Module`, nao como enxerto em `dashboard`.
- Aqui existe dependencias fora do modulo de reports. Sem modelagem de agenda, quase tudo fica parcial.

---

## 7. Aba Agentes / Colaboradores

### 7.1 Endpoint principal

- `GET /nest/reports/v2/collaborators/overview`

### 7.2 Blocos

| Bloco | Endpoint candidato | Primitive | Tabelas / entidades | Risco principal | Dependencias | Status |
|---|---|---|---|---|---|---|
| Ranking geral de colaboradores | `/collaborators/overview` | `Ranking` | `Moderators`, `Messages`, `Conversations`, `KanbanCardsModerators` | consolidacao entre dominios | definir metrica principal de ranking | `P2` |
| Leads abordados | `/collaborators/leads-contacted` | `MetricCard` ou `Ranking` | `Messages`, `Conversations`, `Contacts` | conceito de abordagem | definir regra oficial | `Blocked` |
| Tempo de resposta | `/collaborators/response-time` | `Ranking` + `TimeSeries` | `Messages`, `ChatModerators` | medio | nenhuma extra | `MVP` |
| Conversao por colaborador | `/collaborators/conversion` | `Ranking` | `KanbanCardsModerators`, `KanbanCards` | ownership e atribuicao | definir quem recebe credito | `P2` |
| Receita por colaborador | `/collaborators/revenue` | `Ranking` | `KanbanCardsModerators`, `KanbanCards` | mesma ambiguidade de ownership | regra de atribuicao | `P2` |
| Carga de trabalho | `/collaborators/workload` | `Ranking` | `Conversations`, `Messages` | baixo | nenhuma extra | `MVP` |
| Leads ativos atribuidos | `/collaborators/active-leads` | `MetricCard` ou `Ranking` | `KanbanCardsModerators`, `KanbanCards` | definicao de ativo | regra de negocio | `P2` |
| Agendamentos por colaborador | `/collaborators/schedules` | `Ranking` | agenda + colaborador | dependencia de agenda | modelagem de agendamentos | `Blocked` |
| Comparecimento/no-show por colaborador | `/collaborators/attendance` | `ComparisonTable` | agenda + colaborador | dependencia de status | modelar comparecimento | `Blocked` |
| Sentimento das respostas | `/collaborators/sentiment` | `TimeSeries` ou `Ranking` | Intelligence / NLP | depende de camada semantica | integrar Intelligence | `Blocked` |

### 7.3 Observacoes tecnicas

- Esta aba deve focar em humano. IA pode aparecer como comparativo futuro, mas nao deve contaminar o MVP operacional.
- `response-time` e `workload` sao os melhores candidatos de primeira entrega aqui.

---

## 8. Filtros transversais

### 8.1 DTO base necessario

Evolucao sugerida do `BaseReportDto`:

- `initialDate`
- `finalDate`
- `channelId?`
- `moderatorId?`
- `pipelineId?`
- `automationId?`
- `origin?`
- `utmSource?`
- `utmMedium?`
- `utmCampaign?`

### 8.2 Impacto tecnico

| Filtro | Onde impacta | Dependencia | Status |
|---|---|---|---|
| `periodo` | todos os endpoints | ja previsto no V2 | `MVP` |
| `pipelineId` | Funil | ja previsto no catalogo | `MVP` |
| `moderatorId` | Colaboradores, Funil | ja previsto em parte | `MVP` |
| `origin` | Geral, Funil, Agendamentos | conceito de origem ainda difuso | `P2` |
| `utmSource` | multiplas abas | filtros ausentes em `chatfunnel-core` | `P2` |
| `utmMedium` | multiplas abas | filtros ausentes em `chatfunnel-core` | `P2` |
| `utmCampaign` | multiplas abas | filtros ausentes em `chatfunnel-core` | `P2` |

---

## 9. Backlog tecnico resumido

### 9.1 Entrega MVP recomendada

- `GET /dashboard/overview`
- `GET /dashboard/leads-series`
- `GET /dashboard/activity-heatmap`
- `GET /crm/funnel-overview`
- `GET /crm/funnel`
- `GET /crm/loss-reasons`
- `GET /automations/overview`
- `GET /automations/executions-series`
- `GET /automations/top`
- `GET /collaborators/response-time`
- `GET /collaborators/workload`

### 9.2 Entrega P2 recomendada

- blocos de origem/UTM
- receita detalhada do funil
- eventos recentes cross-domain
- rankings operacionais mais ricos por colaborador
- primeira versao parcial de agendamentos, se a fonte estiver pronta

### 9.3 Itens bloqueados fora de reports

- comparecimento / no-show
- dominio canonico de agendamentos
- horas economizadas pela IA
- sentimento
- comparativos completos por UTM em todas as abas

---

## 10. Proxima acao recomendada

O proximo documento util e um **plano de implementacao backend/front em fatias**, por exemplo:

1. `Dashboard MVP`
2. `Funil MVP`
3. `Automacoes MVP`
4. `Colaboradores MVP`
5. `UTM filters cross-repo`
6. `Schedules data model`

Cada fatia deve listar:

- repos afetados
- endpoints
- contracts
- componentes front
- riscos
- criterio de aceite
