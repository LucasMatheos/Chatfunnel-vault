# Informativos do Reports V2 — Design

**Data:** 2026-06-18
**Escopo desta entrega:** piloto no tab **Geral**
**Status:** aprovado (brainstorming)

## Problema

O dashboard do Reports V2 mistura, na mesma tela, dois tipos de dado:

- **Por período** — reage ao seletor de data no topo (ex: "Leads ganhos no período").
- **Tempo real / estado atual** — ignora o seletor, mostra sempre o "agora" (ex: estado
  atual do funil, total da base de contatos).

Hoje não há sinalização. O usuário não sabe o que cada número representa nem por que
alguns não mudam ao trocar a data ("por que esse valor não atualizou?"). Faltam também
explicações do que cada métrica significa.

## Solução

Para cada **seção** e **card** do relatório, oferecer um informativo que explica:
1. O que é o dado / o que ele representa.
2. Se ele depende ou não do filtro de data.

### Decisões de UX

| Tema | Decisão |
|------|---------|
| Mecanismo | Ícone **ⓘ** que abre um **popover no clique** (melhor em mobile/touch, comporta texto longo). |
| Dependência de data | **Selo persistente "Tempo real" só na exceção** (dado que ignora a data). O caso "por período" é o default esperado e não recebe selo, para não poluir a tela. |
| Explicitação | O **popover sempre** declara a dependência de data — tanto para `periodo` quanto para `tempoReal`. Zero ambiguidade a um clique. |
| Conteúdo | **Registro centralizado** (um arquivo), tabs referenciam por chave. |

## Arquitetura

### 1. Registro centralizado

`src/views/reportsV2/info/reportInfo.ts` — fonte única de verdade.

```ts
export interface ReportInfoEntry {
  title: string
  description: string
  dataType: 'periodo' | 'tempoReal'
}

export const REPORT_INFO = {
  'geral.indicadores': { title: '…', description: '…', dataType: 'periodo' },
  // …
} as const

export type ReportInfoKey = keyof typeof REPORT_INFO
```

`ReportInfoKey` é derivado de `keyof typeof REPORT_INFO` → passar uma chave inexistente
vira **erro de compilação**.

### 2. Componente `InfoPopover.vue`

`src/views/reportsV2/components/shared/InfoPopover.vue` — ponto único de inserção.

- **Prop:** `infoKey: ReportInfoKey`. Busca a entry no registro.
- **Renderiza, lado a lado:**
  - **Selo "Tempo real"** (Badge gray xs) — apenas quando `dataType === 'tempoReal'`.
  - **Botão ⓘ** (ícone `Info` do lucide) com `aria-label` descritivo, abrindo o popover.
- **Conteúdo do popover** (no clique):
  - Título (bold)
  - Descrição (regular)
  - `Separator`
  - Linha de dependência de data:
    - `periodo` → ícone `Clock` + "Reage ao filtro de período"
    - `tempoReal` → ícone `Zap` + "Estado atual — ignora o filtro de período"

Selo + ⓘ ficam no mesmo componente (DRY): onde se coloca `<InfoPopover>`, ganha-se os dois.

Usa `ui/popover` (shadcn-vue: `Popover`, `PopoverTrigger`, `PopoverContent`),
`ui/badge`, `ui/separator`.

### 3. Integração nos componentes existentes

- `ReportSection.vue` → nova prop **opcional** `infoKey?: ReportInfoKey`. Quando presente,
  renderiza `<InfoPopover>` ao lado do título (no `<header>` já existente).
- `MetricCard.vue` → nova prop **opcional** `infoKey?: ReportInfoKey`. Renderiza
  `<InfoPopover>` ao lado do `label` (topo do card).
- `GeralTab.vue` → passa `infoKey` em cada `<ReportSection>` e em cada item de `kpiCards`
  (novo campo `infoKey` em `KpiCardView`). Sem strings inline — só a chave.

Props opcionais ⇒ os demais tabs e qualquer uso legado continuam funcionando sem mudança.

## Conteúdo do piloto (tab Geral)

> No Geral, **todas** as fontes recebem `filters` e recarregam no `watch` das datas.
> Portanto **tudo é `periodo`** e o selo "Tempo real" **não aparece neste tab**. O
> mecanismo é construído e testado aqui; o selo será exercitado ao levar para **Funil**
> (estado do pipeline) e **Contatos** (total da base), em entregas futuras.

### Seções

| Chave | Título | dataType | Descrição |
|-------|--------|----------|-----------|
| `geral.indicadores` | Indicadores | periodo | Resumo dos principais números do período: leads, ganhos, perdas, faturamento e produtividade. |
| `geral.byChannel` | Entrada de leads por origem | periodo | Distribuição dos leads que entraram no período por canal de origem (WhatsApp, Instagram, etc.). |
| `geral.leadsHistory` | Histórico de entrada de leads | periodo | Evolução diária da quantidade de leads que entraram, dentro do período selecionado. |
| `geral.heatmap` | Atividade por horário | periodo | Concentração de atividade por dia da semana e hora, no período. Ajuda a identificar os melhores horários. |
| `geral.schedulesSection` | Agendamentos | periodo | Volume de agendamentos criados ao longo do período. |
| `geral.eventFeed` | Últimos eventos | periodo | Eventos mais recentes registrados no período (entradas, ganhos, perdas e afins). |

### Cards (Indicadores)

| Chave | Título | dataType | Descrição |
|-------|--------|----------|-----------|
| `geral.totalLeads` | Total de leads | periodo | Total de contatos que entraram no período selecionado, somando todas as origens. |
| `geral.ganhos` | Leads ganhos | periodo | Leads marcados como ganhos (negócio fechado) no período, somando todos os funis. |
| `geral.perdidos` | Leads perdidos | periodo | Leads marcados como perdidos no período, somando todos os funis. |
| `geral.faturamento` | Faturamento | periodo | Soma da receita dos leads ganhos no período, somando todos os funis. |
| `geral.agendamentos` | Agendamentos | periodo | Total de agendamentos criados no período. |
| `geral.aiHours` | Horas economizadas pela IA | periodo | Estimativa de horas de atendimento poupadas pela IA no período. |

## Acessibilidade

- O ⓘ é um `<button>` com `aria-label` (ex: "Mais informações sobre {título}").
- Popover do reka-ui já gerencia foco, `Esc` para fechar e posicionamento.

## Estilo

- Tokens de **escala** (`text-gray-700`, `text-gray-1000`, `border-gray-400`) — nunca
  semânticos (`text-muted-foreground` etc.), conforme regra do front.
- Ícones lucide: `Info`, `Clock`, `Zap`.
- Texto pt-BR acentuado.

## Testes

- `InfoPopover.spec.ts`:
  - abre o conteúdo ao clicar no ⓘ;
  - mostra título + descrição da chave;
  - mostra a linha de dependência correta para `periodo` e para `tempoReal`;
  - renderiza o selo "Tempo real" **só** quando `dataType === 'tempoReal'`.
- Smoke em `ReportSection.spec.ts` / `MetricCard.spec.ts`: `infoKey` opcional não quebra o
  render e, quando ausente, nada de informativo é renderizado.

## Fora de escopo (entregas futuras)

- Conteúdo dos demais tabs (Funil, Mensagens, Colaboradores, Contatos, Automações,
  Broadcast, Agendamentos).
- Casos `tempoReal` reais (Funil/Contatos) — que vão exercitar o selo.
