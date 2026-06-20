---
title: Frontend Security Reputation
description: Gotchas de reputacao, antivirus e tracking no app frontend.
last_updated: 2026-06-15
---

# Frontend Security Reputation

## Avast `URL:Phishing` em `app.chatfunnel.com.br`

**Data:** 2026-06-15
**Repo:** `chatfunnel-front`
**Arquivos:** `index.html`, `nginx.conf`, `src/main.js`, `src/views/TermsUse.vue`, `src/views/PrivacyPolice.vue`

### Contexto

Usuario reportou Avast bloqueando `app.chatfunnel.com.br` como `URL:Phishing`. A pagina respondia `200` via Cloudflare e nao havia redirect estranho na raiz, mas havia sinais que podem alimentar falso positivo de reputacao.

### Achados

- `index.html` carregava Google Tag Manager antes do bundle Vue.
- GTM `GTM-K5WQR7SP` injetava Clarity via Custom HTML e usava first-party collection em `gtmserver.chatfunnel.com.br`.
- O app ja inicializava Clarity no bundle (`src/main.js`), entao havia duplicidade.
- Amplitude estava com session replay `sampleRate: 1`.
- Sentry estava com `sendDefaultPii: true`.
- `/robots.txt` caia no fallback da SPA e retornava `index.html`.
- Textos legais usavam dominio errado `chatfunel.com.br` e contato antigo `vukermidia@gmail.com`.

### Mitigacao aplicada

- Removido GTM inline de `index.html`.
- Criado `public/robots.txt` com `Disallow: /`.
- Adicionados headers basicos no Nginx (`nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `COOP`).
- Corrigido dominio legal para `chatfunnel.com.br` e contato para `contato@chatfunnel.com.br`.

### Regras futuras

- Auditar o container GTM antes de reativar tag no app.
- Evitar Custom HTML em GTM para scripts de tracking no app autenticado.
- Revisar `sendDefaultPii` e taxa de session replay antes de deploy em producao.
- Quando houver bloqueio por antivirus, capturar evidencia da URL exata, vendor, detection id e horario antes de submeter falso positivo.
