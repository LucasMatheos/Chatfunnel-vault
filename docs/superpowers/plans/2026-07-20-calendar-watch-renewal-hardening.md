# Plano — Endurecer o cron de renovação de watches do Calendar (pontos 1, 2, 4, 5)

**Data:** 2026-07-20
**Escopo:** cron `@Cron('0 */6 * * *')` → `renewWatches` → `WatchCalendarsHandler.execute()`
**Fora de escopo (fica pra depois):** ponto 3 (isolamento de tenant no endpoint manual `POST /nest/calendar/watch`)

## Topologia real (define o desenho)

3 máquinas rodando o `services`, uma por ambiente: **main** (produção, **banco dedicado**), **release** e **dev** (**banco compartilhado** entre as duas). **main roda 1 pod único.**

O que gera concorrência é **quantas máquinas escrevem no mesmo banco**:

Ambientes discriminados pela env `MODE`: `MAIN` (=main), `INSIDER` (=release), `DEV` (=dev).

| Banco | `MODE` que roda o cron | Concorrência |
|-------|------------------------|--------------|
| main (dedicado) | só `MAIN` (1 pod) | ❌ nenhuma |
| compartilhado | `INSIDER` **e** `DEV` | ⚠️ sim (2 máquinas), não-prod |

**Conclusão:** não existe concorrência em produção → **não há lock distribuído** (nem Redis, nem `SET NX`, nem TTL). A única colisão real é release+dev no banco compartilhado, resolvida com um **guard de ambiente** garantindo **um escritor por banco** (ver ponto 2).

## Fatos do schema (confirmados)

- **`isDeleted` NÃO existe em `GoogleCalendars`** — está em `GoogleConnections` (`isDeleted Boolean @default(false)` + `deletedAt`, schema:535). Desconectar = soft-delete da conexão. Logo o filtro de "não trazer desconectada" é `googleConnection: { isDeleted: false }`.
- **`provider CalendarProviderEnum` = `{ NATIVE, GOOGLE }`** (schema:1694). Só `GOOGLE` tem watch; `NATIVE` não precisa renovar → filtrar `provider: 'GOOGLE'`.
- **`googleConnectionId` é nullable** — filtrar pela relação `googleConnection: { isDeleted: false }` exclui linhas sem conexão (Prisma to-one relation filter), o que também **elimina um bug latente**: hoje linha sem conexão quebra em `cal.googleConnection.tokens` → catch → `failed++`.
- **`accountId` é obrigatório** em `GoogleCalendars` e identifica o tenant dono da agenda. Não precisa de filtro `{ not: null }`, pois o schema/PostgreSQL já garantem sua presença.
- **`userId` é nullable e não é requisito técnico do watch** — foi adicionado em 22/10/2025 para associar a agenda a um usuário/moderador responsável, mas registros anteriores podem permanecer sem essa associação. A renovação depende de `accountId`, `calendarId` e conexão Google ativa; portanto, a query do cron não deve excluir calendários sem `userId`.
- **Repo do services herda do core** — `chatfunnel-services/.../google_calendars.repository.ts` é só `extends Base` de `@chatfunnel/core/repositories`. A nova query entra **num único arquivo (core)** e o services herda.

---

## Ponto 1 — Evitar perda de cobertura (core)

**Arquivo:** `chatfunnel-core/src/services/calendar/handlers/watch-calendars.handler.ts`

**Problema:** ordem atual `stop (44) → create (55) → persist (61)`. Se create/persist falha, o watch antigo já foi encerrado → calendário sem webhook até o próximo ciclo.

**Correção:** inverter para **create → persist → stop-antigo (best-effort)**.

1. Guardar os IDs antigos antes de qualquer coisa:
   ```ts
   const oldWatchGoogleId = cal.watchGoogleId;
   const oldWatchResourceId = cal.watchResourceId;
   ```
