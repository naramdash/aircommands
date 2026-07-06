<script setup lang="ts">
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { getRightHandIndex } from './utils/gesture_command_detection/coordinates'
import {
  appendTrailPoint,
  pruneTrail,
  RENDER_TRAIL_MS,
} from './utils/gesture_command_detection/pointer_trail'
import {
  createRecognitionContext,
  markExecutionFailure,
  markExecutionSuccess,
  reduceRecognitionFrame,
} from './utils/gesture_command_detection/recognition_reducer'
import type {
  GestureCandidate,
  HandednessCategory,
  PointerTrailPoint,
  RecognitionState,
} from './utils/gesture_command_detection/types'
import { gestureCommands } from './utils/gesture_command_detection/command_map'
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

const POINTER_RADIUS = 3.5
const POINTER_LINE_WIDTH = 2
const POINTER_COLOR = '34, 197, 94'
const RECOGNIZED_STROKE_RADIUS = 4.5
const RECOGNIZED_STROKE_LINE_WIDTH = 5
const RECOGNIZED_STROKE_COLOR = '250, 204, 21'

const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const errorMessage = ref('')
const isCameraActive = ref(false)
const isRightIndexVisible = ref(false)
const trailPointCount = ref(0)
const recognitionState = ref<RecognitionState>('tracking')
const currentCandidateLabel = ref('없음')
const confirmationPercent = ref(0)
const cooldownRemainingMs = ref(0)
const commandResultMessage = ref('')
const strokeStartPercent = ref(0)
const strokeCapturePointCount = ref(0)
const strokeEndReasonText = ref('없음')
const gestureCompletionNotice = ref('')
const trackingStatus = computed(() => {
  if (!isCameraActive.value) return '카메라 대기'
  if (!isRightIndexVisible.value) return '오른손 대기'

  if (recognitionState.value === 'ready_to_start') return '시작 가능'
  if (recognitionState.value === 'drawing') return '입력 중'
  if (recognitionState.value === 'stroke_ended') return '종료 감지'
  if (recognitionState.value === 'candidate') return '실행 준비'
  if (recognitionState.value === 'confirming') return '확인 중'
  if (recognitionState.value === 'executing') return '실행 중'
  if (recognitionState.value === 'cooldown') return '쿨다운'
  if (recognitionState.value === 'error') return '오류'

  return '추적 중'
})
const cooldownSeconds = computed(() =>
  Math.ceil(cooldownRemainingMs.value / 1000),
)
const supportedGestureItems = computed(() => Object.values(gestureCommands))
const phaseGuideText = computed(() => {
  if (!isCameraActive.value) return '카메라를 시작하세요'
  if (!isRightIndexVisible.value) return '오른손 검지를 화면에 보여주세요'
  if (recognitionState.value === 'ready_to_start') {
    return '검지를 움직이면 인식이 시작됩니다'
  }
  if (recognitionState.value === 'drawing') {
    return '제스처를 그리고 잠깐 멈추면 종료됩니다'
  }
  if (recognitionState.value === 'stroke_ended') {
    return '입력이 끝났습니다. 경로를 판정 중입니다'
  }
  if (recognitionState.value === 'candidate') {
    return '멈춘 상태로 유지하면 명령이 확정됩니다'
  }
  if (recognitionState.value === 'confirming') {
    return '확정 중입니다'
  }
  if (recognitionState.value === 'executing') return '명령 실행 중입니다'
  if (recognitionState.value === 'cooldown') return '다음 입력을 잠시 대기합니다'
  if (recognitionState.value === 'error') return '오류 상태입니다'

  return '검지 위치를 추적 중입니다'
})

let mediaStream: MediaStream | null = null
let animationFrameId = 0
let pointerTrail: PointerTrailPoint[] = []
let recognizedGesturePoints: PointerTrailPoint[] = []
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
    drawPointerFrame()
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
  clearPointerTrail()
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

function drawPointerFrame() {
  const video = videoRef.value
  const canvas = canvasRef.value
  const context = canvas?.getContext('2d')

  if (!video || !canvas || !context) return

  if (video.videoWidth > 0 && video.videoHeight > 0) {
    syncCanvasSize(canvas, video)

    const now = performance.now()
    const result = handLandmarker.detectForVideo(video, now)

    context.clearRect(0, 0, canvas.width, canvas.height)

    const rightHandVisible = updatePointerTrail(
      result.landmarks,
      result.handednesses,
      now,
    )
    const previousRecognitionContext = recognitionContext
    const recognitionResult = reduceRecognitionFrame(
      recognitionContext,
      pointerTrail,
      now,
      rightHandVisible,
    )

    updateRecognizedGesturePreview(
      previousRecognitionContext,
      recognitionResult.context,
    )
    recognitionContext = recognitionResult.context
    syncRecognitionDisplay(now)

    if (recognitionResult.executionCandidate) {
      void executeCandidate(recognitionResult.executionCandidate)
    }

    drawPointerTrail(context, canvas.width, canvas.height, now)
    drawRecognizedGestureStroke(context, canvas.width, canvas.height)
    drawStrokeGuides(context, canvas.width, canvas.height)
    drawConfirmationRing(context, canvas.width, canvas.height)
  }

  animationFrameId = requestAnimationFrame(drawPointerFrame)
}

