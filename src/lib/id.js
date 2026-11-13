/**
 * 生成动态唯一 id。
 * 优先使用 crypto.randomUUID（需安全上下文），否则用时间戳 + 随机数兜底。
 * @returns {string}
 */
export function createId() {
  const cryptoObject = globalThis.crypto
  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
    try {
      return cryptoObject.randomUUID()
    } catch {
      /* 某些环境存在但不可调用，走兜底分支 */
    }
  }
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
