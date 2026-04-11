# ChatFunnel — Interface Design System

## Intent

**Who:** Business owners and marketing managers in Brazil managing customer conversations across WhatsApp, Instagram, and Facebook. Non-technical. They open this between customer calls, not in a dark IDE.

**Task:** Respond to customers, build automation funnels, track deals in CRM, send broadcasts. Core verb: *communicate efficiently at scale*.

**Feel:** A well-organized desk. Professional but warm — not corporate cold, not startup playful. Approachable complexity: lots of features, zero intimidation.

## Domain

Conversations, funnels (flow/progression), channels (WhatsApp/Instagram/Facebook), CRM pipelines (kanban stages), automation triggers/conditions/actions, broadcast scheduling/targeting, livechat real-time, AI agents.

## Color World

| Token | Hex | Role |
|-------|-----|------|
| `brand-100` | `#CAFFFB` | Lightest tint — backgrounds, info boxes |
| `brand-200` | `#00E8DC` | Bright accent — hover, active states |
| `brand-400` | `#22C6BA` | Mid accent |
| `brand-500` | `#3CA1A1` | Primary — buttons, links, focus rings |
| `brand-700` | `#3C7C7F` | Dark accent — pressed states |
| `brand-900` | `#2F585E` | Darkest — text on light backgrounds |

**Temperature:** Teal brand on purple-gray neutrals. Warm without being friendly-cute. The teal evokes water/flow/connectivity — fitting for a messaging platform.

**Grays have purple undertones** — not neutral:

| Token | Hex | Role |
|-------|-----|------|
| `gray-100` | `#FFFFFF` | Pure white — backgrounds, cards |
| `gray-200` | `#F9FAFC` | Off-white — sidebar, subtle surfaces |
| `gray-300` | `#F2F2F2` | Near-white — muted backgrounds |
| `gray-400` | `#E7E7E7` | Borders, input borders |
| `gray-500` | `#D0D0D2` | Disabled borders, dividers |
| `gray-600` | `#8C8A97` | Lavender-gray — placeholder text |
| `gray-700` | `#7A7786` | Secondary/muted text |
| `gray-800` | `#5F5C6B` | Tertiary text |
| `gray-900` | `#4E4B59` | Strong secondary text |
| `gray-1000` | `#33303E` | Purple-gray — primary text |

**Green (success):**

| Token | Hex |
|-------|-----|
| `green-100` | `#E2FBEF` |
| `green-200` | `#B7F5D7` |
| `green-400` | `#29C87C` |
| `green-500` | `#24B26E` |
| `green-700` | `#1E985E` |
| `green-900` | `#1A8452` |

**Red (error/destructive):**

| Token | Hex |
|-------|-----|
| `red-100` | `#FFE7E7` |
| `red-200` | `#FFCCCC` |
| `red-400` | `#E23434` |
| `red-500` | `#C91D1D` |
| `red-700` | `#F93131` |
| `red-900` | `#EE0707` |

### Semantic Token Mapping

| Token | Maps to | Use |
|-------|---------|-----|
| `primary` / `primary-foreground` | `brand-500` / `gray-100` | Buttons, links, focus rings |
| `secondary` / `secondary-foreground` | `gray-200` / `gray-1000` | Secondary actions, subtle backgrounds |
| `muted` / `muted-foreground` | `gray-300` / `gray-700` | Muted surfaces, placeholder text |
| `accent` / `accent-foreground` | `gray-200` / `gray-1000` | Hover highlights |
| `destructive` / `destructive-foreground` | `red-500` / `gray-100` | Delete, error actions |
| `success` / `success-foreground` | `green-500` / `gray-100` | Success states |
| `card` / `card-foreground` | `gray-100` / `gray-1000` | Card surfaces |
| `border` | `gray-400` | Standard borders |
| `input` | `gray-400` | Input borders |
| `ring` | `brand-500` | Focus rings |

## Signature

