# Intelligence V2 Fase 2 - Smoke Test

**Data:** 2026-05-29
**Branch:** `feature/intelligence-content-blocks`
**Escopo:** validar renderizacao por `ResourceKind` apos Fase 2 (registry + ResourceRenderer)

## Como usar

1. `npm run dev` no `chatfunnel-front` (porta 5173).
2. Abrir Intelligence V2 e iniciar nova conversa.
3. Para cada cenario abaixo, executar o prompt sugerido.
4. Colar o que apareceu na tela no campo "Resultado".
5. Marcar `[x]` em PASS ou FAIL.

Notacao do esperado:

- **Chip**: chip da tool com icone de status (running -> done).
- **Componente**: card visual abaixo do chip.
- **Fallback**: o componente generico (JSON) ou de erro.

---

## 1. Listar automacoes (`kind: automation`)

- **Prompt sugerido:** "Liste minhas automacoes"
- **Tool esperada:** `list_automations`
- **Componente esperado:** `AutomationList.vue` (lista de cards com nome, status, trigger, flow pills)

### Resultado

```
(cole aqui o que apareceu)
```

- [x] PASS
- [ ] FAIL

### Observacoes

---

## 2. Listar templates (`kind: template`)

- **Prompt sugerido:** "Liste meus templates de whatsapp"
- **Tool esperada:** `list_templates`
- **Componente esperado:** `TemplateList.vue` (lista compacta com nome, categoria, status)

### Resultado

```
```

- [ ] PASS
- [ ] FAIL

---

## 3. Listar contatos (`kind: contact` em modo lista)

- **Prompt sugerido:** "Procure contatos com nome Joao"
- **Tool esperada:** `search_contacts`
- **Componente esperado:** `ContactResult.vue` em modo lista (avatares + nome + telefone + tags)

### Resultado

```
Não apareceu o componente de contacts, acho que utilizou algum generico
```

- [ ] PASS
- [x] FAIL

---

## 4. Buscar contato unico (`kind: contact` em modo single)

- **Prompt sugerido:** "Me mostre o contato com id <UUID>"
- **Tool esperada:** `get_contact`
- **Componente esperado:** `ContactResult.vue` em modo single (avatar grande + nome + telefone + email + tags)

### Resultado

```
Validação de contrato falhou
Invalid input: expected array, received undefined
{
  "id": "7f395267-feaf-47d5-9f7b-e164afd6f15a",
  "name": "Lucas Matheos",
  "tags": [],
  "email": null,
  "phone": null,
  "photo": "https://scontent-yyz1-1.cdninstagram.com/v/t51.2885-19/308037985_157731990271086_9091811726604338147_n.jpg?stp=dst-jpg_s206x206_tt6&_nc_cat=111&ccb=7-5&_nc_sid=bf7eb4&efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLnd3dy44MTguQzMifQ%3D%3D&_nc_ohc=GkOMfNGLEpUQ7kNvwGF3XG5&_nc_oc=AdqH7cEjtknA_9a9DSXGHLS4JH_Q7-1lxF7shZ6WZuQQWZb5nifOnLUy0qNzT3ROjX8&_nc_zt=24&_nc_ht=scontent-yyz1-1.cdninstagram.com&edm=ALmAK4EEAAAA&oh=00_Af0ohBCaLoV2UYERQKDM_PphBsH2BY-67_Qyc3WwYsUKaA&oe=69EC4775",
  "folder": null,
  "rating": 0,
  "isActive": true,
  "quantity": 2,
  "dateCreated": "2026-04-20T19:49:56.831Z"
}
```

- [ ] PASS
- [x] FAIL

---

## 5. Listar cards do kanban (`kind: kanban_card`)

- **Prompt sugerido:** "Liste os cards do meu kanban"
- **Tool esperada:** `list_kanban_cards`
- **Componente esperado:** `KanbanCardList.vue` (indicador de prioridade colorido + nome do contato + coluna + status)

### Resultado

```
```

- [ ] PASS
- [ ] FAIL

---

## 6. Listar canais (`kind: channel`)

- **Prompt sugerido:** "Quais canais estao conectados?"
- **Tool esperada:** `get_channels`
- **Componente esperado:** `ChannelList.vue` (icone da plataforma + nome + numero + badge WhatsApp/Instagram)

