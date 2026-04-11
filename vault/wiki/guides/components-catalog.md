---
title: Catalogo de Componentes
description: Referencia completa dos componentes ui/ e shadcn-custom/ do chatfunnel-front — imports, props, slots, hierarquia e guia rapido.
tags: [guide, components, design-system, chatfunnel-front]
related: ["[[calendar-permissions]]", "[[onboarding-flow]]"]
last_updated: 2026-04-09
---

# Catalogo de Componentes

Referencia completa dos componentes em `ui/` (design system base) e `shadcn-custom/` (compostos de dominio).

---

## `components/ui/` — Design System Base

Componentes base construidos sobre **Reka UI** + **Tailwind CSS v4** + **CVA**. Preferir estes para todo codigo novo.

### Accordion

```ts
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
```

| Prop | Tipo | Default | Descricao |
|------|------|---------|-----------|
| type | `'single' \| 'multiple'` | `'multiple'` | Modo de expansao |
| modelValue | `string \| string[]` | — | Itens abertos (v-model) |
| collapsible | `boolean` | `true` | Permitir fechar todos |
| disabled | `boolean` | — | Desabilitar interacao |

**Variantes CVA:** `default`, `ghost`, `brand`, `subtle`, `elevated`

---

### Alert

```ts
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
```

| Prop | Tipo | Default | Descricao |
|------|------|---------|-----------|
| variant | `'default' \| 'destructive'` | `'default'` | Estilo visual |

---

### AlertDialog

```ts
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
  AlertDialogTrigger, AlertDialogProvider,
  useAlertDialog, showConfirmation, showAlertSuccess, showAlertError
} from '@/components/ui/alert-dialog'
```

| Prop (Content) | Tipo | Default | Descricao |
|----------------|------|---------|-----------|
| size | `'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Largura do dialog |

**Uso programatico:**
```ts
const result = await showConfirmation('Tem certeza?')
if (result.isConfirmed) { /* ... */ }
```

> Requer `<AlertDialogProvider />` no `App.vue`.

---

### BackButton

```ts
import { BackButton } from '@/components/ui/back-button'
```

Botao de voltar com `router.back()`. Sem props.

---

### Badge

```ts
import { Badge } from '@/components/ui/badge'
```

| Prop | Tipo | Default | Descricao |
|------|------|---------|-----------|
| size | `'sm' \| 'md' \| 'lg' \| 'agent'` | `'md'` | Tamanho |
| color | `'gray' \| 'brand' \| 'destructive' \| 'success' \| 'founder'` | `'gray'` | Cor |
| hierarchy | `'primary' \| 'outlined' \| 'agent'` | `'primary'` | Estilo |
| showDot | `boolean` | — | Indicador de status |
| showCheck | `boolean` | — | Icone de check |
| clickable | `boolean` | — | Cursor pointer |

**Slots:** `startIcon`, `default`, `endIcon`

---

### Button

```ts
import { Button } from '@/components/ui/button'
```

| Prop | Tipo | Default | Descricao |
|------|------|---------|-----------|
| variant | `'default' \| 'outline' \| 'link' \| 'icon'` | `'default'` | Estilo |
| size | `'small' \| 'medium' \| 'large' \| 'icon-sm' \| 'icon-md' \| 'icon-lg' \| 'stepper' \| 'rounded' \| 'auto'` | `'medium'` | Tamanho |
| tone | `'primary' \| 'success' \| 'danger' \| 'dark'` | `'primary'` | Tom de cor |

**Slots:** `startIcon`, `default`, `endIcon`

---

### Calendar

```ts
import { Calendar } from '@/components/ui/calendar'
```

Calendario baseado em Reka UI. Suporta layouts: `month-and-year`, `month-only`, `year-only`.

---

### Card

```ts
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction, CardControl } from '@/components/ui/card'
```

Container composicional sem props obrigatorias. Combinar sub-componentes para estrutura.

---

### Chart

```ts
import { ChartContainer, ChartTooltip, ChartLegend } from '@/components/ui/chart'
```

Wrapper para chart.js + Unovis. Inclui config e estilo.

---

### Checkbox

```ts
import { Checkbox, CheckboxControl, VeeCheckbox } from '@/components/ui/checkbox'
```

| Prop | Tipo | Default | Descricao |
|------|------|---------|-----------|
| size | `'sm' \| 'md' \| 'lg'` | `'md'` | Tamanho (16/20/24px) |
| checked | `boolean \| 'indeterminate'` | `false` | Estado |
| disabled | `boolean` | — | Desabilitado |

**Hierarquia:** `VeeCheckbox` (validacao) > `CheckboxControl` (sem validacao) > `Checkbox` (primitivo)

---

### ColorPicker

```ts
import { ColorPicker, ColorPickerDot } from '@/components/ui/color-picker'
```

Seletor de cor com paleta predefinida.

---

### Dialog

```ts
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from '@/components/ui/dialog'
```

| Prop | Tipo | Default | Descricao |
|------|------|---------|-----------|
| open | `boolean` | — | Estado aberto (v-model:open) |

Modal com overlay, animacoes fade/zoom, posicionamento centralizado.

---

### DropdownMenu

```ts
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuGroup,
  DropdownMenuCheckboxItem, DropdownMenuRadioItem, DropdownMenuRadioGroup,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent
} from '@/components/ui/dropdown-menu'
```

Menu dropdown completo com sub-menus, checkboxes, radio groups. Navegacao por teclado.

---

### Field

```ts
import { Field, FieldLabel, FieldDescription, FieldError, FieldRoot, FieldControl } from '@/components/ui/field'
```

| Prop | Tipo | Default | Descricao |
|------|------|---------|-----------|
| orientation | `'vertical' \| 'horizontal'` | `'vertical'` | Direcao do layout |
| disabled | `boolean` | — | Desabilitar |
| required | `boolean` | — | Obrigatorio |
| invalid | `boolean` | — | Estado de erro |

**Uso com Switch:**
```vue
<Field orientation="horizontal" class="w-auto">
  <SwitchControl id="meu-switch" v-model:checked="valor"/>
  <FieldLabel :for="'meu-switch'">Label</FieldLabel>