**Purple-tinted shadows** — `rgba(55, 30, 145, opacity)`. Most apps use neutral gray shadows. ChatFunnel's elevation has a subtle violet warmth. This is the single most distinctive visual element — it touches every card, dropdown, and modal.

Combined with teal brand and purple-gray text, it creates a color temperature no other SaaS has.

## Depth Strategy

**Subtle shadows** (purple-tinted), 3-tier scale:

| Level | Token | Values | Use |
|-------|-------|--------|-----|
| Whisper | `sombra-1` | `0px 2px 24px rgba(55,30,145, 0.05)` | Cards at rest, subtle lift |
| Soft | `sombra-2` | `0px 2px 24px rgba(55,30,145, 0.10)` | Hover, active cards |
| Elevated | `sombra-3` | `4px 16px 35px rgba(55,30,145, 0.10)` | Dropdowns, modals, popovers |

Borders supplement shadows — `border-gray-400` (`#E7E7E7`) for standard separation. Use rgba borders for softer separation where needed.

## Typography

**Typeface:** Figtree — geometric but friendly. Not corporate (Inter), not playful (Nunito). It has enough personality to feel warm without losing professionalism.

**Scale:**

| Level | Size | Weight | Line-height | Use |
|-------|------|--------|-------------|-----|
| Display | 48/40/32px | 700 (bold) | 1.25 | Page titles, hero numbers |
| Heading | 28/24px | 700 (bold) | 1.25 | Section headers |
| Subtitle | 20px | 400/600/700 | 1.25 | Card titles, subsections |
| Subtitle | 16px | 400 | 1.25 | Smaller subsections |
| Body | 18/16px | 400/500/700 | 1.5 | Content, descriptions |
| Body | 14px | 400/500/600/700 | 1.5 | Default body, form labels |
| Caption | 12/10px | 400/600/700 | 1.25 | Labels, metadata, badges |

**Tracking:** 0 for all levels (tokens define `--tracking-tight: -0.01em` but utilities use `--tracking-normal: 0`).

**Utility classes (exact inventory):**

Headers (bold only):
`typo-header-{48|40|32|28|24}-bold`

Subtitles:
`typo-subtitle-20-{bold|semibold|regular}`, `typo-subtitle-16-regular`

Body 18 (no semibold):
`typo-body-18-{bold|medium|regular}`

Body 16 (no semibold):
`typo-body-16-{bold|medium|regular}`

Body 14 (all 4 weights):
`typo-body-14-{bold|semibold|medium|regular}`

Body 12 (all 4 weights):
`typo-body-12-{bold|semibold|medium|regular}`

Body 10 (no medium):
`typo-body-10-{bold|semibold|regular}`

## Spacing

**Base unit:** 4px (Tailwind default)

| Context | Value | Tailwind |
|---------|-------|----------|
| Icon gap | 4-8px | `gap-1` / `gap-2` |
| Component internal | 8-12px | `gap-2` / `gap-3` |
| Card padding | 16-24px | `p-4` / `p-6` |
| Section gap | 24-32px | `gap-6` / `gap-8` |
| Dialog padding | 40px | `p-10` |
| Dialog internal gap | 48px | `gap-12` |

## Border Radius

Tight scale — technical but not sharp:

| Token | Value | Use |
|-------|-------|-----|
| `rounded-cf-sm` | 4px | Small badges, chips |
| `rounded-cf-md` | 6px | Inputs, buttons |
| `rounded-cf-lg` | 8px | Cards, containers |
| `rounded-cf-xl` | 12px | Larger cards, sections |
| `rounded-cf-xxl` | 16px | Modals, dialogs |
| `rounded-cf-full` | 9999px | Avatars, pills |

Exception: Dialog uses `rounded-[24px]` (outside scale).

## Surfaces

