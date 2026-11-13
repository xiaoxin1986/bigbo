/**
 * 内存存储层：单进程内保存动态列表，进程重启即清空。
 * 所有出参都是深拷贝（副本），外部修改返回值不会污染内部数据。
 */

/**
 * 生成 id：优先 crypto.randomUUID，不可用时时间戳 + 随机数兜底。
 * 与前端 src/lib/id.js 思路一致，但这里独立实现，不 import 前端模块。
 * @returns {string}
 */
export function defaultCreateId() {
  const cryptoObject = globalThis.crypto
  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
    try {
      return cryptoObject.randomUUID()
    } catch {
      /* 某些环境存在但不可调用，走兜底分支 */
    }
  }
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function clonePost(post) {
  const copy = { id: post.id, content: post.content, createdAt: post.createdAt }
  if (post.image) {
    copy.image = { dataUrl: post.image.dataUrl, name: post.image.name ?? null }
  }
  return copy
}

/**
 * 创建独立的内存 store。可注入时间与 id 生成器，便于测试。
 * @param {{ now?: () => number, createId?: () => string }} [options]
 * @returns {{
 *   list: () => Array<object>,
 *   get: (id: string) => object | null,
 *   create: (input: { content?: string, image?: null | { dataUrl: string, name?: string | null } }) => object,
 *   remove: (id: string) => object | null,
 *   clear: () => void,
 *   readonly size: number,
 * }}
 */
export function createPostStore({ now = () => Date.now(), createId = defaultCreateId } = {}) {
  /** @type {Map<string, { seq: number, post: object }>} */
  const entries = new Map()
  let seq = 0

  return {
    list() {
      return Array.from(entries.values())
        .sort((left, right) => right.post.createdAt - left.post.createdAt || right.seq - left.seq)
        .map((entry) => clonePost(entry.post))
    },

    get(id) {
      const entry = entries.get(String(id))
      return entry ? clonePost(entry.post) : null
    },

    create({ content = '', image = null } = {}) {
      seq += 1
      const post = { id: createId(), content, createdAt: now() }
      if (image) {
        post.image = {
          dataUrl: image.dataUrl,
          name: typeof image.name === 'string' ? image.name : null,
        }
      }
      entries.set(post.id, { seq, post })
      return clonePost(post)
    },

    remove(id) {
      const key = String(id)
      const entry = entries.get(key)
      if (!entry) return null
      entries.delete(key)
      return clonePost(entry.post)
    },

    clear() {
      entries.clear()
    },

    get size() {
      return entries.size
    },
  }
}
