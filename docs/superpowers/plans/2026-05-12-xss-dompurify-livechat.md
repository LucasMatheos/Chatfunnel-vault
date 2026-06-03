# XSS Remediation — DOMPurify no Livechat

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sanitizar todos os `v-html` vulneráveis nos componentes de chat do livechat com DOMPurify, eliminando o vetor de Stored XSS confirmado (attack chain: HTML injection → JS execution → token exfiltration).

**Architecture:** Composable centralizado `useSanitize.ts` expõe 2 funções (`sanitizeHtml`, `sanitizeMarkdown`). Cada componente importa o composable e wrapa seu conteúdo antes de renderizar via `v-html`. A função `formatText` (duplicada em Answer.vue e SentBubble/TemplateBallon.vue) recebe sanitização na saída.

**Tech Stack:** Vue 3, DOMPurify `^3.3.1` (já instalado), markdown-it `^14.1.0` (já instalado), TypeScript

---

## File Structure

### Criar
| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/common/composables/useSanitize.ts` | Composable centralizado — DOMPurify + configurações de tags/attrs permitidos |

### Modificar — WhatsApp ContactBubble
| Arquivo | Mudança |
|---------|---------|
| `src/views/livechat/components/ChatMessages/components/ContactBubble/components/TextBallon.vue` | Wrap `md.renderInline()` com `sanitizeMarkdown` |
| `src/views/livechat/components/ChatMessages/components/ContactBubble/components/Answer.vue` | Wrap `formatText()` output + diretos com `sanitizeHtml` |
| `src/views/livechat/components/ChatMessages/components/ContactBubble/components/TemplateBallon.vue` | Wrap `bodyFormatted` com `sanitizeHtml` |
| `src/views/livechat/components/ChatMessages/components/ContactBubble/components/MediaBallon.vue` | Wrap caption com `sanitizeHtml` |
| `src/views/livechat/components/ChatMessages/components/ContactBubble/components/InteractiveBallon.vue` | **SKIP** — já usa `{{ }}` (safe) |

### Modificar — WhatsApp SentBubble
| Arquivo | Mudança |
|---------|---------|
| `src/views/livechat/components/ChatMessages/components/SentBubble/components/TextBallon.vue` | Wrap `md.renderInline()` com `sanitizeMarkdown` |
| `src/views/livechat/components/ChatMessages/components/SentBubble/components/StickNote.vue` | Wrap `objMessage` com `sanitizeHtml` |
| `src/views/livechat/components/ChatMessages/components/SentBubble/components/TemplateBallon.vue` | Wrap `formatText()` output com `sanitizeHtml` |
| `src/views/livechat/components/ChatMessages/components/SentBubble/components/TemplateV2Ballon.vue` | Wrap `md.renderInline()` com `sanitizeMarkdown` |
| `src/views/livechat/components/ChatMessages/components/SentBubble/components/InteractiveBallon.vue` | Wrap `interactive.body.text` com `sanitizeHtml` |
| `src/views/livechat/components/ChatMessages/components/SentBubble/components/MediaBallon.vue` | Wrap caption com `sanitizeHtml` |

### Modificar — Instagram ContactBubble
| Arquivo | Mudança |
|---------|---------|
| `src/views/livechat/components/ChatMessages/components/ContactBubble/components/instagram/TextBallon.vue` | Wrap `message.text` com `sanitizeHtml` |
| `src/views/livechat/components/ChatMessages/components/ContactBubble/components/instagram/TemplateBallon.vue` | Wrap `element.title` com `sanitizeHtml` |
| `src/views/livechat/components/ChatMessages/components/ContactBubble/components/instagram/IgReelsBallon.vue` | **SKIP** — `v-html` já está comentado |

### Modificar — Instagram SentBubble
| Arquivo | Mudança |
|---------|---------|
| `src/views/livechat/components/ChatMessages/components/SentBubble/components/instagram/TextBallon.vue` | Wrap `message.text` com `sanitizeHtml` |
| `src/views/livechat/components/ChatMessages/components/SentBubble/components/instagram/TemplateBallon.vue` | Wrap `element.title` e `payload.text` com `sanitizeHtml` |
| `src/views/livechat/components/ChatMessages/components/SentBubble/components/instagram/IgReelsBallon.vue` | Wrap `reels.title` com `sanitizeHtml` |

**Total: 1 arquivo novo + 15 arquivos modificados**

---

## Task 1: Criar composable `useSanitize.ts`

**Files:**
- Create: `chatfunnel-front/src/common/composables/useSanitize.ts`

- [ ] **Step 1: Criar o composable**

```typescript
import DOMPurify from 'dompurify'
import { useMarkdown } from '@/common/composables/MarkdownComposable.js'