function syncCanvasSize(canvas: HTMLCanvasElement, video: HTMLVideoElement) {
  if (canvas.width === video.videoWidth && canvas.height === video.videoHeight) {
    return
  }

  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
}

function updatePointerTrail(
  hands: NormalizedLandmark[][],
  handednesses: HandednessCategory[][] = [],
  at: number,
) {
  const rightHandIndex = getRightHandIndex(handednesses)

  if (rightHandIndex === -1) {
    isRightIndexVisible.value = false
    prunePointerTrail(at)
    return false
  }

  const indexTip = hands[rightHandIndex]?.[8]
  if (!indexTip) {
    isRightIndexVisible.value = false
    prunePointerTrail(at)
    return false
  }

  pointerTrail = appendTrailPoint(pointerTrail, {
    x: indexTip.x,
    y: indexTip.y,
    at,
  })

  isRightIndexVisible.value = true
  prunePointerTrail(at)
  return true
}

function prunePointerTrail(at: number) {
  pointerTrail = pruneTrail(pointerTrail, at, RENDER_TRAIL_MS)
  trailPointCount.value = pointerTrail.length
}

function drawPointerTrail(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  at: number,
) {
  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.shadowColor = 'rgba(34, 197, 94, 0.35)'
  context.shadowBlur = 5

  for (let index = 1; index < pointerTrail.length; index += 1) {
    const previousPoint = pointerTrail[index - 1]
    const point = pointerTrail[index]
    const ageRatio = Math.min(1, Math.max(0, (at - point.at) / RENDER_TRAIL_MS))
    const alpha = Math.max(0.16, 1 - ageRatio)

    context.strokeStyle = `rgba(${POINTER_COLOR}, ${alpha})`
    context.lineWidth = POINTER_LINE_WIDTH
    context.beginPath()
    context.moveTo(previousPoint.x * width, previousPoint.y * height)
    context.lineTo(point.x * width, point.y * height)
    context.stroke()
  }

  for (const point of pointerTrail) {
    const ageRatio = Math.min(1, Math.max(0, (at - point.at) / RENDER_TRAIL_MS))
    const alpha = Math.max(0.18, 1 - ageRatio)
    const radius = POINTER_RADIUS * (0.7 + (1 - ageRatio) * 0.25)

    context.fillStyle = `rgba(${POINTER_COLOR}, ${alpha})`
    context.beginPath()
    context.arc(point.x * width, point.y * height, radius, 0, Math.PI * 2)
    context.fill()
  }

  context.restore()
}

function drawRecognizedGestureStroke(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  if (recognizedGesturePoints.length < 2) return

  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.shadowColor = `rgba(${RECOGNIZED_STROKE_COLOR}, 0.45)`
  context.shadowBlur = 8
  context.strokeStyle = `rgba(${RECOGNIZED_STROKE_COLOR}, 0.96)`
  context.lineWidth = RECOGNIZED_STROKE_LINE_WIDTH
  context.beginPath()
  context.moveTo(
    recognizedGesturePoints[0].x * width,
    recognizedGesturePoints[0].y * height,
  )

  for (let index = 1; index < recognizedGesturePoints.length; index += 1) {
    const point = recognizedGesturePoints[index]
    context.lineTo(point.x * width, point.y * height)
  }

  context.stroke()

  context.fillStyle = `rgba(${RECOGNIZED_STROKE_COLOR}, 1)`
  for (const point of recognizedGesturePoints) {
    context.beginPath()
    context.arc(
      point.x * width,
      point.y * height,
      RECOGNIZED_STROKE_RADIUS,
      0,
      Math.PI * 2,
    )
    context.fill()
  }

  context.restore()
}

