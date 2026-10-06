<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import googleIconUrl from '../assets/google.svg'

const props = defineProps<{
  gesture?: string
  settings?: UserSettingsView | null
}>()

const emit = defineEmits<{
  close: []
  update: [settings: UserSettingsView]
  status: [message: string, isError: boolean]
}>()

const loginUrl = ref('')
const loginHint = ref('')
const status = ref<BrowserStatus>({
  open: false,
  loading: false,
  url: '',
  title: '',
})
const message = ref('')
const isError = ref(false)
const isBusy = ref(false)

const currentGestureModifier = computed(() =>
  props.gesture && props.settings
    ? (props.settings.gestureModifierAssignments[props.gesture] ?? 'none')
    : 'none')

async function selectGestureModifier(modifier: 'none' | 'control_left' | 'control_right') {
  if (!props.gesture) return
  isBusy.value = true
  try {
    const response = await window.aircommands.assignGestureModifier({
      gesture: props.gesture,
      modifier,
    })
    if (!response.success) {
      showMessage(response.message, true)
      return
    }
    if (response.settings) emit('update', response.settings)
    const modifierLabel =
      modifier === 'none'
        ? '필수 키 조건 없이 언제나 인식하도록 설정했습니다.'
        : modifier === 'control_left'
          ? '왼쪽 Ctrl 키 누름 조건을 설정했습니다.'
          : '오른쪽 Ctrl 키 누름 조건을 설정했습니다.'
    showMessage(modifierLabel, false)
    emit('status', modifierLabel, false)
  } catch (error) {
    showMessage(error instanceof Error ? error.message : '인식 조건을 변경하지 못했습니다.', true)
  } finally {
    isBusy.value = false
  }
}

let removeStatusListener: (() => void) | null = null

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

function showMessage(nextMessage: string, error = false) {
  message.value = nextMessage
  isError.value = error
}

function applyStatus(nextStatus: BrowserStatus) {
  status.value = nextStatus
}

async function refreshStatus() {
  try {
    const response = await window.aircommands.getBrowserStatus()
    applyStatus(response.status)
  } catch (error) {
    showMessage(error instanceof Error ? error.message : '브라우저 상태를 읽지 못했습니다.', true)
  }
}

async function loadWebLoginSettings() {
  try {
    const response = await window.aircommands.getWebLoginSettings()
    if (response.success) {
      loginUrl.value = response.settings.loginUrl
      loginHint.value = response.settings.loginHint
    }
  } catch {
    // The browser controls remain usable even when the optional login setting is unavailable.
  }
}

async function saveWebLoginSettings() {
  isBusy.value = true
  try {
    const response = await window.aircommands.setWebLoginSettings({
      loginUrl: loginUrl.value,
      loginHint: loginHint.value,
    })
    if (!response.success) {
      showMessage(response.message, true)
      return
    }
    loginUrl.value = response.settings.loginUrl
    loginHint.value = response.settings.loginHint
    showMessage('Google 웹 로그인 설정을 저장했습니다.')
  } catch (error) {
    showMessage(error instanceof Error ? error.message : 'Google 웹 로그인 설정을 저장하지 못했습니다.', true)
  } finally {
    isBusy.value = false
  }
}

async function openWebLogin() {
  isBusy.value = true
  try {
    const response = await window.aircommands.openWebLogin()
    if (!response.success) {
      showMessage(response.message, true)
      return
    }
    applyStatus(response.status)
    showMessage('저장된 Google 웹 로그인 시나리오를 실행했습니다.')
  } catch (error) {
    showMessage(error instanceof Error ? error.message : 'Google 로그인 화면을 열지 못했습니다.', true)
  } finally {
    isBusy.value = false
  }
}

async function closeBrowser() {
  const response = await window.aircommands.closeBrowser()
  applyStatus(response.status)
  showMessage('내부 브라우저를 닫았습니다. 로그인 세션은 유지됩니다.')
}

