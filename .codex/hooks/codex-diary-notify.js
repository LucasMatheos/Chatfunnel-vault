#!/usr/bin/env node

'use strict'

/**
 * Codex `notify` hook — espelha o comportamento do diary-stop.js do Claude.
 *
 * Codex CLI invoca este script ao fim de cada turno com um argumento JSON:
 *   {
 *     "type": "agent-turn-complete",
 *     "turn-id": "...",
 *     "input-messages": ["..."],          // user prompt(s)
 *     "last-assistant-message": "..."     // resposta final do assistente
 *   }
 *
 * O payload tambem pode chegar via stdin (depende da versao do Codex CLI).
 * Aceita ambos os caminhos defensivamente.
 *
 * Acoes:
 *  1. Acrescenta USER/ASSISTANT no mesmo buffer compartilhado
 *     (vault/diary/raw/.tracking-conversation.tmp) com prefixo "codex".
 *  2. Detecta arquivos alterados via `git diff --name-only` (HEAD + unstaged).
 *  3. Se houve mudanca OU a conversa for "significativa", chama
 *     .claude/worklog/append-raw-note.js com source="codex-hook".
 *
 * Nunca lanca: hook silencioso por design, exit 0 sempre.
 */

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

// Reaproveita o resolver de vault do Claude (mesmo formato/destino).
const { findVaultDiary, findAppendScript } = require(
  path.join(__dirname, '..', '..', '.claude', 'hooks', 'vault-resolve.js')
)

const DIARY_ROOT = findVaultDiary()
const CONV_FILE = path.join(DIARY_ROOT, 'raw', '.tracking-conversation.tmp')
const MAX_CONTEXT_CHARS = 4000
const MIN_CONVERSATION_LENGTH = 300

