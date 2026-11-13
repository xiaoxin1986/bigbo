import { describe, it, expect, vi } from 'vitest'
import {
  API_BASE,
  DELETE_NETWORK_MESSAGE,
  NETWORK_MESSAGE,
  createApiClient,
  normalizePost,
} from '../../src/lib/api.js'

/** 构造最小 Response 替身：只实现本次代码用到的 ok / status / json */
const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

/** body 不是 JSON（比如代理返回的 HTML 错误页） */
const brokenJsonResponse = (status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => {
    throw new SyntaxError('Unexpected token <')
  },
})

const noContentResponse = () => ({ ok: true, status: 204, json: async () => null })

const makeClient = (impl) => {
  const fetchImpl = vi.fn(impl)
  return { fetchImpl, client: createApiClient({ fetchImpl }) }
}

const validPost = { id: 'p-1', content: '第一条动态', createdAt: 1700000000000 }

describe('createApiClient', () => {
  it('默认基地址为 /api', () => {
    expect(API_BASE).toBe('/api')
  })

  it('未注入 fetchImpl 时使用调用时的 globalThis.fetch', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ posts: [validPost] }))
    vi.stubGlobal('fetch', fetchImpl)

    const client = createApiClient()
    const result = await client.listPosts()

    expect(result).toEqual({ ok: true, posts: [validPost] })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('listPosts', () => {
  it('请求 /api/posts 并返回列表', async () => {
    const { fetchImpl, client } = makeClient(async () => jsonResponse({ posts: [validPost] }))

    const result = await client.listPosts()

    expect(result).toEqual({ ok: true, posts: [validPost] })
    const [url, options] = fetchImpl.mock.calls[0]
    expect(url).toBe('/api/posts')
    expect(options).toMatchObject({ method: 'GET', credentials: 'same-origin' })
  })

  it('逐条过滤结构非法的记录', async () => {
    const { client } = makeClient(async () =>
      jsonResponse({
        posts: [
          { id: 'p-1', content: '保留我', createdAt: 1700000000000 },
          { content: '缺 id', createdAt: 1700000000000 },
          { id: '', content: '空 id', createdAt: 1700000000000 },
          { id: 'p-2', content: '时间非数字', createdAt: 'yesterday' },
          { id: 'p-3', content: '时间无穷大', createdAt: Number.POSITIVE_INFINITY },
          { id: 'p-4', content: '图片缺 dataUrl', createdAt: 1700000000000, image: { name: 'a.png' } },
          { id: 'p-5', content: '图片 dataUrl 为空', createdAt: 1700000000000, image: { dataUrl: '' } },
          { id: 'p-6', content: '', createdAt: 1700000000000 },
          null,
          'not-a-post',
        ],
      }),
    )

    const result = await client.listPosts()

    expect(result.ok).toBe(true)
    expect(result.posts.map((post) => post.id)).toEqual(['p-1'])
    expect(result.posts[0]).toEqual({ id: 'p-1', content: '保留我', createdAt: 1700000000000 })
  })

  it('纯图片动态（正文为空）不会被误过滤', async () => {
    const { client } = makeClient(async () =>
      jsonResponse({
        posts: [{ id: 'p-img', content: '', createdAt: 1700000000000, image: { dataUrl: 'data:image/png;base64,x' } }],
      }),
    )

    const result = await client.listPosts()

    expect(result.posts).toHaveLength(1)
    expect(result.posts[0].image).toEqual({ dataUrl: 'data:image/png;base64,x', name: null })
  })

  it('非 2xx 时返回 server', async () => {
    const { client } = makeClient(async () => jsonResponse({ error: { code: 'INTERNAL_ERROR' } }, 500))
    expect(await client.listPosts()).toEqual({ ok: false, reason: 'server' })
  })

  it('posts 不是数组时返回 server', async () => {
    const { client } = makeClient(async () => jsonResponse({ posts: 'oops' }))
    expect(await client.listPosts()).toEqual({ ok: false, reason: 'server' })
  })

  it('响应不是 JSON 时返回 server', async () => {
    const { client } = makeClient(async () => brokenJsonResponse(200))
    expect(await client.listPosts()).toEqual({ ok: false, reason: 'server' })
  })

  it('网络异常时返回 network', async () => {
    const { client } = makeClient(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await client.listPosts()).toEqual({ ok: false, reason: 'network' })
  })

  it('空列表正常返回', async () => {
    const { client } = makeClient(async () => jsonResponse({ posts: [] }))
    expect(await client.listPosts()).toEqual({ ok: true, posts: [] })
  })
})

