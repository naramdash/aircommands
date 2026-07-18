<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  fingerDefinitions,
  oneHandTouchGestureCommands,
  touchGestureCommands,
  twoHandTouchGestureCommands,
} from './utils/gesture_command_detection/command_map'
import {
  createRecognitionContext,
  reduceRecognitionFrame,
} from './utils/gesture_command_detection/recognition_reducer'
import { getTwoHandTouchFrame } from './utils/gesture_command_detection/touch_detection'
import type {
  FingerName,
  FingerTip,
  GestureCandidate,
  GestureName,
  RecognitionState,
  TouchContact,
  TwoHandTouchFrame,
} from './utils/gesture_command_detection/types'
import { handLandmarker } from './utils/hand_landmark_detection'

const FINGER_RADIUS = 5
const ACTIVE_FINGER_RADIUS = 8
const TOUCH_COLOR = '250, 204, 21'
const TOUCH_SUCCESS_COLOR = '34, 197, 94'
const TOUCH_SUCCESS_HIGHLIGHT_MS = 900
const EXECUTION_REQUEST_TIMEOUT_MS = 2500
const FINGER_COLORS: Record<FingerName, string> = {
  thumb: '239, 68, 68',
  index: '34, 197, 94',
  middle: '59, 130, 246',
  ring: '168, 85, 247',
  pinky: '45, 212, 191',
}

const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const errorMessage = ref('')
const isCameraActive = ref(false)
const isLeftHandVisible = ref(false)
const isRightHandVisible = ref(false)
const recognitionState = ref<RecognitionState>('tracking')
const currentCandidateLabel = ref('없음')
const currentTouchLabel = ref('없음')
const currentTouchGesture = ref<GestureName | ''>('')
const poseWarning = ref('')
const touchProgressPercent = ref(0)
const touchDistanceText = ref('없음')
const cooldownRemainingMs = ref(0)
const commandResultMessage = ref('')
const gestureCompletionNotice = ref('')
const isRecognitionOnHold = computed(() => Boolean(poseWarning.value))
const oneHandGestureGroups = computed(() => [
  {
    hand: 'Left' as const,
    label: '왼손',
    shapeLabel: '네모',
    commands: oneHandTouchGestureCommands.filter((command) => command.hand === 'Left'),
  },
  {
    hand: 'Right' as const,
    label: '오른손',
    shapeLabel: '세모',
    commands: oneHandTouchGestureCommands.filter((command) => command.hand === 'Right'),
  },
])

const activeTouchCommand = computed(() => {
  if (!currentTouchGesture.value) return null
  return touchGestureCommands.find((command) => command.gesture === currentTouchGesture.value) ?? null
})

const touchGestureRows = computed(() => {
  return fingerDefinitions.map((leftFinger) => ({
    leftFinger,
    commands: fingerDefinitions.map((rightFinger) => {
      const command = twoHandTouchGestureCommands.find((item) => {
        return item.leftFinger === leftFinger.name && item.rightFinger === rightFinger.name
      })

      if (!command) {
        throw new Error(`Missing touch command for ${leftFinger.name}/${rightFinger.name}`)
      }

      return command
    }),
  }))
})

const cooldownSeconds = computed(() => Math.ceil(cooldownRemainingMs.value / 1000))

const trackingStatus = computed(() => {
  if (!isCameraActive.value) return '카메라 대기'
  if (recognitionState.value === 'executing') return '실행 중'
  if (recognitionState.value === 'cooldown') return '쿨다운'
  if (recognitionState.value === 'error') return '오류'
  if (!isLeftHandVisible.value && !isRightHandVisible.value) return '손 대기'
  if (poseWarning.value) return '자세 보류'
  if (recognitionState.value === 'touching') return '접촉 감지'
  if (isLeftHandVisible.value && !isRightHandVisible.value) return '왼손 감지'
  if (!isLeftHandVisible.value && isRightHandVisible.value) return '오른손 감지'
  return '접촉 대기'
})

