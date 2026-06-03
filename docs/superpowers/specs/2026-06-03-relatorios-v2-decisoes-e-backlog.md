# Relatorios V2 — Decisoes de Produto e Backlog Repriorizado

**Data:** 2026-06-03
**Status:** Draft
**Autor:** Codex + Lucas
**Baseado em:**
- `docs/superpowers/specs/2026-05-24-relatorios-design.md`
- `docs/superpowers/specs/2026-05-28-relatorios-v2-arquitetura.md`
- `docs/research/atividade-relatorios.md`

---

## 1. Resumo Executivo

Os documentos anteriores seguem validos em dois niveis diferentes:

- o spec de `2026-05-24` continua sendo o **catalogo de metricas e possibilidades**
- o spec de `2026-05-28` continua sendo a **direcao tecnica backend**

O research da reuniao muda o **produto**.

Relatorios V2 nao deve nascer como uma colecao de 34 visoes independentes no front. A experiencia alvo passa a ser:

- **uma tela unica de Relatorios**
- **abas fixas**
- **graficos curados e recorrentes**
- **funil como elemento central**
- **filtros transversais por periodo e atribuicao**
- **analises ad hoc e dinamicas delegadas para Intelligence**

Em resumo: o catalogo de 34 relatarios continua util, mas como **biblioteca de metricas/primitivos**, nao como backlog de UI pagina por pagina.

---

## 2. Decisoes Fechadas

### 2.1 Estrutura do produto

Relatorios V2 deve ser apresentado em uma tela unica com 5 abas fixas:

1. Geral
2. Flows / Automacoes
3. Funil
4. Agendamentos
5. Agentes / Colaboradores

### 2.2 O que fica fixo no produto

As abas devem ter componentes curados e previsiveis:

- cards de metricas
- graficos de serie temporal
- rankings
- heatmaps
- funil visual
- listas de eventos recentes

O usuario nao deve depender da Intelligence para o basico de acompanhamento operacional.

### 2.3 O que vai para Intelligence

A Intelligence deve responder por:

- perguntas ad hoc
- comparacoes especificas nao previstas na tela
- graficos dinamicos sob demanda
- insights sobre conversas
- top objecoes e FAQs recorrentes
- metricas de mood / sentimento

### 2.4 Funil e a area core

A aba de Funil e prioridade alta e deve suportar duas leituras:

- **Funil absoluto**: conversao sempre comparada com a entrada inicial
- **Funil relativo**: conversao comparada com a etapa anterior

Isso precisa estar refletido no shape de resposta do backend e na UX.

### 2.5 Relatorios individuais por agente nao devem ser espalhados

As metricas por agente ou colaborador devem ficar centralizadas na tela de Relatorios, via filtros e recortes, em vez de criar estatisticas isoladas dentro de cada modulo de agente.

---

## 3. O Que Permanece Valido Dos Specs Anteriores

### 3.1 Do spec `2026-05-24`

Permanece valido:

- catalogo de metricas por dominio
- mapeamento de entidades fonte
- boa parte dos calculos sugeridos
- necessidade de filtros padrao
- priorizacao inicial de funil, dashboard, contatos e SLA
- riscos de performance, timezone e multi-tenancy

Deve mudar a leitura de:

- "34 relatorios viaveis" como se isso implicasse 34 telas ou 34 views de produto

### 3.2 Do spec `2026-05-28`

Permanece valido:

- criar `ReportsV2Module` em paralelo ao legado
- manter `engines + catalogo declarativo`
- separar engines reutilizaveis de casos especiais
- padronizar shapes de saida
- preservar multi-tenancy, soft delete e timezone

Deve mudar:

- a ordem de implementacao precisa seguir a UX definida pela reuniao, nao a simples cobertura do catalogo inteiro

---

## 4. Lacunas Novas Identificadas

### 4.1 Dominio de Agendamentos nao esta modelado no V2 atual

Agendamentos entrou como uma das 5 abas principais, mas nao existe como dominio proprio nos docs anteriores.

