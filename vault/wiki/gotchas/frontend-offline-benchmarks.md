---
title: Benchmarks offline do frontend
description: Isolamento de rede e descoberta de classes Tailwind em harness Vite separado.
tags: [gotcha, frontend, performance, testes]
severity: media
related: ["[[livechat-contact-list-performance]]", "[[frontend-gotchas]]"]
last_updated: 2026-09-05
---

# Benchmarks offline do frontend

A bateria em `chatfunnel-front/benchmarks/` monta a lista real do Livechat em um
harness separado. Services e auth são fixtures; não iniciar o app principal para
executar esta bateria. A proibição de acesso ao banco inclui acessos indiretos via
API: `configFile: false`, `envFile: false`, ausência de proxy, imports protegidos,
transportes bloqueados, CSP e interceptação do navegador compõem o isolamento.

## Tailwind com outro root

Ao usar `benchmarks/` como root do Vite, importar o CSS do frontend não garantiu
a descoberta das classes presentes nos componentes de `src/`. A lista tinha 50
linhas, mas seu container crescia até 3.180 px dentro de um pai de 900 px. O scroll
ficava em zero e a paginação por IntersectionObserver não ocorria.

O entry CSS do harness deve declarar `@source '../src'` além de importar o CSS
existente. Não corrigir o componente de produção para compensar estilos ausentes
no ambiente de teste.

## Interpretar as medições

- Preparar fixtures/páginas fora da janela medida evita atribuir custo artificial
  de geração de dados ao componente.
- Duração macro inclui esperas reais e automação; micro mede helpers reais dentro
  do navegador. Resultados em desenvolvimento não equivalem a produção.
- TaskDuration com threadTicks mede tarefas da thread principal do renderer;
  não representa CPU total do aplicativo.
- Heap JavaScript não é RAM. WorkingSet64 é a soma observada dos processos desse
  Chromium, com possível dupla contagem de páginas compartilhadas, não pico real.
- Amostras pós-desmontagem e coleta de lixo servem para investigar retenção;
  crescimento isolado não prova vazamento.

Comandos, métricas e limitações: `chatfunnel-front/benchmarks/README.md`.

## Extensão para o CRM

O perfil CRM monta `Kanban.vue`, colunas, cards e modal reais. Precisa registrar
i18n, `CheckPermission`, `InputRichtext` e o `VImg` legado usado pelo avatar,
sem importar o bootstrap completo do produto. Ausência desses registros produz
renderização incompleta e deve reprovar o benchmark.

O módulo `crm/socket` é substituído por um adapter sem conexão. O avatar do usuário
fictício é respondido localmente por `route.fulfill`; não ocorre acesso ao S3.

Um guard que bloqueia qualquer segmento de caminho chamado `api` também bloqueia
o asset local `@vue/devtools-api/lib/esm/api/index.js`. Bloquear rotas de API na
raiz e os transportes fetch/XHR, mantendo a checagem da origem e dos módulos reais,
permite servir essa dependência sem liberar chamadas ao backend.

O CRM já limita a renderização conforme o scroll. Registrar separadamente cards
carregados (slots) e `.card-container` renderizados; não comparar diretamente com
a lista do Livechat como se fossem o mesmo trabalho. O evento de atualização de
card preserva throttle de 1.000 ms, que aparece no tempo decorrido, mas não equivale
a 1.000 ms de CPU.

A filtragem e clonagem feitas por serviços fictícios consomem tempo no browser.
O relatório CRM apresenta `Mock ms` para explicitar esse custo. A amostra pós-GC
acontece após o ciclo completo, incluindo troca de pipeline, e não imediatamente
após fechar o quadro original com todos os cards carregados.

Comandos e escopo: `chatfunnel-front/benchmarks/README_CRM.md`.

## Retenção e ordem dos cenários CRM

A bateria inicial de 05/09/2026 executou todos os volumes e ciclos na mesma página,
sem recarga. Houve crescimento repetido de heap e nós após desmontagem/GC: no caso
fixo de 50 oportunidades, aproximadamente 50 → 280 MiB entre a primeira e a décima
amostra medida. Os listeners observados do event bus estavam zerados.

Isso é evidência de retenção no harness, não causa raiz nem vazamento de produção
confirmado. A memória dos casos posteriores inclui história dos anteriores; não
usar suas medianas como custo independente por volume. Os tempos também podem
sofrer esse efeito. Separar futuros testes de dimensionamento (página nova) dos
testes de envelhecimento (mesma página) e analisar heap snapshots antes de atribuir
o problema ao CRM ou propor correções.

Análise completa: `chatfunnel-front/benchmarks/RESULTADOS_CRM.md`.

## CRM — avaliação e retomada pendente (05/09/2026)

**Status: investigação adiada a pedido do usuário; retomar posteriormente.**

- Os 40 ciclos medidos passaram nas verificações funcionais, mas isso não aprova
  desempenho. Não foram definidos limites formais de CPU, RAM ou latência.
- Arraste com 1.000 oportunidades concentradas: mediana de 4,11 s decorridos e
  3,55 s de CPU da thread principal. É um ponto prioritário para diagnóstico.
- Completar as páginas por scroll com 1.000 distribuídas: mediana de 4,66 s.
  Esse número não é o tempo de abertura inicial do quadro.
- Principal alerta: heap pós-desmontagem/GC cresceu de aproximadamente 50 para
  280 MiB nos dez ciclos medidos de 50 oportunidades. Ainda não está isolado se
  a retenção vem do CRM, de dependências ou da instrumentação de desenvolvimento.
- Como os volumes compartilharam a mesma página, o acúmulo pode influenciar
  memória e tempos posteriores. Não concluir vazamento em produção nem comparar
  os volumes como medições independentes.

Ao retomar, antes de alterar componentes:

- [ ] Repetir cada volume em página nova, com referência vazia, separadamente do
  teste de envelhecimento da sessão.
- [ ] Capturar heap snapshots e analisar caminhos de retenção após ciclos fixos.
- [ ] Isolar montagem/desmontagem, modal/editor, filtros, troca de pipeline e
  arraste para identificar a etapa responsável.
- [ ] Só após confirmar a causa, propor correção e comparação antes/depois.

Manter todos os diagnósticos offline, com dados sintéticos: **proibido acessar
banco, inclusive indiretamente por APIs reais**. Nenhum novo teste ou correção
foi executado para esta anotação.
