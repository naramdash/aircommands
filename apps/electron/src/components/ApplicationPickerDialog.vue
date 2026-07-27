<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  filterAndSortApplications,
  filterSelectableRegisteredApplications,
} from '../utils/application_search'

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
let removeCatalogListener: (() => void) | null = null

const mode = computed(() => {
  if (props.replaceApplicationId || isReplacingCurrent.value) return 'replace'
  if (props.gesture) return 'assign'
  return 'add'
})

const title = computed(() => {
  if (mode.value === 'replace') return '실행 대상 교체'
  if (mode.value === 'assign') return '제스처 프로그램 선택'
  return '프로그램 추가'
})

const currentApplicationId = computed(() =>
  props.gesture ? props.settings.gestureAssignments[props.gesture] : null)

const currentApplication = computed(() => {
  const applicationId = props.replaceApplicationId ?? currentApplicationId.value
  return props.settings.applications.find((application) =>
    application.id === applicationId) ?? null
})

const filteredDirectApplications = computed(() => {
  return filterSelectableRegisteredApplications(
    props.settings.applications,
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

onMounted(() => {
  removeCatalogListener = window.aircommands.onApplicationCatalogUpdated((response) => {
    if (!response.success) return
    discoveredApplications.value = response.applications
    discoveryWarning.value = response.warning ?? ''
    discoveryError.value = ''
  })
  void loadDiscoveredApplications(false)
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
          <p>프로그램을 고르면 이 제스처의 설정이 바로 저장됩니다.</p>
        </div>
        <button type="button" class="icon-button" aria-label="닫기" @click="emit('close')">×</button>
      </header>

      <section v-if="currentApplication && gesture" class="current-application">
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

      <div class="search-row">
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
        <section v-if="mode !== 'replace'">
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
              :class="{ selected: !currentApplicationId }"
              :disabled="isMutating"
              @click="clearAssignment">
              <span class="app-emoji">➖</span>
              <span><strong>미배정</strong><small>이 제스처에서 프로그램을 실행하지 않음</small></span>
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

      <footer class="picker-footer">
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
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  border: 1px solid rgba(94, 119, 150, 0.58);
  border-radius: 16px;
  background: #0a111c;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.62);
  overflow: hidden;
}

.picker-header,
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
