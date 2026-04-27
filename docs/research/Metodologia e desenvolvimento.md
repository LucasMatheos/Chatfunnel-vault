# Referência prática para metodologia, estrutura de repositório e documentação em projetos de software com apoio de IA

## Resumo executivo

Como o contexto veio com placeholders, assumi um cenário-base realista: produto digital web/backend, time de 5 a 15 pessoas, maturidade técnica intermediária, necessidade de escalabilidade média a alta, uso de Git com PRs e CI, documentação no repositório, e IA aplicada a pesquisa, geração de código, testes, revisão e documentação. Onde a recomendação muda muito por contexto — por exemplo, times muito pequenos, ambientes altamente regulados ou arquitetura fortemente distribuída — eu marco essa variação explicitamente.

A recomendação-base mais consistente para esse cenário é um modelo híbrido: **discovery contínuo em paralelo com delivery contínua**, usando **Dual Track** para descoberta e refinamento do que vale a pena construir, **Kanban/Scrumban** para execução em fluxo com limites de WIP, **docs-as-code** para manter documentação perto do código, **Diátaxis** para taxonomia documental, **arc42 + C4** para arquitetura, **ADR** para decisões relevantes, e uma camada explícita de **governança de IA** com prompts, instruções, evals, traces, outputs e gates de revisão humana. Essa combinação é mais robusta do que adotar Scrum puro, Kanban puro ou Shape Up puro porque preserva foco em valor, reduz fila e contexto perdido, e se alinha ao que o programa DORA vem mostrando: IA funciona primordialmente como amplificador do sistema sociotécnico existente, enquanto documentação interna de qualidade aumenta desempenho e reduz atrito operacional. citeturn18view3turn19view0turn17view2turn15view10turn15view0turn15view1

Em termos estruturais, a melhor opção-padrão é um **repositório único modular** quando produto, API, pacotes compartilhados, infraestrutura, documentação e ativos de IA precisam dividir contexto. Essa escolha ficou ainda mais prática porque o ecossistema moderno já suporta personalizações de IA na raiz do repositório, inclusive em monorepos, com caminhos específicos para instruções persistentes, prompts reutilizáveis e agentes customizados. citeturn27view1turn27view2turn27view3turn27view6

Em termos documentais, a regra-mãe é simples: **o repositório precisa ter uma única verdade operacional**, com documentação curta, versionada, revisada via PR e organizada por função. O README deve explicar propósito, uso e manutenção; a arquitetura deve diferenciar contexto, contêineres, componentes e decisões; o changelog deve ser curado e legível por humanos; e a documentação de IA precisa sair do improviso e virar ativo governado, com versão, dono, contexto, risco, critérios de validação e vínculo com features, issues, PRs e releases. citeturn38view0turn15view6turn15view7turn24view0turn16view0turn16view1turn15view8

Se eu tivesse de resumir a decisão em uma frase: **para a maioria dos times modernos, a melhor base é “produto em dual track, engenharia em fluxo puxado, documentação como código e IA tratada como sistema governado, não como chat solto”**. Essa base funciona bem para times médios, pode ser simplificada para times pequenos e pode ser endurecida com mais controles para ambientes regulados. citeturn17view2turn17view1turn16view7turn16view6

## Metodologia recomendada

A comparação abaixo sintetiza três abordagens fortes para o problema. As características centrais vêm das referências oficiais de Scrum, Kanban, Shape Up e Dual Track; a recomendação de encaixe por contexto é uma inferência prática sobre como esses modelos operam quando o time também usa IA no SDLC. citeturn18view0turn19view0turn18view2turn18view3turn18view4

| Abordagem | Onde funciona melhor | Força principal | Risco principal |
|---|---|---|---|
| Scrum | Times com cadência fixa, backlog estável, governança de papéis bem definida | Ritmo previsível, objetivos por sprint, cerimônias claras | Pode virar processo pesado, empurrar discovery para fora do fluxo e criar handoffs artificiais |
| Kanban / Scrumban | Times de produto e plataforma com fluxo contínuo, incidentes, suporte e mudanças frequentes | WIP explícito, menos fila, repriorização natural, melhoria contínua | Sem disciplina, vira “fila infinita” e perde previsibilidade |
| Shape Up | Times pequenos ou muito autônomos, foco em ciclos de aposta e não em backlog detalhista | Excelente foco, escopo moldado por appetite, boa autonomia | Menos adequado para contextos com sustentação contínua, múltiplas dependências e forte compliance |

