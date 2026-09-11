#!/usr/bin/env node

'use strict'

/**
 * Stop hook — auto-updates vault/claude/handoff.md after significant work.
 *
 * On each Stop with edits:
 * 1. Reads current tracking data (.tracking-session.tmp)
 * 2. Appends to a persistent accumulator (.tracking-handoff.tmp)
 * 3. Regenerates handoff.md from accumulated session data
 *
 * The accumulator is cleaned at session start by session-start-context.js.
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

function findVaultRoot(startDir) {
  let dir = startDir || process.cwd()
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, 'vault')
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

function findDiaryRoot(startDir) {
  let dir = startDir || process.cwd()
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, 'vault', 'diary')
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

function todayStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function getGitBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim()
  } catch (_) {
    return 'unknown'
  }
}

function readFileSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return ''
    return fs.readFileSync(filePath, 'utf8').trim()
  } catch (_) {
    return ''
  }
}

// ─── Main ──────────────────────────────────────────────────────────

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { input += chunk })
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(input)
    const vault = findVaultRoot()
    const diaryRoot = findDiaryRoot()

    if (!vault || !diaryRoot) {
      process.exit(0)
    }

    const ACCUMULATOR = path.join(diaryRoot, 'raw', '.tracking-handoff.tmp')
    const HANDOFF_FILE = path.join(vault, 'claude', 'handoff.md')

    // Only proceed if there's accumulated data
    if (!fs.existsSync(ACCUMULATOR)) {
      process.exit(0)
    }

    // Read accumulated data (written by track-edit.js and track-bash.js)
    const allTracked = readFileSafe(ACCUMULATOR)
    const allLines = allTracked.split('\n').filter(Boolean)

    const files = [...new Set(allLines.filter(l => !l.startsWith('[bash]')))]
    const commands = [...new Set(allLines.filter(l => l.startsWith('[bash]')).map(l => l.replace('[bash] ', '')))]

    if (files.length === 0 && commands.length === 0) {
      process.exit(0)
    }

    // Extract focus from assistant message
    const assistantMsg = event.last_assistant_message || ''
    const focus = extractFocus(assistantMsg, files)

    // Detect projects touched
    const projects = detectProjects(files)

    // Get branch
    const branch = getGitBranch()

    // Build handoff content
    const handoff = buildHandoff({
      date: todayStr(),
      branch,
      focus,
      files,
      commands,
      projects
    })

    // Write handoff.md
    fs.mkdirSync(path.dirname(HANDOFF_FILE), { recursive: true })
    fs.writeFileSync(HANDOFF_FILE, handoff, 'utf8')

    process.exit(0)
  } catch (e) {
    process.exit(0)
  }
})

// ─── Helpers ───────────────────────────────────────────────────────

function extractFocus(assistantMsg, files) {
  if (!assistantMsg) return inferFocusFromFiles(files)

  const lines = assistantMsg.split('\n')
  const actionPatterns = [
    /^(?:[#*\->\s]*)?(Implementei|Adicionei|Criei|Corrigi|Atualizei|Refatorei|Removi|Configurei|Ajustei|Modifiquei|Automatizei|Extraí|Separei|Migrei|Integrei)\b/i,
    /^(?:[#*\->\s]*)?(Pronto|Feito|Concluído)[.!:]?\s/i,
  ]

  for (const line of lines) {
    const clean = line.replace(/^[#*\->\s]+/, '').trim()
    if (!clean || clean.length < 15 || clean.length > 200) continue
    if (clean.startsWith('```') || clean.startsWith('|')) continue

    for (const p of actionPatterns) {
      if (p.test(clean)) return truncate(clean, 150)
    }
  }

  // Fallback: first substantial line
  for (const line of lines) {
    const clean = line.replace(/^[#*\->\s]+/, '').trim()
    if (!clean || clean.length < 20 || clean.length > 200) continue
    if (clean.startsWith('```') || clean.startsWith('|') || clean.startsWith('`')) continue
    if (/^(Let me|I'll|Vou |Deixa eu|Looking at|Reading )/.test(clean)) continue
    return truncate(clean, 150)
  }

  return inferFocusFromFiles(files)
}

function inferFocusFromFiles(files) {
  if (!files || files.length === 0) return 'Alteracoes no codigo'

  const areas = new Set()
  for (const f of files) {
    const parts = f.replace(/\\/g, '/').split('/')
    if (parts[0] === 'vault') areas.add('documentacao/vault')
    else if (parts[0] === '.claude') areas.add('configuracao Claude Code')
    else if (parts[0]?.startsWith('chatfunnel-')) areas.add(parts[0])
  }

  if (areas.size === 0) return `${files.length} arquivos modificados`
  return `Trabalho em ${[...areas].join(', ')}`
}

function detectProjects(files) {
  const repos = new Set()
  for (const f of files) {
    const parts = f.replace(/\\/g, '/').split('/')
    if (parts[0]?.startsWith('chatfunnel-')) repos.add(parts[0])
    else if (parts[0] === 'vault') repos.add('vault')
    else if (parts[0] === '.claude') repos.add('.claude')
  }
  return [...repos]
}

function truncate(text, max) {
  if (text.length <= max) return text
  const cut = text.substring(0, max - 3).lastIndexOf(' ')
  return text.substring(0, cut > max * 0.6 ? cut : max - 3) + '...'
}

function buildHandoff({ date, branch, focus, files, commands, projects }) {
  const lines = []

  lines.push('---')
  lines.push('type: handoff')
  lines.push('description: Instrucoes para retomar o trabalho em uma nova sessao — atualizado automaticamente pelo hook update-handoff.js.')
  lines.push(`updated: ${date}`)
  lines.push('---')
  lines.push('')
  lines.push('# Handoff — Como retomar')
  lines.push('')
  lines.push('## Ultima sessao')
  lines.push('')
  lines.push(`**Data**: ${date}`)
  lines.push(`**Branch**: ${branch}`)
  if (projects.length > 0) {
    lines.push(`**Repos**: ${projects.join(', ')}`)
  }
  lines.push(`**Foco**: ${focus}`)
  lines.push('')
  lines.push('## O que foi feito')
  lines.push('')

  // Group files by repo/area
  const grouped = groupFiles(files)
  for (const [area, areaFiles] of Object.entries(grouped)) {
    if (Object.keys(grouped).length > 1) {
      lines.push(`**${area}:**`)
    }
    for (const f of areaFiles) {
      lines.push(`- \`${f}\``)
    }
    if (Object.keys(grouped).length > 1) lines.push('')
  }

  if (commands.length > 0) {
    lines.push('')
    lines.push('**Comandos executados:**')
    for (const cmd of commands.slice(0, 10)) {
      lines.push(`- \`${cmd}\``)
    }
  }

  lines.push('')
  lines.push('## Para retomar rapidamente')
  lines.push('')
  lines.push('1. Ler `vault/claude/context-pack.md` para contexto geral')
  lines.push('2. Checar `vault/diary/raw/` para notas brutas do dia')
  if (files.some(f => f.includes('.pen'))) {
    lines.push('3. Feature de design em progresso — verificar arquivos .pen')
  }
  lines.push('')

  return lines.join('\n')
}

function groupFiles(files) {
  const groups = {}
  for (const f of files) {
    const parts = f.replace(/\\/g, '/').split('/')
    let area = 'root'
    if (parts[0]?.startsWith('chatfunnel-')) area = parts[0]
    else if (parts[0] === 'vault') area = 'vault'
    else if (parts[0] === '.claude') area = '.claude'

    if (!groups[area]) groups[area] = []
    groups[area].push(f)
  }
  return groups
}
