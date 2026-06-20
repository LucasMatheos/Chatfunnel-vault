---
title: Gotchas Index
description: Indice de armadilhas, bugs conhecidos, comportamentos inesperados e workarounds do sistema.
last_updated: 2026-06-16
---

# Gotchas

Coisas que nao sao obvias, que custaram tempo pra descobrir, e que alguem vai pisar de novo se nao estiver documentado.

| Tema | Artigo | Destaques |
|------|--------|-----------|
| Prisma, PostgreSQL, multi-tenancy, repositories | [[database-gotchas]] | postinstall prisma generate, repos mortos, typo no filename, raw SQL no batch |
| Docker, portas, env vars, Redis, filas, SWC, tokens | [[infrastructure-gotchas]] | Bull vs BullMQ, WorkerService crasha API, .npmrc com token, 3 conexoes Redis |
| Socket.IO, Meta, Mastra, auth, WhatsApp API | [[integration-gotchas]] | broadcast sem rooms, moderadorsId typo, Mastra monkey-patch, Meta API hardcoded |
| Vue v2 components, SWC watch, core sync, chatfunnel-database, dialog aninhado, vue-i18n d(), sidebar overflow, reports-v2 funnel/moeda | [[frontend-gotchas]] | InputText v2 nao repassa maxlength, SWC nao recarrega decorators, sync manual do core, chatfunnel-database nao existe, dialog aninhado modal=false invisivel, vue-i18n d() sem datetimeFormats retorna vazio, overflow-y aninhado empurra icones do rail em <=900px, reports-v2 conversionFromPrevious sem bounds (assumido 0..1) + revenue-card em centavos |
| Front, contracts, Zod 3/4, Intelligence V2 | [[front-contracts-zod-loose]] | `@chatfunnel/contracts/tools` puxa schemas com `.loose()`; servidor resolve Zod 3 do front e quebra chunk lazy-loaded |
| MCP bugs, data leaks, silent-fails, naming, gaps de API | [[mcp-bugs-tracking]] | 32 bugs + 4 gaps rastreados. 5 criticos (leak secrets, silent-fail CRM, template partial-delete). Audit 2026-04-30/05-04 |
| Stored XSS no livechat, v-html sem DOMPurify, token exfiltration | [[livechat-xss-dompurify]] | 21 componentes vulneraveis, attack chain confirmado. Fix: composable useSanitize.ts (2026-05-12) |