**Minha recomendação padrão** é: **Dual Track + Kanban/Scrumban**. O motivo é estrutural. Dual Track permite que discovery e delivery aconteçam em paralelo, de forma contínua, em vez de serializar “definir tudo” e só depois “entregar tudo”. Kanban adiciona o mecanismo operacional que falta a muitos times: visualizar fluxo, limitar WIP, identificar gargalos e trabalhar com melhoria contínua sem depender de sprint para tudo. Quando IA entra no processo, isso fica ainda mais importante, porque boas ferramentas de IA reduzem tempo de produção local, mas também podem aumentar retrabalho, dívida, mudanças de rumo e vazamento de contexto se o sistema de trabalho não estiver preparado. O DORA 2025 é especialmente claro em mostrar IA como amplificador das forças e fraquezas já presentes no sistema de trabalho. citeturn18view3turn19view0turn15view10turn17view1turn17view2

**Quando eu não escolheria esse modelo como padrão**:  
Para times muito pequenos, com uma base de código simples e ciclos mais “aposta por ciclo” do que fluxo contínuo, **Shape Up** pode ser melhor. Para ambientes muito regulados, com necessidade de ritos formais, trilha de auditoria e compromisso explícito por iteração, **Scrum** pode ser preferível, desde que discovery não fique completamente fora do processo oficial. O ponto não é “qual framework é mais famoso”, e sim qual deles gera menos atrito para aprendizado, priorização e entrega no seu contexto. citeturn18view0turn18view2turn18view5turn18view6

A forma prática de operar esse modelo é a seguinte:

- **Discovery contínuo** com trio produto–design–engenharia, buscando backlog validado em vez de backlog apenas “especificado”.  
- **Delivery contínua** em board Kanban com colunas estáveis, políticas explícitas e WIP por etapa.  
- **Cadências leves**: replenishment semanal, sync curto diário, review quinzenal, revisão de roadmap mensal, retrospectiva mensal.  
- **Métricas**: DORA para entrega; freshness de documentação; taxa de aceitação/retrabalho de sugestões de IA; cobertura de evals; bugs escapados por feature. citeturn18view3turn19view0turn15view9turn17view2

A integração de IA por etapa deve ser intencional:

| Etapa | Como usar IA | Gate humano obrigatório |
|---|---|---|
| Descoberta | síntese de entrevistas, análise de concorrência, rascunho de hipóteses, riscos e critérios de aceite | PM/UX/engenharia validam framing e hipóteses |
| Refinamento | quebrar escopo, mapear dependências, sugerir edge cases, rascunhar ADR | tech lead ou senior valida decisões |
| Implementação | scaffolding, testes de unidade, refactors localizados, queries, docs | autor do PR e reviewer técnico validam |
| Revisão | lint semântico, checagem de padrões, riscos óbvios, gaps de testes | revisão humana continua obrigatória |
| Release | release notes, changelog, checklist de rollout, runbook | owner do serviço ou release manager aprova |
| Pós-release | sumarização de incidentes, RCA inicial, propostas de melhoria | responsável operacional confirma fatos e ações |

Essa separação é importante porque a própria documentação do GitHub para code review assistido por IA diz que o uso deve **suplementar** a revisão humana, não substituí-la, e alerta para problemas não detectados, falsos positivos e sugestões inseguras ou incorretas. citeturn15view2

## Estrutura de pastas e arquivos

Minha recomendação-base é um **monorepo modular por domínio e por tipo de artefato**, com separação nítida entre código, testes, documentação, infraestrutura e ativos de IA. Eu só migraria para múltiplos repositórios quando houver fronteiras organizacionais ou de release muito independentes; e eu simplificaria para um repo único simples quando o produto ainda for pequeno demais para justificar camadas. O argumento principal aqui é governança de contexto: documentação perto do código, customizações de IA na raiz do repo, e um lugar canônico para ADRs, prompts, evals e outputs. O ecossistema atual já suporta caminhos específicos como `.github/copilot-instructions.md`, `.github/instructions`, `.github/prompts` e `.github/agents`, inclusive com descoberta em monorepos. citeturn27view1turn27view2turn27view3turn27view5turn27view6

