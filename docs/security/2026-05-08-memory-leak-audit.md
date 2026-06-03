# Memory Leak Audit — chatfunnel-services

**Data:** 2026-05-08
**Contexto:** VPS t3.large (8GB RAM) travou. Logs da AWS mostraram NestJS requisitando 21GB de memória virtual.
**Escopo:** Análise completa do `chatfunnel-services/src/`

---

## Resumo Executivo

O módulo **A2A** (Agent-to-Agent) é o principal responsável. Ele combina:
- Cache de agentes Mastra (5 Agent instances + MCPClient + AnthropicProvider) **por conta**, sem limite de tamanho
- Streams SSE sem backpressure, acumulando buffers em clientes lentos
- Redis clients criados sem `OnModuleDestroy` em 2 módulos
- Dados de sessão inteiros serializados como JSON no Redis
- Métricas in-memory com janela de 24h

Estimativa conservadora de consumo sob carga: **4-8GB**, podendo escalar para 21GB+ com tráfego sustentado de muitas contas.

---

## Findings

### CRITICAL-1: `toolsCache` sem limite de tamanho

**Arquivo:** `src/modules/a2a/services/a2a-agent.service.ts:149-159`
**Impacto:** ~10-25MB por conta x N contas = **principal leak**

```typescript
private toolsCache = new Map<string, {
  tools: Record<string, any>;
  client: MCPClient;           // conexao ativa
  requestId: string;
  expiresAt: number;
  subAgents: SubAgentPool;     // 5 Agent instances (flow, system, template, crm, contacts)
  anthropic: AnthropicProvider;
}>();
```

**Problema:**
- Cada entrada contem 5 instancias de `Agent` do Mastra com tool definitions completas + MCPClient + AnthropicProvider
- Eviction e **so por TTL** (default 60s, verificado a cada 60s via setInterval)
- **Nenhum limite de tamanho** -- se 500 contas acessam em 60s, todas ficam em memoria simultaneamente
- Se o cleanup interval atrasa (GC pause, event loop busy), entries expiradas persistem

**Fix:** Adicionar LRU com `MAX_CACHE_SIZE` (ex: 50-100 contas) + evict oldest antes de inserir nova.

---

### CRITICAL-2: Redis clients sem `OnModuleDestroy`

**Arquivos:**
- `src/modules/a2a/a2a.module.ts:42-54` -- `REDIS_A2A_CLIENT`
- `src/modules/agents-v2/agents-v2.module.ts:57-72` -- `REDIS_CLIENT`

**Problema:** Ambos os modulos criam `new Redis(...)` como custom providers mas **nenhum modulo implementa `OnModuleDestroy`**. Conexoes nao sao fechadas no shutdown, e se o modulo for recriado (hot-reload, testes), conexoes antigas ficam abertas.

**Fix:** Adicionar `OnModuleDestroy` em ambos os modulos chamando `redis.disconnect()`.

---

### CRITICAL-3: `fullContent` string acumulando no controller

**Arquivo:** `src/modules/a2a/a2a.controller.ts:149,191`

```typescript
let fullContent = '';  // linha 149
// ...
fullContent += (event.data as any).content || '';  // linha 191 -- concatenacao em loop
```

**Problema:** Todo o texto da resposta do agente e acumulado numa string durante o streaming. Para respostas longas (10-50KB por request x 50 concurrent streams = 500KB-2.5MB). A string e mantida ate o final do request para persistencia.

**Severidade:** MEDIUM isoladamente, mas contribui para pressao de memoria cumulativa.

---

### HIGH-1: SSE streaming sem backpressure

**Arquivo:** `src/modules/a2a/a2a.controller.ts:201-206`

```typescript
res.write(`event: ${event.type}\ndata: ${JSON.stringify(ssePayload)}\n\n`);
```

**Problema:** `res.write()` e fire-and-forget -- se o cliente le devagar (rede lenta, mobile), o buffer TCP + Node.js cresce sem limite. Com 50 streams concorrentes e clientes lentos, pode acumular **5-50MB** em write buffers.

