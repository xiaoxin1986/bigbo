import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'

import { createApp } from './app.js'

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.resolve(SERVER_DIR, '..', 'dist')
const DEFAULT_PORT = 8787

function resolvePort() {
  const parsed = Number.parseInt(process.env.PORT ?? '', 10)
  if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 65535) return parsed
  return DEFAULT_PORT
}

/** serveStatic 的 root 相对 process.cwd()，这里把绝对路径换算成相对路径 */
function resolveStaticRoot(directory) {
  const relative = path.relative(process.cwd(), directory)
  return relative === '' ? '.' : relative
}

/**
 * 组装「API + 静态资源」的完整应用，不监听端口，便于测试直接调用 app.request()。
 * @param {{ store?: object }} [options]
 * @returns {import('hono').Hono}
 */
export function createServerApp(options = {}) {
  const app = createApp(options)

  if (existsSync(path.join(DIST_DIR, 'index.html'))) {
    const root = resolveStaticRoot(DIST_DIR)
    const serveAsset = serveStatic({ root })
    const serveIndex = serveStatic({ root, path: 'index.html' })

    app.use('*', async (c, next) => {
      const pathname = c.req.path
      // /api 交给 API 路由与 notFound 处理，绝不落到 SPA fallback
      if (pathname === '/api' || pathname.startsWith('/api/')) return next()
      if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return next()
      // 命中静态文件则直接返回，否则回落到 index.html（SPA 路由）
      return serveAsset(c, () => serveIndex(c, next))
    })
  } else {
    app.get('/', (c) =>
      c.text(
        `BigBo API 正在运行。/api/health 查看健康状态；前端静态资源未构建（缺少 dist/），请先执行 npm run build。`,
      ),
    )
  }

  return app
}

/**
 * 真正开始监听端口。
 * @param {{ port?: number, hostname?: string, store?: object }} [options]
 * @returns {import('node:http').Server}
 */
export function startServer({ port = resolvePort(), hostname, store } = {}) {
  const app = createServerApp({ store })
  const server = serve(
    { fetch: app.fetch, port, ...(hostname ? { hostname } : {}) },
    (info) => {
      console.log(`[bigbo] 服务已启动: http://localhost:${info.port}`)
    },
  )
  return server
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (entryUrl && import.meta.url === entryUrl) {
  startServer()
}
