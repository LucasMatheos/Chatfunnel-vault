---
title: Master Index
description: Ponto de entrada principal da knowledge base do ChatFunnel. Claude deve ler este arquivo PRIMEIRO para navegar o vault.
last_updated: 2026-04-13
---

# ChatFunnel Knowledge Base — Master Index

Este e o indice mestre do vault. Navegue por topico para encontrar informacao.

## Wiki

| Topico | Indice | Descricao |
|--------|--------|-----------|
| [[wiki/repos/_index\|Repos]] | `wiki/repos/_index.md` | Referencia tecnica por repositorio (stack, estrutura, patterns, gotchas) |
| [[wiki/features/_index\|Features]] | `wiki/features/_index.md` | Documentacao end-to-end de cada feature do produto (cross-repo) |
| [[wiki/architecture/_index\|Architecture]] | `wiki/architecture/_index.md` | Visao de sistema, fluxos, decisoes arquiteturais (cross-repo) |
| [[wiki/gotchas/_index\|Gotchas]] | `wiki/gotchas/_index.md` | Armadilhas cross-repo (infra, integracao, database) |
| [[wiki/ai-patterns/_index\|AI Patterns]] | `wiki/ai-patterns/_index.md` | Patterns de IA (tool use, RAG, classification, caching) |
| [[wiki/guides/_index\|Guides]] | `wiki/guides/_index.md` | Guias tecnicos detalhados — passo a passo de implementacao, arquivos, APIs, composables |
| ~~[[wiki/layers/_index\|Layers]]~~ | `wiki/layers/_index.md` | **DEPRECATED** — substituido por Repos. Mantido por compatibilidade de links |

## Claude (memoria entre sessoes)

| Arquivo | Descricao |
|---------|-----------|
| [[claude/context-pack]] | Estado atual do projeto — injetado automaticamente no SessionStart |
| [[claude/handoff]] | Como retomar o trabalho — atualizado ao final de cada sessao |

## Outras Secoes

| Secao | Descricao |
|-------|-----------|
| [[decisions/]] | ADRs — decisoes arquiteturais com contexto e alternativas |
| [[diary/]] | Daily notes — registro automatico do que foi feito por dia |
| [[Docs/]] | Documentos de referencia e analises (best practices, gap analysis, harness) |
| [[prototipos/]] | Prototipos de design (.pen, figma refs) |
