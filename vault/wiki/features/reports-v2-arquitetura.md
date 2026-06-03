---
title: Reports v2 — Arquitetura do Modulo (Backend)
description: Arquitetura do modulo ReportsV2Module no chatfunnel-services. Constroi do zero usando engines reusaveis + catalogo declarativo em vez de 1 handler por relatorio. Cobre os 34 relatorios do spec base.
tags: [features, reports, reportsV2, backend, services, arquitetura, plano]
related: ["[[contacts]]", "[[crm-kanban]]", "[[automations]]", "[[broadcast]]", "[[ai-agents]]"]
last_updated: 2026-06-03
status: f0-em-implementacao
---

# Reports v2 — Arquitetura do Modulo (Backend)

> Documento de discussao. Cruza:
> - **Spec base do catalogo** (`docs/superpowers/specs/2026-05-24-relatorios-design.md`) — 34 relatorios em 7 dominios
> - **Spec da arquitetura** (`docs/superpowers/specs/2026-05-28-relatorios-v2-arquitetura.md`) — versao completa com snippets
> - **Decisoes de produto e backlog repriorizado** (`docs/superpowers/specs/2026-06-03-relatorios-v2-decisoes-e-backlog.md`) — tela unica, 5 abas, Agendamentos e Intelligence
> - **Escopo por aba** (`docs/superpowers/specs/2026-06-03-relatorios-v2-escopo-por-aba.md`) — objetivo, componentes, metricas, filtros e dependencias por aba
> - **Mapping tecnico por aba** (`docs/superpowers/specs/2026-06-03-relatorios-v2-mapping-tecnico-por-aba.md`) — endpoints candidatos, primitives, tabelas, riscos e status
> - **Plano de implementacao por fatias** (`docs/superpowers/plans/2026-06-03-relatorios-v2-implementacao-por-fatias.md`) — sequencia de execucao por repo, endpoint e criterio de aceite
> - **Modulo legado** (`chatfunnel-services/src/modules/reports/`) — 6 handlers com `any`, sem cache, sem padronizacao
>
> **Estado v2:** branch `feature/reports-v2` ativa em services/front/core. Sem pasta `reports-v2/` criada ainda. Este doc e o plano.

---

## 1. Resumo

Construir `ReportsV2Module` do zero, em paralelo ao modulo legado, baseado em **engines reusaveis + catalogo declarativo** em vez de um handler por relatorio.

**Por que do zero:** modulo atual tem `any` em todo lugar, sem cache Redis, sem padronizacao de shape de saida, sem separacao entre logica de calculo e configuracao. Refatorar gradualmente e mais arriscado que escrever paralelo e migrar.

**Por que engines:** dos 34 relatorios do catalogo, 28 caem em 6 padroes de calculo identicos. Escrever 34 handlers seria duplicar a mesma estrutura 28 vezes com pequenas variacoes de tabela/coluna.

---

## 2. Os 34 relatorios sao na verdade 6 padroes

Mapeando o catalogo por padrao de calculo:

| Padrao | Relatorios | Total | O que muda entre eles |
|---|---|---|---|
| **Time series** | R02, R08, R09, R15, R17, R21, R27, R30, R32 | 9 | Tabela, coluna de data, agregacao (count/sum/avg) |
| **Ranking** | R04, R05, R10, R13, R14, R18, R23, R25 | 8 | Entidade rankeada, metrica de ordenacao, join |
| **Heatmap hora x dia** | R11, R20, R29 | 3 | Tabela, coluna de data |
| **Funil de conversao** | R01, R19, R26 | 3 | Sequencia de estagios, fonte das transicoes |
| **Aging / bucket de duracao** | R06, R12, R16 | 3 | Entidade, coluna de referencia, faixas |
| **Dashboard composto** | R35, R36, R37 | 3 | Conjunto de metricas a compor |
| **Logica propria (special)** | R03, R07, R28, R31, R33, R34 | 6 | Algoritmo nao padronizavel |

