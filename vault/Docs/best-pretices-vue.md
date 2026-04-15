# Melhores práticas de Vue 3 em projetos profissionais

## Resumo executivo

**1. Resumo executivo**  

O mercado Vue 3 “profissional” em 2026 é, na prática, fortemente ancorado no **trio oficial de base**: **Vite + Vue Router + Pinia**, normalmente instalado via **create-vue** (scaffold oficial) e com **Composition API + `<script setup>`** como padrão de escrita de componentes. A própria documentação recomenda o uso de Vite na criação do projeto e descreve que o template gerado já vem majoritariamente em Composition API + `<script setup>`. citeturn19view0turn14view0turn12view1  

A diferença entre “tendência passageira” e “padrão consolidado” em Vue 3 costuma aparecer em três sinais objetivos:

- **Está no caminho feliz da documentação oficial** (ex.: `<script setup>` como sintaxe recomendada para SFC + Composition API; Pinia como recomendação para novos apps; Vitest como recomendação em projetos Vite). citeturn14view0turn13view0turn18view0  
- **Aparece no scaffold oficial e nos templates de referência** (create-vue oferece Router, Pinia, Vitest, E2E com Playwright/Cypress, ESLint, Prettier). citeturn19view0turn3search5  
- **É repetido em bases grandes e públicas** (ex.: guias de engenharia como os da entity["company","GitLab","devops company"] mostram decisões explícitas de organização por “feature” e separação entre componentes e camada de estado/dados). citeturn15view0  

O que hoje é mais “forte” (alto consenso) em projetos Vue 3 modernos:

- **Composition API + `<script setup>`** como default e foco em **composables** para reuso de lógica (com mixins sendo desencorajados no Vue 3). citeturn14view0turn2view1turn12view1  
- **Pinia** como state manager recomendado para novos projetos + **Vuex em manutenção**. citeturn13view0  
- **Testes com Vitest + @vue/test-utils** como base, e E2E com **Playwright** ou **Cypress** conforme o tipo de aplicação. citeturn18view0turn3search2  
- **Performance pragmática**: route-level lazy loading, estabilidade de props, `v-memo/v-once` em casos críticos, e redução de overhead reativo com `shallowRef/shallowReactive` em estruturas grandes e imutáveis. citeturn11view0turn20view0turn0search3  

Em contraste, o que aparece bastante, mas ainda é mais “opinião/template” do que padrão universal:

- **Auto-import agressivo** de APIs e componentes (ex.: `unplugin-auto-import`, `unplugin-vue-components`) e **file-based routing** fora de frameworks (muito visto em templates como Vitesse, mas nem sempre aceito em ambientes enterprise por aumentar “magia” e dificultar grep/onboarding). citeturn8search0turn8search12  
- Metodologias formais de arquitetura como **Feature-Sliced Design** aplicadas a Vue (adoção crescente, mas ainda longe de consenso geral “mercado inteiro”). citeturn9search5  

## Padrões mais recorrentes e maturidade

**2. Padrões mais recorrentes no mercado**  

A seguir, os padrões que aparecem com mais frequência em projetos Vue 3 profissionais (e como classificá-los). Para cada padrão, eu separo **consolidado** vs **tendência** e também quando faz sentido em projetos pequenos/médios/grandes.

### Composition API como padrão principal de implementação

**O que é**: escrever componentes e lógica usando APIs como `ref`, `computed`, `watch`, hooks de lifecycle e composables, em vez de Options API. citeturn12view1turn2view2turn12view0  

**Por que é usado**: melhora reuso de lógica via composables e tende a escalar melhor quando um componente reúne várias preocupações; também tem bom encaixe com TypeScript. citeturn12view1turn8search2  

**Contexto ideal**: apps médios/grandes, apps com regras de negócio relevantes no frontend, times que precisam padronizar extração de lógica para composables. citeturn12view1turn2view1  

**Vantagens**: reuso eficiente, composição de concerns, melhor inferência/ergonomia com TS em muitos cenários. citeturn12view1turn8search2  

**Trade-offs**: pode virar “bagunça” se o time não define convenções de organização dentro do `<script setup>`; perde os “trilhos” rígidos que o Options API impunha (por seção). citeturn12view1turn0search29  

**Status**: **consolidado** (está no caminho principal da documentação e do scaffold). citeturn19view0turn12view1  

**Adequação**: pequeno (ok), médio (muito bom), grande (quase obrigatório).

### `<script setup>` como sintaxe dominante em SFC

**O que é**: “sintaxe açucarada” compilada em tempo de build para escrever Composition API em SFC sem boilerplate de `setup()` e sem `return` manual. citeturn14view0turn2view2  

**Por que é usado**: menos boilerplate, melhor ergonomia com TS para props/events e ganhos de performance (template compilado no mesmo escopo, sem proxy intermediário) e de performance de type inference na IDE. citeturn14view0  

**Contexto ideal**: praticamente qualquer SPA nova em Vue 3 baseada em Vite/SFC. citeturn19view0turn14view0  

