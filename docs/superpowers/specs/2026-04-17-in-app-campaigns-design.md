# In-app Campaigns — Design Spec

**Status:** Draft for review
**Date:** 2026-04-17
**Author:** Lucas Brito (brainstorming + design)
**Repo(s) impactado(s):** `chatfunnel-services`, `chatfunnel-front`, `chatfunnel-database`
**Substitui:** `docs/features/in-app-announcements/in-app-announcemetns.md` (typo no nome; renomear para `in-app-campaigns/`)

---

## 1. Visão geral

Sistema de modais dinâmicos exibidos após a seleção de organização para usuários do ChatFunnel. Permite à equipe da plataforma criar campanhas com formulários, coletar respostas estruturadas e medir conversão.

> **Trigger:** ativa quando `authStore.currentAccount` está setado (montagem do `FullLayout.vue`), não no login cru. Se o usuário trocar de organização, a elegibilidade é re-avaliada para o novo `accountId`.

**Pedido inicial (CEO):** prioridade é o *dynamic form*. Announcement e confirmation virão como presets do mesmo motor em v1.1.

### Objetivos

- Coletar dados de usuários (segmentação, feedback, NPS, aceite de termos) via modal pós-seleção de organização.
- Oferecer à equipe ChatFunnel uma ferramenta self-service de criação, publicação e análise de campanhas.
- Rastrear exibição, dispensa e submissão por usuário com integridade multi-tenant.
- Base arquitetural reaproveitável para futuros tipos de modal (announcement, confirmation).

### Não-objetivos (não entra no projeto)

- Mensagens dirigidas a contatos/leads do funil (end-users via WhatsApp). Só atinge **usuários** logados no dashboard.
- Comunicação em tempo real por push (WebSocket) no MVP — usuário só vê campanha nova na próxima entrada na organização.
- A/B testing, segmentação comportamental, i18n de conteúdo, upload de arquivo.
- Substituir o sistema existente de `systemNotifications` (lista de notificações read-only). São sistemas distintos e complementares.

---

## 2. Glossário

| Termo | Definição |
|---|---|
| Campanha (campaign) | Entidade que reúne conteúdo (form_schema), regras de exibição e público-alvo. |
| Organização / Account | Tenant do ChatFunnel (empresa cliente). Um usuário pertence a uma account. |
| User state | Registro do estado de uma campanha para um usuário específico. |
| Resposta (response) | Conjunto de valores submetidos pelo usuário no form de uma campanha. |
| Field key | Identificador estável e imutável de um campo do form (ex: `segmento`). |
| Option value | Identificador estável e imutável de uma opção dentro de um campo (ex: `varejo`). |
| First shown | Momento em que *qualquer* usuário vê a campanha pela primeira vez. Trava edições estruturais. |
| Resolution mode | Regra de interação com o modal (`dismiss_or_complete` | `complete_only`). |
| Frequency mode | Regra de reaparecimento por usuário (`showOnce` | `untilDismissed` | `untilCompleted`). |

---

## 3. Atores e permissões

| Ator | Acesso |
|---|---|
| Equipe ChatFunnel (superadmin / admin da plataforma) | CRUD de campanhas via `adminTools` em `chatfunnel-front`. Não recebe campanhas. |
| Usuário final (membro de uma org) | Vê modais elegíveis ao entrar numa organização (pós-seleção); responde/dispensa. |
| Sistema (scheduler) | N/A no MVP. v1.1 pode ativar/arquivar campanhas por `start_at`/`end_at`. |

---

## 4. Escopo

### 4.1 MVP (v1.0)

**Motor / tipos de modal**
- Componente único de modal dinâmico.
- Apenas *dynamic form* no MVP.

**Form builder (admin)**
- Tipos de campo: `text`, `textarea`, `email`, `number`, `select`, `radio`, `checkbox`, `rating`, `hidden`.
- Validação: `required`, `min`, `max`, `regex`, `email`.
- Preview antes de publicar.
- Duplicar campanha existente.

**Campanhas (admin)**
- CRUD completo com invariantes (ver §8).
- Targeting: `all` / por plano / lista de org_ids / role do usuário.
- Scheduling: `start_at` / `end_at` opcionais.
- Frequência: `showOnce` / `untilDismissed` / `untilCompleted`.
- Resolution: `dismiss_or_complete` / `complete_only`.
- Status: `draft` / `active` / `paused` / `archived`.

