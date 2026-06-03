---
title: Auditoria de Segurança — chatfunnel-mcp (Vazamento de Dados Sensíveis)
date: 2026-04-30
author: Lucas Brito
status: Aberto
severity: Crítica
scope: chatfunnel-mcp/
tags: [security, mcp, data-leak, audit, dto]
---

# Auditoria de Segurança — chatfunnel-mcp

## 1. Sumário Executivo

Durante validação manual da tool `get_moderators` do MCP, foi identificado que a resposta inclui campos altamente sensíveis (`passwordHash` em bcrypt, tokens OAuth de longa duração do Facebook, API keys de OpenAI/Anthropic/ElevenLabs, IDs de cliente Stripe/Pagarme, CPF, telefone). Esses dados fluem direto para o contexto de qualquer LLM que conecte o MCP — incluindo modelos de terceiros.

Auditoria completa do MCP revelou que **o problema não é isolado**: trata-se de um padrão estrutural — ausência total de uma camada de DTO/whitelist na saída das tools. Repositórios do `@chatfunnel/core` retornam entidades Prisma inteiras (`include: { user: true, account: true }`) e os handlers MCP fazem `JSON.stringify` direto, sem sanitização.

**Boas notícias:**
- Multi-tenancy está correto: nenhum schema de input aceita `accountId` (sempre derivado do token via `getAuth()`).
- Não há SQL injection: todo `$queryRaw` usa `Prisma.sql` com parametrização.

**Más notícias:**
- Pelo menos **2 tools com vazamento Crítico** (segredos cripto/OAuth/API keys).
- Pelo menos **2 tools com vazamento Alto/Médio**.
- **Zero** ocorrências de funções de sanitização (`grep -rn "sanitize|toPublic|toDto|omit.*passwordHash"` → nada).

---

## 2. Contexto

### 2.1 O MCP do ChatFunnel

O `chatfunnel-mcp/` é um servidor MCP (Model Context Protocol) que expõe operações do produto (CRM, automações, kanban, templates, contatos, moderadores) como tools consumíveis por LLMs. O MCP é a **superfície primária de exposição** do A2A — qualquer LLM com acesso ao MCP recebe as respostas no contexto.

Arquitetura:

```
[LLM externo / Claude / Cursor]
        │
        ▼
[chatfunnel-mcp]  ── tools/*.tools.ts ──► JSON.stringify(result)
        │
        ▼
[@chatfunnel/core] ── repositories/*.repository.js ──► prisma.users.findFirst({ include: { ... } })
        │
        ▼
[PostgreSQL]
```

O risco específico do MCP: **o que vai pra response cai no context window de um LLM**. Se aparecer um secret lá, ele pode:
- Ser logado pelo provedor do LLM
- Ser ecoado em respostas posteriores
- Vazar via prompt injection
- Ser persistido em históricos de conversas

### 2.2 A descoberta inicial

Comando executado no Claude Code com MCP `chatfunnel` ativo:

> "Quem são os moderadores (membros) da minha conta?"

Tool acionada: `get_moderators` (sem args). Resposta retornada (campos redigidos):

```json
[
  {
    "id": "<uuid>",
    "user": {
      "passwordHash": "<bcrypt-hash>",
      "longLivedAccessToken": "<facebook-oauth-token>",
      "email": "<user-email>"
    },
    "account": {
      "openaiKey": "<openai-api-key>",
      "anthropicKey": "<anthropic-api-key>",
      "stripeCustomerId": "<stripe-id>"
    }
  }
]
```

`passwordHash` em bcrypt (computacionalmente custoso, mas não invulnerável) + `longLivedAccessToken` do Facebook (válido por ~60 dias, dá acesso à página do IG/WhatsApp Business) + `openaiKey` de produção. **Tríade crítica vazando numa única chamada.**

---

## 3. Metodologia da Auditoria

A auditoria foi conduzida com foco em 5 vetores OWASP/STRIDE relevantes para um servidor MCP:

| Vetor | Técnica | Resultado |
|---|---|---|
| **Information Disclosure** | Análise estática dos retornos de cada tool e dos `include`/`select` dos repos chamados | 4 tools com vazamento |
| **Multi-tenancy bypass** | Grep por `accountId` em schemas de input (zod) | OK — sempre via `getAuth()` |
| **SQL Injection** | Grep por `$queryRaw`/`$executeRaw` e revisão dos call sites | OK — `Prisma.sql` parametrizado |
| **Authorization** | Verificação se cada tool valida que o recurso alvo pertence à conta do caller | Não auditado em profundidade — pendente |
| **Input Validation** | Revisão dos zod schemas (presença de `.strict()`, tipos restritos) | Não auditado em profundidade — pendente |

Ferramentas usadas: leitura direta dos handlers MCP, dos services e dos repositórios em `@chatfunnel/core`.

---

## 4. Achados Detalhados

### 4.1 🔴 CRÍTICA — `get_moderators`

**Arquivos:**
- Handler MCP: `chatfunnel-mcp/src/mcp/tools/discovery.tools.ts`
- Service: `chatfunnel-mcp/src/moderators/moderators.service.ts`
- Repo (core): `@chatfunnel/core/dist/repositories/moderators.repository.js` — método `listByAccountId`
- Handler (core): `list-moderators.handler.js` (linhas ~27–34, injeção do owner)

**Vazamento:**

Da entidade `users`:
- `passwordHash` (bcrypt de senha de login)
- `longLivedAccessToken` (token Facebook OAuth de longa duração — concede acesso a páginas de IG/WhatsApp Business via Graph API)
- `cpfCnpj`, `document` (PII regulada pela LGPD)
- `phone`, `idd`, `ddd`
- `pagarmeCustomerId`, `stripeCustomerId`, `stripeSubscriptionId`
- `verifiedBy`, `permissionsGroupId`

Da entidade `accounts` (via include):
- `openaiKey` (API key OpenAI da conta — billing direto)
- `anthropicKey` (API key Anthropic)
- `elevenlabsKey` (API key ElevenLabs)
- `longLivedAccessToken` da conta (Facebook)
- `igAccessToken`, `wppAccessToken`, `wppPin`, `fbAccessToken` (quando preenchidos)
- `pagarmeCustomerId`, `stripeCustomerId`, `stripeSubscriptionId`
- Datas internas (`trialExpireDate`, `nextDatePayment`, `dateBlockedForContacts`)

**Caminho duplo de leak:**

1. **Lista normal:** `ModeratorsRepository.listByAccountId` faz `findMany` com `include: { user: true, account: true }`. Sem `select`. Retorna tudo.
2. **Injeção do owner:** quando o dono da conta não está em `moderators` (caso comum, owner é registro em `accounts`, não em `moderators`), o handler do core empurra `{ user: account.user, account }` direto no array de retorno. O `account` aqui também vem de `AccountsRepository.findById(accountId, { user: true })` — sem select.

