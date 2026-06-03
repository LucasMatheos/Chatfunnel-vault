# Sistema de Relatórios — ChatFunnel

**Data:** 2026-05-24
**Status:** Draft
**Autor:** Claude + Lucas

---

## 1. Visão Geral

Sistema de relatórios para o ChatFunnel que permite aos usuários acessar métricas de todas as features da plataforma. Abrange 7 domínios: CRM/Pipeline, Contatos, Mensagens/Atendimento, Automações, Broadcasts, Agentes IA e Visão Geral.

**Total: 34 relatórios viáveis com dados atuais.**

### 1.1 Público-alvo

Visão única — mesma interface para donos de negócio, gestores e operadores/atendentes. Sem diferenciação de papel.

### 1.2 Abordagem arquitetural

Estender o padrão existente no módulo `chatfunnel-services/src/modules/reports/`:

- **Command Handler pattern** — cada relatório é um handler isolado que estende `CommandHandler<T>`
- **Prisma ORM** para queries simples, **raw SQL (`Prisma.$queryRaw`)** para agregações complexas
- **Redis cache** (TTL 15-30min) para queries pesadas — `RedisService` já existe mas reports não usam
- **Chart.js + vue-chartjs** no frontend — já instalados no `chatfunnel-front`
- **Filtros padrão:** período (initialDate/finalDate), canal, moderador, pipeline — via DTOs com class-validator

### 1.3 Infraestrutura necessária

**Indexes compostos faltantes (migration):**

```sql
-- Contacts
CREATE INDEX idx_contacts_account_created ON "Contacts" ("accountId", "dateCreated") WHERE "isDeleted" = false;

-- Messages
CREATE INDEX idx_messages_account_created ON "Messages" ("accountId", "createdAt");

-- KanbanCards
CREATE INDEX idx_kanbancards_account_created ON "KanbanCards" ("accountId", "createdAt");
CREATE INDEX idx_kanbancards_account_status_updated ON "KanbanCards" ("accountId", "statusOportunityUpdatedAt");

-- IGAutomationsExecutions
CREATE INDEX idx_executions_account_date ON "IGAutomationsExecutions" ("automationId", "dateExecution");

-- BroadcastMessageContacts
CREATE INDEX idx_broadcast_contacts_broadcast ON "BroadcastMessageContacts" ("broadcastMessageId", "createdAt");
```

**Redis caching:** Adicionar cache nos handlers de queries pesadas (agregações com JOIN + GROUP BY).

---

## 2. Catálogo de Relatórios

---

### 2.1 CRM / Pipeline

**Fonte de dados:** `KanbanCards`, `KanbanCardsHistory`, `KanbanColumns`, `KanbanLossesReasons`, `KanbanCardsModerators`, `KanbanCardTags`

**Endpoints existentes que serão estendidos:** `crm_metrics`, `kanban_loss_metrics`

#### R01 — Funil de conversão

- **Objetivo:** Visualizar a taxa de conversão entre cada etapa do pipeline
- **Métricas:**
  - Quantidade de cards em cada coluna
  - % de avanço entre etapas consecutivas
  - Drop-off por etapa (onde cards saem do funil)
- **Cálculo:** Para cada par de colunas adjacentes, contar cards que passaram da coluna A para B (via `KanbanCardsHistory`) dividido pelo total que entrou na coluna A
- **Visualização:** Gráfico de funil vertical com % entre etapas
- **Filtros:** Pipeline, período, moderador
- **Query base:**
  ```sql
  SELECT kc."columnId", kcol."name", COUNT(kc.id) as total
  FROM "KanbanCards" kc
  JOIN "KanbanColumns" kcol ON kc."columnId" = kcol.id
  WHERE kc."kanbanId" = $1
    AND kc."createdAt" BETWEEN $2 AND $3
    AND kc."isDeleted" = false
  GROUP BY kc."columnId", kcol."name", kcol."order"
  ORDER BY kcol."order"
  ```

#### R02 — Receita do pipeline

- **Objetivo:** Acompanhar valor monetário das oportunidades ao longo do tempo
- **Métricas:**
  - Soma de `amount` por status (OPEN, WON, LOST)
  - Receita acumulada (WON) por dia/semana/mês
  - Ticket médio (amount médio dos cards WON)