**Vantagens**: concisão, clareza do que está no escopo do template, melhor DX no mundo TS. citeturn14view0turn8search2  

**Trade-offs**: (1) execução por instância do componente (código roda a cada criação), logo side effects precisam ser bem controlados; (2) sem convenção interna, o arquivo pode perder legibilidade. citeturn14view0turn0search29  

**Status**: **consolidado** (explicitamente recomendado). citeturn14view0turn19view0  

**Adequação**: pequeno/médio/grande: sim; em grande, exige convenção.

### Pinia como state management padrão para novos projetos

**O que é**: biblioteca de estado global mantida pelo core team, com stores modulares (getters/actions/state) e integração com DevTools. citeturn13view0turn13view1  

**Por que é usado**: é a recomendação atual para novos apps; Vuex está em modo de manutenção; Pinia tem API menos cerimonial e boa inferência em TypeScript. citeturn13view0  

**Contexto ideal**: estado compartilhado entre múltiplas rotas/árvores de componentes (auth, preferências, carrinho, permissões, filtros globais etc.). citeturn13view0turn0search34  

**Vantagens**: convenções, DevTools, HMR, suporte SSR, modularidade e bom encaixe com TS. citeturn13view0turn13view1  

**Trade-offs**: risco de usar store como “lixeira global” (misturar estado de UI, cache de API, lógica de negócio e side effects sem limites); exige disciplina de fronteiras. citeturn13view0turn15view0  

**Status**: **consolidado** para apps novos. citeturn13view0turn19view0  

**Adequação**: pequeno (talvez overkill se quase tudo é local), médio (bom), grande (padrão).

### Composables como mecanismo principal de reuso de lógica (substituindo mixins)

**O que é**: funções que encapsulam estado reativo + efeitos e retornam uma API consumível por componentes (ex.: `useXxx`). citeturn2view1  

**Por que é usado**: recomendado para reuso de lógica “pura” (sem layout) e evita overhead/perfis problemáticos de padrões alternativos como renderless components; mixins são desencorajados no Vue 3. citeturn2view1turn12view1  

**Contexto ideal**: validação, form state, data fetching “orquestrado”, integração com APIs do browser, regras de UI repetidas etc. citeturn2view1turn9search11  

**Vantagens**: composição explícita, testabilidade (funções), sem colisões de namespace típicas dos mixins. citeturn2view1turn18view0  

**Trade-offs**: composables mal desenhados podem vazar estado global sem intenção (module-scope), ou virar um “mini-framework” interno. A disciplina de API é crucial. citeturn13view0turn3search20  

**Status**: **consolidado**. citeturn2view1turn12view1  

**Adequação**: pequeno (ótimo para evitar duplicação), médio/grande (essencial).

### Code splitting e lazy loading como padrão de performance “default”

**O que é**: dividir bundle em chunks carregados sob demanda via `import()` dinâmico, com ênfase em lazy loading de rotas e, quando necessário, async components. citeturn11view0turn0search3  

**Por que é usado**: reduz bundle inicial e melhora performance de carregamento; recomendado explicitamente para aplicações com Vue Router. citeturn11view0turn0search3  

**Contexto ideal**: SPAs com múltiplas rotas/features, áreas pouco acessadas, páginas administrativas. citeturn11view0turn0search3  

**Vantagens**: melhora TTI e distribuição de carga; dá flexibilidade de “carregar só quando precisa”. citeturn11view0turn4search1  

**Trade-offs**: excesso de chunks pode gerar overhead de requests; precisa de estratégia (ex.: agrupar por feature) e monitorar. Vite permite ajustar estratégia via configurações de chunking (ex.: `manualChunks`). citeturn4search0turn4search1  

**Status**: **consolidado** (principalmente route-level). citeturn11view0turn0search3  

**Adequação**: pequeno (às vezes desnecessário), médio/grande (recomendado).

### TypeScript como padrão de engenharia (ainda que nem sempre universal)

**O que é**: projeto Vue 3 com TS no app inteiro (ou progressivo), com tipagem de props, emits, refs/computed e checagem via `vue-tsc`. citeturn1search1turn1search8turn8search2  

**Por que é usado**: reduz bugs de integração, melhora refactors, dá contratos explícitos (principalmente em equipes grandes). O guia oficial de TS para Vue incentiva Vite e o uso de `vue-tsc` para type-check. citeturn1search1turn1search8  

**Contexto ideal**: médio/grande e bibliotecas internas; pequeno também pode se beneficiar, mas o custo inicial pode pesar. citeturn8search2turn1search8  

**Vantagens**: contratos claros entre camadas (UI ↔ store ↔ services), mais segurança em composables e stores. citeturn8search2turn13view0  

**Trade-offs**: curva de aprendizado, e necessidade de manter TS + tooling alinhados (Volar/Vue Official extension e `vue-tsc`). citeturn1search8turn1search16  

**Status**: **consolidado em times maduros**, “misto” em projetos menores (há muitos apps JS-only). O create-vue torna TS um checkbox comum. citeturn19view0turn3search5  

**Adequação**: pequeno (opcional), médio/grande (forte recomendação).

