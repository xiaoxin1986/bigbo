import { getCurrentScope, onScopeDispose, ref } from 'vue'

const EXIT_DURATION = 240
const DEFAULT_DURATION = 2400
const DEFAULT_MAX = 3

/**
 * 轻量 Toast 队列：自动消失、可手动关闭、同一时刻最多保留 max 条。
 * @param {{ duration?: number, max?: number }} [options]
 */
export function useToast(options = {}) {
  const duration = options.duration ?? DEFAULT_DURATION
  const max = options.max ?? DEFAULT_MAX

  const toasts = ref([])
  const timers = new Map()
  let seq = 0

  const clearTimers = (id) => {
    const handles = timers.get(id)
    if (!handles) return
    handles.forEach((handle) => clearTimeout(handle))
    timers.delete(id)
  }

  function remove(id) {
    clearTimers(id)
    toasts.value = toasts.value.filter((item) => item.id !== id)
  }

  /** 播放退场动画后再移除 */
  function hide(id) {
    const target = toasts.value.find((item) => item.id === id)
    if (!target) return
    clearTimers(id)
    target.visible = false
    timers.set(id, [setTimeout(() => remove(id), EXIT_DURATION)])
  }

  /** 立即移除 */
  function dismiss(id) {
    remove(id)
  }

  /**
   * 展示一条提示。
   * @param {string} message
   * @param {'success' | 'error'} [type]
   * @returns {{ id: number, message: string, type: string } | null}
   */
  function show(message, type = 'success') {
    const text = typeof message === 'string' ? message.trim() : ''
    if (!text) return null

    // 相同提示不重复堆叠，只重置它的存活时间
    const duplicate = [...toasts.value]
      .reverse()
      .find((item) => item.message === text && item.type === type)
    if (duplicate) {
      clearTimers(duplicate.id)
      duplicate.visible = true
      timers.set(duplicate.id, [setTimeout(() => hide(duplicate.id), duration)])
      return duplicate
    }

    seq += 1
    const toast = { id: seq, message: text, type, visible: true }
    const overflow = [...toasts.value, toast].slice(0, Math.max(0, toasts.value.length + 1 - max))
    overflow.forEach((item) => remove(item.id))

    toasts.value = [...toasts.value, toast]
    timers.set(toast.id, [setTimeout(() => hide(toast.id), duration)])
    return toast
  }

  function clear() {
    timers.forEach((handles) => handles.forEach((handle) => clearTimeout(handle)))
    timers.clear()
    toasts.value = []
  }

  if (getCurrentScope()) onScopeDispose(clear)

  return { toasts, show, dismiss, clear }
}
