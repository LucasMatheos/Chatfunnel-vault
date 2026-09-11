# 03 — Canal TikTok

**Bloco do PDF:** O que estamos criando (p.53-54)
**Status hoje:** Não existe. Grep por "tiktok" no codebase não retorna nenhuma integração — só arquivos de export/CSV sem relação.

## O que o PDF descreve
Abre um novo canal de captura e conversa a partir de interações no TikTok:
1. Conexão segue o que a API do TikTok liberar (comentários, interações com conteúdo).
2. Inbox e automações dependem das permissões disponíveis na API do canal.

## O que precisa ser implementado
- **Avaliação da TikTok API for Business** (Messaging/Comments API) para entender o que dá para captar hoje (o próprio PDF já reconhece essa incerteza: "seguirá os recursos liberados pela API do canal").
- **Novo adapter de canal `tiktok`** em `chatfunnel-core`, com webhook de eventos (interação com vídeo/comentário) e criação de conversa/contato a partir do evento.
- **Fluxo de conexão da conta TikTok Business** no front, com OAuth e escopo de permissões.
- **Roteamento do evento capturado para inbox/CRM/automações**, reaproveitando o pipeline que hoje processa eventos de Instagram (mesmo padrão: identificar contato, criar/atualizar conversa, disparar automação se configurada).