- **Visualização:** Gráfico de linha (receita acumulada) + barras empilhadas (aberto/ganho/perdido)
- **Filtros:** Pipeline, período, moderador
- **Query base:**
  ```sql
  SELECT DATE(kc."statusOportunityUpdatedAt" AT TIME ZONE $4) AS date,
         kc."statusOportunity" as status,
         COALESCE(SUM(kc."amount"), 0)::float AS value,
         COUNT(kc.id) as total
  FROM "KanbanCards" kc
  JOIN "Kanbans" k ON kc."kanbanId" = k.id
  WHERE k."accountId" = $1
    AND kc."statusOportunityUpdatedAt" BETWEEN $2 AND $3
    AND kc."isDeleted" = false
  GROUP BY date, status
  ORDER BY date
  ```

#### R03 — Velocidade de vendas

- **Objetivo:** Medir quanto tempo um card leva do início ao fechamento
- **Métricas:**
  - Tempo médio total: criação até WON
  - Tempo médio por etapa (via `KanbanCardsHistory` — diff entre movimentações consecutivas)
  - Distribuição por faixa (< 1 dia, 1-7 dias, 7-30 dias, > 30 dias)
- **Visualização:** Barras horizontais por etapa + indicador de tempo médio total
- **Filtros:** Pipeline, período
- **Cálculo:** Para cada card WON, percorrer `KanbanCardsHistory` ordenado por data, calcular diferença entre cada movimentação. Agregar médias por coluna.

#### R04 — Ranking de motivos de perda

- **Objetivo:** Identificar por que deals são perdidos
- **Métricas:**
  - Contagem por motivo de perda (`KanbanLossesReasons`)
  - % de cada motivo sobre o total de perdas
  - Tendência por período (motivo X crescendo ou diminuindo)
- **Visualização:** Gráfico de barras horizontais (ranking) + donut (distribuição %)
- **Filtros:** Pipeline, período
- **Endpoint existente:** `kanban_loss_metrics` — estender com tendência temporal

#### R05 — Performance por vendedor

- **Objetivo:** Medir produtividade individual de cada moderador
- **Métricas:**
  - Cards ganhos e perdidos por moderador (via `KanbanCardsModerators`)
  - Valor total (WON) por moderador
  - Tempo médio de fechamento por moderador
  - Win rate: WON / (WON + LOST)
- **Visualização:** Tabela com ranking + barras comparativas
- **Filtros:** Pipeline, período

#### R06 — Aging de oportunidades

- **Objetivo:** Identificar cards parados há muito tempo numa etapa
- **Métricas:**
  - Cards OPEN agrupados por "dias na etapa atual" (hoje - última movimentação em `KanbanCardsHistory`)
  - Faixas: < 3 dias (saudável), 3-7 dias (atenção), 7-15 dias (risco), > 15 dias (crítico)
  - Lista dos cards em risco com contato, valor e responsável
- **Visualização:** Heatmap por coluna x faixa de aging + lista detalhada
- **Filtros:** Pipeline, coluna

#### R07 — Previsão de receita

- **Objetivo:** Forecast baseado no pipeline ativo
- **Métricas:**
  - Soma de `amount` de cards OPEN
  - Ponderação por posição no funil: cards mais avançados têm peso maior
  - Fórmula: `soma(amount x peso_da_etapa)` onde peso = posição da coluna / total de colunas
- **Visualização:** Indicador de valor previsto + breakdown por etapa
- **Filtros:** Pipeline

---

### 2.2 Contatos / Leads

**Fonte de dados:** `Contacts`, `ContactsChannels`, `TagsContacts`, `CustomFieldsContacts`, `ContactInactiveHistory`, `Interactions`

**Endpoint existente que será estendido:** `leads_add_metrics`

#### R08 — Crescimento de contatos

- **Objetivo:** Evolução da base de contatos ao longo do tempo
- **Métricas:**
  - Novos contatos por dia/semana/mês
  - Crescimento acumulado
  - Churn: contatos que ficaram inativos (via `ContactInactiveHistory`)
  - Crescimento líquido: novos - inativos
