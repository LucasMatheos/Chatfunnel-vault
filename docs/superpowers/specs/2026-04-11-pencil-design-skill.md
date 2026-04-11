# Spec: Skill `pencil-design` — Design-to-Code com Pencil.dev

**Data:** 2026-04-11
**Status:** Reviewed
**Escopo:** Skill Claude Code para prototipagem e geracao de codigo usando Pencil MCP

---

## Objetivo

Criar uma skill que padronize o uso do Pencil.dev no ChatFunnel, cobrindo:
1. Configuracao automatica de brand tokens no `.pen`
2. Criacao/edicao de designs seguindo guidelines e identidade visual
3. Geracao de codigo Vue 3 + Tailwind v4 + shadcn-vue a partir dos designs

## Estrutura de Arquivos

```
.claude/skills/pencil-design/
├── SKILL.md              ← Orquestrador: triggers, 3 fases, checklist
└── references/
    ├── brand-tokens.md   ← Mapeamento tokens Pencil $-- ↔ brand ChatFunnel
    └── codegen-rules.md  ← Regras de geracao Vue 3 especificas do chatfunnel-front
```

## Triggers

### Ativa quando:
- Usuario pede para criar/prototipar/desenhar tela ou componente
- Usuario pede para gerar codigo a partir de `.pen`
- Mencoes: "pencil", "design", "prototipo", "mockup", "wireframe", "tela nova"
- Usuario abre ou referencia arquivo `.pen`

### NAO ativa quando:
- Trabalho puramente de codigo sem design
- Editar componentes Vue sem referencia a `.pen`
- Usar Figma ou ferramenta externa

## Fases

### Fase 1: Setup

**Objetivo:** Preparar ambiente Pencil com contexto ChatFunnel.

**Checklist:**
1. `get_editor_state(include_schema: true)` — entender arquivo aberto e schema
2. Se nao tem arquivo aberto → `open_document("new")` ou abrir `.pen` solicitado
3. `get_variables()` — checar tokens existentes
4. Se tokens ChatFunnel nao existem → `set_variables()` com mapeamento:

| Token Pencil | Valor ChatFunnel | Hex |
|--------------|------------------|-----|
| `$--background` | white | `#FFFFFF` |
| `$--foreground` | gray-1000 | `#33303E` |
| `$--primary` | brand-500 | `#3CA1A1` |
| `$--primary-light` | brand-100 | `#CAFFFB` |
| `$--muted-foreground` | gray-700 | `#7A7786` |
| `$--border` | gray-400 | `#E7E7E7` |
| `$--card` | white | `#FFFFFF` |
| `$--secondary` | gray-200 | `#F9FAFC` |
| `$--destructive` | red-500 | `#C91D1D` |
| `$--success` | green-500 | `#24B26E` |
| `$--font-primary` | Figtree | — |
| `$--font-secondary` | Figtree | — |
| `$--muted` | gray-300 | `#F2F2F2` |
| `$--accent` | gray-200 | `#F9FAFC` |
| `$--radius-m` | rounded-cf-lg | `8` |
| `$--radius-pill` | rounded-cf-full | `9999` |

**Mapeamento de radius Pencil → ChatFunnel (para Codegen):**

| Token Pencil | Token ChatFunnel | Valor |
|--------------|------------------|-------|
| `$--radius-none` | `rounded-cf-sm` | 4px |
| `$--radius-m` | `rounded-cf-lg` | 8px |
| `$--radius-pill` | `rounded-cf-full` | 9999px |

> Nota: A escala de radius do Pencil nao e 1:1 com a do ChatFunnel. A tabela acima e a referencia autoritativa para a fase Codegen.

5. Carregar guidelines: primeiro `get_guidelines()` sem argumentos para listar disponiveis, depois selecionar conforme contexto (`"Web App"`, `"Mobile App"`, `"Table"`)

**Regras:**
- Setup roda automaticamente antes de Design se tokens nao detectados. Nunca pergunta — sempre aplica brand.
- Todos os tools Pencil MCP recebem `filePath` do documento ativo. Se nenhum esta aberto, o passo 2 resolve.
- Skill cobre apenas light mode. Dark mode esta fora de escopo por enquanto.

### Fase 2: Design

**Objetivo:** Criar/modificar designs aplicando brand e principios.