**Runtime (usuário)**
- Modal montado em `FullLayout.vue`; dispara quando `authStore.currentAccount` está setado (pós-seleção de org, não no login cru).
- Fila de múltiplas campanhas elegíveis (uma por vez, `created_at DESC`).
- Tracking: `shown` / `dismissed` / `completed` com timestamps.
- Respeita `resolution_mode` e `frequency_mode`.

**Relatórios (admin)**
- Por campanha: `shown_total`, `dismissed_total`, `completed_total`, `submissions_total`, taxa de conversão (completed/shown).
- Distribuição de respostas por opção (select/radio/checkbox/rating).
- Export CSV síncrono (limite 10k linhas).

### 4.2 v1.1 (roadmap)

- Presets announcement (form sem campos) e confirmation (campo booleano implícito).
- Campo `date` / `datetime`, campos condicionais, multi-step/wizard.
- Push em tempo real via WebSocket.
- Export CSV assíncrono (BullMQ).

### 4.3 Fora de escopo

Upload de arquivo, salvar-e-retomar, A/B test, i18n de form, relatórios cross-campanha, integrações externas (Slack/email), triggers adicionais além da seleção de organização.

---

## 5. UX / comportamento do modal

### 5.1 Resolution mode

| Valor | Comportamento |
|---|---|
| `dismiss_or_complete` | Modal tem botão ✕/"Fechar" e botão de submit. Usuário pode dispensar ou completar. |
| `complete_only` | Modal sem ✕, sem click-outside (Vuetify `persistent`). Bloqueia a UI até completar. |

### 5.2 Frequency mode

| Valor | Comportamento |
|---|---|
| `showOnce` | Mostrado uma vez. Depois nunca mais, mesmo sem submit/dismiss explícito. Estado final = `shown`. |
| `untilDismissed` | Reaparece a cada entrada na organização até o usuário dispensar explicitamente. Estado final = `dismissed`. |
| `untilCompleted` | Reaparece a cada entrada na organização até submeter. Dispensar não resolve. Estado final = `completed`. |

### 5.3 Combinações válidas

- `showOnce` × `dismiss_or_complete` ✅
- `showOnce` × `complete_only` ✅ (se não completar, não volta — aceitamos)
- `untilDismissed` × `dismiss_or_complete` ✅
- `untilDismissed` × `complete_only` ❌ (impossível dispensar se não pode fechar)
- `untilCompleted` × `dismiss_or_complete` ✅ (dispensa por sessão, volta na próxima entrada na org)
- `untilCompleted` × `complete_only` ✅ (form obrigatório)

Invariantes enforçadas no service (ver §8).

### 5.4 Fila de campanhas

- `/pending` retorna array ordenado por `created_at DESC`.
- Front exibe a primeira; ao resolver (dismiss/completed), tira da fila e mostra a próxima.
- Com duas abas abertas: cada aba pode mostrar em ordem diferente. Aceitável — `UNIQUE (campaign_id, user_id)` em `user_states` garante integridade.

---

## 6. Modelo de domínio

### 6.1 Entidades

```
InAppCampaign (agregado raiz)
  id, title, description
  formSchema: FormSchema
  frequencyMode, resolutionMode
  startAt, endAt
  status, targeting
  firstShownAt
  createdBy, createdAt, updatedAt, archivedAt

InAppCampaignUserState
  id, campaignId, userId, accountId
  status
  firstShownAt, lastShownAt, timesShown
  dismissedAt, completedAt, submittedAt

InAppCampaignResponseValue
  id, userStateId, campaignId, accountId
  fieldKey, fieldType
  valueText, valueNumber, valueBool, valueJson
  submittedAt, createdAt
```

### 6.2 Value objects

```
FormSchema     = { fields: FormField[] }
FormField      = {
  key: string,            // estável, imutável pós-save
  type: 'text'|'textarea'|'email'|'number'|'select'|'radio'|'checkbox'|'rating'|'hidden',
  label: string,          // cosmético, editável
  helpText?: string,      // cosmético, editável
  required?: boolean,
  validation?: { min?, max?, regex?, message? },
  options?: FormOption[], // apenas select/radio/checkbox
  prefill?: 'userId' | 'accountId' | 'userEmail' | ... // apenas hidden
}
FormOption     = { value: string /* estável */, label: string /* cosmético */ }
Targeting      = { mode: 'all' | 'filter', plans: string[], orgIds: uuid[], userRoles: string[] }
```

