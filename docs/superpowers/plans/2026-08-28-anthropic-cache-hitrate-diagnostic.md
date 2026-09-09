# Anthropic Prompt Cache Hit-Rate Diagnostic Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to run this plan. This is a **read-only diagnostic**, not a code change — there is no TDD cycle (no application behavior to test), and no step in this plan connects to, queries, or executes anything against the database. Every SQL query produced here is handed to the user to run themselves.

**Goal:** Determine which of 3 hypotheses explains why manual cost tests on Haiku 4.5 / Sonnet 5 showed no prompt-caching savings, using only the `LlmUsageLogs` rows the production runtime already writes (`source = 'AGENT_RUNTIME'`, `provider = 'ANTHROPIC'`) — **no code or production behavior changes**.

**Architecture:** `AnthropicHandlerAgent.callLLM()` (`chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/providers/AnthropicHandlerAgent.ts:142-315`) already implements `cache_control` correctly (stable/volatile system split, last-tool marker, tool-loop tail marker) and already logs `cacheReadTokens`/`cacheCreationTokens` per call via `HandlerAgent.logLlmUsage()` (`HandlerAgent.ts:271-324`) into `LlmUsageLogs` (Prisma model, `chatfunnel-core/prisma/schema.prisma:3396-3447`). This plan writes SQL against that existing table to classify every logged Anthropic runtime call into one of: cache hit, miss (cache write only), miss (TTL likely expired), or first call in session — then aggregates those classifications into percentages that point at a root cause.

**Tech Stack:** Raw PostgreSQL (window functions — `LAG`, `EXTRACT(EPOCH FROM ...)`), run by the user via their DB client (psql, a GUI client, or whatever they normally use) against the shared `chatfunnel-database`.

## Global Constraints

- **This plan produces SQL, it never runs it.** Per workspace rules, no query here may be executed against a real database by an agent — every step below hands the query to the user and stops.
- No schema changes, no migrations, no new repository methods — everything needed already exists (`LlmUsageLogsRepository`, `LlmUsageLogs` table, both already populated by production traffic).
- No commits — this plan produces a documentation artifact under `docs/`; per workspace rules, commit only if the user explicitly asks.
- Every query must be parameterized by `accountId` (and optionally `agentId`) — never scan `LlmUsageLogs` unfiltered across accounts.

---

## File Structure

| Artefato | Ação | Responsabilidade |
|---|---|---|
| `docs/superpowers/plans/2026-08-28-anthropic-cache-hitrate-diagnostic.md` (este arquivo) | Já criado | Contém as 3 queries + a tabela de decisão — nenhum outro arquivo é necessário |

---

### Task 1: Escrever as queries de diagnóstico e a tabela de decisão

**Files:**
- Nenhum arquivo de código é criado ou modificado — as queries abaixo são o entregável final, para o usuário copiar e rodar no cliente de banco dele.

**Interfaces:**
- Consumes: `LlmUsageLogs` (campos: `sessionId`, `accountId`, `agentId`, `source`, `provider`, `createdAt`, `inputTokens`, `cacheReadTokens`, `cacheCreationTokens`, `isError` — todos confirmados em `chatfunnel-core/prisma/schema.prisma:3396-3447`).
- Produces: nenhuma interface de código — o output é texto (linhas de resultado SQL) que o usuário cola de volta para interpretação.

- [ ] **Step 1: Query detalhada — classifica cada chamada**

Substitua `<ACCOUNT_ID_AQUI>` pelo `accountId` testado (e opcionalmente descomente o filtro de `agentId`), depois rode contra o Postgres:

```sql
-- Detalhe por chamada: classifica cache_hit / miss_ttl_expired / miss_write_only /
-- first_call_in_session, com o intervalo (em segundos) desde a chamada anterior
-- na mesma sessão.
WITH runtime_calls AS (
  SELECT
    id,
    "sessionId",
    "createdAt",
    "inputTokens",
    "cacheReadTokens",
    "cacheCreationTokens"
  FROM "LlmUsageLogs"
  WHERE source = 'AGENT_RUNTIME'
    AND provider = 'ANTHROPIC'
    AND "isError" = false
    AND "accountId" = '<ACCOUNT_ID_AQUI>'
    -- AND "agentId" = '<AGENT_ID_AQUI>'  -- opcional: restringe a um agente
    AND "createdAt" >= now() - interval '7 days'
),
with_gaps AS (
  SELECT
    *,
    LAG("createdAt") OVER (PARTITION BY "sessionId" ORDER BY "createdAt") AS prev_call_at,
    EXTRACT(EPOCH FROM (
      "createdAt" - LAG("createdAt") OVER (PARTITION BY "sessionId" ORDER BY "createdAt")
    )) AS gap_seconds
  FROM runtime_calls
)
SELECT
  "sessionId",
  "createdAt",
  "inputTokens",
  "cacheReadTokens",
  "cacheCreationTokens",
  gap_seconds,
  CASE
    WHEN prev_call_at IS NULL THEN 'first_call_in_session'
    WHEN "cacheReadTokens" > 0 THEN 'cache_hit'
    WHEN "cacheCreationTokens" > 0 AND gap_seconds > 300 THEN 'miss_ttl_expired'
    WHEN "cacheCreationTokens" > 0 THEN 'miss_write_only'
    ELSE 'no_cache_activity'
  END AS classification
FROM with_gaps
ORDER BY "sessionId", "createdAt";
```

