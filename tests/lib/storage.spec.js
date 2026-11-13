import { describe, it, expect, vi } from 'vitest'
import {
  STORAGE_KEY,
  createMemoryStorage,
  readPosts,
  writePosts,
} from '../../src/lib/storage.js'

const validPost = {
  id: 'p-1',
  content: '第一条动态',
  createdAt: 1700000000000,
}

describe('STORAGE_KEY', () => {
  it('沿用版本化 key，保证旧数据可被读取', () => {
    expect(STORAGE_KEY).toBe('bigbo.posts.v1')
  })
})

describe('createMemoryStorage', () => {
  it('提供与 localStorage 一致的读写接口', () => {
    const storage = createMemoryStorage()
    storage.setItem('k', 'v')
    expect(storage.getItem('k')).toBe('v')
    storage.removeItem('k')
    expect(storage.getItem('k')).toBeNull()
  })

  it('支持注入初始数据', () => {
    const storage = createMemoryStorage({ [STORAGE_KEY]: '[]' })
    expect(storage.getItem(STORAGE_KEY)).toBe('[]')
  })
})

describe('readPosts', () => {
  it('无数据时返回空列表且读取成功', () => {
    const result = readPosts(createMemoryStorage())
    expect(result).toEqual({ posts: [], ok: true })
  })

  it('读取已保存的动态', () => {
    const storage = createMemoryStorage({ [STORAGE_KEY]: JSON.stringify([validPost]) })
    const result = readPosts(storage)
    expect(result.ok).toBe(true)
    expect(result.posts).toEqual([validPost])
  })

  it('过滤结构非法的条目，保留合法条目', () => {
    const storage = createMemoryStorage({
      [STORAGE_KEY]: JSON.stringify([
        validPost,
        null,
        'not-a-post',
        { id: 1, content: 'x', createdAt: 1 },
        { id: 'p-2', content: 'x' },
        { id: 'p-3', content: 'x', createdAt: 'yesterday' },
        { id: 'p-4', content: '保留我', createdAt: 1700000001000, extra: true },
      ]),
    })
    const result = readPosts(storage)
    expect(result.ok).toBe(true)
    expect(result.posts).toEqual([
      validPost,
      { id: 'p-4', content: '保留我', createdAt: 1700000001000, extra: true },
    ])
  })

  it('JSON 损坏时降级为空列表并标记失败', () => {
    const storage = createMemoryStorage({ [STORAGE_KEY]: '{oops' })
    expect(readPosts(storage)).toEqual({ posts: [], ok: false, reason: 'corrupt' })
  })

  it('顶层不是数组时降级为空列表并标记失败', () => {
    const storage = createMemoryStorage({ [STORAGE_KEY]: '{"posts":[]}' })
    expect(readPosts(storage)).toEqual({ posts: [], ok: false, reason: 'corrupt' })
  })

  it('读取抛异常（隐私模式）时安全降级', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('SecurityError')
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }
    expect(readPosts(storage)).toEqual({ posts: [], ok: false, reason: 'unavailable' })
  })

  it('存储不存在时不崩溃', () => {
    expect(readPosts(null)).toEqual({ posts: [], ok: false, reason: 'unavailable' })
  })
})

describe('writePosts', () => {
  it('以 JSON 写入全部动态', () => {
    const storage = createMemoryStorage()
    const result = writePosts([validPost], storage)
    expect(result).toEqual({ ok: true })
    expect(JSON.parse(storage.getItem(STORAGE_KEY))).toEqual([validPost])
  })

  it('写入空数组会覆盖旧数据', () => {
    const storage = createMemoryStorage({ [STORAGE_KEY]: JSON.stringify([validPost]) })
    writePosts([], storage)
    expect(storage.getItem(STORAGE_KEY)).toBe('[]')
  })

  it('超出配额写入失败时返回 ok:false', () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error('QuotaExceededError')
      }),
      removeItem: vi.fn(),
    }
    expect(writePosts([validPost], storage)).toEqual({ ok: false, reason: 'unavailable' })
  })
})

describe('读写往返', () => {
  it('写入后能原样读回', () => {
    const storage = createMemoryStorage()
    const posts = [validPost, { id: 'p-2', content: '第二条', createdAt: 1700000002000 }]
    writePosts(posts, storage)
    expect(readPosts(storage).posts).toEqual(posts)
  })
})