Total: **28 relatorios** seguem 6 padroes + **6 casos especiais** = **12 arquivos de logica** em vez de 34.

---

## 3. Estrutura de pastas

```
chatfunnel-services/src/modules/reports-v2/
├── reports-v2.module.ts               # registra controllers, services, orchestrator, engines
│
├── controllers/                       # um por dominio, endpoints finos
│   ├── crm.controller.ts              # GET /reports/v2/crm/*
│   ├── contacts.controller.ts         # GET /reports/v2/contacts/*
│   ├── messages.controller.ts         # GET /reports/v2/messages/*
│   ├── automations.controller.ts      # GET /reports/v2/automations/*
│   ├── broadcasts.controller.ts       # GET /reports/v2/broadcasts/*
│   ├── agents.controller.ts           # GET /reports/v2/agents/*
│   └── dashboard.controller.ts        # GET /reports/v2/dashboard/*
│
├── orchestrator/
│   └── report.orchestrator.ts         # recebe id do relatorio, escolhe engine, cacheia
│
├── engines/                           # os 6 padroes reusaveis
│   ├── time-series.engine.ts          # count/sum/avg agrupado por dia/semana/mes
│   ├── ranking.engine.ts              # top-N por metrica
│   ├── heatmap.engine.ts              # bucket hora x dia da semana
│   ├── funnel.engine.ts               # estagios sequenciais com taxa de conversao
│   ├── aging.engine.ts                # distribuicao por faixa de duracao
│   └── metric-card.engine.ts          # valor + delta vs periodo anterior + sparkline
│
├── catalog/                           # 28 relatorios como configuracao declarativa
│   ├── crm.catalog.ts                 # R01, R02, R04, R05, R06 (R03, R07 sao specials)
│   ├── contacts.catalog.ts            # R08-R14
│   ├── messages.catalog.ts            # R15-R20
│   ├── automations.catalog.ts         # R21, R23, R25
│   ├── broadcasts.catalog.ts          # R26, R27, R29 (R28 e special)
│   ├── agents.catalog.ts              # R30, R32 (R31, R33, R34 sao specials)
│   └── dashboard.catalog.ts           # R35, R36, R37
│
├── handlers/                          # apenas os 6 casos especiais
│   ├── crm-velocity.handler.ts        # R03 — percorre KanbanCardsHistory por card
│   ├── crm-forecast.handler.ts        # R07 — soma ponderada por posicao da etapa
│   ├── broadcasts-reach-by-segment.handler.ts  # R28
│   ├── agents-satisfaction.handler.ts # R31 — histograma de notas
│   ├── agents-resolution-rate.handler.ts       # R33
│   └── agents-human-vs-ai.handler.ts  # R34 — comparativo lado a lado
│
├── core/
│   ├── report-handler.base.ts         # contrato comum entre engines e specials
│   ├── report-cache.service.ts        # wrapper Redis com hash de DTO
│   ├── period.helper.ts               # normalizacao de datas + timezone
│   ├── period-comparison.helper.ts    # calculo de periodo anterior (R36)
│   └── chart-data.types.ts            # shapes padronizados de saida
│
├── dtos/
│   ├── base-report.dto.ts             # initialDate, finalDate, channelId?, moderatorId?
│   ├── period-comparison.dto.ts       # adiciona previousInitialDate, previousFinalDate
│   └── filters.dto.ts                 # filtros extras por dominio (pipelineId, tagId, etc.)
│
└── repositories/                      # repos proprios do modulo, queries otimizadas
    ├── reports-crm.repository.ts
    ├── reports-contacts.repository.ts
    ├── reports-messages.repository.ts
    ├── reports-automations.repository.ts
    ├── reports-broadcasts.repository.ts
    └── reports-agents.repository.ts
```

---

## 4. Conceito-chave: engine + catalog

Em vez de um arquivo `handler.ts` por relatorio, dois conceitos:

**Engine** = implementacao do padrao de calculo. Recebe uma config + dto e gera SQL dinamico. Ex: `TimeSeriesEngine` atende 9 relatorios.

