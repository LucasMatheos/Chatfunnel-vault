---
title: Contatos
description: Base de contatos do ChatFunnel — cadastro, tags, campos personalizados, segmentos e ciclo de vida.
tags: [features, contacts]
related: ["[[livechat]]", "[[crm-kanban]]", "[[automations]]"]
last_updated: 2026-04-05
---

# Contatos

Contatos sao a entidade central do ChatFunnel. Representam pessoas que interagem com a conta via WhatsApp, Instagram ou Messenger. Todo o CRM, automacoes e broadcasts dependem dessa base.

## O que e um Contato

Um contato possui: `firstName`, `lastName`, `email`, `phone`, `instagramUsername`, `photo`, `fromPlatform` (plataforma de origem) e `dateCreated`. O campo `hasEdited` indica se o operador ja editou manualmente os dados.

Dados de Instagram incluem `instagramFollow`, `instagramFollowBusinnes`, `instagramFollowerCount` e `instagramIsVerified`.

Cada contato pertence a uma `accountId` (multi-tenancy) e pode ter relacao com canais via `ContactsChannels`.

## Como Contatos sao Criados

### Automaticamente (via mensagens)
Quando uma mensagem chega de um canal (WhatsApp, Instagram, Messenger), o sistema cria o contato automaticamente se nao existir. O campo `fromPlatform` registra a origem. Dados como nome e foto sao preenchidos com informacoes da plataforma.

### Manualmente
Operadores criam contatos pelo frontend (`ContactsService.createContact`). O endpoint `POST /contacts/create` recebe nome, telefone, email e campos personalizados. O telefone passa por validacao e formatacao (`formatNumber`).

### Importacao em massa
Importacao via CSV ou Excel (XLSX/XLS) pelo endpoint `ImportContacts`. Suporta mapeamento de colunas, validacao de telefone (inclusive notacao cientifica), e atribuicao de tags durante a importacao. O progresso e rastreado via Redis.

## Tags

Tags classificam contatos livremente. Existem tags **do sistema** (criadas automaticamente) e tags **do usuario**.

- Tags sao organizadas em **pastas** (folders) para agrupamento visual
- Operacoes: adicionar tag a contato (`AddContactTag`), remover (`DeleteContactTag`)
- Filtro por tags suporta modos **AND**, **OR** e **NOT** (`tagMode` na listagem)
- Tags sao exportadas junto com o contato no CSV

## Campos Personalizados (Custom Fields)

Permitem estender os dados do contato com informacoes especificas do negocio.

- CRUD de custom fields por conta (`AddContactCustomField`, `DeleteContactCustomField`)
- Cada contato recebe um **valor** por campo via `SetContactCustomFieldValue` (tabela `customFieldsContacts`)
- Ao editar um contato, todos os custom fields sao recriados (delete + insert)
- Custom fields sao exportados como colunas no CSV

## Segmentos

Segmentos sao filtros salvos que agrupam contatos dinamicamente por condicoes.

- CRUD via NestJS: `POST /segments`, `GET /segments`, `PUT /segments/:id`, `DELETE /segments`
- Suportam **preview** antes de salvar (`POST /segments/preview`)
- A listagem de contatos aceita filtros por: `searchTerm`, `tagIds` + `tagMode`, `pipelineId` + range de datas, `onlyWithPhone`, e filtro generico `Filter`
- Segmentos sao gerenciados na tela `ContactsManageSegments`

## Pastas (Folders)

Pastas organizam tanto contatos quanto tags. Operacoes: criar, renomear, deletar e mover itens entre pastas via drag-and-drop (`handleDropFolder`). A sidebar `SidaBarFilter` e o componente compartilhado de navegacao por pastas.

## Ciclo de Vida

1. **Criacao** — automatica (mensagem) ou manual (formulario/importacao)
2. **Ativo** — contato visivel, pode receber mensagens, tags, automacoes
3. **Arquivado** — `isArchived` na relacao `ContactsChannels` (por canal). Arquivar/desarquivar nao deleta o contato
4. **Deletado** — soft delete via `isDeleted: true`. Contatos deletados sao excluidos de todas as queries

## Acoes sobre Contatos

- **Enviar mensagem**: `SendMessageToContact` (via canal)
- **Executar automacao**: `RunAutomation` com selecao de contatos e canal
- **Adicionar ao CRM**: componente `AddToCrm` vincula contato a um [[crm-kanban]]
- **Exportar**: CSV com todos os campos, tags e custom fields (`ExportContacts`)
- **Cancelar follow-up**: `CancelFollowUp` interrompe lembretes agendados

## Entidades Principais

| Entidade | Descricao |
|----------|-----------|
| `Contacts` | Tabela principal de contatos |
| `ContactsChannels` | Relacao contato-canal (archive, visualizacao) |
| `Tags` / `TagsContacts` | Tags e associacao com contatos |
| `CustomFields` / `CustomFieldsContacts` | Campos personalizados e valores por contato |
| `Segments` | Filtros salvos de contatos |
| `Folders` | Pastas para organizar contatos e tags |
