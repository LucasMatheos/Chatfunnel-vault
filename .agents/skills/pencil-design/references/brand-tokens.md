# Brand Tokens — Pencil ↔ ChatFunnel

Mapeamento de variaveis Pencil `$--` para valores brand ChatFunnel.
Usado na Fase 1 (Setup) para `set_variables` e na Fase 3 (Codegen) para traduzir tokens.

## Tokens de Cor

| Token Pencil | Token ChatFunnel | Hex | Uso |
|--------------|------------------|-----|-----|
| `$--background` | white / gray-100 | `#FFFFFF` | Fundo de pagina |
| `$--foreground` | gray-1000 | `#33303E` | Texto primario |
| `$--primary` | brand-500 | `#3CA1A1` | Botoes, links, CTA |
| `$--primary-light` | brand-100 | `#CAFFFB` | Backgrounds info, tints |
| `$--muted-foreground` | gray-700 | `#7A7786` | Texto secundario, placeholders |
| `$--muted` | gray-300 | `#F2F2F2` | Backgrounds mutados |
| `$--border` | gray-400 | `#E7E7E7` | Bordas, divisores |
| `$--card` | white / gray-100 | `#FFFFFF` | Fundo de cards |
| `$--secondary` | gray-200 | `#F9FAFC` | Superficies sutis |
| `$--accent` | gray-200 | `#F9FAFC` | Hover highlights (= secondary) |
| `$--destructive` | red-500 | `#C91D1D` | Acoes perigosas |
| `$--success` | green-500 | `#24B26E` | Status positivo |

## Tokens de Tipografia

| Token Pencil | Valor | Notas |
|--------------|-------|-------|
| `$--font-primary` | `Figtree` | Headers, labels, navegacao |
| `$--font-secondary` | `Figtree` | Body text, descricoes |

Font stack completo: `"Figtree", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, "Noto Sans"`

## Tokens de Radius

A escala de radius do Pencil NAO e 1:1 com a do ChatFunnel. Use esta tabela como referencia autoritativa.

### Pencil → Valor

| Token Pencil | Valor |
|--------------|-------|
| `$--radius-none` | `0` |
| `$--radius-m` | `8` |
| `$--radius-pill` | `9999` |

### Pencil → Tailwind ChatFunnel (para Codegen)

| Token Pencil | Classe Tailwind | Valor | Uso |
|--------------|-----------------|-------|-----|
| `$--radius-none` | `rounded-cf-sm` | 4px | Badges, chips |
| `$--radius-m` | `rounded-cf-lg` | 8px | Cards, containers |
| `$--radius-pill` | `rounded-cf-full` | 9999px | Avatars, pills |

Escala completa ChatFunnel (para referencia no codegen):

| Classe | Valor | Uso |
|--------|-------|-----|
| `rounded-cf-sm` | 4px | Badges, chips |
| `rounded-cf-md` | 6px | Inputs, botoes |
| `rounded-cf-lg` | 8px | Cards, containers |
| `rounded-cf-xl` | 12px | Cards grandes, secoes |
| `rounded-cf-xxl` | 16px | Modais, dialogs |
| `rounded-cf-full` | 9999px | Avatars, pills |

## Sombras

Purple-tinted — NUNCA cinza neutro. Elemento visual mais distintivo do ChatFunnel.

| Nivel | Token CSS | Valor | Uso |
|-------|-----------|-------|-----|
| Whisper | `shadow-sombra-1` | `0px 2px 24px rgba(55, 30, 145, 0.05)` | Cards em repouso |
| Soft | `shadow-sombra-2` | `0px 2px 24px rgba(55, 30, 145, 0.10)` | Hover, active |
| Elevated | `shadow-sombra-3` | `4px 16px 35px rgba(55, 30, 145, 0.10)` | Dropdowns, modais |

## Formato para set_variables

Exemplo de payload para `set_variables`:

```json
{
  "filePath": "<path-to-pen>",
  "variables": {
    "$--background": { "type": "color", "value": "#FFFFFF" },
    "$--foreground": { "type": "color", "value": "#33303E" },
    "$--primary": { "type": "color", "value": "#3CA1A1" },
    "$--primary-light": { "type": "color", "value": "#CAFFFB" },
    "$--muted-foreground": { "type": "color", "value": "#7A7786" },
    "$--muted": { "type": "color", "value": "#F2F2F2" },
    "$--border": { "type": "color", "value": "#E7E7E7" },
    "$--card": { "type": "color", "value": "#FFFFFF" },
    "$--secondary": { "type": "color", "value": "#F9FAFC" },
    "$--accent": { "type": "color", "value": "#F9FAFC" },
    "$--destructive": { "type": "color", "value": "#C91D1D" },
    "$--success": { "type": "color", "value": "#24B26E" },
    "$--font-primary": { "type": "font", "value": "Figtree" },
    "$--font-secondary": { "type": "font", "value": "Figtree" },
    "$--radius-m": { "type": "number", "value": 8 },
    "$--radius-pill": { "type": "number", "value": 9999 }
  }
}
```

> Nota: O formato exato de `variables` depende do schema do `.pen`. Usar `get_editor_state({ include_schema: true })` na Fase 1 para confirmar a estrutura antes de chamar `set_variables`.