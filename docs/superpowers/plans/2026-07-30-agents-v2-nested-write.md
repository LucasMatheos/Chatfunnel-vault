# Plano: refatorar o update de Agents V2 para nested write

## Contexto

Ao salvar a edição de um agente pela rota:

```text
PUT /nest/agents-v2/:id
```

o backend começou a retornar o seguinte erro:

```text
Transaction API error: Transaction already closed:
A query cannot be executed on an expired transaction.
The timeout for this transaction was 5000 ms, however aproximadamente
5050 ms passed since the start of the transaction.
```

O erro era lançado na chamada:

```ts
return tx.agents.update({
  where: { id },
  data,
  include: AGENT_FULL_INCLUDE,
});
```

localizada em:

`chatfunnel-core/src/repositories/agents_v2.repository.ts`

### Fluxo que produz o erro

A execução começa no controller do Services:

```text
PUT /nest/agents-v2/:id
    ↓
AgentsV2Controller.update()
    ↓
AgentsV2Service.update()
    ↓
AgentsV2Repository.updateWithRelations()
    ↓
prisma.$transaction(callback)
    ↓
tx.agents.update()
```

Arquivos envolvidos:

- `chatfunnel-services/src/modules/agents-v2/agents-v2.controller.ts`;
- `chatfunnel-services/src/modules/agents-v2/agents-v2.service.ts`;
- `chatfunnel-services/src/database/repositories/agents_v2.repository.ts`;
- `chatfunnel-core/src/repositories/agents_v2.repository.ts`.

O repository declarado no Services apenas estende o repository do Core. Em
runtime, `@chatfunnel/core/repositories` é resolvido a partir de:

```text
chatfunnel-core/dist/repositories/index.js
```

Isso significa que alterações feitas somente em `chatfunnel-core/src` não entram
em execução até que o artefato `dist` seja atualizado e o processo do Services
seja reiniciado.

### Implementação atual

O método `AgentsV2Repository.updateWithRelations()` atualmente abre uma
interactive transaction do Prisma e executa sequencialmente:

1. Uma consulta para validar a existência do agente.
2. Até nove operações `deleteMany` para remover relações existentes.
3. Um `agents.update()` com nested creates.
4. O carregamento de todas as relações por meio de `AGENT_FULL_INCLUDE`.

Essa abordagem pode ultrapassar o timeout padrão de cinco segundos das
interactive transactions. Aumentar o timeout reduz a ocorrência imediata do
erro, mas não resolve o custo dos vários round trips, a duração dos locks ou a
necessidade de aumentar novamente o limite conforme o volume de dados crescer.

### Correção temporária aplicada

Como mitigação imediata, o timeout da interactive transaction foi alterado de
cinco para trinta segundos:

```ts
return this.prisma.$transaction(
  async (tx) => {
    // operações
  },
  { timeout: 30_000 },
);
```

Essa mudança resolveu o erro observado, mas deve ser considerada temporária. Ela
somente aumenta o tempo permitido para o mesmo conjunto de operações
sequenciais. Se o volume de relações, cascades, contenção de locks ou latência do
banco aumentar, o timeout pode voltar a ocorrer.

### Causa arquitetural

O problema não está especificamente no último `tx.agents.update()`. Quando essa
consulta é executada, a transaction já consumiu praticamente todo o limite nas
consultas anteriores.

O método utiliza uma interactive transaction para coordenar operações que o
Prisma consegue representar como uma única nested write. Isso mantém a conexão
e a transaction abertas durante vários comandos sequenciais, aumentando sua
duração total e tornando o fluxo dependente de um timeout configurável.

Além do timeout, a implementação atual mistura duas responsabilidades:

- o helper do Services monta os nested creates;
- o repository do Core interpreta `enabledTools` e decide quais relações apagar.

Essa divisão dificulta distinguir corretamente entre uma relação omitida, uma
relação enviada vazia e uma ferramenta explicitamente desabilitada.

### Direção da solução definitiva

O objetivo desta refatoração é substituir a interactive transaction por uma
única nested write do Prisma. Nested writes já são atômicas: se qualquer parte
da operação falhar, todas as alterações são revertidas.

