# Bug: chaves de campo inválidas no schema da tool `save_contact_data`

**Status:** diagnosticado, aguardando implementação
**Área:** Agents V2 · Data Mapping · `chatfunnel-api`
**Providers afetados:** Anthropic (erro visível) e OpenAI (frágil, ainda não estoura)

---

## 1. Sintoma

O `AgentSessionWorker` recebe **HTTP 400 `invalid_request`** da Anthropic ao executar
certos agentes:

```
tools.4.custom.input_schema.properties:
Property keys should match pattern '^[a-zA-Z0-9_.-]{1,64}$'
```

Caso reproduzido:

```json
{
  "providerType": "ANTHROPIC",
  "enabledTools": ["DATA_MAPPING", "CALENDAR", "SERVICE_HOURS"]
}
```

A ordem das tools montada pelo backend é fixa:

| Índice | Tool |
|--------|------|
| 0–3 | 4 ferramentas de calendário |
| **4** | `save_contact_data` (data mapping dinâmica) |

Por isso `tools.4` aponta para a tool de data mapping.

---

## 2. Causa raiz

A tool `save_contact_data` é **dinâmica**: cada campo configurado do agente
(`AgentFields`) vira uma propriedade no JSON Schema. Hoje o **nome amigável** do
campo é usado **diretamente como chave** da propriedade.

`chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/tools/dataMapping/dataMappingToolDefinitions.ts`

```ts
for (const field of fields) {
  properties[field.name] = {          // ← nome cru vira chave do schema
    type: "string",
    description: field.description,
  };
}
```

A Anthropic exige que toda chave de propriedade case com
`^[a-zA-Z0-9_.-]{1,64}$`. Nomes de campo reais violam isso:

| Nome do campo | Por que falha |
|---------------|---------------|
| `Preferencia de 1º contato` | espaços, `º` |
| `Solução` | `ç`, `ã` |

Espaço, `º`, `ç`, `ã` (e afins) **não** são permitidos.

### O caminho inverso também depende do nome

`chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/tools/dataMapping/AgentDataMappingToolExecutor.ts`

```ts
const field = this.agent.fields.find((f) => f.name === fieldName);
```

O executor localiza o campo **pelo nome**. Então não basta sanitizar só o schema:
a chave que sai (schema) e a chave que volta (tool call → lookup) precisam ser a
**mesma função determinística**.

### Escopo real: os dois providers, não só o Anthropic

`buildDataMappingToolDefinition` alimenta **ambos**:

- `providers/AnthropicHandlerAgent.ts:765`
- `providers/OpenAIHandlerAgent.ts:741`

O executor (`AgentDataMappingToolExecutor`) é provider-agnóstico
(`tools/AgentToolExecutor.ts:149`). A OpenAI é mais tolerante com nomes de
parâmetro e por isso **ainda não** estoura, mas está igualmente frágil.

➡️ **Consequência:** corrigir o helper compartilhado + o lookup do executor
conserta os dois caminhos de uma vez. É o ponto certo de fix — na função
compartilhada, não em cada caller.

---

## 3. Solução

Criar um helper compartilhado e determinístico que gera uma **chave técnica
válida** para cada `AgentField`.

### Contrato da chave

- Casa com `^[a-zA-Z0-9_.-]{1,64}$`
- Remove/normaliza acentos e caracteres de compatibilidade (`º`, `ª`)
- Troca espaços e caracteres inválidos por `_`
- Limitada a 64 caracteres
- Evita colisões usando um fragmento do `field.id`
- Continua legível quando possível

### Exemplos

```
Solução                     → solucao_20ec765f
Preferencia de 1º contato   → preferencia_de_1_contato_04e1be1f
```

### Por que legível (e não só o `field.id`)

`field.id` **já é UUID** (`@default(uuid())`, `@db.Uuid`, 36 chars, só hex +
hífen) → casaria com o regex direto. Usar o UUID cru como chave seria um diff de
~2 linhas, sem helper.