- **Visualização:** Gráfico de área (acumulado) + barras (novos por período)
- **Filtros:** Canal, período, tag
- **Endpoint existente:** `leads_add_metrics` — estender com acumulado e churn

#### R09 — Aquisição por canal

- **Objetivo:** Entender de onde vêm os leads
- **Métricas:**
  - Contatos por canal (WhatsApp, Instagram, Facebook, Livechat, Email)
  - % de distribuição por canal
  - Comparativo de crescimento entre canais
- **Visualização:** Donut (distribuição) + linhas comparativas por canal
- **Filtros:** Período

#### R10 — Distribuição por tags

- **Objetivo:** Entender segmentação da base
- **Métricas:**
  - Contagem de contatos por tag (via `TagsContacts`)
  - Tags mais usadas (ranking)
  - Contatos sem nenhuma tag
  - Distribuição por pasta de tags (`TagsFolders`)
- **Visualização:** Treemap ou barras horizontais (ranking)
- **Filtros:** Pasta de tags, período

#### R11 — Horários de pico

- **Objetivo:** Identificar quando os contatos chegam
- **Métricas:**
  - Mapa de calor: hora do dia (0-23) x dia da semana (seg-dom)
  - Horário com mais contatos novos
  - Dia da semana com mais contatos novos
- **Visualização:** Heatmap 7x24
- **Filtros:** Canal, período
- **Base existente:** `ContactsRepository.countByHour()` já implementa bucketing por hora

#### R12 — Contatos inativos

- **Objetivo:** Monitorar engajamento e identificar base fria
- **Métricas:**
  - Contatos sem interação há X dias (via `ContactInactiveHistory`)
  - Taxa de reativação: inativos que voltaram a interagir
  - Distribuição por tempo de inatividade (7d, 15d, 30d, 60d, 90d+)
- **Visualização:** Barras por faixa de inatividade + indicador de % inativos
- **Filtros:** Canal, período

#### R13 — UTM / Origem de tráfego

- **Objetivo:** Medir efetividade de campanhas de marketing
- **Métricas:**
  - Contatos por `utmSource` (Google, Facebook, Instagram, etc.)
  - Contatos por `utmMedium` (cpc, organic, social, email)
  - Contatos por `utmCampaign` (nome da campanha)
  - Conversão por origem: contatos com UTM que chegaram ao pipeline
- **Visualização:** Tabela com breakdown source/medium/campaign + barras
- **Filtros:** Período

#### R14 — Campos personalizados

- **Objetivo:** Visualizar perfil demográfico/segmentação da base
- **Métricas:**
  - Distribuição de valores por campo personalizado (via `CustomFieldsContacts`)
  - Top valores mais frequentes
  - % de preenchimento por campo
- **Visualização:** Barras ou donut (varia por tipo de campo)
- **Filtros:** Campo específico, período

---

### 2.3 Mensagens / Atendimento

**Fonte de dados:** `Messages`, `Conversations`, `ChatModerators`, `Moderators`

**Endpoint existente que será estendido:** `response_time_metrics`

#### R15 — Volume de mensagens

- **Objetivo:** Medir carga de atendimento
- **Métricas:**
  - Mensagens enviadas vs recebidas por dia
  - Volume por canal (WhatsApp, Instagram, etc.)
  - Volume por tipo (texto, imagem, áudio, vídeo, documento)
- **Visualização:** Barras empilhadas (enviadas/recebidas) por dia + donut por canal
- **Filtros:** Canal, moderador, período

#### R16 — Tempo de resposta

- **Objetivo:** Medir SLA de atendimento
- **Métricas:**
  - Tempo médio de primeira resposta (primeira mensagem do operador após mensagem do contato)
  - Tempo médio de resposta geral
  - Distribuição por faixa: < 5min, 5-15min, 15-30min, 30min-1h, > 1h
  - Evolução do tempo médio ao longo do período
- **Visualização:** Indicadores (média, mediana, p95) + histograma de distribuição
- **Filtros:** Canal, moderador, período
- **Endpoint existente:** `response_time_metrics` — estender com distribuição por faixa e p95