**Catalog** = lista de configs declarativas, uma por relatorio. Ex:

```ts
export const crmRevenueReport: TimeSeriesConfig = {
  id: "crm.revenue",                              // R02
  engine: "timeSeries",
  cacheTtl: 900,
  source: {
    table: "KanbanCards",
    dateColumn: "statusOportunityUpdatedAt",
    valueColumn: "amount",
    aggregation: "sum",
    accountIdJoin: { via: "Kanbans", on: "kanbanId" },
    where: { isDeleted: false },
    groupBy: ["statusOportunity"],
  },
  filters: ["pipelineId", "moderatorId"],
};
```

Um `ReportOrchestrator` central recebe o id do relatorio, lookups na config, escolhe o engine, cuida do cache.

---

## 5. Por que usar

### 5.1 Adicionar relatorio novo

| Cenario | 1 handler/relatorio | Engines + catalog |
|---|---|---|
| Criar handler.ts + dto.ts + response.ts | 3 arquivos novos | 0 |
| Registrar no service | Sim | Nao |
| Adicionar endpoint | Sim | Sim |
| Escrever logica de query, cache, timezone | ~120 linhas | 0 |
| Adicionar config no catalog | — | ~15 linhas |
| **Tempo total** | ~30min | ~3min |

### 5.2 Mudanca no shape de saida

| Cenario | 1 handler/relatorio | Engines + catalog |
|---|---|---|
| Adicionar campo em "time series" | Editar 9 handlers | Editar 1 engine |
| Fix de bug de timezone | 34 lugares para auditar | 1 lugar (period.helper.ts) |
| Fix de bug de cache | 34 lugares | 1 lugar (orchestrator + cache.service) |

### 5.3 Consistencia

Com 34 handlers e inevitavel que dois relatorios "iguais" divirjam (um usa `DATE_TRUNC`, outro `to_char`; um arredonda no SQL, outro em TS; um aplica timezone, outro nao).

Com engines, **e impossivel divergir** — todos passam pelo mesmo codigo.

---

## 6. Trade-offs

| Aspecto | Engines + catalog | 1 handler/relatorio |
|---|---|---|
| Arquivos de logica | 12 | 34 |
| Setup inicial | Maior (engines + orchestrator) | Menor (so copiar pattern) |
| Adicionar relatorio padronizado | ~15 linhas (config) | ~120 linhas (handler) |
| Adicionar caso especial | Mesma carga | Mesma carga |
| Curva de aprendizado | Entender conceito de engine | Mais obvio a primeira vista |
| Debug de SQL | SQL dinamico — log do query gerado obrigatorio | SQL literal |
| Risco de over-engineering | Real, se parametrizar demais | Baixo |

**Mitigacoes:**

- **Engines limitados de proposito.** Se feature pedida nao cabe no engine sem virar canivete suico, vira special handler.
- **SQL gerado logado em DEBUG.** Toda execucao de engine loga o SQL final.
- **Specials existem desde o dia 1.** Nao forca tudo no engine — 6 dos 34 ja entram como special.

---

## 7. Regras tecnicas do modulo

- **Tipagem estrita.** Zero `any`. `ReportEngine<TConfig, TResponse>` e `SpecialReportHandler<TDto, TResponse>` sao contratos genericos.
- **DTOs com class-validator** (padrao do `chatfunnel-services`).
- **`accountId` obrigatorio.** Toda query do engine inclui automaticamente o filtro de tenant.
- **Soft delete.** `isDeleted: false` e default em todas as configs e specials.
- **Cache adiado.** A camada de cache (Redis + `ReportCacheService`) **nao entra na F1**. Orchestrator chama o engine direto. Cada config segue declarando `cacheTtl` como metadado para uso futuro — o orchestrator ignora esse campo enquanto a camada nao for implementada. Ativacao posterior e mudanca isolada no orchestrator; engines e configs nao mudam.
- **Timezone via header.** `Timezone` resolvido em `period.helper.ts` — engines nao fazem calculo de fuso direto.
- **Strings user-facing em pt-BR com acentos** (regra do projeto).
- **Logging via winston** com `name` do relatorio como contexto.