A estrutura abaixo é a que eu adotaria como ponto de partida:

```text
repo/
├─ apps/
│  ├─ web/
│  │  ├─ src/
│  │  ├─ public/
│  │  ├─ tests/
│  │  └─ README.md
│  ├─ api/
│  │  ├─ src/
│  │  ├─ tests/
│  │  ├─ openapi/
│  │  └─ README.md
│  └─ worker/
│     ├─ src/
│     ├─ tests/
│     └─ README.md
├─ packages/
│  ├─ domain/
│  ├─ ui/
│  ├─ sdk/
│  ├─ config/
│  ├─ observability/
│  └─ test-helpers/
├─ tests/
│  ├─ e2e/
│  ├─ integration/
│  ├─ contract/
│  ├─ performance/
│  └─ fixtures/
├─ infra/
│  ├─ iac/
│  ├─ env/
│  ├─ k8s/
│  ├─ migrations/
│  └─ runbooks/
├─ docs/
│  ├─ architecture/
│  │  ├─ c4/
│  │  ├─ diagrams/
│  │  ├─ decisions/
│  │  └─ arc42/
│  ├─ product/
│  │  ├─ features/
│  │  ├─ user-flows/
│  │  └─ glossary/
│  ├─ engineering/
│  │  ├─ standards/
│  │  ├─ conventions/
│  │  ├─ onboarding/
│  │  └─ troubleshooting/
│  ├─ adr/
│  ├─ api/
│  ├─ operations/
│  └─ templates/
├─ ai/
│  ├─ context/
│  │  ├─ business/
│  │  ├─ domain/
│  │  └─ constraints/
│  ├─ prompts/
│  │  ├─ draft/
│  │  ├─ approved/
│  │  └─ deprecated/
│  ├─ instructions/
│  ├─ agents/
│  ├─ evals/
│  │  ├─ datasets/
│  │  ├─ graders/
│  │  └─ reports/
│  ├─ traces/
│  ├─ outputs/
│  ├─ sessions/
│  ├─ policies/
│  └─ registry/
├─ scripts/
│  ├─ dev/
│  ├─ ci/
│  ├─ release/
│  └─ docs/
├─ config/
│  ├─ lint/
│  ├─ format/
│  ├─ test/
│  ├─ build/
│  └─ security/
├─ .github/
│  ├─ workflows/
│  ├─ ISSUE_TEMPLATE/
│  ├─ PULL_REQUEST_TEMPLATE.md
│  ├─ CODEOWNERS
│  ├─ copilot-instructions.md
│  ├─ instructions/
│  ├─ prompts/
│  └─ agents/
├─ .changeset/
├─ README.md
├─ CONTRIBUTING.md
├─ CHANGELOG.md
├─ CODE_OF_CONDUCT.md
├─ SECURITY.md
├─ LICENSE
├─ Makefile
└─ docs-index.md
```

A lógica dessa árvore é simples. **`apps/`** concentra unidades implantáveis. **`packages/`** concentra módulos compartilhados. **`tests/`** concentra suites transversais que não pertencem a uma app só. **`infra/`** separa operação e ambiente do código de produto. **`docs/`** é o hub humano. **`ai/`** é o hub de governança e rastreabilidade. **`.github/`** guarda o que precisa viver exatamente onde as ferramentas já esperam encontrá-lo. Essa distinção entre `ai/` e `.github/` é importante: `.github/` atende integração operacional; `ai/` atende gestão, auditoria e histórico. citeturn27view1turn27view2turn27view6turn15view1turn16view11

Minha convenção de nomes seria:

- **código e docs**: `kebab-case` para arquivos e pastas;
- **ADRs**: `ADR-0001-escolher-openapi-para-contratos.md`;
- **prompts**: `generate-unit-tests.prompt.md`, `review-pr.prompt.md`;
- **instruções**: `backend-style.instructions.md`, `security.instructions.md`;
- **outputs gerados**: `2026-04-22-feature-x-pr-summary.md`, `2026-04-22-eval-report.json`;
- **runbooks**: `runbook-api-degradation.md`, `runbook-db-failover.md`;
- **features**: `feature-billing-invoices.md`, `feature-user-onboarding.md`.

Para times pequenos, eu simplificaria para `src/`, `tests/`, `docs/`, `.github/`, `ai/`, `scripts/`. Para times grandes, eu adicionaria `services/` ou dividiria `apps/` por bounded context, mantendo **um padrão documental único** independentemente da topologia física.

## Padrão de documentação

A documentação recomendada deve seguir três princípios ao mesmo tempo: **docs-as-code**, **taxonomia por intenção de uso** e **arquitetura comunicável**. O primeiro vem da prática de tratar documentação como parte do fluxo de engenharia; o segundo é o ponto forte do Diátaxis; o terceiro é o que arc42, C4 e ADR resolvem quando usados juntos. DORA também reforça o valor de documentação interna de alta qualidade como fundamento de desempenho, e o capítulo de documentação do *Software Engineering at Google* é explícito ao dizer que os melhores resultados aparecem quando documentação é tratada como código e incorporada ao workflow normal de engenharia. citeturn15view1turn15view0turn15view6turn16view5turn15view7turn24view0

A **estrutura mínima** que eu considero aceitável é:

- `README.md`
- `CONTRIBUTING.md`
- `CHANGELOG.md`
- `docs/architecture/`
- `docs/adr/`
- `docs/product/features/`
- `docs/operations/runbooks/`
- `ai/` com prompts, política e evals mínimos

A **estrutura ideal** adiciona:

- glossário de domínio;
- catálogo de APIs;
- padrões de código e revisão;
- onboarding técnico;
- diagramas C4 atualizados;
- templates oficiais;
- documentação de customizações de IA;
- trilha de decisão arquitetural e operacional.

A melhor forma de classificar conteúdo é esta:

| Tipo | Pergunta que responde | Local sugerido |
|---|---|---|
| Tutorial | “Como eu começo?” | `docs/engineering/onboarding/` |
| How-to | “Como eu faço X?” | `docs/engineering/` ou `docs/operations/` |
| Referência | “Qual é a interface/padrão exato?” | `docs/api/`, `docs/engineering/standards/` |
| Explicação | “Por que isso é assim?” | `docs/architecture/`, `docs/product/`, `docs/adr/` |

Isso é Diátaxis na prática: não misturar tutorial com referência, nem explicação com checklist operacional. citeturn15view6turn16view5

Para **arquitetura**, eu usaria **arc42 como esqueleto narrativo** e **C4 como padrão visual**. arc42 resolve o “o que precisa ser explicado”; C4 resolve o “como tornar isso legível”. Isso produz uma combinação muito forte para times modernos:  
- arc42 para contexto, restrições, decisões, riscos, qualidade e deployment;  
- C4 para contexto, contêineres, componentes e, quando necessário, deployment/dinâmica;  
- ADR para decisões que mudam o custo futuro do sistema. citeturn15view7turn24view0turn32view2

Os formatos que eu recomendo são estes:

| Artefato | Formato principal | Quando usar |
|---|---|---|
| README, guias, runbooks, ADR, feature docs | Markdown | texto versionável, review por PR, boa legibilidade |
| Contratos de API HTTP | OpenAPI em YAML | humano-edita melhor; padrão interoperável |
| Payloads, schemas e outputs automatizados | JSON | validação e processamento por ferramentas |
| Configurações operacionais e manifests legíveis | YAML | arquivos declarativos editados por humanos |
| Diagramas simples em repo | Mermaid | baixo atrito em PR e docs |
| Sequência/deployment mais complexos | PlantUML | cenários mais detalhados e notação mais rica |
| Tabelas visuais de arquitetura interoperáveis | C4 + Mermaid/PlantUML/Structurizr | conforme o nível de rigor desejado |

