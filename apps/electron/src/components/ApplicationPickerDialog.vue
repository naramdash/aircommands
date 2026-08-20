<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  filterAndSortApplications,
  filterSelectableRegisteredApplications,
} from '../utils/application_search'
import { WINDOWS_COMMAND_OPTIONS } from '../utils/windows_command'
import InputSequenceEditor from './InputSequenceEditor.vue'

const props = defineProps<{
  settings: UserSettingsView
  gesture?: string
  replaceApplicationId?: string
}>()

const emit = defineEmits<{
  close: []
  update: [settings: UserSettingsView]
  status: [message: string, isError: boolean]
}>()

const query = ref('')
const discoveredApplications = ref<DiscoveredApplication[]>([])
const isLoading = ref(false)
const isMutating = ref(false)
const discoveryError = ref('')
const discoveryWarning = ref('')
const isEditingName = ref(false)
const isReplacingCurrent = ref(false)
const editingName = ref('')
const webLoginUrl = ref('')
const webLoginHint = ref('')
const isWebLoginLoading = ref(false)
const isWebLoginSaving = ref(false)
const isWebLoginTesting = ref(false)
const webLoginError = ref('')
const webLoginSuccessMessage = ref('')

const mode = computed(() => {
  if (props.replaceApplicationId || isReplacingCurrent.value) return 'replace'
  if (props.gesture) return 'assign'
  return 'add'
})

const title = computed(() => {
  if (mode.value === 'replace') return '실행 대상 교체'
  if (mode.value === 'assign') return '제스처 동작 선택'
  return '프로그램 추가'
})

const description = computed(() => mode.value === 'assign'
  ? '프로그램, 입력 시퀀스, Windows 기능 또는 웹 기능을 이 제스처에 배정합니다.'
  : '프로그램을 고르면 설정이 바로 저장됩니다.')

const currentApplicationId = computed(() =>
  props.gesture ? props.settings.gestureAssignments[props.gesture] : null)

const currentInputSequence = computed(() =>
  props.gesture ? props.settings.inputSequenceAssignments[props.gesture] : null)

const currentWindowsCommand = computed(() =>
  props.gesture ? props.settings.windowsCommandAssignments[props.gesture] : null)

const currentGestureModifier = computed(() =>
  props.gesture ? (props.settings.gestureModifierAssignments[props.gesture] ?? 'none') : 'none')

const currentApplication = computed(() => {
  const applicationId = props.replaceApplicationId ?? currentApplicationId.value
  return props.settings.applications.find((application) =>
    application.id === applicationId) ?? null
})

const isWebLoginAssigned = computed(() =>
  Boolean(
    currentApplication.value?.id === 'builtin:google-login' ||
    (currentApplication.value?.targetKind === 'builtin' && currentApplication.value?.targetLabel === 'google-login'),
  ))

const selectedCategory = ref<'application' | 'input-sequence' | 'windows-command' | 'web-function'>(
  props.gesture && isWebLoginAssigned.value
    ? 'web-function'
    : props.gesture && props.settings.windowsCommandAssignments[props.gesture]
      ? 'windows-command'
      : props.gesture && props.settings.inputSequenceAssignments[props.gesture]
        ? 'input-sequence'
        : 'application',
)
let removeCatalogListener: (() => void) | null = null

const filteredDirectApplications = computed(() => {
  return filterSelectableRegisteredApplications(
    props.settings.applications.filter((application) =>
      application.id !== 'builtin:google-login' &&
      !(application.targetKind === 'builtin' && application.targetLabel === 'google-login')),
    query.value,
    !props.settings.supportsCustomApplications,
  )
})

const filteredDiscoveredApplications = computed(() => {
  return filterAndSortApplications(discoveredApplications.value, query.value)
    .filter((application) => {
      if (!application.registeredApplicationId) return true
      return application.registeredApplicationId === props.replaceApplicationId
    })
})

async function loadWebLoginSettings() {
  isWebLoginLoading.value = true
  webLoginError.value = ''
  try {
    const response = await window.aircommands.getWebLoginSettings()
    if (response.success) {
      webLoginUrl.value = response.settings.loginUrl
      webLoginHint.value = response.settings.loginHint
    }
  } catch (error) {
    webLoginError.value = error instanceof Error ? error.message : '웹 로그인 설정을 불러오지 못했습니다.'
  } finally {
    isWebLoginLoading.value = false
  }
}

