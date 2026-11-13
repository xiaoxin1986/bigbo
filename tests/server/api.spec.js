// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { createApp } from '../../server/app.js'
import { createPostStore } from '../../server/store.js'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/** 递增时钟，避免同一毫秒内 createdAt 相同导致排序断言不稳定 */
function createClock(start = 1_700_000_000_000, step = 1_000) {
  let current = start
  return () => {
    current += step
    return current
  }
}

/** 每个用例都拿全新的 store，测试之间零共享 */
function setup(storeOptions = {}) {
  const store = createPostStore({ now: createClock(), ...storeOptions })
  const app = createApp({ store })
  return { app, store }
}

const postJson = (app, payload) =>
  app.request('/api/posts', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(payload) })

const postRaw = (app, body) =>
  app.request('/api/posts', { method: 'POST', headers: JSON_HEADERS, body })

const readJson = async (response) => JSON.parse(await response.text())

const listPosts = async (app) => (await readJson(await app.request('/api/posts'))).posts

describe('GET /api/health', () => {
  it('返回 ok 与 uptime', async () => {
    const { app } = setup()
    const response = await app.request('/api/health')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')

    const body = await readJson(response)
    expect(body.status).toBe('ok')
    expect(typeof body.uptime).toBe('number')
    expect(body.uptime).toBeGreaterThanOrEqual(0)
  })
})

describe('GET /api/posts', () => {
  it('初始返回空列表', async () => {
    const { app } = setup()
    const response = await app.request('/api/posts')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await readJson(response)).toEqual({ posts: [] })
  })

  it('按 createdAt 倒序返回', async () => {
    const { app } = setup()
    await postJson(app, { content: '第一条' })
    await postJson(app, { content: '第二条' })
    await postJson(app, { content: '第三条' })
    expect((await listPosts(app)).map((post) => post.content)).toEqual(['第三条', '第二条', '第一条'])
  })

  it('返回副本：篡改响应数据不影响服务端', async () => {
    const { app } = setup()
    await postJson(app, { content: '原文' })

    const first = await readJson(await app.request('/api/posts'))
    first.posts[0].content = '被篡改'
    first.posts.push({ id: 'fake', content: '假数据', createdAt: 0 })

    const second = await listPosts(app)
    expect(second).toHaveLength(1)
    expect(second[0].content).toBe('原文')
  })
})

describe('POST /api/posts —— 成功', () => {
  it('创建纯文字动态：201 + Location + JSON', async () => {
    const { app } = setup()
    const response = await postJson(app, { content: '今天把 BigBo 跑起来了' })
    expect(response.status).toBe(201)
    expect(response.headers.get('content-type')).toContain('application/json')

    const body = await readJson(response)
    expect(typeof body.post.id).toBe('string')
    expect(body.post.id.length).toBeGreaterThan(0)
    expect(response.headers.get('location')).toBe(`/api/posts/${body.post.id}`)
    expect(body.post.content).toBe('今天把 BigBo 跑起来了')
    expect(typeof body.post.createdAt).toBe('number')
    expect('image' in body.post).toBe(false)
  })

  it('content 两端空白被服务端 trim', async () => {
    const { app } = setup()
    const body = await readJson(await postJson(app, { content: '   记住这一刻   ' }))
    expect(body.post.content).toBe('记住这一刻')
  })

  it('纯图片动态可发布，name 缺省为 null', async () => {
    const { app } = setup()
    const body = await readJson(
      await postJson(app, { image: { dataUrl: 'data:image/png;base64,AAA' } }),
    )
    expect(body.post.content).toBe('')
    expect(body.post.image).toEqual({ dataUrl: 'data:image/png;base64,AAA', name: null })
  })

  it('图文动态同时保存正文与图片', async () => {
    const { app } = setup()
    const body = await readJson(
      await postJson(app, {
        content: '  配文  ',
        image: { dataUrl: 'data:image/png;base64,BBB', name: 'a.png' },
      }),
    )
    expect(body.post.content).toBe('配文')
    expect(body.post.image).toEqual({ dataUrl: 'data:image/png;base64,BBB', name: 'a.png' })
  })

  it('创建后可在列表中读取到', async () => {
    const { app } = setup()
    const created = await readJson(await postJson(app, { content: '刚发的' }))
    const posts = await listPosts(app)
    expect(posts).toHaveLength(1)
    expect(posts[0].id).toBe(created.post.id)
  })
})

