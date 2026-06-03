---
title: Intelligence (A2A) — Fixtures synthetic do MCP
description: JSON synthetic redigidos a partir de capturas reais do MCP em 2026-04-30. Use estas fixtures pra montar componentes Vue, escrever snapshot tests, documentar edge cases reais. Estrutura espelha producao; PII zerado.
tags: [features, intelligence, a2a, frontend, fixtures, mcp, types]
related: ["[[intelligence-a2a]]", "[[intelligence-a2a-shapes]]", "[[mcp-integration]]", "[[automations]]", "[[crm-kanban]]", "[[contacts]]"]
last_updated: 2026-05-04
---

# Intelligence (A2A) — Fixtures Synthetic

> Companion concreto de [[intelligence-a2a-shapes]]. Cada bloco eh um JSON real (estrutura preservada), com PII redigida (UUIDs zerados, nomes ficticios, telefones synthetic, URLs sanitizadas). Use **estas fixtures** ao montar componentes Vue, ao escrever snapshot tests, ou ao prototipar UI. Bugs em prod (typo `instagramFollowBusinnes`, `TagsContacts` PascalCase, `lastName: ""`, shape condicional, etc.) **estao preservados** intencionalmente.
>
> **Origem:** capturas em `scripts/mcp-prompts-playbook.md` (gitignored — contem PII real). Aqui o equivalente sanitizado pra repo.
>
> **Convencoes de redacao:**
> - UUIDs: `00000000-0000-0000-0000-000000000001` (incrementa o ultimo digito por entidade)
> - Nomes: `Maria Silva`, `João Santos`, `Pedro Almeida`, etc.
> - Telefones: `+55 11 99999-9999` (pretty) ou `5511999999999` (E.164 sem `+`) — preserva o formato real do campo
> - Emails: `<nome>@example.com`
> - URLs: `https://example.com/<path>` (substitui CDNs reais)
> - Datas: ISO 8601 UTC com `Z`, faixas plausiveis em 2026
> - Meta IDs: numeric strings de 16 digitos (`1234567890000001`)

---

## 1. `get_channels`

**Envelope:** array puro `[]`. Discriminator `allocatedType` define quais campos populam.

```json
[
  {
    "id": "00000000-0000-0000-0000-000000000001",
    "allocatedType": "WHATSAPP",
    "igName": null,
    "wppName": "Maria Silva",
    "wppNumber": "+55 11 99999-9999"
  },
  {
    "id": "00000000-0000-0000-0000-000000000002",
    "allocatedType": "INSTAGRAM",
    "igName": "marketing_brasil 💚",
    "wppName": null,
    "wppNumber": null
  },
  {
    "id": "00000000-0000-0000-0000-000000000003",
    "allocatedType": "INSTAGRAM",
    "igName": "loja_online_oficial",
    "wppName": null,
    "wppNumber": null
  },
  {
    "id": "00000000-0000-0000-0000-000000000004",
    "allocatedType": null,
    "igName": null,
    "wppName": null,
    "wppNumber": null
  }
]
```

**Observacoes pra componente:**
- Canal com `allocatedType: null` = canal orfao/desconectado. Estado valido. UI deve mostrar como "desconectado" com CTA pra reconectar
- `wppNumber` vem **pretty-printed** (com `+`, espacos, hifen). Se precisar do E.164 puro, sanitizar com `wppNumber.replace(/\D/g, '')`
- `igName` pode conter emoji/handle nao-ascii — usar `dir="auto"` no `<span>` pra renderizacao correta

---

## 2. `get_kanbans`

**Envelope:** array puro `[]`. Schema 100% estavel entre contas. Default sempre cria 2 columns ("Início" + "Concluído").

```json
[
  {
    "id": "00000000-0000-0000-0000-000000000010",
    "name": "Pipe de vendas",
    "accountId": "00000000-0000-0000-0000-0000000000A0",
    "isDeleted": false,
    "deletedAt": null,
    "columns": [
      {
        "id": "00000000-0000-0000-0000-000000000011",
        "kanbanId": "00000000-0000-0000-0000-000000000010",
        "name": "Início",
        "color": "#00DDD7",
        "position": 0,
        "isDone": false,
        "isDeleted": false,
        "deletedByUserId": null,
        "deletedByUserName": null
      },
      {
        "id": "00000000-0000-0000-0000-000000000012",
        "kanbanId": "00000000-0000-0000-0000-000000000010",
        "name": "Concluído",
        "color": "#009933",
        "position": 1,
        "isDone": true,
        "isDeleted": false,
        "deletedByUserId": null,
        "deletedByUserName": null
      }
    ]
  }
]
```

**Observacoes pra componente:**
- `column.isDone === true` = coluna terminal (fecha o card no workflow). Renderizar com badge "Concluído"
- Auditoria assimetrica: kanban tem `isDeleted/deletedAt`; column tem `isDeleted/deletedByUserId/deletedByUserName` (mais info)
- Cores `#00DDD7` (Início) e `#009933` (Concluído) sao defaults — UI custom pode usar paleta livre quando user cria column nova

---

## 3. `list_kanban_cards` — shape CONDICIONAL

⚠️ **Gotcha critico:** shape muda dependendo se `columnId` foi passado ou nao. Ver `frontend-gotchas.md`.

### 3.1 Sem `columnId` — sem cards em columns[]

```json
{
  "kanban": {
    "id": "00000000-0000-0000-0000-000000000010",
    "name": "Pipe de vendas",
    "accountId": "00000000-0000-0000-0000-0000000000A0",
    "isDeleted": false,
    "deletedAt": null,
    "columns": [
      {
        "id": "00000000-0000-0000-0000-000000000011",
        "kanbanId": "00000000-0000-0000-0000-000000000010",
        "name": "Início",
        "color": "#00DDD7",
        "position": 0,
        "isDone": false,
        "isDeleted": false,
        "deletedByUserId": null,
        "deletedByUserName": null
      },
      {
        "id": "00000000-0000-0000-0000-000000000012",
        "kanbanId": "00000000-0000-0000-0000-000000000010",
        "name": "Concluído",
        "color": "#009933",
        "position": 1,
        "isDone": true,
        "isDeleted": false,
        "deletedByUserId": null,
        "deletedByUserName": null
      }
    ]
  }
}
```

