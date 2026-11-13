<script setup>
import { computed, ref } from 'vue'
import { MAX_LENGTH, countChars } from '../lib/time.js'
import { IMAGE_MAX_FILE_SIZE, isImageFile, processImageFile } from '../lib/image.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  image: { type: Object, default: null },
  maxLength: { type: Number, default: MAX_LENGTH },
})

const emit = defineEmits(['update:modelValue', 'update:image', 'submit', 'image-error'])

const textareaRef = ref(null)
const fileInputRef = ref(null)
const processing = ref(false)

const length = computed(() => countChars(props.modelValue))
const isWarn = computed(
  () => length.value >= props.maxLength * 0.85 && length.value < props.maxLength,
)
const isLimit = computed(() => length.value >= props.maxLength)
const hasImage = computed(() => Boolean(props.image && props.image.dataUrl))
const canPublish = computed(
  () =>
    (props.modelValue.trim().length > 0 || hasImage.value) &&
    length.value <= props.maxLength &&
    !processing.value,
)

function handleInput(event) {
  emit('update:modelValue', event.target.value)
}

function openFilePicker() {
  if (!processing.value) fileInputRef.value?.click()
}

async function handleFileChange(event) {
  const file = event.target.files && event.target.files[0]
  // 无论成功失败都重置，保证再次选择同一文件仍能触发 change
  event.target.value = ''

  if (!file) return
  if (!isImageFile(file)) {
    emit('image-error', '仅支持 JPG / PNG / GIF / WebP 图片')
    return
  }
  if (file.size > IMAGE_MAX_FILE_SIZE) {
    emit('image-error', '图片过大，请选择 15MB 以内的图片')
    return
  }

  processing.value = true
  try {
    const image = await processImageFile(file)
    emit('update:image', image)
  } catch {
    emit('image-error', '图片处理失败，请重试')
  } finally {
    processing.value = false
  }
}

function removeImage() {
  emit('update:image', null)
  if (fileInputRef.value) fileInputRef.value.value = ''
}

function handleSubmit() {
  if (!canPublish.value) return
  const raw = textareaRef.value ? textareaRef.value.value : props.modelValue
  const content = raw.trim()
  if (!content && !hasImage.value) return
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

        <div v-if="image" class="composer__preview">
          <img :src="image.dataUrl" :alt="image.name || '待发布图片'" />
          <button
            type="button"
            class="composer__remove"
            data-test="remove-image"
            aria-label="移除图片"
            @click="removeImage"
          >
            ✕
          </button>
        </div>

        <p class="composer__hint" id="composerHint">支持 Ctrl / ⌘ + Enter 快捷发布</p>
      </div>
    </div>
    <div class="composer__footer">
      <div class="composer__actions">
        <button
          type="button"
          class="composer__attach"
          data-test="attach-image"
          aria-label="添加图片"
          :disabled="processing"
          @click="openFilePicker"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" stroke-width="1.7" />
            <path d="m5 17 4.5-4.5L13 16l2.5-2.5L21 19" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
            <circle cx="9" cy="9.5" r="1.4" stroke="currentColor" stroke-width="1.7" />
          </svg>
          <span>{{ processing ? '处理中…' : '图片' }}</span>
        </button>
        <input
          ref="fileInputRef"
          type="file"
          accept="image/*"
          class="sr-only"
          data-test="file-input"
          @change="handleFileChange"
        />
      </div>
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