Essa recomendação se apoia no fato de que OpenAPI é um padrão descritivo e linguagem-agnóstico para APIs HTTP, pode ser representado em JSON ou YAML e usa CommonMark em campos de descrição; Mermaid foi criado precisamente para aproximar diagramação e documentação do código; e PlantUML é um gerador textual versátil para vários tipos de diagramas. Para changelog e versionamento, **Keep a Changelog + SemVer + Conventional Commits** formam um trio muito prático e amplamente interoperável. citeturn33view0turn33view1turn34view0turn16view2turn16view3turn16view0turn16view1turn16view4

Para o **README principal**, o conteúdo obrigatório é: propósito do projeto, escopo, stack, estrutura do repo, como subir localmente, como rodar testes, como contribuir, onde está a documentação e como a IA é usada no projeto. Isso se alinha ao que o GitHub recomenda para README de repositório e evita que o arquivo vire marketing ou wiki informal. citeturn38view0

Para **runbooks**, eu recomendo usá-los sempre que houver operação recorrente, incidentes plausíveis, jobs críticos, integrações externas ou compliance operacional. Em particular, para ambientes mais sensíveis, as práticas de gestão de incidentes e resposta operacional convergem em desenvolver runbooks específicos, revisá-los periodicamente e incorporá-los ao plano de resposta. citeturn26search1turn26search6

## Padrão de documentação para IA

A governança de IA não deve ser um apêndice; ela precisa ser um **subsistema explícito do SDLC**. O quadro de referência mais sólido hoje combina gestão de risco, segurança de aplicações com LLM, revisão humana, evals, versionamento e observabilidade. Eu me apoiaria nas diretrizes da entity["organization","NIST","standards institute"] e da entity["organization","OWASP","appsec foundation"] para risco e segurança, e nas práticas operacionais documentadas por entity["company","OpenAI","ai company"], entity["company","Anthropic","ai company"], entity["company","GitHub","code hosting company"], entity["company","Microsoft","software company"] e entity["company","Google Cloud","cloud provider"] para prompts, evals, tracing e colaboração com IA. citeturn16view7turn16view6turn15view2turn15view3turn16view8turn15view4turn35view1turn36view1turn37view0turn17view1

O padrão que eu recomendo é separar **quatro camadas**:

**Camada de contexto**  
Documenta negócio, domínio, regras, termos proibidos, dados sensíveis, restrições e padrões obrigatórios. Fica em `ai/context/`.

**Camada de instruções**  
Documenta como a IA deve se comportar no projeto. Fica em dois lugares:  
- `ai/instructions/` como fonte canônica e auditável;  
- `.github/copilot-instructions.md`, `.github/instructions/`, `.github/prompts/` e `.github/agents/` para integração operacional com as ferramentas. citeturn27view1turn27view2turn27view3turn27view5turn27view6

**Camada de controle de qualidade**  
Contém datasets, graders, evals e critérios de aprovação. Isso é obrigatório porque evals são uma das bases mais importantes para confiabilidade em aplicações com LLM, especialmente quando você troca modelo, muda prompt ou amplia autonomia do agente. A própria documentação da OpenAI trata evals como componente essencial para aplicações confiáveis e para comparação de mudanças; a documentação da Anthropic insiste em critérios de sucesso e testes empíricos antes de “mexer no prompt”. citeturn15view3turn16view8turn15view4

**Camada de rastreabilidade**  
Guarda traces, outputs, lineage entre prompt → execução → PR/issue → revisão → release. Isso é especialmente importante porque rastros permitem entender inputs, handoffs, ferramentas chamadas e regressões. Tanto o Prompt flow quanto os guias de avaliação da OpenAI colocam traces como primeira ferramenta para depurar comportamento e comparar mudanças. citeturn37view0turn37view1

Na prática, cada prompt relevante do projeto deveria ter um arquivo de documentação com metadados mínimos como estes:

```yaml
prompt_id: PRM-0042
status: approved
owner: platform-team
purpose: gerar testes unitários para services
models_tested:
  - gpt-5
  - claude-sonnet
linked_features:
  - FEAT-0123
linked_docs:
  - docs/engineering/testing-standards.md
risk_level: medium
human_review_required: true
eval_suite:
  - ai/evals/datasets/unit-test-generation.jsonl
  - ai/evals/graders/test-quality.yaml
last_reviewed_at: 2026-04-22
version: 3
```

