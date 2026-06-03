# Plano de Refatoracao — Modulo de Chat

**Data:** 2026-05-15
**Status:** Analise concluida, aguardando priorizacao
**Escopo:** chatfunnel-front (livechat) + backends relacionados

---

## 1. Diagnostico Atual

### 1.1 Mapeamento do Modulo

O chat e o modulo central do ChatFunnel, distribuido em **6 repositorios**:

| Repo | Papel no Chat | Stack |
|------|---------------|-------|
| `chatfunnel-front` | UI do livechat (~8.800 loc) | Vue 3 + Vite |
| `chatfunnel-services` | Controller principal (22 handlers) | NestJS + TS |
| `chatfunnel-api` | Rotas legado + queues | Express + JS |
| `chatfunnel-websocket` | Real-time (2 eventos) | Socket.IO + TS |
| `chatfunnel-core` | 10 repositories Prisma | TS |
| `chatfunnel-database` | 8 modelos dedicados | Prisma |

### 1.2 Arquitetura Atual (Frontend)

```
[LiveChatScreen.vue]
  |-- provide(channel, contact, loading)
  |
  +-- [SideBarFilters] ---- socket.on() direto
  +-- [ListContacts] ------ ChatService.listContacts() a cada navegacao
  +-- [ChatMessages] ------ ChatService.getMessages() a cada clique
  |     +-- socket.on() direto nos subcomponentes
  +-- [SideBarDetails] ---- ChatService.getContact() a cada clique
        +-- socket.on() direto
```

**Problemas identificados:**

| Problema | Impacto |
|----------|---------|
| Sem store dedicado — estado local via provide/inject | Re-fetch ao voltar a contato ja visitado |
| Socket listeners espalhados nos componentes | Risco de leak, duplicacao, dificil debugar |
| Sem cache de mensagens entre navegacoes | Loading de 1-2s toda vez que troca de contato |
| Sem virtualizacao de listas | DOM pesado em conversas com 200+ mensagens |
| Frontend em JS sem tipos | Sem validacao compile-time para Message, Contact, Channel |
| InputVoice.vue com 615 loc | Componente acoplado demais, dificil de manter |
| Versao do @chatfunnel/core desalinhada entre repos | API (1.0.7-rc.7), Services (1.0.8), WS (dev) |
| Pastas (folders) duplicadas entre Express e NestJS | Possivel migracao incompleta |

### 1.3 Arvore de Componentes (~8.800 linhas)

```
LiveChatScreen.vue (93 loc) — Provider de contexto (channel, contact, loading)
+-- SideBarFilters/index.vue (527 loc) — Filtros laterais
+-- ListContacts/index.vue (616 loc) — Lista de contatos
|   +-- ContactItem/index.vue — Item individual
|   |   +-- LastMessage.vue (130 loc) — Preview ultima mensagem
|   +-- ContactModeratorsMerge.vue (67 loc) — Merge de moderadores
+-- ChatMessages/index.vue (467 loc) — Orquestrador de mensagens
    +-- HeaderChat.vue (164 loc) — Cabecalho do chat
    +-- HeaderChatCrm.vue — Variante CRM
    +-- FollowUpAlert.vue — Alerta de follow-up
    +-- ContactBubble/index.vue (100 loc) — Bolha recebida
    |   +-- TextBallon.vue
    |   +-- MediaBallon.vue (139 loc)
    |   +-- TemplateBallon.vue
    |   +-- InteractiveBallon.vue
    |   +-- ButtonBallon.vue
    |   +-- ContactsBallon.vue (80 loc)
    |   +-- ReactionBallon.vue
    |   +-- Answer.vue (102 loc) — Reply/citacao
    |   +-- UnsupportedBallon.vue
    |   +-- TranscriptionModal.vue
    |   +-- instagram/ (7 componentes)
    +-- SentBubble/index.vue (242 loc) — Bolha enviada
    |   +-- TextBallon.vue
    |   +-- MediaBallon.vue (247 loc)
    |   +-- TemplateBallon.vue (170 loc)
    |   +-- TemplateV2Ballon.vue (143 loc)
    |   +-- InteractiveBallon.vue
    |   +-- StickNote.vue
    |   +-- InteractiveActions/ (Buttons, Link)
    |   +-- instagram/ (7 componentes)
    +-- FooterChat/index.vue (377 loc) — Area de input
    |   +-- InputChat.vue (182 loc) — Campo de texto
    |   +-- InputFile.vue (130 loc) — Upload de arquivo
    |   +-- InputAudio.vue (163 loc) — Audio (legado)
    |   +-- InputAudio2.vue (220 loc) — Audio v2
    |   +-- InputVoice.vue (615 loc) — Gravacao de voz
    |   +-- PreviewFile.vue (67 loc)
    |   +-- ReplyStickNotes/index.vue
    |   +-- Tools/index.vue (78 loc)
    |       +-- MovePipeline.vue (147 loc)
    |       +-- RunAutomation.vue (144 loc)
    |       +-- SendTemplateModal.vue (147 loc)
    |       +-- FastMessagesModal/index.vue (227 loc)
    |           +-- FastMessageMenu.vue (143 loc)
    +-- SideBarDetails/index.vue (556 loc) — Painel de detalhes
        +-- ContactInfo.vue (121 loc)
        +-- CustomFields.vue (113 loc)
        +-- FolderInput.vue (101 loc)
        +-- KanbanInfo.vue (264 loc)
        +-- GoogleCalendarEvents.vue (226 loc)
        +-- GoogleCalendarEventModal.vue (341 loc)
        +-- Card.vue — Secao colapsavel
        +-- PropertiesLabel.vue
```

