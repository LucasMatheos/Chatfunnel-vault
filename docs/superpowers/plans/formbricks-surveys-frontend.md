# Integração Formbricks — Guia para o Frontend

Este documento descreve as alterações de backend feitas na branch `feature/formbrick-webhook` e o que precisa ser implementado no frontend para que **uma mesma pesquisa não apareça novamente para um usuário que já respondeu**.

---

## 1. Visão geral do fluxo

```
Frontend (Vue)
  │
  │ 1. Antes de exibir a pesquisa → consulta a API
  ▼
GET /nest/users/me/surveys/:surveyId   ──► chatfunnel-services
  │
  │ 2. Se { answered: false } → exibe o widget do Formbricks
  │    (passando userIdCf como atributo do contato)
  ▼
Formbricks (SDK no FE)
  │
  │ 3. Usuário responde → Formbricks dispara webhook
  ▼
POST /nest/webhooks/formbricks         ──► chatfunnel-services
  │
  │ 4. Backend valida assinatura, faz upsert em UserSurveyResponses
  ▼
Postgres (tabela `UserSurveyResponses`)
```

A regra "não mostrar pesquisa repetida" é **responsabilidade do frontend**: antes de renderizar/abrir o widget do Formbricks, o FE precisa perguntar para a API se aquele usuário já respondeu aquele `surveyId`. Se já respondeu, simplesmente não exibe.

---

## 2. Endpoints novos (para o FE consumir)

### `GET /nest/users/me/surveys/:surveyId`

Verifica se o usuário autenticado já respondeu uma pesquisa específica.

- **Auth**: Bearer JWT (mesmo padrão dos outros endpoints autenticados do `users`).
- **Path params**:
  - `surveyId` *(string)* — id da pesquisa **no Formbricks** (o mesmo `surveyId` que o Formbricks envia no payload da resposta).
- **Body**: nenhum.

#### Resposta `200 OK`

```json
{
  "answered": true,
  "answeredAt": "2026-05-19T18:42:11.000Z"
}
```

| Campo        | Tipo                    | Descrição                                                          |
|--------------|-------------------------|--------------------------------------------------------------------|
| `answered`   | `boolean`               | `true` se já existe uma resposta persistida para esse usuário+survey. |
| `answeredAt` | `string \| null` (ISO)  | Data/hora em que a resposta foi finalizada. `null` se nunca respondeu. |

> O provider considerado é sempre `FORMBRICKS` (default da tabela). Não é necessário passar provider.

#### Exemplo de chamada

```ts
const { data } = await api.get(`/nest/users/me/surveys/${surveyId}`);

if (!data.answered) {
  // abrir / exibir o widget do Formbricks para esse surveyId
}
```

#### Erros

- `401 Unauthorized` — JWT ausente/expirado.

---

### `GET /nest/users/me/surveys`

Lista **todas** as respostas de survey persistidas para o usuário autenticado. Útil quando o FE precisa decidir vários widgets de uma vez (uma única chamada em vez de N chamadas ao endpoint acima) ou para exibir um histórico.

- **Auth**: Bearer JWT.
- **Path/query params**: nenhum.
- **Body**: nenhum.

#### Resposta `200 OK`

```json
[
  {
    "id": "c8d4f7e2-1a2b-4c3d-9e0f-aaaaaaaaaaaa",
    "surveyId": "clxyz123abc",
    "provider": "FORMBRICKS",
    "responseId": "resp_01HABCDXYZ",
    "answeredAt": "2026-05-19T18:42:11.000Z",
    "createdAt": "2026-05-19T18:42:12.123Z"
  }
]
```

Ordenado por `answeredAt` **descendente** (mais recente primeiro). Retorna `[]` se o usuário nunca respondeu nada.

| Campo        | Tipo                   | Descrição                                                                   |
|--------------|------------------------|-----------------------------------------------------------------------------|
| `id`         | `string` (UUID)        | Id interno da resposta no ChatFunnel.                                       |
| `surveyId`   | `string`               | Id da pesquisa no provider externo (ex.: Formbricks).                       |
| `provider`   | `string`               | Provider da pesquisa. Hoje sempre `FORMBRICKS`.                             |
| `responseId` | `string \| null`       | Id da resposta no provider externo (quando enviado pelo webhook).           |
| `answeredAt` | `string` (ISO)         | Quando o usuário finalizou a resposta.                                      |
| `createdAt`  | `string` (ISO)         | Quando o registro foi criado no banco.                                      |

> A coluna `responseData` (JSON cru enviado pelo provider) **não é retornada** — não fica exposta ao front por design.

