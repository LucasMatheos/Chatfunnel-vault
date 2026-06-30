---
date: 2026-04-22
type: daily
tags:
  - daily
  - diary
  - chatfunnel-front
  - agents-v2-frontend
  - bug-investigacao
aliases:
  - Daily 22-04-2026 — Bug AutomationBuilderDialog
---

# Daily — 22-04-2026 — Bug AutomationBuilderDialog

## Resumo
Foi registrada uma investigação específica sobre o bug em que o `AutomationBuilderDialog` não aparecia ao clicar em "Configurar" dentro do `AutomationsConfigDialog`. A nota documentou sintoma, escopo, arquivos relevantes, hipóteses de causa, roteiro de reprodução e resultado final da resolução em 23-04-2026.

## Relacionado
- [[wiki/repos/chatfunnel-front|chatfunnel-front]]

## O que fiz
- **22-04** — Documentou o bug do `AutomationBuilderDialog` aninhado no fluxo de configuração de automações de agentes V2 _(chatfunnel-front)_
- **22-04** — Mapeou arquivos relevantes e fluxo esperado entre `LifecycleAutomationCard`, `AutomationsConfigDialog` e `AutomationBuilderDialog` _(chatfunnel-front)_
- **22-04** — Registrou hipóteses de investigação: `builderRef` nulo, falha em `initFlow()` ou problema de stacking/portal do Reka UI _(chatfunnel-front)_
- **23-04** — Registrou a resolução: remover `:modal="false"` do `AutomationBuilderDialog` para corrigir o modal aninhado _(chatfunnel-front)_

> [!tip] Decisoes
> - Usar o menor fix possível: remover `:modal="false"` do `<Dialog>` em `AutomationBuilderDialog.vue`.
> - Registrar o aprendizado em `vault/wiki/gotchas/frontend-gotchas.md`.

> [!warning] Bloqueios
> - O `AutomationBuilderDialog` era criado no DOM, mas ficava invisível por causa do lifecycle de modal do Reka UI com dialog aninhado.

> [!todo] Proximos passos
> - _Sem proximos passos definidos._

## Arquivos modificados
### [[wiki/repos/chatfunnel-front|chatfunnel-front]]
- `chatfunnel-front/src/views/agents/AgentsForm/components/modals/AutomationsConfigDialog.vue`
- `chatfunnel-front/src/views/agents/AgentsForm/components/modals/components/AutomationBuilderDialog.vue`
- `chatfunnel-front/src/views/agents/AgentsForm/components/modals/components/LifecycleAutomationCard.vue`
- `vault/wiki/gotchas/frontend-gotchas.md`
