#!/usr/bin/env node

'use strict'

/**
 * PostToolUse hook — fires after each Bash command.
 * Tracks significant commands (git, npm, build, deploy) to the session file.
 * Ignores noisy commands (ls, cd, cat, echo, etc.)
 */

const fs = require('fs')
const path = require('path')
const { findVaultDiary } = require('./vault-resolve')

const DIARY_ROOT = findVaultDiary()
const TRACKING_FILE = path.join(DIARY_ROOT, 'raw', '.tracking-session.tmp')

// Commands worth tracking
const SIGNIFICANT_PATTERNS = [
  /^git\s+(commit|push|pull|merge|rebase|checkout\s+-b|branch\s+-[dD]|stash|tag|reset)/,
  /^npm\s+(run\s+(build|dev|test|lint|format|typecheck|e2e|storybook)|install|ci|publish)/,
  /^npx\s/,
  /^docker\s+(build|run|compose|push|pull)/,
  /^prisma\s+(migrate|generate|db\s+push)/,
  /^go\s+(build|run|test)/,
  /^cargo\s+(build|run|test)/,
  /^make\b/,
  /^curl\s/,
  /^ssh\s/,
]

// Commands to always ignore
const IGNORE_PATTERNS = [
  /^(ls|dir|cd|pwd|cat|head|tail|echo|printf|wc|date|whoami)\b/,
  /^(grep|rg|find|which|where|type)\b/,
  /^(mkdir|touch|rm\s+-rf?\s+node_modules)\b/,
  /^(nohup|sleep|kill|ps|top)\b/,
  /^bash\s+-c\s+'r=/,  // hook self-invocations
]

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { input += chunk })
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(input)
    const command = event.tool_input && event.tool_input.command

    if (!command || !command.trim()) {
      process.exit(0)
    }

    const cmd = command.trim().split('\n')[0] // first line only

    // Check ignore list first
    if (IGNORE_PATTERNS.some(p => p.test(cmd))) {
      process.exit(0)
    }

    // Check if significant
    if (!SIGNIFICANT_PATTERNS.some(p => p.test(cmd))) {
      process.exit(0)
    }

    // Truncate long commands
    const tracked = cmd.length > 120 ? cmd.substring(0, 117) + '...' : cmd

    fs.mkdirSync(path.dirname(TRACKING_FILE), { recursive: true })
    fs.appendFileSync(TRACKING_FILE, `[bash] ${tracked}\n`, 'utf8')

    process.exit(0)
  } catch (e) {
    process.exit(0)
  }
})
