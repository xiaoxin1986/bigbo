import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EmptyState from '../../src/components/EmptyState.vue'

describe('EmptyState', () => {
  it('展示空状态文案与引导按钮', () => {
    const wrapper = mount(EmptyState)
    expect(wrapper.get('.empty-state__title').text()).toBe('还没有任何动态')
    expect(wrapper.get('.empty-state__text').text()).toContain('保存在这台设备上')
    expect(wrapper.get('button').text()).toBe('发布第一条')
  })

  it('点击按钮向父组件求焦输入框', async () => {
    const wrapper = mount(EmptyState)
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('compose')).toBeTruthy()
  })
})
