---
title: MCP Bugs Tracking
description: Rastreamento de bugs, data leaks e inconsistencias do chatfunnel-mcp descobertos nas sessoes de auditoria 2026-04-30 e 2026-05-04.
tags: [gotcha, mcp, security, bugs, tracking]
severity: critica
related: ["[[wiki/repos/chatfunnel-mcp|chatfunnel-mcp]]", "[[wiki/features/intelligence-a2a-shapes|intelligence-a2a-shapes]]", "[[wiki/features/intelligence-a2a|intelligence-a2a]]", "[[wiki/features/intelligence-v2-arquitetura|intelligence-v2-arquitetura]]", "[[wiki/gotchas/frontend-gotchas|frontend-gotchas]]"]
last_updated: 2026-05-05
source: docs/security/2026-04-30-mcp-data-leak-audit.md
---

# MCP Bugs Tracking

Bugs descobertos durante auditoria ao vivo do MCP (sessoes 2026-04-30 e 2026-05-04). Cada bug inclui o que foi pedido ao MCP, a resposta obtida, e por que e problema.

Fonte detalhada: `docs/security/2026-04-30-mcp-data-leak-audit.md`

---

## Indice rapido

| #     | SEV   | CAT    | Bug                                                       | Tool(s)                           | STS    |
| ----- | ----- | ------ | --------------------------------------------------------- | --------------------------------- | ------ |
| 1     | CRIT  | LEAK   | `get_moderators` vaza secrets de producao                 | `get_moderators`                  | ABERTO |
| 2     | CRIT  | LEAK   | `search_contacts.topRanking[]` vaza top contatos da conta | `search_contacts`                 | ABERTO |
| 3     | CRIT  | BUG    | Silent-fail em 5/5 write tools de CRM                     | `create_kanban_card` + 4          | ABERTO |
| 4     | CRIT  | BUG    | `update_template` partial-update deleta components        | `update_template`                 | ABERTO |
| 5     | CRIT  | BUG    | `update_template` muda category pra MARKETING             | `update_template`                 | ABERTO |
| 6     | ALTA  | LEAK   | `get_assistants` vaza instructions                        | `get_assistants`                  | ABERTO |
| 7     | ALTA  | LEAK   | `get_channels` retorna PII plaintext                      | `get_channels`                    | ABERTO |
| 8     | ALTA  | LEAK   | `moderators[].user.name` carrega telefone                 | 3 endpoints                       | ABERTO |
| 9     | ALTA  | BUG    | `get_automation` vaza i18n key raw                        | `get_automation`                  | ABERTO |
| 10    | ALTA  | BUG    | `delete_tag` vaza stack trace Prisma                      | `delete_tag`                      | ABERTO |
| 11    | ALTA  | BUG    | Divergencia buttons[] pos-update template                 | `update_template`                 | ABERTO |
| 12    | MEDIA | LEAK   | `get_contact` vaza PII + nome de tabela                   | `get_contact`                     | ABERTO |
| 13    | MEDIA | LEAK   | `list_kanban_cards` vaza contato/moderador                | `list_kanban_cards`               | ABERTO |
| 14    | MEDIA | BUG    | `update_contact_field` value="" deleta junction           | `update_contact_field`            | ABERTO |
| 15    | MEDIA | BUG    | `needsConfiguration` diverge entre list e get             | `list_templates` / `get_template` | ABERTO |
| 16    | MEDIA | BUG    | `rejectedReason: null` em template REJECTED               | `get_template_status`             | ABERTO |
| 17    | MEDIA | BUG    | REJECTED nao volta pra PENDING apos update                | `update_template`                 | ABERTO |
| 18    | MEDIA | BUG    | `update_contact_field` retorna `{}` em UPDATE/DELETE      | `update_contact_field`            | ABERTO |
| 19–28 | INFO  | NAMING | Typos, shapes condicionais, IDs hibridos                  | Varios                            | ABERTO |
| 29–32 | —     | GAP    | Features ausentes no MCP                                  | —                                 | ABERTO |