#### Exemplo de chamada

```ts
const { data } = await api.get(`/nest/users/me/surveys`);
const answeredIds = new Set(data.map((r) => r.surveyId));

if (!answeredIds.has(surveyId)) {
  // exibe o widget
}
```

#### Erros

- `401 Unauthorized` — JWT ausente/expirado.

---

## 3. Como o backend recebe a resposta (contexto, não precisa chamar)

### `POST /nest/webhooks/formbricks`

Endpoint **público** chamado **pelo próprio servidor do Formbricks**, não pelo frontend. Está documentado aqui só para você entender o que o backend faz.

- Recebe os eventos do tipo `responseFinished`.
- Valida a assinatura **Standard Webhooks** (`webhook-id`, `webhook-timestamp`, `webhook-signature`) usando o segredo `FORMBRICKS_SECRET` (configurado no Formbricks).
- Faz `upsert` em `UserSurveyResponses` com a chave única `(userId, surveyId, provider)`.

**O backend só consegue gravar a resposta se o payload do Formbricks tiver `data.userIdCf` preenchido com o id do usuário do ChatFunnel.** Sem isso, a resposta é descartada (com log de warning) e o endpoint `GET /users/me/surveys/:surveyId` continuará retornando `answered: false` mesmo depois do usuário responder — ou seja, a pesquisa **vai aparecer de novo**.

Portanto, o passo crítico do FE é o próximo item.

---

## 4. O que o FE precisa fazer ao mostrar o Formbricks

### 4.1. Antes de exibir

```ts
const surveyId = "<id-do-survey-no-formbricks>";

const { data } = await api.get(`/nest/users/me/surveys/${surveyId}`);
if (data.answered) return; // não exibe nada

// exibe o widget
```

### 4.2. Ao inicializar/abrir o Formbricks

Configurar o SDK do Formbricks (ou os atributos do contato, dependendo de como o widget está integrado) para que o **atributo `userIdCf` do contato seja igual ao `id` do usuário logado no ChatFunnel** (UUID, mesmo id que o backend usa em `Users.id`).

Exemplo conceitual (depende da forma como o SDK do Formbricks foi inicializado no projeto):

```ts
formbricks.setUserId(currentUser.id);
formbricks.setAttribute("userIdCf", currentUser.id);
```

> O nome do atributo precisa ser **exatamente `userIdCf`** — é a chave que o handler lê em `data.data.userIdCf`. Se o atributo for nomeado de outra forma, o webhook ignora a resposta e a pesquisa volta a aparecer.

### 4.3. Após resposta

Não precisa fazer nada no FE — o Formbricks dispara o webhook, o backend grava, e na próxima vez que o FE chamar `GET /users/me/surveys/:surveyId` virá `answered: true`.

Se quiser uma UX mais "imediata" (sem esperar o webhook chegar), o FE pode marcar localmente em memória/`sessionStorage` que aquele `surveyId` foi exibido para aquele usuário nesta sessão. Mas a fonte da verdade entre sessões/devices é o endpoint.

---

## 5. Resumo de checklist do FE

- [ ] Antes de exibir qualquer survey do Formbricks, validar contra o backend e só exibir se ainda não foi respondido. Duas opções:
  - **Single-check**: `GET /nest/users/me/surveys/:surveyId` para cada survey (útil quando se trata de uma pesquisa pontual).
  - **Bulk**: `GET /nest/users/me/surveys` uma única vez na sessão e filtrar pelo `surveyId` localmente (recomendado quando há vários widgets concorrentes).
- [ ] Garantir que o widget do Formbricks recebe `userIdCf = <id do usuário logado>` como atributo do contato.
- [ ] Não confiar apenas em estado local — sempre validar contra o endpoint ao montar a tela / abrir o componente.
- [ ] (Opcional) Cachear o resultado por sessão para evitar refazer o GET a cada navegação.

---

## 6. Arquivos do backend (referência)

- `src/modules/users/controllers/users.controller.ts` — endpoints `GET me/surveys` e `GET me/surveys/:surveyId`.
- `src/modules/users/services/users.service.ts` — `listSurveyResponses` e `hasAnsweredSurvey`.
- `src/modules/webhooks/controllers/webhooks.controller.ts` — `POST webhooks/formbricks`.
- `src/modules/webhooks/commands/formbricks/handler.ts` — validação Standard Webhooks + upsert.
- `src/database/repositories/user_survey_responses.repository.ts` — wrapper Nest do repositório.
- `chatfunnel-core` — modelo `UserSurveyResponses` (unique `[userId, surveyId, provider]`).
