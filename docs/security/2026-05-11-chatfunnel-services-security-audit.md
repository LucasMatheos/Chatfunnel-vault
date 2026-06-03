# Auditoria de Seguranca — chatfunnel-services

**Data:** 2026-05-11
**Escopo:** `chatfunnel-services/` (NestJS 10 + TypeScript) + dependencias + AI agents
**Metodologia:** STRIDE + OWASP Top 10 (2021) + npm audit + bug bounty + threat modeling
**Auditor:** Claude Code (6 agentes especializados em paralelo)

---

## Resumo Executivo

| Severidade | Total |
|------------|-------|
| CRITICAL   | **15** |
| HIGH       | **30** |
| MEDIUM     | **22** |
| LOW        | **5**  |
| **Total**  | **72** |

**Risco geral: CRITICO** — Controllers inteiros sem autenticacao (agents-v2, stripe, google_connections), Stripe webhook sem verificacao de assinatura, AccountSelectedGuard nao verifica ownership (IDOR sistemico), SSRF via AI tool executor, PII enviada a provedores de IA sem compliance LGPD, CORS wildcard.

---

## Top 10 Findings Mais Criticos

### 1. Controller agents-v2 inteiro sem autenticacao

- **Severidade:** CRITICAL
- **Arquivo:** `src/modules/agents-v2/agents-v2.controller.ts`
- **OWASP:** A01 Broken Access Control

Todas as 8 rotas CRUD (POST, GET, PUT, DELETE, build-prompt, rebuild-prompt) nao tem `@UseGuards`. `@ApiBearerAuth()` e apenas decorador Swagger, NAO enforce auth. Qualquer chamador com um UUID de account no header cria, le, atualiza e deleta agentes IA de qualquer conta. `build-prompt` e `rebuild-prompt` chamam Anthropic API — custo ilimitado.

**Remediacao:** `@UseGuards(AuthGuard("jwt"), AccountSelectedGuard)` no nivel da classe.

---

### 2. Stripe webhook sem verificacao de assinatura

- **Severidade:** CRITICAL
- **Arquivo:** `src/modules/stripe/controllers/stripe.controller.ts:12-16`
- **OWASP:** A02 Cryptographic Failures

`stripe.webhooks.constructEvent()` nunca e chamado. Qualquer POST com JSON fabricado e processado como evento Stripe real. Permite: criacao de contas gratuitas, ativacao de planos, manipulacao de subscriptions.

**Remediacao:** Raw body middleware + `constructEvent()` com `STRIPE_WEBHOOK_SECRET`.

---

### 3. AccountSelectedGuard nao verifica ownership no banco

- **Severidade:** CRITICAL
- **Arquivo:** `src/guards/account_selected.guard.ts:18-23`
- **OWASP:** A01 Broken Access Control

Valida apenas formato UUID. NAO verifica se o usuario JWT pertence a conta. Usuario autenticado A pode setar `Account-Selected: <conta-B-uuid>` e acessar dados de B em qualquer endpoint que dependa do guard.

**Remediacao:** Query ao banco: `{ id: accountId, OR: [{ userId }, { AccountModerators: { some: { userId } } }] }`.

---

### 4. Stripe controller: 4 de 5 rotas sem auth

- **Severidade:** CRITICAL
- **Arquivo:** `src/modules/stripe/controllers/stripe.controller.ts`

`create-payment-link`, `meta-conversion`, `checkout`, `check-cancelled-accounts` — todos publicos.

**Remediacao:** `@UseGuards(AuthGuard("jwt"))` nas rotas user-facing. Admin check em `check-cancelled-accounts`.

---

### 5. Google Connections controller sem auth

- **Severidade:** CRITICAL
- **Arquivo:** `src/modules/google_connections/controllers/google_connections.controller.ts`

`GET /:connectionId/:type/list` retorna dados de conexao Google para qualquer `connectionId`.

