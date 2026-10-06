<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  gestureHoldMs: number
}>()

const emit = defineEmits<{
  close: []
  update: [settings: UserSettingsView]
  status: [message: string, isError: boolean]
}>()

const DEFAULT_GESTURE_HOLD_MS = 280
const MIN_GESTURE_HOLD_MS = 80
const MAX_GESTURE_HOLD_MS = 2_000
const holdMs = ref(props.gestureHoldMs)
const isSaving = ref(false)
const errorMessage = ref('')

const holdSeconds = computed(() => Number((holdMs.value / 1_000).toFixed(2)))

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

async function saveGestureHoldMs() {
  if (
    !Number.isInteger(holdMs.value) ||
    holdMs.value < MIN_GESTURE_HOLD_MS ||
    holdMs.value > MAX_GESTURE_HOLD_MS
  ) {
    errorMessage.value = '유지 시간은 80~2,000ms 사이의 정수로 입력하세요.'
    return
  }

  isSaving.value = true
  errorMessage.value = ''
  try {
    const response = await window.aircommands.setGestureHoldMs({
      gestureHoldMs: holdMs.value,
    })
    if (!response.success) {
      errorMessage.value = response.message
      return
    }
    if (response.settings) emit('update', response.settings)
    emit('status', `제스처 유지 시간을 ${holdMs.value}ms로 저장했습니다.`, false)
    emit('close')
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : '제스처 유지 시간을 저장하지 못했습니다.'
  } finally {
    isSaving.value = false
  }
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <div class="hold-backdrop" role="presentation" @click.self="emit('close')">
    <section class="hold-dialog" role="dialog" aria-modal="true" aria-labelledby="hold-title">
      <header class="hold-header">
        <div>
          <h2 id="hold-title">제스처 유지 시간</h2>
          <p>손가락을 붙인 뒤 동작이 실행되기까지의 시간을 설정합니다.</p>
        </div>
        <button type="button" class="icon-button" aria-label="닫기" @click="emit('close')">×</button>
      </header>

      <form class="hold-content" @submit.prevent="saveGestureHoldMs">
        <div class="hold-value">
          <small>현재 설정</small>
          <strong>{{ holdSeconds }}초</strong>
          <span>{{ holdMs }}ms</span>
        </div>

        <label for="gesture-hold-range">유지 시간 조절</label>
        <input
          id="gesture-hold-range"
          v-model.number="holdMs"
          type="range"
          :min="MIN_GESTURE_HOLD_MS"
          :max="MAX_GESTURE_HOLD_MS"
          step="20">

        <div class="range-labels" aria-hidden="true">
          <span>빠르게 · 0.08초</span>
          <span>천천히 · 2초</span>
        </div>

        <label class="number-field" for="gesture-hold-number">
          <span>직접 입력</span>
          <span>
            <input
              id="gesture-hold-number"
              v-model.number="holdMs"
              type="number"
              :min="MIN_GESTURE_HOLD_MS"
              :max="MAX_GESTURE_HOLD_MS"
              step="10">
            ms
          </span>
        </label>

        <p class="hold-help">짧을수록 빠르게 실행되지만 손가락이 스칠 때 오작동할 가능성이 커집니다.</p>
        <p v-if="errorMessage" class="message error">{{ errorMessage }}</p>

        <footer class="hold-actions">
          <button
            type="button"
            class="secondary"
            :disabled="isSaving"
            @click="holdMs = DEFAULT_GESTURE_HOLD_MS">
            기본값 280ms
          </button>
          <div>
            <button type="button" class="secondary" :disabled="isSaving" @click="emit('close')">
              취소
            </button>
            <button type="submit" class="primary" :disabled="isSaving">
              {{ isSaving ? '저장 중…' : '저장' }}
            </button>
          </div>
        </footer>
      </form>
    </section>
  </div>
</template>

<style scoped>
.hold-backdrop {
  position: fixed;
  inset: 0;
  z-index: 145;
  display: grid;
  place-items: center;
  padding: 18px;
  color: #e7f0fb;
  background: rgba(2, 6, 14, 0.86);
  backdrop-filter: blur(8px);
}

.hold-dialog {
  width: min(520px, 100%);
  border: 1px solid rgba(94, 119, 150, 0.58);
  border-radius: 16px;
  background: #0a111c;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.62);
  overflow: hidden;
}

.hold-header,
.hold-actions,
.hold-actions > div,
.number-field,
.number-field > span:last-child,
.hold-value {
  display: flex;
  align-items: center;
}

.hold-header {
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(94, 119, 150, 0.35);
}

.hold-header h2,
.hold-header p,
.hold-help,
.message {
  margin: 0;
}

.hold-header h2 {
  font-size: 18px;
}

.hold-header p {
  margin-top: 4px;
  color: #9eb6d1;
  font-size: 12px;
}

.icon-button {
  width: 36px;
  height: 36px;
  padding: 0;
  color: #d7e2ef;
  font-size: 25px;
  background: transparent;
  border: 1px solid #4f6a89;
}

.hold-content {
  display: grid;
  gap: 11px;
  padding: 18px;
}

.hold-content > label {
  color: #a2bad7;
  font-size: 12px;
  font-weight: 700;
}

.hold-value {
  gap: 9px;
  padding: 12px 14px;
  border: 1px solid rgba(56, 189, 248, 0.45);
  border-radius: 10px;
  background: rgba(56, 189, 248, 0.08);
}

.hold-value small {
  color: #91a9c5;
}

.hold-value strong {
  margin-left: auto;
  color: #bae6fd;
  font-size: 20px;
}

.hold-value span {
  color: #91a9c5;
  font-size: 12px;
}

input[type='range'] {
  width: 100%;
  accent-color: #0ea5e9;
}

.range-labels {
  display: flex;
  justify-content: space-between;
  color: #7892af;
  font-size: 10px;
}

.number-field {
  justify-content: space-between;
  gap: 12px;
  padding-top: 6px;
}

.number-field > span:last-child {
  gap: 7px;
  color: #91a9c5;
}

input[type='number'] {
  width: 130px;
  padding: 9px 10px;
  color: #e7f0fb;
  background: #111c2b;
  border: 1px solid #49637e;
  border-radius: 9px;
  font: inherit;
}

.hold-help,
.message {
  font-size: 11px;
  line-height: 1.5;
}

.hold-help {
  color: #91a9c5;
}

.message.error {
  color: #fca5a5;
}

.hold-actions {
  justify-content: space-between;
  gap: 10px;
  padding-top: 13px;
  border-top: 1px solid rgba(94, 119, 150, 0.28);
}

.hold-actions > div {
  gap: 8px;
}

button {
  border-radius: 9px;
  padding: 8px 12px;
  font-weight: 700;
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

button.primary {
  color: white;
  background: linear-gradient(135deg, #1d4ed8, #0284c7);
  border: 0;
}

button.secondary {
  color: #d7e2ef;
  background: transparent;
  border: 1px solid #4f6a89;
}

@media (max-width: 520px) {
  .hold-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .hold-actions > div {
    justify-content: flex-end;
  }
}
</style>
