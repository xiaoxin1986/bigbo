import { describe, it, expect } from 'vitest'
import {
  ACCEPTED_IMAGE_TYPES,
  IMAGE_MAX_DIM,
  IMAGE_QUALITY,
  compressImage,
  isImageFile,
  processImageFile,
  readFileAsDataUrl,
} from '../../src/lib/image.js'

const makeFile = (type, name = 'a.png') => new File(['image-bytes'], name, { type })

describe('常量', () => {
  it('图片压缩目标边长与质量合理', () => {
    expect(IMAGE_MAX_DIM).toBeGreaterThan(0)
    expect(IMAGE_QUALITY).toBeGreaterThan(0)
    expect(IMAGE_QUALITY).toBeLessThanOrEqual(1)
  })

  it('接受常见图片格式', () => {
    expect(ACCEPTED_IMAGE_TYPES).toContain('image/jpeg')
    expect(ACCEPTED_IMAGE_TYPES).toContain('image/png')
    expect(ACCEPTED_IMAGE_TYPES).toContain('image/webp')
    expect(ACCEPTED_IMAGE_TYPES).toContain('image/gif')
  })
})

describe('isImageFile', () => {
  it('识别图片文件', () => {
    expect(isImageFile(makeFile('image/png'))).toBe(true)
    expect(isImageFile(makeFile('image/jpeg'))).toBe(true)
    expect(isImageFile(makeFile('image/webp'))).toBe(true)
  })

  it('拒绝非图片文件', () => {
    expect(isImageFile(makeFile('application/pdf'))).toBe(false)
    expect(isImageFile(makeFile('text/plain'))).toBe(false)
    expect(isImageFile(null)).toBe(false)
    expect(isImageFile({ type: 'image/png' })).toBe(false)
  })
})

describe('readFileAsDataUrl', () => {
  it('把图片文件读成 data URL', async () => {
    const dataUrl = await readFileAsDataUrl(makeFile('image/png', 'pic.png'))
    expect(typeof dataUrl).toBe('string')
    expect(dataUrl).toMatch(/^data:image\/png;base64,/)
  })
})

describe('compressImage', () => {
  it('无 canvas 环境时原样返回（测试/降级路径）', async () => {
    const original = 'data:image/png;base64,AAAA'
    await expect(compressImage(original)).resolves.toBe(original)
  })
})

describe('processImageFile', () => {
  it('返回 dataUrl 与原始文件名', async () => {
    const result = await processImageFile(makeFile('image/png', 'photo.png'))
    expect(result).toMatchObject({ name: 'photo.png' })
    expect(result.dataUrl).toMatch(/^data:image\/png;base64,/)
  })
})