**Remediacao:** `@UseGuards(AuthGuard("jwt"), ModeratorAuthGuard)`.

---

### 6. Admin impersonation verifica owner da conta, nao caller JWT

- **Severidade:** CRITICAL
- **Arquivo:** `src/modules/adm/commands/loginInAccountAsAdm/handler.ts:25-34`

Verifica se o OWNER da conta selecionada e admin, nao se o usuario autenticado e admin. Escalacao de privilegio.

**Remediacao:** Verificar `isAdmin` no `req.user.userId` do JWT.

---

### 7. SSRF via AgentExternalQueries.url

- **Severidade:** HIGH
- **Arquivo:** `src/modules/agents-v2/services/tool-executor.service.ts:314`

`axios.post(query.url, ...)` com URL user-controlled, sem validacao. Acesso a metadata AWS, Redis interno, outros servicos.

**Remediacao:** Validar URL contra allowlist. Bloquear RFC-1918/loopback/link-local. Enforce HTTPS.

---

### 8. Hardcoded secrets (Turnstile + Cademi)

- **Severidade:** CRITICAL
- **Arquivos:** `stripe/checkout/handler.ts:304,346`, `users/create_user/handler.ts:223`

Cloudflare Turnstile secret e Cademi API token hardcoded no codigo-fonte.

**Remediacao:** Mover para env vars. Rotacionar imediatamente.

---

### 9. Anthropic API key logada em WARN level

- **Severidade:** CRITICAL
- **Arquivo:** `src/modules/agents-v2/prompt-build.service.ts:55-56`

```ts
this.logger.warn(`[PromptBuild] DEBUG apiKey: "${apiKey}"`);
this.logger.warn(`[PromptBuild] DEBUG apiKey: "${process.env.ANTHROPIC_API_KEY}"`);
```

Chave completa vai para log files em producao.

**Remediacao:** Remover as duas linhas.

---

### 10. @Public() decorator nao tem efeito — sem global guard

- **Severidade:** HIGH
- **Arquivo:** `src/public.decorator.ts` + `src/app.module.ts`

`@Public()` existe mas nenhum `APP_GUARD` global le o metadata. Auth depende 100% de `@UseGuards` por rota. Qualquer rota nova sem `@UseGuards` e silenciosamente publica.

**Remediacao:** Registrar `JwtAuthGuard` como `APP_GUARD` global.

---

## Findings Completos — CRITICAL

| ID | Titulo | OWASP | Arquivo |
|----|--------|-------|---------|
| C-01 | Controller agents-v2 inteiro sem JWT guard | A01 | `agents-v2.controller.ts` |
| C-02 | Stripe webhook sem signature verification | A02 | `stripe.controller.ts:12` |
| C-03 | AccountSelectedGuard sem ownership check | A01 | `account_selected.guard.ts` |
| C-04 | Stripe controller: 4 rotas sem auth | A01 | `stripe.controller.ts` |
| C-05 | Google Connections controller sem auth | A01 | `google_connections.controller.ts` |
| C-06 | Admin impersonation verifica wrong user | A01 | `loginInAccountAsAdm/handler.ts:25` |
| C-07 | Hardcoded Turnstile secret | A02 | `checkout/handler.ts:304` |
| C-08 | Hardcoded Cademi API token (2 files) | A02 | `checkout/handler.ts:346`, `create_user/handler.ts:223` |
| C-09 | Anthropic API key logada em warn | A09 | `prompt-build.service.ts:55` |
| C-10 | jsonpath-plus RCE via @chatfunnel/core | A06 | Transitive dep |
| C-11 | JWT expiry mismatch (module: 30s, sign: 30d) | A02 | `auth.module.ts:13` |
| C-12 | Unauthenticated admin endpoints (misc, stripe) | A01 | `misc.controller.ts:30`, `stripe.controller.ts:41` |
| C-13 | @nestjs/core output injection vulnerability | A06 | npm audit |
| C-14 | Stripe checkout forjado = criacao de contas gratis | A01 | `webhook/handler.ts` |
| C-15 | Cademi token + console.log of full payload | A09 | `create_user/handler.ts:229` |