describe('POST /api/posts —— 内容校验', () => {
  it('空对象返回 400 EMPTY', async () => {
    const { app } = setup()
    const response = await postJson(app, {})
    expect(response.status).toBe(400)
    const body = await readJson(response)
    expect(body.error.code).toBe('EMPTY')
    expect(body.error.message).toBe('先写点什么再发布吧')
  })

  it('只有空白返回 400 EMPTY', async () => {
    const { app } = setup()
    const response = await postJson(app, { content: '   \n\t ' })
    expect(response.status).toBe(400)
    expect((await readJson(response)).error.code).toBe('EMPTY')
    expect(await listPosts(app)).toEqual([])
  })

  it('281 个中文返回 400 TOO_LONG', async () => {
    const { app } = setup()
    const response = await postJson(app, { content: '中'.repeat(281) })
    expect(response.status).toBe(400)
    const body = await readJson(response)
    expect(body.error.code).toBe('TOO_LONG')
    expect(body.error.message).toBe('内容超出 280 字上限')
  })

  it('280 个 emoji 可以发布', async () => {
    const { app } = setup()
    const response = await postJson(app, { content: '😀'.repeat(280) })
    expect(response.status).toBe(201)
    const body = await readJson(response)
    expect(Array.from(body.post.content)).toHaveLength(280)
  })

  it('281 个 emoji 返回 400 TOO_LONG', async () => {
    const { app } = setup()
    const response = await postJson(app, { content: '😀'.repeat(281) })
    expect(response.status).toBe(400)
    expect((await readJson(response)).error.code).toBe('TOO_LONG')
  })

  it('超长内容不会写入存储', async () => {
    const { app } = setup()
    await postJson(app, { content: '中'.repeat(281) })
    expect(await listPosts(app)).toEqual([])
  })
})

describe('POST /api/posts —— 请求体非法', () => {
  it('非 JSON 体返回 400 INVALID_BODY', async () => {
    const { app } = setup()
    const response = await postRaw(app, '{not json')
    expect(response.status).toBe(400)
    const body = await readJson(response)
    expect(body.error.code).toBe('INVALID_BODY')
    expect(body.error.message).toBe('请求体必须是 JSON 对象')
  })

  it('空体返回 400 INVALID_BODY', async () => {
    const { app } = setup()
    const response = await app.request('/api/posts', { method: 'POST', headers: JSON_HEADERS })
    expect(response.status).toBe(400)
    expect((await readJson(response)).error.code).toBe('INVALID_BODY')
  })

  it('数组体返回 400 INVALID_BODY', async () => {
    const { app } = setup()
    const response = await postRaw(app, JSON.stringify([{ content: '数组体' }]))
    expect(response.status).toBe(400)
    expect((await readJson(response)).error.code).toBe('INVALID_BODY')
  })

  it('字符串体返回 400 INVALID_BODY', async () => {
    const { app } = setup()
    const response = await postRaw(app, JSON.stringify('纯字符串'))
    expect(response.status).toBe(400)
    expect((await readJson(response)).error.code).toBe('INVALID_BODY')
  })

  it('content 非字符串返回 400 INVALID_BODY', async () => {
    const { app } = setup()
    const response = await postJson(app, { content: 123 })
    expect(response.status).toBe(400)
    const body = await readJson(response)
    expect(body.error.code).toBe('INVALID_BODY')
    expect(body.error.message).toBe('content 必须是字符串')
  })

  it('image 非对象返回 400 INVALID_BODY', async () => {
    const { app } = setup()
    const response = await postJson(app, { content: '有文字', image: 'not-an-object' })
    expect(response.status).toBe(400)
    expect((await readJson(response)).error.code).toBe('INVALID_BODY')
  })

  it('image 缺 dataUrl 返回 400 INVALID_BODY', async () => {
    const { app } = setup()
    const response = await postJson(app, { content: '有文字', image: {} })
    expect(response.status).toBe(400)
    const body = await readJson(response)
    expect(body.error.code).toBe('INVALID_BODY')
    expect(body.error.message).toBe('图片数据不合法')
  })

  it('image dataUrl 空串返回 400 INVALID_BODY', async () => {
    const { app } = setup()
    const response = await postJson(app, { content: '有文字', image: { dataUrl: '' } })
    expect(response.status).toBe(400)
    expect((await readJson(response)).error.code).toBe('INVALID_BODY')
  })

  it('dataUrl 过大返回 400 INVALID_BODY', async () => {
    const { app } = setup()
    const response = await postJson(app, {
      content: '有文字',
      image: { dataUrl: 'a'.repeat(4_000_001) },
    })
    expect(response.status).toBe(400)
    const body = await readJson(response)
    expect(body.error.code).toBe('INVALID_BODY')
    expect(body.error.message).toBe('图片数据过大')
  })

  it('非法请求不会写入存储', async () => {
    const { app } = setup()
    await postJson(app, { image: {} })
    await postRaw(app, 'nope')
    expect(await listPosts(app)).toEqual([])
  })
})

