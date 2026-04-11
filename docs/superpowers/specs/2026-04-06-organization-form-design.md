# Organization Form — Design Spec

## Overview

Substituir o `OrganizationForm` legado (Vuetify, dialog 90%, 5 steps com codigo morto) por um wizard moderno usando o design system atual (shadcn-vue, Tailwind v4, Reka UI).

## Decisoes

| Decisao | Escolha | Motivo |
|---------|---------|--------|
| Dialog size | **Custom (max-w-[1100px])** via class prop no `DialogControl` | Acomoda 4 plan cards lado-a-lado; `xl` (900px) e muito estreito |
| Stepper | **StepperControl** (`ui/stepper`) horizontal | Padrao industria SaaS (Stripe, Linear, Vercel); ja existe no DS, testado, acessivel |
| Steps reais | **2** (Dados + Plano) | Steps de loading/sucesso sao estados, nao steps; pagamento e externo (Stripe Checkout) |
| Plan cards | **Notion-style** | Cards com destaque visual no recomendado; "Tudo do X, mais:" incremental |
| Badge plano | **"Mais escolhido"** no Advanced | Em vez de "Recomendado" |
| Comparacao | **Modal nested** sobre o dialog principal | Link "Comparar todos os planos" abre tabela por categorias |
| Founder member | Pula Step 2, cria org direto | Fluxo existente mantido |

## Step 1 — Dados da organizacao

### Layout

```
┌──────────────────────────────────────┐
│  StepperControl: [● Dados] — [○ Plano] │
├──────────────────────────────────────┤
│  Nova organizacao                     │
│  Preencha os dados basicos.           │
│                                       │
│  [Avatar upload]  Logo da organizacao │
│                   PNG ou JPG, max 2MB │
│                                       │
│  Nome *                               │
│  [______________________________]     │
│                                       │
│  Descricao (opcional)                 │
│  [______________________________]     │
│  [______________________________]     │
│                                       │
│            [Cancelar] [Proximo →]     │
└──────────────────────────────────────┘
```

### Componentes

- `DialogControl` class `max-w-[1100px]`, `:close-on-overlay="false"` `:close-on-escape="false"`
- `StepperControl` v-model com 2 steps: `[{ title: 'Dados' }, { title: 'Plano' }]`
- Avatar: `useImagePicker` composable (mesmo do `EditOrgDialog`)
- Nome: `Field` + `InputControl` com validacao required
- Descricao: `Field` + `<textarea>` (mesmo pattern do `EditOrgDialog`)
- Botoes: `Button` outline (Cancelar) + primary (Proximo)

### Validacao

- Nome obrigatorio (`form.name.trim()`)
- Flag `submitted` para mostrar erro apenas apos tentativa

### Fluxo

- **Proximo** (usuario normal): `currentStep = 2`
- **Proximo** (founder member): cria org direto → loading → sucesso → fecha dialog + emit `saved`

## Step 2 — Selecao de plano

### Layout

```
┌───────────────────────────────────────────────────┐
│  StepperControl: [✓ Dados] — [● Plano]            │
├───────────────────────────────────────────────────┤
│  Escolha seu plano          [Mensal|Tri|Anual]    │
│  Selecione o plano ideal.                         │
│                                                    │
│  ┌────────┐ ┌────────┐ ┌══════════┐ ┌────────┐   │
│  │ Starter│ │  Lite  │ ║ Advanced ║ │Enterpr.│   │
│  │ R$ 97  │ │ R$ 197 │ ║  R$ 397  ║ │Consulta│   │
│  │ /mes   │ │ /mes   │ ║  /mes    ║ │        │   │
│  │        │ │        │ ║[+ escolh]║ │        │   │
│  │Inclui: │ │Tudo do │ ║Tudo do   ║ │Tudo do │   │
│  │ ✓ feat │ │Starter+│ ║Lite+     ║ │Advanc+ │   │
│  │ ✓ feat │ │ ✓ feat │ ║ ✓ feat   ║ │ ✓ feat │   │
│  │        │ │        │ ║          ║ │        │   │
│  │[Select]│ │[Select]│ ║[SELECT●] ║ │[Vendas]│   │
│  └────────┘ └────────┘ ╚══════════╝ └────────┘   │
│                                                    │
│         🔗 Comparar todos os planos               │
│                                                    │
│  [← Voltar]                        [Cancelar]     │
└───────────────────────────────────────────────────┘
```

### Componentes

- Period toggle: grupo de `Button` ou `RadioGroup` inline (Mensal / Trimestral / Semestral / Anual — valores `MONTHLY`, `QUARTERLY`, `SEMIANNUAL`, `YEARLY`)
- Lead quantity selector: dropdown ou slider para selecionar tier de contatos (usa `PlansEnum.getLeads` — necessario para `createCheckoutSession`)
- Plan cards: novos componentes (nao reutiliza `ChoosePlanCard` legado)
  - `Card` com variantes via props
  - Card featured: borda brand, gradient sutil, scale 1.03, badge "Mais escolhido"
  - CTA: `Button` primary no featured, outline nos demais