---

## 8. Migracao e coexistencia com legado

- **Sem alteracao no `ReportsModule` atual.** Continua servindo `/nest/reports/*`.
- **`ReportsV2Module` registrado no `app.module.ts`** lado a lado.
- **Rota base v2:** `/nest/reports/v2/*`.
- **Front decide quando migrar.** Endpoint legado fica disponivel enquanto o consumo nao migra.
- **Modulo legado deprecado** so quando todos os consumidores estiverem em V2.

---

## 9. Plano de implementacao

### Fase 0 — Esqueleto (1 dia) — concluida em 2026-06-01

- [x] Shapes em `@chatfunnel/contracts/endpoints/reports.contracts.ts` (Zod + `z.infer` types)
- [x] `reports-v2.module.ts` registrado em `app.module.ts`
- [x] `core/period.helper.ts` (`fixTimezone`, `normalizeRange`, `DEFAULT_TIMEZONE`)
- [x] `dtos/base-report.dto.ts`
- [x] `orchestrator/report.orchestrator.ts` (sem nenhum engine ainda — `registry` vazio, lança `NotFoundException`)
- [x] 1 endpoint dummy retornando shape de teste — `GET /reports/v2/ping` devolve `GetReportsV2PingResponse`
- Cache service adiado para fase posterior (decisao do dia: F0 valida fluxo end-to-end sem cache)

### Fase 1 — Engines + 1 relatorio por padrao (2-3 dias)

> **Sem cache na F1.** `ReportCacheService` nao e implementado aqui — orchestrator chama o engine direto. Sera adicionado em fase posterior, quando o volume de queries justificar, como mudanca isolada no orchestrator.

- `TimeSeriesEngine` + 1 config (R08 contatos)
- `RankingEngine` + 1 config (R04 motivos de perda)
- `HeatmapEngine` + 1 config (R11 horarios de pico)
- `FunnelEngine` + 1 config (R01 funil de conversao)
- `AgingEngine` + 1 config (R06 aging)
- `MetricCardEngine` + 1 config (R35 card do dashboard)

Validar shape de saida no front com 1 relatorio de cada padrao antes de seguir.

### Fase 2 — Especiais (1-2 dias)

R03 velocidade, R07 forecast, R31 satisfacao, R33 taxa de resolucao, R34 humano vs IA, R28 alcance por segmento.

### Fase 3 — Popular o catalogo (1-2 dias)

Adicionar as 22 configs restantes (cada uma ~15 linhas) nos respectivos catalogs.

### Fase 4 — Migration de indexes (paralelo)

Migration com os 6 indexes compostos do spec base. Roda independente dos handlers.

---

## 10. Referencias

- Spec do catalogo (34 relatorios): `docs/superpowers/specs/2026-05-24-relatorios-design.md`
- Spec completo da arquitetura (com snippets): `docs/superpowers/specs/2026-05-28-relatorios-v2-arquitetura.md`
- Decisoes de produto e backlog repriorizado: `docs/superpowers/specs/2026-06-03-relatorios-v2-decisoes-e-backlog.md`
- Escopo por aba: `docs/superpowers/specs/2026-06-03-relatorios-v2-escopo-por-aba.md`
- Mapping tecnico por aba: `docs/superpowers/specs/2026-06-03-relatorios-v2-mapping-tecnico-por-aba.md`
- Plano de implementacao por fatias: `docs/superpowers/plans/2026-06-03-relatorios-v2-implementacao-por-fatias.md`
- Regras do `chatfunnel-services`: `chatfunnel-services/CLAUDE.md`
- Padroes do workspace: `CLAUDE.md` raiz
- Branch ativa: `feature/reports-v2` (front, services, core)

---