const ALLOWED_TAGS_CHAT = [
  'p',
  'strong',
  'em',
  'del',
  'br',
  'a',
  'code',
  'pre',
  'ul',
  'ol',
  'li',
  'blockquote'
]
const ALLOWED_ATTR_CHAT = ['href', 'target', 'rel']

export function useSanitize() {
  const md = useMarkdown()

  /**
   * Sanitiza HTML simples (texto com <br>, <strong>, etc).
   * Usar para: captions, notas internas, textos de contato, output de formatText().
   */
  const sanitizeHtml = (html: string | null | undefined): string => {
    if (!html) return ''
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ALLOWED_TAGS_CHAT,
      ALLOWED_ATTR: ALLOWED_ATTR_CHAT
    })
  }

  /**
   * Renderiza markdown-it + sanitiza o output.
   * Usar para: TextBallon (WhatsApp) que usa md.renderInline().
   */
  const sanitizeMarkdown = (text: string | null | undefined): string => {
    if (!text) return ''
    const rendered = md
      .renderInline(text)
      .replace('\n', '<br>')
      .replace(/(\r\n|\n|\r)/gm, '<br/>')
    return DOMPurify.sanitize(rendered, {
      ALLOWED_TAGS: ALLOWED_TAGS_CHAT,
      ALLOWED_ATTR: ALLOWED_ATTR_CHAT
    })
  }

  return { sanitizeHtml, sanitizeMarkdown }
}
```

- [ ] **Step 2: Verificar que o front compila**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit --pretty 2>&1 | head -20`
Expected: sem erros em `useSanitize.ts`

- [ ] **Step 3: Commit**

```bash
cd chatfunnel-front
git add src/common/composables/useSanitize.ts
git commit -m "feat(security): add useSanitize composable with DOMPurify for chat XSS prevention"
```

---

## Task 2: Sanitizar TextBallon (WhatsApp — Contact + Sent)

**Files:**
- Modify: `chatfunnel-front/src/views/livechat/components/ChatMessages/components/ContactBubble/components/TextBallon.vue`
- Modify: `chatfunnel-front/src/views/livechat/components/ChatMessages/components/SentBubble/components/TextBallon.vue`

Ambos arquivos são **idênticos** — mesmo código, mesma correção.

- [ ] **Step 1: Modificar ContactBubble/TextBallon.vue**

Substituir o arquivo inteiro:

```vue
<template>
  <div v-html="contentFormatted"></div>
</template>

<script setup>
import { computed } from 'vue'
import { useSanitize } from '@/common/composables/useSanitize'

const { sanitizeMarkdown } = useSanitize()
const props = defineProps({ message: Object })

const contentFormatted = computed(() => {
  const text = props.message?.objMessage?.text?.body
  return sanitizeMarkdown(text)
})
</script>
```

Mudanças:
- Remove import de `MarkdownComposable.js` (o composable `useSanitize` já usa internamente)
- `contentFormatted` agora passa por `sanitizeMarkdown` que faz `md.renderInline` + DOMPurify

- [ ] **Step 2: Modificar SentBubble/TextBallon.vue**

Mesmo código exato do step anterior — os dois arquivos eram idênticos e continuam idênticos.