### 3.2 Com `columnId` — cards populados + `kanbans[]` extra no root

```json
{
  "kanban": {
    "id": "00000000-0000-0000-0000-000000000010",
    "name": "Pipe de vendas",
    "accountId": "00000000-0000-0000-0000-0000000000A0",
    "isDeleted": false,
    "deletedAt": null,
    "columns": [
      {
        "id": "00000000-0000-0000-0000-000000000011",
        "kanbanId": "00000000-0000-0000-0000-000000000010",
        "name": "Início",
        "color": "#00DDD7",
        "position": 0,
        "isDone": false,
        "isDeleted": false,
        "deletedByUserId": null,
        "deletedByUserName": null,
        "cards": [
          {
            "id": "00000000-0000-0000-0000-000000000020",
            "position": 2,
            "contactId": "00000000-0000-0000-0000-000000000030",
            "kanbanId": "00000000-0000-0000-0000-000000000010",
            "columnId": "00000000-0000-0000-0000-000000000011",
            "statusOportunity": "OPEN",
            "priority": "LOW",
            "createdAt": "2026-01-15T10:30:00.000Z",
            "isDeleted": false,
            "amount": 0,
            "hasActivity": true,
            "moderators": [
              {
                "user": {
                  "id": "00000000-0000-0000-0000-000000000040",
                  "name": "MARIA SILVA +55 (11) 99999-9999"
                }
              }
            ],
            "contact": {
              "id": "00000000-0000-0000-0000-000000000030",
              "name": "João Santos",
              "photo": null,
              "tags": []
            }
          }
        ]
      }
    ]
  },
  "kanbans": [
    {
      "id": "00000000-0000-0000-0000-000000000010",
      "name": "Pipe de vendas",
      "accountId": "00000000-0000-0000-0000-0000000000A0",
      "isDeleted": false,
      "deletedAt": null
    }
  ]
}
```

**Observacoes pra componente:**
- `position: 2` com APENAS 1 card no array — `position` nao eh compactado apos delete/move. Use pra ordenacao mas nao confie em sequencia continua (pode ter `position: 0, 5, 12`)
- `moderators[].user.name` carrega telefone **dentro do nome** (`"MARIA SILVA +55 (11) 99999-9999"`) — gotcha de PII. Pra display limpo, extrair so a parte alfabetica antes do primeiro digito
- `contact` (singular) eh embedding inline minimo — nao tem `email`/`phone`. Pra detalhes precisa `get_contact`
- `card` sem `title`/`description` — UI monta titulo a partir de `contact.name`. Sem campo livre pra anotacao
- Filtrar por column = N+1 calls pra carregar kanban inteiro com cards. Defensive coalesce: `kanban.columns[i].cards ?? []`

---

## 4. `list_templates`

**Envelope:** `{ data: [], status: true }`. Naming hibrido snake (Meta) + camel (nosso).

### 4.1 Conta com 2 templates (HEADER/FOOTER + BUTTONS-URL)

```json
{
  "data": [
    {
      "name": "boas_vindas_header",
      "parameter_format": "POSITIONAL",
      "components": [
        {
          "type": "HEADER",
          "format": "TEXT",
          "text": "Bem-vindo!"
        },
        {
          "type": "BODY",
          "text": "Olá {{1}}, estamos felizes em ter você aqui.",
          "example": {
            "body_text": [
              [
                "João"
              ]
            ]
          }
        },
        {
          "type": "FOOTER",
          "text": "Equipe Maria Silva"
        }
      ],
      "language": "pt_BR",
      "status": "PENDING",
      "category": "MARKETING",
      "is_primary_device_delivery_only": false,
      "id": "1234567890000001",
      "wasSynced": true,
      "needsConfiguration": false,
      "internalId": "00000000-0000-0000-0000-000000000050"
    },
    {
      "name": "promocao_botao_url",
      "parameter_format": "POSITIONAL",
      "components": [
        {
          "type": "BODY",
          "text": "Olá, {{1}} confira nossa promoção desta semana.",
          "example": {
            "body_text": [
              [
                "João"
              ]
            ]
          }
        },
        {
          "type": "BUTTONS",
          "buttons": [
            {
              "type": "URL",
              "text": "Visitar website",
              "url": "https://example.com/promo"
            }
          ]
        }
      ],
      "language": "pt_BR",
      "status": "APPROVED",
      "category": "MARKETING",
      "is_primary_device_delivery_only": false,
      "id": "1234567890000002",
      "wasSynced": true,
      "needsConfiguration": false,
      "internalId": "00000000-0000-0000-0000-000000000051"
    }
  ],
  "status": true
}
```

**Observacoes pra componente:**
- `id` (Meta numeric string 16 digitos) ≠ `internalId` (UUID nosso). Algumas tools usam um, outras o outro
- Snake/camel hibrido **no mesmo objeto** — usar mapper antes do store
- `components[].type` eh discriminator polimorfico (HEADER/BODY/FOOTER/BUTTONS, possivelmente outros)
- HEADER tem `format` (TEXT/IMAGE/VIDEO/DOCUMENT/LOCATION); FOOTER nao tem (so `text`)
- `example.body_text` eh array de arrays (matriz Meta) — extrair com `example.body_text[0]`

---

## 5. `get_template`

**Envelope:** `{ status: true, data: {...} }` (data eh **objeto** singular, nao array).

### 5.1 Template com BUTTONS-URL e SEM `assistantId`

