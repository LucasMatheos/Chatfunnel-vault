---
title: Agents V2 vs Assistant Legado — Bugs no Fluxo de Execução
description: Riscos concretos encontrados lendo o código dos dois sistemas de IA conversacional — race conditions, erros engolidos, mensagens perdidas.
tags: [gotcha, agents-v2, assistant-legado, ai-agents, race-condition]
severity: alta
related: ["[[agents-v2-execucao-vs-assistant-legado]]", "[[ai-agents]]"]
last_updated: 2026-08-25
---

# Agents V2 vs Assistant Legado — Bugs no Fluxo de Execução

Levantamento feito lendo o código dos dois fluxos de ponta a ponta (ver
[[agents-v2-execucao-vs-assistant-legado]] pro passo a passo). Cada item é fundamentado
em código lido — não é especulação. Nada aqui foi corrigido ainda, exceto o item 0.

## Índice

| # | Sistema | Bug | Severidade |
|---|---|---|---|
| 0 | Agents V2 | Envelope JSON vazio caía no fallback de texto puro | **corrigido** |
| 1 | Agents V2 | Race de 200ms na criação de sessão lança erro não tratado | alta |
| 2 | Agents V2 | Cap de iterações do worker abandona mensagens do buffer | alta |
| 3 | Agents V2 | Mensagens descartadas (não bufferizadas) durante pausa por loop | alta |
| 4 | Agents V2 | Término duplo de sessão → exceção Prisma não tratada | média |
| 5 | Agents V2 | Persistência de mensagem enviada é fire-and-forget | média |
| 6 | Agents V2 | Assimetria de falha parcial: texto aborta, JSON continua | baixa |
| 7 | Agents V2 | Timeout de tool MCP não cancela a chamada subjacente | baixa |
| 8 | Agents V2 | Guarda SSRF do MCP é opt-in (env var), não padrão | média |
| 9 | Agents V2 | `MAX_TOOL_ITERATIONS` duplicado hardcoded nos 2 providers | baixa |
| 10 | Legado | `sendButtons` (plural) manda `undefined` no fallback de erro | alta |
| 11 | Legado | `AssistantWebsocket` desativado (`return` na conexão) | baixa/dúvida |
| 12 | Legado | 2ª falha de run (não rate-limit) → silêncio total pro contato | alta |
| 13 | Legado | Debounce depende de `setTimeout` em memória do processo | alta (suspeita) |
| 14 | Agents V2 | Modelos novos rejeitam `temperature` no payload | **corrigido** |
| 16 | Agents V2 | Contexto de mensagem respondida não chega ao LLM | média |

---

## Agents V2

### #0 — Envelope JSON vazio caía no fallback de texto puro (CORRIGIDO)

`HandlerAgent.ts:849-880` (`sendResponseToContact`). O agente pode legitimamente
retornar `{"messages":[]}` (decidiu não responder nesse turno). O código checava
`structured?.messages?.length`, que é `0` tanto pra esse caso válido quanto pra JSON
inválido — as duas situações caíam no fallback de texto puro, e o contato recebia a
string crua `{"messages":[]}` no chat. Fix: branch em `structured !== null` (envelope
válido) em vez de `.length` (tem itens). Ver plano
`docs/superpowers/plans/2026-08-07-agents-v2-empty-json-fallback-fix.md`.

### #1 — Race de 200ms na criação de sessão lança erro não tratado

`HandlerAgent.ts:528-539` (`findOrCreateSession`). Se `acquireSessionCreate` falhar
(outro processo já está criando), o código espera 200ms fixos e reconsulta; se o
`INSERT` concorrente ainda não comitou, lança `Error("session creation race...")` sem
catch, propagando até `HandlerIGAutomation.js`/`handleActiveAgentSession.js` sem
tratamento visível.

**Cenário:** duas mensagens quase simultâneas do mesmo contato, num momento de latência
elevada de DB → a segunda mensagem falha em vez de aguardar a sessão real ser criada.

### #2 — Cap de iterações do worker abandona mensagens do buffer

`AgentSessionWorker.ts:184-191`. Ao bater `MAX_PROCESSING_ITERATIONS` (10), o loop só
`break`s — não chama `checkAndRelease` nem agenda reprocessamento. O lock é liberado no
`finally`, mas mensagens que ainda estão no buffer ficam órfãs até a *próxima* mensagem
não relacionada do contato disparar um novo `execute()`.

`addReprocessSessionJob` (`queue/AgentSessionQueue.ts:82-92`) existe e é exportado
(`queue/index.ts:4`) mas **nunca é chamado** em lugar nenhum — dead code que descreve um
comportamento não coberto exatamente neste caminho de saída.

### #3 — Mensagens descartadas durante pausa por loop

`HandlerAgent.ts:397-403` (checa `session.ignoreMessages` e `return` **antes** de
`agentMessageBuffer.enqueue`, linha 453) + `:1828-1852` (`pauseForLoop`).

