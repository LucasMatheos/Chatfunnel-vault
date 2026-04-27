---
title: Feature — sendModeratorName
date: 2026-04-20
owner: Lucas
status: awaiting-confirmation
repos_touched:
  - chatfunnel-core  # schema Prisma
  - chatfunnel-api
  - chatfunnel-front
---

# Feature: `sendModeratorName`

## Objetivo

Adicionar uma flag booleana na **conta** que, quando ativa, prefixa toda mensagem enviada
pelo livechat (front → chat) com o nome do moderador que enviou.

Formato final enviado: `*Nome do Moderador*: mensagem`

Exemplo:
- Moderador "Lucas Brito" digita `Bom dia, em que posso ajudar?`
- O que chega no WhatsApp/Instagram do contato: `*Lucas Brito*: Bom dia, em que posso ajudar?`

## Escopo confirmado pelo usuario

| Item | Decisao |
|------|---------|
| Tabela do flag | `accounts` (nao `organizations`) |
| Formato do prefixo | `*Nome*: ` (asteriscos + dois-pontos + espaco) |
| Aplica em | **texto + caption de midia (imagem/video/documento) + audio** — nao aplica em template |
| Plataformas | **WhatsApp + Instagram** |
| Observacao interna (`isObservation`) | **Aplica tambem** (o prefixo aparece na observacao salva) |
| Envio via broadcast / automacao / bot | **NAO aplica** (o escopo e "somente no chat") |

## Ponto unico de entrada

Todo envio feito pelo livechat do front passa por:

- Endpoint: `POST /api/contacts/:contactId/channels/:channelId/messages` (inferido pelo footer chat)
- Handler: `chatfunnel-api/src/commands/contacts/SendMessageToContact.js`
- Dispatcher: `handleWhatsapp` / `handleInstagram` dentro do mesmo arquivo

O handler ja busca:
- `user` (moderador logado via JWT) — `user.name` disponivel
- `account` (via `Account-Selected` header)
- `channel`, `contact`

Ou seja, **nenhuma nova query extra** e necessaria — basta ler `account.sendModeratorName`.

## Fluxo atual (resumo)

```
[Front FooterChat::handleSendMessage]
   ├─ type=text|image|video|audio|document
   └─ ChatService.sendMessage(contactId, channelId, payload)
        │ POST /api/contacts/:id/channels/:cid/messages
        ▼
[chatfunnel-api SendMessageToContact.js]
   ├─ fetch user, account, contact, channel
   ├─ updateChatModerator / updateKanbanModerators / blacklistContact
   └─ switch channel.allocatedType:
        ├─ WHATSAPP → handleWhatsapp → CloudApi.sendTextMessage / sendMediaMessage / sendTemplate
        └─ INSTAGRAM → handleInstagram → FacebookAPI.SendMessage / SendMediaMessage
```

## Mudancas

### 1. Banco — `chatfunnel-core/prisma/schema.prisma` (Prisma)

O schema compartilhado vive em `chatfunnel-core/prisma/schema.prisma` (~3000 linhas). O model se chama **`Accounts`** (PascalCase), linha 323.

Adicionar o campo no bloco do model (perto dos outros campos booleanos de configuracao, ex: depois de `answeredInitialForm`):

```prisma
model Accounts {
  // ...
  allocatedAccount    Boolean @default(false)
  answeredInitialForm Boolean @default(false)
  sendModeratorName   Boolean @default(false)  // novo
  // ...
}
```

Migration (regra do repo — `--create-only`, NUNCA `db push` ou `migrate deploy`):

```bash
cd chatfunnel-core
npx prisma migrate dev --create-only --name add_send_moderator_name_to_accounts
# revisar o .sql gerado em prisma/migrations/<timestamp>_.../migration.sql
npm run prisma:generate  # regenerar o client (tipos)
```

SQL esperado (nota: a tabela no Postgres chama-se `"Accounts"` — PascalCase, mesma da model):