### Convenções e qualidade: ESLint + regras Vue + formatação

**O que é**: linting com regras específicas para Vue (eslint-plugin-vue) e, em projetos com TS, configs como `@vue/eslint-config-typescript`, geralmente combinado com um formatter (Prettier). citeturn10search0turn10search1turn19view0  

**Por que é usado**: padroniza estilo, reduz bugs e bikeshedding; é o caminho “padrão” oferecido no scaffold oficial. citeturn19view0turn10search0  

**Contexto ideal**: qualquer time com >1 pessoa; quanto maior o time, mais crítico. citeturn19view0turn10search1  

**Vantagens**: consistência e regras específicas Vue (incluindo presets recommended). citeturn10search0turn10search9  

**Trade-offs**: regras demais podem reduzir produtividade; precisa calibrar para o domínio. A própria doc do style guide oficial incentiva desvios conscientes (embora a página reconheça estar desatualizada). citeturn17view0  

**Status**: **consolidado**. citeturn19view0turn10search0  

**Adequação**: pequeno/médio/grande: sim.

## Arquitetura e organização para escala

**3. Arquitetura adotada por equipes maduras**  

A “arquitetura Vue 3” madura tende menos a um padrão único e mais a um conjunto de **separações explícitas**, com duas orientações dominantes de organização:

- **Por camada técnica** (components/composables/stores/services): simples, muito comum em codebases médias.  
- **Por feature/domínio** (cada feature encapsula suas peças): cresce com a escala e com múltiplos times trabalhando em paralelo.

O ponto comum nas equipes maduras é: **a arquitetura serve para reduzir acoplamento e tornar o crescimento previsível**, não para “parecer bonita”.

image_group{"layout":"carousel","aspect_ratio":"16:9","query":["Vue 3 Composition API architecture diagram","Pinia store architecture diagram","Vue 3 project folder structure feature-based","Vite code splitting chunks visualization"],"num_per_query":1}

### Organização por feature/domínio em projetos grandes

Um sinal forte de “padrão de equipe madura” é quando a organização por feature deixa de ser só um conselho e vira **guia de engenharia com estrutura recomendada**. A entity["company","GitLab","devops company"], por exemplo, recomenda para certas features uma estrutura clara separando `components`, `store` e um `index.js` de bootstrap (no contexto deles, integrando com Rails), e explicita a intenção de **um único fluxo de dados** e uma única entrada. citeturn15view0  

Mesmo que o contexto (Rails/HAML) seja específico, duas práticas ali generalizam muito bem para SPAs Vue 3 modernas:

- **Bootstrap explícito** (um ponto de entrada por feature/“app”/cluster), onde você injeta dependências (store/services) e dados iniciais — isso melhora testabilidade e diminui “DOM querying” dentro do componente raiz. citeturn15view0  
- **Separação de concerns por pasta** (componentes versus estado/camada de dados), para impedir que UI vire o lugar onde tudo acontece. citeturn15view0  

### Separação entre UI, lógica de negócio, acesso a dados e estado

Em Vue 3 moderno, uma separação prática e repetida (não necessariamente com nomes iguais) tende a ser:

- **UI (componentes)**: renderização, composição visual, eventos do usuário, validações simples de apresentação. A própria style guide descreve “base components” como presentational/pure e recomenda que eles **não contenham estado global** (ex.: store). citeturn17view1  
- **Lógica de tela (composables)**: orquestra estado local de tela, sincroniza query params, debounce, seleção, paginação, “use cases” da view. Vue recomenda composables para reuso de lógica pura. citeturn2view1turn12view1  
- **Estado compartilhado (Pinia)**: estado global / cross-feature quando necessário; o guia oficial diz que estado global arbitrariamente mutável por qualquer componente tende a não escalar, e aponta Pinia como solução para apps grandes. citeturn13view0  
- **Acesso a dados (services/api layer)**: módulos responsáveis por falar com backend (HTTP/GraphQL), sem regras de UI e idealmente sem armazenar estado de view. Esse tipo de separação aparece explicitamente em guias internos de empresas (ex.: recomendação de inicializar store e “service” no bootstrap e passá-los aos componentes principais). citeturn15view0  

Uma evolução muito comum em projetos maiores é separar também:

- **Estado de servidor (“server state”)** do **estado de cliente (“client state”)**. Um padrão recorrente é usar libs de server state/caching (ex.: TanStack Query para Vue) para queries, cache, background refetch e invalidações, evitando “Pinia para cache de API” como padrão universal. A própria documentação do TanStack Query coloca a biblioteca como solução para desafios de server state e caching. citeturn9search2turn9search10turn9search6  

### Como isso muda conforme o tamanho do projeto

