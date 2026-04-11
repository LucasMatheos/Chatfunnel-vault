---
title: Guia Técnico — Onboarding Flow
description: Passo a passo detalhado da implementacao do onboarding, incluindo arquivos, composables, APIs, route guards e fluxos internos de cada fase.
tags: [guide, onboarding, signup, auth, organization, channels, flow]
related: ["[[onboarding-flow]]", "[[organization-form]]", "[[channels]]"]
last_updated: 2026-04-08
---

# Guia Técnico: Onboarding Flow

> Feature correspondente: [[onboarding-flow]]

## Fase 1: Signup (`/signup`)

### Arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/views/auth/SignUpPage.vue` | Wrapper da página |
| `src/views/auth/components/SignUpSteps/index.vue` | Orquestra os steps |
| `src/views/auth/components/SignUpSteps/components/CreateAccountStep.vue` | Criação de conta |
| `src/views/auth/components/SignUpSteps/components/VerifyEmailStep.vue` | Verificação de email |
| `src/views/auth/components/SignUpSteps/components/ProfileStep.vue` | Dados pessoais |
| `src/views/auth/components/SignUpSteps/components/SurveyStep.vue` | Questionário |

### Auth Store — controle de step

```javascript
// src/stores/auth.js:60
currentSignUpStep: (state) => {
  if (!state.token) return "CREATE_ACCOUNT"
  if (state.EmailVerified === false) return "VERIFY_EMAIL"
  if (state.PerfilFormAnswered === false) return "PROFILE"
  if (state.SurveyFormAnswered === false) return "SURVEY"
  return "DONE"
}
```

### Criação de conta — passo a passo

1. `UserService.createUserV2(form)` → `POST /users/create-v2`
   - Payload: email, senha, cupom, UTMs, userAgent, IP
   - Retorna: `{ Authorization, AccountSelected, AccountVerified, PerfilFormAnswered }`
2. `authStore.setToken(token, accountSelected)` → decodifica JWT, salva no store
3. `OrganizationService.getOrganization(accountSelected)` → busca org criada automaticamente
4. Redirect para próximo step

### Route guard

```javascript
// src/router/index.js:753-759
if (
  authStore.currentSignUpStep != "DONE" &&
  !authStore.moderated &&
  (to.name != "SignUp" || to.name != "LogIn")
) {
  return next({ name: "SignUp" })
}
```

---

## Fase 2: Seleção de Organização (`/select`)

### Arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/layout/OrganizationsLayout/index.vue` | Página principal |
| `src/layout/OrganizationsLayout/composables/useOrganizations.ts` | Lógica de listagem, seleção, delete |
| `src/layout/OrganizationsLayout/OrganizationCardV2.vue` | Card de cada org |
| `src/layout/OrganizationsLayout/components/NewOrgCard.vue` | Card "criar nova" |
| `src/layout/OrganizationsLayout/components/SelectOrgTopbar.vue` | Topbar com user info |
| `src/layout/OrganizationsLayout/components/EditOrgDialog.vue` | Dialog de edição |
| `src/layout/OrganizationsLayout/components/ReactivatePlanDialog.vue` | Reativação de plano |
| `src/layout/OrganizationsLayout/OrganizationFormV2/index.vue` | Form de criação (ver [[organization-form]]) |

### APIs chamadas

| Ação | Service | Endpoint |
|------|---------|----------|
| Listar orgs | `OrganizationService.listOrganizations()` | `GET /organizations/list` |
| Selecionar org | `OrganizationService.getOrganization(id)` | `GET /organizations/:id` |
| Deletar org | `OrganizationService.deleteSoftOrganization(id)` | `DELETE /organizations/delete_soft/:id` |
| Editar org | `OrganizationService.updateOrganization(body)` | `POST /organizations/update` (multipart) |
| Reativar plano | `OrganizationService.reactivatePlan(form)` | `POST /organizations/create_reactivate_session` |

### Fluxo de seleção

1. `onMounted` → `listOrganizations()` carrega lista
2. Usuário clica no card → `handleSelectOrg(org)`
3. `selectOrganization(id)` → `OrganizationService.getOrganization(id)`
4. `authStore.setOrganizationData(org)` → preenche `organizationData`
5. Guard libera → avança para onboarding ou dashboard

### Checkout Session Validation (retorno do Stripe)

Se a rota é `CheckoutSessionValidation` (`/checkout_session_validation/:token`):

```javascript
// src/layout/OrganizationsLayout/index.vue:278-294
const token = route.params.token
const savedData = JSON.parse(localStorage.getItem(`checkout_session_${token}`) || '{}')
OrganizationService.validateCheckoutSession(savedData.checkoutSessionId, token)
  .then((res) => {
    router.push({ name: 'SelectOrganization' })
    organizationFormRef.value?.showDialogWithData(savedData, res.data)
  })
  .catch(() => {
    router.push({ name: 'SelectOrganization' })
  })
```

### Route guard

```javascript
// src/router/index.js:778
if (authStore.organizationData?.id == undefined) {
  return next({ name: "SelectOrganization" })
}
```

---