```sql
ALTER TABLE "Accounts"
  ADD COLUMN "sendModeratorName" BOOLEAN NOT NULL DEFAULT false;
```

> Apos o merge em `chatfunnel-core`, os consumers (`chatfunnel-api`, etc.) precisam atualizar a dependencia `@chatfunnel/core` para pegar os tipos novos. O processo de sync de core e manual do usuario (regra de memoria: nao editar `node_modules/@chatfunnel/core`).

**Rollback**: `DROP COLUMN "sendModeratorName"` — coluna com default, zero impacto em dados existentes.

### 2. Backend — `chatfunnel-api/src/commands/contacts/SendMessageToContact.js`

**2.1.** Selecionar o novo campo na query do account (linha ~430):

```js
const account = await prisma.accounts.findFirst({
  where: { id: accountId },
  include: { user: true },
  // Prisma traz todos os campos por default, entao sendModeratorName ja vem.
});
```

Nenhuma mudanca necessaria aqui — o campo escalar vem automaticamente.

**2.2.** Criar helper local `buildModeratorPrefixedMessage(message, user, account)`:

```js
function buildModeratorPrefixedMessage(message, user, account) {
  if (!account.sendModeratorName) return message;
  if (!user?.name) return message;
  if (typeof message !== "string" || message.length === 0) return message;
  return `*${user.name}*: ${message}`;
}
```

**2.3.** Aplicar dentro de `handleWhatsapp`:

- Case `"text"`: aplicar o prefixo **apos** a substituicao de `{{variaveis}}` (ou seja, sobre `messageToSend` no path com variaveis, e sobre `message` no path sem variaveis).
- Case `"image" | "video" | "document"`: aplicar sobre `media.caption` (so quando `message` nao esta vazio — se nao ha caption, nao cria uma vazia so pra prefixar).
- Case `"audio"`: **decisao: opcao (a)** — WhatsApp Cloud API de audio nao tem campo de caption. Antes do `sendAudioMessage`, enviar uma mensagem de texto curta `*Nome do Moderador*` (so o identificador, sem body depois porque ja vem o audio). Contato ve 2 bolhas: texto-identificador + audio. Se o envio do texto falhar, **ainda assim** tenta o audio (audio sem identificador > ausencia total de mensagem). Observacao interna de audio nao existe no front hoje, entao nao ha caso de `isObservation + audio`.
- Case `"template"`: **nao aplica** (templates Meta sao fixos e pre-aprovados).
- Path `isObservation`: aplicar tambem sobre o `message` que sera salvo via `createFromCloudApi` (payload `message`).

**2.4.** Aplicar dentro de `handleInstagram` (mesmas regras):

- Case `"text"`: prefixar apos substituicao de variaveis.
- Case `"image" | "video" | "document"`: prefixar o `message` usado como caption (o `SendMediaMessage` do `FacebookAPI` aceita `message` acompanhando o media).
- Case `"audio"`: mesma decisao do WhatsApp — Instagram Graph API tambem nao suporta caption em audio. Opcao (a): enviar `*Nome do Moderador*` como texto antes do `SendMediaMessage` com o audio.
- Path `isObservation`: aplicar tambem.

**2.5.** Observacao interna (`isObservation`)

Fluxo atual da observacao:
- Front: `ChatService.sendMessage(..., { isObservation: true })`
- API: `isObservation == "true"` (string comparison — ja existe)
- Salva direto via `messagesRepository.createFromCloudApi({ payload: message, ... })` sem chamar API da Meta

Regra confirmada: prefixo **tambem se aplica** a observacoes. Entao antes de salvar o payload da observacao, passar por `buildModeratorPrefixedMessage`.

### 3. Front — `chatfunnel-front/`

**3.1.** Adicionar toggle em `OrganizationsLayout/index.vue` (editar organizacao).

Usar `Field` + `SwitchControl` + `FieldLabel` (padrao do design system — regra do repo):