---

## Findings Completos — HIGH

| ID | Titulo | OWASP | Arquivo |
|----|--------|-------|---------|
| H-01 | SSRF via AgentExternalQueries.url | A10 | `tool-executor.service.ts:314` |
| H-02 | Internal secret comparison nao e timing-safe | A02 | `agents-v2.controller.ts:357` |
| H-03 | OTP verification code logado em plaintext | A09 | `users.repository.ts:328` (core) |
| H-04 | WhatsApp access token logado | A09 | `link_whatsapp/handler.ts:60` |
| H-05 | longLivedAccessToken (Facebook) no JWT payload | A02 | `login.handler.ts:80` |
| H-06 | Signup sem rate limiting | A07 | `users.controller.ts:89` |
| H-07 | multer 3x DoS CVEs | A06 | `@nestjs/platform-express` |
| H-08 | nodemailer SMTP injection | A06 | `nodemailer@6.9.16` |
| H-09 | @Public() nao funciona (sem global guard) | A01 | `app.module.ts` |
| H-10 | CORS wildcard + credentials | A05 | `main.ts:44` |
| H-11 | Swagger /api-docs exposto em producao | A05 | `main.ts:75` |
| H-12 | Helmet ausente (sem security headers) | A05 | `main.ts` |
| H-13 | Body limit 200MB global — DoS | A05 | `main.ts:51` |
| H-14 | openaiKey/elevenlabsKey retornados na API response | A02 | `getById/response.ts:173` |
| H-15 | Redis password env var ignorada na conexao | A05 | `redis.service.ts:9` |
| H-16 | ValidationPipe bypassed (body: any) em org create/update | A03 | `organizations.controller.ts:99` |
| H-17 | File upload sem MIME filter e sem fileSize limit | A05 | Multiple FileInterceptor |
| H-18 | Prompt loader agents-v2 sem allowlist (path traversal) | A01 | `agents-v2/prompt-loader.ts` |
| H-19 | Prompt injection via contactData no agent executor | A03 | `agent-executor.service.ts:226` |
| H-20 | Cross-tenant Mastra Memory read via Account-Selected | A01 | `a2a-agent.service.ts:546` |
| H-21 | A2A prompt injection — system prompt exfiltration | A03 | `a2a-chat-request.dto.ts` |
| H-22 | check-cancelled-accounts expoe Stripe subscription IDs | A01 | `stripe.controller.ts:41` |
| H-23 | Sem rate limiting global (so A2A tem throttle) | A07 | `app.module.ts` |
| H-24 | PII (CPF, telefone) enviada a Anthropic/OpenAI sem LGPD | Compliance | `agent-executor.service.ts:226` |
| H-25 | TLS cert validation disabled (rejectUnauthorized: false) | A02 | `memory.config.ts:90` |
| H-26 | Request logger loga headers com JWT | A09 | `req_logger.middleware.ts:99` |
| H-27 | Request logger loga response bodies com JWT | A09 | `req_logger.middleware.ts:103` |
| H-28 | templates/sync sem auth | A01 | `templates.controller.ts` |
| H-29 | npm audit: 2 critical + 12 high | A06 | `package-lock.json` |
| H-30 | Plan upgrade por R$0 via GetPlanValue returning 0 | A04 | Cross-service (PlansClass) |

---

## Findings Completos — MEDIUM

