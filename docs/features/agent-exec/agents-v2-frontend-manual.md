# Agents V2 — Manual de Integração Frontend

## OBJECTIVES e Expiração por Tempo

---

## 1. Visão geral

### O que são Objectives?

Objectives são **metas nomeadas** que o agente tenta atingir durante uma conversa. Cada objective é exposto ao LLM como uma função de tool (sem argumentos). Quando o LLM decide que a meta foi alcançada, ele chama essa tool — o backend registra a conclusão e inicia o timer de encerramento da sessão.

Exemplo: um agente de SDR pode ter um objective chamado `agendar_demo`. Ao perceber que o lead aceitou marcar uma demonstração, o LLM chama a tool `agendar_demo`; o backend então registra `objectiveCompletedAt` na sessão e começa a contagem regressiva para encerrar a conversa.

### O que é Expiração por Tempo?

É um **timer de inatividade**: após um período sem novas mensagens do contato, a sessão é encerrada automaticamente. O tempo é configurado nos campos `duration` (valor) e `unit` (unidade). O timer é reiniciado — "sliding window" — a cada nova mensagem do contato.

### Como as duas features interagem

| Cenário                                               | Comportamento do timer                                                                    |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Agente **sem** objectives                             | Timer inicia e é reiniciado em **cada mensagem** do contato                               |
| Agente **com** objectives, objective **não** atingido | **Sem timer** — a sessão fica aberta indefinidamente                                      |
| Agente **com** objectives, objective **atingido**     | Timer arma **a partir do momento da conclusão** e é reiniciado em cada mensagem posterior |

Ou seja: objectives e expiração por tempo são complementares — o objective define _quando_ o timer começa, e `duration`/`unit` define _por quanto tempo_ de inatividade a sessão fica aberta depois disso.

---

## 2. Endpoints envolvidos

| Método | Rota                  | Finalidade                                     |
| ------ | --------------------- | ---------------------------------------------- |
| `POST` | `/nest/agents-v2`     | Criar agente                                   |
| `PUT`  | `/nest/agents-v2/:id` | Atualizar agente (parcial)                     |
| `GET`  | `/nest/agents-v2/:id` | Buscar agente com relações (inclui objectives) |

**Header obrigatório em todas as requisições:**

```
Account-Selected: <account-uuid>
Authorization: Bearer <jwt>
```

---

## 3. Expiração por Tempo

### Campos do payload

| Campo      | Tipo             | Validação                                   | Default   | Descrição                               |
| ---------- | ---------------- | ------------------------------------------- | --------- | --------------------------------------- |
| `duration` | `number \| null` | Opcional; inteiro ≥ 1                       | `null`    | Valor da duração. `null` = nunca expira |
| `unit`     | `string`         | Enum: `SECONDS`, `MINUTES`, `HOURS`, `DAYS` | `MINUTES` | Unidade de tempo                        |

### Sugestão de UI

- **Toggle** "Encerrar sessão por inatividade"
    - Desligado → enviar `duration: null` (omitir `unit` também)
    - Ligado → exibir um **input numérico** (min = 1, inteiro) + **select** com as 4 opções abaixo

| Valor do select | Label sugerido |
| --------------- | -------------- |
| `SECONDS`       | Segundos       |
| `MINUTES`       | Minutos        |
| `HOURS`         | Horas          |
| `DAYS`          | Dias           |

### Regras importantes

- `duration: null` (ou campo ausente) → sessão nunca expira por tempo. Só encerra por palavra de saída, erro ou ação manual.
- O timer é **sliding**: cada nova mensagem do contato reinicia a contagem.
- Enviar `duration` sem `unit` → o backend assume `MINUTES` como padrão (Prisma default).
- Enviar `unit` sem `duration` → sem efeito prático (sem valor numérico o timer nunca dispara).

---

## 4. Objectives

### Estrutura no payload

Os objectives vivem dentro de `toolConfigs.OBJECTIVES.objectives`. Para que o backend ative a feature, o campo `enabledTools` também precisa conter a string `"OBJECTIVES"`.