**Fix:**
```typescript
const ok = res.write(`event: ${event.type}\ndata: ${JSON.stringify(ssePayload)}\n\n`);
if (!ok) {
  await new Promise(resolve => res.once('drain', resolve));
}
```

---

### HIGH-2: `activeStreams` Map com cleanup so por TTL

**Arquivo:** `src/modules/a2a/services/a2a-agent.service.ts:138-141, 855-858`

**Problema:**
- Cleanup explicito acontece no `finally` do `streamChat()` (linha 857) -- **correto no happy path**
- Mas se o `for await` do controller (linha 173) lanca excecao nao capturada, o generator nao chega ao `finally`
- O cleanup interval (60s) verifica TTL de 600s -- streams orfaos ficam **10 minutos** em memoria
- Cada `AbortController` retem referencias ao contexto de execucao

**Fix:** Garantir que o controller sempre drena o generator no `finally` block.

---

### HIGH-3: `getJobByName` carrega TODOS os jobs em memoria

**Arquivo:** `src/modules/queues/services/base_queue_.service.ts:21-40`

```typescript
const jobs = [
  ...(await this.queue.getDelayed()),   // TODOS delayed
  ...(await this.queue.getActive()),    // TODOS active
];
for (const job of jobs) {
  console.log(job.name, "job.name");    // debug logs em producao!
  // ...
}
```

**Problema:**
- Sem paginacao -- carrega TODOS os jobs de uma vez
- Com 50k+ jobs na fila, isso aloca ~250-500MB de uma vez
- `console.log` em producao gera garbage adicional
- Bloqueia o event loop durante iteracao

**Fix:** Usar paginacao BullMQ (`getJobs(state, start, end)`) + remover `console.log`.

---

### HIGH-4: PostgresStore pool de apenas 5 conexoes

**Arquivo:** `src/modules/a2a/memory/memory.config.ts:89`

```typescript
max: parseInt(process.env.A2A_MEMORY_POOL_MAX || '5', 10),
```

**Problema:** Com `maxConcurrentStreams = 50`, cada stream precisa de queries ao PostgresStore para memory. Pool de 5 cria contention -> promises enfileiram -> memoria acumula com queries pendentes.

**Fix:** Aumentar default para 15-25 ou `Math.ceil(maxConcurrentStreams / 3)`.

---

### MEDIUM-1: `a2a-metrics` records com janela de 24h

**Arquivo:** `src/modules/a2a/health/a2a-metrics.service.ts:34,38`

```typescript
private records: RequestRecord[] = [];
private readonly WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
```

**Problema:** A 100 requests/hora = 2400 records em 24h (~200KB). A 1000/hora = 24000 records (~2MB). Nao e o principal leak, mas contribui.

**Fix:** Reduzir janela para 1h ou usar contadores agregados ao inves de array de records.

---

### MEDIUM-2: `recentToolCallsByAccount` Map sem limite

**Arquivo:** `src/modules/a2a/memory/delegation-hooks.ts:60`

```typescript
const recentToolCallsByAccount = new Map<string, ToolCallRecord[]>();
```

**Problema:** Map module-scoped que cresce com cada accountId. Cleanup remove entries vazias, mas se uma conta tem pelo menos 1 record nos ultimos 5 minutos, a entry persiste. Com muitas contas ativas, acumula gradualmente.

**Fix:** Adicionar `MAX_ACCOUNTS = 500` e purge periodico.

---

### MEDIUM-3: `req.on("close")` listener nunca removido

**Arquivo:** `src/modules/a2a/a2a.controller.ts:155-161`

```typescript
req.on("close", () => {
  clientDisconnected = true;
  abortController.abort();
});
```

**Problema:** O listener e registrado mas nunca removido com `removeListener`. Para requests de longa duracao, se o objeto `req` e mantido, o listener e sua closure (que referencia `abortController`) persistem.

