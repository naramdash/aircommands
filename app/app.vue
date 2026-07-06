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
  markExecutionFailure,
  markExecutionSuccess,
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

type OpenAppResponse =
  | {
      success: true
      app: string
      message: string
      requestId: string
    }
  | {
      success: false
      app?: string
      error: string
      message: string
      availableApps?: string[]
      requestId: string
    }

const FINGER_RADIUS = 5
const ACTIVE_FINGER_RADIUS = 8
const TOUCH_COLOR = '250, 204, 21'
const TOUCH_SUCCESS_COLOR = '34, 197, 94'
const TOUCH_SUCCESS_HIGHLIGHT_MS = 900
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
const supportedGestureItems = computed(() => touchGestureCommands)
const oneHandGestureGroups = computed(() => [
  {
    hand: 'Left' as const,
    label: '왼손',
    shapeLabel: '네모',
    commands: oneHandTouchGestureCommands.filter((command) => {
      return command.hand === 'Left'
    }),
  },
  {
    hand: 'Right' as const,
    label: '오른손',
    shapeLabel: '세모',
    commands: oneHandTouchGestureCommands.filter((command) => {
      return command.hand === 'Right'
    }),
  },
])
const activeTouchCommand = computed(() => {
  if (!currentTouchGesture.value) return null

  return (
    touchGestureCommands.find((command) => {
      return command.gesture === currentTouchGesture.value
    }) ?? null
  )
})
const touchGestureRows = computed(() => {
  return fingerDefinitions.map((leftFinger) => ({
    leftFinger,
    commands: fingerDefinitions.map((rightFinger) => {
      const command = twoHandTouchGestureCommands.find((item) => {
        return (
          item.leftFinger === leftFinger.name &&
          item.rightFinger === rightFinger.name
        )
      })

      if (!command) {
        throw new Error(
          `Missing touch command for ${leftFinger.name}/${rightFinger.name}`,
        )
      }

      return command
    }),
  }))
})
const cooldownSeconds = computed(() =>
  Math.ceil(cooldownRemainingMs.value / 1000),
)
const statusColor = computed(() => {
  if (poseWarning.value) return 'warning'
  if (recognitionState.value === 'error') return 'error'
  if (recognitionState.value === 'touching') return 'success'
  if (
    recognitionState.value === 'executing' ||
    recognitionState.value === 'cooldown'
  ) {
    return 'info'
  }
  if (
    !isCameraActive.value ||
    (!isLeftHandVisible.value && !isRightHandVisible.value)
  ) {
    return 'neutral'
  }

  return 'primary'
})
const trackingStatus = computed(() => {
  if (!isCameraActive.value) return '카메라 대기'
  if (!isLeftHandVisible.value && !isRightHandVisible.value) return '손 대기'
  if (poseWarning.value) return '자세 보류'
  if (recognitionState.value === 'touching') return '접촉 감지'
  if (recognitionState.value === 'executing') return '실행 중'
  if (recognitionState.value === 'cooldown') return '쿨다운'
  if (recognitionState.value === 'error') return '오류'

  if (isLeftHandVisible.value && !isRightHandVisible.value) return '왼손 감지'
  if (!isLeftHandVisible.value && isRightHandVisible.value) return '오른손 감지'

  return '접촉 대기'
})
const phaseGuideText = computed(() => {
  if (!isCameraActive.value) return '카메라를 시작하세요'
  if (!isLeftHandVisible.value && !isRightHandVisible.value) {
    return '손을 화면에 보여주세요'
  }
  if (poseWarning.value) return poseWarning.value
  if (recognitionState.value === 'touching') {
    return '손가락 접촉을 잠깐 유지하면 명령이 실행됩니다'
  }
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
let isExecutingRequest = false
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
    errorMessage.value =
      error instanceof Error ? error.message : '카메라 권한을 확인할 수 없습니다.'
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
  if (canvas && context) {
    context.clearRect(0, 0, canvas.width, canvas.height)
  }
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
    const touchFrame = getTwoHandTouchFrame(
      result.landmarks,
      result.handednesses,
      now,
    )
    const recognitionResult = reduceRecognitionFrame(
      recognitionContext,
      touchFrame,
      now,
    )

    const activeContact =
      recognitionResult.context.activeTouch ?? touchFrame.closestContact
    const successContact = getSuccessTouchContact(
      recognitionResult.executionCandidate ? activeContact : null,
      now,
    )
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
    drawFingerTips(
      context,
      canvas.width,
      canvas.height,
      touchFrame,
      activeContact,
      successContact,
    )

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
  if (canvas.width === video.videoWidth && canvas.height === video.videoHeight) {
    return
  }

  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
}

function getSuccessTouchContact(contact: TouchContact | null, now: number) {
  if (contact) {
    successfulTouchContact = contact
    successfulTouchUntil = now + TOUCH_SUCCESS_HIGHLIGHT_MS
    return contact
  }

  if (successfulTouchContact && successfulTouchUntil > now) {
    return successfulTouchContact
  }

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

  for (const tip of frame.leftTips) {
    drawFingerTip(
      context,
      tip,
      'left',
      width,
      height,
      activeContact,
      successContact,
    )
  }

  for (const tip of frame.rightTips) {
    drawFingerTip(
      context,
      tip,
      'right',
      width,
      height,
      activeContact,
      successContact,
    )
  }

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
        (activeContact.primaryFinger === tip.finger ||
          activeContact.secondaryFinger === tip.finger)
  const isSuccess =
    successContact?.contactType === 'two_hand'
      ? hand === 'left'
        ? successContact.leftFinger === tip.finger
        : successContact.rightFinger === tip.finger
      : successContact?.hand === (hand === 'left' ? 'Left' : 'Right') &&
        (successContact.primaryFinger === tip.finger ||
          successContact.secondaryFinger === tip.finger)
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

  if (hand === 'left') {
    drawSquareTip(context, x, y, radius)
  } else {
    drawTriangleTip(context, x, y, radius)
  }

  context.fill()
  context.stroke()
  context.restore()
}

function drawSquareTip(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
) {
  const size = radius * 2.3

  context.beginPath()
  context.rect(x - size / 2, y - size / 2, size, size)
}

function drawTriangleTip(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
) {
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
  context.arc(
    centerX,
    centerY,
    ringRadius,
    -Math.PI / 2,
    -Math.PI / 2 + Math.PI * 2 * progress,
  )
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
  currentCandidateLabel.value = recognitionContext.candidate
    ? `${recognitionContext.candidate.gestureLabel} / ${recognitionContext.candidate.label}`
    : '없음'
  currentTouchLabel.value = recognitionContext.activeTouch
    ? `${getTouchLabel(recognitionContext.activeTouch)}`
    : frame.closestContact
      ? getTouchLabel(frame.closestContact)
      : '없음'
  currentTouchGesture.value =
    recognitionContext.activeTouch?.gesture ?? frame.closestContact?.gesture ?? ''
  touchProgressPercent.value = Math.round(recognitionContext.touchProgress * 100)
  touchDistanceText.value =
    recognitionContext.activeTouch || frame.closestContact
      ? `${(
          recognitionContext.activeTouch ?? frame.closestContact
        )?.normalizedDistance.toFixed(2)}`
      : '없음'
  cooldownRemainingMs.value = Math.max(0, recognitionContext.cooldownUntil - now)

  if (recognitionContext.errorMessage) {
    errorMessage.value = recognitionContext.errorMessage
  } else if (errorMessage.value && recognitionContext.state !== 'error') {
    errorMessage.value = ''
  }
}

function getTouchLabel(contact: TouchContact) {
  const command = touchGestureCommands.find((item) => item.gesture === contact.gesture)

  return command?.gestureLabel ?? contact.gesture
}

function getPoseWarning(frame: TwoHandTouchFrame) {
  const blockedPose = [frame.leftPoseQuality, frame.rightPoseQuality].find((quality) => {
    return quality && !quality.isAcceptable
  })

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

  if (gestureCompletionTimer) {
    clearTimeout(gestureCompletionTimer)
  }

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
  if (isExecutingRequest) return

  isExecutingRequest = true
  commandResultMessage.value = `${candidate.label} 요청 중`

  try {
    const response = await $fetch<OpenAppResponse>('/api/apps/open', {
      method: 'POST',
      body: {
        app: candidate.app,
        source: 'gesture',
        gesture: candidate.gesture,
        clientRequestId: `${candidate.gesture}-${candidate.app}-${Math.round(
          candidate.detectedAt,
        )}`,
      },
    })
    const now = performance.now()

    if (response.success) {
      recognitionContext = markExecutionSuccess(recognitionContext, now)
      commandResultMessage.value = `${candidate.label} 완료`
    } else {
      recognitionContext = markExecutionFailure(
        recognitionContext,
        now,
        response.message,
      )
      commandResultMessage.value = `${candidate.label} 실패`
    }

    recognitionState.value = recognitionContext.state
    cooldownRemainingMs.value = Math.max(0, recognitionContext.cooldownUntil - now)
  } catch (error) {
    const now = performance.now()
    const message =
      error instanceof Error ? error.message : '앱 실행 요청에 실패했습니다.'

    recognitionContext = markExecutionFailure(recognitionContext, now, message)
    commandResultMessage.value = `${candidate.label} 실패`
    recognitionState.value = recognitionContext.state
    cooldownRemainingMs.value = Math.max(0, recognitionContext.cooldownUntil - now)
    errorMessage.value = message
  } finally {
    isExecutingRequest = false
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
  <UApp>
    <main
      class="box-border grid min-h-svh grid-rows-[minmax(0,1fr)_auto] gap-3 bg-muted p-2 text-default md:p-3">
      <Transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="-translate-y-2 opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="-translate-y-2 opacity-0">
        <UAlert
          v-if="gestureCompletionNotice"
          color="success"
          variant="subtle"
          icon="i-lucide-check-circle"
          title="접촉 명령 완료"
          :description="gestureCompletionNotice"
          class="fixed left-1/2 top-4 z-50 w-[min(calc(100vw_-_24px),420px)] -translate-x-1/2 shadow-xl backdrop-blur"
          role="status"
          aria-live="polite"
          :ui="{ title: 'font-black', description: 'truncate font-bold' }" />
      </Transition>

      <UContainer class="w-full self-center justify-self-center px-0 sm:px-0 lg:px-0">
        <UCard
          variant="subtle"
          class="overflow-hidden"
          :ui="{ body: 'p-0 sm:p-0' }">
          <div class="relative aspect-video w-full overflow-hidden bg-inverted">
            <video
              ref="videoRef"
              muted
              playsinline
              class="block size-full scale-x-[-1] object-cover" />
            <canvas
              ref="canvasRef"
              class="pointer-events-none absolute inset-0 block size-full scale-x-[-1]" />

            <section
              class="pointer-events-none absolute top-3 inset-x-3 z-10 grid w-auto max-w-[calc(100%-1.5rem)] grid-cols-2 overflow-hidden rounded-lg border border-default bg-default/70 shadow-lg backdrop-blur-md sm:grid-cols-3 lg:grid-cols-6"
              aria-label="양손 손가락 접촉 명령 인식 상태">
              <div class="min-w-0 border-b border-default px-2 py-1.5 sm:border-r lg:border-b-0">
                <div class="mb-0.5 text-[10px] font-bold uppercase text-muted">
                  상태
                </div>
                <UBadge
                  :color="statusColor"
                  variant="subtle"
                  size="sm"
                  :label="trackingStatus"
                  class="max-w-full" />
              </div>
              <div class="min-w-0 border-b border-default px-2 py-1.5 sm:border-r lg:border-b-0">
                <div class="mb-0.5 text-[10px] font-bold uppercase text-muted">
                  가까운 접촉
                </div>
                <div class="flex min-w-0 items-center gap-1.5">
                  <span class="min-w-0 truncate text-xs font-semibold text-highlighted">
                    {{ currentTouchLabel }}
                  </span>
                  <UBadge
                    v-if="activeTouchCommand"
                    color="warning"
                    variant="soft"
                    size="xs"
                    :label="getAppShortLabel(activeTouchCommand.label)"
                    class="shrink-0" />
                </div>
              </div>
              <div class="min-w-0 border-b border-default px-2 py-1.5 sm:border-r lg:border-b-0">
                <div class="mb-0.5 text-[10px] font-bold uppercase text-muted">
                  실행 후보
                </div>
                <div class="truncate text-xs font-semibold text-highlighted">
                  {{ currentCandidateLabel }}
                </div>
              </div>
              <div class="min-w-0 border-b border-default px-2 py-1.5 sm:border-r sm:border-b-0">
                <div class="mb-0.5 text-[10px] font-bold uppercase text-muted">
                  유지
                </div>
                <div class="flex items-center gap-1.5">
                  <UProgress
                    :model-value="touchProgressPercent"
                    :color="isRecognitionOnHold ? 'warning' : 'primary'"
                    size="sm"
                    class="min-w-0 flex-1" />
                  <span class="shrink-0 text-xs font-semibold text-highlighted">
                    {{ touchProgressPercent }}%
                  </span>
                </div>
              </div>
              <div class="min-w-0 border-r border-default px-2 py-1.5">
                <div class="mb-0.5 text-[10px] font-bold uppercase text-muted">
                  거리
                </div>
                <div class="truncate text-xs font-semibold text-highlighted">
                  {{ touchDistanceText }}
                </div>
              </div>
              <div class="min-w-0 px-2 py-1.5">
                <div class="mb-0.5 text-[10px] font-bold uppercase text-muted">
                  쿨다운
                </div>
                <div class="truncate text-xs font-semibold text-highlighted">
                  {{ cooldownSeconds > 0 ? `${cooldownSeconds}초` : '없음' }}
                </div>
              </div>
            </section>

            <UAlert
              :color="statusColor"
              variant="subtle"
              :icon="
                isRecognitionOnHold
                  ? 'i-lucide-triangle-alert'
                  : 'i-lucide-hand'
              "
              class="pointer-events-none absolute bottom-3 inset-x-3 w-auto max-w-[calc(100%-1.5rem)] shadow-lg backdrop-blur-sm"
              :title="trackingStatus"
              :description="phaseGuideText"
              aria-label="인식 단계"
              :ui="{
                root: 'items-center gap-2 overflow-hidden px-3 py-2.5',
                wrapper: 'min-w-0 overflow-hidden',
                title: 'truncate text-xs font-black',
                description: 'truncate text-xs font-semibold',
                icon: 'shrink-0',
              }" />
          </div>

          <section class="space-y-3 p-2">
            <section aria-label="양손 접촉 명령 25개">
              <div
                class="grid grid-cols-[56px_repeat(5,minmax(0,1fr))] gap-1 text-xs font-semibold">
                <div
                  class="grid h-12 place-items-center rounded-md bg-elevated text-[10px] font-black text-muted ring ring-default">
                  L/R
                </div>
                <div
                  v-for="rightFinger in fingerDefinitions"
                  :key="rightFinger.name"
                  class="grid h-12 place-items-center rounded-md bg-primary/10 px-1 text-center ring ring-primary/25">
                  <svg class="size-4" viewBox="0 0 16 16" aria-hidden="true">
                    <path
                      d="M8 1.5 15 14.5H1z"
                      :fill="getFingerColor(rightFinger.name)" />
                  </svg>
                  <div class="text-[11px] font-black leading-none text-highlighted">
                    {{ rightFinger.label }}
                  </div>
                </div>

                <template
                  v-for="row in touchGestureRows"
                  :key="row.leftFinger.name">
                  <div
                    class="grid h-14 place-items-center rounded-md bg-secondary/10 px-1 text-center ring ring-secondary/25">
                    <span
                      class="size-3.5 rounded-sm"
                      :style="{ backgroundColor: getFingerColor(row.leftFinger.name) }" />
                    <div class="text-[11px] font-black leading-none text-highlighted">
                      {{ row.leftFinger.label }}
                    </div>
                  </div>
                  <div
                    v-for="command in row.commands"
                    :key="command.gesture"
                    class="grid h-14 min-w-0 rounded-md px-1.5 py-1 transition"
                    :class="command.gesture === currentTouchGesture
                      ? 'bg-warning/10 text-warning ring-2 ring-warning/60'
                      : 'bg-elevated/70 text-default ring ring-default hover:bg-accented'"
                    :title="`${command.gestureLabel} / ${command.label}`">
                    <div class="flex min-w-0 items-center justify-center gap-1">
                      <span
                        class="size-3 rounded-sm"
                        :style="{ backgroundColor: getFingerColor(command.leftFinger) }" />
                      <span class="text-[11px] font-black leading-none text-muted">
                        +
                      </span>
                      <svg class="size-3.5 shrink-0" viewBox="0 0 16 16" aria-hidden="true">
                        <path
                          d="M8 1.5 15 14.5H1z"
                          :fill="getFingerColor(command.rightFinger)" />
                      </svg>
                      <span class="ml-0.5 truncate text-[11px] font-black leading-none">
                        {{ command.mark }}
                      </span>
                    </div>
                    <div class="mt-1 truncate text-center text-[10px] font-bold leading-none text-toned">
                      {{ getAppShortLabel(command.label) }}
                    </div>
                  </div>
                </template>
              </div>
            </section>

            <section
              class="grid gap-2 lg:grid-cols-2"
              aria-label="한 손 엄지 접촉">
              <UCard
                v-for="group in oneHandGestureGroups"
                :key="group.hand"
                variant="subtle"
                :ui="{ header: 'px-2.5 py-2 sm:px-2.5', body: 'px-2.5 py-2 sm:px-2.5' }"
                :class="group.hand === 'Left'
                  ? 'ring-secondary/35'
                  : 'ring-primary/35'">
                <template #header>
                  <div class="flex items-center justify-between gap-2">
                    <div class="flex min-w-0 items-center gap-2">
                      <span
                        v-if="group.hand === 'Left'"
                        class="size-4 rounded-sm bg-secondary ring-2 ring-secondary/20" />
                      <svg
                        v-else
                        class="size-5 shrink-0 drop-shadow"
                        viewBox="0 0 16 16"
                        aria-hidden="true">
                        <path d="M8 1.5 15 14.5H1z" fill="var(--ui-primary)" />
                      </svg>
                      <div class="min-w-0">
                        <div class="truncate text-sm font-black text-highlighted">
                          {{ group.label }} 한손 접촉
                        </div>
                        <div class="text-[10px] font-bold text-muted">
                          {{ group.shapeLabel }} 표시
                        </div>
                      </div>
                    </div>
                    <UBadge
                      :color="group.hand === 'Left' ? 'secondary' : 'primary'"
                      variant="soft"
                      size="sm"
                      :label="group.label" />
                  </div>
                </template>

                <div class="grid gap-1.5">
                  <div
                    v-for="command in group.commands"
                    :key="command.gesture"
                    class="rounded-md px-2 py-1.5 transition"
                    :class="command.gesture === currentTouchGesture
                      ? 'bg-warning/10 text-warning ring-2 ring-warning/60'
                      : 'bg-default text-default ring ring-default'"
                    :title="`${command.gestureLabel} / ${command.label}`">
                    <div class="flex min-w-0 items-center justify-between gap-2">
                      <div class="flex min-w-0 items-center gap-1.5">
                        <template v-if="group.hand === 'Left'">
                          <span
                            class="size-3 rounded-sm"
                            :style="{ backgroundColor: getFingerColor(command.primaryFinger) }" />
                          <span class="text-[11px] font-black text-muted">
                            +
                          </span>
                          <span
                            class="size-3 rounded-sm"
                            :style="{ backgroundColor: getFingerColor(command.secondaryFinger) }" />
                        </template>
                        <template v-else>
                          <svg class="size-3.5 shrink-0" viewBox="0 0 16 16" aria-hidden="true">
                            <path
                              d="M8 1.5 15 14.5H1z"
                              :fill="getFingerColor(command.primaryFinger)" />
                          </svg>
                          <span class="text-[11px] font-black text-muted">
                            +
                          </span>
                          <svg class="size-3.5 shrink-0" viewBox="0 0 16 16" aria-hidden="true">
                            <path
                              d="M8 1.5 15 14.5H1z"
                              :fill="getFingerColor(command.secondaryFinger)" />
                          </svg>
                        </template>
                        <span class="truncate text-xs font-black">
                          {{ command.gestureLabel }}
                        </span>
                      </div>
                      <UBadge
                        color="neutral"
                        variant="soft"
                        size="xs"
                        :label="getAppShortLabel(command.label)"
                        class="shrink-0" />
                    </div>
                  </div>
                </div>
              </UCard>
            </section>

            <div class="sr-only">
              <ul>
                <li
                  v-for="command in supportedGestureItems"
                  :key="command.gesture">
                  {{ command.gestureLabel }}: {{ command.label }}
                </li>
              </ul>
            </div>
          </section>
        </UCard>
      </UContainer>

      <div class="flex min-h-11 flex-wrap items-center justify-center gap-3">
        <UButton
          v-if="!isCameraActive"
          type="button"
          color="primary"
          size="lg"
          icon="i-lucide-video"
          label="시작"
          @click="startCamera" />
        <UButton
          v-else
          type="button"
          color="neutral"
          variant="outline"
          size="lg"
          icon="i-lucide-square"
          label="정지"
          @click="stopCamera" />

        <UBadge
          v-if="commandResultMessage"
          color="success"
          variant="subtle"
          size="lg"
          :label="commandResultMessage"
          class="max-w-[min(100%,640px)]" />
        <UBadge
          v-if="errorMessage"
          color="warning"
          variant="subtle"
          size="lg"
          :label="errorMessage"
          class="max-w-[min(100%,640px)]" />
      </div>
    </main>
  </UApp>
</template>
