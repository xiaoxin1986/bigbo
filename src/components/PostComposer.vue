<script setup>
import { computed, ref } from 'vue'
import { MAX_LENGTH, countChars } from '../lib/time.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  maxLength: { type: Number, default: MAX_LENGTH },
})

const emit = defineEmits(['update:modelValue', 'submit'])

const textareaRef = ref(null)

const length = computed(() => countChars(props.modelValue))
const isWarn = computed(
  () => length.value >= props.maxLength * 0.85 && length.value < props.maxLength,
)
const isLimit = computed(() => length.value >= props.maxLength)
const canPublish = computed(
  () => props.modelValue.trim().length > 0 && length.value <= props.maxLength,
)

function handleInput(event) {
  emit('update:modelValue', event.target.value)
}

function handleSubmit() {
  if (!canPublish.value) return
  const raw = textareaRef.value ? textareaRef.value.value : props.modelValue
  const content = raw.trim()
  if (!content) return
  emit('submit', content)
}

function handleKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    handleSubmit()
  }
}

function focus() {
  textareaRef.value?.focus()
}

defineExpose({ focus })
</script>

<template>
  <section class="composer" aria-labelledby="composer-title">
    <h2 class="sr-only" id="composer-title">发布新动态</h2>
    <div class="composer__body">
      <span class="avatar avatar--self" aria-hidden="true">B</span>
      <div class="composer__field">
        <label class="sr-only" for="postInput">动态内容</label>
        <textarea
          id="postInput"
          ref="textareaRef"
          class="composer__input"
          rows="3"
          :maxlength="maxLength"
          placeholder="此刻在想什么？"
          aria-describedby="composerHint"
          :value="modelValue"
          @input="handleInput"
          @keydown="handleKeydown"
        ></textarea>
        <p class="composer__hint" id="composerHint">支持 Ctrl / ⌘ + Enter 快捷发布</p>
      </div>
    </div>
    <div class="composer__footer">
      <div
        class="counter"
        :class="{ 'counter--warn': isWarn, 'counter--limit': isLimit }"
        aria-live="polite"
      >
        <span class="counter__value">{{ length }}</span>
        <span class="counter__limit">/ {{ maxLength }}</span>
      </div>
      <button
        class="btn btn--primary"
        data-test="publish"
        type="button"
        :disabled="!canPublish"
        @click="handleSubmit"
      >
        <span>发布</span>
        <svg class="btn__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4.5 12h13M12 5.5 18.5 12 12 18.5"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>
  </section>
</template>
