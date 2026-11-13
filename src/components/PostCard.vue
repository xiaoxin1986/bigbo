<script setup>
import { computed } from 'vue'
import { avatarGradient, formatDateTime, formatRelativeTime } from '../lib/time.js'

const props = defineProps({
  post: { type: Object, required: true },
  now: { type: Number, default: () => Date.now() },
  highlight: { type: Boolean, default: false },
})

const emit = defineEmits(['delete', 'like', 'favorite'])

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

    <div class="post-card__actions">
      <button
        type="button"
        class="post-card__action"
        :class="{ 'post-card__action--active': post.liked }"
        data-test="like-post"
        :aria-pressed="String(Boolean(post.liked))"
        :aria-label="post.liked ? '取消点赞' : '点赞'"
        @click="emit('like')"
      >
        <svg
          class="post-card__action-icon"
          viewBox="0 0 24 24"
          :fill="post.liked ? 'currentColor' : 'none'"
          aria-hidden="true"
        >
          <path
            d="M12 21s-7.5-4.7-9.5-9C1 8.5 2.8 5 6.2 5 8.3 5 12 7 12 7s3.7-2 5.8-2C21.2 5 23 8.5 21.5 12c-2 4.3-9.5 9-9.5 9Z"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linejoin="round"
          />
        </svg>
        <span class="post-card__action-label">点赞</span>
        <span class="post-card__action-count" data-test="like-count">{{ post.likeCount }}</span>
      </button>

      <button
        type="button"
        class="post-card__action"
        :class="{ 'post-card__action--active': post.favorited }"
        data-test="favorite-post"
        :aria-pressed="String(Boolean(post.favorited))"
        :aria-label="post.favorited ? '取消收藏' : '收藏'"
        @click="emit('favorite')"
      >
        <svg
          class="post-card__action-icon"
          viewBox="0 0 24 24"
          :fill="post.favorited ? 'currentColor' : 'none'"
          aria-hidden="true"
        >
          <path
            d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19l1-5.8-4.3-4.1 5.9-.9L12 3Z"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linejoin="round"
          />
        </svg>
        <span class="post-card__action-label">收藏</span>
        <span class="post-card__action-count" data-test="favorite-count">{{ post.favoriteCount }}</span>
      </button>
    </div>
  </li>
</template>
