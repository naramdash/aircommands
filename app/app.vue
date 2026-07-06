<script setup lang="ts">
import { HandLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision'
import { useMachine } from '@xstate/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { handCommandSequences } from './utils/hand_command_sequences'
import type { HandCommandSequence } from './utils/hand_command_sequences'
import {
  classifyHandGesture,
  mirrorLandmarksHorizontally,
} from './utils/hand_gesture_detection'
import { handLandmarker } from './utils/hand_landmark_detection'
import {
  handSequenceStateMachine,
  type HandGestureName,
} from './utils/hand_sequence_state_machine'

type Handedness = 'Left' | 'Right' | 'Unknown'

type HandednessCategory = {
  categoryName?: string
  displayName?: string
}

type GestureSample = {
  gesture: HandGestureName
  at: number
}

type CompletionLogEntry = {
  id: string
  sequenceLabel: string
  gestures: HandGestureName[]
  completedAt: number
  completedCount: number
}

const GESTURE_WINDOW_MS = 160
const GESTURE_WINDOW_MIN_SAMPLES = 2
const GESTURE_WINDOW_MIN_RATIO = 0.6
const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const errorMessage = ref('')
const isCameraActive = ref(false)
const selectedSequenceIndex = ref(0)
const currentRecognizedGesture = ref<HandGestureName>('no_gesture')
const completionHistory = ref<CompletionLogEntry[]>([])
const completionToast = ref<CompletionLogEntry | null>(null)
const { snapshot: handSequenceSnapshot, send: sendHandSequenceEvent } =
  useMachine(handSequenceStateMachine, {
    input: {
      sequence: handCommandSequences[0]?.sequence,
    },
  })
const selectedCommandSequence = computed(() => {
  return handCommandSequences[selectedSequenceIndex.value] ?? handCommandSequences[0]
})
const gestureLabels: Record<string, string> = {
  gesture_fist: '주먹',
  gesture_open: '손 펴기',
  gesture_thumb_up: '엄지 위',
  gesture_thumb_down: '엄지 아래',
  gesture_thumb_left: '엄지 왼쪽',
  gesture_thumb_right: '엄지 오른쪽',
  gesture_thumb_only: '엄지만 펼침',
  gesture_index_point: '검지',
  gesture_middle_point: '중지',
  gesture_pinky_point: '새끼',
  gesture_peace: '브이',
  gesture_rock: '락',
  gesture_three: '세 손가락',
  no_gesture: '인식 없음',
}
const sequenceStateLabels: Record<string, string> = {
  no_gesture: '대기 중',
  start_gesture: '시작 동작 인식',
  sequence_gesture: '중간 동작 인식',
  end_gesture: '완료 동작 인식',
}
const completedBackgroundClasses = [
  'bg-red-600',
  'bg-orange-500',
  'bg-yellow-400',
  'bg-green-500',
  'bg-blue-600',
  'bg-indigo-700',
  'bg-violet-600',
]
const pageBackgroundClass = computed(() => {
  const completedCount = handSequenceSnapshot.value.context.completedCount

  if (completedCount <= 0) {
    return 'bg-slate-50 dark:bg-slate-900'
  }

  return completedBackgroundClasses[
    (completedCount - 1) % completedBackgroundClasses.length
  ]
})

let mediaStream: MediaStream | null = null
let animationFrameId = 0
let gestureSamples: GestureSample[] = []
let stableGesture: HandGestureName = 'no_gesture'
let stableGestureSeenAt = 0
let completionToastTimer: ReturnType<typeof setTimeout> | null = null

async function startCamera() {
  errorMessage.value = ''

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
    drawLandmarkFrame()
  } catch (error) {
    stopCamera()
    errorMessage.value =
      error instanceof Error ? error.message : 'Camera permission was denied.'
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
  resetGestureStabilizer()

  const video = videoRef.value
  if (video) {
    video.pause()
    video.srcObject = null
  }
}

function drawLandmarkFrame() {
  const video = videoRef.value
  const canvas = canvasRef.value
  const context = canvas?.getContext('2d')

  if (!video || !canvas || !context) return

  if (video.videoWidth > 0 && video.videoHeight > 0) {
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
    }

    context.clearRect(0, 0, canvas.width, canvas.height)

    const now = performance.now()
    const result = handLandmarker.detectForVideo(video, now)
    drawHandLandmarks(
      context,
      result.landmarks,
      result.handednesses,
      canvas.width,
      canvas.height,
    )

    sendRecognizedGesture(result.landmarks, result.handednesses, now)
  }

  animationFrameId = requestAnimationFrame(drawLandmarkFrame)
}

