# Gráfico de comparecimento (show/no-show) — aba Agendamentos (Reports V2)

## Contexto

A aba `AgendamentosTab.vue` (`chatfunnel-front/src/views/reportsV2/tabs/AgendamentosTab.vue`) hoje mostra só o gráfico de volume de agendamentos e um aviso estático: *"Comparecimento e no-show ainda não estão disponíveis — em breve"*.

O dado de comparecimento acabou de ficar disponível: a migration `chatfunnel-core/prisma/migrations/20260806031759_add_calendar_event_attendance/` adicionou em `GoogleCalendarEvents`:
- `attendanceStatus: CalendarEventAttendanceStatus` (`PENDING | SHOW | NO_SHOW`, default `PENDING`)
- `attendanceRecordedAt`, `attendanceRecordedBy`

O repository já grava isso via `updateAttendance()` (scoped por `accountId`). Falta a camada de agregação/relatório e o consumo no front.

## Objetivo

Substituir o aviso "em breve" por dois gráficos:
1. Série temporal por dia: Compareceu / Não compareceu / Pendente.
2. Donut de proporção total do período: Compareceu vs Não compareceu (sem Pendente).

## Regras de negócio

- Excluir eventos **cancelados** das métricas de comparecimento (regra já documentada em `calendar-attendance-architecture.md` do vault).
- Escopo por `accountId` e `isDeleted: false` em toda query, como qualquer acesso a dado no core.
- O donut de proporção **não inclui** Pendente — ele mede taxa de comparecimento real (agendamentos que já aconteceram), não distorcida por agendamentos futuros/não marcados.

## Arquitetura

### 1. Core (`chatfunnel-core`)

Novo método em `SchedulesReportsRepository`, ao lado do `volumeTimeSeries` existente:

```
attendanceTimeSeries(accountId, initialDate, finalDate): Promise<SegmentedTimeSeries>
```

- Query raw agrupando por `DATE_TRUNC('day', ...)` + `attendanceStatus`.
- Filtros: `accountId`, `isDeleted: false`, excluir eventos com status de cancelamento.
- Segmentos retornados: `show`, `no_show`, `pending` (mesmo shape usado em `volumeTimeSeries` para `active`/`cancelled`).
- Cache TTL 900s, igual ao padrão de `volumeTimeSeries`.

### 2. Services (`chatfunnel-services`)

Novo endpoint `GET /reports/v2/schedules/attendance` no controller de Reports V2 responsável pela seção de agendamentos.

- Delegação fina para o método do core — sem lógica de negócio adicional no services (padrão já usado em `contacts`: services é delegador + HTTP + infra).

### 3. Front — `ReportsV2Service.ts`

```
getSchedulesAttendance(filters): Promise<SegmentedTimeSeries>
```

- `NestApi.get('/reports/v2/schedules/attendance', buildReportParams(rota, filters))`.
- Um helper local (fora do service, próximo ao componente ou em um util da tab) soma os dias por segmento para produzir o total do donut — filtrando `pending` fora da soma. Não há chamada de API separada para o total.

### 4. Front — `AgendamentosTab.vue`

- Uma única chamada `useReportQuery(() => ReportsV2Service.getSchedulesAttendance(filters))`, disparada em `onMounted` e em `watch(filters.initialDate/finalDate)`, igual ao padrão de `GeralTab.vue`.
- Dois `ReportSection` novos, substituindo o aviso "em breve":
  - **"Comparecimento por dia"** → `SegmentedTimeSeriesChart` com 3 segmentos (Compareceu / Não compareceu / Pendente), alimentado direto pelo resultado da query.
  - **"Comparecimento no período"** → componente donut existente em `components/primitives/echarts/` (candidato: `RankingDonut`; confirmar contra `ChannelDonut` durante a implementação, escolhendo o que aceitar 2 categorias arbitrárias sem semântica de canal/ranking), com 2 fatias (Compareceu / Não compareceu), alimentado pelo total derivado no helper do item 3.

### 5. `reportInfo.ts`

- Nova entrada `"agendamentos.attendance"` (`dataType: "periodo"`), referenciada nos dois `info-key` das seções acima (mesmo texto informativo para ambas, a menos que o usuário peça textos diferenciados por gráfico durante a revisão).

## Visual

- Compareceu → verde (convenção já usada em `MetricCard`: verde = bom).
- Não compareceu → vermelho (convenção: vermelho = ruim).
- Pendente → cinza neutro (só na série temporal).
- Textos em pt-BR acentuado: "Compareceu", "Não compareceu", "Pendente".

## Fora de escopo

- Endpoint/query separado para os totais do donut (decisão: derivar por soma no front a partir da série temporal, evitando round-trip e query duplicada).
- Qualquer alteração no fluxo de gravação de `attendanceStatus` (já implementado e fora deste trabalho).
- Filtros adicionais (por moderador, por tag etc.) além dos filtros de período já padrão do Reports V2.

## Testes

- Core: teste de unidade/integração do `attendanceTimeSeries` (agrupamento correto, exclusão de cancelados, scoping por `accountId`).
- Front: teste do helper de soma dos segmentos (garante que `pending` não entra no total do donut).
