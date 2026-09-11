#!/usr/bin/env node

'use strict'

/**
 * Stop hook — fires when Claude finishes a response.
 *
 * Two behaviors:
 * 1. No edits this turn → save assistant message to conversation buffer, exit.
 * 2. Edits happened → read conversation buffer, create diary raw note, clean up.
 */

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { findVaultDiary, findAppendScript } = require('./vault-resolve')

const DIARY_ROOT = findVaultDiary()
const TRACKING_FILE = path.join(DIARY_ROOT, 'raw', '.tracking-session.tmp')
const CONV_FILE = path.join(DIARY_ROOT, 'raw', '.tracking-conversation.tmp')

const MAX_CONTEXT_CHARS = 4000
const MIN_CONVERSATION_LENGTH = 500 // minimum assistant msg length to log a conversation-only turn

function timestamp() {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { input += chunk })
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(input)

    if (event.stop_hook_active) {
      process.exit(0)
    }

    const assistantMsg = event.last_assistant_message || ''
    const hasEdits = fs.existsSync(TRACKING_FILE)

    const APPEND_SCRIPT = findAppendScript(DIARY_ROOT)

    if (!hasEdits) {
      // #1: Log significant conversations even without edits
      if (APPEND_SCRIPT && isSignificantConversation(assistantMsg)) {
        const conversation = readConversationBuffer()
        const { context, lastUserPrompt } = parseConversation(conversation)
        const summary = extractSummary(assistantMsg, [])

        if (lastUserPrompt || summary) {
          const note = {
            summary: summary,
            userRequest: lastUserPrompt,
            context: context,
            type: 'conversa',
            source: 'claude-hook'
          }

          try {
            execFileSync('node', [APPEND_SCRIPT], {
              input: JSON.stringify(note),
              cwd: path.dirname(path.dirname(DIARY_ROOT)),
              stdio: ['pipe', 'pipe', 'pipe'],
              timeout: 5000
            })
          } catch (_) {}

          cleanupConversationBuffer()
        } else {
          saveAssistantToBuffer(assistantMsg)
        }
      } else {
        saveAssistantToBuffer(assistantMsg)
      }
      process.exit(0)
    }

    const tracked = fs.readFileSync(TRACKING_FILE, 'utf8').trim()
    if (!tracked) {
      saveAssistantToBuffer(assistantMsg)
      cleanup()
      process.exit(0)
    }

    const trackLines = tracked.split('\n').filter(Boolean)
    const files = [...new Set(trackLines.filter(l => !l.startsWith('[bash]')))]
    const bashCmds = trackLines.filter(l => l.startsWith('[bash]')).map(l => l.replace('[bash] ', ''))

    if (files.length === 0 && bashCmds.length === 0) {
      saveAssistantToBuffer(assistantMsg)
      cleanup()
      process.exit(0)
    }

    if (!APPEND_SCRIPT) {
      cleanup()
      process.exit(0)
    }

    const conversation = readConversationBuffer()
    const { context, lastUserPrompt } = parseConversation(conversation)
    const summary = extractSummary(assistantMsg, files)
    const project = detectProject(files)
    const relatedNotes = extractKeywords(files)

    const note = {
      summary: summary,
      userRequest: stripBufferArtifacts(lastUserPrompt),
      context: context,
      filesChanged: files.length > 0 ? files : undefined,
      commands: bashCmds.length > 0 ? bashCmds : undefined,
      project: project,
      relatedNotes: relatedNotes.length > 0 ? relatedNotes : undefined,
      source: 'claude-hook'
    }

    execFileSync('node', [APPEND_SCRIPT], {
      input: JSON.stringify(note),
      cwd: path.dirname(path.dirname(DIARY_ROOT)), // vault/diary → vault → root
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000
    })

    cleanup()
    process.exit(0)
  } catch (e) {
    cleanup()
    process.exit(0)
  }
})

// ─── Project detection ──────────────────────────────────────────────