---

## 7. Modelo de dados (PostgreSQL / Prisma)

### 7.1 `in_app_campaigns`

| Coluna | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| title | TEXT NOT NULL | |
| description | TEXT NULL | Markdown ou HTML sanitizado |
| form_schema | JSONB NOT NULL | Shape em §6.2 |
| frequency_mode | TEXT NOT NULL | enum: showOnce/untilDismissed/untilCompleted |
| resolution_mode | TEXT NOT NULL | enum: dismiss_or_complete/complete_only |
| start_at | TIMESTAMPTZ NULL | |
| end_at | TIMESTAMPTZ NULL | |
| status | TEXT NOT NULL | enum: draft/active/paused/archived |
| target_mode | TEXT NOT NULL | enum: all/filter |
| target_plans | TEXT[] NOT NULL DEFAULT '{}' | |
| target_org_ids | UUID[] NOT NULL DEFAULT '{}' | |
| target_user_roles | TEXT[] NOT NULL DEFAULT '{}' | |
| first_shown_at | TIMESTAMPTZ NULL | Set pelo service ao inserir 1º `user_state` |
| created_by | UUID NOT NULL | FK user (admin ChatFunnel) |
| created_at | TIMESTAMPTZ NOT NULL | |
| updated_at | TIMESTAMPTZ NOT NULL | |
| archived_at | TIMESTAMPTZ NULL | |

**Índices**:
- `(status, start_at, end_at)` — query de ativas no `/pending`
- GIN em `target_plans`, `target_org_ids`, `target_user_roles` — matching de targeting
- `(archived_at)` partial index

### 7.2 `in_app_campaign_user_states`

| Coluna | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| campaign_id | UUID NOT NULL FK → campaigns(id) ON DELETE CASCADE | |
| user_id | UUID NOT NULL | |
| account_id | UUID NOT NULL FK → accounts(id) | snapshot no momento do show |
| status | TEXT NOT NULL | enum: shown/dismissed/completed |
| first_shown_at | TIMESTAMPTZ NOT NULL | |
| last_shown_at | TIMESTAMPTZ NOT NULL | |
| times_shown | INT NOT NULL DEFAULT 1 | |
| dismissed_at | TIMESTAMPTZ NULL | |
| completed_at | TIMESTAMPTZ NULL | |
| submitted_at | TIMESTAMPTZ NULL | |

**Constraints**:
- `UNIQUE (campaign_id, user_id)`
- `CHECK (status IN ('shown','dismissed','completed'))`

**Índices**:
- `(campaign_id, status)` — relatórios
- `(user_id, status)` — filtro por usuário

### 7.3 `in_app_campaign_response_values`

| Coluna | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| user_state_id | UUID NOT NULL FK → user_states(id) ON DELETE CASCADE | |
| campaign_id | UUID NOT NULL | denormalizado |
| account_id | UUID NOT NULL | denormalizado |
| field_key | TEXT NOT NULL | |
| field_type | TEXT NOT NULL | espelha `FormField.type` |
| value_text | TEXT NULL | |
| value_number | NUMERIC NULL | |
| value_bool | BOOLEAN NULL | |
| value_json | JSONB NULL | reservado para campos compostos (v1.1+) |
| submitted_at | TIMESTAMPTZ NOT NULL | denormalizado de user_states |
| created_at | TIMESTAMPTZ NOT NULL | |

**Índices**:
- `(campaign_id, field_key, value_text)` — distribuição por opção em select/radio/checkbox
- `(campaign_id, field_key, value_number)` — distribuição rating/number
- `(campaign_id, account_id, field_key)` — cross org/plano
- `(user_state_id)` — montar resposta completa
- `(submitted_at)` — séries temporais

### 7.4 Storage de valores por tipo de campo