### 1.4 Endpoints Backend (NestJS — chatfunnel-services)

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/chats/contacts_v2/:channelId` | Lista contatos por canal (filtros) |
| POST | `/chats/contact/moderators` | Atualiza moderadores |
| GET | `/chats/contact/:contactId/:channelId?` | Detalhes do contato-canal |
| POST | `/chats/folder` | Cria pasta |
| GET | `/chats/folder/:channelId` | Lista pastas |
| PUT | `/chats/folder` | Atualiza pasta |
| DELETE | `/chats/folder/:folderId` | Deleta pasta |
| PUT | `/chats/folder/contact` | Move contato para pasta |
| GET | `/chats/fast-messages` | Lista respostas rapidas |
| POST | `/chats/fast-messages` | Cria resposta rapida |
| PUT | `/chats/fast-messages/:id` | Atualiza resposta rapida |
| DELETE | `/chats/fast-messages/:id` | Deleta resposta rapida |
| GET | `/chats/counter_by_channel_id_v2/:channelId` | Metricas/contadores |
| GET | `/chats/sync_messages` | Sync mensagens da conta |
| GET | `/chats/follow_up_schedule/:channelId/:contactId` | Follow-ups agendados |
| GET | `/chats/served_by_assistant/:channelId/:contactId` | Check assistente ativo |
| POST | `/chats/blacklist_stop_assistant/:contactId/:channelId` | Bloquear assistente |
| DELETE | `/chats/blacklist_stop_assistant/:contactId/:channelId` | Desbloquear assistente |
| POST | `/chats/transfer_moderator/:contactId/:moderatorId` | Transferir moderador |
| GET | `/chats/events/:contactId` | Eventos Google Calendar |
| GET | `/chats/events/:contactId/:eventId` | Detalhes do evento |

### 1.5 Modelos Prisma

| Modelo | Campos Principais | Descricao |
|--------|-------------------|-----------|
| `Contacts` | id, name, email, phone, instagramId, facebookId, whatsappId | Contato master |
| `Messages` | id, messageId, contactId, from, type, status, content, channelId | Historico de mensagens |
| `ChatModerators` | contactId, moderatorId, transferModeratorId | Atribuicao de moderadores |
| `ChatFastMessages` | accountId, name, message | Templates de resposta rapida |
| `ContactsChannels` | contactId, channelId, visualization, archive, servedByAssistant | Bridge contato-canal |
| `ContactsFollowUpScheduled` | contactId, channelId, scheduleDate, status | Follow-ups agendados |
| `ContactsFolders` | accountId, name, order, color | Pastas de organizacao |
| `BlackList` | contactId, channelId, createdByUserId, reason | Contatos bloqueados |

### 1.6 WebSocket (chatfunnel-websocket)

**Porta:** 10000, **Path:** `/ws`

Apenas 2 eventos:
- `add-message` — busca moderadores, injeta IDs, faz broadcast
- `moderators-updated` — atualiza transfer moderator no DB, faz broadcast

---

## 2. Abordagem do Mercado

### 2.1 Padrao: Normalized Store + Socket Hub

Produtos como Slack, Discord, Intercom, Zendesk e Crisp convergem na mesma arquitetura:

```
[Socket Hub]                    [HTTP Layer]
     |                               |
     +--------> [Chat Store] <-------+
                (normalizado)
                     |
              [Componentes Vue]
              (read-only do store)
