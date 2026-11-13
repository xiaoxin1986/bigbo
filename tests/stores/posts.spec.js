import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  ERROR_MESSAGES,
  RECOVERED_MESSAGE,
  setApiClient,
  usePostsStore,
} from '../../src/stores/posts.js'
import { createApiClient } from '../../src/lib/api.js'
import { MAX_LENGTH } from '../../src/lib/time.js'

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

const noContentResponse = () => ({ ok: true, status: 204, json: async () => null })

/** 内存版假服务端：语义与真实 API 保持一致，便于覆盖 store 全链路 */
function createServer(initial = []) {
  const state = initial.map((post) => ({ ...post }))
  let seq = 0

  const fetchImpl = vi.fn(async (url, options = {}) => {
    const method = (options.method || 'GET').toUpperCase()

    if (method === 'GET' && url === '/api/posts') {
      return jsonResponse({ posts: state.map((post) => ({ ...post })) })
    }

    if (method === 'POST' && url === '/api/posts') {
      const payload = JSON.parse(options.body || '{}')
      const content = typeof payload.content === 'string' ? payload.content.trim() : ''
      if (content.length === 0 && !payload.image) {
        return jsonResponse({ error: { code: 'EMPTY', message: '先写点什么再发布吧' } }, 400)
      }
      seq += 1
      const post = { id: `srv-${seq}`, content, createdAt: Date.now() }
      if (payload.image) post.image = { dataUrl: payload.image.dataUrl, name: payload.image.name ?? null }
      state.unshift(post)
      return jsonResponse({ post }, 201)
    }

    if (method === 'DELETE' && url.startsWith('/api/posts/')) {
      const id = decodeURIComponent(url.slice('/api/posts/'.length))
      const index = state.findIndex((post) => post.id === id)
      if (index === -1) return jsonResponse({ error: { code: 'NOT_FOUND', message: '动态不存在' } }, 404)
      state.splice(index, 1)
      return noContentResponse()
    }

    return jsonResponse({ error: { code: 'NOT_FOUND', message: '资源不存在' } }, 404)
  })

  return { fetchImpl, state }
}

/** 注入假服务端 */
function useServer(initial = []) {
  const server = createServer(initial)
  setApiClient(createApiClient({ fetchImpl: server.fetchImpl }))
  return server
}

/** 注入即席 stub */
function useFetch(impl) {
  const fetchImpl = vi.fn(impl)
  setApiClient(createApiClient({ fetchImpl }))
  return fetchImpl
}

const postCalls = (fetchImpl) =>
  fetchImpl.mock.calls.filter(([, options]) => ((options && options.method) || 'GET') === 'POST')

