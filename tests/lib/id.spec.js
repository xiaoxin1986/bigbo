import { describe, it, expect, afterEach, vi } from 'vitest'
import { createId } from '../../src/lib/id.js'

describe('createId', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('优先使用 crypto.randomUUID', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-from-crypto' })
    expect(createId()).toBe('uuid-from-crypto')
  })

  it('randomUUID 抛错时退回时间戳 + 随机数', () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => {
        throw new Error('not allowed')
      },
    })
    const id = createId()
    expect(id).toMatch(/^p-[a-z0-9]+-[a-z0-9]+$/)
  })

  it('不支持 crypto 的环境同样可用', () => {
    vi.stubGlobal('crypto', undefined)
    expect(createId()).toMatch(/^p-[a-z0-9]+-[a-z0-9]+$/)
  })

  it('兜底 id 不重复', () => {
    vi.stubGlobal('crypto', undefined)
    const ids = new Set(Array.from({ length: 200 }, () => createId()))
    expect(ids.size).toBe(200)
  })
})