---

## Criticos

### #1 — `get_moderators` vaza secrets de producao
`ACT 1,14` · `LEAK` · Audit 4.1 / 4.1.b · Playbook section 2.6

**O que foi pedido ao MCP:**
```
Tool: get_moderators
Params: {} (sem parametros)
Contexto: "Quem sao os moderadores da minha conta?"
```

**Resposta obtida (campos redigidos):**
```json
[{
  "id": "<uuid>",
  "user": {
    "passwordHash": "$2b$10$CkiCCMOupVaWd1YQxA4Jo...",
    "longLivedAccessToken": "EAAaBlPpzmxIBO4C4UWm...",
    "email": "<email>",
    "cpfCnpj": "52768721000140",
    "phone": "<phone>", "idd": "<idd>", "ddd": "<ddd>",
    "pagarmeCustomerId": "<id>", "stripeCustomerId": "<id>"
  },
  "account": {
    "openaiKey": "sk-proj-TrEuBe3AjEdQ8iwegz3D3l...",
    "anthropicKey": "<key>",
    "elevenlabsKey": "sk_af7c6554f3a9f6ee...",
    "longLivedAccessToken": "<facebook-token>",
    "stripeSubscriptionId": "<id>",
    "plan": "PREMIUM", "planLeads": 15000
  }
}]
```

**Por que e bug:**
- Repository usa `findMany` com `include: { user: true, account: true }` sem `select` — entidade Prisma inteira vaza.
- O handler do core injeta o owner como `{ user: account.user, account }` — secrets aparecem **duplicados** (root + nested).
- `passwordHash` bcrypt permite brute force offline. `longLivedAccessToken` Facebook da acesso a Graph API. `openaiKey` Project (`sk-proj-...`) e chave de billing direta.
- Confirmado em conta de producao (PREMIUM, ACTIVE) na sessao 2026-05-04 do playbook.

**Workaround:** Nenhum — tool nao deve ser chamada ate hotfix com whitelist.

---

### #2 — `search_contacts.topRanking[]` vaza top contatos da conta inteira
`ACT 9` · `LEAK` · Audit 4.7 · Playbook section 2.1

**O que foi pedido ao MCP:**
```
Tool: search_contacts
Params: { "query": "Vinicius" }
```

**Resposta obtida:**
```json
{
  "contacts": [/* 20 resultados de busca por "Vinicius" — OK */],
  "quantity": 139,
  "topRanking": [
    { "id": "5b471e0a-...", "name": "Claudia Tania", "photo": "https://scontent-...cdninstagram.com/...", "quantity": 422 },
    { "id": "a5b7b9bc-...", "name": "Silmar Martins", "photo": "...", "quantity": 66 },
    { "id": "65d9aed5-...", "name": "Diego Calassara", "photo": "...", "quantity": 42 }
  ]
}
```

**Por que e bug:**
- `topRanking[]` retorna os **top 3 contatos por interacoes da conta inteira**, independente da query. Pesquisar por "Vinicius" devolve "Claudia Tania" como top.
- Foto Instagram via URL assinada (token Meta, valida ~1 mes). `quantity` revela metricas de engajamento.
- A auditoria estatica original (4.5) nao pegou porque o SELECT do `$queryRaw` e whitelistado nos contatos da query — mas o handler **adiciona** `topRanking[]` pos-query no envelope.

**Workaround:** Mapper descarta `topRanking` quando query nao-vazia.

---

### #3 — Silent-fail em 5/5 write tools de CRM (`.emit()` undefined)
`ACT 17,24` · `BUG` · Audit 4.11 · Playbook section 2.6

**O que foi pedido ao MCP:**
```
Tool: create_kanban_card
Params: {
  "kanbanId": "d72d06f1-...",
  "columnId": "e119111d-...",
  "contactId": "aa6d04f2-...",
  "priority": "HIGH"
}
```