**Optamos por não fazer isso.** O nome do parâmetro é sinal semântico real para
o modelo extrair o dado certo: `preferencia_de_1_contato_...` orienta melhor que
um UUID opaco, mesmo com o nome repetido na `description`. Nessa path (extração
de dados de contato) a legibilidade paga o custo do helper.

### Geração da chave (detalhes que importam)

1. **Acentos + `º`/`ª` numa linha, via stdlib:**
   ```ts
   s.normalize("NFKD").replace(/[̀-ͯ]/g, "")
   ```
   NFKD (não NFD) decompõe compatibilidade: `º→o`, `ª→a`, `ç→c`. Sem lib de
   transliteração.
   - ⚠️ NFKD transforma `1º contato` → `1o_contato` (não `1_contato`). É escolha
     cosmética; ambas passam no regex. Se preferir **dropar** o `º`, deixe o
     passo "trocar inválidos por `_`" comer o resíduo. Alinhe o exemplo do teste
     com a decisão tomada.
2. **Truncar antes do sufixo e aparar `_`:** com sufixo `_` + 8 hex
   (`_04e1be1f` = 9 chars), a parte legível vai a ≤ 55 chars; faça `trim` de `_`
   nas pontas **depois** de truncar (senão sai `foo_bar__04e1be1f`).
3. **Slug vazio:** campo só com inválidos (emoji, `———`) → parte legível vazia →
   chave = só o sufixo (`_04e1be1f`), ainda válida. O sufixo garante não-vazio +
   unicidade; o helper nunca pode emitir string vazia.
4. **Colisão de 8-hex:** desprezível para dezenas de campos por agente. Se um dia
   crescer, usar o UUID inteiro no sufixo. Vale um comentário marcando o teto.

### Aplicação

**No schema** (`buildDataMappingToolDefinition`):

```ts
const key = buildDataMappingFieldKey(field);
properties[key] = {
  type: "string",
  description: `${field.name}: ${field.description}`, // nome original orienta o modelo
};
```

**No executor** (`AgentDataMappingToolExecutor`):

```ts
const field = this.agent.fields.find(
  (candidate) => buildDataMappingFieldKey(candidate) === fieldName,
);
```

**Fallback** por `candidate.name === fieldName` para compatibilidade com tool
calls antigos / sessões iniciadas antes do deploy:

```ts
const field =
  this.agent.fields.find(
    (candidate) => buildDataMappingFieldKey(candidate) === fieldName,
  ) ?? this.agent.fields.find((candidate) => candidate.name === fieldName);
```

### O que NÃO muda

- Salvamento continua por `customFieldId`.
- **Nada de banco, schema Prisma ou dados existentes.**
- `required: []` continua vazio (todos os campos opcionais).

---

## 4. Testes esperados

Testes unitários cobrindo:

- Campos com acentos (`ç`, `ã`, `á`…)
- Campos com espaços
- Caracteres de compatibilidade (`º`, `ª`)
- Nomes acima de 64 caracteres (truncagem + sufixo dentro do limite)
- Dois campos com o mesmo nome (ou que gerem o mesmo slug base) → chaves distintas
- Geração determinística (mesmo input → mesma chave)
- Correspondência da chave técnica no executor (lookup encontra o campo)
- Compatibilidade pelo nome antigo (fallback)
- **Validação de TODAS as chaves geradas contra `^[a-zA-Z0-9_.-]{1,64}$`**
- Edge case slug vazio (emoji / só inválidos) → chave = sufixo, ainda válida

---

## 5. Arquivos tocados

| Arquivo | Mudança |
|---------|---------|
| `.../tools/dataMapping/dataMappingFieldKey.ts` *(novo)* | helper `buildDataMappingFieldKey` |
| `.../tools/dataMapping/dataMappingToolDefinitions.ts` | usar a chave técnica; nome na description |
| `.../tools/dataMapping/AgentDataMappingToolExecutor.ts` | lookup por chave técnica + fallback por nome |
| `.../tools/dataMapping/index.ts` | exportar o helper |
| `.../tools/dataMapping/*.test.ts` *(novo)* | testes acima |
