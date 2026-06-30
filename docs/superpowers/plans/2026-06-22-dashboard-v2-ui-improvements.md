# Dashboard V2 — UI/UX Improvements

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os problemas de layout, hierarquia visual e acessibilidade identificados na análise UI/UX do Dashboard V2.

**Architecture:** Todas as mudanças são no frontend (`chatfunnel-front/src/views/dashboardV2/`). Nenhuma mudança em serviços, composables ou rota. Sem novos componentes — apenas refinamentos dos existentes.

**Tech Stack:** Vue 3 + `<script setup lang="ts">` + Tailwind CSS v4 (tokens de escala `gray-*`, `brand-*`).

---

## Mapa de Arquivos

| Arquivo | Ação | Mudança |
|---------|------|---------|
| `src/views/dashboardV2/DashboardV2View.vue` | Modificar | Padding crítico, `max-w-7xl`, labels de seção, `items-start` no grid inferior |
| `src/views/dashboardV2/components/KpiGrid.vue` | Modificar | Estado vazio com texto em vez de caixa branca invisível |
| `src/views/dashboardV2/components/ContactsTrendChart.vue` | Modificar | `<p>` → `<h3>` no título do card |
| `src/views/dashboardV2/components/MessagesTrendChart.vue` | Modificar | `<p>` → `<h3>` no título do card |
| `src/views/dashboardV2/components/AutomationsTrendChart.vue` | Modificar | `<p>` → `<h3>` no título do card |
| `src/views/dashboardV2/components/ActivityHeatmap.vue` | Modificar | `<p>` → `<h3>` no título do card |
| `src/views/dashboardV2/components/AutomationsRankingCard.vue` | Modificar | `<p>` → `<h3>` no título do card |
| `src/views/dashboardV2/components/InteractionsRankingCard.vue` | Modificar | `<p>` → `<h3>` + `loading="lazy"` na `<img>` |
| `src/views/dashboardV2/components/RecentFeed.vue` | Modificar | `<p>` → `<h3>` no título do card |
| `src/views/dashboardV2/components/LeadsChannelDonut.vue` | Modificar | `<p>` → `<h3>` no título do card |

---

## Task 1: Corrigir o container da view (🔴 Crítico)

**Files:**
- Modify: `src/views/dashboardV2/DashboardV2View.vue`

O linter alterou `p-6` para `p-1` e removeu `max-w-7xl`. Isso faz o conteúdo tocar as bordas da tela. Além disso, neste task adicionamos labels de seção entre os blocos e corrigimos o grid inferior.

- [ ] **Step 1.1: Substituir o `<template>` completo**

```vue
<template>
  <div class="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <PageTitle>Dashboard</PageTitle>
        <PageSubtitle>Dados dos últimos 30 dias</PageSubtitle>
      </div>
    </header>

    <!-- Indicadores -->
    <section class="flex flex-col gap-3">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-400">Indicadores</h2>
      <KpiGrid
        :by-channel="leadsChannel.data.value"
        :by-channel-loading="leadsChannel.loading.value"
        :overview="overview.data.value"
        :overview-loading="overview.loading.value"
        :schedules="schedules.data.value"
        :schedules-loading="schedules.loading.value"
        :ai-hours="aiHours.data.value"
        :ai-hours-loading="aiHours.loading.value"
      />
    </section>

    <!-- Tendências -->
    <section class="flex flex-col gap-3">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-400">Tendências</h2>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ContactsTrendChart
          :data="contactsGrowth.data.value"
          :loading="contactsGrowth.loading.value"
        />
        <MessagesTrendChart
          :data="messagesVolume.data.value"
          :loading="messagesVolume.loading.value"
        />
        <AutomationsTrendChart
          :data="automationsExecutions.data.value"
          :loading="automationsExecutions.loading.value"
        />
        <InteractionsRankingCard
          :data="interactionsRanking.data.value"
          :loading="interactionsRanking.loading.value"
        />
      </div>
    </section>

    <!-- Atividade -->
    <section class="flex flex-col gap-3">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-400">Atividade</h2>
      <ActivityHeatmap
        :data="activityHeatmap.data.value"
        :loading="activityHeatmap.loading.value"
      />
    </section>

    <!-- Leads e Rankings -->
    <section class="flex flex-col gap-3">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-gray-400">Leads e Rankings</h2>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-start">
        <LeadsChannelDonut
          :data="leadsChannel.data.value"
          :loading="leadsChannel.loading.value"
        />
        <AutomationsRankingCard
          :data="automationsTop.data.value"
          :loading="automationsTop.loading.value"
        />
        <RecentFeed
          :data="eventFeed.data.value"
          :loading="eventFeed.loading.value"
        />
      </div>
    </section>
  </div>
</template>
```

O `<script setup>` não muda.

- [ ] **Step 1.2: Verificar no browser**