### Resultado

```
```

- [x] PASS
- [ ] FAIL

---

## 7. Listar tags (`kind: tag`)

- **Prompt sugerido:** "Liste minhas tags"
- **Tool esperada:** `get_tags`
- **Componente esperado:** `DiscoveryChips.vue` (chips compactos com icone de tag)

### Resultado

```
Resultado fora do contrato (tool=get_tags)
Invalid input: expected object, received array
1 resultado
[
  {
    "id": "7d2b33d2-03a5-4f5a-941d-7b14010f4597",
    "name": "teste",
    "accountId": "7311bd8b-839c-4844-8be0-fc1d697edfb5",
    "folderId": null
  }
]
```

- [ ] PASS
- [x] FAIL

---

## 8. Criar tag (`kind: tag`, single envelope)

- **Prompt sugerido:** "Crie uma tag chamada teste"
- **Tool esperada:** `create_tag`
- **Componente esperado:** `DiscoveryChips.vue` com 1 chip "teste"

### Resultado (ja capturado em 2026-05-29)

```
Pronto! Tag "teste" criada com sucesso. Quer criar mais tags ou
organizar essa em uma pasta?

Tag criada
Resultado fora do contrato (tool=create_tag)
Invalid input: expected object, received array
1 resultado
[
  {
    "id": "7d2b33d2-03a5-4f5a-941d-7b14010f4597",
    "name": "teste",
    "accountId": "7311bd8b-839c-4844-8be0-fc1d697edfb5",
    "folderId": null
  }
]
```

- [ ] PASS
- [x] FAIL

### Diagnostico

Causa-raiz: o `DiscoveryChips.vue` ainda chama o validator v1
(`validateToolData('create_tag', data)`), que foi escrito esperando o shape
do `tool_result` v1: um objeto `{ tag: {...} }`. No v2, o registry monta
`data` como array (`[{...}]`) porque vem de envelopes. O validator falha
com "expected object, received array", e o componente cai no
`ToolResultFallback`.

Sintomas que vao se repetir nas outras kinds que passam por DiscoveryChips
(tag_folder, custom_field, moderator, assistant, agent_v2, kanban_board) —
qualquer tool que emita 1 ou N envelopes vai ver o mesmo card de erro
enquanto o validator v1 estiver ativo nesse componente.

Fix proposto (esperar confirmacao do usuario antes de aplicar):
remover a chamada `validateToolData` do `DiscoveryChips.vue` e usar
`props.data` diretamente no computed `items`. O `schemaVersion` do
envelope substitui essa validacao em escopo v2; servidor ja garantiu o
shape via Zod antes de emitir.

Alternativa mais conservadora: passar um flag `skipValidation` pelo
registry quando o componente esta sendo usado em fluxo v2.

---

## 9. Listar custom fields (`kind: custom_field`)

- **Prompt sugerido:** "Quais campos personalizados eu tenho?"
- **Tool esperada:** `get_custom_fields`
- **Componente esperado:** `DiscoveryChips.vue` com icone de Textbox

### Resultado

```
Resultado fora do contrato (tool=get_custom_fields)
Invalid input: expected object, received array
13 resultados
[
  {
    "id": "00000000-0000-0000-0000-000000000001",
    "name": "E-mail",
    "accountId": null,
    "folderId": null,
    "folder": null,
    "automations": []
  },
  {
    "id": "00000000-0000-0000-0000-000000000002",
    "name": "Telefone",
    "accountId": null,
    "folderId": null,
    "folder": null,
    "automations": []
  },
  {
```

- [ ] PASS
- [x] FAIL

### Observacoes
Provavelmente vai apresentar o mesmo erro do cenario 8 (validator v1).

---

## 10. Listar pastas de tags (`kind: tag_folder`)

- **Prompt sugerido:** "Liste minhas pastas de tags"
- **Tool esperada:** `list_tag_folders`
- **Componente esperado:** `DiscoveryChips.vue` com icone de pasta

### Resultado

