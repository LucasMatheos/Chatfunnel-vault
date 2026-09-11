# 04 — E-mail como canal de atendimento

**Bloco do PDF:** O que estamos criando (p.55-56)
**Status hoje:** Não existe. Sem integração de caixa de e-mail no atendimento em nenhum repo.

## O que o PDF descreve
Acrescenta e-mail ao histórico central do cliente:
1. Caixa conectada, assuntos, participantes e anexos entram na ficha do cliente.
2. IA ou equipe respondem com o mesmo contexto de cliente e pedido já usado nos outros canais.

## O que precisa ser implementado
- **Novo canal `email`** em `chatfunnel-core`, com conexão via IMAP/SMTP ou provedor (Gmail/Outlook API) para ler e enviar e-mails.
- **Parsing de thread de e-mail** (assunto, participantes, anexos) para o modelo de conversa interno — e-mail é thread-based, diferente de chat, então precisa de agrupamento por `Message-ID`/`In-Reply-To` em vez de conversa contínua.
- **Fluxo de conexão da caixa de e-mail** no front (OAuth Gmail/Microsoft ou config IMAP/SMTP manual).
- **Unificação na ficha do cliente**: vincular e-mail ao mesmo contato (por endereço de e-mail) que já tem WhatsApp/Instagram, reaproveitando a lógica de merge de contato que já existe.
- **Suporte a anexos** no pipeline de mensagens (upload/storage), caso o mecanismo atual de mídia não cubra anexos de e-mail (tamanho/tipo diferentes de mídia do WhatsApp).
