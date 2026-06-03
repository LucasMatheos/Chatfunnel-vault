# Relatorios V2 — Escopo por Aba

**Data:** 2026-06-03
**Status:** Draft
**Autor:** Codex + Lucas
**Baseado em:**
- `docs/research/atividade-relatorios.md`
- `docs/superpowers/specs/2026-05-24-relatorios-design.md`
- `docs/superpowers/specs/2026-05-28-relatorios-v2-arquitetura.md`
- `docs/superpowers/specs/2026-06-03-relatorios-v2-decisoes-e-backlog.md`

---

## 1. Objetivo do documento

Detalhar o escopo funcional da tela unica de Relatorios V2 por aba, para alinhar:

- produto
- front
- `ReportsV2Module`
- futuras integracoes com Intelligence

Este documento define **o que cada aba precisa mostrar**. Nao define layout final pixel a pixel.

---

## 2. Regras gerais da tela

### 2.1 Estrutura fixa

A tela de Relatorios tera 5 abas fixas:

1. Geral
2. Flows / Automacoes
3. Funil
4. Agendamentos
5. Agentes / Colaboradores

### 2.2 Filtros compartilhados

Filtros globais da tela:

- periodo
- origem
- `utmSource`
- `utmMedium`
- `utmCampaign`

Filtros contextuais por aba:

- funil selecionado
- agente / colaborador
- canal
- automacao

### 2.3 Primitivos visuais padronizados

As abas devem ser compostas com poucos blocos reutilizaveis:

- `MetricCard`
- `TimeSeriesChart`
- `RankingList`
- `Heatmap`
- `FunnelChart`
- `EventFeed`
- `ComparisonTable`

### 2.4 Integracao com Intelligence

Tudo que for componente fixo da tela deve idealmente reutilizar shapes que possam ser consumidos depois pela Intelligence.

---

## 3. Aba Geral

### 3.1 Objetivo

Entregar uma leitura executiva e operacional rapida da conta no periodo filtrado.

### 3.2 Componentes

- cards principais de KPI
- grafico de entrada de leads por dia
- breakdown de leads por origem
- heatmap de fluxo por dia/hora
- lista de acontecimentos recentes
- card de horas economizadas pela IA

### 3.3 Metricas

- quantidade total de leads
- leads ganhos
- leads perdidos
- faturamento
- agendamentos
- horario de maior fluxo
- melhor dia da semana
- historico de entrada de leads por dia
- horas economizadas pela IA

### 3.4 Filtros

- periodo
- origem
- `utmSource`
- `utmMedium`
- `utmCampaign`
- canal

### 3.5 Fontes de dados

- `Contacts`
- `ContactsChannels`
- `KanbanCards`
- `Messages`
- `Conversations`
- `AgentSessions` ou fonte equivalente de IA
- possivel fonte de eventos recentes cross-domain

### 3.6 Relatorios base reaproveitados

- `R35` Dashboard principal
- `R08` Crescimento de contatos
- `R09` Aquisicao por canal
- `R11` Horarios de pico
- partes de `R02` Receita do pipeline

### 3.7 Dependencias abertas

- definir como calcular `horas economizadas pela IA`
- definir shape e fonte de `ultimos acontecimentos/eventos`
- validar se `origem` vem de `fromPlatform`, canal, UTM ou combinacao desses conceitos

### 3.8 Escopo MVP

Entram no MVP:

- cards de leads, ganhos, perdidos, faturamento
- serie temporal de entrada de leads
- heatmap de fluxo
- eventos recentes basicos

Podem ficar para P2:

- horas economizadas pela IA
- breakdown mais sofisticado por origem

---

## 4. Aba Flows / Automacoes

### 4.1 Objetivo

Mostrar volume, recorrencia e atividade recente das automacoes.

### 4.2 Componentes

- card de total de execucoes
- serie temporal de execucoes
- ranking de flows mais executados
- feed de eventos recentes de automacao
- cards/lista de automacoes executadas recentemente

### 4.3 Metricas

