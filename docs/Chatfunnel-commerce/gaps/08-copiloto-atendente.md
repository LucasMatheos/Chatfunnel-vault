# 08 — Copiloto do atendente (sugestão de resposta)

**Bloco do PDF:** O que estamos criando (p.63-64)
**Status hoje:** Não existe. Já existem Base de Conhecimento e Aprendizado Diário Revisado (já implementados), mas nada que sugira resposta em tempo real para o atendente humano sem enviar sozinho.

## O que o PDF descreve
Sugere uma resposta para a equipe sem enviar sozinho:
1. A sugestão usa conteúdo ativo da base de conhecimento e cita a fonte.
2. O atendente pode editar, usar ou descartar a sugestão.
3. A publicação ampla (envio real) ainda precisa de confirmação humana — copiloto nunca envia direto.

## O que precisa ser implementado
- **Serviço de sugestão em tempo real**: ao receber uma mensagem do cliente numa conversa atendida por humano, gerar uma sugestão de resposta consultando a Base de Conhecimento já existente (RAG sobre o conteúdo ativo) — reaproveita a infra de IA/agentes já usada no atendimento automático, mas em modo "sugestão", não "resposta automática".
- **Citação de fonte**: a sugestão precisa referenciar de qual conteúdo da base ela veio, para o atendente poder "Consultar fonte" (como no mock) — precisa expor o trecho/documento de origem junto da resposta gerada.
- **UI no painel de atendimento** (`chatfunnel-front`): painel lateral de sugestão do copiloto ao lado da conversa, com ações "Usar sugestão" (preenche o campo de mensagem para edição), "Descartar" e "Consultar fonte".
- **Guard-rail de não-envio automático**: garantir que o copiloto nunca dispara mensagem sozinho — só popula o campo de digitação, e o envio continua manual pelo atendente.
