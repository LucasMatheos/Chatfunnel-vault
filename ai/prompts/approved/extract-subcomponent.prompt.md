---
prompt_id: PRM-0004
status: approved
owner: lucas@grupovuk.com.br
purpose: Quebrar componente Vue grande (>150 linhas) em sub-componentes seguindo Index Pattern
scope: chatfunnel-front
risk_level: medium
human_review_required: true
last_reviewed_at: 2026-04-23
version: 1
---

# Extrair sub-componente (Index Pattern)

## Quando usar
- Componente `.vue` passou de ~150 linhas (template + script)
- Pedaço do template tem responsabilidade distinta (ex: seção de config, lista, form dentro de dialog)
- Mesma estrutura se repete em 2+ lugares

## Quando NÃO usar
- Componente tem <150 linhas mas parece "bagunçado" — refatore o script primeiro, não quebre em arquivos
- Sub-componente só seria usado 1 vez e não traz clareza
- Só para "ficar menor" sem limite semântico claro

## Contexto obrigatório a carregar
- `chatfunnel-front/CLAUDE.md` (seção Componentizacao e Organizacao)
- Componente alvo (o que vai ser quebrado)
- Componentes irmãos na mesma view (seguir convenção vizinha)

## Entrada esperada
- Caminho do componente a refatorar
- Opcional: dica sobre qual pedaço quebrar (se usuário já identificou)

## Passos

### 1. Análise
Identifique blocos do template com:
- Responsabilidade única e clara
- Estado próprio (refs/computeds usados só ali)
- Conjunto coeso de props que poderia receber

### 2. Estrutura final (Index Pattern)
```
ComponenteOriginal/
  index.vue                    # Orquestra estado + renderiza filhos
  components/
    <Secao1>.vue
    <Secao2>.vue
  composables/
    use<Feature>State.ts       # Se estado for compartilhado entre 2+ filhos
```

Se o original já é `ComponenteOriginal.vue` (arquivo solto), mova para `ComponenteOriginal/index.vue` e atualize imports.

### 3. Contrato entre pai e filhos
- **1-2 níveis de drilling**: props + emits
- **3+ níveis**: `provide/inject` com `InjectionKey<T>` tipada em `keys/`
- **Estado compartilhado entre irmãos**: composable `use*` no diretório `composables/`
- **Estado global de verdade**: Pinia store (raro nesse nível)

### 4. Nomeação dos filhos
- Descritivo: `AgentToolsList.vue`, `ObjectiveCriteriaField.vue`
- **NUNCA**: `Header.vue`, `Content.vue`, `Section1.vue`
- Se nome ficaria genérico, o sub-componente provavelmente não deveria existir

### 5. Preservação de comportamento
- Imports atualizados em todos os lugares que usam o componente
- Nenhuma prop pública do pai removida sem aviso
- Eventos emitidos mantêm mesma assinatura
- Testes existentes continuam passando sem alteração

## Saída esperada
- Commits (ou diffs) separados:
  1. Criação dos sub-componentes vazios com interface
  2. Movimentação do template
  3. Movimentação do script + composables
  4. Ajuste de imports externos

## Critérios de revisão humana
- Cada filho tem responsabilidade explicável em 1 frase
- Nenhum filho recebe >6 props (sinal de drilling ruim → usar provide/inject ou composable)
- `index.vue` ficou legível (orquestração clara, sem lógica de apresentação)
- `git diff --stat` mostra que comportamento foi preservado (poucas mudanças reais de lógica)

## Evidência mínima
- `npm run typecheck` passa
- `npm test` passa
- Visualmente idêntico ao original (checar no dev server)

## Histórico
- v1 2026-04-23 criação inicial
