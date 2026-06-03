# Auditoria de Segurança — chatfunnel-api

**Data:** 2026-05-11
**Escopo:** `chatfunnel-api/` (Express 4 + JavaScript) + `chatfunnel-mcp/` (NestJS) + tooling (`.claude/`, `envs/`)
**Metodologia:** STRIDE + OWASP Top 10 (2021) + npm audit + análise estática + bug bounty + threat modeling
**Auditor:** Claude Code (10 agentes especializados em 2 fases)

---

## Resumo Executivo

| Severidade | Fase 1 | Fase 2 | Total |
|------------|--------|--------|-------|
| CRITICAL   | 10     | 7      | **17** |
| HIGH       | 16     | 21     | **37** |
| MEDIUM     | 12     | 11     | **23** |
| LOW        | 6      | 4      | **10** |
| **Total**  | **44** | **43** | **87** |

**Risco geral: CRÍTICO** — Credenciais de produção expostas em código-fonte, endpoints administrativos e de pagamento sem autenticação, SSRF não autenticado, CORS wildcard com credentials, cross-tenant IDOR sistêmico, exploit chains que permitem account takeover e payment bypass, e gaps de compliance LGPD.

### Skills/Agentes utilizados

| Fase | Agente/Skill | Foco | Findings |
|------|-------------|------|----------|
| 1 | `security-reviewer` x6 | Auth, Injection, Secrets, Deps, API Surface, Inter-service | 44 |
| 2 | `security-reviewer` (Express Best Practices) | Express-specific patterns | 11 (BP-xx) |
| 2 | `security-reviewer` (Config Scan) | `.claude/`, `envs/`, MCP, Docker | 10 (CS-xx) |
| 2 | `security-reviewer` (Bug Bounty) | Exploit chains, PoCs | 12 (BH-xx) |
| 2 | `security-reviewer` (STRIDE Threat Model) | Business logic, trust boundaries, LGPD | 16 (TM-xx) |

---

## Findings — CRITICAL

### C-01 | Credenciais de produção no `.env` commitado no git

- **OWASP:** A02 Cryptographic Failures
- **STRIDE:** Information Disclosure
- **Arquivo:** `.env` (raiz do repo)
- **Impacto:** JWT_SECRET permite forjar tokens para qualquer usuário. Stripe live key permite cobranças. AWS S3 keys dão acesso de escrita ao bucket. MongoDB URI dá acesso total ao banco.

**Credenciais expostas:**
| Secret | Valor (parcial) | Risco |
|--------|-----------------|-------|
| JWT_SECRET | `KzG9iVLX...` | Forjar auth tokens |
| STRIPE_SECRET_KEY | `sk_live_...` | Cobranças reais |
| S3_ACCESS_KEY_ID | `AKIAW3MD...` | Leitura/escrita S3 |
| S3_SECRET_ACCESS_KEY | `1Z/RGeK2...` | Leitura/escrita S3 |
| META_CONVERSIONS_ACCESS_TOKEN | `EAADRycS...` | Meta Pixel API |
| MONGO_URI | `mongodb+srv://...` | Acesso total MongoDB |
| EMAIL_PASS | (presente) | SMTP |
| CLIENT_SECRET (Facebook) | `4a835307...` | OAuth abuse |
| ASAAS_PROD_KEY | (presente) | Gateway de pagamento |
| PAGARME_KEY | (presente) | Gateway de pagamento |

**Remediação:** Rotacionar TODAS as credenciais imediatamente. Purgar do histórico git com `git filter-repo` ou BFG. Implementar secrets manager (Vault, AWS Secrets Manager).

---

### C-02 | Tokens e PII reais hardcoded em `ServerTest.js`

- **OWASP:** A02 Cryptographic Failures / A07 Auth Failures
- **STRIDE:** Information Disclosure
- **Arquivo:** `src/ServerTest.js`

**Credenciais encontradas:**
- 3 tokens Facebook/Instagram long-lived (`EAAaBlPp...`)
- OpenAI API key (`sk-Qm2l6...`)
- ElevenLabs API key (`sk_af7c6...`)
- CPF real (PII)
- Email real (PII)
- PagarMe customer ID

**Remediação:** Revogar todos os tokens AGORA. Substituir por fixtures mock. Scrub do histórico git. Possível violação LGPD (PII real em código).

---

### C-03 | SSRF não autenticado — `POST /execute_http`

- **OWASP:** A10 Server-Side Request Forgery
- **STRIDE:** Tampering, Information Disclosure
- **Arquivo:** `src/routes/AutomationRoutes.js:84` → `src/commands/automations/ExecuteHttpRequest/handler.js`
- **Auth:** Nenhuma (`useAuth: false`)
- **Validação:** Vazia (`validation: []`)

```js
const response = await axios.request({
  method: data.httpMethod,
  url: data.httpLink,    // 100% user-controlled
  headers: headers,
  data: dataJson
});
```

**Cenário de ataque:** `POST /api/execute_http` com `httpLink=http://169.254.169.254/latest/meta-data/iam/security-credentials/` → roubo de credenciais AWS da instância EC2.

**Remediação:** Adicionar `useAuth: true`. Validar URL contra allowlist. Bloquear RFC-1918, loopback, link-local.

---

### C-04 | Webhooks de pagamento sem verificação de assinatura

- **OWASP:** A01 Broken Access Control / A07 Auth Failures
- **STRIDE:** Spoofing, Tampering
- **Endpoints afetados:**

