# 05 — Carrinho e pedido dentro do chat

**Bloco do PDF:** O que estamos criando (p.57-58)
**Status hoje:** Não existe montagem de carrinho durante a conversa. O CRM/Kanban hoje trabalha com oportunidades (`vault/wiki/features/crm-kanban.md`), não com um carrinho de itens de catálogo montado dentro do chat.

## O que o PDF descreve
Permite montar a compra durante a conversa:
1. IA ou atendente escolhe itens e variantes do catálogo.
2. Preço e disponibilidade são conferidos em tempo real.
3. O cliente revisa o carrinho na própria conversa e recebe o checkout da loja (link de checkout da plataforma conectada, ex.: Shopify/Yampi).

## O que precisa ser implementado
- **Modelo de carrinho** associado a uma conversa/contato em `chatfunnel-core` (itens, variante, quantidade, preço, subtotal/frete/total).
- **Consulta de catálogo e disponibilidade em tempo real** via as conexões de plataforma de loja já existentes (Shopify/Yampi/VTEX/etc.), reaproveitando a integração já implementada em "Plataformas de loja e ERPs" — precisa expor busca de produto/variante e estoque, que hoje só é usada para sincronizar status de pedido.
- **UI de montagem de carrinho na conversa** (front): busca de produto, seleção de variante, exibição de subtotal/frete/total dentro da tela de atendimento.
- **Geração de link de checkout** a partir do carrinho montado, delegando para o checkout nativo da plataforma conectada (não é o checkout próprio do gap 10 — aqui é só montar o carrinho e mandar pro checkout que já existe na loja).
- **Ferramenta de agente IA** para montar/alterar carrinho via Intelligence (reaproveitando o padrão de tool-calling que já existe para outras ações do agente).