**Impacto:**
- Vazamento de credenciais de pagamento, OAuth tokens e API keys de provedor.
- `passwordHash` permite ataque offline de força bruta com dicionários. Bcrypt cost 10 → ~100 hashes/seg em GPU comum → senhas fracas caem em horas.
- `longLivedAccessToken` permite atacante acessar a Graph API do Facebook como o usuário até a expiração.
- API keys de provedor permitem uso direto da conta de billing do cliente.

#### 4.1.b 🔴 Reprodução em PRODUÇÃO confirmada (2026-05-04)

Re-execução do `get_moderators` em conta de produção `accountId: c1c4324a-ac13-4f83-b069-3662d53465a8` (Vinicius Teider, plano PREMIUM, status ACTIVE) durante a sessão 2026-05-04 do playbook (section 2.6 — captura colateral antes de `assign_card_moderator`).

**Confirma identicamente o leak da seção 4.1, mas com agravantes:**

1. **Chaves de produção REAIS expostas (não sandbox/test):**
   - `openaiKey` → **chave OpenAI Project** (prefixo `sk-proj-...`). Project keys têm scope amplo (vários models, billing direto, organization-level) — vetor mais valioso que keys clássicas (`sk-...`).
   - `elevenlabsKey` → chave ElevenLabs (prefixo `sk_af7c...`). Não estava exposta na conta antiga (era `null`); agora confirmada em prod.
   - `passwordHash` bcrypt do owner exposto; `longLivedAccessToken` Facebook (~200 chars) ativo.
   - `cpfCnpj`/`document` CNPJ do owner.
   - `pagarmeCustomerId`, `stripeSubscriptionId` populados (a antiga era LOWTICKET com vários nulls; PREMIUM expõe billing IDs ativos).

2. **Vazamento amplificado por duplicação na resposta:**
   - O objeto `user` aparece em **DOIS lugares**: root do moderator (`moderator.user`) **E aninhado em `account.user`** (mesmo objeto inteiro, mesmos secrets).
   - Implicação: dobra a chance de o LLM ecoar/persistir os secrets (qualquer prompt que peça "o usuário X" pode encontrar via path duplo) e dobra bandwidth desperdiçada.
   - Origem provável: `findById(accountId, { user: true })` no `AccountsRepository` + injeção do owner no `list-moderators.handler`. O repo de account já traz `user` nested; o handler também adiciona `user: account.user` no root do moderator.

3. **Campos de billing/subscription expostos a mais que a conta antiga:**
   - `plan: "PREMIUM"`, `planLeads: 15000`, `subscriptionStatus: "ACTIVE"`, `nextDatePayment`, `additionalUsersQuantity: 2`, `cancelationsOffer*` (4 campos), `stripeSubscriptionId` ativo. ~10 campos de billing/lifecycle não relevantes pra um LLM de produto, mas que descrevem perfil financeiro do cliente.

**Impacto agravado vs 4.1:**
- Em conta de prod com receita ativa, qualquer execução do MCP por LLM de terceiros (Cursor, Claude Web, etc.) expõe chaves de billing diretas. Atacante com prompt injection no histórico do LLM pode usar a `openaiKey` Project pra burnar quota OpenAI da conta antes da rotação ser detectada.
- O leak já não é mais hipotético — está documentado em corpus local (mesmo com `.gitignore`, ele existe no disco do owner).

**Ação imediata pendente:**
- Rotacionar `openaiKey` e `elevenlabsKey` da conta `c1c4324a-...`. Re-emitir e atualizar nas integrações.
- Anular `longLivedAccessToken` Facebook (ou esperar expiração natural se janela curta).
- Forçar reset de senha do owner (`userId: 904783c2-...`) — `passwordHash` exposto.

**Referência completa do payload:** `scripts/mcp-prompts-playbook.md` seção 2.6 → `get_moderators na 3a conta` (arquivo em `.gitignore` linha 47).

---

### 4.2 🟠 ALTA — `get_assistants`

**Arquivos:**
- Handler: `chatfunnel-mcp/src/mcp/tools/discovery.tools.ts`
- Repo: `OpenaiAssistantsRepository.listWithRelations`

**Vazamento:**

`listWithRelations` usa `include` sem `select` na raiz, retornando todos os campos de `openaiAssistants`. O handler enriquece com `distinctContactsCount` e `totalExecutionsCount` mas **não filtra** o objeto base.

Campos sensíveis que podem vazar (depende do schema atual de `openaiAssistants`):
- Qualquer chave/secret armazenada na tabela
- `instructions` completas (prompt do assistente — propriedade intelectual do cliente)
- IDs internos OpenAI (`openaiId`)

**Severidade Alta** porque `instructions` contém o sistema de prompt customizado do cliente, que é dado proprietário valioso. Não vaza credencial direta, mas vaza valor de negócio.

---

### 4.3 🟡 MÉDIA — `get_contact`

**Arquivos:**
- Handler: `chatfunnel-mcp/src/mcp/tools/contacts.tools.ts`
- Repo: `ContactsRepository.findByIdWithRelations`

**Vazamento:**

`findByIdWithRelations` faz `include: { TagsContacts, customFields }` sem `select` na raiz. Retorna toda a entidade `contacts`.

Campos potencialmente sensíveis:
- `instagramId`, `wppUserId` (identificadores de plataforma — podem ser usados para abuse offline)
- IDs internos de canal e webhook
- Metadados de conversa em formato bruto

Não há credenciais aqui, mas há PII em volume e identificadores que poderiam ser usados em ataque de re-identificação cross-platform.

---

### 4.4 🟡 MÉDIA — `list_kanban_cards`

**Arquivos:**
- Handler: `chatfunnel-mcp/src/mcp/tools/crm.tools.ts`
- Service: `KanbanService.listKanbanCards`

**Não auditado em profundidade**, mas o padrão de `kanban.repository.js` é usar `include` para joinar contato/moderador. Sem inspeção do select atual, **assumir vazamento provável** de:
- Dados completos do contato joinado (mesmo problema do `get_contact`)
- Dados do moderador atribuído (mesmo problema do `get_moderators`)

**Ação:** auditar `kanban.repository.js` e o handler do core.

---

### 4.5 🟢 OK (parcial) — Tools sem vazamento crítico

| Tool | Por que está OK |
|---|---|
| `get_channels` | `select` explícito sem tokens. ⚠️ **Mas ver 4.6** — campos selecionados incluem PII em plaintext. |
| `search_contacts` | `$queryRaw` com SELECT whitelistado em `contacts[]`. ⚠️ **Mas ver 4.7** — envelope tem campo extra `topRanking[]` que vaza top contatos da conta. |
| `get_agents_v2` | **Modelo a seguir.** Mapeamento manual inline em `discovery.tools.ts` retornando apenas `id, name, model, providerType, createdAt`. |
| `list_automations`, `get_automation`, `get_draft` | Entidades de automação não armazenam credenciais. |
| `list_templates`, `get_template` | Conteúdo de mensagem, sem segredos. |

---

