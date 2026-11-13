<script setup>
defineProps({
  toasts: { type: Array, default: () => [] },
})
</script>

<template>
  <div class="toast-stack" role="status" aria-live="polite" aria-atomic="true">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="toast"
      :class="[`toast--${toast.type}`, { 'is-visible': toast.visible }]"
    >
      {{ toast.message }}
    </div>
  </div>
</template>