```json
{
  "status": true,
  "data": {
    "name": "promocao_botao_url",
    "parameter_format": "POSITIONAL",
    "components": [
      {
        "type": "BODY",
        "text": "Olá, {{1}} confira nossa promoção desta semana.",
        "example": {
          "body_text": [
            [
              "João"
            ]
          ]
        }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          {
            "type": "URL",
            "text": "Visitar website",
            "url": "https://example.com/promo"
          }
        ]
      }
    ],
    "language": "pt_BR",
    "status": "APPROVED",
    "category": "MARKETING",
    "is_primary_device_delivery_only": false,
    "id": "1234567890000002",
    "internalId": "00000000-0000-0000-0000-000000000051",
    "needsConfiguration": false,
    "parameters": [
      {
        "componentType": "BODY",
        "componentFormat": "TEXT",
        "parameter": "1",
        "internalParameter": "name"
      }
    ],
    "buttons": [
      {
        "id": "00000000-0000-0000-0000-000000000060",
        "whatsappTemplateId": "00000000-0000-0000-0000-000000000051",
        "type": "URL",
        "url": "https://example.com/promo",
        "index": 0
      }
    ]
  }
}
```

### 5.2 Template com HEADER/FOOTER, COM `assistantId`, `buttons: []` vazio

```json
{
  "status": true,
  "data": {
    "name": "boas_vindas_header",
    "parameter_format": "POSITIONAL",
    "components": [
      {
        "type": "HEADER",
        "format": "TEXT",
        "text": "Bem-vindo!"
      },
      {
        "type": "BODY",
        "text": "Olá {{1}}, estamos felizes em ter você aqui.",
        "example": {
          "body_text": [
            [
              "João"
            ]
          ]
        }
      },
      {
        "type": "FOOTER",
        "text": "Equipe Maria Silva"
      }
    ],
    "language": "pt_BR",
    "status": "APPROVED",
    "category": "MARKETING",
    "is_primary_device_delivery_only": false,
    "id": "1234567890000001",
    "internalId": "00000000-0000-0000-0000-000000000050",
    "needsConfiguration": false,
    "parameters": [
      {
        "componentType": "BODY",
        "componentFormat": "TEXT",
        "parameter": "1",
        "internalParameter": "firstName"
      }
    ],
    "assistantId": "00000000-0000-0000-0000-000000000070",
    "buttons": []
  }
}
```

**Observacoes pra componente:**
- ⚠️ **`assistantId` eh AUSENTE** (nao `null`) quando template nao tem assistente vinculado. Use `'assistantId' in data` em vez de `data.assistantId !== null`
- `buttons: []` (array vazio) sempre presente em `get_template`, mesmo sem botoes
- ⚠️ **`buttons[]` redundante com `components[type=BUTTONS].buttons[]`** mas com fields diferentes:
  - Root `buttons[]`: tem `id` UUID, `whatsappTemplateId`, `index` mas **nao tem `text`**
  - `components[].buttons[]`: tem `text` mas nao tem `id`
  - Frontend faz join — match por URL eh fragil (duplicatas)
- `parameters[]` eh shape novo so em `get_template` (nao em `list_templates`)
- `internalParameter` eh editavel pelo user — varia por template (`name`, `firstName`, `customerName`, etc.)
- `wasSynced` (que existia em `list_templates[i]`) **nao existe** aqui — divergencia list-vs-get

---

## 6. `get_template_status`

**Envelope:** flat (sem wrap). Payload minimal otimizado pra polling.

### 6.1 APPROVED

```json
{
  "name": "promocao_botao_url",
  "status": "APPROVED",
  "category": "MARKETING",
  "rejectedReason": null,
  "qualityScore": null
}
```

### 6.2 REJECTED (synthetic guess — nao capturado em prod ainda)

⚠️ Shape baseado em conhecimento da Meta API — **falta validar com captura real**.

```json
{
  "name": "spam_template_exemplo",
  "status": "REJECTED",
  "category": "MARKETING",
  "rejectedReason": "INVALID_FORMAT",
  "qualityScore": "LOW"
}
```

**Observacoes pra componente:**
- `rejectedReason` e `qualityScore` ficam `null` quando APPROVED. Provavel populam em REJECTED/PAUSED
- `qualityScore` provavel enum `"HIGH" | "MEDIUM" | "LOW"` (Meta API standard)
- Tool ideal pra polling de status — payload minusculo

---

## 7. `get_template_buttons`

**Envelope dual:** array puro em sucesso, `{ error }` em validation error.

### 7.1 Success (template com QUICK_REPLY)

```json
[
  {
    "buttonId": "00000000-0000-0000-0000-000000000080",
    "text": "Sim",
    "type": "QUICK_REPLY",
    "index": 0
  }
]
```

### 7.2 Multi-button synthetic guess (nao capturado — corpus tem so 1 button)

⚠️ Estrutura inferida — falta validar com template QUICK_REPLY com 2-3 buttons.

```json
[
  {
    "buttonId": "00000000-0000-0000-0000-000000000080",
    "text": "Sim",
    "type": "QUICK_REPLY",
    "index": 0
  },
  {
    "buttonId": "00000000-0000-0000-0000-000000000081",
    "text": "Não",
    "type": "QUICK_REPLY",
    "index": 1
  },
  {
    "buttonId": "00000000-0000-0000-0000-000000000082",
    "text": "Mais informações",
    "type": "QUICK_REPLY",
    "index": 2
  }
]
```

