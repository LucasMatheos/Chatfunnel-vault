---
name: brand-guidelines
description: Applies ChatFunnel's official brand colors, typography, shadows, and design tokens to any artifact (HTML, slides, diagrams, mockups, emails). Use when brand consistency or visual styling matters.
---

# ChatFunnel Brand Guidelines

## Overview

Apply ChatFunnel's design system tokens to any visual artifact — HTML pages, presentations, diagrams, mockups, email templates, or any output that benefits from brand consistency.

**Keywords**: branding, visual identity, styling, brand colors, typography, design tokens, ChatFunnel brand, visual formatting, visual design

## Brand Identity

**Feel:** A well-organized desk. Professional but warm — not corporate cold, not startup playful. Approachable complexity: lots of features, zero intimidation.

**Temperature:** Teal brand on purple-gray neutrals. The teal evokes water/flow/connectivity — fitting for a messaging platform.

## Colors

### Brand (Teal/Cyan)

| Token | Hex | Role |
|-------|-----|------|
| `brand-100` | `#CAFFFB` | Lightest tint — backgrounds, info boxes |
| `brand-200` | `#00E8DC` | Bright accent — hover, active states |
| `brand-400` | `#22C6BA` | Mid accent |
| `brand-500` | `#3CA1A1` | **Primary** — buttons, links, focus rings |
| `brand-700` | `#3C7C7F` | Dark accent — pressed states |
| `brand-900` | `#2F585E` | Darkest — text on light backgrounds |

### Grays (Purple Undertones)

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
| `gray-1000` | `#33303E` | Purple-gray — **primary text** |

### Semantic Mapping

| Role | Color | Hex |
|------|-------|-----|
| Primary / CTA | `brand-500` | `#3CA1A1` |
| Primary foreground | `gray-100` | `#FFFFFF` |
| Secondary background | `gray-200` | `#F9FAFC` |
| Secondary foreground | `gray-1000` | `#33303E` |
| Muted background | `gray-300` | `#F2F2F2` |
| Muted foreground | `gray-700` | `#7A7786` |
| Border / Input border | `gray-400` | `#E7E7E7` |
| Focus ring | `brand-500` | `#3CA1A1` |
| Destructive | `red-500` | `#C91D1D` |
| Success | `green-500` | `#24B26E` |

### Status Colors

| Status | Hex Range |
|--------|-----------|
| Success (green) | `#E2FBEF` (100) → `#24B26E` (500) → `#1A8452` (900) |
| Error (red) | `#FFE7E7` (100) → `#C91D1D` (500) → `#EE0707` (900) |

### SystemBar Gradients

| State | From | To |
|-------|------|----|
| Critical | `#C91D1D` | `#E84B3C` |
| Alert | `#E84B3C` | `#F39C19` |
| Info | `#2196F3` | `#1976D2` |
| Context | `#1976D2` | `#1565C0` |
| Warning | `#F39C19` | `#E8A317` |

## Typography

**Typeface:** Figtree — geometric but friendly. Not corporate (Inter), not playful (Nunito).

```
Font stack: "Figtree", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, "Noto Sans"
```

### Weights

| Token | Value | Use |
|-------|-------|-----|
| Regular | 400 | Body text, descriptions |
| Medium | 500 | Emphasis, form labels |
| Semibold | 600 | Subtitles, badges |
| Bold | 700 | Headers, CTAs |

### Type Scale

| Level | Size | Weight | Line-height | Use |
|-------|------|--------|-------------|-----|
| Display | 48/40/32px | 700 | 1.25 | Page titles, hero numbers |
| Heading | 28/24px | 700 | 1.25 | Section headers |
| Subtitle | 20px | 400/600/700 | 1.25 | Card titles, subsections |
| Body | 18/16/14px | 400-700 | 1.5 | Content, descriptions, labels |
| Caption | 12/10px | 400-700 | 1.25 | Labels, metadata, badges |