function drawStrokeGuides(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const strokePoints =
    recognitionContext.state === 'stroke_ended'
      ? recognitionContext.completedStrokePoints
      : recognitionContext.strokePoints
  const startPoint = recognitionContext.strokeAnchor ?? strokePoints[0]
  const endPoint = strokePoints[strokePoints.length - 1]

  context.save()
  context.lineCap = 'round'

  if (recognitionContext.state === 'ready_to_start' && startPoint) {
    const x = startPoint.x * width
    const y = startPoint.y * height
    const radius = 20

    context.lineWidth = 3
    context.strokeStyle = 'rgba(56, 189, 248, 0.35)'
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.stroke()

    context.strokeStyle = 'rgba(56, 189, 248, 0.95)'
    context.beginPath()
    context.arc(
      x,
      y,
      radius,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * recognitionContext.strokeStartProgress,
    )
    context.stroke()
  }

  if (strokePoints.length > 1 && startPoint && endPoint) {
    drawGuidePoint(context, startPoint.x * width, startPoint.y * height, '#38bdf8')
    drawGuidePoint(context, endPoint.x * width, endPoint.y * height, '#facc15')
  }

  context.restore()
}

function drawGuidePoint(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
) {
  context.fillStyle = color
  context.strokeStyle = 'rgba(15, 23, 42, 0.85)'
  context.lineWidth = 3
  context.beginPath()
  context.arc(x, y, 7, 0, Math.PI * 2)
  context.fill()
  context.stroke()
}

function drawConfirmationRing(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const point = pointerTrail[pointerTrail.length - 1]

  if (!point || recognitionContext.confirmationProgress <= 0) return

  const x = point.x * width
  const y = point.y * height
  const radius = 18

  context.save()
  context.lineWidth = 3
  context.strokeStyle = 'rgba(34, 197, 94, 0.25)'
  context.beginPath()
  context.arc(x, y, radius, 0, Math.PI * 2)
  context.stroke()

  context.strokeStyle = 'rgba(34, 197, 94, 0.95)'
  context.beginPath()
  context.arc(
    x,
    y,
    radius,
    -Math.PI / 2,
    -Math.PI / 2 + Math.PI * 2 * recognitionContext.confirmationProgress,
  )
  context.stroke()
  context.restore()
}

function clearPointerTrail() {
  pointerTrail = []
  recognizedGesturePoints = []
  trailPointCount.value = 0
  isRightIndexVisible.value = false
}

function resetRecognition() {
  recognitionContext = createRecognitionContext()
  recognizedGesturePoints = []
  recognitionState.value = recognitionContext.state
  currentCandidateLabel.value = '없음'
  confirmationPercent.value = 0
  cooldownRemainingMs.value = 0
  commandResultMessage.value = ''
  strokeStartPercent.value = 0
  strokeCapturePointCount.value = 0
  strokeEndReasonText.value = '없음'
  clearGestureCompletionNotice()
}

function updateRecognizedGesturePreview(
  previousContext: typeof recognitionContext,
  nextContext: typeof recognitionContext,
) {
  if (
    previousContext.state === 'stroke_ended' &&
    nextContext.state === 'candidate' &&
    nextContext.candidate
  ) {
    const candidate = nextContext.candidate
    const matchedPoints = previousContext.completedStrokePoints.filter((point) => {
      return (
        point.at >= candidate.gestureStartedAt &&
        point.at <= candidate.gestureEndedAt
      )
    })

    recognizedGesturePoints =
      matchedPoints.length >= 2
        ? matchedPoints
        : [...previousContext.completedStrokePoints]
    return
  }

  if (
    nextContext.state === 'tracking' ||
    nextContext.state === 'ready_to_start' ||
    nextContext.state === 'drawing' ||
    nextContext.state === 'cooldown' ||
    nextContext.state === 'error'
  ) {
    recognizedGesturePoints = []
  }
}