Sidebar uses same-family background as canvas (`gray-200: #F9FAFC`) with border separation — not a different color world. Content areas use `gray-100` (#FFFFFF) or `gray-200` for slight differentiation.

Inputs are slightly darker than surroundings (inset feel).

## Component Library

**Base:** shadcn-vue (Reka UI) in `src/components/ui/`
**Variants:** CVA (class-variance-authority) — each component exports variants via `index.ts`
**Legacy:** Vuetify 3 + PrimeVue 3 — do NOT use in new code
**Icons:** @phosphor-icons/vue — local imports only, never global

### Button Variants
- **Variants:** `default`, `outline`, `link`, `icon`
- **Tones:** `primary`, `success`, `danger`, `dark`
- **Sizes:**

| Size | Dimensions | Radius | Use |
|------|-----------|--------|-----|
| `small` | h-8, min-w-[151px], px-3 | `rounded-cf-sm` | Compact actions, tables |
| `medium` | h-[45px], min-w-[181px], px-4 | `rounded-cf-md` | Default — forms, dialogs |
| `large` | h-14, min-w-[210px], px-5 | `rounded-cf-lg` | Hero CTAs, prominent actions |
| `icon-sm` | h-8, w-8 | `rounded-cf-sm` | Small icon buttons |
| `icon-md` | h-[45px], w-[45px] | `rounded-cf-md` | Default icon buttons |
| `icon-lg` | h-14, w-14 | `rounded-cf-lg` | Large icon buttons |
| `stepper` | h-6, w-6 | `rounded-full` | Stepper navigation dots |
| `rounded` | h-8, w-8 | `rounded-full` | Circular icon buttons |
| `auto` | w-auto | — | Inline/flexible width |

- **Default:** `variant: default`, `size: medium`, `tone: primary`

### Input Pattern
- With validation: `VeeInput` / `VeeSelect` / `VeeCheckbox`
- Without validation: `InputControl` (includes InputRoot + Input + StatusIcon)
- Never use `InputRoot` directly in views

### States
- Use `data-*` attributes: `data-invalid`, `data-disabled`
- CSS: `data-[invalid=true]:border-red-400`

### Loading
- Prefer `Skeleton` for content loading (lists, data, remote content) — mirror final layout dimensions
- `Spinner` exists for short inline actions (button submit, save) where skeleton doesn't apply
- Never use text-only "Carregando..."

### Available Components

Full inventory of `src/components/ui/`:

| Component | Use |
|-----------|-----|
| Accordion | Collapsible sections |
| Alert | Inline status messages |
| AlertDialog | Destructive confirmations |
| BackButton | Navigation back |
| Badge | Status labels, counts |
| Button | Actions (CVA variants above) |
| Calendar | Date picker calendar |
| Card | Content containers |
| Chart | Data visualization |
| Checkbox | Boolean inputs |
| ColorPicker | Color selection |
| Dialog / DialogControl | Modals, forms |
| DropdownMenu | Context menus, action menus |
| Field | Form field wrapper (label + error + description) |
| FileDropzone | File upload |
| Input / InputControl | Text inputs |
| InputCurrency | Money inputs |
| InputDate | Date inputs |
| Label | Form labels |
| NativeSelect | Simple selects (native) |
| RadioGroup | Radio option groups |
| Select | Custom styled selects |
| Separator | Visual dividers |
| Skeleton | Loading placeholders |
| Sonner | Toast notifications |
| Spinner | Inline loading indicator |
| Stepper | Multi-step wizard |
| Switch | Toggle on/off |
| Tabs | Tab navigation |
| Tooltip | Hover info |
| Typography | PageTitle, text components |

## Defaults Rejected

| Default | ChatFunnel choice | Why |
|---------|-------------------|-----|
| Neutral gray shadows | Purple-tinted `rgba(55,30,145)` | Warmth + distinction |
| Blue brand | Teal/cyan `#3CA1A1` | Flow, connectivity, messaging |
| Inter/system font | Figtree | Geometric warmth without being playful |
| Pure neutral grays | Purple-undertone grays | Cohesion with shadow tint |
| Different sidebar color | Same-family background + border | No visual fragmentation |
