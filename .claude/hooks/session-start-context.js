#!/usr/bin/env node

'use strict'

/**
 * SessionStart hook — injects the context pack into the conversation.
 *
 * Reads vault/claude/context-pack.md and vault/claude/handoff.md,
 * outputs them as additionalContext so Claude starts every session
 * knowing where things stand.
 *
 * Also injects today's raw diary note if it exists, so Claude knows
 * what already happened today.
 */

const fs = require('fs')
const path = require('path')

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

function readFileSafe(filePath, maxChars) {
  try {
    if (!fs.existsSync(filePath)) return null
    let content = fs.readFileSync(filePath, 'utf8').trim()
    if (maxChars && content.length > maxChars) {
      content = content.substring(0, maxChars) + '\n\n[... truncado para caber no contexto]'
    }
    return content
  } catch (_) {
    return null
  }
}

function todayDateStr() {
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = now.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

// Main
let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { input += chunk })
process.stdin.on('end', () => {
  try {
    const vault = findVaultRoot()
    if (!vault) {
      // No vault found — exit silently
      console.log(JSON.stringify({}))
      process.exit(0)
    }

    // Clean handoff accumulator from previous session
    const handoffAccumulator = path.join(vault, 'diary', 'raw', '.tracking-handoff.tmp')
    try { if (fs.existsSync(handoffAccumulator)) fs.unlinkSync(handoffAccumulator) } catch (_) {}

    const parts = []

    // 1. Context Pack (main state summary)
    const contextPack = readFileSafe(path.join(vault, 'claude', 'context-pack.md'), 4000)
    if (contextPack) {
      parts.push('## Context Pack\n\n' + contextPack)
    }

    // 2. Handoff (how to resume)
    const handoff = readFileSafe(path.join(vault, 'claude', 'handoff.md'), 3000)
    if (handoff) {
      parts.push('## Handoff\n\n' + handoff)
    }

    // 3. Today's raw diary (what already happened today)
    const todayFile = path.join(vault, 'diary', 'raw', `${todayDateStr()}.md`)
    const todayDiary = readFileSafe(todayFile, 2000)
    if (todayDiary) {
      parts.push('## Notas de hoje (diary raw)\n\n' + todayDiary)
    }

    if (parts.length === 0) {
      console.log(JSON.stringify({}))
      process.exit(0)
    }

    const result = {
      additionalContext: parts.join('\n\n---\n\n')
    }

    console.log(JSON.stringify(result))
    process.exit(0)
  } catch (e) {
    // Never block the session on error
    console.log(JSON.stringify({}))
    process.exit(0)
  }
})