### 7.3 Error — template sem QUICK_REPLY

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "type": "domain",
    "message": "Template has no QUICK_REPLY buttons — TEMPLATE trigger only works with QUICK_REPLY buttons."
  }
}
```

**Observacoes pra componente:**
- ⚠️ **`templateInternalId` eh o param**, nao `templateId` Meta — divergente de outras tools de template. Frontend precisa lookup `internalId` antes de chamar
- Tool name engana: `get_template_buttons` retorna **APENAS QUICK_REPLY**. URL/PHONE_NUMBER/COPY_CODE retornam erro
- ⚠️ `buttonId` (aqui) === `id` (em `get_template.buttons[]`) — mesmo conceito, nome diferente
- Sync com Meta nao eh automatico — apos editar template no UI, chamar `sync_templates` antes de `get_template_buttons`
- Shape de erro `{ error: { code, type, message } }` eh padrao do MCP pra todas as tools (em domain validations)

---

## 8. `search_contacts`

**Envelope:** `{ contacts: [], quantity: N, topRanking: [] }`. ⚠️ `topRanking` eh achado de seguranca CRITICO (vaza top contatos da conta inteira). Componente nao deve renderizar `topRanking` quando ha query — opcional renderizar como sugestao quando query eh vazia.

### 8.1 Resposta com 4 matches + topRanking

```json
{
  "contacts": [
    {
      "id": "00000000-0000-0000-0000-000000000090",
      "name": "Maria Silva",
      "photo": "https://example.com/photos/maria.jpg",
      "phone": null,
      "dateCreated": "2026-01-10T08:15:30.123Z",
      "email": null,
      "folder": null,
      "tags": [],
      "quantity": 36,
      "rating": 8.530805687203792
    },
    {
      "id": "00000000-0000-0000-0000-000000000030",
      "name": "João Santos",
      "photo": null,
      "phone": "5511999999999",
      "dateCreated": "2026-02-20T14:22:11.456Z",
      "email": null,
      "folder": null,
      "tags": [],
      "quantity": 9,
      "rating": 2.132701421800948
    },
    {
      "id": "00000000-0000-0000-0000-000000000091",
      "name": "Pedro Almeida",
      "photo": null,
      "phone": null,
      "dateCreated": "2026-03-05T11:00:00.000Z",
      "email": "pedro@example.com",
      "folder": null,
      "tags": [
        "lead-frio"
      ],
      "quantity": 0,
      "rating": 0
    },
    {
      "id": "00000000-0000-0000-0000-000000000092",
      "name": "Ana Paula Costa",
      "photo": null,
      "phone": "5521988887777",
      "dateCreated": "2026-03-12T16:45:00.000Z",
      "email": "ana.costa@example.com",
      "folder": "leads-q1",
      "tags": [],
      "quantity": 0,
      "rating": 0
    }
  ],
  "quantity": 139,
  "topRanking": [
    {
      "id": "00000000-0000-0000-0000-0000000000A1",
      "name": "Cliente VIP 1",
      "photo": "https://example.com/photos/vip1.jpg",
      "quantity": 422
    },
    {
      "id": "00000000-0000-0000-0000-0000000000A2",
      "name": "Cliente VIP 2",
      "photo": "https://example.com/photos/vip2.jpg",
      "quantity": 66
    },
    {
      "id": "00000000-0000-0000-0000-0000000000A3",
      "name": "Cliente VIP 3",
      "photo": "https://example.com/photos/vip3.jpg",
      "quantity": 42
    }
  ]
}
```

**Observacoes pra componente:**
- `quantity: 139` no envelope = total absoluto (nao filtrado pela query)
- Paginacao default = `limit: 20`. Use `page`/`limit` pra controlar
- ⚠️ **`tags: string[]` aqui** — em `get_contact` eh `TagsContacts: []` (PascalCase, shape diferente)
- `folder` aqui eh string nome (`"leads-q1"` ou `null`); em `get_contact` eh `folderId: UUID|null`
- `phone` em E.164 sem `+` — usar `phone.replace(/^/, '+')` se precisar do `+`
- `rating` eh float arbitrario nao-deterministico — score interno. **Nao** usar em comparacoes exatas (`=== 5`); use ordenacao
- ⚠️ **NAO renderizar `topRanking[]` quando ha query** — vaza top contatos da conta. Renderizar so como sugestao em UI sem search

---

## 9. `get_contact`

**Envelope:** flat. Shape ricamente populado com 30+ campos. ⚠️ Bugs em prod preservados: typo `instagramFollowBusinnes`, PascalCase `TagsContacts`.

### 9.1 Contato WhatsApp simples (`lastName: ""`, sem UTMs/Instagram)

```json
{
  "id": "00000000-0000-0000-0000-000000000030",
  "name": "João",
  "firstName": "João",
  "lastName": "",
  "photo": null,
  "email": null,
  "phone": "5511999999999",
  "instagramUsername": null,
  "instagramIsVerified": false,
  "instagramFollowerCount": 0,
  "instagramFollowBusinnes": false,
  "instagramFollow": false,
  "facebookId": null,
  "instagramId": null,
  "wppUserId": "BR.1500000000000001",
  "wppUsername": null,
  "wppCountryCode": null,
  "utmSource": null,
  "utmMedium": null,
  "utmCampaign": null,
  "utmTerm": null,
  "utmContent": null,
  "lastScheduleLink": null,
  "lastScheduleDate": null,
  "dateCreated": "2026-02-20T14:22:11.456Z",
  "userId": "00000000-0000-0000-0000-000000000040",
  "accountId": "00000000-0000-0000-0000-0000000000A0",
  "hasEdited": false,
  "wppLastUpdate": null,
  "igLastUpdate": null,
  "lastUpdate": "2026-04-29T22:11:01.511Z",
  "folderId": null,
  "fromPlatform": "WHATSAPP",
  "isDeleted": false,
  "deletedAt": null,
  "isActive": true,
  "TagsContacts": [],
  "customFields": []
}
```

### 9.2 Contato Instagram completo synthetic guess — nao capturado (faltam capturas com IG/UTMs/tags populadas)

⚠️ Shape inferido a partir do schema — **falta validar com captura real**. Estrutura preservada do exemplo 9.1, campos extras populados.

```json
{
  "id": "00000000-0000-0000-0000-000000000091",
  "name": "Maria Silva Almeida",
  "firstName": "Maria",
  "lastName": "Silva Almeida",
  "photo": "https://example.com/photos/maria.jpg",
  "email": "maria@example.com",
  "phone": "5521988887777",
  "instagramUsername": "maria.almeida",
  "instagramIsVerified": false,
  "instagramFollowerCount": 1543,
  "instagramFollowBusinnes": true,
  "instagramFollow": true,
  "facebookId": null,
  "instagramId": "17841400000000001",
  "wppUserId": null,
  "wppUsername": null,
  "wppCountryCode": null,
  "utmSource": "facebook",
  "utmMedium": "cpc",
  "utmCampaign": "promo-q1-2026",
  "utmTerm": null,
  "utmContent": "ad-variant-b",
  "lastScheduleLink": "https://example.com/schedule/abc123",
  "lastScheduleDate": "2026-04-20T10:00:00.000Z",
  "dateCreated": "2026-01-15T09:30:00.000Z",
  "userId": "00000000-0000-0000-0000-000000000040",
  "accountId": "00000000-0000-0000-0000-0000000000A0",
  "hasEdited": true,
  "wppLastUpdate": null,
  "igLastUpdate": "2026-04-25T18:00:00.000Z",
  "lastUpdate": "2026-04-29T20:00:00.000Z",
  "folderId": "00000000-0000-0000-0000-0000000000B0",
  "fromPlatform": "INSTAGRAM",
  "isDeleted": false,
  "deletedAt": null,
  "isActive": true,
  "TagsContacts": [
    {
      "tagId": "00000000-0000-0000-0000-0000000000C0",
      "contactId": "00000000-0000-0000-0000-000000000091"
    }
  ],
  "customFields": [
    {
      "fieldId": "00000000-0000-0000-0000-0000000000D0",
      "value": "Engenheira"
    }
  ]
}
```

**Observacoes pra componente:**
- ⚠️ **TYPO em prod**: `instagramFollowBusinnes` (sem segundo `s`). Tipar interface com nome errado pra match com API
- ⚠️ **PascalCase `TagsContacts`** vaza nome de tabela junction Prisma. Mapper deve renomear pra `tags` no store
- ⚠️ **`lastName: ""`** (string vazia) quando nome tem 1 palavra. Use `lastName?.trim() !== ''` pra detectar ausencia
- `firstName/lastName` eh split automatico do `name` — edge case 9.1 (`"João"` so) deixa `lastName: ""`
- 4 timestamps separados — `lastUpdate` parece sempre atualizado, os outros so quando ha sync da plataforma especifica
- `wppUserId` formato `BR.<numeric_id>` (country prefix + Meta ID)
- `fromPlatform` discriminator: `WHATSAPP` | `INSTAGRAM` | `FACEBOOK` (este ultimo nao confirmado)
- `userId === card.moderators[].user.id` (FK pra owner moderator)

---

## 10. `build_automation` — Lead Capture WhatsApp (realistic fixture)

> **Fixture realistica de `build_automation`** — caso de uso "captura de lead WhatsApp" com 2 triggers + 7 steps, dados reais (assistantId/kanbanId/tagIds existentes na conta), condicao semantica relevante (`email EXISTS`). Persistida na conta como flow **desativado** (`isActive: false`) pra ficar disponivel como referencia permanente.
>
> **Origem real:** `automationId: 63bd08ba-9e3d-4056-b1d8-070806341915` na conta `c1c4324a-...` (Vinicius Teider). Substitui a fixture anterior "Demo Reference Flow" (`a652d84a-...`), que foi deletada por ter dados inventados (placeholder URLs, condition `ddd=11` arbitraria, sequencias semanticamente erradas como ADD_TAG → REMOVE_TAG).
>
> **Cobertura:** 6 step types reais (MSG TEXT, ACTION ASSISTANT, ACTION ADD_TAG, DELAY, CONDITION, KANBAN ADD_CARD) + 2 trigger types (NEW_CONTACT + MESSAGE manual). FOLLOW_UP foi **omitido por gap conhecido do MCP** — schema do builder nao expoe `answerStepId`/`unanswerStepId` (ver [[intelligence-a2a-shapes]] secao 13.4).
>
> **UUIDs redigidos** seguindo a convencao da pagina (`00000000-0000-0000-0000-0000000000XX`):
> - `0001` = channelId WhatsApp
> - `0002` = kanbanId "pipe"
> - `0003` = columnId "Inicio" (entry column)
> - `0004` = assistantId (assistente real da conta com `lifecycleAutomations.inactivityFollowup` configurado nativamente — re-engaja por inatividade durante interacao com o assistant)
> - `0005` = tagId `_demo_qualified` (lead que forneceu email)
> - `0006` = tagId `_demo_needs_followup` (lead que nao qualificou)
> - `0007` = condition branch ID true (gerado client-side por `add_step_condition`)
> - `0008` = condition branch ID false / fallback (gerado client-side)
> - `0099` = automationId persistido (retornado por `build_automation`)

### 10.1 Cobertura

**Triggers (2):**
- `NEW_CONTACT` (WhatsApp) — todo novo contato dispara o flow de boas-vindas
- `MESSAGE` (WhatsApp) keyword `_demo_lead_start` — gatilho manual pra teste sem precisar criar contato

**Steps (7):**
- MSG TEXT (saudacao inicial pedindo nome/email)
- ACTION ASSISTANT START (deixa o assistant coletar dados; `lifecycleAutomations.inactivityFollowup` nativo do assistant re-engaja por inatividade)
- DELAY 30 minutos (janela de conversa pro assistant operar)
- CONDITION `email EXISTS` (qualificacao do lead)
- ACTION ADD_TAG `_demo_qualified` (branch true)
- KANBAN ADD_CARD em "Inicio" (terminal qualified)
- ACTION ADD_TAG `_demo_needs_followup` (terminal unqualified)

**Step types nao incluidos (e por que):**
- MSG TEMPLATE / MSG IMAGE — sem URL real / parameters mapping fora de escopo
- ACTION HTTP_REQUEST — sem webhook real
- ACTION REMOVE_TAG / DEFINE_OPTIN / REMOVE_OPTIN — sem caso semantico no funil de captura
- KANBAN MOVE_CARD / CHANGE_MODERATOR / WIN_CARD / LOSE_CARD — flow termina no ADD_CARD (entrada do funil)
- AB_TEST — split de variantes nao se aplica neste caso
- FOLLOW_UP — **gap conhecido do MCP**: builder nao expoe `answerStepId`/`unanswerStepId`. Inactivity follow-up real fica delegado ao `lifecycleAutomations` do assistant (step 1)
- RUN_AUTOMATION — sem flow secundario relevante
- CHAT_ACTION — sem caso de handoff manual de moderator

### 10.2 Estrutura do flow

```
trigger NEW_CONTACT (WhatsApp)         ─┐
trigger MESSAGE "_demo_lead_start"      ─┤  (ambos chegam em step 0)
                                          ↓
