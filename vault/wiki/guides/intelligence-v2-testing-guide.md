# Intelligence V2 — Guia de Teste e Estrutura dos Componentes

## Estrutura de Arquivos

```
src/views/intelligenceV2/
├── registry/
│   └── tool-result.registry.ts    # Mapeia tool_name → archetype
├── utils/
│   └── tool-label.ts              # Labels em pt-BR para cada tool
├── types/
│   ├── message.ts                 # ChatMessage, ToolCallInfo, ToolCallStatus
│   ├── tool-result.ts             # ParsedToolResult (success | error | plain_error)
│   └── sse-event.ts               # Tipos dos eventos SSE
└── components/messages/
    ├── MessageRenderer.vue         # Router: kind → UserMessage | AssistantText | StatusMessage
    ├── ToolCallCard.vue            # Card collapsible: header (status) + body (resultado)
    └── tool-results/
        ├── DiscoveryChips.vue      # Chips inline (8 tools discovery)
        ├── ListResult.vue          # Tabela compacta (4 tools de lista)
        ├── ActionResult.vue        # Icone + confirmacao (27 tools de mutacao)
        ├── AgentResult.vue         # Markdown do sub-agente + subThread recursivo
        ├── ContactDetailCard.vue   # Card rico de contato (get_contact)
        ├── TemplatePreviewCard.vue # Preview WhatsApp (get_template)
        ├── GenericJsonResult.vue   # JSON tree fallback
        └── ToolErrorResult.vue     # Erro com icone + mensagem
```

## Como funciona o fluxo

```
SSE block_start { type: "tool_use", name: "get_contact" }
  → useIntelligenceChat cria ToolCallInfo { name, status: "running" }
    → ToolCallCard renderiza header com spinner

SSE block_start { type: "tool_result", content: [...] }
  → useIntelligenceChat atualiza ToolCallInfo { status: "done", parsedResult }
    → ToolCallCard renderiza header com check verde
    → getToolResultEntry("get_contact") retorna { archetype: "detail_contact" }
    → switch(archetype) renderiza ContactDetailCard
    → ContactDetailCard recebe props { toolName, data }
```

## Registry: tool_name → archetype → componente

| Archetype | Componente | Tools |
|---|---|---|
| `discovery` | DiscoveryChips | get_tags, get_channels, get_kanbans, get_moderators, get_custom_fields, get_agents_v2, get_assistants, list_tag_folders |
| `list` | ListResult | list_automations, list_templates, search_contacts, list_kanban_cards |
| `action` | ActionResult | create_*, delete_*, add_*, toggle_*, rename_*, move_*, win_*, lose_*, assign_*, build_automation, sync_templates, configure_template_params |
| `agent` | AgentResult | agent-systemAgent, agent-flowAgent, agent-templateAgent, agent-crmAgent, agent-contactsAgent |
| `detail_contact` | ContactDetailCard | get_contact |
| `detail_template` | TemplatePreviewCard | get_template |
| `generic` | GenericJsonResult | get_automation, get_draft, get_template_status, get_template_buttons |

## Como testar

### Opcao 1: Testar no Intelligence real

1. Subir os servicos:
```bash
# Terminal 1 — API
cd chatfunnel-api && npm run dev

# Terminal 2 — Services
cd chatfunnel-services && npm run dev

# Terminal 3 — Front
cd chatfunnel-front && npm run dev
```

2. Abrir `http://localhost:5173/intelligence` no browser

3. Enviar prompts que acionem cada tool:

| Para testar | Prompt sugerido |
|---|---|
| DiscoveryChips (tags) | "quais tags eu tenho?" |
| DiscoveryChips (channels) | "quais canais estao conectados?" |
| DiscoveryChips (kanbans) | "quais pipelines eu tenho?" |
| ListResult (contacts) | "busca contatos com tag VIP" |
| ListResult (automations) | "lista minhas automacoes" |
| ListResult (templates) | "lista meus templates" |
| ActionResult (create) | "cria uma tag chamada Teste" |
| ActionResult (build) | "cria uma automacao que responde oi quando receber mensagem no whatsapp" |
| ContactDetailCard | "mostra o contato Maria Silva" |
| TemplatePreviewCard | "mostra o template confirmacao_pedido" |
| AgentResult | Qualquer prompt complexo que acione sub-agente |
| ToolErrorResult | "mostra o contato com id inexistente" |