**Resposta obtida:**
```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "type": "internal",
    "message": "Cannot read properties of undefined (reading 'emit')"
  }
}
```

**Mas no banco:** Card criado com id `5e7c7d53-...`, visivel via `list_kanban_cards`. Reproduzido em **todas as 5 tools**:

| Tool | Mutacao persistiu? |
|---|---|
| `create_kanban_card` | SIM — card `5e7c7d53-...` criado |
| `move_kanban_card` | SIM — `columnId` mudou pra Concluido |
| `win_kanban_card` | SIM — `statusOportunity: WON` |
| `lose_kanban_card` | SIM — `statusOportunity: LOST` |
| `assign_card_moderator` | SIM — `moderators[]` populado |

**Por que e bug:**
- Pipeline do handler: `validate → DB commit → socket.emit() (QUEBRA) → throw`. O MCP roda fora do contexto HTTP (sem socket injetado), entao `socket` e `undefined`.
- A mutacao ja foi persistida **antes** do `.emit()` — o erro e na fase de notificacao real-time, nao na persistencia.
- Client recebe `INTERNAL_ERROR` mas o registro existe no banco. Frontend que faz rollback ou retry vai double-write.

**Workaround:** Apos erro `'emit'`, verificar estado real via `list_kanban_cards` em vez de rollback/retry.

---

### #4 — `update_template` partial-update DELETA components nao enviados
`ACT 35` · `BUG` · Playbook section 2.5

**O que foi pedido ao MCP:**

Template antes do update: HEADER + BODY + FOOTER + BUTTONS (1 QUICK_REPLY).

```
Tool: update_template
Params: {
  "channelId": "11fb6dc1-...",
  "templateId": "1025027719871305",
  "body": { "text": "Ola {{1}}, atualizacao do template intelligence." }
}
```
(Apenas `body` enviado — header, footer, buttons omitidos)

**Resposta obtida:**
```json
{ "success": true, "id": "1025027719871305" }
```

**Estado pos-update via `get_template`:**
```json
{
  "components": [
    { "type": "BODY", "text": "Ola {{1}}, atualizacao do template intelligence." }
  ]
}
```
HEADER, FOOTER e BUTTONS **sumiram** do Meta-side.

**Por que e bug:**
- Handler faz **replace** dos components Meta-side com o que vier no input, NAO merge com estado anterior. Campos omitidos sao tratados como "remover".
- Frontend que faz "edit body inline" destroi silenciosamente os outros componentes. Sem feedback do que sumiu.

**Workaround:** Sempre fetch state atual + re-enviar TODOS os components no payload.

---

### #5 — `update_template` muda `category` pra MARKETING quando omitido
`ACT 36` · `BUG` · Playbook section 2.5

**O que foi pedido ao MCP:**
```
Tool: update_template
Params: {
  "channelId": "11fb6dc1-...",
  "templateId": "1025027719871305",
  "body": { "text": "..." }
}
```
(category omitido — template era UTILITY antes)

**Estado pos-update:** `category` mudou de UTILITY → MARKETING.

**Por que e bug:**
- Handler injeta `category: "MARKETING"` como default no payload pra Meta quando o campo e omitido, em vez de preservar o valor atual.
- Template UTILITY ou AUTHENTICATION degrada silenciosamente. Impacta billing e regras de envio na Meta.

**Workaround:** Sempre incluir `category: current.data.category` no payload de update.

---

## Altos

### #6 — `get_assistants` vaza `instructions` do assistente
`ACT 2` · `LEAK` · Audit 4.2

**O que foi pedido ao MCP:**
```
Tool: get_assistants
Params: {} (sem parametros)
```

**Resposta obtida:** Retorno inclui campo `instructions` com o **prompt de sistema completo** do assistente customizado do cliente, alem de `openaiId` interno.

**Por que e bug:**
- `listWithRelations` usa `include` sem `select`. O handler enriquece com contadores mas nao filtra o objeto base.
- `instructions` e propriedade intelectual do cliente (prompt customizado). Vaza pro contexto do LLM.