| Tipo do campo | Coluna preenchida | Rows por resposta |
|---|---|---|
| text, textarea, email, hidden | `value_text` | 1 |
| select, radio | `value_text` (= `option.value` estável) | 1 |
| checkbox | `value_text` (= `option.value`) | N (uma por opção marcada, mesmo `field_key`) |
| number | `value_number` | 1 |
| rating | `value_number` | 1 |

---

## 8. Invariantes (service layer)

1. `frequency_mode='untilDismissed' ⇒ resolution_mode='dismiss_or_complete'`.
2. `resolution_mode='complete_only' ⇒ frequency_mode ∈ {showOnce, untilCompleted}`.
3. `first_shown_at IS NOT NULL ⇒` edições estruturais bloqueadas. Permitidos apenas cosméticos:
   - `title`, `description`
   - por campo: `label`, `helpText`, `validation.message`
   - por opção: `label`
   - **NÃO** podem mudar: field `key`, field `type`, `options.value`, add/remove de campos, add/remove de opções, `validation` numérica/regex.
4. Publicar (`status='draft' → 'active'`) exige `form_schema` validado (pelo menos 1 campo; tipos válidos; opções não vazias em select/radio/checkbox).
5. `start_at` e `end_at`: se ambos presentes, `start_at < end_at`.
6. Field `key` único dentro de uma campanha; option `value` único dentro de um campo.
7. `archived_at` só pode ser setado a partir de `status = 'paused'` ou `'active'` (não arquiva draft).

---

## 9. Targeting e elegibilidade

### 9.1 Matching de targeting

Para um usuário com `accountId`, `accountPlan`, `userRole`:

```sql
SELECT * FROM in_app_campaigns c
WHERE c.status = 'active'
  AND (c.start_at IS NULL OR c.start_at <= NOW())
  AND (c.end_at   IS NULL OR c.end_at   >  NOW())
  AND (
    c.target_mode = 'all'
    OR (
      (c.target_plans     = '{}' OR $accountPlan = ANY(c.target_plans))
      AND (c.target_org_ids  = '{}' OR $accountId  = ANY(c.target_org_ids))
      AND (c.target_user_roles = '{}' OR $userRole = ANY(c.target_user_roles))
    )
  )
```

### 9.2 Filtro por frequência

```sql
LEFT JOIN in_app_campaign_user_states us
  ON us.campaign_id = c.id AND us.user_id = $userId
WHERE
  CASE c.frequency_mode
    WHEN 'showOnce'       THEN us.id IS NULL
    WHEN 'untilDismissed' THEN us.id IS NULL OR us.status = 'shown'
    WHEN 'untilCompleted' THEN us.id IS NULL OR us.status <> 'completed'
  END
ORDER BY c.created_at DESC
```

### 9.3 Garantia multi-tenant

- `accountId`, `userId` extraídos do JWT, nunca do payload do client.
- Teste de regressão obrigatório: usuário da org A não deve ver campanhas targetadas a org B.

---

## 10. API contracts

Backend: `chatfunnel-services` (NestJS :3200). Todas as rotas sob `/in-app-campaigns`.

### 10.1 User-facing (auth: user logado)

| Método | Path | Descrição |
|---|---|---|
| GET | `/in-app-campaigns/pending` | Lista de campanhas elegíveis (com `form_schema` embutido) |
| POST | `/in-app-campaigns/:id/events` | Registra evento (`shown` / `dismissed` / `submitted`) |

**GET /pending — response**
```json
{
  "campaigns": [
    {
      "id": "uuid",
      "title": "string",
      "description": "string|null",
      "formSchema": { "fields": [ /* FormField[] */ ] },
      "resolutionMode": "dismiss_or_complete",
      "frequencyMode": "untilCompleted"
    }
  ]
}
```

**POST /:id/events — request (discriminated union via `type`)**
```ts
type CampaignEvent =
  | { type: 'shown' }
  | { type: 'dismissed' }
  | { type: 'submitted'; answers: Record<string, string | number | boolean | string[]> }
```

**Semântica por tipo e status codes**