</Field>
```

---

### FileDropzone

```ts
import { FileDropzone, FileUploadItem, VeeFileDropzone, FileGalleryModal } from '@/components/ui/file-dropzone'
```

Upload de arquivos com drag-and-drop, progresso, validacao, galeria. Suporta arquivos existentes e retry.

**Composables:** `useFileValidation`, `useDragAndDrop`, `useFileUpload`

---

### Input

```ts
import { Input, InputRoot, InputControl, VeeInput } from '@/components/ui/input'
```

| Prop (InputControl) | Tipo | Default | Descricao |
|---------------------|------|---------|-----------|
| modelValue | `string \| number` | — | Valor (v-model) |
| invalid | `boolean` | — | Estado de erro |
| valid | `boolean` | — | Estado de sucesso |
| disabled | `boolean` | — | Desabilitado |
| placeholder | `string` | — | Texto placeholder |

**Hierarquia:** `VeeInput` (validacao) > `InputControl` (sem validacao) > `InputRoot` + `Input` (primitivos internos)

**Slots (InputRoot):** `left`, `right` (icones/adornos)

---

### InputCurrency

```ts
import { InputCurrency, VeeInputCurrency } from '@/components/ui/input-currency'
```

| Prop | Tipo | Default | Descricao |
|------|------|---------|-----------|
| modelValue | `number` | — | Valor numerico (v-model) |
| prefix | `string` | `'R$'` | Prefixo de moeda |
| placeholder | `string` | `'0,00'` | Placeholder |

Formatacao automatica pt-BR (1.234,56).

---

### InputDate

```ts
import { InputDateControl, VeeInputDate } from '@/components/ui/input-date'
```

Seletor de data com calendario em popover. Usa `DateValue` do `@internationalized/date`.

---

### InputDateTime

```ts
import { InputDateTimeControl, VeeInputDateTime } from '@/components/ui/input-datetime'
```

| Prop | Tipo | Default | Descricao |
|------|------|---------|-----------|
| modelValue | `CalendarDateTime` | — | Data e hora (v-model) |
| placeholder | `string` | `'dd/mm/aaaa hh:mm'` | Placeholder |
| locale | `string` | `'pt-BR'` | Locale |
| minuteIncrement | `number` | `5` | Incremento de minutos |
| disabled | `boolean` | — | Desabilitado |
| invalid | `boolean` | — | Estado de erro |

Calendario + colunas de hora/minuto em popover. Usa `CalendarDateTime` do `@internationalized/date`.

---

### Label

```ts
import { Label } from '@/components/ui/label'
```

Label semantico com prop `for` para associacao com inputs.

---

### NativeSelect

```ts
import { NativeSelect } from '@/components/ui/native-select'
```

Select nativo HTML estilizado com chevron. Slots para `<option>`.

---

### Popover

```ts
import { Popover, PopoverTrigger, PopoverContent, PopoverAnchor } from '@/components/ui/popover'
```

Popover flutuante Reka UI. Suporta ancoragem, posicionamento, dismissal.

---

### RadioGroup

```ts
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel, RadioGroupControl, VeeRadioGroup } from '@/components/ui/radio-group'
```

| Prop | Tipo | Default | Descricao |
|------|------|---------|-----------|
| modelValue | `string` | — | Valor selecionado (v-model) |
| orientation | `'vertical' \| 'horizontal'` | `'vertical'` | Direcao |
| invalid | `boolean` | `false` | Estado de erro |

**Variantes CVA (tamanhos):** `sm` (16px), `md` (20px), `lg` (24px)

---

### Select

```ts
import { Select, SelectTrigger, SelectContent, SelectItem, SelectControl, VeeSelect } from '@/components/ui/select'
```

Select acessivel Reka UI com scrolling, grouping, search.

**Hierarquia:** `VeeSelect` (validacao) > `SelectControl` (sem validacao) > `Select` + sub-componentes (primitivos)

---

### Separator

```ts
import { Separator } from '@/components/ui/separator'
```

| Prop | Tipo | Default | Descricao |
|------|------|---------|-----------|
| orientation | `'horizontal' \| 'vertical'` | `'horizontal'` | Direcao |
| decorative | `boolean` | — | Ocultar de a11y |

---

### Skeleton

```ts
import { Skeleton } from '@/components/ui/skeleton'
```

Placeholder de loading com animacao pulse. Usar para espelhar layout final durante carregamento.

```vue
<Skeleton class="h-4 w-32" />      <!-- texto -->
<Skeleton class="h-10 w-full rounded-cf-lg" />  <!-- input -->
```

---

### Sonner (Toaster)

```ts
import { Toaster } from '@/components/ui/sonner'
```

Sistema de toast via vue-sonner. Configurado no `App.vue`. Usar via `useAlerts()` composable.

---

### Spinner

```ts
import { Spinner } from '@/components/ui/spinner'
```

Icone de loading animado (Loader2Icon). Personalizar tamanho via `class`.

---

### Stepper

```ts
import { Stepper, StepperItem, StepperIndicator, StepperSeparator, StepperTitle, StepperDescription, StepperControl } from '@/components/ui/stepper'
```

Wizard multi-step com indicadores (pending/active/completed/error) e orientacao horizontal/vertical.

**Metodos expostos:** `goToStep(step)`, `nextStep()`, `prevStep()`

---

### Switch

```ts
import { Switch, SwitchControl, VeeSwitch } from '@/components/ui/switch'
```

| Prop | Tipo | Default | Descricao |
|------|------|---------|-----------|
| checked | `boolean` | — | Estado (v-model:checked) |
| disabled | `boolean` | — | Desabilitado |
| id | `string` | — | Para associar com FieldLabel via for |

**Hierarquia:** `VeeSwitch` (validacao) > `SwitchControl` (sem validacao) > `Switch` (primitivo)

---

### Tabs

```ts
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
```

| Prop | Tipo | Default | Descricao |
|------|------|---------|-----------|
| modelValue | `string` | — | Tab ativa (v-model) |
| defaultValue | `string` | — | Tab inicial |

---

### Tooltip

```ts
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
```

Tooltip flutuante Reka UI. Suporta posicionamento, delay, arrow.

---

### Typography

```ts
import { PageTitle, PageSubtitle } from '@/components/ui/typography'
```

Componentes semanticos de tipografia para titulos e subtitulos de pagina.

---

## `components/shadcn-custom/` — Componentes Compostos

Componentes mais complexos que combinam primitivos `ui/` com logica de dominio.

### AgentSelector

```ts
import { AgentSelector, AgentSelectorDialog, AgentSelectorCard, AgentSelectorEmpty } from '@/components/shadcn-custom/agent-selector'
```

| Prop | Tipo | Default | Descricao |
|------|------|---------|-----------|
| modelValue | `SelectedAgent \| null` | — | Agente selecionado (v-model) |
| loading | `boolean` | — | Estado de loading |
| readonly | `boolean` | — | Somente leitura |

**Tipos:**
```ts
type AgentVersion = 'v1' | 'v2'
interface SelectedAgent { id: string; name: string; version: AgentVersion; model: string; extra?: Record<string, any> }
```

Seletor de agentes IA (v1/v2) com dialog, tabs, busca. Exibe card do agente selecionado com opcoes de alterar/remover.

---

### InputChannels

```ts
import { InputChannels } from '@/components/shadcn-custom/input-channels'
```

| Prop | Tipo | Default | Descricao |
|------|------|---------|-----------|
| modelValue | `string \| null` | — | ID do canal (v-model) |
| type | `string \| null` | — | Filtrar por tipo de canal |
| onlyAvatar | `boolean` | — | Mostrar apenas avatar no trigger |
| includeAllOption | `boolean` | — | Opcao "Todos" |
| channelIds | `string[] \| null` | — | Whitelist de canais |
| disabled | `boolean` | — | Desabilitado |

**Emits:** `update:modelValue`, `channel-selected`

Seletor de canais (WhatsApp, Instagram, etc.) em popover. Busca canais via OrganizationService.

---

### InputCustomFields

```ts
import { InputCustomFields } from '@/components/shadcn-custom/input-custom-fields'
```

| Prop | Tipo | Default | Descricao |
|------|------|---------|-----------|
| value | `any` | — | Campo selecionado |
| variant | `'chips' \| 'input'` | `'chips'` | Modo de exibicao |
| required | `boolean` | — | Obrigatorio |
| hideSystem | `boolean` | — | Ocultar campos do sistema |
| emitId | `boolean` | — | Emitir ID em vez do objeto |

**Emits:** `update:value`, `toggle-field`, `delete-field`

Seletor de campos customizados com criacao/exclusao. Popover com busca.

---

### InputTextTag

```ts
import { InputTextTag, EditableContent, VariablesPopover, EmojiPopover, useContactFields, useEditableCursor } from '@/components/shadcn-custom/input-text-tag'
```

| Prop | Tipo | Default | Descricao |
|------|------|---------|-----------|
| modelValue | `string` | `''` | Texto (v-model) |
| singleLine | `boolean` | — | Modo linha unica |
| max | `number` | `1000` | Limite de caracteres |
| hasValidation | `boolean` | — | Habilitar validacao |
| placeholder | `string` | — | Placeholder |
| returnTags | `boolean` | — | Retornar tags no valor |
| hasCurrentMessage | `boolean` | — | Incluir variavel de mensagem atual |

**Metodos expostos:** `setText(text)`, `getText()`, `isValid()`

Editor rich-text com insercao de variaveis (`{{$.contactData.name}}`) e emojis. Toolbar dinamica aparece em hover/focus.

---

### InputTimePicker

```ts
import { InputTimePicker, VeeInputTimePicker } from '@/components/shadcn-custom/input-time-picker'
```

| Prop | Tipo | Default | Descricao |
|------|------|---------|-----------|
| modelValue | `string \| null` | — | Horario "HH:MM" (v-model) |
| placeholder | `string` | `'HH:MM'` | Placeholder |
| minuteStep | `number` | `5` | Incremento de minutos |
| minTime | `string \| null` | — | Horario minimo |
| maxTime | `string \| null` | — | Horario maximo |
| disabled | `boolean` | — | Desabilitado |
| invalid | `boolean` | — | Estado de erro |

Seletor de horario com colunas scrollaveis (00-23 horas, minutos por step). Suporta constraints min/max. Icone de relogio.

---

### InputTimezone

```ts
import { InputTimezone, VeeInputTimezone } from '@/components/shadcn-custom/input-timezone'
```

| Prop | Tipo | Default | Descricao |
|------|------|---------|-----------|
| modelValue | `string \| null` | — | Timezone IANA (v-model) |
| placeholder | `string` | `'Selecione o fuso horario'` | Placeholder |
| disabled | `boolean` | — | Desabilitado |

Seletor de fuso horario via Intl API. Busca por nome, valor ou offset UTC. Auto-detecta timezone do sistema.

---

### SelectTemplate

```ts
import { SelectTemplate } from '@/components/shadcn-custom/select-template'
```

| Prop | Tipo | Default | Descricao |
|------|------|---------|-----------|
| modelValue | `TemplateInfo \| string \| null` | — | Template (v-model) |
| channelId | `string` | — | Canal para buscar templates |
| valueKey | `'id' \| 'internalId'` | `'id'` | Chave de valor |
| disabled | `boolean` | — | Desabilitado |

**Emits:** `update:modelValue`, `select-template`

Seletor de templates WhatsApp. Busca via WhatsAppService. Mostra nome, categoria (Marketing) e status de aprovacao.

---

### SystemBar

```ts
import { SystemBarContainer, SystemBarCard } from '@/components/shadcn-custom/system-bar'
import type { SystemBar, BarSeverity, BarDismissStrategy } from '@/components/shadcn-custom/system-bar'
```

| Prop (Container) | Tipo | Default | Descricao |
|------------------|------|---------|-----------|
| visibleBars | `SystemBar[]` | — | Barras visiveis |
| primaryBar | `SystemBar \| null` | — | Barra principal |
| extraCount | `number` | — | Contagem extra |

**Severidades:** `critical` > `alert` > `warning` > `info` > `context`
**Dismiss:** `'route'` (ao navegar), `'session'` (pela sessao), `'none'` (nao dispensavel)

Barra de notificacao fixa (top-right). Prioriza por severidade. Animacoes staggered.

**Composable:** `useSystemBars` para gerenciar estado.

---

### TabUnderline

```ts
import { TabUnderline, TabUnderlineList, TabUnderlineItem, TabUnderlineContent } from '@/components/shadcn-custom/tab-underline'
```

| Prop (TabUnderline) | Tipo | Default | Descricao |
|---------------------|------|---------|-----------|
| modelValue | `string` | — | Tab ativa (v-model) |
| defaultValue | `string` | — | Tab inicial |

| Prop (TabUnderlineItem) | Tipo | Default | Descricao |
|-------------------------|------|---------|-----------|
| value | `string` | — | Identificador da tab |
| disabled | `boolean` | — | Desabilitada |

Sistema de tabs com indicador underline. Navegacao por teclado (setas, Home, End). Context via provide/inject.

---

## Guia Rapido: Qual componente usar?

| Necessidade | Componente | Import |
|-------------|-----------|--------|
| Botao | `Button` | `ui/button` |
| Input de texto | `InputControl` / `VeeInput` | `ui/input` |
| Input de moeda | `InputCurrency` | `ui/input-currency` |
| Input de data | `InputDateControl` | `ui/input-date` |
| Input de data+hora | `InputDateTimeControl` | `ui/input-datetime` |
| Input de horario | `InputTimePicker` | `shadcn-custom/input-time-picker` |
| Input de timezone | `InputTimezone` | `shadcn-custom/input-timezone` |
| Select | `SelectControl` / `VeeSelect` | `ui/select` |
| Select nativo | `NativeSelect` | `ui/native-select` |
| Checkbox | `CheckboxControl` / `VeeCheckbox` | `ui/checkbox` |
| Radio | `RadioGroupControl` / `VeeRadioGroup` | `ui/radio-group` |
| Switch/Toggle | `SwitchControl` / `VeeSwitch` | `ui/switch` |
| Upload de arquivo | `FileDropzone` | `ui/file-dropzone` |
| Seletor de cor | `ColorPicker` | `ui/color-picker` |
| Seletor de canal | `InputChannels` | `shadcn-custom/input-channels` |
| Seletor de agente | `AgentSelector` | `shadcn-custom/agent-selector` |
| Seletor de template | `SelectTemplate` | `shadcn-custom/select-template` |
| Campos customizados | `InputCustomFields` | `shadcn-custom/input-custom-fields` |
| Texto com variaveis | `InputTextTag` | `shadcn-custom/input-text-tag` |
| Modal/Dialog | `Dialog` | `ui/dialog` |
| Confirmacao | `showConfirmation` | `ui/alert-dialog` |
| Alerta | `Alert` | `ui/alert` |
| Toast | via `useAlerts()` | `composables/AlertsComposable` |
| Loading | `Skeleton` | `ui/skeleton` |
| Tabs | `Tabs` / `TabUnderline` | `ui/tabs` / `shadcn-custom/tab-underline` |
| Dropdown | `DropdownMenu` | `ui/dropdown-menu` |
| Tooltip | `Tooltip` | `ui/tooltip` |
| Accordion | `Accordion` | `ui/accordion` |
| Card | `Card` | `ui/card` |
| Badge | `Badge` | `ui/badge` |
| Stepper | `Stepper` | `ui/stepper` |
| Separador | `Separator` | `ui/separator` |
| Notificacao fixa | `SystemBar` | `shadcn-custom/system-bar` |
| Voltar | `BackButton` | `ui/back-button` |
| Titulo pagina | `PageTitle` | `ui/typography` |