Além disso, cada prompt aprovado deve registrar:

- **contexto de negócio** necessário;
- **escopo permitido** e escopo proibido;
- **entradas esperadas**;
- **saídas esperadas**;
- **regras de geração de código**;
- **critérios de revisão humana**;
- **riscos conhecidos**;
- **evidência de validação**;
- **histórico de versão**.

A governança para evitar bagunça e retrabalho é esta:

| Regra | Decisão prática |
|---|---|
| Nada “vive só no chat” | se um prompt for recorrente, sobe para o repositório |
| Nada entra em produção sem eval mínima | prompt novo precisa dataset e critério de aprovação |
| Nada crítico é aceito sem revisão humana | segurança, arquitetura, SQL, infra e auth sempre com gate humano |
| Nada sem dono | prompt, agente, instrução e eval têm owner explícito |
| Nada sem rastreio | output relevante liga para issue, PR, commit e release |
| Nada sem ciclo de vida | draft → approved → deprecated |

Essa governança responde diretamente aos riscos mais conhecidos em LLM apps: prompt injection, insecure output handling, supply chain, disclosure de informação, e confiança excessiva em saídas não validadas. citeturn16view6turn15view2turn16view7

## Modelos prontos

A árvore completa recomendada já está na seção anterior. Abaixo estão os arquivos que eu trataria como **obrigatórios no primeiro ciclo de implantação**:

```text
README.md
CONTRIBUTING.md
CHANGELOG.md
CODE_OF_CONDUCT.md
SECURITY.md
.github/CODEOWNERS
.github/PULL_REQUEST_TEMPLATE.md
.github/copilot-instructions.md
docs/adr/ADR-0001-adotar-docs-as-code.md
docs/architecture/system-context.md
docs/architecture/container-view.md
docs/product/features/feature-user-onboarding.md
docs/engineering/standards/coding-standards.md
docs/operations/runbooks/runbook-api-degradation.md
ai/policies/ai-usage-policy.md
ai/context/business/domain-overview.md
ai/prompts/approved/review-pr.prompt.md
ai/instructions/backend-style.md
ai/evals/datasets/pr-review.jsonl
ai/evals/reports/2026-04-22-pr-review-eval.md
```

Modelo de `README.md` principal:

```md
# Nome do Projeto

## Visão geral
Uma frase sobre o que o projeto faz, para quem e qual problema resolve.

## Escopo
O que está dentro e fora do escopo.

## Stack
- Frontend:
- Backend:
- Banco:
- Infra:
- Observabilidade:

## Estrutura do repositório
- `apps/`: unidades implantáveis
- `packages/`: módulos compartilhados
- `docs/`: documentação oficial
- `ai/`: prompts, evals, traces e políticas
- `.github/`: automações e customizações integradas

## Como rodar localmente
```bash
make setup
make dev
```

## Como testar
```bash
make test
make test-e2e
```

## Documentação
- Arquitetura: `docs/architecture/`
- ADRs: `docs/adr/`
- Features: `docs/product/features/`
- Runbooks: `docs/operations/`
- IA: `ai/`

## Fluxo de contribuição
Leia `CONTRIBUTING.md` antes de abrir PR.

## Uso de IA neste projeto
- Ferramentas aprovadas:
- Casos permitidos:
- Casos com revisão obrigatória:
- Onde ficam prompts e instruções:
```

Modelo de ADR:

```md
# ADR-0001 Título da decisão

## Status
Proposto | Aceito | Rejeitado | Substituído | Obsoleto

## Contexto
Qual problema motivou a decisão?
Quais restrições, trade-offs e riscos já existiam?

## Decisão
O que foi decidido, exatamente?

## Opções consideradas
- Opção A
- Opção B
- Opção C

## Consequências
### Positivas
- ...

### Negativas
- ...

### Impactos em arquitetura, operação e produto
- ...

## Plano de adoção
- Passo 1
- Passo 2

## Referências
- issues/PRs
- documentos
- links internos
```

Modelo de documentação de prompt:

```md
# PRM-0042 Revisão de PR backend

## Status
Approved

## Objetivo
Gerar uma primeira revisão técnica de PR com foco em bugs, segurança, testes e aderência a padrões internos.

## Quando usar
- PRs backend
- Mudanças de serviço
- Refactors localizados

## Não usar para
- Aprovação final
- Mudanças de autenticação sem revisor humano
- Decisões arquiteturais

## Contexto necessário
- `docs/engineering/standards/coding-standards.md`
- `docs/architecture/container-view.md`
- `.github/copilot-instructions.md`

## Entrada esperada
- diff do PR
- descrição do PR
- arquivos alterados
- critérios de aceite

## Saída esperada
- problemas críticos
- problemas importantes
- sugestões
- lacunas de teste
- dúvidas

## Critérios de revisão humana
- confirmar bugs reais
- descartar falsos positivos
- validar segurança
- validar impacto arquitetural

## Evals associadas
- `ai/evals/datasets/pr-review.jsonl`

## Histórico
- v1 draft
- v2 adicionou checagem de testes
- v3 restringiu comentários especulativos
```

Modelo de documentação de feature:

```md
# Feature User Onboarding

## Objetivo de negócio
O que muda para o usuário e por quê.

## Escopo
O que será entregue nesta feature.

## Fora de escopo
O que não será entregue agora.

## Fluxo funcional
Passo a passo principal do usuário.

## Critérios de aceite
- ...
- ...

## Regras de negócio
- ...
- ...

## Dependências técnicas
- serviços
- jobs
- integrações
- migrações

## Riscos
- ...
- ...

## Observabilidade
- logs
- métricas
- alertas

## Documentos relacionados
- ADRs
- APIs
- prompts
- runbooks
```

Modelo de workflow com IA:

```md
# Workflow com IA

## Entrada
Issue, bug, feature ou refactor aprovado para execução.

## Etapa de preparação
1. Ler feature doc, ADRs e padrões.
2. Carregar contexto de arquitetura e regras de IA.
3. Selecionar prompt/agente aprovado.

## Etapa de execução
1. Gerar plano de implementação.
2. Gerar ou editar código em pequeno lote.
3. Gerar testes e documentação correlata.
4. Rodar checks locais.

## Etapa de validação
1. Executar eval do caso relevante.
2. Abrir PR com descrição clara do que foi feito por IA.
3. Revisão humana obrigatória.
4. Ajustes e merge.

## Etapa de fechamento
1. Atualizar changelog.
2. Atualizar docs e runbooks, se aplicável.
3. Salvar output relevante em `ai/outputs/`.
4. Vincular execução à issue/PR/release.
```

## Riscos e boas práticas

O maior risco em projetos com IA não é “a IA errar”; é o time **transformar erro local em desordem sistêmica**. O DORA 2025 ajuda a entender isso muito bem ao tratar IA como amplificador do sistema já existente. Em paralelo, as referências de segurança para LLMs mostram que o problema vai além de qualidade de texto: inclui prompt injection, insecure output handling, disclosure de informação, supply chain e excesso de confiança em outputs não validados. citeturn15view10turn17view2turn16view6turn16view7

Os riscos mais críticos e os controles que eu recomendo são estes:

| Risco | Sintoma | Controle recomendado |
|---|---|---|
| Sprawl de prompts | cada dev usa um prompt diferente e não há aprendizado acumulado | catálogo central em `ai/prompts/` e promoção só via PR |
| Alucinação em revisão/código | sugestões plausíveis, mas erradas | gate humano + testes + evals + restrição de escopo |
| Instruções conflitantes | respostas inconsistentes entre IDE, CLI e SaaS | fonte canônica em `ai/instructions/` e arquivos operacionais sincronizados |
| Vazamento de contexto sensível | dados internos colados em prompts ou traces | política de dados, classificação e redaction |
| Documentação desatualizada | docs não acompanham merge | docs-as-code e check de PR sem doc correlata |
| Gargalo de governança | processo pesado demais para tudo | gates mais fortes só para risco alto |
| Falta de ownership | ninguém sabe quem aprova o quê | `CODEOWNERS`, owners por prompt e branch protection |