| Evento | Ação | Success | Erros |
|---|---|---|---|
| `shown` | UPSERT `user_states`; set `campaigns.first_shown_at` se NULL | 204 | 404 (campanha não existe) / 403 (não elegível) |
| `dismissed` | UPDATE `user_states` se não `completed`; no-op se já resolvido | 204 | 404 / 403 / 409 se `resolution_mode='complete_only'` |
| `submitted` | Valida `answers` vs `form_schema`; TX: UPDATE `user_states` + bulk INSERT `response_values` | 201 | 404 / 403 / 409 se já `completed` / 422 payload inválido |

### 10.2 Admin-facing (auth: role admin ChatFunnel)

| Método | Path | Descrição |
|---|---|---|
| GET | `/admin/in-app-campaigns` | Lista paginada com filtros (status, plan, dates) |
| GET | `/admin/in-app-campaigns/:id` | Detalhe |
| POST | `/admin/in-app-campaigns` | Criar (como `draft`) |
| PATCH | `/admin/in-app-campaigns/:id` | Editar (valida invariante de imutabilidade por `first_shown_at`) |
| PATCH | `/admin/in-app-campaigns/:id/status` | Transição de status |
| POST | `/admin/in-app-campaigns/:id/duplicate` | Clona form_schema + targeting em novo draft |
| GET | `/admin/in-app-campaigns/:id/report` | Agregações |
| GET | `/admin/in-app-campaigns/:id/export` | CSV stream (limite 10k rows no MVP) |

---

## 11. Arquitetura backend

### 11.1 Módulo NestJS — `chatfunnel-services/src/modules/in-app-campaigns/`

```
in-app-campaigns/
  controllers/
    in-app-campaigns-admin.controller.ts
    in-app-campaigns-user.controller.ts
  services/
    campaign.service.ts       (CRUD + invariantes)
    eligibility.service.ts    (query de /pending)
    delivery.service.ts       (write de shown/dismissed)
    response.service.ts       (validar + persistir submitted)
    report.service.ts         (agregações)
  dto/
    create-campaign.dto.ts
    update-campaign.dto.ts
    form-schema.dto.ts        (class-validator aninhado)
    campaign-event.dto.ts     (discriminator por `type`)
    submit-answers.dto.ts
  validators/
    form-schema.validator.ts  (custom class-validator)
    answers.validator.ts      (runtime: answers vs form_schema)
  guards/
    admin-only.guard.ts       (se não existir no projeto já)
  module.ts
```

### 11.2 Integrações com repos existentes

- `chatfunnel-core`: Prisma client, tipos compartilhados, auth helpers.
- Database: migrations em `chatfunnel-database/prisma/migrations/` (`--create-only`, nunca `db push`).
- Logging/telemetry: padrão existente do `chatfunnel-services`.

### 11.3 Transações

- `submitted` em transação única: update user_state + bulk insert response_values. Rollback em qualquer erro.
- `shown` sem tx (upsert idempotente).
- `dismissed` sem tx (update idempotente).

---

## 12. Arquitetura frontend

### 12.1 Runtime do modal

**Localização**: `chatfunnel-front/src/layout/FullLayout.vue` monta `<InAppCampaignOrchestrator />` no root do layout autenticado.

**Árvore de componentes**
```
src/components/inAppCampaigns/
  InAppCampaignOrchestrator.vue
  InAppCampaignModal.vue
  FormRenderer.vue
  fields/
    TextField.vue, TextareaField.vue, EmailField.vue, NumberField.vue
    SelectField.vue, RadioField.vue, CheckboxField.vue, RatingField.vue, HiddenField.vue
  composables/
    useCampaignQueue.ts
  services/
    InAppCampaignsService.ts
  stores/
    inAppCampaigns.ts       (Pinia)
```

**Fluxo**
1. Quando `authStore.currentAccount` é setado (pós-seleção de org / montagem do `FullLayout.vue`), auth store emite evento → `inAppCampaignsStore.loadPending(accountId)`. Troca de org re-dispara o load.
2. Store popula `queue: Campaign[]`.
3. Orchestrator monta modal para `queue[0]`.
4. Ao abrir: `InAppCampaignsService.postEvent(id, { type: 'shown' })`.
5. Ao dispensar (se permitido): postEvent dismissed → remove da fila.
6. Ao submeter: valida client-side → postEvent submitted → remove da fila.
7. Próxima da fila sobe.

**Prefill `hidden`**: `FormRenderer` lê `field.prefill` e injeta de `authStore` (`userId`, `accountId`, `userEmail`...).

