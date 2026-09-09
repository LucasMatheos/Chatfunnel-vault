---
title: Chat v2 — correções visuais (validar)
description: Rodada de fixes visuais no Livechat v2, aguardando validação
tags: [livechat-v2, frontend, pendente-validacao]
status: aguardando-validacao
date: 2026-07-14
validar_em: 2026-07-15
related: []
---

# Chat v2 — correções visuais (validar amanhã 15/07)

**Repo:** chatfunnel-front
**Branch:** `fix-release/chat-v2-visual-bugs`
**Commit:** `9e0e6afd` — "Correçoes visuais do chat v2"
**PR:** aberto (base provável `release`)

## O que foi feito (checklist de validação)

### Lista de contatos (`ContactItem`, `ListContacts`)
- [ ] Badges de status migradas p/ `Badge` de `components/ui` (Inativo, Fallback solicitado, Atendimento transferido, Atendido por)
- [ ] Filtros "Tudo"/"Não lidas" sem layout shift ao alternar (border sempre presente, muda só a cor)
- [ ] Preview da última mensagem: fallback "Sem última mensagem" aparece (troca `??` → `||`)

### Sidebar de detalhes (`SideBarDetails`, `ContactInfo`)
- [ ] Card de perfil: infos do contato (nome + @/email + telefone) **não** invadem mais o input de atribuir atendimento (só avatar `absolute`, resto no fluxo)
- [ ] Botão **X** (Button do ui) no header fecha/recolhe a sidebar
- [ ] E-mail longo trunca com ellipsis + `title` no hover

### Balão de template (`TemplateV2Ballon`)
- [ ] Botão do template responsivo (`w-full max-w-[18.75rem]`) — encolhe com o balão; label longo trunca

## Pendências conhecidas (NÃO feito nesta branch)
- **Última mensagem não vem do backend:** endpoint `nest/chats/contacts_v2/:channelId` (query `ContactsChannelsRepository.listByChannelId` em `@chatfunnel/core`) **não retorna `objMessage`/`messageId`** — o preview fica sempre "Sem última mensagem". Correção fica no core (adicionar LATERAL join na `Messages`). Ver depois.
- **Ícone flutuante removido:** as pills de Fallback/Transferido perderam o "selo" circular branco saliente (o `Badge` tem `overflow-hidden`). Se quiser de volta, precisa markup manual só nesses casos.
- **Pastas:** carregamento de `getFolders` no mount/troca de canal foi **comentado** (não apagado) em `SideBarFilters` e `LiveChatScreen` — reavaliar se some de vez.