function drawHandLandmarks(
  context: CanvasRenderingContext2D,
  hands: NormalizedLandmark[][],
  handednesses: HandednessCategory[][] = [],
  width: number,
  height: number,
) {
  context.lineWidth = 4

  hands.forEach((landmarks, index) => {
    const handedness = getHandedness(handednesses[index])
    const colors = getHandColors(handedness)

    context.strokeStyle = colors.stroke
    context.fillStyle = colors.fill

    for (const connection of HandLandmarker.HAND_CONNECTIONS) {
      const from = landmarks[connection.start]
      const to = landmarks[connection.end]

      if (!from || !to) continue

      const [fromX, fromY] = landmarkToCanvasPoint(from, width, height)
      const [toX, toY] = landmarkToCanvasPoint(to, width, height)

      context.beginPath()
      context.moveTo(fromX, fromY)
      context.lineTo(toX, toY)
      context.stroke()
    }

    for (const landmark of landmarks) {
      const [x, y] = landmarkToCanvasPoint(landmark, width, height)

      context.beginPath()
      context.arc(x, y, 6, 0, Math.PI * 2)
      context.fill()
    }
  })
}

function getHandedness(categories: HandednessCategory[] = []): Handedness {
  const label = categories[0]?.categoryName ?? categories[0]?.displayName

  if (label === 'Left' || label === 'Right') {
    return label
  }

  return 'Unknown'
}

function getHandColors(handedness: Handedness) {
  if (handedness === 'Left') {
    return {
      stroke: '#2563eb',
      fill: '#60a5fa',
    }
  }

  if (handedness === 'Right') {
    return {
      stroke: '#dc2626',
      fill: '#fb7185',
    }
  }

  return {
    stroke: '#14b8a6',
    fill: '#f97316',
  }
}

function selectCommandSequence(index: number) {
  const commandSequence = handCommandSequences[index]

  if (!commandSequence) return

  selectedSequenceIndex.value = index
  resetGestureStabilizer()
  sendHandSequenceEvent({
    type: 'SET_SEQUENCE',
    sequence: commandSequence.sequence,
  })
}

function getCommandSequenceSteps(commandSequence: HandCommandSequence) {
  return ['gesture_fist', ...commandSequence.sequence, 'gesture_open']
}

function getGestureLabel(gesture: HandGestureName) {
  return gestureLabels[gesture] ?? gesture
}

function getSequenceStateLabel(state: string) {
  return sequenceStateLabels[state] ?? state
}

function getCompletedSequenceLabel(gestures: HandGestureName[]) {
  const completedMiddleGestures = getMiddleGestures(gestures)
  const commandSequence = handCommandSequences.find((sequence) =>
    areGestureSequencesEqual(sequence.sequence, completedMiddleGestures),
  )

  if (commandSequence) return commandSequence.label

  return completedMiddleGestures.length
    ? completedMiddleGestures.map(getGestureLabel).join(' ')
    : gestures.map(getGestureLabel).join(' ')
}

function getMiddleGestures(gestures: HandGestureName[]) {
  const middleGestures = [...gestures]

  if (middleGestures[0] === 'gesture_fist') {
    middleGestures.shift()
  }

  if (middleGestures[middleGestures.length - 1] === 'gesture_open') {
    middleGestures.pop()
  }

  return middleGestures
}

