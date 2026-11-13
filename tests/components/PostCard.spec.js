import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PostCard from '../../src/components/PostCard.vue'
import { avatarGradient, formatDateTime, formatRelativeTime } from '../../src/lib/time.js'

const NOW = new Date(2024, 4, 20, 12, 0).getTime()
const post = {
  id: 'post-abc',
  content: '今天把 BigBo 跑起来了',
  createdAt: NOW - 5 * 60 * 1000,
  liked: false,
  favorited: false,
  likeCount: 0,
  favoriteCount: 0,
}

const mountCard = (props = {}) => mount(PostCard, { props: { post, now: NOW, ...props } })

describe('PostCard', () => {
  it('渲染作者、正文与相对时间', () => {
    const wrapper = mountCard()
    expect(wrapper.get('.post-card__author').text()).toBe('BigBo 用户')
    expect(wrapper.get('.post-card__content').text()).toBe(post.content)
    expect(wrapper.get('.post-card__time').text()).toBe('5 分钟前')
  })

  it('time 元素同时暴露机器可读与完整时间', () => {
    const wrapper = mountCard()
    const time = wrapper.get('time')
    expect(time.attributes('datetime')).toBe(new Date(post.createdAt).toISOString())
    expect(time.attributes('title')).toBe(formatDateTime(post.createdAt))
    expect(time.attributes('data-created-at')).toBe(String(post.createdAt))
  })

  it('now 变化时相对时间随之更新', async () => {
    const wrapper = mountCard()
    await wrapper.setProps({ now: post.createdAt + 2 * 60 * 60 * 1000 })
    expect(wrapper.get('.post-card__time').text()).toBe('2 小时前')

    await wrapper.setProps({ now: post.createdAt + 3 * 24 * 60 * 60 * 1000 })
    expect(wrapper.get('.post-card__time').text()).toBe('3 天前')
  })

  it('头像颜色由 id 稳定派生', () => {
    const wrapper = mountCard()
    const avatar = wrapper.get('.avatar')
    expect(avatar.attributes('style')).toContain(avatarGradient(post.id))
  })

  it('正文中的 HTML 被当作纯文本渲染（防 XSS）', () => {
    const evil = '<img src=x onerror="window.__pwned=1">'
    const wrapper = mountCard({ post: { ...post, content: evil } })

    expect(wrapper.findAll('img')).toHaveLength(0)
    expect(wrapper.get('.post-card__content').text()).toBe(evil)
  })

  it('保留正文中的换行', () => {
    const wrapper = mountCard({ post: { ...post, content: '第一行\n第二行' } })
    expect(wrapper.get('.post-card__content').element.textContent).toContain('\n')
  })

  it('默认不带入场动画，高亮时追加 enter 类', async () => {
    const wrapper = mountCard()
    expect(wrapper.get('.post-card').classes()).not.toContain('post-card--enter')

    await wrapper.setProps({ highlight: true })
    expect(wrapper.get('.post-card').classes()).toContain('post-card--enter')
  })

  it('根节点携带动态 id，便于定位', () => {
    expect(mountCard().get('.post-card').attributes('data-id')).toBe(post.id)
  })

  it('带图片的动态渲染图片', () => {
    const wrapper = mountCard({
      post: { ...post, image: { dataUrl: 'data:image/jpeg;base64,zzz', name: 'a.jpg' } },
    })
    const img = wrapper.get('.post-card__media img')
    expect(img.attributes('src')).toBe('data:image/jpeg;base64,zzz')
    expect(img.attributes('alt')).toBe('a.jpg')
    expect(img.attributes('loading')).toBe('lazy')
  })

  it('无图片的动态不渲染媒体区域', () => {
    expect(mountCard().find('.post-card__media').exists()).toBe(false)
  })

  it('纯图片动态省略空正文段落', () => {
    const wrapper = mountCard({
      post: { ...post, content: '', image: { dataUrl: 'data:image/jpeg;base64,zzz' } },
    })
    expect(wrapper.find('.post-card__content').exists()).toBe(false)
    expect(wrapper.get('.post-card__media img').attributes('alt')).toBe('动态配图')
  })

  it('点击删除按钮触发 delete 事件', async () => {
    const wrapper = mountCard()

    await wrapper.get('[data-test="delete-post"]').trigger('click')

    expect(wrapper.emitted('delete')).toHaveLength(1)
  })

  it('删除按钮带可读的无障碍标签', () => {
    expect(mountCard().get('[data-test="delete-post"]').attributes('aria-label')).toBe(
      `删除动态：${post.content}`,
    )

    const imageOnly = mountCard({
      post: { ...post, content: '', image: { dataUrl: 'data:image/jpeg;base64,zzz' } },
    })
    expect(imageOnly.get('[data-test="delete-post"]').attributes('aria-label')).toBe(
      '删除动态：图片动态',
    )
  })

  it('点赞按钮初始未激活，计数为 0', () => {
    const wrapper = mountCard()
    const like = wrapper.get('[data-test="like-post"]')

    expect(like.attributes('aria-pressed')).toBe('false')
    expect(like.classes()).not.toContain('post-card__action--active')
    expect(wrapper.get('[data-test="like-count"]').text()).toBe('0')
  })

  it('已点赞的动态：按钮激活、aria-pressed 为 true、计数为 1', () => {
    const wrapper = mountCard({ post: { ...post, liked: true, likeCount: 1 } })
    const like = wrapper.get('[data-test="like-post"]')

    expect(like.attributes('aria-pressed')).toBe('true')
    expect(like.classes()).toContain('post-card__action--active')
    expect(wrapper.get('[data-test="like-count"]').text()).toBe('1')
  })

  it('已收藏的动态：按钮激活、计数为 1', () => {
    const wrapper = mountCard({ post: { ...post, favorited: true, favoriteCount: 1 } })

    expect(wrapper.get('[data-test="favorite-post"]').classes()).toContain('post-card__action--active')
    expect(wrapper.get('[data-test="favorite-count"]').text()).toBe('1')
  })

  it('点击点赞按钮触发 like 事件', async () => {
    const wrapper = mountCard()
    await wrapper.get('[data-test="like-post"]').trigger('click')
    expect(wrapper.emitted('like')).toHaveLength(1)
  })

  it('点击收藏按钮触发 favorite 事件', async () => {
    const wrapper = mountCard()
    await wrapper.get('[data-test="favorite-post"]').trigger('click')
    expect(wrapper.emitted('favorite')).toHaveLength(1)
  })
})