const phaseGuideText = computed(() => {
  if (!isCameraActive.value) return '카메라를 시작하세요'
  if (!isLeftHandVisible.value && !isRightHandVisible.value) return '손을 화면에 보여주세요'
  if (poseWarning.value) return poseWarning.value
  if (recognitionState.value === 'touching') return '손가락 접촉을 잠깐 유지하면 명령이 실행됩니다'
  if (recognitionState.value === 'executing') return '명령 실행 중입니다'
  if (recognitionState.value === 'cooldown') return '다음 입력을 잠시 대기합니다'
  if (recognitionState.value === 'error') return '오류 상태입니다'
  return '양손 손가락을 맞대거나, 한 손에서 엄지와 검지/중지/약지를 맞대세요'
})

function getFingerColor(finger: FingerName) {
  return `rgb(${FINGER_COLORS[finger]})`
}

function getAppShortLabel(label: string) {
  return label.replace(/\s*실행$/, '')
}

let mediaStream: MediaStream | null = null
let animationFrameId = 0
let recognitionContext = createRecognitionContext()
let gestureCompletionTimer: ReturnType<typeof setTimeout> | null = null
let successfulTouchContact: TouchContact | null = null
let successfulTouchUntil = 0

async function startCamera() {
  errorMessage.value = ''
  commandResultMessage.value = ''

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    })

    const video = videoRef.value
    if (!video) return

    video.srcObject = mediaStream
    await video.play()

    isCameraActive.value = true
    drawCameraFrame()
  } catch (error) {
    stopCamera()
    errorMessage.value = error instanceof Error ? error.message : '카메라 권한을 확인할 수 없습니다.'
  }
}

function stopCamera() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = 0
  }

  mediaStream?.getTracks().forEach((track) => track.stop())
  mediaStream = null
  isCameraActive.value = false
  resetRecognition()
  clearGestureCompletionNotice()

  const video = videoRef.value
  if (video) {
    video.pause()
    video.srcObject = null
  }

  const canvas = canvasRef.value
  const context = canvas?.getContext('2d')
  if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height)
}

function drawCameraFrame() {
  const video = videoRef.value
  const canvas = canvasRef.value
  const context = canvas?.getContext('2d')
  if (!video || !canvas || !context) return

  if (video.videoWidth > 0 && video.videoHeight > 0) {
    syncCanvasSize(canvas, video)

    const now = performance.now()
    const result = handLandmarker.detectForVideo(video, now)
    const touchFrame = getTwoHandTouchFrame(result.landmarks, result.handednesses, now)
    const recognitionResult = reduceRecognitionFrame(recognitionContext, touchFrame, now)

    const activeContact = recognitionResult.context.activeTouch ?? touchFrame.closestContact
    const successContact = getSuccessTouchContact(recognitionResult.executionCandidate ? activeContact : null, now)
    const displayedContact = successContact ?? activeContact

    context.clearRect(0, 0, canvas.width, canvas.height)
    drawTouchContact(
      context,
      canvas.width,
      canvas.height,
      displayedContact,
      successContact ? 1 : recognitionResult.context.touchProgress,
      Boolean(successContact),
    )
    drawFingerTips(context, canvas.width, canvas.height, touchFrame, activeContact, successContact)

    recognitionContext = recognitionResult.context
    syncRecognitionDisplay(touchFrame, now)

    if (recognitionResult.executionCandidate) {
      showGestureCompletionNotice(recognitionResult.executionCandidate)
      void executeCandidate(recognitionResult.executionCandidate)
    }
  }

  animationFrameId = requestAnimationFrame(drawCameraFrame)
}

function syncCanvasSize(canvas: HTMLCanvasElement, video: HTMLVideoElement) {
  if (canvas.width === video.videoWidth && canvas.height === video.videoHeight) return
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
}

function getSuccessTouchContact(contact: TouchContact | null, now: number) {
  if (contact) {
    successfulTouchContact = contact
    successfulTouchUntil = now + TOUCH_SUCCESS_HIGHLIGHT_MS
    return contact
  }

  if (successfulTouchContact && successfulTouchUntil > now) return successfulTouchContact
  successfulTouchContact = null
  successfulTouchUntil = 0
  return null
}