### 12.2 Admin UI

**Localização**: `chatfunnel-front/src/views/adminTools/components/InAppCampaigns/` + rotas filhas em `router/index.js`.

**Rotas**
```
/admin-tools/in-app-campaigns
/admin-tools/in-app-campaigns/new
/admin-tools/in-app-campaigns/:id
/admin-tools/in-app-campaigns/:id/report
```

**Árvore**
```
adminTools/components/InAppCampaigns/
  index.vue                          (lista)
  CampaignEditor.vue                 (create/edit em tabs)
  CampaignReports.vue                (relatórios)
  components/
    CampaignCard.vue
    FormBuilder.vue
    FieldEditor.vue
    FormPreview.vue
    TargetingEditor.vue
    ScheduleEditor.vue
    FrequencyResolutionEditor.vue    (aplica invariantes §8 no client)
    ReportDistributionChart.vue
```

**Editor — tabs**
1. Metadata (title, description)
2. Form builder (drag-drop, preview lado a lado)
3. Targeting + agendamento
4. Review + publish

**Behavior lock**: se `firstShownAt` da campanha ≠ null, tabs 2–3 ficam em modo read-only exceto cosméticos; banner no topo explica.

### 12.3 Services (Axios)

```ts
// src/common/services/InAppCampaignsService.ts
class InAppCampaignsService {
  static getPending(): Promise<{ campaigns: Campaign[] }>
  static postEvent(id: string, event: CampaignEvent): Promise<void>

  // Admin
  static list(filters): Promise<Page<Campaign>>
  static get(id): Promise<Campaign>
  static create(dto): Promise<Campaign>
  static update(id, dto): Promise<Campaign>
  static updateStatus(id, status): Promise<Campaign>
  static duplicate(id): Promise<Campaign>
  static report(id): Promise<CampaignReport>
  static exportCsv(id): Promise<Blob>
}
```

Usa `NestApi` (base URL `:3200`), interceptors globais de erro (sem try/catch local por campanha, conforme convenção do projeto).

---

## 13. Relatórios

### 13.1 Métricas por campanha

- `shown_total` = `COUNT(DISTINCT user_id)` em user_states.
- `dismissed_total` = `COUNT(*) WHERE status='dismissed'`.
- `completed_total` = `COUNT(*) WHERE status='completed'`.
- `submissions_total` = `COUNT(*) WHERE submitted_at IS NOT NULL`. (= completed_total no MVP; divergem em v1.1 quando entrarem presets sem submit.)
- `conversion_rate` = `completed_total / shown_total`.

### 13.2 Distribuição por campo

Select / radio / checkbox:
```sql
SELECT value_text AS option_value, COUNT(*) AS count
FROM in_app_campaign_response_values
WHERE campaign_id = $1 AND field_key = $2
GROUP BY value_text
ORDER BY count DESC
```

Rating / number: histograma por bucket + média + mediana.

Texto livre: lista paginada.

### 13.3 Export CSV

- Shape: uma linha por resposta (user_state), colunas = campos do form + metadados (user_id, account_id, submitted_at).
- Checkbox: join em string separado por `|` ou colunas binárias por opção (escolher no spec de export específico — decisão em implementação).
- Limite 10k rows síncrono no MVP. Acima, erro com instrução "use export assíncrono v1.1".

---

## 14. Política de versionamento / imutabilidade

**Trava disparada por `first_shown_at IS NOT NULL`.**

| Campo | Editável pós-first-shown? |
|---|---|
| `title`, `description` | Sim (cosmético) |
| `form_schema.fields[i].label` | Sim |
| `form_schema.fields[i].helpText` | Sim |
| `form_schema.fields[i].validation.message` | Sim |
| `form_schema.fields[i].options[j].label` | Sim |
| `form_schema.fields[i].key` | **Não** |
| `form_schema.fields[i].type` | **Não** |
| `form_schema.fields[i].options[j].value` | **Não** |
| Add/remove field | **Não** |
| Add/remove option | **Não** |
| `validation.min/max/regex/required` | **Não** |
| `targeting.*`, `start_at`, `end_at` | Sim |
| `frequency_mode`, `resolution_mode` | Sim, desde que as invariantes §8 sigam válidas (re-checagem no PATCH). Usuários que já viram a campanha podem voltar a vê-la se a nova regra de frequência passar a incluí-los — comportamento correto. |
| `status` | Sim (pause / archive) |