#### R17 — Conversas ativas

- **Objetivo:** Monitorar fluxo de atendimento
- **Métricas:**
  - Conversas abertas vs fechadas por dia
  - Duração média das conversas (abertura até fechamento)
  - Total de conversas ativas no momento
  - Conversas por moderador
- **Visualização:** Linha (abertas/fechadas por dia) + indicador de ativas agora
- **Filtros:** Canal, período

#### R18 — Carga por atendente

- **Objetivo:** Distribuição de trabalho entre atendentes
- **Métricas:**
  - Conversas por moderador
  - Mensagens enviadas por moderador
  - Ranking de volume de atendimento
  - Comparativo entre atendentes
- **Visualização:** Tabela ranking + barras comparativas
- **Filtros:** Período

#### R19 — Status de entrega

- **Objetivo:** Monitorar saúde dos envios de mensagem
- **Métricas:**
  - Taxa de entrega: mensagens delivered / total sent
  - Taxa de leitura: mensagens read / total delivered
  - Taxa de erro: mensagens com erro / total
  - Breakdown por canal
- **Cálculo:** Baseado no campo `status` da Message (sent, delivered, read, error)
- **Visualização:** Funil (sent, delivered, read) + indicadores de taxa
- **Filtros:** Canal, período

#### R20 — Horários de atendimento

- **Objetivo:** Quando o time responde
- **Métricas:**
  - Mapa de calor: hora x dia da semana com volume de respostas do operador
  - Gaps: horários com mensagens recebidas mas sem resposta
  - Tempo médio de resposta por faixa horária
- **Visualização:** Heatmap 7x24 (similar ao R11 mas focado em respostas)
- **Filtros:** Moderador, período

---

### 2.4 Automações / Fluxos

**Fonte de dados:** `IGAutomations`, `IGAutomationsTriggers`, `IGAutomationsExecutions`

**Nenhum endpoint existente.**

> **Nota:** Os relatórios de taxa de sucesso/falha e drop-off por step foram removidos do catálogo. O modelo atual de execuções (`IGAutomationsExecutions`) não registra status de conclusão nem erro — apenas que a execução foi iniciada. Para viabilizar esses relatórios no futuro, seria necessário adicionar campos `status` (enum PENDING/IN_PROGRESS/COMPLETED/FAILED), `completedAt` (DateTime?) e `errorMessage` (String?) ao modelo, e atualizar o `HandlerIGAutomation` para gravar esses campos.

#### R21 — Execuções de automação

- **Objetivo:** Volume e tendência de uso dos fluxos
- **Métricas:**
  - Execuções por automação por dia/semana/mês
  - Total de disparos no período
  - Tendência (crescendo/diminuindo)
  - Contatos únicos impactados (COUNT DISTINCT contactId)
- **Visualização:** Linha (execuções por dia) + indicadores totais
- **Filtros:** Automação específica, período

#### R23 — Efetividade por trigger

- **Objetivo:** Quais gatilhos geram mais ação
- **Métricas:**
  - Execuções agrupadas por trigger (via `triggerId` em `IGAutomationsExecutions`)
  - Ranking de triggers por volume
  - Distribuição % entre triggers
- **Visualização:** Barras horizontais (ranking) + donut
- **Filtros:** Período

#### R25 — Top automações

- **Objetivo:** Ranking dos fluxos mais utilizados
- **Métricas:**
  - Automações ordenadas por total de execuções
  - Contatos únicos por automação
  - Automações inativas (0 execuções no período)
- **Visualização:** Tabela ranking com sparklines de tendência
- **Filtros:** Período

---

### 2.5 Broadcast / Campanhas

**Fonte de dados:** `BroadcastMessage`, `BroadcastMessageContacts`

**Nenhum endpoint existente.**

#### R26 — Performance de campanha

- **Objetivo:** Resultado detalhado de cada broadcast
- **Métricas:**
  - Total enviados (contatos no broadcast)
  - Entregues, lidos, erros (via status em `BroadcastMessageContacts`)
  - Taxa de entrega: entregues / enviados
  - Taxa de leitura: lidos / entregues
  - Taxa de erro: erros / enviados