- quantidade de flows executados
- top flows da semana
- total de disparos no periodo
- contatos unicos impactados
- eventos recentes de automacao

### 4.4 Filtros

- periodo
- automacao
- origem quando fizer sentido
- `utmSource`
- `utmMedium`
- `utmCampaign`

### 4.5 Fontes de dados

- `IGAutomations`
- `IGAutomationsTriggers`
- `IGAutomationsExecutions`

### 4.6 Relatorios base reaproveitados

- `R21` Execucoes de automacao
- `R23` Efetividade por trigger
- `R25` Top automacoes

### 4.7 Dependencias abertas

- definir se `eventos recentes` vem do banco atual ou de log/event stream
- confirmar se atribuicao por origem/UTM realmente faz sentido para todas as automacoes

### 4.8 Escopo MVP

Entram no MVP:

- total de execucoes
- serie temporal
- ranking de flows mais executados

Podem ficar para P2:

- feed rico de eventos
- comparativos mais detalhados por trigger

---

## 5. Aba Funil

### 5.1 Objetivo

Ser a area central de leitura comercial do produto.

### 5.2 Componentes

- seletor de funil
- cards de resumo
- grafico visual do funil
- alternancia entre modo absoluto e relativo
- tabela/lista por etapa
- bloco de motivos de perda

### 5.3 Metricas

- quantidade de leads que entraram no funil
- quantidade de leads por etapa
- quantidade de leads que avancaram entre etapas
- quantidade de ganhos
- taxa de conversao por etapa
- motivos de perda
- receita do funil

### 5.4 Filtros

- funil
- periodo
- origem
- `utmSource`
- `utmMedium`
- `utmCampaign`
- colaborador quando aplicavel

### 5.5 Fontes de dados

- `KanbanCards`
- `KanbanCardsHistory`
- `KanbanColumns`
- `KanbanLossesReasons`
- `KanbanCardsModerators`
- `Contacts`

### 5.6 Relatorios base reaproveitados

- `R01` Funil de conversao
- `R02` Receita do pipeline
- `R04` Ranking de motivos de perda
- `R05` Performance por vendedor
- `R07` Previsao de receita, se houver interesse futuro

### 5.7 Requisito funcional critico

O backend precisa suportar os dois modos:

- **Absoluto**: cada etapa comparada com a entrada inicial
- **Relativo**: cada etapa comparada com a etapa anterior

Isso provavelmente exige o `FunnelChart` receber:

- `stages`
- `totalEntered`
- `conversionAbsolute`
- `conversionRelative`
- `advancedFromPrevious`

### 5.8 Dependencias abertas

- definir com precisao o conceito de `entrou no funil`
- definir se filtro por UTM/origem sera aplicado pelo contato do card ou pela atribuicao original do lead
- validar performance das queries com historico de movimentacao

### 5.9 Escopo MVP

Entram no MVP:

- seletor de funil
- funil visual
- modo absoluto/relativo
- ganhos, perdas e motivos de perda

Podem ficar para P2:

- receita detalhada
- comparativos por colaborador dentro da mesma aba

---

## 6. Aba Agendamentos

### 6.1 Objetivo

Mostrar a eficiencia da operacao em transformar leads em compromissos e comparecimento.

### 6.2 Componentes

- cards de agendamentos totais, comparecimento e no-show
- serie temporal de agendamentos
- lista de ultimos agendamentos
- comparativo por origem/UTM
- tabela de tempo ate agendamento
- card ou histograma de mensagens ate agendamento

### 6.3 Metricas

- quantidade de agendamentos
- ultimos agendamentos
- comparecimento
- no-show
- taxa de comparecimento
- tempo medio ate o agendamento
- quantidade media de mensagens ate o agendamento
- comparacao por origem / UTM

### 6.4 Filtros

- periodo
- origem
- `utmSource`
- `utmMedium`
- `utmCampaign`
- colaborador
- canal

### 6.5 Fontes de dados

Ainda precisa ser fechado, mas provavelmente envolve:

- entidade de calendario/agendamento interno
- integracao Google Calendar
- `Contacts`
- `Messages`
- talvez `Conversations`