### 4.6 🟠 ALTA — `get_channels` retorna PII em plaintext (`wppName`, `wppNumber`, `igName`)

**Descoberto em:** captura ao vivo 2026-04-30 via MCP da 3a conta (corpus em `scripts/mcp-prompts-playbook.md`).

**Vazamento:**

```json
{
  "id": "11fb6dc1-...",
  "allocatedType": "WHATSAPP",
  "wppName": "Vinicius Teider",
  "wppNumber": "+55 45 9830-3960",
  "igName": null
}
```

O select **é** whitelistado (achado 4.5), mas os campos selecionados **incluem PII em plaintext** sem mascaramento:
- `wppNumber` em formato pretty-printed (com `+55`, espaços, hífen) — telefone pessoal completo
- `wppName` — nome real do dono do canal
- `igName` — display name do Instagram conectado (pode incluir emoji/handle)

**Impacto:**

Diferente de credenciais (4.1–4.4) que são exploits diretos, isso é vazamento de **PII comercial**:
- LLM externo recebe lista completa de canais conectados com nomes/telefones reais.
- Em multi-tenant SaaS B2B, o dono do canal pode ser pessoa física (LGPD aplica).
- Telefone pretty-printed facilita extração por regex trivial.

**Severidade Alta** porque:
- Não há credencial vazando, mas há violação direta de LGPD (PII identificável).
- O LLM pode ecoar/loggar/treinar com esses dados.
- Em produção com clientes externos, isso é um achado de compliance imediato.

**Remediação sugerida:**

Mascarar dados antes de retornar pro MCP:

```ts
const masked = channels.map(c => ({
  id: c.id,
  allocatedType: c.allocatedType,
  wppName: c.wppName ? maskName(c.wppName) : null,
  wppNumber: c.wppNumber ? maskPhone(c.wppNumber) : null,
  igName: c.igName ? maskName(c.igName) : null,
}));
```

Ou, se identificação completa for necessária pro caso de uso (selecionar canal pra disparo), expor **apenas** `wppNumber` em E.164 sem formatação e adicionar warning no tool description que esses campos são PII.

---

### 4.7 🔴 CRÍTICA — `search_contacts.topRanking[]` vaza top contatos da conta inteira em qualquer query

**Descoberto em:** captura ao vivo 2026-04-30 via MCP da 3a conta (corpus em `scripts/mcp-prompts-playbook.md`).

**Vazamento:**

Buscando por `query: "Vinicius"`, o MCP retornou:

```json
{
  "contacts": [/* 20 Vinicius como esperado */],
  "quantity": 139,
  "topRanking": [
    {
      "id": "5b471e0a-...",
      "name": "Claudia Tania",
      "photo": "https://scontent-...cdninstagram.com/...",
      "quantity": 422
    },
    { "id": "a5b7b9bc-...", "name": "Silmar Martins", "photo": "...", "quantity": 66 },
    { "id": "65d9aed5-...", "name": "Diego Calassara", "photo": "...", "quantity": 42 }
  ]
}
```

`topRanking[]` retorna os **top 3 contatos por interações da conta inteira**, **independentemente da query**. Pesquisar por "Vinicius" devolve "Claudia Tania" como top. Pesquisar por "asdfasdf" devolveria a mesma lista. **Qualquer query mapeia os contatos mais relevantes da conta**.

**Por que isso é crítico:**

1. **Mapeamento progressivo de toda a base** com poucos calls — 1 query = top 3 contatos. Repetindo com queries diferentes ou paginando inteligentemente, cobre os contatos de maior valor da conta em poucos minutos.
2. **Foto Instagram em URL assinada** — fotos privadas de IG ficam acessíveis via URL com token Meta até expirarem (~1 mês). Scraping fácil.
3. **`quantity` (interações) revela quem são os clientes mais engajados** — informação comercialmente sensível.
4. **Não há filtro nem opt-out** — `topRanking` vem sempre, mesmo se a query fosse vazia.

**Por que o achado original (4.5) não pegou:**

A auditoria 4.5 viu `$queryRaw` com SELECT whitelistado nos **contatos da query** (campo `contacts[]`) — e isso de fato está OK. Mas o handler **adiciona** `topRanking[]` e `quantity` no envelope pós-query, e essa parte **não foi considerada na auditoria estática**. Achado real só apareceu na captura ao vivo.

**Lição:** auditoria estática lê selects nos repos; **só captura ao vivo do MCP revela o envelope final** que o handler monta.

**Remediação sugerida:**

1. **Curto prazo (hoje):** remover `topRanking[]` do retorno se a `query` está populada. O ranking só faz sentido como sugestão em UI sem busca.
2. **Médio prazo (sprint):** mover ranking pra tool dedicada `get_top_contacts(limit)` opt-in. `search_contacts` retorna **apenas** os matches da query.
3. **Longo prazo:** snapshot tests do shape do envelope completo de cada tool — capturar regressões de "campo extra apareceu".

**Adicionar à lista canônica de "nunca pode sair" (8.1):**
- `search_contacts.topRanking` quando a query está populada
- Em geral, qualquer agregado ou ranking que cruza dados de outros contatos não-relacionados à query

---

### 4.8 🟡 MÉDIA — `moderators[].user.name` carrega telefone (3 endpoints)

**Descoberto em:** captura ao vivo 2026-04-30 (kanban "pipe" da 3a conta). **Escopo expandido em 2026-05-04** — mesmo padrão aparece em 3 endpoints distintos.

**Endpoints afetados (todos retornam mesmo shape `moderators[].user.{id, name}`):**

1. `list_kanban_cards.cards[].moderators[]` — descoberta original (2026-04-30)
2. `add_step_chat_action` (read pós-build via `get_automation`) — `step.moderator.{id, name}` (2026-05-04, section 2.8 do playbook)
3. `assign_card_moderator` (read pós-mutação via `list_kanban_cards`) — `card.moderators[].user.{id, name}` (2026-05-04, section 2.6 do playbook)

**Vazamento (mesma shape em todos):**

```json
{
  "moderators": [{
    "user": {
      "id": "904783c2-...",
      "name": "VUKODE +55 (45) 99813-5374"
    }
  }]
}
```

O campo `user.name` do moderador embedado **carrega o telefone formatado dentro do nome** (`"VUKODE +55 (45) 99813-5374"`). Não é o nome humano do moderador — é a string que o sistema usa pra display.

**Por que isso aconteceu:**

Provavelmente o moderador foi criado via integração WhatsApp e o `name` foi populado com `<accountName> + phone` em vez de só `<accountName>` ou `<userFirstName>`. Pode ser bug de seed/migration ou comportamento intencional pra disambiguar moderadores.

**Impacto:**

- Telefone do moderador (admin/operador da conta) vai pro contexto de qualquer LLM que liste cards.
- Multi-tenancy bloqueia ver admins de outras contas, mas dentro da própria conta os telefones de admins ficam visíveis.
- Em contas com múltiplos operadores externos (ex: agência gerenciando conta de cliente), os telefones cruzam.