**Workaround:** Whitelist no handler — retornar apenas `id, name, description, model, isDeleted, contadores`.

---

### #7 — `get_channels` retorna PII plaintext
`ACT 10` · `LEAK` · Audit 4.6 · Playbook section 2.1

**O que foi pedido ao MCP:**
```
Tool: get_channels
Params: {} (sem parametros)
```

**Resposta obtida:**
```json
{
  "id": "11fb6dc1-...",
  "allocatedType": "WHATSAPP",
  "wppName": "Vinicius Teider",
  "wppNumber": "+55 45 9830-3960",
  "igName": null
}
```

**Por que e bug:**
- O select **e** whitelistado (4.5 OK), mas os campos selecionados **incluem PII em plaintext** sem mascaramento.
- `wppNumber` pretty-printed com formatacao (facil de extrair por regex). `wppName` nome real do dono do canal.
- Violacao direta de LGPD em multi-tenant SaaS B2B onde dono do canal pode ser pessoa fisica.

**Workaround:** Mascarar antes de retornar ou expor apenas E.164 sem formatacao.

---

### #8 — `moderators[].user.name` carrega telefone embedado (3 endpoints)
`ACT 11` · `LEAK` · Audit 4.8 · Playbook sections 2.6, 2.8

**O que foi pedido ao MCP:**
```
Tool: list_kanban_cards
Params: { "kanbanId": "d72d06f1-...", "columnId": "e119111d-..." }
```
Tambem reproduzido via `assign_card_moderator` e `get_automation` (step com `add_step_chat_action`).

**Resposta obtida (em todos os 3 endpoints):**
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

**Por que e bug:**
- O campo `user.name` carrega o telefone formatado **dentro do nome** — nao e o nome humano do moderador.
- Provavelmente populado via integracao WhatsApp como `<accountName> + phone` em vez de so `<accountName>`.
- Telefone do admin/operador vai pro contexto do LLM em qualquer listagem de cards ou automacoes.

**Workaround:** Strip via regex no mapper: extrair parte alfabetica antes do primeiro digito.

---

### #9 — `get_automation` vaza i18n key raw
`ACT 26` · `BUG` · Audit 4.12 · Playbook bloco 6 (stress test NOT_FOUND)

**O que foi pedido ao MCP:**
```
Tool: get_automation
Params: { "automationId": "00000000-0000-0000-0000-000000000000" }
(ID inexistente — stress test de NOT_FOUND)
```

