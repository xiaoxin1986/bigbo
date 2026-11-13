// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  MAX_IMAGE_DATA_URL_LENGTH,
  MAX_LENGTH,
  normalizeContent,
  validateCreatePayload,
} from '../../server/validation.js'

const failure = (payload) => {
  const result = validateCreatePayload(payload)
  expect(result.ok).toBe(false)
  return result
}

const success = (payload) => {
  const result = validateCreatePayload(payload)
  expect(result.ok).toBe(true)
  return result.value
}

describe('MAX_LENGTH', () => {
  it('上限是 280', () => {
    expect(MAX_LENGTH).toBe(280)
  })
})

describe('normalizeContent', () => {
  it('去掉两端空白', () => {
    expect(normalizeContent('  你好  ')).toBe('你好')
  })

  it('保留中间换行，只 trim 两端', () => {
    expect(normalizeContent('\n 第一行\n第二行 \t')).toBe('第一行\n第二行')
  })

  it('非字符串一律返回空串', () => {
    expect(normalizeContent(undefined)).toBe('')
    expect(normalizeContent(null)).toBe('')
    expect(normalizeContent(42)).toBe('')
    expect(normalizeContent({ text: 'hi' })).toBe('')
    expect(normalizeContent(['hi'])).toBe('')
  })
})

describe('validateCreatePayload —— 成功路径', () => {
  it('纯文字通过并 trim', () => {
    expect(success({ content: '  今天把 BigBo 跑起来了  ' })).toEqual({
      content: '今天把 BigBo 跑起来了',
      image: null,
    })
  })

  it('纯图片通过，content 为空串，name 缺省为 null', () => {
    expect(success({ image: { dataUrl: 'data:image/png;base64,AAA' } })).toEqual({
      content: '',
      image: { dataUrl: 'data:image/png;base64,AAA', name: null },
    })
  })

  it('图文动态同时保留 content 与 image', () => {
    expect(
      success({ content: ' 配文 ', image: { dataUrl: 'data:image/png;base64,BBB', name: 'a.png' } }),
    ).toEqual({
      content: '配文',
      image: { dataUrl: 'data:image/png;base64,BBB', name: 'a.png' },
    })
  })

  it('image 显式 null 视为无图', () => {
    expect(success({ content: '只有文字', image: null })).toEqual({ content: '只有文字', image: null })
  })

  it('280 个 emoji 通过（按码点计数）', () => {
    const content = '😀'.repeat(280)
    const value = success({ content })
    expect(Array.from(value.content)).toHaveLength(280)
  })

  it('280 个中文通过', () => {
    expect(success({ content: '中'.repeat(280) }).content).toHaveLength(280)
  })

  it('恰好 4_000_000 字符的 dataUrl 通过', () => {
    const dataUrl = `data:image/png;base64,${'a'.repeat(MAX_IMAGE_DATA_URL_LENGTH - 22)}`
    expect(dataUrl).toHaveLength(MAX_IMAGE_DATA_URL_LENGTH)
    expect(success({ image: { dataUrl } }).image.dataUrl).toHaveLength(MAX_IMAGE_DATA_URL_LENGTH)
  })
})

describe('validateCreatePayload —— 空内容', () => {
  it('空对象返回 EMPTY', () => {
    const result = failure({})
    expect(result.code).toBe('EMPTY')
    expect(result.message).toBe('先写点什么再发布吧')
  })

  it('只有空白返回 EMPTY', () => {
    expect(failure({ content: '   \n\t  ' }).code).toBe('EMPTY')
  })

  it('空串 content 且 image 为 null 返回 EMPTY', () => {
    expect(failure({ content: '', image: null }).code).toBe('EMPTY')
  })
})

describe('validateCreatePayload —— 超长', () => {
  it('281 个中文返回 TOO_LONG', () => {
    const result = failure({ content: '中'.repeat(281) })
    expect(result.code).toBe('TOO_LONG')
    expect(result.message).toBe('内容超出 280 字上限')
  })

  it('281 个 emoji 返回 TOO_LONG', () => {
    expect(failure({ content: '😀'.repeat(281) }).code).toBe('TOO_LONG')
  })

  it('超过 10000 字符同样返回 TOO_LONG', () => {
    expect(failure({ content: 'a'.repeat(10000) }).code).toBe('TOO_LONG')
  })

  it('trim 后再判长度：280 个字符外夹空白可通过', () => {
    expect(success({ content: `   ${'中'.repeat(280)}   ` }).content).toHaveLength(280)
  })
})

describe('validateCreatePayload —— 结构非法', () => {
  it.each([
    ['null', null],
    ['数组', []],
    ['字符串', 'hello'],
    ['数字', 42],
    ['布尔', true],
  ])('请求体是 %s 时返回 INVALID_BODY', (_label, payload) => {
    const result = failure(payload)
    expect(result.code).toBe('INVALID_BODY')
    expect(result.message).toBe('请求体必须是 JSON 对象')
  })

  it('content 非字符串返回 INVALID_BODY', () => {
    const result = failure({ content: 123 })
    expect(result.code).toBe('INVALID_BODY')
    expect(result.message).toBe('content 必须是字符串')
  })

  it('content 为 null 返回 INVALID_BODY', () => {
    expect(failure({ content: null }).code).toBe('INVALID_BODY')
  })

  it('image 非对象返回 INVALID_BODY', () => {
    const result = failure({ content: '有文字', image: 'not-an-object' })
    expect(result.code).toBe('INVALID_BODY')
    expect(result.message).toBe('图片数据不合法')
  })

  it('image 是数组返回 INVALID_BODY', () => {
    expect(failure({ content: '有文字', image: [] }).code).toBe('INVALID_BODY')
  })

  it('image 缺 dataUrl 返回 INVALID_BODY', () => {
    expect(failure({ content: '有文字', image: {} }).code).toBe('INVALID_BODY')
  })

  it('image dataUrl 为空串返回 INVALID_BODY', () => {
    expect(failure({ content: '有文字', image: { dataUrl: '' } }).code).toBe('INVALID_BODY')
  })

  it('image dataUrl 非字符串返回 INVALID_BODY', () => {
    expect(failure({ image: { dataUrl: 123 } }).code).toBe('INVALID_BODY')
  })

  it('image name 非字符串且非 null 返回 INVALID_BODY', () => {
    const result = failure({ content: '有文字', image: { dataUrl: 'data:image/png;base64,AAA', name: 1 } })
    expect(result.code).toBe('INVALID_BODY')
    expect(result.message).toBe('图片数据不合法')
  })

  it('dataUrl 过大返回 INVALID_BODY 并提示图片数据过大', () => {
    const dataUrl = 'a'.repeat(MAX_IMAGE_DATA_URL_LENGTH + 1)
    const result = failure({ content: '有文字', image: { dataUrl } })
    expect(result.code).toBe('INVALID_BODY')
    expect(result.message).toBe('图片数据过大')
  })
})
