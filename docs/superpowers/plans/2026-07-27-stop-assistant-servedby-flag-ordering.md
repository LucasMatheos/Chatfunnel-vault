# Stop Assistant — resetar `servedByAssistant` só no encerramento bem-sucedido (V2-only)

> **Status:** PLANO (o que precisa alterar). Nada será implementado agora — este documento descreve
> a mudança para execução futura. Decisão do usuário (2026-07-27): na falha do encerramento, **manter
> o flag `servedByAssistant`** (front continua mostrando "IA atendendo") e **deixar o erro estourar**
> (operador reclica "Encerrar").

## Contexto

O Assistant **legado** (OpenAI threads via `HandlerAssistant` / `expireAssistant`) será **desligado no
próximo mês**. A partir daí, só o **Agent V2** encerra conversas de IA. Este plano ajusta o
`StopAssistant` e o encerramento do V2 pensando nesse mundo V2-only, e de quebra corrige a
inconsistência de flag discutida.

Repo alvo: `chatfunnel-api` (Express + JavaScript puro; o `HandlerAgent.ts` é a exceção `.ts` que
compila para `dist/`).

## Problema (confirmado no código)

1. **Reset do flag antes do stop dar certo.** `StopAssistant.js` chama `HandlerAssistant.finishServedByAssistant()`
   (limpa `servedByAssistant` + emite `updated-chat`) **antes** de encerrar a sessão. Se o encerramento
   falhar depois, o front já mostra "sem IA atendendo" mas a IA ainda está ativa.

2. **O delete da sessão V2 é a ÚLTIMA etapa do `terminateSession`.** Em `HandlerAgent.terminateSession`
   (`HandlerAgent.ts`), no caminho `interrupted: true`, a ordem é:
   `cancelExpiration()` → `handleLifecycleAutomations("endSession")` (1712) → `persistOutcome(endReason)`
   (1714) → **`sessionsRepo.delete(sessionId)` (1715)**. Se as automações ou o `persistOutcome` lançarem,
   o **delete não roda** → a linha de `AgentSessions` sobrevive → a IA continua ativa. Com o reset
   antecipado, o flag já foi limpo → **inconsistência real** (UI diz "sem IA", IA viva).

3. **Gap mais amplo do V2 (a causa raiz).** O V2 **seta** `servedByAssistant: true` em
   `HandlerAgent.ts:1352-1353` (quando o agente assume), mas o `terminateSession` (1655-1725)
   **nunca limpa** esse flag. Hoje o único lugar que limpa no fluxo V2 é o `StopAssistant`. Todos os
   outros encerramentos V2 — `EXIT_WORD` (388, 423), `RATING_DONE` (1749, 1778), `ERROR` (1781),
   objetivo cumprido, expiração por inatividade — deixam `servedByAssistant` **preso em `true`** para
   sempre. Ou seja, o lugar certo do reset é **dentro do `terminateSession`, junto do delete**.

## Mudança proposta (recomendada) — limpar o flag dentro do `terminateSession`, após o delete

Mover o reset de `servedByAssistant` para **dentro do `terminateSession`**, imediatamente **após** cada
`sessionsRepo.delete(sessionId)` bem-sucedido. Isso torna o reset **atômico com o encerramento real**:

- Se `terminateSession` lançar antes do delete → o flag **não** é tocado (fica `true`) e o erro sobe →
  exatamente o comportamento escolhido ("manter flag + erro visível").
- Corrige de uma vez **todos** os caminhos de encerramento V2 (EXIT_WORD, RATING_DONE, ERROR, objetivo,
  expiração, e o INTERRUPTED do StopAssistant), não só o StopAssistant.
- É V2-nativo — não depende do `HandlerAssistant` legado, que está sendo aposentado.

### Pontos exatos a alterar

**`HandlerAgent.ts` — `terminateSession` (dois pontos de delete):**
- Após o delete do early-return de `awaitingRating` (`HandlerAgent.ts:1682`).
- Após o delete do caminho principal (`HandlerAgent.ts:1715`).

Em cada ponto, após o delete, limpar `servedByAssistant`/`servedByAssistantName` na linha de
`contactsChannels` (`contactId`+`channelId` da sessão, já em escopo nas linhas 1673-1675) — espelhando
o payload de `finishServedByAssistant` (`servedByAssistant: false, servedByAssistantId: null,
servedByAssistantName: null`). Usar o repositório/acesso a dados já disponível no `HandlerAgent`
(seguir o padrão do write que seta `true` em 1352-1353 — reutilizar o mesmo caminho de update).

