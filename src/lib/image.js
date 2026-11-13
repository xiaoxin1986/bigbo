/**
 * 图片处理层：读取、压缩、校验。
 * 图片以 data URL 形式随动态提交给服务端，因此先在浏览器侧压缩，
 * 既减少请求体积，也让服务端内存里只保留必要的数据量。
 */

/** 压缩后最长边（像素） */
export const IMAGE_MAX_DIM = 1280
/** JPEG 压缩质量 0~1 */
export const IMAGE_QUALITY = 0.82
/** 允许的原图类型 */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
/** 允许的原图大小上限（字节），超过直接拒绝 */
export const IMAGE_MAX_FILE_SIZE = 15 * 1024 * 1024

/**
 * 判断是否为可接受的图片文件。
 * @param {unknown} file
 * @returns {boolean}
 */
export function isImageFile(file) {
  return (
    Boolean(file) &&
    typeof Blob !== 'undefined' &&
    file instanceof Blob &&
    typeof file.type === 'string' &&
    ACCEPTED_IMAGE_TYPES.includes(file.type)
  )
}

/**
 * 将 File/Blob 读取为 data URL。
 * @param {Blob} file
 * @returns {Promise<string>}
 */
export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

/**
 * 用 canvas 等比缩放图片到 maxDim 以内并重新编码。
 * 任何异常（无 canvas、解码失败）都退回原图，保证功能不中断。
 * @param {string} dataUrl
 * @param {{ maxDim?: number, quality?: number }} [options]
 * @returns {Promise<string>}
 */
export function compressImage(dataUrl, options = {}) {
  const maxDim = options.maxDim ?? IMAGE_MAX_DIM
  const quality = options.quality ?? IMAGE_QUALITY

  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return Promise.resolve(dataUrl)
  }

  return new Promise((resolve) => {
    // 先探测 canvas 能力：jsdom 等无 canvas 环境直接原样返回，避免图片加载永不回调
    let context
    try {
      const canvas = document.createElement('canvas')
      context = canvas.getContext('2d')
    } catch {
      context = null
    }
    if (!context) return resolve(dataUrl)

    const image = new Image()
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(dataUrl)

        const scale = Math.min(1, maxDim / Math.max(image.width, image.height))
        const width = Math.max(1, Math.round(image.width * scale))
        const height = Math.max(1, Math.round(image.height * scale))

        canvas.width = width
        canvas.height = height
        ctx.drawImage(image, 0, 0, width, height)

        const outputType = dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'
        resolve(canvas.toDataURL(outputType, quality))
      } catch {
        resolve(dataUrl)
      }
    }
    image.onerror = () => resolve(dataUrl)
    image.src = dataUrl
  })
}

/**
 * 一步完成：读取 + 压缩，返回可入库的图片对象。
 * @param {Blob & { name?: string }} file
 * @returns {Promise<{ dataUrl: string, name: string | null }>}
 */
export async function processImageFile(file) {
  const original = await readFileAsDataUrl(file)
  const dataUrl = await compressImage(original)
  return { dataUrl, name: file.name || null }
}