describe('GET /api/posts/:id', () => {
  it('存在时返回 200 与单条动态', async () => {
    const { app } = setup()
    const created = await readJson(await postJson(app, { content: '单条读取' }))
    const response = await app.request(`/api/posts/${created.post.id}`)
    expect(response.status).toBe(200)
    expect(await readJson(response)).toEqual({ post: created.post })
  })

  it('未知 id 返回 404 NOT_FOUND', async () => {
    const { app } = setup()
    const response = await app.request('/api/posts/does-not-exist')
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect((await readJson(response)).error.code).toBe('NOT_FOUND')
  })
})

describe('DELETE /api/posts/:id', () => {
  it('删除成功返回 204 且无正文，随后 GET 404', async () => {
    const { app } = setup()
    const created = await readJson(await postJson(app, { content: '待删除' }))

    const response = await app.request(`/api/posts/${created.post.id}`, { method: 'DELETE' })
    expect(response.status).toBe(204)
    expect(response.body).toBeNull()
    expect(await response.text()).toBe('')

    const after = await app.request(`/api/posts/${created.post.id}`)
    expect(after.status).toBe(404)
    expect((await readJson(after)).error.code).toBe('NOT_FOUND')
    expect(await listPosts(app)).toEqual([])
  })

  it('删除未知 id 返回 404 NOT_FOUND', async () => {
    const { app } = setup()
    const response = await app.request('/api/posts/not-here', { method: 'DELETE' })
    expect(response.status).toBe(404)
    expect((await readJson(response)).error.code).toBe('NOT_FOUND')
  })
})

describe('未知路由', () => {
  it('未知 /api 路径返回 JSON 404 NOT_FOUND', async () => {
    const { app } = setup()
    const response = await app.request('/api/unknown-endpoint')
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
    const body = await readJson(response)
    expect(body.error.code).toBe('NOT_FOUND')
    expect(typeof body.error.message).toBe('string')
  })

  it('已知路径的未支持方法也返回 JSON 404', async () => {
    const { app } = setup()
    const response = await app.request('/api/posts', { method: 'PUT' })
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect((await readJson(response)).error.code).toBe('NOT_FOUND')
  })
})

describe('多实例隔离', () => {
  it('两个独立 app 的 store 互不影响', async () => {
    const first = setup()
    const second = setup()

    await postJson(first.app, { content: '只在 A' })

    expect(await listPosts(first.app)).toHaveLength(1)
    expect(await listPosts(second.app)).toEqual([])

    const created = await readJson(await postJson(second.app, { content: '只在 B' }))
    const response = await first.app.request(`/api/posts/${created.post.id}`)
    expect(response.status).toBe(404)
  })
})