**Resposta obtida:**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "type": "domain",
    "message": "errors.Automation.ErrorOnGetAutomations"
  }
}
```

**Comparacao com outros handlers (mesmo cenario NOT_FOUND):**

| Tool | Mensagem |
|---|---|
| `get_template` | `"Template not found"` (EN) |
| `get_contact` | `"Contato nao encontrado!"` (PT-BR) |
| `get_automation` | `"errors.Automation.ErrorOnGetAutomations"` (i18n key raw) |

**Por que e bug:**
- Chave i18n nao resolvida — expoe namespace interno (`errors.<Module>.<ErrorCode>`). Information disclosure.
- Frontend que renderiza `error.message` mostra string tecnica ininteligivel pro usuario.
- Inconsistencia: 3 idiomas diferentes entre handlers (EN, PT-BR, i18n raw).

**Workaround:** Fallback i18n — se key nao resolver, retornar string default.

---

### #10 — `delete_tag` vaza stack trace Prisma
`ACT 27` · `BUG` · Audit 4.13 · Playbook bloco 8 (stress test idempotency)

**O que foi pedido ao MCP:**
```
Tool: delete_tag
Params: { "tagId": "800ffa25-..." }
(Tag ja deletada na chamada anterior — teste de idempotencia)
```

**Resposta obtida:**
```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "type": "internal",
    "message": "\nInvalid `prisma.tags.delete()` invocation:\n\n\nAn operation failed because it depends on one or more records that were required but not found. Record to delete does not exist."
  }
}
```

**Comparacao com handler tratado (mesmo modulo Tag):**

| Tool | Comportamento |
|---|---|
| `add_contact_tag` (tagId deletado) | `NOT_FOUND/domain/"Tag not found"` — handler tratado |
| `delete_tag` (ja deletada) | `INTERNAL_ERROR/internal/"Invalid prisma.tags.delete()..."` — stack vaza |

**Por que e bug:**
- Sem try/catch no Prisma. Stack trace revela: ORM (`prisma`), tabela (`tags`), metodo (`delete()`), formato de excecao.
- Util pra schema enumeration em ataques posteriores.
- Provavelmente afeta outros `delete_*` do MCP (`delete_tag_folder`, `delete_automations`, `delete_templates`).

**Workaround:** Capturar `PrismaClientKnownRequestError` com `code: "P2025"` → retornar `NOT_FOUND/domain`.

---

### #11 — Divergencia `buttons[]` outer vs `components[type=BUTTONS]` pos-update
`ACT 37` · `BUG` · Playbook section 2.5

**O que foi pedido ao MCP:**

1. Criar template com HEADER + BODY + FOOTER + BUTTONS (1 QUICK_REPLY)
2. `update_template` apenas com `body` (ver bug #4)
3. `get_template` pos-update

**Resposta obtida pos-update:**
```json
{
  "components": [
    { "type": "BODY", "text": "..." }
  ],
  "buttons": [
    { "id": "df6cc2d8-...", "type": "QUICK_REPLY", "url": null, "index": 0 }
  ]
}
```

**Por que e bug:**
- `components[]` reflete o estado Meta-side (so BODY — botoes sumiram pelo bug #4).
- `buttons[]` outer reflete o banco interno (QUICK_REPLY antigo ainda la).
- UI que le `buttons[]` mostra botao que nao existe mais no Meta. Mensagem disparada chega sem botao.

**Workaround:** Apos update, chamar `sync_templates` + re-fetch.

---

## Medios

### #12 — `get_contact` vaza PII + nome de tabela junction
`ACT 3,12` · `LEAK` · Audit 4.3 / 4.9 · Playbook section 2.3

**O que foi pedido ao MCP:**
```
Tool: get_contact
Params: { "contactId": "871d5e79-..." }
```

**Resposta obtida:**
```json
{
  "id": "871d5e79-...",
  "name": "Vinicius",
  "instagramId": "<id>",
  "wppUserId": "<id>",
  "instagramFollowBusinnes": true,
  "TagsContacts": [],
  "customFields": [],
  "lastName": ""
}
```

**Por que e bug:**
- `instagramId`, `wppUserId` sao identificadores de plataforma uteis pra re-identificacao cross-platform.
- `TagsContacts` em **PascalCase** e o nome literal da tabela junction Prisma. Inconsistente com `customFields` (camelCase) no mesmo objeto.
- `instagramFollowBusinnes` tem typo (falta segundo `s`).
- `lastName: ""` em vez de `null` quando nome tem 1 palavra.

**Workaround:** Whitelist no handler + mapper no front.

---

### #13 — `list_kanban_cards` vaza contato/moderador joinado
`ACT 4` · `LEAK` · Audit 4.4 · Playbook section 2.6

**O que foi pedido ao MCP:**
```
Tool: list_kanban_cards
Params: { "kanbanId": "d72d06f1-...", "columnId": "e119111d-..." }
```

**Resposta obtida:** Cards incluem joins de contato (mesmos problemas do bug #12) + moderador (mesmos problemas do bug #8 — telefone no `user.name`). Shape condicional: sem `columnId` nao retorna `cards[]`.

**Por que e bug:** Cascata dos bugs #12 e #8 via join. Dados de contato + admin expostos em qualquer listagem de kanban.

---

### #14 — `update_contact_field` com `value: ""` deleta junction
`ACT 29,30` · `BUG` · Playbook section 2.4

**O que foi pedido ao MCP:**

**Passo 1 — INSERT (campo novo):**
```
Tool: update_contact_field
Params: { "contactId": "aa6d04f2-...", "fieldId": "00000000-...-0011", "value": "_teste_valor" }
```
Resposta: `{ "id": "f3ab3cac-...", "value": "_teste_valor", "customFieldId": "...", "contactId": "..." }`

**Passo 2 — UPDATE (valor existente):**
```
Params: { "contactId": "aa6d04f2-...", "fieldId": "00000000-...-0011", "value": "_teste_valor_novo" }
```
Resposta: `{}` (vazio — operacao diferente, resposta diferente)

**Passo 3 — DELETE acidental (value vazio):**
```
Params: { "contactId": "aa6d04f2-...", "fieldId": "00000000-...-0011", "value": "" }
```
Resposta: `{}` (vazio — identica ao UPDATE)
Estado: junction row **deletada**. `get_contact` retorna `customFields: []`.

**Por que e bug:**
- 3 comportamentos distintos (INSERT/UPDATE/DELETE) no mesmo shape de input.
- Handler usa `if (!value) prisma.field.delete() else prisma.field.upsert()`. String vazia cai no branch DELETE.
- Frontend que faz `value: ""` pra "limpar campo" perde a relacao inteira.
- Response `{}` vazio nao distingue UPDATE de DELETE — client nao sabe o que aconteceu.

**Workaround:** Nunca enviar `value: ""`. Usar placeholder ou tratar na UI.

---

### #15 — `needsConfiguration` diverge entre `list_templates` e `get_template`
`ACT 32` · `BUG` · Playbook section 2.5

**O que foi pedido ao MCP:**
```
1. Tool: list_templates → Params: { "channelId": "11fb6dc1-..." }
   Resposta: template X com needsConfiguration: false

