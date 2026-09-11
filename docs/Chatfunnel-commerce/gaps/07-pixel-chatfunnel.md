# 07 — Pixel ChatFunnel e jornada de navegação própria

**Bloco do PDF:** O que estamos criando (p.61-62)
**Status hoje:** Não existe. Grep por "pixel" não encontra nenhuma implementação de tracking próprio; o "Tracking de navegação na loja" já existente (p.26-27) depende de dados vindos da conexão com a plataforma da loja, não de um pixel próprio do ChatFunnel.

## O que o PDF descreve
Um pixel próprio do ChatFunnel instalado no site do lojista para registrar visitas e eventos:
1. O pixel recebe navegação e ações permitidas pela loja (visualizou produto, adicionou ao carrinho, etc.) mesmo de visitante anônimo.
2. Quando existe identificação confiável (ex.: o visitante inicia uma conversa), liga a origem à conversa.
3. Consentimento e fonte acompanham os eventos (LGPD/cookie consent).

## O que precisa ser implementado
- **Script de pixel** para instalar no site do lojista (tag JS), independente de qualquer plataforma de e-commerce — diferente do tracking atual, que depende da conexão com Shopify/Yampi/etc.
- **Endpoint de ingestão de eventos anônimos** (`chatfunnel-external-api` ou novo serviço), com identificação por cookie/device até haver um dado confiável (telefone/e-mail) para linkar ao contato.
- **Resolução de identidade**: linkar sessão anônima ao contato quando ele se identifica (inicia conversa, informa telefone/e-mail) — precisa de lógica de merge de sessão → contato.
- **Registro e propagação de consentimento** (LGPD) junto de cada evento — não existe hoje um mecanismo de consent tracking no codebase.
- **Exibição na ficha do cliente/atendimento**: mostrar a jornada pré-atendimento (páginas vistas, produto visualizado, carrinho) na tela de atendimento, similar ao mock do PDF.
