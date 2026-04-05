# ChatFunnel

Workspace multi-repo do ChatFunnel. Cada subpasta e um repositorio independente com seu proprio git.

## Repositorios

| Repo | Stack | Porta | Descricao |
|------|-------|-------|-----------|
| `chatfunnel-front/` | Vue 3 + Vite + TS | 5173 | Dashboard, editor de funis, livechat, CRM |
| `chatfunnel-api/` | Express + JS | 3001 | API principal (REST) |
| `chatfunnel-services/` | NestJS + TS | 3200 | Processamento, integracoes, agentes IA, filas |
| `chatfunnel-external-api/` | Express + JS | 3002 | API publica para integracoes externas |
| `chatfunnel-gateway/` | Go | — | API Gateway (proxy/routing) |
| `chatfunnel-websocket/` | Node + TS | 10000 | WebSocket server (Socket.IO) |
| `chatfunnel-worker-broadcast/` | Node + TS | — | Worker de broadcast (filas BullMQ) |
| `chatfunnel-scheduler/` | Node + TS | 3000 | Tarefas agendadas (API + worker) |
| `chatfunnel-core/` | TS | — | Lib compartilhada (Prisma, repositories, queues, Redis, Meta APIs) |

**Banco:** PostgreSQL via Prisma (schema em `chatfunnel-database/`, submodulo compartilhado)
**Infra:** Redis (cache, pub/sub, locks), BullMQ (filas), Docker

## Arquitetura

```
[Browser] ──→ [Front :5173]
                  │ HTTP
          ┌───────┴───────┐
     [API :3001]    [Services :3200]
          │               │
          ├───────┬───────┤
          ▼       ▼       ▼
      [PostgreSQL] [Redis] [BullMQ]
          ▲                │
     [WebSocket :10000]    ├→ [Worker Broadcast]
                           └→ [Scheduler]

[External] ──→ [External API :3002] ──→ [Gateway (Go)]
```

- **Front** consome duas APIs via Axios: `Api` (Express :3001) e `NestApi` (NestJS :3200)
- **WebSocket** usa Socket.IO para real-time (mensagens, livechat, kanban)
- **Workers** processam jobs assincronos via BullMQ
- **Auth** via Passport + JWT em todos os backends

## Comandos

Cada repo tem seu proprio `package.json`. Dentro de qualquer repo Node:

```bash
npm run dev     # Dev server
npm run build   # Build producao
npm test        # Testes
npm run lint    # Linting
```

Gateway (Go): `cd chatfunnel-gateway && go run ./cmd/...`

## Regras

### Git

- NEVER faca commit automaticamente — somente quando o usuario pedir explicitamente
- NEVER inclua `Co-Authored-By` nas mensagens de commit
- NEVER commit na branch `main` ou `release` diretamente
- ALWAYS crie branch: `feature/nome`, `fix/nome`, `refactor/nome`

### Prisma / Banco

- NEVER altere o schema sem migration `--create-only`
- NEVER rode `prisma db push` ou `prisma migrate deploy`
- ALWAYS passe `accountId` em toda query (multi-tenancy)
- ALWAYS use soft delete (`isDeleted: true`)

### Multi-repo

- ALWAYS leia o `CLAUDE.md` do sub-repo antes de trabalhar nele — cada repo tem regras especificas
- ALWAYS respeite a stack de cada repo (class-validator no Services, Zod no Front, etc.)
- NEVER misture dependencias entre repos — `chatfunnel-core/` e o unico pacote compartilhado

## Knowledge Base

O vault Obsidian em `vault/` e a knowledge base do projeto. Use a skill `obsidian-vault` para navegar e manter.

- ALWAYS consulte o vault antes de implementar features ou tomar decisoes arquiteturais
- ALWAYS atualize o vault apos descobrir gotchas ou tomar decisoes relevantes
