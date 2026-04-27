---
tags: [feature, backend, frontend, forms, modal]
status: design-approved
created: 2026-04-17
spec: docs/superpowers/specs/2026-04-17-in-app-campaigns-design.md
plan: docs/superpowers/plans/2026-04-17-in-app-campaigns-plan-01-backend.md
---

# In-app Campaigns

Sistema de modais dinâmicos exibidos **após seleção de organização** para usuários de orgs tenants. Equipe ChatFunnel cria campanhas com formulários, coleta respostas estruturadas e mede conversão.

> **Trigger:** ativa quando `authStore.currentAccount` está setado (montagem do `FullLayout.vue`), não no login cru. Trocar de org re-avalia elegibilidade.

> Pedido inicial da CEO: prioridade é o **dynamic form**. Announcement e confirmation virão como presets do mesmo motor em v1.1.

## Decisões-chave da brainstorm (2026-04-17)

| Tema | Decisão |
|---|---|
| Audiência | Usuários de orgs tenants; superadmin ChatFunnel não recebe |
| Autoria | Equipe ChatFunnel (backoffice); campanha é global com targeting |
| Targeting | `all` / por plano / lista de orgs / role do usuário na org |
| MVP | Apenas dynamic form |
| Tipos de campo MVP | text, textarea, email, number, select, radio, checkbox, rating, hidden |
| Frequência | por usuário: `showOnce` / `untilDismissed` / `untilCompleted` |
| Resolution | `dismiss_or_complete` / `complete_only` (unificado — sem flags separados) |
| Imutabilidade | Travada no **primeiro shown** (não primeira resposta); só cosméticos editáveis depois |
| Versionamento | **Sem versionamento de form** — duplicar campanha pra alterar estrutura |
| Schema storage | `form_schema` JSONB na campanha + respostas **normalizadas** em `response_values` |
| Checkbox storage | Row-per-opção (não array), analytics uniforme com select/radio |
| Targeting storage | Arrays Postgres (não JSONB, não tabelas de join) + GIN indexes |
| Backend repo | `chatfunnel-services` (NestJS :3200) |
| Frontend | Modal runtime no `FullLayout.vue`; admin UI em `adminTools/components/InAppCampaigns/` |
| Endpoint eventos | `POST /:id/events` com discriminator `type: shown/dismissed/submitted` |
| Fila | Client-side, `created_at DESC`, 1 modal por vez |

## Invariantes (enforçadas no service)

1. `frequency_mode='untilDismissed' ⇒ resolution_mode='dismiss_or_complete'`
2. `resolution_mode='complete_only' ⇒ frequency_mode ∈ {showOnce, untilCompleted}`
3. `first_shown_at IS NOT NULL ⇒` só cosméticos (title, description, labels, helpText, option.label). Não muda field.key, field.type, option.value, validation estrutural, add/remove de campos ou opções.
4. Publicar (`active`) exige form_schema válido (≥1 campo, opções não vazias onde aplica).
5. `start_at < end_at` se ambos presentes.
6. Field `key` único por campanha; option `value` único por campo.

## Data model (resumo)

3 tabelas novas em `chatfunnel-core/prisma/schema.prisma`:

- **`in_app_campaigns`** — metadados + form_schema JSONB + targeting (arrays) + scheduling + status
- **`in_app_campaign_user_states`** — tracking por `(campaign, user)`, UNIQUE constraint
- **`in_app_campaign_response_values`** — 1 row por campo respondido (N rows por checkbox); `submitted_at` e `account_id` denormalizados

Ver detalhes completos em [[#spec]] §7.

## Runtime / fluxo

1. Pós-seleção de org (montagem do `FullLayout.vue`): `GET /in-app-campaigns/pending` retorna campanhas elegíveis para o `accountId` ativo (targeting + filtro de frequência via raw SQL).
2. Orchestrator (Vue) mostra primeira da fila.
3. Ao mostrar: `POST /:id/events { type: 'shown' }` → set `first_shown_at` se primeiro show.
4. Dispensar (se permitido): `type: 'dismissed'`.
5. Submeter: `type: 'submitted', answers: {...}` → valida + transação UPDATE user_state + bulk INSERT response_values.
6. Idempotência: submit já `completed` → 409.

## Relatórios MVP

- `shown_total`, `dismissed_total`, `completed_total`, `submissions_total`, `conversion_rate`
- Distribuição por opção em select/radio/checkbox/rating
- Export CSV síncrono (limite 10k; async em v1.1)

## Roadmap

- **v1.0 (MVP)** — backend + frontend runtime + admin UI com tudo acima
- **v1.1** — presets announcement/confirmation, campo date/file, condicionais, multi-step, WebSocket push, export assíncrono
- **Fora de escopo** — A/B test, i18n, triggers além da seleção de organização, relatórios cross-campanha

## Riscos principais

- **Campanha `complete_only` bugada bloqueia usuários** → preview obrigatório + alerta shown>10/completed=0; admin nunca bloqueado (superadmins não recebem campanhas)
- **Leak multi-tenant** → targeting sempre server-side, JWT como única fonte de accountId
- **Label renomeado após respostas** → audit log + alerta no admin UI (value é estável, só label muda)

## Referências

- Spec: `docs/superpowers/specs/2026-04-17-in-app-campaigns-design.md`
- Plano Backend: `docs/superpowers/plans/2026-04-17-in-app-campaigns-plan-01-backend.md`
- Plans 2 (front runtime) e 3 (admin UI) serão escritos após Plan 1 shippado
- Sistema correlato (complementar, **não substituído**): `chatfunnel-front/src/views/systemNotifications/`
- Regra de repo: toda feature nova em `chatfunnel-services`, nunca `chatfunnel-api`