- **Visualização:** Funil (enviados, entregues, lidos) + indicadores de taxa
- **Filtros:** Período

#### R27 — Histórico de broadcasts

- **Objetivo:** Timeline de todas as campanhas com métricas resumidas
- **Métricas:**
  - Lista cronológica de broadcasts
  - Métricas resumidas por campanha (enviados, entregues, lidos)
  - Comparativo entre campanhas (qual performou melhor)
- **Visualização:** Tabela cronológica com barras inline + comparativo
- **Filtros:** Canal, período

#### R28 — Alcance por segmento

- **Objetivo:** Como diferentes públicos respondem aos broadcasts
- **Métricas:**
  - Taxa de entrega e leitura segmentada por tag/condição usada no broadcast
  - Segmentos com melhor e pior performance
- **Visualização:** Tabela comparativa por segmento
- **Filtros:** Campanha específica

#### R29 — Melhor horário de envio

- **Objetivo:** Otimizar timing dos broadcasts
- **Métricas:**
  - Taxa de leitura agrupada por hora de envio do broadcast
  - Taxa de leitura por dia da semana
  - Horário/dia com melhor performance
- **Visualização:** Heatmap hora x dia da semana com taxa de leitura
- **Filtros:** Período

---

### 2.6 Agentes IA / Assistentes

**Fonte de dados:** `OpenaiAssistants`, `OpenaiAssistantsExecutions`, `OpenaiAssistantRatings`, `AgentSessions`, `LlmUsageLogs`

**Nenhum endpoint existente.**

#### R30 — Uso de agentes

- **Objetivo:** Volume de atendimento via IA
- **Métricas:**
  - Sessões por agente por dia/semana/mês
  - Duração média das sessões
  - Total de mensagens processadas por agente
  - Tendência de uso
- **Visualização:** Linha (sessões por dia) + barras por agente
- **Filtros:** Agente específico, período

#### R31 — Satisfação do atendimento IA

- **Objetivo:** Qualidade percebida pelo contato
- **Métricas:**
  - Média de rating (via `OpenaiAssistantRatings`)
  - Distribuição por nota (1-5 estrelas)
  - Tendência de satisfação ao longo do tempo
  - Agentes com melhor/pior avaliação
- **Visualização:** Indicador de média + histograma de notas + linha de tendência
- **Filtros:** Agente, período

#### R32 — Custo de IA

- **Objetivo:** Transparência de gasto com LLM
- **Métricas:**
  - Tokens consumidos por agente (via `LlmUsageLogs`)
  - Custo estimado por dia/semana/mês
  - Custo por sessão (tokens / sessões)
  - Breakdown por modelo (GPT-4, GPT-3.5, etc.)
- **Visualização:** Linha (custo por dia) + barras por agente + indicadores totais
- **Filtros:** Agente, modelo, período

#### R33 — Taxa de resolução

- **Objetivo:** Medir efetividade da IA
- **Métricas:**
  - Sessões completadas autonomamente vs transferidas para humano
  - Taxa de resolução: completadas / total
  - Tendência de resolução ao longo do tempo
- **Cálculo:** Sessão "completada" = sessão com `completedAt` preenchido e sem transferência para moderador. Sessão "transferida" = conversa que passou do agente para um moderador humano.
- **Visualização:** Donut (resolvido vs transferido) + linha de tendência
- **Filtros:** Agente, período

#### R34 — Comparativo humano vs IA

- **Objetivo:** Entender onde IA agrega mais valor
- **Métricas:**
  - Tempo médio de resposta: IA vs humano (mensagens de agente vs moderador)
  - Volume atendido: sessões IA vs conversas humanas
  - Satisfação comparada (se houver rating para ambos)
- **Visualização:** Barras comparativas lado a lado
- **Filtros:** Canal, período

---

### 2.7 Visão Geral / Dashboard

**Fonte de dados:** Todas as entidades — métricas consolidadas cross-domain.

**Endpoint existente que será estendido:** `insights_daily_metrics`, `insights_filter_options`

#### R35 — Dashboard principal

