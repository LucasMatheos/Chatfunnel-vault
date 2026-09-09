---
title: Agents V2 — Modo de Criação (creationMode)
description: Estruturação backend do BASIC/ADVANCED — o que falta para o front enviar o modo e o back persistir/validar.
tags: [feature, agents-v2, backend, creationMode, plano-pre-implementacao]
related: ["[[ai-agents]]", "[[agents-v2-prompt-build]]"]
last_updated: 2026-07-10
---

# Agents V2 — Modo de Criação (creationMode)

Origem: reunião 09/07/2026 (`docs/AgentsV2/tasks-reuniao-2026-07-09.md`). Front do
modo já implementado; este artigo é a análise do que falta no **backend** para
destravar o envio do modo.

- **BASIC**: construtor guiado monta o prompt (fluxo atual).
- **ADVANCED**: usuário escreve o prompt direto; sem construtor. Etapas:
  Identidade → Prompt direto → Ferramentas → Grupos de imagens → Encerramento.

## Estado do front (feito)

- Config de etapas por modo: `chatfunnel-front/src/views/agents/AgentsForm/steps.config.ts`
  (`STEP_DEFS` + `MODE_STEPS` + `getSteps`). O `AgentsForm/index.vue` deriva
  sidebar/navegação/validação/visibilidade daí.
- `role` escondido no avançado (prop `advanced` em `IdentityStep`).
- `loadAgent` já lê `agent.creationMode ?? 'BASIC'`; payload já envia `creationMode`.

## Descobertas no código (não no doc)

- **Modelo Prisma é `Agents`** (tabela dos agents-v2), em
  `chatfunnel-core/prisma/schema.prisma`. Tem `systemPrompt`, `formData Json?`,
  `enabledTools`. **Não tem `creationMode`.**
- **`create`/`update` do service só persistem** — não geram prompt
  (`agents-v2.service.ts` → `payload-to-prisma.ts` → repository). A geração é
  100% no front, via endpoints de stream separados (`buildPromptStream` /
  `rebuildPromptStream`). Ver [[agents-v2-prompt-build]].
  → **Advanced não precisa de "pular o gerador"**; o back já nunca gera no CRUD.
- **`buildAgentCreateInput` faz `...baseData`** — espalha todo campo do DTO
  (fora tool/json) direto no input Prisma. → `creationMode` **passa sozinho**
  assim que virar campo do DTO + coluna. Mapeamento = zero.
- **GET devolve a row inteira** → `agent.creationMode` chega no front de graça.

## Execução (runtime) — está no `chatfunnel-api`

O executor **não** está no `services` (que só faz CRUD + build de prompt). Roda no
`chatfunnel-api`, em `src/commands/instagram/WebHookHandler/processor/agents-v2/`
(`HandlerAgent.ts` + `providers/{Anthropic,OpenAI}HandlerAgent.ts` +
`queue/AgentSessionWorker.ts` + `tools/`). Fluxo: webhook → buffer/debounce (Redis+Bull)
→ worker → `executeToolLoop` (callLLM → tool_use → `AgentToolExecutor` → repete).

**Tools vão nativas, independentes do modo** (confirmado com tech lead): `enabledTools`
+ `toolConfigs` viram *function definitions* (`tools/*ToolDefinitions.ts`) passadas no
`callLLM` — **não** dependem de texto no prompt. O bloco `<instructions>`/framing de
agência que o construtor gera é só descritivo; o modelo usa as ferramentas recebendo as
definições. → **ADVANCED não precisa de tratamento especial de tools**: o usuário escreve
o prompt, habilita as tools, e o runtime injeta as function defs.

`getAugmentedSystemPrompt()` (na API) anexa em runtime, para qualquer modo:
DATA_MAPPING (coleta), `<objectives>`, resposta estruturada (JSON) e `<available-images>`
(lista `IMG-001: descrição`). Envio de imagem requer `responseFormat=JSON` (item
estruturado `type: image` com `id` = código do grupo → `sendImageGroupToContact`).

→ Consequência: tools, imagens e objetivos funcionam igual no BASIC e no ADVANCED,
lendo as mesmas tabelas. No ADVANCED muda só o `systemPrompt` (texto cru do usuário).

## Tarefas mínimas (para "front envia, back aceita")

**1. Prisma (`chatfunnel-core`)**
- Enum `AgentCreationModeEnum { BASIC ADVANCED }`.
- Coluna em `Agents`: `creationMode AgentCreationModeEnum @default(BASIC)`
  (default cobre agentes legados).
- Migration **`--create-only`** (regra do repo; nunca aplicar à mão).
- ⚠️ Cross-repo: core é build/publish/sync **manual**; só depois o `services`
  enxerga o tipo gerado. É o gargalo de ordem.

**2. DTO (`chatfunnel-services/src/modules/agents-v2/dto/`)**
- `CreateAgentV2Dto`: `creationMode` **obrigatório**, `@IsEnum(AgentCreationModeEnum)`
  (import de `@chatfunnel/core/database`).
- `UpdateAgentV2Dto`: **não** aceitar `creationMode` (Omit no PartialType ou
  stripar no service) — impede trocar basic↔advanced na edição via payload/URL.

**3. Validação por modo (§4) — única lógica nova**
- ADVANCED: exigir `systemPrompt` não-vazio no `service.create` (o prompt
  digitado é o final). Cross-field fica melhor no service que no class-validator.
- BASIC: como hoje.

**4. `payload-to-prisma.ts`**: nada — `...baseData` cobre. Só conferir o tipo do enum.

## Fora do escopo mínimo (depois)

- **§5 rebuild automático no edit do básico**: hoje é front (stream + modal).
  Mover pro back é comportamento novo (fila/assíncrono). Manter no front por ora.
- **§6 imageGroups no prompt**: investigação, não bloqueia.
- **§7 testes**: unit da validação por modo + integração create básico/avançado.

## Ordem sugerida

1. Schema (core): enum + coluna + migration `--create-only` → **build/publish core (manual)**.
2. Services: bump core; `creationMode` obrigatório no create DTO; guard de prompt
   obrigatório no avançado; omitir no update.
3. Front: destrava sozinho; + validação client-side de prompt obrigatório no avançado.

## Alerta atual

O payload de criação já envia `creationMode`, mas o back tem
`forbidNonWhitelisted: true` (`main.ts`) e ainda não tem o campo → **criação
retorna 400** até o passo 1+2 landarem.