Metricas esperadas:

- quantidade de agendamentos
- ultimos agendamentos
- comparecimento
- no-show
- tempo ate o agendamento
- media de mensagens ate o agendamento
- comparativos por origem / UTM

Conclusao:

- e necessario adicionar um eixo funcional de **Agendamentos** ao backlog do Reports V2

### 4.2 Dependencia de dados para comparecimento e no-show

Os relatorios de agendamento dependem de persistir status de comparecimento:

- `COMPARECEU`
- `NO_SHOW`

Isso precisa existir tanto para agenda interna quanto para Google Calendar.

Sem esse status persistido, a aba de Agendamentos fica incompleta.

### 4.3 Origem e UTM viraram filtros de primeira classe

A reuniao eleva atribuicao para um papel transversal. Nao basta tratar UTM como detalhe de contato.

Precisamos suportar filtros e comparacoes por:

- origem
- `utmSource`
- `utmMedium`
- `utmCampaign`
- outros campos de atribuicao quando existirem

### 4.4 Gap tecnico ja conhecido em UTM

O vault ja documenta que:

- os campos nativos de UTM e ultimo agendamento ja existem em `Contacts`
- ainda faltam filtros UTM no `chatfunnel-core`
- ainda falta parte da exposicao desses dados no front

Conclusao:

- comparativos por origem/UTM nao devem ser vendidos como prontos antes de fechar esse gap cross-repo

### 4.5 Agentes IA e Agentes / Colaboradores nao sao a mesma coisa

O spec base tem um dominio `Agentes IA / Assistentes`.

A reuniao pede uma aba operacional de `Agentes / Colaboradores`, com foco em:

- leads abordados
- conversao por colaborador
- tempo de resposta
- receita por colaborador
- carga de trabalho
- agendamentos e no-show por colaborador

Conclusao:

- o produto precisa distinguir claramente:
  - metricas de IA
  - metricas de colaboradores humanos

---

## 5. Releitura Do Catalogo De 34 Relatorios

O catalogo atual passa a ter tres papeis:

### 5.1 Primitivos da tela fixa

Relatorios que viram componentes diretos das 5 abas.

Exemplos:

- `R35` Dashboard principal
- `R01` Funil de conversao
- `R02` Receita do pipeline
- `R04` Motivos de perda
- `R08` Crescimento de contatos
- `R11` Horarios de pico
- `R16` Tempo de resposta
- `R21` Execucoes de automacao

### 5.2 Fontes para composicao

Relatorios que nao precisam aparecer como pagina propria, mas podem alimentar cards, blocos ou visoes compostas dentro das abas.

Exemplos:

- `R05` Performance por vendedor
- `R15` Volume de mensagens
- `R19` Status de entrega
- `R25` Top automacoes
- `R30` Uso de agentes
- `R32` Custo de IA

### 5.3 Base para Intelligence

Relatorios ou metricas que fazem mais sentido como consulta dinamica ou insight assistido.

Exemplos:

- `R37` Resumo semanal/mensal
- comparativos muito especificos por origem
- cortes de dados muito pontuais
- leituras semanticas de conversa

---

## 6. Backlog Repriorizado

### Fase A — Alinhamento de produto e dados

Objetivo: preparar o terreno correto antes de expandir o catalogo.

- fechar o documento de produto da tela unica de Relatorios
- definir os componentes fixos de cada aba
- mapear origem/UTM como filtro transversal
- mapear quais entidades alimentam Agendamentos
- definir modelo de status de comparecimento/no-show

### Fase B — MVP da tela unica

Objetivo: entregar uma experiencia valida de relatorios, mesmo sem cobrir todo o catalogo.

Abas incluidas:

1. Geral
2. Funil
3. Flows / Automacoes

Escopo recomendado:

- cards principais de operacao
- entrada de leads por dia
- faturamento
- heatmap de fluxo
- funil visual
- ganhos, perdas e motivos de perda
- automacoes executadas
- eventos recentes

