# Backlog técnico — criação e edição de agentes

Origem: reunião de 09/07/2026. Itens abaixo refletem o que foi alinhado; os pontos ainda incertos estão explícitos como decisão pendente.

## Status (atualizado 10/07/2026)

**Frontend — feito:** configuração de etapas por modo isolada em
`chatfunnel-front/src/views/agents/AgentsForm/steps.config.ts` (fonte única:
registry de etapas + ordem por modo). O `AgentsForm/index.vue` deriva
sidebar/navegação/validação/visibilidade dessa config (sem números fixos de
etapa). Wizard avançado com as 5 etapas (§4), ocultação de instruções/raciocínio/
formato/papel no avançado, remoção dos dois controles inferiores (§4/§5) e
`role` escondido no avançado (Opção A) — concluídos.

**Frontend — pendente:** validação de "Prompt direto" obrigatório no avançado
(§4); reconstrução automática na edição do básico sem modal (§5, depende do
contrato do back); testes/E2E (§7).

**Alerta:** o payload de criação ainda envia `creationMode`, mas o back tem
`forbidNonWhitelisted: true` e ainda não tem o campo (§1) → **criação retorna
400** até o back entregar a coluna/DTO.

## 1. Persistir o modo de criação do agente

**Backend**

- [ ] Adicionar ao modelo de agente um enum de modo, por exemplo `creationMode`:
  - `BASIC` (ou `BEGINNER`): agente configurado pelo construtor guiado;
  - `ADVANCED`: agente configurado por prompt direto.
- [ ] Criar e executar a migration para a nova coluna, definindo um valor padrão compatível para agentes existentes (provavelmente `BASIC`).
- [ ] Atualizar DTOs/schemas de criação, leitura e atualização para aceitar e devolver `creationMode`.
- [ ] Validar no backend quais campos são permitidos por modo; o modo avançado não deve depender dos campos exclusivos do construtor guiado.
- [ ] Garantir retrocompatibilidade para agentes existentes sem o novo campo durante o rollout.

**Critérios de aceite**

- Um agente criado em qualquer modo persiste e retorna seu `creationMode`.
- Agentes legados continuam abrindo e editando sem erro.
- Requisições com modo inválido retornam erro de validação.

## 2. Seleção de modo no início da criação

**Frontend**

- [ ] Alterar a ação “Criar agente” para apresentar a escolha de fluxo antes de iniciar o wizard.
- [ ] Implementar as opções:
  - **Básico/Iniciante:** usuário preenche campos e o sistema monta o prompt;
  - **Avançado:** usuário informa o prompt diretamente.
- [ ] Adicionar texto de apoio para deixar explícita a diferença entre os dois modos.
- [ ] Definir e aplicar a nomenclatura final na UI (sugestão da reunião: “Básico” e “Avançado”; não usar “Easy”).
- [ ] Ao selecionar o modo, iniciar o wizard já com `creationMode` definido no estado do formulário.

**Critérios de aceite**

- Nenhum agente novo inicia sem que o modo seja definido.
- A escolha leva ao wizard correto e é enviada no payload de criação.
- Voltar/cancelar não deixa um agente parcial criado.

## 3. Wizard do modo básico

- [x] Manter o fluxo atual de preenchimento guiado e geração de prompt para agentes `BASIC`.
- [x] Isolar as etapas/campos específicos do construtor de prompt por feature flag/condição de modo, para que não sejam renderizados no fluxo avançado. _(via `steps.config.ts` / `MODE_STEPS`)_
- [x] Garantir que o gerador de prompt continue recebendo o payload atual do modo básico.

**Critérios de aceite**

- O comportamento do fluxo básico não muda para o usuário final, exceto onde especificado na tarefa de edição automática.
- Nenhum campo exclusivo do básico aparece no modo avançado.

## 4. Wizard do modo avançado

**Frontend**

- [x] Criar a variação de wizard para `ADVANCED` contendo apenas as etapas aplicáveis:
  1. Identidade;
  2. Prompt direto;
  3. Ferramentas;
  4. Grupo de imagens;
  5. Encerramento de sessão.
- [~] Implementar a etapa **Prompt direto** com editor/textarea, validação de obrigatório e preservação do conteúdo ao navegar entre etapas. _(reusa `InstructionsStep` com textarea + preservação; **falta** tornar `systemPrompt` obrigatório no avançado)_
- [x] Ocultar/remover do modo avançado:
  - instruções principais do construtor;
  - etapa de raciocínio;
  - formato de saída;
  - identidade de papel, caso seja de fato um campo exclusivo do construtor guiado.
