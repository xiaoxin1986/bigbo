import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PostComposer from '../../src/components/PostComposer.vue'
import { MAX_LENGTH } from '../../src/lib/time.js'

const mountComposer = (props = {}) =>
  mount(PostComposer, { props: { modelValue: '', ...props } })

const getCounter = (wrapper) => wrapper.get('.counter')
const getPublish = (wrapper) => wrapper.get('[data-test="publish"]')

describe('PostComposer', () => {
  it('渲染字数统计与上限提示', () => {
    const wrapper = mountComposer({ modelValue: '你好' })
    expect(wrapper.get('.counter__value').text()).toBe('2')
    expect(wrapper.get('.counter__limit').text()).toBe(`/ ${MAX_LENGTH}`)
  })

  it('输入时向父组件同步内容', async () => {
    const wrapper = mountComposer()
    await wrapper.get('textarea').setValue('此刻在想什么')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual(['此刻在想什么'])
  })

  it('内容为空时发布按钮禁用', () => {
    expect(getPublish(mountComposer()).attributes('disabled')).toBeDefined()
    expect(getPublish(mountComposer({ modelValue: '   ' })).attributes('disabled')).toBeDefined()
  })

  it('有内容时发布按钮可用', () => {
    expect(getPublish(mountComposer({ modelValue: '有内容' })).attributes('disabled')).toBeUndefined()
  })

  it('接近上限（85%）标记 warn，达到上限标记 limit', () => {
    const warnAt = Math.ceil(MAX_LENGTH * 0.85)
    const warn = mountComposer({ modelValue: 'a'.repeat(warnAt) })
    expect(getCounter(warn).classes()).toContain('counter--warn')
    expect(getCounter(warn).classes()).not.toContain('counter--limit')

    const below = mountComposer({ modelValue: 'a'.repeat(warnAt - 1) })
    expect(getCounter(below).classes()).not.toContain('counter--warn')

    const limit = mountComposer({ modelValue: 'a'.repeat(MAX_LENGTH) })
    expect(getCounter(limit).classes()).toContain('counter--limit')
    expect(getCounter(limit).classes()).not.toContain('counter--warn')
    expect(getPublish(limit).attributes('disabled')).toBeUndefined()
  })

  it('超出上限时禁止发布并显示超限计数', () => {
    const wrapper = mountComposer({ modelValue: 'a'.repeat(MAX_LENGTH + 5) })
    expect(getPublish(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.get('.counter__value').text()).toBe(String(MAX_LENGTH + 5))
  })

  it('emoji 计为单个字符', () => {
    const wrapper = mountComposer({ modelValue: '🙂🙂🙂' })
    expect(wrapper.get('.counter__value').text()).toBe('3')
  })

  it('点击发布时抛出已去空白的正文', async () => {
    const wrapper = mountComposer({ modelValue: '  发布内容  ' })
    await getPublish(wrapper).trigger('click')
    expect(wrapper.emitted('submit')).toBeTruthy()
    expect(wrapper.emitted('submit').at(-1)).toEqual(['发布内容'])
  })

  it('Ctrl + Enter 快捷发布', async () => {
    const wrapper = mountComposer({ modelValue: '快捷发布' })
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter', ctrlKey: true })
    expect(wrapper.emitted('submit').at(-1)).toEqual(['快捷发布'])
  })

  it('⌘ + Enter 同样触发快捷发布', async () => {
    const wrapper = mountComposer({ modelValue: 'mac 快捷键' })
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter', metaKey: true })
    expect(wrapper.emitted('submit').at(-1)).toEqual(['mac 快捷键'])
  })

  it('普通 Enter 换行不发布', async () => {
    const wrapper = mountComposer({ modelValue: '多行' })
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('空白内容点击发布不会触发 submit', async () => {
    const wrapper = mountComposer({ modelValue: '   ' })
    await getPublish(wrapper).trigger('click')
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('超限内容点击发布不会触发 submit', async () => {
    const wrapper = mountComposer({ modelValue: 'a'.repeat(MAX_LENGTH + 1) })
    await getPublish(wrapper).trigger('click')
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('textarea 带有 280 字原生上限与无障碍描述', () => {
    const textarea = mountComposer().get('textarea')
    expect(textarea.attributes('maxlength')).toBe(String(MAX_LENGTH))
    expect(textarea.attributes('aria-describedby')).toBe('composerHint')
  })

  it('父组件清空内容后计数与按钮回到初始态', async () => {
    const wrapper = mountComposer({ modelValue: '内容' })
    await wrapper.setProps({ modelValue: '' })
    expect(wrapper.get('.counter__value').text()).toBe('0')
    expect(getPublish(wrapper).attributes('disabled')).toBeDefined()
  })
})
