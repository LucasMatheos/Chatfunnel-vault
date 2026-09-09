# Backend — tarefas do `creationMode` (agents-v2)

Lista **somente backend** para persistir/validar o modo de criação (BASIC/ADVANCED).
Derivada de `tasks-reuniao-2026-07-09.md` (§1, §3, §4, §7) e da análise em
`vault/wiki/features/agents-v2-creation-mode.md`.

Data: 2026-07-10.

## Contexto (resumo)

- Modelo Prisma é `Agents` (tabela dos agents-v2). Hoje **não tem** `creationMode`.
- `create`/`update` do service **só persistem** — não geram prompt. A geração é no front
  (endpoints de stream). `buildAgentCreateInput` faz `...baseData` → `creationMode` passa
  sozinho assim que virar campo do DTO + coluna.
- Executor está no `chatfunnel-api`; tools/imagens/objetivos funcionam **independente do
  modo** (function calling nativo). Runtime **não** precisa mudar para o modo.
- Bloqueio atual: `main.ts` tem `forbidNonWhitelisted: true` e o DTO não tem `creationMode`
  → **criação retorna 400** até o DTO aceitar o campo.

## 🗄️ `chatfunnel-core` (Prisma) — primeiro

- [X] Adicionar enum `AgentCreationModeEnum { BASIC ADVANCED }` em `prisma/schema.prisma`.
- [X] Adicionar coluna no model `Agents`:
      `creationMode AgentCreationModeEnum @default(BASIC)` (default cobre agentes legados).
- [X] Gerar migration com **`--create-only`** (nunca `db push`/`migrate deploy` à mão).
- [X] `prisma generate` + **build/publish do core (manual)** + bump de versão.

## ⚙️ `chatfunnel-services` (módulo `agents-v2`) — depois do core

- [X] Bump `@chatfunnel/core` para a versão com o novo campo.
- [X] `dto/create-agent-v2.dto.ts`: adicionar `creationMode` **obrigatório**,
      `@IsEnum(AgentCreationModeEnum)` (import de `@chatfunnel/core/database`).
      → destrava o **400** da criação.
- [X] `dto/update-agent-v2.dto.ts`: **não** aceitar `creationMode` —
      `PartialType(OmitType(CreateAgentV2Dto, ['creationMode']))`. Modo imutável na edição
      (com `forbidNonWhitelisted`, enviá-lo no update dá 400).
- [X] `agents-v2.service.ts` (`create`): validar por modo — **ADVANCED exige
      `systemPrompt` não-vazio** (cross-field melhor no service que no DTO).
- [X] `helpers/payload-to-prisma.ts`: **nada** — `...baseData` já passa o campo.
      Só conferir que o tipo do enum bate.
- [X] GET por id: `findOne` (`findById`, sem select) e `findOneWithRelations`
      (`findByIdWithRelations`, `include`) já retornam `creationMode`.
- [X] GET listagem: **adicionado** `creationMode` ao `findMany` do core
      (`agents_v2.repository.ts`: tipo `AgentListItem` + `select` + map) — front precisa
      na listagem. ⚠️ requer **build/publish/sync do core**.

## 🚀 `chatfunnel-api` (runtime/executor)

- [ ] **Nada** para o modo em si — tools/imagens/objetivos já independem do `creationMode`
      (function definitions nativas + `getAugmentedSystemPrompt`). Só entra aqui se depois
      quiserem o **rebuild automático do §5** (comportamento novo, fora deste escopo).

## 🧪 Testes (§7 — backend)

- [ ] Unit: validação de `creationMode` + regra "ADVANCED exige prompt não-vazio".
- [ ] Integração: criar agente BASIC e ADVANCED.

## Ordem crítica

1. **core**: enum + coluna + migration `--create-only` + publish.
2. **services**: bump core + `creationMode` no create DTO + validação de prompt no
   avançado + omitir no update.
3. **front**: destrava sozinho (já envia `creationMode`, já lê no GET).
