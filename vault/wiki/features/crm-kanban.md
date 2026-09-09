---
title: CRM / Kanban Pipeline
description: Gestao visual de oportunidades de venda em pipelines Kanban com drag-and-drop, status, prioridades e acoes em massa.
tags: [features, crm, kanban]
related: ["[[contacts]]", "[[realtime-communication]]"]
last_updated: 2026-04-05
---

# CRM / Kanban Pipeline

O CRM do ChatFunnel e um gerenciador de oportunidades de venda organizado em pipelines visuais estilo Kanban. Cada pipeline representa um funil de vendas com colunas (estagios) e cards (oportunidades vinculadas a [[contacts|contatos]]).

## Conceitos Principais

- **Pipeline (Kanban):** Um funil de vendas. A conta pode ter multiplos pipelines. Requer plano PREMIUM.
- **Coluna (Stage):** Estagio do funil (ex: "Visitantes", "Leads Qualificados", "Negociacao", "Venda Concluida"). Cada coluna tem nome, cor, posicao e flag `isDone` para marcar o estagio final.
- **Card (Oportunidade):** Um contato dentro do pipeline. Contem valor monetario (`amount`), prioridade, moderadores responsaveis, comentarios e historico de movimentacao.
- **Status da Oportunidade:** `OPEN`, `WON` ou `LOST`. Cards ganhos/perdidos recebem estilo visual diferenciado. Perdas podem ter um `lossReason` associado.

## Entidades (Prisma)

| Entidade | Descricao |
|----------|-----------|
| `kanbans` | Pipeline — pertence a uma `account` |
| `kanbanColumns` | Colunas do pipeline — posicao, cor, nome, `isDone` |
| `kanbanCards` | Card/oportunidade — vincula `contact` a uma `column`, tem `amount`, `priority`, `statusOportunity` |
| `kanbanComments` | Comentarios em um card (por usuario) |
| `kanbanLossesReasons` | Motivos de perda configurados por pipeline |
| `kanbanMetadata` | Campos customizados do pipeline |
| `kanbanMetaPixels` | Pixels Meta vinculados ao pipeline |

## Prioridades

Enum `KanbanCardsPriorityEnum`: `LOW` (padrao), `MEDIUM`, `HIGH`.

## Fluxo de Uso

1. Usuario cria um pipeline (ou recebe o demo ao acessar pela primeira vez)
2. Configura colunas (estagios) com nomes e cores
3. Adiciona oportunidades — vinculando um contato existente ou criando um novo
4. Arrasta cards entre colunas via drag-and-drop (usa `vuedraggable`)
5. Abre o card para editar valor, moderadores, tags, comentarios ou campos customizados
6. Marca oportunidades como ganhas (`WON`) ou perdidas (`LOST` + motivo de perda)

### Drag-and-drop e selecao de texto

O Kanban usa `vuedraggable` com `force-fallback`. Durante o arraste, o Front adiciona temporariamente a classe `kanban-is-dragging` ao `body` para desabilitar `user-select` em toda a arvore, incluindo o clone fallback anexado fora do componente. A classe deve ser removida tanto no fim do drag quanto no `onBeforeUnmount` para nao bloquear a selecao normal de texto depois da interacao.

### Contrato do filtro de tags em `findColumn`

O endpoint recebe `tagIds` no formato `{ id: string }[]`, conforme o DTO do Services e `FindColumnCardsFilters` no Core. O Front normaliza a selecao para esse wire format em `FilterKanban.vue`, e a query de `KanbanColumnsRepository.findColumnCardsRaw()` extrai os IDs com `filters.tagIds.map((tag) => tag.id)`. Nao alterar apenas um dos lados: Front, DTO e Core precisam permanecer alinhados.

## Acoes em Massa (Mass Actions)

Selecao multipla de cards permite:
- Mover para outra coluna ou outro pipeline
- Deletar cards
- Alterar prioridade
- Adicionar/remover moderador
- Adicionar/remover tags
- Marcar como ganho ou perdido

## Real-time (WebSocket)

Atualizacoes sao propagadas via Socket.IO usando `KanbanSocketClass` que emite para o canal `broadcast`:

| Evento | Payload | Quando |
|--------|---------|--------|
| `kanban` | `{ kanbanId, columnId }` | Coluna atualizada (card criado, movido, deletado) |
| `kanban-card` | card object | Card individual atualizado (ex: valor alterado) |

O front escuta esses eventos via `eventBus` (migrado de socket direto para event bus interno) e atualiza as colunas afetadas com lazy loading por coluna.

## Permissoes

| Permissao | Acao |
|-----------|------|
| `CRM.NEW_PIPELINE` | Criar novo pipeline |
| `CRM.ADD_OPPORTUNITY` | Adicionar oportunidade |
| `CRM.SETTINGS` | Acessar configuracoes do pipeline |
| `CRM.DUPLICATE` | Duplicar pipeline |

## Camadas

| Camada | Local |
|--------|-------|
| Front (pagina) | `chatfunnel-front/src/views/crm/Kanban.vue` |
| Front (service) | `chatfunnel-front/src/common/services/KanbanService.js` |
| API (commands) | `chatfunnel-api/src/commands/kanban/` |
| API (routes) | `chatfunnel-api/src/routes/KanbanRoutes.js` |
| API (socket) | `chatfunnel-api/src/class/sockets/KanbanSocketClass.js` |
| Services (NestJS) | `chatfunnel-services/src/modules/crm/` — comentarios, motivos de perda, metadata, pixels, consultas de coluna/card |
