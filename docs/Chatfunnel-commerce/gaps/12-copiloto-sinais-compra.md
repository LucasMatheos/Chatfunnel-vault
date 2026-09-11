# 12 — Copiloto com sinais de compra e alertas

**Bloco do PDF:** Visão futura (p.72-73)
**Status hoje:** Não existe. É uma evolução do Copiloto do atendente (gap 08): aqui o copiloto passa a pontuar intenção/objeção e gerar alertas, não só sugerir resposta.

## O que o PDF descreve
Ajuda a equipe a priorizar conversas e responder objeções:
1. O copiloto pontuaria intenção de compra e detectaria objeções (ex.: objeção de preço) na conversa.
2. Alertas indicariam conversa esfriando (sem resposta, engajamento caindo).
3. Um resumo levaria esses sinais para o CRM (card da oportunidade).

## O que precisa ser implementado
- **Depende do gap 08** (copiloto do atendente) como base de infraestrutura de IA sobre a conversa.
- **Classificador de intenção/objeção** rodando sobre as mensagens da conversa em tempo real (ex.: LLM com prompt de classificação, ou modelo dedicado) — não existe hoje nenhuma pontuação de intenção de compra no codebase.
- **Detector de "conversa esfriando"**: regra/heurística sobre tempo sem resposta e queda de engajamento, gerando alerta para o atendente/gestor.
- **Sistema de alertas**: canal de notificação (painel, ou push) quando um sinal crítico aparece (alto interesse, objeção, esfriamento) — pode reaproveitar infraestrutura de notificação já existente no front, se houver.
- **Resumo estruturado no CRM**: escrever o resumo de sinais no card da oportunidade (CRM/Kanban já existente), como campo/nota vinculada ao card.
