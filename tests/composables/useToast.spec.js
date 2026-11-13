import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useToast } from '../../src/composables/useToast.js'

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('show 后新增一条可见提示', () => {
    const toast = useToast()
    toast.show('发布成功')

    expect(toast.toasts.value).toHaveLength(1)
    expect(toast.toasts.value[0]).toMatchObject({ message: '发布成功', type: 'success', visible: true })
  })

  it('支持错误类型', () => {
    const toast = useToast()
    toast.show('出错了', 'error')
    expect(toast.toasts.value[0].type).toBe('error')
  })

  it('默认 2.4 秒后自动移除', () => {
    const toast = useToast()
    toast.show('发布成功')

    vi.advanceTimersByTime(2399)
    expect(toast.toasts.value).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(toast.toasts.value).toHaveLength(1)
    expect(toast.toasts.value[0].visible).toBe(false)

    vi.advanceTimersByTime(240)
    expect(toast.toasts.value).toHaveLength(0)
  })

  it('dismiss 可立即移除', () => {
    const toast = useToast()
    const first = toast.show('一')
    toast.show('二')
    toast.dismiss(first.id)

    expect(toast.toasts.value.map((item) => item.message)).toEqual(['二'])
  })

  it('同时最多保留 3 条', () => {
    const toast = useToast()
    toast.show('一')
    toast.show('二')
    toast.show('三')
    toast.show('四')

    expect(toast.toasts.value).toHaveLength(3)
    expect(toast.toasts.value.map((item) => item.message)).toEqual(['二', '三', '四'])
  })

  it('重复展示相同提示时只保留一条并重置计时', () => {
    const toast = useToast()
    toast.show('发布成功')

    vi.advanceTimersByTime(1000)
    toast.show('发布成功')
    expect(toast.toasts.value).toHaveLength(1)

    vi.advanceTimersByTime(1400)
    expect(toast.toasts.value[0].visible).toBe(true)

    vi.advanceTimersByTime(1000)
    expect(toast.toasts.value[0].visible).toBe(false)
  })

  it('message 为空时不显示', () => {
    const toast = useToast()
    toast.show('   ')
    expect(toast.toasts.value).toHaveLength(0)
  })

  it('clear 清空全部并停止计时器', () => {
    const toast = useToast()
    toast.show('一')
    toast.clear()
    expect(toast.toasts.value).toHaveLength(0)

    vi.advanceTimersByTime(10000)
    expect(toast.toasts.value).toHaveLength(0)
  })
})
