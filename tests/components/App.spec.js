import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import App from '../../src/App.vue'
import { STORAGE_KEY } from '../../src/lib/storage.js'

let container = null

const mountApp = () =>
  mount(App, { attachTo: container, global: { plugins: [createPinia()] } })

const seed = (posts) => window.localStorage.setItem(STORAGE_KEY, JSON.stringify(posts))

const publish = async (wrapper, text) => {
  await wrapper.get('textarea').setValue(text)
  await wrapper.get('[data-test="publish"]').trigger('click')
  await wrapper.vm.$nextTick()
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

  it('首次进入展示品牌、空状态与 0 条计数', () => {
    const wrapper = mountApp()

    expect(wrapper.get('.brand__name').text()).toBe('BigBo')
    expect(wrapper.get('.storage-badge').text()).toContain('本地存储')
    expect(wrapper.find('[data-test="empty-state"]').exists()).toBe(true)
    expect(wrapper.findAll('.post-card')).toHaveLength(0)
    expect(wrapper.get('[data-test="feed-count"]').text()).toBe('0 条')
  })

  it('从 localStorage 恢复动态并倒序渲染', () => {
    seed([
      { id: 'p-old', content: '旧动态', createdAt: 1700000000000 },
      { id: 'p-new', content: '新动态', createdAt: 1700000100000 },
    ])

    const wrapper = mountApp()
    const cards = wrapper.findAll('.post-card')

    expect(cards).toHaveLength(2)
    expect(cards[0].text()).toContain('新动态')
    expect(cards[1].text()).toContain('旧动态')
    expect(wrapper.find('[data-test="empty-state"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="feed-count"]').text()).toBe('2 条')
  })

  it('发布后卡片置顶、计数更新、输入框清空并提示成功', async () => {
    const wrapper = mountApp()

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

  it('发布后写入 localStorage，重新挂载仍可见', async () => {
    const first = mountApp()
    await publish(first, '跨刷新保留')
    first.unmount()

    const second = mountApp()
    expect(second.findAll('.post-card')).toHaveLength(1)
    expect(second.get('.post-card').text()).toContain('跨刷新保留')
  })

  it('Ctrl + Enter 快捷发布', async () => {
    const wrapper = mountApp()

    await wrapper.get('textarea').setValue('快捷键发布')
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter', ctrlKey: true })
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.post-card')).toHaveLength(1)
  })

  it('空白内容不产生卡片、不落盘', async () => {
    const wrapper = mountApp()

    await publish(wrapper, '    ')

    expect(wrapper.findAll('.post-card')).toHaveLength(0)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('超出 280 字时按钮禁用，内容不落盘且输入保留', async () => {
    const wrapper = mountApp()

    await wrapper.get('textarea').setValue('a'.repeat(281))

    expect(wrapper.findAll('.post-card')).toHaveLength(0)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(wrapper.get('[data-test="publish"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.counter').classes()).toContain('counter--limit')
    expect(wrapper.get('textarea').element.value).toHaveLength(281)
  })

  it('本地数据损坏时提示并从空白开始', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not-json')
    const wrapper = mountApp()

    expect(wrapper.find('[data-test="empty-state"]').exists()).toBe(true)
    expect(wrapper.get('.toast').text()).toBe('读取本地数据失败，已从空白开始')
  })

  it('写入失败时保留用户输入并提示存储不可用', async () => {
    const wrapper = mountApp()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    await publish(wrapper, '写不进去的内容')

    expect(wrapper.findAll('.post-card')).toHaveLength(0)
    expect(wrapper.get('.toast').text()).toBe('本地存储不可用，内容未能保存')
    expect(wrapper.get('textarea').element.value).toBe('写不进去的内容')
    expect(wrapper.get('[data-test="feed-count"]').text()).toBe('0 条')
  })

  it('点击空状态按钮聚焦输入框', async () => {
    const wrapper = mountApp()
    await wrapper.get('[data-test="empty-state"] button').trigger('click')

    expect(document.activeElement).toBe(wrapper.get('textarea').element)
  })

  it('每分钟刷新相对时间', async () => {
    vi.useFakeTimers()
    const start = new Date(2024, 4, 20, 12, 0).getTime()
    vi.setSystemTime(start)

    const wrapper = mountApp()
    await publish(wrapper, '刚刚发布')
    expect(wrapper.get('.post-card__time').text()).toBe('刚刚')

    vi.advanceTimersByTime(61 * 1000)
    await wrapper.vm.$nextTick()

    expect(wrapper.get('.post-card__time').text()).toBe('1 分钟前')
  })
})