| ID | Titulo | Arquivo |
|----|--------|---------|
| M-01 | bcryptjs.compareSync bloqueia event loop | `login.handler.ts:35` |
| M-02 | Verification codes nunca expiram no banco | `users.repository.ts:347` |
| M-03 | Email templates: user content sem HTML escape | `sendEmail.helpers.ts:62` |
| M-04 | JSON.parse monkey-patch global (Mastra bug) | `main.ts:7-19` |
| M-05 | BullMQ job data nao validado (UUID check) | `assistant.processor.ts:32` |
| M-06 | Stripe Partial DTO cast — missing fields nao caught | `stripe.controller.ts:14` |
| M-07 | console.log com PII/tokens (123 ocorrencias em 37 files) | Multiplos |
| M-08 | OTel auto-instrumentation pode exportar AI prompts | `tracing.ts:12` |
| M-09 | trust proxy: true (IP spoofing) | `main.ts:64` |
| M-10 | Rate limiting so no A2A, nao global | `app.module.ts` |
| M-11 | No audit trail para payment events | `stripe/webhook/handler.ts` |
| M-12 | MCP tools cache race condition | `a2a-agent.service.ts:315` |
| M-13 | BullMQ jobs nao validam accountId cross-tenant | `app.module.ts` |
| M-14 | Mastra memory sem retention policy | `memory.config.ts` |
| M-15 | secrets.env com credenciais live em disco (gitignored) | `envs/secrets.env` |
| M-16 | Frill webhook console.log em vez de logger | `update_frill_notification/handler.ts` |
| M-17 | export_overdues sem auth | `misc.controller.ts:30` |
| M-18 | testIp debug endpoint publico | `misc.controller.ts` |
| M-19 | lodash prototype pollution via @nestjs/swagger | Transitive dep |
| M-20 | strictNullChecks: false no tsconfig | `tsconfig.json` |
| M-21 | Swagger expoe campos internos (openaiKey, wppAccessToken) | `/api-docs` |
| M-22 | A2A Postgres TLS rejectUnauthorized: false | `memory.config.ts:90` |

---

## Findings — LOW

| ID | Titulo | Arquivo |
|----|--------|---------|
| L-01 | Stripe Partial DTO sem null check no switch | `stripe.controller.ts` |
| L-02 | Raw SQL confirmado seguro (parametrizado) | `accounts.repository.ts` |
| L-03 | OTel pode exportar prompt content a collector externo | `tracing.ts` |
| L-04 | JSON.parse monkey-patch modifica mensagens com "suspendedToolRunId" | `main.ts` |
| L-05 | legal-documents/active e /:id sao publicos by design | `legal_documents.controller.ts` |

---

## Dependencias Vulneraveis (npm audit)