**Checklist:**
1. Carregar `get_guidelines("guide", "Design System")`
2. `batch_get({ patterns: [{ reusable: true }] })` — listar componentes do design system do `.pen`
3. Compor com componentes existentes (slots, refs) quando disponiveis
4. Se nao tem design system → criar frames manuais com tokens do Setup
5. Seguir layout patterns: Sidebar+Content, Header+Content, Card Grid, etc.
6. Max 25 operacoes por `batch_design` — dividir por secao logica
7. **Validacao obrigatoria:** `get_screenshot` apos cada `batch_design`
8. Analisar screenshot criticamente:
   - Alinhamento e espacamento
   - Hierarquia visual (1 focal point por secao)
   - Cores corretas (teal brand, nao azul generico)
   - Sombras purple-tinted `rgba(55, 30, 145, ...)` — nunca cinza neutro
   - Tipografia Figtree
9. Corrigir problemas e re-validar antes de prosseguir
10. Screenshot final do frame completo para aprovacao do usuario

**Principios automaticos:**
- Sombras: `rgba(55, 30, 145, 0.05|0.10)` — nunca cinza
- Texto primario: `#33303E` — nunca preto puro
- Backgrounds sutis: `#F9FAFC` — nunca cinza puro
- Radius: escala ChatFunnel (4-16px)
- Icones: Phosphor Icons (font family no Pencil)

### Fase 3: Codegen

**Objetivo:** Gerar componentes Vue 3 a partir do `.pen`.

**Checklist:**
1. Carregar `get_guidelines("guide", "Code")`
2. `batch_get` com readDepth alto no frame alvo
3. `get_variables` — extrair tokens para CSS variables
4. **Inventario de componentes existentes** — antes de gerar qualquer codigo:
   - Buscar em `src/components/ui/` e `src/components/shadcn-custom/` por componentes que correspondam ao design
   - Se componente ja existe → atualizar, nao criar novo
   - Mapear quais partes do design usam componentes existentes vs. precisam de novos
5. Gerar codigo:
   - `<script setup lang="ts">` — Composition API
   - **Tailwind v4** — classes utilitarias
   - **shadcn-vue** (Reka UI) — reutilizar componentes existentes
   - **CVA** para variantes quando aplicavel
   - **Phosphor Icons Vue** — nunca Lucide no codigo gerado de aplicacao
   - CSS variables de `shadcn-vars.css` — nunca hex hardcoded
   - Sombras via `shadow-sombra-{1|2|3}`
   - Radius via `rounded-cf-{sm|md|lg|xl|xxl}` (usar tabela de mapeamento da Fase 1)
   - Tipografia via `typo-{header|body}-{size}-{weight}`
6. Componentes novos em `src/components/ui/` com barrel export
7. **Nunca gerar** Vuetify, PrimeVue ou componentes v2

> Nota sobre icones: Phosphor Icons para todo codigo de aplicacao. Imports Lucide ja existentes dentro de componentes base `src/components/ui/` (vindos do shadcn-vue CLI) sao aceitaveis e nao devem ser substituidos.

## Convencao de Arquivos `.pen`

Arquivos `.pen` vivem em `.interface-design/designs/`, nomeados por feature ou tela:

```
.interface-design/designs/
├── livechat-sidebar.pen
├── crm-pipeline.pen
├── funnel-editor.pen
└── whatsapp-settings.pen
```

## Error Handling

- **MCP server nao acessivel:** Informar usuario e sugerir verificar se Pencil.dev esta rodando
- **`set_variables` falha:** Retry uma vez, depois fallback para aplicar tokens manualmente via `batch_design`
- **`get_screenshot` retorna vazio:** Re-executar `batch_design` da secao afetada
- **Arquivo `.pen` corrompido:** Informar usuario, sugerir criar novo com `open_document("new")`

## Dependencias

- Skill `brand-guidelines` — referencia de cores, fontes, sombras
- MCP server `pencil` — todas as tools de design
- `chatfunnel-front/CLAUDE.md` — regras especificas do repo front

## Decisoes

| Decisao | Alternativa descartada | Razao |
|---------|------------------------|-------|
| Fases modulares | Skill monolitica | Flexibilidade — rodar so a fase necessaria |
| Referenciar brand-guidelines | Duplicar tokens | Manter single source of truth |
| Phosphor Icons | Lucide | Padrao do ChatFunnel definido pelo usuario |
| shadcn-vue + shadcn-custom | Incluir Vuetify/PrimeVue | Stack moderna, legado sendo descontinuado |
