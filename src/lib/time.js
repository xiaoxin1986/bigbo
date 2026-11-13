/**
 * 纯函数工具层：字数统计、时间格式化、头像渐变。
 * 与框架无关，便于单元测试。
 */

/** 单条动态正文的最大字符数 */
export const MAX_LENGTH = 280

/**
 * 按字符（而非 UTF-16 码元）统计长度，emoji 只计 1 个。
 * @param {unknown} text
 * @returns {number}
 */
export function countChars(text) {
  if (typeof text !== 'string' || text.length === 0) return 0
  return Array.from(text).length
}

const pad = (value) => (value < 10 ? `0${value}` : String(value))

/**
 * 绝对时间：YYYY-MM-DD HH:mm
 * @param {number} timestamp
 * @returns {string}
 */
export function formatDateTime(timestamp) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

/**
 * 相对时间：刚刚 / n 分钟前 / n 小时前 / 昨天 / n 天前 / 日期
 * @param {number} timestamp
 * @param {number} [now]
 * @returns {string}
 */
export function formatRelativeTime(timestamp, now = Date.now()) {
  const diff = Math.max(0, now - timestamp)
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 2 * day) return '昨天'
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`

  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * 由 id 派生稳定的头像渐变色，避免每次渲染颜色跳变。
 * @param {string} id
 * @returns {string}
 */
export function avatarGradient(id) {
  const source = typeof id === 'string' ? id : String(id ?? '')
  let hash = 0
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) % 360
  }
  return `linear-gradient(135deg, hsl(${hash} 82% 68%), hsl(${(hash + 42) % 360} 78% 58%))`
}