function detectProject(files) {
  // Detect from file paths which sub-repo is being worked on
  const repos = new Set()
  for (const f of files) {
    const parts = f.replace(/\\/g, '/').split('/')
    if (parts[0] && parts[0].startsWith('chatfunnel-')) {
      repos.add(parts[0])
    } else if (parts[0] === 'vault') {
      repos.add('vault')
    }
  }
  if (repos.size === 1) return [...repos][0]
  if (repos.size > 1) return [...repos].join(', ')
  return 'chatfunnel'
}

// ─── Keyword extraction ─────────────────────────────────────────────

const SKIP_DIRS = new Set([
  'src', 'components', 'common', 'views', 'ui', 'v2',
  'modals', 'steps', 'hooks', 'utils', 'helpers', 'lib',
  'config', 'assets', 'styles', 'types', 'models', 'enums',
  'services', 'stores', 'composables', 'layouts', 'router',
  'plugins', 'modules', 'shared', 'core', 'base', 'shadcn-custom',
  '__tests__', 'test', 'tests', 'e2e', 'fixtures',
  'database', 'prisma', 'migrations', 'seeders',
])

function toPascalCase(name) {
  return name
    .split(/[-_]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

function extractKeywords(files) {
  const keywords = new Set()

  for (const file of files) {
    const parts = file.replace(/\\/g, '/').split('/')

    // Add repo name directly (e.g., chatfunnel-front → ChatfunnelFront)
    if (parts[0] && parts[0].startsWith('chatfunnel-')) {
      keywords.add(toPascalCase(parts[0]))
    }

    // Add wiki article names if editing vault wiki files
    if (parts[0] === 'vault' && parts[1] === 'wiki' && parts.length >= 4) {
      const filename = parts[parts.length - 1].replace(/\.md$/, '')
      if (filename !== '_index') {
        keywords.add(toPascalCase(filename))
      }
    }

    // Extract significant directory/component names
    for (const part of parts) {
      if (part.includes('.')) continue
      if (SKIP_DIRS.has(part) || SKIP_DIRS.has(part.toLowerCase())) continue

      // PascalCase component names (e.g., ConfigureMcp, OrganizationCardV2)
      if (/^[A-Z][a-zA-Z0-9]*[A-Z]/.test(part)) {
        keywords.add(part)
      }
      // Feature/domain directories (e.g., integrations, livechat, configuration)
      else if (part.length >= 6 && /^[a-z]/.test(part) && !parts[0]?.startsWith('chatfunnel-')) {
        keywords.add(toPascalCase(part))
      }
    }
  }

  return [...keywords].slice(0, 7)
}

// ─── Conversation buffer ────────────────────────────────────────────

function saveAssistantToBuffer(assistantMessage) {
  if (!assistantMessage || !assistantMessage.trim()) return

  try {
    const summary = extractBriefSummary(assistantMessage)
    if (!summary) return

    fs.mkdirSync(path.dirname(CONV_FILE), { recursive: true })
    fs.appendFileSync(CONV_FILE, `[ASSISTANT|${timestamp()}] ${summary}\n===\n`, 'utf8')
  } catch (_) {}
}

function readConversationBuffer() {
  try {
    if (!fs.existsSync(CONV_FILE)) return []
    const raw = fs.readFileSync(CONV_FILE, 'utf8').trim()
    if (!raw) return []

    const entries = raw
      .split(/===\r?\n/)
      .map(e => e.trim())
      .filter(Boolean)

    // #5: Use character limit instead of entry count
    let totalChars = 0
    const result = []
    for (let i = entries.length - 1; i >= 0; i--) {
      totalChars += entries[i].length
      if (totalChars > MAX_CONTEXT_CHARS) break
      result.unshift(entries[i])
    }

    return result
  } catch (_) {
    return []
  }
}

function parseConversation(entries) {
  const parsed = entries.map(entry => {
    const match = entry.match(/^\[(USER|ASSISTANT)\|(\d{2}:\d{2})\]\s(.+)$/s)
    if (!match) return null
    return { role: match[1], time: match[2], message: match[3].trim() }
  }).filter(Boolean)

  if (parsed.length === 0) {
    return { context: [], lastUserPrompt: '' }
  }

  let requestIdx = -1
  for (let i = parsed.length - 1; i >= 0; i--) {
    if (parsed[i].role !== 'USER') continue
    if (!isSubstantiveMessage(parsed[i].message)) continue
    requestIdx = i
    break
  }

  if (requestIdx < 0) {
    for (let i = parsed.length - 1; i >= 0; i--) {
      if (parsed[i].role === 'USER') {
        requestIdx = i
        break
      }
    }
  }

  const lastUserPrompt = requestIdx >= 0 ? cleanRequest(parsed[requestIdx].message) : ''
  const context = requestIdx > 0 ? parsed.slice(0, requestIdx) : []

  return { context, lastUserPrompt }
}

// ─── Significant conversation detection (#1) ───────────────────────

function isSignificantConversation(assistantMsg) {
  if (!assistantMsg) return false
  const len = assistantMsg.trim().length
  if (len < MIN_CONVERSATION_LENGTH) return false

  // Check for decision/analysis indicators
  const signals = [
    /recomendo|sugiro|melhor\s+(opcao|abordagem|usar)/i,
    /decidimos|optamos|vamos\s+com|escolhemos/i,
    /pesquisa|analise|comparacao|referencia/i,
    /arquitetura|design|pattern|padrao/i,
    /brainstorm|mockup|prototipo/i,
    /aprovado|aprovei|aprovamos/i,
  ]
  return signals.some(p => p.test(assistantMsg))
}

// ─── Buffer artifact cleanup (#2) ───────────────────────────────────

function stripBufferArtifacts(text) {
  if (!text) return ''
  return text
    .replace(/\s*={3,}\s*/g, '')  // remove === artifacts
    .replace(/\s*\|{3,}\s*/g, '') // remove ||| artifacts
    .trim()
}

// ─── Message quality filters ────────────────────────────────────────

function isSubstantiveMessage(msg) {
  if (!msg || msg.length < 4) return false
  if (isConfirmation(msg)) return false
  if (isErrorPaste(msg)) return false
  if (/^\/[\w:-]+\s*$/.test(msg)) return false
  if (/^\[(?:codigo|erro|stack-trace|url|path|figma)\]$/.test(msg)) return false
  return true
}

function isConfirmation(msg) {
  const normalized = msg.toLowerCase()
    .replace(/[.!?,;:\s]+$/g, '')
    .replace(/^\s+/, '')

  if (normalized.length > 40) return false

  const confirmPatterns = [
    /^(sim|s|yes|y|yeah|yep|ok|okay|k|certo|beleza|blz|show|isso|bora|vamos|perfeito|exato|exatamente|top|massa|dahora|valeu|obrigado|obg|thanks|thx|pode|po[dç]e\s?(ser|sim|fazer|prosseguir|continuar|seguir|ir)|manda|manda ver|faz isso|vai em frente|vai fundo|segue|seguir em frente|concordo|prossiga|pode (prosseguir|continuar|seguir|fazer)|tá|ta|tb|tambem|também|boa|achei bom)$/i,
    /^pode\s+(prosseguir|continuar|seguir|fazer).*$/i,
  ]

  return confirmPatterns.some(p => p.test(normalized))
}

function isErrorPaste(msg) {
  if (/(?:at\s+\S+\s+\([^)]+\).*\n?){2,}/s.test(msg)) return true
  if (/^\S+\.\w+:\d+\s+(Uncaught|TypeError|ReferenceError|SyntaxError|Error)\b/.test(msg)) return true
  if (/^\[erro\]/.test(msg)) return true
  return false
}

function cleanRequest(msg) {
  let text = msg
  text = text.replace(/^\/[\w:-]+\s*/, '')
  text = text.replace(/^\[(?:codigo|erro|stack-trace|url|path|figma)\]\s*/g, '')
  return text.trim()
}

// ─── Summary extraction ─────────────────────────────────────────────

function extractBriefSummary(assistantMessage) {
  if (!assistantMessage) return ''

  const text = assistantMessage.trim()
  const lines = text.split('\n')

  for (const line of lines) {
    const clean = line.replace(/^[#*\->\s]+/, '').trim()
    if (!clean) continue
    if (clean.startsWith('```') || clean.startsWith('|')) continue
    if (clean.length < 10) continue
    if (/^[`\/\.]/.test(clean) && clean.length < 60) continue

    return truncate(clean, 300)
  }

  return ''
}

function extractSummary(assistantMessage, files) {
  if (!assistantMessage || !assistantMessage.trim()) {
    return fallbackSummary(files)
  }

  const text = assistantMessage.trim()
  const lines = text.split('\n')

  const actionPatterns = [
    /^(?:[#*\->\s]*)?(Implementei|Adicionei|Criei|Corrigi|Atualizei|Refatorei|Removi|Movi|Renomeei|Configurei|Ajustei|Modifiquei|Extraí|Separei|Migrei|Integrei|Conectei|Unifiquei|Simplifiquei|Otimizei)\b/i,
    /^(?:[#*\->\s]*)?(I(?:'ve|'ve)?\s+(?:implemented|added|created|fixed|updated|refactored|removed|moved|renamed|configured|adjusted|modified|extracted|separated|migrated|integrated|connected|unified|simplified|optimized))\b/i,
    /^(?:[#*\->\s]*)?(Pronto|Feito|Concluído|Done)[.!:]?\s/i,
    /^(?:[#*\->\s]*)?(Aqui está|Here'?s?\s+(?:what|the))\b/i,
    /^(?:[#*\->\s]*)?(Altere|Alterei|Alterado)\b/i,
  ]

  for (const line of lines) {
    const clean = line.replace(/^[#*\->\s]+/, '').trim()
    if (!clean || clean.length < 15) continue
    if (clean.startsWith('```') || clean.startsWith('|')) continue

    for (const pattern of actionPatterns) {
      if (pattern.test(clean)) {
        return truncate(clean, 200)
      }
    }
  }

  for (const line of lines) {
    const clean = line.replace(/^[#*\->\s]+/, '').trim()
    if (!clean) continue
    if (clean.startsWith('```') || clean.startsWith('|')) continue
    if (clean.length < 15) continue
    if (/^[`\/\.]/.test(clean) && clean.length < 60) continue
    if (/^(Let me|I'll|I will|Vou |Deixa eu|Vamos |Looking at|Reading )/i.test(clean)) continue
    // #3: Skip code-like lines
    if (/^(import\s|const\s|export\s|function\s|class\s|interface\s|type\s|from\s['"])/.test(clean)) continue
    if (/^[A-Z]:\\|^\/(?:home|usr|mnt|tmp)\//.test(clean)) continue // file paths
    if (/^\d+\s*[|│]/.test(clean)) continue // table/line-number output
    if (/^[-+]{3}\s/.test(clean)) continue // diff headers

    return truncate(clean, 200)
  }

  return fallbackSummary(files)
}

function fallbackSummary(files) {
  if (!files || files.length === 0) return 'Alteracoes no codigo'

  const names = files.map(f => {
    const parts = f.split('/')
    return parts[parts.length - 1].replace(/\.\w+$/, '')
  })

  const unique = [...new Set(names)]

  if (unique.length === 1) return `Modificado ${unique[0]}`
  if (unique.length <= 3) return `Modificados: ${unique.join(', ')}`

  return `${files.length} arquivos modificados`
}

function truncate(text, max) {
  if (text.length <= max) return text
  const cut = text.substring(0, max - 3).lastIndexOf(' ')
  return text.substring(0, cut > max * 0.6 ? cut : max - 3) + '...'
}

// ─── Cleanup ────────────────────────────────────────────────────────

function cleanup() {
  try { if (fs.existsSync(TRACKING_FILE)) fs.unlinkSync(TRACKING_FILE) } catch (_) {}
  cleanupConversationBuffer()
}

// #4: Only clean conversation buffer, preserve session tracking independently
function cleanupConversationBuffer() {
  try { if (fs.existsSync(CONV_FILE)) fs.unlinkSync(CONV_FILE) } catch (_) {}
}
