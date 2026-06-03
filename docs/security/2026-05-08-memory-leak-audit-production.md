# Memory Leak Audit — Producao (todos os repos)

**Data:** 2026-05-08
**Contexto:** VPS t3.large (8GB RAM) travou. Logs AWS: NestJS pediu 21GB de memoria virtual.
**Escopo:** Todos os repositorios em producao (excluindo A2A que esta em dev)

---

## Resumo Executivo

O crash nao e causado por um unico leak catastrofico, mas pela **soma de multiplos leaks em repos diferentes**, todos rodando no mesmo t3.large:

| Repo | Leak principal | Impacto estimado |
|------|---------------|-----------------|
| **chatfunnel-api** | LoggerClass cache por accountId | 500MB-2GB (cresce com contas) |
| **chatfunnel-worker-broadcast** | limiterCache por channelId | 200MB-1GB (cresce com canais) |
| **chatfunnel-services** | agents-v2 tool loop + req_logger | 500MB-2GB (sob carga) |
| **chatfunnel-worker-broadcast** | db-write-buffer sem limite | 200MB-1GB (se batch atrasar) |

**Total estimado:** 1.5-6GB base + spikes = OOM no t3.large (8GB)

---

## CRITICAL-1: LoggerClass cache sem eviction (chatfunnel-api)

**Arquivo:** `chatfunnel-api/src/class/LoggerClass.js:6,33`

```javascript
const loggerCache = new Map();  // linha 6 — module-level, NUNCA limpo

class Logger {
  constructor(pageId, subdirectory = "") {
    const cacheKey = `${subdirectory || "default"}:${pageId}`;
    this.logger = winston.createLogger({...});
    loggerCache.set(cacheKey, this);  // linha 33 — adiciona, NUNCA remove
  }
}
```

**Quem chama com IDs dinamicos:**
- `BaseHandler.js:12` — `new Logger(context.accountId ?? context.wppBusinessId)` — **cada webhook de cada conta**
- `handleSystemActions.js:35` — `new Logger(accountId)` — **cada erro de cada conta**
- `GetInstagramPosts.js:47` — `new Logger(igBusinessId)` — **cada business ID**
- `HandlerContacts.js:20` — `new Logger(logger)` — herda ID dinamico do BaseHandler

**Impacto:** Cada conta unica que envia webhook cria um Logger permanente com winston transports. Com 1000+ contas ativas ao longo de dias/semanas:
- Cada winston.createLogger() aloca internamente transports, formatters, streams = **~5-50KB por instancia**
- 5000 contas x 50KB = **250MB** minimo, potencialmente mais com GC fragmentando heap

**Fix:**
```javascript
const loggerCache = new Map();
const MAX_CACHE = 200;

constructor(pageId, subdirectory = "") {
  const cacheKey = `${subdirectory || "default"}:${pageId}`;
  if (loggerCache.has(cacheKey)) {
    this.logger = loggerCache.get(cacheKey).logger;
    return;  // reusar existente!
  }
  // ... criar novo ...
  if (loggerCache.size >= MAX_CACHE) {
    const oldest = loggerCache.keys().next().value;
    loggerCache.delete(oldest);
  }
  loggerCache.set(cacheKey, this);
}
```

---

## CRITICAL-2: limiterCache sem eviction (chatfunnel-worker-broadcast)

**Arquivo:** `chatfunnel-worker-broadcast/src/queues/processors/sendMessage.processor.ts:29,49`

```typescript
const limiterCache = new Map<string, RateLimiterRedis>();  // linha 29 — NUNCA limpo

const getRateLimiter = (channelId: string, throughput: number): RateLimiterRedis => {
  if (limiterCache.has(channelId)) return limiterCache.get(channelId)!;
  const limiter = new RateLimiterRedis({
    storeClient: redisLimiterClient,
    keyPrefix: `rl:${channelId}`,
    points: throughput,
    duration: 1,
  });
  limiterCache.set(channelId, limiter);  // linha 49 — adiciona, NUNCA remove
  return limiter;
};
```

**Impacto:** Cada channelId unico cria um RateLimiterRedis permanente. Cada instancia mantem estado interno + referencia ao Redis client. Se canais sao criados/deletados ao longo do tempo, entries orfas se acumulam.

**Fix:** Adicionar LRU com max 100 entries, ou limpar periodicamente canais inativos.

---

## CRITICAL-3: 3 conexoes Redis sem cleanup (chatfunnel-worker-broadcast)

**Arquivo:** `chatfunnel-worker-broadcast/src/queues/processors/sendMessage.processor.ts:20-26`

```typescript
const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
const redisClient = new IORedis(env.REDIS_URL);
const redisLimiterClient = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
```

**Problema:** 3 conexoes Redis criadas no module scope sem nenhum handler de shutdown. Se o worker crashar ou reiniciar, conexoes ficam em CLOSE_WAIT ate timeout do TCP. Acumula com restarts frequentes.