function timestamp() {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

async function readPayload() {
  // 1. argv: Codex passa o JSON como ultimo argumento.
  for (let i = process.argv.length - 1; i >= 2; i--) {
    const arg = process.argv[i]
    if (typeof arg === 'string' && arg.trim().startsWith('{')) {
      try { return JSON.parse(arg) } catch (_) {}
    }
  }

  // 2. stdin (fallback).
  if (!process.stdin.isTTY) {
    return await new Promise((resolve) => {
      let buf = ''
      process.stdin.setEncoding('utf8')
      process.stdin.on('data', (c) => { buf += c })
      process.stdin.on('end', () => {
        const trimmed = buf.trim()
        if (!trimmed) return resolve(null)
        try { resolve(JSON.parse(trimmed)) } catch (_) { resolve(null) }
      })
      setTimeout(() => resolve(null), 500)
    })
  }

  return null
}

;(async () => {
  try {
    const event = await readPayload()
    if (!event || event.type !== 'agent-turn-complete') {
      process.exit(0)
    }

    const userMessages = Array.isArray(event['input-messages'])
      ? event['input-messages']
      : (Array.isArray(event.input_messages) ? event.input_messages : [])

    const lastUserMsg = userMessages.length > 0
      ? String(userMessages[userMessages.length - 1] || '').trim()
      : ''

    const assistantMsg = String(
      event['last-assistant-message'] || event.last_assistant_message || ''
    ).trim()

    // 1. Append no buffer compartilhado (formato compativel com diary-stop.js).
    appendToBuffer('USER', lastUserMsg)
    appendToBuffer('ASSISTANT', extractBriefSummary(assistantMsg))

    // 2. Detecta arquivos alterados pelo turno (best-effort).
    const files = detectChangedFiles()

    // 3. Decide se cria raw note agora.
    const APPEND_SCRIPT = findAppendScript(DIARY_ROOT)
    const significant = isSignificantConversation(assistantMsg)
    const hasEdits = files.length > 0

    if (APPEND_SCRIPT && (hasEdits || significant)) {
      const conversation = readConversationBuffer()
      const { context, lastUserPrompt } = parseConversation(conversation)
      const summary = extractSummary(assistantMsg, files)
      const project = detectProject(files)
      const relatedNotes = extractKeywords(files)

      const note = {
        summary,
        userRequest: stripBufferArtifacts(lastUserPrompt || lastUserMsg),
        context,
        filesChanged: hasEdits ? files : undefined,
        project,
        relatedNotes: relatedNotes.length > 0 ? relatedNotes : undefined,
        type: hasEdits ? undefined : 'conversa',
        source: 'codex-hook',
      }

      try {
        execFileSync('node', [APPEND_SCRIPT], {
          input: JSON.stringify(note),
          cwd: path.dirname(path.dirname(DIARY_ROOT)),
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 5000,
        })
        cleanupConversationBuffer()
      } catch (_) {}
    }

    process.exit(0)
  } catch (_) {
    process.exit(0)
  }
})()

// ─── Buffer compartilhado ───────────────────────────────────────────

function appendToBuffer(role, text) {
  if (!text) return
  const cleaned = clean(text)
  if (!cleaned) return
  try {
    fs.mkdirSync(path.dirname(CONV_FILE), { recursive: true })
    fs.appendFileSync(CONV_FILE, `[${role}|codex|${timestamp()}] ${cleaned}\n===\n`, 'utf8')
  } catch (_) {}
}

function clean(raw) {
  let text = String(raw || '')
  text = text.replace(/```[\s\S]*?```/g, '[codigo]')
  text = text.replace(/`[^`]{80,}`/g, '[codigo]')
  text = text.replace(/https?:\/\/\S{60,}/g, '[url]')
  text = text.replace(/(?:at\s+\S+\s+\([^)]+\)\s*\n?){2,}/g, '[stack-trace]')
  text = text.replace(/(?:[A-Z]:\\|\/(?:home|usr|var|tmp)\/)\S{60,}/g, '[path]')
  text = text.replace(/\s+/g, ' ').trim()
  if (!text || text === '[codigo]' || text === '[erro]' || text === '[stack-trace]') return ''
  if (text.length > 600) text = text.substring(0, 597) + '...'
  return text
}

function readConversationBuffer() {
  try {
    if (!fs.existsSync(CONV_FILE)) return []
    const raw = fs.readFileSync(CONV_FILE, 'utf8').trim()
    if (!raw) return []
    const entries = raw.split(/===\r?\n/).map((e) => e.trim()).filter(Boolean)
    let total = 0
    const out = []
    for (let i = entries.length - 1; i >= 0; i--) {
      total += entries[i].length
      if (total > MAX_CONTEXT_CHARS) break
      out.unshift(entries[i])
    }
    return out
  } catch (_) {
    return []
  }
}

function parseConversation(entries) {
  const parsed = entries.map((entry) => {
    // Aceita tanto "[USER|HH:MM]" (Claude) quanto "[USER|codex|HH:MM]".
    const m = entry.match(/^\[(USER|ASSISTANT)(?:\|[^|\]]+)?\|(\d{2}:\d{2})\]\s([\s\S]+)$/)
    if (!m) return null
    return { role: m[1], time: m[2], message: m[3].trim() }
  }).filter(Boolean)

  if (parsed.length === 0) return { context: [], lastUserPrompt: '' }

  let idx = -1
  for (let i = parsed.length - 1; i >= 0; i--) {
    if (parsed[i].role === 'USER' && isSubstantive(parsed[i].message)) { idx = i; break }
  }
  if (idx < 0) {
    for (let i = parsed.length - 1; i >= 0; i--) {
      if (parsed[i].role === 'USER') { idx = i; break }
    }
  }

  const lastUserPrompt = idx >= 0 ? parsed[idx].message : ''
  const context = idx > 0 ? parsed.slice(0, idx) : []
  return { context, lastUserPrompt }
}

function cleanupConversationBuffer() {
  try { if (fs.existsSync(CONV_FILE)) fs.unlinkSync(CONV_FILE) } catch (_) {}
}

// ─── Mudancas via git ───────────────────────────────────────────────

function detectChangedFiles() {
  const root = path.dirname(path.dirname(DIARY_ROOT)) // vault/diary -> root
  try {
    const out = execFileSync('git', ['diff', '--name-only', 'HEAD'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
      encoding: 'utf8',
    })
    const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
      encoding: 'utf8',
    })
    const all = (out + '\n' + untracked).split('\n').map((s) => s.trim()).filter(Boolean)
    return [...new Set(all)].filter((f) => !f.startsWith('vault/diary/raw/.tracking'))
  } catch (_) {
    return []
  }
}

// ─── Filtros (espelham diary-stop.js) ──────────────────────────────

function isSignificantConversation(msg) {
  if (!msg) return false
  if (msg.length < MIN_CONVERSATION_LENGTH) return false
  const signals = [
    /recomendo|sugiro|melhor\s+(opcao|abordagem|usar)/i,
    /decidimos|optamos|vamos\s+com|escolhemos/i,
    /pesquisa|analise|comparacao|referencia/i,
    /arquitetura|design|pattern|padrao/i,
    /brainstorm|mockup|prototipo/i,
    /aprovado|aprovei|aprovamos/i,
  ]
  return signals.some((p) => p.test(msg))
}

function isSubstantive(msg) {
  if (!msg || msg.length < 4) return false
  if (/^(sim|s|ok|certo|beleza|valeu|obg|thanks|thx)$/i.test(msg.trim())) return false
  return true
}

function stripBufferArtifacts(text) {
  if (!text) return ''
  return text.replace(/\s*={3,}\s*/g, '').replace(/\s*\|{3,}\s*/g, '').trim()
}

// ─── Project / keyword detection (copia enxuta de diary-stop.js) ───

const SKIP_DIRS = new Set([
  'src', 'components', 'common', 'views', 'ui', 'v2', 'modals', 'steps',
  'hooks', 'utils', 'helpers', 'lib', 'config', 'assets', 'styles', 'types',
  'models', 'enums', 'services', 'stores', 'composables', 'layouts', 'router',
  'plugins', 'modules', 'shared', 'core', 'base', 'shadcn-custom',
  '__tests__', 'test', 'tests', 'e2e', 'fixtures',
  'database', 'prisma', 'migrations', 'seeders',
])

function toPascalCase(name) {
  return name.split(/[-_]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('')
}

function detectProject(files) {
  const repos = new Set()
  for (const f of files) {
    const parts = f.replace(/\\/g, '/').split('/')
    if (parts[0]?.startsWith('chatfunnel-')) repos.add(parts[0])
    else if (parts[0] === 'vault') repos.add('vault')
  }
  if (repos.size === 1) return [...repos][0]
  if (repos.size > 1) return [...repos].join(', ')
  return 'chatfunnel'
}

function extractKeywords(files) {
  const kws = new Set()
  for (const file of files) {
    const parts = file.replace(/\\/g, '/').split('/')
    if (parts[0]?.startsWith('chatfunnel-')) kws.add(toPascalCase(parts[0]))
    if (parts[0] === 'vault' && parts[1] === 'wiki' && parts.length >= 4) {
      const fn = parts[parts.length - 1].replace(/\.md$/, '')
      if (fn !== '_index') kws.add(toPascalCase(fn))
    }
    for (const part of parts) {
      if (part.includes('.')) continue
      if (SKIP_DIRS.has(part) || SKIP_DIRS.has(part.toLowerCase())) continue
      if (/^[A-Z][a-zA-Z0-9]*[A-Z]/.test(part)) kws.add(part)
      else if (part.length >= 6 && /^[a-z]/.test(part) && !parts[0]?.startsWith('chatfunnel-')) {
        kws.add(toPascalCase(part))
      }
    }
  }
  return [...kws].slice(0, 7)
}

// ─── Summaries ─────────────────────────────────────────────────────

function extractBriefSummary(assistantMessage) {
  if (!assistantMessage) return ''
  const lines = assistantMessage.split('\n')
  for (const line of lines) {
    const c = line.replace(/^[#*\->\s]+/, '').trim()
    if (!c || c.startsWith('```') || c.startsWith('|')) continue
    if (c.length < 10) continue
    if (/^[`\/\.]/.test(c) && c.length < 60) continue
    return truncate(c, 300)
  }
  return ''
}

function extractSummary(assistantMessage, files) {
  if (!assistantMessage) return fallbackSummary(files)
  const lines = assistantMessage.split('\n')
  const action = /^(Implementei|Adicionei|Criei|Corrigi|Atualizei|Refatorei|Removi|Movi|Renomeei|Configurei|Ajustei|Modifiquei|Pronto|Feito|Conclui)/i
  for (const line of lines) {
    const c = line.replace(/^[#*\->\s]+/, '').trim()
    if (c.length < 15) continue
    if (c.startsWith('```') || c.startsWith('|')) continue
    if (action.test(c)) return truncate(c, 200)
  }
  for (const line of lines) {
    const c = line.replace(/^[#*\->\s]+/, '').trim()
    if (!c || c.length < 15 || c.startsWith('```') || c.startsWith('|')) continue
    if (/^(Let me|I'll|Vou |Deixa eu|Vamos )/i.test(c)) continue
    return truncate(c, 200)
  }
  return fallbackSummary(files)
}

function fallbackSummary(files) {
  if (!files?.length) return 'Alteracoes via Codex'
  const names = files.map((f) => {
    const p = f.split('/')
    return p[p.length - 1].replace(/\.\w+$/, '')
  })
  const u = [...new Set(names)]
  if (u.length === 1) return `Modificado ${u[0]}`
  if (u.length <= 3) return `Modificados: ${u.join(', ')}`
  return `${files.length} arquivos modificados`
}

function truncate(text, max) {
  if (text.length <= max) return text
  const cut = text.substring(0, max - 3).lastIndexOf(' ')
  return text.substring(0, cut > max * 0.6 ? cut : max - 3) + '...'
}
