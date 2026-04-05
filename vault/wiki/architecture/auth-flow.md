---
title: Auth Flow — Autenticacao e Autorizacao
description: Como funciona o JWT, permissoes e auth entre servicos no ChatFunnel
tags: [architecture, auth, jwt, permissions, security]
related: ["[[multi-tenancy]]", "[[message-flow]]", "[[realtime-communication]]"]
last_updated: 2026-04-05
---

# Auth Flow

O ChatFunnel usa diferentes mecanismos de auth dependendo do servico e do contexto.

## Mecanismos por Servico

| Servico | Mecanismo | Middleware/Guard |
|---------|-----------|-----------------|
| chatfunnel-front | JWT token no header Authorization | — (client) |
| chatfunnel-api | JWT + middlewares Express | `VerifyJWT`, `VerifyAccountSelected`, `VerifyAdmin` |
| chatfunnel-services | JWT + guards NestJS | JWT Guard, `AccountSelectedGuard`, `ModeratorAuthGuard` |
| chatfunnel-external-api | API key via query param | `AuthorizeApikey` + `withInsiderFallback` |
| chatfunnel-scheduler | Sem auth | Acesso restrito via rede Docker interna |
| chatfunnel-gateway | Sem auth | Recebe webhooks publicos da Meta |
| chatfunnel-websocket | Sem auth | Acesso via rede interna |

## Fluxo de Login

```
[Front] POST /api/auth/login (email + senha)
    ↓
[API] verifica credenciais (bcrypt)
    ↓
[API] gera JWT com { userId, ... }
    ↓
[Front] armazena token no Pinia store (auth)
    ↓
[Front] toda request inclui header: Authorization: Bearer <token>
```

## JWT no API (Express)

Toda rota usa `createRoute()` de `@utils` com `useAuth: true` por default:

```
createRoute(router, "GET", "/contacts", handler, {
  useAuth: true,              // default — aplica VerifyJWT
  useAccountSelected: true,   // valida accountId
  hasValidation: true,        // aplica express-validator
})
```

- `useAuth: false` → rota publica (sem JWT)
- Middlewares customizados via `mids: [...]`

### Middlewares de Auth (API)

| Middleware | Quando usar |
|-----------|-------------|
| `VerifyJWT` | Padrao em toda rota (via createRoute) |
| `VerifyAccountSelected` | Garante accountId no request |
| `VerifyAdmin` | Rotas admin-only |
| `VerifyServicesSecret` | Chamadas do chatfunnel-services para a API |
| `VerifyWorkerSecret` | Chamadas de workers |
| `AuthorizeApikey` | Usado no external-api (nao no api principal) |

## JWT no Services (NestJS)

- Auth global via Passport + JWT strategy
- `@Public()` decorator (`src/public.decorator.ts`) desabilita auth na rota
- `AccountSelectedGuard` valida accountId
- `ModeratorAuthGuard` para moderadores

## Auth Inter-servico

Quando um servico precisa chamar outro:

| De → Para | Mecanismo |
|-----------|-----------|
| Services → API | `VerifyServicesSecret` (secret compartilhado) |
| Workers → API | `VerifyWorkerSecret` (secret compartilhado) |
| API/Services (via Core) → Scheduler | HTTP com header `x-internal-secret` (via `SchedulerConfig.secret`) |
| Scheduler → Services | HTTP com header `x-internal-secret` (via `WORKER_SERVICE_SECRET`) |
| External API → WebSocket | Socket.IO client (`global.signalR`) |

## Auth da External API

Diferente de todos os outros — usa API key, nao JWT:

```
GET /v1/contacts?apikey=<key>&permission=<perm>
    ↓
[AuthorizeApikey] verifica key no banco → extrai accountId
    ↓
[withInsiderFallback] se auth falha, tenta proxy para CALLBACK_EXTERNAL_API_URL
    ↓
[Handler] processa com accountId da key
```

## Permissoes

- Gerenciadas no modulo `permissions/` do Services
- Frontend usa `usePermissionsComposable()` e componente `CheckPermission`
- Permissoes sao por usuario dentro de uma account
- Admin (VerifyAdmin) tem acesso total cross-account
