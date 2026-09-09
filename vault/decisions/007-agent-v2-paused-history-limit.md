---
title: ADR — Limite do histórico sincronizado após pausa do Agent V2
tags: [decisions, adr, agents-v2, history]
date: 2026-08-19
status: active
related: ["[[summarization]]"]
---

# ADR: Limite do histórico sincronizado após pausa do Agent V2

## Contexto

Durante uma pausa para atendimento humano, a conversa completa continua em
`Messages`, mas as mensagens não entram em `AgentSessionMessages`. Na retomada, o
agente precisa recuperar contexto recente sem duplicar indefinidamente o histórico
canônico.

## Decisão

- Sincronizar no máximo as 150 mensagens legíveis `CONTACT`/`HUMAN` mais recentes.
- Manter o limite fixo e independente de `agent.maxContextMessages`.
- Usar `Messages` como histórico completo e canônico.
- Reutilizar o histórico que `AgentProviderRunner` já carrega antes da chamada à LLM.
- Encontrar a última mensagem anterior ao lote atual recuando
  `currentMessageCount` posições no histórico carregado.
- Não usar `rows.at(-1)` como cursor: o worker persiste o lote atual antes de
  carregar o histórico. Para um lote de uma mensagem, o cursor é `rows.at(-2)`;
  de forma geral, `rows.at(-(currentMessageCount + 1))`.
- Limitar a consulta ao timestamp de início do lote atual e remover do fim do
  resultado a mesma quantidade de mensagens persistidas pelo worker. Não usar
  `messageId` para essa exclusão: webhooks repetidos ou ambientes de teste podem
  reutilizar o mesmo identificador em mensagens diferentes.
- Consultar em `Messages` apenas o intervalo entre esse cursor e a primeira mensagem
  do lote atual, inserindo o resultado com `createMany`.
- Não usar marcador, lock ou TTL específicos no Redis; a sincronização ocorre sob o
  lock de sessão que o worker já mantém.
- Alterar diretamente o fallback de `getSessionHistory()` de 30 para 150.
- Preservar o argumento `limit` e valores persistidos em `agent.maxContextMessages`.
- Não alterar Services, Core, schema, valores existentes ou migrations.
- Enviar o system prompt separadamente; ele não consome a janela de mensagens.

## Alternativas consideradas

- Sincronizar todo o intervalo: descartado por aumentar escrita, armazenamento e
  risco de duplicidade sem ampliar a janela efetivamente enviada à LLM.
- Sincronizar `maxContextMessages - 1`: descartado para não acoplar a reconciliação
  ao formato atual do prompt e à inserção posterior da mensagem corrente.
- Marcar pausas no Redis: descartado porque exige ciclo de vida, TTL e limpeza de
  marcadores órfãos; a consulta direta reutiliza o histórico já necessário ao turno.

## Consequências

- A retomada tem custo limitado e previsível.
- Turnos normais verificam o intervalo em `Messages`; o histórico da sessão não recebe
  uma consulta adicional apenas para descobrir o cursor.
- Quando há inserção, o runner relê o histórico uma vez para entregar as mensagens
  sincronizadas à LLM; sem inserção, reutiliza o array já carregado.
- A mensagem atual pode deslocar a mais antiga das 150 sincronizadas para fora da
  primeira janela da LLM.
- Contexto anterior permanece recuperável em `Messages` e poderá ser compactado por
  sumarização em uma evolução futura.
