# Atividade: Relatorios

## Contexto

Analise baseada na transcricao da reuniao `Weekly Dev _ Product - 2026_04_24`.

A decisao principal foi que a tela de relatorios nao deve ser apenas um dashboard fixo com varias metricas soltas. A proposta e ter uma tela de Relatorios com abas fixas, alguns graficos padrao e deixar relatorios mais especificos/dinamicos para a Intelligence.

## Decisao Principal

- Criar uma tela unica de Relatorios.
- Organizar os dados em abas.
- Manter alguns graficos fixos, principalmente funil.
- Permitir filtros por periodo, origem e UTM.
- Deixar analises mais especificas para a Intelligence gerar sob demanda.
- Evitar espalhar estatisticas em varias telas, como dentro de cada agente.

## Estrutura Da Tela

Abas sugeridas:

1. Geral
2. Flows / Automacoes
3. Funil
4. Agendamentos
5. Agentes / Colaboradores

## Aba Geral

Deve mostrar uma visao geral da operacao.

Metricas e componentes:

- Entrada de leads por origem.
- Quantidade total de leads.
- Leads ganhos.
- Leads perdidos.
- Faturamento.
- Agendamentos.
- Horario de maior fluxo.
- Melhor dia da semana.
- Historico de entrada de leads por dia.
- Ultimos acontecimentos/eventos.
- Horas economizadas pela IA.

Exemplo citado:

> Essa semana a IA trabalhou 350 horas para voce.

Tambem foi sugerido usar um grafico tipo heatmap para mostrar dias e horarios de maior movimento.

## Aba Flows / Automacoes

Metricas sugeridas:

- Quantidade de flows executados.
- Lista dos flows mais executados na semana.
- Eventos recentes de automacao.
- Cards mostrando automacoes executadas recentemente.

## Aba Funil

Essa foi uma das partes mais importantes da conversa.

Controles necessarios:

- Seletor de funil.
- Seletor de periodo.
- Filtros por origem/UTM quando aplicavel.

Metricas e graficos:

- Grafico visual do funil.
- Quantidade de leads que entraram no funil.
- Quantidade de leads por etapa/coluna.
- Quantidade de leads que avancaram entre etapas.
- Quantidade de leads marcados como ganhos.
- Taxa de conversao por etapa.
- Motivos de perda.

Tipos de leitura do funil:

- Funil absoluto: conversao sempre comparada com a entrada inicial.
- Funil relativo: conversao comparada com a etapa anterior.

## Aba Agendamentos

Metricas sugeridas:

- Quantidade de agendamentos.
- Ultimos agendamentos.
- Comparecimento.
- No-show.
- Tempo ate o agendamento.
- Quantidade media de mensagens ate o agendamento.
- Comparacao por origem/UTM.

Exemplos de comparacao:

- No-show por origem.
- Tempo ate agendamento por origem.
- Comparacao entre Meta e Instagram organico.

### Dependencia Importante

Para alimentar os relatorios de comparecimento e no-show, e necessario adicionar no calendario/agendamento uma forma de marcar:

- Compareceu.
- Nao compareceu / no-show.

Isso deve funcionar tanto para agendamento interno quanto para Google Calendar.

## Filtros

Os graficos devem permitir filtros por:

- Periodo.
- Origem.
- UTM source.
- UTM medium.
- UTM campaign.
- Outros campos de atribuicao/origem disponiveis.

A ideia e permitir comparar metricas como:

- Conversao por origem.
- Receita por origem.
- Tempo ate agendamento por origem.
- No-show por origem.
- Performance de cada canal.

## Agentes / Colaboradores

Deve existir uma visao por agente ou colaborador dentro da tela de relatorios.

Metricas sugeridas:

- Quantidade de leads abordados.
- Taxa de conversao do colaborador.
- Tempo de conversa.
- Tempo de resposta.
- Sentimento das respostas dos leads.
- Receita por colaborador.
- Agendamentos por colaborador.
- Comparecimento/no-show por colaborador.
- Carga de trabalho.
- Quantidade de leads ativos no CRM atribuidos ao colaborador.

Observacao:

Foi comentado que deixar estatisticas individuais dentro da tela de cada agente pode gerar confusao. A melhor abordagem e centralizar os relatorios e aplicar filtros por agente.

## Intelligence / Relatorios Dinamicos

Os relatorios mais especificos devem ser atendidos pela Intelligence.

Ideias discutidas:

- Criar componentes de graficos predefinidos.
- A IA retorna um payload estruturado para renderizar o grafico.
- Usar padroes similares a Chart.js.
- Criar cards de sugestao/insights.
- Permitir que o usuario peca graficos sob demanda.

Exemplo:

> Quero ver a evolucao de contatos dos ultimos 7 dias.

Nesse caso, a Intelligence identifica a intencao, busca os dados e renderiza o grafico adequado.

Tambem foi sugerido criar um MCP de relatorios, capaz de puxar as mesmas informacoes usadas nos graficos para a IA usar nas respostas.

## Mood / Sentimento

A metrica "temperatura media" foi questionada e provavelmente deve ser removida ou renomeada.

O conceito correto parece ser mood/sentimento da conversa.

Possiveis classificacoes:

- Lead quente.
- Lead frio.
- Estressado.
- Bravo.
- Chateado.
- Feliz.
- Neutro.

Possivel representacao:

- Escala de 0 a 100.
- Grafico oscilando entre sentimentos.
- Quantidade de leads quentes/frios.

Esse item depende da Intelligence estar pronta para analisar as conversas.

## Insights De Conversas

Foi sugerido adicionar insights baseados nas conversas, como:

- Top objecoes detectadas.
- Perguntas frequentes dos ultimos 30 dias.
- Resposta sugerida.
- Botao para adicionar pergunta/resposta na base da Intelligence ou FAQ do agente.

Exemplo:

O sistema detecta que muitas pessoas perguntaram sobre preco, mostra a pergunta recorrente, sugere uma resposta e permite adicionar isso na base do agente.

## Itens Incertos Ou Removidos

- "Temperatura media" como metrica solta nao ficou clara.
- ROAS/trafego foi citado, mas depois foi falado que a parte de trafego nao seria do escopo.
- Relatorios individuais dentro de cada agente devem ser evitados para nao duplicar telas.

## Resumo Da Tarefa

Implementar uma tela de Relatorios com abas fixas: Geral, Flows/Automacoes, Funil, Agendamentos e Agentes/Colaboradores.

A tela deve permitir filtros por periodo e origem/UTM. O funil deve ter metricas absolutas e relativas por etapa. A aba de agendamentos deve incluir quantidade, ultimos eventos, comparecimento/no-show, tempo ate agendamento e mensagens ate agendamento.

Relatorios mais avancados devem ser preparados para integracao com Intelligence, usando payloads/componentes de graficos dinamicos e cards de insights.