```jsonc
{
  "enabledTools": ["OBJECTIVES"],
  "toolConfigs": {
    "OBJECTIVES": {
      "objectives": [
        {
          "name": "Agendar Demo",
          "key": "agendar_demo",
          "description": "Chame quando o lead confirmar que quer ver uma demonstração do produto",
        },
        {
          "name": "Lead Desqualificado",
          "key": "lead_desqualificado",
          "description": "Chame se o lead deixar claro que não tem interesse no produto",
        },
      ],
    },
  },
}
```

### Regras de cada campo

| Campo         | Tipo     | Validação                                                      | Observação                                                                                                                                                       |
| ------------- | -------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | `string` | Obrigatório, não vazio                                         | Label exibido na UI — texto livre, sem restrição de formato                                                                                                      |
| `key`         | `string` | Obrigatório; apenas letras, números e `_` (`/^[a-zA-Z0-9_]+$/`) | Identificador canônico registrado no LLM como nome da função. Para objectives livres, deve ser único por agente. Para reuso de tool existente, deve ser idêntico ao nome da tool — veja seção abaixo |
| `description` | `string` | Obrigatório, não vazio                                         | Instrução para o LLM sobre quando chamar esta tool. Seja específico                                                                                              |

### Regras de UI

1. Exibir uma lista dinâmica (add / remover linha), cada item com três campos: **Nome** (`name`, label livre), **Chave** (`key`, identificador técnico) e **Descrição** (`description`).
2. Ao adicionar qualquer objective, incluir `"OBJECTIVES"` no array `enabledTools`.
3. Ao remover todos os objectives, remover `"OBJECTIVES"` do array `enabledTools` (veja seção 5 sobre semântica de update).
4. **Nomes reservados** — o `name` não deve colidir com os nomes das tools nativas do sistema. Nomes proibidos em `name`:
    - `save_contact_data`
    - `get_google_calendar_slots`
    - `create_google_calendar_event`
    - `cancel_google_calendar_event`
    - `search_google_calendar_events`

   Colisões em `name` são descartadas silenciosamente pelo runtime — o objective nunca seria chamado. O campo `key` pode livremente coincidir com o nome de qualquer tool (incluindo nativas) — isso é intencional para o modo de reuso descrito abaixo.

### Reutilizar uma tool existente como objective

Em vez de criar um objective sinal-only (sem efeito colateral), é possível **vincular o objective a qualquer tool cadastrada no agente** via o campo `key`. Nesse modo, quando o LLM chama aquela tool e ela executa com sucesso, a tool roda normalmente **e** a sessão é marcada como objective concluído no mesmo ato.

#### Como funciona

O binding é feito pelo campo `key`. No runtime, o backend registra as tools do agente e, ao processar os objectives, faz o match por `key`. Se um objective tem `key` igual ao nome de uma tool já registrada, o LLM só vê a tool original (sem duplicação). Quando essa tool é chamada com sucesso, o match dispara a conclusão do objective.

#### Como configurar

1. Ter a tool desejada cadastrada no agente, com sua categoria em `enabledTools` quando aplicável.
2. Incluir `"OBJECTIVES"` em `enabledTools`.
3. Criar um objective com `key` **idêntico** ao nome da tool. O `name` pode ser qualquer label amigável. A `description` é obrigatória e é enviada ao LLM como parte do bloco de objetivos do system prompt — use-a para reforçar quando o critério de conclusão está atingido.

```jsonc
// PUT /nest/agents-v2/:id
{
  "enabledTools": ["OBJECTIVES", "AUTOMATIONS"],
  "toolConfigs": {
    "OBJECTIVES": {
      "objectives": [
        {
          "name": "Fechar Venda",
          "key": "fechar_venda",
          "description": "Marca conclusão quando a automation de fechamento é disparada",
        },
      ],
    },
  },
}
```

#### Sugestão de UX