function drawFingerTips(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: TwoHandTouchFrame,
  activeContact: TouchContact | null,
  successContact: TouchContact | null,
) {
  context.save()
  for (const tip of frame.leftTips) drawFingerTip(context, tip, 'left', width, height, activeContact, successContact)
  for (const tip of frame.rightTips) drawFingerTip(context, tip, 'right', width, height, activeContact, successContact)
  context.restore()
}

function drawFingerTip(
  context: CanvasRenderingContext2D,
  tip: FingerTip,
  hand: 'left' | 'right',
  width: number,
  height: number,
  activeContact: TouchContact | null,
  successContact: TouchContact | null,
) {
  const x = tip.point.x * width
  const y = tip.point.y * height
  const isActive =
    activeContact?.contactType === 'two_hand'
      ? hand === 'left'
        ? activeContact.leftFinger === tip.finger
        : activeContact.rightFinger === tip.finger
      : activeContact?.hand === (hand === 'left' ? 'Left' : 'Right') &&
        (activeContact.primaryFinger === tip.finger || activeContact.secondaryFinger === tip.finger)
  const isSuccess =
    successContact?.contactType === 'two_hand'
      ? hand === 'left'
        ? successContact.leftFinger === tip.finger
        : successContact.rightFinger === tip.finger
      : successContact?.hand === (hand === 'left' ? 'Left' : 'Right') &&
        (successContact.primaryFinger === tip.finger || successContact.secondaryFinger === tip.finger)
  const radius = isActive || isSuccess ? ACTIVE_FINGER_RADIUS : FINGER_RADIUS
  const color = FINGER_COLORS[tip.finger]

  if (isActive || isSuccess) {
    const highlightColor = isSuccess ? TOUCH_SUCCESS_COLOR : TOUCH_COLOR
    context.save()
    context.shadowColor = `rgba(${highlightColor}, 0.6)`
    context.shadowBlur = isSuccess ? 14 : 10
    context.strokeStyle = `rgba(${highlightColor}, 1)`
    context.lineWidth = isSuccess ? 5 : 4
    context.beginPath()
    context.arc(x, y, radius + (isSuccess ? 9 : 7), 0, Math.PI * 2)
    context.stroke()
    context.restore()
  }

  context.save()
  context.shadowColor = `rgba(${color}, 0.35)`
  context.shadowBlur = isActive ? 8 : 4
  context.fillStyle = `rgba(${color}, 0.94)`
  context.strokeStyle = 'rgba(15, 23, 42, 0.9)'
  context.lineWidth = 3
  if (hand === 'left') drawSquareTip(context, x, y, radius)
  else drawTriangleTip(context, x, y, radius)
  context.fill()
  context.stroke()
  context.restore()
}

function drawSquareTip(context: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  const size = radius * 2.3
  context.beginPath()
  context.rect(x - size / 2, y - size / 2, size, size)
}

function drawTriangleTip(context: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  const size = radius * 2.8
  const half = size / 2
  const verticalOffset = size * 0.08
  context.beginPath()
  context.moveTo(x, y - half - verticalOffset)
  context.lineTo(x + half, y + half - verticalOffset)
  context.lineTo(x - half, y + half - verticalOffset)
  context.closePath()
}

function drawTouchContact(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  contact: TouchContact | null,
  progress: number,
  isSuccess: boolean,
) {
  if (!contact) return

  const leftX = contact.leftPoint.x * width
  const leftY = contact.leftPoint.y * height
  const rightX = contact.rightPoint.x * width
  const rightY = contact.rightPoint.y * height
  const centerX = contact.midpoint.x * width
  const centerY = contact.midpoint.y * height
  const ringRadius = 17
  const touchColor = isSuccess ? TOUCH_SUCCESS_COLOR : TOUCH_COLOR

  context.save()
  context.lineCap = 'round'
  context.shadowColor = `rgba(${touchColor}, ${isSuccess ? 0.6 : 0.45})`
  context.shadowBlur = isSuccess ? 12 : 8
  context.strokeStyle = `rgba(${touchColor}, 0.96)`
  context.lineWidth = isSuccess ? 5 : 4
  context.beginPath()
  context.moveTo(leftX, leftY)
  context.lineTo(rightX, rightY)
  context.stroke()

  context.strokeStyle = `rgba(${touchColor}, ${isSuccess ? 0.4 : 0.28})`
  context.lineWidth = 3
  context.beginPath()
  context.arc(centerX, centerY, ringRadius, 0, Math.PI * 2)
  context.stroke()

  context.strokeStyle = `rgba(${touchColor}, 1)`
  context.beginPath()
  context.arc(centerX, centerY, ringRadius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress)
  context.stroke()
  context.restore()
}