### Opcao 2: Testar com dados mockados (sem backend)

Criar uma pagina de teste temporaria que renderiza os componentes com fixture data:

```vue
<!-- src/views/intelligenceV2/DevPlayground.vue -->
<template>
  <div class="mx-auto max-w-2xl space-y-6 p-8">
    <h1 class="text-2xl font-bold">Intelligence — Component Playground</h1>

    <ToolCallCard
      v-for="fixture in fixtures"
      :key="fixture.id"
      :tool-call="fixture"
    />
  </div>
</template>

<script setup lang="ts">
import ToolCallCard from './components/messages/ToolCallCard.vue'
import type { ToolCallInfo } from './types/message'

const fixtures: ToolCallInfo[] = [
  // DiscoveryChips — get_tags
  {
    id: '1',
    name: 'get_tags',
    status: 'done',
    parsedResult: {
      kind: 'success',
      data: {
        tags: [
          { id: '1', name: 'VIP', color: '#7C3AED' },
          { id: '2', name: 'Lead', color: '#2563EB' },
          { id: '3', name: 'Suporte', color: '#16A34A' },
        ]
      }
    }
  },

  // DiscoveryChips — get_channels
  {
    id: '2',
    name: 'get_channels',
    status: 'done',
    parsedResult: {
      kind: 'success',
      data: {
        channels: [
          { id: '1', name: 'ChatFunnel Business', platform: 'WHATSAPP', phoneNumber: '+55 11 99999-0000', isActive: true },
          { id: '2', name: null, platform: 'INSTAGRAM', username: '@chatfunnel', isActive: true },
        ]
      }
    }
  },

  // ListResult — search_contacts
  {
    id: '3',
    name: 'search_contacts',
    status: 'done',
    parsedResult: {
      kind: 'success',
      data: {
        contacts: [
          { id: '1', name: 'Ana Silva', phone: '+55 11 98765-4321', tags: [{ name: 'VIP' }, { name: 'Lead' }], isActive: true },
          { id: '2', name: 'Carlos Mendes', phone: '+55 21 99876-5432', tags: [{ name: 'Suporte' }], isActive: false },
        ],
        quantity: 2
      }
    }
  },

  // ListResult — list_templates
  {
    id: '4',
    name: 'list_templates',
    status: 'done',
    parsedResult: {
      kind: 'success',
      data: {
        templates: [
          { name: 'confirmacao_pedido', status: 'APPROVED', category: 'UTILITY', language: 'pt_BR' },
          { name: 'promo_blackfriday', status: 'REJECTED', category: 'MARKETING', language: 'pt_BR' },
          { name: 'codigo_verificacao', status: 'PENDING', category: 'AUTHENTICATION', language: 'pt_BR' },
        ],
        total: 3
      }
    }
  },

  // ActionResult — create_tag
  {
    id: '5',
    name: 'create_tag',
    status: 'done',
    parsedResult: {
      kind: 'success',
      data: { tag: { id: '99', name: 'Teste', color: '#F59E0B' } }
    }
  },

  // ActionResult — build_automation
  {
    id: '6',
    name: 'build_automation',
    status: 'done',
    parsedResult: {
      kind: 'success',
      data: { success: true, automationId: 'abc', stepCount: 3, triggerCount: 1, triggerTypes: ['DIRECT'], message: 'Automacao criada' }
    }
  },

  // ContactDetailCard — get_contact
  {
    id: '7',
    name: 'get_contact',
    status: 'done',
    parsedResult: {
      kind: 'success',
      data: {
        id: 'c1',
        name: 'Maria Silva',
        phone: '+55 11 99999-0000',
        email: 'maria@email.com',
        profilePicUrl: null,
        tags: [
          { name: 'VIP', color: '#7C3AED' },
          { name: 'Lead', color: '#2563EB' },
          { name: 'Ativo', color: '#16A34A' },
        ],
        channels: [
          { name: 'ChatFunnel Business', platform: 'WHATSAPP', phoneNumber: '+55 11 99999-0000' },
          { platform: 'INSTAGRAM', username: '@maria_silva' },
        ],
        customFields: [
          { name: 'Empresa', value: 'ChatFunnel' },
          { name: 'Plano', value: 'Pro' },
          { name: 'Ultimo contato', value: '15/05/2026' },
        ]
      }
    }
  },

  // TemplatePreviewCard — get_template
  {
    id: '8',
    name: 'get_template',
    status: 'done',
    parsedResult: {
      kind: 'success',
      data: {
        data: {
          id: 't1',
          name: 'confirmacao_pedido',
          status: 'APPROVED',
          category: 'UTILITY',
          language: 'pt_BR',
          components: [
            { type: 'HEADER', format: 'TEXT', text: 'Pedido Confirmado' },
            { type: 'BODY', text: 'Ola {{1}}, seu pedido #{{2}} foi confirmado! Previsao de entrega: {{3}}.' },
            { type: 'FOOTER', text: 'ChatFunnel 2026' },
            { type: 'BUTTONS', buttons: [
              { type: 'URL', text: 'Acompanhar pedido' },
              { type: 'QUICK_REPLY', text: 'Falar com suporte' },
            ]},
          ]
        }
      }
    }
  },

  // ToolErrorResult — NOT_FOUND
  {
    id: '9',
    name: 'get_contact',
    status: 'error',
    parsedResult: {
      kind: 'error',
      code: 'NOT_FOUND',
      type: 'domain',
      message: 'O contato com ID informado nao existe.'
    }
  },

  // Running state
  {
    id: '10',
    name: 'search_contacts',
    status: 'running',
  },

  // Cancelled state
  {
    id: '11',
    name: 'list_automations',
    status: 'cancelled',
  },
]
</script>
```

