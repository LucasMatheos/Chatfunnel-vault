# 10 — Checkout próprio ChatFunnel

**Bloco do PDF:** Visão futura (p.68-69)
**Status hoje:** Não existe. Grep por "checkout" no codebase não retorna nenhum fluxo de finalização de compra próprio — o carrinho do gap 05, quando existir, ainda dependeria do checkout da plataforma de loja conectada.

## O que o PDF descreve
Conclui a compra dentro da própria jornada do ChatFunnel, sem redirecionar para o checkout da loja:
1. O cliente revisa itens, entrega, valor e forma de pagamento sem sair da conversa.
2. A confirmação cria o pedido antes de mostrar o resultado.

## O que precisa ser implementado
- **Depende do gap 05** (carrinho no chat) como pré-requisito — não faz sentido sem ele.
- **Depende do gap 09** (recebimento de pagamentos) para a etapa de forma de pagamento dentro do checkout.
- **Fluxo de criação de pedido próprio**: hoje o ChatFunnel só sincroniza pedidos criados na plataforma da loja (Shopify/Yampi/etc.); aqui precisaria criar o pedido diretamente na plataforma via API (ou ter um pedido "nativo" do ChatFunnel que depois se sincroniza com a loja) — decisão de arquitetura relevante: quem é a fonte da verdade do pedido.
- **UI de revisão de compra** (resumo de carrinho + entrega + pagamento + confirmação) dentro da tela de atendimento/conversa.
- **Cálculo de frete**: depende de a plataforma conectada expor cálculo de frete via API — não confirmado que as integrações atuais já fazem isso.