function resetRecognition() {
  recognitionContext = createRecognitionContext()
  successfulTouchContact = null
  successfulTouchUntil = 0
  isLeftHandVisible.value = false
  isRightHandVisible.value = false
  recognitionState.value = recognitionContext.state
  currentCandidateLabel.value = '없음'
  currentTouchLabel.value = '없음'
  currentTouchGesture.value = ''
  poseWarning.value = ''
  touchProgressPercent.value = 0
  touchDistanceText.value = '없음'
  cooldownRemainingMs.value = 0
  commandResultMessage.value = ''
  clearGestureCompletionNotice()
}

function syncRecognitionDisplay(frame: TwoHandTouchFrame, now: number) {
  isLeftHandVisible.value = frame.leftHandVisible
  isRightHandVisible.value = frame.rightHandVisible
  poseWarning.value = getPoseWarning(frame)
  recognitionState.value = recognitionContext.state
  const visibleContact = (frame.leftHandVisible || frame.rightHandVisible)
    ? recognitionContext.activeTouch ?? frame.closestContact
    : null

  currentCandidateLabel.value = recognitionContext.candidate
    ? `${recognitionContext.candidate.gestureLabel} / ${recognitionContext.candidate.label}`
    : '없음'
  currentTouchLabel.value = visibleContact ? getTouchLabel(visibleContact) : '없음'
  currentTouchGesture.value = visibleContact?.gesture ?? ''
  touchProgressPercent.value = visibleContact ? Math.round(recognitionContext.touchProgress * 100) : 0
  touchDistanceText.value = visibleContact ? `${visibleContact.normalizedDistance.toFixed(2)}` : '없음'
  cooldownRemainingMs.value = Math.max(0, recognitionContext.cooldownUntil - now)

  if (recognitionContext.errorMessage) errorMessage.value = recognitionContext.errorMessage
  else if (errorMessage.value && recognitionContext.state !== 'error') errorMessage.value = ''
}

function getTouchLabel(contact: TouchContact) {
  const command = touchGestureCommands.find((item) => item.gesture === contact.gesture)
  return command?.gestureLabel ?? contact.gesture
}

function getPoseWarning(frame: TwoHandTouchFrame) {
  const blockedPose = [frame.leftPoseQuality, frame.rightPoseQuality].find((quality) => quality && !quality.isAcceptable)
  if (!blockedPose) return ''
  if (blockedPose.reason === 'palm_edge_on') {
    return '손이 카메라 방향으로 세워져 있어 인식을 보류합니다. 손바닥을 카메라와 더 평행하게 돌리세요.'
  }
  if (blockedPose.reason === 'fist_closed') {
    return '주먹처럼 손가락이 접혀 있어 인식을 보류합니다. 접촉할 손가락을 펴서 보여주세요.'
  }
  if (blockedPose.reason === 'fingertips_overlapped') {
    return '손가락 끝이 화면에서 겹쳐 보여 인식을 보류합니다. 손가락 사이가 보이게 자세를 바꾸세요.'
  }
  return ''
}

function showGestureCompletionNotice(candidate: GestureCandidate) {
  gestureCompletionNotice.value = `${candidate.gestureLabel} 완료`
  if (gestureCompletionTimer) clearTimeout(gestureCompletionTimer)
  gestureCompletionTimer = setTimeout(() => {
    gestureCompletionNotice.value = ''
    gestureCompletionTimer = null
  }, 1600)
}

function clearGestureCompletionNotice() {
  gestureCompletionNotice.value = ''
  if (gestureCompletionTimer) {
    clearTimeout(gestureCompletionTimer)
    gestureCompletionTimer = null
  }
}

