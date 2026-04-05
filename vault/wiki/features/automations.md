---
title: Automations (Flows)
description: Fluxos visuais de automacao que respondem a gatilhos de Instagram, WhatsApp e CRM com sequencias de passos configuráveis.
tags: [features, automations]
related: ["[[queue-architecture]]", "[[ai-agents]]", "[[contacts]]"]
last_updated: 2026-04-05
---

# Automations (Flows)

Automations sao fluxos visuais que automatizam interacoes com [[contacts]] no Instagram e WhatsApp. O usuario monta um grafo de passos (steps) no editor visual (Vue Flow), conectando gatilhos a acoes. Internamente chamados de "Flows" na UI e `IGAutomations` no banco.

## Conceito

Uma automation e composta por:

- **Gatilhos (Triggers)** — o que inicia o flow
- **Passos (Steps)** — as acoes executadas em sequencia/ramificacao
- **Conexoes (Edges)** — ligam passos entre si formando o grafo

O usuario edita um **draft** (rascunho) e so quando clica "Publicar" o flow entra em vigor. Flows podem ser ativados/desativados via toggle sem perder a configuracao.

## Gatilhos (TriggerTypesEnum)

| Gatilho | Descricao |
|---------|-----------|
| `MESSAGE` | DM recebida no WhatsApp (com filtro por keywords, regex, case-sensitive) |
| `DIRECT` | DM recebida no Instagram |
| `COMMENT` | Comentario em publicacao/Reels (qualquer pub, pub especifica, ou Reels especifico) |
| `STORY` | Resposta a Story (qualquer story ou story especifico) |
| `STORY_MENTION` | Mencao em Story de outro usuario (com modo once-per-day) |
| `ADS` / `ADS_WHATSAPP` | Click em anuncio Meta (Instagram ou WhatsApp) |
| `TEMPLATE` | Resposta a template de WhatsApp (botao de template) |
| `LINK` | Click em link rastreado |
| `TAG_ADDED` / `TAG_REMOVED` | Quando uma tag e adicionada/removida do contato |
| `NEW_CONTACT` | Quando um novo contato e criado |
| `KANBAN_COLUMN_IN` / `KANBAN_COLUMN_OUT` | Contato entra/sai de coluna do funil de vendas |
| `KANBAN_CARD_WON` / `KANBAN_CARD_LOST` | Card marcado como ganho/perdido no funil |

Gatilhos suportam **condicoes de mensagem** (keywords exatas, contem texto, regex, qualquer mensagem) e **respostas automaticas a comentarios** (texto aleatorio entre opcoes configuradas).

Gatilhos genericos (ANY_MESSAGE, ANY_STORIES, ANY_PUB_REELS) tem prioridade menor — sao avaliados por ultimo para que gatilhos especificos tenham precedencia.

## Tipos de Passos (StepTypesEnum)

| Passo | Nome na UI | Descricao |
|-------|------------|-----------|
| `INSTAGRAM_ACTIONS` | Mensagem Instagram | Envia DM, midia, botoes, input, template no Instagram |
| `WHATSAPP_ACTIONS` | Mensagem no WhatsApp | Envia mensagem, midia, botoes, input, template no WhatsApp |
| `ACTIONS` | Acoes | Acoes de dados: add/remove tag, HTTP request, opt-in/out, [[ai-agents\|Agente de IA]] |
| `DELAY` | Atraso Inteligente | Pausa a execucao por duracao, data/hora, ou "esperar ate" |
| `CONDITIONS` | Condicoes | Ramificacao condicional baseada em tags, custom fields, etc. |
| `ASSISTANT` | Agente de IA | Delega a conversa para um [[ai-agents\|agente de IA]] configurado |
| `RUN_AUTOMATION` | Executar Flow | Chama outro flow como sub-rotina |
| `KANBAN_ACTIONS` | Acoes do Funil | Add/mover card, trocar moderador, ganhar/perder card |
| `CHAT_ACTIONS` | Acoes no Chat | Acoes sobre a conversa no livechat |
| `AB_TEST` | Randomizador | Distribui contatos entre caminhos aleatorios (teste A/B) |
| `FOLLOW_UP` | Follow Up de Inatividade | Reenvia mensagem se o contato nao responder no tempo configurado |