- **Projetos pequenos**: muitas vezes um “layout por tipo” (`components/`, `composables/`, `stores/`, `services/`) é suficiente e mais simples. O create-vue inicia na direção de uma estrutura direta e permite ir adicionando peças conforme necessário. citeturn19view0turn3search5  
- **Projetos médios**: começa a aparecer necessidade de boundaries por feature (ex.: `features/billing`, `features/auth`) para reduzir import spaghetti.  
- **Projetos grandes**: a estrutura por feature/domínio vira “contrato de equipe”; bibliotecas compartilhadas (design system) e padrões de injeção/bootstrapping ficam explícitos. A entity["company","GitLab","devops company"] descreve inclusive iniciativas para consolidar componentes reutilizáveis e reduzir duplicação em repositórios grandes. citeturn16view0turn15view0  

## Ferramentas e bibliotecas mais usadas

**4. Ferramentas e bibliotecas mais usadas**  

A forma mais objetiva de observar “o que é padrão” em Vue 3 hoje é olhar para o que o scaffold oficial oferece como checklist e o que a documentação recomenda como ecossistema suporte. O **create-vue** oferece diretamente Router, Pinia, Vitest, soluções de E2E (incluindo Playwright), ESLint e Prettier. citeturn19view0turn3search5  

### Núcleo de aplicação

- **Vite**: é o build setup recomendado no Quick Start e base do create-vue. citeturn19view0turn1search1  
- **Vue Router**: roteador oficial do ecossistema. citeturn3search7turn0search3  
- **Pinia**: state manager recomendado para novos apps; Vuex está em manutenção. citeturn13view0turn13view1  

### TypeScript e tooling de tipo

- Guia oficial detalha TS com Composition API (`defineProps`, typing de `ref/reactive/computed`) e recomenda migração para Vite para Vue 3 + TS (especialmente para quem vinha de Vue CLI). citeturn1search1turn8search2  
- O toolset oficial de linguagem (Volar / “Vue - Official”) e `vue-tsc` são a base prática para type-checking em CI. citeturn1search8turn1search16  

### Bibliotecas recorrentes “de mercado” (não oficiais, mas muito comuns)

- **VueUse**: coleção ampla de composables, citada até como referência de leitura na própria doc de composables e apontada como projeto comunitário relevante no contexto de Composition API. citeturn2view1turn12view1turn1search2  
- **TanStack Query (Vue Query)**: aparece com frequência em projetos que querem separar server state de client state; a doc reforça caching/refetch/gestão do ciclo de vida de queries. citeturn9search2turn9search10turn9search6  
- **VeeValidate**: biblioteca de forms muito popular, com API baseada em Composition API (`useField`, `useForm`). citeturn9search3turn9search11  

### Testes

- **Vitest**: recomendado no guia oficial de testes para projetos baseados em Vite, com argumento explícito de integração com pipeline do Vite e manutenção por membros do time Vue/Vite. citeturn18view0turn1search31  
- **@vue/test-utils**: biblioteca oficial de baixo nível para montar/testar componentes Vue 3. citeturn18view0turn3search2  
- **Playwright**: recomendado como opção forte para E2E no guia oficial, incluindo suporte a múltiplos engines de browser e recursos de debuggabilidade. citeturn18view0turn3search9  

### Linting e formatação

- **eslint-plugin-vue**: plugin oficial do ESLint para Vue, com presets (essential/strongly-recommended/recommended) e suporte a Vue 3 e `<script setup>`. citeturn10search11turn10search0turn10search9  
- **@vue/eslint-config-typescript**: configuração voltada para Vue 3 + TS, distribuída oficialmente no npm. citeturn10search1  

**Leitura crítica (importante para diferenciar padrão de “moda”)**: templates opinativos como Vitesse popularizam auto-import e file-based routing. Eles são valiosos como referência de DX, mas não são “padrão universal de mercado” do mesmo modo que create-vue e as recomendações oficiais. citeturn8search0turn19view0  

## Boas práticas de performance em Vue 3

**5. Boas práticas de performance em Vue 3**  

O guia de performance do Vue separa explicitamente **page load performance** e **update performance** — e essa distinção é essencial para evitar “otimizações placebo”. citeturn11view0  

A seguir, práticas com maior evidência de impacto real (e quando usá-las).

### Code splitting e lazy loading com Vite + Router

**O que é**: reduzir bundle inicial usando `import()` dinâmico; em apps com Router, lazy load de route components é fortemente recomendado. citeturn11view0turn0search3  

**Por que é usado**: melhora carregamento inicial ao baixar somente o necessário; features menos acessadas viram chunks sob demanda. citeturn11view0  

**Como aplicar (padrão de mercado)**:
- **Route-level lazy loading** (cada rota importante como chunk): documentação do Vue Router mostra suporte “out of the box” e ressalta que bundlers como Vite fazem code splitting automaticamente nesses casos. citeturn0search3turn11view0  
- **Async components** (`defineAsyncComponent`) quando o split é por subárvore de componente e não por rota. citeturn11view0  

**Trade-offs**: chunks demais podem elevar overhead de requisições e causar waterfalls; em Vite você pode ajustar estratégia de chunking (ex.: `manualChunks`) quando necessário, mas deve ser medido e não adotado por “achismo”. citeturn4search0  

**Consolidação**: consolidado.

### Estabilidade de props para evitar re-renders em listas e árvores grandes

