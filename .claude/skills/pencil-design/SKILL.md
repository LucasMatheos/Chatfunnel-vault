---
name: pencil-design
description: Design-to-Code com Pencil.dev — prototipa telas e gera Vue 3 + Tailwind v4 + shadcn-vue aplicando brand ChatFunnel. Use quando o usuario pede para criar/prototipar/desenhar telas, gerar codigo a partir de .pen, ou menciona pencil/design/prototipo/mockup/wireframe.
---

# Pencil Design — ChatFunnel

Skill para prototipagem e geracao de codigo usando Pencil MCP com identidade visual ChatFunnel.

## Quando ativar

- Usuario pede para criar/prototipar/desenhar tela ou componente
- Usuario pede para gerar codigo a partir de `.pen`
- Mencoes: "pencil", "design", "prototipo", "mockup", "wireframe", "tela nova"
- Usuario abre ou referencia arquivo `.pen`

## Quando NAO ativar

- Trabalho puramente de codigo sem design
- Editar componentes Vue sem referencia a `.pen`
- Usar Figma ou ferramenta externa

## Convencao de arquivos

Arquivos `.pen` vivem em `vault/prototipos/`, nomeados por feature:
```
vault/prototipos/livechat-sidebar.pen
vault/prototipos/crm-pipeline.pen
vault/prototipos/funnel-editor.pen
```

**Path absoluto:** `D:\Code\4-Vinicius\Chatfunnel\vault\prototipos\`
**NUNCA** salvar `.pen` em outro diretorio.

## Fases

A skill tem 3 fases. Podem rodar individualmente ou em sequencia. Setup roda automaticamente antes de Design se tokens nao detectados.

---

### Fase 1: Setup

Prepara o ambiente Pencil com tokens ChatFunnel.

1. `get_editor_state({ include_schema: true })` — entender arquivo aberto e schema
2. Se nao tem arquivo aberto → `open_document({ filePathOrTemplate: "new" })` ou abrir `.pen` solicitado
3. `get_variables({ filePath })` — checar tokens existentes
4. Se tokens ChatFunnel nao existem → `set_variables({ filePath, variables })` com mapeamento de `references/brand-tokens.md`
5. `get_guidelines()` sem argumentos para listar disponiveis, depois selecionar conforme contexto:
   - Web App → dashboards, paineis, CRM (caso padrao)
   - Mobile App → telas mobile
   - Table → tabelas com dados

**Regras:**
- Nunca perguntar se quer aplicar brand — sempre aplica
- Todos os tools recebem `filePath` do documento ativo
- Skill cobre apenas light mode por enquanto

---

### Fase 2: Design

Cria/modifica designs aplicando brand e principios.

1. `get_guidelines({ category: "guide", name: "Design System" })`
2. `batch_get({ filePath, patterns: [{ reusable: true }] })` — listar componentes do design system
3. Compor com componentes existentes (slots, refs) quando disponiveis
4. Se nao tem design system → criar frames manuais com tokens do Setup
5. Seguir layout patterns: Sidebar+Content, Header+Content, Card Grid, etc.
6. **Max 25 operacoes** por `batch_design` — dividir por secao logica (estrutura → sidebar → content → detalhes)
7. **Validacao obrigatoria:** `get_screenshot` apos cada `batch_design`
8. Analisar screenshot criticamente:
   - Alinhamento e espacamento
   - Hierarquia visual (1 focal point por secao)
   - Cores corretas (teal brand `#3CA1A1`, nao azul generico)
   - Sombras purple-tinted `rgba(55, 30, 145, ...)` — **nunca cinza neutro**
   - Tipografia Figtree
9. Corrigir problemas e re-validar antes de prosseguir
10. Screenshot final do frame completo para aprovacao do usuario

**Principios automaticos (nao-negociaveis):**
- Sombras: `rgba(55, 30, 145, 0.05|0.10)` — nunca cinza
- Texto primario: `$--foreground` / `#33303E` — nunca preto puro
- Backgrounds sutis: `$--secondary` / `#F9FAFC` — nunca cinza puro
- Radius: escala ChatFunnel (4-16px)
- Icones: Phosphor Icons (font family no Pencil)

---

### Fase 3: Codegen

Gera componentes Vue 3 a partir do `.pen`.

1. `get_guidelines({ category: "guide", name: "Code" })`
2. `batch_get` com readDepth alto no frame alvo — extrair estrutura completa
3. `get_variables({ filePath })` — extrair tokens para CSS variables
4. **Inventario de componentes existentes** — ANTES de gerar qualquer codigo:
   - Buscar em `src/components/ui/` e `src/components/shadcn-custom/` por componentes que correspondam
   - Se componente ja existe → atualizar, nao criar novo
   - Mapear: design → componente existente vs. componente novo
5. Gerar codigo seguindo regras de `references/codegen-rules.md`:
   - `<script setup lang="ts">` — Composition API
   - **Tailwind v4** — classes utilitarias
   - **shadcn-vue** (Reka UI) — reutilizar componentes existentes
   - **CVA** para variantes quando aplicavel
   - **Phosphor Icons Vue** — nunca Lucide no codigo de aplicacao
   - CSS variables de `shadcn-vars.css` — nunca hex hardcoded
   - Sombras via `shadow-sombra-{1|2|3}`
   - Radius via `rounded-cf-{sm|md|lg|xl|xxl}` (ver tabela de mapeamento em `references/brand-tokens.md`)
   - Tipografia via `typo-{header|body}-{size}-{weight}`
6. Componentes novos em `src/components/ui/` com barrel export
7. **Nunca gerar** Vuetify, PrimeVue ou componentes v2

> Nota: Imports Lucide ja existentes dentro de componentes base `src/components/ui/` (vindos do shadcn-vue CLI) sao aceitaveis e nao devem ser substituidos.

---

## Error Handling

- **MCP server nao acessivel:** Informar usuario, sugerir verificar se Pencil.dev esta rodando
- **`set_variables` falha:** Retry uma vez, fallback para tokens manuais via `batch_design`
- **`get_screenshot` retorna vazio:** Re-executar `batch_design` da secao afetada
- **Arquivo `.pen` corrompido:** Informar usuario, criar novo com `open_document({ filePathOrTemplate: "new" })`

## Dependencias

- Skill `brand-guidelines` — referencia de cores, fontes, sombras (source of truth)
- MCP server `pencil` — todas as tools de design
- `chatfunnel-front/CLAUDE.md` — regras especificas do repo front
