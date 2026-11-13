/**
 * 服务端 API 客户端。
 * 网络异常、非 JSON 响应、结构非法的数据都在这一层收敛为结构化结果，
 * 上层（Pinia store / 组件）无需 try/catch，也不会因为接口抖动而白屏。
 */
import { MAX_LENGTH } from './time.js'

/** 前端一律使用相对路径，开发 / 预览时由 Vite 代理转发到 8787 */
export const API_BASE = '/api'

/** 发布时服务端不可用的统一文案 */
export const NETWORK_MESSAGE = '服务端不可用，内容未能保存'

/** 删除时服务端不可用的统一文案 */
export const DELETE_NETWORK_MESSAGE = '服务端不可用，删除未能完成'

/** 服务端返回未知错误时的兜底文案 */
export const SERVER_MESSAGE = '服务端出错了，请稍后重试'

/** 可以原样透传给界面的服务端错误码 */
const PASS_THROUGH_CODES = ['EMPTY', 'TOO_LONG', 'INVALID_BODY']

/** 服务端只给了错误码、没给文案时的兜底 */
const FALLBACK_MESSAGES = {
  EMPTY: '先写点什么再发布吧',
  TOO_LONG: `内容超出 ${MAX_LENGTH} 字上限`,
  INVALID_BODY: '提交的内容不合法',
}

const failure = (code, message) => ({ ok: false, code, message })

/**
 * 可选图片字段是否合法：缺失 / null 均可，存在则必须带非空 dataUrl。
 * @param {unknown} image
 * @returns {boolean}
 */
export function isValidImage(image) {
  if (image == null) return true
  return (
    typeof image === 'object' &&
    !Array.isArray(image) &&
    typeof image.dataUrl === 'string' &&
    image.dataUrl.length > 0
  )
}

/**
 * 逐条清洗服务端返回的动态：结构非法直接丢弃（返回 null）。
 * 纯图片动态允许正文为空串；既无正文又无图片的记录视为非法。
 * @param {unknown} value
 * @returns {{ id: string, content: string, createdAt: number, image?: object } | null}
 */
export function normalizePost(value) {
  if (!value || typeof value !== 'object') return null

  const { id, content, createdAt, image } = value
  if (typeof id !== 'string' || id.length === 0) return null
  if (typeof content !== 'string') return null
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null
  if (!isValidImage(image)) return null
  if (content.length === 0 && image == null) return null

  const post = { id, content, createdAt }
  if (image != null) {
    post.image = {
      dataUrl: image.dataUrl,
      name: typeof image.name === 'string' ? image.name : null,
    }
  }
  return post
}

/**
 * 读取 JSON body；解析失败（HTML 错误页、空 body、无 json 方法）返回 null。
 * @param {Response} response
 */
async function readJson(response) {
  if (!response || typeof response.json !== 'function') return null
  try {
    return await response.json()
  } catch {
    return null
  }
}

/**
 * 创建 API 客户端。
 * fetchImpl 只是注入点：缺省时在**调用时**读取 globalThis.fetch，
 * 因此测试里 vi.stubGlobal('fetch', ...) 同样生效。
 * @param {{ baseUrl?: string, fetchImpl?: Function }} [options]
 */
export function createApiClient({ baseUrl = API_BASE, fetchImpl } = {}) {
  /** 发起请求：任何异常（含 fetch 不存在）都收敛为 { ok: false } */
  async function send(url, options) {
    const doFetch = typeof fetchImpl === 'function' ? fetchImpl : globalThis.fetch
    if (typeof doFetch !== 'function') return { ok: false }

    try {
      const response = await doFetch(url, options)
      if (!response) return { ok: false }
      return { ok: true, response }
    } catch {
      return { ok: false }
    }
  }

  /**
   * 拉取全部动态（服务端已按 createdAt 倒序）。
   * @returns {Promise<{ ok: true, posts: Array } | { ok: false, reason: 'network' | 'server' }>}
   */
  async function listPosts() {
    const sent = await send(`${baseUrl}/posts`, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
    if (!sent.ok) return { ok: false, reason: 'network' }

    const { response } = sent
    if (!response.ok) return { ok: false, reason: 'server' }

    const data = await readJson(response)
    if (!data || !Array.isArray(data.posts)) return { ok: false, reason: 'server' }

    const posts = []
    data.posts.forEach((item) => {
      const post = normalizePost(item)
      if (post) posts.push(post)
    })
    return { ok: true, posts }
  }

  /**
   * 发布一条动态。
   * @param {{ content?: string, image?: unknown }} [payload]
   * @returns {Promise<{ ok: true, post: object } | { ok: false, code: string, message: string }>}
   */
  async function createPost({ content, image } = {}) {
    const payload = { content: typeof content === 'string' ? content : '' }
    if (image != null && isValidImage(image)) {
      payload.image = {
        dataUrl: image.dataUrl,
        name: typeof image.name === 'string' ? image.name : null,
      }
    }

    const sent = await send(`${baseUrl}/posts`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!sent.ok) return failure('NETWORK', NETWORK_MESSAGE)

    const { response } = sent
    const data = await readJson(response)

    if (response.ok) {
      const post = normalizePost(data && data.post)
      if (post) return { ok: true, post }
      // 2xx 但不是 JSON / 结构不对：请求实际上没有成功，按网络失败处理
      return data === null ? failure('NETWORK', NETWORK_MESSAGE) : failure('SERVER', SERVER_MESSAGE)
    }

    const error = data && data.error ? data.error : null
    const code = error ? error.code : null
    if (PASS_THROUGH_CODES.includes(code)) {
      const message =
        error && typeof error.message === 'string' && error.message.length > 0
          ? error.message
          : FALLBACK_MESSAGES[code]
      return failure(code, message)
    }
    return failure('SERVER', SERVER_MESSAGE)
  }

  /**
   * 删除一条动态。
   * @param {string} id
   * @returns {Promise<{ ok: true } | { ok: false, code: string, message: string }>}
   */
  async function deletePost(id) {
    if (typeof id !== 'string' || id.length === 0) return failure('NOT_FOUND', '动态不存在')

    const sent = await send(`${baseUrl}/posts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
    if (!sent.ok) return failure('NETWORK', DELETE_NETWORK_MESSAGE)

    const { response } = sent
    if (response.ok) return { ok: true }

    const data = await readJson(response)
    const error = data && data.error ? data.error : null
    if (error && error.code === 'NOT_FOUND') {
      const message =
        typeof error.message === 'string' && error.message.length > 0 ? error.message : '动态不存在'
      return failure('NOT_FOUND', message)
    }
    return failure('SERVER', SERVER_MESSAGE)
  }

  return { listPosts, createPost, deletePost }
}

/** 应用默认使用的单例；测试可用 setApiClient 注入替身 */
export const apiClient = createApiClient()