**O que é**: reduzir updates de filhos mantendo props estáveis e evitando passar props “globais” que mudam frequentemente para todos os itens (ex.: `activeId` em lista). citeturn11view0  

**Por que é usado**: em Vue, filho atualiza quando pelo menos uma prop muda; props instáveis fazem listas inteiras atualizarem. citeturn11view0  

**Padrão prático**: mover computações para o pai e passar boolean/valor já resolvido (`:active="item.id === activeId"`) para cada item, reduzindo updates nos itens que não mudaram. citeturn11view0  

**Trade-offs**: pode aumentar lógica no pai; resolve via componentes de “container”/composables de lista.

**Consolidação**: consolidado (está no guia oficial).

### `v-once` e `v-memo` em hotspots

**O que é**:
- `v-once`: renderiza subárvore uma vez e pula updates futuros.  
- `v-memo`: pula updates condicionalmente, com base em dependências. citeturn11view0turn4search14  

**Por que é usado**: somente para cenários onde o custo de re-render em subárvores grandes é relevante. citeturn11view0  

**Contexto ideal**: listas grandes, subárvores pesadas, componentes que recebem props que mudam mas parte do DOM não precisa acompanhar.  

**Trade-offs**: risco alto de “pular update quando não devia”, principalmente com `v-memo` se a lista de dependências for errada. Por isso tende a ser “otimização com medição” e não default. citeturn4search18turn11view0  

**Consolidação**: consolidado como ferramenta, mas uso frequente apenas em apps com hotspots reais.

### “Reduzir overhead reativo” em estruturas grandes

**O que é**: evitar deep reactivity em estruturas imensas e tratá-las como imutáveis usando `shallowRef`/`shallowReactive`. citeturn11view0turn20view0  

**Por que é usado**: deep reactivity cria overhead de tracking ao acessar muitas propriedades (ex.: listas grandes com objetos profundos). citeturn11view0  

**Como aplicar corretamente**:
- usar `shallowRef` para manter reatividade na raiz e substituir a raiz ao atualizar (imutabilidade). citeturn11view0turn20view0  

**Trade-offs**: exige disciplina de imutabilidade; mutações profundas não disparam update sem `triggerRef` ou troca de raiz. citeturn20view0turn11view0  

**Consolidação**: consolidado, mas para casos específicos.

### `markRaw` e evitar tornar “coisas erradas” reativas

**O que é**: marcar objetos para não virarem proxy reativo (ex.: instâncias complexas de libs, objetos de componente). citeturn20view0  

**Por que é usado**: valores que “não deveriam ser reativos” podem causar overhead e armadilhas de identidade; a doc cita explicitamente componentes Vue/instâncias de libs como exemplos. citeturn20view0  

**Trade-offs**: uso avançado; pode gerar hazards de identidade se misturar raw e proxied. citeturn20view0  

**Consolidação**: consolidado, porém avançado.

### `computed`, `watch` e `watchEffect` de forma eficiente

**Pontos “mercado maduro” (com base na doc):**
- usar **computed** para valores derivados (cacheado) e **watch** para side effects reativos (ex.: buscar dados ao mudar input). citeturn12view0turn11view0  
- evitar `watch` profundo por default: `watch` é shallow; deep watchers devem ser exceção e justificativa. citeturn12view0  
- entender flush timing e cleanup para efeitos assíncronos e evitar race conditions/leaks (a doc trata cleanup e timing do callback). citeturn12view0  
- aproveitar melhorias de **computed stability** (Vue 3.4+) para reduzir triggers quando o valor não muda; e evitar computed que cria novo objeto a cada execução (ou fazer comparação manual quando necessário). citeturn11view0turn7search3  

## Boas práticas de código e manutenção

**6. Boas práticas de código e manutenção**  

Aqui estão práticas que, na vida real, melhoram legibilidade, reuso, testabilidade e manutenção. Eu marco a natureza: **oficial**, **comum de mercado**, **preferência de time**.

### Convenções para manter `<script setup>` legível em escala

**Prática (comum de mercado)**: definir um “layout” mental consistente dentro do `<script setup>` (por exemplo: imports → tipos → defineProps/defineEmits/defineModel → estado → computed → handlers → watchers → lifecycle → exports utilitários).  

**Por que**: o `<script setup>` remove a estrutura rígida do Options API; sem convenções, cada arquivo vira “snowflake”. A própria discussão recorrente na comunidade é que não há um padrão imposto, então times maduros criam o seu. citeturn12view1turn0search29  

### TypeScript bem aplicado em Vue 3

**Padrões oficiais úteis e recorrentes**:
- tipar props via `defineProps` (runtime declaration) ou type-based; e tipar emits com `defineEmits`. citeturn8search2turn14view0  
- usar `vue-tsc --noEmit` como type-check em CI. citeturn1search8turn1search1  
- adotar recursos de versões recentes com cuidado:
  - `defineModel` está estável (Vue 3.4+) e documentado; mas há warning sobre default no model poder desincronizar se o pai não passar valor. citeturn14view1turn7search3  
  - Reactive Props Destructure estabilizado no Vue 3.5 e habilitado por default; melhora DX e simplifica defaults usando sintaxe nativa. citeturn7search11turn14view1  

