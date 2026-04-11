---
title: chatfunnel-services
description: Referencia tecnica do backend NestJS — modulos, guards, filtros, Prisma via core, BullMQ, Swagger, SWC.
tags: [repos, services, nestjs, bullmq, swagger]
related: ["[[chatfunnel-api]]", "[[chatfunnel-core]]", "[[chatfunnel-front]]"]
last_updated: 2026-04-05
---

# chatfunnel-services

Backend de processamento — agentes IA, integracoes, filas. **TypeScript**, porta 3200, prefixo `/nest`.

## Estrutura

```
src/
  main.ts            # Bootstrap (porta 3200, prefixo /nest, Swagger, ValidationPipe)
  modules/           # Feature modules NestJS (~20 modulos)
  database/          # PrismaModule + repositories
  guards/            # AccountSelectedGuard, ModeratorAuthGuard
  filters/           # DomainErrorFilter, HttpExceptionFilter
  middlewares/       # Request logger
  adapters/          # Adapters para servicos externos
  core/              # APIs externas, helpers, Redis, payment
  assets/            # Templates HTML de email
```

## Padrao de Modulo NestJS

Cada feature segue a estrutura:

```
modules/<nome>/
  <nome>.module.ts      # @Module — imports, controllers, providers
  <nome>.controller.ts  # Rotas HTTP (decorators @Get, @Post, etc.)
  <nome>.service.ts     # Logica de negocio
  dto/                  # DTOs com class-validator
```

## Como criar um modulo novo

1. Criar pasta em `src/modules/<nome>/`
2. Criar `<nome>.module.ts` com `@Module()`
3. Criar `<nome>.controller.ts` — rotas com decorators
4. Criar `<nome>.service.ts` — logica de negocio
5. Criar DTOs em `dto/` com decorators `class-validator`
6. Registrar o modulo no `app.module.ts`
7. Se tiver prompts `.md`, registrar no `nest-cli.json` como assets

## Bootstrap (main.ts)

| Config | Valor |
|--------|-------|
| Porta | 3200 |
| Prefixo global | `/nest` (exceto `/health`) |
| Body limit | 200mb |
| ValidationPipe | `transform: true`, `whitelist: true`, `forbidNonWhitelisted: true` |
| Filters globais | DomainErrorFilter, HttpExceptionFilter |
| Swagger | `/api-docs` |
| CORS | aberto (all origins) |

## Guards

| Guard | Proposito |
|-------|-----------|
| `AccountSelectedGuard` | Valida que o request tem `accountId` (multi-tenancy) |
| `ModeratorAuthGuard` | Auth para moderadores |
| `@Public()` decorator | Desabilita auth na rota (em `public.decorator.ts`) |

IMPORTANTE: Rotas literais ANTES de rotas parametrizadas nos controllers.

## Validacao

- **ALWAYS** usar `class-validator` para DTOs de controller
- Zod existe como dep transitiva do Mastra — nao usar diretamente
- ValidationPipe global transforma e filtra campos automaticamente

## Prisma

Acesso via `PrismaModule` em `database/`. Schema vem do [[chatfunnel-core]] (`@chatfunnel/core`). Repositories em `database/repositories/`.

## BullMQ

Filas via `@nestjs/bullmq`. Processors ficam em `modules/queues/` (registrado como submodulo, nao no `app.module`). Diferente do Bull usado na [[chatfunnel-api]].

## Swagger

Decorators `@nestjs/swagger` nos controllers e DTOs. Docs disponiveis em `/api-docs`. Metadata automatico via plugin no `nest-cli.json`.

## SWC Compiler

Build e dev usam SWC (nao tsc). Implicacoes:
- Erros de tipo **nao bloqueiam** o build
- Rodar `typecheck` separado para validar tipos
- `strictNullChecks: false` e `noImplicitAny: false` no tsconfig

## Stack de IA

- `@anthropic-ai/sdk` — chamadas diretas ao Claude
- `@mastra/core` + `@mastra/mcp` + `@mastra/memory` — agentes com memoria
- Prompts em Markdown: `modules/a2a/prompts/` e `modules/agents-v2/prompts/`
- `nest-cli.json` copia `.md` como assets (`watchAssets: true`)

## Gotchas

- SWC nao bloqueia build com erros de tipo — rodar `typecheck` separado
- Mastra faz monkey-patch no `JSON.parse` global
- Prompts `.md` sao assets copiados pelo nest-cli — nao esquecer de registrar
- Body limit de 200mb (diverge dos outros repos)

Veja tambem: [[database-gotchas]], [[infrastructure-gotchas]], [[integration-gotchas]]