| Endpoint | Handler | Verificação |
|----------|---------|-------------|
| `POST /webhook_guru` | WebhookGURU.js | Nenhuma |
| `POST /payment/records` | PaymentRecordsWebhooks.js | Nenhuma |
| `POST /payment/refundedChargedback` | RefundedChargedback.js | Nenhuma |
| `POST /stripe_webhook` | StripeWebhooks.js | Nenhuma (só log) |
| `POST /admin/run-webhook-checkout/:paymentId` | RunWebhookCheckout.js | Nenhuma |

**Cenário de ataque:** POST fake "paid" event → upgrade gratuito de qualquer conta. `WebhookGURU` cria usuários e cartões a partir do payload sem verificar origem.

**Remediação:** Pagarme: verificar `X-Hub-Signature`. Stripe: usar `stripe.webhooks.constructEvent()`. Restringir `run-webhook-checkout` a IPs internos ou `VerifyServicesSecret`.

---

### C-05 | Broadcast Socket.IO sem autenticação — `POST /socket`

- **OWASP:** A01 Broken Access Control
- **STRIDE:** Spoofing, Tampering
- **Arquivo:** `src/routes/SocketRoutes.js` → `src/commands/socket/emitSocket.js`
- **Auth:** Nenhuma

```js
global.signalR.emit("broadcast", { to: channel, payload });
```

Qualquer chamador externo pode injetar mensagens WebSocket arbitrárias para qualquer canal/usuário.

**Remediação:** Adicionar `VerifyServicesSecret` — endpoint é para chamadas internas.

---

### C-06 | `GET /admin/info` — dados de negócio expostos sem auth

- **OWASP:** A01 Broken Access Control
- **STRIDE:** Information Disclosure
- **Arquivo:** `src/routes/AdminRoutes.js:13` → `src/commands/admin/GetInfo.js`
- **Auth:** Nenhuma (`useAuth: false`)

Retorna: total de clientes pagantes, breakdown por plano, receita projetada, contas ativas/trial/cancelando. Query raw SQL sobre todas as contas.

**Remediação:** Adicionar `useAdminAuth: true`.

---

### C-07 | `POST /admin/run-webhook-checkout/:paymentId` — trigger de pagamento sem auth

- **OWASP:** A01 Broken Access Control
- **STRIDE:** Tampering, Elevation of Privilege
- **Arquivo:** `src/routes/AdminRoutes.js:17-23`
- **Auth:** Nenhuma

Triggera processamento de webhook de pagamento para qualquer `paymentId`.

**Remediação:** Adicionar `useAdminAuth: true` ou `VerifyServicesSecret`.

---

### C-08 | `POST /automations/copy` e `PUT /automations/share` sem auth

- **OWASP:** A01 Broken Access Control
- **STRIDE:** Tampering
- **Arquivo:** `src/routes/AutomationRoutes.js:88-103`

`CopyAutomation` e `ShareAutomation` rodam com `useAuth: false`. Permite clonar ou alterar flag de compartilhamento de qualquer automação por UUID.

**Remediação:** Adicionar `useAuth: true` + verificação de ownership.

---

### C-09 | jsonpath-plus RCE (CVE GHSA-pppg-cpfq-h7wr, CVSS 9.8)

- **OWASP:** A06 Vulnerable Components
- **STRIDE:** Tampering, Elevation of Privilege
- **Pacote:** `jsonpath-plus@7.2.0` (via `@chatfunnel/core`)

RCE via crafted JSONPath expressions. Usado em 6+ handlers que processam dados de automações (user-controlled).

**Remediação:** Upgrade `@chatfunnel/core` para pintar `jsonpath-plus>=10.0.0`.

---

### C-10 | JWT algorithm não pinado — risco de algorithm confusion

- **OWASP:** A07 Identification & Auth Failures
- **STRIDE:** Spoofing
- **Arquivos:** `src/middlewares/VerifyJWT.js:13`, `src/middlewares/VerifyAdmin.js:15`

```js
jwt.verify(token, process.env.JWT_SECRET)  // sem { algorithms: ['HS256'] }
```

**Remediação:** `jwt.verify(token, secret, { algorithms: ['HS256'] })` em ambos.

---

## Findings — HIGH

### H-01 | CORS `origin: true` + `credentials: true`

- **Arquivo:** `src/app.js:10-17`
- **OWASP:** A05 Security Misconfiguration

```js
cors({ origin: true, credentials: true, allowedHeaders: "*" })
```

Qualquer website pode fazer requests autenticados cross-origin.

**Remediação:** `origin: ['https://app.chatfunnel.com.br']`

---

### H-02 | Facebook longLivedAccessToken no payload do JWT

- **Arquivos:** `Login/handler.js`, `RefreshToken/handler.js`
- **OWASP:** A02 Cryptographic Failures

JWT payload inclui `longLivedAccessToken` (token Facebook). JWT é base64 — qualquer interceptação expõe o token.

**Remediação:** Remover do JWT. Buscar server-side via `userId` quando necessário.

---

### H-03 | JWT expira em 30 dias sem mecanismo de revogação

- **Arquivos:** `Login/handler.js:99`, `RefreshToken/handler.js:81`
- **OWASP:** A07 Auth Failures

`expiresIn: "30d"`, sem blacklist, sem `jti`. Troca de senha não invalida tokens existentes.

**Remediação:** Reduzir para 15min + refresh token rotation, ou implementar blacklist Redis.

---

### H-04 | API key em query parameter + logada no console

- **Arquivo:** `src/middlewares/AuthorizeApikey.js:7-8`
- **OWASP:** A09 Logging Failures

```js
const key = req.query.apikey;
console.log("YAY Key", key);
```

**Remediação:** Mover para header `Authorization`. Remover `console.log`.

---

### H-05 | Nenhum rate limiting em todo o app