## 11. Alinhamento com Product (reuniao 2026-04-24, consolidado em 2026-06-03)

O research `docs/research/atividade-relatorios.md` muda o enquadramento do produto. O spec base continua valido como **inventario de metricas e capacidades backend**, mas nao deve ser lido como UX final de "34 relatorios expostos".

### 11.1 Mudanca de produto

- A experiencia alvo vira **uma tela unica de Relatorios**, com **abas fixas**:
  - Geral
  - Flows / Automacoes
  - Funil
  - Agendamentos
  - Agentes / Colaboradores
- Alguns graficos ficam fixos e curados no produto, principalmente o **funil**.
- Analises ad hoc, perguntas pontuais e graficos dinamicos devem ficar para a **Intelligence**, nao para proliferacao de telas/rotas no front.

### 11.2 Impacto no catalogo de 34 relatorios

- O catalogo de 34 relatorios segue util como **biblioteca de metricas**.
- A UI nao precisa expor 34 paginas/visoes independentes.
- O backend V2 deve priorizar **primitivos reutilizaveis por aba** e nao "completar o catalogo inteiro" antes de entregar valor.
- Em termos praticos:
  - `Geral` compoe cards + series + heatmap + eventos recentes.
  - `Flows / Automacoes` reaproveita time series, ranking e cards.
  - `Funil` continua como area core e precisa suportar visao **absoluta** e **relativa**.
  - `Agentes / Colaboradores` e uma visao transversal aplicada por filtro, nao um modulo separado por agente.

### 11.3 Lacuna nova: Agendamentos

`Agendamentos` nao existe como dominio explicito no spec de 2026-05-24 nem na arquitetura V2 atual. Isso cria uma lacuna funcional importante.

Necessidades novas trazidas pela reuniao:

- quantidade de agendamentos
- ultimos agendamentos
- comparecimento
- no-show
- tempo ate agendamento
- quantidade media de mensagens ate o agendamento
- comparativos por origem / UTM

Dependencia de produto/dados:

- e necessario registrar status de comparecimento no calendario/agendamento:
  - `COMPARECEU`
  - `NO_SHOW`
- isso deve cobrir agenda interna e Google Calendar

Sem esse status persistido, parte da aba de Agendamentos fica inviavel ou incompleta.

### 11.4 Filtros ficaram mais centrais

O spec base ja previa filtros padrao, mas a reuniao eleva **origem + UTM** a filtro de primeira classe em varias abas, nao so no dominio de contatos.

Estado atual conhecido no vault:

- schema de `Contacts` ja tem `utmSource`, `utmMedium`, `utmCampaign`, `utmTerm`, `utmContent`, `lastScheduleLink` e `lastScheduleDate`
- ainda faltam filtros UTM em `chatfunnel-core` e parte da exposicao no front

Conclusao: antes de prometer comparativos amplos por origem/UTM, precisa fechar o gap de filtro e propagacao desses campos entre core/api/front.

### 11.5 Intelligence como camada de relatorios dinamicos

O research pede que relatorios especificos fiquem na Intelligence, idealmente consumindo os mesmos dados das abas fixas.

Direcao recomendada:

- manter o `ReportsV2Module` como camada de metricas curadas e estaveis
- expor payloads estruturados de graficos/cards para reaproveito no front e na Intelligence
- considerar um `reports MCP` ou endpoint dedicado para a IA consultar essas metricas
- para perguntas realmente abertas, usar abordagem estilo `text-to-sql` com:
  - read-only
  - `accountId` obrigatorio
  - whitelist de tabelas
  - timeout e rate limit

### 11.6 Impacto no plano

O plano atual (F1/F2/F3) continua tecnicamente valido, mas a prioridade de produto deveria mudar para:

1. entregar a tela unica com abas fixas
2. fechar `Funil`, `Geral` e `Agendamentos`
3. garantir filtros por origem/UTM
4. definir a interface entre reports curados e Intelligence
5. so depois popular o restante do catalogo de 34 relatorios