2. Criar o novo canal (`watchCalendar`) e persistir (`updateWatchFields(cal.id, cal.accountId, data)`) **primeiro**. Se qualquer um falhar, cai no `catch` existente e o watch antigo **continua vivo** (nenhuma janela sem cobertura). A escrita confirma `id + accountId`, preservando o isolamento multi-tenant mesmo dentro do batch global.
3. Só depois de persistir, encerrar o antigo dentro de `try/catch` best-effort:
   ```ts
   if (oldWatchGoogleId && oldWatchResourceId) {
     try {
       await this.googleCalendarApiService.stopWatchCalendar(auth, oldWatchGoogleId, oldWatchResourceId);
     } catch {
       // canal antigo pode já ter expirado — Google expira sozinho; ignorar
     }
   }
   ```
4. `renewed++` acontece após o persist (não depende do stop).

**Efeito colateral aceito:** por até alguns minutos podem coexistir 2 canais (novo + antigo). O `handleWebhook` já lida com channelId desconhecido; o antigo expira sozinho. Preferível a zero cobertura.
`// ponytail: canal duplicado transitório é ok; zero-webhook não é`

**Risco residual aceito (decisão 2026-07-20):** se `watchCalendar` cria o novo mas `updateWatchFields` falha, o novo canal fica órfão no Google (não persistido) — vaza 1 canal que expira sozinho em 7d. Aceito: é raro e auto-limpa.

**Sem mudança de assinatura** — `execute()` continua igual, retorno `{ renewed, skipped, failed }` intacto.

**Proteção da escrita por tenant:** a leitura do cron é global por natureza, mas a atualização de cada calendário deve confirmar a conta proprietária. Alterar a assinatura compartilhada do repository:

```ts
async updateWatchFields(
  id: string,
  accountId: string,
  data: { watchGoogleId: string; watchResourceId: string; watchExpiry: Date },
): Promise<void> {
  await this.prisma.googleCalendars.update({
    where: { id, accountId },
    data,
  });
}
```

Como o método também é usado pelo `CalendarSyncService`, atualizar todos os callers no mesmo trabalho:

- cron: `updateWatchFields(cal.id, cal.accountId, data)`;
- resync: `updateWatchFields(calendar.id, calendar.accountId, data)`;
- registro inicial: `updateWatchFields(calendarId, accountId, data)` — incluir `accountId` no destructuring do `SyncContext`.

---

## Ponto 2 — Guard de ambiente (services) — substitui o lock

**Arquivo:** `chatfunnel-services/src/modules/calendar/services/calendar.service.ts`

**Problema:** `release` e `dev` compartilham banco e **ambas** disparam o `@Cron` → renovam os mesmos watches em paralelo (canais duplicados no Google, corrida de escrita). `dev` renovando watch real do Google nem deveria acontecer.

**Correção (allowlist via `MODE`, sem lock):** reusar a env `MODE` já existente (`MAIN` | `INSIDER` | `DEV`). Rodar só onde há exatamente um escritor por banco — `MAIN` (banco dedicado) e `INSIDER` (banco compartilhado); pular `DEV`:

```ts
const RENEWAL_MODES = ["MAIN", "INSIDER"];

@Cron('0 */6 * * *')
async renewWatches() {
  if (!RENEWAL_MODES.includes(process.env.MODE)) {
    this.logger.debug(`watch-renewal pulado: MODE=${process.env.MODE}`);
    return;
  }
  return this.runWatchRenewal(); // ver ponto 4
}
```

Resultado: banco do MAIN ← só `MAIN`; banco compartilhado ← só `INSIDER` (`DEV` sai fora). **Um escritor por banco → zero concorrência → nenhum lock necessário. Nenhuma env nova** — reusa `MODE`.