onMounted(() => {
  removeStatusListener = window.aircommands.onBrowserStatus(applyStatus)
  window.addEventListener('keydown', handleKeydown)
  void refreshStatus()
  void loadWebLoginSettings()
})

onBeforeUnmount(() => {
  removeStatusListener?.()
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="web-login-backdrop" role="presentation" @click.self="emit('close')">
    <section class="web-login-dialog" role="dialog" aria-modal="true" aria-labelledby="web-login-title">
      <header class="web-login-header">
        <div>
          <h2 id="web-login-title"><img :src="googleIconUrl" alt="" class="dialog-title-icon"> Google 웹 로그인</h2>
          <p>왼손 엄지 + 약지 제스처에서 사용할 로그인 주소와 계정을 설정합니다.</p>
        </div>
        <button type="button" class="icon-button" aria-label="닫기" @click="emit('close')">×</button>
      </header>

      <div v-if="gesture && settings" class="modifier-bar">
        <span class="modifier-title">인식 조건 (필수 키):</span>
        <div class="modifier-options">
          <button
            type="button"
            class="modifier-pill"
            :class="{ active: currentGestureModifier === 'none' }"
            :disabled="isBusy"
            @click="selectGestureModifier('none')">
            없음 (언제나 인식)
          </button>
          <button
            type="button"
            class="modifier-pill"
            :class="{ active: currentGestureModifier === 'control_left' }"
            :disabled="isBusy"
            @click="selectGestureModifier('control_left')">
            왼쪽 Ctrl
          </button>
          <button
            type="button"
            class="modifier-pill"
            :class="{ active: currentGestureModifier === 'control_right' }"
            :disabled="isBusy"
            @click="selectGestureModifier('control_right')">
            오른쪽 Ctrl
          </button>
        </div>
      </div>

      <div class="web-login-content">
        <div class="browser-status-row">
          <strong>내부 브라우저</strong>
          <span class="browser-state" :class="status.open ? 'open' : ''">
            {{ status.open ? (status.loading ? '페이지 로딩 중' : '브라우저 열림') : '브라우저 닫힘' }}
          </span>
        </div>

        <form class="web-login-form" @submit.prevent="saveWebLoginSettings">
          <label for="web-login-url">웹사이트 주소</label>
          <input
            id="web-login-url"
            v-model="loginUrl"
            type="url"
            placeholder="https://service.example.com"
            autofocus>

          <label for="web-login-hint">Google 계정 힌트</label>
          <input
            id="web-login-hint"
            v-model="loginHint"
            type="email"
            autocomplete="username"
            placeholder="user@example.com">

          <p class="field-help">Google 계정 선택 화면에서 이 이메일과 정확히 일치하는 계정을 선택합니다.</p>

          <div class="form-actions">
            <button type="submit" class="secondary" :disabled="isBusy">설정 저장</button>
            <button type="button" class="primary" :disabled="isBusy" @click="openWebLogin">
              Google 로그인 실행
            </button>
            <button
              v-if="status.open"
              type="button"
              class="secondary"
              :disabled="isBusy"
              @click="closeBrowser">
              브라우저 닫기
            </button>
          </div>
        </form>

        <div v-if="status.open" class="browser-details">
          <span class="browser-title">{{ status.title || '제목 없음' }}</span>
          <span class="browser-current-url">{{ status.url }}</span>
        </div>

        <p v-if="message" class="browser-message" :class="isError ? 'error' : 'success'">{{ message }}</p>
      </div>

      <footer class="web-login-footer">
        <span>설정을 저장하면 고정 제스처 실행 시 그대로 사용됩니다.</span>
        <button type="button" class="secondary" @click="emit('close')">닫기</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.web-login-backdrop {
  position: fixed;
  inset: 0;
  z-index: 140;
  display: grid;
  place-items: center;
  padding: 18px;
  color: #e7f0fb;
  background: rgba(2, 6, 14, 0.86);
  backdrop-filter: blur(8px);
}

.web-login-dialog {
  width: min(640px, 100%);
  max-height: calc(100vh - 36px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  border: 1px solid rgba(94, 119, 150, 0.58);
  border-radius: 16px;
  background: #0a111c;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.62);
  overflow: hidden;
}

.web-login-header,
.browser-status-row,
.form-actions,
.web-login-footer {
  display: flex;
  align-items: center;
}

.web-login-header {
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(94, 119, 150, 0.35);
}

.web-login-header h2,
.web-login-header p {
  margin: 0;
}

.web-login-header h2 {
  font-size: 17px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.dialog-title-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.web-login-header p {
  margin: 4px 0 0;
  color: #9eb6d1;
  font-size: 13px;
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

.web-login-content {
  min-height: 0;
  display: grid;
  gap: 14px;
  padding: 16px 18px;
  overflow-y: auto;
}

.browser-status-row {
  justify-content: space-between;
  gap: 12px;
}

.browser-state {
  flex: 0 0 auto;
  border: 1px solid rgba(148, 163, 184, 0.4);
  border-radius: 999px;
  padding: 5px 9px;
  color: #a2bad7;
  font-size: 12px;
  font-weight: 700;
}

.browser-state.open {
  border-color: rgba(56, 189, 248, 0.65);
  color: #7dd3fc;
}

.web-login-form {
  display: grid;
  gap: 8px;
  border-top: 1px solid rgba(94, 119, 150, 0.28);
  padding-top: 10px;
}

.web-login-form label {
  color: #a2bad7;
  font-size: 12px;
  font-weight: 700;
}

input {
  min-width: 0;
  border: 1px solid #49637e;
  border-radius: 9px;
  background: rgba(3, 8, 16, 0.72);
  color: #e7f0fb;
  padding: 9px 10px;
  font: inherit;
  font-size: 13px;
}

.field-help {
  margin: 0;
  color: #8ea8c4;
  font-size: 11px;
  line-height: 1.5;
}

.form-actions {
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

button {
  border: none;
  border-radius: 9px;
  padding: 8px 11px;
  font-weight: 700;
  cursor: pointer;
  font-size: 12px;
}

button.primary {
  background: linear-gradient(135deg, #1d4ed8, #0284c7);
  color: white;
}

button.secondary {
  background: transparent;
  color: #d7e2ef;
  border: 1px solid #4f6a89;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.browser-details {
  display: grid;
  gap: 2px;
  min-width: 0;
  border: 1px solid rgba(94, 119, 150, 0.3);
  border-radius: 9px;
  padding: 8px 10px;
  background: rgba(3, 8, 16, 0.42);
}

.browser-title {
  font-weight: 700;
  font-size: 12px;
}

.browser-current-url {
  color: #8ea8c4;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.browser-message {
  margin: 0;
  padding: 8px 10px;
  border-radius: 9px;
  font-weight: 700;
  font-size: 12px;
}

.browser-message.success {
  border: 1px solid rgba(16, 185, 129, 0.65);
  color: #a7f3d0;
}

.browser-message.error {
  border: 1px solid rgba(248, 113, 113, 0.65);
  color: #fecaca;
}

.web-login-footer {
  justify-content: space-between;
  gap: 12px;
  padding: 11px 18px;
  color: #9eb6d1;
  font-size: 11px;
  border-top: 1px solid rgba(94, 119, 150, 0.35);
}

.modifier-bar {
  margin: 12px 18px 0;
  padding: 8px 12px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(71, 85, 105, 0.45);
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.modifier-title {
  font-size: 12px;
  font-weight: 800;
  color: #94a3b8;
}

.modifier-options {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.modifier-pill {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid rgba(71, 85, 105, 0.5);
  color: #cbd5e1;
  cursor: pointer;
  transition: all 120ms ease;
}

.modifier-pill:hover:not(:disabled) {
  border-color: #38bdf8;
  color: #f8fafc;
}

.modifier-pill.active {
  background: rgba(14, 165, 233, 0.25);
  border-color: #38bdf8;
  color: #38bdf8;
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.2);
}

@media (max-width: 640px) {
  .web-login-header {
    align-items: flex-start;
  }

  .web-login-footer {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
