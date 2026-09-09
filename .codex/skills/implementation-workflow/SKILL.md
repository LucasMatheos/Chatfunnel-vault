---
name: implementation-workflow
description: Planejar e executar mudanças de software com investigação prévia, causa raiz, escopo, riscos e testes. Usar quando o usuário pedir implementação, correção, refatoração, feature, plano técnico, análise antes de alterar código ou uma execução mais assertiva. Sempre apresentar o plano e pedir autorização explícita antes de editar arquivos de implementação.
---

# Implementation Workflow

Investigar antes de editar, propor um plano verificável e implementar somente após
autorização explícita do usuário.

## Regras obrigatórias

- Não editar código, configuração, testes, migrations ou documentação de produto durante a fase de análise.
- Não interpretar o pedido inicial de implementação como aprovação do plano ainda não apresentado.
- Apresentar o plano primeiro e finalizar a resposta com a pergunta exata: **"Posso implementar este plano?"**
- Aguardar uma nova resposta afirmativa do usuário antes de editar qualquer arquivo de implementação.
- Aceitar como autorização respostas inequívocas como "sim", "pode implementar", "aprovado" ou equivalente.
- Se o usuário pedir ajustes no plano, atualizar o plano e pedir autorização novamente.
- Se o escopo mudar depois da autorização, parar, explicar a mudança e solicitar nova aprovação.
- Não executar build, migration, banco real, commit ou push sem autorização específica e sem violar o `AGENTS.md` aplicável.

## Fase 1 — Descoberta

1. Ler as instruções `AGENTS.md` aplicáveis.
2. Consultar a knowledge base exigida pelo projeto.
3. Usar índices, grafos ou ferramentas arquiteturais antes de busca textual quando o projeto exigir.
4. Localizar o fluxo atual, seus pontos de entrada, persistência, integrações e testes.
5. Consultar `git log`, `git show` ou `git blame` quando o comportamento puder ser regressão ou decisão histórica.
6. Separar fatos comprovados, inferências e dúvidas.
7. Não acessar banco real nem usar credenciais do workspace.

## Fase 2 — Plano técnico

Apresentar um plano conciso contendo, quando aplicável:

- comportamento atual;
- causa raiz;
- comportamento desejado;
- solução proposta e alternativas descartadas;
- arquivos e repositórios afetados;
- contratos, multi-tenancy e soft delete;
- concorrência, idempotência e condições de corrida;
- compatibilidade e possíveis regressões;
- testes focados e critérios de aceite;
- migrations ou mudanças de infraestrutura;
- documentação ou vault a atualizar.

Declarar explicitamente o que ficará fora do escopo. Não esconder decisões abertas;
pedir ao usuário apenas as definições que alteram materialmente a solução.

## Barreira de aprovação

Depois de apresentar o plano:

1. Não chamar ferramentas que modifiquem arquivos.
2. Não começar alterações preparatórias.
3. Perguntar: **"Posso implementar este plano?"**
4. Encerrar o turno e aguardar a resposta.

Esta barreira só pode ser ignorada quando o usuário disser explicitamente, antes da
análise, que não quer revisão do plano e autoriza implementação imediata.

## Fase 3 — Implementação autorizada

Após aprovação explícita:

1. Confirmar branch e alterações preexistentes.
2. Criar ou atualizar um plano de execução com etapas verificáveis.
3. Implementar a causa raiz com mudanças pequenas e focadas.
4. Não sobrescrever alterações do usuário.
5. Preservar padrões arquiteturais e estilo existentes.
6. Adicionar testes de regressão no nível mais próximo da mudança.
7. Executar primeiro os testes específicos permitidos pelo projeto.
8. Não corrigir falhas não relacionadas.
9. Revisar o diff final e identificar arquivos alterados.
10. Atualizar documentação ou knowledge base quando houver decisão ou gotcha relevante.

## Entrega

Informar de forma objetiva:

- o que mudou e por quê;
- arquivos principais com linhas relevantes;
- validações executadas e resultados;
- validações não executadas;
- limitações ou riscos restantes;
- alterações preexistentes que permaneceram intocadas.
