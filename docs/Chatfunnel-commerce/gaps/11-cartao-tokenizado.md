# 11 — Cartão tokenizado e compra com um clique

**Bloco do PDF:** Visão futura (p.70-71)
**Status hoje:** Não existe. Grep por "tokeniz"/"one-click"/"cartão salvo" não encontra nada — sem noção de cartão salvo/tokenizado no codebase.

## O que o PDF descreve
Facilita uma nova compra com confirmação explícita:
1. Um provedor guardaria a referência segura do cartão (token), o ChatFunnel nunca guarda o número real.
2. O ChatFunnel mostraria cartão mascarado, itens e total no chat.
3. O cliente confirma antes da cobrança — recompra rápida, mas nunca automática/sem confirmação.

## O que precisa ser implementado
- **Depende do gap 09** (parceiro de pagamento) — a tokenização é feita pelo PSP, o ChatFunnel só guarda a referência (token) devolvida por ele, nunca o PAN do cartão (requisito de compliance PCI-DSS).
- **Fluxo de salvar cartão** na primeira compra (opt-in do cliente) e reuso do token em recompras futuras.
- **UI de recompra com um clique**: no chat, exibir cartão mascarado (últimos 4 dígitos) + itens + total, com botão de confirmação explícita antes de cobrar — nunca disparar cobrança automaticamente sem essa confirmação.
- **Gestão de token** (revogar, expirar, trocar cartão) na ficha do cliente.
- Depende do gap 05/10 (carrinho/checkout) para montar o pedido que será cobrado com o token salvo.
