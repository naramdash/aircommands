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

    context.clearRect(0, 0, canvas.width, canvas.height)
    drawTouchContact(
      context,
      canvas.width,
      canvas.height,
      activeContact,
      recognitionResult.context.touchProgress,
    )
    drawFingerTips(context, canvas.width, canvas.height, touchFrame, activeContact)

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

function drawFingerTips(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: TwoHandTouchFrame,
  activeContact: TouchContact | null,
) {
  context.save()

  for (const tip of frame.leftTips) {
    drawFingerTip(context, tip, 'left', width, height, activeContact)
  }

  for (const tip of frame.rightTips) {
    drawFingerTip(context, tip, 'right', width, height, activeContact)
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
  const radius = isActive ? ACTIVE_FINGER_RADIUS : FINGER_RADIUS
  const color = FINGER_COLORS[tip.finger]

  if (isActive) {
    context.save()
    context.shadowColor = `rgba(${TOUCH_COLOR}, 0.55)`
    context.shadowBlur = 10
    context.strokeStyle = `rgba(${TOUCH_COLOR}, 1)`
    context.lineWidth = 4
    context.beginPath()
    context.arc(x, y, radius + 7, 0, Math.PI * 2)
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
) {
  if (!contact) return

  const leftX = contact.leftPoint.x * width
  const leftY = contact.leftPoint.y * height
  const rightX = contact.rightPoint.x * width
  const rightY = contact.rightPoint.y * height
  const centerX = contact.midpoint.x * width
  const centerY = contact.midpoint.y * height
  const ringRadius = 17

  context.save()
  context.lineCap = 'round'
  context.shadowColor = `rgba(${TOUCH_COLOR}, 0.45)`
  context.shadowBlur = 8
  context.strokeStyle = `rgba(${TOUCH_COLOR}, 0.96)`
  context.lineWidth = 4
  context.beginPath()
  context.moveTo(leftX, leftY)
  context.lineTo(rightX, rightY)
  context.stroke()

  context.strokeStyle = `rgba(${TOUCH_COLOR}, 0.28)`
  context.lineWidth = 3
  context.beginPath()
  context.arc(centerX, centerY, ringRadius, 0, Math.PI * 2)
  context.stroke()

  context.strokeStyle = `rgba(${TOUCH_COLOR}, 1)`
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
  <main
    class="grid min-h-svh grid-rows-[minmax(0,1fr)_auto] gap-4 box-border bg-slate-950 p-3 text-slate-50 md:p-6">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="-translate-y-2 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="-translate-y-2 opacity-0">
      <div
        v-if="gestureCompletionNotice"
        class="fixed left-1/2 top-4 z-50 w-[min(calc(100vw_-_24px),420px)] -translate-x-1/2 rounded-md border border-emerald-300 bg-slate-950/95 px-4 py-3 text-center shadow-xl shadow-emerald-950/40 backdrop-blur"
        role="status"
        aria-live="polite">
        <div class="text-[11px] font-bold uppercase text-emerald-300">
          접촉 명령 완료
        </div>
        <div class="mt-1 truncate text-sm font-black text-slate-50">
          {{ gestureCompletionNotice }}
        </div>
      </div>
    </Transition>

    <div class="w-full max-w-[1120px] self-center justify-self-center">
      <div
        class="relative aspect-video w-full overflow-hidden rounded-t-lg border border-slate-800 bg-neutral-950 max-md:rounded-t-md">
        <video
          ref="videoRef"
          muted
          playsinline
          class="block size-full scale-x-[-1] object-cover" />
        <canvas
          ref="canvasRef"
          class="pointer-events-none absolute inset-0 block size-full scale-x-[-1]" />
        <section
          class="pointer-events-none absolute bottom-3 left-3 right-3 rounded-md border px-3 py-2 shadow-lg backdrop-blur-sm transition-colors"
          :class="isRecognitionOnHold
            ? 'border-amber-300/75 bg-amber-950/82 shadow-amber-950/40'
            : 'border-slate-700/70 bg-slate-950/82'"
          aria-label="인식 단계">
          <div class="flex flex-wrap items-center gap-2">
            <span
              class="rounded px-2 py-1 text-xs font-black transition-colors"
              :class="isRecognitionOnHold
                ? 'bg-amber-300 text-amber-950'
                : 'bg-emerald-400 text-slate-950'">
              {{ trackingStatus }}
            </span>
            <span
              class="min-w-0 truncate text-xs font-semibold transition-colors"
              :class="isRecognitionOnHold ? 'text-amber-100' : 'text-slate-100'">
              {{ phaseGuideText }}
            </span>
          </div>
        </section>
      </div>

      <dl
        class="m-0 grid grid-cols-2 overflow-hidden border-x border-b transition-colors md:grid-cols-6"
        :class="isRecognitionOnHold
          ? 'border-amber-900/80 bg-amber-950/35'
          : 'border-slate-800 bg-slate-900'"
        aria-label="양손 손가락 접촉 명령 인식 상태">
        <div class="min-w-0 px-3 py-2.5">
          <dt class="mb-1.5 text-[11px] font-bold uppercase text-slate-400">
            상태
          </dt>
          <dd
            class="m-0 truncate text-sm font-semibold leading-tight"
            :class="isRecognitionOnHold ? 'text-amber-200' : 'text-slate-50'">
            {{ trackingStatus }}
          </dd>
        </div>
        <div class="min-w-0 px-3 py-2.5">
          <dt class="mb-1.5 text-[11px] font-bold uppercase text-slate-400">
            접촉
          </dt>
          <dd class="m-0 truncate text-sm font-semibold leading-tight">
            {{ currentTouchLabel }}
          </dd>
        </div>
        <div class="min-w-0 px-3 py-2.5">
          <dt class="mb-1.5 text-[11px] font-bold uppercase text-slate-400">
            후보
          </dt>
          <dd class="m-0 truncate text-sm font-semibold leading-tight">
            {{ currentCandidateLabel }}
          </dd>
        </div>
        <div class="min-w-0 px-3 py-2.5">
          <dt class="mb-1.5 text-[11px] font-bold uppercase text-slate-400">
            유지
          </dt>
          <dd class="m-0 truncate text-sm font-semibold leading-tight">
            {{ touchProgressPercent }}%
          </dd>
        </div>
        <div class="min-w-0 px-3 py-2.5">
          <dt class="mb-1.5 text-[11px] font-bold uppercase text-slate-400">
            거리
          </dt>
          <dd class="m-0 truncate text-sm font-semibold leading-tight">
            {{ touchDistanceText }}
          </dd>
        </div>
        <div class="min-w-0 px-3 py-2.5">
          <dt class="mb-1.5 text-[11px] font-bold uppercase text-slate-400">
            쿨다운
          </dt>
          <dd class="m-0 truncate text-sm font-semibold leading-tight">
            {{ cooldownSeconds > 0 ? `${cooldownSeconds}초` : '없음' }}
          </dd>
        </div>
      </dl>

      <div
        class="rounded-b-lg border-x border-b border-slate-800 bg-slate-950 px-3 py-3">
        <div class="mb-3 grid gap-3 lg:grid-cols-[1fr_280px]">
          <div class="min-w-0">
            <div class="text-[11px] font-bold uppercase text-slate-500">
              손가락 접촉 명령표
            </div>
            <div class="mt-1 text-xs font-semibold text-slate-300">
              칸에는 손가락 조합과 실행 앱만 표시합니다. 자세한 후보는 오른쪽 패널에서 확인하세요.
            </div>
            <div class="mt-3 flex flex-wrap gap-1.5">
              <span
                v-for="finger in fingerDefinitions"
                :key="finger.name"
                class="inline-flex h-6 items-center gap-1.5 rounded border border-slate-800 bg-slate-900 px-2 text-[11px] font-bold text-slate-200">
                <span
                  class="size-2.5 rounded-full"
                  :style="{ backgroundColor: getFingerColor(finger.name) }" />
                {{ finger.label }}
              </span>
            </div>
          </div>
          <div
            class="rounded-md border px-3 py-2"
            :class="activeTouchCommand
              ? 'border-yellow-300/60 bg-yellow-300/12'
              : 'border-slate-800 bg-slate-900'">
            <div class="text-[11px] font-bold uppercase text-slate-500">
              현재 후보
            </div>
            <div
              class="mt-1 truncate text-sm font-black"
              :class="activeTouchCommand ? 'text-yellow-100' : 'text-slate-400'">
              {{ activeTouchCommand?.gestureLabel ?? '없음' }}
            </div>
            <div
              class="mt-1 truncate text-xs font-semibold"
              :class="activeTouchCommand ? 'text-yellow-200' : 'text-slate-500'">
              {{ activeTouchCommand?.label ?? '손가락 접촉 대기' }}
            </div>
          </div>
        </div>

        <div aria-label="양손 접촉 명령 25개">
          <div
            class="grid grid-cols-[56px_repeat(5,minmax(0,1fr))] gap-1 text-xs font-semibold">
            <div
              class="grid h-12 place-items-center rounded border border-slate-800 bg-slate-900 text-[10px] font-black text-slate-500">
              L/R
            </div>
            <div
              v-for="rightFinger in fingerDefinitions"
              :key="rightFinger.name"
              class="grid h-12 place-items-center rounded border border-emerald-400/30 bg-emerald-400/10 px-1 text-center">
              <svg class="size-4" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M8 1.5 15 14.5H1z"
                  :fill="getFingerColor(rightFinger.name)" />
              </svg>
              <div class="text-[11px] font-black leading-none text-slate-50">
                {{ rightFinger.label }}
              </div>
            </div>
            <template
              v-for="row in touchGestureRows"
              :key="row.leftFinger.name">
              <div
                class="grid h-14 place-items-center rounded border border-sky-400/30 bg-sky-400/10 px-1 text-center">
                <span
                  class="size-3.5 rounded-sm"
                  :style="{ backgroundColor: getFingerColor(row.leftFinger.name) }" />
                <div class="text-[11px] font-black leading-none text-slate-50">
                  {{ row.leftFinger.label }}
                </div>
              </div>
              <div
                v-for="command in row.commands"
                :key="command.gesture"
                class="grid h-14 min-w-0 rounded border px-1.5 py-1 transition"
                :class="command.gesture === currentTouchGesture
                  ? 'border-yellow-300 bg-yellow-300/18 shadow-[0_0_0_1px_rgba(250,204,21,0.35)]'
                  : 'border-slate-800 bg-slate-900 hover:border-slate-700'"
                :title="`${command.gestureLabel} / ${command.label}`">
                <div class="flex min-w-0 items-center justify-center gap-1">
                  <span
                    class="size-3 rounded-sm"
                    :style="{ backgroundColor: getFingerColor(command.leftFinger) }" />
                  <span class="text-[11px] font-black leading-none text-slate-500">
                    +
                  </span>
                  <svg class="size-3.5 shrink-0" viewBox="0 0 16 16" aria-hidden="true">
                    <path
                      d="M8 1.5 15 14.5H1z"
                      :fill="getFingerColor(command.rightFinger)" />
                  </svg>
                  <span
                    class="ml-0.5 truncate text-[11px] font-black leading-none"
                    :class="command.gesture === currentTouchGesture
                      ? 'text-yellow-100'
                      : 'text-slate-100'">
                    {{ command.mark }}
                  </span>
                </div>
                <div
                  class="mt-1 truncate text-center text-[10px] font-bold leading-none"
                  :class="command.gesture === currentTouchGesture
                    ? 'text-yellow-200'
                    : 'text-slate-400'">
                  {{ getAppShortLabel(command.label) }}
                </div>
              </div>
            </template>
          </div>
        </div>
        <div class="mt-2 text-[11px] font-medium text-slate-500">
          네모는 왼손, 세모는 오른손입니다. 노란 칸은 현재 가장 가까운 접촉 후보입니다.
        </div>

        <div class="mt-4 border-t border-slate-800 pt-3">
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div class="text-[11px] font-bold uppercase text-slate-500">
              한 손 엄지 접촉
            </div>
            <span
              class="rounded border border-fuchsia-400/40 bg-fuchsia-400/12 px-2 py-1 text-[11px] font-semibold text-fuchsia-100">
              왼손/오른손 별도
            </span>
          </div>
          <div class="grid gap-3 lg:grid-cols-2">
            <div
              v-for="group in oneHandGestureGroups"
              :key="group.hand"
              class="rounded-md border px-2.5 py-2.5"
              :class="group.hand === 'Left'
                ? 'border-sky-400/35 bg-sky-400/8'
                : 'border-emerald-400/35 bg-emerald-400/8'">
              <div class="mb-2 flex items-center justify-between gap-2">
                <div class="flex min-w-0 items-center gap-2">
                  <span
                    v-if="group.hand === 'Left'"
                    class="size-4 rounded-sm bg-sky-300 shadow-[0_0_0_2px_rgba(125,211,252,0.18)]" />
                  <svg
                    v-else
                    class="size-5 shrink-0 drop-shadow"
                    viewBox="0 0 16 16"
                    aria-hidden="true">
                    <path d="M8 1.5 15 14.5H1z" fill="rgb(110, 231, 183)" />
                  </svg>
                  <div class="min-w-0">
                    <div class="truncate text-sm font-black text-slate-50">
                      {{ group.label }} 한손 접촉
                    </div>
                    <div class="text-[10px] font-bold text-slate-400">
                      {{ group.shapeLabel }} 표시
                    </div>
                  </div>
                </div>
                <span
                  class="rounded px-2 py-1 text-[10px] font-black"
                  :class="group.hand === 'Left'
                    ? 'bg-sky-300/15 text-sky-100'
                    : 'bg-emerald-300/15 text-emerald-100'">
                  {{ group.label }}
                </span>
              </div>

              <div class="grid gap-1.5">
                <div
                  v-for="command in group.commands"
                  :key="command.gesture"
                  class="rounded border px-2 py-2 transition"
                  :class="command.gesture === currentTouchGesture
                    ? 'border-yellow-300 bg-yellow-300/18 shadow-[0_0_0_1px_rgba(250,204,21,0.35)]'
                    : 'border-slate-800 bg-slate-900/88'"
                  :title="`${command.gestureLabel} / ${command.label}`">
                  <div class="flex min-w-0 items-center justify-between gap-2">
                    <div class="flex min-w-0 items-center gap-1.5">
                      <template v-if="group.hand === 'Left'">
                        <span
                          class="size-3 rounded-sm"
                          :style="{ backgroundColor: getFingerColor(command.primaryFinger) }" />
                        <span class="text-[11px] font-black text-slate-500">
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
                        <span class="text-[11px] font-black text-slate-500">
                          +
                        </span>
                        <svg class="size-3.5 shrink-0" viewBox="0 0 16 16" aria-hidden="true">
                          <path
                            d="M8 1.5 15 14.5H1z"
                            :fill="getFingerColor(command.secondaryFinger)" />
                        </svg>
                      </template>
                      <span
                        class="truncate text-xs font-black"
                        :class="command.gesture === currentTouchGesture
                          ? 'text-yellow-100'
                          : 'text-slate-50'">
                        {{ command.gestureLabel }}
                      </span>
                    </div>
                    <span
                      class="shrink-0 text-[10px] font-bold"
                      :class="command.gesture === currentTouchGesture
                        ? 'text-yellow-200'
                        : 'text-slate-400'">
                      {{ getAppShortLabel(command.label) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="sr-only">
          <ul>
            <li
              v-for="command in supportedGestureItems"
              :key="command.gesture">
              {{ command.gestureLabel }}: {{ command.label }}
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div class="flex min-h-11 flex-wrap items-center justify-center gap-3">
      <button
        v-if="!isCameraActive"
        type="button"
        class="h-10 min-w-22 cursor-pointer rounded-md border border-emerald-500 bg-emerald-500 px-4 text-[15px] font-semibold leading-none text-slate-950 hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
        @click="startCamera">
        시작
      </button>
      <button
        v-else
        type="button"
        class="h-10 min-w-22 cursor-pointer rounded-md border border-slate-700 bg-slate-900 px-4 text-[15px] font-semibold leading-none text-slate-50 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
        @click="stopCamera">
        정지
      </button>
      <p
        v-if="commandResultMessage"
        class="max-w-[min(100%,640px)] text-sm font-semibold text-emerald-300">
        {{ commandResultMessage }}
      </p>
      <p v-if="errorMessage" class="max-w-[min(100%,640px)] text-sm text-orange-300">
        {{ errorMessage }}
      </p>
    </div>
  </main>
</template>