- Features: pattern "Tudo do X, mais:" com checkmarks
- Link comparacao: `Button` variant `link` tone `primary`
- Dados dos planos: `PlansEnum` existente (nomes atuais: Lite/STARTER, Pro/PREMIUM, Advanced/ADVANCED). Nomes exibidos no UI podem ser mapeados. Se houver 4 tiers no futuro, adicionar ao enum.
- Enterprise CTA: abre link externo (WhatsApp ou pagina de contato — definir com produto)

### Card featured (Advanced)

- `border-color: brand-500`
- `background: linear-gradient(180deg, brand-50/4% 0%, white 100%)`
- `box-shadow: sombra-2` com tint brand
- `transform: scale(1.03)`
- Badge absolute top center: bg-brand-500, text-white, "Mais escolhido"

### Fluxo ao selecionar plano

1. Seta `form.plan` e `form.period`
2. Chama `OrganizationService.createCheckoutSession(plan, leads, period, token)`
3. Salva form no `localStorage` com token
4. `window.location.href = session.url` (redirect Stripe)
5. Retorno do Stripe: rota `CheckoutSessionValidation` valida e cria org

## Modal de comparacao

### Trigger

Button link "Comparar todos os planos" no Step 2.

### Layout

- `DialogControl` nested (abre por cima do dialog principal)
- Size `lg` ou `xl`
- Header: "Comparacao de planos" + botao fechar (X)
- Body: tabela scrollable

### Tabela

Categorias agrupadas:

| Categoria | Recursos |
|-----------|----------|
| **Limites** | Contatos, Usuarios, Canais |
| **Canais suportados** | WhatsApp, Instagram, Messenger, Webchat |
| **Automacao** | Funis basicos, Funis avancados, Agentes IA, Broadcast |
| **CRM & Atendimento** | CRM basico, Kanban, Livechat, Relatorios |
| **Suporte & Seguranca** | Chat, Prioritario, SLA, Onboarding, API |

- Coluna Advanced com `highlight-col` (background brand sutil)
- Checkmarks (✓) e dashes (—) para boolean
- Valores numericos inline (2, 5, 15, Ilimitado)

## Estrutura de arquivos

```
src/layout/OrganizationsLayout/
├── OrganizationForm/           # REESCREVER (substituir legado)
│   ├── index.vue               # Dialog XL + stepper + step routing
│   ├── components/
│   │   ├── OrgDataStep.vue     # Step 1: form dados
│   │   ├── PlanStep.vue        # Step 2: plan cards + period toggle
│   │   ├── PlanCard.vue        # Card individual de plano
│   │   └── PlanCompareDialog.vue  # Modal nested de comparacao
│   └── composables/
│       └── useCreateOrg.ts     # Estado do form + logica de criacao
```

## Integracao com layout principal

O `index.vue` do OrganizationsLayout ja referencia `OrganizationForm`:

```vue
<organization-form ref="organizationFormRef" @update-list="listOrganizations" />
```

Manter a mesma API publica:
- `showDialog()` — abre dialog no Step 1
- `showDialogWithData(data, success)` — abre com dados pre-preenchidos (retorno Stripe)
- Emit `update-list` ao criar org com sucesso

## Fluxo pos-Stripe (retorno do checkout)

1. Rota `CheckoutSessionValidation` recebe o token
2. Le `checkout_session_${token}` do localStorage
3. Chama `OrganizationService.validateCheckoutSession(sessionId, token)`
4. Em caso de sucesso: `showDialogWithData(savedData, true)`
   - Dialog abre com **loading overlay** (spinner + "Criando organizacao...")
   - Chama `OrganizationService.createOrganization(payload)`
   - Sucesso: fecha dialog + `showToastSuccess` + emit `update-list`
   - Erro: mostra toast de erro, retorna ao Step 2
5. Em caso de falha na validacao: redireciona para `SelectOrganization`

## Responsividade

- **Desktop (>=1024px):** 4 cards lado-a-lado, layout padrao
- **Tablet (768-1023px):** 2x2 grid, featured card na primeira posicao
- **Mobile (<768px):** 1 coluna, featured card primeiro, dialog full-screen

## Composable `useCreateOrg.ts`

Interface esperada:

```ts
interface UseCreateOrg {
  // State
  form: Ref<{ name: string; description: string; avatar: File | null; plan: string | null; period: PaymentPeriod; leadsQuantity: number }>
  currentStep: Ref<number>
  loading: Ref<boolean>
  submitted: Ref<boolean>

  // Computed
  isFounderMember: ComputedRef<boolean>

  // Actions
  goToNext(): void       // valida step 1, avanca ou cria direto (founder)
  goBack(): void         // volta ao step 1
  selectPlan(plan: string): Promise<void>  // inicia checkout Stripe ou cria direto
  resumeFromCheckout(data: any, success: boolean): void  // pos-retorno Stripe
  reset(): void          // reseta form para estado inicial
}
```

## Modal de comparacao — comportamento nested

- Dialog principal **permanece visivel** (dimmed por overlay do modal nested)
- ESC fecha **apenas** o modal de comparacao (nao o dialog principal)
- Focus trap no modal de comparacao enquanto aberto
- Dados da tabela: novo arquivo `planFeatures.ts` com estrutura categorizada

## Mockups

Mockups interativos em `.superpowers/brainstorm/1171-1775514843/`:
- `plan-notion-final.html` — design aprovado (Step 2 + modal comparacao)
- `final-design-v2.html` — ambos steps lado-a-lado
