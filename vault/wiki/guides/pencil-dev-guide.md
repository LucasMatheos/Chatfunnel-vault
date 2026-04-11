---
title: Pencil.dev — Design-to-Code com Claude
description: Tutorial completo de como usar o Pencil.dev integrado ao Claude Code para design e prototipagem do ChatFunnel
tags: [guide, pencil, design, tooling, mcp]
related: ["[[components-catalog]]", "[[skills-workspace-guide]]"]
last_updated: 2026-04-11
---

# Pencil.dev — Design-to-Code com Claude

## O que e o Pencil?

Pencil e um editor de design (similar ao Figma) que se integra diretamente ao Claude Code via MCP (Model Context Protocol). Diferente de ferramentas tradicionais, o Claude consegue **ler, criar e modificar** designs programaticamente em arquivos `.pen`.

**Proposta:** Design on canvas. Land in code.

## Por que usar no ChatFunnel?

| Problema | Como Pencil resolve |
|----------|---------------------|
| Prototipar tela nova e demorado | Claude gera o design completo a partir de descricao textual |
| Traduzir design pra Vue e manual | Claude le o `.pen` e gera componentes Vue/Tailwind direto |
| Manter consistencia visual | Design system com tokens, variaveis e componentes reutilizaveis |
| Feedback loop design/code lento | Tudo acontece na mesma sessao Claude — descreve, desenha, gera codigo |

## Setup

```bash
# 1. Instalar CLI global
npm install -g @pencil.dev/cli

# 2. O MCP server ja esta configurado no workspace
# Ferramentas pencil.* ficam disponiveis automaticamente no Claude Code
```

## Ferramentas Disponiveis (MCP Tools)

### Leitura e Navegacao

| Tool | Quando usar |
|------|-------------|
| `get_editor_state` | Inicio de qualquer tarefa — entender arquivo aberto, selecao, contexto |
| `batch_get` | Buscar nodes por padrao (tipo, nome, reusable) ou por ID |
| `get_variables` | Ver design tokens (cores, fontes, radius) definidos no arquivo |
| `get_screenshot` | Validar visualmente o resultado apos operacoes de design |
| `get_guidelines` | Carregar guias (Web App, Mobile, Slides, etc.) e estilos visuais |
| `snapshot_layout` | Checar estrutura de layout, encontrar problemas de alinhamento |

### Escrita e Modificacao

| Tool | Quando usar |
|------|-------------|
| `batch_design` | Inserir, copiar, atualizar, mover, deletar nodes (max 25 ops/call) |
| `set_variables` | Criar/atualizar design tokens e temas |
| `replace_all_matching_properties` | Trocar cores, fontes, tamanhos em massa |
| `open_document` | Abrir `.pen` existente ou criar novo (`"new"`) |
| `find_empty_space_on_canvas` | Encontrar espaco livre para novos frames |
| `export_nodes` | Exportar frames como PNG, JPEG, WEBP ou PDF |

## Workflow Tipico

### 1. Prototipar uma tela nova

```
Voce: "Cria um design de tela de configuracoes de integracao WhatsApp"

Claude:
  1. get_editor_state → entender contexto
  2. get_guidelines("Web App") → carregar principios
  3. batch_get(reusable: true) → listar componentes do design system
  4. batch_design → montar a tela usando componentes
  5. get_screenshot → validar resultado visual
  6. Ajustes iterativos ate ficar bom
```

### 2. Gerar codigo Vue a partir do design

```
Voce: "Agora gera o componente Vue dessa tela"

Claude:
  1. batch_get → ler estrutura completa do frame
  2. get_variables → extrair tokens CSS
  3. get_guidelines("Code") → carregar regras de code-gen
  4. Gera componente .vue com Tailwind usando tokens do design
```

### 3. Modificar design existente

```
Voce: "Muda essa sidebar pra dark mode"

Claude:
  1. get_editor_state → ver selecao atual
  2. search_all_unique_properties → encontrar todas as cores usadas
  3. replace_all_matching_properties → trocar cores claras por escuras
  4. get_screenshot → validar
```

### 4. Criar design system do ChatFunnel

```
Voce: "Cria um design system com as cores e fontes do ChatFunnel"

Claude:
  1. set_variables → definir tokens (cores brand, fontes, radius)
  2. batch_design → criar componentes base (Button, Input, Card, etc.)
  3. Marcar como reusable → ficam disponiveis como design system
```

## Operacoes do batch_design

Sintaxe tipo script, cada linha e uma operacao:

```javascript
// Inserir node dentro de um parent
foo = I("parentId", { type: "frame", layout: "vertical", ... })

// Copiar node existente
baz = C("nodeId", "parentId", { ... })

// Substituir node
foo2 = R("nodeId", { ... })

// Atualizar propriedades
U("nodeId", { fill: "$--primary", ... })

// Deletar
D("nodeId")

// Mover
M("nodeId", "newParentId")
```

## Design Tokens (Variaveis)

Cores, fontes e radius sao definidos como variaveis e referenciados com `$--`:

| Token | Uso |
|-------|-----|
| `$--background` | Fundo da pagina |
| `$--foreground` | Texto principal |
| `$--primary` | Cor primaria / acoes |
| `$--muted-foreground` | Texto secundario |
| `$--border` | Bordas e divisores |
| `$--card` | Fundo de cards |
| `$--font-primary` | Headings |
| `$--font-secondary` | Body text |
| `$--radius-m` | Cards, modais |
| `$--radius-pill` | Botoes, inputs |

## Guias Disponiveis

| Guia | Para que |
|------|----------|
| Web App | Dashboards, paineis, CRM — nosso caso principal |
| Mobile App | Telas mobile |
| Design System | Compor telas com componentes reutilizaveis |
| Table | Tabelas e dashboards com dados |
| Code | Gerar codigo a partir de designs |
| Tailwind | Implementacao CSS com Tailwind v4 |
| Landing Page | Paginas de marketing |
| Slides | Apresentacoes |

## Estilos Visuais

25+ estilos pre-definidos disponiveis via `get_guidelines("style", "Nome")`. Alguns uteis:

- **Dark Centered Platform** — dark mode, ideal para dashboard
- **Modular Bento Showcase** — grid cards estilo bento
- **Product Demo** — demonstracao de produto
- **Soft Bento** — cards suaves, moderno

## Dicas Praticas

- **Max 25 operacoes** por `batch_design` — dividir em chamadas logicas
- **Sempre validar** com `get_screenshot` apos operacoes grandes
- **Arquivos `.pen` sao encriptados** — NUNCA usar Read/Grep neles, somente tools MCP
- **Usar componentes existentes** (`reusable: true`) antes de criar frames manuais
- **Nomes de binding unicos** — nunca reutilizar nomes entre chamadas

## Exemplos para ChatFunnel

### Prototipar tela do Livechat
> "Cria um design de tela de livechat com sidebar de conversas, area de mensagens e painel de detalhes do contato"

### Prototipar CRM Kanban
> "Desenha uma board kanban para o CRM com colunas de status e cards de lead com avatar, nome, valor e tags"

### Prototipar editor de funil
> "Cria um design do editor de funil de automacao com sidebar de blocos, canvas central e painel de propriedades"

### Redesign de componente
> "Abre o arquivo X.pen e muda o card de plano para usar as cores brand do ChatFunnel"

## Limitacoes

- Nao substitui Figma para design colaborativo em equipe
- Ideal para prototipagem rapida e geracao de codigo
- Estilos complexos podem precisar de ajuste manual
- Arquivo `.pen` e binario — nao faz diff legivel no git
