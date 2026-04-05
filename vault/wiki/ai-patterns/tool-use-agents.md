---
title: Tool Use — Agentes com Function Calling
description: Pattern para criar agentes IA que chamam funcoes do sistema (buscar contato, consultar pedido, executar acoes)
tags: [ai, tool-use, agents, claude-api]
related: ["[[classification]]", "[[rag]]", "[[prompt-caching]]"]
last_updated: 2026-04-05
---

# Tool Use — Agentes com Function Calling

Referencia: [claude-cookbooks/tool_use/customer_service_agent.ipynb](https://github.com/anthropics/claude-cookbooks/blob/main/tool_use/customer_service_agent.ipynb)

## O que e

Pattern onde o Claude recebe definicoes de tools (funcoes) e decide quando chama-las durante a conversa. O modelo retorna `tool_use` blocks em vez de texto, o backend executa a funcao e devolve o resultado.

## Aplicacao no ChatFunnel

Os agentes IA do `chatfunnel-services` podem usar tools para:

- **Buscar contato** — consultar dados do contato no banco (nome, email, historico)
- **Consultar pedido/status** — buscar informacoes de pedidos, pagamentos, assinaturas
- **Consultar knowledge base** — buscar FAQs, catalogos, informacoes do produto do cliente
- **Executar acoes** — transferir atendimento, atualizar tags, mover no kanban, agendar callback
- **Consultar disponibilidade** — verificar horarios, estoque, agenda

## Arquitetura do Loop

```
1. Usuario envia mensagem
2. Backend monta request com system prompt + tools + historico
3. Claude responde com tool_use ou text
4. Se tool_use:
   a. Backend executa a funcao localmente
   b. Devolve resultado como tool_result
   c. Claude gera resposta final com base no resultado
5. Se text: retorna direto ao usuario
```

## Definicao de Tools (Schema)

Cada tool precisa de:
- `name` — identificador unico (snake_case)
- `description` — descricao clara do que faz e quando usar
- `input_schema` — JSON Schema dos parametros (type, properties, required)

```typescript
// Exemplo adaptado para o ChatFunnel (TypeScript)
const tools = [
  {
    name: "get_contact_info",
    description: "Busca informacoes de um contato pelo ID. Retorna nome, email, telefone, tags e ultimo atendimento.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: {
          type: "string",
          description: "ID do contato no sistema"
        }
      },
      required: ["contact_id"]
    }
  },
  {
    name: "transfer_to_human",
    description: "Transfere o atendimento para um operador humano. Usar quando o contato pede para falar com uma pessoa ou quando o agente nao consegue resolver.",
    input_schema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Motivo da transferencia"
        },
        department: {
          type: "string",
          enum: ["support", "sales", "billing"],
          description: "Departamento destino"
        }
      },
      required: ["reason"]
    }
  }
]
```

## Processamento do Tool Call

```typescript
function processToolCall(toolName: string, toolInput: Record<string, any>) {
  switch (toolName) {
    case "get_contact_info":
      return contactService.findById(toolInput.contact_id)
    case "transfer_to_human":
      return livechatService.transfer(toolInput.reason, toolInput.department)
    default:
      return { error: "Tool desconhecida" }
  }
}
```

## Boas Praticas

- **Descricoes claras** — o modelo decide qual tool usar com base na descricao
- **Poucos tools por agente** — 3-8 tools e ideal; muitos tools confundem o modelo
- **Validar input** — sempre validar os parametros antes de executar
- **Timeout** — tools devem ter timeout; o usuario esta esperando
- **Logging** — logar toda chamada de tool para auditoria e debug
- **accountId** — sempre filtrar por accountId (multi-tenancy)