## Objetivos

- Remover a dependência de timeout da interactive transaction.
- Executar a atualização do agente e de suas relações em uma única nested write.
- Preservar relações que não foram enviadas em updates parciais.
- Substituir relações enviadas explicitamente.
- Limpar relações quando arrays vazios forem enviados.
- Remover configurações quando uma ferramenta for explicitamente desabilitada.
- Garantir multi-tenancy na própria operação de escrita.
- Manter o retorno completo por meio de `AGENT_FULL_INCLUDE`.

## Problemas do comportamento atual

### Vários comandos sequenciais

Cada `await tx.<relation>.deleteMany()` adiciona uma consulta ao fluxo da
interactive transaction. Todos os comandos utilizam a mesma conexão e são
executados sequencialmente.

### Uso de `enabledTools` como indicador de substituição

O service atualmente calcula:

```ts
const enabledTools = dto.enabledTools ?? existing.enabledTools ?? [];
```

O repository usa essa lista para decidir quais relações apagar. Portanto, um
update que não enviou `enabledTools` pode utilizar a lista já persistida e
remover relações de ferramentas habilitadas, mesmo quando seus `toolConfigs`
não foram enviados.

### Arrays vazios não limpam todas as relações

Condições como:

```ts
referenceFiles && referenceFiles.length > 0
```

impedem que `referenceFiles: []` produza uma operação nested. Dessa forma, não é
possível diferenciar "campo omitido" de "limpar todos os arquivos".

### Multi-tenancy fora da escrita final

O service valida o agente usando `accountId`, mas a escrita final utiliza apenas
o `id`. A operação que altera o registro também deve aplicar o filtro do tenant.

## Semântica esperada

Antes da implementação, o comportamento dos updates parciais deve seguir estas
regras:

| Payload | Comportamento |
|---|---|
| Propriedade `undefined` | Preservar a relação atual |
| Configuração presente | Substituir a relação atual |
| Array presente e vazio | Limpar a relação atual |
| `enabledTools` enviado sem uma ferramenta | Limpar a configuração da ferramenta |
| `enabledTools` não enviado | Não utilizá-lo para apagar relações |

A presença de uma configuração em `toolConfigs` deve ter prioridade sobre a
regra de ferramenta desabilitada.

## Etapa 1: refatorar `buildAgentUpdateInput()`

### Por quê

O helper recebe o DTO original e consegue identificar quais propriedades foram
enviadas. Ele é o local correto para decidir se uma relação deve ser preservada,
substituída ou removida.

O repository deve apenas persistir o `Prisma.AgentsUpdateInput` recebido.

### Como fazer

Alterar:

`chatfunnel-services/src/modules/agents-v2/helpers/payload-to-prisma.ts`

Para relações 1:N, combinar `deleteMany` e `create` no próprio nested input:

```ts
fields: {
  deleteMany: {},
  create: newFields,
}
```

Aplicar o padrão para:

- `fields`;
- `externalQueries`;
- `mcpConnections`;
- `automations`;
- `serviceDays`;
- `objectives`;
- `referenceFiles`;
- `imageGroups`.

Exemplo para `DATA_MAPPING`:

```ts
...(toolConfigs?.DATA_MAPPING !== undefined && {
  fields: {
    deleteMany: {},
    create: toolConfigs.DATA_MAPPING.fields.map((field) => ({
      name: field.name,
      description: field.description,
      ...(field.customFieldId && {
        customField: {
          connect: { id: field.customFieldId },
        },
      }),
    })),
  },
}),
```

## Etapa 2: tratar ferramentas desabilitadas

### Por quê

Quando `enabledTools` é enviado, a ausência de uma ferramenta na nova lista
significa que sua configuração persistida deve ser removida.

Quando `enabledTools` não é enviado, nenhuma relação deve ser removida apenas
com base no estado anterior do agente.

### Como fazer

Criar um helper local:

```ts
const isToolDisabled = (tool: string) =>
  enabledTools !== undefined && !enabledTools.includes(tool);
```

