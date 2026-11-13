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
const { sortedPosts, postCount, now, isEmpty } = storeToRefs(store)

const toast = useToast()
const { toasts } = toast

// 首次渲染前同步恢复本地数据，避免空状态闪烁
const hydrateResult = store.hydrate()
if (!hydrateResult.ok) toast.show(RECOVERED_MESSAGE, 'error')

const draft = ref('')
const highlightId = ref('')
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
  const result = store.publish(content)

  if (!result.ok) {
    toast.show(result.message, 'error')
    // 失败时保留用户输入，只把焦点交还输入框
    focusComposer()
    return
  }

  draft.value = ''
  highlightId.value = result.post.id
  toast.show('发布成功', 'success')

  await nextTick()
  const firstCard = listRef.value?.querySelector('.post-card')
  firstCard?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
}

onMounted(() => {
  // 相对时间每分钟刷新一次，无需重绘整个列表
  clockTimer = window.setInterval(() => store.tick(), 60 * 1000)
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
    <PostComposer ref="composerRef" v-model="draft" @submit="handleSubmit" />

    <section class="feed" id="feed" aria-labelledby="feed-title">
      <div class="feed__header">
        <h2 class="feed__title" id="feed-title">最新动态</h2>
        <span class="feed__count" data-test="feed-count">{{ postCount }} 条</span>
      </div>

      <EmptyState v-if="isEmpty" @compose="focusComposer" />

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
        />
      </ol>
    </section>

    <footer class="site-footer">
      <p>BigBo · 纯前端演示项目，数据仅存储于当前浏览器</p>
      <p class="site-footer__stack">Vue 3 · Pinia · Local Storage</p>
    </footer>
  </main>

  <ToastStack :toasts="toasts" />
</template>