async function executeCandidate(candidate: GestureCandidate) {
  commandResultMessage.value = `${candidate.label} 요청 중`
  const timeoutId = window.setTimeout(() => {
    commandResultMessage.value = `${candidate.label} 실패`
    errorMessage.value = '앱 실행 요청이 지연되어 인식 흐름에서 분리했습니다.'
  }, EXECUTION_REQUEST_TIMEOUT_MS)

  try {
    const response = await window.aircommands.openApp({
      app: candidate.app,
      source: 'gesture',
      gesture: candidate.gesture,
      clientRequestId: `${candidate.gesture}-${candidate.app}-${Math.round(candidate.detectedAt)}`,
    })

    if (response.success) {
      commandResultMessage.value = `${candidate.label} 완료`
    } else {
      commandResultMessage.value = `${candidate.label} 실패`
      errorMessage.value = response.message
    }
  } catch (error) {
    commandResultMessage.value = `${candidate.label} 실패`
    errorMessage.value = error instanceof Error ? error.message : '앱 실행 요청에 실패했습니다.'
  } finally {
    window.clearTimeout(timeoutId)
  }
}

onMounted(() => {
  void startCamera()
})

onBeforeUnmount(() => {
  clearGestureCompletionNotice()
  stopCamera()
})
</script>

<template>
  <main class="page">
    <div v-if="gestureCompletionNotice" class="notice success">{{ gestureCompletionNotice }}</div>

    <section class="camera-card">
      <div class="camera-wrap">
        <video ref="videoRef" muted playsinline class="camera" />
        <canvas ref="canvasRef" class="overlay" />

        <div class="status-grid">
          <div class="status-item">
            <div class="status-label">상태</div>
            <div class="status-value">{{ trackingStatus }}</div>
          </div>
          <div class="status-item">
            <div class="status-label">가까운 접촉</div>
            <div class="status-value">{{ currentTouchLabel }}</div>
          </div>
          <div class="status-item">
            <div class="status-label">실행 후보</div>
            <div class="status-value">{{ currentCandidateLabel }}</div>
          </div>
          <div class="status-item">
            <div class="status-label">유지</div>
            <div class="status-value">{{ touchProgressPercent }}%</div>
          </div>
          <div class="status-item">
            <div class="status-label">거리</div>
            <div class="status-value">{{ touchDistanceText }}</div>
          </div>
          <div class="status-item">
            <div class="status-label">쿨다운</div>
            <div class="status-value">{{ cooldownSeconds > 0 ? `${cooldownSeconds}초` : '없음' }}</div>
          </div>
        </div>

        <div class="phase-guide">{{ phaseGuideText }}</div>
      </div>
    </section>

    <section class="matrix-card">
      <h2>양손 접촉 명령 (5x5)</h2>
      <div class="matrix-grid">
        <div class="matrix-head">L/R</div>
        <div v-for="rightFinger in fingerDefinitions" :key="rightFinger.name" class="matrix-head">
          {{ rightFinger.label }}
        </div>

        <template v-for="row in touchGestureRows" :key="row.leftFinger.name">
          <div class="matrix-side">{{ row.leftFinger.label }}</div>
          <button
            v-for="command in row.commands"
            :key="command.gesture"
            type="button"
            class="matrix-cell"
            :class="command.gesture === currentTouchGesture ? 'active' : ''"
            :title="`${command.gestureLabel} / ${command.label}`">
            <div class="cell-mark">{{ command.mark }}</div>
            <div class="cell-app">{{ getAppShortLabel(command.label) }}</div>
          </button>
        </template>
      </div>
    </section>

    <section class="one-hand-grid">
      <article v-for="group in oneHandGestureGroups" :key="group.hand" class="one-hand-card">
        <header>
          <h3>{{ group.label }} 한손 접촉</h3>
          <span>{{ group.shapeLabel }} 표시</span>
        </header>
        <ul>
          <li
            v-for="command in group.commands"
            :key="command.gesture"
            :class="command.gesture === currentTouchGesture ? 'active' : ''">
            <span>{{ command.gestureLabel }}</span>
            <strong>{{ getAppShortLabel(command.label) }}</strong>
          </li>
        </ul>
      </article>
    </section>

    <footer class="bottom-bar">
      <button v-if="!isCameraActive" type="button" class="primary" @click="startCamera">시작</button>
      <button v-else type="button" class="secondary" @click="stopCamera">정지</button>

      <span v-if="activeTouchCommand" class="pill">현재 앱: {{ getAppShortLabel(activeTouchCommand.label) }}</span>
      <span v-if="commandResultMessage" class="pill success">{{ commandResultMessage }}</span>
      <span v-if="errorMessage" class="pill warn">{{ errorMessage }}</span>
    </footer>
  </main>