- [ ] **Step 3: Testar no browser**

1. Abrir o livechat em uma conversa WhatsApp
2. Verificar que mensagens de texto normais renderizam corretamente (bold, itálico, links, quebras de linha)
3. Verificar que mensagens enviadas (SentBubble) também renderizam corretamente
4. Se possível, verificar que `<img src=x onerror=alert(1)>` em uma mensagem aparece como texto e não executa

- [ ] **Step 4: Commit**

```bash
cd chatfunnel-front
git add src/views/livechat/components/ChatMessages/components/ContactBubble/components/TextBallon.vue
git add src/views/livechat/components/ChatMessages/components/SentBubble/components/TextBallon.vue
git commit -m "fix(security): sanitize TextBallon v-html with DOMPurify (XSS-01)"
```

---

## Task 3: Sanitizar StickNote e InteractiveBallon (SentBubble)

**Files:**
- Modify: `chatfunnel-front/src/views/livechat/components/ChatMessages/components/SentBubble/components/StickNote.vue`
- Modify: `chatfunnel-front/src/views/livechat/components/ChatMessages/components/SentBubble/components/InteractiveBallon.vue`

- [ ] **Step 1: Modificar StickNote.vue**

Substituir o arquivo inteiro:

```vue
<template>
  <div class="mb-1">
    <v-icon size="14" class="mr-1">mdi-note-outline</v-icon>
    <strong>
      <small>Nota</small>
    </strong>
  </div>
  <div v-html="contentSanitized"></div>
</template>

<script setup>
import { computed } from 'vue'
import { useSanitize } from '@/common/composables/useSanitize'

const { sanitizeHtml } = useSanitize()
const props = defineProps({ message: Object })

const contentSanitized = computed(() => {
  const text = props.message?.objMessage?.replaceAll('\n', '<br>')
  return sanitizeHtml(text)
})
</script>
```

- [ ] **Step 2: Modificar SentBubble/InteractiveBallon.vue**

Substituir o arquivo inteiro:

```vue
<template>
  <div>
    <div v-html="bodySanitized"></div>
    <div>
      <component :is="componentMap[message.objMessage.interactive.type]" :message="message"></component>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useSanitize } from '@/common/composables/useSanitize'
import { Buttons, Link } from './InteractiveActions'

const { sanitizeHtml } = useSanitize()
const props = defineProps({ message: Object })

const componentMap = ref({
  button: Buttons,
  cta_url: Link
})

const bodySanitized = computed(() => {
  const text = props.message.objMessage.interactive.body.text?.replace('\n', '<br>')
  return sanitizeHtml(text)
})
</script>
```

- [ ] **Step 3: Testar no browser**

1. Abrir uma conversa no livechat
2. Criar uma **nota interna** com texto normal — verificar que renderiza corretamente
3. Criar uma nota interna com `<img src=x onerror=alert(1)>` — deve mostrar texto, não executar
4. Verificar mensagens interativas (botões de resposta rápida) — texto do body deve renderizar normalmente

- [ ] **Step 4: Commit**

```bash
cd chatfunnel-front
git add src/views/livechat/components/ChatMessages/components/SentBubble/components/StickNote.vue
git add src/views/livechat/components/ChatMessages/components/SentBubble/components/InteractiveBallon.vue
git commit -m "fix(security): sanitize StickNote and InteractiveBallon v-html (XSS-01)"
```

---

## Task 4: Sanitizar MediaBallon (Contact + Sent)

**Files:**
- Modify: `chatfunnel-front/src/views/livechat/components/ChatMessages/components/ContactBubble/components/MediaBallon.vue:3`
- Modify: `chatfunnel-front/src/views/livechat/components/ChatMessages/components/SentBubble/components/MediaBallon.vue:4-8`

- [ ] **Step 1: Modificar ContactBubble/MediaBallon.vue**

Linha 3 atual:
```vue
<div v-html="message.objMessage[message.objMessage.type]?.caption?.replace('\n', '<br>')"></div>
```