- **OWASP:** A07 Auth Failures (brute force)
- **Endpoints críticos sem throttle:** `/login`, `/forgot_password`, `/reset_password`, `/checkout`, `/execute_http`, `/contacts/import`

**Remediação:** Instalar `express-rate-limit`. Mínimo: 10 req/15min em auth, 5 req/h em forgot_password.

---

### H-06 | ForgotPassword vaza existência de usuário

- **Arquivo:** `src/commands/auth/ForgotPassword/handler.js:11-15`
- **OWASP:** A07

Retorna 404 `UserNotFound` quando email não existe. Permite enumeração.

**Remediação:** Sempre retornar 200 com mensagem genérica.

---

### H-07 | Path traversal em uploads (multer)

- **Arquivos:** `ImportContacts.js:48-57`, `CreateBroadcast/import.js:37`
- **OWASP:** A01 Broken Access Control

```js
cb(null, file.originalname);  // user-controlled, sem sanitização
```

**Remediação:** `cb(null, uuidv4() + path.extname(path.basename(file.originalname)));`

---

### H-08 | Nenhum `limits.fileSize` no multer

- **Arquivos:** Todos os endpoints de upload
- **OWASP:** A05 Security Misconfiguration

Uploads ilimitados de tamanho. Body-parser limit (5MB) não se aplica a multipart.

**Remediação:** `limits: { fileSize: 10 * 1024 * 1024 }` em cada instância multer.

---

### H-09 | Nenhuma validação de input (express-validator não utilizado)

- **OWASP:** A03 Injection
- **Impacto:** Zero routes usam express-validator apesar de estar instalado.

**Remediação:** Implementar schemas de validação por endpoint. Priorizar: auth, payment, contact creation.

---

### H-10 | `$queryRawUnsafe` com construção de WHERE dinâmica

- **Arquivos:** `DeleteAllContacts.js:104-117`, `GetInfo.js:6`
- **OWASP:** A03 Injection

Valores são parametrizados ($1, $2), mas a estrutura SQL é string-concatenada. Fragilidade futura.

**Remediação:** Migrar para `Prisma.sql` tagged template.

---

### H-11 | `Prisma.raw(condition.field)` — SQL injection se validação bypassed

- **Arquivos:** `ContactConditionsBuilder.js:93`, `GetBroadcastContacts.js:131`
- **OWASP:** A03 Injection

`Prisma.raw()` não é parametrizado. Campo vem de input filtrado por allowlist, mas bypass da allowlist = injection direta.

**Remediação:** Mapa estático `{ fieldName: Prisma.sql\`column\` }` em vez de `Prisma.raw()`.

---

### H-12 | Sem security headers (Helmet ausente)

- **Arquivo:** `src/app.js`
- **OWASP:** A05 Security Misconfiguration