</template>

<style scoped>
.page {
  min-height: 100vh;
  background: #0b1118;
  color: #e6edf3;
  padding: 12px;
  display: grid;
  gap: 10px;
  grid-template-rows: auto auto auto auto;
}

.notice {
  position: fixed;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 14px;
  border-radius: 10px;
  z-index: 60;
  font-weight: 700;
}

.notice.success {
  background: rgba(34, 197, 94, 0.16);
  border: 1px solid rgba(34, 197, 94, 0.5);
}

.camera-card,
.matrix-card,
.one-hand-card {
  border: 1px solid #243444;
  border-radius: 12px;
  background: #111a23;
}

.camera-wrap {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
}

.camera,
.overlay {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transform: scaleX(-1);
}

.overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.status-grid {
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  overflow: hidden;
  background: rgba(6, 10, 16, 0.72);
  backdrop-filter: blur(6px);
}

.status-item {
  padding: 6px 8px;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}

.status-item:last-child {
  border-right: 0;
}

.status-label {
  font-size: 10px;
  color: #96aac2;
  text-transform: uppercase;
  font-weight: 700;
}

.status-value {
  margin-top: 3px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.phase-guide {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 10px;
  border-radius: 10px;
  padding: 8px 10px;
  background: rgba(6, 10, 16, 0.74);
  border: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 12px;
  font-weight: 600;
}

.matrix-card {
  padding: 10px;
}

.matrix-card h2 {
  margin: 0 0 8px;
  font-size: 14px;
}

.matrix-grid {
  display: grid;
  grid-template-columns: 56px repeat(5, minmax(0, 1fr));
  gap: 4px;
}

.matrix-head,
.matrix-side,
.matrix-cell {
  border-radius: 8px;
  border: 1px solid #2d3f53;
  background: #0e1620;
}

.matrix-head,
.matrix-side {
  display: grid;
  place-items: center;
  height: 42px;
  font-size: 11px;
  font-weight: 800;
}

.matrix-cell {
  height: 52px;
  color: #d7e2ef;
}

.matrix-cell.active {
  border-color: #facc15;
  box-shadow: inset 0 0 0 1px rgba(250, 204, 21, 0.6);
  background: rgba(250, 204, 21, 0.12);
}

.cell-mark {
  font-size: 12px;
  font-weight: 800;
}

.cell-app {
  font-size: 10px;
  color: #9cb0c6;
}

.one-hand-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.one-hand-card {
  padding: 10px;
}

.one-hand-card header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.one-hand-card h3 {
  margin: 0;
  font-size: 14px;
}

.one-hand-card header span {
  font-size: 11px;
  color: #8ea3bc;
}

.one-hand-card ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
}

.one-hand-card li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid #2d3f53;
  border-radius: 8px;
  padding: 8px;
  font-size: 12px;
}

.one-hand-card li.active {
  border-color: #facc15;
  background: rgba(250, 204, 21, 0.12);
}

.bottom-bar {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  align-items: center;
}

button {
  border: none;
  border-radius: 8px;
  padding: 8px 14px;
  font-weight: 700;
  cursor: pointer;
}

button.primary {
  background: #2563eb;
  color: white;
}

button.secondary {
  background: transparent;
  color: #d7e2ef;
  border: 1px solid #456282;
}

.pill {
  border: 1px solid #38526c;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  background: #0d1520;
}

.pill.success {
  border-color: rgba(34, 197, 94, 0.6);
}

.pill.warn {
  border-color: rgba(250, 204, 21, 0.65);
}

@media (max-width: 980px) {
  .status-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .one-hand-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .status-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .matrix-grid {
    grid-template-columns: 44px repeat(5, minmax(0, 1fr));
  }
}
</style>