Substituir por:
```vue
<div v-html="captionSanitized"></div>
```

Adicionar `computed` ao import existente na linha 29:
```javascript
import { ref, onMounted, computed } from "vue";
```

Adicionar import e computed após `const props = defineProps({ message: Object });` (linha 131):
```javascript
import { useSanitize } from '@/common/composables/useSanitize'
const { sanitizeHtml } = useSanitize()

const captionSanitized = computed(() => {
  const caption = props.message.objMessage[props.message.objMessage.type]?.caption
  return sanitizeHtml(caption?.replace('\n', '<br>'))
})
```

- [ ] **Step 2: Modificar SentBubble/MediaBallon.vue**

Linhas 4-8 atuais:
```vue
<div v-html="
  message.objMessage[message.objMessage.type]?.caption?.replace(
    '\n',
    '<br>'
  )
"></div>
```

Substituir por:
```vue
<div v-html="captionSanitized"></div>
```

Adicionar `computed` ao import existente na linha 60:
```javascript
import { ref, onMounted, computed } from 'vue'
```

Adicionar após `const props = defineProps({ message: Object });` (linha 226):
```javascript
import { useSanitize } from '@/common/composables/useSanitize'
const { sanitizeHtml } = useSanitize()

const captionSanitized = computed(() => {
  const caption = props.message.objMessage[props.message.objMessage.type]?.caption
  return sanitizeHtml(caption?.replace('\n', '<br>'))
})
```

- [ ] **Step 3: Testar no browser**

1. Abrir conversa com mensagem de **imagem com legenda** — legenda deve aparecer normalmente
2. Verificar **vídeo com legenda** e **documento** — mesma coisa

- [ ] **Step 4: Commit**

```bash
cd chatfunnel-front
git add src/views/livechat/components/ChatMessages/components/ContactBubble/components/MediaBallon.vue
git add src/views/livechat/components/ChatMessages/components/SentBubble/components/MediaBallon.vue
git commit -m "fix(security): sanitize MediaBallon captions with DOMPurify (XSS-01)"
```

---

## Task 5: Sanitizar TemplateBallon (ContactBubble) e TemplateV2Ballon (SentBubble)

**Files:**
- Modify: `chatfunnel-front/src/views/livechat/components/ChatMessages/components/ContactBubble/components/TemplateBallon.vue:36-39`
- Modify: `chatfunnel-front/src/views/livechat/components/ChatMessages/components/SentBubble/components/TemplateV2Ballon.vue:34-55`

- [ ] **Step 1: Modificar ContactBubble/TemplateBallon.vue**

Template não muda. Adicionar import após linha 20 (`import {computed} from 'vue'`):

```javascript
import { useSanitize } from '@/common/composables/useSanitize'
const { sanitizeHtml } = useSanitize()
```

Modificar o computed `bodyFormatted` (linhas 36-39), de:
```javascript
const bodyFormatted = computed(() => {
  if (!body.value) return ''
  return body.value.replace(/(\r\n|\n|\r)/gm, '<br/>')
})
```

Para:
```javascript
const bodyFormatted = computed(() => {
  if (!body.value) return ''
  return sanitizeHtml(body.value.replace(/(\r\n|\n|\r)/gm, '<br/>'))
})
```

- [ ] **Step 2: Modificar SentBubble/TemplateV2Ballon.vue**

Adicionar import após linha 33 (`import { ref, computed } from "vue";`):

```javascript
import { useSanitize } from '@/common/composables/useSanitize'
const { sanitizeMarkdown } = useSanitize()
```

Modificar `contentFormatted` (linhas 51-55), de:
```javascript
const contentFormatted = computed(() => {
  if (!template.value) return ""
  let text = template.value?.components?.find((c) => c.type == "BODY")?.text
  if (!text) return ""
  return md.renderInline(text).replaceAll("\n", "<br/>")
})
```