describe('createPost', () => {
  it('带上 JSON 头与 credentials，body 为 JSON 字符串', async () => {
    const image = { dataUrl: 'data:image/png;base64,xx', name: 'a.png' }
    const { fetchImpl, client } = makeClient(async () =>
      jsonResponse({ post: { ...validPost, content: '你好', image: { ...image } } }, 201),
    )

    const result = await client.createPost({ content: '你好', image })

    expect(result.ok).toBe(true)
    expect(result.post).toMatchObject({ id: 'p-1', content: '你好' })
    expect(result.post.image).toEqual(image)

    const [url, options] = fetchImpl.mock.calls[0]
    expect(url).toBe('/api/posts')
    expect(options.method).toBe('POST')
    expect(options.credentials).toBe('same-origin')
    expect(options.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(options.body)).toEqual({ content: '你好', image })
  })

  it('无图片时 body 不携带 image 字段', async () => {
    const { fetchImpl, client } = makeClient(async () => jsonResponse({ post: validPost }, 201))

    await client.createPost({ content: '只有文字' })

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ content: '只有文字' })
  })

  it('非法 image 被丢弃后再提交', async () => {
    const { fetchImpl, client } = makeClient(async () => jsonResponse({ post: validPost }, 201))

    await client.createPost({ content: '只有文字', image: { name: 'a.png' } })

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ content: '只有文字' })
  })

  it('400 且带 error.code / message 时原样透传', async () => {
    const { client } = makeClient(async () =>
      jsonResponse({ error: { code: 'TOO_LONG', message: '服务端：内容超出 280 字上限' } }, 400),
    )

    expect(await client.createPost({ content: '太长了' })).toEqual({
      ok: false,
      code: 'TOO_LONG',
      message: '服务端：内容超出 280 字上限',
    })
  })

  it('400 但只有错误码时使用兜底文案', async () => {
    const { client } = makeClient(async () => jsonResponse({ error: { code: 'EMPTY' } }, 400))

    const result = await client.createPost({ content: '' })

    expect(result.code).toBe('EMPTY')
    expect(result.message).toBe('先写点什么再发布吧')
  })

  it('未知错误码映射为 SERVER', async () => {
    const { client } = makeClient(async () =>
      jsonResponse({ error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } }, 500),
    )

    const result = await client.createPost({ content: 'x' })

    expect(result.ok).toBe(false)
    expect(result.code).toBe('SERVER')
  })

  it('fetch 抛错时返回 NETWORK 且文案固定', async () => {
    const { client } = makeClient(async () => {
      throw new Error('ECONNREFUSED')
    })

    expect(await client.createPost({ content: 'x' })).toEqual({
      ok: false,
      code: 'NETWORK',
      message: NETWORK_MESSAGE,
    })
    expect(NETWORK_MESSAGE).toBe('服务端不可用，内容未能保存')
  })

  it('2xx 但响应不是 JSON 时映射为 NETWORK', async () => {
    const { client } = makeClient(async () => brokenJsonResponse(201))

    expect((await client.createPost({ content: 'x' })).code).toBe('NETWORK')
  })

  it('2xx 但返回结构不合法时映射为 SERVER', async () => {
    const { client } = makeClient(async () => jsonResponse({ post: { content: '缺 id' } }, 201))

    expect((await client.createPost({ content: 'x' })).code).toBe('SERVER')
  })
})

describe('deletePost', () => {
  it('204 时返回成功，且不发 body', async () => {
    const { fetchImpl, client } = makeClient(async () => noContentResponse())

    expect(await client.deletePost('p-1')).toEqual({ ok: true })

    const [url, options] = fetchImpl.mock.calls[0]
    expect(url).toBe('/api/posts/p-1')
    expect(options.method).toBe('DELETE')
    expect(options.credentials).toBe('same-origin')
    expect(options.body).toBeUndefined()
  })

  it('404 时返回 NOT_FOUND', async () => {
    const { client } = makeClient(async () =>
      jsonResponse({ error: { code: 'NOT_FOUND', message: '动态不存在' } }, 404),
    )

    expect(await client.deletePost('p-x')).toEqual({
      ok: false,
      code: 'NOT_FOUND',
      message: '动态不存在',
    })
  })

  it('网络异常时返回 NETWORK', async () => {
    const { client } = makeClient(async () => {
      throw new Error('offline')
    })

    const result = await client.deletePost('p-1')

    expect(result.code).toBe('NETWORK')
    expect(result.message).toBe(DELETE_NETWORK_MESSAGE)
  })

  it('5xx 时返回 SERVER', async () => {
    const { client } = makeClient(async () => jsonResponse({ error: { code: 'INTERNAL_ERROR' } }, 500))
    expect((await client.deletePost('p-1')).code).toBe('SERVER')
  })
})

describe('normalizePost', () => {
  it('丢弃结构非法记录', () => {
    expect(normalizePost(null)).toBeNull()
    expect(normalizePost({ id: 'p-1', content: 'x' })).toBeNull()
    expect(normalizePost({ id: 'p-1', content: '', createdAt: 1 })).toBeNull()
  })

  it('保留合法记录并规范化 image.name', () => {
    expect(normalizePost({ ...validPost, image: { dataUrl: 'data:x' } })).toEqual({
      ...validPost,
      image: { dataUrl: 'data:x', name: null },
    })
  })
})