- **Objetivo:** Saúde geral do negócio em uma tela
- **Métricas:**
  - Contatos ativos (total e novos no período)
  - Conversas abertas agora
  - Cards no pipeline (total e por status)
  - Receita do mês (WON)
  - Mensagens enviadas/recebidas hoje
  - Sessões de IA ativas
- **Visualização:** Cards com indicadores + sparklines de tendência (7 dias)
- **Filtros:** Período
- **Endpoint existente:** `insights_daily_metrics` cobre 5 dessas métricas — estender com as demais

#### R36 — Comparativo de períodos

- **Objetivo:** Comparar qualquer métrica com o período anterior
- **Métricas:**
  - Qualquer métrica dos demais relatórios com "vs período anterior"
  - Delta absoluto e percentual
  - Comparação visual lado a lado
- **Visualização:** Cada card de métrica mostra valor atual + delta vs anterior
- **Filtros:** Período atual vs período comparação
- **Implementação:** Cada handler calcula a métrica para os dois períodos e retorna o delta

#### R37 — Resumo semanal/mensal

- **Objetivo:** Snapshot consolidado para acompanhamento periódico
- **Métricas:**
  - Top 10 métricas com tendência
  - Destaques: melhor vendedor, automação mais ativa, canal que mais cresceu
  - Alertas: métricas que pioraram > 20%
- **Visualização:** Layout de resumo com cards + mini gráficos
- **Filtros:** Semana ou mês

---

## 3. Filtros Padrão

Todos os relatórios compartilham um conjunto de filtros padrão via DTO:

| Filtro | Campo | Tipo | Obrigatório |
|--------|-------|------|-------------|
| Período início | `initialDate` | DateTime | Sim |
| Período fim | `finalDate` | DateTime | Sim |
| Canal | `channelId` | UUID | Não |
| Moderador | `moderatorId` | UUID | Não |
| Pipeline | `pipelineId` | UUID | Não (CRM only) |
| Automação | `automationId` | UUID | Não (Automações only) |
| Agente | `assistantId` | UUID | Não (IA only) |
| Tag | `tagId` | UUID | Não |

Filtros adicionais por domínio são especificados em cada relatório.

---

## 4. Padrão Técnico

### 4.1 Backend (chatfunnel-services)

Cada relatório segue o padrão existente:

```
src/modules/reports/
  controllers/
    reports.controller.ts          # Endpoints GET /reports/*
  services/
    reports.service.ts             # Orquestrador de handlers
  commands/
    crm-funnel/
      handler.ts                   # R01 - Funil de conversão
      dto.ts
    crm-revenue/
      handler.ts                   # R02 - Receita do pipeline
      dto.ts
    ...                            # Um diretório por relatório
    dashboard-summary/
      handler.ts                   # R35 - Dashboard principal
      dto.ts
  dtos/
    base-report.dto.ts             # Filtros padrão compartilhados
```

**Handler template:**