## Fase 3: Onboarding V2 (`/organization-onboarding`)

### Arquivos

```
src/layout/OrganizationsLayout/onboarding-v2/
├── index.vue                    # Componente principal (~1500 linhas)
├── components/
│   ├── OnboardingHero.vue       # Tela inicial com CTA "Começar"
│   ├── OnboardingStepper.vue    # Barra de progresso (3 milestones)
│   ├── OnboardingChat.vue       # Container scrollável do chat
│   ├── ChatMessage.vue          # Bolha individual (bot ou user)
│   ├── ChatInputBar.vue         # Input de texto do usuário
│   ├── ChatOptions.vue          # Botões de opção interativos
│   ├── ChatOAuthButton.vue      # Botão de OAuth (Facebook/Instagram)
│   ├── ChatChannelStatus.vue    # Indicador de status do canal
│   ├── ChatInstagramAccounts.vue # Lista de contas Instagram para seleção
│   ├── ChatFlowDialog.vue       # Dialog fullscreen de seleção de template
│   ├── ChatFlowPreview.vue      # Preview visual do flow selecionado
│   └── ChatPhaseDivider.vue     # Separador "─── Organização ───"
├── composables/
│   ├── useOnboardingChat.ts     # Fila de mensagens, typing delay, resolvers
│   ├── useOnboardingProgress.ts # Milestones, activationPercent, step ativo
│   └── useOnboardingSteps.ts    # Definição dos 3 steps e labels
├── types/
│   └── onboarding.ts            # OnboardingMessage, OnboardingMilestone, etc.
└── data/
    └── flowTemplates.ts         # ONBOARDING_TEMPLATES com nomes e configs
```

### Composables — detalhamento

**useOnboardingChat.ts:**
- `messages: Ref<OnboardingMessage[]>` — array reativo de mensagens
- `addBotMessage(content, interactive?)` — adiciona msg do bot com delay de "digitando"
- `addUserMessage(content)` — adiciona resposta do usuário instantaneamente
- `addDivider(label)` — separador visual entre fases
- `waitForText(): Promise<string>` — cria promise que resolve quando usuário envia texto no input
- `waitForOption(): Promise<string>` — resolve quando usuário clica em um botão de opção
- `waitForAction(): Promise<any>` — resolve quando uma ação externa completa (OAuth, upload)
- `resolveAction(value)` — resolve manualmente a promise pendente (usado por componentes filhos)

**useOnboardingProgress.ts:**
- `milestones: Ref<Record<string, boolean>>` — `{ org: false, channel: false, template: false }`
- `activeStep: Ref<number>` — 1, 2 ou 3
- `setActiveStep(n)` — atualiza step + stepper visual
- `completeMilestone(key)` — marca como true
- `activationPercent: ComputedRef<number>` — `(completados / 3) * 100`
- `activationLabels` — labels para exibição no stepper

### Milestone 1: Organização

```
Entrada: setActiveStep(1) + addDivider("Organização")

Bot: "Olá! Que bom ter você aqui no ChatFunnel..."
Bot: "Para começar, qual o nome da sua organização?"
→ waitForText() → orgName

Bot: "Ótimo! Agora descreva brevemente o que a {orgName} faz"
→ waitForText() → orgDesc

Bot: "Quer adicionar um logo?"
→ waitForAction() → upload ou skip

API: OrganizationService.updateOrganization({ name, description, file })
→ completeMilestone('org')
```

### Milestone 2: Canais

```
Entrada: setActiveStep(2) + addDivider("Canais")

Bot: "Agora vamos conectar seus canais de atendimento"
Bot: "Quer conectar o WhatsApp?"
→ waitForOption() → "sim" ou "pular"

Se "sim":
  → ChatOAuthButton renderiza botão Facebook
  → Abre popup Facebook embedded-signup
  → Escuta window.addEventListener('message') para WA_EMBEDDED_SIGNUP
  → Recebe: { code, phoneNumberId, wabaId }
  → OrganizationService.linkWhatsapp(channelId, { code, phoneNumberId, wabaId })
  → ChatChannelStatus mostra "WhatsApp conectado ✓"

Bot: "E o Instagram?"
→ waitForOption() → "sim" ou "pular"

Se "sim":
  → OAuth Facebook login
  → AccountsService.listInstagramAccounts() → lista de páginas
  → ChatInstagramAccounts renderiza seletor
  → waitForAction() → conta selecionada
  → OrganizationService.linkInstagram({ pageId, instagramId, channelId })

→ completeMilestone('channel') se pelo menos 1 conectado
```

### Milestone 3: Template

```
Entrada: setActiveStep(3) + addDivider("Automação")

Bot: "Última etapa! Escolha um template de automação para começar"
→ ChatFlowDialog abre com ONBOARDING_TEMPLATES (de data/flowTemplates.ts)
→ Usuário seleciona template
→ ChatFlowPreview mostra preview do flow
→ waitForOption() → "usar este" ou "trocar"

API: OrganizationService.saveOnboarding({ template, flow })
→ completeMilestone('template')
```

### Finalização

