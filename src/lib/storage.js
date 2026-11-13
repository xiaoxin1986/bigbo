/**
 * 本地存储仓储层。
 * 所有读写异常（隐私模式、配额超限、JSON 损坏）都在此收敛，向上层返回结构化结果，
 * 保证界面永远可以正常渲染。
 */

/** 版本化 key，与旧版纯 JS 实现保持兼容，历史数据可直接读取 */
export const STORAGE_KEY = 'bigbo.posts.v1'

/**
 * 判断一条记录是否为合法动态。
 * @param {unknown} value
 * @returns {boolean}
 */
export function isPost(value) {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.content === 'string' &&
    typeof value.createdAt === 'number' &&
    Number.isFinite(value.createdAt)
  )
}

function resolveStorage(storage) {
  if (storage !== undefined) return storage
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/**
 * 内存版 Storage 实现，便于在测试或非浏览器环境中替换 localStorage。
 * @param {Record<string, string>} [initial]
 */
export function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value))
    },
    removeItem: (key) => {
      map.delete(key)
    },
    clear: () => {
      map.clear()
    },
    key: (index) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size
    },
  }
}

/**
 * 读取全部动态。
 * @param {Storage | null | undefined} [storage]
 * @returns {{ posts: Array, ok: boolean, reason?: string }}
 */
export function readPosts(storage) {
  const target = resolveStorage(storage)
  if (!target || typeof target.getItem !== 'function') {
    return { posts: [], ok: false, reason: 'unavailable' }
  }

  let raw
  try {
    raw = target.getItem(STORAGE_KEY)
  } catch {
    return { posts: [], ok: false, reason: 'unavailable' }
  }

  if (raw === null || raw === undefined || raw === '') {
    return { posts: [], ok: true }
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { posts: [], ok: false, reason: 'corrupt' }
  }

  if (!Array.isArray(parsed)) {
    return { posts: [], ok: false, reason: 'corrupt' }
  }

  return { posts: parsed.filter(isPost), ok: true }
}

/**
 * 覆盖写入全部动态。
 * @param {Array} posts
 * @param {Storage | null | undefined} [storage]
 * @returns {{ ok: boolean, reason?: string }}
 */
export function writePosts(posts, storage) {
  const target = resolveStorage(storage)
  if (!target || typeof target.setItem !== 'function') {
    return { ok: false, reason: 'unavailable' }
  }

  try {
    target.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(posts) ? posts : []))
    return { ok: true }
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
}
