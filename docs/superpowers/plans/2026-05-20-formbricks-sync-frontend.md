# Formbricks Survey Sync — Frontend Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No início de cada sessão, buscar do backend quais surveys o usuário já respondeu e pré-popular o localStorage do Formbricks SDK (`formbricks-js`) ANTES do `setup()`, para que o SDK pule surveys já respondidas — mesmo com cache limpo ou aba anônima.

**Architecture:** Frontend busca surveys respondidas do backend (1x por sessão), injeta em `displays` e `responses` do localStorage, depois inicializa o SDK. O SDK lê o state pré-populado e filtra surveys já respondidas.

**Tech Stack:** Vue 3, Axios (NestApi), @formbricks/js SDK v4.4.0, Pinia

**Pré-requisito:** Backend plan (`2026-05-20-formbricks-sync-backend.md`) implementado — endpoint `GET /nest/formbricks/answered-surveys` disponível.

---

## Contexto Técnico

### Como o Formbricks decide se exibe uma survey

Chave localStorage: `formbricks-js`

```json
{
  "expiresAt": null,
  "data": {
    "userId": null,
    "contactId": null,
    "segments": [],
    "displays": [{ "surveyId": "xxx", "createdAt": "2026-..." }],
    "responses": ["xxx"],
    "lastDisplayAt": "2026-..."
  }
}
```

Lógica interna do SDK (source: `formbricks.umd.cjs`):
- `displayOnce`: `displays.filter(d => d.surveyId === survey.id).length === 0`
- `displaySome`: `displays.filter(d => d.surveyId === survey.id).length < survey.displayLimit`
- `responses` array: surveys que receberam resposta (array de `surveyId` strings)

### Fluxo

```
[Login / refresh / nova aba]
  → router.afterEach (1ª vez com usuário logado)
  → initFormbricks(userId):
       1. GET /nest/formbricks/answered-surveys → ["surveyA", "surveyB"]
       2. Injeta em localStorage displays + responses
       3. formbricks.setup() lê localStorage já atualizado
  → registerRouteChange() + track("page_view") (enfileirados pelo SDK)
  → Formbricks filtra: surveyA/B respondidas → pula
                        surveyC nova → exibe ✅
```

### Quando roda o sync

| Cenário | Sync roda? | Por quê |
|---------|-----------|---------|
| Refresh (F5) | Sim | JS reinicia, flag `synced` reseta |
| Nova aba | Sim | Nova instância |
| Login novo | Sim | `resetFormbricksSync()` chamado no logout |
| Navegação normal | Não | Flag `synced = true` impede |
| Respondeu survey na sessão | Não precisa | Formbricks atualiza localStorage automaticamente |

---

## File Structure

### Criar

| Arquivo | Responsabilidade |
|---------|-----------------|
| `chatfunnel-front/src/common/services/FormbricksService.js` | HTTP client para endpoint do backend |

### Modificar

| Arquivo | Mudança |
|---------|---------|
| `chatfunnel-front/src/formbricks.js` | Remover setup automático, adicionar sync + init deferido |
| `chatfunnel-front/src/main.js` | `afterEach` chama `initFormbricks()` uma vez |
| `chatfunnel-front/src/stores/auth.js` | `clearToken` reseta flag de sync |

---

## Task 1: Service HTTP — FormbricksService

**Files:**
- Create: `chatfunnel-front/src/common/services/FormbricksService.js`

- [ ] **Step 1: Criar FormbricksService**

Criar `chatfunnel-front/src/common/services/FormbricksService.js`:

```javascript
import { NestApi } from "../api/index";

const FormbricksService = {
  getAnsweredSurveys: () => NestApi.get()("/formbricks/answered-surveys"),
};

export default FormbricksService;
```

- [ ] **Step 2: Adicionar export no barrel (se existir)**

Se `chatfunnel-front/src/common/services/index.js` tiver barrel exports, adicionar:

