---
title: Send Moderator Name
description: Flag de conta que prefixa mensagens do livechat com o nome do moderador que enviou.
status: planned
last_updated: 2026-04-20
tags:
  - livechat
  - accounts
  - whatsapp
  - instagram
---

# Send Moderator Name

Feature de configuracao por conta. Quando ligada, toda mensagem **de texto** enviada
pelo livechat chega ao contato prefixada com o nome do moderador que digitou.

Formato: `*Nome do Moderador*: mensagem`

## Por que

Em contas com varios atendentes na mesma conversa, o contato nao sabe quem esta
falando quando todos usam o mesmo canal WhatsApp/Instagram. O prefixo resolve isso
sem exigir canais separados por atendente.

## Escopo

| Dimensao | Vale? |
|----------|-------|
| Texto pelo livechat | sim |
| Caption de midia (imagem/video/documento) | sim (quando ha caption) |
| Audio | sim — Meta nao suporta caption em audio, entao envia um texto `*Nome*` como mensagem separada antes do audio (2 bolhas na conversa) |
| Template | nao — templates Meta sao fixos e pre-aprovados |
| Observacao interna (`isObservation`) | sim — aparece no historico |
| WhatsApp | sim |
| Instagram | sim |
| Broadcast, automacao, bot, agente IA | nao |

## Onde vive

- **Flag**: campo `sendModeratorName` (Boolean, default `false`) no model `Accounts` — schema em [`chatfunnel-core/prisma/schema.prisma`](../../../chatfunnel-core/prisma/schema.prisma)
- **Backend**: [[livechat]] — [`chatfunnel-api/src/commands/contacts/SendMessageToContact.js`](../../../chatfunnel-api/src/commands/contacts/SendMessageToContact.js)
- **Front toggle**: [[organization-form]] — tela de editar organizacao
- **Plano de implementacao**: `docs/superpowers/plans/2026-04-20-send-moderator-name-plan.md`

## Fluxo

```
Front FooterChat (handleSendMessage)
  ↓ POST /api/contacts/:id/channels/:cid/messages
SendMessageToContact.js
  ↓ busca user + account (ja traz sendModeratorName)
  ↓ handleWhatsapp | handleInstagram
  ↓ se flag && type==text && user.name → prefixa "*Nome*: "
  ↓ (variaveis {{...}} sao resolvidas ANTES do prefixo)
  ↓ envia via CloudApi / FacebookAPI
  ↓ persiste messages com o texto **final** (com prefixo)
```

## Gotchas

- O prefixo e aplicado **depois** da substituicao de variaveis `{{contactData.foo:Label}}`
  para nao quebrar templates com variaveis.
- Templates WhatsApp (`type=template`) sao fixos na Meta — prefixo nao se aplica.
- Caption vazio: se o usuario envia imagem/video sem texto, **nao** cria caption so para o prefixo — continua sem caption.
- Audio: Meta nao suporta campo de caption em mensagens de audio. Solucao: antes do `sendAudioMessage`, o backend envia uma mensagem de texto com `*Nome do Moderador*`. Se o texto falhar, o audio **ainda assim** e enviado (audio sem identificador > nada).
- A mensagem salva na tabela `messages` inclui o prefixo: o historico bate com o que
  o contato recebeu.
- Se `user.name` estiver vazio/null, o prefixo nao e aplicado (fallback seguro).
- Broadcast, automacao e bots **nao** usam esse endpoint, entao nao recebem prefixo
  mesmo com flag ligada.

## Migracao

```sql
ALTER TABLE "Accounts"
  ADD COLUMN "sendModeratorName" BOOLEAN NOT NULL DEFAULT false;
```

Rollback: `DROP COLUMN`. Contas existentes continuam com comportamento atual (flag false).

## Relacionado

- [[livechat]]
- [[organization-form]]
- [[channels]]
