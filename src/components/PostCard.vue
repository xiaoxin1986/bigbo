<script setup>
import { computed } from 'vue'
import { avatarGradient, formatDateTime, formatRelativeTime } from '../lib/time.js'

const props = defineProps({
  post: { type: Object, required: true },
  now: { type: Number, default: () => Date.now() },
  highlight: { type: Boolean, default: false },
})

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
    </div>
    <p class="post-card__content">{{ post.content }}</p>
  </li>
</template>