**Severidade Média** porque:
- Não atinge contatos finais (consumidores), só moderadores da conta.
- Limitado pela multi-tenancy.

**Remediação sugerida:**

1. Limpar a string `name` ao retornar — extrair só a parte alfabética antes do primeiro dígito.
2. Idealmente, normalizar `users.name` na tabela pra remover telefone. Migration coordenada.

---

### 4.9 🟢 INFO — `get_contact` vaza nome de tabela junction Prisma (`TagsContacts`)

**Descoberto em:** captura ao vivo 2026-04-30.

**Vazamento:**

```json
{
  "id": "871d5e79-...",
  "name": "Vinicius",
  "TagsContacts": [],
  "customFields": []
}
```

O campo `TagsContacts` em **PascalCase** é o nome literal da tabela junction Prisma. Vaza como nome de campo JSON. Inconsistente com `customFields` (camelCase) no mesmo objeto.

**Impacto:**

- **Schema enumeration** — atacante interno descobre nome de tabela (útil em ataques posteriores se houver outra vulnerabilidade).
- Não vaza dados sensíveis em si — só o **nome** do campo.

**Severidade INFO** — não exploit direto, mas higiene de API.

**Remediação:**

Mapear no handler antes de retornar:

```ts
const safe = {
  ...contact,
  tags: contact.TagsContacts,
};
delete (safe as any).TagsContacts;
```

Ou usar select com alias no Prisma.

---

### 4.10 🟢 INFO — Bug em prod: TYPO no campo `instagramFollowBusinnes`

**Descoberto em:** captura ao vivo 2026-04-30.

**Vazamento:**

Não é vazamento de dados — é bug de naming que **afeta a auditoria** de schema. Campo deveria se chamar `instagramFollowBusiness` mas está em prod como `instagramFollowBusinnes` (sem segundo `s`).

**Impacto na auditoria:**

- Greps por `instagramFollowBusiness` falham em encontrar usos.
- Renomear vai precisar migração coordenada (Prisma + MCP + frontend + qualquer consumer).
- Aumenta risco de bugs silenciosos quando devs corrigem o typo "achando que é typo no código novo" sem atualizar consumers.

**Severidade INFO** — não é incidente, é dívida técnica.

---

### 4.11 🔴 CRÍTICA — Bug `.emit()` SISTÊMICO em 5/5 write tools de CRM (silent-fail false-negative)

**Descoberta:** sessão 2026-05-04 do playbook (section 2.6, rodadas 1+2). **Severidade elevada de ALTA → CRÍTICA em 2026-05-04 rodada 2** após confirmação de escopo (5/5 tools) + silent-fail confirmado (mutações persistem apesar do erro).

**Escopo confirmado (rodada 2 do playbook):**

| Tool | Erro retornado | Mutação persistiu? |
|---|---|---|
| `create_kanban_card` | `INTERNAL_ERROR/internal/Cannot read properties of undefined (reading 'emit')` | ✅ SIM (cards `5e7c7d53-...` e `58ae7027-...` em prod) |
| `move_kanban_card` | mesmo erro | ✅ SIM (`columnId` mudou pra Concluído) |
| `win_kanban_card` | mesmo erro | ✅ SIM (`statusOportunity: WON`) |
| `lose_kanban_card` | mesmo erro | ✅ SIM (`statusOportunity: LOST`) |
| `assign_card_moderator` | mesmo erro | ✅ SIM (`moderators[]` populado com `userId` do owner) |

**Mesma stack/handler/wrapper afeta toda a família.** Não é bug isolado de `create_kanban_card`.

**Sintoma:**

