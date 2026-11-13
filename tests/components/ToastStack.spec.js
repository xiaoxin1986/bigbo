import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ToastStack from '../../src/components/ToastStack.vue'

const toasts = [
  { id: 1, message: '发布成功', type: 'success', visible: true },
  { id: 2, message: '内容超出 280 字上限', type: 'error', visible: false },
]

describe('ToastStack', () => {
  it('无提示时不渲染任何节点', () => {
    const wrapper = mount(ToastStack, { props: { toasts: [] } })
    expect(wrapper.findAll('.toast')).toHaveLength(0)
  })

  it('按类型渲染提示并标记可见状态', () => {
    const wrapper = mount(ToastStack, { props: { toasts } })
    const items = wrapper.findAll('.toast')

    expect(items).toHaveLength(2)
    expect(items[0].text()).toBe('发布成功')
    expect(items[0].classes()).toContain('toast--success')
    expect(items[0].classes()).toContain('is-visible')

    expect(items[1].classes()).toContain('toast--error')
    expect(items[1].classes()).not.toContain('is-visible')
  })

  it('容器具备无障碍播报属性', () => {
    const wrapper = mount(ToastStack, { props: { toasts: [] } })
    const stack = wrapper.get('.toast-stack')
    expect(stack.attributes('role')).toBe('status')
    expect(stack.attributes('aria-live')).toBe('polite')
  })
})