- [ ] **Step 2: Query agregada — percentual por classificação**

Mesma janela de dados, mas resumida em contagem/percentual (rode com o mesmo `accountId` substituído):

```sql
-- Resumo: % de chamadas em cada classificação, na mesma janela de 7 dias.
WITH runtime_calls AS (
  SELECT
    "sessionId",
    "createdAt",
    "cacheReadTokens",
    "cacheCreationTokens"
  FROM "LlmUsageLogs"
  WHERE source = 'AGENT_RUNTIME'
    AND provider = 'ANTHROPIC'
    AND "isError" = false
    AND "accountId" = '<ACCOUNT_ID_AQUI>'
    AND "createdAt" >= now() - interval '7 days'
),
with_gaps AS (
  SELECT
    *,
    LAG("createdAt") OVER (PARTITION BY "sessionId" ORDER BY "createdAt") AS prev_call_at,
    EXTRACT(EPOCH FROM (
      "createdAt" - LAG("createdAt") OVER (PARTITION BY "sessionId" ORDER BY "createdAt")
    )) AS gap_seconds
  FROM runtime_calls
),
classified AS (
  SELECT
    CASE
      WHEN prev_call_at IS NULL THEN 'first_call_in_session'
      WHEN "cacheReadTokens" > 0 THEN 'cache_hit'
      WHEN "cacheCreationTokens" > 0 AND gap_seconds > 300 THEN 'miss_ttl_expired'
      WHEN "cacheCreationTokens" > 0 THEN 'miss_write_only'
      ELSE 'no_cache_activity'
    END AS classification
  FROM with_gaps
)
SELECT
  classification,
  count(*) AS calls,
  round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
FROM classified
GROUP BY classification
ORDER BY calls DESC;
```

- [ ] **Step 3: Query de contexto — quantas sessões tiveram só 1 chamada**

Isola diretamente a hipótese "teste de request único" (uma sessão com 1 única chamada nunca pode ter cache hit — não existe chamada anterior pra ler):

```sql
-- % de sessões que tiveram apenas 1 chamada Anthropic na janela — essas nunca
-- podem mostrar cache_hit, mesmo com tudo implementado corretamente.
SELECT
  count(*) FILTER (WHERE call_count = 1) AS sessions_single_call,
  count(*) AS sessions_total,
  round(100.0 * count(*) FILTER (WHERE call_count = 1) / count(*), 1) AS pct_single_call
FROM (
  SELECT "sessionId", count(*) AS call_count
  FROM "LlmUsageLogs"
  WHERE source = 'AGENT_RUNTIME'
    AND provider = 'ANTHROPIC'
    AND "isError" = false
    AND "accountId" = '<ACCOUNT_ID_AQUI>'
    AND "createdAt" >= now() - interval '7 days'
  GROUP BY "sessionId"
) sessions;
```

- [ ] **Step 4: Tabela de decisão — interpretar os resultados**

Depois de rodar as 3 queries, use esta tabela para mapear o padrão observado à hipótese:

| Padrão observado | Hipótese confirmada | Ação recomendada |
|---|---|---|
| `pct_single_call` (Step 3) alto (ex.: >50%) **e** `first_call_in_session` domina o resumo (Step 2) | **H1 — teste de request único.** Cache só compensa a partir da 2ª chamada com o mesmo prefixo; a 1ª sempre grava (paga ~1.25x), nunca lê. | Refazer o teste enviando ≥2 mensagens na mesma sessão, dentro de poucos minutos, e comparar o custo da 2ª chamada em diante. |
| `miss_ttl_expired` (Step 2) é uma fatia relevante (ex.: >20%) | **H2 — intervalo maior que a TTL de 5 min entre mensagens de teste.** O cache expira e a próxima chamada reescreve em vez de ler. | Reenviar mensagens de teste com intervalo curto (<5 min). Se o padrão real de uso do agente tiver gaps longos entre turnos, considerar `cache_control: { type: 'ephemeral', ttl: '1h' }` no bloco `stable` do system prompt (`AnthropicHandlerAgent.ts:189-195`) — mudança de código separada, fora deste plano. |
| `cache_hit` (Step 2) é uma fatia não-trivial (ex.: >20-30%) apesar de o teste do usuário não ter mostrado economia visível | **H3 — métrica errada sendo observada.** O cache está funcionando (dados provam), mas a comparação foi feita por custo total da fatura, não por `cacheReadTokens`/`cacheCreationTokens` por chamada — e o custo do cache é só uma fração do custo do agente (`output_tokens` normalmente domina). | Nenhuma mudança de código. Reportar de volta que o caching já está ativo e funcionando; se a economia esperada ainda não aparece na fatura, o próximo passo é medir `costUsd` agregado por `classification` (extensão trivial da query do Step 1) para quantificar o real impacto em R$/US$. |

- [ ] **Step 5: Handoff — rodar e reportar**

Rode as 3 queries no `accountId`/`agentId` usado nos testes de custo, cole os resultados de volta nesta conversa (ou resuma os percentuais), e eu confirmo qual hipótese bate e qual é o próximo passo — sem nenhum código a mudar neste momento.