**Fix:** Salvar referencia ao handler e remover no finally.

---

### LOW-1: `express.json({ limit: "200mb" })` no main.ts

**Problema:** Um unico request malicioso ou mal-formado pode alocar 200MB. Com 50 requests simultaneos, isso sao 10GB teoricos.

**Fix:** Reduzir para 10-20MB no global, criar rota especifica com limite maior para uploads.

---

### LOW-2: `cleanupOrphanThreads()` e no-op

**Arquivo:** `src/modules/a2a/memory/memory.config.ts:157-168`

**Problema:** A funcao existe mas nao executa nenhuma limpeza real -- apenas loga. Threads orfas do Mastra acumulam na tabela `mastra_threads` do PostgreSQL, causando queries mais lentas e pressao indireta.

**Fix:** Implementar o SQL de cleanup comentado na linha 155, ou agendar via cron job externo.

---

## Mapa de Impacto (estimativas sob carga)

| Finding | Memoria Estimada | Effort |
|---------|-----------------|--------|
| CRITICAL-1: toolsCache sem limite | 1-5 GB | 30min |
| CRITICAL-2: Redis sem OnModuleDestroy | 100-500 MB | 15min |
| CRITICAL-3: fullContent acumulando | 50-250 MB | 10min |
| HIGH-1: SSE sem backpressure | 50-500 MB | 15min |
| HIGH-2: activeStreams TTL-only | 50-200 MB | 10min |
| HIGH-3: getJobByName sem paginacao | 250-500 MB (spike) | 20min |
| HIGH-4: PostgresStore pool=5 | 50-200 MB (indirect) | 5min |
| MEDIUM-1: metrics 24h window | 2-10 MB | 5min |
| MEDIUM-2: recentToolCalls unbounded | 5-20 MB | 10min |
| MEDIUM-3: req.on("close") leak | 10-50 MB | 5min |
| LOW-1: 200mb body limit | 0-10 GB (spike) | 10min |
| LOW-2: orphan threads no-op | indirect (PG) | 15min |
| **TOTAL** | **~2-8 GB base, 21GB+ sob carga** | **~2.5h** |

---

## Plano de Acao (ordem de prioridade)

### Imediato (hoje)

1. **toolsCache LRU** -- adicionar `MAX_CACHE_SIZE = 50` com evict-oldest
2. **OnModuleDestroy** em `A2aModule` e `AgentsV2Module` -- disconnect Redis
3. **getJobByName** -- paginacao + remover console.log
4. **SSE backpressure** -- checar retorno de `res.write()`

### Curto prazo (esta semana)

5. **PostgresStore pool** -- aumentar para 15-25
6. **Metrics window** -- reduzir de 24h para 1-2h
7. **recentToolCallsByAccount** -- adicionar limite
8. **req.on("close") cleanup** -- removeListener no finally
9. **Body limit** -- reduzir global para 20MB

### Monitoramento

10. Adicionar `--max-old-space-size=6144` no start:prod (crash antes de travar a VPS)
11. CloudWatch alarm em RSS > 5GB
12. Log `toolsCache.size` e `activeStreams.size` periodicamente
13. Redis `INFO memory` -- monitorar `used_memory`

---

## Configuracoes de Ambiente Recomendadas

```env
# Reduzir TTLs
A2A_TOOLS_CACHE_TTL_MS=30000       # 30s ao inves de 60s
A2A_STREAM_TTL_MS=300000           # 5min ao inves de 10min
A2A_CLEANUP_INTERVAL_MS=30000      # 30s ao inves de 60s
A2A_SESSION_TTL_S=900              # 15min ao inves de 30min
A2A_MAX_CONCURRENT_STREAMS=30      # 30 ao inves de 50

# Pool de memoria
A2A_MEMORY_POOL_MAX=20             # 20 ao inves de 5

# Node.js
NODE_OPTIONS=--max-old-space-size=6144
```