```typescript
export class CrmFunnelHandler extends CommandHandler<CrmFunnelResponse> {
  constructor(
    private readonly accountsRepo: AccountsRepository,
    private readonly kanbanCardsRepo: KanbanCardsRepository,
    private readonly redisService: RedisService,
  ) {
    super();
  }

  async handler(accountId: string, dto: CrmFunnelDto, timezone: string) {
    // 1. Check cache
    const cacheKey = `report:crm_funnel:${accountId}:${dto.hash()}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) return cached;

    // 2. Normalize dates
    const start = this.fixTimezone(dto.initialDate, timezone).toDate();
    const end = this.fixTimezone(dto.finalDate, timezone)
      .add(23, 'hours').add(59, 'minutes').add(59, 'seconds').toDate();

    // 3. Query
    const result = await this.kanbanCardsRepo.funnelByPipeline(
      accountId, start, end, dto.pipelineId,
    );

    // 4. Cache result
    await this.redisService.set(cacheKey, result, 900); // 15min TTL

    return result;
  }
}
```

### 4.2 Frontend (chatfunnel-front)

Nova seção "Relatórios" no menu principal com sub-páginas por domínio.

**Componentes:**

- `ReportFilters.vue` — barra de filtros reutilizável (período, canal, moderador)
- `MetricCard.vue` — card com valor, delta, sparkline
- `ReportChart.vue` — wrapper do Chart.js com configuração padrão
- `ReportTable.vue` — tabela de dados com ordenação e export
- `ReportHeatmap.vue` — mapa de calor hora x dia da semana

**Rota sugerida:**

```
/reports                    -> Dashboard principal (R35)
/reports/crm                -> CRM / Pipeline (R01-R07)
/reports/contacts           -> Contatos (R08-R14)
/reports/messages           -> Mensagens (R15-R20)
/reports/automations        -> Automações (R21, R23, R25)
/reports/broadcasts         -> Broadcasts (R26-R29)
/reports/agents             -> Agentes IA (R30-R34)
```

---

## 5. Priorização Sugerida

### Fase 1 — Fundação + CRM + Dashboard

Os relatórios mais solicitados e de maior impacto de negócio.

| Relatório | Motivo |
|-----------|--------|
| R35 — Dashboard principal | Porta de entrada, visão geral |
| R36 — Comparativo de períodos | Contextualiza todas as métricas |
| R01 — Funil de conversão | Métrica core de CRM |
| R02 — Receita do pipeline | Métrica financeira principal |
| R04 — Ranking motivos de perda | Já tem endpoint base |
| R08 — Crescimento de contatos | Já tem endpoint base |
| R16 — Tempo de resposta | Já tem endpoint base |

### Fase 2 — Detalhamento

| Relatório | Motivo |
|-----------|--------|
| R03 — Velocidade de vendas | Diferencial competitivo (audit trail) |
| R05 — Performance por vendedor | Gestão de equipe |
| R06 — Aging de oportunidades | Alertas proativos |
| R09 — Aquisição por canal | ROI de canais |
| R15 — Volume de mensagens | Dimensionamento de equipe |
| R19 — Status de entrega | Saúde operacional |

### Fase 3 — Automações + Broadcasts + IA

| Relatório | Motivo |
|-----------|--------|
| R21, R23, R25 — Automações | Volume e ranking |
| R26, R27, R29 — Broadcasts | Performance de campanhas |
| R30, R31, R32 — Agentes IA | Uso, satisfação e custo |

### Fase 4 — Avançados

| Relatório | Motivo |
|-----------|--------|
| R07 — Previsão de receita | Forecast |
| R10, R11, R12, R13, R14 — Contatos avançados | Segmentação profunda |
| R17, R18, R20 — Atendimento avançado | Otimização operacional |
| R28, R29 — Broadcast avançados | Otimização de campanhas |
| R33, R34 — IA avançados | Comparativos |
| R37 — Resumo semanal/mensal | Automatização de reports |

---

## 6. Relatórios Removidos (Inviáveis Atualmente)

| # Original | Nome | Motivo |
|------------|------|--------|
| #22 | Taxa de sucesso/falha | `IGAutomationsExecutions` não tem campo `status`, `completedAt` ou `errorMessage`. Erros são logados em arquivo (Winston), não no banco. |
| #24 | Análise de drop-off por step | `IGAutomationsStepsExecutions` registra início do step (`actualStep: true`) mas não conclusão. Impossível saber onde o fluxo parou. |

**Para viabilizar no futuro:** Adicionar migration com `status` (enum PENDING/IN_PROGRESS/COMPLETED/FAILED), `completedAt` (DateTime?) e `errorMessage` (String?) em `IGAutomationsExecutions`, e atualizar o `HandlerIGAutomation` para gravar esses campos.

---

## 7. Dependências e Riscos

| Item | Risco | Mitigação |
|------|-------|-----------|
| Queries pesadas em tabelas grandes | Lentidão em contas com alto volume | Indexes compostos + Redis cache (TTL 15min) |
| Timezone | Dados agregados incorretamente | Usar `fixTimezone()` existente + PostgreSQL `AT TIME ZONE` |
| Multi-tenancy | Vazamento de dados entre contas | `accountId` obrigatório em toda query (padrão existente) |
| Chart.js rendering | Performance com muitos pontos | Limitar séries temporais a 90 dias, agregar por semana/mês para períodos longos |
