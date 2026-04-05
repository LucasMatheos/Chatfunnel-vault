# ChatFunnel

Workspace privado de desenvolvimento do ChatFunnel. Contem os repositorios do projeto como subpastas (cada um com seu proprio git) e um vault Obsidian como knowledge base.

## Stack

- Backend API: Express.js + TypeScript (chatfunnel-api, porta 3001)
- Backend Services: NestJS + TypeScript (chatfunnel-services, porta 3200)
- Frontend: Vue 3 + Vite + TypeScript (chatfunnel-front, porta 5173)
- Banco: PostgreSQL via Prisma (chatfunnel-database, submodulo compartilhado)
- WebSocket: SignalWebsocket (porta 10000)
- Infra: Redis, Docker

## Knowledge Base — Vault Obsidian

O vault em `vault/` e a knowledge base do projeto. Funciona como um wiki estruturado com indices que eu (Claude) navego e mantenho.

### Como navegar

```
vault/_index.md          → Master Index (LER PRIMEIRO)
  → wiki/features/       → Features end-to-end
  → wiki/architecture/   → Fluxos e decisoes de sistema
  → wiki/layers/         → Referencia tecnica por camada
  → wiki/gotchas/        → Armadilhas e workarounds
  → decisions/           → ADRs
  → diary/               → Daily notes
  → raw/                 → Staging area (conteudo bruto)
```

**Regra de navegacao:** Master Index → Topic Index → Artigo. Maximo 3 leituras pra chegar na informacao.

### Quando consultar o vault

- ANTES de implementar uma feature — verificar se tem contexto, decisoes, gotchas
- ANTES de tomar decisao arquitetural — verificar ADRs existentes
- Quando o usuario perguntar sobre "como funciona X" — verificar wiki primeiro

### Quando atualizar o vault

- APOS descobrir algo nao obvio durante implementacao (gotcha)
- APOS tomar uma decisao arquitetural (ADR em decisions/)
- APOS implementar/modificar uma feature — atualizar o wiki correspondente
- APOS receber contexto de negocio do usuario — registrar no wiki da feature

### Como atualizar

1. Criar/editar o artigo no wiki correspondente
2. Usar wikilinks `[[nome-do-artigo]]` para conectar a artigos relacionados
3. Atualizar o `_index.md` da secao se criou artigo novo
4. Atualizar `vault/_index.md` se criou secao nova
5. Atualizar `last_updated` no frontmatter

### O que NAO vai no vault

- Codigo, schemas, rotas — o codebase e a fonte de verdade pra isso
- Coisas que `git log` ou `git blame` respondem
- Detalhes efemeros da sessao atual

### Formato dos artigos

```markdown
---
title: Nome do Artigo
description: Uma linha descrevendo o conteudo
tags: [tag1, tag2, tag3]
related: ["[[outro-artigo]]", "[[mais-um]]"]
last_updated: YYYY-MM-DD
---

# Titulo

Conteudo com wikilinks para [[artigos-relacionados]].
```

## Raw → Wiki (Processamento)

A pasta `raw/` e uma staging area. Quando o usuario jogar conteudo la (web clips, PDFs, anotacoes):

1. Perguntar se quer que processe pro wiki
2. Analisar o conteudo, extrair temas
3. Criar artigos estruturados em `wiki/`
4. Conectar com wikilinks
5. Atualizar indices
6. Mover ou deletar o raw original (perguntar ao usuario)

## Repositorios

Os repositorios do projeto ficam como subpastas (cada um com git independente):

- `chatfunnel-api/` — API Express
- `chatfunnel-services/` — Services NestJS
- `chatfunnel-front/` — Frontend Vue/Vite
- `chatfunnel-core/` — Core compartilhado
- `chatfunnel-websocket/` — WebSocket server
- `chatfunnel-worker-broadcast/` — Worker de broadcast
- `chatfunnel-gateway/` — Gateway
- `chatfunnel-external-api/` — API externa
- `chatfunnel-scheduler/` — Scheduler
- `chatfunnel-database/` — Prisma schema (submodulo)

## Regras

- NEVER commite na branch main ou release diretamente
- ALWAYS crie feature/fix branch (ex: `feature/novo-modulo`, `fix/correcao-login`)
- NEVER altere o schema Prisma sem gerar migration com `--create-only`
- NEVER aplique migrations no banco — apenas gere com `--create-only`
- ALWAYS atualize o vault quando descobrir algo relevante durante o trabalho