Para mudanças estruturais após first-shown: admin **duplica** (endpoint `/:id/duplicate`) e edita a cópia como novo draft; arquiva a original.

---

## 15. Riscos e mitigações

| Risco | Severidade | Mitigação |
|---|---|---|
| Campanha `complete_only` bugada bloqueia todos os usuários | Alto | Preview obrigatório antes de publish; alerta automático se `shown > 10 && completed == 0` após 10min; admin pode pausar via `PATCH /admin/in-app-campaigns/:id/status` (admins da plataforma nunca recebem campanhas, então seu login não fica bloqueado). |
| Payload `/pending` gigante | Médio | Soft limit de N campanhas ativas; no futuro streamar 1 por vez. |
| Edição cosmética de label altera sentido do `value` | Médio | Admin UI alerta explícito; audit log. |
| `form_schema` malformado | Médio | Validação server na ativação; class-validator em DTO; CHECK constraint básico opcional. |
| Leak multi-tenant | Alto | Eligibility sempre server-side, `accountId` do JWT; teste de regressão. |
| Race submit em 2 abas | Baixo | `UNIQUE(campaign_id, user_id)` + 409 idempotente. |
| Export CSV grande trava thread | Baixo/Médio | Limite 10k rows sync no MVP; async em v1.1. |

---

## 16. Tradeoffs explícitos

- `form_schema` em JSONB (sem normalização) → perde integridade de DB, ganha simplicidade + velocidade. Compensado por validação em app layer + imutabilidade.
- Respostas normalizadas (`response_values`) → +N INSERTs por submit em troca de analytics triviais.
- Row-per-opção em checkbox → +N linhas por resposta em troca de query uniforme com select/radio.
- Endpoint único `/events` → DTO discriminado mais elaborado, cliente com 1 URL.
- Fila client-side → ordenação pode divergir entre abas; `UNIQUE` garante consistência de dados.
- Sem push real-time MVP → simplicidade de implementação; usuário vê campanha nova na próxima entrada na organização.
- Sem snapshot de schema por resposta → não há histórico "qual era o label no momento X". Aceitável: mudanças cosméticas não afetam `value` (a chave estável).

---

## 17. Decisões a resolver na implementação (não bloqueiam o spec)

- **Biblioteca de gráfico** (Chart.js / ApexCharts / Recharts) — verificar o que o front já usa.
- **Drag-drop no form builder** (VueDraggable / SortableJS).
- **Rate limit no `/events`** — avaliar; default nginx pode bastar.
- **Audit log admin** — plugar padrão existente se houver; senão deixar pra v1.1.
- **Seed + fixtures de teste** — integração com a infra de testes de `chatfunnel-services`.

---

## 18. Plano de rollout sugerido (resumo)

Detalhado no plano de implementação (a ser gerado via skill `writing-plans`).

- **Fase 1 — Backend**: migrations, entities, services, DTOs, controllers, testes unitários + integração.
- **Fase 2 — Runtime Frontend**: orchestrator, modal, form renderer, fields, serviço, store.
- **Fase 3 — Admin UI**: listagem, editor (metadata/form-builder/targeting), preview, reports, export.
- **Fase 4 — Hardening**: testes e2e, alertas operacionais, docs no vault, feature flag inicial.
- **Fase 5 — Canary release**: campanha "hello world" em 1 org de teste, depois ampliar.

---

## 19. Referências e arquivos do projeto

- Layout: `chatfunnel-front/src/layout/FullLayout.vue`
- Admin host: `chatfunnel-front/src/views/adminTools/AdminTools.vue` + `router/index.js` (`path: "admin-tools"`)
- Sistema correlato (complementar, não substituído): `chatfunnel-front/src/views/systemNotifications/`
- Backend: `chatfunnel-services/src/modules/` (criar `in-app-campaigns/`)
- Schema: `chatfunnel-database/prisma/schema.prisma` (a ser estendido)
- Regra de repo: **toda feature nova em `chatfunnel-services`**, nunca em `chatfunnel-api` (feedback gravado em memória).