**Fix:** Adicionar graceful shutdown:
```typescript
process.on('SIGTERM', async () => {
  await connection.quit();
  await redisClient.quit();
  await redisLimiterClient.quit();
});
```

---

## HIGH-1: agents-v2 messages array cresce sem limite (chatfunnel-services)

**Arquivo:** `chatfunnel-services/src/modules/agents-v2/services/agent-executor.service.ts:222-349`

```typescript
const messages: ChatMessage[] = [];
messages.push(...history);           // historia completa
messages.push({ role: 'user', content: dto.message });

while (result.toolCalls.length > 0 && iterations < MAX_TOOL_ITERATIONS) {
  // ... tool execution ...
  messages.push(
    { role: 'assistant', content: result.content || '', toolCalls: result.toolCalls },
    ...toolMessages    // TODOS os resultados de ferramentas
  );
  result = await provider.chat(agent.systemPrompt, messages, tools, {...});
}
```

**Problema:** MAX_TOOL_ITERATIONS = 10, mas cada iteracao adiciona assistant + N tool responses ao array. Tool responses vem de APIs externas (axios POST sem limit de tamanho — `tool-executor.service.ts:314`). Se uma tool retorna 1MB de JSON, o array acumula **10MB+ por request**.

Com 50 execucoes concorrentes: **500MB+**

**Fix:**
- Truncar tool responses: `return JSON.stringify(data).slice(0, 10000)`
- Limitar `maxContentLength` no axios: `{ maxContentLength: 100_000 }`

---

## HIGH-2: req_logger buffera response body inteiro (chatfunnel-services)

**Arquivo:** `chatfunnel-services/src/middlewares/req_logger.middleware.ts:71-77`

```typescript
let responseBody: string | null = null;
const originalSend = res.send;
res.send = function (...args: any[]): any {
  if (args.length > 0) responseBody = args[0];  // RESPONSE INTEIRO em memoria
  return originalSend.apply(this, args);
};
```

**Problema:** O response body COMPLETO e armazenado em `responseBody` antes de ser truncado no callback `finish`. Se um endpoint retorna 50MB de dados (ex: export, relatorio), esses 50MB ficam em memoria ate o `finish` event. Com 10 requests grandes simultaneos: **500MB spike**.

**Fix:** Truncar imediatamente no monkey-patch:
```typescript
res.send = function (...args: any[]): any {
  if (args.length > 0) {
    const raw = typeof args[0] === 'string' ? args[0] : '';
    responseBody = raw.length > 8192 ? raw.slice(0, 8192) + '...[truncated]' : raw;
  }
  return originalSend.apply(this, args);
};
```

---

## HIGH-3: findOverdues() sem limit (chatfunnel-services)

**Arquivo:** `chatfunnel-services/src/database/repositories/accounts.repository.ts:468-492`

```typescript
async findOverdues(): Promise<Accounts[]> {
  const accounts = await this.prisma.accounts.findMany({
    where: { isDeleted: false, isCanceled: false, ... },
    include: { user: true },   // inclui user inteiro
    // SEM take/limit — carrega TUDO
  });
  return accounts;
}
```

**Problema:** Se chamado por scheduler/cron, carrega TODOS os accounts overdue + user completo de uma vez. Com 10k+ accounts overdue: **50-200MB spike** por chamada.

**Fix:** Processar em batches:
```typescript
async findOverdues(skip = 0, take = 100): Promise<Accounts[]> {
  return this.prisma.accounts.findMany({
    where: { ... },
    include: { user: true },
    take,
    skip,
  });
}
```

---

## HIGH-4: agents-v2 Redis client sem OnModuleDestroy (chatfunnel-services)

**Arquivo:** `chatfunnel-services/src/modules/agents-v2/agents-v2.module.ts:57-72`

```typescript
{
  provide: "REDIS_CLIENT",
  useFactory: (configService: ConfigService): Redis => {
    return new Redis(redisUrl, { maxRetriesPerRequest: 3, lazyConnect: false });
  },
  inject: [ConfigService],
}
// Modulo NAO implementa OnModuleDestroy — conexao nunca fechada
```

**Fix:** Implementar cleanup no modulo ou usar provider com `onModuleDestroy`.

---

## HIGH-5: db-write-buffer sem limite (chatfunnel-worker-broadcast)

**Arquivo:** `chatfunnel-worker-broadcast/src/queues/processors/sendMessage.processor.ts` (rpush) +
`chatfunnel-worker-broadcast/src/queues/processors/databaseBatch.processor.ts` (consumer)

**Problema:** O worker de envio faz `rpush` no Redis list `db-write-buffer` para cada mensagem enviada. O batch processor consome a cada 5s. Se o batch processor atrasar (DB lento, erro), o buffer cresce sem limite no Redis.

Com broadcasts de 100k contatos: buffer pode acumular **centenas de MB** no Redis se batch falhar.