### Utility Classes

```
Headers:    typo-header-{48|40|32|28|24}-bold
Subtitles:  typo-subtitle-20-{bold|semibold|regular}, typo-subtitle-16-regular
Body 18:    typo-body-18-{bold|medium|regular}
Body 16:    typo-body-16-{bold|medium|regular}
Body 14:    typo-body-14-{bold|semibold|medium|regular}
Body 12:    typo-body-12-{bold|semibold|medium|regular}
Body 10:    typo-body-10-{bold|semibold|regular}
```

## Shadows (Signature Element)

**Purple-tinted shadows** using `rgba(55, 30, 145, opacity)` — the single most distinctive visual element. NEVER use neutral gray shadows.

| Level | Token | Values | Use |
|-------|-------|--------|-----|
| Whisper | `sombra-1` | `0px 2px 24px rgba(55, 30, 145, 0.05)` | Cards at rest |
| Soft | `sombra-2` | `0px 2px 24px rgba(55, 30, 145, 0.10)` | Hover, active |
| Elevated | `sombra-3` | `4px 16px 35px rgba(55, 30, 145, 0.10)` | Dropdowns, modals |

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

## Spacing

Base unit: 4px (Tailwind default).

| Context | Value |
|---------|-------|
| Icon gap | 4-8px |
| Component internal | 8-12px |
| Card padding | 16-24px |
| Section gap | 24-32px |
| Dialog padding | 40px |
| Dialog internal gap | 48px |

## Application Rules

When creating any visual artifact:

1. **ALWAYS** use `#3CA1A1` (brand-500) as the primary accent — never generic blue
2. **ALWAYS** use `#33303E` (gray-1000) for primary text — never pure black `#000`
3. **ALWAYS** use `#F9FAFC` (gray-200) for subtle backgrounds — never pure gray
4. **ALWAYS** apply purple-tinted shadows `rgba(55, 30, 145, ...)` — never neutral gray shadows
5. **ALWAYS** use Figtree as the typeface (fallback: system-ui, sans-serif)
6. **ALWAYS** use the border radius scale (4-16px) — never default browser radius
7. **NEVER** use colors outside this palette without explicit justification
8. **NEVER** use pure neutral grays — ChatFunnel grays have purple undertones

## Defaults Rejected

| Generic Default | ChatFunnel Choice | Why |
|-----------------|-------------------|-----|
| Blue brand | Teal/cyan `#3CA1A1` | Flow, connectivity, messaging |
| Neutral gray shadows | Purple-tinted `rgba(55,30,145)` | Warmth + distinction |
| Inter/system font | Figtree | Geometric warmth without playfulness |
| Pure neutral grays | Purple-undertone grays | Cohesion with shadow tint |
| Black text `#000` | `#33303E` purple-gray | Softer, warmer reading experience |

## Quick Reference (Copy-Paste)

```css
/* Primary */
--brand: #3CA1A1;
--brand-light: #CAFFFB;
--brand-dark: #2F585E;

/* Text */
--text-primary: #33303E;
--text-secondary: #7A7786;
--text-muted: #8C8A97;

/* Surfaces */
--bg-white: #FFFFFF;
--bg-subtle: #F9FAFC;
--bg-muted: #F2F2F2;
--border: #E7E7E7;

/* Status */
--success: #24B26E;
--error: #C91D1D;

/* Shadows */
--shadow-sm: 0px 2px 24px rgba(55, 30, 145, 0.05);
--shadow-md: 0px 2px 24px rgba(55, 30, 145, 0.10);
--shadow-lg: 4px 16px 35px rgba(55, 30, 145, 0.10);

/* Font */
font-family: "Figtree", ui-sans-serif, system-ui, sans-serif;

/* Radius */
--radius-sm: 4px;
--radius-md: 6px;
--radius-lg: 8px;
--radius-xl: 12px;
```