import { spawn } from 'node:child_process'
import type { GitExec } from './clone.ts'

/** Runs git without passing GitHub credentials to the clone boundary. */
export const runGit: GitExec = async (args, cwd) =>
  new Promise((resolve) => {
    const child = spawn('git', args, { cwd, env: childEnvironment() })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    child.on('error', (error) =>
      resolve({ code: -1, stdout, stderr: error.message })
    )
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }))
  })

function childEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env }
  delete environment.GITHUB_TOKEN
  delete environment.GH_TOKEN
  delete environment.CONTRIB_TOKEN
  return {
    ...environment,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: '/bin/false',
  }
}