Exemplo:

```ts
...(toolConfigs?.DATA_MAPPING
  ? {
      fields: {
        deleteMany: {},
        create: buildFields(toolConfigs.DATA_MAPPING),
      },
    }
  : isToolDisabled("DATA_MAPPING")
    ? {
        fields: {
          deleteMany: {},
        },
      }
    : {}),
```

Aplicar a mesma regra para todas as ferramentas que possuem relações
persistidas.

## Etapa 3: corrigir arrays vazios

### Por quê

Um array vazio deve representar uma intenção explícita de limpar a relação. Uma
propriedade omitida deve preservar o estado atual.

### Como fazer

Trocar verificações baseadas em tamanho por verificações de presença:

```ts
...(referenceFiles !== undefined && {
  referenceFiles: {
    deleteMany: {},
    create: referenceFiles.map((mediaId) => ({
      media: {
        connect: { id: mediaId },
      },
    })),
  },
}),
```

Aplicar esse comportamento a todas as coleções recebidas pelo DTO.

## Etapa 4: tratar `calendars` como relação 1:1

### Por quê

No schema Prisma, `calendars` é uma relação opcional 1:1:

```prisma
calendars AgentCalendars?
```

Ela não utiliza o mesmo input `deleteMany + create` das relações 1:N. Além
disso, apagar e recriar o calendário desnecessariamente remove reminders por
cascade e aumenta o trabalho no banco.

### Como fazer

Quando `toolConfigs.CALENDAR` estiver presente, usar `upsert`:

```ts
calendars: {
  upsert: {
    create: buildCalendarCreate(calendarConfig),
    update: {
      ...buildCalendarFields(calendarConfig),
      reminders: {
        deleteMany: {},
        create: buildCalendarReminders(calendarConfig.reminders),
      },
    },
  },
}
```

No update:

- atualizar os campos escalares do calendário;
- conectar o Kanban quando `kanbanId` estiver presente;
- desconectar o Kanban quando `kanbanId` for removido;
- substituir os reminders usando `deleteMany + create`;
- preservar o ID do calendário existente.

Quando `enabledTools` for explicitamente enviado sem `CALENDAR`:

```ts
calendars: {
  delete: true,
}
```

Quando nem `toolConfigs.CALENDAR` nem `enabledTools` forem enviados, omitir
`calendars` do update.

## Etapa 5: simplificar o repository

### Por quê

O `prisma.agents.update()` com nested writes já garante atomicidade. Não é
necessário abrir uma interactive transaction para executar deletes antes do
update.

Remover a callback elimina:

- o timeout da interactive transaction;
- os deletes explícitos e sequenciais;
- round trips adicionais;
- locks mantidos entre diferentes chamadas;
- o parâmetro `enabledTools` no repository.

### Como fazer

Alterar:

`chatfunnel-core/src/repositories/agents_v2.repository.ts`

Nova assinatura:

```ts
async updateWithRelations(
  id: string,
  accountId: string,
  data: Prisma.AgentsUpdateInput,
): Promise<AgentWithRelations>
```

Nova implementação:

```ts
async updateWithRelations(
  id: string,
  accountId: string,
  data: Prisma.AgentsUpdateInput,
): Promise<AgentWithRelations> {
  return this.prisma.agents.update({
    where: {
      id,
      accountId,
      isDeleted: false,
    },
    data,
    include: AGENT_FULL_INCLUDE,
  }) as unknown as AgentWithRelations;
}
```

O timeout explícito de 30 segundos deve ser removido junto com a interactive
transaction.

## Etapa 6: atualizar o service

### Por quê

O repository precisa receber `accountId` para garantir isolamento por tenant na
operação que efetivamente altera o agente.

### Como fazer

Alterar:

`chatfunnel-services/src/modules/agents-v2/agents-v2.service.ts`

De:

```ts
const agent = await this.agentsV2Repository.updateWithRelations(
  id,
  data,
  enabledTools,
);
```

Para:

```ts
const agent = await this.agentsV2Repository.updateWithRelations(
  id,
  accountId,
  data,
);
```