**Log do skip (`debug`, não `log`):** pular é comportamento esperado (DEV a cada 6h), então `debug` não polui o stdout em operação normal, mas aparece quando alguém sobe o log level pra investigar "por que essa máquina não renova". Também torna visível o caso perigoso do risco #1 — se produção vier com `MODE` vazio/errado, o skip fica registrado em vez de silencioso. O `this.logger` é o mesmo declarado no ponto 4.
`// ponytail: debug, não log — skip é rotina; só interessa quando se investiga`

**Por que allowlist e não blacklist de `DEV`:** falha seguro — se `MODE` vier vazio/desconhecido, o cron não roda (melhor que rodar em dobro). Blacklist (`=== "DEV"`) deixaria qualquer valor inesperado renovando.

**Confirmado:** env `MODE` (uppercase), valores `MAIN`/`INSIDER`/`DEV`, definida em `../envs/secrets.env` (local: `MODE=DEV`). Nome e casing batem com o guard. É o primeiro consumidor dessa env no `src`.

**Reabrir o lock só se:** produção (`MAIN`) passar a escalar para 2+ pods. Aí `MAIN` sozinho tem concorrência interna e o guard não basta — nesse cenário volta o lock distribuído (Redis `SET NX EX`) OU isola-se o cron num pod só. Hoje **não é o caso** (main = 1 pod).

---

## Ponto 4 — Monitoramento estruturado (services)

**Arquivo:** `chatfunnel-services/src/modules/calendar/services/calendar.service.ts`

**Problema:** única observabilidade é `console.error` no core (viola regra "usar logger"); o retorno `{ renewed, skipped, failed }` é descartado; sem duração nem alerta.

**Correção:** logar no nível services (onde `Logger` é padrão do repo — `new Logger(CalendarService.name)`), sem sujar o core.

1. Declarar logger na classe:
   ```ts
   private readonly logger = new Logger(CalendarService.name);
   ```
2. Extrair a execução + medição para `runWatchRenewal()`:
   ```ts
   private async runWatchRenewal() {
     const startedAt = Date.now();
     try {
       const result = await this.coreService.watchCalendars();
       const durationMs = Date.now() - startedAt;
       const payload = { ...result, durationMs };
       if (result.failed > 0) {
         this.logger.error(
           `watch-renewal com falhas: ${JSON.stringify(payload)}`,
         );
       } else {
         this.logger.log(
           `watch-renewal concluído: ${JSON.stringify(payload)}`,
         );
       }
       return result;
     } catch (error) {
       const durationMs = Date.now() - startedAt;
       this.logger.error(
         `watch-renewal falhou completamente após ${durationMs}ms`,
         error instanceof Error ? error.stack : String(error),
       );
       throw error;
     }
   }
   ```
3. **Alerta quando `failed > 0`:** por ora usar `logger.error` do NestJS, emitido em `stdout`/`stderr` e coletado pela infraestrutura da aplicação. Se houver canal de alerta real (Slack/Sentry) no repo, plugar aqui — a checar na implementação.
4. **Falha total:** se a query inicial ou outra etapa anterior ao tratamento individual rejeitar, registrar duração e stack no `catch`, depois relançar o erro para preservar a sinalização de falha do scheduler.

**Log por-calendário no core:** o `console.error` do handler (linha 69) vira `logHandledError` — helper padrão do core (`helpers/logs.helper.ts`) — com `scope: "watch-renewal"` e `extra: { calendarId }`. Mantém o detalhe de *qual* calendário falhou, dentro do core, sem depender do `Logger` do Nest. Totais/duração/alerta ficam no `runWatchRenewal` (services).

---

## Ponto 5 — Filtrar renovações no SQL (core)

**Arquivos:**
- `chatfunnel-core/src/repositories/google_calendars.repository.ts`
- `chatfunnel-core/src/services/calendar/handlers/watch-calendars.handler.ts`

**Problema:** hoje `findAllWithCalendarId` puxa **todo** calendário de **toda** conta (+ blob de tokens da conexão via join) a cada 6h, e só depois descarta ~96% no app (`provider` + `needsRenewal` em memória). Custo O(total) por run, desperdício de IO/memória que cresce sem limite.

