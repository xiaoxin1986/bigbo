<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import { storeToRefs } from 'pinia'
import AppHeader from './components/AppHeader.vue'
import PostComposer from './components/PostComposer.vue'
import PostCard from './components/PostCard.vue'
import EmptyState from './components/EmptyState.vue'
import ToastStack from './components/ToastStack.vue'
import { useToast } from './composables/useToast.js'
import { RECOVERED_MESSAGE, usePostsStore } from './stores/posts.js'

const store = usePostsStore()
const { sortedPosts, postCount, now, isEmpty, isLoading } = storeToRefs(store)

const toast = useToast()
const { toasts } = toast

const draft = ref('')
const image = ref(null)
const highlightId = ref('')
const submitting = ref(false)
const composerRef = ref(null)
const listRef = ref(null)

let clockTimer = null

function scrollToComposer(block = 'center') {
  document.getElementById('postInput')?.scrollIntoView?.({ behavior: 'smooth', block })
}

function focusComposer() {
  composerRef.value?.focus()
  scrollToComposer()
}

async function handleSubmit(content) {
  // 请求在飞的时候忽略重复提交，避免网络慢时连点发出多条
  if (submitting.value) return
  submitting.value = true

  try {
    const result = await store.publish(content, { image: image.value })

    if (!result.ok) {
      toast.show(result.message, 'error')
      // 失败时保留用户输入与图片，只把焦点交还输入框
      focusComposer()
      return
    }

    draft.value = ''
    image.value = null
    highlightId.value = result.post.id
    toast.show('发布成功', 'success')

    await nextTick()
    const firstCard = listRef.value?.querySelector('.post-card')
    firstCard?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
  } finally {
    submitting.value = false
  }
}

/** 删除单条动态：服务端删除成功后才更新本地列表 */
async function handleDelete(post) {
  const result = await store.remove(post.id)

  if (!result.ok) {
    toast.show('删除失败，请稍后重试', 'error')
    return
  }

  if (highlightId.value === post.id) highlightId.value = ''
  toast.show('已删除', 'success')
}

onMounted(async () => {
  // 相对时间每分钟刷新一次，无需重绘整个列表
  clockTimer = window.setInterval(() => store.tick(), 60 * 1000)

  // 首屏数据来自服务端，失败时降级为空白时间线
  const result = await store.hydrate()
  if (!result.ok) toast.show(RECOVERED_MESSAGE, 'error')
})

onBeforeUnmount(() => {
  if (clockTimer) window.clearInterval(clockTimer)
  clockTimer = null
})
</script>

<template>
  <div class="aurora" aria-hidden="true">
    <span class="aurora__blob aurora__blob--one"></span>
    <span class="aurora__blob aurora__blob--two"></span>
    <span class="aurora__blob aurora__blob--three"></span>
  </div>

  <AppHeader />

  <main class="layout">
    <PostComposer
      ref="composerRef"
      v-model="draft"
      v-model:image="image"
      @submit="handleSubmit"
      @image-error="(message) => toast.show(message, 'error')"
    />

    <section class="feed" id="feed" aria-labelledby="feed-title">
      <div class="feed__header">
        <h2 class="feed__title" id="feed-title">最新动态</h2>
        <span class="feed__count" data-test="feed-count">{{ postCount }} 条</span>
      </div>

      <p v-if="isLoading" class="feed__loading" data-test="feed-loading">正在加载…</p>

      <EmptyState v-else-if="isEmpty" @compose="focusComposer" />

      <ol
        v-else
        ref="listRef"
        class="post-list"
        data-test="post-list"
        aria-live="polite"
        aria-relevant="additions"
      >
        <PostCard
          v-for="post in sortedPosts"
          :key="post.id"
          :post="post"
          :now="now"
          :highlight="post.id === highlightId"
          @delete="handleDelete(post)"
        />
      </ol>
    </section>

    <footer class="site-footer">
      <p>BigBo · 数据保存在服务端内存，重启即清空</p>
      <p class="site-footer__stack">Vue 3 · Pinia · Hono · 内存存储</p>
    </footer>
  </main>

  <ToastStack :toasts="toasts" />
</template>
