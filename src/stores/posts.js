import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { createId } from '../lib/id.js'
import { readPosts, writePosts } from '../lib/storage.js'
import { MAX_LENGTH, countChars } from '../lib/time.js'

/** 失败原因 -> 用户可读提示 */
export const ERROR_MESSAGES = {
  EMPTY: '先写点什么再发布吧',
  TOO_LONG: `内容超出 ${MAX_LENGTH} 字上限`,
  STORAGE: '本地存储不可用，内容未能保存',
}

/** 读取本地数据失败时的提示 */
export const RECOVERED_MESSAGE = '读取本地数据失败，已从空白开始'

const fail = (code) => ({ ok: false, code, message: ERROR_MESSAGES[code] })

export const usePostsStore = defineStore('posts', () => {
  /** @type {import('vue').Ref<Array<{id: string, content: string, createdAt: number}>>} */
  const posts = ref([])
  /** idle | ready | recovered */
  const loadStatus = ref('idle')
  /** 相对时间的基准时钟，由界面定时推进 */
  const now = ref(Date.now())

  const sortedPosts = computed(() =>
    [...posts.value].sort((left, right) => right.createdAt - left.createdAt),
  )
  const postCount = computed(() => posts.value.length)
  const isEmpty = computed(() => posts.value.length === 0)

  /**
   * 从 localStorage 恢复数据。
   * @returns {{ posts: Array, ok: boolean, reason?: string }}
   */
  function hydrate() {
    const result = readPosts()
    posts.value = result.posts
    loadStatus.value = result.ok ? 'ready' : 'recovered'
    return result
  }

  /**
   * 发布一条动态：校验 -> 先落盘 -> 再更新内存，写入失败不留脏数据。
   * @param {unknown} rawContent
   * @returns {{ ok: true, post: object } | { ok: false, code: string, message: string }}
   */
  function publish(rawContent) {
    const content = typeof rawContent === 'string' ? rawContent.trim() : ''
    if (!content) return fail('EMPTY')
    if (countChars(content) > MAX_LENGTH) return fail('TOO_LONG')

    const post = {
      id: createId(),
      content,
      createdAt: Date.now(),
    }

    const next = posts.value.concat([post])
    const written = writePosts(next)
    if (!written.ok) return fail('STORAGE')

    posts.value = next
    now.value = post.createdAt
    return { ok: true, post }
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
    now,
    sortedPosts,
    postCount,
    isEmpty,
    hydrate,
    publish,
    tick,
  }
})
