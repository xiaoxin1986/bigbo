import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import App from '../../src/App.vue'
import { RECOVERED_MESSAGE } from '../../src/stores/posts.js'

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

const noContentResponse = () => ({ ok: true, status: 204, json: async () => null })

/** 内存版假服务端：GET / POST / DELETE 语义与真实 API 一致 */
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

/** 把假服务端挂到全局 fetch 上：组件与 store 都通过 globalThis.fetch 访问 */
const installServer = (initial = []) => {
  const server = createServer(initial)
  vi.stubGlobal('fetch', server.fetchImpl)
  return server
}

let container = null

/** 冲刷微任务与渲染队列；不依赖 setTimeout，fake timers 下同样可用 */
async function settle(wrapper, times = 20) {
  for (let index = 0; index < times; index += 1) await Promise.resolve()
  await wrapper.vm.$nextTick()
  await wrapper.vm.$nextTick()
}

const mountApp = async () => {
  const wrapper = mount(App, { attachTo: container, global: { plugins: [createPinia()] } })
  await flushPromises()
  return wrapper
}

const publish = async (wrapper, text) => {
  await wrapper.get('textarea').setValue(text)
  await wrapper.get('[data-test="publish"]').trigger('click')
  await flushPromises()
}

describe('App', () => {
  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container?.remove()
    container = null
    vi.useRealTimers()
  })

  it('首次进入展示品牌、服务端存储徽标、空状态与 0 条计数', async () => {
    installServer()
    const wrapper = await mountApp()

    expect(wrapper.get('.brand__name').text()).toBe('BigBo')
    expect(wrapper.get('.storage-badge').text()).toContain('服务端存储')
    expect(wrapper.find('[data-test="empty-state"]').exists()).toBe(true)
    expect(wrapper.findAll('.post-card')).toHaveLength(0)
    expect(wrapper.get('[data-test="feed-count"]').text()).toBe('0 条')
  })

  it('加载过程中展示加载态而不是空状态', async () => {
    let release = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            release = () => resolve(jsonResponse({ posts: [] }))
          }),
      ),
    )

    const wrapper = mount(App, { attachTo: container, global: { plugins: [createPinia()] } })
    await wrapper.vm.$nextTick()

    expect(wrapper.get('[data-test="feed-loading"]').text()).toBe('正在加载…')
    expect(wrapper.find('[data-test="empty-state"]').exists()).toBe(false)

    release()
    await flushPromises()

    expect(wrapper.find('[data-test="feed-loading"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="empty-state"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="feed-count"]').text()).toBe('0 条')
  })

  it('从服务端恢复动态并倒序渲染', async () => {
    installServer([
      { id: 'p-old', content: '旧动态', createdAt: 1700000000000 },
      { id: 'p-new', content: '新动态', createdAt: 1700000100000 },
    ])

    const wrapper = await mountApp()
    const cards = wrapper.findAll('.post-card')

    expect(cards).toHaveLength(2)
    expect(cards[0].text()).toContain('新动态')
    expect(cards[1].text()).toContain('旧动态')
    expect(wrapper.find('[data-test="empty-state"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="feed-count"]').text()).toBe('2 条')
  })

  it('发布后卡片置顶、计数更新、输入框清空并提示成功', async () => {
    installServer()
    const wrapper = await mountApp()

    await publish(wrapper, '  第一条动态  ')

    const cards = wrapper.findAll('.post-card')
    expect(cards).toHaveLength(1)
    expect(cards[0].text()).toContain('第一条动态')
    expect(cards[0].classes()).toContain('post-card--enter')
    expect(wrapper.get('[data-test="feed-count"]').text()).toBe('1 条')
    expect(wrapper.find('[data-test="empty-state"]').exists()).toBe(false)
    expect(wrapper.get('textarea').element.value).toBe('')
    expect(wrapper.get('.counter__value').text()).toBe('0')
    expect(wrapper.get('.toast').text()).toBe('发布成功')
  })

  it('发布后写入服务端，重新挂载仍可见', async () => {
    installServer()

    const first = await mountApp()
    await publish(first, '跨刷新保留')
    first.unmount()

    const second = await mountApp()

    expect(second.findAll('.post-card')).toHaveLength(1)
    expect(second.get('.post-card').text()).toContain('跨刷新保留')
  })

  it('Ctrl + Enter 快捷发布', async () => {
    installServer()
    const wrapper = await mountApp()

    await wrapper.get('textarea').setValue('快捷键发布')
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter', ctrlKey: true })
    await flushPromises()

    expect(wrapper.findAll('.post-card')).toHaveLength(1)
  })

  it('空白内容不产生卡片、不向服务端发请求', async () => {
    const server = installServer()
    const wrapper = await mountApp()

    await publish(wrapper, '    ')

    expect(wrapper.findAll('.post-card')).toHaveLength(0)
    expect(server.state).toEqual([])
    expect(wrapper.findAll('.toast')).toHaveLength(0)
  })

  it('超出 280 字时按钮禁用，内容不提交且输入保留', async () => {
    const server = installServer()
    const wrapper = await mountApp()

    await wrapper.get('textarea').setValue('a'.repeat(281))

    expect(wrapper.findAll('.post-card')).toHaveLength(0)
    expect(server.state).toEqual([])
    expect(wrapper.get('[data-test="publish"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.counter').classes()).toContain('counter--limit')
    expect(wrapper.get('textarea').element.value).toHaveLength(281)
  })

  it('服务端不可用时提示并从空白开始', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      }),
    )

    const wrapper = await mountApp()

    expect(wrapper.find('[data-test="empty-state"]').exists()).toBe(true)
    expect(wrapper.get('.toast').text()).toBe(RECOVERED_MESSAGE)
    expect(RECOVERED_MESSAGE).toBe('读取服务端数据失败，已从空白开始')
  })

  it('发布失败时保留用户输入并提示服务端不可用', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, options = {}) => {
        if (((options.method) || 'GET') === 'GET') return jsonResponse({ posts: [] })
        throw new Error('offline')
      }),
    )

    const wrapper = await mountApp()
    await publish(wrapper, '写不进去的内容')

    expect(wrapper.findAll('.post-card')).toHaveLength(0)
    expect(wrapper.get('.toast').text()).toBe('服务端不可用，内容未能保存')
    expect(wrapper.get('textarea').element.value).toBe('写不进去的内容')
    expect(wrapper.get('[data-test="feed-count"]').text()).toBe('0 条')
  })

  it('点击删除按钮移除该条并提示成功', async () => {
    installServer([
      { id: 'p-old', content: '旧动态', createdAt: 1700000000000 },
      { id: 'p-new', content: '新动态', createdAt: 1700000100000 },
    ])

    const wrapper = await mountApp()
    expect(wrapper.findAll('.post-card')).toHaveLength(2)

    // 倒序后第一张卡是 p-new
    await wrapper.get('[data-test="delete-post"]').trigger('click')
    await flushPromises()

    const cards = wrapper.findAll('.post-card')
    expect(cards).toHaveLength(1)
    expect(cards[0].text()).toContain('旧动态')
    expect(wrapper.get('[data-test="feed-count"]').text()).toBe('1 条')
    expect(wrapper.get('.toast').text()).toBe('已删除')
  })

  it('删除失败时保留卡片并提示重试', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, options = {}) => {
        if (((options.method) || 'GET') === 'GET') {
          return jsonResponse({ posts: [{ id: 'p-1', content: '删不掉', createdAt: 1700000000000 }] })
        }
        return jsonResponse({ error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } }, 500)
      }),
    )

    const wrapper = await mountApp()
    await wrapper.get('[data-test="delete-post"]').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.post-card')).toHaveLength(1)
    expect(wrapper.get('.toast').text()).toBe('删除失败，请稍后重试')
  })

  it('点击空状态按钮聚焦输入框', async () => {
    installServer()
    const wrapper = await mountApp()

    await wrapper.get('[data-test="empty-state"] button').trigger('click')

    expect(document.activeElement).toBe(wrapper.get('textarea').element)
  })

  it('每分钟刷新相对时间', async () => {
    vi.useFakeTimers()
    const start = new Date(2024, 4, 20, 12, 0).getTime()
    vi.setSystemTime(start)

    installServer()
    const wrapper = mount(App, { attachTo: container, global: { plugins: [createPinia()] } })
    await settle(wrapper)

    await wrapper.get('textarea').setValue('刚刚发布')
    await wrapper.get('[data-test="publish"]').trigger('click')
    await settle(wrapper)

    expect(wrapper.get('.post-card__time').text()).toBe('刚刚')

    vi.advanceTimersByTime(61 * 1000)
    await wrapper.vm.$nextTick()

    expect(wrapper.get('.post-card__time').text()).toBe('1 分钟前')
  })
})