function areGestureSequencesEqual(
  first: HandGestureName[],
  second: HandGestureName[],
) {
  return (
    first.length === second.length &&
    first.every((gesture, index) => gesture === second[index])
  )
}

function formatCompletionTime(completedAt: number) {
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(completedAt)
}

function recordSequenceCompletion() {
  const context = handSequenceSnapshot.value.context
  const gestures = context.lastCompletedSequence.length
    ? [...context.lastCompletedSequence]
    : [...context.sequence]
  const completedAt = Date.now()
  const entry: CompletionLogEntry = {
    id: `${completedAt}-${context.completedCount}`,
    sequenceLabel: getCompletedSequenceLabel(gestures),
    gestures,
    completedAt,
    completedCount: context.completedCount,
  }

  completionHistory.value = [entry, ...completionHistory.value].slice(0, 20)
  completionToast.value = entry

  if (completionToastTimer) {
    clearTimeout(completionToastTimer)
  }

  completionToastTimer = setTimeout(() => {
    completionToast.value = null
    completionToastTimer = null
  }, 1800)
}

function sendRecognizedGesture(
  hands: NormalizedLandmark[][],
  handednesses: HandednessCategory[][] = [],
  at: number,
) {
  const rightHandIndex = handednesses.findIndex((categories) => {
    return getHandedness(categories) === 'Right'
  })

  if (rightHandIndex === -1) {
    resetGestureStabilizer()
    sendHandSequenceEvent({
      type: 'GESTURE_FRAME',
      gesture: 'no_gesture',
      hand: 'Right',
      at,
    })
    return
  }

  const userFacingLandmarks = mirrorLandmarksHorizontally(hands[rightHandIndex])
  const rawGesture = classifyHandGesture(userFacingLandmarks, getExpectedGesture())
  const recognizedGesture = stabilizeGesture(rawGesture, at)

  currentRecognizedGesture.value = recognizedGesture

  sendHandSequenceEvent({
    type: 'GESTURE_FRAME',
    gesture: recognizedGesture,
    hand: getHandedness(handednesses[rightHandIndex]),
    at,
  })
}

function stabilizeGesture(gesture: HandGestureName, at: number): HandGestureName {
  gestureSamples.push({ gesture, at })
  gestureSamples = gestureSamples.filter(
    (sample) => at - sample.at <= GESTURE_WINDOW_MS,
  )

  if (gestureSamples.length < GESTURE_WINDOW_MIN_SAMPLES) {
    return stableGesture
  }

  const counts = new Map<HandGestureName, number>()

  for (const sample of gestureSamples) {
    counts.set(sample.gesture, (counts.get(sample.gesture) ?? 0) + 1)
  }

  let dominantGesture: HandGestureName = 'no_gesture'
  let dominantCount = 0

  for (const [sampleGesture, count] of counts) {
    if (count > dominantCount) {
      dominantGesture = sampleGesture
      dominantCount = count
    }
  }

  if (dominantCount / gestureSamples.length >= GESTURE_WINDOW_MIN_RATIO) {
    stableGesture = dominantGesture
    stableGestureSeenAt = at
    return stableGesture
  }

  if (
    stableGesture !== 'no_gesture' &&
    at - stableGestureSeenAt <= GESTURE_WINDOW_MS
  ) {
    return stableGesture
  }

  stableGesture = 'no_gesture'
  stableGestureSeenAt = at
  return stableGesture
}

function resetGestureStabilizer() {
  gestureSamples = []
  stableGesture = 'no_gesture'
  stableGestureSeenAt = 0
  currentRecognizedGesture.value = 'no_gesture'
}

function getExpectedGesture(): HandGestureName {
  const context = handSequenceSnapshot.value.context

  return context.sequence[context.stepIndex] ?? 'no_gesture'
}

function landmarkToCanvasPoint(
  landmark: NormalizedLandmark,
  width: number,
  height: number,
) {
  return [landmark.x * width, landmark.y * height] as const
}

onMounted(() => {
  void startCamera()
})