Ofereça, ao lado do "Adicionar objective manualmente", uma opção **"Usar tool existente como objective"** que liste as tools cadastradas no agente e, ao selecionar, preencha o `key` automaticamente com o nome exato da tool (bloqueando edição de `key` para evitar divergência) e deixe o `name` livre para o usuário editar.

#### Gotchas

- O `key` precisa ser **exatamente igual** ao nome da tool original — diferença de case ou caractere cria um objective sinal-only separado.
- External queries só contam como "sucesso" se retornarem `status !== false`. Automations e objectives sinal-only retornam sucesso por padrão.

---

## 5. Semântica de atualização (PUT)

O `PUT /nest/agents-v2/:id` é parcial: campos não enviados são ignorados. Mas o comportamento dos **objectives** é diferente dos campos escalares — vale entender antes de implementar.

### Expiração (`duration` / `unit`)

São colunas simples na tabela `Agents`. Podem ser enviados isoladamente sem afetar objectives ou qualquer outra relação.

```jsonc
// Atualizar só a expiração
{ "duration": 2, "unit": "HOURS" }
```

### Objectives — substituição total

Quando o PUT inclui `"OBJECTIVES"` no array `enabledTools`, o backend faz **deleteMany + create** em transação: apaga todos os objectives existentes do agente e cria os novos enviados. Consequência direta:

- Para **alterar** a lista de objectives → enviar o array **completo** com todos os objectives desejados (novos + antigos que devem ser mantidos).
- Para **não alterar** os objectives → simplesmente omitir `toolConfigs.OBJECTIVES` do payload.
- Para **zerar** os objectives → incluir `"OBJECTIVES"` no `enabledTools` e enviar `objectives: []`.

```jsonc
// NÃO altera os objectives existentes (omite toolConfigs.OBJECTIVES)
{ "duration": 30, "unit": "MINUTES" }

// SUBSTITUI a lista de objectives (envia o array completo)
{
  "enabledTools": ["OBJECTIVES"],
  "toolConfigs": {
    "OBJECTIVES": {
      "objectives": [
        { "name": "Novo Objetivo", "key": "novo_objetivo", "description": "Novo critério de conclusão" }
      ]
    }
  }
}

// ZERA todos os objectives
{
  "enabledTools": ["OBJECTIVES"],
  "toolConfigs": {
    "OBJECTIVES": { "objectives": [] }
  }
}
```

> **Importante:** quando zerar os objectives, também remova `"OBJECTIVES"` do `enabledTools` em um PUT subsequente (ou no mesmo PUT se o estado final correto for sem objectives). Do contrário o feature flag fica ligado com lista vazia — o runtime ignora, mas é semanticamente errado.

---

## 6. Exemplos de payload completos

### 6.1 Criar agente com objectives + expiração de 30 minutos

```jsonc
// POST /nest/agents-v2
{
  "name": "Qualificador SDR",
  "model": "claude-sonnet-4-6",
  "providerType": "ANTHROPIC",

  "enabledTools": ["OBJECTIVES", "DATA_MAPPING"],

  "duration": 30,
  "unit": "MINUTES",

  "finalMessage": "Obrigado pelo contato! Em breve nossa equipe entrará em contato.",
  "exitWord": "sair",
  "errorMessage": "Tivemos um problema. Por favor, tente novamente.",

  "toolConfigs": {
    "OBJECTIVES": {
      "objectives": [
        {
          "name": "Agendar Demo",
          "key": "agendar_demo",
          "description": "Chame quando o lead confirmar que quer ver uma demonstração do produto",
        },
        {
          "name": "Lead Desqualificado",
          "key": "lead_desqualificado",
          "description": "Chame se o lead explicitamente recusar ou demonstrar desinteresse total",
        },
      ],
    },
    "DATA_MAPPING": {
      "fields": [
        {
          "name": "email",
          "description": "E-mail do lead",
          "customFieldId": null,
        },
      ],
    },
  },
}
```

### 6.2 Atualizar só a expiração

```jsonc
// PUT /nest/agents-v2/:id
{ "duration": 2, "unit": "HOURS" }
```