```

**Principio:** componentes nunca buscam dados nem escutam sockets diretamente. Eles so leem do store.

### 2.2 Store Normalizado — Mini-banco no Browser

O store funciona como tabelas em memoria:

```
CONVERSATIONS (Map por ID)
  "conv-123" -> { contactId, channelId, unread: 3, lastMessage }
  "conv-456" -> { ... }

MESSAGES (Map de arrays por conversationId)
  "conv-123" -> [msg1, msg2, msg3, ..., msg50]
  "conv-456" -> [msg1, msg2, ..., msg30]

CONTACTS (Map por ID)
  "ct-001" -> { name, phone, avatar }
  "ct-002" -> { name, ... }
```

Quando o usuario clica num contato, o store verifica: "ja tenho mensagens?" Se sim, renderiza direto. Se nao, busca da API e salva.

### 2.3 Fluxo Completo — Exemplo Real

**Usuario abre livechat e clica no contato "Joao":**
```
1. Componente chama: chatStore.openConversation('conv-123')
2. Store: messages.has('conv-123')? NAO → fetch API → salva no Map
3. Componente le: chatStore.activeMessages (computed) → renderiza
```

**Joao manda mensagem via WhatsApp (real-time):**
```
1. Socket Hub recebe: "add-message" { conversationId: 'conv-123' }
2. Hub chama: chatStore.pushMessage('conv-123', novaMensagem)
3. Componente reage automaticamente (reatividade Vue) → msg aparece
```

**Usuario troca pro contato "Maria" e volta pro "Joao":**
```
1. chatStore.openConversation('conv-123')
2. Store: messages.has('conv-123')? SIM! Ja tem cache
3. SEM FETCH. SEM LOADING. Renderiza instantaneo.
   Se Joao mandou msg enquanto usuario tava na Maria,
   o socket hub JA colocou no store → msg ja esta la.
