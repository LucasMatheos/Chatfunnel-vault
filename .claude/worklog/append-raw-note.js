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

  if (data.type) {
    lines.push(`**Tipo:** ${data.type}`)
    lines.push('')
  }

  if (data.userRequest) {
    // Strip buffer artifacts (===, |||) that may leak from conversation tracking
    const cleanRequest = data.userRequest.replace(/\s*={3,}\s*/g, '').replace(/\s*\|{3,}\s*/g, '').trim()
    if (cleanRequest) {
      lines.push(`**Pedido:** ${cleanRequest}`)
      lines.push('')
    }
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

  if (data.commands) {
    const cmds = Array.isArray(data.commands) ? data.commands : [data.commands]
    lines.push('')
    lines.push('**Comandos:**')
    cmds.forEach((c) => lines.push(`- \`${c}\``))
  }

  // Resolve wiki links to real vault notes; anything without a match becomes a tag
  if (data.relatedNotes) {
    const notes = Array.isArray(data.relatedNotes) ? data.relatedNotes : [data.relatedNotes]
    const wikiLinks = []
    const tags = []

    for (const n of notes) {
      const resolved = resolveWikiLink(n)
      if (resolved) {
        wikiLinks.push(resolved)
      } else {
        // Convert to tag: PascalCase → kebab-case
        const tag = n.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
        tags.push(tag)
      }
    }

    if (wikiLinks.length > 0) {
      lines.push('')
      lines.push('**Relacionado:**')
      wikiLinks.forEach((l) => lines.push(`- ${l}`))
    }

    if (tags.length > 0) {
      lines.push('')
      lines.push(`**Tags:** ${tags.map(t => '#' + t).join(' ')}`)
    }
  }

  lines.push('')
  lines.push('---')
  lines.push('')

  return lines.join('\n')
}

// --- Wiki link resolution ---

// Map of known keyword → vault wiki path (relative to vault/)
// Built from the actual vault structure so links always point to real notes
const WIKI_MAP = {
  // Repos
  'chatfunnelfront':     '[[wiki/repos/chatfunnel-front|chatfunnel-front]]',
  'chatfunnelapi':       '[[wiki/repos/chatfunnel-api|chatfunnel-api]]',
  'chatfunnelservices':  '[[wiki/repos/chatfunnel-services|chatfunnel-services]]',
  'chatfunnelcore':      '[[wiki/repos/chatfunnel-core|chatfunnel-core]]',
  'chatfunnelwebsocket': '[[wiki/repos/chatfunnel-websocket|chatfunnel-websocket]]',
  'chatfunnelgateway':   '[[wiki/repos/chatfunnel-gateway|chatfunnel-gateway]]',
  'chatfunnelmcp':       '[[wiki/repos/chatfunnel-mcp|chatfunnel-mcp]]',
  'chatfunnelexternalapi': '[[wiki/repos/chatfunnel-external-api|chatfunnel-external-api]]',
  'chatfunnelworkerbroadcast': '[[wiki/repos/chatfunnel-worker-broadcast|chatfunnel-worker-broadcast]]',
  'chatfunnelscheduler': '[[wiki/repos/chatfunnel-scheduler|chatfunnel-scheduler]]',

  // Features
  'contacts':    '[[wiki/features/contacts|Contacts]]',
  'broadcast':   '[[wiki/features/broadcast|Broadcast]]',
  'aiagents':    '[[wiki/features/ai-agents|AI Agents]]',
  'crmkanban':   '[[wiki/features/crm-kanban|CRM Kanban]]',
  'channels':    '[[wiki/features/channels|Channels]]',
  'livechat':    '[[wiki/features/livechat|Livechat]]',
  'automations': '[[wiki/features/automations|Automations]]',
  'mcpintegration': '[[wiki/features/mcp-integration|MCP Integration]]',
  'organizationform': '[[wiki/features/organization-form|Organization Form]]',

  // Architecture
  'multitentancy': '[[wiki/architecture/multi-tenancy|Multi-Tenancy]]',
  'authflow':      '[[wiki/architecture/auth-flow|Auth Flow]]',
  'messageflow':   '[[wiki/architecture/message-flow|Message Flow]]',
  'queuearchitecture': '[[wiki/architecture/queue-architecture|Queue Architecture]]',
}

function resolveWikiLink(keyword) {
  // Normalize: remove hyphens, spaces, lowercase
  const key = keyword.replace(/[-_\s]/g, '').toLowerCase()
  return WIKI_MAP[key] || null
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
    const dateStr = todayFilename().replace('.md', '')
    const isoDate = dateStr.split('-').reverse().join('-') // DD-MM-YYYY → YYYY-MM-DD
    const header = [
      '---',
      `date: ${isoDate}`,
      'type: raw',
      'tags: [diary, raw]',
      '---',
      '',
      `# Raw Notes — ${dateStr}`,
      '',
      '',
    ].join('\n')
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