Toda chamada a `create_kanban_card` na conta de prod `c1c4324a-...` falha com:

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "type": "internal",
    "message": "Cannot read properties of undefined (reading 'emit')"
  }
}
```

Reproduzido em **ambos os paths** (3 tentativas):
1. Existing contact (`contactId: aa6d04f2-...`, priority MEDIUM, com description) → falha.
2. New contact com phone all-zero (`5500000000000`) → falha **antes** com `VALIDATION_ERROR/domain` "Telefone inválido" (validação roda primeiro).
3. New contact com phone BR plausível (`5511987654321`, priority HIGH) → falha com mesmo null-deref `emit`.

**Análise do null-deref:**

A mensagem `Cannot read properties of undefined (reading 'emit')` indica chamada `<algo>.emit(...)` onde `<algo>` é `undefined`. No stack do projeto, candidatos comuns:
- `socket.emit(event, payload)` — Socket.IO server-side, esperado em real-time notification de card criado
- `eventEmitter.emit(name, payload)` — Node EventEmitter para integração com workers BullMQ
- `wsService.emit(...)` — wrapper interno de WebSocket

**Hipótese:** o handler MCP de `create_kanban_card` invoca um serviço que assume contexto HTTP (socket attached ao request), mas roda fora desse contexto via MCP. O socket/emitter nunca é injetado, fica `undefined`, e a chamada `.emit()` quebra **após** o `INSERT` no banco.

**Por que é problema de integridade:**

1. **Validação roda antes do bug**: phone inválido foi pego com `VALIDATION_ERROR` separado. Isso indica que o pipeline é: validate → persist → notify (emit). O bug está na fase notify, **depois** do persist.
2. **Cards podem estar sendo criados no banco sem retornar sucesso**: o cliente recebe erro 500, mas o registro pode existir em `kanban_cards` (e relacionados — moderators, comments, contact_link).
3. **Side effect do playbook**: 1–3 cards `_teste_card_intelligence_*` podem estar órfãos na conta `c1c4324a-...` agora.
4. **Implicação maior**: qualquer integração externa (n8n, Make, automações que chamam `create_kanban_card` via MCP) está nesse mesmo estado broken — usuários recebem "erro" mas registros aparecem na UI minutos depois.

**Severidade CRÍTICA** (elevada em rodada 2) — não é leak, mas é:
- Bug em prod afetando **feature core (CRM) inteira** — todas as 5 mutations da família
- **Silent-fail false-negative**: client recebe `INTERNAL_ERROR`, banco persiste a mutação. Quebra contrato API fundamental.
- Frontend que faz rollback ou retry no error envelope vai **double-write** ou mostrar estado inconsistente
- Integrações externas (n8n, Make, agentes A2A via MCP) afetadas — usuários veem "erro" mas mutação aplica
- Falta de transação envolvendo banco + emit (rollback do banco se emit falhar)

**Remediação sugerida:**

1. **Hotfix**: tornar o `.emit()` defensivo (`socket?.emit?.(...)`) **em TODOS os 5 handlers** ou guard com check de socket existir. Não bloqueia retorno de sucesso.
2. **Estrutural**: mover notificação real-time pra fora da transação síncrona — fila/job que reemite quando socket reconecta. Persist + retorno → enqueue de notification.
3. **Observabilidade**: adicionar metric/alerta de erros 500 com message contendo `'emit'` em qualquer tool de CRM. Snapshot test de write tools verificando que retornam shape de sucesso (não erro) com mutação aplicada.
4. **Cleanup imediato**: 2 cards de teste residuais da rodada 2 (`5e7c7d53-...` Concluído/WON com Vinícius Almeida + `58ae7027-...` Início/LOST `_teste_card_intelligence`) — remover via UI/SQL na conta `c1c4324a-...`.
5. **Rastrear retroativamente**: query no banco por logs de aplicação retornando `INTERNAL_ERROR` + `'emit'` nas últimas semanas — mapear quantos cards/mutações foram aplicados sem retorno de sucesso pra clientes.

**Verificação no codebase:**

```bash
# Procurar usos de .emit() em handlers de kanban
graphify query "emit kanban card"
# ou
grep -rn "\.emit(" chatfunnel-services/src/kanban
grep -rn "\.emit(" chatfunnel-mcp/src
```

**Referência:** `scripts/mcp-prompts-playbook.md` seção 2.6 → `create_kanban_card` (3 tentativas com payloads completos).

---

### 4.12 🟠 ALTA — `get_automation` vaza i18n key não resolvida (information disclosure + bug UX)

**Descoberta:** sessão 2026-05-04 stress test (bloco 6 do playbook).

**Vazamento:**

```json
{
  "error": {
    "code": "NOT_FOUND",
    "type": "domain",
    "message": "errors.Automation.ErrorOnGetAutomations"
  }
}
```

Quando `get_automation` é chamado com `automationId` inexistente (ex: `00000000-0000-0000-0000-000000000000`), o handler retorna a **chave i18n raw** (`errors.Automation.ErrorOnGetAutomations`) em vez da string traduzida.

**Comparação com outros handlers** (mesmo cenário NOT_FOUND, mesma sessão):

| Tool | Mensagem | Idioma |
|---|---|---|
| `get_template` | `"Template not found"` | EN |
| `get_contact` | `"Contato não encontrado!"` | PT-BR |
| `get_automation` | `"errors.Automation.ErrorOnGetAutomations"` | **i18n key raw** 🐛 |

**Impacto:**

1. **Information disclosure** — atacante mapeia estrutura do framework de erros internos do produto (namespace `errors.Automation.*`). Útil pra reconnaissance em ataques posteriores.
2. **Bug de UX** — frontend que renderiza `error.message` pro user mostra string técnica ininteligível (`"errors.Automation.ErrorOnGetAutomations"`) em vez de mensagem PT-BR.
3. **Sintoma de problema sistêmico** — provável que outras tools de automation tenham o mesmo bug (i18n loader missing fallback). Auditar `list_automations`, `delete_automations`, `toggle_automation`, etc.

**Severidade ALTA** porque:
- Vaza estrutura interna (namespace `errors.<Module>.<ErrorCode>`)
- Quebra contract de error message
- Inconsistência confusa pra cliente da API

**Remediação sugerida:**

1. **Hotfix**: garantir fallback i18n — se key não resolver, retornar string default (`"Automation not found"` ou PT-BR).
2. **Auditar** outros tools do módulo Automation pra mesma inconsistência.
3. **Padronizar idioma** dos error messages — atualmente mistura EN, PT-BR, e i18n key raw em handlers diferentes.

**Referência:** `scripts/mcp-prompts-playbook.md` bloco 6 NOT_FOUND map (sessão 2026-05-04).

---

### 4.13 🟠 ALTA — `delete_tag` em tag deletada vaza stack trace Prisma (information disclosure)

**Descoberta:** sessão 2026-05-04 stress test (bloco 8 do playbook).

**Vazamento:**

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "type": "internal",
    "message": "\nInvalid `prisma.tags.delete()` invocation:\n\n\nAn operation failed because it depends on one or more records that were required but not found. Record to delete does not exist."
  }
}
```

Quando `delete_tag` é chamado com `tagId` que **já foi deletado** (idempotency test), o handler **não captura a exceção do Prisma** e propaga a stack trace inteira pro client.

**Vazamentos no payload:**

1. **Nome do ORM**: `prisma`
2. **Nome da tabela**: `tags`
3. **Nome do método**: `delete()`
4. **Estrutura da exceção**: formatação Prisma reconhecível (`\nInvalid `prisma.X.Y()` invocation:...`)
5. **Mensagem técnica em inglês** exposta a client multilíngue

**Comparação com handler tratado** (mesma sessão, mesmo cenário NOT_FOUND):

| Tool | Comportamento |
|---|---|
| `add_contact_tag` (tagId já deletado) | ✅ `NOT_FOUND/domain/"Tag not found"` — handler tratado |
| `delete_tag` (já deletada) | 🔴 `INTERNAL_ERROR/internal/"Invalid prisma.tags.delete()..."` — stack vaza |

**Inconsistência clara** entre handlers do mesmo módulo Tag.

**Impacto:**

1. **Information disclosure**: atacante confirma stack tecnológica (Prisma + Postgres provavelmente), nomes de tabelas, padrão de erros internos. Útil pra **schema enumeration** e ataques de injection direcionados.
2. **HTTP 500 inflation**: erros recuperáveis (NOT_FOUND legítimo) viram 500, distorcendo métricas de saúde da API.
3. **Sintoma de problema sistêmico**: outros tools de write provavelmente têm o mesmo padrão `try { prisma.X.delete() } catch` faltando. Auditar todos os `delete_*` do MCP.

**Severidade ALTA** porque:
- Vaza ORM e schema interno (mesmo nível de severidade que typo `instagramFollowBusinnes` 4.10, mas mais grave porque é exception handling broken)
- Pattern provavelmente afeta outros endpoints (auditar)

**Remediação sugerida:**

1. **Hotfix `delete_tag`**: capturar `PrismaClientKnownRequestError` com `code: "P2025"` (record not found) e retornar `NOT_FOUND/domain/"Tag not found"`.
2. **Audit grep** em todos os handlers MCP por `prisma\.\w+\.delete\(` sem try/catch — provável que outros tools tenham o mesmo problema (ex: `delete_tag_folder`, `delete_automations`, `delete_templates`).
3. **Wrapper genérico** de error handling: middleware no MCP server que converte `PrismaClientKnownRequestError` em error envelopes padronizados antes de retornar.

**Verificação no codebase:**

```bash
# Padrão problemático (delete sem try/catch)
grep -rn "prisma\.\w*\.delete(" chatfunnel-services/src
grep -rn "prisma\.\w*\.delete(" chatfunnel-mcp/src
```

**Referência:** `scripts/mcp-prompts-playbook.md` bloco 8 stress test (sessão 2026-05-04, `delete_tag` em tag `800ffa25-...` já deletada).

---

## 5. Análise dos Vetores Não-Vazamento

### 5.1 Multi-tenancy — ✅ OK

