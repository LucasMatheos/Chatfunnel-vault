## Aba Agendamentos

A aba **Agendamentos** do Reports V2 documenta o volume de agendamentos (compromissos do Google Calendar) ao longo do período selecionado, segmentado por status. O domínio tem hoje um único gráfico ativo; comparecimento e no-show dependem de campos ainda inexistentes no schema e aparecem apenas como aviso "em breve".

### Volume de agendamentos — `schedules.volume`
- **Gráfico:** `BarSeriesChart` (ECharts, barras) dentro de `ReportSection` (título "Volume de agendamentos", subtítulo/ação "Pela data do compromisso") · shaper `timeSeries`
- **Tipo de dado:** período
- **O que é:** volume de agendamentos criados/marcados ao longo do período, bucketizado pela data do compromisso (`startAt`) e segmentado por status (ativo vs. cancelado). Os informativos correlatos descrevem como "Volume de agendamentos criados ao longo do período" (`geral.schedulesSection`) e "Total de agendamentos criados no período" (`geral.agendamentos`).
- **Fonte (tabelas/models Prisma):** `GoogleCalendarEvents` (possui `accountId` direto — sem JOIN)
- **Cálculo:**
  - `normalizeRange(initialDate, finalDate, timezone)` define o intervalo `[start, end]`.
  - `granularity` vem de `params.granularity` ou, na ausência, de `pickGranularity(start, end)` (dia/semana/mês conforme o tamanho do range).
  - Cada evento é atribuído ao bucket temporal por `startAt`, convertido de UTC para o timezone da conta (`(e."startAt" AT TIME ZONE 'UTC') AT TIME ZONE <tz>`) e truncado por `DATE_TRUNC(<granularity>, ...)`.
  - Segmento: `'cancelled'` quando `isCancelled = true`, senão `'active'`.
  - Agregação `COUNT(*)` por (data, segmento). O shaper `timeSeries` monta as `series` consumidas pelo `BarSeriesChart`; a seção mostra estado vazio quando `series.length === 0`.
- **Query:** `SchedulesReportsRepository.volumeTimeSeries` via `prisma.$queryRaw`:
  ```sql
  SELECT
    TO_CHAR(
      DATE_TRUNC(:granularity, (e."startAt" AT TIME ZONE 'UTC') AT TIME ZONE :timezone),
      'YYYY-MM-DD'
    ) AS date,
    CASE WHEN e."isCancelled" THEN 'cancelled' ELSE 'active' END AS segment,
    COUNT(*)::int AS value
  FROM "GoogleCalendarEvents" e
  WHERE e."accountId" = :accountId::uuid
    AND e."startAt" IS NOT NULL
    AND e."startAt" BETWEEN :start AND :end
  GROUP BY 1, 2
  ORDER BY 1 ASC
  ```
- **Filtros aplicáveis (`ReportParams`):** `initialDate`, `finalDate`, `granularity` (opcional; default por `pickGranularity`), `timezone`; escopo multi-tenant por `accountId`. No front, `AgendamentosTab` recarrega ao mudar `initialDate`/`finalDate`.
- **Cache TTL:** 900 s

---

**Não disponível (aviso em tela, sem query):** comparecimento e no-show ("Comparecimento e no-show ainda não estão disponíveis — em breve"). Dependem de novos campos no schema, não cobertos pelo repository atual.
