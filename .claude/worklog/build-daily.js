#!/usr/bin/env node

'use strict'

// DEPRECATED: This script is no longer used.
// Daily consolidation is now handled by the /dailyvault skill.
// Kept for reference only — safe to delete.

const fs = require('fs')
const path = require('path')

// --- Config ---

const DIARY_ROOT = process.env.DIARY_ROOT || path.join(process.cwd(), 'vault', 'diary')
const RAW_FOLDER = path.join(DIARY_ROOT, 'raw')
const TEMPLATE_PATH = path.join(process.cwd(), '.claude', 'worklog', 'daily-note.md')

function todayRawFilename() {
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = now.getFullYear()
  return `${dd}-${mm}-${yyyy}.md`
}

function todayDailyFilename() {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}.md`
}

function todayLabel() {
  return todayRawFilename().replace('.md', '')
}

// --- Parsing raw entries ---

function parseRawFile(content) {
  const blocks = content.split(/^---$/m).filter((b) => b.trim())
  const entries = []

  for (const block of blocks) {
    const lines = block.trim().split('\n')
    const entry = {
      time: '',
      summary: '',
      userRequest: '',
      source: '',
      project: '',
      filesChanged: [],
      relatedNotes: []
    }

    let i = 0
    if (lines[i] && lines[i].startsWith('# Raw Notes')) {
      i++
      while (i < lines.length && !lines[i].trim()) i++
    }

    if (lines[i] && lines[i].startsWith('### ')) {
      entry.time = lines[i].replace('### ', '').trim()
      i++
    }

    for (; i < lines.length; i++) {
      const line = lines[i]

      if (line.startsWith('**Pedido:**')) {
        entry.userRequest = line.replace('**Pedido:**', '').trim()
      } else if (line.startsWith('**Resultado:**')) {
        entry.summary = line.replace('**Resultado:**', '').trim()
      } else if (line.startsWith('**Projeto:**')) {
        entry.project = line.replace('**Projeto:**', '').trim()
      } else if (line.startsWith('- `') && line.endsWith('`')) {
        entry.filesChanged.push(line.replace(/^- `/, '').replace(/`$/, ''))
      } else if (line.startsWith('- [[')) {
        const match = line.match(/\[\[([^\]]+)\]\]/)
        if (match) entry.relatedNotes.push(match[1])
      }
    }

    if (entry.time || entry.summary) {
      entries.push(entry)
    }
  }

  return entries
}

// --- Consolidation ---

function consolidate(entries) {
  const activities = []
  const allFiles = new Set()
  const allRelated = new Set()
  const projects = new Set()

  for (const e of entries) {
    const parts = []
    if (e.time) parts.push(`**${e.time}**`)
    if (e.summary) parts.push(e.summary)
    if (e.project) {
      parts.push(`_(${e.project})_`)
      projects.add(e.project)
    }
    if (parts.length) activities.push(`- ${parts.join(' — ')}`)

    e.filesChanged.forEach((f) => allFiles.add(f))
    e.relatedNotes.forEach((n) => allRelated.add(n))
  }

  const summaries = entries.filter(e => e.summary).map(e => e.summary)

  return {
    date: todayLabel(),
    resumo: summaries.length > 0
      ? summaries.slice(0, 3).join('. ') + (summaries.length > 3 ? '...' : '')
      : '_Sem resumo disponivel._',
    relacionado: allRelated.size > 0
      ? Array.from(allRelated).map((r) => `- [[${r}]]`).join('\n')
      : '_Sem relacoes identificadas._',
    oqueFiz: activities.length > 0
      ? activities.join('\n')
      : '_Sem atividades registradas._',
    arquivos: allFiles.size > 0
      ? Array.from(allFiles).map((f) => `- \`${f}\``).join('\n')
      : '_Sem arquivos relevantes._',
    projetos: projects.size > 0
      ? Array.from(projects).join(', ')
      : 'chatfunnel'
  }
}

// --- Template rendering ---

function renderTemplate(templateContent, data) {
  return templateContent
    .replace(/\{\{date\}\}/g, data.date)
    .replace(/\{\{resumo\}\}/g, data.resumo)
    .replace(/\{\{relacionado\}\}/g, data.relacionado)
    .replace(/\{\{oqueFiz\}\}/g, data.oqueFiz)
    .replace(/\{\{arquivos\}\}/g, data.arquivos)
    .replace(/\{\{projetos\}\}/g, data.projetos)
}

// --- Main ---

function main() {
  const rawFile = path.join(RAW_FOLDER, todayRawFilename())

  if (!fs.existsSync(rawFile)) {
    console.error(`No raw file found for today: ${rawFile}`)
    process.exit(1)
  }

  const rawContent = fs.readFileSync(rawFile, 'utf8')
  const entries = parseRawFile(rawContent)

  if (entries.length === 0) {
    console.error('No entries found in raw file.')
    process.exit(1)
  }

  console.log(`Found ${entries.length} entries in raw file.`)

  const data = consolidate(entries)

  let template
  if (fs.existsSync(TEMPLATE_PATH)) {
    template = fs.readFileSync(TEMPLATE_PATH, 'utf8')
  } else {
    template = fallbackTemplate()
  }

  const dailyFile = path.join(DIARY_ROOT, todayDailyFilename())
  const output = renderTemplate(template, data)

  fs.writeFileSync(dailyFile, output, 'utf8')
  console.log(`Daily created: ${dailyFile}`)
}

function fallbackTemplate() {
  return `---
title: Daily — {{date}}
tags: [diary, daily]
date: {{date}}
projects: {{projetos}}
---

# Daily — {{date}}

## Resumo
{{resumo}}

## Relacionado
{{relacionado}}

## O que fiz
{{oqueFiz}}

## Arquivos relevantes
{{arquivos}}
`
}

main()
