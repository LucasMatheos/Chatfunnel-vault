# 01 — Chat nativo com IA e equipe humana no site

**Bloco do PDF:** O que estamos criando (p.49-50)
**Status hoje:** Não existe. Canais atuais são só WhatsApp e Instagram (`vault/wiki/features/channels.md`); não há widget de chat embutível no site do lojista.

## O que o PDF descreve
Um widget de chat dentro do próprio site da loja (não WhatsApp/Instagram), onde:
1. A conversa começa sem sair da loja.
2. IA e equipe humana compartilham o mesmo histórico (mesma inbox unificada já usada para WhatsApp/Instagram).
3. Catálogo e carrinho aparecem na conversa quando a conexão com a plataforma de loja (Shopify/Yampi/etc.) fornece esses dados.

## O que precisa ser implementado
- **Novo canal `site_chat`** no domínio de canais (`chatfunnel-core`), paralelo a WhatsApp/Instagram, com seu próprio adapter de mensageria (sem Meta API — transporte próprio, provavelmente WebSocket via `chatfunnel-websocket`).
- **Widget embarcável** (JS snippet/iframe) para o lojista colar no site — precisa de um novo pacote frontend (não existe em nenhum repo atual) servido publicamente, com autenticação por domínio/loja.
- **Backend do widget**: endpoint público (provavelmente em `chatfunnel-external-api`, que já expõe API pública) para iniciar sessão anônima, enviar/receber mensagem e resolver identidade quando o visitante se identifica.
- **Integração com inbox existente**: a conversa do widget precisa cair na mesma tela de atendimento (front `chatfunnel-front`) e permitir transferência IA → humano com o histórico preservado, reaproveitando o pipeline de conversas que já existe para WhatsApp/Instagram.
- **Exibição de catálogo/carrinho na conversa**: depende do gap 05 (carrinho e pedido no chat) e das conexões de plataforma de loja já existentes (`Plataformas de loja e ERPs`, já implementado).
