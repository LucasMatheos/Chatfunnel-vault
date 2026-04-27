---
prompt_id: PRM-0005
status: approved
owner: lucas@grupovuk.com.br
purpose: Diagnosticar bug de modal/dialog que não abre ao clicar no trigger
scope: chatfunnel-front
risk_level: low
human_review_required: true
last_reviewed_at: 2026-04-23
version: 1
origin: vault/diary/raw/22-04-2026-bug-automation-builder-dialog.md
---

# Debug: dialog não abre ao clicar

## Quando usar
- Botão de configuração/edição não abre o dialog esperado
- Dialog abre uma vez, fecha e não volta a abrir
- Dialog abre mas vem sem os dados do contexto (ex: config vazio)

## Quando NÃO usar
- Erro de renderização visível no console (ir direto pro stack trace)
- Dialog antigo Vuetify/PrimeVue — este prompt cobre shadcn-vue/Reka UI

## Contexto obrigatório a carregar
- Componente pai que dispara o dialog
- Componente do dialog em si
- Qualquer composable ou store que controla `open`/`visible`

## Hipóteses em ordem (mais comum → mais raro)

### 1. `v-model:open` desconectado
- Pai passa `:open="isOpen"` mas não escuta `@update:open`
- Ou escuta mas não atualiza o ref
- **Checar**: o componente que usa `<Dialog>` tem `v-model:open="..."` OU ambos `:open` + `@update:open`?

### 2. Estado reativo perdido
- `isOpen` declarado como `let isOpen = false` em vez de `const isOpen = ref(false)`
- Mutação direta de prop sem emit

### 3. Trigger dentro de `<form>` submetendo a página
- Botão sem `type="button"` dentro de form → submit + reload
- **Fix**: `<Button type="button">`

### 4. Event handler errado
- `@click.stop` quando não deveria, ou handler no elemento errado (wrapper consumindo o click)
- Tooltip/Popover envolvendo o botão e capturando o evento

### 5. Condicional escondendo o dialog
- `v-if="condicao && isOpen"` onde `condicao` é falsa por race condition
- Dados async ainda não chegaram → dialog renderiza sem contexto e fecha

### 6. Múltiplas instâncias do mesmo dialog
- Dialog renderizado 2x em árvores diferentes compartilhando mesmo ref
- Um fecha, outro nunca abre

### 7. Stacking / z-index com overlay antigo
- SweetAlert/Vuetify dialog anterior deixou overlay residual
- Checar no DevTools: há algum elemento `pointer-events: auto` cobrindo a tela?

### 8. Provide/inject quebrado
- Dialog espera injeção de contexto que não está no ancestral
- `inject('...')` retorna `undefined` silenciosamente

## Ferramentas de diagnóstico

1. **Vue DevTools** → selecionar componente do dialog, checar valor de `open`
2. **Console**: `console.log('trigger clicked', isOpen.value)` antes e depois do toggle
3. **DevTools > Elements**: inspecionar se `<DialogContent>` entra no DOM ao clicar
4. **Network**: se dialog carrega dados, ver se request saiu e respondeu

## Saída esperada
Resposta estruturada:
1. **Hipótese mais provável** dado o código fornecido (com linha de evidência)
2. **Fix mínimo** (diff direto no arquivo)
3. **Como validar** (passo no navegador)
4. **Prevenção**: comentário ou teste que evita regressão

## Critérios de revisão humana
- Fix não esconde a causa raiz atrás de workaround (ex: `setTimeout(() => isOpen.value = true)`)
- Teste de regressão cobre o fluxo quebrado

## Histórico
- v1 2026-04-23 criação inicial, baseado no bug registrado em vault/diary/raw/22-04-2026-bug-automation-builder-dialog.md