2. Tool: get_template → Params: { "templateId": "<id>", "channelId": "11fb6dc1-..." }
   Resposta: mesmo template X com needsConfiguration: true
```
Chamadas adjacentes, mesma sessao, mesmo template.

**Por que e bug:** Mesma entidade, dois valores opostos pra mesma flag. Frontend que usa `list_templates` pra decidir se mostra badge "precisa configurar" diverge do detalhe.

**Workaround:** Usar `get_template` como source of truth.

---

### #16 — `rejectedReason: null` em template REJECTED
`ACT 33` · `BUG` · Playbook section 2.5

**O que foi pedido ao MCP:**
```
Tool: create_template → criou template de teste
Tool: get_template_status → status: "REJECTED", rejectedReason: null
```

**Por que e bug:** Meta quase sempre retorna razao de rejeicao (TAG_CONTENT_MISMATCH, SCAM, INVALID_FORMAT). MCP nao mapeia ou pull aconteceu antes do Meta preencher.

---

### #17 — Status REJECTED nao volta pra PENDING apos `update_template`
`ACT 38` · `BUG` · Playbook section 2.5

**O que foi pedido ao MCP:**
```
1. Template REJECTED
2. Tool: update_template → { body: { text: "texto corrigido" } }
3. Tool: get_template_status → status: ainda REJECTED
```

**Por que e bug:** Meta nao re-enfileirou aprovacao apos o update. Hipoteses: Meta detecta conteudo similar e mantém REJECTED auto, ou handler nao chama endpoint Meta correto.

---

### #18 — `update_contact_field` retorna `{}` em UPDATE e DELETE
`ACT 30` · `BUG` · Playbook section 2.4

Detalhado no bug #14 acima. INSERT retorna row completa, mas UPDATE e DELETE retornam `{}` vazio — client nao distingue operacao.

---

## Info / Naming / Inconsistencias

### #19 — `TagsContacts` PascalCase
`ACT 12` · `get_contact`

Resposta: `{ "TagsContacts": [], "customFields": [] }` — dois campos irmao com naming diferente. `TagsContacts` e nome literal da tabela junction Prisma.

### #20 — Typo `instagramFollowBusinnes`
`ACT 13` · `get_contact`

Campo em producao: `instagramFollowBusinnes` (falta segundo `s`). Greps por `instagramFollowBusiness` falham. Renomear precisa migracao coordenada Prisma + MCP + front.

### #21 — `lastName: ""` em vez de `null`
`get_contact`

Contato com 1 palavra no nome retorna `{ "firstName": "Vinicius", "lastName": "" }`. `if (lastName)` avalia `true` pra string vazia. Logica de fullName concatena espaco trailing.

### #22 — Template response mistura snake_case + camelCase
`list_templates`, `get_template`

```json
{
  "parameter_format": "POSITIONAL",
  "is_primary_device_delivery_only": false,
  "components": [{ "type": "BODY", "example": { "body_text": [["Joao"]] } }],
  "wasSynced": true,
  "needsConfiguration": false,
  "internalId": "f8e633c9-..."
}
```
Campos Meta (snake) + campos internos (camel) no mesmo objeto. Sem normalizacao.

### #23 — `templateId` (Meta) vs `templateInternalId` (UUID) entre tools

| Tool | Param | Tipo de ID |
|---|---|---|
| `get_template`, `update_template`, `delete_templates` | `templateId` | Meta numeric string (`"1559135439076768"`) |
| `get_template_buttons` | `templateInternalId` | UUID interno (`"02c03855-7b6b-49e2-..."`) |

Frontend precisa carregar ambos os IDs via `list_templates` pra operar o mesmo template.

### #24 — `buttons[]` root sem `text` vs `components[].buttons[]` sem `id`
`get_template`

```json
{
  "components": [
    { "type": "BUTTONS", "buttons": [{ "type": "URL", "text": "Visitar", "url": "..." }] }
  ],
  "buttons": [
    { "id": "df6cc2d8-...", "type": "URL", "url": "...", "index": 0 }
  ]
}
```
Root tem `id` mas NAO tem `text`. Components tem `text` mas NAO tem `id`. Precisa join por `index` (nao por URL — duplicatas possiveis).

### #25 — `search_contacts.tags` vs `get_contact.TagsContacts`
`search_contacts` retorna `tags: ["tag1"]` (string[]). `get_contact` retorna `TagsContacts: [{ tagId, contactId }]` (object[]). Mesmo conceito, shapes incompativeis.

### #26 — `list_templates` envelope `status: true` conflita com `template.status`
`ACT 39` · Envelope retorna `{ data: [], status: true }` (boolean sucesso). Template tem `status: "APPROVED"` (string). Frontend que faz `response.status` pega o boolean, nao o status do template.

### #27 — `get_template_buttons` retorna APENAS QUICK_REPLY
Nome engana — tool e semanticamente "get QUICK_REPLY buttons for TEMPLATE trigger matching". Templates com URL/PHONE_NUMBER/COPY_CODE retornam:
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Template has no QUICK_REPLY buttons — TEMPLATE trigger only works with QUICK_REPLY buttons." } }
```