```javascript
export { default as FormbricksService } from "./FormbricksService";
```

- [ ] **Step 3: Commit**

```bash
cd chatfunnel-front
git add src/common/services/FormbricksService.js
git commit -m "feat: add FormbricksService for answered-surveys endpoint"
```

---

## Task 2: Refatorar formbricks.js — Sync + Setup Deferido

**Files:**
- Modify: `chatfunnel-front/src/formbricks.js`

- [ ] **Step 1: Substituir conteúdo de formbricks.js**

Substituir o conteúdo de `chatfunnel-front/src/formbricks.js` por:

```javascript
import formbricks from "@formbricks/js";
import FormbricksService from "./common/services/FormbricksService";

const FORMBRICKS_LS_KEY = "formbricks-js";
let synced = false;

/**
 * Sincroniza o localStorage do Formbricks com as surveys respondidas
 * pelo usuário, obtidas do backend via webhook.
 *
 * Deve rodar ANTES do formbricks.setup() para que o SDK
 * já inicie sabendo quais surveys pular.
 */
function syncLocalStorage(answeredSurveyIds) {
  if (!answeredSurveyIds.length) return;

  const raw = localStorage.getItem(FORMBRICKS_LS_KEY);
  const state = raw
    ? JSON.parse(raw)
    : {
        expiresAt: null,
        data: {
          userId: null,
          contactId: null,
          segments: [],
          displays: [],
          responses: [],
          lastDisplayAt: null,
        },
      };

  for (const surveyId of answeredSurveyIds) {
    if (!state.data.displays.some((d) => d.surveyId === surveyId)) {
      state.data.displays.push({
        surveyId,
        createdAt: new Date().toISOString(),
      });
    }
    if (!state.data.responses.includes(surveyId)) {
      state.data.responses.push(surveyId);
    }
  }

  localStorage.setItem(FORMBRICKS_LS_KEY, JSON.stringify(state));
}

/**
 * Inicializa o Formbricks: busca surveys respondidas do backend,
 * sincroniza localStorage, depois roda setup().
 * Executa apenas uma vez por sessão (flag `synced`).
 */
export async function initFormbricks(userId) {
  if (synced || !import.meta.env.VITE_FORMBRICKS_WORKSPACE_ID) return;
  synced = true;

  try {
    const res = await FormbricksService.getAnsweredSurveys();
    if (res.data?.length) {
      syncLocalStorage(res.data);
    }
  } catch (e) {
    // Backend indisponível — continua sem sync
  }

  await formbricks.setup({
    environmentId: import.meta.env.VITE_FORMBRICKS_WORKSPACE_ID,
    appUrl:
      import.meta.env.VITE_FORMBRICKS_APP_URL || "https://app.formbricks.com",
  });
}

/**
 * Reseta flag de sync — chamar no logout para que
 * o próximo login faça sync novamente.
 */
export function resetFormbricksSync() {
  synced = false;
}

export default formbricks;
```

**Mudanças em relação ao original:**
- Removido `formbricks.setup()` automático no import
- Removido listener `formbricksSurveyCompleted` (controle é via webhook no backend)
- Adicionado `initFormbricks(userId)` — sync + setup (1x por sessão)
- Adicionado `resetFormbricksSync()` — para chamar no logout

- [ ] **Step 2: Commit**

```bash
cd chatfunnel-front
git add src/formbricks.js
git commit -m "feat: defer formbricks setup, sync answered surveys from backend"
```

---

## Task 3: Integrar no main.js e auth.js

**Files:**
- Modify: `chatfunnel-front/src/main.js`
- Modify: `chatfunnel-front/src/stores/auth.js`

- [ ] **Step 1: Atualizar main.js — afterEach**

Em `chatfunnel-front/src/main.js`:

**Remover** o import na linha 36:

```javascript
// REMOVER:
import formbricks from "@/formbricks";
```

**Substituir** o bloco `Formbricks Route Tracking` (linhas 115-142) por:

```javascript
// ——————————————————————————————
// Formbricks Route Tracking
// ——————————————————————————————
import formbricks, { initFormbricks } from "@/formbricks";

router.afterEach(() => {
  if (typeof formbricks !== "undefined") {
    const authStore = useAuthStore();
    if (authStore.userData?.email && authStore.organizationData) {
      // Sync + setup (roda 1x — flag interna impede re-execução)
      initFormbricks(authStore.userData.userId);

      // Estes são enfileirados pelo SDK se setup ainda não completou
      formbricks.registerRouteChange();
      formbricks.track("page_view", {
        hiddenFields: {
          userIdCf: authStore.userData.userId || "",
          email: authStore.userData.email,
          name: authStore.userData.name || "",
          organizationId: authStore.organizationData.id || "",
          organizationName: authStore.organizationData.name || "",
          plan: authStore.organizationData.plan || "",
          subscriptionStatus:
            authStore.organizationData.subscriptionStatus || "",
          founderMember: String(!!authStore.organizationData.founderMember),
          isBlockedForPayment: String(
            !!authStore.organizationData.isBlockedForPayment
          ),
          moderated: String(!!authStore.organizationData.moderated),
        },
      });
    }
  }
});
```

**Mudanças:**
- Import agora inclui `{ initFormbricks }` e fica junto do bloco
- `initFormbricks(userId)` chamado antes de `registerRouteChange`/`track`
- Sem `await` — é fire-and-forget; o SDK enfileira as chamadas seguintes

- [ ] **Step 2: Atualizar auth.js — resetar sync no logout**

Em `chatfunnel-front/src/stores/auth.js`, adicionar import no topo (junto dos outros imports):

```javascript
import { resetFormbricksSync } from "@/formbricks";
```

Na action `clearToken()` (linha 161), adicionar `resetFormbricksSync()` após `formbricks.logout()`:

```javascript
clearToken() {
  this.token = null;
  this.organizationData = null;
  this.accountSelected = null;
  this.permissions = {};
  Sentry.setUser(null);
  amplitude.reset();
  formbricks.logout();
  resetFormbricksSync();
  this.lastKanbanSelectedId = null;
  this.pendingConsents = [];
},
```

- [ ] **Step 3: Verificar build**

```bash
cd chatfunnel-front
npm run build
```

- [ ] **Step 4: Teste manual**

1. Abrir o app logado → verificar que surveys aparecem normalmente
2. Responder uma survey → verificar que webhook chega no backend (logs)
3. Limpar localStorage do browser (`localStorage.removeItem("formbricks-js")`)
4. Dar refresh na página
5. Verificar que a survey respondida **NÃO** reaparece (sync funcionou)
6. Verificar no localStorage que `formbricks-js` contém o `surveyId` em `displays` e `responses`
7. Fazer logout → login → verificar que sync roda novamente

- [ ] **Step 5: Commit**

```bash
cd chatfunnel-front
git add src/main.js src/stores/auth.js
git commit -m "feat: wire formbricks sync in router afterEach and reset on logout"
```

---

## Resumo do Fluxo Final

```
[Usuário responde survey no browser]
  │
  ├─ Formbricks atualiza localStorage automaticamente (sessão atual OK)
  └─ Formbricks envia webhook → Backend salva { userId, surveyId }

[Usuário abre nova aba / limpa cache / outro browser]
  │
  ├─ router.afterEach (1ª vez com auth)
  │    ├─ initFormbricks(userId)
  │    │    ├─ GET /nest/formbricks/answered-surveys → ["surveyA"]
  │    │    ├─ Injeta surveyA em localStorage displays + responses
  │    │    └─ formbricks.setup() lê localStorage atualizado
  │    ├─ registerRouteChange()
  │    └─ track("page_view", { hiddenFields })
  │
  └─ Formbricks filtra: surveyA já respondida → pula
                         surveyB nova → exibe ✅
```