**Consolidado vs tendência**:
- TS + `vue-tsc` + Vue Official extension: **consolidado**. citeturn1search8turn1search16  
- adoção completa de features novas do compiler (ex.: destruturação reativa de props) em empresas pode ter defasagem por política de upgrade, apesar de estar estabilizado. citeturn14view1turn7search11turn16view0  

### Estratégias de teste em projetos maduros

O guia oficial de testes separa níveis (unit, component, E2E) e faz recomendações explícitas:

- **Unit**: Vitest (integra com Vite e é rápido). citeturn18view0turn1search31  
- **Component**: Vitest + @vue/test-utils para a maioria; e Cypress Component Testing quando o comportamento depende muito de CSS/eventos nativos e contexto real de browser. citeturn18view0turn3search2  
- **E2E**: Playwright como recomendação forte; Cypress também aparece como opção sólida com trade-offs (licenciamento/recursos e suporte a browsers). citeturn18view0turn3search9  

**Padrão de time maduro (comum de mercado)**:
- ter **spec file por componente** (a doc recomenda cobertura ampla via component tests) e focar interface pública (props, events, slots) — evitando whitebox/snapshot como único método. citeturn18view0turn15view1  

### Linting, formatação e “qualidade como pipeline”

**Base consolidada**:
- ESLint com **eslint-plugin-vue** (presets) + config TS oficial (`@vue/eslint-config-typescript`) + formatter (Prettier). citeturn10search0turn10search1turn19view0  

**Prática comum em times maiores**:
- rodar lint + type-check no CI e, quando faz sentido, em hooks de commit (Husky/lint-staged) para feedback rápido — vale mais como prática de engenharia do que como detalhe do framework. citeturn10search25turn1search8  

### Componentização: base components, “smart vs dumb” e consistência

Mesmo com a nota de que o style guide está desatualizado, ele continua sendo uma referência ampla para regras que evitam inconsistência e anti-patterns. citeturn17view0  

O que aparece como prática recorrente:
- **Base components** com prefixo (`Base/App/V`) e sem estado global (servem como fundação de UI consistente). citeturn17view1  
- Convenções de casing/nomes para SFC e tags de componente para facilitar navegação, autocomplete e legibilidade. citeturn17view1  

## Anti-patterns comuns

**7. Anti-patterns comuns**  

Aqui estão práticas ruins/frágeis que aparecem com frequência e por que devem ser evitadas, com alternativa preferível.

### Transformar store em “depósito universal”

**Por que evitar**: o guia de state management já alerta que estado global mutável arbitrariamente por qualquer componente não escala; Pinia ajuda com convenções, mas não impede abuso. citeturn13view0  

**Sinal de problema**:
- store guarda: dados de API crus + estado de UI + form state + flags temporárias + lógica de fetch + mapeamentos de view.

**Abordagem preferível**:
- separar: **server state** com uma lib de caching/queries (ex.: TanStack Query) e **client state**/preferências em Pinia; manter form state local/composable quando possível. citeturn9search2turn13view0  

### `watch` profundo como ferramenta padrão

**Por que evitar**: `watch` é shallow por padrão, e deep watchers existem para casos específicos; usar deep como default costuma indicar modelagem de estado ruim (ou excesso de mutações profundas). citeturn12view0  

**Abordagem preferível**:
- observar fontes específicas via getter; ou reestruturar o estado para mudanças granulares e previsíveis. citeturn12view0  

### “Otimização prematura” com `v-memo`/`v-once`

**Por que evitar**: pode mascarar bugs (subárvore não atualiza) e tornar a UI difícil de raciocinar; o guia de performance posiciona essas diretivas como ferramentas de otimização quando necessário, não como default. citeturn11view0turn4search18  

**Abordagem preferível**:
- primeiro: estabilizar props, reduzir reatividade desnecessária, virtualizar listas grandes. citeturn11view0  

### Deixar “magia” de tooling sem governança

**Exemplo**: auto-import de tudo + file-based routing + macros extras sem documentação interna.

**Por que evitar**: aumenta custo de onboarding e debugging; em times grandes, previsibilidade e grep-friendly muitas vezes vencem “menos imports”. O create-vue não assume auto-import por padrão, enquanto templates opinativos (ex.: Vitesse) assumem — isso é um bom indicador de que ainda é mais “preferência” do que consenso. citeturn19view0turn8search0turn8search12  

**Abordagem preferível**:
- se usar auto-import, restringir escopo (ex.: só Vue core APIs) e padronizar geração de tipos/linters; se usar file-based routing fora de framework, documentar convenções e garantir tooling para rotas tipadas. citeturn8search12turn3search26  

### Misturar valores “raw” e proxied sem entender hazards

**Por que evitar**: `markRaw` e shallow APIs são avançados e podem criar hazards de identidade; a doc dá exemplo onde o mesmo objeto aparece como raw e proxied com identidades diferentes. citeturn20view0  

