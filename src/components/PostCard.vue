<script setup>
import { computed } from 'vue'
import { avatarGradient, formatDateTime, formatRelativeTime } from '../lib/time.js'

const props = defineProps({
  post: { type: Object, required: true },
  now: { type: Number, default: () => Date.now() },
  highlight: { type: Boolean, default: false },
})

const emit = defineEmits(['delete'])

const relativeTime = computed(() => formatRelativeTime(props.post.createdAt, props.now))
const absoluteTime = computed(() => formatDateTime(props.post.createdAt))
const machineTime = computed(() => new Date(props.post.createdAt).toISOString())
const gradient = computed(() => avatarGradient(props.post.id))
</script>

<template>
  <li
    class="post-card"
    :class="{ 'post-card--enter': highlight }"
    :data-id="post.id"
  >
    <div class="post-card__head">
      <span class="avatar" aria-hidden="true" :style="{ background: gradient }">B</span>
      <div class="post-card__meta">
        <span class="post-card__author">BigBo 用户</span>
        <time
          class="post-card__time"
          :datetime="machineTime"
          :title="absoluteTime"
          :data-created-at="String(post.createdAt)"
        >
          {{ relativeTime }}
        </time>
      </div>
      <button
        type="button"
        class="post-card__delete"
        data-test="delete-post"
        :aria-label="`删除动态：${post.content || '图片动态'}`"
        @click="emit('delete')"
      >
        删除
      </button>
    </div>
    <p v-if="post.content" class="post-card__content">{{ post.content }}</p>
    <figure v-if="post.image" class="post-card__media">
      <img
        :src="post.image.dataUrl"
        :alt="post.image.name || '动态配图'"
        loading="lazy"
      />
    </figure>
  </li>
</template>
