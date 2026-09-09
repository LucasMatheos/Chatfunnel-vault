---
paths:
  - "chatfunnel-front/**/*.vue"
  - "chatfunnel-front/**/*.ts"
  - "chatfunnel-front/**/*.tsx"
---

# Frontend Design Quality

Regras de qualidade visual para codigo gerado no chatfunnel-front.
Carrega apenas quando editando arquivos do frontend.

## Stack

Vue 3 + Tailwind v4 + shadcn-vue. Cores e tokens estao na skill `brand-guidelines`.

## Icones

- ALWAYS use `@phosphor-icons/vue` — NUNCA Lucide, FontAwesome, MDI ou qualquer outra lib de icones em codigo novo
- Import: `import { PhArrowRight, PhCheck } from '@phosphor-icons/vue'`
- Peso padrao: `weight="regular"` — outros: `"bold"`, `"duotone"`, `"fill"`, `"light"`, `"thin"`

## Spacing e Layout

- Conter layouts com `max-w-7xl mx-auto` ou equivalente
- NUNCA usar `h-screen` para secoes full-height — usar `min-h-dvh`
- NUNCA usar flexbox percentage math (`w-[calc(33%-1rem)]`) — usar CSS Grid (`grid grid-cols-3 gap-6`)
- Breakpoints padrao: `sm`, `md`, `lg`, `xl` — mobile-first sempre
- Em telas < md, qualquer layout assimetrico DEVE cair para coluna unica

## Tipografia

- Headlines: `tracking-tight leading-none` para titulos grandes
- Body: `text-base leading-relaxed max-w-[65ch]` para paragrafos
- Controlar hierarquia com weight e cor, nao apenas tamanho
- Numeros em dashboards: usar `font-mono` (tabular nums)

## Cores (ChatFunnel)

- Usar tokens do brand — NUNCA cores hardcoded fora da paleta
- Max 1 cor de acento alem do brand teal
- NUNCA usar `#000000` puro — usar `gray-1000` (`#33303E`)
- Manter saturacao de acentos < 80% para harmonizar com neutrals

## Sombras e Profundidade

- Usar cards APENAS quando elevacao comunica hierarquia
- Para dashboards densos: preferir `border-t`, `divide-y` ou espaco negativo em vez de cards
- Sombras devem ter tint da cor de fundo (nao preto puro)
- shadcn-vue: NUNCA usar no estado default generico — customizar radius, cores e sombras pro brand

## Estados Interativos

Todo componente interativo DEVE ter:
- **Loading**: skeleton loaders que espelham o layout real (nao spinners genericos)
- **Empty state**: composicao visual indicando como popular dados
- **Error state**: feedback inline claro
- **Feedback tatil**: no `:active`, usar `scale-95` ou `-translate-y-px`

## Performance

- NUNCA animar `top`, `left`, `width`, `height` — usar `transform` e `opacity`
- Filtros visuais (grain, noise) apenas em elementos `fixed pointer-events-none`
- `will-change` apenas quando necessario e medido
- `z-index` apenas para camadas sistemicas (navbar sticky, modals, overlays)

## Anti-patterns (AI slop)

- NUNCA gerar layout de 3 cards iguais horizontais como default de features — usar grid assimetrico, zig-zag ou scroll horizontal
- NUNCA usar emojis em codigo, markup ou texto
- NUNCA usar nomes genericos em dados mock ("John Doe", "Acme Corp") — usar nomes criativos e realistas
- NUNCA usar numeros genericos em mock data (`99.99%`, `50%`) — usar dados organicos (`47.2%`, `83.7%`)
- NUNCA usar `unsplash.com` para imagens — usar `picsum.photos/seed/{id}/W/H` ou SVG
- Evitar cliches de copy: "Elevate", "Seamless", "Unleash", "Next-Gen"

## Forms

- Label ACIMA do input (nunca ao lado em mobile)
- Helper text opcional entre label e input
- Error text ABAIXO do input
- Gap padrao: `gap-2` entre elementos do bloco
