<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  formatInputKeys,
  formatInputSequence,
  getInputKeysFromKeyboardEvent,
  toSerializableInputSequence,
} from '../utils/input_sequence'

const props = defineProps<{
  gesture: string
  initialSteps?: InputSequenceStep[] | null
}>()

const emit = defineEmits<{
  close: []
  update: [settings: UserSettingsView]
  status: [message: string, isError: boolean]
}>()

const steps = ref<InputSequenceStep[]>(
  props.initialSteps?.length
    ? toSerializableInputSequence(props.initialSteps)
    : [{ type: 'keys', keys: [] }],
)
const recordingIndex = ref<number | null>(null)
const errorMessage = ref('')
const isSaving = ref(false)

const sequencePreview = computed(() => {
  if (steps.value.some((step) => step.type === 'keys' && step.keys.length === 0)) {
    return '키 입력을 지정하세요.'
  }
  return formatInputSequence(steps.value)
})

function addKeyStep() {
  if (steps.value.length >= 32) return
  steps.value.push({ type: 'keys', keys: [] })
  recordingIndex.value = steps.value.length - 1
  errorMessage.value = ''
}

function addDelayStep() {
  if (steps.value.length >= 32) return
  steps.value.push({ type: 'delay', durationMs: 300 })
  errorMessage.value = ''
}

function loadExample() {
  steps.value = [
    { type: 'keys', keys: ['P'] },
    { type: 'delay', durationMs: 300 },
    { type: 'keys', keys: ['ENTER'] },
  ]
  recordingIndex.value = null
  errorMessage.value = ''
}

function captureKeys(index: number, event: KeyboardEvent) {
  event.preventDefault()
  event.stopPropagation()

  const keys = getInputKeysFromKeyboardEvent(event)
  if (!keys) {
    errorMessage.value = '현재 지원하지 않는 키입니다.'
    return
  }

  steps.value[index] = { type: 'keys', keys }
  errorMessage.value = ''
}

function removeStep(index: number) {
  steps.value.splice(index, 1)
  if (recordingIndex.value === index) recordingIndex.value = null
  errorMessage.value = ''
}

function moveStep(index: number, direction: -1 | 1) {
  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= steps.value.length) return
  const [step] = steps.value.splice(index, 1)
  steps.value.splice(targetIndex, 0, step)
  recordingIndex.value = null
}

async function saveSequence() {
  const validationError = validateSteps()
  if (validationError) {
    errorMessage.value = validationError
    return
  }

  isSaving.value = true
  errorMessage.value = ''
  try {
    const serializableSteps = toSerializableInputSequence(steps.value)
    const response = await window.aircommands.assignInputSequence({
      gesture: props.gesture,
      steps: serializableSteps,
    })
    if (!response.success) {
      errorMessage.value = response.message
      return
    }
    if (response.settings) emit('update', response.settings)
    emit('status', `입력 시퀀스 “${formatInputSequence(serializableSteps)}”을(를) 저장했습니다.`, false)
    emit('close')
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : '입력 시퀀스를 저장하지 못했습니다.'
  } finally {
    isSaving.value = false
  }
}

function validateSteps(): string {
  if (steps.value.length === 0) return '입력 단계를 하나 이상 추가하세요.'
  if (steps.value.length > 32) return '입력 단계는 최대 32개까지 저장할 수 있습니다.'

  let totalDelayMs = 0
  for (const step of steps.value) {
    if (step.type === 'keys') {
      if (step.keys.length === 0) return '모든 키 입력 단계를 지정하세요.'
      if (step.keys.length > 5) return '한 조합에는 키를 최대 5개까지 사용할 수 있습니다.'
      continue
    }

    if (!Number.isInteger(step.durationMs) || step.durationMs < 10 || step.durationMs > 10_000) {
      return '대기 시간은 10~10,000ms 사이의 정수로 입력하세요.'
    }
    totalDelayMs += step.durationMs
  }

  if (totalDelayMs > 30_000) return '전체 대기 시간은 최대 30초까지 설정할 수 있습니다.'
  return ''
}
</script>