**Cenário:** detecção de loop dispara (falso positivo plausível — humano real mandando
mensagens rápidas por ansiedade pode bater no threshold de 15/300s); o contato manda
2-3 mensagens de esclarecimento antes de notar/clicar em "Continuar atendimento" — essas
mensagens nunca chegam ao buffer, perdidas pra sempre. `resumeLoop` (`:1883`) só
reagenda processamento se `agentMessageBuffer.hasPending`, que será `false`.

### #4 — Término duplo de sessão → exceção Prisma não tratada

`HandlerAgent.ts:1985` (`sessionsRepo.delete(sessionId)`, sem try/catch — lança `P2025`
se já não existir). `StopAssistant.js:152-161` e `ExpireAgentWorker.js` chamam
`terminateSession` sem `agentSessionLock`, com check-then-act não atômico.

**Cenário:** expiração automática dispara no exato momento em que um operador clica
"Encerrar", ou o worker está terminando por outro motivo (exit word). O segundo
`delete` lança — em `ExpireAgentWorker` é engolido por catch geral; em
`StopAssistant.js` derruba a resposta HTTP com 500 mesmo já tendo commitado o
bloqueio/log. Se a corrida for com o worker BullMQ, os 3 retries falham igual e o
contato pode receber um `errorMessage` espúrio pra uma sessão que já terminou normalmente.

### #5 — Persistência de mensagem enviada é fire-and-forget

`HandlerAgent.ts:924-930,1089-1095,1255-1261` (e outros `sendXToContact`):
`persistOutgoingMessage(...).catch(...)`, nunca `await`ado.

**Cenário:** processo cai (deploy/crash/restart) entre a API do WhatsApp/Instagram
confirmar o envio e a promise de persistência resolver → mensagem entregue ao contato,
nunca gravada em `Messages` — furo silencioso no histórico/CRM.

### #6 — Assimetria de falha parcial entre texto e estruturado

`sendTextChunks` aborta os chunks restantes no primeiro erro (`:932-938`, `break`);
`dispatchStructuredResponse` captura erro por item e **continua** pro próximo
(`:1164-1166`, sem `break`). Não é necessariamente errado, mas é assimetria não
documentada — pode confundir debugging de entrega parcial.

### #7 — Timeout de tool MCP não cancela a chamada subjacente

`tools/mcp/McpClientManager.ts:252-266` (`withTimeout` via `Promise.race`) — ao vencer o
timeout, a promise original de `listTools`/`callTool` continua rodando em background,
sem `AbortController`. Não corrompe a resposta ao LLM, mas pode deixar handles do
transporte MCP pendentes, e respostas tardias do servidor MCP são descartadas no vácuo.

### #8 — Guarda SSRF do MCP é opt-in

`McpClientManager.ts:45,268-288` — `BLOCK_PRIVATE_IPS` só bloqueia localhost/IPs
privados se a env var estiver `"true"`. Postura "default aberta": vale confirmar se é
intencional em produção — uma conexão MCP mal configurada (ou maliciosa) pode apontar
pra IPs internos da infra.

### #9 — `MAX_TOOL_ITERATIONS` duplicado hardcoded

`providers/AnthropicHandlerAgent.ts:22` e `providers/OpenAIHandlerAgent.ts:24` — mesmo
valor (`10`) copiado literalmente nos dois arquivos. Risco de manutenção: alguém ajusta
um e esquece o outro. Note que é diferente de `MAX_PROCESSING_ITERATIONS`
(`AgentSessionWorker.ts:24-25`, via env var) — nomes parecidos, caps de loops
diferentes (tool-calling dentro de 1 turno vs. drenagem de buffer entre turnos).

### #14 - Modelos novos rejeitam `temperature` no payload (CORRIGIDO)

`AgentSessionWorker` repassava o valor salvo em `Agents.temperature` e os providers
Anthropic e OpenAI sempre incluiam o campo na requisicao. Modelos novos podem rejeitar
esse parametro com HTTP 400, como `claude-sonnet-5` com
`` `temperature` is deprecated for this model. `` A correcao removeu o campo dos
payloads dos dois providers; o valor permanece salvo apenas por compatibilidade.

### #16 — Contexto de mensagem respondida não chega ao LLM

**Estado da correção (2026-08-25):** implementada no código-fonte e pendente de
compilação/validação focada. A referência é resolvida com escopo de conta, contato e
canal; o texto normalizado acompanha cada payload do buffer e é persistido como
metadado não confiável do turno USER. O seed de histórico aplica o mesmo envelope.
Não inclui URL ou payload bruto da mídia citada.

Para WhatsApp, `handleWhatsappMessage.js:54-58` encontra a mensagem original por
`request.context.id` e copia seu payload para `request.context.objMessage`. Para
Instagram, `handleInstagramMessage.js:58-62` faz o equivalente com
`request.message.reply_to.mid`. Essas referências permanecem no objeto `request` —
não são transferidas para `context`.

