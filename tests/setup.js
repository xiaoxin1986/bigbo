import { afterEach, beforeEach, vi } from 'vitest'

// 前端测试跑在 jsdom，后端测试（// @vitest-environment node）没有 window，
// 这里做一次能力判断，让同一份 setup 同时适用于两种环境。
const clearLocalStorage = () => {
  if (typeof window !== 'undefined' && window.localStorage) window.localStorage.clear()
}

beforeEach(() => {
  clearLocalStorage()
  // 每个用例都从"没有全局替身"的干净状态开始
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
  clearLocalStorage()
})