### 6.3 Substituir lista de objectives

```jsonc
// PUT /nest/agents-v2/:id
{
  "enabledTools": ["OBJECTIVES", "DATA_MAPPING"],
  "toolConfigs": {
    "OBJECTIVES": {
      "objectives": [
        {
          "name": "Venda Realizada",
          "key": "venda_realizada",
          "description": "Chame quando o cliente confirmar a compra",
        },
      ],
    },
  },
}
```

### 6.4 Remover todos os objectives

```jsonc
// PUT /nest/agents-v2/:id
// Passo 1 — zera os registros no banco
{
  "enabledTools": ["OBJECTIVES"],
  "toolConfigs": {
    "OBJECTIVES": { "objectives": [] }
  }
}

// Passo 2 — ou combine no mesmo PUT removendo "OBJECTIVES" de enabledTools
// e enviando a lista vazia (o deleteMany ainda roda pois OBJECTIVES está no enabledTools)
{
  "enabledTools": [],
  "toolConfigs": {
    "OBJECTIVES": { "objectives": [] }
  }
}
```

### 6.5 Agente sem objectives com expiração de 10 minutos

```jsonc
// POST /nest/agents-v2
{
  "name": "FAQ Bot",
  "model": "gpt-4o",
  "providerType": "OPENAI",
  "enabledTools": [],
  "duration": 10,
  "unit": "MINUTES",
  "finalMessage": "Se tiver mais dúvidas, é só chamar!",
}
```

### 6.6 Agente sem expiração por tempo

```jsonc
// POST ou PUT
{
  "duration": null,
  // "unit" pode ser omitido
}
```

---

## 7. Leitura — resposta do GET

`GET /nest/agents-v2/:id` retorna o agente com todas as relações. Campos relevantes para as duas features:

```jsonc
{
  "id": "...",
  "name": "...",
  "duration": 30,
  "unit": "MINUTES",
  "enabledTools": ["OBJECTIVES"],
  "objectives": [
    { "id": "uuid", "name": "Agendar Demo", "key": "agendar_demo", "description": "..." },
  ],
}
```

### Campos de sessão (para telas de histórico/relatórios)

Se o frontend vier a exibir dados de sessões ou outcomes:

| Campo                  | Onde                   | Descrição                                                                             |
| ---------------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| `objectiveCompletedAt` | `AgentSessions`        | Data/hora em que o objective foi atingido                                             |
| `objectiveName`        | `AgentSessions`        | Nome do objective atingido                                                            |
| `objectiveReached`     | `AgentSessionOutcomes` | `true` se a sessão terminou após atingir um objective                                 |
| `endReason`            | `AgentSessionOutcomes` | Motivo do encerramento: `EXPIRED`, `EXIT_WORD`, `RATING_DONE`, `INTERRUPTED`, `ERROR` |

---

## 8. Checklist de implementação

- [ ] Campos `duration` (number input, min=1) e `unit` (select com `SECONDS/MINUTES/HOURS/DAYS`) adicionados ao formulário
- [ ] Toggle de "encerrar por inatividade" envia `duration: null` quando desligado
- [ ] Lista de objectives com add/remove de linhas; campos `name`, `key` e `description` obrigatórios
- [ ] Campo `key` validado no cliente: apenas letras, números e `_` (`/^[a-zA-Z0-9_]+$/`)
- [ ] Campo `name` validado para não colidir com os nomes reservados de tools nativas
- [ ] Ao adicionar objectives, `"OBJECTIVES"` é incluído em `enabledTools`
- [ ] Ao remover todos os objectives, `"OBJECTIVES"` é removido de `enabledTools`
- [ ] No PUT, enviar o array **completo** de objectives (não apenas o que mudou)
- [ ] No fluxo de reuso de tool existente, `key` é preenchido automaticamente com o nome exato da tool (sem edição manual)
- [ ] No GET, hidratar corretamente `duration`, `unit` e `objectives[]` (incluindo `key`) no estado do formulário
