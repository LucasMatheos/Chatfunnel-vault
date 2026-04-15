---
title: Error Handling
description: Padroes de tratamento de erros em cada repo — DomainErrors, exception filters, createRoute, HandlerError (Go).
tags: [architecture, error-handling, cross-repo]
related: ["[[inter-service-communication]]", "[[multi-tenancy]]"]
last_updated: 2026-04-12
---

# Error Handling

## Visao geral

Cada repo tem seu proprio padrao de tratamento de erros, mas todos compartilham a base `DomainError` definida no core.

```
Core (DomainError)
  ├─→ Services (NestJS exception filters)
  ├─→ API (createRoute + wrapHandler)
  └─→ Gateway (HandlerError struct em Go)
```

## chatfunnel-core — Classes base

**Arquivo**: `src/errors/domain-errors.ts`

| Classe | Code | Descricao |
|---|---|---|
| `DomainError` | — | Base: `code` + `message`, extends `Error` |
| `NotFoundError` | `NOT_FOUND` | Recurso nao encontrado |
| `ValidationError` | `VALIDATION_ERROR` | Dados invalidos |
| `ConflictError` | `CONFLICT` | Conflito de estado |
| `ForbiddenError` | `FORBIDDEN` | Sem permissao |

Importado por services e api via `@chatfunnel/core`.

## chatfunnel-services (NestJS) — Exception Filters

**Arquivos**:
- `src/filters/domain-error.filter.ts` — captura `DomainError`
- `src/filters/httpexception.filter.ts` — captura `HttpException`

Ambos registrados como global filters em `main.ts`.

**Mapeamento DomainError → HTTP**:

| Code | Status HTTP |
|---|---|
| `NOT_FOUND` | 404 |
| `VALIDATION_ERROR` | 400 |
| `CONFLICT` | 409 |
| `FORBIDDEN` | 403 |
| Default | 500 |

**Response**: `{ statusCode, message, error: code }`

**Fluxo**: Service lanca `DomainError` → filter intercepta → converte pra HTTP response.

## chatfunnel-api (Express) — createRoute + wrapHandler

**Arquivos**:
- `src/common/utils/createRoute.js` — factory de rotas
- `src/common/constants/ErrorsConstants.js` — 400+ mensagens por modulo

**Pattern**:
```javascript
createRoute(router, method, path, controller, {
  useAuth: true,
  hasValidation: true,
  useAccountSelected: true
})
```

`wrapHandler()` envolve o controller em try/catch. Qualquer erro vira 500 com mensagem generica.

**Fluxo**: Route → validation middleware → auth middleware → wrapHandler(controller) → catch → 500.

## chatfunnel-gateway (Go) — HandlerError

**Arquivo**: `internal/handler/errors.go`

```go
type HandlerError struct {
    StatusCode int    `json:"-"`
    Message    string `json:"error"`
    Internal   error  `json:"-"`
}
```

**Erros predefinidos**: `ErrInternalServer` (500), `ErrNotFound` (404), `ErrParseBody` (400).

**Response**: Struct `Response` com `Status` + `Message` + `Data`, serializado via `Write(w)`.

**Fluxo**: Handler retorna `*HandlerError` → middleware converte pra JSON response.

## Tabela comparativa

| Repo | Linguagem | Pattern | Erro base | Catch |
|---|---|---|---|---|
| core | TypeScript | Classes | `DomainError` | — (lib, nao catch) |
| services | TypeScript | Global filters | `DomainError` + `HttpException` | Filter mapeia pra HTTP |
| api | JavaScript | Middleware wrap | `Error` generico | `wrapHandler` → 500 |
| gateway | Go | Error struct | `HandlerError` | Handler retorna erro |

## Gotchas

- A **API Express** nao diferencia tipos de erro — tudo vira 500. Apenas `ErrorsConstants` contem mensagens especificas por modulo, mas o status code e sempre 500
- O **Gateway Go** logga erros no stdout via `Log()` mas nao tem structured logging
- Ambos **services e api** dependem do core pra `DomainError`, mas a api em JS nao usa os tipos — catches sao genericos
