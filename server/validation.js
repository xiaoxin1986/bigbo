/**
 * 发布动态的服务端校验层：纯函数，不依赖 Hono、存储或前端模块，便于独立单测。
 */

/** 正文最大字符数（按 Unicode 码点计数，emoji 计 1 个） */
export const MAX_LENGTH = 280

/** 单张图片 dataUrl 的最大字符数（约 3MB 二进制） */
export const MAX_IMAGE_DATA_URL_LENGTH = 4_000_000

/** 错误码 -> 用户可读文案（与前端保持一致的措辞） */
export const MESSAGES = {
  EMPTY: '先写点什么再发布吧',
  TOO_LONG: `内容超出 ${MAX_LENGTH} 字上限`,
  INVALID_BODY_OBJECT: '请求体必须是 JSON 对象',
  INVALID_CONTENT_TYPE: 'content 必须是字符串',
  INVALID_IMAGE: '图片数据不合法',
  IMAGE_TOO_LARGE: '图片数据过大',
  INVALID_LIKE: 'liked 必须是布尔值',
  INVALID_FAVORITE: 'favorited 必须是布尔值',
}

const fail = (code, message) => ({ ok: false, code, message })

/**
 * 按 Unicode 码点统计字符数，emoji 只算 1 个。
 * @param {unknown} text
 * @returns {number}
 */
export function countChars(text) {
  if (typeof text !== 'string' || text.length === 0) return 0
  return Array.from(text).length
}

/**
 * content 归一化：非字符串视为空串，字符串一律 trim。
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeContent(raw) {
  return typeof raw === 'string' ? raw.trim() : ''
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 校验并规范化 image 字段；缺失 / null 视为无图。
 * @param {unknown} raw
 * @returns {{ ok: true, value: null | { dataUrl: string, name: string | null } }
 *   | { ok: false, code: string, message: string }}
 */
function validateImage(raw) {
  if (raw === undefined || raw === null) return { ok: true, value: null }
  if (!isPlainObject(raw)) return fail('INVALID_BODY', MESSAGES.INVALID_IMAGE)

  const { dataUrl, name } = raw
  if (typeof dataUrl !== 'string' || dataUrl.length === 0) {
    return fail('INVALID_BODY', MESSAGES.INVALID_IMAGE)
  }
  if (dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
    return fail('INVALID_BODY', MESSAGES.IMAGE_TOO_LARGE)
  }
  if (name !== undefined && name !== null && typeof name !== 'string') {
    return fail('INVALID_BODY', MESSAGES.INVALID_IMAGE)
  }

  return { ok: true, value: { dataUrl, name: typeof name === 'string' ? name : null } }
}

/**
 * 校验 POST /api/posts 的请求体。
 * 顺序：结构（对象 / content 类型 / image 结构）→ 空内容 → 超长，
 * 这样「请求本身不合法」优先于「内容为空」，错误定位更准确。
 * @param {unknown} payload 已 JSON.parse 的请求体
 * @returns {{ ok: true, value: { content: string, image: null | { dataUrl: string, name: string | null } } }
 *   | { ok: false, code: string, message: string }}
 */
export function validateCreatePayload(payload) {
  if (!isPlainObject(payload)) return fail('INVALID_BODY', MESSAGES.INVALID_BODY_OBJECT)

  const { content: rawContent } = payload
  if (rawContent !== undefined && typeof rawContent !== 'string') {
    return fail('INVALID_BODY', MESSAGES.INVALID_CONTENT_TYPE)
  }

  const imageResult = validateImage(payload.image)
  if (!imageResult.ok) return imageResult

  const content = normalizeContent(rawContent)
  const image = imageResult.value

  if (content.length === 0 && !image) return fail('EMPTY', MESSAGES.EMPTY)
  if (countChars(content) > MAX_LENGTH) return fail('TOO_LONG', MESSAGES.TOO_LONG)

  return { ok: true, value: { content, image } }
}

/**
 * 校验布尔型反应字段（liked / favorited）。请求体必须是 JSON 对象，
 * 目标字段必须是布尔值，否则返回对应的 INVALID_BODY。
 * @param {unknown} payload 已 JSON.parse 的请求体
 * @param {'liked' | 'favorited'} field
 * @returns {{ ok: true, value: boolean } | { ok: false, code: string, message: string }}
 */
function validateBooleanField(payload, field) {
  if (!isPlainObject(payload)) return fail('INVALID_BODY', MESSAGES.INVALID_BODY_OBJECT)

  const value = payload[field]
  if (typeof value !== 'boolean') {
    return fail('INVALID_BODY', field === 'liked' ? MESSAGES.INVALID_LIKE : MESSAGES.INVALID_FAVORITE)
  }

  return { ok: true, value }
}

/**
 * 校验 PUT /api/posts/:id/like 的请求体：{ liked: boolean }。
 * @param {unknown} payload
 */
export function validateLikePayload(payload) {
  return validateBooleanField(payload, 'liked')
}

/**
 * 校验 PUT /api/posts/:id/favorite 的请求体：{ favorited: boolean }。
 * @param {unknown} payload
 */
export function validateFavoritePayload(payload) {
  return validateBooleanField(payload, 'favorited')
}