```

### 2.4 Memoria

- ~500 bytes por mensagem de texto
- 100 mensagens = ~50KB
- 50 conversas x 100 msgs = ~2.5MB
- Uma aba Chrome usa 100-300MB → store nunca sera problema

Limite opcional (conservador):
```ts
if (messages.value.size > 30) {
  messages.value.delete(oldest)  // LRU eviction
}
```

---

## 3. Avaliacao do TanStack Query

### 3.1 Onde Ajuda (dados HTTP perifericos)

| Dado | Hoje | Com vue-query | Esforco |
|------|------|---------------|---------|
| Pastas | Busca toda vez que abre filtros | useQuery staleTime 5min | ~1h |
| Fast messages | Busca ao abrir modal | Cache + invalidacao no mutate | ~1h |
| Detalhes do contato | Busca ao clicar | Cache por contactId | ~2h |
| Contadores por canal | Busca com debounce 10s | refetchInterval automatico | ~1h |
| Calendar events | Busca ao abrir sidebar | Cache, nao rebusca | ~30min |

### 3.2 Onde NAO Ajuda

| Cenario | Motivo |
|---------|--------|
| Mensagens real-time (Socket.IO) | Event-driven, nao request-driven |
| Typing indicators | Eventos efemeros, sem sentido em cache |
| Stream principal de mensagens | Melhor servido pelo Chat Store |

### 3.3 Custo x Beneficio

| Fase | Esforco | Impacto UX | Vale? |
|------|---------|------------|-------|
| **Fase 1 — quick wins** | ~6h | Alto (navegacao instantanea) | Sim |
| **Fase 2 — infinite scroll** | ~5h | Baixo (ja funciona hoje) | So se mexer no ListContacts |
| **Fase 3 — mutations** | ~10h | Medio (so com volume alto) | So com dor concreta |

### 3.4 Veredicto

TanStack Query e **complemento**, nao solucao principal. Prioridade 5a — so apos Chat Store e Socket Hub.

---

## 4. Plano de Implementacao

### Fase 1 — Pinia Chat Store (2-3 dias) — PRIORIDADE MAXIMA

**O que fazer:**
1. Criar `stores/chat.ts` com estado normalizado (Maps)
2. Mover estado de mensagens do `ChatMessages/index.vue` para store
3. Mover estado de contatos do `ListContacts/index.vue` para store
4. Mover logica de `activeConversation` do provide/inject para store

**Resultado:** troca de contato de 1-2s para instantaneo.

---

### Fase 2 — Socket Hub (1 dia)

**O que fazer:**
1. Criar `composables/useChatSocket.ts`
2. Mover TODOS os `socket.on()` dos componentes para o hub
3. Hub escreve diretamente no Chat Store

**Antes (espalhado):**
```
SideBarDetails.vue  → socket.on('contact-detail:...')
ChatMessages.vue    → socket.on('add-message')
ListContacts.vue    → socket.on('contact-list:...')
```

**Depois (centralizado):**
```
useChatSocket.ts    → socket.on('*') → chatStore.pushMessage() / etc
Componentes         → so leem do store
```

**Resultado:** menos bugs de listener leak, componentes 30-40% menores.

---

### Fase 3 — Virtual Scroll (1 dia)

**O que fazer:**
1. Instalar `vue-virtual-scroller` ou similar
2. Substituir v-for de mensagens no `ChatMessages/index.vue`
3. Substituir v-for de contatos no `ListContacts/index.vue`

**Antes:** 300 mensagens = 300 DOM nodes
**Depois:** 300 mensagens = ~20 DOM nodes visiveis

**Resultado:** conversas longas ficam fluidas.

---

### Fase 4 — Tipos TypeScript (2 dias)

**O que fazer:**
1. Criar `types/chat.ts` com interfaces: Message, Contact, Conversation, Channel
2. Converter componentes principais de `.js` para `<script setup lang="ts">`
3. Tipar store, services e composables

**Resultado:** menos bugs runtime, autocomplete, refatoracoes seguras.

---

### Fase 5 — TanStack Query para dados perifericos (1 dia)

**O que fazer:**
1. Instalar `@tanstack/vue-query`, criar plugin
2. Migrar: pastas, fast messages, contadores, detalhes do contato
3. Configurar `staleTime` e `refetchOnWindowFocus`

**Resultado:** cache automatico para dados que mudam pouco.

---

## 5. Tabela Resumo

| Fase | Esforco | Impacto UX | Risco | Prioridade |
|------|---------|------------|-------|------------|
| **Pinia Chat Store** | 2-3 dias | Navegacao instantanea entre contatos | Baixo-medio | **1o** |
| **Socket Hub** | 1 dia | Menos bugs, codigo limpo | Baixo | **2o** |
| **Virtual Scroll** | 1 dia | Performance em conversas longas | Baixo | **3o** |
| **Tipos TypeScript** | 2 dias | Menos bugs runtime, DX | Baixo | **4o** |
| **TanStack Query** | 1 dia | Cache de dados perifericos | Baixo | **5o** |

**Total estimado:** ~8 dias de trabalho
**Maior ganho com menor esforco:** Fases 1 + 2 (3-4 dias) transformam a experiencia.

---

## 6. Impacto no Dia a Dia do Atendente

| Acao | Hoje | Apos refatoracao |
|------|------|------------------|
| Trocar entre 3 contatos | 3 loadings (~1-2s cada) | 1 loading no primeiro, depois instantaneo |
| Receber msg de contato nao aberto | So ve ao clicar + loading | Badge atualiza real-time, ao clicar msg ja esta la |
| Voltar de outra tela pro chat | Recarrega tudo | Store persiste enquanto app aberto |
| Scroll pra cima no historico | Perde ao trocar de contato | Posicao preservada no store |
| Conversa com 500+ mensagens | DOM pesado, lag | Virtual scroll, so ~20 nodes |
| Abrir modal de fast messages | Loading toda vez | Instantaneo apos 1o load |

**Estimativa:** ~2-3 minutos de loading eliminados por dia por atendente.

---

## 7. Riscos e Mitigacoes

| Risco | Mitigacao |
|-------|----------|
| Regressao ao migrar estado para store | Componentes V2 em paralelo, rollback facil |
| Socket hub perde evento | Logging centralizado, fallback re-fetch |
| Cache desatualizado (stale data) | TTL no store + invalidacao via socket events |
| Memoria em sessoes longas | Limite 30 conversas, LRU eviction |
| Virtual scroll quebra scroll-to-bottom | Testes extensivos com mensagens chegando |