### Fase C — Filtros transversais

Objetivo: tornar os relatorios realmente analisaveis.

- periodo
- origem
- `utmSource`
- `utmMedium`
- `utmCampaign`
- seletor de funil
- filtro por agente / colaborador quando aplicavel

### Fase D — Agendamentos

Objetivo: cobrir a lacuna principal trazida pela reuniao.

- quantidade de agendamentos
- ultimos agendamentos
- comparecimento
- no-show
- tempo ate agendamento
- media de mensagens ate agendamento
- comparativos por origem / UTM

Precondicao:

- status de comparecimento persistido e confiavel

### Fase E — Agentes / Colaboradores

Objetivo: visao operacional por pessoa.

- leads abordados
- conversao por colaborador
- tempo de conversa
- tempo de resposta
- receita por colaborador
- agendamentos por colaborador
- comparecimento / no-show por colaborador
- carga de trabalho
- leads ativos atribuidos

### Fase F — Intelligence integrada

Objetivo: suportar relatorios dinamicos sem inflar a UI fixa.

- payload estruturado de graficos e cards
- componentes reutilizaveis para renderizacao
- endpoint ou MCP de reports para a IA consumir
- perguntas ad hoc com guardrails

### Fase G — Expansao do catalogo

Objetivo: completar o inventario de metricas conforme demanda real.

- popular configs restantes do catalogo
- implementar especiais de menor prioridade
- ativar cache quando o volume justificar

---

## 7. Repriorizacao Tecnica Recomendada

O plano tecnico do spec de `2026-05-28` deve ser reinterpretado assim:

### 7.1 Continua valendo

- `ReportsV2Module`
- orchestrator
- engines reutilizaveis
- specials
- coexistencia com legado

### 7.2 Deve mudar a ordem

Em vez de priorizar "1 relatorio de cada padrao" de forma abstrata, a prioridade deve ser:

1. suportar a tela `Geral`
2. suportar a tela `Funil`
3. suportar `Flows / Automacoes`
4. fechar infraestrutura de filtros por origem / UTM
5. introduzir dominio de `Agendamentos`
6. suportar `Agentes / Colaboradores`
7. plugar `Intelligence`

### 7.3 Consequencia pratica para backend

O backend deve pensar menos em "completar R01-R37 em ordem" e mais em:

- quais primitives cada aba precisa
- quais queries precisam ser compostas
- quais shapes o front e a Intelligence vao reaproveitar

---

## 8. Decisoes De Arquitetura De Produto

### 8.1 Reports curados e Intelligence precisam compartilhar base

Nao faz sentido ter duas fontes de verdade separadas.

Direcao:

- a tela fixa consome payloads padronizados
- a Intelligence reutiliza os mesmos payloads ou os mesmos provedores de dados

### 8.2 Relatorios dinamicos precisam de guardrails

Se houver modo de pergunta livre, ele deve seguir regras estritas:

- somente leitura
- `accountId` obrigatorio
- whitelist de tabelas
- timeout
- rate limit

### 8.3 Shapes padronizados continuam sendo uma boa decisao

Series temporais, rankings, heatmaps, funis e cards compostos continuam sendo os melhores blocos para:

- tela fixa
- exportacao futura
- Intelligence

---

## 9. Itens Fora Do MVP Imediato

Ficam fora do MVP inicial, salvo nova decisao:

- mood / sentimento de conversa
- top objecoes automaticas
- sugestao de resposta para FAQ
- ROAS / trafego fora do recorte atual
- proliferacao de dashboards secundarios por modulo

---

## 10. Proxima Acao Recomendada

Antes de implementar mais backend de reports, o proximo passo mais valioso e produzir um documento complementar de **escopo por aba**, contendo:

- objetivo da aba
- componentes visuais
- metricas mostradas
- filtros aceitos
- fonte de dados
- dependencias abertas

Isso reduz risco de construir o `ReportsV2Module` certo para a UX errada.
