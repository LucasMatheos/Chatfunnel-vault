---
name: notion-cards
description: Cria, atualiza e organiza cards/tasks no Notion usando uma integração MCP do Notion quando disponível. Use quando o usuário pedir para "criar task/card no Notion", registrar bugs ou atividades, mover cards entre status/colunas, adicionar PRs/links/contexto a uma task existente, ou consultar dados necessários para montar um card no board de tarefas.
---

# Notion Cards

## Overview

Usar esta skill para transformar pedidos livres do usuário em cards de Notion bem estruturados. A skill depende de uma ferramenta MCP/connector do Notion disponível na sessão; se ela não existir, preparar o payload e informar objetivamente que falta configurar o MCP.

## Workflow

1. Confirmar se há tool MCP/connector Notion disponível na sessão.
2. Identificar database/board de destino. Se o usuário não informar e não houver padrão explícito no contexto, perguntar antes de criar.
3. Identificar o módulo funcional da demanda e formatá-lo como prefixo do título em caixa alta entre colchetes.
4. Extrair título, descrição, status, prioridade, links, PRs, responsáveis e data, mantendo o texto em português quando o pedido vier em português.
5. Criar ou atualizar o card usando a tool Notion mais específica disponível.
6. Retornar título, status final e URL do card criado/alterado.

## Tool Selection

- Preferir MCP/connector oficial do Notion quando exposto como ferramenta direta.
- Se houver múltiplas tools, usar nesta ordem:
  1. Criar página/card em database.
  2. Atualizar propriedades de página.
  3. Adicionar blocos/conteúdo ao corpo da página.
  4. Buscar databases/pages para resolver nomes ambíguos.
- Não usar browser scraping para criar card se MCP/API Notion não estiver disponível.
- Não inventar IDs de database, IDs de página, status, usuários ou propriedades.

## Card Shape

Mapear campos quando existirem no database:

- **Title/Name:** sempre usar o formato `[MÓDULO] Título curto`, começando por verbo quando for atividade. Escrever o módulo em caixa alta, sem acentos desnecessários ou abreviações ambíguas. Exemplo: `[CONTATOS] Implementar exclusão de contatos filtrados em lotes`.
- **Status:** usar o status pedido pelo usuário. Status comuns no workspace: `Aguardando Inicio`, `Em Andamento`, `Desenv. concluído(Review)`.
- **Prioridade:** usar quando pedido; aceitar termos como `maior prioridade`, `alta`, `média`, `baixa`.
- **Descrição:** incluir contexto, problema, comportamento esperado e observações práticas.
- **Links/PRs:** preservar URLs completas e agrupar em seção própria.
- **Origem:** mencionar repo/feature quando inferível do pedido.

## Content Template

Para cards novos, estruturar o corpo assim quando a tool permitir blocos/conteúdo:

```markdown
## Contexto
- ...

## Tarefa
- ...

## Critérios de aceite
- ...

## Links
- ...
```

Se o usuário pedir apenas uma task simples, manter o card conciso e não criar critérios de aceite artificiais.

## Ambiguity Rules

- Criar direto quando título e destino estiverem claros.
- Inferir o módulo pelo domínio funcional citado no pedido, contexto recente ou feature afetada; por exemplo, contatos → `[CONTATOS]`, funis → `[FUNIS]`, livechat → `[LIVECHAT]` e CRM → `[CRM]`.
- Perguntar qual é o módulo antes de criar quando ele não puder ser inferido com segurança. Nunca criar um card sem o prefixo `[MÓDULO]`.
- Perguntar antes quando faltar database/board ou houver risco de criar no lugar errado.
- Se status pedido não existir, listar o status pedido no corpo e deixar a propriedade sem alteração ou no padrão do board.
- Se o pedido referenciar "isso", "o que fizemos" ou "as modificações", consultar contexto recente/local antes de criar. Não inventar resumo.

## Failure Handling

- **Sem MCP Notion:** informar que não há ferramenta Notion disponível e oferecer o payload pronto para criação manual.
- **Sem permissão:** informar a falha de permissão e pedir para o usuário compartilhar o database/page com a integração.
- **Database ambíguo:** buscar/listar opções se a tool permitir; caso contrário, pedir o database/link.
- **Erro parcial:** reportar o que foi criado/alterado e o que faltou aplicar.