Para governança de repositório, eu considero **`CODEOWNERS` + branch protection/rulesets + PR template + checks obrigatórios** o conjunto mínimo. GitHub documenta CODEOWNERS justamente para responsabilizar indivíduos ou times por partes do repositório, e branch protection existe para impedir merge sem condições mínimas como review e checks. Isso é especialmente valioso quando a IA acelera o volume de mudanças pequenas. citeturn29search1turn28search13turn28search22

Algumas boas práticas que valem quase sempre:

- **PR pequeno vence PR brilhante e enorme**.  
- **Prompt recorrente vira ativo versionado**.  
- **Mudança arquitetural sem ADR é dívida escondida**.  
- **Feature sem doc funcional/operacional nasce cara de manter**.  
- **Sugestão de IA sem teste e sem revisão humana não é ganho de produtividade; é deslocamento de risco**. citeturn15view2turn15view3turn32view2

## Plano de adoção em etapas

A adoção deve ser gradual. O raciocínio é simples: o próprio material recente do DORA sobre IA enfatiza que o retorno vem mais de capacidades fundacionais do que da ferramenta isolada. Logo, a sequência correta não é “ligar a IA em tudo”; é **organizar contexto, documentação, regras e medição primeiro, e só depois ampliar autonomia e escala**. citeturn17view1turn15view10turn17view2

**Fase de fundação**  
Crie a espinha dorsal do repositório: `docs/`, `ai/`, `.github/`, README, CONTRIBUTING, CHANGELOG, ADR inicial, padrões de código, política de uso de IA e custom instructions no repositório. Defina também PR template, CODEOWNERS e o fluxo mínimo de revisão. O entregável aqui não é velocidade; é **clareza operacional**. citeturn38view0turn27view1turn27view3turn29search1

**Fase de piloto**  
Escolha dois ou três casos de uso de alto valor e baixo risco, como geração de testes, revisão inicial de PR e rascunho de documentação técnica. Para cada um, publique um prompt aprovado, um conjunto mínimo de evals e um output esperado. Não tente começar por arquitetura autônoma, migração crítica ou infra sensível. Aqui a meta é medir aceitação, retrabalho, falsos positivos e qualidade percebida. citeturn15view3turn16view8turn35view1turn15view2

**Fase de padronização**  
Depois do piloto, normalize nomes de arquivos, taxonomia documental, critérios de prontidão, colunas do board, templates e convenções de versionamento. Faça com que prompts aprovados virem slash commands ou files reutilizáveis onde a ferramenta suportar isso, e trate ambientes de prompt como staging/production, ou com tags equivalentes, para evitar “troca silenciosa” de comportamento em produção. citeturn27view2turn27view4turn36view1

**Fase de escala**  
Só então amplie para múltiplos times, agentes especializados e automações mais fortes. Nesta etapa, traces e observabilidade deixam de ser opcionais, porque você já precisa entender regressões, handoffs, falhas de ferramenta e qualidade por fluxo inteiro. Adicione métricas de operação e confiabilidade, runbooks maduros e revisão periódica de riscos. citeturn37view0turn37view1turn26search1turn26search6

Os indicadores que eu acompanharia desde o início são:

- tempo de lead e frequência de deploy;
- taxa de falha e tempo de recuperação/reliability;
- freshness de documentação;
- número de ADRs relevantes por trimestre;
- taxa de aceitação de sugestões de IA;
- retrabalho pós-IA;
- bugs escapados por feature;
- taxa de aprovação em evals por prompt/agente. citeturn15view9turn17view2turn15view0turn15view3turn16view8

Como limitação, esta recomendação foi construída sem os detalhes específicos do seu projeto. Se o seu contexto real for muito diferente do cenário-base — por exemplo, mobile-only, data platform, MLOps pesado, time de 2 pessoas, múltiplos produtos independentes, ou compliance forte como SOX, PCI, HIPAA ou similar — a melhor adaptação não é jogar fora a estrutura; é **endurecer ou simplificar as camadas certas**. Ainda assim, a base proposta aqui continua válida: **método híbrido, repositório modular, documentação como código, decisões explícitas e IA sob governança versionada e rastreável**.