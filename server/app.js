import { Hono } from 'hono'

import { createPostStore } from './store.js'
import { validateCreatePayload, validateFavoritePayload, validateLikePayload } from './validation.js'

/** 统一错误体，保证任何失败都是 JSON */
const errorBody = (code, message) => ({ error: { code, message } })

/**
 * 解析请求体 JSON 对象：空体或非法 JSON 一律返回 { ok: false }，
 * 由调用方决定映射为 400 INVALID_BODY。
 * @param {import('hono').Context} c
 * @returns {Promise<{ ok: true, payload: unknown } | { ok: false }>}
 */
async function readJsonObject(c) {
  let rawText = ''
  try {
    rawText = await c.req.text()
  } catch {
    rawText = ''
  }
  const trimmed = rawText.trim()
  if (trimmed === '') return { ok: false }
  try {
    return { ok: true, payload: JSON.parse(trimmed) }
  } catch {
    return { ok: false }
  }
}

function uptimeSeconds() {
  const processObject = globalThis.process
  if (processObject && typeof processObject.uptime === 'function') {
    const value = processObject.uptime()
    if (Number.isFinite(value) && value >= 0) return value
  }
  return 0
}

/**
 * 纯 API 应用：不监听端口、不读写文件系统，store 可注入。
 * @param {{ store?: ReturnType<typeof createPostStore> }} [options]
 * @returns {Hono}
 */
export function createApp({ store } = {}) {
  const postStore = store ?? createPostStore()
  const app = new Hono()

  app.onError((error, c) => {
    console.error('[bigbo] 未捕获的服务端错误:', error)
    return c.json(errorBody('INTERNAL_ERROR', '服务器内部错误'), 500)
  })

  // 未知路由必须返回 JSON，而不是 Hono 默认的纯文本 404
  app.notFound((c) => c.json(errorBody('NOT_FOUND', '资源不存在'), 404))

  app.get('/api/health', (c) => c.json({ status: 'ok', uptime: uptimeSeconds() }))

  app.get('/api/posts', (c) => c.json({ posts: postStore.list() }))

  app.get('/api/posts/:id', (c) => {
    const post = postStore.get(c.req.param('id'))
    if (!post) return c.json(errorBody('NOT_FOUND', '动态不存在'), 404)
    return c.json({ post })
  })

  app.post('/api/posts', async (c) => {
    const parsed = await readJsonObject(c)
    if (!parsed.ok) return c.json(errorBody('INVALID_BODY', '请求体必须是 JSON 对象'), 400)

    const result = validateCreatePayload(parsed.payload)
    if (!result.ok) return c.json(errorBody(result.code, result.message), 400)

    const post = postStore.create(result.value)
    c.header('Location', `/api/posts/${post.id}`)
    return c.json({ post }, 201)
  })

  app.delete('/api/posts/:id', (c) => {
    const removed = postStore.remove(c.req.param('id'))
    if (!removed) return c.json(errorBody('NOT_FOUND', '动态不存在'), 404)
    return c.body(null, 204)
  })

  app.put('/api/posts/:id/like', async (c) => {
    const parsed = await readJsonObject(c)
    if (!parsed.ok) return c.json(errorBody('INVALID_BODY', '请求体必须是 JSON 对象'), 400)

    const result = validateLikePayload(parsed.payload)
    if (!result.ok) return c.json(errorBody(result.code, result.message), 400)

    const post = postStore.setLike(c.req.param('id'), result.value)
    if (!post) return c.json(errorBody('NOT_FOUND', '动态不存在'), 404)
    return c.json({ post })
  })

  app.put('/api/posts/:id/favorite', async (c) => {
    const parsed = await readJsonObject(c)
    if (!parsed.ok) return c.json(errorBody('INVALID_BODY', '请求体必须是 JSON 对象'), 400)

    const result = validateFavoritePayload(parsed.payload)
    if (!result.ok) return c.json(errorBody(result.code, result.message), 400)

    const post = postStore.setFavorite(c.req.param('id'), result.value)
    if (!post) return c.json(errorBody('NOT_FOUND', '动态不存在'), 404)
    return c.json({ post })
  })

  return app
}