### #28 — `list_kanban_cards` shape condicional
Sem `columnId`: `{ kanban: { columns: [{ /* SEM cards */ }] } }`
Com `columnId`: `{ kanban: { columns: [{ /* COM cards[] */ }] }, kanbans: [{ /* meta extra */ }] }`
Frontend precisa N+1 calls (1 por coluna) pra kanban completo.

---

## Gaps de API (features ausentes no MCP)

### #29 — Galeria de midias nao exposta
`ACT 23`

**O que foi pedido:** "Crie um flow com bloco de mensagem com imagem"

**O que descobrimos:** Endpoint REST `GET /api/medias?filter=image` retorna `{ id, url, mimetype, name }[]` mas **nao tem tool MCP** equivalente. `configure_template_params` aceita `mediaId` mas sem rota pra listar os IDs disponiveis. Agente LLM precisa do usuario informar o mediaId manualmente.

### #30 — FOLLOW_UP routing nao configuravel
`ACT 22`

**O que foi pedido:** "Crie uma automacao com follow_up que redireciona para blocos diferentes se o usuario responder ou nao"

**O que descobrimos:** `add_step_follow_up` so aceita `duration/unit/channelId`. Campos `answerStepId` e `unanswerStepId` existem no banco e sao populados via UI, mas MCP nao os expoe no schema do builder. Testamos com magic strings `"answer"`/`"unanswer"` em `branchConnections` — `build_automation` aceita sem erro mas cria steps orfas.