**Abordagem preferível**:
- reservar `markRaw/shallowRef` para hotspots reais e para objetos que não devem ser reativos (ex.: instâncias de libs), com guidelines explícitos. citeturn20view0turn11view0  

## Convergências em times maduros e recomendação prática

**8. O que grandes empresas e times maduros parecem fazer em comum**  

Quando você olha para organizações com engenharia pública e codebases grandes, alguns padrões aparecem repetidamente — e são menos “Vue-specific” e mais “engenharia de produto”.

### Convergências observáveis

- **Manter upgrade de framework como objetivo contínuo**: a entity["company","GitLab","devops company"] define explicitamente “Vue@latest” como objetivo para capturar performance/DX e descreve o estado de migração (inclusive com “frontend islands” usando Vue 3). citeturn16view0  
- **Evitar múltiplas “mini apps” Vue concorrendo na mesma página** quando isso aumenta complexidade, requests independentes e piora métricas; preferir uma arquitetura mais coesa por área. citeturn15view0  
- **Component library / design system**: codebases grandes reforçam a necessidade de um lugar “oficial” para componentes reutilizáveis e trabalham para reduzir duplicação. citeturn16view0turn17view1  
- **Separação entre componentes e camada de estado/dados** como estrutura recomendada por feature (ex.: `components/`, `store/`, `index` de bootstrap). citeturn15view0  
- **Testes como pirâmide pragmática** (rápido com Vitest + VTU, mais real com E2E), alinhado com recomendações do guia oficial. citeturn18view0turn15view1  

### Diferença entre adoção real e “discurso genérico”

O discurso genérico costuma dizer “use Pinia, use composables, use TypeScript”. A adoção real (quando observável) normalmente inclui:

- **regras de fronteira** (o que pode ir para store vs composable vs componente)  
- **estratégia explícita de migração/upgrade** em vez de “vamos atualizar quando der”  
- **redução de duplicação** via bibliotecas internas (component library)  
- **previsibilidade da estrutura de pastas** para permitir paralelismo de times

Isso é mais importante do que a escolha exata de “folder naming”.

A documentação oficial do Vue reforça ainda que o framework é usado em produção por organizações grandes “em diferentes capacidades”, indicando justamente que o uso real varia bastante de um contexto para outro (SPA total vs incremental vs widgets). citeturn6search7turn11view0  

**9. Recomendação final**  

A recomendação abaixo é a que eu adotaria para começar hoje um projeto Vue 3 “com padrão de mercado forte”, equilibrando simplicidade, escalabilidade, manutenção e performance. Ela tenta ficar o máximo possível no caminho oficial e usar “tendências” só quando claramente valem o custo.

### Stack recomendada

- **Vue 3.5+** (para aproveitar Reactive Props Destructure estável) e **`<script setup>`** como padrão (recomendado). citeturn14view0turn7search11turn14view1  
- **Vite** (base do scaffold oficial). citeturn19view0  
- **Vue Router** (roteamento oficial, com lazy loading por rota como prática padrão). citeturn3search7turn0search3turn11view0  
- **Pinia** para estado global necessário (recomendação oficial; Vuex em manutenção). citeturn13view0  
- **TypeScript** com `vue-tsc --noEmit` no CI (tooling oficial). citeturn1search8turn8search2  
- **Vitest** para unit/component tests rápidos + **@vue/test-utils** como base de montagem. citeturn18view0turn3search2  
- **Playwright** para E2E crítico (ou Cypress, conforme restrições/stack). citeturn18view0turn3search9  
- **ESLint (eslint-plugin-vue) + @vue/eslint-config-typescript + Prettier** para consistência. citeturn10search0turn10search1turn19view0  
- **VueUse** como “std lib” de composables utilitários (com uso consciente). citeturn2view1turn1search2turn12view1  
- **Camada de dados**:
  - se o app tem muitas telas com cache/invalidations/refetch: **TanStack Query (Vue Query)** para server state. citeturn9search2turn9search10turn9search6  
  - forms complexos: **VeeValidate** (Composition API-first). citeturn9search11turn9search3  

### Arquitetura recomendada

**Princípio central**: **UI não deve ser o lugar do seu domínio**. UI reage; domínio decide; data layer busca; store coordena estado compartilhado.

- **Componentes**: preferir “base components” (presentational) e componentes de feature; seguir convenções de naming/casing para previsibilidade. citeturn17view1turn17view2  
- **Composables**: encapsular lógica reusável e orquestração de tela; evitar mixins. citeturn2view1turn12view1  
- **Stores (Pinia)**: guardar estado global necessário e ações com nomes intencionais; evitar store como “cache de API” por padrão. citeturn13view0turn9search2  
- **Services/API**: módulos puros de acesso a dados; sem dependência da UI. A prática de bootstrap injetando services/stores no root (como mostrado em guias grandes) melhora testabilidade. citeturn15view0turn18view0  

### Se eu fosse começar hoje…

