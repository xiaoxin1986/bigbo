<script setup>
const emit = defineEmits(['compose'])
</script>

<template>
  <div class="empty-state" data-test="empty-state">
    <span class="empty-state__icon" aria-hidden="true">
      <svg viewBox="0 0 48 48" fill="none">
        <rect x="8" y="12" width="32" height="24" rx="6" stroke="currentColor" stroke-width="1.8" />
        <path d="M15 20h18M15 25h13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        <path d="M17 30h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
    </span>
    <h3 class="empty-state__title">还没有任何动态</h3>
    <p class="empty-state__text">写下第一条想法，它会保存在这台设备上。</p>
    <button class="btn btn--ghost" type="button" @click="emit('compose')">发布第一条</button>
  </div>
</template>
