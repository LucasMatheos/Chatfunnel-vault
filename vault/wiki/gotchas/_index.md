---
title: Gotchas Index
description: Indice de armadilhas, bugs conhecidos, comportamentos inesperados e workarounds do sistema.
last_updated: 2026-09-08
---

# Gotchas

Coisas que nao sao obvias, que custaram tempo pra descobrir, e que alguem vai pisar de novo se nao estiver documentado.

| Tema | Artigo | Destaques |
|------|--------|-----------|
| Frontend, benchmarks offline, CRM, Tailwind | [[frontend-offline-benchmarks]] | Harness sem API/banco; CRM: retenção e arraste custoso, diagnóstico adiado; CPU, heap e working set distintos |
| Signup, DDI, onboarding e dados organizacionais | [[signup-phone-ddi-organization-onboarding-gap]] | Signup grava telefone sem DDI; onboarding nao coleta os dados completos de "Minha Organizacao" |
| DropdownMenu, barrel exports, ciclos ESM | [[dropdown-menu-variant-circular-import]] | Variantes devem ser importadas de `variants.ts`, nunca do `index.ts` reexportador |
| Prisma, PostgreSQL, multi-tenancy, repositories | [[database-gotchas]] | postinstall prisma generate, repos mortos, typo no filename, raw SQL no batch |
| Docker, portas, env vars, Redis, filas, SWC, tokens | [[infrastructure-gotchas]] | Bull vs BullMQ, WorkerService crasha API, .npmrc com token, 3 conexoes Redis |
| Socket.IO, Meta, Mastra, auth, WhatsApp API | [[integration-gotchas]] | broadcast sem rooms, moderadorsId typo, Mastra monkey-patch, Meta API hardcoded, comissao de parceiro (Partnero) some silenciosamente / data trocada pela do cron |
| Vue v2 components, overlays Reka, SWC watch, core sync, chatfunnel-database, dialog aninhado, vue-i18n d(), sidebar overflow, reports-v2 funnel/moeda | [[frontend-gotchas]] | `PopoverTrigger as-child` perde anchor ao trocar raiz, InputText v2 nao repassa maxlength, SWC nao recarrega decorators, sync manual do core, chatfunnel-database nao existe, dialog aninhado modal=false invisivel, vue-i18n d() sem datetimeFormats retorna vazio, overflow-y aninhado empurra icones do rail em <=900px, reports-v2 conversionFromPrevious sem bounds (assumido 0..1) + revenue-card em centavos |
| Front, contracts, Zod 3/4, Intelligence V2 | [[front-contracts-zod-loose]] | `@chatfunnel/contracts/tools` puxa schemas com `.loose()`; servidor resolve Zod 3 do front e quebra chunk lazy-loaded |
| MCP bugs, data leaks, silent-fails, naming, gaps de API | [[mcp-bugs-tracking]] | 32 bugs + 4 gaps rastreados. 5 criticos (leak secrets, silent-fail CRM, template partial-delete). Audit 2026-04-30/05-04 |
| Stored XSS no livechat, v-html sem DOMPurify, token exfiltration | [[livechat-xss-dompurify]] | 21 componentes vulneraveis, attack chain confirmado. Fix: composable useSanitize.ts (2026-05-12) |
| Livechat, Pinia, ultimo canal selecionado | [[livechat-last-channel-selection]] | `ListContacts` nao pode sobrescrever com `null` a selecao persistida restaurada pelo topo |
| z-index, Dialog, Popover, float dentro de modal | [[zindex-map]] | Mapa completo de todos os z-index de components/ui; Popover/Select base z-50 somem dentro de Dialog; padrão correto: z-[999999999999] |
| Google Calendar, sync, cancelamento, evento fantasma | [[calendar-sync-cancellation-blindness]] | Cancelar/deletar no Google não some do banco; nenhum caminho detecta ausência (showDeleted=false); fix: reconciliação por ausência com guards googleListSucceeded + <250 |
| Google Calendar, upsert, multi-tenancy, multi-agenda, Prisma unique | [[calendar-upsert-multitenancy]] | upsertByGoogleEventId chaveava só por googleEventId (unique global): vazava entre contas E colapsava evento compartilhado entre 2 agendas da mesma conta. Fix staged: `@@unique([accountId, googleCalendarId, googleEventId])` + where triplo — pendente migration/generate/rebuild |
| Agents V2, Assistant legado, race conditions, mensagens perdidas | [[agents-v2-assistant-execution-gotchas]] | 16 pontos: `temperature` rejeitada por modelos novos (corrigido), envelope JSON vazio (corrigido), replies de WhatsApp/Instagram perdem o vínculo com a mensagem citada antes do LLM, race de sessão sem catch, buffer abandonado no cap de iterações, mensagens perdidas durante pausa por loop, `sendButtons` manda undefined no fallback, debounce do legado em setTimeout de processo (sem sobreviver restart) |