<template>
  <section class="sequence-editor">
    <div class="sequence-toolbar">
      <div>
        <h3>입력 순서</h3>
        <p>키 입력과 대기를 위에서 아래 순서대로 실행합니다.</p>
      </div>
      <button type="button" class="secondary" :disabled="isSaving" @click="loadExample">
        P → 0.3초 → Enter 예시
      </button>
    </div>

    <div class="sequence-preview">
      <small>실행 미리보기</small>
      <strong>{{ sequencePreview }}</strong>
    </div>

    <ol v-if="steps.length" class="step-list">
      <li v-for="(step, index) in steps" :key="index" class="step-item">
        <span class="step-number">{{ index + 1 }}</span>

        <div v-if="step.type === 'keys'" class="step-control">
          <span class="step-type">키 입력</span>
          <button
            type="button"
            class="key-capture"
            :class="{ recording: recordingIndex === index }"
            :disabled="isSaving"
            @click="recordingIndex = index"
            @focus="recordingIndex = index"
            @blur="recordingIndex = null"
            @keydown="captureKeys(index, $event)">
            {{ step.keys.length ? formatInputKeys(step.keys) : '클릭한 뒤 키 또는 조합키 입력' }}
          </button>
        </div>

        <label v-else class="step-control delay-control">
          <span class="step-type">대기</span>
          <span>
            <input
              v-model.number="step.durationMs"
              type="number"
              min="10"
              max="10000"
              step="10"
              :disabled="isSaving">
            ms
          </span>
        </label>

        <div class="step-actions">
          <button
            type="button"
            class="icon-action"
            aria-label="위로 이동"
            :disabled="isSaving || index === 0"
            @click="moveStep(index, -1)">
            ↑
          </button>
          <button
            type="button"
            class="icon-action"
            aria-label="아래로 이동"
            :disabled="isSaving || index === steps.length - 1"
            @click="moveStep(index, 1)">
            ↓
          </button>
          <button
            type="button"
            class="icon-action danger"
            aria-label="단계 삭제"
            :disabled="isSaving"
            @click="removeStep(index)">
            ×
          </button>
        </div>
      </li>
    </ol>

    <p v-else class="empty">아래 버튼으로 첫 입력 단계를 추가하세요.</p>

    <p v-if="recordingIndex !== null" class="capture-guide">
      선택한 칸에서 원하는 키를 누르세요. Ctrl, Alt, Shift, Win 조합도 함께 기록됩니다.
    </p>
    <p v-if="errorMessage" class="message error">{{ errorMessage }}</p>

    <footer class="sequence-actions">
      <div>
        <button
          type="button"
          class="secondary"
          :disabled="isSaving || steps.length >= 32"
          @click="addKeyStep">
          + 키 입력
        </button>
        <button
          type="button"
          class="secondary"
          :disabled="isSaving || steps.length >= 32"
          @click="addDelayStep">
          + 대기
        </button>
      </div>
      <button type="button" class="primary" :disabled="isSaving" @click="saveSequence">
        {{ isSaving ? '저장 중…' : '이 제스처에 저장' }}
      </button>
    </footer>
  </section>
</template>

<style scoped>
.sequence-editor {
  display: grid;
  gap: 12px;
}

.sequence-toolbar,
.sequence-actions,
.sequence-actions > div,
.step-item,
.step-actions {
  display: flex;
  align-items: center;
}

.sequence-toolbar,
.sequence-actions {
  justify-content: space-between;
  gap: 12px;
}

.sequence-toolbar h3,
.sequence-toolbar p,
.capture-guide,
.message,
.empty {
  margin: 0;
}

.sequence-toolbar p,
.capture-guide,
.empty {
  margin-top: 3px;
  color: #91a9c5;
  font-size: 11px;
}

.sequence-preview {
  display: grid;
  gap: 3px;
  padding: 10px 12px;
  border: 1px solid rgba(56, 189, 248, 0.45);
  border-radius: 10px;
  background: rgba(56, 189, 248, 0.08);
}

.sequence-preview small {
  color: #91a9c5;
}

.sequence-preview strong {
  overflow-wrap: anywhere;
}

.step-list {
  display: grid;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.step-item {
  gap: 9px;
  padding: 9px;
  border: 1px solid rgba(94, 119, 150, 0.4);
  border-radius: 10px;
  background: rgba(9, 16, 28, 0.88);
}

.step-number {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #bae6fd;
  background: rgba(2, 132, 199, 0.25);
  font-size: 11px;
  font-weight: 800;
}

.step-control {
  min-width: 0;
  flex: 1;
  display: grid;
  grid-template-columns: 60px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}

.step-type {
  color: #91a9c5;
  font-size: 11px;
  font-weight: 700;
}

.key-capture {
  min-width: 0;
  padding: 9px 11px;
  overflow: hidden;
  color: #e7f0fb;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: #111c2b;
  border: 1px solid #49637e;
}

.key-capture.recording {
  border-color: #38bdf8;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.18);
}

.delay-control > span:last-child {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #91a9c5;
  font-size: 12px;
}

.delay-control input {
  width: 130px;
  padding: 9px 10px;
  color: #e7f0fb;
  background: #111c2b;
  border: 1px solid #49637e;
  border-radius: 9px;
}

.step-actions,
.sequence-actions > div {
  gap: 6px;
}

.icon-action {
  width: 30px;
  height: 30px;
  padding: 0;
  color: #d7e2ef;
  background: transparent;
  border: 1px solid #4f6a89;
}

.icon-action.danger {
  color: #fecaca;
  border-color: rgba(248, 113, 113, 0.55);
}

.capture-guide {
  color: #7dd3fc;
}

.message.error {
  color: #fca5a5;
  font-size: 11px;
}

.sequence-actions {
  padding-top: 12px;
  border-top: 1px solid rgba(94, 119, 150, 0.28);
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

@media (max-width: 620px) {
  .sequence-toolbar,
  .sequence-actions,
  .step-item {
    align-items: stretch;
    flex-direction: column;
  }

  .step-actions {
    align-self: flex-end;
  }
}
</style>