- [x] Remover do modo avançado os dois controles inferiores citados na reunião (identificar os componentes atuais e eliminar apenas nesse fluxo).

**Backend**

- [ ] Salvar o prompt informado pelo usuário como prompt final do agente avançado, sem chamar o gerador/construtor de prompt.
- [ ] Validar que a criação avançada contém um prompt não vazio.
- [ ] Manter persistência e execução das configurações compartilhadas (ferramentas, grupo de imagens e encerramento de sessão).

**Critérios de aceite**

- Criar um agente avançado não faz chamada ao serviço de geração de prompt.
- O texto salvo no editor é o prompt efetivamente usado pelo agente.
- A navegação mostra somente as cinco etapas definidas.

## 5. Reconstrução automática após editar um agente básico

**Frontend**

- [ ] Alterar a ação “Concluir edição” de agente básico para disparar a atualização sem abrir a revisão manual do prompt.
- [ ] Remover o modal/etapa de streaming e confirmação manual do prompt desse caminho.
- [ ] Mostrar feedback não bloqueante durante a operação, por exemplo “Atualizando agente” ou “Reconstruindo prompt”.
- [ ] Após sucesso, atualizar o estado local/listagem/detalhe com a versão final do agente.
- [x] Remover as duas caixas/botões inferiores que pertenciam ao fluxo de confirmação manual.

**Backend**

- [ ] No endpoint de edição de agente básico, enfileirar ou executar a reconstrução do prompt ao finalizar a atualização.
- [ ] Garantir que o usuário não precise enviar uma confirmação posterior para aplicar o prompt reconstruído.
- [ ] Definir o contrato de execução assíncrona:
  - resposta imediata com status de processamento, ou
  - espera pela conclusão e resposta com agente atualizado.
- [ ] Expor status/erro de reconstrução caso a UI precise acompanhar a tarefa em background.
- [ ] Não executar reconstrução de prompt para edição de agentes `ADVANCED`, salvo se uma regra de produto posterior determinar o contrário.

**Critérios de aceite**

- Editar e concluir um agente básico reconstrói seu prompt automaticamente.
- O usuário não vê modal de streaming nem precisa aprovar o prompt.
- Falhas de reconstrução são registradas e retornam uma mensagem recuperável na UI.
- Editar um agente avançado preserva seu prompt direto e não o sobrescreve com o gerador.

## 6. Investigar integração de grupo de imagens

- [ ] Mapear onde `imageGroup`/grupo de imagens é usado na montagem final do agente.
- [ ] Confirmar se essa informação:
  - integra a string do prompt;
  - é anexada ao prompt após a geração; ou
  - é enviada como configuração independente na execução.
- [ ] Documentar o resultado e ajustar o payload do modo avançado, se necessário.
- [ ] Criar teste cobrindo agente avançado com grupo de imagens configurado.

**Critério de aceite**

- A implementação não perde nem duplica as configurações de grupo de imagens em nenhum dos dois modos.

## 7. Testes e observabilidade

- [ ] Testes unitários para validação de `creationMode` e regras de campos por modo.
- [ ] Testes de integração para criação de agentes básico e avançado.
- [ ] Teste de integração para edição de agente básico com reconstrução automática.
- [ ] Teste de regressão: edição de agente avançado não aciona o gerador de prompt.
- [ ] Testes E2E para seleção de modo, criação avançada e finalização de edição básica.
- [ ] Adicionar logs/telemetria para falha na reconstrução automática, contendo ID do agente e modo de criação (sem registrar conteúdo sensível do prompt).

## Decisões ainda necessárias

- [ ] Confirmar a nomenclatura oficial: `BASIC`/`ADVANCED` ou `BEGINNER`/`ADVANCED`.
- [x] Confirmar se “identidade de papel” permanece como parte de “Identidade” no modo avançado ou se deve ser removida integralmente. _(decidido: `role` escondido no avançado — Opção A, prop `advanced` no `IdentityStep`)_
- [ ] Definir se a reconstrução em background será acompanhada por polling, websocket/evento ou conclusão síncrona.
- [x] Identificar exatamente quais são os “dois botões/caixas inferiores” para evitar remoção indevida de controles compartilhados. _(resolvido e removidos)_
