---
title: Avast URL Phishing em app.chatfunnel.com.br
date: 2026-06-15
status: investigacao-inicial
severity: media
area: frontend
reported_by: usuario final
---

# Avast URL Phishing em app.chatfunnel.com.br

## Resumo

Um usuario relatou que o Avast bloqueou `https://app.chatfunnel.com.br` com a classificacao `URL:Phishing`. Pela evidencia inicial, nao ha sinal claro de comprometimento ou redirect malicioso na raiz do app. A causa mais provavel e falso positivo de reputacao, disparado por combinacao de scripts de tracking, GTM, session replay, textos legais antigos e ausencia de alguns sinais basicos de hardening.

## Evidencia recebida

- Produto: Avast.
- Mensagem: `Ameaca neutralizada`.
- URL bloqueada: `app.chatfunnel.com.br`.
- Categoria: `URL:Phishing`.
- Tela afetada: app autenticado do ChatFunnel, aparentemente na area de chat/livechat.
- Horario visivel no popup: `2026-06-15T13:37:22.908Z`.

## Verificacoes iniciais

- DNS de `app.chatfunnel.com.br` aponta para Cloudflare.
- A raiz `https://app.chatfunnel.com.br/` respondeu `200 OK`.
- Nao foi observado redirect estranho na raiz durante a checagem inicial.
- O HTML de producao carregava Google Tag Manager diretamente antes do bundle Vue.
- O endpoint `/robots.txt` retornava o HTML da SPA por fallback, nao um arquivo `robots.txt` real.

## Hipoteses provaveis

### 1. Falso positivo por Google Tag Manager

O `index.html` carregava o container `GTM-K5WQR7SP`. A inspecao do container mostrou tags capazes de carregar scripts externos, incluindo Microsoft Clarity via Custom HTML e configuracao de coleta first-party em `gtmserver.chatfunnel.com.br`.

Esse padrao pode ser interpretado por antivirus como comportamento suspeito quando combinado com login, cookies, formularios e app autenticado.

### 2. Excesso de telemetria e session replay

O frontend inicializa ferramentas de analytics e observabilidade no app:

- Amplitude com autocapture.
- Amplitude session replay com `sampleRate: 1`.
- Microsoft Clarity.
- Sentry com `sendDefaultPii: true`.
- Gleap via script externo.
- Formbricks para surveys.

Essas ferramentas sao legitimas, mas aumentam a superficie de scripts externos, captura de eventos e envio de dados. Em apps com login, isso pode afetar reputacao em heuristicas de antivirus.

### 3. Duplicidade de Clarity

O app inicializa Clarity no bundle Vue e o GTM tambem injeta Clarity via Custom HTML. Essa duplicidade pode gerar comportamento de tracking redundante e aumentar ruido para classificadores de seguranca.

### 4. Textos legais com dominio incorreto e boilerplate antigo

Os textos legais continham referencias a `https://chatfunel.com.br/` com um `n`, enquanto o dominio correto e `chatfunnel.com.br`.

Tambem havia linguagem generica sobre banners, pop-ups, downloads, virus e risco de dano ao computador. Mesmo nao sendo codigo malicioso, esse conteudo e ruim para reputacao e pode parecer template de baixa confianca.

### 5. Ausencia de sinais basicos de hardening no frontend

Na resposta inicial nao apareceram headers basicos de seguranca como:

- `X-Content-Type-Options`.
- `X-Frame-Options` ou equivalente via CSP.
- `Referrer-Policy`.
- `Permissions-Policy`.

Isso nao causa phishing por si so, mas reduz sinais positivos de confianca.

## Indicadores que nao confirmaram comprometimento

- A raiz do app respondeu normalmente.
- Nao foi observado redirect externo na primeira carga.
- O DNS estava coerente com uso de Cloudflare.
- O alerta informado e de reputacao/URL, nao de malware baixado localmente.

Esses pontos nao descartam comprometimento de tags, cache, service worker ou conta GTM, mas tornam falso positivo uma possibilidade forte.

## Acoes recomendadas imediatas

1. Auditar o container GTM `GTM-K5WQR7SP`.
2. Remover ou pausar Custom HTML no GTM ate concluir a auditoria.
3. Evitar carregar GTM no shell do app autenticado, ou restringir a paginas publicas quando possivel.
4. Reduzir Amplitude session replay em producao para uma taxa menor que `1`.
5. Reavaliar `sendDefaultPii: true` no Sentry.
6. Manter apenas uma fonte de Clarity: bundle ou GTM, nao ambos.
7. Corrigir textos legais com dominio correto `chatfunnel.com.br`.
8. Publicar `robots.txt` real para evitar fallback da SPA.
9. Adicionar headers basicos de seguranca no Nginx ou reverse proxy.
10. Submeter falso positivo para Avast somente depois de limpar/reduzir os sinais acima.

## Evidencias adicionais para coletar

- URL exata bloqueada, incluindo path e query string.
- Se o bloqueio acontece antes ou depois do login.
- Se acontece em aba anonima/sem cache.
- Versao do Avast e banco de definicoes.
- Resultado em outros vendors de seguranca.
- Lista final de tags ativas no GTM em producao.
- Service worker ativo no navegador do usuario.
- HAR da navegacao ate o bloqueio.

## Mensagem sugerida para o usuario

Identificamos o alerta e estamos tratando como incidente de reputacao do dominio. Ate agora nao encontramos evidencia de redirect malicioso na pagina principal. Estamos auditando os scripts de analytics e tags externas carregadas no app, que podem causar falso positivo em antivirus. Assim que a limpeza for publicada, vamos solicitar nova analise ao Avast.

## Conclusao inicial

A causa mais provavel e falso positivo de phishing por reputacao, especialmente por GTM, scripts de tracking/session replay e sinais fracos de confianca no frontend. Ainda assim, a conta GTM e o service worker devem ser auditados antes de encerrar o incidente.