**Correção:** empurrar o filtro inteiro pro SQL. Novo método dedicado no repo do core (único caller é o handler; deixa `findAllWithCalendarId` intacto pois o vault o referencia):

```ts
async findWatchesToRenew(expiryThreshold: Date) {
  return this.prisma.googleCalendars.findMany({
    where: {
      provider: "GOOGLE",
      calendarId: { not: null },
      googleConnection: {
        is: { isDeleted: false },
      },
      OR: [{ watchExpiry: null }, { watchExpiry: { lt: expiryThreshold } }],
    },
    include: { googleConnection: true },
  });
}
```

**No handler:** trocar a query + remover os filtros em memória (agora garantidos pelo SQL):
```ts
const expiryThreshold = new Date(Date.now() + 24 * 60 * 60 * 1000);
const calendars = await this.googleCalendarsRepository.findWatchesToRenew(expiryThreshold);
// remove: findAllWithCalendarId, o .filter(provider), e o check needsRenewal
for (const cal of calendars) {
  // ... (create → persist → stop, ponto 1)
}
```

**Efeitos:**
- A query volta só o que precisa de trabalho → parte fixa do custo cai de O(total) para O(a-renovar).
- `skipped` do retorno vira sempre `0` (não carregamos mais os pulados). Manter o campo na assinatura `{ renewed, skipped, failed }` p/ não mexer no logging do ponto 4. `// ponytail: skipped=0 é esperado; a contagem de total sumiu junto com o desperdício`
- Linhas sem conexão / conexão desconectada / provider NATIVE não entram mais → some o `failed++` espúrio.
- Calendários antigos sem `userId`, mas com `accountId`, `calendarId` e conexão Google ativa, continuam elegíveis para renovação.

**Nota de build:** essa mudança é 100% no core → exige rebuild/publish manual do `@chatfunnel/core` (mesmo pacote do ponto 1).

---

## Opcional (fora do escopo atual) — Concorrência no loop (core)

Antes justificado para segurar o TTL do lock; **sem lock, perde a urgência.** Um run serial de ~15–20min só ocorre num lote agrupado (muitas expirações no mesmo dia), a cada ~6h, numa máquina só — aceitável. Se o tempo incomodar, processar em lotes de `N=5` via `Promise.all` sobre chunks (sem dependência nova), extraindo a lógica por-calendário para `renewOne(cal): Promise<boolean>`. Adicionar **só se** medir run longo de fato.

---

## Branches e estratégia de commits

Os dois repositórios já estão na branch adequada e o trabalho pode ser feito diretamente nela, sem criar novas branches:

| Repo | Branch de trabalho |
|------|--------------------|
| `chatfunnel-core` | `fix-release/calendar` |
| `chatfunnel-services` | `fix-release/calendar` |

Cada repositório mantém seu próprio histórico Git. Não fazer commit automaticamente: implementar e validar primeiro; criar os commits somente quando o usuário solicitar explicitamente.

### Etapa 1 — Core

Implementar em `chatfunnel-core`:

1. Reordenar a renovação para `create → persist → stop-antigo`.
2. Adicionar `findWatchesToRenew(expiryThreshold)` com os filtros SQL definidos no ponto 5.
3. Remover o filtro por `userId` e manter calendários antigos elegíveis.
4. Alterar `updateWatchFields` para exigir `id + accountId`.
5. Trocar o `console.error` do handler por `logHandledError`.
6. Adicionar/ajustar os testes unitários do handler e repository.

Commit sugerido, quando solicitado:

```text
fix: harden calendar watch renewal
```

### Etapa 2 — Publicação manual do Core

Após validar o Core, o usuário executa manualmente o build e a publicação de uma nova versão do `@chatfunnel/core`. Não executar build, publish ou sincronização do pacote automaticamente.

