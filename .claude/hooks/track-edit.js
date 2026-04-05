#!/usr/bin/env node

'use strict'

/**
 * PostToolUse hook — fires after each Edit/Write.
 * Appends the modified file path to a temp tracking file.
 * The Stop hook reads this file to build a single diary entry.
 */

const fs = require('fs')
const path = require('path')
const { findVaultDiary } = require('./vault-resolve')

const DIARY_ROOT = findVaultDiary()
const TRACKING_FILE = path.join(DIARY_ROOT, 'raw', '.tracking-session.tmp')

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { input += chunk })
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(input)
    const filePath = event.tool_input && event.tool_input.file_path

    if (!filePath) {
      process.exit(0)
    }

    // Make path relative to cwd for cleaner output
    const cwd = event.cwd || process.cwd()
    const relative = path.relative(cwd, filePath).replace(/\\/g, '/')

    // Skip vault internal files and .claude config
    if (relative.startsWith('vault/diary/raw/') || relative.startsWith('.claude/')) {
      process.exit(0)
    }

    fs.mkdirSync(path.dirname(TRACKING_FILE), { recursive: true })
    fs.appendFileSync(TRACKING_FILE, relative + '\n', 'utf8')

    process.exit(0)
  } catch (e) {
    // Never block on error
    process.exit(0)
  }
})
