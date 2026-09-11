# 09 — Recebimento de pagamentos (parceiro de cobrança)

**Bloco do PDF:** Visão futura (p.66-67)
**Status hoje:** Não existe. Grep por "payment"/pagamento não encontra nenhum processador de pagamento integrado — hoje o ChatFunnel só sincroniza *status* de pedido vindo da plataforma de loja/ERP, não processa cobrança.

## O que o PDF descreve
O ChatFunnel acompanharia pagamentos das vendas do lojista:
1. Um parceiro de pagamento processaria a cobrança (não é processamento próprio).
2. O ChatFunnel reuniria pagamento, conciliação, estorno e reembolso no contexto do pedido, junto ao histórico já existente.

## O que precisa ser implementado
- **Integração com um PSP parceiro** (ex.: Stripe, Pagar.me, Mercado Pago) para criar cobrança e receber webhooks de status de pagamento — não existe hoje nenhum SDK/cliente de pagamento no codebase.
- **Modelo de pagamento vinculado ao pedido** em `chatfunnel-core` (status de cobrança, conciliação, estorno, reembolso), associado ao pedido que já é sincronizado hoje via "Status do pedido sincronizado ao CRM".
- **Exibição no contexto do pedido** (CRM/ficha do cliente): status de pagamento ao lado do status logístico já existente.
- **Fluxos de estorno/reembolso**: ações que disparam chamada ao PSP e atualizam o histórico, mantendo consistência com o pedido original.
- Depende de definição de negócio (qual parceiro, split de comissão, compliance PCI) antes da parte técnica — é a frente mais dependente de decisão de produto/jurídico das 4 detalhadas.
