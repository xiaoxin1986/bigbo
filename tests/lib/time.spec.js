import { describe, it, expect } from 'vitest'
import {
  MAX_LENGTH,
  avatarGradient,
  countChars,
  formatDateTime,
  formatRelativeTime,
} from '../../src/lib/time.js'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('MAX_LENGTH', () => {
  it('正文上限为 280 字', () => {
    expect(MAX_LENGTH).toBe(280)
  })
})

describe('countChars', () => {
  it('按字符统计而非 UTF-16 码元', () => {
    expect(countChars('hello')).toBe(5)
    expect(countChars('你好世界')).toBe(4)
  })

  it('emoji 计为 1 个字符', () => {
    expect(countChars('🙂')).toBe(1)
    expect(countChars('你好🙂')).toBe(3)
  })

  it('空值与空字符串计为 0', () => {
    expect(countChars('')).toBe(0)
    expect(countChars(null)).toBe(0)
    expect(countChars(undefined)).toBe(0)
  })

  it('保留空白字符的计数（校验交给 trim）', () => {
    expect(countChars('   ')).toBe(3)
  })
})

describe('formatDateTime', () => {
  it('输出 YYYY-MM-DD HH:mm 并补零', () => {
    const ts = new Date(2024, 0, 5, 9, 7).getTime()
    expect(formatDateTime(ts)).toBe('2024-01-05 09:07')
  })

  it('两位数月份与时间不额外补零', () => {
    const ts = new Date(2024, 10, 25, 23, 59).getTime()
    expect(formatDateTime(ts)).toBe('2024-11-25 23:59')
  })
})

describe('formatRelativeTime', () => {
  const now = new Date(2024, 4, 20, 12, 0).getTime()

  it('不足 1 分钟显示"刚刚"', () => {
    expect(formatRelativeTime(now, now)).toBe('刚刚')
    expect(formatRelativeTime(now - MINUTE + 1, now)).toBe('刚刚')
  })

  it('分钟级显示 n 分钟前', () => {
    expect(formatRelativeTime(now - MINUTE, now)).toBe('1 分钟前')
    expect(formatRelativeTime(now - 5 * MINUTE, now)).toBe('5 分钟前')
    expect(formatRelativeTime(now - 59 * MINUTE, now)).toBe('59 分钟前')
  })

  it('小时级显示 n 小时前', () => {
    expect(formatRelativeTime(now - HOUR, now)).toBe('1 小时前')
    expect(formatRelativeTime(now - 23 * HOUR, now)).toBe('23 小时前')
  })

  it('1~2 天显示"昨天"', () => {
    expect(formatRelativeTime(now - 25 * HOUR, now)).toBe('昨天')
    expect(formatRelativeTime(now - 47 * HOUR, now)).toBe('昨天')
  })

  it('一周内显示 n 天前', () => {
    expect(formatRelativeTime(now - 2 * DAY, now)).toBe('2 天前')
    expect(formatRelativeTime(now - 6 * DAY, now)).toBe('6 天前')
  })

  it('超过一周回落为日期', () => {
    const old = new Date(2024, 3, 1, 8, 30).getTime()
    expect(formatRelativeTime(old, now)).toBe('2024-04-01')
  })

  it('未来时间被夹紧为"刚刚"，不出现负值', () => {
    expect(formatRelativeTime(now + 10 * MINUTE, now)).toBe('刚刚')
  })
})

describe('avatarGradient', () => {
  it('同一 id 始终得到相同渐变（渲染稳定）', () => {
    expect(avatarGradient('post-1')).toBe(avatarGradient('post-1'))
  })

  it('不同 id 通常得到不同渐变', () => {
    expect(avatarGradient('a')).not.toBe(avatarGradient('b'))
  })

  it('输出合法的 CSS 线性渐变', () => {
    const gradient = avatarGradient('696e44fa-2a5a-4b0e-9c14-2b0a4f8d84c9')
    expect(gradient).toMatch(/^linear-gradient\(135deg, hsl\(\d+ 82% 68%\), hsl\(\d+ 78% 58%\)\)$/)
    const hues = [...gradient.matchAll(/hsl\((\d+)/g)].map((m) => Number(m[1]))
    expect(hues).toHaveLength(2)
    hues.forEach((hue) => {
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThan(360)
    })
  })
})
