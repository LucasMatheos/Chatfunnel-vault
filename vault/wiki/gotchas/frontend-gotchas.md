---
title: Frontend Gotchas
description: Armadilhas conhecidas do chatfunnel-front — componentes v2, build, HMR, atributos HTML.
tags: [gotcha, frontend, vue, vite]
severity: media
related: ["[[wiki/repos/chatfunnel-front|chatfunnel-front]]", "[[signup-profile-step]]"]
last_updated: 2026-04-13
---

# Frontend Gotchas

## InputText v2 nao repassa atributos HTML nativos

**Arquivo:** `src/components/v2/inputs/InputText.vue`

### O que acontece

Passar `maxlength`, `pattern`, `minlength`, `autofocus` etc. no uso do componente (`<input-text-v2 maxlength="100" />`) **nao tem efeito** no `<input>` interno. O atributo cai no `<div>` raiz via fallthrough e e ignorado.

### Por que

O template do componente envolve o input em um `<div class="form-group">`. Vue 3 aplica attrs do parent no elemento raiz — nesse caso o div. O `<input>` so recebe o que esta explicitamente bindado via `v-bind` ou props declaradas.

```vue
<!-- Componente -->
<div class="form-group">
  <input :type="..." :id="..." :placeholder="..." v-model="contents" />
  <!-- maxlength do parent cai aqui no div, nao no input -->
</div>
```

### Workaround

Declarar prop explicita + bindar no input interno:

```vue
<!-- no defineProps -->
maxlength: { type: [String, Number], default: null }

<!-- no template -->
<input :maxlength="maxlength" ... />
```

Validar tambem dentro de `validate()` para defesa dupla:
```js
if (props.maxlength && contents.value?.length > Number(props.maxlength)) {
  return `Maximo de ${props.maxlength} caracteres`
}
```

### Escopo

Mesmo problema em outros componentes v2 de `src/components/v2/inputs/` — todos envelopam o input/select nativo em wrapper div. Em codigo NOVO preferir `src/components/ui/` (shadcn-vue) que suporta fallthrough correto.

---

## SWC watch mode nao propaga class-validator decorators

**Repo:** `chatfunnel-services`

### O que acontece

Adicionar ou remover decorators de `class-validator` (ex: `@MaxLength`, `@IsEnum`) em DTOs com o `npm run start:dev` ja rodando **nao toma efeito** — o endpoint continua aceitando payloads invalidos.

### Por que

SWC compila o arquivo incrementalmente, mas `reflect-metadata` (usado pelo `class-validator`) depende da ordem de registro de decorators no startup. Hot reload nao reinicia o registro.

### Workaround

Ctrl+C e `npm run start:dev` novamente apos alterar decorators. Tests com `@nestjs/testing` nao tem esse problema porque criam container novo por suite.

---

## @chatfunnel/core consumers precisam de sync manual

**Script:** `sync-core.ps1` (Windows), `sync.sh` (Linux)

### O que acontece

Mudancas em `@chatfunnel/core/src/**` **nao aparecem** em consumers (`chatfunnel-services`, `chatfunnel-api` etc.) mesmo apos `npm run build` no core. O `node_modules/@chatfunnel/core/dist/` do consumer continua com a versao publicada do GitHub Packages registry.

### Por que

O pacote e resolvido via registry, nao via `file:` ou workspace. Sem publish, o consumer nao pega o dist local automaticamente.

### Workaround

Rodar `./sync-core.ps1` (ou `sync.sh`) na raiz do workspace. O script:
1. `npm run build` no core (prisma generate + tsc)
2. Copia `core/dist/*` e `core/prisma/schema.prisma` para `node_modules/@chatfunnel/core/` de services e api
3. Regenera Prisma Client no services apontando para o schema sincronizado

### Regra

**NUNCA editar manualmente** arquivos dentro de `node_modules/@chatfunnel/core/` de consumer. Sempre passar pelo build do core + sync (automatico ou manual via script).

---

## `chatfunnel-database` nao existe como repo

**Referencia:** CLAUDE.md menciona `chatfunnel-database/` como submodulo

### O que acontece

`CLAUDE.md` da raiz do workspace referencia `chatfunnel-database/` para schema Prisma, mas **o repo nao existe** localmente nem no workspace.

### Realidade

O schema Prisma vive em `chatfunnel-core/prisma/schema.prisma`. O `@chatfunnel/core` e o unico pacote que toca Prisma — consumers usam `PrismaClient` importado de `@chatfunnel/core/database`.

### Workaround

Tratar `chatfunnel-database/` no CLAUDE.md como placeholder historico ou atualizar o doc. Toda mudanca de schema vai em `chatfunnel-core`.

---

## Dialog aninhado com `:modal="false"` fica invisivel

**Arquivos de referencia:** `src/views/agents/AgentsForm/components/modals/AutomationsConfigDialog.vue`, `AutomationBuilderDialog.vue`

### O que acontece

Dialog interno aberto de dentro de outro Dialog (shadcn-vue / reka-ui) usando `:modal="false"` renderiza no DOM mas fica **invisivel e nao-clicavel**. `document.querySelectorAll('[role="dialog"]').length` sobe (ex: 1 -> 2) confirmando que o conteudo existe, mas nada aparece na tela.

### Por que

Quando o dialog externo abre em modo modal (default), reka-ui aplica globalmente:

1. `pointer-events: none` no `<body>` — so o portal do modal ativo fica interativo
2. Registra o dialog no seu stack interno de modais

O dialog interno com `:modal="false"`:

- Nao entra no stack do reka-ui
- Nao renderiza `DialogOverlay` proprio (reka-ui so renderiza overlay quando modal=true)
- O `DialogContent` e teleportado ao `<body>` como sibling do portal externo
- Herda o `pointer-events: none` propagado pelo modal externo
- Fica visualmente atras do overlay opaco (`bg-black/80` em `z-[9999]`) do externo

Resultado: existe no DOM mas e inalcancavel.

### Fix

Deixar o dialog interno como modal tambem. O reka-ui gerencia nested modals via stack LIFO: o overlay do interno empilha por cima do externo, ESC fecha o de cima primeiro, dismiss do externo nao fecha o interno.

```vue
<!-- Errado -->
<Dialog v-model:open="isOpen" :modal="false">

<!-- Certo -->
<Dialog v-model:open="isOpen">
```

Para evitar que clicar no overlay do interno feche o externo por engano, o externo deve condicionar o `close-on-overlay`:

```vue
<DialogControl :close-on-overlay="!builderIsOpen" ... />
```

Onde `builderIsOpen = computed(() => !!builderRef.value?.isOpen)`.

### Nao resolve com z-index

Tentar bumpar z-index do `DialogContent` interno (ex: `z-[100000]!`) **nao resolve** porque o bloqueio vem do `pointer-events: none` no body, nao apenas de stacking. A raiz e o modal mode, nao CSS.