step 0: MSG TEXT — saudacao + pedido de nome/email
                                          ↓
step 1: ACTION ASSISTANT START
        (assistant assume conversa; lifecycleAutomations.inactivityFollowup
         nativo re-engaja apos N min de silencio)
                                          ↓
step 2: DELAY 30 min — espera janela de conversa terminar
                                          ↓
step 3: CONDITION `email EXISTS`
        ├─ branch true (0007) → step 4
        └─ branch false (0008) → step 6

caminho TRUE:  4 ADD_TAG `_demo_qualified` → 5 KANBAN ADD_CARD "Inicio" (terminal)
caminho FALSE: 6 ADD_TAG `_demo_needs_followup` (terminal)
```

### 10.3 Payload completo do `build_automation` (sanitized)

```json
{
  "name": "Lead Capture WhatsApp",
  "trigger": {
    "_mcpType": "trigger",
    "type": "NEW_CONTACT",
    "platform": "WHATSAPP",
    "name": "Trigger NEW_CONTACT"
  },
  "triggers": [
    {
      "config": {
        "_mcpType": "trigger",
        "type": "NEW_CONTACT",
        "platform": "WHATSAPP",
        "name": "Trigger NEW_CONTACT"
      }
    },
    {
      "config": {
        "_mcpType": "trigger",
        "type": "MESSAGE",
        "platform": "WHATSAPP",
        "channelId": "00000000-0000-0000-0000-000000000001",
        "name": "Trigger Manual Test",
        "conditions": {
          "match": "EXACTLY",
          "keywords": ["_demo_lead_start"]
        }
      }
    }
  ],
  "steps": [
    {
      "step": {
        "_mcpType": "step_message",
        "platform": "WHATSAPP",
        "messages": [
          { "type": "TEXT", "text": "Olá! Sou o assistente do ChatFunnel. Pra começarmos, me conta seu nome e email." }
        ]
      },
      "connectTo": 1
    },
    {
      "step": {
        "_mcpType": "step_action",
        "actionType": "ASSISTANT",
        "assistantConfig": {
          "assistantId": "00000000-0000-0000-0000-000000000004",
          "action": "START"
        }
      },
      "connectTo": 2
    },
    {
      "step": {
        "_mcpType": "step_delay",
        "duration": 30,
        "unit": "MINUTES",
        "type": "DURATION"
      },
      "connectTo": 3
    },
    {
      "step": {
        "_mcpType": "step_condition",
        "branches": [
          {
            "matchType": "ALL",
            "conditions": [{ "field": "email", "operator": "EXISTS" }]
          },
          {
            "matchType": "ALL",
            "conditions": []
          }
        ],
        "branchIds": [
          "00000000-0000-0000-0000-000000000007",
          "00000000-0000-0000-0000-000000000008"
        ]
      },
      "branchConnections": [
        { "branchId": "00000000-0000-0000-0000-000000000007", "stepIndex": 4 },
        { "branchId": "00000000-0000-0000-0000-000000000008", "stepIndex": 6 }
      ]
    },
    {
      "step": {
        "_mcpType": "step_action",
        "actionType": "ADD_TAG",
        "tagIds": ["00000000-0000-0000-0000-000000000005"]
      },
      "connectTo": 5
    },
    {
      "step": {
        "_mcpType": "step_kanban",
        "actionType": "ADD_CARD",
        "kanbanId": "00000000-0000-0000-0000-000000000002",
        "columnId": "00000000-0000-0000-0000-000000000003"
      }
    },
    {
      "step": {
        "_mcpType": "step_action",
        "actionType": "ADD_TAG",
        "tagIds": ["00000000-0000-0000-0000-000000000006"]
      }
    }
  ]
}
```

### 10.4 Resposta de `build_automation` (envelope com stats — 9ª variante write)

```json
{
  "success": true,
  "automationId": "00000000-0000-0000-0000-000000000099",
  "stepCount": 7,
  "triggerCount": 2,
  "triggerTypes": ["NEW_CONTACT", "MESSAGE"],
  "message": "Automation created successfully"
}
```

### 10.5 Notas de uso

- **`trigger` E `triggers` ambos no payload** — schema do `build_automation` exige `trigger` (singular) como required, e usa `triggers[]` quando presente pra multi-trigger. Em pratica, o servidor parece consumir `triggers[]` quando enviado.
- **`_mcpType` em cada config** — discriminator obrigatorio injetado pelos builders. Sem ele, `build_automation` rejeita.
- **`branchIds` / `variantIds` UUIDs gerados client-side** pelos builders `add_step_condition` / `add_step_ab_test` antes do persist. Usados depois em `branchConnections` pra rotear branches/variants.
- **`connectTo: <stepIndex>`** define link linear; **steps terminais** (19 RUN_AUTOMATION e 21 REMOVE_MODERATOR) **omitem** `connectTo`.
- **Re-convergencia de branches**: step 8 (HTTP_REQUEST, branch true) e step 11 (REMOVE_OPTIN, branch false) ambos `connectTo: 12` — caminhos paralelos voltam ao tronco principal.

### 10.6 Bugs e gaps conhecidos relevantes pra esta fixture

(documentados em [[intelligence-a2a-shapes]] secao 13.4)

- **Gap MCP — FOLLOW_UP routing nao configuravel**: motivo pelo qual esta fixture **nao usa** FOLLOW_UP step. Schema do `add_step_follow_up` so aceita `duration`/`unit`/`channelId`; nao expoe `answerStepId`/`unanswerStepId` (campos no banco populaveis via UI). Pra inactivity follow-up real, esta fixture delega ao `lifecycleAutomations.inactivityFollowup` do assistant (step 1 ACTION ASSISTANT START — ele tem config nativa que dispara automations secundarias por inatividade).
- **Bug `build_automation` silent-fail em `branchConnections` invalido**: caso voce tente passar `branchId` com magic string (ex: `"answer"`/`"unanswer"`) pra rotear FOLLOW_UP, o servidor aceita silenciosamente sem retornar erro mas **nao seta os fields**, e os step indices referenciados ficam orfaos no banco.
- **Order do array `steps[]` nao-deterministica**: apos `get_automation` no flow criado, a ordem do array `steps[]` no read **nao matches** o input order. Frontend reconstroi via `firstStepId` + `nextStepId` + `stepsConditions[].nextStepConditionAcceptedId` (pra branches CONDITION).
- **`useRequest: false` orfao**: campo aparece como `false` em todo step ACTIONS (incluindo o ASSISTANT desta fixture). Pode ser flag legacy.
- **Defaults orfaos em triggers**: trigger NEW_CONTACT no read traz `commentsPubReelsChoise: "ANY_PUB_REELS"`, `storyChoise: "ANY_STORIES"`, `storyMentionActivateMode: "ALWAYS"`, `firstCommentOnly: true` populados — defaults injetados independentemente do `triggerType`. UI deve filtrar.

### 10.7 Como reusar esta fixture

Pra reproduzir esta automation em outra conta:

1. Substituir UUIDs `00000000-...-0000000000XX` pelos IDs reais dessa conta:
   - `0001` → channelId WhatsApp da conta alvo (capturar via `get_channels`)
   - `0002` / `0003` → kanbanId + columnId entry (via `get_kanbans`)
   - `0004` → assistantId (via `get_assistants`)
   - `0005` → tagId `_demo_qualified` (criar via `create_tag` ou usar tag existente que represente "lead qualificado")
   - `0006` → tagId `_demo_needs_followup` (criar via `create_tag` ou usar tag existente que represente "lead nao qualificado")
   - `0007` / `0008` → **NAO substituir** — sao UUIDs gerados client-side pelo `add_step_condition`. Rodar o builder previamente pra gerar IDs frescos e usar nos `branchConnections`.
2. Rodar 2× `create_trigger` + 7× `add_step_*` em paralelo pra coletar configs com `_mcpType`.
3. Rodar `build_automation` com o payload final.
4. **Recomendado**: chamar `toggle_automation` logo apos pra deixar `isActive: false` e evitar disparos. NEW_CONTACT trigger especialmente perigoso porque dispara pra **todo novo contato** da conta.

**Customizacoes comuns:**

- **Adicionar inactivity follow-up real**: configure manualmente via UI o `lifecycleAutomations.inactivityFollowup` do assistant (`0004`) — aponta pra outras automations que disparam apos N minutos de inatividade durante a interacao com o assistant. MCP nao expoe ainda.
- **Trocar condicao de qualificacao**: alem de `email EXISTS`, operadores uteis sao `phone EXISTS`, `tag EXISTS qualified`, `customFields.utm_source EQUALS "google"`. Lista completa de operadores em [[intelligence-a2a-shapes]] secao 13.3.
- **Adicionar mod assignment apos KANBAN ADD_CARD**: incluir step CHAT_ACTION CHANGE_MODERATOR antes do terminal pra atribuir a conversa a um moderator especifico.

---

## 11. Mapeamento fixture -> componente Vue

Sugestao de uso direto destas fixtures em components:

```ts
// Em test
import channelsFixture from '@/fixtures/get_channels.json';
import { mount } from '@vue/test-utils';
import ChannelList from '@/components/channels/ChannelList.vue';

