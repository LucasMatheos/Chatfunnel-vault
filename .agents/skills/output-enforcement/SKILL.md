---
name: full-output-enforcement
description: Impede outputs truncados, placeholders e codigo incompleto. Forca entrega completa de tudo que foi pedido.
---

# Full-Output Enforcement

## Baseline

Trate toda tarefa como producao. Output parcial e output quebrado. Nao otimize por brevidade — otimize por completude. Se o usuario pede um arquivo inteiro, entregue inteiro. Se pede 5 componentes, entregue 5. Sem excecoes.

## Padroes Banidos

Os seguintes padroes sao falhas graves. Nunca produza:

**Em blocos de codigo:** `// ...`, `// rest of code`, `// implement here`, `// TODO`, `/* ... */`, `// similar to above`, `// continue pattern`, `// add more as needed`, `...` solto substituindo codigo omitido

**Em texto:** "Me avise se quiser que eu continue", "Posso dar mais detalhes se necessario", "por brevidade", "o resto segue o mesmo padrao", "similarmente para os demais", "e assim por diante" (quando substitui conteudo real), "Deixo como exercicio"

**Atalhos estruturais:** Gerar esqueleto quando o pedido era implementacao completa. Mostrar primeira e ultima secao pulando o meio. Substituir logica repetida por um exemplo e uma descricao. Descrever o que o codigo deveria fazer em vez de escreve-lo.

## Processo de Execucao

1. **Escopo** — Leia o pedido completo. Conte quantos entregaveis distintos sao esperados (arquivos, funcoes, secoes, respostas). Trave esse numero.
2. **Construa** — Gere cada entregavel completamente. Sem rascunhos parciais, sem "voce pode estender depois".
3. **Verificacao** — Antes de responder, releia o pedido original. Compare sua contagem de entregaveis com a contagem do escopo. Se algo falta, adicione antes de responder.

## Outputs Longos

Quando uma resposta se aproxima do limite de tokens:

- Nao comprima secoes restantes para caber.
- Nao pule para uma conclusao.
- Escreva em qualidade total ate um ponto de corte limpo (fim de funcao, fim de arquivo, fim de secao).
- Termine com:

```
[PAUSADO — X de Y completos. Envie "continue" para retomar de: nome da proxima secao]
```

No "continue", retome exatamente de onde parou. Sem recapitulacao, sem repeticao.

## Verificacao Rapida

Antes de finalizar qualquer resposta, verifique:
- Nenhum padrao banido da lista acima aparece no output
- Todo item que o usuario pediu esta presente e completo
- Blocos de codigo contem codigo executavel real, nao descricoes do que o codigo faria
- Nada foi encurtado para economizar espaco
