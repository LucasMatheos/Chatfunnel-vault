# Codegen Rules — Pencil → Vue 3 ChatFunnel

Regras especificas para gerar codigo a partir de designs `.pen` no contexto do `chatfunnel-front`.

## Stack Obrigatoria

| Camada | Tecnologia | Notas |
|--------|-----------|-------|
| Framework | Vue 3.5 + Composition API | `<script setup lang="ts">` |
| CSS | Tailwind v4 | Sem `tailwind.config.js` — tudo via CSS variables |
| Componentes | shadcn-vue (Reka UI) | Componentes em `src/components/ui/` |
| Componentes custom | shadcn-custom | Componentes em `src/components/shadcn-custom/` |
| Variantes | CVA (class-variance-authority) | Pattern de barrel export |
| Icones | **Phosphor Icons Vue** | NUNCA Lucide no codigo de aplicacao |
| Validacao | VeeValidate v4 + Zod | Para formularios |
| Estado | Pinia | Stores existentes |

## Classes Tailwind ChatFunnel

### Sombras (purple-tinted)

```
shadow-sombra-1  →  0px 2px 24px rgba(55, 30, 145, 0.05)   // cards repouso
shadow-sombra-2  →  0px 2px 24px rgba(55, 30, 145, 0.10)   // hover, active
shadow-sombra-3  →  4px 16px 35px rgba(55, 30, 145, 0.10)  // dropdowns, modais
```

NUNCA usar `shadow-sm`, `shadow-md`, `shadow-lg` (sao cinza neutro).

### Border Radius

```
rounded-cf-sm    →  4px    // badges, chips
rounded-cf-md    →  6px    // inputs, botoes
rounded-cf-lg    →  8px    // cards, containers
rounded-cf-xl    →  12px   // cards grandes
rounded-cf-xxl   →  16px   // modais, dialogs
rounded-cf-full  →  9999px // avatars, pills
```

NUNCA usar `rounded-sm`, `rounded-md`, `rounded-lg` (nao tem os valores do brand).

### Tipografia

```
Headers:    typo-header-{48|40|32|28|24}-bold
Subtitles:  typo-subtitle-20-{bold|semibold|regular}, typo-subtitle-16-regular
Body 18:    typo-body-18-{bold|medium|regular}
Body 16:    typo-body-16-{bold|medium|regular}
Body 14:    typo-body-14-{bold|semibold|medium|regular}
Body 12:    typo-body-12-{bold|semibold|medium|regular}
Body 10:    typo-body-10-{bold|semibold|regular}
```

NUNCA usar `text-sm font-bold` etc — usar as classes utilitarias `typo-*`.

### Cores via CSS Variables

```css
/* Usar via Tailwind: bg-[var(--brand-500)], text-[var(--gray-1000)] */
--brand-500: #3CA1A1;     /* primary */
--gray-1000: #33303E;     /* texto primario */
--gray-700: #7A7786;      /* texto secundario */
--gray-400: #E7E7E7;      /* bordas */
--gray-200: #F9FAFC;      /* surfaces sutis */
```

Preferir classes semanticas de `shadcn-vars.css` quando existirem (ex: `bg-background`, `text-foreground`).

## Mapeamento Pencil → Tailwind

Quando traduzir propriedades do `.pen` para Tailwind:

| Propriedade Pencil | Classe Tailwind |
|-------------------|-----------------|
| `fill: "$--background"` | `bg-background` |
| `fill: "$--foreground"` | `text-foreground` |
| `fill: "$--primary"` | `bg-primary` / `text-primary` |
| `fill: "$--muted-foreground"` | `text-muted-foreground` |
| `fill: "$--border"` | `border-border` |
| `fill: "$--card"` | `bg-card` |
| `fill: "$--secondary"` | `bg-secondary` |
| `fill: "$--destructive"` | `bg-destructive` / `text-destructive` |
| `layout: "horizontal"` | `flex flex-row` |
| `layout: "vertical"` | `flex flex-col` |
| `gap: N` | `gap-{N/4}` (Tailwind usa escala de 4px) |
| `padding: N` | `p-{N/4}` |
| `padding: [V, H]` | `py-{V/4} px-{H/4}` |
| `width: "fill_container"` | `w-full` ou `flex-1` |
| `width: "fit_content"` | `w-fit` |
| `height: "fill_container"` | `h-full` ou `flex-1` |
| `alignItems: "center"` | `items-center` |
| `justifyContent: "space_between"` | `justify-between` |
| `justifyContent: "center"` | `justify-center` |
| `justifyContent: "end"` | `justify-end` |

## Regras de Componente

### Imports de icones

```vue
<!-- CORRETO -->
<script setup lang="ts">
import { PhUser, PhGear, PhMagnifyingGlass } from '@phosphor-icons/vue'
</script>

<!-- ERRADO — nunca usar Lucide em codigo de aplicacao -->
<script setup lang="ts">
import { User, Settings, Search } from 'lucide-vue-next'
</script>
```

### Reutilizar shadcn-vue

Antes de criar componente novo, verificar se existe em:
1. `src/components/ui/` — Button, Input, Select, Dialog, Card, Checkbox, Switch, etc.
2. `src/components/shadcn-custom/` — Popover, InputControl overlays, etc.

Se existe → importar e compor. Se nao existe → criar em `src/components/ui/` com barrel export + CVA.

### Pattern de barrel export

```typescript
// src/components/ui/novo-componente/index.ts
export { default as NovoComponente } from './NovoComponente.vue'
export { novoComponenteVariants } from './variants'
```

### Hierarquia de formularios

```
VeeInput (validacao) → InputControl (sem validacao) → InputRoot + Input (primitivos)
```

Nunca usar `InputRoot` diretamente em views. Usar `VeeInput` para forms com validacao, `InputControl` para forms sem validacao.

## Proibicoes

- NUNCA gerar componentes Vuetify (`v-btn`, `v-card`, etc.)
- NUNCA gerar componentes PrimeVue (`PButton`, `PCard`, etc.)
- NUNCA gerar componentes v2 (`src/components/v2/`)
- NUNCA usar hex hardcoded — usar CSS variables
- NUNCA usar sombras cinza neutro — usar `shadow-sombra-*`
- NUNCA usar radius generico — usar `rounded-cf-*`
- NUNCA usar tipografia generica — usar `typo-*`
- NUNCA usar Lucide em codigo novo de aplicacao
- NUNCA usar axios diretamente — usar services de `src/common/services/`