**Fix:** Adicionar check de tamanho antes de rpush:
```typescript
const bufferLen = await redisClient.llen('db-write-buffer');
if (bufferLen > 50000) {
  logger.warn('db-write-buffer overflow, skipping rpush');
}
```

---

## MEDIUM-1: S3 adapter buffera arquivo inteiro (chatfunnel-services)

**Arquivo:** `chatfunnel-services/src/adapters/s3-storage.adapter.ts:43-47`

```typescript
const response = await axios.get<ArrayBuffer>(fileUrl, { responseType: "arraybuffer" });
const fileBuffer = response.data;  // arquivo INTEIRO em RAM
```

**Fix:** Usar streaming com `responseType: 'stream'` + S3 multipart upload.

---

## MEDIUM-2: findBySession sem default limit (chatfunnel-services)

**Arquivo:** `chatfunnel-services/src/database/repositories/agent_session_messages.repository.ts:23-35`

```typescript
async findBySession(sessionId: string, limit?: number) {
  return this.prisma.agentSessionMessages.findMany({
    where: { sessionId },
    ...(limit != null && { take: limit }),  // sem limit = TUDO
  });
}
```

**Fix:** Default limit: `take: limit ?? 100`

---

## MEDIUM-3: req_logger queue perde dados em falha (chatfunnel-services)

**Arquivo:** `chatfunnel-services/src/middlewares/req_logger.middleware.ts:122-130`

```typescript
private async flush(): Promise<void> {
  const batch = this.queue.splice(0);  // remove do queue
  try {
    await this.reqLogsRepository.createMany(batch);
  } catch (error) {
    console.error("Error flushing request logs:", error);
    // batch PERDIDO — nao volta pro queue
  }
}
```

---

## MEDIUM-4: WebSocket disconnect handler vazio (chatfunnel-websocket)

**Arquivo:** `chatfunnel-websocket/src/index.ts:50`

```typescript
socket.on("disconnect", () => {});  // no-op
```

---

## MEDIUM-5: EventBus handlers nunca removidos (chatfunnel-core)

**Arquivo:** `chatfunnel-core/src/events/event-bus.ts:6-14`

Map de handlers que acumula se services registram sem chamar `off()`.

---

## Mapa de Impacto Consolidado

| # | Repo | Finding | Memoria | Effort |
|---|------|---------|---------|--------|
| C1 | chatfunnel-api | LoggerClass cache unbounded | 250MB-2GB | 20min |
| C2 | worker-broadcast | limiterCache unbounded | 200MB-1GB | 15min |
| C3 | worker-broadcast | 3 Redis sem shutdown | 50-200MB | 10min |
| H1 | services | agents-v2 messages + tool responses | 500MB-2GB | 30min |
| H2 | services | req_logger buffera response inteiro | 100-500MB spike | 10min |
| H3 | services | findOverdues() sem limit | 50-200MB spike | 10min |
| H4 | services | agents-v2 Redis sem cleanup | 50-100MB | 10min |
| H5 | worker-broadcast | db-write-buffer sem limite | 200MB-1GB | 15min |
| M1 | services | S3 buffera arquivo inteiro | 0-500MB spike | 30min |
| M2 | services | findBySession sem default limit | 50-200MB | 5min |
| M3 | services | req_logger perde batch em falha | indirect | 10min |
| M4 | websocket | disconnect handler vazio | 10-50MB | 10min |
| M5 | core | EventBus handlers acumulam | 5-20MB | 15min |

**Total conservador:** 1.5-4GB base + spikes de ate 2GB = **3.5-6GB** em uso constante no t3.large de 8GB. Com fragmentacao de heap + overhead do V8 + outros processos = **OOM**.

---

## Plano de Acao

### Emergencia (hoje) — parar o crash

1. **LoggerClass**: adicionar LRU com MAX_CACHE=200 + reusar existentes
2. **limiterCache**: adicionar MAX_CACHE=100 com eviction
3. **Redis shutdown handlers** no worker-broadcast
4. **NODE_OPTIONS=--max-old-space-size=6144** em todos os processos Node (crash antes de travar VPS)

### Urgente (esta semana) — reduzir pressao

5. **agents-v2 tool responses**: truncar para 10KB max + `maxContentLength` no axios
6. **req_logger**: truncar response body imediatamente no monkey-patch
7. **findOverdues()**: processar em batches de 100
8. **agents-v2 OnModuleDestroy**: fechar Redis client
9. **db-write-buffer**: check de tamanho antes de rpush

### Importante (proximo sprint) — hardening

10. **S3 adapter**: streaming upload
11. **findBySession**: default limit 100
12. **WebSocket**: cleanup explicito no disconnect
13. **Monitoramento**: Prometheus/CloudWatch para RSS de cada processo

---

## Configuracoes de Ambiente Recomendadas

```env
# Node.js — TODOS os processos
NODE_OPTIONS=--max-old-space-size=6144

# Alarmes CloudWatch
# RSS > 5GB = warning
# RSS > 6.5GB = critical (restart automatico)
```