function syncRecognitionDisplay(now: number) {
  const previousCandidateKey =
    recognitionState.value === 'candidate'
      ? recognitionContext.candidate?.gesture
      : null

  recognitionState.value = recognitionContext.state
  currentCandidateLabel.value = recognitionContext.candidate
    ? `${recognitionContext.candidate.gestureLabel} / ${recognitionContext.candidate.label}`
    : '없음'
  confirmationPercent.value = Math.round(
    recognitionContext.confirmationProgress * 100,
  )
  cooldownRemainingMs.value = Math.max(0, recognitionContext.cooldownUntil - now)
  strokeStartPercent.value = Math.round(
    recognitionContext.strokeStartProgress * 100,
  )
  strokeCapturePointCount.value =
    recognitionContext.state === 'stroke_ended'
      ? recognitionContext.completedStrokePoints.length
      : recognitionContext.strokePoints.length
  strokeEndReasonText.value =
    recognitionContext.strokeEndReason === 'idle'
      ? '정지 종료'
      : recognitionContext.strokeEndReason === 'timeout'
        ? '시간 종료'
        : '없음'

  const currentCandidate = recognitionContext.candidate
  if (
    recognitionContext.state === 'candidate' &&
    currentCandidate &&
    previousCandidateKey !== currentCandidate.gesture
  ) {
    showGestureCompletionNotice(currentCandidate)
  }

  if (recognitionContext.errorMessage) {
    errorMessage.value = recognitionContext.errorMessage
  } else if (errorMessage.value && recognitionContext.state !== 'error') {
    errorMessage.value = ''
  }
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

    syncRecognitionDisplay(now)
  } catch (error) {
    const now = performance.now()
    const message =
      error instanceof Error ? error.message : '앱 실행 요청에 실패했습니다.'

    recognitionContext = markExecutionFailure(recognitionContext, now, message)
    commandResultMessage.value = `${candidate.label} 실패`
    syncRecognitionDisplay(now)
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
        class="fixed left-1/2 top-4 z-50 w-[min(calc(100vw_-_24px),360px)] -translate-x-1/2 rounded-md border border-emerald-300 bg-slate-950/95 px-4 py-3 text-center shadow-xl shadow-emerald-950/40 backdrop-blur"
        role="status"
        aria-live="polite">
        <div class="text-[11px] font-bold uppercase text-emerald-300">
          제스처 완료
        </div>
        <div class="mt-1 truncate text-sm font-black text-slate-50">
          {{ gestureCompletionNotice }}
        </div>
      </div>
    </Transition>

    <div class="w-full max-w-[960px] self-center justify-self-center">
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
          class="pointer-events-none absolute bottom-3 left-3 right-3 rounded-md border border-slate-700/70 bg-slate-950/82 px-3 py-2 shadow-lg backdrop-blur-sm"
          aria-label="인식 단계">
          <div class="flex flex-wrap items-center gap-2">
            <span
              class="rounded bg-emerald-400 px-2 py-1 text-xs font-black text-slate-950">
              {{ trackingStatus }}
            </span>
            <span class="min-w-0 truncate text-xs font-semibold text-slate-100">
              {{ phaseGuideText }}
            </span>
          </div>
        </section>
      </div>

      <dl
        class="m-0 grid grid-cols-2 overflow-hidden border-x border-b border-slate-800 bg-slate-900 md:grid-cols-7"
        aria-label="손가락 명령 인식 상태">
        <div class="min-w-0 px-3 py-2.5">
          <dt class="mb-1.5 text-[11px] font-bold uppercase text-slate-400">
            상태
          </dt>
          <dd class="m-0 truncate text-sm font-semibold leading-tight">
            {{ trackingStatus }}
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
            확인
          </dt>
          <dd class="m-0 truncate text-sm font-semibold leading-tight">
            {{ confirmationPercent }}%
          </dd>
        </div>
        <div class="min-w-0 px-3 py-2.5">
          <dt class="mb-1.5 text-[11px] font-bold uppercase text-slate-400">
            시작
          </dt>
          <dd class="m-0 truncate text-sm font-semibold leading-tight">
            {{ strokeStartPercent }}%
          </dd>
        </div>
        <div class="min-w-0 px-3 py-2.5">
          <dt class="mb-1.5 text-[11px] font-bold uppercase text-slate-400">
            입력점
          </dt>
          <dd class="m-0 truncate text-sm font-semibold leading-tight">
            {{ strokeCapturePointCount }}
          </dd>
        </div>
        <div class="min-w-0 px-3 py-2.5">
          <dt class="mb-1.5 text-[11px] font-bold uppercase text-slate-400">
            종료
          </dt>
          <dd class="m-0 truncate text-sm font-semibold leading-tight">
            {{ strokeEndReasonText }}
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
        class="rounded-b-lg border-x border-b border-slate-800 bg-slate-950 px-3 py-2">
        <div class="mb-2 text-[11px] font-bold uppercase text-slate-500">
          지원 제스처
        </div>
        <div class="grid gap-2 text-xs font-semibold text-slate-300 md:grid-cols-4">
          <div
            v-for="command in supportedGestureItems"
            :key="command.gesture"
            class="rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5">
            <div class="flex items-center gap-2 text-slate-50">
              <span
                class="grid size-6 shrink-0 place-items-center rounded bg-emerald-400 text-base font-black leading-none text-slate-950">
                {{ command.mark }}
              </span>
              <span class="truncate">
                {{ command.gestureLabel }}
              </span>
            </div>
            <div class="mt-1 truncate pl-8 text-[11px] text-emerald-300">
              {{ command.label }}
            </div>
          </div>
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
