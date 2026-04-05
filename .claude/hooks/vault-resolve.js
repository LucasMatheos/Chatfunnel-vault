#!/usr/bin/env node

'use strict'

/**
 * Shared utility to resolve the vault diary directory.
 * Walks up from cwd until it finds vault/diary/ or reaches filesystem root.
 * This allows any sub-repo (chatfunnel-front, chatfunnel-services, etc.)
 * to write to the same centralized vault.
 */

const fs = require('fs')
const path = require('path')

function findVaultDiary(startDir) {
  let dir = startDir || process.cwd()

  // Walk up max 5 levels
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, 'vault', 'diary')
    if (fs.existsSync(candidate)) {
      return candidate
    }
    const parent = path.dirname(dir)
    if (parent === dir) break // filesystem root
    dir = parent
  }

  // Fallback: create at cwd
  const fallback = path.join(process.cwd(), 'vault', 'diary')
  fs.mkdirSync(path.join(fallback, 'raw'), { recursive: true })
  return fallback
}

function findAppendScript(diaryRoot) {
  // Walk up from diary to find .claude/worklog/append-raw-note.js
  let dir = path.dirname(path.dirname(diaryRoot)) // vault/diary → vault → root
  const script = path.join(dir, '.claude', 'worklog', 'append-raw-note.js')
  if (fs.existsSync(script)) return script

  // Fallback: look in cwd
  const cwdScript = path.join(process.cwd(), '.claude', 'worklog', 'append-raw-note.js')
  if (fs.existsSync(cwdScript)) return cwdScript

  return null
}

module.exports = { findVaultDiary, findAppendScript }