onBeforeUnmount(() => {
  if (completionToastTimer) {
    clearTimeout(completionToastTimer)
  }

  stopCamera()
})

watch(
  () => handSequenceSnapshot.value.context.completedCount,
  (completedCount, previousCompletedCount) => {
    if (completedCount <= (previousCompletedCount ?? 0)) return

    recordSequenceCompletion()
  },
)
</script>

<template>
  <main class="grid min-h-svh grid-rows-[minmax(0,1fr)_auto] gap-4 box-border p-3 transition-colors md:p-6"
    :class="pageBackgroundClass">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="-translate-y-3 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="-translate-y-3 opacity-0">
      <div
        v-if="completionToast"
        class="fixed left-1/2 top-4 z-50 w-[min(calc(100vw_-_24px),420px)] -translate-x-1/2 rounded-lg border border-emerald-300 bg-white px-4 py-3 text-center shadow-lg dark:border-emerald-700 dark:bg-slate-950"
        role="status"
        aria-live="polite">
        <div class="text-[11px] font-bold uppercase text-emerald-600 dark:text-emerald-400">
          시퀀스 완료
        </div>
        <div class="mt-1 truncate text-base font-bold text-slate-950 dark:text-slate-50">
          {{ completionToast.sequenceLabel }}
        </div>
      </div>
    </Transition>

    <div class="w-full max-w-[960px] self-center justify-self-center">
      <div
        class="relative aspect-video w-full overflow-hidden rounded-t-lg border border-slate-200 bg-neutral-950 dark:border-slate-800 max-md:rounded-t-md">
        <video ref="videoRef" muted playsinline class="block size-full scale-x-[-1] object-cover" />
        <canvas ref="canvasRef" class="pointer-events-none absolute inset-0 block size-full scale-x-[-1]" />
      </div>

      <dl
        class="m-0 grid grid-cols-2 overflow-hidden rounded-b-lg border border-t-0 border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-800 md:grid-cols-4"
        aria-label="손동작 시퀀스 상태">
        <div class="min-w-0 bg-white px-3 py-2.5 dark:bg-slate-950">
          <dt class="mb-1.5 text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
            상태
          </dt>
          <dd class="m-0 truncate text-sm font-semibold leading-tight text-slate-950 dark:text-slate-50">
            {{ getSequenceStateLabel(String(handSequenceSnapshot.value)) }}
          </dd>
        </div>
        <div class="min-w-0 bg-white px-3 py-2.5 dark:bg-slate-950">
          <dt class="mb-1.5 text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
            진행
          </dt>
          <dd class="m-0 truncate text-sm font-semibold leading-tight text-slate-950 dark:text-slate-50">
            {{ handSequenceSnapshot.context.stepIndex }} /
            {{ handSequenceSnapshot.context.sequence.length }}
          </dd>
        </div>
        <div class="min-w-0 bg-white px-3 py-2.5 dark:bg-slate-950">
          <dt class="mb-1.5 text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
            현재 인식
          </dt>
          <dd class="m-0 truncate text-sm font-semibold leading-tight text-slate-950 dark:text-slate-50">
            {{ getGestureLabel(currentRecognizedGesture) }}
          </dd>
        </div>
        <div class="min-w-0 bg-white px-3 py-2.5 dark:bg-slate-950">
          <dt class="mb-1.5 text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
            완료
          </dt>
          <dd class="m-0 truncate text-sm font-semibold leading-tight text-slate-950 dark:text-slate-50">
            {{ handSequenceSnapshot.context.completedCount }}
          </dd>
        </div>
      </dl>

      <div
        class="flex flex-wrap items-center gap-2 border-x border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
        <button v-for="(commandSequence, index) in handCommandSequences" :key="commandSequence.id" type="button"
          class="h-8 rounded-md border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          :class="index === selectedSequenceIndex
            ? 'border-blue-600 bg-blue-600 text-white'
            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900'"
          @click="selectCommandSequence(index)">
          {{ commandSequence.label }}
        </button>
        <span class="ml-auto min-w-0 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
          {{ selectedCommandSequence.label }}
        </span>
      </div>

      <section
        class="border-x border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
        aria-label="Command sequences">
        <div
          class="grid grid-cols-[minmax(92px,0.9fr)_minmax(0,2fr)] border-b border-slate-200 px-3 py-2 text-[11px] font-bold uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <div>시퀀스</div>
          <div>동작 순서</div>
        </div>
        <button
          v-for="(commandSequence, index) in handCommandSequences"
          :key="`sequence-row-${commandSequence.id}`"
          type="button"
          class="grid w-full grid-cols-[minmax(92px,0.9fr)_minmax(0,2fr)] items-center gap-2 border-b border-slate-100 px-3 py-2 text-left transition-colors last:border-b-0 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-blue-500 dark:border-slate-900"
          :class="index === selectedSequenceIndex
            ? 'bg-blue-50 dark:bg-blue-950/40'
            : 'hover:bg-slate-50 dark:hover:bg-slate-900'"
          @click="selectCommandSequence(index)">
          <span
            class="min-w-0 truncate text-sm font-semibold"
            :class="index === selectedSequenceIndex
              ? 'text-blue-700 dark:text-blue-300'
              : 'text-slate-950 dark:text-slate-50'">
            {{ commandSequence.label }}
          </span>
          <span class="flex min-w-0 flex-wrap items-center gap-1.5">
            <span
              v-for="(gesture, gestureIndex) in getCommandSequenceSteps(commandSequence)"
              :key="`${commandSequence.id}-${gesture}-${gestureIndex}`"
              class="inline-flex h-7 max-w-full items-center rounded-md border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
              {{ getGestureLabel(gesture) }}
            </span>
          </span>
        </button>
      </section>

      <section
        class="border-x border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
        aria-label="완료 기록">
        <div
          class="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
          <h2 class="m-0 text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
            완료 기록
          </h2>
          <span class="text-xs font-semibold text-slate-500 dark:text-slate-400">
            최근 {{ completionHistory.length }}개
          </span>
        </div>
        <div
          v-if="completionHistory.length === 0"
          class="px-3 py-4 text-sm font-semibold text-slate-500 dark:text-slate-400">
          아직 완료된 시퀀스가 없습니다.
        </div>
        <ol v-else class="m-0 list-none divide-y divide-slate-100 p-0 dark:divide-slate-900">
          <li
            v-for="entry in completionHistory"
            :key="entry.id"
            class="grid grid-cols-[minmax(82px,auto)_minmax(0,1fr)] gap-3 px-3 py-2">
            <div class="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {{ formatCompletionTime(entry.completedAt) }}
            </div>
            <div class="min-w-0">
              <div class="truncate text-sm font-bold text-slate-950 dark:text-slate-50">
                {{ entry.sequenceLabel }}
              </div>
              <div class="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                <span
                  v-for="(gesture, gestureIndex) in entry.gestures"
                  :key="`${entry.id}-${gesture}-${gestureIndex}`"
                  class="inline-flex h-6 max-w-full items-center rounded-md border border-slate-200 bg-slate-50 px-2 text-[11px] font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                  {{ getGestureLabel(gesture) }}
                </span>
              </div>
            </div>
          </li>
        </ol>
      </section>
    </div>

    <div class="flex min-h-11 flex-wrap items-center justify-center gap-3">
      <button v-if="!isCameraActive" type="button"
        class="h-10 min-w-22 cursor-pointer rounded-md border border-slate-200 bg-white text-[15px] font-semibold leading-none text-slate-950 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50"
        @click="startCamera">
        시작
      </button>
      <button v-else type="button"
        class="h-10 min-w-22 cursor-pointer rounded-md border border-slate-200 bg-white text-[15px] font-semibold leading-none text-slate-950 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50"
        @click="stopCamera">
        정지
      </button>
      <p v-if="errorMessage" class="max-w-[min(100%,640px)] text-sm text-orange-700">
        {{ errorMessage }}
      </p>
    </div>
  </main>
</template>