A chamada anterior a `findOne(id, accountId)` pode continuar porque também é
usada para:

- determinar o `creationMode`;
- calcular provider e model efetivos;
- definir `promptStatus`;
- produzir a resposta de domínio apropriada quando o agente não existe.

## Etapa 7: adicionar testes unitários

### Por quê

O principal risco da refatoração é apagar relações em updates parciais ou deixar
de limpar relações quando o payload expressar essa intenção.

Os testes do helper podem validar o objeto Prisma gerado sem acessar banco real.

### Casos obrigatórios

1. Update somente de `name` não inclui nenhuma relação.
2. Configuração de `DATA_MAPPING` gera `deleteMany + create`.
3. `DATA_MAPPING.fields: []` limpa todos os campos.
4. `enabledTools` enviado sem `DATA_MAPPING` gera somente `deleteMany`.
5. `enabledTools` ausente preserva ferramentas não enviadas.
6. `referenceFiles: []` limpa todos os arquivos.
7. `imageGroups: []` limpa todos os grupos.
8. Calendário configurado gera `upsert`.
9. Update do calendário substitui reminders.
10. Remoção de `kanbanId` gera `disconnect`.
11. Desabilitar calendário gera `delete: true`.
12. O repository inclui `id`, `accountId` e `isDeleted: false`.
13. O repository executa somente um `agents.update()`.
14. O repository não chama `$transaction()`.
15. O retorno mantém `AGENT_FULL_INCLUDE`.

## Etapa 8: validar a mudança

### Validação automatizada

- Executar os testes unitários específicos do helper.
- Executar os testes do service e repository relacionados a Agents V2.
- Verificar formatação dos arquivos alterados.
- Não conectar a um banco real durante a validação.

### Validação manual

O usuário deve executar o build manualmente conforme as regras do workspace.
Depois do build:

1. Reiniciar `chatfunnel-services`.
2. Atualizar somente um campo básico, como `name`.
3. Confirmar que relações omitidas foram preservadas.
4. Atualizar cada configuração de ferramenta.
5. Enviar arrays vazios e confirmar a limpeza.
6. Desabilitar uma ferramenta e confirmar a remoção da configuração.
7. Atualizar o calendário e confirmar a substituição dos reminders.
8. Confirmar que outro `accountId` não consegue alterar o agente.

## Riscos e mitigação

### Apagar relações omitidas

**Risco:** interpretar uma propriedade ausente como lista vazia.

**Mitigação:** usar verificações explícitas com `!== undefined`.

### Conflito entre configuração e ferramenta desabilitada

**Risco:** o payload conter simultaneamente um `toolConfig` e uma lista de
`enabledTools` que não inclui a ferramenta.

**Mitigação:** definir a precedência e, preferencialmente, rejeitar payloads
inconsistentes na validação do DTO. Enquanto isso, a presença do `toolConfig`
deve ter prioridade para evitar perda silenciosa de dados.

### Calendário inexistente

**Risco:** tentar executar `update` em uma relação 1:1 ainda não criada.

**Mitigação:** utilizar `upsert`.

### Artefato compilado antigo

**Risco:** `chatfunnel-services` resolve `@chatfunnel/core/repositories` a partir
de `chatfunnel-core/dist`, mantendo a implementação antiga em runtime.

**Mitigação:** depois da implementação, o usuário deve gerar novamente o `dist`
do Core e reiniciar o Services.

## Critérios de aceite

- `updateWithRelations()` não utiliza `$transaction(callback)`.
- Não existe timeout específico para o update de Agents V2.
- A atualização completa ocorre por uma única chamada `agents.update()`.
- Updates parciais preservam relações omitidas.
- Arrays vazios limpam relações explicitamente.
- Ferramentas desabilitadas removem suas configurações.
- Calendário utiliza `upsert` e preserva seu ID quando atualizado.
- A escrita final aplica `accountId` e `isDeleted: false`.
- Todos os testes unitários definidos neste plano passam.
- O retorno da API continua contendo todas as relações esperadas.