## Acoes do Passo ACTIONS (StepActionTypesEnum)

- `ADD_TAG` / `REMOVE_TAG` — gerenciar tags do contato
- `DEFINE_OPTIN` / `REMOVE_OPTIN` — gerenciar opt-in
- `HTTP_REQUEST` — chamada HTTP externa (GET/POST/PUT/DELETE) com body parametrizavel
- `ASSISTANT` — delegar para [[ai-agents|agente de IA]] (renderizado como node separado `ASSISTANT` na UI)

## Delays e Follow-Ups

Os delays e follow-ups sao processados via filas Bull (Redis):

- **AutomationStepDelayQueue** — agenda a continuacao do flow apos o tempo configurado (duracao, data/hora, ou "esperar ate")
- **AutomationStepFollowUpQueue** — reenvia mensagem quando o contato fica inativo por tempo configurado
- **AutomationStepInputQueue** — aguarda resposta do contato com timeout; ramifica para "respondeu" ou "nao respondeu"
- **AutomationAssistantFollowUpQueue** — follow-up de inatividade especifico para conversas com [[ai-agents|agente de IA]]
- **RemoveAutomationBlacklistQueue** — remove o contato da blacklist apos cooldown (evita reexecucao imediata)

## Integracao com Agentes de IA

Automations se integram com [[ai-agents]] de duas formas:

1. **Passo ASSISTANT** — o flow delega a conversa para o agente, com `answerStepId` (proximo passo se respondeu), `unanswerStepId` (se nao respondeu), e `afterAssistantStepId` (apos o agente encerrar)
2. **Gatilho com answerAssistantId** — o proprio gatilho de comentario pode ter um agente que responde automaticamente nos comentarios, incluindo suporte a threads (`parentCommentId`)

## Draft e Publicacao

O ciclo de edicao usa um sistema de drafts:

1. Usuario abre o editor visual (FlowBuilder com Vue Flow)
2. Alteracoes sao salvas como **draft** (`IGAutomationDrafts`) — auto-save periodico
3. Usuario clica "Publicar" — o draft e transformado na versao ativa (com validacoes de gatilho)
4. O flow so recebe trafego quando estiver **ativo** (toggle `isActive`)

## Compartilhamento e Copia

- **Share** — marca o flow como `shared: true`, permitindo que outras contas o vejam
- **Copy** — cria uma copia do flow em outra conta, recriando tags, custom fields e validando dependencias (kanbans, assistants, templates) existentes na conta destino

## Insights (Analytics)

Cada passo e cada gatilho tem metricas acessiveis no modo preview:

- `automationExecutions` — total de execucoes do flow
- `totalExecutions` / `actualExecutions` — execucoes do passo
- `uniqueContacts` — contatos unicos que passaram pelo passo
- `buttonClicks` — cliques em botoes
- `messagesTotal` / `messagesRead` — mensagens enviadas e lidas
- `percentage` — taxa de conversao relativa ao total do flow

## Entidades Principais

| Entidade | Tabela Prisma | Descricao |
|----------|---------------|-----------|
| Automation | `IGAutomations` | O flow em si (nome, tipo, ativo, shared) |
| Trigger | `IGAutomationsTriggers` | Gatilho vinculado ao flow |
| Step | `IGAutomationsSteps` | Passo/no do flow |
| Flow (mensagem) | `IGAutomationsStepsMessageFlow` | Conteudo de mensagem dentro de um step |
| Button | `IGAutomationsStepsMessageFlowButtons` | Botao dentro de um flow de mensagem |
| Draft | `IGAutomationDrafts` | Rascunho do flow em edicao |
