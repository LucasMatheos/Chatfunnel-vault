# Prompts versionados — ChatFunnel

Prompts reutilizáveis aprovados para uso com Claude Code, Copilot ou qualquer agente de IA trabalhando nos repos do workspace.

## Como usar

No Claude Code, referencie o arquivo no início da conversa:

```
Siga @ai/prompts/approved/review-pr-frontend.prompt.md e revise o diff atual.
```

## Catálogo

| ID | Arquivo | Escopo | Propósito |
|----|---------|--------|-----------|
| PRM-0001 | [generate-zod-schema.prompt.md](approved/generate-zod-schema.prompt.md) | front, services | Gerar schema Zod + testes |
| PRM-0002 | [review-pr-frontend.prompt.md](approved/review-pr-frontend.prompt.md) | front | Revisão pré-humana de PR no front |
| PRM-0003 | [create-shadcn-dialog.prompt.md](approved/create-shadcn-dialog.prompt.md) | front | Novo modal/dialog shadcn-vue |
| PRM-0004 | [extract-subcomponent.prompt.md](approved/extract-subcomponent.prompt.md) | front | Quebrar componente >150 linhas (Index Pattern) |
| PRM-0005 | [debug-dialog-not-opening.prompt.md](approved/debug-dialog-not-opening.prompt.md) | front | Diagnosticar dialog que não abre |

## Ciclo de vida

- `approved/` — em uso, revisado
- `draft/` — em avaliação, não usar em produção sem review
- `deprecated/` — obsoleto, manter só por histórico

## Regras

- Todo prompt novo nasce em `draft/` e sobe para `approved/` via PR
- Prompt aprovado tem **owner**, **propósito**, **escopo** e **quando NÃO usar** explícitos
- Mudanças em prompt aprovado incrementam `version` no front-matter
- Prompt que vira obsoleto vai para `deprecated/` (nunca deletar — rastreabilidade)
