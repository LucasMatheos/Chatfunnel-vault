# 02 — Canal Messenger (Facebook)

**Bloco do PDF:** O que estamos criando (p.51-52)
**Status hoje:** Não existe. Grep por "messenger" no codebase só retorna arquivos de mobile relacionados a `ChannelPicker`/queries genéricas de canais, nenhuma integração real com a Messenger Platform da Meta.

## O que o PDF descreve
Amplia a captação para páginas do Facebook via Messenger:
1. Conexão da página do Facebook, recebimento e envio de mensagens.
2. IA e transferência para humano seguem o mesmo fluxo já usado em WhatsApp/Instagram, caindo na mesma central de atendimento.

## O que precisa ser implementado
- **Integração com a Messenger Platform da Meta** (Send API, Webhooks de página) — novo adapter de canal em `chatfunnel-core`, análogo ao que já existe para Instagram (mesma família de APIs Meta, então reaproveita boa parte da infra de autenticação/webhook já construída para Instagram/WhatsApp).
- **Fluxo de conexão de página** no onboarding de canais do front (tela de "Canais de Captação"), incluindo OAuth da página do Facebook e seleção de qual página conectar.
- **Normalização de eventos Messenger** (mensagem, anexo, quick reply) para o formato de conversa interno, reaproveitando pipeline de inbox/automações/CRM que já existe.
- **Permissões e revisão de app da Meta**: Messenger exige App Review para `pages_messaging` em produção — processo de aprovação com a Meta, não só código.