Para:
```javascript
const contentFormatted = computed(() => {
  if (!template.value) return ''
  const text = template.value?.components?.find((c) => c.type == 'BODY')?.text
  if (!text) return ''
  return sanitizeMarkdown(text)
})
```

Remover import e instância de `useMarkdown` (linhas 34-36) pois `sanitizeMarkdown` já usa internamente:
```javascript
// REMOVER estas linhas:
import { useMarkdown } from "@/common/composables/MarkdownComposable.js";
const md = useMarkdown();
```

- [ ] **Step 3: Testar no browser**

1. Encontrar conversa com **mensagem template recebida** — verificar body e botões
2. Encontrar conversa com **mensagem template v2 enviada** — verificar formatação markdown

- [ ] **Step 4: Commit**

```bash
cd chatfunnel-front
git add src/views/livechat/components/ChatMessages/components/ContactBubble/components/TemplateBallon.vue
git add src/views/livechat/components/ChatMessages/components/SentBubble/components/TemplateV2Ballon.vue
git commit -m "fix(security): sanitize TemplateBallon and TemplateV2Ballon with DOMPurify (XSS-01)"
```

---

## Task 6: Sanitizar Answer.vue e SentBubble/TemplateBallon.vue (formatText)

Estes são os mais complexos — ambos têm `formatText()` com `container.innerHTML = text` (XSS direto).

**Files:**
- Modify: `chatfunnel-front/src/views/livechat/components/ChatMessages/components/ContactBubble/components/Answer.vue:4,7,15-20`
- Modify: `chatfunnel-front/src/views/livechat/components/ChatMessages/components/SentBubble/components/TemplateBallon.vue:134-135`

**Estratégia:** NÃO reescrever `formatText()` — apenas sanitizar a **saída**. A função usa DOM parsing para resolver variáveis de contato, o que é legítimo. DOMPurify na saída resolve o risco.

- [ ] **Step 1: Modificar Answer.vue**

Adicionar import no `<script setup>` (após linha 26 `import { JSONPath } from "jsonpath-plus";`):

```javascript
import { useSanitize } from '@/common/composables/useSanitize'
const { sanitizeHtml } = useSanitize()
```

Modificar o template — linha 4, de:
```vue
<div v-if="messageObject.type == 'text'" v-html="messageObject.text.body.replace('\n', '<br>')"></div>
```
Para:
```vue
<div v-if="messageObject.type == 'text'" v-html="sanitizeHtml(messageObject.text.body.replace('\n', '<br>'))"></div>
```

Linha 7, de:
```vue
v-html="messageObject.interactive.body.text.replace('\n', '<br>')"
```
Para:
```vue
v-html="sanitizeHtml(messageObject.interactive.body.text.replace('\n', '<br>'))"
```

Linhas 15-20, de:
```vue
<div
  v-html="
    messageObject.template.bodyText.includes('plaintext::')
      ? formatText(messageObject.template.bodyText, messageObject.contact)
      : messageObject.messageObject.template.bodyText
  "
></div>
```
Para:
```vue
<div
  v-html="
    sanitizeHtml(
      messageObject.template.bodyText.includes('plaintext::')
        ? formatText(messageObject.template.bodyText, messageObject.contact)
        : messageObject.messageObject.template.bodyText
    )
  "
></div>
```

- [ ] **Step 2: Modificar SentBubble/TemplateBallon.vue**

Adicionar import após linha 51 (`import { JSONPath } from "jsonpath-plus";`):

```javascript
import { useSanitize } from '@/common/composables/useSanitize'
const { sanitizeHtml } = useSanitize()
```

Modificar computeds nas linhas 134-135, de:
```javascript
const headerFormatted = computed(() => formatText(template.value.headerText, contact.value));
const bodyFormatted = computed(() => formatText(template.value.bodyText, contact.value));
```

Para:
```javascript
const headerFormatted = computed(() => sanitizeHtml(formatText(template.value.headerText, contact.value)))
const bodyFormatted = computed(() => sanitizeHtml(formatText(template.value.bodyText, contact.value)))
```