```
Resultado fora do contrato (tool=create_tag_folder)
Invalid input: expected object, received array
1 resultado
[
  {
    "id": "98ea5319-7f4c-4800-bba2-196d660229c0",
    "name": "teste",
    "accountId": "7311bd8b-839c-4844-8be0-fc1d697edfb5"
  }
]
Você tem 1 pasta de tags: a pasta "teste" que acabamos de criar (vazia no momento). Quer adicionar tags a ela?

Pastas de tags
Resultado fora do contrato (tool=list_tag_folders)
Invalid input: expected object, received array
1 resultado
[
  {
    "id": "98ea5319-7f4c-4800-bba2-196d660229c0",
    "name": "teste",
    "accountId": "7311bd8b-839c-4844-8be0-fc1d697edfb5",
    "_count": {
      "tags": 0
    }
  }
]
```

- [ ] PASS
- [x] FAIL

---

## 11. Listar moderadores (`kind: moderator`)

- **Prompt sugerido:** "Quem sao os moderadores da conta?"
- **Tool esperada:** `get_moderators`
- **Componente esperado:** `DiscoveryChips.vue` com icone de usuario

### Resultado

```
```

- [ ] PASS
- [ ] FAIL

---

## 12. Listar agentes v2 (`kind: agent_v2`)

- **Prompt sugerido:** "Quais agentes IA eu tenho configurados?"
- **Tool esperada:** `get_agents_v2`
- **Componente esperado:** `DiscoveryChips.vue` com icone de robo

### Resultado

```
Resultado fora do contrato (tool=get_agents_v2)
Invalid input: expected object, received array
4 resultados
[
  {
    "id": "7b24e3d8-5065-4187-864e-538987e147a3",
    "name": "Tedte",
    "model": "claude-haiku-4-5-20251001",
    "providerType": "ANTHROPIC",
    "createdAt": "2026-04-22T22:50:45.862Z"
  },
  {
    "id": "60e07fc8-30c6-41c2-9979-1aa95a912594",
    "name": "Teste",
    "model": "claude-sonnet-4-20250514",
    "providerType": "ANTHROPIC",
    "createdAt": "2026-03-18T19:02:57.201Z"
  },
  {
    "id": "1baf57aa-a336-4101-b18e-3fbe27ad847f",
    "name": "ngfh",
```

- [ ] PASS
- [x] FAIL

---

## 13. Listar kanbans/pipelines (`kind: kanban_board`)

- **Prompt sugerido:** "Quais pipelines de kanban eu tenho?"
- **Tool esperada:** `get_kanbans`
- **Componente esperado:** `DiscoveryChips.vue` com formato "Nome (X col.)"

### Resultado

```
```

- [ ] PASS
- [ ] FAIL

---

## 14. Tools sem renderer especifico (fallback)

Tools que esperamos cair no `GenericJsonResult.vue` (JSON formatado):

- `build_automation` / `add_step_*` (`kind: automation_draft`)
- `get_template_status` (`kind: template_status`)
- `get_template_buttons` (`kind: template_buttons`)
- `sync_templates` (`kind: template_status`)

### Resultado de um deles

```
```

- [ ] PASS (JSON aparece formatado)
- [ ] FAIL

---

## 15. Reload da conversa

Depois de executar pelo menos 3 dos cenarios acima:

1. Recarregar a pagina (F5)
2. A conversa deve restaurar com os mesmos cards visiveis
3. Nenhuma chamada MCP nova deve ser feita (envelopes vem do historico)

### Resultado

- [x] PASS — cards reaparecem identicos sem nova chamada
- [ ] FAIL

### Observacoes

---

## 16. Streaming - chip aparece antes do componente

Durante o stream de uma tool (cenarios 1-13), confirmar que:

1. Chip aparece com status `running` (icone girando)
2. Componente aparece depois do `resource` event chegar
3. Chip vira `done` quando `tool_status` chega

- [x] PASS — sequencia visivel
- [ ] FAIL — chip nao muda de status / componente nao aparece

---

## Sign-off

- **Total de cenarios:** 16
- **PASS:**
- **FAIL:**
- **Conclusao Fase 2:** [ ] aprovada [ ] precisa de fixes antes de fechar

## Decisoes pendentes apos teste

- [ ] Aplicar fix do validator v1 no `DiscoveryChips.vue`?
- [ ] Algum outro componente apresentou o mesmo padrao de erro do `create_tag`?
- [ ] Remover `tool-result.registry.ts` (v1) — confirmar via Grep que nao ha consumidores.