```
Bot: "Tudo pronto! Aqui está o resumo..."
→ Card resumo mostrando os 3 milestones ✓/✗

Bot: "Para onde quer ir agora?"
→ waitForOption() entre:
   - "Dashboard"        → { name: "Dashboard", query: { startTour: "true" } }
   - "Criar automações" → { name: "AutomationsList", query: { startTour: "true" } }
   - "Convidar equipe"  → { name: "ModeratorsList", query: { startTour: "true" } }
   - "Configurar canais"→ { name: "ConfigurationScreen" }

→ finishOnboarding()
   authStore.setAnsweredInitialForm()   // marca como completo
   authStore.updateAccountList()        // atualiza lista de orgs

→ router.push(destino escolhido)
```

### Route guard

```javascript
// src/router/index.js:769
if (
  !authStore.hasAnsweredInitialForm &&
  to.name != "OrganizationOnboarding" &&
  !!authStore.organizationData?.id
) {
  return next({ name: "OrganizationOnboarding" })
}
```

---

## Auth Store — estado relevante

```javascript
// src/stores/auth.js — propriedades usadas no onboarding
{
  token: null,                     // JWT
  userData: null,                  // Objeto do usuário
  organizationData: null,          // Org selecionada
  EmailVerified: false,
  PerfilFormAnswered: false,
  SurveyFormAnswered: false,
}

// Getters
hasAnsweredInitialForm → organizationData?.answeredInitialForm
currentSignUpStep → determina step do /signup
founderMemberByUser → pula seleção de plano/Stripe
isAuthenticated → !!token

// Actions
setToken(token, accountSelected)   // Login
setAnsweredInitialForm()           // Marca onboarding completo
setOrganizationData(org)           // Seleciona org
updateAccountList()                // Atualiza lista
clearToken()                       // Logout
```

---

## Diagrama

```mermaid
flowchart TD
    START([Primeiro Acesso]) --> SIGNUP

    subgraph SIGNUP["/signup"]
        S1[Criar Conta<br/>UserService.createUserV2] --> S2[Verificar Email]
        S2 --> S3[Perfil]
        S3 --> S4[Survey]
    end

    S4 -->|currentSignUpStep == DONE| SELECT

    subgraph SELECT["/select"]
        SEL_LIST[Listar Organizacoes<br/>listOrganizations]
        SEL_LIST --> SEL_CHOICE{Acao}
        SEL_CHOICE -->|Criar nova| CREATE_ORG
        SEL_CHOICE -->|Selecionar existente| SEL_ORG[getOrganization]

        subgraph CREATE_ORG[OrganizationFormV2]
            CO1[Step 1: Nome + Descricao] --> CO2[Step 2: Plano]
            CO2 --> CO3[Stripe Checkout]
            CO3 --> CO4[createOrganization]
        end
    end

    CREATE_ORG -->|org criada| SEL_ORG
    SEL_ORG -->|organizationData.id exists| ONBOARDING

    subgraph ONBOARDING["/organization-onboarding — Chat V2"]
        direction TB
        OB1[Fase 1: Organizacao<br/>Nome + Descricao + Logo<br/>updateOrganization]
        OB1 -->|milestone org| OB2

        OB2[Fase 2: Canais]
        OB2 --> WA[WhatsApp<br/>Facebook OAuth<br/>linkWhatsapp]
        OB2 --> IG[Instagram<br/>OAuth + listAccounts<br/>linkInstagram]
        OB2 --> SKIP_CH[Pular]
        WA -->|milestone channel| OB3
        IG -->|milestone channel| OB3
        SKIP_CH --> OB3

        OB3[Fase 3: Template<br/>Seleciona flow<br/>saveOnboarding]
        OB3 -->|milestone template| FINISH
    end

    FINISH[finishOnboarding<br/>setAnsweredInitialForm] -->|hasAnsweredInitialForm| DEST

    DEST{Destino}
    DEST -->|Dashboard| DASH[/dashboard<br/>startTour: true]
    DEST -->|Flows| FLOWS[/automations]
    DEST -->|Equipe| TEAM[/moderators]
    DEST -->|Canais| CONFIG[/configuration]

    style SIGNUP fill:#f3e8ff,stroke:#7c3aed
    style SELECT fill:#ede9fe,stroke:#7c3aed
    style ONBOARDING fill:#e0e7ff,stroke:#4f46e5
    style FINISH fill:#d1fae5,stroke:#059669
```

---

## Gotchas

- `DisconectChannels.vue` tinha `onMounted` que chamava `listChannels()` sem necessidade na tela `/select` — corrigido para só carregar ao abrir dialog
- `PlansEnum` usa `subscription` (STARTER/PREMIUM/ADVANCED) mas o banco pode retornar valores legados (LITE/PRO) — `getPlanLabel()` busca do PlansEnum com fallback
- O `startTour: "true"` na query ativa driver.js — se removido da URL, o tour não aparece
- Founder members pulam seleção de plano e Stripe — `goToNext()` chama `handleConfirm()` direto
- O checkout do Stripe salva form no `localStorage[checkout_session_${token}]` antes do redirect — ao voltar, o layout lê e chama `showDialogWithData(savedData, true)`
