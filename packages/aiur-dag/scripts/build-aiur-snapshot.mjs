#!/usr/bin/env node
/**
 * Builds the aiur-dag fixture snapshot for aiur-team/aiur.
 *
 * Reads a local clone of the repo (bare or working), extracts the current file
 * tree and the oldest-first commit log, and writes the manifest that the
 * browser consumes. Run after cloning:
 *
 *   git clone --bare https://github.com/aiur-team/aiur.git /tmp/aiur-bare
 *   node packages/aiur-dag/scripts/build-aiur-snapshot.mjs /tmp/aiur-bare
 *
 * The output is written to packages/aiur-dag/fixtures/aiur.json.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_OWNER = 'aiur-team'
const REPO_NAME = 'aiur'
const BRANCH = 'main'

const here = dirname(fileURLToPath(import.meta.url))
const fixturePath = resolve(here, '../fixtures/aiur.json')
const clonePath = process.argv[2]
if (!clonePath) {
  console.error('usage: build-aiur-snapshot.mjs <path-to-aiur-clone>')
  process.exit(1)
}

function git(args) {
  return execFileSync('git', ['-C', clonePath, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
}

const tree = git(['ls-tree', '-r', '--name-only', BRANCH])
  .split('\n')
  .filter(Boolean)
  .map((path) => ({ path }))

const logLines = git(['log', BRANCH, '--format=%H|%cI|%an', '--name-only'])
  .split('\n')
  .filter(Boolean)

const commits = []
let current = null
for (const line of logLines) {
  if (line.includes('|') && /^[0-9a-f]{40}/.test(line)) {
    if (current) commits.push(current)
    const [sha, date, ...authorParts] = line.split('|')
    current = {
      sha,
      date,
      author: authorParts.join('|'),
      url: `https://github.com/${REPO_OWNER}/${REPO_NAME}/commit/${sha}`,
      files: [],
    }
    continue
  }
  if (current && !line.startsWith('"') && !line.includes('\0')) {
    current.files.push(line)
  }
}
if (current) commits.push(current)

commits.reverse()

const snapshot = {
  repo: { owner: REPO_OWNER, name: REPO_NAME, branch: BRANCH },
  files: tree,
  commits,
}

mkdirSync(dirname(fixturePath), { recursive: true })
writeFileSync(fixturePath, JSON.stringify(snapshot, null, 2))
console.log(
  `wrote ${fixturePath}: ${tree.length} files, ${commits.length} commits`
)