Abrir `/dashboard-v2`. Esperado:
- Padding visível nas laterais (≥24px) — conteúdo não cola nas bordas
- 4 labels uppercase em cinza: "INDICADORES", "TENDÊNCIAS", "ATIVIDADE", "LEADS E RANKINGS"
- Grid inferior (`md:grid-cols-3`) com `items-start` — cards sem estiramento vertical

---

## Task 2: Semântica de títulos dos cards (`<p>` → `<h3>`)

**Files:** 8 componentes a modificar

Todos os títulos de card usam `<p>` em vez de `<h3>`, quebrando a hierarquia h1 → h2 → h3 e prejudicando leitores de tela. A classe CSS não muda — só a tag HTML.

- [ ] **Step 2.1: ContactsTrendChart.vue**

```vue
<!-- linha 3: ANTES -->
<p class="mb-2 text-sm font-semibold text-gray-800">Histórico de entrada de leads</p>

<!-- linha 3: DEPOIS -->
<h3 class="mb-2 text-sm font-semibold text-gray-800">Histórico de entrada de leads</h3>
```

- [ ] **Step 2.2: MessagesTrendChart.vue**

Localizar a linha com `Volume de mensagens` e substituir `<p` → `<h3` e `</p>` → `</h3>`.

- [ ] **Step 2.3: AutomationsTrendChart.vue**

Localizar a linha com `Execuções de automações` e substituir `<p` → `<h3` e `</p>` → `</h3>`.

- [ ] **Step 2.4: ActivityHeatmap.vue**

Localizar a linha com `Atividade por horário` e substituir `<p` → `<h3` e `</p>` → `</h3>`.

- [ ] **Step 2.5: AutomationsRankingCard.vue**

Localizar a linha com `Top automações` e substituir `<p` → `<h3` e `</p>` → `</h3>`.

- [ ] **Step 2.6: InteractionsRankingCard.vue**

Localizar a linha com `Ranking de interações` e substituir `<p` → `<h3` e `</p>` → `</h3>`.

- [ ] **Step 2.7: RecentFeed.vue**

Localizar a linha com `Atividade recente` e substituir `<p` → `<h3` e `</p>` → `</h3>`.

- [ ] **Step 2.8: LeadsChannelDonut.vue**

```vue
<!-- linha 3: ANTES -->
<p class="mb-4 text-sm font-semibold text-gray-800">Leads por canal</p>

<!-- linha 3: DEPOIS -->
<h3 class="mb-4 text-sm font-semibold text-gray-800">Leads por canal</h3>
```

- [ ] **Step 2.9: Typecheck**

```bash
cd chatfunnel-front && npm run typecheck 2>&1 | head -20
```

Esperado: zero erros (mudanças são puramente de tag HTML, sem impacto em tipos).

---

## Task 3: KpiGrid empty state + lazy loading no avatar

**Files:**
- Modify: `src/views/dashboardV2/components/KpiGrid.vue`
- Modify: `src/views/dashboardV2/components/InteractionsRankingCard.vue`

### 3.1 — KpiGrid: estado vazio visível

Quando uma métrica não está disponível após o carregamento, o card atual é uma caixa branca completamente vazia sem nenhum feedback visual.

- [ ] **Step 3.1: Substituir o fallback vazio em KpiGrid.vue**

```vue
<!-- linha 11: ANTES -->
<div v-else class="h-24 rounded-xl border border-gray-200 bg-white" />

<!-- linha 11: DEPOIS -->
<div v-else class="flex h-24 items-center justify-center rounded-xl border border-gray-200 bg-white">
  <span class="text-xs text-gray-400">Sem dados</span>
</div>
```

### 3.2 — InteractionsRankingCard: lazy loading em avatares

Os avatares dos contatos são imagens de terceiros abaixo do fold. Sem `loading="lazy"` elas bloqueiam recursos no carregamento inicial.

- [ ] **Step 3.2: Adicionar `loading="lazy"` na `<img>` do avatar em InteractionsRankingCard.vue**

Localizar o elemento `<img` que renderiza o avatar do contato (tem `:src="contact.photo"` ou similar) e adicionar o atributo `loading="lazy"`.

- [ ] **Step 3.3: Verificar no browser**

Abrir `/dashboard-v2`. Verificar:
- Cards de KPI sem dados mostram "Sem dados" em cinza claro (não caixa branca vazia)
- No DevTools → Network → Img, confirmar que avatares do ranking têm `loading: lazy`

---

## Notas de Implementação

**Labels de seção (`h2`):** Usam `text-xs font-semibold uppercase tracking-wide text-gray-400` — padrão comum em dashboards SaaS para separar blocos sem criar peso visual desnecessário.

**`md:items-start` no grid inferior:** O `ChannelDonut` tem altura variável dependendo do número de canais na legenda. Sem `items-start`, o grid estica todos os cards para a altura do maior, deixando `AutomationsRankingCard` e `RecentFeed` com espaço vazio no fundo.

**Não está no escopo deste plano:**
- Animações de entrada nos cards
- Dark mode
- Responsividade tablet (o layout 1 col → 2/3 cols já cobre mobile/desktop)
