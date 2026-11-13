// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { createPostStore } from '../../server/store.js'

const createSequentialNow = (start = 1_000, step = 1_000) => {
  let current = start
  return () => {
    current += step
    return current
  }
}

const createSequentialId = () => {
  let index = 0
  return () => `id-${++index}`
}

describe('createPostStore —— 默认行为', () => {
  it('初始为空', () => {
    const store = createPostStore()
    expect(store.size).toBe(0)
    expect(store.list()).toEqual([])
  })

  it('默认 id 用随机串，createdAt 用当前时间', () => {
    const store = createPostStore()
    const post = store.create({ content: '你好' })
    expect(typeof post.id).toBe('string')
    expect(post.id.length).toBeGreaterThan(0)
    expect(typeof post.createdAt).toBe('number')
    expect(Number.isFinite(post.createdAt)).toBe(true)
    expect(store.size).toBe(1)
  })

  it('每条 id 不重复', () => {
    const store = createPostStore()
    const ids = Array.from({ length: 20 }, (_, index) => store.create({ content: `#${index}` }).id)
    expect(new Set(ids).size).toBe(20)
  })
})

describe('createPostStore —— 可注入 now / createId', () => {
  it('createdAt 与 id 来自注入的依赖', () => {
    const store = createPostStore({ now: createSequentialNow(1_000, 10), createId: createSequentialId() })
    const first = store.create({ content: '第一条' })
    const second = store.create({ content: '第二条' })
    expect(first).toEqual({ id: 'id-1', content: '第一条', createdAt: 1_010 })
    expect(second.id).toBe('id-2')
    expect(second.createdAt).toBe(1_020)
  })
})

describe('createPostStore —— list', () => {
  it('按 createdAt 倒序返回', () => {
    const store = createPostStore({ now: createSequentialNow(), createId: createSequentialId() })
    store.create({ content: '最早' })
    store.create({ content: '中间' })
    store.create({ content: '最新' })
    expect(store.list().map((post) => post.content)).toEqual(['最新', '中间', '最早'])
  })

  it('createdAt 相同时后创建的排前面', () => {
    let fixed = 1_700_000_000_000
    const store = createPostStore({ now: () => fixed, createId: createSequentialId() })
    store.create({ content: 'A' })
    store.create({ content: 'B' })
    expect(store.list().map((post) => post.content)).toEqual(['B', 'A'])
  })

  it('返回副本：修改数组或元素不影响内部数据', () => {
    const store = createPostStore()
    store.create({ content: '原文', image: { dataUrl: 'data:image/png;base64,AAA', name: 'a.png' } })

    const snapshot = store.list()
    snapshot[0].content = '被篡改'
    snapshot[0].image.dataUrl = '被篡改'
    snapshot.push({ id: 'fake', content: '假数据', createdAt: 0 })

    const again = store.list()
    expect(again).toHaveLength(1)
    expect(again[0].content).toBe('原文')
    expect(again[0].image.dataUrl).toBe('data:image/png;base64,AAA')
    expect(store.size).toBe(1)
  })
})

describe('createPostStore —— get', () => {
  it('命中时返回副本', () => {
    const store = createPostStore({ createId: createSequentialId() })
    store.create({ content: '可读取' })
    const post = store.get('id-1')
    expect(post).toEqual({ id: 'id-1', content: '可读取', createdAt: expect.any(Number) })

    post.content = '被篡改'
    expect(store.get('id-1').content).toBe('可读取')
  })

  it('未知 id 返回 null', () => {
    const store = createPostStore()
    expect(store.get('nope')).toBeNull()
    expect(store.get(undefined)).toBeNull()
  })
})

describe('createPostStore —— create', () => {
  it('纯图片动态 content 为空串，image.name 规范化为 null', () => {
    const store = createPostStore()
    const post = store.create({ content: '', image: { dataUrl: 'data:image/png;base64,AAA' } })
    expect(post.content).toBe('')
    expect(post.image).toEqual({ dataUrl: 'data:image/png;base64,AAA', name: null })
  })

  it('无图时不带 image 字段', () => {
    const store = createPostStore()
    expect('image' in store.create({ content: '只有文字' })).toBe(false)
  })

  it('返回副本：修改返回值不影响内部数据', () => {
    const store = createPostStore()
    const post = store.create({ content: '原文', image: { dataUrl: 'data:image/png;base64,AAA', name: null } })
    post.content = '被篡改'
    post.image.dataUrl = '被篡改'
    expect(store.list()[0].content).toBe('原文')
    expect(store.list()[0].image.dataUrl).toBe('data:image/png;base64,AAA')
  })
})

describe('createPostStore —— remove / clear / size', () => {
  it('remove 返回被删除的动态，size 递减', () => {
    const store = createPostStore({ createId: createSequentialId() })
    store.create({ content: '甲' })
    store.create({ content: '乙' })
    expect(store.size).toBe(2)

    expect(store.remove('id-1')).toEqual({ id: 'id-1', content: '甲', createdAt: expect.any(Number) })
    expect(store.size).toBe(1)
    expect(store.get('id-1')).toBeNull()
  })

  it('remove 未知 id 返回 null 且不影响数据', () => {
    const store = createPostStore({ createId: createSequentialId() })
    store.create({ content: '甲' })
    expect(store.remove('nope')).toBeNull()
    expect(store.size).toBe(1)
  })

  it('remove 返回的是副本', () => {
    const store = createPostStore({ createId: createSequentialId() })
    store.create({ content: '甲' })
    const removed = store.remove('id-1')
    removed.content = '被篡改'
    expect(store.remove('id-1')).toBeNull()
    expect(store.size).toBe(0)
  })

  it('clear 清空所有数据', () => {
    const store = createPostStore()
    store.create({ content: '甲' })
    store.create({ content: '乙' })
    store.clear()
    expect(store.size).toBe(0)
    expect(store.list()).toEqual([])
  })

  it('两个 store 实例互不影响', () => {
    const left = createPostStore()
    const right = createPostStore()
    left.create({ content: '只在左边' })
    expect(left.size).toBe(1)
    expect(right.size).toBe(0)
    expect(right.list()).toEqual([])
  })
})