`grep -rn "accountId" chatfunnel-mcp/src/mcp/schemas/` → **zero matches**. Nenhum input schema aceita `accountId` do caller. Em todos os handlers, `accountId` é lido do token de sessão via `getAuth()`. Ataque clássico (passar accountId de outra conta) **não funciona**.

### 5.2 SQL Injection — ✅ OK

Uso de `$queryRaw`/`$executeRaw` mapeado em:
- `contacts.repository.js` (core): `getTopRanking`, `getContacts`, `findById`, `findByPhoneOrEmail`, `findByInstagram`, `findByWppUserId`, `findByPhoneVariants`
- `accounts.repository.js` (core): `checkModerators`

Todos usam `Prisma.sql` com tagged template literals e interpolação `${}` parametrizada pelo driver. **Nenhuma concatenação de string crua.** Sem SQL injection.

### 5.3 Pendente — Authorization granular

**Não auditado.** Para cada tool de escrita (`assign_card_moderator`, `move_kanban_card`, `add_contact_tag`, etc.), validar que:
- O recurso alvo (card/contato/tag) pertence à `accountId` do caller
- O recurso secundário (moderador, coluna) também pertence à mesma conta

Caso clássico de bug: tool aceita `cardId` + `moderatorId` e atribui sem checar se ambos são da mesma conta. Atacante passa moderador da própria conta + card da conta da vítima.

### 5.4 Pendente — Input validation

Verificar se schemas zod usam `.strict()` (rejeita campos extras). Sem `.strict()`, atacante pode injetar campos não declarados que são silenciosamente passados pra função.

---

## 6. Causa Raiz

**Padrão estrutural:**

```ts
// Padrão atual em quase toda tool
async function handler(input) {
  const data = await someService.getData(input);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
```

`data` vem dos repos do `@chatfunnel/core`, que usam `include: { ... }` em vez de `select: { ... }`. Resultado: entidade Prisma inteira fluindo até o `JSON.stringify`.

**Por que isso aconteceu:**
- Repos do core foram desenhados para uso interno (API/Services), onde a sanitização acontecia (ou deveria acontecer) na camada de controller/route.
- O MCP foi construído reusando os mesmos repos, **mas pulou a camada de sanitização**.
- Não há lint/test/CI gate impedindo `JSON.stringify` direto de entidade Prisma.

---

## 7. Plano de Remediação

### 7.1 Fase 1 — Hot fixes (hoje / 1 dia)

**Branch:** `fix/mcp-output-sanitization`

1. **`get_moderators`** — adicionar whitelist no handler MCP:

   ```ts
   const safe = data.map(m => ({
     id: m.id,
     userId: m.userId,
     pending: m.pending,
     user: m.user ? {
       id: m.user.id,
       name: m.user.name,
       email: m.user.email,
       photo: m.user.photo,
     } : null,
   }));
   ```

2. **`get_assistants`** — whitelist do retorno (id, name, description, model, isDeleted, contadores).

3. **`get_contact`** — whitelist dos campos seguros do contato.

4. **`list_kanban_cards`** — auditar e aplicar whitelist no contato/moderador joinados.

Cada fix em commit separado com snapshot test antes/depois mostrando os campos removidos.

### 7.2 Fase 2 — Camada DTO estruturada (esta semana)

Criar `chatfunnel-mcp/src/dto/`:

```
dto/
├── user-public.dto.ts       # id, name, email, photo
├── account-public.dto.ts    # id, name, plan, timezone
├── moderator-public.dto.ts  # id, userId, pending, user (UserPublicDto)
├── contact-public.dto.ts    # id, name, phone, email, tags
├── assistant-public.dto.ts  # id, name, model, instructions (opcional)
└── index.ts
```

Cada DTO é função pura: `toUserPublicDto(user: User): UserPublicDto`. Aplicar em todos os handlers de leitura.

### 7.3 Fase 3 — Prevenção (próxima sprint)

**Lint rule custom (eslint):**
- Arquivo `*.tools.ts` que faz `JSON.stringify(x)` onde `x` não passou por `to*Dto` → erro.
- Arquivo `*.tools.ts` que retorna spread `...row` de findFirst/findMany → erro.

**Snapshot tests:**
- Para cada tool de leitura, snapshot do shape do retorno.
- Snapshot diff mostra novo campo? CI falha. Time precisa decidir se é seguro liberar.

**Threat model documentado:**
- Adicionar `vault/wiki/security/mcp-threat-model.md` com mapa de campos sensíveis por tabela.
- Lista de "nunca pode sair":
  - `users.passwordHash`
  - `users.longLivedAccessToken`
  - `accounts.openaiKey`, `anthropicKey`, `elevenlabsKey`
  - `accounts.*AccessToken`, `accounts.wppPin`
  - Qualquer `*CustomerId`, `*SubscriptionId`
  - `users.cpfCnpj`, `users.document`

### 7.4 Fase 4 — Auditoria das pendências

- Authorization granular em todas as tools de escrita (cardId/moderatorId/tagId pertencem à conta?)
- `.strict()` em todos os zod schemas
- Rate limiting por conta no MCP (atualmente ausente?)
- Audit log de chamadas MCP (quem chamou o quê, quando)

### 7.5 Fase 5 — Resposta a incidente

Já que o `passwordHash` saiu do banco em chamadas MCP, considerar:
- **Rotacionar** todas as API keys de provedor que estão no campo `accounts.openaiKey`/`anthropicKey`/`elevenlabsKey` se houve uso real do MCP em produção com clientes externos.
- **Revogar** `longLivedAccessToken` Facebook dos usuários impactados e forçar re-auth.
- **Forçar reset de senha** dos usuários cujo `passwordHash` saiu (medida conservadora).
- Verificar logs do LLM provider se as conversas que receberam esses dados foram retidas/treinadas.

Decisão: avaliar com base em quem teve acesso ao MCP até agora.

---

## 8. Apêndices

### 8.1 Lista canônica de campos sensíveis

| Tabela | Campo | Categoria | Nunca-vaza? |
|---|---|---|---|
| `users` | `passwordHash` | Crypto | ✅ |
| `users` | `longLivedAccessToken` | OAuth | ✅ |
| `users` | `cpfCnpj`, `document` | PII regulada | ✅ |
| `users` | `pagarmeCustomerId`, `stripeCustomerId`, `stripeSubscriptionId` | Pagamento | ✅ |
| `users` | `verifiedBy`, `permissionsGroupId` | Interno | ✅ |
| `accounts` | `openaiKey`, `anthropicKey`, `elevenlabsKey` | API key provedor | ✅ |
| `accounts` | `longLivedAccessToken`, `fbAccessToken`, `igAccessToken`, `wppAccessToken` | OAuth/canal | ✅ |
| `accounts` | `wppPin` | Crypto | ✅ |
| `accounts` | `pagarmeCustomerId`, `stripeCustomerId`, `stripeSubscriptionId` | Pagamento | ✅ |
| `accounts` | `cpfCnpj` | PII regulada | ✅ |
| `accounts` | `trialExpireDate`, `nextDatePayment` | Interno (tolerável) | ⚠️ caso a caso |
| `contacts` | `wppUserId`, `instagramId` | Identificador plataforma | ⚠️ contexto-dependente |

