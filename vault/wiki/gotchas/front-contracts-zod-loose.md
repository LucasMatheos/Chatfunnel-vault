---
title: Front + Contracts — erro Zod `.loose is not a function`
description: Intelligence V2 quebra no servidor de dev quando o front resolve Zod 3 para contracts que usam API de Zod 4.
tags: [gotcha, frontend, contracts, zod, intelligence-v2]
severity: media
related: ["[[frontend-gotchas]]", "[[chatfunnel-front]]", "[[chatfunnel-contracts]]", "[[intelligence-a2a-contratos]]"]
last_updated: 2026-06-17
---

# Front + Contracts — erro Zod `.loose is not a function`

## O que acontece

No servidor de dev, ao abrir a Intelligence V2, o browser dispara:

```txt
Uncaught (in promise) TypeError: y(...).loose is not a function
    at IntelligenceV2View-*.js:1:...
```

O erro aparece como `Uncaught (in promise)` porque `IntelligenceV2View` é uma rota lazy-loaded: o chunk JS é carregado por Promise, e a avaliação do módulo falha antes da view montar.

## Causa raiz

`chatfunnel-contracts` usa API de **Zod 4**, especialmente:

```ts
z.object(...).loose()
```

Mas `chatfunnel-front` depende de **Zod 3**:

```json
"zod": "^3.24.0"
```

Com `^3.24.0`, o npm pode instalar qualquer versão compatível dentro do major 3. Exemplo observado localmente:

```txt
package.json pede: zod ^3.24.0
npm instalou:     zod 3.25.76
```

Isso continua sendo Zod 3. Em Zod 3, `.loose()` não existe; o equivalente prático para aceitar campos extras é `.passthrough()`.

## Por que local pode funcionar e servidor quebrar

Localmente, `chatfunnel-front/node_modules/@chatfunnel/contracts` pode ser um junction/link para `../chatfunnel-contracts`.

Nesse cenário, o pacote `chatfunnel-contracts` pode acabar usando o próprio `node_modules` dele, onde há Zod 4.

No servidor, o build do front tende a instalar `@chatfunnel/contracts` como dependência do app. Como `zod` é `peerDependency` dos contracts, ele resolve pelo consumidor (`chatfunnel-front`). Se o front fornece Zod 3, o código dos contracts roda com Zod 3 e quebra em `.loose()`.

Resumo:

```txt
local:
@chatfunnel/contracts -> pode usar zod 4 do repo linkado

servidor:
@chatfunnel/contracts -> resolve zod 3 do chatfunnel-front
```

## Caminho que puxa o erro

O front importa labels por:

```ts
// chatfunnel-front/src/views/intelligenceV2/utils/tool-label.ts
export {
  TOOL_LABELS,
  THINKING_LABEL,
  getToolLabel,
  getThinkingLabel,
} from "@chatfunnel/contracts/tools";
```

O problema é que `@chatfunnel/contracts/tools` é um barrel amplo: além dos labels, ele exporta contracts, registry e schemas das tools. Ao importar esse subpath, o bundle pode avaliar módulos com `.loose()`.

Ou seja, a view quer apenas label, mas acaba carregando schemas Zod 4.

## Como confirmar

No ambiente do servidor/build do front:

```bash
npm ls zod @chatfunnel/contracts
```

Se `@chatfunnel/contracts` estiver resolvendo `zod@3.x`, o diagnóstico fecha.

Também procurar no bundle servido:

```bash
rg "\.loose\(" dist2/assets
```

Se aparecer no chunk da Intelligence V2, o front está carregando código de schema dos contracts no browser.

## Correções possíveis

### Preferida: export específico só para labels

Criar um subpath nos contracts que não importe schemas:

```txt
@chatfunnel/contracts/tools/labels
```

ou:

```txt
@chatfunnel/contracts/tool-labels
```

Então o front troca:

```ts
from "@chatfunnel/contracts/tools"
```

por:

```ts
from "@chatfunnel/contracts/tools/labels"
```

Vantagens:

- não altera Zod do front;
- não mexe em `vee-validate`;
- não força downgrade do `chatfunnel-contracts`;
- reduz bundle porque evita importar schemas no browser.

### Compatibilizar contracts com Zod 3 e 4

Trocar `.loose()` por `.passthrough()` onde o objetivo for aceitar campos extras.

Também ajustar `peerDependencies`:

```json
"zod": "^3.24.0 || ^4.0.0"
```

Risco: precisa auditar se existe outra API exclusiva de Zod 4 no `chatfunnel-contracts`.

### Downgrade completo do contracts para Zod 3

Não recomendado como primeira opção.

Risco maior porque `chatfunnel-contracts` já foi desenhado como pacote Zod 4, e backends/services podem depender desse comportamento.

## Decisão recomendada

Não atualizar o Zod do `chatfunnel-front` agora, porque ele é acoplado a `vee-validate` e ao stack atual de forms.

Também não fazer downgrade amplo do `chatfunnel-contracts`.

Resolver no boundary:

1. expor labels em subpath isolado no `chatfunnel-contracts`;
2. importar esse subpath no front;
3. manter schemas Zod 4 fora do bundle browser quando o front só precisa de metadata visual.

## Revalidação em 2026-06-17

Estado observado no `chatfunnel-front`:

- `zod` root instalado: `3.25.76`.
- `@chatfunnel/contracts` linkado localmente resolve `zod@4.4.3`.
- `@vee-validate/zod@4.15.1` declara peer `zod@^3.24.0`.
- `shadcn-vue@2.7.3` é devDependency/CLI e também depende de `zod@^3.25.76`, mas não aparece importado pelo runtime do app.

Ensaio temporário com `zod@4.4.3` no root do front:

- `npm ls` marca `zod@4.4.3` como inválido para `@vee-validate/zod` e `shadcn-vue`.
- `vue-tsc --noEmit` passa a apontar erros específicos em schemas que usam opções Zod 3 removidas no Zod 4:
  - `required_error`
  - `invalid_type_error`
- O bridge `@vee-validate/zod` usa detalhes internos de Zod 3 (`ZodFirstPartyTypeKind`, `_def.typeName`). Com Zod 4, `describe('items[0].id')` não encontra o campo aninhado, o que pode afetar metadados de required/exists em formulários.

Conclusão atualizada:

- Atualizar o root do front para Zod 4 **não é sem perdas** enquanto `@vee-validate/zod` não publicar suporte oficial a Zod 4.
- O caminho mais seguro continua sendo manter `zod@3` no front e isolar imports browser de `@chatfunnel/contracts` para subpaths sem schemas Zod 4.
