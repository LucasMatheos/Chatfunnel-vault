#!/usr/bin/env node

'use strict'

const fs = require('fs')
const path = require('path')

// --- Config ---

const DIARY_ROOT = process.env.DIARY_ROOT || path.join(process.cwd(), 'vault', 'diary')
const RAW_FOLDER = path.join(DIARY_ROOT, 'raw')

function todayFilename() {
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = now.getFullYear()
  return `${dd}-${mm}-${yyyy}.md`
}

function timestamp() {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  return `${hh}:${min}`
}

// --- Input parsing ---

function parseInput(raw) {
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null) return parsed
  } catch (_) {}
  return { summary: raw.trim() }
}

function readFromStdin() {
  return new Promise((resolve, reject) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => { data += chunk })
    process.stdin.on('end', () => resolve(data.trim()))
    process.stdin.on('error', reject)
    if (process.stdin.isTTY) resolve('')
  })
}

async function getInput() {
  const args = process.argv.slice(2)
  if (args.length > 0) {
    return parseInput(args.join(' '))
  }

  const stdinData = await readFromStdin()
  if (stdinData) {
    return parseInput(stdinData)
  }

  console.error('Error: no input provided.')
  process.exit(1)
}

// --- Markdown formatting ---

function formatEntry(data) {
  const lines = []
  lines.push(`### ${timestamp()}`)
  lines.push('')

  if (data.context && Array.isArray(data.context) && data.context.length > 0) {
    lines.push('**Contexto:**')
    for (const msg of data.context) {
      const roleLabel = msg.role === 'USER' ? 'Eu' : 'Claude'
      const timePrefix = msg.time ? `[${msg.time}] ` : ''
      lines.push(`> **${timePrefix}${roleLabel}:** ${msg.message}`)
    }
    lines.push('')
  }

  if (data.userRequest) {
    lines.push(`**Pedido:** ${data.userRequest}`)
    lines.push('')
  }

  if (data.summary) {
    lines.push(`**Resultado:** ${data.summary}`)
    lines.push('')
  }

  if (data.project) {
    lines.push(`**Projeto:** ${data.project}`)
  }

  if (data.filesChanged) {
    const files = Array.isArray(data.filesChanged) ? data.filesChanged : [data.filesChanged]
    lines.push('')
    lines.push('**Arquivos:**')
    files.forEach((f) => lines.push(`- \`${f}\``))
  }

  if (data.relatedNotes) {
    const notes = Array.isArray(data.relatedNotes) ? data.relatedNotes : [data.relatedNotes]
    lines.push('')
    lines.push('**Relacionado:**')
    notes.forEach((n) => lines.push(`- [[${n}]]`))
  }

  lines.push('')
  lines.push('---')
  lines.push('')

  return lines.join('\n')
}

// --- Dedup check ---

function isDuplicate(existingContent, newEntry) {
  if (!existingContent) return false

  const blocks = existingContent.split(/^---$/m).filter((b) => b.trim())
  if (blocks.length === 0) return false

  const lastBlock = blocks[blocks.length - 1].trim()
  const normalize = (text) => text
    .replace(/^### \d{2}:\d{2}\s*\n/, '')
    .replace(/\*\*Contexto:\*\*[\s\S]*?\n\n/, '')
    .replace(/---\s*$/, '')
    .trim()

  return normalize(lastBlock) === normalize(newEntry)
}

// --- Main ---

async function main() {
  const data = await getInput()
  const filename = todayFilename()
  const filepath = path.join(RAW_FOLDER, filename)

  fs.mkdirSync(RAW_FOLDER, { recursive: true })

  let existing = ''
  if (fs.existsSync(filepath)) {
    existing = fs.readFileSync(filepath, 'utf8')
  } else {
    const header = `# Raw Notes — ${todayFilename().replace('.md', '')}\n\n`
    fs.writeFileSync(filepath, header, 'utf8')
    existing = header
  }

  const entry = formatEntry(data)

  if (isDuplicate(existing, entry)) {
    console.log('Skipped: duplicate of last entry.')
    return
  }

  fs.appendFileSync(filepath, entry, 'utf8')
  console.log(`Appended to ${filepath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