### 8.2 Padrão de DTO recomendado

```ts
// dto/user-public.dto.ts
import { Users } from "@chatfunnel/core";

export type UserPublicDto = {
  id: string;
  name: string;
  email: string;
  photo: string | null;
};

export function toUserPublicDto(u: Users): UserPublicDto {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    photo: u.photo,
  };
}
```

**Princípio:** whitelist sempre, blacklist nunca. Adicionar novo campo no DB = decisão consciente de adicionar no DTO.

### 8.3 Comandos de validação

Para confirmar fix em CI:

```bash
# Nenhum campo proibido aparece em snapshots de tools
grep -rn "passwordHash\|longLivedAccessToken\|openaiKey\|anthropicKey\|elevenlabsKey\|wppPin\|wppAccessToken\|igAccessToken\|fbAccessToken" chatfunnel-mcp/test/__snapshots__/ && exit 1 || exit 0
```

---

## 9. Status e Próximos Passos

| # | Ação | Owner | Prazo | Status |
|---|---|---|---|---|
| 1 | Fix `get_moderators` | — | Hoje | 🔴 Aberto |
| 2 | Fix `get_assistants` | — | Hoje | 🔴 Aberto |
| 3 | Fix `get_contact` (4.3 + 4.9) | — | Esta semana | 🟡 Aberto |
| 4 | Auditar `list_kanban_cards` (4.4 + 4.8) | — | Esta semana | 🟡 Aberto |
| 5 | Camada `dto/` estruturada | — | Próxima semana | 🟡 Aberto |
| 6 | Lint rule + snapshot tests | — | Próxima sprint | 🟢 Backlog |
| 7 | Auditoria authorization granular | — | Próxima sprint | 🟢 Backlog |
| 8 | Decidir rotação de keys | — | Imediato | 🔴 Aberto |
| 9 | **Fix `search_contacts.topRanking[]` (4.7)** — vazamento massivo | — | Hoje | 🔴 Aberto |
| 10 | Mascarar PII em `get_channels` (4.6) — `wppName`, `wppNumber`, `igName` | — | Esta semana | 🟠 Aberto |
| 11 | Limpar telefone em `moderators[].user.name` (4.8) — **3 endpoints afetados**: `list_kanban_cards`, `add_step_chat_action` read, `assign_card_moderator` read (escopo expandido 2026-05-04) | — | Esta semana | 🟡 Aberto |
| 12 | Renomear `TagsContacts` → `tags` em `get_contact` (4.9) | — | Próxima sprint | 🟢 Backlog |
| 13 | Corrigir typo `instagramFollowBusinnes` (4.10) — migration coordenada | — | Próxima sprint | 🟢 Backlog |
| 14 | **Rotacionar `openaiKey` Project (`sk-proj-...`) e `elevenlabsKey` da conta `c1c4324a-...`** — chaves de prod expostas em corpus local (4.1.b) | — | Imediato | 🔴 Aberto |
| 15 | **Reset de senha do owner `userId: 904783c2-...`** (4.1.b) — `passwordHash` exposto em corpus | — | Imediato | 🔴 Aberto |
| 16 | **Anular `longLivedAccessToken` Facebook do owner** (4.1.b) ou aguardar expiração se janela curta | — | Imediato | 🔴 Aberto |
| 17 | **Hotfix `.emit()` defensivo em 5/5 write tools de CRM** (4.11) — `create_kanban_card`, `move_kanban_card`, `win_kanban_card`, `lose_kanban_card`, `assign_card_moderator`. Escopo expandido em 2026-05-04 rodada 2 (era só create antes). Severidade ALTA → CRÍTICA. | — | Hoje | 🔴 Aberto |
| 18 | **Cleanup 2 cards órfãos** confirmados pós-rodada 2 na conta `c1c4324a-...`: `5e7c7d53-7bc3-4989-9b89-3b6a003c97ee` (Vinícius Almeida Castro, Concluído/WON, com moderator owner) + `58ae7027-d0f8-43a2-b64d-523e7ea28bc2` (`_teste_card_intelligence`, Início/LOST). Sem `delete_kanban_card` MCP — limpar via UI/SQL. | — | Hoje | 🟠 Aberto |
| 19 | **Auditoria estrutural notify-after-persist** — mover emit pra fora da transação síncrona (4.11 root cause) | — | Próxima sprint | 🟢 Backlog |
| 20 | ~~Re-rodar 4 tools dependentes de `create_kanban_card`~~ ✅ **fechado 2026-05-04 rodada 2** — todas 4 capturadas via silent-fail confirmado, shapes documentados em playbook section 2.6. | — | — | ✅ Fechado |
| 21 | **Bug `build_automation` silent-fail em `branchConnections` inválido** — aceita `branchId` desconhecido sem erro, criando steps órfãs no banco. Validar `branchId` contra UUIDs gerados pelos builders. (capturado 2026-05-04 via teste com magic strings `"answer"`/`"unanswer"` em FOLLOW_UP) | — | Próxima sprint | 🟠 Aberto |
| 22 | **Gap MCP: FOLLOW_UP routing não configurável** — `add_step_follow_up` schema só aceita `duration`/`unit`/`channelId`; `build_automation` não tem mecanismo pra setar `answerStepId`/`unanswerStepId` (campos que existem no banco e são populados via UI). Avaliar adicionar `branchConnections` magic strings `"answer"`/`"unanswer"` ou expor fields no schema do builder. | — | Próxima sprint | 🟢 Backlog |
| 23 | **Gap MCP: galeria de mídias não exposta** — endpoint REST `GET /api/medias?filter=image` retorna `{id, url, mimetype, name, createdAt, automations}[]` mas **não há tool MCP equivalente** (`list_medias`, `get_gallery`, `get_uploaded_files` — nenhuma existe). Implicação: agente LLM construindo flow via MCP **não consegue descobrir `mediaUrl` real** pra MSG IMAGE/VIDEO/AUDIO sem input externo do user. `configure_template_params` aceita `mediaId` mas não tem rota pra listá-los. **Avaliar expor** `list_medias` via MCP (filter por mimetype, paginação) — destrava A2A pra automation building com assets visuais. (capturado 2026-05-04 durante construção de flow demo full coverage) | — | Próxima sprint | 🟢 Backlog |
| 24 | **🔴 SILENT-FAIL false-negative em 5/5 write tools de CRM** (4.11 expandido) — pipeline `validate → DB commit → emit (BREAK) → throw` quebra contrato API: client recebe `INTERNAL_ERROR` mas mutação persiste no banco. Frontend que faz rollback/retry vai double-write ou divergir estado. Classe distinta do bug de notificação original. **Snapshot test obrigatório** após hotfix (acao 17): cada write tool deve retornar shape de sucesso quando mutação aplica. (capturado 2026-05-04 rodada 2) | — | Hoje | 🔴 Aberto |
| 25 | **Auditoria proativa de outras famílias de write tools** — buscar mesmo padrão `.emit()` em handlers fora de CRM (Tag write, Contact write, Template write, Automation write). Section 2.1-2.5 e 2.7 do playbook não reportaram esse erro, mas confirmar via grep `\.emit(` em todos os handlers MCP do `chatfunnel-services`/`chatfunnel-mcp` pra prevenir mesmo bug latente em outros endpoints. | — | Esta semana | 🟠 Aberto |
| 26 | **Hotfix `get_automation` i18n key leak (4.12)** — adicionar fallback no i18n loader pra `errors.Automation.ErrorOnGetAutomations` e auditar outros tools do módulo Automation pra mesma inconsistência. Padronizar idioma dos error messages (atualmente mistura EN, PT-BR, i18n raw). | — | Esta semana | 🟠 Aberto |
| 27 | **Hotfix `delete_tag` Prisma stack leak (4.13)** — capturar `PrismaClientKnownRequestError P2025` e retornar `NOT_FOUND/domain/"Tag not found"`. Audit grep em `delete_*` handlers MCP procurando o mesmo padrão `prisma.X.delete()` sem try/catch (provável afetar `delete_tag_folder`, `delete_automations`, `delete_templates`). | — | Esta semana | 🟠 Aberto |
| 28 | **Wrapper de error handling genérico** — middleware MCP que converte `PrismaClientKnownRequestError` em error envelopes padronizados antes de retornar. Previne tipo de leak de 4.13 sistematicamente. | — | Próxima sprint | 🟢 Backlog |
| 29 | **Bug `update_contact_field` value="" deleta junction** — frontend que set `""` pra "limpar valor" perde a relação inteira do customField. Decidir se é bug (clear → set null/empty) ou feature (sentinel pra delete) e documentar. Capturado 2026-05-04 stress test. | — | Esta semana | 🟡 Aberto |
| 30 | **Bug `update_contact_field` 3 comportamentos no mesmo shape de input** — INSERT (retorna row), UPDATE (retorna `{}`), DELETE quando value="" (retorna `{}`). Cliente não distingue do response. Padronizar response (sempre retornar row final, ou sempre `{}`, com flag de operação). | — | Próxima sprint | 🟢 Backlog |
| 31 | (reservado) | — | — | — |
| 32 | **Bug `needsConfiguration` divergente entre `list_templates` (false) e `get_template` (true)** — mesma entidade, mesmo channelId, momento adjacente, dois valores opostos. Frontend mostra UX diferente conforme tool. Padronizar source of truth. (capturado 2026-05-04 rodada 2 templates) | — | Esta semana | 🟡 Aberto |
| 33 | **Bug `rejectedReason: null` em template REJECTED** — Meta API quase sempre retorna razão (TAG_CONTENT_MISMATCH, SCAM, INVALID_FORMAT). MCP não mapeia ou pull aconteceu antes do Meta preencher. Adicionar fetch tardio ou pull-on-demand do campo. | — | Esta semana | 🟡 Aberto |
| 34 | **Bug `get_template.data.buttons[]` vs `components[type=BUTTONS].buttons[]` shapes diferentes** — outer tem `{id, whatsappTemplateId, type, url, index}` sem `text`; inner tem `{type, text}` sem `id`/`index`. Frontend renderizar preview precisa join por `index`. Padronizar shape. | — | Próxima sprint | 🟢 Backlog |
| 35 | **🔴 Bug CRÍTICO `update_template` partial-update DELETA components não enviados** — antes do update: HEADER + BODY + FOOTER + BUTTONS. Após update só com `body`: components fica só com BODY. HEADER/FOOTER/BUTTONS sumiram silently no Meta-side. Frontend que faz "edit body inline" perde tudo. (capturado 2026-05-04 rodada 2 — template `_teste_intelligence_template` `6fe72af1-...`) | — | Hoje | 🔴 Aberto |
| 36 | **Bug `update_template` muda `category` pra MARKETING default quando omitido** — input só com `body`, output template foi de UTILITY → MARKETING. Handler injeta default pra Meta em vez de preservar estado existente. Frontend que faz update parcial de UTILITY/AUTHENTICATION template vai degradar pra MARKETING silently. | — | Hoje | 🔴 Aberto |
| 37 | **Bug divergência interna pós-update entre `components[]` (Meta-side) e `buttons[]` outer (banco)** — components reflete novo estado (só BODY), buttons[] outer ainda tem QUICK_REPLY antigo. UI lê outer, Meta dispara mensagem sem botão. Snapshot inconsistente. (capturado 2026-05-04 rodada 2) | — | Esta semana | 🟠 Aberto |
| 38 | **Bug status REJECTED não volta pra PENDING após `update_template`** — Meta não re-enfileirou aprovação. Hipóteses: (a) Meta detecta conteúdo similar e mantém REJECTED auto, (b) handler não chama endpoint Meta correto, (c) bug de propagação. Investigar logs Meta API + comportamento esperado. | — | Esta semana | 🟡 Aberto |
| 39 | **Naming conflict `status` em `list_templates`** — envelope retorna `{ data: [], status: true }` quando vazio (boolean de sucesso de envelope) enquanto template tem `status: "APPROVED" \| "REJECTED" \| ...` (string). Frontend que faz `response.status` pode confundir com `response.data[i].status`. Renomear envelope-level pra `success` ou `ok` pra coerência com `sync_templates` (que já usa `success`). | — | Próxima sprint | 🟢 Backlog |
| 40 | **Gap captura `delete_templates` em template usado por automação** — schema docstring promete "Returns warnings if templates are used by automations". Não testado em rodada 2 (template REJECTED nunca usado em flow). Capturar shape de warnings (provavelmente envelope ganha `warnings[]` field). | — | Pós-fix | 🟢 Backlog |
| 41 | **Hipótese rebatida em `configure_template_params` com `parameters: []`** — documentação anterior dizia "provavelmente apaga TODOS os mappings". Realidade capturada em rodada 2: comportamento defensivo, só reseta `internalParameter` pra `""` mantendo estrutura. Documentar semântica explícita no schema: "upsert mapping by parameter key, missing keys reset to empty (não delete)". | — | Esta semana | 🟢 Backlog |

---

## 10. Referências

- Descoberta inicial: `scripts/mcp-prompts-playbook.md` seção `get_moderators`
- Handler vazado: `chatfunnel-mcp/src/mcp/tools/discovery.tools.ts`
- Service vazado: `chatfunnel-mcp/src/moderators/moderators.service.ts`
- Repo problemático: `@chatfunnel/core` `repositories/moderators.repository.js`
- Padrão correto a replicar: `get_agents_v2` em `discovery.tools.ts`

---

**Confidencial — uso interno ChatFunnel.** Não compartilhar este documento ou os payloads dele com terceiros até remediação concluída.
