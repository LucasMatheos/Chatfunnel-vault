---
name: no-semantic-tokens-in-components
enabled: true
event: file
action: warn
pattern: "chatfunnel-front[/\\\\]src[/\\\\](?!components[/\\\\]ui[/\\\\]).*\\.vue$"
---
WARNING: Em componentes customizados use scale tokens (bg-gray-100, text-gray-1000, bg-brand-500) — NUNCA tokens semânticos (bg-background, text-foreground, bg-card, bg-primary, text-muted-foreground, border-border). Tokens semânticos são exclusivos de src/components/ui/.
