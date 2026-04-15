# OrganizationCardV2 — Founder Member Variant

**Data:** 2026-04-14
**Status:** Aprovado
**Mockup:** `docs/superpowers/mockups/founder-card-variants.html` (Opcao A — sutil)

## Contexto

O `OrganizationCardV2` mostra as organizacoes do usuario na tela de selecao. Founders sao usuarios especiais com contatos ilimitados e preco fixo. O card hoje nao diferencia visualmente orgs de founders.

## Decisoes

| Decisao | Escolha |
|---------|---------|
| Flag source | `founderMember` da org (nao do user) |
| Prioridade vs cancelado | `isCanceled` vence — card cancelado nao mostra visual founder |
| Badge do plano | Troca para `FOUNDER` (nao mostra PRO/STARTER ao lado) |
| Nivel de destaque | Sutil (opcao A) — diferencia sem "gritar" |

## Condicao de ativacao

```
org.founderMember === true && !org.isCanceled
```

## Mudancas visuais

### Avatar

| Estado | Classes |
|--------|---------|
| Normal | `bg-brand-100` + `text-brand-600` |
| Founder | `bg-gradient-to-br from-teal-800 to-teal-700` + `text-white` |

### Badge do plano

| Estado | Comportamento |
|--------|---------------|
| Normal | Badge com nome do plano (`PRO`, `STARTER`, etc.) e cores por tier |
| Founder | Badge com texto `FOUNDER`, `color="founder"` (gradiente teal + shimmer existente no Badge CVA) |

### Borda do card

| Estado | Classe |
|--------|--------|
| Normal default | `border-gray-200` (existente) |
| Founder default | `border-teal-700/18` |
| Normal hover | `border-brand-300` (existente) |
| Founder hover | `border-teal-700/40` + shadow teal sutil |

### Barra de leads

| Estado | Layout |
|--------|--------|
| Normal | `{contacts} / {planLeads} leads` + barra de progresso + `{percent}%` |
| Founder | `{contacts} leads` + barra teal suave (100% width, baixa opacidade) + simbolo `∞` |

A barra founder nao mostra porcentagem (contatos sao ilimitados). O numero de contatos continua visivel para referencia.

### Sem mudanca

- Meta bar (canais, periodo)
- Dropdown menu (editar, excluir)
- Loading overlay
- Animacao de entrada (stagger)
- Card cancelado (permanece identico)

## Mudancas necessarias

### Backend

Adicionar `founderMember: boolean` na resposta do endpoint de listagem de organizacoes. Hoje o payload nao inclui essa flag.

### Frontend — `OrganizationsLayout/types.ts`

Adicionar campo ao type:

```typescript
export interface Organization {
  // ... campos existentes
  founderMember: boolean  // novo
}
```

### Frontend — `OrganizationCardV2.vue`

1. **Avatar:** condicionar classes de fundo/cor baseado em `org.founderMember && !org.isCanceled`
2. **Badge do plano:** quando founder, usar `color="founder"` com texto "FOUNDER" em vez do `planLabel`
3. **Borda do card:** adicionar classes condicionais teal para founder
4. **Barra de leads:** quando founder, mostrar contatos + barra decorativa + simbolo infinito

### Frontend — `composables/useOrgHelpers.ts`

Nenhuma mudanca necessaria — os helpers de leads continuam funcionando; a condicao de exibicao fica no template.

## Referencia visual

O Badge `color="founder"` ja existe em `src/components/ui/badge/index.ts` com:
- Gradiente `from-teal-800 via-teal-700 to-teal-600`
- Borda `teal-600/55`
- Glow shadow teal
- Text shadow

O shimmer animation ja existe em `TagsSidebarV2.vue` e pode ser reaproveitado no card se desejado (nao obrigatorio para a versao sutil).
