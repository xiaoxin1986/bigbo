/**
 * 一条命令同时启动 Hono 后端（8787）与 Vite 前端（5173）。
 * Vite 通过 /api 代理把请求转给后端，因此前端代码里始终只用相对路径。
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const children = [
  {
    name: 'server',
    color: '\u001b[36m',
    child: spawn(process.execPath, ['--watch', 'server/index.js'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  },
  {
    name: 'vite',
    color: '\u001b[35m',
    child: spawn(process.execPath, [path.join('node_modules', 'vite', 'bin', 'vite.js')], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  },
]

const RESET = '\u001b[0m'

function pipe(name, color, stream, target) {
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    for (const line of chunk.split(/\r?\n/)) {
      if (line.trim()) target.write(`${color}[${name}]${RESET} ${line}\n`)
    }
  })
}

for (const entry of children) {
  pipe(entry.name, entry.color, entry.child.stdout, process.stdout)
  pipe(entry.name, entry.color, entry.child.stderr, process.stderr)
  entry.child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`${entry.color}[${entry.name}]${RESET} 退出，code=${code}`)
      shutdown(code)
    }
  })
}

let closing = false
function shutdown(code = 0) {
  if (closing) return
  closing = true
  for (const entry of children) {
    if (!entry.child.killed) entry.child.kill()
  }
  process.exitCode = code
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