```vue
<Field orientation="horizontal" class="w-auto">
  <SwitchControl id="send-moderator-name" v-model:checked="form.sendModeratorName" />
  <FieldLabel :for="'send-moderator-name'">
    Exibir nome do moderador nas mensagens do chat
  </FieldLabel>
</Field>
```

Helper text abaixo:
> Quando ativado, as mensagens enviadas pelo livechat aparecem para o contato como `*Nome do moderador*: mensagem`. Nao afeta broadcasts, automacoes ou agentes IA.

**3.2.** Ajustar o payload do service `AccountsService` (ou equivalente) para enviar o campo no `PUT /accounts/:id` (ou endpoint de editar conta).

**3.3.** Ajustar o endpoint do backend que edita a conta para aceitar o novo campo (provavelmente `commands/accounts/UpdateAccount` — verificar).

### 4. Onde **NAO** mexer

- `chatfunnel-worker-broadcast/` — broadcast passa por fluxo proprio, fora do escopo.
- `chatfunnel-services/` modulo assistants / agents-v2 — mensagens de IA nao levam prefixo.
- `chatfunnel-api/src/commands/instagram/WebHookHandler/` — envios automaticos de webhook nao sao "chat do front".

## Casos de borda

| Caso | Comportamento |
|------|---------------|
| `user.name` vazio/null | nao aplica prefixo (fallback seguro) |
| `message` vazio | nao aplica (so midia, por exemplo) |
| Mensagem ja comeca com `*` | aplica mesmo assim (nao faz deteccao — mantem previsivel) |
| Flag desligada | comportamento atual, zero diff |
| Variaveis `{{contactData.name}}` | prefixo vai ANTES, variaveis ja resolvidas |
| Mensagem salva no banco | salva **com** prefixo — e isso que foi enviado, o historico precisa bater |

## Testes

### Manual (dev)
1. Conta com `sendModeratorName=false` → enviar texto WhatsApp → sem prefixo.
2. Ativar flag no front → enviar texto WhatsApp → recebe `*Lucas Brito*: ...`.
3. Enviar imagem com caption "Olha isso" → caption final `*Lucas Brito*: Olha isso`.
4. Enviar imagem **sem** caption → nao criar caption vazia; envia so a imagem.
5. Enviar video com caption → caption prefixada.
6. Enviar documento com caption → caption prefixada.
7. Enviar audio → contato recebe 2 bolhas: `*Lucas Brito*` (texto) + audio.
8. Enviar template → sem prefixo.
9. Enviar observacao interna → salva **com** prefixo.
10. Repetir 1-9 para Instagram.
11. Texto com `{{contactData.firstName:Fulano}}` → prefixo + variavel resolvida.

### Automatizado
- Unit test do `buildModeratorPrefixedMessage` (input/output simples).
- (Opcional) integration test do SendMessageToContact com mock do CloudApi/FacebookAPI.

## Impacto / risco

- **Baixo** — mudanca isolada em uma funcao, gated por flag default `false`.
- Nenhum breaking change (contas existentes continuam com comportamento atual).
- Nenhuma migracao de dados.
- Performance: +1 concat de string por mensagem, negligivel.

## Ordem de execucao

1. Schema + migration (`chatfunnel-core/prisma/schema.prisma`) + `npm run prisma:generate`
2. Sync manual do `@chatfunnel/core` nos consumers (feito pelo usuario)
3. Backend — helper + aplicacao em handleWhatsapp/handleInstagram
4. Backend — aceitar `sendModeratorName` no UpdateAccount
5. Front — toggle no OrganizationForm
6. Teste manual ponta-a-ponta em dev
7. Atualizar vault (wiki de livechat + entrada em features)

## Perguntas em aberto

Nenhuma — escopo fechado em 2026-04-20:

- tabela: `Accounts` (chatfunnel-core)
- formato: `*Nome*: mensagem`
- aplica em: texto, caption de midia, audio (via mensagem extra), observacao
- plataformas: WhatsApp + Instagram
- audio: opcao (a) — texto `*Nome*` antes do audio, falha do texto nao bloqueia o audio
