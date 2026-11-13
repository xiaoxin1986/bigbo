import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { apiClient } from '../lib/api.js'
import { MAX_LENGTH, countChars } from '../lib/time.js'

/** 失败原因 -> 用户可读提示 */
export const ERROR_MESSAGES = {
  EMPTY: '先写点什么再发布吧',
  TOO_LONG: `内容超出 ${MAX_LENGTH} 字上限`,
  NETWORK: '服务端不可用，内容未能保存',
}

/** 读取服务端数据失败时的提示 */
export const RECOVERED_MESSAGE = '读取服务端数据失败，已从空白开始'

const fail = (code) => ({ ok: false, code, message: ERROR_MESSAGES[code] })

/**
 * 模块级 API 客户端：默认走真实 client，
 * 测试可通过 setApiClient(createApiClient({ fetchImpl: stub })) 注入替身。
 */
let client = apiClient

/**
 * 替换 store 使用的 API 客户端（仅供测试），传 null 恢复默认。
 * @param {{ listPosts: Function, createPost: Function, deletePost: Function } | null} next
 */
export function setApiClient(next) {
  client = next ?? apiClient
  return client
}

export const usePostsStore = defineStore('posts', () => {
  /** @type {import('vue').Ref<Array<{id: string, content: string, createdAt: number}>>} */
  const posts = ref([])
  /** idle | loading | ready | recovered */
  const loadStatus = ref('idle')
  /** 相对时间的基准时钟，由界面定时推进 */
  const now = ref(Date.now())

  const sortedPosts = computed(() =>
    [...posts.value].sort((left, right) => right.createdAt - left.createdAt),
  )
  const postCount = computed(() => posts.value.length)
  const isEmpty = computed(() => posts.value.length === 0)
  const isLoading = computed(() => loadStatus.value === 'loading')

  /**
   * 从服务端加载数据；重复调用只会覆盖，不会叠加。
   * @returns {Promise<{ ok: boolean, reason?: string }>}
   */
  async function hydrate() {
    loadStatus.value = 'loading'

    let result
    try {
      result = await client.listPosts()
    } catch {
      result = { ok: false, reason: 'network' }
    }

    if (!result || !result.ok) {
      posts.value = []
      loadStatus.value = 'recovered'
      return { ok: false, reason: (result && result.reason) || 'network' }
    }

    posts.value = Array.isArray(result.posts) ? result.posts.slice() : []
    loadStatus.value = 'ready'
    return { ok: true }
  }

  /** 清洗图片字段，非法输入视为无图 */
  function normalizeImage(image) {
    if (!image || typeof image !== 'object' || typeof image.dataUrl !== 'string' || !image.dataUrl) {
      return null
    }
    return {
      dataUrl: image.dataUrl,
      name: typeof image.name === 'string' ? image.name : null,
    }
  }

  /**
   * 发布一条动态：本地校验 -> 提交服务端 -> 成功后写入内存。
   * 服务端没落库时不动本地状态，避免出现"看得出、存不下"的脏数据。
   * 纯文字、纯图片、图文皆可发布。
   * @param {unknown} rawContent
   * @param {{ image?: unknown }} [options]
   * @returns {Promise<{ ok: true, post: object } | { ok: false, code: string, message: string }>}
   */
  async function publish(rawContent, options = {}) {
    const content = typeof rawContent === 'string' ? rawContent.trim() : ''
    const image = normalizeImage(options.image)
    const hasContent = content.length > 0
    const hasImage = Boolean(image)

    if (!hasContent && !hasImage) return fail('EMPTY')
    if (countChars(content) > MAX_LENGTH) return fail('TOO_LONG')

    let result
    try {
      result = await client.createPost({ content, image })
    } catch {
      result = { ok: false, code: 'NETWORK' }
    }

    if (!result || !result.ok) {
      const code = (result && result.code) || 'NETWORK'
      const message =
        code === 'NETWORK'
          ? ERROR_MESSAGES.NETWORK
          : (result && result.message) || ERROR_MESSAGES[code] || '发布失败，请稍后重试'
      return { ok: false, code, message }
    }

    const post = result.post
    posts.value = posts.value.concat([post])
    now.value = post.createdAt
    return { ok: true, post }
  }

  /**
   * 删除一条动态：服务端删除成功后才移除本地记录。
   * @param {string} id
   * @returns {Promise<{ ok: true } | { ok: false, code: string, message: string }>}
   */
  async function remove(id) {
    let result
    try {
      result = await client.deletePost(id)
    } catch {
      result = { ok: false, code: 'NETWORK' }
    }

    if (!result || !result.ok) {
      return {
        ok: false,
        code: (result && result.code) || 'NETWORK',
        message: (result && result.message) || '删除失败，请稍后重试',
      }
    }

    posts.value = posts.value.filter((post) => post.id !== id)
    return { ok: true }
  }

  /**
   * 切换点赞状态：服务端成功后才更新本地，保持单一数据源不变式。
   * @param {string} id
   * @returns {Promise<{ ok: true, post: object } | { ok: false, code: string, message: string }>}
   */
  async function toggleLike(id) {
    const target = posts.value.find((post) => post.id === id)
    if (!target) return { ok: false, code: 'NOT_FOUND', message: '动态不存在' }

    let result
    try {
      result = await client.setLike(id, !target.liked)
    } catch {
      result = { ok: false, code: 'NETWORK' }
    }

    if (!result || !result.ok) {
      return {
        ok: false,
        code: (result && result.code) || 'NETWORK',
        message: (result && result.message) || '点赞失败，请稍后重试',
      }
    }

    posts.value = posts.value.map((post) => (post.id === id ? result.post : post))
    return { ok: true, post: result.post }
  }

  /**
   * 切换收藏状态：服务端成功后才更新本地。
   * @param {string} id
   * @returns {Promise<{ ok: true, post: object } | { ok: false, code: string, message: string }>}
   */
  async function toggleFavorite(id) {
    const target = posts.value.find((post) => post.id === id)
    if (!target) return { ok: false, code: 'NOT_FOUND', message: '动态不存在' }

    let result
    try {
      result = await client.setFavorite(id, !target.favorited)
    } catch {
      result = { ok: false, code: 'NETWORK' }
    }

    if (!result || !result.ok) {
      return {
        ok: false,
        code: (result && result.code) || 'NETWORK',
        message: (result && result.message) || '收藏失败，请稍后重试',
      }
    }

    posts.value = posts.value.map((post) => (post.id === id ? result.post : post))
    return { ok: true, post: result.post }
  }

  /**
   * 推进相对时间基准，让"几分钟前"随真实时间刷新。
   * @param {number} [timestamp]
   */
  function tick(timestamp = Date.now()) {
    now.value = timestamp
  }

  return {
    posts,
    loadStatus,
    isInitialized: computed(() => loadStatus.value === 'ready' || loadStatus.value === 'recovered'),
    isLoading,
    now,
    sortedPosts,
    postCount,
    isEmpty,
    hydrate,
    publish,
    remove,
    toggleLike,
    toggleFavorite,
    tick,
  }
})