Em seguida, `HandlerAgent.execute` enfileira somente `context.message`, tipo, ID e
anexo; o worker persiste somente esse conteúdo como turno `USER`. Os providers montam
o histórico do LLM a partir de `AgentSessionMessages.content`, portanto a associação
"esta mensagem responde àquela" se perde. A mensagem original pode aparecer no
histórico cronológico, mas o agente não sabe que ela é o alvo da resposta.

**Cenário:** contato responde “sim” a uma pergunta antiga enquanto há outras mensagens
na conversa. O agente recebe apenas “sim” e pode interpretar o contexto errado.

**Direção de correção:** propagar uma referência normalizada no `ProcessorContext` e
no `MessagePayload`, resolver/persistir o texto da mensagem citada e renderizá-lo no
envelope do turno como metadado explícito. Cobrir WhatsApp e Instagram com testes de
integração do pipeline até `buildLLMMessages`.

---

## Assistant Legado

### #10 — `sendButtons` (plural) manda `undefined` no fallback de erro

`HandlerAssistant.js:2601,2623`. Em `sendButtons(data = [], text)`, quando
`response.status` é falso (Cloud API rejeitou o botão), o código faz
`return this.sendTextOrAudio(data.text)` — mas `data` aqui é o **array** de botões
(`[{text,url}, ...]`), não objeto. `data.text` é `undefined`; `sendTextOrAudio` começa
com `if (!message) return null;` — não faz nada.

**Cenário:** Cloud API do WhatsApp rejeita uma mensagem de botões (ex.: mais de 3
botões) → contato não recebe nada, nem botões nem fallback de texto, sem log de erro
visível (só `console.error` cru, sem `addGptLog`). O singular `sendButton` não tem esse
bug — ali `data` de fato é `{text,url}`, então `data.text` funciona; parece copy-paste
do singular sem ajustar pro shape de array do plural.

### #11 — `AssistantWebsocket` desativado

`AssistantWebsocket.js:30` — `this.io.on("connection", async (socket) => { return; ...})`
logo na primeira linha. Todo o resto (disconnect/finish/start/message, linhas 31-85) é
código morto, nunca registrado. Não confirmado se é desativação deliberada (feature de
"testar assistant no builder" descontinuada) ou `return` de debug esquecido — se alguém
no front ainda tenta usar esse socket, a experiência é "nada acontece", sem erro.

### #12 — 2ª falha de run (não rate-limit) → silêncio total pro contato

`HandlerAssistant.js:616-619` (`handleResponse`). Se `run.status !== "completed"` (por
timeout de 3min de polling ou status `failed`/`cancelled`/`expired`) e não é
`rate_limit_exceeded`: 1ª falha tenta `handleRetryFailedRun` (recria a thread do zero);
se a 2ª tentativa falhar por qualquer motivo que não seja rate-limit, o código loga
"already retried" e `return null` — sem `errorMessage`, sem alertar ninguém. O caller
trata `null` só com log.

**Cenário:** dois timeouts consecutivos de 3min (~6min totais) num período de
instabilidade intermitente da API OpenAI (não rate-limit, ex.: 500/503) → o contato
nunca recebe resposta nem mensagem de erro, fica esperando indefinidamente.

### #13 — Debounce depende de `setTimeout` em memória do processo (suspeita)

`HandlerAssistant.js:2110` (`setTimeout(async () => {...}, 10000)`). As mensagens
debounced ficam em Redis (persistente), mas o **gatilho** que processa o buffer após
10s é um timer em memória do processo Node que recebeu o webhook. Não foi encontrado
mecanismo de recuperação (cron/job de fallback) nos arquivos lidos.

**Se a suspeita se confirmar:** um restart/deploy do `chatfunnel-api` nos 10s entre o
contato mandar uma mensagem e o timer disparar deixa essa mensagem no buffer Redis
indefinidamente — só é reprocessada se o contato mandar *outra* mensagem depois (o que
dispara um novo timer e junta tudo). Se não mandar mais nada, nunca é respondida, sem
erro visível em lugar nenhum. Contraste com o Agents V2 — usa BullMQ delay job, que
sobrevive restart.

### #15 — Envelopes JSON consecutivos eram enviados como texto bruto (CORRIGIDO)

Um provider pode devolver dois objetos estruturados consecutivos, por exemplo
`{"messages":[...]}\n{"messages":[...]}`. Isso não é um JSON único válido;
`parseStructuredResponse` falhava e `sendTextChunks` enviava o payload cru ao contato.

Correção: o parser agora separa objetos e arrays JSON de topo respeitando strings e
escapes, normaliza cada envelope e combina seus itens em uma única lista `messages`.
Se um payload que aparenta estruturado continuar inválido, a entrega é bloqueada e o
erro é registrado, em vez de expor JSON interno ao contato.