Registrar a versão publicada para atualizar o `chatfunnel-services`. Alinhar `package.json` e `package-lock.json` do Services para a mesma versão; não manter versões divergentes.

### Etapa 3 — Services

Depois que a nova versão do Core estiver disponível, implementar em `chatfunnel-services`:

1. Atualizar `@chatfunnel/core` em `package.json` e `package-lock.json` para a versão publicada.
2. Adequar os callers do `CalendarSyncService` à assinatura `updateWatchFields(id, accountId, data)`.
3. Adicionar o guard de `MODE` ao cron.
4. Adicionar `runWatchRenewal()` com duração, resultado consolidado e tratamento de falha total.
5. Usar o `Logger` padrão do NestJS em `stdout`/`stderr`.
6. Adicionar/ajustar os testes do `CalendarService` e `CalendarSyncService`.

Commit sugerido, quando solicitado:

```text
fix: improve calendar watch renewal reliability
```

### Etapa 4 — Validação final

1. Rodar somente os testes específicos dos arquivos alterados.
2. Não rodar build automaticamente; o usuário valida os builds manualmente.
3. Revisar `git diff` e `git status` separadamente nos dois repositórios.
4. Confirmar que nenhum commit inclui arquivos não relacionados já existentes nas branches.

## Arquivos tocados

| Repo | Arquivo | Ponto |
|------|---------|-------|
| core | `services/calendar/handlers/watch-calendars.handler.ts` | 1, 5 |
| core | `repositories/google_calendars.repository.ts` | 5 |
| services | `modules/calendar/services/calendar.service.ts` | 2, 4 |
| services | `modules/google_calendars/services/calendar-sync.service.ts` | adequar callers de `updateWatchFields` para `id + accountId` |

> Não toca mais `RedisService` nem `CalendarModule` — o lock foi descartado. **Nenhuma env nova**: o ponto 2 reusa a `MODE` já existente (`MAIN`/`INSIDER`/`DEV`), sem mudança de deploy.

## Verificação

- **Core (ponto 1):** teste unitário do handler com `watchCalendar` que rejeita → assertar que `updateWatchFields` **não** foi chamado, `stopWatchCalendar` do antigo **não** foi chamado, e o registro mantém o `watchGoogleId` original (watch antigo preservado). Handler é `new`-ado com deps → mockar os 3 (repos + apiService).
- **Core (proteção tenant):** assertar que o handler chama `updateWatchFields(cal.id, cal.accountId, data)` e que o repository executa o update com `where: { id, accountId }`.
- **Services (ponto 2):** `MODE=DEV` (e vazio/desconhecido) → `renewWatches` retorna sem chamar `coreService.watchCalendars()`; `MODE=MAIN` e `MODE=INSIDER` → chama.
- **Services (ponto 4):** com `failed > 0` no retorno mockado → `logger.error` chamado; com `failed = 0` → `logger.log`; com `coreService.watchCalendars()` rejeitando → `logger.error` registra falha total e o erro é relançado.
- **Services (CalendarSyncService):** ajustar mocks e expectativas para os dois callers enviarem também o `accountId` ao `updateWatchFields`.
- **Core (ponto 5):** teste do repo/handler assertando que o `where` passado ao `findMany` contém `provider: 'GOOGLE'`, `googleConnection: { is: { isDeleted: false } }` e o `OR` de `watchExpiry` (null OR < threshold), sem filtro por `userId` — mockar `prisma.googleCalendars.findMany` e inspecionar o argumento. Garante que NATIVE, conexão desconectada e watch ainda válido não entram no lote, enquanto calendários antigos sem `userId` permanecem elegíveis.

## Build

Core precisa de rebuild/publish manual (`@chatfunnel/core`) para o services consumir as mudanças dos pontos 1 e 5 — **o usuário roda manualmente** (regra do workspace: nunca buildar/sincronizar core automaticamente).