- [ ] **Step 3: Testar no browser**

1. Encontrar conversa com **mensagem de resposta** (Answer) — verificar reply preview
2. Encontrar conversa com **template v1 enviado** — verificar header e body
3. Testar template com **variáveis de contato** — devem resolver normalmente
4. Verificar que botões de template continuam funcionando

- [ ] **Step 4: Commit**

```bash
cd chatfunnel-front
git add src/views/livechat/components/ChatMessages/components/ContactBubble/components/Answer.vue
git add src/views/livechat/components/ChatMessages/components/SentBubble/components/TemplateBallon.vue
git commit -m "fix(security): sanitize Answer and TemplateBallon formatText output (XSS-01)"
```

---

## Task 7: Sanitizar componentes Instagram

**Files:**
- Modify: `chatfunnel-front/src/views/livechat/components/ChatMessages/components/ContactBubble/components/instagram/TextBallon.vue`
- Modify: `chatfunnel-front/src/views/livechat/components/ChatMessages/components/SentBubble/components/instagram/TextBallon.vue`
- Modify: `chatfunnel-front/src/views/livechat/components/ChatMessages/components/SentBubble/components/instagram/IgReelsBallon.vue`
- Modify: `chatfunnel-front/src/views/livechat/components/ChatMessages/components/ContactBubble/components/instagram/TemplateBallon.vue`
- Modify: `chatfunnel-front/src/views/livechat/components/ChatMessages/components/SentBubble/components/instagram/TemplateBallon.vue`
- Skip: `ContactBubble/instagram/IgReelsBallon.vue` (v-html já comentado)

- [ ] **Step 1: Modificar instagram/ContactBubble/TextBallon.vue**

Substituir arquivo inteiro:
```vue
<template>
  <div v-html="textSanitized"></div>
</template>

<script setup>
import { computed } from 'vue'
import { useSanitize } from '@/common/composables/useSanitize'

const { sanitizeHtml } = useSanitize()
const props = defineProps({ message: Object })

const textSanitized = computed(() => {
  return sanitizeHtml(props.message.objMessage.message?.text?.replace('\n', '<br>'))
})
</script>
```

- [ ] **Step 2: Modificar instagram/SentBubble/TextBallon.vue**

Substituir arquivo inteiro:
```vue
<template>
  <div v-html="textSanitized"></div>
</template>

<script setup>
import { computed } from 'vue'
import { useSanitize } from '@/common/composables/useSanitize'

const { sanitizeHtml } = useSanitize()
const props = defineProps({ message: Object })

const textSanitized = computed(() => {
  return sanitizeHtml(props.message.objMessage.message?.text?.replaceAll('\n', '<br>'))
})
</script>
```

- [ ] **Step 3: Modificar instagram/SentBubble/IgReelsBallon.vue**

Substituir arquivo inteiro:
```vue
<template>
  <div>
    <div v-html="titleSanitized"></div>
    <InputVideoInstagram :url="reels.url" />
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { useSanitize } from '@/common/composables/useSanitize'
import InputVideoInstagram from '../../../../../InputVideoInstagram.vue'

const { sanitizeHtml } = useSanitize()
const props = defineProps({ reels: Object })

const titleSanitized = computed(() => {
  return sanitizeHtml(props.reels.title?.replace('\n', '<br>'))
})
</script>
<style lang="scss" scoped>
.reels-button {
  width: 100%;
  margin-top: 8px;
}
</style>
```

- [ ] **Step 4: Modificar instagram/ContactBubble/TemplateBallon.vue**

Adicionar import no `<script setup>` (após linha 30):
```javascript
import { useSanitize } from '@/common/composables/useSanitize'
const { sanitizeHtml } = useSanitize()
```

Mudar linha 3, de:
```vue
<div v-html="element.title?.replace('\n', '<br>')"></div>
```
Para:
```vue
<div v-html="sanitizeHtml(element.title?.replace('\n', '<br>'))"></div>
```

