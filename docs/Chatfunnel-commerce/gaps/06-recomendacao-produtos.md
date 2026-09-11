# 06 — Recomendação inteligente de produtos

**Bloco do PDF:** O que estamos criando (p.59-60)
**Status hoje:** Não existe motor de recomendação. Existe histórico de pedidos/LTV (já implementado), mas nada que sugira produtos com base nele.

## O que o PDF descreve
Após a compra, sugere outros produtos que o cliente pode gostar:
1. A compra feita orienta a seleção de outros produtos para aquele cliente.
2. Uma campanha de nutrição mantém contato e apresenta essas sugestões ao longo do tempo (reaproveitando o módulo de Campanhas de WhatsApp já existente).

## O que precisa ser implementado
- **Motor de recomendação** (mesmo que simples no início: regras por categoria/coleção, "quem comprou X também comprou Y", ou baseado em catálogo) — não existe hoje nenhuma lógica de similaridade/recomendação de produto no codebase.
- **Fonte de dados de catálogo e histórico de compra** já existem parcialmente (integração com plataforma de loja + histórico de pedidos no CRM) — precisa expor isso para o motor de recomendação consumir.
- **Gatilho de automação pós-compra**: novo tipo de trigger de flow ("pedido concluído") que alimenta a campanha de nutrição com os produtos sugeridos — reaproveita o motor de Automações de WhatsApp e Campanhas já existentes, só falta o passo de "buscar recomendação" como novo step de flow.
- **Renderização da sugestão na conversa** (card de produto com preço, como no mock do PDF) — reaproveita componente de exibição de produto do gap 05, se implementado antes.