| Pacote | Severidade | CVE/Advisory | Fix |
|--------|------------|--------------|-----|
| @nestjs/core <=11.1.17 | CRITICAL | GHSA-36xv-jgw5-4q75 (Output Injection) | >=11.1.19 |
| jsonpath-plus (via core) | CRITICAL | GHSA-pppg-cpfq-h7wr (RCE, CVSS 9.8) | Update chatfunnel-core |
| nodemailer 6.9.16 | HIGH | SMTP injection, CRLF, DoS (4 CVEs) | >=8.0.7 |
| multer (via platform-express) | HIGH | DoS x3 | Upgrade platform-express |
| lodash (via swagger) | HIGH | Prototype pollution, code injection | Upgrade swagger |
| @opentelemetry/* | HIGH | Prometheus crash DoS | >=0.75.0 |

**Total npm audit:** 42 vulnerabilidades (2 critical, 12 high, 24 moderate, 4 low)

---

## Inventario de Endpoints SEM Autenticacao

| Metodo | Rota (/nest prefix) | Risco | Prioridade |
|--------|---------------------|-------|------------|
| ALL | /agents-v2/* (8 rotas) | LLM cost abuse, data access | P0 |
| POST | /stripe/webhook | Payment fraud | P0 |
| POST | /stripe/create-payment-link | Payment link creation | P0 |
| POST | /stripe/checkout | Checkout abuse | P0 |
| GET | /stripe/check-cancelled-accounts | Data leak + mass cancel | P0 |
| GET | /google_connection/:id/:type/list | Google data leak | P0 |
| GET | /misc/export_overdues | Financial data export | P1 |
| POST | /templates/sync/:wabaId/:templateId | Meta template sync | P1 |
| GET | /a2a/health | Session count + DB status | P2 |
| GET | /misc/testIp | IP info leak | P3 |

---

## Analise STRIDE

| Ameaca | Findings | Nivel |
|--------|----------|-------|
| **Spoofing** | C-02 (Stripe forge), C-03 (Account-Selected spoof), C-06 (admin impersonation), H-02 (timing attack) | CRITICO |
| **Tampering** | H-01 (SSRF), H-19 (prompt injection), H-20 (cross-tenant memory), M-04 (JSON.parse patch) | CRITICO |
| **Repudiation** | M-11 (no payment audit trail), M-07 (console.log nao estruturado) | MEDIO |
| **Information Disclosure** | C-09 (API key logada), H-03/H-04 (OTP/token logado), H-05 (PII no JWT), H-14 (AI keys na response), H-24 (PII a AI providers) | CRITICO |
| **Denial of Service** | H-06/H-23 (sem rate limiting), H-07 (multer DoS), H-13 (200MB body) | ALTO |
| **Elevation of Privilege** | C-01/C-04/C-05 (controllers sem auth), C-06 (admin bypass), H-09 (@Public nao funciona) | CRITICO |

---

## Plano de Remediacao Priorizado

### P0 — HOJE

1. **Auth no agents-v2 controller:** `@UseGuards(AuthGuard("jwt"), AccountSelectedGuard)`
2. **Stripe webhook signature:** `constructEvent()` + raw body middleware
3. **Auth no Stripe controller:** `create-payment-link`, `checkout`, `check-cancelled-accounts`
4. **Auth no Google Connections controller**
5. **Remover debug logs:** Anthropic key, WA token, OTP code
6. **Mover secrets para env:** Turnstile secret, Cademi token
7. **Fix admin impersonation:** verificar `req.user.userId`

### P1 — Esta semana

8. **AccountSelectedGuard ownership check** (query ao banco)
9. **Global JWT guard** (`APP_GUARD`) + `@Public()` onde necessario
10. **CORS restritivo:** allowlist de origens
11. **Helmet:** `app.use(helmet())`
12. **Rate limiting global** + tighter no auth endpoints
13. **Timing-safe comparison** no internal secret
14. **SSRF protection** no tool-executor

### P2 — Proximo sprint

15. Reduzir body limit para 1MB default
16. File upload: MIME filter + fileSize limit
17. Remover PII do JWT payload
18. Sanitizar contactData antes de enviar a LLM
19. Swagger: desabilitar em producao
20. Upgrade deps: @nestjs/core, nodemailer, multer, jsonpath-plus
21. ValidationPipe em org create/update
22. Prompt loader allowlist no agents-v2
23. HTML escape em email templates

### P3 — Backlog

24. Mastra memory retention policy
25. TLS cert validation no A2A Postgres
26. OTel prompt content redaction
27. Structured audit trail para payments
28. bcrypt async
29. Verification code expiry
30. Redis password enforcement
31. LGPD: DPA com Anthropic/OpenAI

---

## Metricas

- **Endpoints totais:** ~80+
- **Endpoints sem auth critica:** 11+
- **Dependencias vulneraveis:** 42
- **Secrets hardcoded:** 3
- **Secrets logados:** 3
- **Controllers sem auth:** 3 inteiros
- **AI-specific findings:** 8
- **Total findings unicos:** 72

---

*Relatorio gerado em 2026-05-11 por Claude Code Security Audit.*
*6 agentes: auth/guards, injection/validation, secrets/config, deps/surface, bug bounty, STRIDE.*
*Proxima auditoria recomendada apos remediacao P0/P1.*