### #31 — Audit `.emit()` pendente fora de CRM
`ACT 25`

Mesmo padrao de silent-fail (bug #3) pode existir em write tools de Tag, Contact, Template e Automation. Nao foi auditado via grep `\.emit(` nos handlers fora de CRM.

### #32 — `delete_templates` warnings nao testado
`ACT 40`

Schema docstring promete "Returns warnings if templates are used by automations". Nao testado com template em uso ativo (template do playbook era REJECTED, nunca vinculado a flow).

---

## Acoes imediatas (rotacao de credenciais)

Decorrentes do leak confirmado em conta de producao:

| # | ACT | Acao | STS |
|---|-----|------|-----|
| A1 | 14 | Rotacionar `openaiKey` Project da conta de prod | ABERTO |
| A2 | 14 | Rotacionar `elevenlabsKey` da conta de prod | ABERTO |
| A3 | 15 | Reset de senha do owner (`passwordHash` exposto) | ABERTO |
| A4 | 16 | Anular `longLivedAccessToken` Facebook do owner (ou aguardar expiracao) | ABERTO |
| A5 | 18 | Cleanup 2 cards orfaos na conta prod (criados por silent-fail do playbook) | ABERTO |

---

## Remediacao estrutural

| Fase | Escopo | Prazo sugerido | STS |
|------|--------|----------------|-----|
| **F1 — Hotfixes** | Whitelist em `get_moderators`, `get_assistants`, `get_contact`. `.emit()` defensivo em 5 CRM tools. Remover `topRanking` de `search_contacts` | Hoje | ABERTO |
| **F2 — Camada DTO** | Criar `chatfunnel-mcp/src/dto/` com funcoes `to*PublicDto()` pra cada entidade | Esta semana | ABERTO |
| **F3 — Prevencao** | Lint rule (proibir `JSON.stringify` direto de entidade Prisma em `*.tools.ts`). Snapshot tests do shape de retorno de cada tool | Proxima sprint | ABERTO |
| **F4 — Error handling** | Wrapper generico MCP que converte `PrismaClientKnownRequestError` em error envelopes padronizados. Padronizar idioma dos error messages | Proxima sprint | ABERTO |
| **F5 — Authorization** | Auditar que recurso alvo (card/contato/tag) pertence a `accountId` do caller em toda write tool. `.strict()` em todos os zod schemas | Proxima sprint | ABERTO |

---

## Referencias

- **Audit completo:** `docs/security/2026-04-30-mcp-data-leak-audit.md` (42 acoes, payloads redigidos)
- **Shapes MCP:** [[wiki/features/intelligence-a2a-shapes|intelligence-a2a-shapes]] (7 variantes de envelope write)
- **Fixtures JSON:** [[wiki/features/intelligence-a2a-fixtures|intelligence-a2a-fixtures]] (Demo Reference Flow + Lead Capture)
- **Frontend workarounds:** [[wiki/gotchas/frontend-gotchas|frontend-gotchas]] (silent-fail CRM, template partial-update, etc.)
- **Playbook fonte:** `scripts/mcp-prompts-playbook.md` (captura ao vivo com payloads)
- **Arquitetura v2:** [[wiki/features/intelligence-v2-arquitetura|intelligence-v2-arquitetura]] (mapper layer trata esses bugs no front)