it('renders WHATSAPP channel with phone formatted', () => {
  const wrapper = mount(ChannelList, {
    props: { channels: channelsFixture }
  });
  expect(wrapper.text()).toContain('Maria Silva');
  expect(wrapper.text()).toContain('+55 11 99999-9999');
});

it('renders orphan channel with reconnect CTA', () => {
  const orphan = channelsFixture.filter(c => c.allocatedType === null);
  expect(orphan.length).toBeGreaterThan(0);
});
```

Idealmente, mover as fixtures `.json` para `chatfunnel-front/src/fixtures/intelligence-a2a/` ou `chatfunnel-mcp/test/fixtures/` pra serem importaveis por TS direto. Esta wiki documenta a estrutura — codigo deve consumir `.json`.

---

## 12. Fixtures que ainda **faltam** capturar em prod

Lista mantida em sync com [[intelligence-a2a-shapes]] secao 12.8. Marcadas como "synthetic guess" acima onde ja inferi shape. Capturas reais devem substituir as inferencias quando disponiveis:

- ~~`template.status: REJECTED`~~ ✅ capturado 2026-05-04 rodada 2 (template `_teste_intelligence_template`); ainda faltam `PAUSED`, `DISABLED`
- `template.parameter_format: NAMED`
- `template.components[type=HEADER].format: IMAGE`, `VIDEO`, `DOCUMENT`, `LOCATION`
- `template.components[type=BUTTONS].buttons[].type: PHONE_NUMBER`, `COPY_CODE`, `OTP`
- `template.parameters[].componentType: HEADER`, `BUTTONS` (corpus tem so BODY)
- Template com 2-3 QUICK_REPLY buttons (validar `index` 0/1/2)
- ~~`card.statusOportunity: WON`, `LOST`~~ ✅ capturado 2026-05-04 rodada 2 (Section 2.6 CRM via silent-fail)
- ~~`card.priority: MEDIUM`, `HIGH`, `LOW`~~ ✅ enum 100% fechado — MEDIUM/HIGH rodada 1, LOW rodada 2 workflow C
- Card com `amount > 0` (campo monetario)
- Card com multiplos moderators (rodada 2 capturou 1 moderator com shape `moderators[].user.{id, name}` — multi ainda gap)
- Card com tags populadas em `contact.tags`
- ~~`contact.fromPlatform: INSTAGRAM`~~ ✅ capturado 2026-05-04 rodada 2 (workflow A — Vinicius Almeida Lima `be498c75-...`); ainda falta `FACEBOOK`
- `contact` com `TagsContacts: [{ tagId, contactId }]` populado (shape do junction object)
- ~~`contact` com `customFields: [{ fieldId, value }]` populado~~ ✅ capturado 2026-05-04 (Section 2.4 + stress test, contato `aa6d04f2-...`)
- ~~`step.stepType: MESSAGE`, `CONDITION`, `DELAY`, `AB_TEST`, `CHAT_ACTION`, `KANBAN`, `RUN_AUTOMATION`~~ ✅ todos 7 capturados em Section 2.8 builder + INSTAGRAM_ACTIONS em rodada 2
- `get_agents_v2` com agentes V2 reais populados
- ~~`mcp_error.code`~~ ⚠️ parcialmente capturado em rodada 2: `NOT_FOUND` (6 variantes), `VALIDATION_ERROR`, `INTERNAL_ERROR` (3 sub-tipos: `.emit()` bug, Prisma stack leak, i18n key raw). Ainda gap: `CONFLICT`, `FORBIDDEN`, `RATE_LIMIT`, `EXTERNAL_API_ERROR`.

> Quando capturar qualquer um destes, atualizar fixture aqui + remover da lista + atualizar `intelligence-a2a-shapes.md` 12.8.

## 12.1 Fixtures novas disponiveis pra adicionar (capturadas 2026-05-04 rodada 2)

Captura real, payloads completos no `scripts/mcp-prompts-playbook.md`. **Ainda nao convertidos pra fixtures sanitized aqui** — TODO de rodada futura:

- **`create_template` + `update_template`** (Section 2.5): envelope `{success, id}` (8ª variante write); template REJECTED com `previous_category`; bug partial-update deleta components; bug category default MARKETING.
- **`delete_templates`** (Section 2.5): envelope `{deleted: true}` (9ª variante write); cleanup instantaneo (nao scheduled).
- **`configure_template_params` em REJECTED + destrutivo `parameters: []`**: `needsConfiguration` flag dinamica; comportamento defensivo (so reseta `internalParameter`, nao deleta metadata).
- **`get_template_buttons` rejection** (Workflow D): `VALIDATION_ERROR/domain` quando template nao tem QUICK_REPLY.
- **`INSTAGRAM_ACTIONS` step shape** (Section 2.8 / 2.9): shape pos-build com `flowType: TEXT` + `channelId` IG persistido (diferente do bug TEMPLATE flowType WhatsApp onde channelId vem null).
- **CRM silent-fail patterns** (Section 2.6): cards em estados OPEN/WON/LOST com `priority` LOW/HIGH e `hasActivity: true|false`. `moderators[].user.{id, name}` com phone embedado (PII leak audit 4.8).
- **Error envelope variants** (Section 2.9 stress test):
  - `mcp_error.code: "NOT_FOUND"` em 6 cenarios (3 idiomas: EN, PT-BR, i18n key raw)
  - `mcp_error.type: "domain" | "internal"` discriminator
  - `INTERNAL_ERROR` com Prisma stack vazando (audit 4.13)
  - `INTERNAL_ERROR` com `.emit()` bug em 5/5 CRM tools (audit 4.11 critica)
  - i18n key raw `errors.Automation.ErrorOnGetAutomations` em `get_automation` NOT_FOUND (audit 4.12)
- **`update_contact_field` 3 comportamentos** (Section 2.4 stress): INSERT (row), UPDATE (`{}`), DELETE quando value="" (`{}`). Variante 5 do envelope catalog quebra em 5a/5b.
- **`list_kanban_cards` shape inconsistente com vs sem `columnId`** (Section 2.6): sem filtro `{kanban: {metadata}}`; com filtro `{kanban: {columns: [{cards}]}, kanbans: [...]}`.

> Estes payloads ja estao no playbook (gitignored) com PII real. Quando converter pra fixtures aqui, **redact UUIDs reais**, substituir por placeholders `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` ou `<contact-uuid-1>`, e remover qualquer phone/email/secret de prod.

---

## 13. Referencias

- Shapes consolidados: [[intelligence-a2a-shapes]] secao 12
- Gotchas frontend: `vault/wiki/gotchas/frontend-gotchas.md`
- Audit de seguranca: `docs/security/2026-04-30-mcp-data-leak-audit.md`
- Corpus completo (gitignored, com PII real): `scripts/mcp-prompts-playbook.md`
- Tools MCP: `chatfunnel-mcp/src/mcp/tools/*.ts`