describe('usePostsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
    setApiClient(null)
  })

  describe('文案常量', () => {
    it('错误提示与恢复提示保持稳定', () => {
      expect(ERROR_MESSAGES).toEqual({
        EMPTY: '先写点什么再发布吧',
        TOO_LONG: `内容超出 ${MAX_LENGTH} 字上限`,
        NETWORK: '服务端不可用，内容未能保存',
      })
      expect(RECOVERED_MESSAGE).toBe('读取服务端数据失败，已从空白开始')
    })
  })

  describe('hydrate', () => {
    it('从服务端读取动态并标记 ready', async () => {
      const { fetchImpl } = useServer([
        { id: 'p-old', content: '旧动态', createdAt: 1700000000000 },
        { id: 'p-new', content: '新动态', createdAt: 1700000100000 },
      ])
      const store = usePostsStore()

      expect(await store.hydrate()).toEqual({ ok: true })
      expect(store.loadStatus).toBe('ready')
      expect(store.isLoading).toBe(false)
      expect(store.postCount).toBe(2)
      expect(store.isEmpty).toBe(false)
      // posts 保持插入顺序，倒序由 sortedPosts 保证
      expect(store.posts.map((post) => post.id)).toEqual(['p-old', 'p-new'])
      expect(store.sortedPosts.map((post) => post.id)).toEqual(['p-new', 'p-old'])
      expect(fetchImpl).toHaveBeenCalledWith(
        '/api/posts',
        expect.objectContaining({ method: 'GET' }),
      )
    })

    it('服务端返回空列表时为空时间线', async () => {
      useServer()
      const store = usePostsStore()

      expect(await store.hydrate()).toEqual({ ok: true })
      expect(store.posts).toEqual([])
      expect(store.isEmpty).toBe(true)
      expect(store.loadStatus).toBe('ready')
    })

    it('网络异常时标记 recovered 并从空白开始', async () => {
      useFetch(async () => {
        throw new Error('ECONNREFUSED')
      })
      const store = usePostsStore()

      expect(await store.hydrate()).toEqual({ ok: false, reason: 'network' })
      expect(store.posts).toEqual([])
      expect(store.loadStatus).toBe('recovered')
    })

    it('服务端 5xx 时标记 recovered', async () => {
      useFetch(async () => jsonResponse({ error: { code: 'INTERNAL_ERROR' } }, 500))
      const store = usePostsStore()

      expect(await store.hydrate()).toEqual({ ok: false, reason: 'server' })
      expect(store.loadStatus).toBe('recovered')
      expect(store.posts).toEqual([])
    })

    it('重复 hydrate 不会叠加数据', async () => {
      useServer([
        { id: 'p-1', content: '第一条', createdAt: 1700000000000 },
        { id: 'p-2', content: '第二条', createdAt: 1700000100000 },
      ])
      const store = usePostsStore()

      await store.hydrate()
      await store.hydrate()

      expect(store.postCount).toBe(2)
    })

    it('加载期间 isLoading 为 true', async () => {
      let release = () => {}
      useFetch(
        () =>
          new Promise((resolve) => {
            release = () => resolve(jsonResponse({ posts: [] }))
          }),
      )

      const store = usePostsStore()
      const pending = store.hydrate()

      expect(store.loadStatus).toBe('loading')
      expect(store.isLoading).toBe(true)

      release()
      await pending

      expect(store.isLoading).toBe(false)
      expect(store.loadStatus).toBe('ready')
    })

    it('默认 client 在调用时读取 globalThis.fetch，stubGlobal 即可生效', async () => {
      setApiClient(null)
      const fetchImpl = vi.fn(async () =>
        jsonResponse({ posts: [{ id: 'p-g', content: '全局 stub', createdAt: 1700000000000 }] }),
      )
      vi.stubGlobal('fetch', fetchImpl)

      const store = usePostsStore()

      expect(await store.hydrate()).toEqual({ ok: true })
      expect(store.posts.map((post) => post.id)).toEqual(['p-g'])
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    })
  })

  describe('publish', () => {
    it('成功后写入状态并推进 now', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(1700000000000)

      useServer()
      const store = usePostsStore()
      await store.hydrate()
      expect(store.now).toBe(1700000000000)

      vi.setSystemTime(1700000500000)
      const result = await store.publish('  今天把 BigBo 跑起来了  ')

      expect(result.ok).toBe(true)
      expect(result.post.id).toBe('srv-1')
      expect(store.postCount).toBe(1)
      expect(store.posts[0]).toMatchObject({
        id: 'srv-1',
        content: '今天把 BigBo 跑起来了',
        createdAt: 1700000500000,
      })
      expect(store.now).toBe(1700000500000)
    })

    it('空白内容被拒绝且不发请求', async () => {
      const { fetchImpl } = useServer()
      const store = usePostsStore()
      await store.hydrate()

      expect(await store.publish('   \n  ')).toMatchObject({
        ok: false,
        code: 'EMPTY',
        message: '先写点什么再发布吧',
      })
      expect(postCalls(fetchImpl)).toHaveLength(0)
      expect(store.posts).toEqual([])
    })

    it(`超出 ${MAX_LENGTH} 字被拒绝且不发请求`, async () => {
      const { fetchImpl } = useServer()
      const store = usePostsStore()
      await store.hydrate()

      expect(await store.publish('字'.repeat(MAX_LENGTH + 1))).toMatchObject({
        ok: false,
        code: 'TOO_LONG',
        message: `内容超出 ${MAX_LENGTH} 字上限`,
      })
      expect(postCalls(fetchImpl)).toHaveLength(0)
      expect(store.posts).toEqual([])
    })

    it('服务端返回的 TOO_LONG 原样透传', async () => {
      const fetchImpl = useFetch(async (url, options = {}) => {
        if (((options.method) || 'GET') === 'GET') return jsonResponse({ posts: [] })
        return jsonResponse({ error: { code: 'TOO_LONG', message: '服务端：内容超出上限' } }, 400)
      })
      const store = usePostsStore()
      await store.hydrate()

      expect(await store.publish('服务端会拒绝的内容')).toMatchObject({
        ok: false,
        code: 'TOO_LONG',
        message: '服务端：内容超出上限',
      })
      expect(fetchImpl).toHaveBeenCalledTimes(2)
      expect(store.posts).toEqual([])
    })

    it('网络失败时返回 NETWORK 且不污染状态', async () => {
      const { fetchImpl } = useServer()
      const store = usePostsStore()
      await store.hydrate()
      await store.publish('先成功一条')

      fetchImpl.mockImplementationOnce(async () => {
        throw new Error('offline')
      })

      expect(await store.publish('网络断了')).toMatchObject({
        ok: false,
        code: 'NETWORK',
        message: '服务端不可用，内容未能保存',
      })
      expect(store.postCount).toBe(1)
      expect(store.posts.map((post) => post.content)).toEqual(['先成功一条'])
    })

    it('恰好达到 280 上限时可以发布', async () => {
      useServer()
      const store = usePostsStore()
      await store.hydrate()

      expect((await store.publish('a'.repeat(MAX_LENGTH))).ok).toBe(true)
      expect(store.posts[0].content).toHaveLength(MAX_LENGTH)
    })

    it('emoji 按字符计算上限', async () => {
      useServer()
      const store = usePostsStore()
      await store.hydrate()

      expect((await store.publish('🙂'.repeat(MAX_LENGTH))).ok).toBe(true)
      expect((await store.publish('🙂'.repeat(MAX_LENGTH + 1))).code).toBe('TOO_LONG')
    })

    it('纯图片动态（无文字）可发布', async () => {
      useServer()
      const store = usePostsStore()
      await store.hydrate()

      const image = { dataUrl: 'data:image/jpeg;base64,xxx', name: 'photo.jpg' }
      const result = await store.publish('', { image })

      expect(result.ok).toBe(true)
      expect(store.posts[0]).toMatchObject({
        content: '',
        image: { dataUrl: 'data:image/jpeg;base64,xxx', name: 'photo.jpg' },
      })
    })

    it('图文并茂的动态可发布', async () => {
      useServer()
      const store = usePostsStore()
      await store.hydrate()

      await store.publish('带图的一句话', { image: { dataUrl: 'data:image/jpeg;base64,xxx' } })

      expect(store.posts[0]).toMatchObject({
        content: '带图的一句话',
        image: { dataUrl: 'data:image/jpeg;base64,xxx' },
      })
    })

    it('非法图片对象被忽略，纯文字照常发布', async () => {
      const { fetchImpl } = useServer()
      const store = usePostsStore()
      await store.hydrate()

      const result = await store.publish('没有有效图片', { image: { name: 'x.jpg' } })

      expect(result.ok).toBe(true)
      expect(store.posts[0].image).toBeUndefined()
      expect(JSON.parse(postCalls(fetchImpl)[0][1].body)).toEqual({ content: '没有有效图片' })
    })

    it('空内容且无图片时依旧被拒绝', async () => {
      useServer()
      const store = usePostsStore()
      await store.hydrate()

      expect(await store.publish('', {})).toMatchObject({ ok: false, code: 'EMPTY' })
    })

    it('id 完全来自服务端响应', async () => {
      useServer()
      const store = usePostsStore()
      await store.hydrate()

      const first = await store.publish('a')
      const second = await store.publish('b')

      expect([first.post.id, second.post.id]).toEqual(['srv-1', 'srv-2'])
      expect(store.posts.map((post) => post.id)).toEqual(['srv-1', 'srv-2'])
    })
  })

  describe('remove', () => {
    it('删除成功后从状态中移除', async () => {
      const { fetchImpl } = useServer([
        { id: 'p-old', content: '旧动态', createdAt: 1700000000000 },
        { id: 'p-new', content: '新动态', createdAt: 1700000100000 },
      ])
      const store = usePostsStore()
      await store.hydrate()

      expect(await store.remove('p-old')).toEqual({ ok: true })
      expect(store.postCount).toBe(1)
      expect(store.posts.map((post) => post.id)).toEqual(['p-new'])
      expect(fetchImpl).toHaveBeenCalledWith(
        '/api/posts/p-old',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })

    it('服务端失败时状态保持不变', async () => {
      useFetch(async (url, options = {}) => {
        if (((options.method) || 'GET') === 'GET') {
          return jsonResponse({ posts: [{ id: 'p-1', content: '删不掉', createdAt: 1700000000000 }] })
        }
        return jsonResponse({ error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } }, 500)
      })
      const store = usePostsStore()
      await store.hydrate()

      const result = await store.remove('p-1')

      expect(result).toMatchObject({ ok: false, code: 'SERVER' })
      expect(store.postCount).toBe(1)
    })

    it('网络异常时返回 NETWORK', async () => {
      useFetch(async (url, options = {}) => {
        if (((options.method) || 'GET') === 'GET') {
          return jsonResponse({ posts: [{ id: 'p-1', content: 'x', createdAt: 1700000000000 }] })
        }
        throw new Error('offline')
      })
      const store = usePostsStore()
      await store.hydrate()

      expect((await store.remove('p-1')).code).toBe('NETWORK')
      expect(store.postCount).toBe(1)
    })
  })

  describe('getters', () => {
    it('sortedPosts 按创建时间倒序，posts 保持插入顺序', async () => {
      useServer([
        { id: 'p-old', content: '旧动态', createdAt: 1700000000000 },
        { id: 'p-new', content: '新动态', createdAt: 1700000100000 },
      ])
      const store = usePostsStore()
      await store.hydrate()

      expect(store.sortedPosts.map((post) => post.id)).toEqual(['p-new', 'p-old'])
      expect(store.posts.map((post) => post.id)).toEqual(['p-old', 'p-new'])
    })

    it('最新发布排在最前', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(1700000000000)

      useServer()
      const store = usePostsStore()
      await store.hydrate()

      await store.publish('先发')
      vi.setSystemTime(1700000005000)
      await store.publish('后发')

      expect(store.sortedPosts.map((post) => post.content)).toEqual(['后发', '先发'])
    })

    it('now 用于相对时间，tick 可推进时钟', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(1700000000000)

      useServer()
      const store = usePostsStore()
      await store.hydrate()

      expect(store.now).toBe(1700000000000)

      store.tick(1700000000000 + 61 * 1000)
      expect(store.now).toBe(1700000000000 + 61 * 1000)

      store.tick()
      expect(store.now).toBe(1700000000000)
    })
  })
})