async function saveWebLoginSettings() {
  isWebLoginSaving.value = true
  webLoginError.value = ''
  webLoginSuccessMessage.value = ''
  try {
    const response = await window.aircommands.setWebLoginSettings({
      loginUrl: webLoginUrl.value,
      loginHint: webLoginHint.value,
    })
    if (response.success) {
      webLoginSuccessMessage.value = '로그인 설정을 저장했습니다.'
      emit('status', 'Google 웹 로그인 설정을 저장했습니다.', false)
    } else {
      webLoginError.value = response.message
      emit('status', response.message, true)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '로그인 설정 저장에 실패했습니다.'
    webLoginError.value = message
    emit('status', message, true)
  } finally {
    isWebLoginSaving.value = false
  }
}

async function testWebLogin() {
  isWebLoginTesting.value = true
  webLoginError.value = ''
  try {
    const response = await window.aircommands.openWebLogin()
    if (!response.success) {
      webLoginError.value = response.message
      emit('status', response.message, true)
    } else {
      emit('status', 'Google 웹 로그인 창을 열었습니다.', false)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google 로그인 화면을 열지 못했습니다.'
    webLoginError.value = message
    emit('status', message, true)
  } finally {
    isWebLoginTesting.value = false
  }
}

async function assignGoogleWebLogin() {
  if (!props.gesture) return
  const googleLoginApp = props.settings.applications.find(
    (app) => app.id === 'builtin:google-login' || (app.targetKind === 'builtin' && app.targetLabel === 'google-login'),
  )
  if (!googleLoginApp) {
    emit('status', 'Google 웹 로그인 항목을 찾을 수 없습니다.', true)
    return
  }

  await runMutation(
    window.aircommands.assignGesture({
      gesture: props.gesture,
      applicationId: googleLoginApp.id,
    }),
    'Google 웹 로그인을 제스처에 배정했습니다.',
  )
}

onMounted(() => {
  removeCatalogListener = window.aircommands.onApplicationCatalogUpdated((response) => {
    if (!response.success) return
    discoveredApplications.value = response.applications
    discoveryWarning.value = response.warning ?? ''
    discoveryError.value = ''
  })
  void loadDiscoveredApplications(false)
  void loadWebLoginSettings()
})

onBeforeUnmount(() => removeCatalogListener?.())

watch(currentApplication, (application) => {
  editingName.value = application?.name ?? ''
}, { immediate: true })

async function loadDiscoveredApplications(forceRefresh: boolean) {
  if (!props.settings.supportsCustomApplications) return

  isLoading.value = true
  discoveryError.value = ''
  discoveryWarning.value = ''
  try {
    const response = await window.aircommands.discoverApplications({ forceRefresh })
    if (!response.success) {
      discoveryError.value = response.message
      return
    }
    discoveredApplications.value = response.applications
    discoveryWarning.value = response.warning ?? ''
  } catch (error) {
    discoveryError.value = getErrorMessage(error)
  } finally {
    isLoading.value = false
  }
}

async function selectRegisteredApplication(application: ApplicationSummary) {
  if (mode.value === 'replace') return
  if (mode.value === 'add') {
    emit('status', `${application.name}은(는) 이미 등록되어 있습니다.`, false)
    emit('close')
    return
  }
  if (!props.gesture) return

  await runMutation(
    window.aircommands.assignGesture({
      gesture: props.gesture,
      applicationId: application.id,
    }),
    `${application.name}을(를) 제스처에 배정했습니다.`,
  )
}

async function selectDiscoveredApplication(application: DiscoveredApplication) {
  if (mode.value === 'replace') {
    const applicationId = props.replaceApplicationId ?? currentApplication.value?.id
    if (!applicationId) return
    await runMutation(
      window.aircommands.replaceApplicationWithDiscovered({
        applicationId,
        discoveryId: application.discoveryId,
      }),
      '실행 대상을 교체했습니다.',
    )
    return
  }

  if (mode.value === 'assign') {
    if (!props.gesture) return
    await runMutation(
      window.aircommands.assignDiscoveredApplication({
        gesture: props.gesture,
        discoveryId: application.discoveryId,
      }),
      `${application.name}을(를) 등록하고 제스처에 배정했습니다.`,
    )
    return
  }

  await runMutation(
    window.aircommands.addDiscoveredApplication({
      discoveryId: application.discoveryId,
    }),
    `${application.name}을(를) 저장했습니다.`,
  )
}

async function browseForApplication() {
  if (mode.value === 'replace') {
    const applicationId = props.replaceApplicationId ?? currentApplication.value?.id
    if (!applicationId) return
    await runMutation(
      window.aircommands.replaceApplicationTarget({
        applicationId,
      }),
      '실행 대상을 교체했습니다.',
    )
    return
  }

  if (mode.value === 'assign') {
    if (!props.gesture) return
    await runMutation(
      window.aircommands.pickAndAssignApplication({ gesture: props.gesture }),
      '프로그램을 추가하고 제스처에 배정했습니다.',
    )
    return
  }

  await runMutation(
    window.aircommands.pickApplication(),
    '프로그램을 추가했습니다.',
  )
}

async function clearAssignment() {
  if (!props.gesture) return
  await runMutation(
    window.aircommands.assignGesture({
      gesture: props.gesture,
      applicationId: null,
    }),
    '제스처 배정을 해제했습니다.',
  )
}

async function selectWindowsCommand(command: WindowsCommand) {
  if (!props.gesture) return
  await runMutation(
    window.aircommands.assignWindowsCommand({
      gesture: props.gesture,
      command,
    }),
    'Windows 기능을 제스처에 배정했습니다.',
  )
}

async function selectGestureModifier(modifier: 'none' | 'control_left' | 'control_right') {
  if (!props.gesture) return
  await runMutation(
    window.aircommands.assignGestureModifier({
      gesture: props.gesture,
      modifier,
    }),
    modifier === 'none'
      ? '필수 키 조건 없이 언제나 인식하도록 설정했습니다.'
      : modifier === 'control_left'
        ? '왼쪽 Ctrl 키 누름 조건을 설정했습니다.'
        : '오른쪽 Ctrl 키 누름 조건을 설정했습니다.',
    false,
  )
}

function getApplicationSourceLabel(
  targetKind: ApplicationSummary['targetKind'] | DiscoveredApplication['targetKind'],
) {
  if (targetKind === 'steam-app') return 'Steam 게임'
  if (targetKind === 'windows-app-id') return 'Windows 앱'
  if (targetKind === 'windows-path') return '시작 메뉴 프로그램'
  return '기본 프로그램'
}

async function renameCurrentApplication() {
  const application = currentApplication.value
  if (!application) return

  await runMutation(
    window.aircommands.renameApplication({
      applicationId: application.id,
      name: editingName.value,
    }),
    '프로그램 이름을 저장했습니다.',
    false,
  )
  isEditingName.value = false
}

async function testCurrentApplication() {
  const application = currentApplication.value
  if (!application) return

  isMutating.value = true
  try {
    const response = await window.aircommands.testApplication({
      applicationId: application.id,
    })
    emit(
      'status',
      response.success
        ? `${application.name} 실행 요청을 보냈습니다.`
        : response.message,
      !response.success,
    )
  } catch (error) {
    emit('status', getErrorMessage(error), true)
  } finally {
    isMutating.value = false
  }
}

async function removeCurrentApplication() {
  const application = currentApplication.value
  if (!application) return

  await runMutation(
    window.aircommands.removeApplication({ applicationId: application.id }),
    '프로그램 설정을 삭제했습니다.',
  )
}

async function runMutation(
  request: Promise<SettingsMutationResponse & { canceled?: boolean }>,
  successMessage: string,
  closeAfterSuccess = true,
) {
  isMutating.value = true
  try {
    const response = await request
    if (!response.success) {
      emit('status', response.message, true)
      return
    }
    if (response.canceled) return
    if (response.settings) emit('update', response.settings)
    emit('status', successMessage, false)
    if (closeAfterSuccess) emit('close')
  } catch (error) {
    emit('status', getErrorMessage(error), true)
  } finally {
    isMutating.value = false
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '프로그램 요청을 처리하지 못했습니다.'
}
</script>

<template>
  <div class="picker-backdrop" role="presentation" @click.self="emit('close')">
    <section class="picker-dialog" role="dialog" aria-modal="true" aria-labelledby="picker-title">
      <header class="picker-header">
        <div>
          <h2 id="picker-title">{{ title }}</h2>
          <p>{{ description }}</p>
        </div>
        <button type="button" class="icon-button" aria-label="닫기" @click="emit('close')">×</button>
      </header>

      <nav v-if="mode === 'assign'" class="category-tabs" aria-label="제스처 실행 유형">
        <button
          type="button"
          :class="{ active: selectedCategory === 'application' }"
          @click="selectedCategory = 'application'">
          <span>🧩</span>
          프로그램
        </button>
        <button
          type="button"
          :class="{ active: selectedCategory === 'input-sequence' }"
          @click="selectedCategory = 'input-sequence'">
          <span>⌨️</span>
          입력 시퀀스
        </button>
        <button
          type="button"
          :class="{ active: selectedCategory === 'windows-command' }"
          @click="selectedCategory = 'windows-command'">
          <span>🪟</span>
          Windows 기능
        </button>
        <button
          type="button"
          style="display: none"
          :class="{ active: selectedCategory === 'web-function' }"
          @click="selectedCategory = 'web-function'">
          <span>🌐</span>
          웹 기능
        </button>
      </nav>

      <div v-if="mode === 'assign' && gesture" class="modifier-bar">
        <span class="modifier-title">인식 조건 (필수 키):</span>
        <div class="modifier-options">
          <button
            type="button"
            class="modifier-pill"
            :class="{ active: currentGestureModifier === 'none' }"
            :disabled="isMutating"
            @click="selectGestureModifier('none')">
            없음 (언제나 인식)
          </button>
          <button
            type="button"
            class="modifier-pill"
            :class="{ active: currentGestureModifier === 'control_left' }"
            :disabled="isMutating"
            @click="selectGestureModifier('control_left')">
            왼쪽 Ctrl
          </button>
          <button
            type="button"
            class="modifier-pill"
            :class="{ active: currentGestureModifier === 'control_right' }"
            :disabled="isMutating"
            @click="selectGestureModifier('control_right')">
            오른쪽 Ctrl
          </button>
        </div>
      </div>

      <section
        v-if="selectedCategory === 'application' && currentApplication && gesture"
        class="current-application">
        <div class="current-identity">
          <img v-if="currentApplication.iconDataUrl" :src="currentApplication.iconDataUrl" alt="">
          <span v-else class="app-emoji">{{ currentApplication.iconText }}</span>
          <span>
            <small>현재 배정</small>
            <strong>{{ currentApplication.name }}</strong>
          </span>
        </div>
        <form v-if="isEditingName" class="rename-form" @submit.prevent="renameCurrentApplication">
          <input v-model="editingName" type="text" maxlength="80" aria-label="프로그램 표시 이름">
          <button type="submit" class="primary" :disabled="isMutating">저장</button>
          <button type="button" class="secondary" @click="isEditingName = false">취소</button>
        </form>
        <div v-else class="current-actions">
          <button type="button" class="secondary" :disabled="isMutating" @click="testCurrentApplication">
            테스트
          </button>
          <button type="button" class="secondary" :disabled="isMutating" @click="isEditingName = true">
            이름 변경
          </button>
          <button
            type="button"
            class="secondary"
            :disabled="isMutating || !settings.supportsCustomApplications"
            @click="isReplacingCurrent = !isReplacingCurrent">
            {{ isReplacingCurrent ? '교체 취소' : '대상 교체' }}
          </button>
          <button type="button" class="danger" :disabled="isMutating" @click="removeCurrentApplication">
            삭제
          </button>
        </div>
      </section>

      <div v-if="selectedCategory === 'application'" class="search-row">
        <input
          v-model="query"
          type="search"
          placeholder="프로그램 이름 검색"
          aria-label="프로그램 이름 검색"
          autofocus>
        <button
          type="button"
          class="secondary"
          :disabled="isLoading || isMutating || !settings.supportsCustomApplications"
          @click="loadDiscoveredApplications(true)">
          {{ isLoading ? '검색 중…' : '새로고침' }}
        </button>
      </div>

      <div class="picker-content">
        <InputSequenceEditor
          v-if="selectedCategory === 'input-sequence' && gesture"
          :gesture="gesture"
          :initial-steps="currentInputSequence"
          @close="emit('close')"
          @update="emit('update', $event)"
          @status="(message, isError) => emit('status', message, isError)" />

        <section v-else-if="selectedCategory === 'windows-command' && gesture">
          <div class="section-title">
            <div>
              <h3>Windows 기능 선택</h3>
              <p class="section-description">창 전환이나 화면 캡처를 제스처 한 번으로 실행합니다.</p>
            </div>
          </div>
          <div class="app-list">
            <button
              type="button"
              class="app-item unassigned"
              :class="{ selected: !currentApplicationId && !currentInputSequence && !currentWindowsCommand }"
              :disabled="isMutating"
              @click="clearAssignment">
              <span class="app-emoji">➖</span>
              <span><strong>미배정</strong><small>이 제스처에서 아무 동작도 실행하지 않음</small></span>
            </button>
            <button
              v-for="option in WINDOWS_COMMAND_OPTIONS"
              :key="option.command"
              type="button"
              class="app-item"
              :class="{ selected: option.command === currentWindowsCommand }"
              :disabled="isMutating"
              @click="selectWindowsCommand(option.command)">
              <span class="app-emoji">{{ option.icon }}</span>
              <span>
                <strong>{{ option.label }}</strong>
                <small>{{ option.description }}</small>
              </span>
            </button>
          </div>
        </section>

        <section v-else-if="selectedCategory === 'web-function' && gesture" class="web-function-section">
          <div class="section-title">
            <div>
              <h3>웹 기능</h3>
              <p class="section-description">웹 자동화 및 계정 로그인 기능을 제스처에 배정합니다.</p>
            </div>
          </div>

          <div class="web-card">
            <div class="web-card-header">
              <div class="web-card-identity">
                <span class="web-card-icon">🌐</span>
                <div>
                  <strong>Google 웹 로그인</strong>
                  <small>설정된 웹사이트 주소를 열고 Google 원클릭 로그인을 자동 수행합니다.</small>
                </div>
              </div>
              <span v-if="isWebLoginAssigned" class="badge-assigned">현재 배정됨</span>
            </div>

            <form class="web-settings-form" @submit.prevent="saveWebLoginSettings">
              <label class="web-field">
                <span class="field-title">로그인 웹사이트 주소 (URL)</span>
                <input
                  v-model="webLoginUrl"
                  type="url"
                  placeholder="https://example.com/login"
                  :disabled="isWebLoginSaving || isWebLoginTesting">
              </label>
              <label class="web-field">
                <span class="field-title">Google 계정 힌트 (이메일 등)</span>
                <input
                  v-model="webLoginHint"
                  type="text"
                  placeholder="user@example.com"
                  :disabled="isWebLoginSaving || isWebLoginTesting">
              </label>

              <p v-if="webLoginError" class="message error">{{ webLoginError }}</p>
              <p v-else-if="webLoginSuccessMessage" class="message success">{{ webLoginSuccessMessage }}</p>

              <div class="web-form-actions">
                <button
                  type="submit"
                  class="secondary"
                  :disabled="isWebLoginSaving || isWebLoginTesting || isWebLoginLoading">
                  {{ isWebLoginSaving ? '저장 중…' : '설정 저장' }}
                </button>
                <button
                  type="button"
                  class="secondary"
                  :disabled="isWebLoginSaving || isWebLoginTesting || isWebLoginLoading || !webLoginUrl"
                  @click="testWebLogin">
                  {{ isWebLoginTesting ? '실행 중…' : '테스트 실행' }}
                </button>
              </div>
            </form>

            <div class="web-assign-footer">
              <button
                v-if="!isWebLoginAssigned"
                type="button"
                class="primary"
                :disabled="isMutating"
                @click="assignGoogleWebLogin">
                이 제스처에 배정
              </button>
              <button
                v-else
                type="button"
                class="danger"
                :disabled="isMutating"
                @click="clearAssignment">
                제스처 배정 해제
              </button>
            </div>
          </div>
        </section>

        <section v-else-if="mode !== 'replace'">
          <div class="section-title">
            <h3>프로그램 선택</h3>
            <span v-if="isLoading">설치 앱 확인 중…</span>
          </div>
          <p v-if="discoveryError" class="message error">{{ discoveryError }}</p>
          <p v-else-if="discoveryWarning" class="message warning">{{ discoveryWarning }}</p>
          <div class="app-list">
            <button
              v-if="mode === 'assign'"
              type="button"
              class="app-item unassigned"
              :class="{ selected: !currentApplicationId && !currentInputSequence && !currentWindowsCommand }"
              :disabled="isMutating"
              @click="clearAssignment">
              <span class="app-emoji">➖</span>
              <span><strong>미배정</strong><small>이 제스처에서 아무 동작도 실행하지 않음</small></span>
            </button>
            <button
              v-for="application in filteredDirectApplications"
              :key="application.id"
              type="button"
              class="app-item"
              :class="{ selected: application.id === currentApplicationId }"
              :disabled="isMutating"
              @click="selectRegisteredApplication(application)">
              <img v-if="application.iconDataUrl" :src="application.iconDataUrl" alt="">
              <span v-else class="app-emoji">{{ application.iconText }}</span>
              <span>
                <strong>{{ application.name }}</strong>
                <small>
                  {{ application.id === currentApplicationId
                    ? '현재 배정됨'
                    : getApplicationSourceLabel(application.targetKind) }}
                </small>
              </span>
            </button>
            <button
              v-for="application in filteredDiscoveredApplications"
              :key="application.discoveryId"
              type="button"
              class="app-item"
              :disabled="isMutating"
              @click="selectDiscoveredApplication(application)">
              <img v-if="application.iconDataUrl" :src="application.iconDataUrl" alt="">
              <span v-else class="app-emoji">{{ application.iconText }}</span>
              <span>
                <strong>{{ application.name }}</strong>
                <small>{{ getApplicationSourceLabel(application.targetKind) }}</small>
              </span>
            </button>
            <p
              v-if="
                !isLoading &&
                !discoveryError &&
                filteredDirectApplications.length === 0 &&
                filteredDiscoveredApplications.length === 0
              "
              class="empty">
              검색과 일치하는 프로그램이 없습니다.
            </p>
          </div>
        </section>

        <section v-else>
          <div class="section-title">
            <h3>새 실행 대상 선택</h3>
            <span v-if="isLoading">불러오는 중…</span>
          </div>
          <p v-if="discoveryError" class="message error">{{ discoveryError }}</p>
          <p v-else-if="discoveryWarning" class="message warning">{{ discoveryWarning }}</p>
          <div class="app-list">
            <button
              v-for="application in filteredDiscoveredApplications"
              :key="application.discoveryId"
              type="button"
              class="app-item"
              :disabled="isMutating"
              @click="selectDiscoveredApplication(application)">
              <img v-if="application.iconDataUrl" :src="application.iconDataUrl" alt="">
              <span v-else class="app-emoji">{{ application.iconText }}</span>
              <span>
                <strong>{{ application.name }}</strong>
                <small>{{ getApplicationSourceLabel(application.targetKind) }}</small>
              </span>
            </button>
            <p
              v-if="!isLoading && !discoveryError && filteredDiscoveredApplications.length === 0"
              class="empty">
              검색과 일치하는 설치 앱이 없습니다.
            </p>
          </div>
        </section>
      </div>

      <footer v-if="selectedCategory === 'application'" class="picker-footer">
        <span>목록에 없는 포터블 프로그램은 직접 찾을 수 있습니다.</span>
        <div>
          <button type="button" class="secondary" @click="emit('close')">취소</button>
          <button
            type="button"
            class="primary"
            :disabled="isMutating || !settings.supportsCustomApplications"
            @click="browseForApplication">
            직접 찾아보기
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 130;
  display: grid;
  place-items: center;
  padding: 18px;
  color: #e7f0fb;
  background: rgba(2, 6, 14, 0.86);
  backdrop-filter: blur(8px);
}

.picker-dialog {
  width: min(760px, 100%);
  max-height: calc(100vh - 36px);
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(94, 119, 150, 0.58);
  border-radius: 16px;
  background: #0a111c;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.62);
  overflow: hidden;
}

.picker-header,
.category-tabs,
.search-row,
.picker-footer,
.section-title,
.picker-footer > div,
.current-application,
.current-identity,
.current-actions,
.rename-form {
  display: flex;
  align-items: center;
}

.picker-header {
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(94, 119, 150, 0.35);
}

.category-tabs {
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(94, 119, 150, 0.28);
}

.category-tabs button {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #9eb6d1;
  background: transparent;
  border: 1px solid rgba(94, 119, 150, 0.42);
}

.category-tabs button.active {
  color: #e7f0fb;
  border-color: #38bdf8;
  background: rgba(56, 189, 248, 0.13);
}

.picker-header h2,
.picker-header p,
.picker-content h3 {
  margin: 0;
}

.picker-header p {
  margin-top: 4px;
  color: #9eb6d1;
  font-size: 13px;
}

.current-application {
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 16px;
  background: rgba(56, 189, 248, 0.08);
  border-bottom: 1px solid rgba(94, 119, 150, 0.28);
}

.current-identity,
.current-actions,
.rename-form {
  gap: 7px;
}

.current-identity img {
  width: 30px;
  height: 30px;
  object-fit: contain;
}

.current-identity small,
.current-identity strong {
  display: block;
}

.current-identity small {
  color: #91a9c5;
  font-size: 10px;
}

.rename-form {
  flex: 1;
  justify-content: flex-end;
}

.rename-form input {
  width: min(260px, 100%);
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

.search-row {
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(94, 119, 150, 0.28);
}

input {
  min-width: 0;
  flex: 1;
  padding: 10px 12px;
  color: #e7f0fb;
  background: #111c2b;
  border: 1px solid #49637e;
  border-radius: 9px;
}

.picker-content {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
  padding: 14px 16px;
  overflow: auto;
}

.picker-content h3 {
  font-size: 14px;
}

.section-title {
  justify-content: space-between;
  gap: 8px;
}

.section-title span {
  color: #9eb6d1;
  font-size: 11px;
}

.section-description {
  margin: 4px 0 0;
  color: #91a9c5;
  font-size: 11px;
}

.app-list {
  display: grid;
  gap: 6px;
  margin-top: 9px;
}

.app-item {
  width: 100%;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  color: #d7e2ef;
  text-align: left;
  background: rgba(9, 16, 28, 0.88);
  border: 1px solid rgba(94, 119, 150, 0.4);
}

.app-item:hover,
.app-item.selected {
  border-color: #38bdf8;
  background: rgba(56, 189, 248, 0.13);
}

.app-item img {
  width: 28px;
  height: 28px;
  object-fit: contain;
}

.app-emoji {
  font-size: 22px;
  text-align: center;
}

.app-item strong,
.app-item small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-item small {
  margin-top: 2px;
  color: #91a9c5;
  font-size: 10px;
}

.message,
.empty {
  font-size: 11px;
  line-height: 1.4;
}

.message.error {
  color: #fca5a5;
}

.message.warning {
  color: #fbbf24;
}

.empty {
  color: #91a9c5;
}

.picker-footer {
  justify-content: space-between;
  gap: 12px;
  padding: 11px 16px;
  color: #9eb6d1;
  font-size: 11px;
  border-top: 1px solid rgba(94, 119, 150, 0.35);
}

.modifier-bar {
  margin: 10px 18px 0;
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

.picker-footer > div {
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

button.danger {
  color: #fecaca;
  background: rgba(127, 29, 29, 0.35);
  border: 1px solid rgba(248, 113, 113, 0.55);
}

.web-function-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.web-card {
  padding: 16px;
  background: rgba(9, 16, 28, 0.88);
  border: 1px solid rgba(94, 119, 150, 0.4);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.web-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.web-card-identity {
  display: flex;
  align-items: center;
  gap: 12px;
}

.web-card-icon {
  font-size: 28px;
  line-height: 1;
}

.web-card-identity strong {
  display: block;
  font-size: 15px;
  color: #f1f5f9;
}

.web-card-identity small {
  display: block;
  font-size: 12px;
  color: #94a3b8;
  margin-top: 2px;
}

.badge-assigned {
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 800;
  color: #38bdf8;
  background: rgba(14, 165, 233, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.45);
  white-space: nowrap;
}

.web-settings-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(71, 85, 105, 0.4);
  border-radius: 10px;
}

.web-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-title {
  font-size: 12px;
  font-weight: 700;
  color: #cbd5e1;
}

.web-form-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.web-assign-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(71, 85, 105, 0.3);
}

@media (max-width: 650px) {
  .picker-content {
    grid-template-columns: 1fr;
  }

  .picker-footer {
    align-items: flex-start;
    flex-direction: column;
  }

  .current-application {
    align-items: flex-start;
  }

  .current-actions {
    flex-wrap: wrap;
  }
}
</style>