Para usar:

1. Criar o arquivo acima em `src/views/intelligenceV2/DevPlayground.vue`
2. Adicionar rota temporaria no router:
```ts
{ path: '/dev/intelligence', component: () => import('@/views/intelligenceV2/DevPlayground.vue') }
```
3. Abrir `http://localhost:5173/dev/intelligence`
4. Todos os componentes renderizam com fixture data, sem precisar de backend

## Interface de props dos componentes

Todos os tool-results recebem a mesma interface:

```ts
defineProps<{
  toolName: string  // Nome da tool MCP (ex: "get_contact")
  data: unknown     // Output parseado do contract (ex: { id, name, phone, ... })
}>()
```

O ToolCallCard recebe:

```ts
defineProps<{
  toolCall: ToolCallInfo
}>()

interface ToolCallInfo {
  id: string
  name: string                    // tool_name
  status: 'running' | 'done' | 'error' | 'cancelled'
  input?: Record<string, unknown>  // input enviado para a tool
  result?: string                  // JSON string bruto do resultado
  error?: string
  parsedResult?: ParsedToolResult  // Resultado parseado
}

type ParsedToolResult =
  | { kind: 'success'; data: unknown }
  | { kind: 'error'; code: string; type: string; message: string }
  | { kind: 'plain_error'; text: string }
```

## Adicionando um novo renderer (F4+)

1. Criar componente em `tool-results/NomeDoComponente.vue` com props `{ toolName, data }`
2. Adicionar archetype em `tool-result.registry.ts`:
   - Tipo: `| "detail_xxx"` no `ResultArchetype`
   - Mapeamento: `tool_name: { archetype: "detail_xxx" }`
3. Plugar no `ToolCallCard.vue`:
   - Import do componente
   - Case no switch `resultComponent`
4. Testar com fixture data no DevPlayground

## Checklist de validacao por componente

- [ ] DiscoveryChips: get_tags, get_channels, get_kanbans, get_moderators, get_custom_fields, get_agents_v2, get_assistants, list_tag_folders
- [ ] ListResult: search_contacts, list_automations, list_templates, list_kanban_cards
- [ ] ActionResult: create_tag, delete_tag, build_automation, move_kanban_card (pelo menos 1 de cada tipo)
- [ ] AgentResult: agent-contactsAgent (verificar subThread recursivo)
- [ ] ContactDetailCard: get_contact (com tags, channels e customFields)
- [ ] TemplatePreviewCard: get_template (com header, body, footer, buttons)
- [ ] ToolErrorResult: NOT_FOUND, FORBIDDEN, RATE_LIMIT, INTERNAL_ERROR
- [ ] GenericJsonResult: get_automation, get_draft (fallback JSON)
- [ ] Estados do ToolCallCard: running, done, error, cancelled
