# Front — tarefas do `creationMode` (agents-v2)

Lista **somente frontend** para o modo de criação (BASIC/ADVANCED).
Derivada de `tasks-reuniao-2026-07-09.md` (§2, §3, §4, §5, §7).
Backend em `backend-creationmode-tasks.md`; análise em
`vault/wiki/features/agents-v2-creation-mode.md`.

Data: 2026-07-10.

## ✅ Feito

- **Config de etapas por modo** — `chatfunnel-front/src/views/agents/AgentsForm/steps.config.ts`
  (`STEP_DEFS` + `MODE_STEPS` + `getSteps`). O `AgentsForm/index.vue` deriva
  sidebar / navegação / validação por etapa / visibilidade daí (sem números fixos).
- **Wizard avançado** = 5 etapas (Identidade → Prompt direto → Ferramentas → Grupos de
  imagens → Encerramento). Instruções/raciocínio/formato ficam fora do avançado.
- **`role` escondido no avançado** — prop `advanced` no `IdentityStep` (`v-if="!advanced"`).
- **"Prompt direto"** reusa `InstructionsStep` (props `title/description/label/help`).
- **Seleção de modo** — `SelectCreation.vue` (cards BASIC/ADVANCED) já existente.
- `loadAgent` lê `agent.creationMode ?? 'BASIC'`; payload já envia `creationMode`.
- Removidos os dois controles inferiores do fluxo de confirmação manual (§4/§5).

## ⏳ Pendente

- [ ] **Prompt direto obrigatório (§4)** — validação client-side: no ADVANCED, `systemPrompt`
      não pode ser vazio antes de salvar. Hoje o schema é `z.string()` (opcional).
- [X] **`handleSave` sem stream (ambos os modos)** — removido `showPromptModal`/`startStream`
      do save; salva direto (`handlePromptConfirm`): edição preserva o prompt atual, criação
      usa `values.systemPrompt`. Geração do prompt será fluxo **separado** (o `startStream`
      segue vivo no botão "Acesse o prompt"/rebuild).
- [ ] **Edição do básico sem revisão manual (§5)** — "Concluir edição" reconstrói o prompt
      automaticamente, sem modal de streaming; feedback não-bloqueante; atualizar
      listagem/detalhe após sucesso. **Depende do contrato do back** (síncrono vs assíncrono).
- [ ] **Testes E2E (§7)** — seleção de modo, criação avançada, finalização de edição básica.

## ⚠️ Constraints do backend (afetam o front)

- **`update-agent-v2.dto.ts`: `PartialType(OmitType(CreateAgentV2Dto, ['creationMode']))`**
  — o modo **não pode ser alterado na edição** (e com `forbidNonWhitelisted`, mandar
  `creationMode` no update dá **400**, reforçando a imutabilidade).
  → **Front NÃO deve enviar `creationMode` no edit.** Hoje já não envia (`props.mode` é
  `undefined` na edição, então a chave cai no `JSON.stringify`). Só não reintroduzir.
- **`creationMode` é obrigatório no create** — sempre enviar na criação (o `SelectCreation`
  garante o modo). Enquanto o back não estava deployado, o payload dava **400**; após o
  deploy do `services` isso destrava.
