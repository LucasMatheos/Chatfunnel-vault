---
title: AI Agents
description: Agentes de IA conversacionais que atendem contatos nos canais de mensagem, executam tools e disparam automacoes.
tags: [features, ai-agents, intelligence]
related: ["[[ai-agents-architecture]]", "[[automations]]", "[[livechat]]"]
last_updated: 2026-04-05
---

# AI Agents

## O que sao

Agentes de IA sao assistentes autonomos que conversam com contatos via canais de mensagem (WhatsApp, Instagram DM, etc). Cada agente tem personalidade, objetivo e ferramentas configuradas pelo operador. Substituem o sistema legado de "Assistants" (`/assistants`).

## Criacao de um agente

O operador pode criar um agente de duas formas: **Criar com IA** (do zero, personalizado) ou **Criar manualmente** (a partir de template). O formulario coleta 14 campos que alimentam a geracao do system prompt:

| Campo | Obrigatorio | Descricao |
|-------|:-----------:|-----------|
| `name` | sim | Nome de exibicao do agente |
| `model` | sim | Modelo LLM (ex: `claude-sonnet-4-6`, `gpt-4o`) |
| `provider` | sim | Provedor (ANTHROPIC, OPENAI) |
| `role` | nao | Persona que o agente incorpora |
| `objective` | nao | Objetivo central (qualificar leads, agendar demos, etc) |
| `businessContext` | nao | Contexto da empresa, produto, publico-alvo |
| `knowledgeBase` | nao | Base de conhecimento (FAQs, precos, politicas) |
| `systemPrompt` | nao | Instrucoes livres adicionais |
| `tools` | nao | Definicoes de ferramentas disponiveis |
| `reasoning` | nao | Estilo de raciocinio do agente |
| `tone` | nao | Tom de voz e estilo de comunicacao |
| `outputFormat` | nao | Formato de saida das respostas |
| `examples` | nao | Exemplos few-shot de interacoes ideais |
| `guardrails` | nao | Restricoes (nao mencionar concorrentes, etc) |

Campos opcionais omitidos ficam ausentes do prompt gerado.

## O que agentes podem fazer

### Tools built-in
- **get_contact_data** — consultar dados do contato atual
- **update_contact_field** — atualizar campos do contato (ex: nome, email)
- **move_kanban_card** — mover card no kanban/CRM

### Tools configurados pelo operador
- **External queries** — HTTP POST para APIs externas (ex: consultar CPF), com parametros definidos
- **Data mapping** — extrair e mapear campos da conversa para custom fields
- **Calendar** — agendar eventos com lembretes
- **Service hours** — respeitar horario de atendimento configurado

### Automacoes condicionais
O agente pode disparar [[automations]] quando julgar necessario. Exemplo: "Transferir para humano" — quando o contato pede atendimento humano, o agente aciona a automacao vinculada (que pode incluir transferencia para [[livechat]]).

### Automacoes de lifecycle
Automacoes que executam em momentos especificos do ciclo de vida da sessao (inicio, fim, interrupcao).

## Sessoes

Cada conversa agente+contato+canal cria uma **sessao** (`AgentSessions`). Ciclo de vida:

1. **findOrCreate** — reutiliza sessao ativa ou cria nova
2. **Historico** — sliding window das ultimas N mensagens (cache Redis, TTL 30min, fallback PostgreSQL)
3. **Persistencia** — cada mensagem salva no banco e invalida cache
4. **Expiracao** — via BullMQ job quando o timer expira, ou interrupcao manual (ex: step `STOP_ASSISTANT` em automacao)

Sessoes expiradas sao hard-deleted. Na expiracao, lifecycle automations configuradas sao disparadas.

## Intelligence (A2A)

O modulo **A2A** (Agent-to-Agent) e uma ferramenta **interna** para moderadores/operadores do ChatFunnel. Nao e voltada para contatos finais.

### Como funciona
- Interface de chat com streaming SSE
- Um **orchestrator** (Claude) recebe a mensagem e delega para agentes especializados:
  - `flow` — automacoes e fluxos
  - `system` — configuracoes do sistema
  - `template` — templates de mensagem
  - `crm` — operacoes de CRM/kanban
  - `contacts` — gestao de contatos
- Conecta a ferramentas da plataforma via MCP
- Sessoes in-memory com TTL e cleanup automatico
- Conversas persistidas em `A2aConversations` / `A2aMessages`

### Endpoints
- `POST /a2a/chat` — enviar mensagem (resposta via SSE stream)
- `POST /a2a/chat/:sessionId/cancel` — cancelar stream ativo
- `GET /a2a/conversations` — listar conversas do usuario
- `GET /a2a/conversations/:id/messages` — historico de mensagens
- `DELETE /a2a/conversations/:id` — deletar conversa
- `GET /a2a/health` — metricas (requests, custo, erros, sessoes ativas)

## Entidades principais

| Entidade | Descricao |
|----------|-----------|
| `Agent` | Configuracao do agente (prompt, model, tools, status) |
| `AgentSessions` | Sessao ativa entre agente+contato+canal |
| `AgentSessionMessages` | Mensagens da sessao (role: USER, ASSISTANT, TOOL, SYSTEM) |
| `AgentExternalQueries` | HTTP functions configuradas |
| `AgentAutomations` | Automacoes condicionais vinculadas |
| `AgentFields` | Campos de contato que o agente extrai |
| `A2aConversations` | Conversas do Intelligence (por usuario/account) |
| `A2aMessages` | Mensagens do Intelligence |

## Status do agente

No frontend, agentes tem tres estados: `active`, `paused`, `draft`. O card exibe modelo, rating, atendimentos ativos, contatos, automacoes vinculadas e execucoes. Suporta avatar customizado e resposta por audio.
