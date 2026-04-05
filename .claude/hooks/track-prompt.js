#!/usr/bin/env node

'use strict'

/**
 * UserPromptSubmit hook — fires when the user submits a prompt.
 * Appends the user's prompt to a conversation buffer so the Stop hook
 * has full context when creating diary entries.
 */

const fs = require('fs')
const path = require('path')
const { findVaultDiary } = require('./vault-resolve')

const DIARY_ROOT = findVaultDiary()
const CONV_FILE = path.join(DIARY_ROOT, 'raw', '.tracking-conversation.tmp')

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
    const prompt = event.prompt

    if (!prompt || !prompt.trim()) {
      process.exit(0)
    }

    const cleaned = cleanForBuffer(prompt.trim())
    if (!cleaned) {
      process.exit(0)
    }

    fs.mkdirSync(path.dirname(CONV_FILE), { recursive: true })
    fs.appendFileSync(CONV_FILE, `[USER|${timestamp()}] ${cleaned}\n===\n`, 'utf8')

    process.exit(0)
  } catch (e) {
    // Never block on error
    process.exit(0)
  }
})

function cleanForBuffer(raw) {
  let text = raw

  // Strip slash commands
  text = text.replace(/^\/[\w:-]+\s*/g, '')

  // Compress code blocks and long inline code
  text = text.replace(/```[\s\S]*?```/g, '[codigo]')
  text = text.replace(/`[^`]{80,}`/g, '[codigo]')

  // Compress URLs
  text = text.replace(/https?:\/\/\S{60,}/g, '[url]')
  text = text.replace(/https?:\/\/(?:www\.)?figma\.com\/\S+/g, '[figma]')

  // Compress error stack traces
  text = text.replace(/(?:at\s+\S+\s+\([^)]+\)\s*\n?){2,}/g, '[stack-trace]')

  // Compress browser-style errors
  text = text.replace(/\S+\.\w+:\d+\s+(Uncaught|TypeError|ReferenceError|SyntaxError|Error)[^\n]{0,200}/g, '[erro]')

  // Compress long file paths
  text = text.replace(/(?:[A-Z]:\\|\/(?:home|usr|var|tmp)\/)\S{60,}/g, '[path]')

  text = text.replace(/\s+/g, ' ').trim()

  if (!text || text === '[codigo]' || text === '[erro]' || text === '[stack-trace]') {
    return ''
  }

  if (text.length > 300) {
    const sentenceEnd = text.substring(0, 300).lastIndexOf('.')
    if (sentenceEnd > 120) {
      text = text.substring(0, sentenceEnd + 1)
    } else {
      text = text.substring(0, 297) + '...'
    }
  }

  return text
}