- [ ] **Step 5: Modificar instagram/SentBubble/TemplateBallon.vue**

Adicionar import no `<script setup>` (após linha 60):
```javascript
import { useSanitize } from '@/common/composables/useSanitize'
const { sanitizeHtml } = useSanitize()
```

Mudar linha 4, de:
```vue
<div v-html="element.title?.replace('\n', '<br>')"></div>
```
Para:
```vue
<div v-html="sanitizeHtml(element.title?.replace('\n', '<br>'))"></div>
```

Mudar linha 32, de:
```vue
<div v-html="payload.text"></div>
```
Para:
```vue
<div v-html="sanitizeHtml(payload.text)"></div>
```

- [ ] **Step 6: Testar no browser**

1. Se possível, abrir uma conversa **Instagram** no livechat
2. Verificar que mensagens de texto renderizam corretamente
3. Verificar templates do Instagram (botões, títulos)

- [ ] **Step 7: Commit**

```bash
cd chatfunnel-front
git add src/views/livechat/components/ChatMessages/components/ContactBubble/components/instagram/TextBallon.vue
git add src/views/livechat/components/ChatMessages/components/SentBubble/components/instagram/TextBallon.vue
git add src/views/livechat/components/ChatMessages/components/SentBubble/components/instagram/IgReelsBallon.vue
git add src/views/livechat/components/ChatMessages/components/ContactBubble/components/instagram/TemplateBallon.vue
git add src/views/livechat/components/ChatMessages/components/SentBubble/components/instagram/TemplateBallon.vue
git commit -m "fix(security): sanitize Instagram chat components with DOMPurify (XSS-01)"
```

---

## Task 8: Verificação final e teste de regressão

- [ ] **Step 1: Rodar typecheck**

```bash
cd chatfunnel-front && npx vue-tsc --noEmit --pretty
```

Expected: sem erros novos

- [ ] **Step 2: Rodar lint**

```bash
cd chatfunnel-front && npm run lint
```

Expected: sem erros novos

- [ ] **Step 3: Teste de regressão visual no browser**

Checklist de regressão — verificar que cada tipo de mensagem renderiza normalmente:

| Tipo | Onde testar | O que verificar |
|------|-----------|----------------|
| Texto WhatsApp (recebido) | Conversa WhatsApp | Bold, itálico, strikethrough, links, quebras de linha |
| Texto WhatsApp (enviado) | Conversa WhatsApp | Mesma coisa |
| Nota interna | Criar nova nota | Texto aparece, sem execução de HTML |
| Imagem com legenda | Conversa com foto | Legenda aparece abaixo da imagem |
| Template v1 (enviado) | Conversa com template | Header, body com variáveis, botões |
| Template v2 (enviado) | Conversa com template | Header, body, footer, botões |
| Template (recebido) | Conversa com template | Body formatado, botões de chip |
| Reply/Answer | Conversa com reply | Preview do reply com texto |
| Interativo (enviado) | Conversa com botões | Body + botões de ação |
| Texto Instagram | Conversa Instagram | Texto com quebras de linha |
| Template Instagram | Conversa Instagram | Títulos, botões |

- [ ] **Step 4: Teste de segurança — confirmar XSS eliminado**

Repetir os payloads do roteiro de teste original em nota interna:

```
<img src=x onerror=alert('XSS-1')>
<script>alert('XSS-2')</script>
<svg onload=alert('XSS-3')>
<img src="https://images.unsplash.com/photo-1518791841217-8f162f1e1131?w=300" onload="document.title='VULN'">
```

Expected: **nenhum** alert dispara, **nenhuma** imagem renderiza, título da aba **não muda**. Texto aparece como string literal ou é removido.

- [ ] **Step 5: Commit final (se houver fixes de lint)**

```bash
cd chatfunnel-front
git add -A
git commit -m "fix(security): lint fixes after DOMPurify sanitization"
```