Emissão de socket (`updated-chat`): o `StopAssistant` já emite ao final, então o caminho INTERRUPTED
não regride. **Verificar** se os demais caminhos (EXIT_WORD, expiração, etc.) precisam de um
`updated-chat` para refletir o flag no livechat; se sim, emitir dentro do `terminateSession` após o
reset (precisa do `accountId` — confirmar disponibilidade no contexto do handler). Registrar como item
de verificação, não assumir.

**`StopAssistant.js` — remover o reset antecipado no caminho V2:**
- Remover a chamada `await handlerAssistant.finishServedByAssistant();` que hoje roda **antes** do
  branch. O caminho V2 passa a ter o flag limpo pelo próprio `terminateSession` (após o delete).
- Manter o `global.signalR.emit("broadcast", { ... "updated-chat" ... })` no fim do handler e o
  `return res.status(200).json({})` — sem try/catch novo (o erro do `terminateSession` estoura para o
  error handler do `createRoute` → resposta de erro → interceptor global do front mostra; **não**
  adicionar catch redundante).

**Caminho legado (`else` do StopAssistant) — sem mudança.**
`expireAssistant` já chama `finishServedByAssistant` internamente (como primeira etapa, `HandlerAssistant.js:2858`).
Não vamos corrigir/tocar o legado (está sendo desligado). Consequência aceita: o caminho legado mantém
o reset antecipado atual até ser removido (ver Follow-ups).

## Alternativa mínima (não recomendada) — só no StopAssistant

Se quiser o menor diff possível e não mexer no `.ts`: no `StopAssistant.js`, mover a chamada
`finishServedByAssistant()` para **depois** do `terminateSession()` bem-sucedido, dentro do branch V2.
Corrige a inconsistência **apenas** no StopAssistant; deixa o gap amplo (item 3 acima) intacto. Como o
V2 é o que sobrevive ao desligamento, a versão recomendada (dentro do `terminateSession`) é mais correta
a longo prazo.

## Fora de escopo / Follow-ups (não neste plano)

- **Remover o branch legado do `StopAssistant`** e o require de `HandlerAssistant`, quando o Assistant
  legado for efetivamente desligado e não houver mais threads legadas vivas. Tarefa separada.
- **Mensagem SYSTEM "END"/"END_BLOCK"** hoje é escrita antes do encerramento; numa falha, fica um "END"
  enganoso. Não faz parte desta correção (decisão foi sobre o flag). Avaliar depois se deve ser
  condicional ao sucesso.
- **Janela residual ~1ms** entre o guard do `AgentSessionWorker` e o persist/send: já aceita e
  documentada no plano anterior. O guard da Task 2 **não muda** aqui.
- **`findByContactAndChannel` é `LIMIT 1` sem `ORDER BY`** (assume 1 sessão por contato+canal) —
  pré-existente, fora de escopo.

## Validação (manual — sem teste automatizado de banco)

`servedByAssistant` é um flag de UI + socket; a correção é de ordenação/localização, não de lógica de
banco. Validar manualmente após `npm run build:processor` (recompila `HandlerAgent.ts` → `dist/`):

1. **Sucesso V2:** iniciar conversa com Agent V2 (flag `true` no livechat) → "Encerrar" → confirmar
   flag vira `false`, linha `AgentSessions` removida, `updated-chat` no socket, resposta 200.
2. **Falha simulada V2:** forçar erro em `handleLifecycleAutomations("endSession")` ou `persistOutcome`
   (ex.: ambiente/mocks de dev) → "Encerrar" → confirmar que o flag **permanece `true`**, a linha
   **não** é removida, e a request retorna erro (operador vê a falha). Reclicar → encerra e limpa.
3. **Outros caminhos V2:** encerrar por EXIT_WORD / objetivo / expiração → confirmar que agora o flag
   também vira `false` (antes ficava preso em `true`).
4. **Idempotência:** "Encerrar" sem IA ativa → 200 `{}` + `updated-chat`, sem erro.

## Restrições (do repo)

- `chatfunnel-api` é JS/CommonJS; **exceção**: `HandlerAgent.ts` é `.ts` (compila para `dist/`) — editar
  TS aqui é o caso permitido.
- `@logger`/`alog`, nunca `console.log`. Multi-tenancy: todo write com `accountId`/escopo por
  contato+canal. Sem migrations (nenhum campo novo — reusa `servedByAssistant`).
- Git: sem commit automático, sem `Co-Authored-By`, branch `feature/...`.
- Claude **não** roda build; `npm run build:processor` é manual (usuário) — obrigatório porque a
  mudança principal está no `.ts` que roda a partir do `dist/`.