### 6.6 Relatorios base

Nao existe equivalente explicito no catalogo atual. Esta aba e um **novo dominio funcional** para Reports V2.

### 6.7 Dependencias abertas

- persistir status de comparecimento:
  - `COMPARECEU`
  - `NO_SHOW`
- unificar agenda interna e Google Calendar
- definir como calcular `tempo ate agendamento`
- definir como calcular `mensagens ate agendamento`
- definir a entidade fonte canonical para cada evento de agendamento

### 6.8 Escopo MVP

Sem as dependencias de status resolvidas, o MVP realista e:

- quantidade de agendamentos
- ultimos agendamentos
- serie temporal basica

Somente entram depois da modelagem correta:

- comparecimento
- no-show
- taxa de comparecimento
- comparativos completos por origem

---

## 7. Aba Agentes / Colaboradores

### 7.1 Objetivo

Dar uma visao operacional por pessoa sem espalhar dashboards em outros modulos.

### 7.2 Componentes

- seletor de colaborador
- ranking de colaboradores
- cards de produtividade
- serie temporal por colaborador
- tabela comparativa

### 7.3 Metricas

- quantidade de leads abordados
- taxa de conversao do colaborador
- tempo de conversa
- tempo de resposta
- receita por colaborador
- agendamentos por colaborador
- comparecimento / no-show por colaborador
- carga de trabalho
- quantidade de leads ativos atribuidos

### 7.4 Filtros

- periodo
- colaborador
- origem
- `utmSource`
- `utmMedium`
- `utmCampaign`
- funil
- canal

### 7.5 Fontes de dados

- `Moderators`
- `ChatModerators`
- `Messages`
- `Conversations`
- `KanbanCardsModerators`
- `KanbanCards`
- futura fonte de agendamentos

### 7.6 Relatorios base reaproveitados

- `R05` Performance por vendedor
- `R16` Tempo de resposta
- `R18` Carga por atendente
- parte de `R17` Conversas ativas

### 7.7 Dependencias abertas

- definir criterio de `lead abordado`
- definir criterio de `tempo de conversa`
- separar claramente metricas de humano vs IA
- dependencias de agendamento para completar comparecimento/no-show por colaborador
- sentimento das respostas depende de Intelligence e nao deve entrar no MVP base

### 7.8 Escopo MVP

Entram no MVP:

- ranking de colaboradores
- tempo de resposta
- carga de trabalho
- conversao e receita quando houver vinculo claro

Ficam para P2:

- agendamentos por colaborador
- comparecimento/no-show por colaborador
- sentimento das respostas

---

## 8. Relacao com o Backend V2

### 8.1 O que o `ReportsV2Module` precisa entregar primeiro

Primitives prioritarios:

- `metric-card`
- `time-series`
- `ranking`
- `heatmap`
- `funnel`
- `event-feed` ou shape equivalente

### 8.2 Ordem recomendada de implementacao backend

1. primitives da aba `Geral`
2. primitives da aba `Funil`
3. primitives da aba `Flows / Automacoes`
4. filtros transversais de origem / UTM
5. modelagem de `Agendamentos`
6. views de `Agentes / Colaboradores`

### 8.3 Consequencia para o catalogo

O catalogo de 34 relatorios deve ser mapeado para:

- `base da tela fixa`
- `fonte de composicao`
- `fonte da Intelligence`

Nao e necessario criar uma rota de UI para cada item do catalogo.

---

## 9. Fora do escopo imediato

Ficam fora da primeira entrega:

- mood / sentimento
- top objecoes automaticas
- FAQ detectada por IA
- relatorios livres por prompt diretamente na tela fixa
- qualquer leitura forte de ROAS/trafego fora do recorte atual

---

## 10. Proxima acao recomendada

Depois deste documento, o proximo artefato ideal e um **mapping tecnico por aba**, com:

- endpoint V2 candidato
- primitive visual esperada
- tabelas envolvidas
- risco de performance
- dependencia de modelagem
- status `MVP`, `P2` ou `Blocked`