Faltam: `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `CSP`, `Referrer-Policy`. Vaza `X-Powered-By: Express`.

**Remediação:** `app.use(require('helmet')())`.

---

### H-13 | `/metrics` (Prometheus) sem auth

- **Arquivo:** `src/ServerBase.js:109`
- **OWASP:** A01 Broken Access Control

Expõe memory usage, event loop lag, active handles.

**Remediação:** Restringir a IPs internos ou adicionar bearer token.

---

### H-14 | `WebhookGURU` armazena senha sem bcrypt

- **Arquivo:** `src/commands/payment/WebhookGURU.js:45`
- **OWASP:** A02 Cryptographic Failures

```js
const hashedPassword = Math.random().toString(36).slice(-10);
// armazenado em passwordHash como plaintext
```

**Remediação:** `bcrypt.hash(password, 10)` antes de salvar.

---

### H-15 | Redis sem auth/TLS + URL logada no startup

- **Arquivo:** `src/common/apis/RedisAPI.js:5`
- **OWASP:** A05 Security Misconfiguration

**Remediação:** Remover `console.log`. Configurar TLS se Redis está em rede compartilhada.

---

### H-16 | S3 URLs permanentes públicas em vez de presigned

- **Arquivo:** `src/class/S3Class.js:37-41`
- **OWASP:** A01 Broken Access Control

Media de usuários acessível permanentemente sem auth via URL pública S3.

**Remediação:** Usar `getSignedUrl` com expiração (já importado mas comentado).

---

## Findings — MEDIUM

| ID | Título | OWASP | Arquivo |
|----|--------|-------|---------|
| M-01 | `VerifyAccountSelected` aceita qualquer UUID sem verificar ownership no banco | A01 | `middlewares/VerifyAccountSelected.js` |
| M-02 | requestLogger armazena header Authorization completo no banco | A09 | `middlewares/requestLogger.js:105` |
| M-03 | bcrypt sync (`hashSync/compareSync`) bloqueia event loop | A07 | `Login/handler.js`, `CreateUser/handler.js` |
| M-04 | `ChangePassword` pula verificação de senha antiga para social-login | A07 | `commands/auth/ChangePassword/handler.js` |
| M-05 | Inter-service secrets usam `!==` (vulnerável a timing attack) | A07 | `VerifyServicesSecret.js`, `VerifyWorkerSecret.js` |
| M-06 | Secrets inter-service fracos (`123`, `segredinho`, `qualquercoisa`) | A07 | `.env:78,83` |
| M-07 | SCHEDULER_SECRET duplicado no `.env` com valores diferentes | A05 | `.env:83,89` |
| M-08 | `catch {}` vazio em `WebhookGURU` silencia erros de pagamento | A09 | `WebhookGURU.js:145` |
| M-09 | SSRF via `media.url` em `CloudAPI.uploadMedia` | A10 | `CloudAPI.js:888` |
| M-10 | Stripe webhook é stub (só loga e retorna 200) | A07 | `misc/StripeWebhooks.js` |
| M-11 | `system` webhook type bypassa toda validação | A01 | `WebHookHandler/handler.js:29-35` |
| M-12 | JWT em query string nos endpoints SSE | A02 | `ContactsRoutes.js:62-75` |

---

## Findings — LOW

| ID | Título | Arquivo |
|----|--------|---------|
| L-01 | Login distingue "user not found" de "wrong password" (enumeração) | `Login/handler.js:29` |
| L-02 | `GET /coupon` público — enumeração de cupons | `PaymentRoutes.js:56` |
| L-03 | `GET /testIp` público — expõe headers de infraestrutura | `MiscRoutes.js:22-35` |
| L-04 | bcrypt cost factor 10 (mínimo aceitável, recomendado 12+) | `CreateUser/handler.js` |
| L-05 | `console.log(error)` vaza stack traces em `UploadMedia.js` | `UploadMedia.js:131,170,221` |
| L-06 | Pacote `fs@0.0.1-security` no package.json (placeholder npm) | `package.json` |

---

## Dependências Vulneráveis (npm audit)

| Pacote | Versão | Severidade | CVE/Advisory | Fix |
|--------|--------|------------|--------------|-----|
| jsonpath-plus | 7.2.0 | CRITICAL | GHSA-pppg-cpfq-h7wr (RCE) | >=10.0.0 |
| axios | 1.6.0 | HIGH | SSRF, prototype pollution, CRLF (15 CVEs) | >=1.15.2 |
| xlsx | 0.18.5 | HIGH | Prototype pollution, ReDoS | Substituir por `exceljs` |
| nodemailer | 6.x | HIGH | SMTP injection, CRLF, DoS | >=8.0.7 |
| tar | (transitive) | HIGH | Path traversal, race condition | `npm audit fix` |
| basic-ftp | (transitive) | HIGH | CRLF injection | `npm audit fix` |
| lodash | 4.17.21 | HIGH | Code injection via `_.template` | Auditar uso |
| fast-xml-parser | (transitive) | MODERATE | XML injection | `npm audit fix` |
| follow-redirects | (transitive) | MODERATE | Auth header leak | `npm audit fix` |

**Total vulnerabilidades npm:** 18 (2 critical, 8 high, 7 moderate, 1 low)

---

## Inventário de Rotas Públicas (sem auth)

Rotas com `useAuth: false` que representam superfície de ataque:

| Método | Rota | Risco | Prioridade |
|--------|------|-------|------------|
| POST | `/execute_http` | SSRF | P0 |
| POST | `/socket` | Broadcast injection | P0 |
| GET | `/admin/info` | Data leak | P0 |
| POST | `/admin/run-webhook-checkout/:paymentId` | Payment fraud | P0 |
| POST | `/automations/copy/:automationId` | Cross-account clone | P0 |
| PUT | `/automations/share/:automationId` | Unauthorized write | P0 |
| POST | `/webhook_guru` | Payment fraud | P1 |
| POST | `/payment/records` | Payment fraud | P1 |
| POST | `/payment/refundedChargedback` | Payment fraud | P1 |
| POST | `/stripe_webhook` | No-op (stub) | P1 |
| GET | `/metrics` | Info disclosure | P1 |
| GET | `/coupon` | Coupon enumeration | P2 |
| GET | `/testIp` | Infra info leak | P2 |
| GET | `/url/:buttonId` | Automation data leak | P2 |
| GET | `/insights/*` | Automation data leak | P2 |

---

## Análise STRIDE

| Ameaça | Findings Relacionados | Nível de Risco |
|--------|----------------------|----------------|
| **Spoofing** | C-10 (JWT algo), C-04 (webhook forge), C-05 (socket spoof), M-05 (timing attack) | CRÍTICO |
| **Tampering** | C-03 (SSRF), C-04 (payment forge), C-08 (automation tamper), H-07 (path traversal), H-10/H-11 (SQLi) | CRÍTICO |
| **Repudiation** | M-08 (catch vazio), M-10 (Stripe no-op), L-05 (console.log) | MÉDIO |
| **Information Disclosure** | C-01 (secrets), C-02 (tokens/PII), C-06 (admin info), H-02 (JWT payload), H-04 (API key log), H-13 (metrics), H-15 (Redis log) | CRÍTICO |
| **Denial of Service** | H-05 (no rate limit), H-08 (unlimited upload), M-03 (bcrypt sync) | ALTO |
| **Elevation of Privilege** | C-09 (RCE via jsonpath), C-07 (payment trigger), M-01 (IDOR via Account-Selected) | CRÍTICO |

---

## Plano de Remediação Priorizado

### P0 — Antes do próximo deploy (HOJE)

1. **Rotacionar credenciais:** JWT_SECRET, STRIPE_SECRET_KEY, S3 keys, META_CONVERSIONS_ACCESS_TOKEN, MONGO_URI password, Facebook CLIENT_SECRET, ASAAS_PROD_KEY, PAGARME_KEY
2. **Revogar tokens:** Todos os tokens de `ServerTest.js` (Meta, OpenAI, ElevenLabs)
3. **Scrub git history:** `git filter-repo` para remover `.env` e `ServerTest.js` do histórico
4. **Remover console.log:** `AuthorizeApikey.js` (API key leak), `RedisAPI.js` (Redis URL)
5. **Adicionar auth aos endpoints críticos:**
   - `POST /socket` → `VerifyServicesSecret`
   - `GET /admin/info` → `useAdminAuth: true`
   - `POST /admin/run-webhook-checkout` → `useAdminAuth: true`
   - `POST /execute_http` → `useAuth: true` + URL validation
   - `POST /automations/copy` → `useAuth: true`
   - `PUT /automations/share` → `useAuth: true`

### P1 — Esta semana

6. **Pinar JWT algorithm:** `{ algorithms: ['HS256'] }` em VerifyJWT e VerifyAdmin
7. **Verificação de webhook:** HMAC em todos os endpoints de pagamento
8. **CORS restritivo:** `origin: ['https://app.chatfunnel.com.br']`
9. **Helmet:** `app.use(helmet())`
10. **Rate limiting:** `express-rate-limit` em auth endpoints

### P2 — Próximo sprint

11. **Sanitizar uploads:** UUID filename + fileSize limit no multer
12. **Remover Facebook token do JWT payload**
13. **Reduzir JWT expiry** para 15min + refresh token rotation
14. **Migrar `$queryRawUnsafe`** para `Prisma.sql`
15. **Upgrade dependências:** jsonpath-plus >=10, axios >=1.15.2, nodemailer >=8
16. **Substituir xlsx** por exceljs
17. **Implementar express-validator** nos endpoints prioritários

### P3 — Backlog

18. Verificação de ownership no `VerifyAccountSelected`
19. Strip Authorization header no requestLogger
20. Migrar bcrypt para async (`bcrypt.hash/compare`)
21. Timing-safe comparison em inter-service secrets
22. Presigned S3 URLs
23. Remover pacote `fs` do package.json
24. Aumentar bcrypt rounds para 12

---

# FASE 2 — Análises Complementares

---

## Express Best Practices (BP-xx)

### BP-01 | CRITICAL | `trust proxy: true` — IP spoofing total

- **Arquivo:** `src/app.js:9`
- **OWASP:** A05 Security Misconfiguration

```js
app.set("trust proxy", true);
```

`trust proxy: true` confia em TODOS os headers `X-Forwarded-For`, incluindo os injetados pelo cliente. `req.ip` fica 100% controlado pelo atacante, invalidando qualquer rate limiting ou geofencing baseado em IP.

**Remediação:** `app.set("trust proxy", 1)` (confiar apenas no primeiro proxy hop).

---

### BP-02 | HIGH | Arbitrary file read via `req.query.path` em ImportContacts

- **Arquivo:** `src/commands/contacts/ImportContacts.js:424`
- **OWASP:** A01 Broken Access Control

```js
let filePath = req.query.path;
const fileContent = fs.readFileSync(filePath, "utf-8");
```

`req.query.path` vai direto para `fs.readFileSync` sem sanitização. Path traversal permite ler qualquer arquivo do servidor (`../../../../etc/passwd`).

**Remediação:** Validar que `path.resolve(filePath)` começa com `MEDIA_PATH`.

---

### BP-03 | HIGH | ReDoS via regex user-controlled em automações

- **Arquivo:** `src/commands/instagram/WebHookHandler/processor/fragments/HandlerIGAutomation.js:440`
- **OWASP:** A07

```js
case TriggerMessageChoiseEnum.REGEX:
  let regex = new RegExp(condition.regex);  // user-controlled
```

Regex catastrófica (`(a+)+$`) bloqueia o event loop por minutos.

**Remediação:** Usar `safe-regex` para validar no momento da criação. Executar regex em worker thread com timeout.

---

### BP-04 | HIGH | Sem error handler global no Express

- **Arquivo:** `src/app.js`
- **OWASP:** A05

Nenhum `app.use((err, req, res, next) => ...)` registrado. Erros de middleware (multer, body-parser) caem no handler default do Express que vaza stack trace se `NODE_ENV !== 'production'`.

**Remediação:** Adicionar error handler final em `app.js`.

---

### BP-05 | HIGH | JWT Bearer no query string dos endpoints SSE

- **Arquivo:** `src/routes/ContactsRoutes.js:70,215,237`
- **OWASP:** A02

3 endpoints SSE copiam `req.query.Authorization` para headers. JWT aparece em access logs, browser history, Referrer headers.

**Remediação:** Usar one-time token via POST autenticado, com expiração de 30s no Redis.

---

### BP-06 | MEDIUM | `X-Powered-By: Express` não desabilitado

- **Arquivo:** `src/app.js`
- **Remediação:** `app.disable("x-powered-by")`

---

### BP-07 | MEDIUM | body-parser 5MB global sem granularidade por rota

- **Arquivo:** `src/app.js:22`

5MB aceito em TODAS as rotas. Default seguro seria 100KB com override por rota.

---

### BP-08 | MEDIUM | `/admin/run-webhook-checkout` público (duplicado com remediação Express-specific)

Endpoint admin sem auth aceita replay de pagamento.

---

### BP-09 | MEDIUM | requestLogger persiste Authorization header no banco

- **Arquivo:** `src/middlewares/requestLogger.js:103`

**Remediação:** `delete sanitizedHeaders.authorization` antes de logar.

---

### BP-10 | LOW | Instagram webhook challenge refletido sem verificar token

- **Arquivo:** `src/commands/instagram/WebHookValidator.js`

```js
res.send(req.query['hub.challenge']);  // sem verificar hub.verify_token
```

WhatsApp e Messenger validam o token; Instagram não. Permite webhook subscription hijacking.

**Remediação:** Verificar `hub.verify_token` contra `process.env.INSTAGRAM_WEBHOOK_TOKEN`.

---

## Claude Config & Tooling Security (CS-xx)

### CS-01 | CRITICAL | Credenciais de produção em `envs/secrets.env`

- **Arquivo:** `envs/secrets.env` (gitignored mas em disco, plaintext)

Contém: Anthropic API key (`sk-ant-api03-...`), Stripe live key (em comentário), AWS S3 keys, Google Client Secret, Resend API key, JWT Secret (cópia), Meta tokens, MongoDB URI, DATABASE_URL com senha de produção.

**Remediação:** Rotacionar TODAS. Adotar secrets manager. `chmod 600` no arquivo.

---

### CS-02 | CRITICAL | MCP JWT Secret trivial: `"segredinho"`

- **Arquivo:** `envs/mcp.env`

Brute-force em segundos com hashcat. Permite forjar MCP session tokens.

**Remediação:** `openssl rand -hex 32`

---

### CS-03 | HIGH | CORS wildcard no chatfunnel-mcp

- **Arquivo:** `chatfunnel-mcp/src/main.ts:8-11`

```ts
origin: (origin, callback) => { callback(null, true); }
```

**Remediação:** Allowlist explícita.

---

### CS-04 | HIGH | Tool call params logados em debug level (PII risk)

- **Arquivo:** `chatfunnel-mcp/src/mcp/mcp-server.service.ts:176-183`

`body.params?.arguments` (dados de contatos, CRM, PII) logado integralmente em `LOG_LEVEL=debug`.

**Remediação:** Redatar ou remover log de params.

---

### CS-05 | HIGH | Legacy frontend JWT bypass habilitado no MCP

- **Arquivo:** `envs/mcp.env` — `MCP_ALLOW_LEGACY_FRONTEND_JWT=true`

Aceita JWT do frontend direto, bypassando o fluxo MCP dedicado.

**Remediação:** Setar `false` em todos os ambientes.

---

### CS-06 | MEDIUM | AccountSelectedGuard sem validação de formato UUID

- **Arquivo:** `chatfunnel-mcp/src/mcp/guards/account-selected.guard.ts`

---

### CS-07 | MEDIUM | `Bash(bash:*)` wildcard nas permissões do Claude Code

- **Arquivo:** `.claude/settings.local.json:14`

Permite qualquer comando bash. Firewall hook não cobre todos os casos.

---

### CS-08 | MEDIUM | User prompts escritos em `.tmp` não gitignored

- **Arquivo:** `.claude/hooks/track-prompt.js` → `vault/diary/raw/.tracking-conversation.tmp`

Risco de commitar histórico de conversas com credenciais.

**Remediação:** Adicionar `vault/diary/raw/*.tmp` ao `.gitignore`.

---

### CS-09 | LOW | Placeholder `SUBDOMINIO` no docker-compose do MCP

- **Arquivo:** `chatfunnel-mcp/docker-compose.yml:13`

---

### CS-10 | LOW | Docker build cache com secrets (mitigado por `--mount=type=secret`)

- **Arquivo:** `chatfunnel-mcp/dockerfile`

---

## Bug Bounty — Exploit Chains (BH-xx)

### BH-01 | CRITICAL | Payment replay — upgrade grátis via `/admin/run-webhook-checkout`

**Narrativa:** Atacante descobre `paymentId` real (sequencial ou via leak) → POST sem auth → account upgrade sem pagamento.

```bash
curl -X POST https://app.chatfunnel.com.br/api/admin/run-webhook-checkout/ch_abc123
```

**Impacto:** Bypass de pagamento em escala.

---

### BH-02 | CRITICAL | Criação ilimitada de cupons PREMIUM via `/partner`

**Narrativa:** `POST /api/partner` sem auth → `event: "partner.created"` → cria cupom com `useLimit: 1000000`, plano PREMIUM, 30 dias.

```bash
curl -X POST https://app.chatfunnel.com.br/api/partner \
  -H "Content-Type: application/json" \
  -d '{"event":"partner.created","data":{"id":"FREE","name":"hacker","email":"h@h.com","created_at":"2024-01-01","updated_at":"2024-01-01"}}'
```

**Impacto:** Cupons PREMIUM ilimitados. Qualquer pessoa se registra com trial gratuito de 30 dias.

---

### BH-03 | CRITICAL | Account takeover via GenerateResetToken + leaked SERVICES_SECRET

**Narrativa:** `.env` commitado contém `SERVICES_SECRET` → atacante chama `POST /generate_reset_token` com `userId` da vítima → recebe link de reset → altera senha.

```bash
curl -X POST https://app.chatfunnel.com.br/api/generate_reset_token \
  -H "Authorization: Bearer <SERVICES_SECRET>" \
  -d '{"userId":"<victim-uuid>"}'
# Response: {"link":"...?token=<TOKEN>"}

curl -X POST https://app.chatfunnel.com.br/api/reset_password \
  -d '{"token":"<TOKEN>","password":"hacked123"}'
```

**Impacto:** Takeover de qualquer conta do sistema.

---

### BH-04 | HIGH | Cross-tenant broadcast export (IDOR)

**Narrativa:** Atacante autenticado seta `Account-Selected` para UUID de outra conta → `GET /accounts/broadcast/export/:broadcastId` retorna todos os contatos (nome, telefone, status) do broadcast da vítima.

```bash
curl "https://app.chatfunnel.com.br/api/accounts/broadcast/export/<VICTIM-BROADCAST>" \
  -H "Authorization: Bearer <ATTACKER_JWT>" \
  -H "Account-Selected: <VICTIM-ACCOUNT-UUID>"
```

**Impacto:** Exfiltração de lista de contatos de qualquer conta.

---

### BH-05 | HIGH | PII leak via `GET /checkouts/:identifier?accountId=`

**Narrativa:** Endpoint público retorna nome, email, telefone, CPF/CNPJ do dono da conta para qualquer `accountId` conhecido.

```bash
curl "https://app.chatfunnel.com.br/api/checkouts/premium?accountId=<ANY-UUID>"
```

**Impacto:** Exfiltração de PII (violação LGPD).

---

### BH-06 | HIGH | Cross-tenant WhatsApp media proxy

**Narrativa:** `GET /chat/:contactId/messages/:messageId` não verifica se o contact pertence ao account do caller. Atacante acessa mídia (imagens, áudio, docs) de conversas de outras contas.

**Impacto:** Exfiltração de mídia privada de WhatsApp.

---

### BH-07 | HIGH | Moderator invite tokens sem expiração

**Narrativa:** Tokens de convite nunca expiram. Ex-funcionário com link antigo mantém acesso permanente como moderador.

**Impacto:** Backdoor persistente pós-demissão.

---

### BH-08 | HIGH | SSRF via PartnerWebhook → Make.com workflows

**Narrativa:** Atacante injeta dados controlados via `POST /partner` (sem auth) que são forwarded para webhook Make.com interno.

**Impacto:** Trigger de workflows internos com dados maliciosos.

---

### BH-09 | HIGH | SQL error disclosure + credentials in URL no DeleteAllContacts

**Narrativa:** `tagIds` inválidos causam PostgreSQL cast error que vaza schema. Credenciais viajam em query params.

---

### BH-10 | MEDIUM | Race condition no upgrade de plano (TOCTOU)

**Narrativa:** Duas requests simultâneas de upgrade → double-charge ou undercharge pela race no Prisma read-committed.

---

### BH-11 | MEDIUM | Coupon disclosure + TOCTOU no uso

**Narrativa:** `GET /coupon?coupon=NAME` (público) retorna objeto completo. Race entre check de limit e uso.

---

### BH-12 | MEDIUM | Cross-tenant media proxy sem ownership check

Duplicado com BH-06, foco diferente: `GetMessageMedia.js` usa `wppAccessToken` da conta alvo.

---

## STRIDE Threat Model — Business Logic (TM-xx)

### TM-01 | CRITICAL | Account-Selected header é self-asserted, não verificado criptograficamente

**Categoria:** Spoofing
**Impacto de negócio:** Isolamento multi-tenant é advisory, não enforced. Comandos que fazem `findFirst({ where: { accountId } })` sem `userId` são exploráveis cross-tenant.

**Comandos vulneráveis confirmados:** `GetBroadcastById`, `CreateBroadcast`, `PostOpenaiKey`, `GetModerators`, `ExportBroadcastDetails`.

**Remediação arquitetural:** Enforcar ownership em `VerifyAccountSelected` via query ao banco. Aplicar `useAccountSelected: true` em TODAS as rotas.

---

### TM-02 | HIGH | Upgrade de plano por R$0 via combinação plan+leads inválida

**Categoria:** Tampering
**Arquivo:** `ChangePlanAccount/handler.js`, `PlansClass.js`

`PlansClass.GetPlanValue()` retorna `0` para combinações não encontradas na tabela. `amountToPay = 0 - discount` = free upgrade.

**Remediação:** Nunca retornar 0 como preço válido. Validar plan/leads/period contra whitelist server-side.

---

### TM-03 | HIGH | Meta/OpenAI tokens retornados a moderadores

**Categoria:** Information Disclosure
**Arquivo:** `GetActiveAccounts.js:54-56`

`wppAccessToken`, `openaiKey`, e `owner.longLivedAccessToken` retornados no response para qualquer moderador.

**Impacto:** Token theft → impersonação da empresa no WhatsApp, leitura de DMs, consumo de créditos OpenAI.

**Remediação:** Nunca retornar tokens raw ao frontend. Proxy de API calls server-side.

---

### TM-04 | HIGH | Moderadores têm poder de owner — sem granularidade de permissões

**Categoria:** Elevation of Privilege
**Arquivos:** `DeleteAllContacts.js`, `ExportContacts.js`, `CreateBroadcast/handler.js`

`permissionsGroup` existe no schema mas não é enforced em nenhuma rota. Moderador pode deletar todos os contatos, exportar PII, enviar broadcasts.

**Remediação:** Middleware `VerifyPermission` com flags granulares (READ, WRITE, EXPORT, DELETE, BROADCAST).

---

### TM-05 | HIGH | Cross-tenant tag injection em broadcasts

**Categoria:** Tampering
**Arquivo:** `CreateBroadcast/handler.js:213-234`

```js
const tag = await prismaTransaction.tags.findFirst({ where: { id: t.id } }); // sem accountId filter
```

Tags de outra conta podem ser vinculadas a broadcasts. Pode triggar automações da conta alheia que reagem a tag additions.

**Remediação:** Sempre filtrar por `accountId` em queries de tags.

---

### TM-06 | HIGH | Checkout bypassa proteção de downgrade (validação comentada)

**Categoria:** Tampering
**Arquivo:** `Checkout/handler.js:146-152`

Validações de plan/period estão comentadas (`//`). Usuário usa checkout link de plano barato para fazer upgrade, pagando menos.

**Remediação:** Descomentar validações. Adicionar test de integração.

---

### TM-07 | HIGH | Sem implementação de direitos LGPD (Art. 18-20)

**Categoria:** Compliance
**Impacto:** Multas até 2% do faturamento (cap R$50M). Sem mecanismo de:
- Exclusão a pedido do titular
- Tracking de consentimento
- Política de retenção (soft-delete fica indefinidamente)
- Portabilidade de dados
- Audit trail de operações destrutivas

**Remediação:** Workflow `DataSubjectRequest` + campo `consentedAt` no Contact schema + cron de hard-delete + tabela `AuditLog`.

---

### TM-08 | HIGH | PII CSV escrito em disco antes de streaming

**Categoria:** Information Disclosure
**Arquivo:** `ExportContacts.js:223-230`

`contatos_${accountId}.csv` escrito no CWD. Race condition entre exports simultâneos. Arquivo persiste se server crashar.

**Remediação:** Stream direto para response. Se precisar de arquivo, usar `os.tmpdir()` com UUID + cleanup em `finally`.

---

### TM-09 | HIGH | Sem rate limiting — DoS amplification

**Categoria:** Denial of Service

Endpoints de alto custo sem throttle: `/execute_http` (SSRF proxy), `/login` (bcrypt), `/contacts/import` (CSV parsing + disk I/O), `/account/broadcast` (bulk processing), `/contacts/runAutomation` (automation trigger ilimitado).

---

### TM-10 | HIGH | JWT tokens nos access logs via SSE query params

**Categoria:** Information Disclosure

Tokens propagam para: server logs, CDN logs, browser history, Referrer headers. Tokens de 30 dias sem revogação.

---

### TM-11 | MEDIUM | Sem audit trail para operações destrutivas

**Categoria:** Repudiation

Nenhum log para: delete-all contacts, export contacts, broadcast send, moderator add/remove, API key CRUD.

---

### TM-12 | MEDIUM | PII em CSV on disk com race condition

Duplicado com TM-08 em contexto de compliance.

---

### TM-13 | MEDIUM | CopyAutomation vaza webhook URLs e API keys internas

**Categoria:** Information Disclosure
**Arquivo:** `CopyAutomation.js`

Automação compartilhada pode conter URLs de webhook internos e tokens em HTTP step bodies. `CopyAutomation` sem auth copia tudo.

---

### TM-14 | MEDIUM | WebhookGURU — password plaintext no banco

**Categoria:** Cryptographic Failures
**Arquivo:** `WebhookGURU.js:45`

`Math.random().toString(36).slice(-10)` armazenado como `passwordHash` sem bcrypt.

---

### TM-15 | MEDIUM | Plan upgrade TOCTOU race condition

Duplicado com BH-10. Race no PostgreSQL read-committed durante upgrade concorrente.

---

### TM-16 | MEDIUM | Automation copy shares cross-tenant automation logic

Duplicado com TM-13 em contexto de multi-tenancy.

---

## Métricas Finais

- **Endpoints totais analisados:** ~130
- **Endpoints públicos (sem auth):** 25+ (15 com risco significativo)
- **Dependências vulneráveis:** 18
- **Secrets expostos:** 15+ credenciais de produção (2 fontes: `.env` + `secrets.env`)
- **Exploit chains documentados:** 12 (com PoC)
- **Business logic flaws:** 16
- **Compliance gaps (LGPD):** 5
- **Total de findings únicos:** 87
- **Agentes utilizados:** 10 (2 fases)

---

## Plano de Remediação Atualizado

### P0 — HOJE (antes do próximo deploy)

1. **Rotacionar credenciais** de `.env`, `secrets.env`, `mcp.env`, e `ServerTest.js`
2. **Adicionar auth** a endpoints críticos: `/execute_http`, `/socket`, `/admin/info`, `/admin/run-webhook-checkout`, `/automations/copy`, `/automations/share`, `/partner`
3. **Scrub git history** para remover secrets
4. **Remover console.log** que loga API keys e Redis URL
5. **MCP JWT Secret** — trocar `"segredinho"` por valor criptográfico

### P1 — Esta semana

6. **Pinar JWT algorithm** `{ algorithms: ['HS256'] }`
7. **HMAC em webhooks** de pagamento (Pagarme, Stripe, GURU)
8. **CORS restritivo** em `app.js` e `chatfunnel-mcp/main.ts`
9. **Helmet** + `app.disable("x-powered-by")`
10. **Rate limiting** em auth endpoints
11. **Trust proxy** → `app.set("trust proxy", 1)`
12. **Verificar ownership** no `VerifyAccountSelected` (query ao banco)

### P2 — Próximo sprint

13. Sanitizar uploads (UUID filename + fileSize limit)
14. Remover Facebook token do JWT payload
15. Reduzir JWT expiry (15min + refresh token rotation)
16. Migrar `$queryRawUnsafe` para `Prisma.sql`
17. Upgrade deps: jsonpath-plus >=10, axios >=1.15.2, nodemailer >=8
18. Substituir xlsx por exceljs
19. Implementar express-validator
20. Error handler global no Express
21. Validar regex de automações com safe-regex
22. Validar `req.query.path` no ImportContacts
23. Descomentar validações de checkout (plan/period)

### P3 — Backlog

24. Middleware de permissões granulares para moderadores
25. Strip Authorization header no requestLogger
26. Migrar bcrypt para async
27. Timing-safe comparison em inter-service secrets
28. Presigned S3 URLs
29. Moderator invite tokens com expiração
30. Implementar direitos LGPD (exclusão, consentimento, audit trail)
31. Stream CSV direto para response (sem disco)
32. Gitignore `.tracking-*.tmp`
33. Desabilitar `MCP_ALLOW_LEGACY_FRONTEND_JWT`

---

*Relatório gerado em 2026-05-11 por Claude Code Security Audit.*
*Fase 1: 6 agentes (auth, injection, secrets, deps, API surface, inter-service)*
*Fase 2: 4 agentes (Express best practices, config scan, bug bounty, STRIDE threat model)*
*Próxima auditoria recomendada após remediação P0/P1.*
