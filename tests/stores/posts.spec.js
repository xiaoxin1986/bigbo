import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePostsStore } from '../../src/stores/posts.js'
import { STORAGE_KEY } from '../../src/lib/storage.js'
import { MAX_LENGTH } from '../../src/lib/time.js'

const seed = (posts) => window.localStorage.setItem(STORAGE_KEY, JSON.stringify(posts))

const samplePosts = [
  { id: 'p-old', content: '旧动态', createdAt: 1700000000000 },
  { id: 'p-new', content: '新动态', createdAt: 1700000100000 },
]

describe('usePostsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('hydrate', () => {
    it('首次进入为空白时间线', () => {
      const store = usePostsStore()
      store.hydrate()

      expect(store.posts).toEqual([])
      expect(store.isEmpty).toBe(true)
      expect(store.loadStatus).toBe('ready')
    })

    it('从 localStorage 恢复已保存的动态', () => {
      seed(samplePosts)
      const store = usePostsStore()
      store.hydrate()

      expect(store.posts).toHaveLength(2)
      expect(store.postCount).toBe(2)
      expect(store.isEmpty).toBe(false)
    })

    it('数据损坏时从空白开始并标记 recovered', () => {
      window.localStorage.setItem(STORAGE_KEY, '{{{')
      const store = usePostsStore()
      store.hydrate()

      expect(store.posts).toEqual([])
      expect(store.loadStatus).toBe('recovered')
    })

    it('重复 hydrate 不会重复堆叠数据', () => {
      seed(samplePosts)
      const store = usePostsStore()
      store.hydrate()
      store.hydrate()

      expect(store.postCount).toBe(2)
    })
  })

  describe('publish', () => {
    it('发布成功后写入状态与 localStorage', () => {
      vi.useFakeTimers()
      vi.setSystemTime(1700000200000)

      const store = usePostsStore()
      store.hydrate()

      const result = store.publish('  今天把 BigBo 跑起来了  ')

      expect(result.ok).toBe(true)
      expect(store.postCount).toBe(1)
      expect(store.posts[0]).toMatchObject({
        content: '今天把 BigBo 跑起来了',
        createdAt: 1700000200000,
      })
      expect(typeof store.posts[0].id).toBe('string')
      expect(store.posts[0].id.length).toBeGreaterThan(0)

      expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual(store.posts)
    })

    it('空白内容被拒绝且不落盘', () => {
      const store = usePostsStore()
      store.hydrate()

      expect(store.publish('   \n  ')).toMatchObject({
        ok: false,
        code: 'EMPTY',
        message: '先写点什么再发布吧',
      })
      expect(store.posts).toEqual([])
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it(`超出 ${MAX_LENGTH} 字被拒绝且不落盘`, () => {
      const store = usePostsStore()
      store.hydrate()

      const result = store.publish('字'.repeat(MAX_LENGTH + 1))

      expect(result).toMatchObject({
        ok: false,
        code: 'TOO_LONG',
        message: `内容超出 ${MAX_LENGTH} 字上限`,
      })
      expect(store.posts).toEqual([])
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('恰好达到上限时可以发布', () => {
      const store = usePostsStore()
      store.hydrate()

      expect(store.publish('a'.repeat(MAX_LENGTH)).ok).toBe(true)
      expect(store.posts[0].content).toHaveLength(MAX_LENGTH)
    })

    it('emoji 按字符计算上限（280 个 emoji 可发布）', () => {
      const store = usePostsStore()
      store.hydrate()

      expect(store.publish('🙂'.repeat(MAX_LENGTH)).ok).toBe(true)
      expect(store.publish('🙂'.repeat(MAX_LENGTH + 1)).code).toBe('TOO_LONG')
    })

    it('写入失败时回滚内存状态并返回 STORAGE 错误', () => {
      const store = usePostsStore()
      store.hydrate()
      store.publish('第一条')

      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

      const result = store.publish('第二条')

      expect(result).toMatchObject({
        ok: false,
        code: 'STORAGE',
        message: '本地存储不可用，内容未能保存',
      })
      expect(store.postCount).toBe(1)
      expect(store.posts.map((p) => p.content)).toEqual(['第一条'])

      setItem.mockRestore()
    })

    it('每次发布生成唯一 id', () => {
      const store = usePostsStore()
      store.hydrate()
      store.publish('a')
      store.publish('b')

      const [first, second] = store.posts
      expect(first.id).not.toBe(second.id)
    })
  })

  describe('持久化', () => {
    it('刷新页面（重建 store）后仍能读回动态', () => {
      const first = usePostsStore()
      first.hydrate()
      first.publish('跨刷新保留')

      setActivePinia(createPinia())
      const second = usePostsStore()
      second.hydrate()

      expect(second.posts.map((p) => p.content)).toEqual(['跨刷新保留'])
    })
  })

  describe('getters', () => {
    it('sortedPosts 按创建时间倒序', () => {
      seed(samplePosts)
      const store = usePostsStore()
      store.hydrate()

      expect(store.sortedPosts.map((p) => p.id)).toEqual(['p-new', 'p-old'])
      expect(store.posts.map((p) => p.id)).toEqual(['p-old', 'p-new'])
    })

    it('最新发布排在最前', () => {
      vi.useFakeTimers()
      vi.setSystemTime(1700000000000)

      const store = usePostsStore()
      store.hydrate()
      store.publish('先发')
      vi.setSystemTime(1700000005000)
      store.publish('后发')

      expect(store.sortedPosts.map((p) => p.content)).toEqual(['后发', '先发'])
    })

    it('now 用于相对时间，tick 可推进时钟', () => {
      vi.useFakeTimers()
      vi.setSystemTime(1700000000000)

      const store = usePostsStore()
      store.hydrate()
      expect(store.now).toBe(1700000000000)

      store.tick(1700000000000 + 61 * 1000)
      expect(store.now).toBe(1700000000000 + 61 * 1000)

      store.tick()
      expect(store.now).toBe(1700000000000)
    })
  })
})
