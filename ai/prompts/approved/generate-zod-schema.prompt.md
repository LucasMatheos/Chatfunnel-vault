---
prompt_id: PRM-0001
status: approved
owner: lucas@grupovuk.com.br
purpose: Gerar schema Zod + testes para validação de formulário ou payload
scope: chatfunnel-front, chatfunnel-services
risk_level: low
human_review_required: true
last_reviewed_at: 2026-04-23
version: 1
---

# Gerar schema Zod + testes

## Quando usar
- Criar validação de formulário novo (VeeValidate + Zod)
- Validar payload de entrada de endpoint NestJS
- Refatorar validação legacy em Yup/class-validator para Zod

## Quando NÃO usar
- Validação no `chatfunnel-services/` em controllers — lá usamos `class-validator`, não Zod
- Campos triviais sem regra de negócio (use `z.string()` inline no form)

## Contexto obrigatório a carregar
- `chatfunnel-front/CLAUDE.md` (regras de inputs/Vee*)
- `chatfunnel-front/src/views/<modulo>/**/validation.ts` mais próximo (seguir padrão existente)

## Entrada esperada
- Nome do formulário/payload
- Lista de campos com tipo e regra
- Exemplo de payload válido e inválido (ajuda na escrita dos testes)

## Saída esperada
Três arquivos co-localizados:
- `<nome>Validation.ts` — schema Zod + `type Input = z.infer<typeof schema>`
- `<nome>Validation.spec.ts` — testes Vitest cobrindo válido + cada falha
- Ajuste no componente para importar o schema via `toTypedSchema(schema)`

## Regras
- Schema em arquivo separado (nunca inline no `.vue`)
- Mensagens de erro em pt-BR
- Usar `.refine()` para validações cruzadas (ex: confirmarSenha)
- `z.coerce.number()` para inputs numéricos (vem como string do DOM)
- Preferir `z.enum([...])` a `z.string()` quando houver conjunto fechado
- Testes devem cobrir: feliz + cada campo obrigatório + cada regra de `.refine()`

## Critérios de revisão humana
- Mensagens de erro fazem sentido para o usuário final (não técnicas)
- Regras cruzadas não vazam lógica de negócio sensível
- Testes cobrem todos os caminhos do `.refine()`

## Evidência mínima
- `npm test -- <nome>Validation.spec.ts` passa
- `npm run typecheck` sem erros novos

## Histórico
- v1 2026-04-23 criação inicial
