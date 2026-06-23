<script setup lang="ts">
import { HandLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision'
import { useMachine } from '@xstate/vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { classifyHandGesture } from './utils/hand_gesture_detection'
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

const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const errorMessage = ref('')
const isCameraActive = ref(false)
const { snapshot: handSequenceSnapshot, send: sendHandSequenceEvent } =
  useMachine(handSequenceStateMachine, {
    input: {
      sequence: ['gesture_thumb_only'],
    },
  })
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

function sendRecognizedGesture(
  hands: NormalizedLandmark[][],
  handednesses: HandednessCategory[][] = [],
  at: number,
) {
  const rightHandIndex = handednesses.findIndex((categories) => {
    return getHandedness(categories) === 'Right'
  })

  if (rightHandIndex === -1) {
    sendHandSequenceEvent({
      type: 'GESTURE_FRAME',
      gesture: 'no_gesture',
      hand: 'Right',
      at,
    })
    return
  }

  sendHandSequenceEvent({
    type: 'GESTURE_FRAME',
    gesture: classifyHandGesture(hands[rightHandIndex], getExpectedGesture()),
    hand: getHandedness(handednesses[rightHandIndex]),
    at,
  })
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
  stopCamera()
})
</script>

<template>
  <main class="grid min-h-svh grid-rows-[minmax(0,1fr)_auto] gap-4 box-border p-3 transition-colors md:p-6"
    :class="pageBackgroundClass">
    <div class="w-full max-w-[960px] self-center justify-self-center">
      <div
        class="relative aspect-video w-full overflow-hidden rounded-t-lg border border-slate-200 bg-neutral-950 dark:border-slate-800 max-md:rounded-t-md">
        <video ref="videoRef" muted playsinline class="block size-full scale-x-[-1] object-cover" />
        <canvas ref="canvasRef" class="pointer-events-none absolute inset-0 block size-full scale-x-[-1]" />
      </div>

      <dl
        class="m-0 grid grid-cols-2 overflow-hidden rounded-b-lg border border-t-0 border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-800 md:grid-cols-5"
        aria-label="Hand sequence state">
        <div class="min-w-0 bg-white px-3 py-2.5 dark:bg-slate-950">
          <dt class="mb-1.5 text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
            State
          </dt>
          <dd class="m-0 truncate text-sm font-semibold leading-tight text-slate-950 dark:text-slate-50">
            {{ handSequenceSnapshot.value }}
          </dd>
        </div>
        <div class="min-w-0 bg-white px-3 py-2.5 dark:bg-slate-950">
          <dt class="mb-1.5 text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
            Progress
          </dt>
          <dd class="m-0 truncate text-sm font-semibold leading-tight text-slate-950 dark:text-slate-50">
            {{ handSequenceSnapshot.context.stepIndex }} /
            {{ handSequenceSnapshot.context.sequence.length }}
          </dd>
        </div>
        <div class="min-w-0 bg-white px-3 py-2.5 dark:bg-slate-950">
          <dt class="mb-1.5 text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
            Expected
          </dt>
          <dd class="m-0 truncate text-sm font-semibold leading-tight text-slate-950 dark:text-slate-50">
            {{
              handSequenceSnapshot.context.sequence[
              handSequenceSnapshot.context.stepIndex
              ] ?? 'done'
            }}
          </dd>
        </div>
        <div class="min-w-0 bg-white px-3 py-2.5 dark:bg-slate-950">
          <dt class="mb-1.5 text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
            Candidate
          </dt>
          <dd class="m-0 truncate text-sm font-semibold leading-tight text-slate-950 dark:text-slate-50">
            {{ handSequenceSnapshot.context.candidateHand }}
            {{ handSequenceSnapshot.context.candidateGesture }}
          </dd>
        </div>
        <div class="min-w-0 bg-white px-3 py-2.5 dark:bg-slate-950">
          <dt class="mb-1.5 text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
            Completed
          </dt>
          <dd class="m-0 truncate text-sm font-semibold leading-tight text-slate-950 dark:text-slate-50">
            {{ handSequenceSnapshot.context.completedCount }}
          </dd>
        </div>
      </dl>
    </div>

    <div class="flex min-h-11 flex-wrap items-center justify-center gap-3">
      <button v-if="!isCameraActive" type="button"
        class="h-10 min-w-22 cursor-pointer rounded-md border border-slate-200 bg-white text-[15px] font-semibold leading-none text-slate-950 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50"
        @click="startCamera">
        Start
      </button>
      <button v-else type="button"
        class="h-10 min-w-22 cursor-pointer rounded-md border border-slate-200 bg-white text-[15px] font-semibold leading-none text-slate-950 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50"
        @click="stopCamera">
        Stop
      </button>
      <p v-if="errorMessage" class="max-w-[min(100%,640px)] text-sm text-orange-700">
        {{ errorMessage }}
      </p>
    </div>
  </main>
</template>