Se eu fosse começar hoje um projeto Vue 3 com padrão de mercado forte, eu faria assim: **iniciaria com `npm create vue@latest` marcando TypeScript + Router + Pinia + Vitest + ESLint + Prettier + Playwright**, adotaria **Composition API + `<script setup>`** como padrão, colocaria **lazy-loading de rotas desde o começo**, e organizaria o código para que cada feature tenha **componentes + composables + (store opcional) + api/service + types**, mantendo um **núcleo compartilhado** (UI base, utilitários e config) pequeno e bem governado. citeturn19view0turn11view0turn14view0turn13view0  

**10. Estrutura de pastas recomendada**  

A estrutura abaixo é uma proposta “híbrida” que começa próxima do padrão comum (create-vue) e escala para feature/domínio sem virar um framework arquitetural.

```txt
src/
  app/
    main.ts
    App.vue
    router/
      index.ts
      routes.ts
    store/
      index.ts           # createPinia + plugins globais do Pinia
    plugins/
      queryClient.ts     # ex.: TanStack Query (se usado)
      i18n.ts            # se houver
    styles/
      index.css

  shared/
    ui/
      BaseButton.vue
      BaseInput.vue
      BaseModal.vue
    lib/
      http.ts            # fetch/axios wrapper + interceptors + helpers
      env.ts             # leitura/validação de env
      formatters.ts
    types/
      common.ts
    constants/
      routes.ts

  features/
    auth/
      api/
        authApi.ts
      composables/
        useAuthForm.ts
      store/
        auth.store.ts
      components/
        LoginForm.vue
      types/
        auth.ts
      index.ts

    billing/
      api/
      composables/
      store/
      components/
      types/
      index.ts

  pages/
    HomePage.vue
    LoginPage.vue
    BillingPage.vue

  widgets/
    AppHeader.vue
    AppSidebar.vue

  assets/
    images/
    fonts/
```

**Responsabilidade das pastas (resumo)**:

- `app/`: inicialização (router, pinia, plugins), ponto único de montagem e wiring. É o lugar para decisões globais. citeturn19view0turn13view0  
- `shared/`: tudo que é “agnóstico de feature” e reutilizável com governança forte (base components sem estado global, utilitários puros, tipos comuns). A lógica de base components como fundação consistente é alinhada ao style guide. citeturn17view1  
- `features/`: o centro de escala — cada feature encapsula UI específica, composables de regra de tela, estado global local (se necessário) e camada de acesso a dados. Isso reflete o tipo de estrutura por feature recomendada em guias de codebases grandes. citeturn15view0  
- `pages/`: route components (idealmente lazy-loaded) e composição de features/widgets. citeturn11view0turn0search3  
- `widgets/`: componentes de layout/composição que juntam features (barra lateral, topo, etc.).  
- `assets/`: estáticos.

**11. Regras práticas para adotar no dia a dia**  

A lista abaixo é pensada como checklist de review/arquitetura.

1. **`<script setup>` é padrão**; fugir dele só com justificativa clara (ex.: necessidade de named exports específicos ou casos raros). citeturn14view0turn14view1  
2. **Composables para reuso de lógica; componentes para reuso de UI+layout**. Mixins não são a recomendação no Vue 3. citeturn2view1turn12view1  
3. **Pinia só para estado realmente compartilhado**; estado de formulário, hover, toggle local, paginação local etc. ficam no componente/composable. citeturn13view0turn9search11  
4. **Evite store como cache de API** por padrão; se houver complexidade de server state, adote uma solução de query/caching (ex.: TanStack Query). citeturn9search2turn9search6  
5. **Route components são lazy-loaded por padrão**; exceção só quando a rota é crítica e pequena (e isso deve ser medido). citeturn11view0turn0search3  
6. **Props estáveis**: em listas, passe props já resolvidas por item, evitando levar “estado global mutável” para todos os filhos. citeturn11view0  
7. **`v-memo`/`v-once` só com profiling** e com testes/casos que garantam que não vai congelar UI indevidamente. citeturn11view0turn4search18  
8. **Computed não deve criar objetos novos sem necessidade**; se criar, entenda o custo e use técnicas de estabilidade quando fizer sentido (Vue 3.4+). citeturn11view0turn7search3  
9. **Deep watch é exceção**; prefira fontes específicas e getters. citeturn12view0  
10. **Use `shallowRef/shallowReactive/markRaw` apenas quando você entende o trade-off** e quando há evidência de overhead/performance; documente o motivo no código. citeturn20view0turn11view0  
11. **Base components (prefixo Base/App/V) não acessam stores**; eles são “fundação” de UI. citeturn17view1turn13view0  
12. **Teste por interface pública** (DOM, props, events, slots) e não por detalhe interno; evite depender só de snapshots. citeturn18view0turn15view1  
13. **Vitest + @vue/test-utils como default**, E2E com Playwright para fluxos críticos. citeturn18view0turn3search2turn3search9  
14. **Type-check no CI com `vue-tsc`** e mantenha tooling oficial (Vue - Official/Volar) alinhado. citeturn1search8turn1search16  
15. **Estrutura por feature/domínio é o caminho quando o time cresce**; se o app ainda é pequeno, comece simples, mas já defina limites claros para evitar refactor tardio. citeturn15view0turn19view0